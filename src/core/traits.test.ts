import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  ENEMY_TRAITS,
  GUN_CLASS,
  GUN_CLASSES,
  type EnemyKind,
  type GunBase,
  type GunClass,
  WEAPONS,
} from './data.ts';
import { hordeKindHp } from './hordeonly.ts';
import { effHorde, HIGHER_MODES, MODES, type HigherMode } from './modes.ts';
import { hordeHp } from './squadpower.ts';
import {
  classFactor,
  classOf,
  effectivePower,
  fitContext,
  fitOf,
  fitOfSquad,
  goodVs,
  poorVs,
  worstCover,
  type FitMember,
} from './traits.ts';

/** The horde the paper checks use: Nightmare 9 and Hell 1, for a squad of 8. */
const POINTS = [
  ['nightmare', 9],
  ['hell', 1],
] as const satisfies readonly (readonly [HigherMode, number])[];

const ctxAt = (mode: HigherMode, local: number, size = 8) =>
  fitContext(mode, hordeKindHp(effHorde(mode, local), mode, size));

/** Eight equal-power guns: `classes` hand round. */
const squadOf = (...classes: GunClass[]): FitMember[] =>
  Array.from({ length: 8 }, (_, i) => ({ power: 100, cls: classes[i % classes.length]! }));

const MIX = squadOf('light', 'medium', 'heavy', 'spread');

describe('the class and trait tables (ID-237)', () => {
  it('every gun has a class, and the free pistol is Light', () => {
    for (const base of Object.keys(GUN_CLASS) as GunBase[]) {
      expect(GUN_CLASSES, base).toContain(GUN_CLASS[base]);
    }
    expect(classOf('pistol')).toBe('light');
    expect(classOf('rifle')).toBe('medium');
    expect(classOf('sniper')).toBe('heavy');
    expect(classOf('shotgun')).toBe('spread');
  });

  it('every gun base of WEAPONS that shoots has a class; a blade has none', () => {
    for (const [id, w] of Object.entries(WEAPONS)) {
      const gun = w.kind === 'gun' || w.kind === 'sidearm';
      expect(classOf(id as keyof typeof WEAPONS) !== null, id).toBe(gun);
    }
  });

  it('every traited kind resists one class and is weak to another; every class is resisted by some kind', () => {
    for (const t of Object.values(ENEMY_TRAITS)) if (t) expect(t.resists).not.toBe(t.weak);
    expect(ENEMY_TRAITS.shambler).toBeNull();
    for (const c of GUN_CLASSES) {
      expect(poorVs(c).length, c).toBeGreaterThan(0);
      expect(goodVs(c).length, c).toBeGreaterThan(0);
    }
  });

  it('the factor: 1 on Normal and with no class, the mode’s numbers on a trait, 1 on the Shambler', () => {
    expect(classFactor(undefined, 'light', 'brute')).toBe(1);
    expect(classFactor('normal', 'light', 'brute')).toBe(1);
    expect(classFactor('nightmare', undefined, 'brute')).toBe(1);
    expect(classFactor('nightmare', 'light', 'brute')).toBe(0.65);
    expect(classFactor('nightmare', 'heavy', 'brute')).toBe(1.25);
    expect(classFactor('hell', 'light', 'brute')).toBe(0.5);
    expect(classFactor('hell', 'heavy', 'horror')).toBe(1.25);
    expect(classFactor('hell', 'medium', 'brute')).toBe(1);
    for (const c of GUN_CLASSES) expect(classFactor('hell', c, 'shambler')).toBe(1);
    expect(fitOf('hell', 'light', 'brute')).toBe('resist');
    expect(fitOf('hell', 'heavy', 'brute')).toBe('weak');
    expect(fitOf('hell', 'medium', 'brute')).toBeNull();
    expect(fitOf('normal', 'light', 'brute')).toBeNull();
  });

  it('Normal changes nothing: its factors are 1', () => {
    expect(MODES.normal.resist).toBe(1);
    expect(MODES.normal.weak).toBe(1);
  });
});

describe('hordeKindHp (ID-237)', () => {
  it.each([6, 8])(
    'sums to hordeHp for a squad of %i, in both modes, boss and plain hordes',
    (size) => {
      for (const mode of HIGHER_MODES) {
        for (const local of [1, 9, 10, 20, 30]) {
          const eff = effHorde(mode, local);
          const total = hordeKindHp(eff, mode, size).reduce((sum, [, hp]) => sum + hp, 0);
          const whole = hordeHp(eff, mode, size);
          expect(Math.abs(total - whole) / whole, `${mode} ${local}`).toBeLessThan(1e-9);
        }
      }
    },
  );

  it('Normal splits too, and the kinds are in kind order', () => {
    const kinds = hordeKindHp(50).map(([k]) => k);
    expect(kinds).toEqual((Object.keys(ENEMIES) as EnemyKind[]).filter((k) => kinds.includes(k)));
    expect(kinds).toContain('horror');
  });
});

describe('effective power on the shipped table (ID-237)', () => {
  const ratio = (mode: HigherMode, local: number, members: FitMember[]): number =>
    effectivePower(ctxAt(mode, local), members) / members.reduce((sum, m) => sum + m.power, 0);

  it.each(POINTS)(
    '%s horde %i: no class ratio is above 1, and the mix is at least 0.93',
    (mode, local) => {
      for (const c of GUN_CLASSES) expect(ratio(mode, local, squadOf(c)), c).toBeLessThanOrEqual(1);
      expect(ratio(mode, local, MIX)).toBeGreaterThanOrEqual(0.93);
    },
  );

  it.each(POINTS)('%s horde %i: every one-class squad is at or under the mix', (mode, local) => {
    const mix = ratio(mode, local, MIX);
    for (const c of GUN_CLASSES) expect(ratio(mode, local, squadOf(c)), c).toBeLessThanOrEqual(mix);
  });

  it('an all-Light squad in Hell is at 0.80 or under', () => {
    expect(ratio('hell', 1, squadOf('light'))).toBeLessThanOrEqual(0.8);
  });

  it('with no trait either way the effective power is the plain total', () => {
    const none = fitContext('hell', [['shambler', 10]]);
    expect(effectivePower(none, MIX)).toBeCloseTo(800, 9);
    expect(effectivePower(ctxAt('hell', 1), [{ power: 100, cls: null }])).toBeCloseTo(100, 9);
  });

  it('a gun adds power: more members never lower it', () => {
    const ctx = ctxAt('hell', 1);
    for (const c of GUN_CLASSES) {
      expect(effectivePower(ctx, [...MIX, { power: 1, cls: c }])).toBeGreaterThan(
        effectivePower(ctx, MIX),
      );
    }
  });
});

describe('the Fit bands (ID-237)', () => {
  it.each(POINTS)(
    '%s horde %i: no one-class squad reads Good, the 2-of-each squad does',
    (mode, local) => {
      const ctx = ctxAt(mode, local);
      for (const c of GUN_CLASSES) {
        const fit = fitOfSquad(ctx, squadOf(c))!;
        expect(fit.band, c).not.toBe('good');
        expect(worstCover(ctx, squadOf(c)), c).toBeLessThan(0.7);
      }
      expect(fitOfSquad(ctx, MIX)!.band).toBe('good');
      expect(fitOfSquad(ctx, MIX)!.suggest).toEqual([]);
    },
  );

  it('an all-Light squad in Hell reads Poor and is told to add Heavy or Medium', () => {
    const fit = fitOfSquad(ctxAt('hell', 1), squadOf('light'))!;
    expect(fit.band).toBe('poor');
    expect(fit.suggest).toHaveLength(2);
    expect(fit.suggest).not.toContain('light');
  });

  it('nobody is no fit', () => {
    expect(fitOfSquad(ctxAt('hell', 1), [])).toBeNull();
  });
});
