// Squad Power and Recommended Power (ID-098, design §11 Farming): one number for the
// squad's strength, and one for what each horde-only horde asks, so a stuck player can
// see how far short they are. Advice only: it never blocks a start. Pure.
import { gunCrit, gunCritDamage, statsOf } from './armoury.ts';
import { DEFENDER_HP, POWER, SPAWN_INTERVAL, SWARM, WAVE_BREAK, type EnemyKind } from './data.ts';
import type { GameState, RosterDefender } from './game.ts';
import { squadHpScale, squadOf, squadSpec } from './hordeonly.ts';
import { critChance, critDamage, maxHpOf, reloadTime, statBonus, wallDamage } from './stats.ts';
import { enemyHp, hordeBosses, swarmWave, waveCount, waveMix, waveSize } from './waves.ts';

/**
 * One survivor's share of Squad Power: their gun's sustained dmg/s (rarity, level and
 * affixes; Sharp Mind's crit and the gun's own, ID-101; tighter aim; Agility's reload and fire
 * rate, ID-125; Instinct's damage near the wall, ID-125), times a toughness factor from
 * Instinct's extra HP. Cards and skills don't count.
 */
export function survivorPower(d: RosterDefender): number {
  const spec = squadSpec(d);
  const gun = spec.loadout.primary;
  const w = statsOf(gun);
  if (w.kind !== 'sidearm' && w.kind !== 'gun') return 0;
  const crit = 1 + (critChance(spec) + gunCrit(gun)) * (critDamage(spec) + gunCritDamage(gun) - 1);
  const aim = 1 + POWER.aim * statBonus(spec.stats?.mind ?? 0, 'mind', 'spread');
  const wall = 1 + POWER.wall * wallDamage(spec);
  const rate = 1 + statBonus(spec.stats?.agility ?? 0, 'agility', 'fireRate');
  const dps =
    (w.damage * w.pellets * crit * aim * wall * w.magazine) /
    ((w.magazine * w.fireInterval) / rate + reloadTime(spec, gun));
  const tough = 1 + POWER.tough * (maxHpOf(spec) / DEFENDER_HP - 1);
  return dps * tough * POWER.scale;
}

/** Squad Power (ID-098): every squad survivor's `survivorPower`, summed, rounded. */
export const squadPower = (game: Pick<GameState, 'roster'>): number =>
  Math.round(squadOf(game).reduce((sum, d) => sum + survivorPower(d), 0));

/**
 * The enemy HP horde-only Horde `n` brings, as expected: each wave's size times its mix's
 * mean HP (a swarm wave's doubled size and Runner-heavy mix, weighted `POWER.rec.swarm`,
 * ID-099), plus its bosses and mini-boss at their HP.
 */
export function hordeHp(n: number): number {
  const scale = squadHpScale(n);
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
  for (const b of hordeBosses(n, true)) total += b.hp * enemyHp(b.kind, n, b.wave, scale);
  return total;
}

/**
 * How long horde-only Horde `n`'s waves take to spawn, in fight seconds (ID-102): each
 * wave's enemies `SPAWN_INTERVAL` apart (a swarm wave's twice as many in the same time),
 * and the break after it.
 */
export function hordeSeconds(n: number): number {
  let total = 0;
  for (let w = 1; w <= waveCount(n); w++)
    total += waveSize(n, w, true) * SPAWN_INTERVAL + WAVE_BREAK;
  return total;
}

/**
 * Recommended Power for horde-only Horde `n` (ID-098, ID-102): the dmg/s it asks for, its
 * `hordeHp` over `hordeSeconds`, × `POWER.rec` (more for a boss horde), fitted so a squad at it wins about half
 * the time with no cards or skills (the balance test shows it).
 */
export function recommendedPower(n: number): number {
  const boss = hordeBosses(n, true).some((b) => !b.elite) ? POWER.rec.boss : 1;
  return Math.round(
    (POWER.rec.early[n - 1] ?? 1) * boss * POWER.rec.k * (hordeHp(n) / hordeSeconds(n)),
  );
}

/** How Squad Power stands against a horde's Recommended Power (ID-098). */
export type PowerBand = 'ok' | 'close' | 'short';

/** Green at or above Recommended, amber within `POWER.close` below, red further below. */
export function powerBand(power: number, recommended: number): PowerBand {
  if (power >= recommended) return 'ok';
  return power >= recommended * (1 - POWER.close) ? 'close' : 'short';
}
