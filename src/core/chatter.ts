// Survivor chatter (ID-085): short speech bubbles when something happens in a fight. It
// watches the fight from one frame to the next and never changes it; its lines are fixed
// text written here, picked with its own seeded random source, so the fight's rolls
// (and its replay from a seed) are untouched.
import { wavesCleared, type Defender, type HordeState } from './horde.ts';
import { pick, rngFrom, type RngState } from './rng.ts';

/** What a survivor can speak up about. */
export type ChatEvent =
  | 'down'
  | 'lowHp'
  | 'breach'
  | 'boss'
  | 'won'
  | 'cleared'
  | 'lastEnemy'
  | 'crit'
  | 'streak'
  | 'dry'
  | 'reload'
  | 'throw'
  | 'kill'
  | 'hit';

/** How a survivor talks (ID-093): it sets the lines they say, nothing else. */
export type Personality = 'calm' | 'cocky' | 'nervous';
export const PERSONALITIES: readonly Personality[] = ['calm', 'cocky', 'nervous'];
/** The one word a survivor card shows. */
export const PERSONALITY_NAMES: Readonly<Record<Personality, string>> = {
  calm: 'Calm',
  cocky: 'Cocky',
  nervous: 'Nervous',
};

/**
 * A survivor's personality (ID-093), kept for good since it comes from their id, which
 * never changes (the way their look does). A numbered id (`recruit-<n>`, `s<patrol>-<k>`,
 * `c<level>`) counts round the personalities by its last number, so survivors who join one
 * after another differ; any other id is hashed.
 */
export function personalityOf(id: string): Personality {
  const n = PERSONALITIES.length;
  const digit = (i: number): boolean => id.charCodeAt(i) >= 48 && id.charCodeAt(i) <= 57;
  let start = id.length;
  while (start > 0 && digit(start - 1)) start--;
  let k: number;
  if (start < id.length) {
    // Only the number's value round the personalities matters, so it never overflows.
    let v = 0;
    for (let i = start; i < id.length; i++) v = (v * 10 + id.charCodeAt(i) - 48) % n;
    k = (v + n - 1) % n;
  } else {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
    k = (h >>> 0) % n;
  }
  return PERSONALITIES[k]!;
}

/** Each personality's lines for each event (3–5): fixed text, never typed by the player. */
export const CHAT_LINES: Readonly<
  Record<Personality, Readonly<Record<ChatEvent, readonly string[]>>>
> = {
  calm: {
    down: ["I'm down. Keep firing.", 'Going down. Hold the line.', 'Hit bad. Stay sharp.'],
    lowHp: ["I'm hit. Still in it.", 'Bleeding. Need a patch.', 'Hurt. Cover me.'],
    breach: ['Breach. Plug that gap.', "They're through. Watch it.", "Wall's open."],
    boss: ['Big one. Focus fire.', 'Heavy contact.', 'Big target. Steady.'],
    won: ['The camp holds.', 'That was the horde.', 'All clear. Good work.'],
    cleared: ['Wave clear. Reload.', 'Clear. Reset.', 'Catch your breath.'],
    lastEnemy: ['One left.', 'Last contact.', 'Finish it.'],
    crit: ['Clean shot.', 'Centre mass.', 'Good hit.'],
    streak: ['Three down.', 'Keep it steady.', 'Good rhythm.'],
    dry: ['Both dry.', 'Out of rounds.', 'Empty. Stand by.'],
    reload: ['Reloading.', 'Changing mags.', 'Mag out, mag in.'],
    throw: ['Frag out.', 'Grenade. Heads down.', 'Throwing.'],
    kill: ['Target down.', 'Next.', 'Got it.'],
    hit: ['Took one.', 'Hit. Fine.', 'Minor.'],
  },
  cocky: {
    down: ['Lucky shot!', "This isn't over!", 'Cheap shot!'],
    lowHp: ['Just a scratch!', "I've had worse!", 'That all you got?'],
    breach: ['Oh, you want in?!', 'Get back out there!', "Let 'em in, I dare you!"],
    boss: ['Finally, a real fight!', 'Ooh, a big one!', 'The bigger they are…'],
    won: ['Never in doubt!', "Told you we'd win!", "Who's the best? Us!"],
    cleared: ['Bring the next lot!', "That's it?", 'More! I want more!'],
    lastEnemy: ["Last one's mine!", 'Save that one for me!', 'Run while you can!'],
    crit: ['Called it!', 'Right in the face!', 'Did you see that?!'],
    streak: ["I'm unstoppable!", "Count 'em!", "Keep 'em coming!"],
    dry: ['Out? Already?!', "I'll punch them then!", 'Empty! Who cares!'],
    reload: ['Reload, then more of you!', 'Hold still, reloading!', 'Fresh mag, fresh pain!'],
    throw: ['Catch!', 'Special delivery!', 'Here, a present!'],
    kill: ['Too easy!', "Who's next?!", 'Another one!'],
    hit: ['Is that it?', 'Tickles!', 'Missed me! Mostly.'],
  },
  nervous: {
    down: ['Help! Help me!', "Don't leave me!", 'I knew it!'],
    lowHp: ["I don't want to die here!", 'So much blood!', 'Medic! Please!'],
    breach: ["They're in! They're in!", "The wall's gone!", "We're done for!"],
    boss: ['What is THAT?!', 'Nope. Nope. Nope.', "We're gonna die!"],
    won: ['We… we made it?', "I'm alive! I'm alive!", 'Is it over?'],
    cleared: ['Is that all of them?', 'Please be all of them…', 'Quick, reload!'],
    lastEnemy: ['Just one more…', 'Get it, get it!', 'Last one, please!'],
    crit: ['I hit it?!', 'Whoa, did you see?!', 'Lucky! So lucky!'],
    streak: ['They keep coming!', 'Is this good?!', 'How many is that?!'],
    dry: ['Click?! No no no!', "I'm out! I'm out!", "I've got nothing!"],
    reload: ['Reloading — hurry, hurry!', 'Come on, come on!', "Don't jam, don't jam!"],
    throw: ['Grenade! Duck!', 'Get down!', 'Please work!'],
    kill: ['Did I get it?!', 'Stay down, please!', "It's down! I think!"],
    hit: ['Ow! Ow!', 'It bit me!', 'Get it off!'],
  },
};

/** Which event wins, highest first: a higher one replaces a lower one already showing. */
export const CHAT_RANK: Readonly<Record<ChatEvent, number>> = {
  down: 12,
  lowHp: 11,
  breach: 10,
  boss: 9,
  won: 8,
  cleared: 8,
  lastEnemy: 7,
  crit: 6,
  streak: 6,
  dry: 5,
  reload: 4,
  throw: 3,
  kill: 2,
  hit: 1,
};

export type ChatterLevel = 'off' | 'low' | 'full';
export const CHATTER_LEVELS: readonly ChatterLevel[] = ['off', 'low', 'full'];

/**
 * Real seconds: a bubble shows `life`; a survivor waits `wait` between lines (`lowWait` on
 * Low), and `again` before the same routine event again (`squadAgain` for anyone in the
 * squad: a stream of Brutes or breaches is one call); at most `cap` show at once
 * (`lowCap` on Low), and Low says only events ranked `lowFrom` or higher. Kills
 * `streak.kills` within `streak.within` fight s are a streak; under `lowHp` of max HP is low.
 */
export const CHAT = {
  life: 1.5,
  wait: 4,
  lowWait: 8,
  cap: 3,
  lowCap: 1,
  again: { reload: 15, kill: 10, hit: 10, crit: 10 } as Readonly<
    Partial<Record<ChatEvent, number>>
  >,
  squadAgain: { boss: 6, breach: 6 } as Readonly<Partial<Record<ChatEvent, number>>>,
  lowFrom: 'lastEnemy' as ChatEvent,
  streak: { kills: 3, within: 3 },
  lowHp: 0.3,
} as const;

/** A speech bubble over survivor `by`, from `at` (chat clock), where they stand or last stood. */
export interface Bubble {
  by: string;
  event: ChatEvent;
  line: string;
  at: number;
  x: number;
  y: number;
  /** Their post, or null while walking: the renderer lifts the bubble to its floor. */
  postId: number | null;
  /** A plain survivor's name tag sits lower (ID-074); the bubble sits over it. */
  plain: boolean;
}

export interface ChatState {
  /** The fight it follows: a new fight starts a new chat. */
  fight: { seed: number; startedAt: number } | null;
  rng: RngState;
  /** Real seconds since the fight started showing. */
  clock: number;
  bubbles: Bubble[];
  /** When each survivor last spoke. Maps, never plain objects: ids come from the save. */
  spoke: Map<string, number>;
  /** When each survivor last said each routine event (key: id, a NUL, the event). */
  again: Map<string, number>;
  /** The line each event said last (by anyone), so it never says it twice in a row. */
  said: Partial<Record<ChatEvent, string>>;
  /** Each survivor's recent kill times (fight s), for streaks. */
  kills: Map<string, number[]>;
}

export function newChat(): ChatState {
  return {
    fight: null,
    rng: { s: 0 },
    clock: 0,
    bubbles: [],
    spoke: new Map(),
    again: new Map(),
    said: {},
    kills: new Map(),
  };
}

const EPS = 1e-9;

/**
 * The chat after the fight went from `prev` to `next` over `dt` real seconds, at chatter
 * `level`. A new fight (or none before) starts over; Off shows nothing.
 */
export function chatter(
  chat: ChatState,
  prev: HordeState | null,
  next: HordeState,
  dt: number,
  level: ChatterLevel,
): ChatState {
  const fight = { seed: next.seed, startedAt: next.startedAt };
  const same =
    chat.fight !== null &&
    chat.fight.seed === fight.seed &&
    chat.fight.startedAt === fight.startedAt;
  const c: ChatState = same
    ? structuredClone(chat)
    : { ...newChat(), fight, rng: { s: (next.seed ^ 0x5bd1e995) >>> 0 } };
  c.clock += Number.isFinite(dt) && dt > 0 ? dt : 0;
  c.bubbles = c.bubbles.filter((b) => c.clock - b.at < CHAT.life);
  if (level === 'off') {
    c.bubbles = [];
    return c;
  }
  if (same && prev && prev.seed === next.seed && prev.startedAt === next.startedAt) {
    for (const [d, event] of events(c, prev, next)) say(c, d, event, level);
  }
  // Each bubble follows its survivor while they stand in the fight.
  for (const b of c.bubbles) {
    const d = next.defenders.find((x) => x.id === b.by);
    if (d) Object.assign(b, spot(d));
  }
  return c;
}

const spot = (d: Defender): Pick<Bubble, 'x' | 'y' | 'postId' | 'plain'> => ({
  x: d.x,
  y: d.y,
  postId: d.walking ? null : d.postId,
  plain: d.plain === true,
});

/** What happened between the two frames: each survivor's highest event, highest first. */
function events(c: ChatState, prev: HordeState, next: HordeState): [Defender, ChatEvent][] {
  const best = new Map<string, [Defender, ChatEvent]>();
  const note = (d: Defender | undefined, event: ChatEvent): void => {
    if (!d) return;
    const had = best.get(d.id);
    if (!had || CHAT_RANK[event] > CHAT_RANK[had[1]]) best.set(d.id, [d, event]);
  };
  const before = new Map(prev.defenders.map((d) => [d.id, d]));
  const standing = next.defenders;

  // Down: in the fight before, injured now (they speak from where they fell).
  const wasHurt = new Set(prev.injured.map((i) => i.defender.id));
  for (const i of next.injured)
    if (!wasHurt.has(i.defender.id)) note(before.get(i.defender.id), 'down');

  for (const d of standing) {
    const b = before.get(d.id);
    if (!b) continue;
    if (d.hp < b.hp) {
      const low = d.hp / d.maxHp < CHAT.lowHp && !(b.hp / b.maxHp < CHAT.lowHp);
      note(d, low ? 'lowHp' : 'hit');
    }
    // A reload starting: an empty gun's reload end moved later.
    const slots = (['primary', 'secondary'] as const).filter((s) => d.loadout[s] !== null);
    if (slots.some((s) => d.reloadedAt[s] > b.reloadedAt[s] + EPS)) {
      // Two guns, both empty: nothing left to shoot.
      const dry = slots.length === 2 && slots.every((s) => d.ammo[s] === 0);
      note(d, dry ? 'dry' : 'reload');
    }
  }

  // Kills, crits and throws from this frame's steps.
  for (const f of next.feats) {
    if (f.at < prev.time - EPS) continue;
    const d = standing.find((x) => x.id === f.by);
    if (!d) continue;
    if (f.kind === 'kill') {
      const recent = (c.kills.get(d.id) ?? []).filter((t) => f.at - t < CHAT.streak.within);
      recent.push(f.at);
      if (recent.length >= CHAT.streak.kills) {
        note(d, 'streak');
        c.kills.set(d.id, []);
      } else {
        note(d, 'kill');
        c.kills.set(d.id, recent);
      }
    } else note(d, f.kind);
  }

  // The squad's moments: one survivor speaks for them.
  // The survivor nearest a spot (with no `y`, nearest along `x`); ties → the first listed.
  const nearest = (x: number, y?: number): Defender | undefined => {
    const far = (d: Defender): number => Math.hypot(d.x - x, y === undefined ? 0 : d.y - y);
    return standing.reduce<Defender | undefined>(
      (n, d) => (!n || far(d) < far(n) ? d : n),
      undefined,
    );
  };
  for (const br of next.breaches.slice(prev.breaches.length)) {
    const layer = next.layers.find((l) => l.column === br.column);
    if (layer) note(nearest(layer.x), 'breach');
  }
  const seen = new Set(prev.enemies.map((e) => e.id));
  for (const e of next.enemies) {
    if (!seen.has(e.id) && (e.kind === 'horror' || e.kind === 'brute'))
      note(nearest(e.x, e.y), 'boss');
  }
  // A wave just cleared with the field empty (ID-128: by `wavesCleared`, since the next
  // wave is already on its way in the same step, and horde-only waves overlap).
  const cleared =
    prev.enemies.length > 0 && next.enemies.length === 0 && wavesCleared(next) > wavesCleared(prev);
  if (
    (prev.outcome === 'fighting' && next.outcome === 'won') ||
    (cleared && next.outcome !== 'lost')
  ) {
    const won = next.outcome === 'won';
    if (standing.length > 0) note(pick(rngFrom(c.rng), standing), won ? 'won' : 'cleared');
  } else if (next.toSpawn === 0 && prev.enemies.length > 1 && next.enemies.length === 1) {
    const last = next.enemies[0]!;
    note(nearest(last.x, last.y), 'lastEnemy');
  }
  return [...best.values()].sort((a, b) => CHAT_RANK[b[1]] - CHAT_RANK[a[1]]);
}

/** `d` says a line for `event`, if their wait, the cap and what is showing allow it. */
function say(c: ChatState, d: Defender, event: ChatEvent, level: ChatterLevel): void {
  const rank = CHAT_RANK[event];
  if (level === 'low' && rank < CHAT_RANK[CHAT.lowFrom]) return;
  // A routine event waits longer before the same survivor says it again (a lone
  // survivor reloads every few seconds).
  const key = `${d.id}\0${event}`;
  const again = CHAT.again[event];
  if (again !== undefined && c.clock - (c.again.get(key) ?? -Infinity) < again - EPS) return;
  const squadKey = `\0${event}`;
  const squad = CHAT.squadAgain[event];
  if (squad !== undefined && c.clock - (c.again.get(squadKey) ?? -Infinity) < squad - EPS) return;
  const mine = c.bubbles.find((b) => b.by === d.id);
  if (mine) {
    // Showing: only a higher event replaces it.
    if (rank <= CHAT_RANK[mine.event]) return;
    c.bubbles = c.bubbles.filter((b) => b !== mine);
  } else {
    // An urgent event (a boss or higher) never waits: a kill line must not swallow a down.
    const wait = level === 'low' ? CHAT.lowWait : CHAT.wait;
    const urgent = rank >= CHAT_RANK.boss;
    if (!urgent && c.clock - (c.spoke.get(d.id) ?? -Infinity) < wait - EPS) return;
    const cap = level === 'low' ? CHAT.lowCap : CHAT.cap;
    if (c.bubbles.length >= cap) {
      // Full: it takes the lowest one's place if it outranks it (the oldest of equals).
      const lowest = c.bubbles.reduce((m, b) => (CHAT_RANK[b.event] < CHAT_RANK[m.event] ? b : m));
      if (rank <= CHAT_RANK[lowest.event]) return;
      c.bubbles = c.bubbles.filter((b) => b !== lowest);
    }
  }
  const pool = CHAT_LINES[personalityOf(d.id)][event];
  const fresh = pool.length > 1 ? pool.filter((l) => l !== c.said[event]) : pool;
  const line = pick(rngFrom(c.rng), fresh);
  c.said[event] = line;
  c.spoke.set(d.id, c.clock);
  if (again !== undefined) c.again.set(key, c.clock);
  if (squad !== undefined) c.again.set(squadKey, c.clock);
  c.bubbles.push({ by: d.id, event, line, at: c.clock, ...spot(d) });
}
