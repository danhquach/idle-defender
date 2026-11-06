// ID-080: the audio engine — nothing before the first click or key press, the overlap cap,
// the volumes and mute, and the music's crossfade — against a stand-in AudioContext.
import { describe, expect, it, vi } from 'vitest';
import {
  COMPRESSOR,
  FADE,
  gainOf,
  LIMIT,
  rampAt,
  SAMPLE,
  SAMPLES,
  SONGS,
  SoundEngine,
  STING,
  STING_OUT,
  VoiceLimiter,
  type EngineOptions,
} from './audio.ts';

class Param {
  value = 0;
  calls: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.calls.push(['set', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.value = v;
    this.calls.push(['target', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.calls.push(['linear', v, t]);
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', 0, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(['exp', v, t]);
  }
}
class Node {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  links: unknown[] = [];
  type = '';
  buffer: unknown = null;
  connected = true;
  private fake: FakeContext;
  constructor(fake: FakeContext) {
    this.fake = fake;
  }
  connect<T>(n: T): T {
    this.links.push(n);
    return n;
  }
  disconnect() {
    this.connected = false;
  }
  start(t: number) {
    this.fake.started.push(t);
  }
  stop() {}
}
class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 10;
  sampleRate = 100;
  destination = {};
  started: number[] = [];
  gains: Node[] = [];
  createGain() {
    const n = new Node(this);
    this.gains.push(n);
    return n;
  }
  createOscillator() {
    return new Node(this);
  }
  createBufferSource() {
    const n = new Node(this);
    this.sources.push(n);
    return n;
  }
  compressors: Node[] = [];
  createDynamicsCompressor() {
    const n = new Node(this);
    this.compressors.push(n);
    return n;
  }
  createBiquadFilter() {
    return new Node(this);
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  /** Bytes "decode" to a buffer as long as the first byte says, in tenths of a second. */
  decodeAudioData(bytes: ArrayBuffer) {
    const first = new Uint8Array(bytes)[0];
    return first === undefined
      ? Promise.reject(new Error('not audio'))
      : Promise.resolve({ duration: first / 10 });
  }
  sources: Node[] = [];
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

const settings = () => ({ volumes: { master: 80, music: 60, effects: 80 }, muted: false });
/** An engine on the stand-in context; no recordings unless `samples` names some. */
function engine(over = settings(), opts: EngineOptions = { samples: {} }) {
  const fake = new FakeContext();
  let made = 0;
  const e = new SoundEngine(over, {
    ...opts,
    create: () => {
      made += 1;
      return fake as unknown as AudioContext;
    },
  });
  return { e, fake, made: () => made };
}
/** Lets the recordings' fetch-and-decode promises settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));
// The master, music and effects gains, made in that order on unlock.
const buses = (fake: FakeContext) => fake.gains.slice(0, 3);

describe('Sound engine (ID-080)', () => {
  it('makes nothing and plays nothing before the first click or key press', () => {
    const { e, fake, made } = engine();
    e.play('shot-pistol');
    e.music('camp');
    e.pump();
    expect(made()).toBe(0);
    expect(e.ready).toBe(false);
    expect(fake.started).toEqual([]);
    e.unlock();
    e.unlock();
    expect(made()).toBe(1);
    expect(e.ready).toBe(true);
  });

  it('a browser with no Web Audio, or one that refuses it, stays silent without breaking', () => {
    const none = new SoundEngine(settings(), { create: () => null });
    none.unlock();
    expect(none.ready).toBe(false);
    const refusing = new SoundEngine(settings(), {
      create: () => {
        throw new Error('not allowed');
      },
    });
    expect(() => refusing.unlock()).not.toThrow();
    expect(() => refusing.play('won')).not.toThrow();
    expect(() => refusing.music('horde')).not.toThrow();
    expect(() => refusing.pump()).not.toThrow();
  });

  it('a recorded shot plays its recording once loaded, with a little speed change each time', async () => {
    const asked: string[] = [];
    const { e, fake } = engine(settings(), {
      samples: { 'shot-rifle': 'rifle.mp3' },
      load: (url) => (asked.push(url), Promise.resolve(new Uint8Array([9]).buffer)),
    });
    e.unlock();
    expect(asked).toEqual(['rifle.mp3']);
    await settle();
    const rates: number[] = [];
    for (let i = 0; i < 5; i++) {
      fake.currentTime += 1;
      e.play('shot-rifle');
      const src = fake.sources.at(-1)!;
      expect(src.buffer).toEqual({ duration: 0.9 });
      rates.push(src.playbackRate.value);
    }
    expect(fake.sources.length).toBe(5);
    for (const r of rates) {
      expect(Math.abs(r - 1)).toBeLessThanOrEqual(SAMPLE.detune);
    }
    expect(new Set(rates).size).toBeGreaterThan(1);
    // The recording's own length counts for the overlap cap: 3 at once, then none.
    fake.currentTime += 1;
    for (let i = 0; i < 6; i++) {
      // Within the 0.36 s the cap counts (40 % of the 0.9 s clip): all three still on.
      fake.currentTime += 0.045;
      e.play('shot-rifle');
    }
    expect(fake.sources.length).toBe(5 + LIMIT.voices);
  });

  it('a shot whose recording is loading, missing or broken plays its made-in-code sound', async () => {
    let finish: (b: ArrayBuffer) => void = () => undefined;
    const { e, fake } = engine(settings(), {
      samples: { 'shot-pistol': 'slow.mp3', 'shot-smg': 'gone.mp3', 'shot-lmg': 'bad.mp3' },
      load: (url) =>
        url === 'slow.mp3'
          ? new Promise((r) => (finish = r))
          : url === 'gone.mp3'
            ? Promise.reject(new Error('404'))
            : Promise.resolve(new ArrayBuffer(0)),
    });
    e.unlock();
    await settle();
    for (const cue of ['shot-pistol', 'shot-smg', 'shot-lmg'] as const) {
      const before = fake.started.length;
      e.play(cue);
      expect(fake.started.length).toBeGreaterThan(before);
      // Made in code: noise sources, never a decoded recording.
      expect(
        fake.sources.every(
          (s) => typeof s.buffer === 'object' && s.buffer !== null && 'getChannelData' in s.buffer,
        ),
      ).toBe(true);
    }
    finish(new Uint8Array([4]).buffer);
    await settle();
    fake.currentTime += 1;
    e.play('shot-pistol');
    expect(fake.sources.at(-1)!.buffer).toEqual({ duration: 0.4 });
  });

  it('a recording plays through its own gain into the effects bus', async () => {
    const { e, fake } = engine(settings(), {
      samples: { 'shot-smg': 'smg.mp3' },
      load: () => Promise.resolve(new Uint8Array([5]).buffer),
    });
    e.unlock();
    await settle();
    e.play('shot-smg');
    const src = fake.sources.at(-1)!;
    const g = src.links[0] as (typeof fake.gains)[number];
    expect(g.gain.value).toBe(SAMPLE.gain);
    expect(g.links).toEqual([buses(fake)[2]]);
  });

  it('the cap counts a recording only until its fade-out: an automatic gun keeps firing', async () => {
    const { e, fake } = engine(settings(), {
      samples: { 'shot-smg': 'smg.mp3' },
      // A 0.5 s clip, as the SMG's: 0.2 s counted, so 3 voices allow 15 shots a second.
      load: () => Promise.resolve(new Uint8Array([5]).buffer),
    });
    e.unlock();
    await settle();
    for (let i = 0; i < 30; i++) {
      fake.currentTime += 1 / 15;
      e.play('shot-smg');
    }
    expect(fake.sources.length).toBe(30);
  });

  it('decodes while audio is held (a hidden tab), and a failed recording is tried again later', async () => {
    let fail = true;
    const asked: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { e, fake } = engine(settings(), {
      samples: { 'shot-lmg': 'lmg.mp3', 'shot-rifle': 'rifle.mp3' },
      load: (url) => {
        asked.push(url);
        return url === 'lmg.mp3' && fail
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(new Uint8Array([6]).buffer);
      },
    });
    e.unlock();
    e.hidden(true);
    await settle();
    expect(warn).toHaveBeenCalledWith('Sound: shot-lmg could not load; it plays made in code.');
    // The next click asks only for what failed.
    fail = false;
    e.hidden(false);
    e.unlock();
    await settle();
    // (Showing the tab again is that click here; the loading one isn't asked twice.)
    expect(asked).toEqual(['lmg.mp3', 'rifle.mp3', 'lmg.mp3']);
    e.unlock();
    await settle();
    expect(asked.length).toBe(3);
    for (const cue of ['shot-lmg', 'shot-rifle'] as const) {
      fake.currentTime += 1;
      e.play(cue);
      expect(fake.sources.at(-1)!.buffer).toEqual({ duration: 0.6 });
    }
    warn.mockRestore();
  });

  it('a recording that never loads is tried SAMPLE.tries times, however many keys are pressed', async () => {
    let asked = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { e } = engine(settings(), {
      samples: { 'shot-pistol': 'gone.mp3' },
      load: () => (asked++, Promise.reject(new Error('404'))),
    });
    for (let i = 0; i < 30; i++) {
      e.unlock();
      await settle();
    }
    expect(asked).toBe(SAMPLE.tries);
    expect(warn).toHaveBeenCalledTimes(SAMPLE.tries);
    warn.mockRestore();
  });

  it('the game ships a recording for every gun shot and the turret, as files, not data: URLs', () => {
    for (const url of Object.values(SAMPLES)) expect(url).not.toMatch(/^data:/);
    expect(Object.keys(SAMPLES).sort()).toEqual([
      'shot-lmg',
      'shot-pistol',
      'shot-rifle',
      'shot-shotgun',
      'shot-smg',
      'shot-sniper',
      'shot-turret',
    ]);
  });

  it('volumes and mute set the gains, squared; mute keeps the volumes', () => {
    const { e, fake } = engine();
    e.unlock();
    const [master, music, effects] = buses(fake);
    expect(master!.gain.value).toBeCloseTo(0.64);
    expect(music!.gain.value).toBeCloseTo(0.36);
    expect(effects!.gain.value).toBeCloseTo(0.64);
    e.setVolume('music', 100);
    expect(music!.gain.value).toBe(1);
    e.setMuted(true);
    expect(master!.gain.value).toBe(0);
    e.setMuted(false);
    expect(master!.gain.value).toBeCloseTo(0.64);
    expect([gainOf(-10), gainOf(0), gainOf(50), gainOf(250)]).toEqual([0, 0, 0.25, 1]);
  });

  it('starts muted when the stored setting says so', () => {
    const { e, fake } = engine({ ...settings(), muted: true });
    e.unlock();
    expect(buses(fake)[0]!.gain.value).toBe(0);
  });

  it('a heavy fight caps the same sound: a gap between starts and a few at once', () => {
    const { e, fake } = engine();
    e.unlock();
    for (let i = 0; i < 10; i++) e.play('shot-lmg');
    const once = fake.started.length;
    expect(once).toBeGreaterThan(0);
    // The same instant again: nothing more.
    for (let i = 0; i < 10; i++) e.play('shot-lmg');
    expect(fake.started.length).toBe(once);
    // A different sound is not held back by it.
    e.play('enemy-hit');
    expect(fake.started.length).toBeGreaterThan(once);
  });

  it('the limiter: at most LIMIT.voices at once, none closer than LIMIT.gap', () => {
    const l = new VoiceLimiter();
    expect(l.take('x', 0, 1)).toBe(true);
    expect(l.take('x', LIMIT.gap / 2, 1)).toBe(false);
    let t = 0;
    let taken = 1;
    for (let i = 0; i < 10; i++) {
      t += LIMIT.gap * 1.5;
      if (l.take('x', t, 1)) taken += 1;
    }
    expect(taken).toBe(LIMIT.voices);
    // Once the first ones end, more may start.
    expect(l.take('x', 1.01, 1)).toBe(true);
    expect(l.take('y', 1.01, 1)).toBe(true);
  });

  it('a suspended context (a hidden tab) plays no effects; shown again, it resumes', () => {
    const { e, fake } = engine();
    e.unlock();
    e.hidden(true);
    expect(fake.state).toBe('suspended');
    e.play('won');
    expect(fake.started).toEqual([]);
    e.hidden(false);
    expect(fake.state).toBe('running');
    e.play('won');
    expect(fake.started.length).toBeGreaterThan(0);
  });

  it('the first click, while the browser is still starting audio, is scheduled, not dropped', () => {
    const { e, fake } = engine();
    e.unlock();
    fake.state = 'suspended';
    e.play('click');
    expect(fake.started.length).toBeGreaterThan(0);
  });

  it('everything goes through the master compressor, so cues landing together never clip', () => {
    const { e, fake } = engine();
    e.unlock();
    const [limit] = fake.compressors;
    expect(limit).toBeDefined();
    expect(fake.gains[0]!.links).toEqual([limit]);
    expect(limit!.links).toEqual([fake.destination]);
    expect(limit!.threshold.value).toBe(COMPRESSOR.threshold);
    expect(limit!.ratio.value).toBe(COMPRESSOR.ratio);
    expect(limit!.attack.value).toBe(COMPRESSOR.attack);
  });

  it('a switch during a fade drops the ramp under way; a track fading out comes back', () => {
    const { e, fake } = engine();
    e.unlock();
    e.music('camp');
    const camp = fake.gains.at(-1)!;
    fake.currentTime = 10.5;
    e.music('horde');
    // The camp's fade-in to 1 is cancelled before it fades out, so it never swells first.
    expect(camp.gain.calls.slice(-3).map((c) => c[0])).toEqual(['cancel', 'set', 'linear']);
    expect(camp.gain.calls.at(-1)).toEqual(['linear', 0, 10.5 + FADE]);
    const horde = fake.gains.at(-1)!;
    fake.currentTime = 11;
    const made = fake.gains.length;
    e.music('camp');
    // The camp track comes back from where it is: no second copy from step 0.
    expect(fake.gains.length).toBe(made);
    expect(camp.gain.calls.at(-1)).toEqual(['linear', 1, 11 + FADE]);
    expect(horde.gain.calls.slice(-3).map((c) => c[0])).toEqual(['cancel', 'set', 'linear']);
    expect(horde.gain.calls.at(-1)).toEqual(['linear', 0, 11 + FADE]);
  });

  it('a won or lost sting: the horde track drops fast and the camp waits for the sting', () => {
    const { e, fake } = engine();
    e.unlock();
    e.music('horde');
    const horde = fake.gains.at(-1)!;
    e.music('camp', STING);
    const camp = fake.gains.at(-1)!;
    expect(horde.gain.calls.at(-1)).toEqual(['linear', 0, 10 + STING_OUT]);
    expect(camp.gain.calls).toEqual([
      ['cancel', 0, 10],
      ['set', 0, 10],
      ['set', 0, 10 + STING],
      ['linear', 1, 10 + STING + FADE],
    ]);
    // Nothing of the camp track is scheduled before the sting is over.
    const before = fake.started.length;
    e.pump();
    fake.currentTime = 10 + STING - 0.3;
    e.pump();
    // Only the horde track's last notes (before it is gone) and nothing until the sting is over.
    const quiet = (t: number) => t > 10 + STING_OUT && t < 10 + STING;
    expect(fake.started.slice(before).some(quiet)).toBe(false);
    fake.currentTime = 10 + STING;
    e.pump();
    expect(fake.started.some((t) => t >= 10 + STING)).toBe(true);
  });

  it('a switch inside the sting fades the waiting track from silence, not full volume', () => {
    const { e, fake } = engine();
    e.unlock();
    e.music('horde');
    e.music('camp', STING);
    const camp = fake.gains.at(-1)!;
    fake.currentTime = 10.5;
    e.music('horde');
    expect(camp.gain.calls.slice(-2)).toEqual([
      ['set', 0, 10.5],
      ['linear', 0, 10.5 + FADE],
    ]);
  });

  it('while the browser holds audio, only the first click is scheduled; no burst on resume', () => {
    const { e, fake } = engine();
    e.unlock();
    fake.state = 'suspended';
    for (const cue of ['shot-pistol', 'enemy-hit', 'won'] as const) e.play(cue);
    expect(fake.started).toEqual([]);
  });

  it('music asked for before the first click starts once audio does', () => {
    const { e, fake } = engine();
    e.music('camp');
    e.unlock();
    e.pump();
    expect(fake.started.length).toBeGreaterThan(0);
  });

  it('a new track fades in while the old one fades out, then the old one stops', () => {
    const { e, fake } = engine();
    e.unlock();
    e.music('camp');
    e.pump();
    const camp = fake.gains[3]!;
    expect(camp.gain.calls.at(-1)).toEqual(['linear', 1, 10 + FADE]);
    // Asking for the same track again changes nothing.
    const made = fake.gains.length;
    e.music('camp');
    expect(fake.gains.length).toBe(made);
    e.music('horde');
    const horde = fake.gains.at(-1)!;
    expect(camp.gain.calls.at(-1)).toEqual(['linear', 0, 10 + FADE]);
    expect(horde.gain.calls.at(-1)).toEqual(['linear', 1, 10 + FADE]);
    fake.currentTime = 10 + FADE + 0.01;
    e.pump();
    expect(camp.connected).toBe(false);
    expect(horde.connected).toBe(true);
  });

  it('after a long pause the music skips what it missed instead of playing it all at once', () => {
    const { e, fake } = engine();
    e.unlock();
    e.music('horde');
    e.pump();
    const before = fake.started.length;
    fake.currentTime += 600;
    e.pump();
    const notes = fake.started.slice(before);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThan(30);
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(fake.currentTime);
  });

  it('a ramp is worked out from its own numbers: held, then a straight line, then held', () => {
    const r = { from: 0, to: 1, at: 2, end: 4 };
    expect([rampAt(r, 0), rampAt(r, 2), rampAt(r, 3), rampAt(r, 4), rampAt(r, 9)]).toEqual([
      0, 0, 0.5, 1, 1,
    ]);
  });

  it('both songs are whole loops with something on every bar', () => {
    for (const song of Object.values(SONGS)) {
      expect(song.steps % 16).toBe(0);
      for (let bar = 0; bar < song.steps; bar += 8) {
        const parts = Array.from({ length: 8 }, (_, i) => song.at(bar + i)).flat();
        expect(parts.length).toBeGreaterThan(0);
      }
    }
  });
});
