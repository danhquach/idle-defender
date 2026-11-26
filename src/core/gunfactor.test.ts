// Squad Power's gun factor (ID-247): each gun counts for POWER.gun of its paper dmg/s in Squad
// Power and the scripted player's gun choice; the DPS labels (survivorDps) stay paper.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from './armoury.ts';
import { DEFENDER_HP, POWER, WEAPONS, type GunBase } from './data.ts';
import { survivorPower, squadSpec } from './hordeonly.ts';
import { createRng } from './rng.ts';
import { ratedDps, maxHpOf, survivorDps, type Statted } from './stats.ts';
import { squadPower } from './squadpower.ts';
import { squadAt } from './balance/shared.ts';

const GUN_BASES = Object.keys(POWER.gun) as GunBase[];
const who = (primary: Statted['loadout']['primary']): Statted => ({
  loadout: { primary, secondary: null, item: null },
});
const owned = (base: GunBase) => rollWeapon(createRng(3), 'u1', base, 'military', 5);

describe('POWER.gun (ID-247)', () => {
  it('has a finite factor in (0, 1] for every gun and sidearm in WEAPONS, rifle 1', () => {
    const guns = Object.entries(WEAPONS)
      .filter(([, w]) => w.kind === 'gun' || w.kind === 'sidearm')
      .map(([id]) => id)
      .sort();
    expect([...GUN_BASES].sort()).toEqual(guns);
    for (const b of GUN_BASES) {
      expect(Number.isFinite(POWER.gun[b])).toBe(true);
      expect(POWER.gun[b]).toBeGreaterThan(0);
      expect(POWER.gun[b]).toBeLessThanOrEqual(1);
    }
    expect(POWER.gun.rifle).toBe(1);
  });

  it('an owned shotgun counts for 0.47 of its paper dmg/s', () => {
    const d = who(owned('shotgun'));
    expect(survivorDps(d, d.loadout.primary)).toBeGreaterThan(0);
    expect(ratedDps(d, d.loadout.primary)).toBeCloseTo(0.47 * survivorDps(d, d.loadout.primary), 9);
  });

  it('a free pistol counts for its factor', () => {
    const d = who('pistol');
    expect(ratedDps(d, 'pistol')).toBeCloseTo(POWER.gun.pistol * survivorDps(d, 'pistol'), 9);
  });

  it('a blade and a tool count for 0, not NaN', () => {
    const d = who('knife');
    expect(ratedDps(d, 'knife')).toBe(0);
    expect(ratedDps(d, 'toolkit')).toBe(0);
  });

  it('survivorDps stays the paper dmg/s of a rifle and a shotgun alike', () => {
    const d = who('pistol');
    const s = owned('shotgun');
    expect(survivorDps(d, s)).toBeGreaterThan(ratedDps(d, s));
    expect(survivorDps(d, s)).toBeCloseTo(ratedDps(d, s) / POWER.gun.shotgun, 9);
  });

  it('an all-rifle squad keeps its old Squad Power (the golden digests rest on it)', () => {
    const game = squadAt(6, 6);
    const old = game.roster.reduce((sum, r) => {
      const s = squadSpec(r);
      const tough = 1 + POWER.tough * (maxHpOf(s) / DEFENDER_HP - 1);
      return sum + survivorDps(s, s.loadout.primary) * tough * POWER.scale;
    }, 0);
    expect(game.roster.reduce((sum, r) => sum + survivorPower(r), 0)).toBeCloseTo(old, 6);
    expect(squadPower(game)).toBe(Math.round(old));
  });
});
