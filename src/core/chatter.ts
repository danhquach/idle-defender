// Survivor chatter (ID-085): short speech bubbles when something happens in a fight. It
// watches the fight from one frame to the next and never changes it; its lines are fixed
// text written here, picked with its own seeded random source, so the fight's rolls
// (and its replay from a seed) are untouched.
import type { Defender, HordeState } from './horde.ts';
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

/** Each event's lines: fixed text, never typed by the player. */
export const CHAT_LINES: Readonly<Record<ChatEvent, readonly string[]>> = {
  down: ["Argh, I'm hit!", 'Keep going without me!', "I'm down!", 'Leave me!'],
  lowHp: ['I need a medic!', 'Not looking good…', "I can't take much more!", 'Patch me up!'],
  breach: ["They're through!", 'Plug that gap!', "They're inside!", 'Breach!'],
  boss: ['What is THAT?!', 'Big one incoming!', 'Oh no…', "That's a big one!"],
  won: ['We made it!', "Ha! We're alive!", 'The camp holds!', 'We did it!'],
  cleared: ['Is that all you got?', 'Clear!', 'Catch your breath!', 'Reload while you can!'],
  lastEnemy: ['One left!', 'Finish it!', 'Last one!', 'Almost there!'],
  crit: ['Bullseye!', 'Right between the eyes!', 'Clean shot!', 'Perfect!'],
  streak: ["I'm on fire!", "Who's next?!", 'Keep them coming!', 'Unstoppable!'],
  dry: ['Click… uh oh.', 'Both empty!', 'Out! Out!', 'Nothing left!'],
  reload: ['Reloading!', 'Cover me!', 'Changing mags!', 'New mag!', 'Hold on!'],
  throw: ['Fire in the hole!', 'Grenade out!', 'Duck!', 'Heads down!'],
  kill: ['Take that!', 'Down you go!', 'Next!', 'Got one!', 'Stay down!'],
  hit: ['Ow!', 'That stung!', 'Hey!', 'Ugh!'],
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
  /** The line each event said last, so it never says it twice in a row. */
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
  const cleared = prev.enemies.length > 0 && next.enemies.length === 0 && next.toSpawn === 0;
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
  const pool = CHAT_LINES[event];
  const fresh = pool.length > 1 ? pool.filter((l) => l !== c.said[event]) : pool;
  const line = pick(rngFrom(c.rng), fresh);
  c.said[event] = line;
  c.spoke.set(d.id, c.clock);
  if (again !== undefined) c.again.set(key, c.clock);
  if (squad !== undefined) c.again.set(squadKey, c.clock);
  c.bubbles.push({ by: d.id, event, line, at: c.clock, ...spot(d) });
}
