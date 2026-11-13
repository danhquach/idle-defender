// Balance: no profession too strong (ID-149, design §6 Professions). Each
// profession at the same level fights as 1 of a squad of 6 (the other 5 plain survivors with
// the reference Carbine; a fighting job with its own best gun, an everyday job with the
// Carbine too), at a horde where the plain squad wins about half its fights, on the same
// seeds. What it adds over a plain survivor with the same gun must not land more than 10 points
// over the average (too weak is printed, not failed); a fighting job with a gun that is not
// theirs never below a plain survivor.
// See shared.ts.
import { describe, expect, it } from 'vitest';
import { gunPower, rollWeapon, type OwnedWeapon } from '../armoury.ts';
import { JOB_IDS, JOBS, type Job, type JobId } from '../data.ts';
import type { GameState, RosterDefender } from '../game.ts';
import { playSquadHorde } from '../sim.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { createRng } from '../rng.ts';
import { cacheFor } from './cache.ts';
import { squadAt } from './shared.ts';

const keep = cacheFor(import.meta.url);

// 60, not shared.ts's 20 (ID-149): one survivor in six moves the win rate by a few points,
// so 20 seeds can't tell a 10-point gap from noise.
const SEEDS = 60;
/** A full squad (each at level 13, `squadAt`), about at its Recommended Power: the plain squad wins about half. */
const HORDE = 12;

/** `d` with no profession: the plain survivor every profession is weighed against. */
const plain = (d: RosterDefender): RosterDefender =>
  ({ ...d, job: undefined }) as unknown as RosterDefender;

/** The plain squad at `HORDE` with Military Carbines at the gun level nearest Recommended Power. */
function baseSquad(): GameState {
  const target = recommendedPower(HORDE);
  let best = squadAt(HORDE, 1);
  for (let lv = 2; lv <= 200; lv++) {
    const g = squadAt(HORDE, lv);
    if (Math.abs(squadPower(g) - target) < Math.abs(squadPower(best) - target)) best = g;
  }
  return { ...best, roster: best.roster.map(plain) };
}

/** A Military gun of `base` at the squad's gun level, the 6th survivor's uid. */
const gunOf = (game: GameState, base: OwnedWeapon['base']): OwnedWeapon => {
  const ref = game.roster[5]!.loadout.primary as OwnedWeapon;
  return rollWeapon(createRng(13), ref.uid, base, 'military', ref.level);
};

/** The plain squad with its 6th survivor a `job`, holding `held` (their Carbine by default). */
function withJob(game: GameState, job: JobId | null, held?: OwnedWeapon): GameState {
  const roster = game.roster.map((d, i) => {
    if (i !== 5) return d;
    const loadout = held ? { ...d.loadout, primary: held } : d.loadout;
    return job === null ? { ...d, loadout } : { ...d, loadout, job };
  });
  return { ...game, roster };
}

/** A fighting job's best gun (by dmg/s) at the squad's rarity and level. */
function bestGun(game: GameState, job: JobId): OwnedWeapon {
  const guns = ((JOBS[job] as Job).guns ?? []).map((b) => gunOf(game, b));
  return guns.reduce((a, b) => (gunPower(b) > gunPower(a) ? b : a));
}

/** A gun none of fighting job `job`'s: the Carbine, or the SMG for a Hunter. */
const offGun = (game: GameState, job: JobId): OwnedWeapon =>
  gunOf(game, (JOBS[job] as Job).guns?.includes('rifle') ? 'smg' : 'rifle');

/** Fights won by `game` at `HORDE` over the seeds, kept under `key`. */
const wins = (key: string, game: GameState): number =>
  keep(key, () => {
    let won = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      if (playSquadHorde(game, seed * 101, undefined, undefined, HORDE).outcome === 'won') won++;
    }
    return won;
  });

describe('professions (ID-149)', () => {
  const base = baseSquad();
  const fighting = JOB_IDS.filter((j) => (JOBS[j] as Job).kind === 'fight');

  it('the squad is at its level, about Recommended Power', () => {
    expect(base.roster).toHaveLength(6);
    expect(squadPower(base) / recommendedPower(HORDE)).toBeGreaterThan(0.9);
    expect(squadPower(base) / recommendedPower(HORDE)).toBeLessThan(1.1);
  });

  // The gun itself must not count: a fighting job's own gun can be weaker or stronger than
  // the Carbine at this horde. So each profession's win rate is taken against the same squad
  // with a plain survivor holding the same gun, and that gain is compared across professions.
  // Only too strong fails (PM, ID-149): one survivor in six moves the win rate by a few
  // points, under what 60 seeds can resolve, so a profession that only adds (the Student)
  // can measure 13 points low on seed luck alone. Too weak is printed for a person to judge.
  it('no profession lands more than 10 points over the average win rate', () => {
    const gains = JOB_IDS.map((job) => {
      const held = (JOBS[job] as Job).kind === 'fight' ? bestGun(base, job) : undefined;
      const plainRate = wins(
        `plain ${held ? `own ${held.base}` : 'base'}`,
        withJob(base, null, held),
      );
      return (wins(`job ${job}`, withJob(base, job, held)) - plainRate) / SEEDS;
    });
    const mean = gains.reduce((a, b) => a + b, 0) / gains.length;
    const table = JOB_IDS.map((j, i) => `${j} ${gains[i]!.toFixed(2)}`).join(', ');
    console.info(`Professions, win-rate gain over plain (mean ${mean.toFixed(2)}): ${table}`);
    for (const [i, gain] of gains.entries()) {
      expect(gain - mean, `${JOB_IDS[i]} (mean ${mean}; ${table})`).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  }, 1_200_000);

  it('a fighting job off its guns is never below a plain survivor with that gun', () => {
    for (const job of fighting) {
      const off = offGun(base, job);
      const plainRate = wins(`plain off ${off.base}`, withJob(base, null, off));
      expect(wins(`off ${job}`, withJob(base, job, off)), job).toBeGreaterThanOrEqual(plainRate);
    }
  }, 1_200_000);
});
