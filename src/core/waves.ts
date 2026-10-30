import {
  ENEMIES,
  ENEMY_MIX,
  HORROR,
  HORROR_ABILITIES,
  type EnemyKind,
  type HorrorAbility,
} from './data.ts';

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

/** Each kind's share of a wave in Horde `hordeNumber` (design §9); Shamblers take the rest. */
export function waveMix(hordeNumber: number): [EnemyKind, number][] {
  whole('waveMix', hordeNumber);
  const mix: [EnemyKind, number][] = [];
  for (const [kind, m] of Object.entries(ENEMY_MIX) as [
    EnemyKind,
    { from: number; share: number },
  ][]) {
    if (hordeNumber >= m.from) mix.push([kind, m.share]);
  }
  const rest = 1 - mix.reduce((sum, [, share]) => sum + share, 0);
  return [['shambler', rest], ...mix];
}

/** The kind a roll in `[0, 1)` picks from Horde `hordeNumber`'s mix. */
export function kindFor(hordeNumber: number, roll: number): EnemyKind {
  let left = roll;
  const mix = waveMix(hordeNumber);
  for (const [kind, share] of mix) {
    if (left < share) return kind;
    left -= share;
  }
  return mix[mix.length - 1]![0];
}

/**
 * The ability of Horde `hordeNumber`'s Mutated Horror, or null when it is no boss horde
 * (design §9): every `HORROR.every`th horde, the abilities taken in turn.
 */
export function horrorAbility(hordeNumber: number): HorrorAbility | null {
  whole('horrorAbility', hordeNumber);
  if (hordeNumber % HORROR.every !== 0) return null;
  return HORROR_ABILITIES[(hordeNumber / HORROR.every - 1) % HORROR_ABILITIES.length]!;
}

/** Fight XP needed to go from `level` to the next. */
export function xpToNext(level: number): number {
  whole('xpToNext', level);
  return Math.round(10 * 1.4 ** (level - 1));
}
