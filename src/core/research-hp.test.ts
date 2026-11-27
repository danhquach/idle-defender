// ID-265: the Research Center's HP ramp (SQUAD_RESEARCH_HP) scales the fight only. Hordes up to
// its start, and Recommended Power everywhere, are the numbers they were before it.
import { describe, expect, it } from 'vitest';
import { CARD, SQUAD_RESEARCH_HP, TECH_IDS } from './data.ts';
import { hordeKindHp, researchHp, squadHpScale, startSquadHorde } from './hordeonly.ts';
import { hordeSeconds } from './pacing.ts';
import { effHorde, MODES } from './modes.ts';
import { hordeHp, recommendedPower } from './squadpower.ts';
import { inMode, squad, squadAt } from './balance/shared.ts';

describe('the research HP ramp (ID-265)', () => {
  it('is exactly 1 up to its start and held from its end on', () => {
    const { from, to, factor } = SQUAD_RESEARCH_HP;
    for (const n of [1, 10, 20, from]) expect(researchHp(n)).toBe(1);
    expect(researchHp(to)).toBe(factor);
    for (const n of [to, to + 1, 100, 150]) expect(researchHp(n)).toBe(factor);
    for (let n = from; n < to; n++) expect(researchHp(n + 1)).toBeGreaterThanOrEqual(researchHp(n));
    expect(factor).toBeLessThanOrEqual(1.1);
  });

  it('leaves Hordes 1 to 20 as they were: HP scale and Recommended Power, to the bit', () => {
    expect(squadHpScale(1)).toBe(0.8);
    expect(squadHpScale(5)).toBe(2.0736);
    expect(squadHpScale(10)).toBe(2.3560850018304);
    expect(squadHpScale(15)).toBe(4.834558925755417);
    expect(squadHpScale(19)).toBe(6.103519255528565);
    expect(squadHpScale(20)).toBe(6.46973041086028);
    expect(squadHpScale(20, 8)).toBe(6.46973041086028);
    expect([1, 10, 15, 20].map((n) => recommendedPower(n))).toEqual([18, 1899, 4038, 6653]);
    for (const n of [1, 10, 15, 20]) {
      const s = startSquadHorde(squadAt(n, 10), 1, 0);
      expect(s.hpScale).toBe(squadHpScale(n, s.defenders.length) * MODES.normal.hpScale);
    }
  });

  it('keeps Recommended Power and the horde HP the bare player faces, ramp or not', () => {
    expect(recommendedPower(30)).toBe(13673);
    expect(recommendedPower(40)).toBe(24486);
    expect(recommendedPower(50)).toBe(43847);
    expect(recommendedPower(40, 'normal', 8)).toBe(27530);
    expect(recommendedPower(50, 'normal', 8)).toBe(55435);
    expect(recommendedPower(60, 'nightmare', 8)).toBe(111203);
    expect(recommendedPower(80, 'nightmare', 8)).toBe(369330);
    expect(hordeHp(40)).toBe(1708891.3);
    expect(hordeHp(50)).toBe(3060174.6000000006);
  });

  it('scales the fight past the ramp start, in Normal and held through Nightmare', () => {
    for (const [mode, local, game] of [
      ['normal', 45, squadAt(45, 40)],
      ['nightmare', 10, inMode(squad(51, 40), 'nightmare', 10)],
    ] as const) {
      const eff = effHorde(mode, local);
      const s = startSquadHorde(game, 1, 0, local);
      expect(s.hpScale).toBe(
        squadHpScale(eff, s.defenders.length) * MODES[mode].hpScale * researchHp(eff),
      );
      expect(researchHp(eff)).toBe(SQUAD_RESEARCH_HP.factor);
    }
  });

  it('puts the ramp in the Wall Machine Gun demand: it keeps pace with the bigger horde', () => {
    const game = { ...squadAt(45, 40), tech: [...TECH_IDS] };
    const s = startSquadHorde(game, 1, 0, 45);
    const demand = hordeKindHp(45, 'normal', s.defenders.length, s.theme ?? null).reduce(
      (sum, [, hp]) => sum + hp,
      0,
    );
    expect(s.gunDps).toBe((CARD.wallGun.share * demand * researchHp(45)) / hordeSeconds(45));
  });
});
