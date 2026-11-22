// Squad Power and Recommended Power (ID-098, design §11 Farming): one number for the
// squad's strength, and one for what each horde-only horde asks, so a stuck player can
// see how far short they are. Advice only: it never blocks a start. Pure.
import { INJURY_BAND, POWER, SWARM, type EnemyKind } from './data.ts';
import type { GameState } from './game.ts';
import { squadHpScale, squadOf, survivorPower } from './hordeonly.ts';
import { wavePace } from './pacing.ts';
import { MODES, modeBosses, type Mode } from './modes.ts';
import { enemyHp, swarmWave, waveCount, waveMix, waveSize } from './waves.ts';

// One survivor's share lives in hordeonly.ts, where "Best squad" (ID-154) ranks by it.
export { survivorPower };

/** Squad Power (ID-098): every squad survivor's `survivorPower`, summed, rounded. */
export const squadPower = (game: Pick<GameState, 'roster'>): number =>
  Math.round(squadOf(game).reduce((sum, d) => sum + survivorPower(d), 0));

/**
 * The enemy HP horde-only Horde `n` brings, as expected: each wave's size times its mix's
 * mean HP (a swarm wave's doubled size and Runner-heavy mix, weighted `POWER.rec.swarm`,
 * ID-099), plus its bosses and mini-boss at their HP. `n` is the horde's strength; a higher
 * `mode`'s (ID-218) bosses and HP factor are its own.
 */
export function hordeHp(n: number, mode: Mode = 'normal'): number {
  const scale = squadHpScale(n) * MODES[mode].hpScale;
  const waves = waveCount(n);
  let total = 0;
  for (let w = 1; w <= waves; w++) {
    const swarm = swarmWave(n, w);
    const mean = waveMix(n, swarm).reduce(
      (sum, [kind, share]: [EnemyKind, number]) => sum + share * enemyHp(kind, n, w, scale),
      0,
    );
    total += waveSize(n, w, true) * (swarm ? SWARM.size * POWER.rec.swarm : 1) * mean;
  }
  for (const b of modeBosses(mode, n - MODES[mode].offset))
    total += b.hp * enemyHp(b.kind, n, b.wave, scale);
  return total;
}

/**
 * How long horde-only Horde `n`'s waves take to spawn, in fight seconds (ID-102): each
 * wave's enemies its pacing's `interval` apart (a swarm wave's twice as many in the same
 * time), and the break before it. With waves overlapping (ID-128), about a fight's length.
 * A partial overlap (ID-171, `Pace.overlap`) is left out: it makes a fight a little longer
 * than this, so Recommended Power asks a little more than the horde needs, the safe side.
 */
export function hordeSeconds(n: number): number {
  const pace = wavePace(n, true);
  let total = 0;
  for (let w = 1; w <= waveCount(n); w++)
    total += waveSize(n, w, true) * pace.interval + pace.break;
  return total;
}

/**
 * Recommended Power for horde-only Horde `n` (ID-098, ID-102): the dmg/s it asks for, its
 * `hordeHp` over `hordeSeconds`, × `POWER.rec` (more for a boss horde), fitted so a squad at
 * it wins about half the time with the scripted player's cards and skills, an average build
 * (ID-128; with no cards before; the balance test shows it). `n` is the horde's strength; in a
 * higher `mode` (ID-218) it is the effective horde, with that mode's bosses and HP factor.
 */
export function recommendedPower(n: number, mode: Mode = 'normal'): number {
  const boss = modeBosses(mode, n - MODES[mode].offset).some((b) => !b.elite) ? POWER.rec.boss : 1;
  // Hordes 1 to 10 by `early`, past Horde 10 by `late` (ID-136).
  const stage = POWER.rec.early[n - 1] ?? POWER.rec.late;
  return Math.round(stage * boss * POWER.rec.k * (hordeHp(n, mode) / hordeSeconds(n)));
}

/** How Squad Power stands against a horde's Recommended Power (ID-098). */
export type PowerBand = 'ok' | 'close' | 'short';

/** Green at or above Recommended, amber within `POWER.close` below, red further below. */
export function powerBand(power: number, recommended: number): PowerBand {
  if (power >= recommended) return 'ok';
  return power >= recommended * (1 - POWER.close) ? 'close' : 'short';
}

/** How many survivors a win is likely to cost (ID-155): a rough band, never a %. */
export type InjuryBand = 'few' | 'some' | 'heavy';

/**
 * The injury band for Squad Power `power` against Recommended `recommended` (ID-155): few at
 * or above `INJURY_BAND.few` times it, some at or above `INJURY_BAND.some` times, else heavy.
 * Squad Power counts dmg/s only, so this is a band, measured, and only advice.
 */
export function injuryBand(power: number, recommended: number): InjuryBand {
  if (power >= recommended * INJURY_BAND.few) return 'few';
  return power >= recommended * INJURY_BAND.some ? 'some' : 'heavy';
}
