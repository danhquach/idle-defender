// Owned weapons (design §6 Gear): a base weapon of a rarity with rolled affixes. The
// free Common Pistol, Knife and Toolkit are held by id; anything rarer is one item
// with its own uid, in the armoury or in one defender's hands. Pure.
import {
  AFFIXES,
  FARM,
  GUN_LEVEL_DAMAGE,
  PATROL,
  RARITIES,
  RARITY_ORDER,
  SQUAD_DROP,
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
  /** Gun level (ID-098): the horde number it dropped from; absent = 1 (older saves, the full game). */
  level?: number;
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

/** A weapon's gun level (ID-098): an owned one's, else 1 (the free pistol). */
export const gunLevel = (h: Held): number => (isOwned(h) ? (h.level ?? 1) : 1);

/** "Lv 12 Military Rifle" (ID-098): the level, then the name. */
export const levelName = (h: Held): string => `Lv ${gunLevel(h)} ${heldName(h)}`;

/** Gun level `level`'s base damage factor (ID-098): +`GUN_LEVEL_DAMAGE` a level above 1. */
export const levelFactor = (level: number): number => 1 + GUN_LEVEL_DAMAGE * (level - 1);

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
    damage: w.damage * levelFactor(gunLevel(h)) * power * (1 + share(h, 'damage')),
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

function rollRarity(rng: Rng, weights: Record<Rarity, number> = WEAPON_DROP.rarity): Rarity {
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    if (roll < weights[r]) return r;
    roll -= weights[r];
  }
  // Only reached through float rounding at the very top: the last weighted rarity.
  return RARITY_ORDER.filter((r) => weights[r] > 0).at(-1)!;
}

/** A rarity from a tier-`tier` place's weights (`PATROL.rarity`, design §10). */
export function tierRarity(rng: Rng, tier: number): Rarity {
  const weights = PATROL.rarity[tier - 1];
  if (!weights) throw new RangeError(`tierRarity: bad tier ${tier}`);
  const total = RARITY_ORDER.reduce((sum, r) => sum + weights[r], 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    if (roll < weights[r]) return r;
    roll -= weights[r];
  }
  // Only reached through float rounding at the very top: the last weighted rarity.
  return RARITY_ORDER.filter((r) => weights[r] > 0).at(-1)!;
}

/**
 * A new `rarity` `base` weapon with its affixes rolled, each kind at most once; at gun
 * level `level` when given (ID-098), else with no level (1).
 */
export function rollWeapon(
  rng: Rng,
  uid: string,
  base: WeaponId,
  rarity: Rarity,
  level?: number,
): OwnedWeapon {
  const pool = affixesFor(base);
  const affixes: Affix[] = [];
  for (let n = affixCount(base, rarity); n > 0; n--) {
    const id = pool.splice(int(rng, 0, pool.length - 1), 1)[0]!;
    affixes.push({ id, value: int(rng, AFFIXES[id].min, AFFIXES[id].max) });
  }
  return level === undefined
    ? { uid, base, rarity, affixes }
    : { uid, base, rarity, affixes, level };
}

/** The weapon winning horde `hordeNumber` drops, or null (most wins). Its uid is `h<n>`. */
export function rollDrop(rng: Rng, hordeNumber: number): OwnedWeapon | null {
  if (!chance(rng, dropChance(hordeNumber))) return null;
  const base = pick(rng, Object.keys(WEAPONS) as WeaponId[]);
  return rollWeapon(rng, `h${hordeNumber}`, base, rollRarity(rng));
}

/**
 * How hard gun `h` hits over time: damage per second through a magazine and its reload
 * (pellets counted, rarity and affixes applied). What "the weakest" means for the stash.
 */
export function gunPower(h: Held): number {
  const w = statsOf(h);
  if (w.kind !== 'sidearm' && w.kind !== 'gun')
    throw new RangeError(`gunPower: ${baseOf(h)} is no gun`);
  return (w.damage * w.pellets * w.magazine) / (w.magazine * w.fireInterval + w.reload);
}

/**
 * The guns a horde-only win can drop: every specialised gun, in `WEAPONS` order. Not the
 * pistol: every survivor has a free one, so a dropped one would be no reward.
 */
export const DROP_GUNS = (Object.keys(WEAPONS) as WeaponId[]).filter(
  (id) => WEAPONS[id].kind === 'gun',
);

/** The rarity weights horde-only Horde `hordeNumber` drops by (`SQUAD_DROP`, ID-067). */
export function squadDropWeights(hordeNumber: number): Record<Rarity, number> {
  if (!Number.isInteger(hordeNumber) || hordeNumber < 1) {
    throw new RangeError(`squadDropWeights: bad horde ${hordeNumber}`);
  }
  return SQUAD_DROP.filter((b) => b.from <= hordeNumber).at(-1)!.rarity;
}

/** The rarities `weights` can roll, lowest first. */
const weighted = (weights: Record<Rarity, number>): Rarity[] =>
  RARITY_ORDER.filter((r) => weights[r] > 0);

/**
 * A first clear's rarity weights (ID-098): the horde's band, each rarity's share moved up
 * one rarity (Relic stays Relic).
 */
export function firstClearWeights(hordeNumber: number): Record<Rarity, number> {
  const band = squadDropWeights(hordeNumber);
  const out = { rusty: 0, common: 0, military: 0, prototype: 0, relic: 0 };
  RARITY_ORDER.forEach((r, i) => {
    out[RARITY_ORDER[Math.min(i + 1, RARITY_ORDER.length - 1)]!] += band[r];
  });
  return out;
}

/**
 * A replay's rarity weights (ID-098): the horde's band with its top rarity's share halved,
 * the rest moved to the rarity below; then `FARM.badLuckStep` points a bad-luck count
 * moved up one band, each from the lowest rarity left with weight.
 */
export function replayWeights(hordeNumber: number, badLuck = 0): Record<Rarity, number> {
  const out = { ...squadDropWeights(hordeNumber) };
  const has = weighted(out);
  const top = has.at(-1)!;
  const below = RARITY_ORDER[RARITY_ORDER.indexOf(top) - 1];
  if (below && has.length > 0) {
    const half = out[top] / 2;
    out[top] -= half;
    out[below] += half;
  }
  for (let left = FARM.badLuckStep * Math.max(0, badLuck); left > 0;) {
    const low = weighted(out)[0]!;
    const up = RARITY_ORDER[RARITY_ORDER.indexOf(low) + 1];
    if (!up) break;
    const moved = Math.min(left, out[low]);
    out[low] -= moved;
    out[up] += moved;
    left -= moved;
  }
  return out;
}

/** A squad gun of gun level `level`, picked evenly, its rarity by `weights`. */
export function rollSquadGun(
  rng: Rng,
  uid: string,
  weights: Record<Rarity, number>,
  level: number,
): OwnedWeapon {
  const base = pick(rng, DROP_GUNS);
  return rollWeapon(rng, uid, base, rollRarity(rng, weights), level);
}

/** Every way `count` affixes can come from `pool`, each at its max. */
function bestAffixSets(pool: readonly AffixId[], count: number): Affix[][] {
  if (count === 0) return [[]];
  return pool.flatMap((id, i) =>
    bestAffixSets(pool.slice(i + 1), count - 1).map((rest) => [
      { id, value: AFFIXES[id].max },
      ...rest,
    ]),
  );
}

/** The most dmg/s a `rarity` `base` gun at `level` can roll (`gunPower`, every affix maxed). */
export function bestRoll(base: WeaponId, rarity: Rarity, level: number): number {
  return Math.max(
    ...bestAffixSets(affixesFor(base), affixCount(base, rarity)).map((affixes) =>
      gunPower({ uid: 'best', base, rarity, affixes, level }),
    ),
  );
}

/** The most dmg/s any gun `weights` can drop at `level` can have (ID-098). */
export const bestDrop = (weights: Record<Rarity, number>, level: number): number =>
  Math.max(...weighted(weights).flatMap((r) => DROP_GUNS.map((b) => bestRoll(b, r, level))));

/** How many rolls a guaranteed upgrade tries before it takes the best roll there is. */
const UPGRADE_TRIES = 64;

/**
 * A guaranteed upgrade (ID-098): a gun `weights` can drop at `level`, of a rarity at or
 * above `floor` where one can, that beats `beat` dmg/s. Picks evenly among the guns and
 * rarities that can beat it, then rerolls its affixes a bounded number of times, falling
 * back to that gun's best roll, so it always ends. Null when no gun here can beat it.
 */
export function rollUpgrade(
  rng: Rng,
  uid: string,
  weights: Record<Rarity, number>,
  level: number,
  beat: number,
  floor: Rarity,
): OwnedWeapon | null {
  const rarities = weighted(weights);
  const atFloor = rarities.filter((r) => RARITY_ORDER.indexOf(r) >= RARITY_ORDER.indexOf(floor));
  const can = (rs: Rarity[]) =>
    rs.flatMap((rarity) =>
      DROP_GUNS.filter((base) => bestRoll(base, rarity, level) > beat).map((base) => ({
        base,
        rarity,
      })),
    );
  const options = can(atFloor).length > 0 ? can(atFloor) : can(rarities);
  if (options.length === 0) return null;
  const { base, rarity } = pick(rng, options);
  for (let i = 0; i < UPGRADE_TRIES; i++) {
    const w = rollWeapon(rng, uid, base, rarity, level);
    if (gunPower(w) > beat) return w;
  }
  const best = bestAffixSets(affixesFor(base), affixCount(base, rarity))
    .map((affixes): OwnedWeapon => ({ uid, base, rarity, affixes, level }))
    .reduce((a, b) => (gunPower(b) > gunPower(a) ? b : a));
  return best;
}
