// Survivor chatter (ID-085): speech bubbles from what happens between two frames of a fight.
import { describe, expect, it } from 'vitest';
import {
  CHAT,
  CHAT_LINES,
  CHAT_RANK,
  chatter,
  newChat,
  PERSONALITIES,
  personalityOf,
  type ChatEvent,
  type ChatState,
  type ChatterLevel,
} from './chatter.ts';
import { STEP, WEAPONS } from './data.ts';
import { newHorde, tick, type HordeState } from './horde.ts';
import { loadoutFrom } from './loadout.ts';
import { enemy, setup } from './testing.ts';

/** Horde 1 with `n` survivors on the line 40 apart along x, nothing to spawn, nobody firing. */
function fight(n = 1): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  const a = s.defenders[0]!;
  a.nextShotAt = 1e9;
  for (let i = 1; i < n; i++)
    s.defenders.push({ ...structuredClone(a), id: `d${i}`, x: a.x + 40 * i });
  return s;
}
/** `s` one step on, changed by `f`, as a frame would bring it. */
function later(s: HordeState, f: (t: HordeState) => void = () => {}): HordeState {
  const t = structuredClone(s);
  t.time += STEP;
  f(t);
  return t;
}
const hurt = (t: HordeState, id: string, by = 1): void => {
  t.defenders.find((d) => d.id === id)!.hp -= by;
};
/** The chat once it has seen `s` (a fight's first frame says nothing). */
const begun = (s: HordeState, level: ChatterLevel = 'full'): ChatState =>
  chatter(newChat(), null, s, 0, level);
const events = (c: ChatState): [string, ChatEvent][] => c.bubbles.map((b) => [b.by, b.event]);
/** The lines survivor `id` says, by their personality. */
const linesOf = (id: string) => CHAT_LINES[personalityOf(id)];

describe('survivor personalities (ID-093)', () => {
  it('comes from who they are: survivors who join one after another differ', () => {
    expect(['recruit-1', 'recruit-2', 'recruit-3'].map(personalityOf)).toEqual([
      'calm',
      'cocky',
      'nervous',
    ]);
    expect(personalityOf('recruit-4')).toBe('calm');
    expect(personalityOf('s3-2')).toBe(personalityOf('recruit-2'));
    expect(personalityOf('c7')).toBe(personalityOf('c7'));
    // A number too long for a float still counts round by its value.
    expect(personalityOf(`r${'9'.repeat(400)}`)).toBe(personalityOf('r9'));
  });

  it('any id a save can carry is only an id: always one of the three', () => {
    // A right-to-left override, built from its code point so the source holds no hidden char.
    const rlo = String.fromCharCode(0x202e);
    const odd = ['', 'a', 'constructor', '__proto__', 'toString', `${rlo}1`, 'x'.repeat(10_000)];
    for (const id of odd) expect(PERSONALITIES).toContain(personalityOf(id));
  });

  it("a hashed id's personality is pinned, so an existing save's survivors keep theirs", () => {
    expect(['bob', 'jack', 'john'].map(personalityOf)).toEqual(['nervous', 'cocky', 'nervous']);
  });

  it('every event has 3–5 fixed lines per personality, no two personalities sharing one', () => {
    const events = Object.keys(CHAT_RANK) as ChatEvent[];
    for (const p of PERSONALITIES) {
      expect(Object.keys(CHAT_LINES[p]).sort()).toEqual([...events].sort());
      for (const e of events) {
        const pool = CHAT_LINES[p][e];
        expect(pool.length).toBeGreaterThanOrEqual(3);
        expect(pool.length).toBeLessThanOrEqual(5);
        expect(new Set(pool).size).toBe(pool.length);
      }
    }
    for (const e of events) {
      const all = PERSONALITIES.flatMap((p) => CHAT_LINES[p][e]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("carries the ticket's lines", () => {
    expect(CHAT_LINES.calm.reload).toEqual(
      expect.arrayContaining(['Reloading.', 'Changing mags.']),
    );
    expect(CHAT_LINES.calm.kill).toEqual(expect.arrayContaining(['Target down.', 'Next.']));
    expect(CHAT_LINES.calm.lowHp).toContain("I'm hit. Still in it.");
    expect(CHAT_LINES.cocky.reload).toContain('Reload, then more of you!');
    expect(CHAT_LINES.cocky.kill).toEqual(expect.arrayContaining(['Too easy!', "Who's next?!"]));
    expect(CHAT_LINES.cocky.lowHp).toContain('Just a scratch!');
    expect(CHAT_LINES.nervous.reload).toContain('Reloading — hurry, hurry!');
    expect(CHAT_LINES.nervous.kill).toEqual(
      expect.arrayContaining(['Did I get it?!', 'Stay down, please!']),
    );
    expect(CHAT_LINES.nervous.lowHp).toContain("I don't want to die here!");
  });

  it('each survivor speaks from their own lines, in every fight', () => {
    // d1, d2, d3: calm, cocky, nervous.
    for (const seed of [1, 2, 3]) {
      const s = fight(4);
      s.seed = seed;
      s.defenders = s.defenders.slice(1);
      const t = later(s, (x) => ['d1', 'd2', 'd3'].forEach((id) => hurt(x, id)));
      const c = chatter(begun(s), s, t, 0.03, 'full');
      expect(c.bubbles.map((b) => b.by).sort()).toEqual(['d1', 'd2', 'd3']);
      for (const b of c.bubbles) expect(linesOf(b.by).hit).toContain(b.line);
      expect(c.bubbles.map((b) => personalityOf(b.by)).sort()).toEqual([
        'calm',
        'cocky',
        'nervous',
      ]);
    }
  });
});

describe('what a survivor speaks up about (ID-085)', () => {
  it('says nothing on the first frame of a fight', () => {
    const s = fight();
    expect(begun(s).bubbles).toEqual([]);
  });

  it('getting hit gives a line from the hit pool, over the survivor', () => {
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    const c = chatter(begun(s), s, t, 0.03, 'full');
    expect(c.bubbles).toHaveLength(1);
    const b = c.bubbles[0]!;
    expect(b).toMatchObject({ by: 'a', event: 'hit', x: t.defenders[0]!.x, y: t.defenders[0]!.y });
    expect(linesOf('a').hit).toContain(b.line);
    expect(b.postId).toBe(t.defenders[0]!.postId);
  });

  it('dropping under 30% HP is low HP, not a plain hit; staying low after is only a hit', () => {
    const s = fight();
    const a = s.defenders[0]!;
    const t = later(s, (x) => hurt(x, 'a', a.hp - a.maxHp * 0.29));
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['a', 'lowHp']]);
    const u = later(t, (x) => hurt(x, 'a', 0.5));
    expect(events(chatter(begun(t), t, u, 0.03, 'full'))).toEqual([['a', 'hit']]);
  });

  it('a reload starting is a reload; with both guns empty it is the dry line', () => {
    const s = fight();
    const t = later(s, (x) => {
      x.defenders[0]!.ammo.primary = 0;
      x.defenders[0]!.reloadedAt.primary = 5;
    });
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['a', 'reload']]);

    const two = fight();
    const d = two.defenders[0]!;
    d.loadout = { ...d.loadout, secondary: 'pistol' };
    d.ammo.secondary = 0;
    d.reloadedAt.secondary = 9;
    const dry = later(two, (x) => {
      x.defenders[0]!.ammo.primary = 0;
      x.defenders[0]!.reloadedAt.primary = 5;
    });
    expect(events(chatter(begun(two), two, dry, 0.03, 'full'))).toEqual([['a', 'dry']]);
  });

  it('a survivor injured speaks from where they fell, and the bubble stays there', () => {
    const s = fight(2);
    const a = s.defenders[0]!;
    const t = later(s, (x) => {
      x.defenders = x.defenders.filter((d) => d.id !== 'a');
      x.injured.push({ defender: a, postId: a.postId, at: x.time, offered: false, by: null });
    });
    const c = chatter(begun(s), s, t, 0.03, 'full');
    expect(c.bubbles).toEqual([
      expect.objectContaining({ by: 'a', event: 'down', x: a.x, y: a.y }),
    ]);
    expect(linesOf('a').down).toContain(c.bubbles[0]!.line);
    const u = later(t);
    expect(chatter(c, t, u, 0.5, 'full').bubbles[0]).toMatchObject({ x: a.x, y: a.y });
  });

  it('a kill, a crit or a throw comes from the feats of this frame only', () => {
    const s = fight();
    const t = later(s, (x) => x.feats.push({ kind: 'throw', by: 'a', at: s.time }));
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['a', 'throw']]);
    // Last frame's feat, still listed, says nothing again.
    const u = later(t);
    const quiet = { ...begun(t), spoke: new Map(), again: new Map() };
    expect(chatter(quiet, t, u, 0.03, 'full').bubbles).toEqual([]);
  });

  it('three kills within 3 s is a streak', () => {
    let s = fight();
    let c = begun(s, 'full');
    const kinds: ChatEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const t = later(s, (x) => x.feats.push({ kind: 'kill', by: 'a', at: s.time }));
      // Clear the bubble and the wait each time so every kill can speak.
      c = chatter({ ...c, bubbles: [], spoke: new Map(), again: new Map() }, s, t, 0.03, 'full');
      kinds.push(c.bubbles[0]!.event);
      s = t;
    }
    expect(kinds).toEqual(['kill', 'kill', 'streak']);
  });

  it('a breach is called by the survivor nearest that wall', () => {
    const s = fight(3);
    const layer = s.layers[0]!;
    const near = s.defenders.reduce((n, d) =>
      Math.abs(d.x - layer.x) < Math.abs(n.x - layer.x) ? d : n,
    );
    const t = later(s, (x) =>
      x.breaches.push({ column: layer.column, row: 0, wave: 1, through: 'gap' }),
    );
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([[near.id, 'breach']]);
  });

  it('a Horror or a Brute appearing is called by the survivor nearest it', () => {
    const s = fight(2);
    const t = later(s, (x) =>
      enemy(x, { kind: 'brute', x: s.defenders[1]!.x, y: s.defenders[1]!.y }),
    );
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['d1', 'boss']]);
    const shambler = later(s, (x) => enemy(x, {}));
    expect(chatter(begun(s), s, shambler, 0.03, 'full').bubbles).toEqual([]);
  });

  it('the last enemy left, then the wave cleared', () => {
    const s = fight();
    enemy(s, {});
    enemy(s, {});
    const one = later(s, (x) => x.enemies.pop());
    expect(events(chatter(begun(s), s, one, 0.03, 'full'))).toEqual([['a', 'lastEnemy']]);
    const none = later(one, (x) => (x.enemies = []));
    expect(events(chatter(begun(one), one, none, 0.03, 'full'))).toEqual([['a', 'cleared']]);
  });

  it('nothing is said on the last enemy while more are still to come', () => {
    const s = fight();
    s.toSpawn = 3;
    enemy(s, {});
    enemy(s, {});
    const one = later(s, (x) => x.enemies.pop());
    expect(chatter(begun(s), s, one, 0.03, 'full').bubbles).toEqual([]);
  });

  it('a won horde gets a won line', () => {
    const s = fight();
    const t = later(s, (x) => (x.outcome = 'won'));
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['a', 'won']]);
  });
});

describe('who gets to speak (ID-085)', () => {
  it('ranks the events: down > low HP > breach > boss > crit/streak > reload > kill', () => {
    const order: ChatEvent[] = ['down', 'lowHp', 'breach', 'boss', 'crit', 'reload', 'kill'];
    for (let i = 1; i < order.length; i++) {
      expect(CHAT_RANK[order[i - 1]!]).toBeGreaterThan(CHAT_RANK[order[i]!]);
    }
    expect(CHAT_RANK.streak).toBe(CHAT_RANK.crit);
  });

  it('keeps only the highest event a survivor has in one frame', () => {
    const s = fight();
    const t = later(s, (x) => {
      hurt(x, 'a');
      x.feats.push({ kind: 'crit', by: 'a', at: s.time }, { kind: 'kill', by: 'a', at: s.time });
    });
    expect(events(chatter(begun(s), s, t, 0.03, 'full'))).toEqual([['a', 'crit']]);
  });

  it('a higher event replaces a lower one showing, at once; a lower one never does', () => {
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    const c = chatter(begun(s), s, t, 0.03, 'full');
    const u = later(t, (x) => x.feats.push({ kind: 'crit', by: 'a', at: t.time }));
    const d = chatter(c, t, u, 0.03, 'full');
    expect(events(d)).toEqual([['a', 'crit']]);
    const v = later(u, (x) => hurt(x, 'a'));
    expect(events(chatter(d, u, v, 0.03, 'full'))).toEqual([['a', 'crit']]);
  });

  it('each survivor waits 4 s between lines', () => {
    let s = fight();
    let c = begun(s);
    const said: number[] = [];
    // A throw every 0.5 s for 9 s.
    for (let i = 0; i < 18; i++) {
      const at = s.time;
      const t = later(s, (x) => x.feats.push({ kind: 'throw', by: 'a', at }));
      c = chatter(c, s, t, 0.5, 'full');
      if (c.bubbles.some((b) => b.at === c.clock)) said.push(c.clock);
      s = t;
    }
    expect(said).toEqual([0.5, 4.5, 8.5]);
  });

  it('a lone survivor reloading every 2 s for 30 s speaks of it only every 15 s', () => {
    let s = fight();
    let c = begun(s);
    const said: number[] = [];
    for (let i = 1; i <= 15; i++) {
      const t = later(s, (x) => (x.defenders[0]!.reloadedAt.primary = x.time + 1));
      c = chatter(c, s, t, 2, 'full');
      if (c.bubbles.some((b) => b.at === c.clock)) said.push(c.clock);
      s = t;
    }
    expect(said).toEqual([2, 18]);
  });

  it("a routine event's longer wait is its own: a kill can follow a reload after 4 s", () => {
    const s = fight();
    const t = later(s, (x) => (x.defenders[0]!.reloadedAt.primary = 5));
    let c = chatter(begun(s), s, t, 0.03, 'full');
    const u = later(t, (x) => x.feats.push({ kind: 'kill', by: 'a', at: t.time }));
    c = chatter(c, t, u, CHAT.wait, 'full');
    expect(events(c)).toEqual([['a', 'kill']]);
  });

  it('survivor ids naming object built-ins are only ids (a save can carry any)', () => {
    for (const id of ['constructor', '__proto__', 'hasOwnProperty', 'toString']) {
      let s = fight();
      s.defenders[0]!.id = id;
      let c = begun(s);
      const kinds: ChatEvent[] = [];
      for (let i = 0; i < 3; i++) {
        const at = s.time;
        const t = later(s, (x) => x.feats.push({ kind: 'kill', by: id, at }));
        c = chatter({ ...c, bubbles: [], spoke: new Map(), again: new Map() }, s, t, 0.03, 'full');
        kinds.push(c.bubbles[0]!.event);
        s = t;
      }
      expect(kinds).toEqual(['kill', 'kill', 'streak']);
      // The 4 s wait holds for them too.
      const t = later(s, (x) => hurt(x, id));
      expect(chatter({ ...c, bubbles: [] }, s, t, 0.03, 'full').bubbles).toEqual([]);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a crit waits 10 s before the same survivor says it again', () => {
    let s = fight();
    let c = begun(s);
    const said: number[] = [];
    for (let i = 0; i < 12; i++) {
      const at = s.time;
      const t = later(s, (x) => x.feats.push({ kind: 'crit', by: 'a', at }));
      c = chatter(c, s, t, 2, 'full');
      if (c.bubbles.some((b) => b.at === c.clock)) said.push(c.clock);
      s = t;
    }
    expect(said).toEqual([2, 12, 22]);
  });

  it('a stream of Brutes is one call for the squad: 6 s before anyone calls the next', () => {
    let s = fight(3);
    let c = begun(s);
    const said: [number, string][] = [];
    for (let i = 0; i < 8; i++) {
      // Each Brute appears by a different survivor in turn.
      const by = s.defenders[i % 3]!;
      const t = later(s, (x) => enemy(x, { kind: 'brute', x: by.x, y: by.y }));
      c = chatter(c, s, t, 1, 'full');
      for (const b of c.bubbles) if (b.at === c.clock) said.push([c.clock, b.by]);
      s = t;
    }
    expect(said.map(([t]) => t)).toEqual([1, 7]);
  });

  it('an urgent event (boss or higher) skips the wait; a lower one still waits', () => {
    const s = fight();
    const t = later(s, (x) => x.feats.push({ kind: 'kill', by: 'a', at: s.time }));
    let c = chatter(begun(s), s, t, 0.03, 'full');
    expect(events(c)).toEqual([['a', 'kill']]);
    // 2.5 s on: the kill line is gone, but the wait is not over.
    const u = later(t, (x) => hurt(x, 'a'));
    c = chatter(c, t, u, 2.5, 'full');
    expect(c.bubbles).toEqual([]);
    const a = u.defenders[0]!;
    const v = later(u, (x) => hurt(x, 'a', a.hp - a.maxHp * 0.2));
    expect(events(chatter(c, u, v, 0.03, 'full'))).toEqual([['a', 'lowHp']]);
  });

  it('a bubble lasts 1.5 s and moves with its survivor', () => {
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    let c = chatter(begun(s), s, t, 0.1, 'full');
    const u = later(t, (x) => (x.defenders[0]!.x += 30));
    c = chatter(c, t, u, 1.3, 'full');
    expect(c.bubbles[0]!.x).toBe(u.defenders[0]!.x);
    expect(chatter(c, u, later(u), 0.2, 'full').bubbles).toEqual([]);
    expect(CHAT.life).toBe(1.5);
  });

  it('at most 3 show; a 4th takes the lowest one’s place only if it outranks it', () => {
    const s = fight(5);
    const t = later(s, (x) => ['a', 'd1', 'd2', 'd3'].forEach((id) => hurt(x, id)));
    const c = chatter(begun(s), s, t, 0.03, 'full');
    expect(c.bubbles).toHaveLength(3);
    const u = later(t, (x) => x.feats.push({ kind: 'throw', by: 'd4', at: t.time }));
    const d = chatter(c, t, u, 0.03, 'full');
    expect(d.bubbles).toHaveLength(3);
    expect(d.bubbles.map((b) => b.event).sort()).toEqual(['hit', 'hit', 'throw']);
    const v = later(u, (x) => hurt(x, 'd4'));
    expect(chatter(d, u, v, 0.03, 'full').bubbles).toEqual(d.bubbles);
  });

  it('never says the same line twice in a row', () => {
    let s = fight();
    let c = begun(s);
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      const t = later(s, (x) => hurt(x, 'a', 0.1));
      c = chatter(c, s, t, CHAT.again.hit!, 'full');
      lines.push(c.bubbles[0]!.line);
      s = t;
    }
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    expect(new Set(lines)).toEqual(new Set(linesOf('a').hit));
  });

  it('picks lines from its own seeded source: the same fight says the same, the fight’s rolls untouched', () => {
    const run = (): string[] => {
      let s = fight();
      let c = begun(s);
      const out: string[] = [];
      for (let i = 0; i < 10; i++) {
        const t = later(s, (x) => hurt(x, 'a', 0.1));
        c = chatter(c, s, t, CHAT.again.hit!, 'full');
        out.push(c.bubbles[0]!.line);
        s = t;
      }
      return out;
    };
    expect(run()).toEqual(run());
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    const rng = structuredClone(t.rng);
    chatter(begun(s), s, t, 0.03, 'full');
    expect(t.rng).toEqual(rng);
  });

  it('a new fight starts a new chat', () => {
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    const c = chatter(begun(s), s, t, 0.03, 'full');
    const other = newHorde(2, { ...setup(), startedAt: 5 });
    const d = chatter(c, t, other, 0.03, 'full');
    expect(d.bubbles).toEqual([]);
    expect(d.fight).toEqual({ seed: other.seed, startedAt: 5 });
  });
});

describe('the chatter setting (ID-085)', () => {
  it('Off shows nothing and clears what was showing', () => {
    const s = fight();
    const t = later(s, (x) => hurt(x, 'a'));
    expect(chatter(begun(s, 'off'), s, t, 0.03, 'off').bubbles).toEqual([]);
    const c = chatter(begun(s), s, t, 0.03, 'full');
    expect(chatter(c, t, later(t), 0.03, 'off').bubbles).toEqual([]);
  });

  it('Low says only the big moments, one at a time', () => {
    const s = fight(3);
    const routine = later(s, (x) => {
      hurt(x, 'a');
      x.defenders[1]!.reloadedAt.primary = 5;
      x.feats.push({ kind: 'crit', by: 'd2', at: s.time }, { kind: 'kill', by: 'd2', at: s.time });
    });
    expect(chatter(begun(s, 'low'), s, routine, 0.03, 'low').bubbles).toEqual([]);
    const layer = s.layers[0]!;
    const big = later(s, (x) => {
      x.breaches.push({ column: layer.column, row: 0, wave: 1, through: 'gap' });
      enemy(x, { kind: 'brute', x: s.defenders[2]!.x, y: s.defenders[2]!.y });
    });
    const c = chatter(begun(s, 'low'), s, big, 0.03, 'low');
    expect(c.bubbles).toHaveLength(1);
    expect(c.bubbles[0]!.event).toBe('breach');
  });

  it("Low waits 8 s between a survivor's lines below boss rank", () => {
    let s = fight();
    let c = begun(s, 'low');
    const said: number[] = [];
    for (let i = 0; i < 20; i++) {
      // Two enemies down to one, over and over: the last-enemy line each time.
      const t = later(s, (x) => {
        x.enemies = [];
        enemy(x, {});
      });
      const p = structuredClone(t);
      enemy(p, {});
      c = chatter({ ...c, bubbles: [] }, p, t, 0.5, 'low');
      if (c.bubbles.length > 0) said.push(c.clock);
      s = t;
    }
    expect(said.length).toBeGreaterThan(1);
    for (let i = 1; i < said.length; i++)
      expect(said[i]! - said[i - 1]!).toBeGreaterThanOrEqual(CHAT.lowWait - 1e-9);
  });
});

describe('feats the fight records for chatter (ID-085)', () => {
  /** A pistol bullet from `owner` at (590, 360) along +x into an enemy at (600, 360). */
  function shot(s: HordeState, owner: string, damage: number, crit = false): void {
    s.bullets.push({
      x: 590,
      y: 360,
      dx: 1,
      dy: 0,
      speed: 1800,
      damage,
      owner,
      fromX: 590,
      fromY: 360,
      aim: 10,
      left: 600,
      pierce: 0,
      hit: [],
      tracer: WEAPONS.pistol.tracer,
      ...(crit ? { crit: true as const } : {}),
    });
  }

  it("a survivor's killing bullet is a kill; a crit round is a crit", () => {
    const s = fight();
    enemy(s, { hp: 5, stunnedUntil: 99 });
    shot(s, 'a', 6, true);
    const t = tick(s, STEP);
    expect(t.feats).toEqual([
      { kind: 'crit', by: 'a', at: 0 },
      { kind: 'kill', by: 'a', at: 0 },
    ]);
  });

  it("a turret's bullet is no survivor's feat; a hit that doesn't kill is no kill", () => {
    const s = fight();
    enemy(s, { hp: 100, maxHp: 100, stunnedUntil: 99 });
    shot(s, 'turret:0', 6);
    shot(s, 'a', 6);
    expect(tick(s, STEP).feats).toEqual([]);
  });

  it('feats go after a second while the fight goes on, and all when the horde ends', () => {
    const s = fight();
    // Far off and tough, so the fight is still on.
    enemy(s, { x: 2000, hp: 999, maxHp: 999, stunnedUntil: 99 });
    s.feats.push({ kind: 'kill', by: 'a', at: 0 });
    let t = tick(s, 0.9);
    expect(t.feats).toHaveLength(1);
    t = tick(t, 0.2);
    expect(t.outcome).toBe('fighting');
    expect(t.feats).toEqual([]);
    const end = structuredClone(s);
    end.enemies = [];
    end.wave = end.waveCount;
    end.bosses = [];
    const won = tick(end, STEP);
    expect(won.outcome).toBe('won');
    expect(won.feats).toEqual([]);
  });

  it("a blade's killing strike is its wielder's kill", () => {
    const s = fight();
    const a = s.defenders[0]!;
    a.loadout = loadoutFrom('knife');
    a.nextShotAt = 0;
    enemy(s, { x: 440, hp: 1, stunnedUntil: 99 });
    const t = tick(s, STEP);
    expect(t.enemies).toEqual([]);
    expect(t.feats).toEqual([{ kind: 'kill', by: 'a', at: 0 }]);
  });

  it('a Frag Grenade thrown is its thrower’s', () => {
    const s = fight();
    s.taken.push('frag-grenades');
    s.nextFragAt = 0;
    enemy(s, {
      x: s.defenders[0]!.x + 150,
      y: s.defenders[0]!.y,
      hp: 999,
      maxHp: 999,
      stunnedUntil: 99,
    });
    const t = tick(s, STEP);
    expect(t.grenades).toHaveLength(1);
    expect(t.feats).toContainEqual({ kind: 'throw', by: 'a', at: 0 });
  });
});
