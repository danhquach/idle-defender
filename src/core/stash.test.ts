// ID-067: every horde-only win drops a gun, seeded from the horde's seed and banded by horde
// number; the stash holds STASH_CAP and throws the weakest away; a survivor's gun is picked
// from the stash between hordes, the old one going back.
import { describe, expect, it } from 'vitest';
import { DROP_GUNS, gunPower, rollWeapon, squadDropWeights, type OwnedWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import { RARITY_ORDER, SQUAD_DROP, STASH_CAP, WEAPONS, type Rarity } from './data.ts';
import { newGame, type GameState } from './game.ts';
import { tick, type HordeState } from './horde.ts';
import {
  bestGuns,
  equipGun,
  finishSquadHorde,
  squadDrop,
  squadResult,
  squadSpec,
  startSquadHorde,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import { answerOffer } from './sim.ts';

const NOW = 1_700_000_000_000;

/** A horde-only game with `n` survivors at Horde `horde` and `stash` in the stash. */
function squadGame(n: number, horde = 1, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}

/** Horde `game.hordeNumber` from `seed`, forced to `outcome`. */
const ended = (game: GameState, outcome: 'won' | 'lost', seed = 1): HordeState => ({
  ...startSquadHorde(game, seed, NOW),
  outcome,
});

/** A `rarity` `base` gun with no affixes rolled, uid `uid`. */
const gun = (uid: string, base: keyof typeof WEAPONS, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});

/** `n` Common SMGs, uids c1…cn, as a stash. */
const smgs = (n: number): OwnedWeapon[] =>
  Array.from({ length: n }, (_, i) => gun(`c${i + 1}`, 'smg', 'common'));

/**
 * The rarities horde `n` dropped over `seeds` replay wins: a replay rolls the band itself,
 * less half its top share (ID-098); a first clear moves it up one rarity (farm.test.ts).
 */
function rarities(n: number, seeds = 400): Set<Rarity> {
  const g = squadGame(1, n + 1);
  const seen = new Set<Rarity>();
  for (let seed = 1; seed <= seeds; seed++) {
    seen.add(squadDrop(g, { ...startSquadHorde(g, seed, NOW, n), outcome: 'won' })!.weapon.rarity);
  }
  return seen;
}

describe('the drop table by horde band (ID-067)', () => {
  it('Hordes 1–3 drop only the two lowest tiers', () => {
    for (const n of [1, 2, 3]) {
      expect(squadDropWeights(n)).toEqual(SQUAD_DROP[0]!.rarity);
      expect([...rarities(n)].sort()).toEqual(['common', 'rusty']);
    }
  });

  it('better tiers come from later hordes: Military from 4, Relic from 7, Rusty gone at 10', () => {
    expect(rarities(4).has('military')).toBe(true);
    expect(rarities(4).has('relic')).toBe(false);
    expect(rarities(7).has('relic')).toBe(true);
    expect(rarities(10).has('rusty')).toBe(false);
    expect(squadDropWeights(50)).toEqual(SQUAD_DROP.at(-1)!.rarity);
  });

  it('every band only ever adds weight at the top: the best tier on offer never falls', () => {
    const best = (w: Record<Rarity, number>) => RARITY_ORDER.findLastIndex((r) => w[r] > 0);
    for (let i = 1; i < SQUAD_DROP.length; i++) {
      expect(SQUAD_DROP[i]!.from).toBeGreaterThan(SQUAD_DROP[i - 1]!.from);
      expect(best(SQUAD_DROP[i]!.rarity)).toBeGreaterThanOrEqual(best(SQUAD_DROP[i - 1]!.rarity));
    }
  });

  it('drops guns only, every gun in reach, duplicates allowed; uid from the horde number', () => {
    const g = squadGame(1, 5);
    const bases = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const { weapon } = squadDrop(g, ended(g, 'won', seed))!;
      expect(weapon.uid).toBe('h5');
      bases.add(weapon.base);
    }
    expect([...bases].sort()).toEqual([...DROP_GUNS].sort());
    expect(DROP_GUNS).not.toContain('pistol');
    expect(DROP_GUNS).not.toContain('knife');
    expect(DROP_GUNS).not.toContain('toolkit');
  });

  it('refuses a horde number no band covers', () => {
    expect(() => squadDropWeights(0)).toThrow(RangeError);
    expect(() => squadDropWeights(1.5)).toThrow(RangeError);
  });
});

describe('seeded from the horde seed (ID-067)', () => {
  it('the same seed drops the same gun, however the fight went', () => {
    const g = squadGame(2, 6);
    const early = ended(g, 'won', 99);
    const later = { ...early, time: 300, rng: { s: 12345 } };
    expect(squadDrop(g, later)).toEqual(squadDrop(g, early));
    // Other seeds drop other guns.
    const others = [100, 101, 102, 103, 104].map((seed) => squadDrop(g, ended(g, 'won', seed)));
    expect(others.some((d) => JSON.stringify(d) !== JSON.stringify(squadDrop(g, early)))).toBe(
      true,
    );
  });

  /** Horde 1 played out as the game loop does at `speed` (ID-062's test, horde-only). */
  function play(speed: number): HordeState {
    let s = startSquadHorde(squadGame(1), 7, NOW);
    for (let frames = 0; s.outcome === 'fighting'; frames++) {
      s = s.offer || s.replace ? answerOffer(s) : tick(s, (1 / 20) * speed);
      if (frames > 100_000) throw new Error('never ended');
    }
    return s;
  }

  it('a replay drops the same weapon at 1×, 2× and 3×', () => {
    const [one, two, three] = [1, 2, 3].map(play);
    expect(one!.outcome).toBe('won');
    const g = squadGame(1);
    const drop = squadDrop(g, one!);
    expect(drop).not.toBeNull();
    for (const run of [two!, three!]) {
      expect({ ...run, acc: 0 }).toEqual({ ...one!, acc: 0 });
      expect(squadDrop(g, run)).toEqual(drop);
      expect(finishSquadHorde(g, run).armoury).toEqual(finishSquadHorde(g, one!).armoury);
    }
  });
});

describe('a win, a loss and the stash (ID-067)', () => {
  it('one weapon per win goes into the stash', () => {
    const g = squadGame(2, 3);
    const won = ended(g, 'won');
    const next = finishSquadHorde(g, won);
    expect(next.armoury).toEqual([squadDrop(g, won)!.weapon]);
    expect(squadResult(g, won).drop).toMatchObject({
      weapon: next.armoury[0],
      thrown: null,
      kind: 'first',
    });
  });

  it('nothing drops after a loss', () => {
    const g = squadGame(2, 3, smgs(2));
    const lost = ended(g, 'lost');
    expect(squadDrop(g, lost)).toBeNull();
    expect(squadResult(g, lost).drop).toBeNull();
    expect(finishSquadHorde(g, lost).armoury).toBe(g.armoury);
  });

  it('at the cap the weakest stash weapon is thrown away for a stronger drop', () => {
    const stash = [...smgs(STASH_CAP - 1), gun('p1', 'pistol', 'rusty')];
    const g = squadGame(1, 9, stash);
    // Find a seed whose drop beats a Rusty Pistol.
    let seed = 1;
    while (gunPower(squadDrop(g, ended(g, 'won', seed))!.weapon) <= gunPower(stash.at(-1)!)) seed++;
    const won = ended(g, 'won', seed);
    const { weapon, thrown } = squadDrop(g, won)!;
    expect(thrown).toEqual(stash.at(-1));
    const next = finishSquadHorde(g, won);
    expect(next.armoury).toHaveLength(STASH_CAP);
    expect(next.armoury.map((w) => w.uid)).not.toContain('p1');
    expect(next.armoury.at(-1)).toEqual(weapon);
  });

  it('at the cap a drop weaker than everything is the one thrown away', () => {
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const g = squadGame(1, 2, stash);
    const won = ended(g, 'won');
    const { weapon, thrown } = squadDrop(g, won)!;
    expect(thrown).toBe(weapon);
    expect(finishSquadHorde(g, won).armoury).toEqual(stash);
  });

  it('a tie throws away the later one, so an equal drop goes and the stash stays', () => {
    const g0 = squadGame(1, 2);
    const drop = squadDrop(g0, ended(g0, 'won'))!.weapon;
    const twin = { ...drop, uid: 'c99' };
    const stash = [
      twin,
      ...Array.from({ length: STASH_CAP - 1 }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic')),
    ];
    const g = squadGame(1, 2, stash);
    expect(squadDrop(g, ended(g, 'won'))!.thrown!.uid).toBe('h2');
  });

  it('a blade or tool an older save left in a full stash is thrown away first', () => {
    const stash = [
      ...Array.from({ length: STASH_CAP - 2 }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic')),
      {
        uid: 'p1-0',
        base: 'knife' as const,
        rarity: 'military' as const,
        affixes: [{ id: 'damage' as const, value: 5 }],
      },
      gun('p2-0', 'toolkit', 'relic'),
    ];
    const g = squadGame(1, 2, stash);
    const won = ended(g, 'won');
    expect(squadDrop(g, won)!.thrown!.uid).toBe('p2-0');
    expect(squadResult(g, won).drop!.thrown!.uid).toBe('p2-0');
    const next = finishSquadHorde(g, won);
    expect(next.armoury).toHaveLength(STASH_CAP);
    expect(next.armoury.map((w) => w.uid)).not.toContain('p2-0');
    // A knife alone among relics: the knife itself goes, not the drop.
    const knifed = squadGame(1, 2, [
      ...stash.slice(0, STASH_CAP - 2),
      gun('c99', 'lmg', 'relic'),
      stash[STASH_CAP - 2]!,
    ]);
    expect(knifed.armoury).toHaveLength(STASH_CAP);
    expect(knifed.armoury.at(-1)!.base).toBe('knife');
    expect(squadDrop(knifed, ended(knifed, 'won'))!.thrown!.base).toBe('knife');
  });

  it('an older stash past the cap never grows: one in, one out', () => {
    const g = squadGame(1, 2, smgs(STASH_CAP + 3));
    expect(finishSquadHorde(g, ended(g, 'won')).armoury).toHaveLength(STASH_CAP + 3);
  });

  it('gunPower is damage per second through a magazine and its reload', () => {
    // Pistol: 6.2 × 10 / (10 × 0.6 + 1.5).
    expect(gunPower('pistol')).toBeCloseTo(62 / 7.5, 9);
    expect(gunPower(gun('a', 'shotgun', 'common'))).toBeCloseTo((4 * 6 * 8) / (8 * 0.75 + 2.5), 9);
    expect(gunPower(gun('a', 'rifle', 'military'))).toBeGreaterThan(
      gunPower(gun('b', 'rifle', 'common')),
    );
    expect(() => gunPower('knife')).toThrow(RangeError);
  });
});

describe('equip and swap (ID-067)', () => {
  const rifle = gun('h1', 'rifle', 'military');
  const sniper = gun('h2', 'sniper', 'common');

  it('every survivor starts with a pistol', () => {
    const g = squadGame(3);
    for (const d of g.roster) expect(d.loadout.primary).toBe('pistol');
  });

  it('a stash gun goes into their hands and out of the stash; they fight with it', () => {
    const g = squadGame(2, 3, [rifle, sniper]);
    const r = equipGun(g, 'recruit-2', 'h1');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster[1]!.loadout.primary).toEqual(rifle);
    expect(r.game.armoury).toEqual([sniper]);
    expect(squadSpec(r.game.roster[1]!).loadout.primary).toEqual(rifle);
    expect(g.armoury).toEqual([rifle, sniper]);
  });

  it('a swap puts the gun they had back in the stash', () => {
    const g = squadGame(1, 3, [rifle, sniper]);
    const a = equipGun(g, 'recruit-1', 'h1');
    if (!a.ok) throw new Error(a.reason);
    const b = equipGun(a.game, 'recruit-1', 'h2');
    if (!b.ok) throw new Error(b.reason);
    expect(b.game.roster[0]!.loadout.primary).toEqual(sniper);
    expect(b.game.armoury).toEqual([rifle]);
  });

  it('back to the pistol: the gun goes to the stash; refused into a full stash', () => {
    const g = squadGame(1, 3, [rifle]);
    const a = equipGun(g, 'recruit-1', 'h1');
    if (!a.ok) throw new Error(a.reason);
    const b = equipGun(a.game, 'recruit-1', 'pistol');
    if (!b.ok) throw new Error(b.reason);
    expect(b.game.roster[0]!.loadout.primary).toBe('pistol');
    expect(b.game.armoury).toEqual([rifle]);
    const full = { ...a.game, armoury: smgs(STASH_CAP) };
    expect(equipGun(full, 'recruit-1', 'pistol')).toEqual({
      ok: false,
      reason: `The stash is full (${STASH_CAP}/${STASH_CAP})`,
    });
  });

  it('the gun they already hold, or the pistol they already hold, changes nothing', () => {
    const g = squadGame(1, 3, [rifle]);
    expect(equipGun(g, 'recruit-1', 'pistol')).toEqual({ ok: true, game: g });
    const a = equipGun(g, 'recruit-1', 'h1');
    if (!a.ok) throw new Error(a.reason);
    expect(equipGun(a.game, 'recruit-1', 'h1')).toEqual({ ok: true, game: a.game });
  });

  it('another survivor’s gun, an unknown uid or survivor, or a hostile key is refused', () => {
    const g = squadGame(2, 3, [rifle]);
    const a = equipGun(g, 'recruit-1', 'h1');
    if (!a.ok) throw new Error(a.reason);
    for (const choice of ['h1', 'h9', '', '__proto__', 'constructor', 'knife', 'toolkit']) {
      expect(equipGun(a.game, 'recruit-2', choice).ok).toBe(false);
    }
    expect(equipGun(a.game, 'nobody', 'pistol').ok).toBe(false);
    expect(equipGun(a.game, '__proto__', 'pistol').ok).toBe(false);
  });

  it('the role is the gun’s: the same survivor fights as the gun they hold', () => {
    const g = squadGame(1, 3, [rollWeapon(createRng(1), 'h1', 'shotgun', 'common')]);
    const r = equipGun(g, 'recruit-1', 'h1');
    if (!r.ok) throw new Error(r.reason);
    const s = startSquadHorde(r.game, 1, NOW);
    expect(s.defenders[0]!.loadout.primary).toMatchObject({ base: 'shotgun' });
  });
});

describe('best gun for everyone (ID-108)', () => {
  const weak = gun('a', 'smg', 'rusty');
  const mid = gun('b', 'smg', 'military');
  const top = gun('c', 'rifle', 'relic');

  it('hands the strongest stash guns to the weakest hands, the pistol included', () => {
    const g = squadGame(3, 3, [weak, mid, top]);
    const r = bestGuns(g);
    expect(r.moves.map((m) => [m.id, m.from, m.to.uid])).toEqual([
      ['recruit-1', 'pistol', 'c'],
      ['recruit-2', 'pistol', 'b'],
      ['recruit-3', 'pistol', 'a'],
    ]);
    expect(r.game.armoury).toEqual([]);
    for (const m of r.moves) {
      expect(r.game.roster.find((d) => d.id === m.id)!.loadout.primary).toMatchObject({
        uid: m.to.uid,
      });
    }
  });

  it('a better stash gun swaps with a held one, which goes to the stash', () => {
    const g0 = squadGame(2, 3, [weak, mid, top]);
    const a = equipGun(g0, 'recruit-1', 'a');
    if (!a.ok) throw new Error(a.reason);
    const r = bestGuns(a.game);
    // Both survivors end with the two strongest; the Rusty SMG is left in the stash.
    const holds = r.game.roster.map((d) => (d.loadout.primary as OwnedWeapon).uid).sort();
    expect(holds).toEqual(['b', 'c']);
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['a']);
  });

  it('is idempotent: a second call moves nothing', () => {
    const once = bestGuns(squadGame(3, 3, [weak, mid, top]));
    const twice = bestGuns(once.game);
    expect(twice.moves).toEqual([]);
    expect(twice.game).toEqual(once.game);
  });

  it('never gives a gun for the pistol, so a full stash stays within the cap', () => {
    const full = Array.from({ length: STASH_CAP }, (_, i) => gun(`s${i}`, 'smg', 'common'));
    const g = squadGame(2, 3, [...full, top]);
    const r = bestGuns(g);
    expect(r.game.armoury.length).toBeLessThanOrEqual(g.armoury.length);
    expect(r.moves.length).toBeGreaterThan(0);
    for (const d of r.game.roster) expect(d.loadout.primary).not.toBe('pistol');
  });

  it('nothing to hand out: an empty stash, or guns no better than the pistol', () => {
    expect(bestGuns(squadGame(2, 3)).moves).toEqual([]);
    const g = squadGame(1, 3, [top]);
    const held = equipGun(g, 'recruit-1', 'c');
    if (!held.ok) throw new Error(held.reason);
    expect(gunPower(top)).toBeGreaterThan(gunPower(weak));
    expect(bestGuns(held.game).moves).toEqual([]);
  });
});
