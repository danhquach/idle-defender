import { ENEMIES, type EnemyKind } from './data.ts';

function whole(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError(`${name}: expected a whole number >= 1, got ${n}`);
}

/** Waves in a horde: 5, one more every second horde, at most 10. */
export function waveCount(hordeNumber: number): number {
  whole('waveCount', hordeNumber);
  return Math.min(10, 5 + Math.floor((hordeNumber - 1) / 2));
}

/** Enemies in a wave: +4 per wave, ×1.1 per horde. */
export function waveSize(hordeNumber: number, wave: number): number {
  whole('waveSize', hordeNumber);
  whole('waveSize', wave);
  return Math.round((8 + 4 * (wave - 1)) * 1.1 ** (hordeNumber - 1));
}

/** Enemy HP: ×1.10 per wave, ×1.15 per horde (design §9). */
export function enemyHp(kind: EnemyKind, hordeNumber: number, wave: number): number {
  whole('enemyHp', hordeNumber);
  whole('enemyHp', wave);
  return Math.round(ENEMIES[kind].hp * 1.1 ** (wave - 1) * 1.15 ** (hordeNumber - 1));
}

/** Fight XP needed to go from `level` to the next. */
export function xpToNext(level: number): number {
  whole('xpToNext', level);
  return Math.round(10 * 1.4 ** (level - 1));
}
