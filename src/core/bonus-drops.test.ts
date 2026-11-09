// ID-122: a horde-only win, first clear or replay, can drop bonus guns after its drop:
// SQUAD_BONUS.rolls tries at SQUAD_BONUS.chance each, rarity by the band moved down one,
// so the lower grades come most. The drop itself rolls as it did before.
import { describe, expect, it } from 'vitest';
import {
  bonusWeights,
  firstClearWeights,
  gunLevel,
  gunPower,
  rollSquadGun,
  squadDropWeights,
  type OwnedWeapon,
} from './armoury.ts';
import { recruit } from './camp.ts';
import { RARITY_ORDER, SQUAD_BONUS, SQUAD_DROP, STASH_CAP, type Rarity } from './data.ts';
import { newGame, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  finishSquadHorde,
  squadDrop,
  startSquadHorde,
  stashWith,
  weakestHeld,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import { unlucky } from './sim.ts';

const NOW = 1_700_000_000_000;

/** A horde-only game with `n` survivors, `next` the next new horde and `stash` in the stash. */
function squadGame(n: number, next: number, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: next,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}

/** Horde `horde` from `seed`, won. */
const won = (game: GameState, horde: number, seed: number): HordeState => ({
  ...startSquadHorde(game, seed, NOW, horde),
  outcome: 'won',
});

const gun = (uid: string, rarity: Rarity, level = 1): OwnedWeapon => ({
  uid,
  base: 'lmg',
  rarity,
  affixes: [],
  level,
});

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

describe('bonus gun odds (ID-122)', () => {
  it('moves every band down one rarity: Rusty stays Rusty, nothing is lost', () => {
    for (const band of SQUAD_DROP) {
      const w = bonusWeights(band.from);
      const sum = (r: Record<Rarity, number>) => RARITY_ORDER.reduce((a, k) => a + r[k], 0);
      expect(sum(w)).toBe(sum(band.rarity));
      expect(w.relic).toBe(0);
      expect(w.rusty).toBe(band.rarity.rusty + band.rarity.common);
    }
    expect(bonusWeights(1)).toEqual({ rusty: 100, common: 0, military: 0, prototype: 0, relic: 0 });
    expect(bonusWeights(12)).toEqual({
      rusty: 25,
      common: 40,
      military: 25,
      prototype: 10,
      relic: 0,
    });
  });

  it('a bonus gun’s mean rarity is lower than the horde’s own band', () => {
    for (const n of [4, 7, 10, 30]) {
      const w = bonusWeights(n);
      const band = squadDropWeights(n);
      const mean = (r: Record<Rarity, number>) =>
        RARITY_ORDER.reduce((a, k, i) => a + i * r[k], 0) / 100;
      expect(mean(w)).toBeLessThan(mean(band));
    }
  });
});

describe('bonus guns on a win (ID-122)', () => {
  it('a first clear and a replay both drop 0 to SQUAD_BONUS.rolls bonus guns, about rolls × chance', () => {
    for (const [next, horde] of [
      [10, 10],
      [11, 10],
    ] as const) {
      const g = squadGame(2, next);
      const counts = SEEDS.map((s) => squadDrop(g, won(g, horde, s))!.bonus.length);
      expect(Math.min(...counts)).toBe(0);
      expect(Math.max(...counts)).toBe(SQUAD_BONUS.rolls);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      expect(mean).toBeGreaterThan(SQUAD_BONUS.rolls * SQUAD_BONUS.chance - 0.15);
      expect(mean).toBeLessThan(SQUAD_BONUS.rolls * SQUAD_BONUS.chance + 0.15);
    }
  });

  it('bonus guns are uid `<drop>-k`, at the horde’s level, and lean to the lower grades', () => {
    const first = squadGame(2, 10);
    const replay = { ...squadGame(2, 11), farm: { replays: 4, badLuck: 0 } };
    const seen: Record<Rarity, number> = {
      rusty: 0,
      common: 0,
      military: 0,
      prototype: 0,
      relic: 0,
    };
    for (const s of SEEDS) {
      const a = squadDrop(first, won(first, 10, s))!;
      expect(a.bonus.map((w) => w.uid)).toEqual(a.bonus.map((_, k) => `h10-${k + 1}`));
      const b = squadDrop(replay, won(replay, 10, s))!;
      expect(b.weapon.uid).toBe('r5');
      expect(b.bonus.map((w) => w.uid)).toEqual(b.bonus.map((_, k) => `r5-${k + 1}`));
      for (const w of [...a.bonus, ...b.bonus]) {
        expect(gunLevel(w)).toBe(10);
        seen[w.rarity] += 1;
      }
    }
    expect(seen.relic).toBe(0);
    expect(seen.rusty + seen.common).toBeGreaterThan(seen.military + seen.prototype);
    expect(seen.common).toBeGreaterThan(seen.prototype);
  });

  it('the drop itself is the gun it was before bonus guns: rolled first on the same stream', () => {
    const g = squadGame(1, 6);
    for (const s of SEEDS.slice(0, 30)) {
      const h = won(g, 6, s);
      const alone = rollSquadGun(createRng(h.seed ^ 0x5bd1e995), 'h6', firstClearWeights(6), 6);
      expect(squadDrop(g, h)!.weapon).toEqual(alone);
    }
  });

  it('the same seed drops the same bonus guns', () => {
    const g = squadGame(2, 8);
    expect(squadDrop(g, won(g, 8, 77))).toEqual(squadDrop(g, won(g, 8, 77)));
  });

  it('a win puts the drop and its bonus guns in the stash; a replay counts them as one win', () => {
    const g = { ...squadGame(2, 9), farm: { replays: 2, badLuck: 0 } };
    const seed = SEEDS.find((s) => squadDrop(g, won(g, 5, s))!.bonus.length === 2)!;
    const drop = squadDrop(g, won(g, 5, seed))!;
    const next = finishSquadHorde(g, won(g, 5, seed));
    expect(next.armoury).toEqual([drop.weapon, ...drop.bonus]);
    expect(next.farm.replays).toBe(3);
  });

  it('a replay win is an upgrade when any of its guns, bonus ones too, beats the weakest held', () => {
    // The squad holds a Common LMG at Horde 10's level: some drops beat it, some don't.
    const base = { ...squadGame(1, 11), farm: { replays: 0, badLuck: 3 } };
    const held = gun('h4', 'common', 10);
    const g = {
      ...base,
      roster: base.roster.map((d) => ({ ...d, loadout: { ...d.loadout, primary: held } })),
    };
    const beat = gunPower(weakestHeld(g));
    expect(beat).toBe(gunPower(held));
    let bonusOnly = 0;
    for (const s of SEEDS) {
      const d = squadDrop(g, won(g, 10, s))!;
      const any = [d.weapon, ...d.bonus].some((w) => gunPower(w) > beat);
      if (any && gunPower(d.weapon) <= beat) bonusOnly += 1;
      expect(d.upgrade).toBe(any);
      expect(finishSquadHorde(g, won(g, 10, s)).farm.badLuck).toBe(any ? 0 : 4);
    }
    // A bonus gun alone resets the count on some seeds.
    expect(bonusOnly).toBeGreaterThan(0);
  });
});

describe('the stash takes a win’s guns one by one (ID-122)', () => {
  it('fills to the cap, then each gun throws away the weakest of the stash and itself', () => {
    const stash = Array.from({ length: STASH_CAP - 1 }, (_, i) => gun(`c${i + 1}`, 'military'));
    const rusty = gun('h3-1', 'rusty');
    const relic = gun('h3', 'relic');
    const out = stashWith(stash, [relic, rusty]);
    // The relic takes the last free slot; the Rusty one is the weakest, so it goes.
    expect(out.thrown).toEqual([rusty]);
    expect(out.armoury).toEqual([...stash, relic]);
  });

  it('a later bonus gun can throw away the win’s own weaker drop', () => {
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'military'));
    const drop = gun('h3', 'rusty');
    const bonus = gun('h3-1', 'relic');
    const out = stashWith(stash, [drop, bonus]);
    // The Rusty drop goes first (weakest of all), then the Relic throws a Military out.
    expect(out.thrown.map((w) => w.uid)).toEqual(['h3', `c${STASH_CAP}`]);
    expect(out.armoury).toHaveLength(STASH_CAP);
    expect(out.armoury.at(-1)).toEqual(bonus);
  });

  it('never grows a stash at or past the cap, and never leaves a weapon twice', () => {
    const g = squadGame(
      1,
      6,
      Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'common', 5)),
    );
    for (const s of SEEDS.slice(0, 40)) {
      const next = finishSquadHorde(g, won(g, 5, s));
      expect(next.armoury).toHaveLength(STASH_CAP);
      expect(new Set(next.armoury.map((w) => w.uid)).size).toBe(STASH_CAP);
      const d = squadDrop(g, won(g, 5, s))!;
      expect(d.thrown).toHaveLength(1 + d.bonus.length);
    }
  });
});

describe('the worst luck throws bonus guns away too (ID-122, sim)', () => {
  it('a replay that is no guaranteed upgrade leaves the stash as it was and counts 1', () => {
    const g = { ...squadGame(1, 11, [gun('h3', 'rusty')]), farm: { replays: 0, badLuck: 1 } };
    const s = SEEDS.find((x) => squadDrop(g, won(g, 10, x))!.bonus.length > 0)!;
    const drop = squadDrop(g, won(g, 10, s))!;
    expect(drop.kind).toBe('replay');
    const out = unlucky(g, finishSquadHorde(g, won(g, 10, s)), drop);
    expect(out.armoury).toEqual(g.armoury);
    expect(out.farm).toEqual({ replays: 1, badLuck: 2 });
  });

  it('a guaranteed upgrade keeps only the drop, not its bonus guns', () => {
    const g = { ...squadGame(1, 11, [gun('h3', 'rusty')]), farm: { replays: 0, badLuck: 5 } };
    const s = SEEDS.find((x) => squadDrop(g, won(g, 10, x))!.bonus.length > 0)!;
    const drop = squadDrop(g, won(g, 10, s))!;
    expect(drop.kind).toBe('guaranteed');
    const out = unlucky(g, finishSquadHorde(g, won(g, 10, s)), drop);
    expect(out.armoury).toEqual([...g.armoury, drop.weapon]);
    expect(out.farm.badLuck).toBe(0);
  });
});
