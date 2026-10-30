// Owned weapons (design §6 Gear): a base weapon of a rarity with rolled affixes. The
// free Common Pistol, Knife and Toolkit are held by id; anything rarer is one item
// with its own uid, in the armoury or in one defender's hands. Pure.
import {
  AFFIXES,
  RARITIES,
  RARITY_ORDER,
  WEAPON_DROP,
  WEAPONS,
  type AffixId,
  type FreeWeaponId,
  type Rarity,
  type Weapon,
  type WeaponId,
} from './data.ts';
import { chance, int, pick, type Rng } from './rng.ts';

export interface Affix {
  id: AffixId;
  /** A whole number in the affix's [min, max]: a percent, or 1 for pierce. */
  value: number;
}

export interface OwnedWeapon {
  uid: string;
  base: WeaponId;
  rarity: Rarity;
  affixes: Affix[];
}

/** What a loadout slot holds: a free Common weapon by id, or an owned one. */
export type Held = FreeWeaponId | OwnedWeapon;

export const isOwned = (h: Held | null): h is OwnedWeapon => typeof h === 'object' && h !== null;
export const baseOf = (h: Held): WeaponId => (isOwned(h) ? h.base : h);

/** The affixes base weapon `base` can roll. */
export const affixesFor = (base: WeaponId): AffixId[] =>
  (Object.keys(AFFIXES) as AffixId[]).filter((a) =>
    (AFFIXES[a].kinds as readonly string[]).includes(WEAPONS[base].kind),
  );

/** How many affixes a `rarity` `base` weapon carries: its rarity's count, or as many as fit. */
export const affixCount = (base: WeaponId, rarity: Rarity): number =>
  Math.min(RARITIES[rarity].affixes, affixesFor(base).length);

/** "Military Pistol"; a free weapon is just "Pistol". */
export const heldName = (h: Held): string =>
  isOwned(h) ? `${RARITIES[h.rarity].name} ${WEAPONS[h.base].name}` : WEAPONS[h].name;

const AFFIX_TEXT: Readonly<Record<AffixId, (v: number) => string>> = {
  damage: (v) => `+${v}% damage`,
  fireRate: (v) => `+${v}% fire rate`,
  magazine: (v) => `+${v}% magazine`,
  reload: (v) => `−${v}% reload time`,
  pierce: () => 'Pierce: goes through one more enemy in line',
  repair: (v) => `+${v}% repair`,
};
export const affixText = (a: Affix): string => AFFIX_TEXT[a.id](a.value);

/** "Military Pistol (+12% damage)": the name, then the affixes. */
export const heldLabel = (h: Held): string =>
  isOwned(h) && h.affixes.length
    ? `${heldName(h)} (${h.affixes.map(affixText).join(', ')})`
    : heldName(h);

const share = (h: OwnedWeapon, id: AffixId): number =>
  (h.affixes.find((a) => a.id === id)?.value ?? 0) / 100;

// Worked out once per weapon object: a fight asks for them several times a shot.
const worked = new WeakMap<OwnedWeapon, Weapon>();

/** The numbers `h` fights with: its base weapon's, after rarity and affixes. */
export function statsOf(h: Held): Weapon {
  if (!isOwned(h)) return WEAPONS[h];
  let w = worked.get(h);
  if (!w) worked.set(h, (w = work(h)));
  return w;
}

function work(h: OwnedWeapon): Weapon {
  const w: Weapon = WEAPONS[h.base];
  const power = RARITIES[h.rarity].power;
  const common = {
    name: heldName(h),
    damage: w.damage * power * (1 + share(h, 'damage')),
    fireInterval: w.fireInterval / (1 + share(h, 'fireRate')),
  };
  switch (w.kind) {
    case 'sidearm':
    case 'gun':
      return {
        ...w,
        ...common,
        magazine: Math.round(w.magazine * (1 + share(h, 'magazine'))),
        reload: w.reload * (1 - share(h, 'reload')),
      };
    case 'tool':
      return { ...w, ...common, repair: w.repair * power * (1 + share(h, 'repair')) };
    case 'blade':
      return { ...w, ...common };
  }
}

/** How many enemies a bullet from gun `h` goes through: its base gun's, plus a pierce affix's. */
export const pierceOf = (h: Held): number => {
  const w: Weapon = WEAPONS[baseOf(h)];
  const base = w.kind === 'sidearm' || w.kind === 'gun' ? w.pierce : 0;
  return base + (isOwned(h) ? (h.affixes.find((a) => a.id === 'pierce')?.value ?? 0) : 0);
};

/** Chance that winning horde `hordeNumber` drops a weapon. */
export const dropChance = (hordeNumber: number): number =>
  Math.min(WEAPON_DROP.cap, WEAPON_DROP.base + WEAPON_DROP.perHorde * hordeNumber);

function rollRarity(rng: Rng): Rarity {
  const weights = WEAPON_DROP.rarity;
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    if (roll < weights[r]) return r;
    roll -= weights[r];
  }
  // Only reached through float rounding at the very top: the last weighted rarity.
  return RARITY_ORDER.filter((r) => weights[r] > 0).at(-1)!;
}

/** A new `rarity` `base` weapon with its affixes rolled, each kind at most once. */
export function rollWeapon(rng: Rng, uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon {
  const pool = affixesFor(base);
  const affixes: Affix[] = [];
  for (let n = affixCount(base, rarity); n > 0; n--) {
    const id = pool.splice(int(rng, 0, pool.length - 1), 1)[0]!;
    affixes.push({ id, value: int(rng, AFFIXES[id].min, AFFIXES[id].max) });
  }
  return { uid, base, rarity, affixes };
}

/** The weapon winning horde `hordeNumber` drops, or null (most wins). Its uid is `h<n>`. */
export function rollDrop(rng: Rng, hordeNumber: number): OwnedWeapon | null {
  if (!chance(rng, dropChance(hordeNumber))) return null;
  const base = pick(rng, Object.keys(WEAPONS) as WeaponId[]);
  return rollWeapon(rng, `h${hordeNumber}`, base, rollRarity(rng));
}
