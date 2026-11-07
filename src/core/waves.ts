import {
  BOSSES,
  ELITE,
  ENEMIES,
  ENEMY_MIX,
  HORROR,
  HORROR_ABILITIES,
  SWARM,
  type BossSkill,
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

/** Enemy HP's growth per horde (design §9; 1.15 before ID-020). */
export const HP_GROWTH = 1.17;

/**
 * Enemy HP's factor in the full game's Hordes 1, 2 and 3 on top of the growth (ID-097), so
 * the first hordes are sure wins; 1 from Horde 4 on.
 */
export const EARLY_HP: readonly number[] = [1, 0.9, 0.85];

/**
 * Enemy HP: ×1.10 per wave, and ×`scale` for the horde: `HP_GROWTH` per horde by default,
 * eased by `EARLY_HP` in Hordes 1–3 (the horde-only build has its own curve, ID-066).
 */
export function enemyHp(
  kind: EnemyKind,
  hordeNumber: number,
  wave: number,
  scale: number = (EARLY_HP[hordeNumber - 1] ?? 1) * HP_GROWTH ** (hordeNumber - 1),
): number {
  whole('enemyHp', hordeNumber);
  whole('enemyHp', wave);
  return Math.round(ENEMIES[kind].hp * 1.1 ** (wave - 1) * scale);
}

/**
 * Each kind's share of a wave in Horde `hordeNumber` (design §9); Shamblers take the rest.
 * A `swarm` wave (ID-099) has `SWARM.runners` times the Runners.
 */
export function waveMix(hordeNumber: number, swarm = false): [EnemyKind, number][] {
  whole('waveMix', hordeNumber);
  const mix: [EnemyKind, number][] = [];
  for (const [kind, m] of Object.entries(ENEMY_MIX) as [
    EnemyKind,
    { from: number; share: number },
  ][]) {
    if (hordeNumber >= m.from) {
      mix.push([kind, kind === 'runner' && swarm ? m.share * SWARM.runners : m.share]);
    }
  }
  const rest = 1 - mix.reduce((sum, [, share]) => sum + share, 0);
  return [['shambler', rest], ...mix];
}

/** The kind a roll in `[0, 1)` picks from Horde `hordeNumber`'s mix (a swarm wave's, `swarm`). */
export function kindFor(hordeNumber: number, roll: number, swarm = false): EnemyKind {
  let left = roll;
  const mix = waveMix(hordeNumber, swarm);
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

/**
 * A boss or mini-boss a horde brings (ID-099): its kind, skills, the wave it comes with
 * (at that wave's first spawn), its HP as a multiple of its kind's, and whether it is an
 * elite (a mini-boss) rather than a Mutated Horror.
 */
export interface BossSpec {
  kind: EnemyKind;
  skills: BossSkill[];
  wave: number;
  hp: number;
  elite: boolean;
}

/**
 * The bosses and mini-boss Horde `hordeNumber` brings, fixed by its number so a replay
 * meets the same ones. The full game: a boss horde's one Horror with its one ability
 * (ID-024). `harder` (the horde-only build, ID-099): `BOSSES` Horrors with two skills each,
 * or on an odd horde from `ELITE.from` one elite in the middle wave.
 */
export function hordeBosses(hordeNumber: number, harder: boolean): BossSpec[] {
  whole('hordeBosses', hordeNumber);
  const last = waveCount(hordeNumber);
  const ability = horrorAbility(hordeNumber);
  if (!harder) {
    return ability ? [{ kind: 'horror', skills: [ability], wave: last, hp: 1, elite: false }] : [];
  }
  if (ability) {
    const k = hordeNumber / HORROR.every;
    const set = BOSSES.sets[(k - 1) % BOSSES.sets.length]!;
    return set.slice(0, Math.min(k, BOSSES.max)).map((pair) => ({
      kind: 'horror' as const,
      skills: [...pair],
      wave: last,
      hp: BOSSES.hp,
      elite: false,
    }));
  }
  if (hordeNumber < ELITE.from || hordeNumber % 2 === 0) return [];
  const i = (hordeNumber - ELITE.from) / 2;
  return [
    {
      kind: ELITE.kinds[i % ELITE.kinds.length]!,
      skills: [ELITE.skills[i % ELITE.skills.length]!],
      wave: Math.ceil(last / 2),
      hp: ELITE.hp,
      elite: true,
    },
  ];
}

/** Whether wave `wave` of horde-only Horde `hordeNumber` is a swarm wave (ID-099, `SWARM`). */
export function swarmWave(hordeNumber: number, wave: number): boolean {
  whole('swarmWave', hordeNumber);
  whole('swarmWave', wave);
  if (hordeNumber < SWARM.from) return false;
  const share = Math.min(SWARM.cap, SWARM.share + SWARM.growth * (hordeNumber - SWARM.from));
  // Evenly spread: the waves where the running count of swarms ticks up.
  return Math.floor(wave * share + 1e-9) > Math.floor((wave - 1) * share + 1e-9);
}

/** Fight XP needed to go from `level` to the next. */
export function xpToNext(level: number): number {
  whole('xpToNext', level);
  return Math.round(10 * 1.4 ** (level - 1));
}
