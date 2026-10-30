import { describe, expect, it } from 'vitest';
import { chooseCard, rollOffer } from './cards.ts';
import { buildPost, buildSegment, newBase, type Result } from './base.ts';
import { STEP, type Stock } from './data.ts';
import { newHorde, tick, type Card, type HordeState } from './horde.ts';
import { createRng } from './rng.ts';
import { enemy, landed, setup } from './testing.ts';

function offers(s: HordeState): Card[][] {
  return Array.from({ length: 200 }, (_, seed) => rollOffer(createRng(seed), s));
}

const RICH: Stock = { scrap: 999, wood: 999, metal: 999, concrete: 999 };
const recruits = (offer: Card[]) => offer.filter((c) => c.kind === 'recruit').length;

describe('cards', () => {
  it('a level-up opens an offer of 3 and pauses', () => {
    const s = newHorde(1, setup());
    s.xp = 9;
    enemy(s, { hp: 1, x: 600, y: 120 });
    const open = landed(tick(s, STEP));
    expect(open.level).toBe(2);
    expect(open.offer).toHaveLength(3);
    expect(tick(open, 5)).toEqual(open);
  });

  it('upgrades in one offer are distinct', () => {
    for (const offer of offers(newHorde(1, setup()))) {
      const ids = offer.flatMap((c) => (c.kind === 'upgrade' ? [c.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
      expect(offer).toHaveLength(3);
    }
  });

  it('offers no recruit without a free post or bench', () => {
    const full = newHorde(1, setup());
    full.posts[1]!.defenderId = 'b';
    expect(offers(full).every((o) => recruits(o) === 0)).toBe(true);

    const noBench = newHorde(1, setup());
    noBench.bench = [];
    expect(offers(noBench).every((o) => recruits(o) === 0)).toBe(true);
  });

  it('offers at most one recruit', () => {
    const all = offers(newHorde(1, setup()));
    expect(all.some((o) => recruits(o) === 1)).toBe(true);
    expect(all.every((o) => recruits(o) <= 1)).toBe(true);
  });

  it('recruit takes the free post', () => {
    const s = newHorde(1, setup());
    const b = s.bench[0]!;
    s.offer = [
      { kind: 'recruit', defender: b },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    const after = chooseCard(s, 0);
    expect(after.posts[1]?.defenderId).toBe('b');
    expect(after.bench.map((d) => d.id)).toEqual(['c']);
    expect(after.defenders.map((d) => d.id)).toEqual(['a', 'b']);
    expect(after.offer).toBeNull();
  });

  it('Patch Up and Reinforce leave an unbuilt slot open', () => {
    const base = newBase();
    base.layers[0]!.slots[4] = null;
    const s = newHorde(1, { ...setup(), base });
    s.offer = [
      { kind: 'upgrade', id: 'reinforce' },
      { kind: 'upgrade', id: 'patch-up' },
      { kind: 'upgrade', id: 'sharpshooter' },
    ];
    let after = chooseCard(s, 0);
    after.offer = s.offer;
    after = chooseCard(after, 1);
    expect(after.layers[0]!.segments[4]).toMatchObject({ kind: null, hp: 0, maxHp: 0 });
    expect(after.layers[0]!.segments[0]).toMatchObject({ hp: 250, maxHp: 250 });
  });

  it('recruit takes the free post furthest forward', () => {
    let r: Result = buildPost(newBase(), RICH, { kind: 'ground', column: 0, row: 0 });
    if (!r.ok) throw new Error(r.reason);
    r = buildSegment(r.base, r.stock, ['wood'], 1, 0, 'wall', 'wood');
    if (!r.ok) throw new Error(r.reason);
    r = buildPost(r.base, r.stock, { kind: 'tower', column: 1, row: 4 });
    if (!r.ok) throw new Error(r.reason);
    const s = newHorde(1, { ...setup(), base: r.base, startPostId: 1 });
    expect(s.posts.map((p) => [p.kind, p.x])).toEqual([
      ['ground', 340],
      ['tower', 420],
      ['tower', 420],
      ['tower', 680],
    ]);
    s.offer = [
      { kind: 'recruit', defender: s.bench[0]! },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    expect(chooseCard(s, 0).posts[3]?.defenderId).toBe('b');
  });

  it('recruit skips a wall-walk post over a broken segment', () => {
    const r = buildPost(newBase(), RICH, { kind: 'wall-walk', column: 0, row: 0 });
    if (!r.ok) throw new Error(r.reason);
    const s = newHorde(1, { ...setup(), base: r.base });
    const walk = s.posts.findIndex((p) => p.kind === 'wall-walk');
    s.posts[1]!.defenderId = 'x';
    s.layers[0]!.segments[0]!.hp = 0;
    expect(offers(s).every((o) => recruits(o) === 0)).toBe(true);
    s.layers[0]!.segments[0]!.hp = 1;
    expect(offers(s).some((o) => recruits(o) === 1)).toBe(true);
    s.offer = [
      { kind: 'recruit', defender: s.bench[0]! },
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
    ];
    expect(chooseCard(s, 0).posts[walk]?.defenderId).toBe('b');
  });

  it('applies each upgrade', () => {
    const pickUpgrade = (id: Card & { kind: 'upgrade' }, edit?: (s: HordeState) => void) => {
      const s = newHorde(1, setup());
      edit?.(s);
      s.offer = [id, id, id];
      return chooseCard(s, 0);
    };
    expect(pickUpgrade({ kind: 'upgrade', id: 'sharpshooter' }).mods.damage).toBe(1.2);
    expect(pickUpgrade({ kind: 'upgrade', id: 'rapid-fire' }).mods.fireRate).toBe(1.15);
    expect(pickUpgrade({ kind: 'upgrade', id: 'long-sight' }).mods.range).toBe(1.15);
    const patched = pickUpgrade({ kind: 'upgrade', id: 'patch-up' }, (s) => {
      s.layers[0]!.segments[0]!.hp = 0;
    });
    expect(patched.layers[0]?.segments[0]?.hp).toBe(60);
    expect(patched.layers[0]?.segments[1]?.hp).toBe(200);
    const reinforced = pickUpgrade({ kind: 'upgrade', id: 'reinforce' });
    expect(reinforced.layers[0]?.segments[0]).toMatchObject({ maxHp: 250, hp: 250 });
  });

  it('queues a second level-up', () => {
    const s = newHorde(1, setup());
    s.xp = 23;
    // Point-blank, so the bullet lands this step, before the first level-up pauses the fight.
    enemy(s, { hp: 1, x: 440, y: 360 });
    const first = tick(s, STEP);
    expect(first.level).toBe(2);
    expect(first.xp).toBe(14);
    expect(first.offer).not.toBeNull();
    const second = chooseCard(first, 0);
    expect(second.offer).toHaveLength(3);
    expect(second.level).toBe(3);
    expect(second.xp).toBe(0);
  });

  it.each([3, -1, 0.5, NaN])('rejects card index %s and leaves state untouched', (index) => {
    const s = newHorde(1, setup());
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'reinforce' },
      { kind: 'upgrade', id: 'patch-up' },
    ];
    const before = structuredClone(s);
    expect(() => chooseCard(s, index)).toThrow(RangeError);
    expect(s).toEqual(before);
  });

  it('rejects a choice with no offer open', () => {
    expect(() => chooseCard(newHorde(1, setup()), 0)).toThrow(RangeError);
  });

  it('rejects a recruit with nowhere to go', () => {
    const s = newHorde(1, setup());
    s.posts[1]!.defenderId = 'c';
    s.offer = [
      { kind: 'recruit', defender: s.bench[0]! },
      { kind: 'upgrade', id: 'reinforce' },
      { kind: 'upgrade', id: 'patch-up' },
    ];
    const before = structuredClone(s);
    expect(() => chooseCard(s, 0)).toThrow(RangeError);
    expect(s).toEqual(before);
  });
});
