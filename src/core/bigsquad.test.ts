// A bigger squad's late Normal (ID-224): a squad above SQUAD_CAP meets steeper enemy HP over
// Hordes 31–50, and Recommended Power asks the same of it, from one squad count.
import { describe, expect, it } from 'vitest';
import { recruit } from './camp.ts';
import { SQUAD_BIG_HP, SQUAD_CAP, SQUAD_CAP_MAX, SQUAD_HP_GROWTH } from './data.ts';
import { newGame, type GameState } from './game.ts';
import { bigSquadHp, researchHp, squadHpScale, squadSize, startSquadHorde } from './hordeonly.ts';
import { effHorde, MODES, type Mode } from './modes.ts';
import { hordeHp, recommendedPower } from './squadpower.ts';

const STEP = SQUAD_BIG_HP.growth / SQUAD_HP_GROWTH.late;

/** A horde-only game at Horde `horde` with `n` on the roster and `bought` squad slots. */
function game(n: number, bought: number, horde: number, mode: Mode = 'normal'): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    slots: { squad: bought, stash: 0 },
    ...(mode === 'normal' ? {} : { mode, modes: { [mode]: horde } }),
  };
}

describe('bigger squad late HP (ID-224)', () => {
  it('leaves a squad of SQUAD_CAP or fewer as before, at every horde', () => {
    for (let n = 1; n <= 120; n++) {
      for (const size of [0, 1, 3, SQUAD_CAP]) {
        expect(squadHpScale(n, size), `Horde ${n}, ${size}`).toBe(squadHpScale(n));
        expect(bigSquadHp(n, size)).toBe(1);
      }
    }
  });

  it('changes nothing up to Horde 30 for any size', () => {
    for (let n = 1; n <= SQUAD_BIG_HP.from; n++) {
      for (const size of [7, 8, 12]) expect(bigSquadHp(n, size), `Horde ${n}`).toBe(1);
    }
  });

  it('steepens the growth to SQUAD_BIG_HP.growth for a squad of 8 over Hordes 31–50, held after', () => {
    const max = SQUAD_CAP_MAX;
    expect(bigSquadHp(40, max)).toBeCloseTo(STEP ** 10, 12);
    expect(bigSquadHp(50, max)).toBeCloseTo(STEP ** 20, 12);
    for (let n = SQUAD_BIG_HP.from + 2; n <= SQUAD_BIG_HP.to; n++) {
      expect(squadHpScale(n, max) / squadHpScale(n - 1, max)).toBeCloseTo(SQUAD_BIG_HP.growth, 9);
    }
    // Past Horde 50 (Nightmare, Hell): the bump reached at 50 holds, the growth back to late.
    for (const n of [51, 75, 100, 150]) expect(bigSquadHp(n, max)).toBe(bigSquadHp(50, max));
    expect(squadHpScale(52, max) / squadHpScale(51, max)).toBeCloseTo(SQUAD_HP_GROWTH.late, 9);
    // Gentle: a little over a quarter more HP at Horde 50, never more.
    expect(bigSquadHp(50, max)).toBeGreaterThan(1.2);
    expect(bigSquadHp(50, max)).toBeLessThan(1.3);
  });

  it('gives a squad of 7 half the step (in the exponent)', () => {
    for (const n of [31, 40, 50, 80]) {
      expect(bigSquadHp(n, 7)).toBeCloseTo(Math.sqrt(bigSquadHp(n, 8)), 12);
      expect(recommendedPower(n, 'normal', 7)).toBeGreaterThan(recommendedPower(n, 'normal', 6));
      expect(recommendedPower(n, 'normal', 7)).toBeLessThan(recommendedPower(n, 'normal', 8));
    }
  });

  it('holds hostile sizes: over the max counts as 8, fractions round down, junk as SQUAD_CAP', () => {
    expect(bigSquadHp(50, 9)).toBe(bigSquadHp(50, 8));
    expect(bigSquadHp(50, 1000)).toBe(bigSquadHp(50, 8));
    expect(bigSquadHp(50, 7.9)).toBe(bigSquadHp(50, 7));
    for (const junk of [-5, Number.NaN, Infinity, -Infinity]) expect(bigSquadHp(50, junk)).toBe(1);
  });

  it('counts only the squad that fights: a bench past the bought slots adds nothing', () => {
    expect(squadSize(game(10, 0, 50))).toBe(SQUAD_CAP);
    expect(squadSize(game(10, 1, 50))).toBe(SQUAD_CAP + 1);
    expect(squadSize(game(10, 2, 50))).toBe(SQUAD_CAP_MAX);
    expect(squadSize(game(4, 2, 50))).toBe(4);
    const benched = startSquadHorde(game(10, 0, 50), 1, 0);
    // The fight also carries the research HP ramp (ID-265), which Recommended Power does not.
    expect(benched.hpScale).toBeCloseTo(squadHpScale(50) * researchHp(50), 12);
  });

  it('starts the fight at the HP Recommended Power expects (and the research ramp), from the same count', () => {
    for (const mode of ['normal', 'nightmare', 'hell'] as const) {
      for (const [n, bought] of [
        [6, 0],
        [7, 1],
        [8, 2],
      ] as const) {
        const local = mode === 'normal' ? 50 : 10;
        const g = game(n, bought, local, mode);
        const eff = effHorde(mode, local);
        const s = startSquadHorde(g, 1, 0);
        expect(s.hpScale, `${mode} ${n}`).toBeCloseTo(
          squadHpScale(eff, squadSize(g)) * MODES[mode].hpScale * researchHp(eff),
          12,
        );
      }
    }
  });

  it('raises Recommended Power by the same factor, bosses scaled once', () => {
    for (const n of [31, 40, 50]) {
      expect(recommendedPower(n, 'normal', 8)).toBeGreaterThan(recommendedPower(n));
    }
    for (const n of [10, 20, 30])
      expect(recommendedPower(n, 'normal', 8)).toBe(recommendedPower(n));
    // Every enemy and boss HP takes the scale once, so the horde's HP moves by the factor alone
    // (to 2 places: `enemyHp` rounds each enemy to a whole HP).
    for (const [mode, local] of [
      ['normal', 50],
      ['nightmare', 10],
      ['hell', 10],
    ] as const) {
      const eff = effHorde(mode, local);
      expect(hordeHp(eff, mode, 8) / hordeHp(eff, mode), `${mode}`).toBeCloseTo(
        bigSquadHp(eff, 8),
        2,
      );
    }
  });
});
