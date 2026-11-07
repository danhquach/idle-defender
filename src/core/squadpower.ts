// Squad Power and Recommended Power (ID-098, design §11 Farming): one number for the
// squad's strength, and one for what each horde-only horde asks, so a stuck player can
// see how far short they are. Advice only: it never blocks a start. Pure.
import { gunCrit, gunCritDamage, statsOf } from './armoury.ts';
import { DEFENDER_HP, POWER, SWARM, type EnemyKind } from './data.ts';
import type { GameState, RosterDefender } from './game.ts';
import { squadHpScale, squadOf, squadSpec } from './hordeonly.ts';
import { critChance, critDamage, maxHpOf, reloadTime, statBonus } from './stats.ts';
import { enemyHp, hordeBosses, swarmWave, waveCount, waveMix, waveSize } from './waves.ts';

/**
 * One survivor's share of Squad Power: their gun's sustained dmg/s (rarity, level and
 * affixes; Sharp Mind's crit and the gun's own, ID-101; tighter aim; Agility's reload), times a toughness
 * factor from Instinct's extra HP. Cards and skills don't count.
 */
export function survivorPower(d: RosterDefender): number {
  const spec = squadSpec(d);
  const gun = spec.loadout.primary;
  const w = statsOf(gun);
  if (w.kind !== 'sidearm' && w.kind !== 'gun') return 0;
  const crit = 1 + (critChance(spec) + gunCrit(gun)) * (critDamage(spec) + gunCritDamage(gun) - 1);
  const aim = 1 + POWER.aim * statBonus(spec.stats?.mind ?? 0, 'mind', 'spread');
  const dps =
    (w.damage * w.pellets * crit * aim * w.magazine) /
    (w.magazine * w.fireInterval + reloadTime(spec, gun));
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
    total += waveSize(n, w) * (swarm ? SWARM.size * POWER.rec.swarm : 1) * mean;
  }
  for (const b of hordeBosses(n, true)) total += b.hp * enemyHp(b.kind, n, b.wave, scale);
  return total;
}

/**
 * Recommended Power for horde-only Horde `n` (ID-098): `POWER.rec` fitted so a squad at
 * it wins about half the time with no cards or skills (the balance test shows it).
 */
export const recommendedPower = (n: number): number =>
  Math.round((POWER.rec.early[n - 1] ?? 1) * POWER.rec.k * hordeHp(n) ** POWER.rec.e);

/** How Squad Power stands against a horde's Recommended Power (ID-098). */
export type PowerBand = 'ok' | 'close' | 'short';

/** Green at or above Recommended, amber within `POWER.close` below, red further below. */
export function powerBand(power: number, recommended: number): PowerBand {
  if (power >= recommended) return 'ok';
  return power >= recommended * (1 - POWER.close) ? 'close' : 'short';
}
