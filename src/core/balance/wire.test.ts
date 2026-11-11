// Balance: Barbed Wire lasts through late hordes (ID-123; see shared.ts). Its rows are rebuilt
// at each wave break and their durability grows with the wave's size, so a level 1 row holds
// about the same share of a wave at Horde 15 as at Horde 5. Measured in the scripted horde-only
// campaign, at the first try of each horde, with the wire held from the start at level 1.
import { beforeAll, describe, expect, it } from 'vitest';
import { chooseCard } from '../cards.ts';
import { newGame, type GameState } from '../game.ts';
import { rebuildWire, tick, type HordeState } from '../horde.ts';
import { finishSquadHorde, highestBeaten, startSquadHorde } from '../hordeonly.ts';
import { gearUp, playSquadHorde, spendAll, SQUAD_FARM, squadPick, useSkills } from '../sim.ts';

const SEEDS = 2;
const HORDES = [5, 15] as const;
const LAST = 15;

/**
 * Horde `n` of `game` with Barbed Wire held at level 1 from the start (offers of it turned
 * down): the time-weighted share of its rows working during the last wave fought (the
 * horde's last, or the one a lost fight fell in).
 */
function lastWaveWorking(game: GameState, seed: number, n: number): number {
  let s: HordeState = startSquadHorde(game, seed, 0, n);
  s.taken = [...s.taken, 'barbed-wire'];
  s.cardLevels = { ...s.cardLevels, 'barbed-wire': 1 };
  rebuildWire(s);
  let wave = 0;
  let working = 0;
  let looks = 0;
  while (s.outcome === 'fighting') {
    if (s.time > 3600) throw new RangeError(`seed ${seed}, Horde ${n} never ended`);
    if (s.offer) {
      const i = squadPick(s);
      const c = s.offer[i]!;
      const wire = c.kind === 'upgrade' && c.id === 'barbed-wire';
      // Turning the wire down needs another card to take; one alone would level it up.
      if (wire && s.offer.length < 2) throw new RangeError(`seed ${seed}: a lone wire offer`);
      s = chooseCard(s, wire ? (i + 1) % s.offer.length : i);
      continue;
    }
    s = tick(useSkills(s), 0.5);
    if (s.enemies.length === 0) continue;
    if (s.wave !== wave) [wave, working, looks] = [s.wave, 0, 0];
    working += s.wire.filter((r) => r.durability > 0).length / s.wire.length;
    looks += 1;
  }
  return looks > 0 ? working / looks : 1;
}

describe('Barbed Wire lasts through late hordes (ID-123)', () => {
  const shares = new Map<number, number[]>(HORDES.map((n) => [n, []]));
  beforeAll(() => {
    for (let k = 1; k <= SEEDS; k++) {
      const seed = k * 1000;
      let game = newGame('horde');
      let farm = 0;
      for (let i = 0; i < LAST * 12 && game.hordeNumber <= LAST; i++) {
        const n = farm > 0 ? highestBeaten(game) : game.hordeNumber;
        const at = shares.get(n);
        if (farm === 0 && at && at.length < k) at.push(lastWaveWorking(game, seed + i, n));
        const horde = playSquadHorde(game, seed + i, 3600, undefined, n);
        game = gearUp(spendAll(finishSquadHorde(game, horde)));
        if (farm > 0) farm--;
        else if (horde.outcome !== 'won' && n > 1) farm = SQUAD_FARM.replays;
      }
    }
  }, 900_000);

  const mean = (n: number) => {
    const a = shares.get(n)!;
    expect(a, `Horde ${n} measured on every seed`).toHaveLength(SEEDS);
    return a.reduce((t, x) => t + x, 0) / a.length;
  };

  it('a level 1 row mostly holds through the last wave fought at Horde 5 and at Horde 15', () => {
    for (const n of HORDES) expect(mean(n), `Horde ${n}`).toBeGreaterThanOrEqual(0.75);
  });

  it('it holds a comparable share of the last wave fought at both', () => {
    expect(Math.abs(mean(15) - mean(5))).toBeLessThanOrEqual(0.2);
  });
});
