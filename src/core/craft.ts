// Blueprints and crafting (ID-209, design §6 Gear): a won horde can drop a blueprint, a gun type
// with no rarity; a blueprint and Scrap craft that gun at once, the rarity rolled by how much
// Scrap went in. Pure, and every roll comes from `rng.ts`. Spending (the stash, the Scrap) is
// `craftGun` in `hordeonly.ts`, next to `upgradeGun`.
import { DROP_GUNS, rollRarity } from './armoury.ts';
import {
  BLUEPRINT,
  CRAFT,
  FREE_WEAPONS,
  RARITY_ORDER,
  type Rarity,
  type WeaponId,
} from './data.ts';
import { chance, createRng, pick, type Rng } from './rng.ts';

/** The blueprints held, a count per gun type (a type with none has no key). */
export type Blueprints = Partial<Record<WeaponId, number>>;

/** What a horde-only camp keeps of crafting: its blueprints, and how many guns it has crafted. */
export interface Craft {
  blueprints: Blueprints;
  /** Guns crafted so far; the next one's uid is `f<made + 1>`, and it seeds the roll. */
  made: number;
}

/**
 * The gun types a blueprint can name: every drop gun but the free pistol, so the odds shown are
 * the odds rolled (a dropped Pistol is never below `PISTOL_DROP_FLOOR`).
 */
export const BLUEPRINT_GUNS: readonly WeaponId[] = DROP_GUNS.filter(
  (b) => !(FREE_WEAPONS as readonly WeaponId[]).includes(b),
);

/** The stream a horde's blueprint rolls from: its own, so no gun drop ever moves. */
const BLUEPRINT_STREAM = 0x2c1b3c6d;
/** The stream a craft rolls from, with the horde and the guns crafted so far. */
const CRAFT_STREAM = 0x68e31da4;

/**
 * The blueprint horde seed `seed` drops, or null (`BLUEPRINT.chance`; at most one a horde). The
 * caller only asks of a won horde that drops. The same seed always gives the same answer.
 */
export function rollBlueprint(seed: number): WeaponId | null {
  const rng = createRng(seed ^ BLUEPRINT_STREAM);
  return chance(rng, BLUEPRINT.chance) ? pick(rng, BLUEPRINT_GUNS) : null;
}

/** How many `base` blueprints `game` holds. */
export const blueprintCount = (game: { craft?: Craft }, base: WeaponId): number =>
  game.craft?.blueprints[base] ?? 0;

/** Every blueprint held, in `BLUEPRINT_GUNS` order: the gun type and how many. */
export const blueprintsOf = (game: { craft?: Craft }): { base: WeaponId; count: number }[] =>
  BLUEPRINT_GUNS.flatMap((base) => {
    const count = blueprintCount(game, base);
    return count > 0 ? [{ base, count }] : [];
  });

/** `craft` with one more `base` blueprint, never past `BLUEPRINT.cap` of a type. */
export function withBlueprint(craft: Craft | undefined, base: WeaponId): Craft {
  const held = craft?.blueprints[base] ?? 0;
  return {
    blueprints: { ...craft?.blueprints, [base]: Math.min(BLUEPRINT.cap, held + 1) },
    made: craft?.made ?? 0,
  };
}

/**
 * `craft` with one `base` blueprint used up (a type with none left loses its key) and `made`
 * more guns crafted; null when nothing is left to keep (no blueprints, no gun ever crafted),
 * so the save has one form for "none".
 */
export function withoutBlueprint(craft: Craft, base: WeaponId, made = 0): Craft | null {
  const blueprints = { ...craft.blueprints };
  const left = (blueprints[base] ?? 0) - 1;
  if (left > 0) blueprints[base] = left;
  else delete blueprints[base];
  const total = craft.made + made;
  return Object.keys(blueprints).length === 0 && total === 0 ? null : { blueprints, made: total };
}

/** Every Scrap amount a craft takes, lowest first: `CRAFT.min` and `CRAFT.steps` more steps. */
export const craftAmounts = (): number[] =>
  Array.from({ length: CRAFT.steps + 1 }, (_, i) => CRAFT.min + CRAFT.step * i);

/** Whether `amount` is one a craft takes (`craftAmounts`). */
export const isCraftAmount = (amount: number): boolean => craftAmounts().includes(amount);

/** The extra steps of Scrap `amount` is worth, 0 at `CRAFT.min` up to `CRAFT.steps`; between steps, the step below. */
export function craftSteps(amount: number): number {
  const steps = Math.floor((amount - CRAFT.min) / CRAFT.step);
  return Number.isNaN(steps) ? 0 : Math.max(0, Math.min(CRAFT.steps, steps));
}

/**
 * The odds, in percent, of each rarity for `amount` Scrap (ID-209): `CRAFT.from` at the minimum,
 * moving evenly toward `CRAFT.to` with each extra step, which it reaches at the most. Sums to
 * 100. An amount outside the range counts as the nearest end.
 */
export function craftOdds(amount: number): Record<Rarity, number> {
  const s = craftSteps(amount);
  const out = { rusty: 0, common: 0, military: 0, prototype: 0, relic: 0 };
  for (const r of RARITY_ORDER)
    out[r] = CRAFT.from[r] + ((CRAFT.to[r] - CRAFT.from[r]) * s) / CRAFT.steps;
  return out;
}

/** The random source the next craft rolls from: the guns crafted so far and the horde, so a replay of the same camp repeats it. */
export function craftRng(game: { craft?: Craft; hordeNumber: number }): Rng {
  const made = game.craft?.made ?? 0;
  const seed =
    Math.imul(made + 1, 0x9e3779b1) ^ Math.imul(game.hordeNumber, 0x85ebca6b) ^ CRAFT_STREAM;
  return createRng(seed);
}

/** A rarity for `amount` Scrap off `rng`. */
export const rollCraftRarity = (rng: Rng, amount: number): Rarity =>
  rollRarity(rng, craftOdds(amount));
