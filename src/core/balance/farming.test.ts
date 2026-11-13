// Balance: farming (ID-098, ID-102; see shared.ts). Even at the worst luck the bad-luck
// guarantee gets a stuck player past the wall, and farming far below the wall is never a
// faster way to get stronger than farming near it.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../armoury.ts';
import { recruit } from '../camp.ts';
import { FARM, SQUAD_CAP } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { finishSquadHorde, squadOf } from '../hordeonly.ts';
import { createRng } from '../rng.ts';
import { gearUp, playSquadCampaign, playSquadHorde } from '../sim.ts';
import { squadPower } from '../squadpower.ts';
import { xpForLevel } from '../stats.ts';
import { cacheFor } from './cache.ts';

const keep = cacheFor(import.meta.url);

describe('farming (ID-102)', () => {
  it('at the worst luck, the bad-luck guarantee still gets every campaign past Horde 13', () => {
    const LAST = 13;
    /** Most replays spent at any one horde: half as many again as with average luck (30). */
    const MAX_REPLAYS = 45;
    for (let seed = 1; seed <= 2; seed++) {
      const runs = keep(`worst ${seed}`, () =>
        playSquadCampaign(seed * 1000, LAST, { worstLuck: true, maxFights: 400 }),
      );
      const last = runs.at(-1)!;
      expect([last.hordeNumber, last.outcome, last.replay], `seed ${seed}`).toEqual([
        LAST,
        'won',
        false,
      ]);
      const spent = new Map<number, number>();
      for (const r of runs)
        if (r.replay) spent.set(r.hordeNumber, (spent.get(r.hordeNumber) ?? 0) + 1);
      for (const [n, k] of spent)
        expect(k, `seed ${seed}, Horde ${n}`).toBeLessThanOrEqual(MAX_REPLAYS);
    }
  }, 900_000);

  /**
   * A full squad stuck at Horde `wall` (all below it beaten): level 15, Lv `wall + 1` Military
   * Rifles. ID-128: Lv `wall - 1` before, but with Recommended Power fitted to the card build
   * that squad stands only at Horde 16's, short of the ~1.4× the campaigns reach it with, and
   * lost half its replays of the horde below.
   */
  function stuckAt(wall: number): GameState {
    const g = newGame('horde');
    g.roster = Array.from({ length: SQUAD_CAP }, (_, i) => ({
      ...recruit(i + 1),
      xp: xpForLevel(15),
      loadout: {
        primary: rollWeapon(createRng(i + 7), `h${i + 1}`, 'rifle', 'military', wall + 1),
        secondary: null,
        item: null,
      },
    }));
    g.camp.recruits = SQUAD_CAP;
    g.hordeNumber = wall;
    return g;
  }

  /** `fights` replays of Horde `n` from `game`: Squad Power and XP gained per fight minute. */
  function farm(game: GameState, n: number, fights: number, seed: number) {
    let g = game;
    let seconds = 0;
    const xp = (s: GameState) => squadOf(s).reduce((t, d) => t + d.xp, 0);
    for (let i = 0; i < fights; i++) {
      const h = playSquadHorde(g, seed + i, undefined, undefined, n);
      seconds += h.time;
      g = gearUp(finishSquadHorde(g, h));
    }
    const minutes = seconds / 60;
    return {
      power: (squadPower(g) - squadPower(game)) / minutes,
      xp: (xp(g) - xp(game)) / minutes,
    };
  }

  it('farming more than 3 hordes below the highest beaten is never faster than near the wall', () => {
    const WALL = 16;
    const game = stuckAt(WALL);
    let nearPower = 0;
    let farPower = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const near = keep(`near ${seed}`, () => farm(game, WALL - 1, 6, seed * 100));
      const far = keep(`far ${seed}`, () => farm(game, WALL - 1 - FARM.farOff - 1, 6, seed * 100));
      expect(near.xp, `seed ${seed}: XP a minute`).toBeGreaterThan(far.xp);
      nearPower += near.power;
      farPower += far.power;
    }
    // Over the three seeds together (ID-132; each seed alone before): Squad Power comes in
    // gun drops, and one lucky drop in 6 fights decides a seed. ID-132's cards re-roll the
    // fights: seed 3 near 9.0 a minute, far 11.6 (one drop); in all, near 27.6, far 11.8.
    expect(nearPower, 'Squad Power a minute').toBeGreaterThan(farPower);
  }, 900_000);
});
