// The audio engine (ID-080): music and sound effects with the Web Audio API. The gun shots
// are short CC0 recordings (src/assets/sounds, credited in docs/audio-credits.md), fetched
// from the page's own origin; everything else is made in code. A shot falls back to its
// made-in-code version while its recording loads, or if it can't be.
// The browser lets audio start only after a click or key press, so nothing exists until
// `unlock`; until then every call is a no-op. Volumes are 0–100; the gain is their square,
// which sounds closer to even steps than a straight line.
import shotLmg from '../assets/sounds/shot-lmg.mp3';
import shotPistol from '../assets/sounds/shot-pistol.mp3';
import shotRifle from '../assets/sounds/shot-rifle.mp3';
import shotShotgun from '../assets/sounds/shot-shotgun.mp3';
import shotSmg from '../assets/sounds/shot-smg.mp3';
import shotSniper from '../assets/sounds/shot-sniper.mp3';
import shotTurret from '../assets/sounds/shot-turret.mp3';
import { createRng, type Rng } from '../core/rng.ts';
import type { SoundSettings, Volume } from '../storage/settings.ts';
import type { Cue } from './sound.ts';

/** The recorded cues and their files' URLs. */
export const SAMPLES: Readonly<Partial<Record<Cue, string>>> = {
  'shot-pistol': shotPistol,
  'shot-smg': shotSmg,
  'shot-rifle': shotRifle,
  'shot-shotgun': shotShotgun,
  'shot-lmg': shotLmg,
  'shot-sniper': shotSniper,
  'shot-turret': shotTurret,
  // ID-135's guns reuse the closest recording: the Hand Cannon the sniper rifle's (the
  // heaviest single shot), the Machine Pistol the 9 mm SMG's, the Assault Rifle the
  // 7.62x39 mm automatic rifle's (the LMG's), the Cartridge Shotgun the pump shotgun's.
  'shot-handcannon': shotSniper,
  'shot-machinepistol': shotSmg,
  'shot-assault': shotLmg,
  'shot-cartridge': shotShotgun,
};
/**
 * A recording's level on the effects bus: half, since the clips are cut to peak at
 * -1 dBFS and shots are the most frequent cue. `detune`: how far each play's speed may
 * stray, so a burst of the same gun never sounds like one copy repeated. `tries`: loads
 * a recording gets before it stays made in code for the session.
 */
export const SAMPLE = { gain: 0.5, detune: 0.04, heard: 0.4, tries: 3 } as const;
// `heard`: the share of a clip the overlap cap counts. The rest is its fade-out tail, so
// counting it all would cap an automatic gun at a few shots a second.

export interface EngineOptions {
  /** Makes the AudioContext; null where the browser has no Web Audio. */
  create?: () => AudioContext | null;
  samples?: Readonly<Partial<Record<Cue, string>>>;
  /** Fetches a recording's bytes. */
  load?: (url: string) => Promise<ArrayBuffer>;
}

const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sound ${res.status}`);
  return res.arrayBuffer();
};

export type Track = 'camp' | 'horde';

/** The overlap cap: per cue, at most `voices` at once, and none closer than `gap` s. */
export const LIMIT = { voices: 3, gap: 0.04 } as const;
/** Seconds a crossfade between tracks takes, and how far ahead music is scheduled. */
export const FADE = 1.5;
/** How fast the horde track goes when a won or lost sting plays, and how long the sting lasts. */
export const STING_OUT = 0.3;
export const STING = 1.4;
const LOOKAHEAD = 0.25;
/** The master compressor: it only bites when cues pile up, holding the sum under clipping. */
export const COMPRESSOR = { threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.15 };

/** A track's gain ramp: `from` until `at`, then a straight line to `to` at `end`. */
interface Ramp {
  from: number;
  to: number;
  at: number;
  end: number;
}
/** Where `r` is at time `t`. Worked out here: a gain's `value` isn't the ramp's in every browser. */
export function rampAt(r: Ramp, t: number): number {
  if (t <= r.at) return r.from;
  if (t >= r.end) return r.to;
  return r.from + ((r.to - r.from) * (t - r.at)) / (r.end - r.at);
}
/** Sets ramp `r` on gain `g`, dropping any ramp still under way. */
function schedule(g: GainNode, r: Ramp, t: number): void {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(r.from, t);
  if (r.at > t) g.gain.setValueAtTime(r.from, r.at);
  g.gain.linearRampToValueAtTime(r.to, r.end);
}

/**
 * Who may start a voice now (ID-080): a heavy fight asks for many shots a frame, so each
 * cue keeps when its voices end and when the last one started.
 */
export class VoiceLimiter {
  private ends = new Map<string, number[]>();
  private last = new Map<string, number>();

  /** Whether a voice of `cue` lasting `length` s may start at `now`; if so it is counted. */
  take(cue: string, now: number, length: number): boolean {
    if (now - (this.last.get(cue) ?? -Infinity) < LIMIT.gap) return false;
    const live = (this.ends.get(cue) ?? []).filter((t) => t > now);
    if (live.length >= LIMIT.voices) {
      this.ends.set(cue, live);
      return false;
    }
    live.push(now + length);
    this.ends.set(cue, live);
    this.last.set(cue, now);
    return true;
  }
}

/** A volume's gain: 0–100 to 0–1, squared. */
export const gainOf = (level: number): number => (Math.min(100, Math.max(0, level)) / 100) ** 2;

type Wave = OscillatorType;
interface Voice {
  ctx: AudioContext;
  out: AudioNode;
  at: number;
  noise: AudioBuffer;
}

/** A note gliding from `f0` to `f1` Hz over `dur` s, `vol` at its peak. */
function tone(
  v: Voice,
  wave: Wave,
  f0: number,
  f1: number,
  start: number,
  dur: number,
  vol: number,
) {
  const { ctx } = v;
  const t = v.at + start;
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(v.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of noise through a filter, `vol` at its peak, dying away over `dur` s. */
function hiss(
  v: Voice,
  filter: BiquadFilterType,
  freq: number,
  start: number,
  dur: number,
  vol: number,
) {
  const { ctx } = v;
  const t = v.at + start;
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  // A 2 ms rise, so the noise never starts with a click.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.002, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(v.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const note = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** How each cue sounds, and how long it lasts (s), for the overlap cap. */
type Recipe = { length: number; play: (v: Voice) => void };
/** ID-135's guns, made in code as the guns whose recordings they reuse. */
type Reused = 'shot-handcannon' | 'shot-machinepistol' | 'shot-assault' | 'shot-cartridge';
const OWN: Record<Exclude<Cue, Reused>, Recipe> = {
  'shot-pistol': {
    length: 0.1,
    play: (v) => (hiss(v, 'bandpass', 1800, 0, 0.08, 0.5), tone(v, 'sine', 180, 60, 0, 0.08, 0.4)),
  },
  'shot-smg': {
    length: 0.06,
    play: (v) => (
      hiss(v, 'bandpass', 2500, 0, 0.05, 0.35),
      tone(v, 'sine', 160, 70, 0, 0.05, 0.25)
    ),
  },
  'shot-rifle': {
    length: 0.14,
    play: (v) => (hiss(v, 'bandpass', 1200, 0, 0.12, 0.55), tone(v, 'sine', 150, 45, 0, 0.12, 0.5)),
  },
  'shot-shotgun': {
    length: 0.28,
    play: (v) => (hiss(v, 'lowpass', 1500, 0, 0.25, 0.7), tone(v, 'sine', 100, 35, 0, 0.2, 0.6)),
  },
  'shot-lmg': {
    length: 0.08,
    play: (v) => (
      hiss(v, 'bandpass', 1000, 0, 0.07, 0.45),
      tone(v, 'sine', 130, 50, 0, 0.07, 0.35)
    ),
  },
  'shot-sniper': {
    length: 0.4,
    play: (v) => (
      hiss(v, 'highpass', 3000, 0, 0.05, 0.5),
      hiss(v, 'lowpass', 900, 0, 0.35, 0.5),
      tone(v, 'sine', 140, 40, 0, 0.25, 0.6)
    ),
  },
  'shot-turret': {
    length: 0.07,
    play: (v) => (
      hiss(v, 'highpass', 3000, 0, 0.05, 0.3),
      tone(v, 'square', 900, 300, 0, 0.06, 0.1)
    ),
  },
  // A blade or a tool never shoots; listed so every weapon id has a shot.
  'shot-knife': { length: 0, play: () => undefined },
  'shot-toolkit': { length: 0, play: () => undefined },
  reload: {
    length: 0.2,
    play: (v) => (
      hiss(v, 'highpass', 4000, 0, 0.03, 0.3),
      tone(v, 'square', 1400, 1400, 0, 0.02, 0.05),
      hiss(v, 'highpass', 3000, 0.12, 0.04, 0.35)
    ),
  },
  'enemy-hit': { length: 0.07, play: (v) => hiss(v, 'lowpass', 600, 0, 0.06, 0.35) },
  'enemy-die': {
    length: 0.32,
    play: (v) => (
      tone(v, 'sawtooth', 220, 70, 0, 0.3, 0.12),
      hiss(v, 'lowpass', 500, 0, 0.2, 0.35)
    ),
  },
  // A bright knock on top, so a blow on the wall cuts through the guns and the music.
  'wall-hit': {
    length: 0.16,
    play: (v) => (
      hiss(v, 'bandpass', 1500, 0, 0.02, 0.3),
      tone(v, 'sine', 90, 50, 0, 0.15, 0.45),
      hiss(v, 'lowpass', 400, 0, 0.12, 0.4)
    ),
  },
  'wall-break': {
    length: 0.65,
    play: (v) => (hiss(v, 'lowpass', 800, 0, 0.6, 0.7), tone(v, 'sine', 60, 30, 0, 0.5, 0.6)),
  },
  'card-offer': {
    length: 0.3,
    play: (v) => (
      tone(v, 'triangle', note(76), note(76), 0, 0.15, 0.25),
      tone(v, 'triangle', note(81), note(81), 0.12, 0.18, 0.25)
    ),
  },
  'card-pick': {
    length: 0.2,
    play: (v) => (
      tone(v, 'sine', note(81), note(81), 0, 0.1, 0.3),
      tone(v, 'sine', note(88), note(88), 0.05, 0.15, 0.2)
    ),
  },
  'level-up': {
    length: 0.6,
    play: (v) =>
      [72, 76, 79, 84].forEach((m, i) =>
        tone(v, 'triangle', note(m), note(m), i * 0.08, 0.3, 0.25),
      ),
  },
  // A boss winding up a skill (ID-099): a low growl that rises, so it reads before it lands.
  'boss-windup': {
    length: 1.1,
    play: (v) => (tone(v, 'sawtooth', 55, 110, 0, 1, 0.3), hiss(v, 'lowpass', 300, 0, 0.9, 0.3)),
  },
  // A swarm wave starting (ID-099, ID-121): a siren, three rising whoops over a low drone,
  // louder and longer than the two blares it replaced.
  swarm: {
    length: 1.5,
    play: (v) => {
      for (let i = 0; i < 3; i++) {
        tone(v, 'sawtooth', note(62), note(74), i * 0.45, 0.4, 0.26);
        tone(v, 'square', note(50), note(62), i * 0.45, 0.4, 0.14);
      }
      tone(v, 'sawtooth', note(38), note(36), 0, 1.4, 0.18);
    },
  },
  won: {
    length: 1.4,
    play: (v) => {
      [60, 64, 67, 72].forEach((m, i) =>
        tone(v, 'triangle', note(m), note(m), i * 0.15, 0.4, 0.25),
      );
      [60, 64, 67].forEach((m) => tone(v, 'sine', note(m), note(m), 0.6, 0.8, 0.15));
    },
  },
  lost: {
    length: 1.4,
    play: (v) =>
      [69, 65, 62, 57].forEach((m, i) =>
        tone(v, 'sawtooth', note(m), note(m - 1), i * 0.3, 0.45, 0.2),
      ),
  },
  click: { length: 0.04, play: (v) => tone(v, 'square', 1200, 1000, 0, 0.03, 0.04) },
};
const RECIPES: Record<Cue, Recipe> = {
  ...OWN,
  'shot-handcannon': OWN['shot-sniper'],
  'shot-machinepistol': OWN['shot-smg'],
  'shot-assault': OWN['shot-lmg'],
  'shot-cartridge': OWN['shot-shotgun'],
};

/**
 * The two loops: notes on a grid of `step` s, `steps` long. Each step's notes are
 * `[wave, midi note, length in steps, volume]`, or a drum.
 */
type Part = [Wave | 'kick' | 'hat', number, number, number];
interface Song {
  step: number;
  steps: number;
  at: (i: number) => Part[];
}
// Camp: a slow A minor – F – C – G, soft chords and a sparse plucked line.
const CAMP_CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 55, 64],
  [55, 59, 62],
];
const CAMP_LINE = [69, 72, 76, 72, 65, 69, 72, 69, 67, 72, 76, 72, 67, 71, 74, 71];
// Horde: D minor at a run, bass pulse, kick and hat, and a short riff.
const HORDE_ROOTS = [38, 38, 34, 36];
const HORDE_RIFF = [62, 0, 65, 0, 69, 0, 67, 65, 62, 0, 60, 0, 62, 0, 0, 0];
export const SONGS: Record<Track, Song> = {
  camp: {
    step: 60 / 72 / 2,
    steps: 64,
    at: (i) => {
      const parts: Part[] = [];
      if (i % 16 === 0) {
        for (const m of CAMP_CHORDS[i / 16]!) parts.push(['triangle', m, 16, 0.1]);
      }
      if (i % 2 === 0) parts.push(['sine', CAMP_LINE[(i / 2) % 16]!, 1.5, 0.08]);
      return parts;
    },
  },
  horde: {
    step: 60 / 132 / 2,
    steps: 64,
    at: (i) => {
      const parts: Part[] = [['sawtooth', HORDE_ROOTS[Math.floor(i / 16)]!, 0.9, 0.07]];
      // Every fourth bar (8 steps) the drums rest and the riff carries it, so the loop breathes.
      const rest = i % 32 >= 24;
      if (!rest) parts.push(i % 2 === 0 ? ['kick', 0, 1, 0.22] : ['hat', 0, 1, 0.12]);
      const riff = HORDE_RIFF[i % 16]!;
      if (riff > 0 && (rest || Math.floor(i / 16) % 2 === 1)) {
        parts.push(['square', riff, 0.9, 0.03]);
      }
      return parts;
    },
  },
};

interface Playing {
  track: Track;
  gain: GainNode;
  /** Its gain's latest ramp, so a fade can start from where it really is. */
  ramp: Ramp;
  step: number;
  next: number;
  /** When it has faded out and stops being scheduled; Infinity while it is the one on. */
  until: number;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<'music' | 'effects', GainNode>> = {};
  private noise: AudioBuffer | null = null;
  private limiter = new VoiceLimiter();
  private playing: Playing[] = [];
  private want: Track | null = null;
  /** The tab is hidden: effects are dropped until it shows again. */
  private paused = false;

  /** Recordings decoded so far. */
  private buffers = new Map<Cue, AudioBuffer>();
  /** Recordings being fetched or decoded now. */
  private loading = new Set<Cue>();
  /** Loads started per recording. */
  private tries = new Map<Cue, number>();
  /** Each recording's speed for a play, from the game's seeded RNG. */
  private vary: Rng = createRng(0x5107);

  private settings: SoundSettings;
  private create: () => AudioContext | null;
  private samples: Readonly<Partial<Record<Cue, string>>>;
  private load: (url: string) => Promise<ArrayBuffer>;

  constructor(settings: SoundSettings, opts: EngineOptions = {}) {
    this.settings = settings;
    this.create =
      opts.create ?? (() => (typeof AudioContext === 'function' ? new AudioContext() : null));
    this.samples = opts.samples ?? SAMPLES;
    this.load = opts.load ?? fetchBytes;
  }

  /**
   * Fetches and decodes the recordings not loaded or loading yet. One that fails keeps
   * its made-in-code sound, says so in the console, and is tried again on a later click
   * or key press, up to `SAMPLE.tries` loads in all (a held key repeats fast).
   */
  private fetchSamples(ctx: AudioContext): void {
    for (const [cue, url] of Object.entries(this.samples) as [Cue, string][]) {
      if (this.buffers.has(cue) || this.loading.has(cue)) continue;
      const tried = this.tries.get(cue) ?? 0;
      if (tried >= SAMPLE.tries) continue;
      this.tries.set(cue, tried + 1);
      this.loading.add(cue);
      void this.load(url)
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buf) => {
          if (buf) this.buffers.set(cue, buf);
        })
        .catch(() => console.warn(`Sound: ${cue} could not load; it plays made in code.`))
        .finally(() => this.loading.delete(cue));
    }
  }

  /** Whether audio has started (after the first click or key press). */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Starts audio on a click or key press; later calls resume it if the browser paused it. */
  unlock(): void {
    if (!this.ctx) {
      let ctx: AudioContext | null;
      try {
        ctx = this.create();
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      this.ctx = ctx;
      this.master = ctx.createGain();
      // Cues that land together add up: a limiter-like compressor keeps the sum from clipping.
      const limit = ctx.createDynamicsCompressor();
      const t = ctx.currentTime;
      limit.threshold.setValueAtTime(COMPRESSOR.threshold, t);
      limit.knee.setValueAtTime(COMPRESSOR.knee, t);
      limit.ratio.setValueAtTime(COMPRESSOR.ratio, t);
      limit.attack.setValueAtTime(COMPRESSOR.attack, t);
      limit.release.setValueAtTime(COMPRESSOR.release, t);
      this.master.connect(limit).connect(ctx.destination);
      for (const bus of ['music', 'effects'] as const) {
        const g = ctx.createGain();
        g.connect(this.master);
        this.buses[bus] = g;
      }
      // One second of white noise, from the game's seeded RNG.
      const rng = createRng(0x5eed);
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
      this.noise = buf;
      this.apply(true);
    }
    this.fetchSamples(this.ctx);
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** Pauses audio while the tab is hidden, and resumes it when shown. */
  hidden(on: boolean): void {
    if (!this.ctx) return;
    this.paused = on;
    if (on) void this.ctx.suspend().catch(() => undefined);
    else this.unlock();
  }

  setVolume(which: Volume, level: number): void {
    this.settings = { ...this.settings, volumes: { ...this.settings.volumes, [which]: level } };
    this.apply(false);
  }

  setMuted(on: boolean): void {
    this.settings = { ...this.settings, muted: on };
    this.apply(false);
  }

  /** Sets the gains from the settings: at once when audio starts, else eased to avoid a click. */
  private apply(now: boolean): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const { volumes, muted } = this.settings;
    const set = (g: GainNode | undefined, value: number) => {
      if (!g) return;
      if (now) g.gain.setValueAtTime(value, t);
      else g.gain.setTargetAtTime(value, t, 0.02);
    };
    set(this.master, muted ? 0 : gainOf(volumes.master));
    set(this.buses.music, gainOf(volumes.music));
    set(this.buses.effects, gainOf(volumes.effects));
  }

  /**
   * Plays `cue` now, unless the overlap cap says the same sound is playing enough. Only
   * running audio plays cues, with one exception: a click while the browser is still
   * starting audio (the first click) is scheduled and plays once it has. Other cues are
   * dropped while audio is held, so none pile up into a burst when it resumes.
   */
  play(cue: Cue): void {
    const ctx = this.ctx;
    const out = this.buses.effects;
    if (!ctx || !out || !this.noise || this.paused) return;
    if (ctx.state !== 'running' && !(cue === 'click' && ctx.state === 'suspended')) return;
    const r = RECIPES[cue];
    const rec = this.buffers.get(cue);
    const length = rec ? rec.duration * SAMPLE.heard : r.length;
    if (length <= 0 || !this.limiter.take(cue, ctx.currentTime, length)) return;
    if (!rec) {
      r.play({ ctx, out, at: ctx.currentTime, noise: this.noise });
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = rec;
    src.playbackRate.setValueAtTime(1 + (this.vary() * 2 - 1) * SAMPLE.detune, ctx.currentTime);
    const g = ctx.createGain();
    g.gain.setValueAtTime(SAMPLE.gain, ctx.currentTime);
    src.connect(g).connect(out);
    src.start(ctx.currentTime);
  }

  /**
   * The track to play: a new one fades in over `FADE` s while the old one fades out. With
   * `sting` (a won or lost cue playing), the old one goes in `STING_OUT` s and the new one
   * waits `sting` s, so the two never clash. A track still fading out comes back from
   * where it is rather than starting over.
   */
  music(track: Track | null, sting = 0): void {
    this.want = track;
    const ctx = this.ctx;
    const bus = this.buses.music;
    if (!ctx || !bus) return;
    const current = this.playing.find((p) => p.until === Infinity);
    if (current?.track === track) return;
    const t = ctx.currentTime;
    // From where a track's gain really is now (0 for one still waiting out a sting).
    const fade = (p: Playing, to: number, over: number): void => {
      p.ramp = { from: rampAt(p.ramp, t), to, at: t, end: t + over };
      schedule(p.gain, p.ramp, t);
    };
    if (current) {
      const out = sting > 0 ? STING_OUT : FADE;
      fade(current, 0, out);
      current.until = t + out;
    }
    if (track === null) return;
    const back = this.playing.find((p) => p.track === track && p.until !== Infinity);
    if (back) {
      fade(back, 1, FADE);
      back.until = Infinity;
      return;
    }
    const gain = ctx.createGain();
    // Silent from now, not only from its start, and rising once the sting is over.
    const ramp: Ramp = { from: 0, to: 1, at: t + sting, end: t + sting + FADE };
    schedule(gain, ramp, t);
    gain.connect(bus);
    this.playing.push({ track, gain, ramp, step: 0, next: t + sting + 0.05, until: Infinity });
  }

  /** Schedules the music a little ahead: call every frame. */
  pump(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    // Audio that started after the track was asked for picks it up now.
    if (this.want !== null && !this.playing.some((p) => p.until === Infinity)) {
      this.music(this.want);
    }
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    this.playing = this.playing.filter((p) => {
      if (p.until <= t) {
        p.gain.disconnect();
        return false;
      }
      return true;
    });
    for (const p of this.playing) {
      const song = SONGS[p.track];
      // Back from a pause: skip what was missed rather than play it all at once.
      if (p.next < t) p.next = t + 0.02;
      while (p.next < t + LOOKAHEAD && p.next < p.until) {
        for (const part of song.at(p.step)) this.part(p.gain, part, p.next, song.step);
        p.step = (p.step + 1) % song.steps;
        p.next += song.step;
      }
    }
  }

  private part(out: GainNode, [wave, midi, steps, vol]: Part, at: number, step: number): void {
    const v: Voice = { ctx: this.ctx!, out, at, noise: this.noise! };
    if (wave === 'kick') tone(v, 'sine', 120, 40, 0, 0.18, vol);
    else if (wave === 'hat') hiss(v, 'highpass', 6000, 0, 0.04, vol);
    else tone(v, wave, note(midi), note(midi), 0, steps * step, vol);
  }
}
