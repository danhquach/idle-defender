// ID-091: three stash guns of one base weapon and one rarity combine into one of the next
// rarity, with fresh seeded affixes; held guns, the pistol, mixed sets and Relic are refused.
import { describe, expect, it } from 'vitest';
import { affixCount, gunPower, type OwnedWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { AFFIXES, COMBINE_COUNT, RARITY_ORDER, STASH_CAP, WEAPONS, type Rarity } from './data.ts';
import { newGame, type GameState } from './game.ts';
import { combineGuns, combineSets, nextRarity } from './hordeonly.ts';

/** A `rarity` `base` weapon, uid `uid`, with `affixes`. */
const gun = (
  uid: string,
  base: keyof typeof WEAPONS,
  rarity: Rarity,
  affixes: OwnedWeapon['affixes'] = [],
): OwnedWeapon => ({ uid, base, rarity, affixes });

/** A horde-only game at Horde 9 with two survivors and `stash` in the stash. */
function game(stash: OwnedWeapon[]): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 9,
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    armoury: stash,
  };
}

const rustySmgs = (): OwnedWeapon[] => [
  gun('h1', 'smg', 'rusty'),
  gun('h2', 'smg', 'rusty'),
  gun('h3', 'smg', 'rusty'),
];

describe('nextRarity', () => {
  it('steps Rusty → Common → Military → Prototype → Relic, and Relic goes no further', () => {
    expect(RARITY_ORDER.map(nextRarity)).toEqual([
      'common',
      'military',
      'prototype',
      'relic',
      null,
    ]);
  });
});

describe('combineGuns', () => {
  it('turns three Rusty SMGs into one Common SMG and uses them up', () => {
    const g = game([...rustySmgs(), gun('h4', 'rifle', 'rusty')]);
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.weapon).toMatchObject({ base: 'smg', rarity: 'common', affixes: [] });
    expect(r.game.armoury.map((w) => w.uid).sort()).toEqual(['h1', 'h4']);
    expect(r.game.armoury.find((w) => w.uid === 'h1')).toBe(r.weapon);
    // The game it came from is untouched.
    expect(g.armoury).toHaveLength(4);
  });

  it('steps each rarity up one, with the new rarity’s affixes, each kind once and in range', () => {
    for (const rarity of RARITY_ORDER.slice(0, -1)) {
      const next = nextRarity(rarity)!;
      const r = combineGuns(
        game([gun('h1', 'lmg', rarity), gun('h2', 'lmg', rarity), gun('h3', 'lmg', rarity)]),
        ['h1', 'h2', 'h3'],
      );
      if (!r.ok) throw new Error(r.reason);
      expect(r.weapon.rarity).toBe(next);
      expect(r.weapon.affixes).toHaveLength(affixCount('lmg', next));
      expect(new Set(r.weapon.affixes.map((a) => a.id)).size).toBe(r.weapon.affixes.length);
      for (const a of r.weapon.affixes) {
        expect(a.value).toBeGreaterThanOrEqual(AFFIXES[a.id].min);
        expect(a.value).toBeLessThanOrEqual(AFFIXES[a.id].max);
      }
    }
  });

  it('rolls the same gun from the same save and picks, whatever order they come in', () => {
    const stash = [
      gun('h1', 'rifle', 'military', [{ id: 'damage', value: 9 }]),
      gun('h2', 'rifle', 'military', [{ id: 'reload', value: 12 }]),
      gun('p3-1', 'rifle', 'military', [{ id: 'pierce', value: 1 }]),
    ];
    const a = combineGuns(game(stash), ['h1', 'h2', 'p3-1']);
    const b = combineGuns(game(structuredClone(stash)), ['p3-1', 'h1', 'h2']);
    if (!a.ok || !b.ok) throw new Error('refused');
    expect(b.weapon).toEqual(a.weapon);
    expect(a.weapon.rarity).toBe('prototype');
    expect(a.weapon.affixes).toHaveLength(2);
  });

  it('rolls differently from other inputs (the affixes come from the RNG, not one fixed roll)', () => {
    const rolls = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const uids = [`h${3 * k + 1}`, `h${3 * k + 2}`, `h${3 * k + 3}`];
      const r = combineGuns(game(uids.map((u) => gun(u, 'shotgun', 'common'))), uids);
      if (!r.ok) throw new Error(r.reason);
      rolls.add(JSON.stringify(r.weapon.affixes));
    }
    expect(rolls.size).toBeGreaterThan(1);
  });

  it('always frees two stash slots, so a full stash never refuses it', () => {
    const full = [
      ...rustySmgs(),
      ...Array.from({ length: STASH_CAP - 3 }, (_, i) => gun(`p1-${i}`, 'rifle', 'common')),
    ];
    expect(full).toHaveLength(STASH_CAP);
    const r = combineGuns(game(full), ['h1', 'h2', 'h3']);
    expect(r.ok && r.game.armoury.length).toBe(STASH_CAP - COMBINE_COUNT + 1);
  });

  it('refuses mixed base weapons', () => {
    const g = game([
      gun('h1', 'smg', 'rusty'),
      gun('h2', 'smg', 'rusty'),
      gun('h3', 'rifle', 'rusty'),
    ]);
    expect(combineGuns(g, ['h1', 'h2', 'h3'])).toEqual({
      ok: false,
      reason: 'Combining takes guns of one kind',
    });
  });

  it('refuses mixed rarities', () => {
    const g = game([
      gun('h1', 'smg', 'rusty'),
      gun('h2', 'smg', 'rusty'),
      gun('h3', 'smg', 'common'),
    ]);
    expect(combineGuns(g, ['h1', 'h2', 'h3'])).toEqual({
      ok: false,
      reason: 'Combining takes guns of one rarity',
    });
  });

  it('refuses Relic guns', () => {
    const relic = (uid: string): OwnedWeapon =>
      gun(uid, 'smg', 'relic', [
        { id: 'damage', value: 10 },
        { id: 'fireRate', value: 10 },
        { id: 'magazine', value: 30 },
      ]);
    const r = combineGuns(game([relic('h1'), relic('h2'), relic('h3')]), ['h1', 'h2', 'h3']);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Relic/);
  });

  it('refuses a gun a survivor holds, naming them', () => {
    const g = game(rustySmgs().slice(0, 2));
    g.roster[0]!.loadout.primary = gun('h3', 'smg', 'rusty');
    const r = combineGuns(g, ['h1', 'h2', 'h3']);
    expect(r).toEqual({
      ok: false,
      reason: `${g.roster[0]!.name} holds that gun: put it back in the stash first`,
    });
  });

  it('refuses the free pistol', () => {
    const g = game(rustySmgs());
    expect(combineGuns(g, ['h1', 'h2', 'pistol'])).toEqual({
      ok: false,
      reason: 'The free pistol can’t be combined',
    });
  });

  it('refuses the wrong count, a gun twice, and a uid that is nowhere', () => {
    const g = game([...rustySmgs(), gun('h4', 'smg', 'rusty')]);
    for (const uids of [['h1', 'h2'], ['h1', 'h2', 'h3', 'h4'], ['h1', 'h1', 'h2'], []]) {
      expect(combineGuns(g, uids)).toEqual({
        ok: false,
        reason: `Combining takes ${COMBINE_COUNT} different guns`,
      });
    }
    expect(combineGuns(g, ['h1', 'h2', 'h99'])).toEqual({
      ok: false,
      reason: 'That gun is not in the stash',
    });
  });

  it('refuses a blade or tool an older save left in the stash', () => {
    const g = game([
      gun('h1', 'knife', 'rusty'),
      gun('h2', 'knife', 'rusty'),
      gun('h3', 'knife', 'rusty'),
    ]);
    expect(combineGuns(g, ['h1', 'h2', 'h3'])).toEqual({
      ok: false,
      reason: 'Only guns can be combined',
    });
  });

  it('refuses hostile uids without touching the stash or Object.prototype', () => {
    const g = game(rustySmgs());
    const before = structuredClone(g.armoury);
    const hostile = [
      ['__proto__', 'constructor', 'prototype'],
      ['h1', 'h2', 'x'.repeat(100_000)],
      ['h1', 'h2', 'h3‮'],
      ['h1', 'h2', 'h​3'],
      ['h1', 'h2', '<img src=x onerror=alert(1)>'],
      Array.from({ length: 10_000 }, (_, i) => `h${i}`),
    ];
    for (const uids of hostile) expect(combineGuns(g, uids).ok).toBe(false);
    expect(g.armoury).toEqual(before);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('combineSets', () => {
  it('groups the stash by base weapon and rarity, weakest first, guns only', () => {
    const strong = gun('h2', 'smg', 'rusty');
    const weak = gun('h5', 'smg', 'rusty');
    // Same base and rarity: the affix-free one is weaker than the damage one.
    const g = game([
      gun('h1', 'rifle', 'common'),
      { ...strong, rarity: 'military', affixes: [{ id: 'damage', value: 15 }] },
      { ...weak, rarity: 'military', affixes: [{ id: 'pierce', value: 1 }] },
      gun('h3', 'smg', 'rusty'),
      gun('h4', 'knife', 'rusty'),
    ]);
    const sets = combineSets(g);
    expect(sets.map((s) => [s.base, s.rarity, s.guns.map((w) => w.uid), s.next])).toEqual([
      ['smg', 'rusty', ['h3'], 'common'],
      ['smg', 'military', ['h5', 'h2'], 'prototype'],
      ['rifle', 'common', ['h1'], 'military'],
    ]);
    const [a, b] = sets[1]!.guns;
    expect(gunPower(a!)).toBeLessThan(gunPower(b!));
  });

  it('is empty for an empty stash', () => {
    expect(combineSets(game([]))).toEqual([]);
  });
});
