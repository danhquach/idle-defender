// Design §3 and §6: the weapon decides the profession, and each post kind suits some
// professions better than others.
import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, newBase, type Base, type BasePost } from './base.ts';
import { chooseCard, rollOffer } from './cards.ts';
import { ENGINEER_BUFF, STEP, WEAPONS, type Stock, type WeaponId } from './data.ts';
import {
  canWork,
  defenderRange,
  engineerBuff,
  newHorde,
  standing,
  tick,
  type Card,
  type DefenderSpec,
  type HordeState,
} from './horde.ts';
import { createRng } from './rng.ts';
import { enemy, setup } from './testing.ts';

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

const spec = (id: string, weapon: WeaponId): DefenderSpec => ({ id, name: id, weapon });

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

describe('canWork', () => {
  it('a Ripper can work anywhere but a tower; guns and toolkits anywhere', () => {
    for (const kind of ['tower', 'wall-walk', 'ground'] as const) {
      expect(canWork('pistol', { kind })).toBe(true);
      expect(canWork('toolkit', { kind })).toBe(true);
      expect(canWork('knife', { kind })).toBe(kind !== 'tower');
    }
  });

  it('every weapon names its profession', () => {
    expect(Object.entries(WEAPONS).map(([id, w]) => [id, w.profession])).toEqual([
      ['pistol', 'gunner'],
      ['knife', 'ripper'],
      ['toolkit', 'engineer'],
    ]);
  });
});

describe('Ripper', () => {
  const base = baseWith(
    { kind: 'wall-walk', column: 0, row: 2 },
    { kind: 'ground', column: 0, row: 2 },
  );

  it('strikes an enemy hitting the wall in front of their wall-walk post', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', 2]);
    enemy(s, { ...tough, x: 520, y: 200 });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(990);
    expect(after.shots).toEqual([expect.objectContaining({ melee: true })]);
  });

  it('reaches 50 px from the post, no further', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', 2]);
    // The post is at (510, 200): 10 px in x, so 48 px in y is in reach and 50 is not.
    enemy(s, { ...tough, x: 520, y: 250 });
    expect(tick(s, STEP).enemies[0]!.hp).toBe(1000);
    s.enemies[0]!.y = 248;
    expect(tick(s, STEP).enemies[0]!.hp).toBe(990);
  });

  it('never strikes from a tower, even an enemy in the camp beside them', () => {
    const s = fight(base, [spec('j', 'knife'), 'tower', 1]);
    enemy(s, { ...tough, x: 430, y: 120, inCamp: true });
    const after = tick(s, 2);
    expect(after.enemies[0]!.hp).toBe(1000);
    expect(after.shots).toEqual([]);
    expect(defenderRange(s, s.posts[1]!, s.defenders[0]!)).toBe(0);
  });

  it('fights an enemy that broke through, from a ground post', () => {
    const s = fight(base, [spec('j', 'knife'), 'ground', 2]);
    enemy(s, { ...tough, x: 370, y: 200, inCamp: true });
    expect(tick(s, STEP).enemies[0]!.hp).toBe(990);
  });

  it('cards: damage and rate count, Long Sight leaves the reach alone', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', 2]);
    s.mods = { damage: 1.2, fireRate: 1.25, range: 1.15 };
    expect(defenderRange(s, s.posts[3]!, s.defenders[0]!)).toBe(50);
    enemy(s, { ...tough, x: 520, y: 200 });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(988);
    expect(after.defenders[0]!.nextShotAt).toBeCloseTo(0.5 / 1.25);
  });

  it('a walking Ripper never strikes', () => {
    const s = fight(base, [spec('j', 'knife'), 'wall-walk', 2]);
    s.defenders[0]!.walking = true;
    s.defenders[0]!.x = 600; // far from the post: still on the way
    enemy(s, { ...tough, x: 520, y: 200 });
    expect(tick(s, STEP).enemies[0]!.hp).toBe(1000);
  });
});

describe('Engineer', () => {
  it('shoots, weaker than a Gunner: less damage and range, gun post multipliers', () => {
    const s = fight(newBase(), [spec('e', 'toolkit'), 'tower', 1]);
    expect(defenderRange(s, s.posts[0]!, s.defenders[0]!)).toBe(450 * 1.25);
    enemy(s, { ...tough, x: 900, y: 120 });
    const after = tick(s, STEP);
    expect(after.enemies[0]!.hp).toBe(996);
    expect(after.shots).toEqual([expect.objectContaining({ melee: false })]);
    const pistol = WEAPONS.pistol;
    const toolkit = WEAPONS.toolkit;
    expect(toolkit.damage / toolkit.fireInterval).toBeLessThan(pistol.damage / pistol.fireInterval);
    expect(toolkit.range).toBeLessThan(pistol.range);
  });

  /** An Engineer on the lower tower (row 3): their reach is layer 0, rows 2–4. */
  function repairing(hp: number[]): HordeState {
    const s = fight(newBase(), [spec('e', 'toolkit'), 'tower', 3]);
    s.layers[0]!.segments.forEach((seg, i) => (seg.hp = hp[i]!));
    return s;
  }
  const hps = (s: HordeState) => s.layers[0]!.segments.map((g) => g.hp);

  it('repairs the most damaged segment within one row, 3 HP/s', () => {
    // Max HP: walls 200, the gate (row 2) 150. Row 0 is out of reach.
    const s = repairing([10, 200, 100, 140, 199]);
    const after = hps(tick(s, 1));
    expect(after[0]).toBe(10);
    expect(after[2]).toBeCloseTo(103);
    expect(after.slice(3)).toEqual([140, 199]);
  });

  it('ties go to the lower row; never above max HP', () => {
    const s = repairing([200, 200, 150, 199.95, 199.95]);
    const after = hps(tick(s, STEP));
    expect(after[3]).toBe(200);
    expect(after[4]).toBe(199.95);
  });

  it('leaves a broken segment for build mode', () => {
    const s = repairing([200, 200, 0, 200, 200]);
    expect(hps(tick(s, 1))[2]).toBe(0);
  });

  it('a walking Engineer repairs nothing', () => {
    const s = repairing([200, 200, 100, 200, 200]);
    s.defenders[0]!.walking = true;
    s.defenders[0]!.x = 0;
    expect(hps(tick(s, STEP))[2]).toBe(100);
  });

  describe('from each post kind, only their own layer', () => {
    /** Layers at columns 0 and 1, all wood walls; posts in column 1 at row 2. */
    function twoLayers(): Base {
      let base = newBase();
      let stock = RICH;
      for (let row = 0; row < 5; row++) {
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
      // Pin the post: the starting towers are column 0, rows 1 and 3.
      expect(s.posts[s.defenders[0]!.postId]).toMatchObject({ kind, column: 1, row: 2 });
      for (const l of s.layers) l.segments[2]!.hp = 100;
      const after = tick(s, 1);
      expect(after.layers.map((l) => l.column)).toEqual([0, 1]);
      expect(after.layers[0]!.segments[2]!.hp).toBe(100);
      expect(after.layers[1]!.segments[2]!.hp).toBeCloseTo(103);
    });
  });

  describe('buff', () => {
    /** A Gunner on the upper tower (420, 120) and an Engineer `dy` px below. */
    function pair(dy: number, walking = false): HordeState {
      const s = fight(
        newBase(),
        [spec('g', 'pistol'), 'tower', 1],
        [spec('e', 'toolkit'), 'tower', 3],
      );
      const e = s.defenders[1]!;
      e.y = 120 + dy;
      e.walking = walking;
      return s;
    }

    it('speeds up a defender within 100 px, not one further', () => {
      expect(engineerBuff(pair(100), pair(100).defenders[0]!)).toBe(1 + ENGINEER_BUFF);
      expect(engineerBuff(pair(100.5), pair(100.5).defenders[0]!)).toBe(1);
    });

    it('shows in the fire rate', () => {
      const s = pair(80);
      enemy(s, { ...tough, x: 900, y: 120 });
      const g = tick(s, STEP).defenders.find((d) => d.id === 'g')!;
      expect(g.nextShotAt).toBeCloseTo(0.6 / (1 + ENGINEER_BUFF));
    });

    it("doesn't stack, skips the Engineer, and needs them standing", () => {
      const s = pair(80);
      s.defenders.push({ ...standing(spec('f', 'toolkit'), s.posts[0]!, 0), y: 160 });
      expect(engineerBuff(s, s.defenders[0]!)).toBe(1 + ENGINEER_BUFF);
      const lone = pair(1000);
      expect(engineerBuff(lone, lone.defenders[1]!)).toBe(1);
      const walking = pair(80, true);
      expect(engineerBuff(walking, walking.defenders[0]!)).toBe(1);
    });

    it('two Engineers side by side speed each other up (they shoot too)', () => {
      const s = fight(
        newBase(),
        [spec('e', 'toolkit'), 'tower', 1],
        [spec('f', 'toolkit'), 'tower', 3],
      );
      s.defenders[1]!.y = 200;
      for (const d of s.defenders) expect(engineerBuff(s, d)).toBe(1 + ENGINEER_BUFF);
    });
  });
});

describe('recruits', () => {
  const recruitCards = (s: HordeState): Card[] =>
    Array.from({ length: 200 }, (_, seed) => rollOffer(createRng(seed), s)).flat();

  it('never offers a Ripper with only towers free; offers the others', () => {
    const s = fight(newBase(), [spec('g', 'pistol'), 'tower', 1]);
    s.bench = [spec('j', 'knife')];
    expect(recruitCards(s).some((c) => c.kind === 'recruit')).toBe(false);
    s.bench = [spec('j', 'knife'), spec('e', 'toolkit')];
    const offered = recruitCards(s).flatMap((c) => (c.kind === 'recruit' ? [c.defender.id] : []));
    expect(new Set(offered)).toEqual(new Set(['e']));
  });

  it('a Ripper goes to the post furthest forward they can work from', () => {
    const base = baseWith({ kind: 'ground', column: 0, row: 4 });
    const s = fight(base, [spec('g', 'pistol'), 'tower', 1]);
    s.bench = [spec('j', 'knife')];
    s.offer = [
      { kind: 'recruit', defender: spec('j', 'knife') },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const after = chooseCard(s, 0);
    // The free tower is further forward, but a Ripper can't reach from it.
    expect(after.posts.find((p) => p.defenderId === 'j')).toMatchObject({ kind: 'ground', row: 4 });
  });
});
