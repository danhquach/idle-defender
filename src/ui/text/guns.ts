// A held weapon in words (ID-269): its name, level, affixes and role line. The numbers come
// from core (`gunStep`, `gunLevel`, `isRoleAffix`); the words live here.
import {
  gunLevel,
  gunStep,
  isOwned,
  isRoleAffix,
  type Affix,
  type Held,
} from '../../core/armoury.ts';
import {
  RARITIES,
  WEAPONS,
  type AffixId,
  type GunBase,
  type GunClass,
  type WeaponId,
} from '../../core/data.ts';

/** "Military Pistol", "Military Pistol +2" once upgraded (ID-208); a free weapon is just "Pistol". */
export const heldName = (h: Held): string =>
  isOwned(h)
    ? `${RARITY_NAME[h.rarity]} ${WEAPON_NAME[h.base]}${gunStep(h) > 0 ? ` +${gunStep(h)}` : ''}`
    : WEAPON_NAME[h];

/** "Lv 12 Military Rifle" (ID-098): the level, then the name. */
export const levelName = (h: Held): string => `Lv ${gunLevel(h)} ${heldName(h)}`;

export const AFFIX_TEXT: Readonly<Record<AffixId, (v: number) => string>> = {
  damage: (v) => `+${v}% damage`,
  fireRate: (v) => `+${v}% fire rate`,
  magazine: (v) => `+${v}% magazine`,
  reload: (v) => `−${v}% reload time`,
  pierce: (v) =>
    v === 1
      ? 'Pierce: goes through one more enemy in line'
      : `Pierce: goes through ${v} more enemies in line`,
  repair: (v) => `+${v}% repair`,
  crit: (v) => `+${v}% crit chance`,
  critDamage: (v) => `+${v}% crit damage`,
  closeDamage: (v) => `+${v}% damage to enemies near the wall`,
  cone: (v) => `+${v}% wider cone`,
  pellets: (v) => `+${v} ${v === 1 ? 'pellet' : 'pellets'}`,
  bossDamage: (v) => `+${v}% damage to bosses, Brutes and Swollen`,
};
export const affixText = (a: Affix): string => AFFIX_TEXT[a.id](a.value);

/** Affix `a` on base weapon `base` as a line: "+5% crit chance (role)" for a role affix (ID-101). */
export const affixLabel = (base: WeaponId, a: Affix): string =>
  isRoleAffix(base, a.id) ? `${affixText(a)} (role)` : affixText(a);

/**
 * `h`'s affixes as lines, role affixes marked "(role)" (ID-101); none for a free weapon.
 * `compact`, for a label that brackets the list, marks them "role +5% crit chance" instead.
 */
export const affixLines = (h: Held, compact = false): string[] =>
  isOwned(h)
    ? h.affixes.map((a) =>
        compact && isRoleAffix(h.base, a.id) ? `role ${affixText(a)}` : affixLabel(h.base, a),
      )
    : [];

/** Gun `base`'s role and built-in trait (ID-101); null for a blade or tool. */
export const roleOf = (base: WeaponId): { readonly role: string; readonly trait: string } | null =>
  Object.hasOwn(GUN_ROLE, base) ? GUN_ROLE[base as GunBase] : null;

/** "Marksman: +10% crit chance": gun `base`'s role and trait (ID-101); null for a blade or tool. */
export const roleLine = (base: WeaponId): string | null => {
  const r = roleOf(base);
  return r ? `${r.role}: ${r.trait}` : null;
};

/** "Military Pistol (+12% damage)": the name, then the affixes. */
export const heldLabel = (h: Held): string =>
  isOwned(h) && h.affixes.length
    ? `${heldName(h)} (${affixLines(h, true).join(', ')})`
    : heldName(h);

/** Each weapon's name. */
export const WEAPON_NAME: Readonly<Record<keyof typeof WEAPONS, string>> = {
  pistol: 'Pistol',
  smg: 'SMG',
  rifle: 'Carbine',
  shotgun: 'Pump Shotgun',
  lmg: 'LMG',
  sniper: 'Sniper rifle',
  handcannon: 'Hand Cannon',
  machinepistol: 'Machine Pistol',
  assault: 'Assault Rifle',
  cartridge: 'Drum Shotgun',
  knife: 'Knife',
  toolkit: 'Toolkit',
};

/** Each rarity's name. */
export const RARITY_NAME: Readonly<Record<keyof typeof RARITIES, string>> = {
  rusty: 'Rusty',
  common: 'Common',
  military: 'Military',
  prototype: 'Prototype',
  relic: 'Relic',
};

/** Each gun class's name (ID-237). */
export const GUN_CLASS_NAME: Readonly<Record<GunClass, string>> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  spread: 'Spread',
};

/**
 * Gun roles (ID-101, design Part 4): each gun's role and the built-in trait every one of
 * it has, Rusty or Relic. The trait numbers are `TRAIT`'s (core/data.ts).
 */
export const GUN_ROLE: Readonly<
  Record<GunBase, { readonly role: string; readonly trait: string }>
> = {
  pistol: { role: 'All-rounder', trait: 'Fastest reload of any gun' },
  smg: { role: 'Swarm shredder', trait: '+25% damage to enemies near the wall' },
  rifle: { role: 'Marksman', trait: 'Fires 3-round bursts; +10% crit chance' },
  shotgun: {
    role: 'Wall stopper',
    trait: 'Loads shell by shell; a hit knocks an enemy near the wall back',
  },
  lmg: { role: 'Shredder', trait: '+8% crit chance' },
  sniper: {
    role: 'Boss and heavy killer',
    trait: '+20% crit chance, +50% crit damage; crits ignore armour; 10% chance to pierce',
  },
  handcannon: { role: 'Heavy sidearm', trait: 'Each hit knocks the enemy back a little' },
  machinepistol: { role: 'Close backup', trait: 'Fastest fire of any gun' },
  assault: { role: 'Assault', trait: '+5% crit chance' },
  cartridge: { role: 'Crowd stopper', trait: 'A hit knocks an enemy near the wall back' },
};
