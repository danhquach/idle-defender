// ID-098: farming beaten hordes. Replays, first-clear and replay drops, the bad-luck
// guarantee, gun levels, a replay's and a loss's XP, and Squad Power.
import { describe, expect, it } from 'vitest';
import {
  bestDrop,
  firstClearWeights,
  gunLevel,
  gunPower,
  levelName,
  replayWeights,
  rollUpgrade,
  squadDropWeights,
  statsOf,
  type OwnedWeapon,
} from './armoury.ts';
import { recruit } from './camp.ts';
import { FARM, POWER, RARITY_ORDER, SQUAD_CAP, WEAPONS, type Rarity } from './data.ts';
import { hordeXp, newGame, type GameState } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  combineGuns,
  finishSquadHorde,
  highestBeaten,
  isReplay,
  squadDrop,
  squadResult,
  squadXpGains,
  startSquadHorde,
  weakestHeld,
} from './hordeonly.ts';
import { createRng } from './rng.ts';
import { hordeHp, powerBand, recommendedPower, squadPower, survivorPower } from './squadpower.ts';

const NOW = 1_700_000_000_000;

/** A horde-only game with `n` survivors, the next new horde `next`, and `stash`. */
function farmGame(n: number, next: number, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: next,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}

/** Horde `n` of `game` from `seed`, forced to `outcome` with `wave` reached. */
const ended = (
  game: GameState,
  n: number,
  outcome: 'won' | 'lost',
  seed = 1,
  wave?: number,
): HordeState => {
  const s = startSquadHorde(game, seed, NOW, n);
  return { ...s, outcome, wave: wave ?? (outcome === 'won' ? s.waveCount : s.wave) };
};

const gun = (
  uid: string,
  base: keyof typeof WEAPONS,
  rarity: Rarity,
  level?: number,
): OwnedWeapon => ({ uid, base, rarity, affixes: [], ...(level ? { level } : {}) });

const total = (w: Record<Rarity, number>): number => RARITY_ORDER.reduce((s, r) => s + w[r], 0);

describe('gun level (ID-098)', () => {
  it('adds 5% of base damage a level above 1, before rarity and affixes', () => {
    const one = gun('h1', 'rifle', 'military');
    const twenty = gun('h20', 'rifle', 'military', 20);
    expect(statsOf(twenty).damage / statsOf(one).damage).toBeCloseTo(1.95);
    expect(gunPower(twenty)).toBeGreaterThan(gunPower(one));
  });

  it('is 1 for the free pistol and a gun with none, and shows as "Lv n Name"', () => {
    expect(gunLevel('pistol')).toBe(1);
    expect(gunLevel(gun('h3', 'smg', 'common'))).toBe(1);
    expect(levelName(gun('h12', 'rifle', 'military', 12))).toBe('Lv 12 Military Rifle');
    expect(levelName('pistol')).toBe('Lv 1 Pistol');
  });

  it('lets a high-level Common beat a low-level Military', () => {
    expect(gunPower(gun('a', 'rifle', 'common', 20))).toBeGreaterThan(
      gunPower(gun('b', 'rifle', 'military', 1)),
    );
  });

  it('combines 3 guns of any levels into one at the highest', () => {
    const g = farmGame(1, 9, [
      gun('h2', 'smg', 'common', 2),
      gun('h7', 'smg', 'common', 7),
      gun('h4', 'smg', 'common', 4),
    ]);
    const r = combineGuns(g, ['h2', 'h7', 'h4']);
    expect(r.ok && r.weapon.level).toBe(7);
    expect(r.ok && r.weapon.rarity).toBe('military');
  });

  it('a combine of level-1 guns stays level 1', () => {
    const g = farmGame(1, 9, [
      gun('h2', 'smg', 'common'),
      gun('h3', 'smg', 'common'),
      gun('h4', 'smg', 'common'),
    ]);
    const r = combineGuns(g, ['h2', 'h3', 'h4']);
    expect(r.ok && gunLevel(r.weapon)).toBe(1);
  });
});

describe('drop weights (ID-098)', () => {
  it('a first clear moves each rarity up one, Relic staying Relic', () => {
    expect(firstClearWeights(1)).toEqual({
      rusty: 0,
      common: 50,
      military: 50,
      prototype: 0,
      relic: 0,
    });
    expect(firstClearWeights(10)).toEqual({
      rusty: 0,
      common: 0,
      military: 25,
      prototype: 40,
      relic: 35,
    });
    for (const n of [1, 4, 7, 10, 30])
      expect(total(firstClearWeights(n))).toBe(total(squadDropWeights(n)));
  });

  it('a replay halves the top rarity, moving the rest to the one below', () => {
    expect(replayWeights(1)).toEqual({
      rusty: 75,
      common: 25,
      military: 0,
      prototype: 0,
      relic: 0,
    });
    expect(replayWeights(10)).toEqual({
      rusty: 0,
      common: 25,
      military: 40,
      prototype: 30,
      relic: 5,
    });
  });

  it('each bad-luck count moves 5 points up one band, from the lowest rarity', () => {
    const base = replayWeights(4);
    const two = replayWeights(4, 2);
    expect(two.rusty).toBe(base.rusty - 2 * FARM.badLuckStep);
    expect(two.common).toBe(base.common + 2 * FARM.badLuckStep);
    expect(total(two)).toBe(total(base));
    // Past the lowest rarity's weight it moves on from the next one.
    const many = replayWeights(1, 20);
    expect(many.rusty).toBe(0);
    expect(total(many)).toBe(100);
  });
});

describe('the horde picker (ID-098)', () => {
  it('opens the next new horde and every one beaten, no other', () => {
    const g = farmGame(3, 5);
    expect(highestBeaten(g)).toBe(4);
    for (const n of [1, 4, 5]) expect(startSquadHorde(g, 1, NOW, n).hordeNumber).toBe(n);
    expect(() => startSquadHorde(g, 1, NOW, 6)).toThrow(RangeError);
    expect(() => startSquadHorde(g, 1, NOW, 0)).toThrow(RangeError);
    expect(() => startSquadHorde(g, 1, NOW, 2.5)).toThrow(RangeError);
    expect(startSquadHorde(g, 1, NOW).hordeNumber).toBe(5);
    expect(isReplay(g, 4)).toBe(true);
    expect(isReplay(g, 5)).toBe(false);
  });

  it('a replay is a normal horde of that number', () => {
    const g = farmGame(3, 5);
    const replay = startSquadHorde(g, 7, NOW, 2);
    const fresh = startSquadHorde({ ...g, hordeNumber: 2 }, 7, NOW);
    expect(replay.waveCount).toBe(fresh.waveCount);
    expect(replay.hpScale).toBe(fresh.hpScale);
  });

  it('a replay win keeps the next new horde, adds nobody and counts a replay', () => {
    const g = farmGame(2, 5);
    const after = finishSquadHorde(g, ended(g, 3, 'won'));
    expect(after.hordeNumber).toBe(5);
    expect(after.roster).toHaveLength(2);
    expect(after.farm.replays).toBe(1);
    expect(squadResult(g, ended(g, 3, 'won')).joined).toBeNull();
  });

  it('a first clear moves on, adds a survivor and leaves the farm alone', () => {
    const g = { ...farmGame(2, 5), farm: { replays: 3, badLuck: 2 } };
    const after = finishSquadHorde(g, ended(g, 5, 'won'));
    expect(after.hordeNumber).toBe(6);
    expect(after.roster).toHaveLength(3);
    expect(after.farm).toEqual({ replays: 3, badLuck: 2 });
  });

  it('refuses a horde past the next new one', () => {
    const g = farmGame(2, 5);
    const s = ended({ ...g, hordeNumber: 6 }, 6, 'won');
    expect(() => finishSquadHorde(g, s)).toThrow(RangeError);
  });
});

describe('first-clear and replay drops (ID-098)', () => {
  it('a first clear drops `h<n>` at gun level n, from the moved-up band', () => {
    const g = farmGame(1, 4);
    for (let seed = 1; seed <= 40; seed++) {
      const d = squadDrop(g, ended(g, 4, 'won', seed))!;
      expect(d.kind).toBe('first');
      expect(d.weapon.uid).toBe('h4');
      expect(d.weapon.level).toBe(4);
      expect(firstClearWeights(4)[d.weapon.rarity]).toBeGreaterThan(0);
    }
  });

  it("a replay drops `r<k>` (the k-th replay win) at the horde's level", () => {
    const g = { ...farmGame(1, 8), farm: { replays: 4, badLuck: 0 } };
    const d = squadDrop(g, ended(g, 6, 'won'))!;
    expect(d.kind).toBe('replay');
    expect(d.weapon.uid).toBe('r5');
    expect(d.weapon.level).toBe(6);
  });

  it('nothing drops on a loss', () => {
    const g = farmGame(1, 8);
    expect(squadDrop(g, ended(g, 6, 'lost'))).toBeNull();
    expect(finishSquadHorde(g, ended(g, 6, 'lost', 1, 1)).armoury).toEqual([]);
  });

  it('the same seed drops the same gun', () => {
    const g = farmGame(1, 8);
    expect(squadDrop(g, ended(g, 6, 'won', 9))).toEqual(squadDrop(g, ended(g, 6, 'won', 9)));
  });
});

describe('the bad-luck guarantee (ID-098)', () => {
  /** A squad of one holding `held`, the next new horde `next`. */
  const holding = (held: OwnedWeapon, next: number, badLuck = 0): GameState => {
    const g = farmGame(1, next);
    return {
      ...g,
      roster: [{ ...g.roster[0]!, loadout: { primary: held, secondary: null, item: null } }],
      farm: { replays: 0, badLuck },
    };
  };

  it('the weakest held gun counts the free pistol', () => {
    const g = farmGame(2, 3);
    expect(weakestHeld(g)).toBe('pistol');
  });

  it('a replay drop that is no upgrade adds 1; an upgrade resets it', () => {
    // A Military Rifle at level 5: Horde 3 replays can beat it at times, not always.
    const held = gun('h9', 'rifle', 'military', 5);
    let saw = { up: false, down: false };
    for (let seed = 1; seed <= 200 && !(saw.up && saw.down); seed++) {
      const g = holding(held, 9, 2);
      const s = ended(g, 8, 'won', seed);
      const d = squadDrop(g, s)!;
      const after = finishSquadHorde(g, s);
      if (d.upgrade) {
        expect(after.farm.badLuck).toBe(0);
        saw = { ...saw, up: true };
      } else {
        expect(after.farm.badLuck).toBe(3);
        saw = { ...saw, down: true };
      }
    }
    expect(saw).toEqual({ up: true, down: true });
  });

  it('one short of the guarantee, a drop that is no upgrade reaches it', () => {
    const held = gun('h9', 'rifle', 'military', 5);
    let seed = 1;
    const g = holding(held, 9, FARM.guarantee - 1);
    while (squadDrop(g, ended(g, 8, 'won', seed))!.upgrade) seed++;
    expect(finishSquadHorde(g, ended(g, 8, 'won', seed)).farm.badLuck).toBe(FARM.guarantee);
  });

  it('at the guarantee, the next replay drop is a sure upgrade', () => {
    const held = gun('h9', 'smg', 'military', 9);
    for (let seed = 1; seed <= 30; seed++) {
      const g = holding(held, 10, FARM.guarantee);
      const s = ended(g, 9, 'won', seed);
      const d = squadDrop(g, s)!;
      expect(d.kind).toBe('guaranteed');
      expect(d.upgrade).toBe(true);
      expect(gunPower(d.weapon)).toBeGreaterThan(gunPower(held));
      expect(RARITY_ORDER.indexOf(d.weapon.rarity)).toBeGreaterThanOrEqual(
        RARITY_ORDER.indexOf('military'),
      );
      expect(finishSquadHorde(g, s).farm.badLuck).toBe(0);
    }
  });

  it('with no gun here able to beat the weakest, nothing counts and there is no reroll', () => {
    const held = gun('h30', 'shotgun', 'relic', 40);
    const g = holding(held, 41, 3);
    expect(bestDrop(replayWeights(2, 3), 2)).toBeLessThan(gunPower(held));
    const s = ended(g, 2, 'won');
    const d = squadDrop(g, s)!;
    expect(d.noUpgrades).toBe(true);
    expect(d.kind).toBe('replay');
    // It names the lowest horde that could drop an upgrade, and none below it can.
    const from = d.farmFrom!;
    expect(from).toBeGreaterThan(2);
    expect(bestDrop(replayWeights(from, 3), from)).toBeGreaterThan(gunPower(held));
    expect(bestDrop(replayWeights(from - 1, 3), from - 1)).toBeLessThanOrEqual(gunPower(held));
    expect(finishSquadHorde(g, s).farm.badLuck).toBe(3);
    // At the guarantee too: an ordinary replay drop, no endless reroll.
    const full = holding(held, 41, FARM.guarantee);
    expect(squadDrop(full, ended(full, 2, 'won'))!.kind).toBe('replay');
  });

  it('names no horde to farm when no horde up to the next new one could beat the weakest', () => {
    const held = gun('h40', 'shotgun', 'relic', 1000);
    const g = holding(held, 41, 0);
    const d = squadDrop(g, ended(g, 2, 'won'))!;
    expect(d.noUpgrades).toBe(true);
    expect(d.farmFrom).toBeNull();
  });

  it('past the most replays a save holds, a replay pays XP but drops nothing and counts nothing', () => {
    const g = { ...farmGame(1, 9), farm: { replays: FARM.maxReplays, badLuck: 2 } };
    const s = ended(g, 6, 'won');
    expect(squadDrop(g, s)).toBeNull();
    const after = finishSquadHorde(g, s);
    expect(after.armoury).toEqual(g.armoury);
    expect(after.farm).toEqual(g.farm);
    expect(after.roster[0]!.xp).toBeGreaterThan(g.roster[0]!.xp);
    // A first clear still drops as ever.
    expect(squadDrop(g, ended(g, 9, 'won'))!.kind).toBe('first');
  });

  it('first clears neither count toward nor reset it', () => {
    const g = holding(gun('h1', 'rifle', 'relic', 1), 3, 2);
    expect(finishSquadHorde(g, ended(g, 3, 'won')).farm.badLuck).toBe(2);
  });

  it('rollUpgrade always ends, and returns null when nothing can beat the gun', () => {
    const rng = createRng(1);
    expect(rollUpgrade(rng, 'r1', replayWeights(1), 1, 1e9, 'rusty')).toBeNull();
    const w = rollUpgrade(
      rng,
      'r1',
      replayWeights(10),
      10,
      gunPower(gun('x', 'rifle', 'military', 10)),
      'military',
    );
    expect(w && gunPower(w)).toBeGreaterThan(gunPower(gun('x', 'rifle', 'military', 10)));
  });
});

describe('XP from replays and losses (ID-098)', () => {
  const xpOf = (g: GameState, s: HordeState): number => squadXpGains(g, s)[0]!.xp;
  const win = (n: number): number => Math.floor(hordeXp(n) * 2);

  it("a replay pays that horde's XP, half when more than 3 below the highest beaten", () => {
    const g = farmGame(1, 10);
    expect(xpOf(g, ended(g, 6, 'won'))).toBe(win(6));
    expect(xpOf(g, ended(g, 5, 'won'))).toBe(Math.floor(win(5) * FARM.farXp));
    expect(xpOf(g, ended(g, 10, 'won'))).toBe(win(10));
  });

  it('a loss on a far-down replay pays its share of the halved XP', () => {
    const g = farmGame(1, 10);
    const s = startSquadHorde(g, 1, NOW, 5);
    const lost = { ...s, outcome: 'lost' as const, wave: s.waveCount };
    expect(xpOf(g, lost)).toBe(
      Math.floor((hordeXp(5) * 2 * FARM.farXp * 0.25 * (s.waveCount - 1)) / s.waveCount),
    );
  });

  it("a loss pays 25% of a win's XP times the waves cleared share; 0 waves → 0", () => {
    const g = farmGame(1, 6);
    const s = startSquadHorde(g, 1, NOW, 6);
    const lost = (wave: number) => ({ ...s, outcome: 'lost' as const, wave });
    expect(xpOf(g, lost(1))).toBe(0);
    expect(xpOf(g, lost(3))).toBe(Math.floor((hordeXp(6) * 2 * 0.25 * 2) / s.waveCount));
    const after = finishSquadHorde(g, lost(3));
    expect(after.roster[0]!.xp).toBe(xpOf(g, lost(3)));
    expect(after.hordeNumber).toBe(6);
    expect(finishSquadHorde(g, lost(1))).toBe(g);
    expect(squadResult(g, lost(3)).gains[0]!.xp).toBe(xpOf(g, lost(3)));
  });
});

describe('Squad Power and Recommended Power (ID-098)', () => {
  it('sums each squad survivor, a better gun and Instinct each raising it', () => {
    const g = farmGame(2, 3);
    const one = farmGame(1, 3);
    expect(squadPower(g)).toBeGreaterThan(squadPower(one));
    const armed = {
      ...one,
      roster: [
        {
          ...one.roster[0]!,
          loadout: { primary: gun('h2', 'rifle', 'military', 5), secondary: null, item: null },
        },
      ],
    };
    expect(squadPower(armed)).toBeGreaterThan(squadPower(one));
    const levelled = {
      ...armed,
      roster: [
        {
          ...armed.roster[0]!,
          loadout: { primary: gun('h2', 'rifle', 'military', 9), secondary: null, item: null },
        },
      ],
    };
    expect(squadPower(levelled)).toBeGreaterThan(squadPower(armed));
    const tough = {
      ...one.roster[0]!,
      xp: 1e6,
      stats: { instinct: 5, agility: 0, mind: 0, tinker: 0 },
    };
    expect(survivorPower(tough)).toBeGreaterThan(survivorPower(one.roster[0]!));
    const sharp = {
      ...one.roster[0]!,
      xp: 1e6,
      stats: { instinct: 0, agility: 0, mind: 5, tinker: 0 },
    };
    expect(survivorPower(sharp)).toBeGreaterThan(survivorPower(one.roster[0]!));
  });

  it('counts only the squad, at most SQUAD_CAP', () => {
    const g = farmGame(SQUAD_CAP, 9);
    const more = { ...g, roster: [...g.roster, recruit(SQUAD_CAP + 1)] };
    expect(squadPower(more)).toBe(squadPower(g));
  });

  it("Recommended Power grows with the horde's enemy HP", () => {
    for (let n = 1; n < 30; n++) {
      expect(hordeHp(n + 1)).toBeGreaterThan(hordeHp(n));
      expect(recommendedPower(n + 1)).toBeGreaterThanOrEqual(recommendedPower(n));
    }
    expect(recommendedPower(9)).toBe(Math.round(POWER.rec.k * hordeHp(9) ** POWER.rec.e));
  });

  it('a new game (one survivor, a pistol) is green at Horde 1, which it always wins', () => {
    const g = newGame('horde');
    expect(powerBand(squadPower(g), recommendedPower(1))).toBe('ok');
    expect(recommendedPower(2)).toBeLessThan(recommendedPower(3));
  });

  it('bands: green at or above, amber within 15% below, red further', () => {
    expect(powerBand(1000, 1000)).toBe('ok');
    expect(powerBand(1200, 1000)).toBe('ok');
    expect(powerBand(850, 1000)).toBe('close');
    expect(powerBand(849, 1000)).toBe('short');
  });
});
