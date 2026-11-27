// A held weapon in words (ID-269), pinned to the text core gave before it moved.
import { describe, expect, it } from 'vitest';
import type { Affix, OwnedWeapon } from '../../core/armoury.ts';
import { AFFIX_IDS, GUN_CLASS, type Rarity, type WeaponId } from '../../core/data.ts';
import {
  AFFIX_TEXT,
  affixLabel,
  affixLines,
  affixText,
  heldLabel,
  heldName,
  levelName,
  roleLine,
  GUN_ROLE,
  roleOf,
} from './guns.ts';

/** Every gun base (each has a class, ID-237). */
const GUN_BASES = Object.keys(GUN_CLASS) as (keyof typeof GUN_CLASS)[];

const gun = (
  base: WeaponId,
  rarity: Rarity,
  more: Partial<OwnedWeapon> = {},
  affixes: Affix[] = [],
): OwnedWeapon => ({ uid: 'u', base, rarity, affixes, ...more });

describe('weapon names (ID-269)', () => {
  it('names: "Military Pistol (+12% damage)"; a free weapon is plain', () => {
    const w = gun('pistol', 'prototype', {}, [
      { id: 'damage', value: 12 },
      { id: 'reload', value: 10 },
    ]);
    expect(heldName(w)).toBe('Prototype Pistol');
    expect(heldLabel(w)).toBe('Prototype Pistol (+12% damage, −10% reload time)');
    expect(heldLabel('knife')).toBe('Knife');
  });

  it('shows +N after the name, nothing at +0', () => {
    expect(heldName(gun('smg', 'common'))).toBe('Common SMG');
    expect(heldName(gun('smg', 'common', { step: 2 }))).toBe('Common SMG +2');
    expect(levelName(gun('smg', 'common', { level: 3, step: 2 }))).toBe('Lv 3 Common SMG +2');
    expect(heldLabel(gun('smg', 'military', { step: 1 }, [{ id: 'damage', value: 5 }]))).toBe(
      'Military SMG +1 (+5% damage)',
    );
  });

  it('shows the level as "Lv n Name"', () => {
    expect(levelName(gun('rifle', 'military', { level: 12 }))).toBe('Lv 12 Military Carbine');
    expect(levelName('pistol')).toBe('Lv 1 Pistol');
  });
});

describe('affixes (ID-269)', () => {
  it('words every affix, singular and plural', () => {
    expect(AFFIX_IDS.every((id) => AFFIX_TEXT[id] !== undefined)).toBe(true);
    expect(affixText({ id: 'damage', value: 12 })).toBe('+12% damage');
    expect(affixText({ id: 'reload', value: 10 })).toBe('−10% reload time');
    expect(affixText({ id: 'pierce', value: 1 })).toBe(
      'Pierce: goes through one more enemy in line',
    );
    expect(affixText({ id: 'pierce', value: 2 })).toBe(
      'Pierce: goes through 2 more enemies in line',
    );
    expect(affixText({ id: 'pellets', value: 1 })).toBe('+1 pellet');
    expect(affixText({ id: 'pellets', value: 2 })).toBe('+2 pellets');
    expect(affixText({ id: 'bossDamage', value: 20 })).toBe(
      '+20% damage to bosses, Brutes and Swollen',
    );
  });

  it('marks a role affix "(role)", or "role …" in a compact label', () => {
    expect(affixLabel('rifle', { id: 'crit', value: 5 })).toBe('+5% crit chance (role)');
    expect(affixLabel('rifle', { id: 'damage', value: 5 })).toBe('+5% damage');
    const w = gun('rifle', 'military', {}, [{ id: 'crit', value: 5 }]);
    expect(affixLines(w)).toEqual(['+5% crit chance (role)']);
    expect(affixLines(w, true)).toEqual(['role +5% crit chance']);
    expect(affixLines('pistol')).toEqual([]);
  });

  it('every gun has a role and a trait; blades and tools have none', () => {
    for (const g of GUN_BASES) {
      expect(roleOf(g)).toEqual(GUN_ROLE[g]);
      expect(GUN_ROLE[g].role.length).toBeGreaterThan(0);
      expect(GUN_ROLE[g].trait.length).toBeGreaterThan(0);
    }
    expect(roleOf('knife')).toBeNull();
    expect(roleOf('toolkit')).toBeNull();
    expect(roleOf('lmg')?.trait).toMatch(/crit/);
  });

  it("a gun's role line; none for a blade or tool", () => {
    expect(roleLine('knife')).toBeNull();
    expect(roleLine('toolkit')).toBeNull();
    expect(roleLine('rifle')).toBe('Marksman: Fires 3-round bursts; +10% crit chance');
  });
});
