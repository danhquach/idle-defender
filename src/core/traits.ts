// Gun classes against enemy traits (ID-237, design §11): in Nightmare and Hell most enemy kinds
// resist one class of gun and are weak to another. Pure maths over the tables in data.ts and
// the mode's numbers: the fight multiplies a bullet's damage by `classFactor`, and the squad
// tools and the Fit pill read `effectivePower`. Imports data, modes and armoury only, so
// hordeonly.ts and squadpower.ts can both use it.
import { baseOf, type Held } from './armoury.ts';
import {
  ENEMY_TRAITS,
  GUN_CLASS,
  GUN_CLASSES,
  FIT,
  type EnemyKind,
  type GunClass,
  type WeaponId,
} from './data.ts';
import { MODES, type HigherMode, type Mode } from './modes.ts';

/** The class of the gun `h`, null for a weapon that is no gun. */
export function classOf(h: Held | WeaponId): GunClass | null {
  const base = typeof h === 'object' ? baseOf(h) : h;
  return (GUN_CLASS as Readonly<Record<string, GunClass>>)[base] ?? null;
}

/**
 * The share of a `cls` bullet's damage an enemy of `kind` takes in `mode`: the mode's
 * `resist` for its resisted class, `weak` for its weak-to class, else 1. Exactly 1 with no
 * mode or no class (Normal, a turret's bullet).
 */
export function classFactor(
  mode: Mode | undefined,
  cls: GunClass | undefined,
  kind: EnemyKind,
): number {
  const fit = fitOf(mode, cls, kind);
  return fit === null ? 1 : fit === 'weak' ? MODES[mode!].weak : MODES[mode!].resist;
}

/** Whether a `cls` bullet meets a weakness or a resistance on `kind` (null for neither or no mode). */
export function fitOf(
  mode: Mode | undefined,
  cls: GunClass | undefined,
  kind: EnemyKind,
): 'weak' | 'resist' | null {
  const trait = ENEMY_TRAITS[kind];
  if (mode === undefined || mode === 'normal' || cls === undefined || !trait) return null;
  return cls === trait.weak ? 'weak' : cls === trait.resists ? 'resist' : null;
}

/** The kinds weak to `cls`, in kind order. */
export const goodVs = (cls: GunClass): EnemyKind[] =>
  (Object.keys(ENEMY_TRAITS) as EnemyKind[]).filter((k) => ENEMY_TRAITS[k]?.weak === cls);

/** The kinds that resist `cls`, in kind order. */
export const poorVs = (cls: GunClass): EnemyKind[] =>
  (Object.keys(ENEMY_TRAITS) as EnemyKind[]).filter((k) => ENEMY_TRAITS[k]?.resists === cls);

/** What a horde asks of a squad: each kind's share of its HP, and each class's factor on it. */
export interface FitContext {
  /** Each kind the horde brings with its share of the horde's HP (sums to 1). */
  shares: readonly (readonly [EnemyKind, number])[];
  /** `factor[cls][k]`: the class's damage factor on `shares[k]`'s kind. */
  factor: Readonly<Record<GunClass, readonly number[]>>;
}

/** A squad member as the fit sees them: their power and their gun's class (null: no trait either way). */
export interface FitMember {
  power: number;
  cls: GunClass | null;
}

/** The context for a `mode` horde whose HP splits into `hp` (kind, HP) pairs; built once per call of a tool or a screen. */
export function fitContext(
  mode: HigherMode,
  hp: readonly (readonly [EnemyKind, number])[],
): FitContext {
  const total = hp.reduce((sum, [, h]) => sum + h, 0);
  const shares = hp.filter(([, h]) => h > 0).map(([k, h]) => [k, h / total] as const);
  const factor = Object.fromEntries(
    GUN_CLASSES.map((c) => [c, shares.map(([k]) => classFactor(mode, c, k))]),
  ) as Record<GunClass, number[]>;
  return { shares, factor };
}

const factorOf = (ctx: FitContext, cls: GunClass | null, k: number): number =>
  cls === null ? 1 : ctx.factor[cls][k]!;

/**
 * The power of `sums` (the squad's power against each kind) as one number: the squad kills
 * each kind's HP share at that kind's rate, so the horde takes the harmonic mean, 1 over the
 * sum of share over rate. With every factor 1 it is the plain total.
 */
export function powerOver(ctx: FitContext, sums: readonly number[]): number {
  let need = 0;
  for (let k = 0; k < ctx.shares.length; k++) {
    if (sums[k]! <= 0) return 0;
    need += ctx.shares[k]![1] / sums[k]!;
  }
  return need > 0 ? 1 / need : 0;
}

/** One member's power against each kind: their power times their class's factor. */
export const memberSums = (ctx: FitContext, m: FitMember): number[] =>
  ctx.shares.map((_, k) => m.power * factorOf(ctx, m.cls, k));

/** The squad's power against each kind, summed over `members`. */
export function squadSums(ctx: FitContext, members: readonly FitMember[]): number[] {
  const sums = ctx.shares.map(() => 0);
  for (const m of members)
    for (let k = 0; k < sums.length; k++) sums[k]! += m.power * factorOf(ctx, m.cls, k);
  return sums;
}

/** The squad's effective power (ID-237): its Squad Power with each class's resists and weaknesses counted. */
export const effectivePower = (ctx: FitContext, members: readonly FitMember[]): number =>
  powerOver(ctx, squadSums(ctx, members));

/** The least any kind's cover is: the squad's power against it over its total power (1 for nobody). */
export function worstCover(ctx: FitContext, members: readonly FitMember[]): number {
  const total = members.reduce((sum, m) => sum + m.power, 0);
  if (total <= 0) return 1;
  return Math.min(1, ...squadSums(ctx, members).map((s) => s / total));
}

/** The Fit pill's band (ID-237). */
export type FitBand = 'good' | 'fair' | 'poor';

/** How well a squad fits a horde: effective over total power, the band, and the classes whose added gun would help most. */
export interface Fit {
  value: number;
  band: FitBand;
  /** On Fair or Poor, the two classes whose added gun raises the effective power most; else empty. */
  suggest: GunClass[];
}

/** `members`' fit to `ctx` (ID-237): null for nobody. */
export function fitOfSquad(ctx: FitContext, members: readonly FitMember[]): Fit | null {
  const total = members.reduce((sum, m) => sum + m.power, 0);
  if (members.length === 0 || total <= 0) return null;
  const value = effectivePower(ctx, members) / total;
  const band: FitBand =
    value >= FIT.good && worstCover(ctx, members) >= FIT.floor
      ? 'good'
      : value >= FIT.fair
        ? 'fair'
        : 'poor';
  if (band === 'good') return { value, band, suggest: [] };
  // An added gun of the squad's average power, one class at a time; ties to class order.
  const mean = total / members.length;
  const gain = (c: GunClass): number => effectivePower(ctx, [...members, { power: mean, cls: c }]);
  const suggest = GUN_CLASSES.map((c, i) => ({ c, i, g: gain(c) }))
    .sort((a, b) => b.g - a.g || a.i - b.i)
    .slice(0, 2)
    .map(({ c }) => c);
  return { value, band, suggest };
}
