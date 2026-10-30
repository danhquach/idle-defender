// Design §3 and §6: the loadout decides the profession. Everyone shoots; a blade or
// tool comes out only when an enemy is in reach, and never from a tower.
import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, newBase, type Base, type BasePost } from './base.ts';
import { chooseCard, rollOffer } from './cards.ts';
import {
  ENGINEER_BUFF,
  SEGMENT_HEIGHT,
  SEGMENTS,
  START_BASE,
  STEP,
  WALK_SPEED,
  WEAPONS,
  type Stock,
  type WeaponId,
} from './data.ts';
import {
  engineerBuff,
  newHorde,
  standing,
  tick,
  type Card,
  type DefenderSpec,
  type HordeState,
} from './horde.ts';
import { loadoutFrom, type Loadout } from './loadout.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';

/** The starting gate's row, and the `y` of its middle. */
const GATE = START_BASE.gate;
const GATE_Y = (GATE + 0.5) * SEGMENT_HEIGHT;

const RICH: Stock = { scrap: 9999, wood: 9999, metal: 9999, concrete: 9999 };

/** The starting base plus `extra` posts. Posts sort by (column, kind, row). */
function baseWith(...extra: BasePost[]): Base {
  let base = newBase();
  let stock = RICH;
  for (const post of extra) {
    const r = buildPost(base, stock, post);
    if (!r.ok) throw new Error(r.reason);
    ({ base, stock } = r);
  }
  return base;
}

/** `id` carrying what `weapon` gave before loadouts: a pistol, plus a knife or toolkit. */
const spec = (id: string, weapon: WeaponId): DefenderSpec => ({
  id,
  name: id,
  loadout: loadoutFrom(weapon),
});
const shielded = (id: string): DefenderSpec => ({
  id,
  name: id,
  loadout: { primary: 'pistol', secondary: 'knife', item: 'shield' } satisfies Loadout,
});

/**
 * A horde on `base` with no spawns left and nobody on a post; `place` then puts each
 * defender on the post of that kind and row, ready to act.
 */
function fight(base: Base, ...place: [DefenderSpec, BasePost['kind'], number][]): HordeState {
  const s = newHorde(1, { ...setup(), base });
  s.toSpawn = 0;
  s.defenders = [];
  s.bench = [];
  for (const p of s.posts) p.defenderId = null;
  for (const [d, kind, row] of place) {
    const post = s.posts.find((p) => p.kind === kind && p.row === row)!;
    post.defenderId = d.id;
    s.defenders.push(standing(d, post, 0));
  }
  return s;
}

const tough = { hp: 1000, maxHp: 1000 };
/** Shot times in `s`'s trail not yet in `seen`, added to it. */
function newShots(s: HordeState, seen: Set<number>): number[] {
  const fresh = s.shots.map((x) => x.at).filter((at) => !seen.has(at));
  for (const at of fresh) seen.add(at);
  return fresh;
}

describe('Ripper (pistol + knife)', () => {
  const base = baseWith(
    { kind: 'wall-walk', column: 0, row: GATE },
    { kind: 'ground', column: 0, row: GATE },
  );

  it('strikes an enemy hitting the wall in front of their wall-walk post', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', GATE]);
    enemy(s, { ...tough, x: 520, y: GATE_Y });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(990);
    expect(after.shots).toEqual([expect.objectContaining({ melee: true })]);
  });

  it('reaches 50 px from the post; past that they shoot their pistol instead', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', GATE]);
    // The post is at (510, 440): 10 px in x, so 48 px in y is in reach and 50 is not.
    enemy(s, { ...tough, x: 520, y: GATE_Y + 50 });
    const shot = tick(s, STEP);
    expect(shot.enemies[0]!.hp).toBe(1000 - WEAPONS.pistol.damage);
    expect(shot.shots).toEqual([expect.objectContaining({ melee: false })]);
    s.enemies[0]!.y = GATE_Y + 48;
    expect(tick(s, STEP).enemies[0]!.hp).toBe(990);
  });

  it('on a tower, shoots even an enemy in the camp beside them', () => {
    const s = fight(base, [spec('j', 'knife'), 'tower', 4]);
    enemy(s, { ...tough, x: 430, y: 360, inCamp: true });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(1000 - WEAPONS.pistol.damage);
    expect(after.shots).toEqual([expect.objectContaining({ melee: false })]);
  });

  it('fights an enemy that broke through, from a ground post', () => {
    const s = fight(base, [spec('j', 'knife'), 'ground', GATE]);
    enemy(s, { ...tough, x: 370, y: GATE_Y, inCamp: true });
    expect(tick(s, STEP).enemies[0]!.hp).toBe(990);
  });

  it('cards: damage and rate count on a strike, Long Sight leaves the reach alone', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', GATE]);
    s.mods = { damage: 1.2, fireRate: 1.25, range: 1.15 };
    enemy(s, { ...tough, x: 520, y: GATE_Y });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(988);
    expect(after.defenders[0]!.nextShotAt).toBeCloseTo(0.5 / 1.25);
    s.enemies[0]!.y = GATE_Y + 50;
    expect(tick(s, STEP).shots).toEqual([expect.objectContaining({ melee: false })]);
  });

  it('a walking Ripper never strikes, but their pistol fires on the move', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', GATE]);
    s.defenders[0]!.walking = true;
    s.defenders[0]!.x = 600; // far from the post: still on the way
    enemy(s, { ...tough, x: 520, y: GATE_Y });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(1000 - WEAPONS.pistol.damage);
    expect(after.shots).toEqual([expect.objectContaining({ melee: false })]);
  });

  it('reloads the pistol at the plain speed', () => {
    const s = fight(newBase(), [spec('j', 'knife'), 'tower', 4]);
    s.defenders[0]!.ammo.primary = 1;
    enemy(s, { ...tough, x: 900, y: 360 });
    const after = tick(s, STEP);
    expect(after.defenders[0]!.ammo.primary).toBe(0);
    expect(after.defenders[0]!.reloadedAt.primary).toBeCloseTo(WEAPONS.pistol.reload);
    expect(after.defenders[0]!.nextShotAt).toBeCloseTo(WEAPONS.pistol.fireInterval);
  });
});

describe('Gunner (pistol)', () => {
  it('fires 15% faster', () => {
    const s = fight(newBase(), [spec('g', 'pistol'), 'tower', 4]);
    enemy(s, { ...tough, x: 900, y: 360 });
    const g = tick(s, STEP).defenders[0]!;
    expect(g.nextShotAt).toBeCloseTo(0.6 / 1.15);
  });

  it('starts with a full magazine; the last round starts a 25% quicker reload', () => {
    const s = fight(newBase(), [spec('g', 'pistol'), 'tower', 4]);
    expect(s.defenders[0]!.ammo).toEqual({ primary: WEAPONS.pistol.magazine, secondary: 0 });
    s.defenders[0]!.ammo.primary = 1;
    enemy(s, { ...tough, x: 900, y: 360 });
    let t = tick(s, STEP);
    const done = 1.5 * 0.75;
    expect(t.defenders[0]!.ammo.primary).toBe(0);
    expect(t.defenders[0]!.reloadedAt.primary).toBeCloseTo(done);
    // No shot until the reload ends, then a full magazine and a shot that same step.
    const seen = new Set<number>([0]);
    let next: number | undefined;
    while (next === undefined && t.time < 3) {
      t = tick(t, STEP);
      next = newShots(t, seen)[0];
    }
    expect(next).toBeGreaterThanOrEqual(done - 1e-9);
    expect(next).toBeLessThan(done + STEP);
    expect(t.defenders[0]!.ammo.primary).toBe(WEAPONS.pistol.magazine - 1);
  });

  it('fires the pistol on the move, at ground-post range from where they are', () => {
    const s = fight(newBase(), [spec('g', 'pistol'), 'tower', 4]);
    const g = s.defenders[0]!;
    g.walking = true;
    g.x = 300;
    g.y = 300;
    enemy(s, { ...tough, x: 300 + 440, y: 300 }); // ground range 450
    const after = tick(s, STEP);
    expect(after.shots).toEqual([expect.objectContaining({ melee: false })]);
    expect(after.shots[0]!.fromX).toBe(after.defenders[0]!.x);
    s.enemies[0]!.x = 300 + 460;
    expect(tick(s, STEP).shots).toEqual([]);
  });
});

describe('Engineer (pistol + toolkit)', () => {
  const base = baseWith({ kind: 'wall-walk', column: 0, row: GATE });

  it('strikes weakly with the toolkit up close, with no stat bonus', () => {
    const s = fight(base, [
      { ...spec('e', 'toolkit'), stats: { aim: 0, might: 30, tech: 30, grit: 0 } },
      'wall-walk',
      GATE,
    ]);
    enemy(s, { ...tough, x: 520, y: GATE_Y });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(1000 - WEAPONS.toolkit.damage);
    expect(after.shots).toEqual([expect.objectContaining({ melee: true })]);
  });

  it('shoots their pistol at range, plain (no Gunner handling)', () => {
    const s = fight(newBase(), [spec('e', 'toolkit'), 'tower', 4]);
    enemy(s, { ...tough, x: 900, y: 360 });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(1000 - WEAPONS.pistol.damage);
    expect(after.shots).toEqual([expect.objectContaining({ melee: false })]);
    expect(after.defenders[0]!.nextShotAt).toBeCloseTo(WEAPONS.pistol.fireInterval);
  });

  /**
   * An Engineer on the lower tower (row 6): their reach is layer 0, rows 5–7. `hp` sets
   * rows 3–7 (the gate is row 5); the other rows stay at a full 200.
   */
  function repairing(hp: number[]): HordeState {
    const s = fight(newBase(), [spec('e', 'toolkit'), 'tower', 6]);
    const rows = [200, 200, 200, ...hp, ...Array.from({ length: SEGMENTS - 8 }, () => 200)];
    s.layers[0]!.segments.forEach((seg, i) => (seg.hp = rows[i]!));
    return s;
  }
  const hps = (s: HordeState) => s.layers[0]!.segments.map((g) => g.hp);

  it('repairs the most damaged segment within one row, 3 HP/s', () => {
    // Max HP: walls 200, the gate (row 5) 150. Row 3 is out of reach.
    const s = repairing([10, 200, 100, 140, 199]);
    const after = hps(tick(s, 1));
    expect(after[3]).toBe(10);
    expect(after[5]).toBeCloseTo(103);
    expect(after.slice(6, 8)).toEqual([140, 199]);
  });

  it('ties go to the lower row; never above max HP', () => {
    const s = repairing([200, 200, 150, 199.95, 199.95]);
    const after = hps(tick(s, STEP));
    expect(after[6]).toBe(200);
    expect(after[7]).toBe(199.95);
  });

  it('leaves a broken segment for build mode', () => {
    const s = repairing([200, 200, 0, 200, 200]);
    expect(hps(tick(s, 1))[5]).toBe(0);
  });

  it('a walking Engineer repairs nothing', () => {
    const s = repairing([200, 200, 100, 200, 200]);
    s.defenders[0]!.walking = true;
    s.defenders[0]!.x = 0;
    expect(hps(tick(s, STEP))[5]).toBe(100);
  });

  describe('from each post kind, only their own layer', () => {
    /** Layers at columns 0 and 1, all wood walls; posts in column 1 at row 2. */
    function twoLayers(): Base {
      let base = newBase();
      let stock = RICH;
      for (let row = 0; row < SEGMENTS; row++) {
        const r = buildSegment(base, stock, ['wood'], 1, row, 'wall', 'wood');
        if (!r.ok) throw new Error(r.reason);
        ({ base, stock } = r);
      }
      for (const kind of ['tower', 'wall-walk', 'ground'] as const) {
        const r = buildPost(base, stock, { kind, column: 1, row: 2 });
        if (!r.ok) throw new Error(r.reason);
        ({ base, stock } = r);
      }
      return base;
    }

    it.each(['tower', 'wall-walk', 'ground'] as const)('from a %s in column 1', (kind) => {
      const s = fight(twoLayers(), [spec('e', 'toolkit'), kind, 2]);
      // Pin the post: the starting towers are column 0, rows 4 and 6.
      expect(s.posts[s.defenders[0]!.postId]).toMatchObject({ kind, column: 1, row: 2 });
      for (const l of s.layers) l.segments[2]!.hp = 100;
      const after = tick(s, 1);
      expect(after.layers.map((l) => l.column)).toEqual([0, 1]);
      expect(after.layers[0]!.segments[2]!.hp).toBe(100);
      expect(after.layers[1]!.segments[2]!.hp).toBeCloseTo(103);
    });
  });

  describe('buff', () => {
    /** A Gunner on the upper tower (420, 360) and an Engineer `dy` px below. */
    function pair(dy: number, walking = false): HordeState {
      const s = fight(
        newBase(),
        [spec('g', 'pistol'), 'tower', 4],
        [spec('e', 'toolkit'), 'tower', 6],
      );
      const e = s.defenders[1]!;
      e.y = 360 + dy;
      e.walking = walking;
      return s;
    }

    it('speeds up a defender within 100 px, not one further', () => {
      expect(engineerBuff(pair(100), pair(100).defenders[0]!)).toBe(1 + ENGINEER_BUFF);
      expect(engineerBuff(pair(100.5), pair(100.5).defenders[0]!)).toBe(1);
    });

    it('shows in the fire rate, on top of the Gunner handling', () => {
      const s = pair(80);
      enemy(s, { ...tough, x: 900, y: 360 });
      const g = tick(s, STEP).defenders.find((d) => d.id === 'g')!;
      expect(g.nextShotAt).toBeCloseTo(0.6 / (1 + ENGINEER_BUFF) / 1.15);
    });

    it("doesn't stack, skips the Engineer, and needs them standing", () => {
      const s = pair(80);
      s.defenders.push({ ...standing(spec('f', 'toolkit'), s.posts[0]!, 0), y: 400 });
      expect(engineerBuff(s, s.defenders[0]!)).toBe(1 + ENGINEER_BUFF);
      const lone = pair(1000);
      expect(engineerBuff(lone, lone.defenders[1]!)).toBe(1);
      const walking = pair(80, true);
      expect(engineerBuff(walking, walking.defenders[0]!)).toBe(1);
    });

    it('two Engineers side by side speed each other up', () => {
      const s = fight(
        newBase(),
        [spec('e', 'toolkit'), 'tower', 4],
        [spec('f', 'toolkit'), 'tower', 6],
      );
      s.defenders[1]!.y = 440;
      for (const d of s.defenders) expect(engineerBuff(s, d)).toBe(1 + ENGINEER_BUFF);
    });
  });
});

describe('shield (Ripper only)', () => {
  it('takes 30% less damage from an enemy in the camp', () => {
    const hit = (d: DefenderSpec): number => {
      const s = fight(newBase(), [d, 'tower', 4]);
      enemy(s, { ...tough, x: 430, y: 360, inCamp: true });
      return 100 - tick(s, STEP).defenders[0]!.hp;
    };
    expect(hit(spec('j', 'knife'))).toBe(5);
    expect(hit(shielded('j'))).toBeCloseTo(3.5);
  });

  it('slows the holder: their gun fires 20% slower, they walk 20% slower', () => {
    const s = fight(newBase(), [shielded('j'), 'tower', 4]);
    enemy(s, { ...tough, x: 900, y: 360 });
    expect(tick(s, STEP).defenders[0]!.nextShotAt).toBeCloseTo(0.6 / 0.8);
    const w = fight(newBase(), [shielded('j'), 'tower', 4]);
    w.defenders[0]!.walking = true;
    w.defenders[0]!.x = 0;
    expect(tick(w, STEP).defenders[0]!.x).toBeCloseTo(WALK_SPEED * 0.8 * STEP);
  });
});

describe('recruits', () => {
  const recruitCards = (s: HordeState): Card[] =>
    Array.from({ length: 200 }, (_, seed) => rollOffer(createRng(seed), s)).flat();

  it('offers anyone while a post is free, towers included', () => {
    const s = fight(newBase(), [spec('g', 'pistol'), 'tower', 4]);
    s.bench = [spec('j', 'knife'), spec('e', 'toolkit')];
    const offered = recruitCards(s).flatMap((c) => (c.kind === 'recruit' ? [c.defender.id] : []));
    expect(new Set(offered)).toEqual(new Set(['j', 'e']));
  });

  it('a Ripper goes to the post furthest forward, a tower too', () => {
    const base = baseWith({ kind: 'ground', column: 0, row: 4 });
    const s = fight(base, [spec('g', 'pistol'), 'tower', 4]);
    s.bench = [spec('j', 'knife')];
    s.offer = [
      { kind: 'recruit', defender: spec('j', 'knife') },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const after = chooseCard(s, 0);
    expect(after.posts.find((p) => p.defenderId === 'j')).toMatchObject({ kind: 'tower', row: 6 });
  });
});
