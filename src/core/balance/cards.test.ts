// Balance: each ID-077 card makes a measurable difference in a real horde-only fight
// (see shared.ts). A close fight, Horde 4 with three survivors, is played on every seed
// with one card held from the start and no other card taken, against the same fights
// with no card: the card must win more of them, and its kills must happen further out
// from the wall (design §8: the cards act where the fight is).
import { beforeAll, describe, expect, it } from 'vitest';
import { recruit } from '../camp.ts';
import { WALL } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { tick, type HordeState, type UpgradeId } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { SEEDS } from './shared.ts';

const HORDE = 4;
const SQUAD = 3;
const CARDS = [
  'speed-loaders',
  'extended-mags',
  'stopping-power',
  'frag-grenades',
  'barbed-wire',
] as const satisfies readonly UpgradeId[];

/** Horde `HORDE` with `SQUAD` fresh survivors. */
function closeFight(): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: HORDE,
    roster: Array.from({ length: SQUAD }, (_, i) => ({ ...recruit(i + 1), xp: 0 })),
    camp: { ...g.camp, recruits: SQUAD },
  };
}

/** Wins over every seed, and how far in front of the wall the average kill happened. */
function play(card: UpgradeId | null): { wins: number; killedAt: number } {
  let wins = 0;
  let out = 0;
  let kills = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let s: HordeState = startSquadHorde(closeFight(), seed, 0);
    if (card) s.taken = [card];
    // As the pick would: the first grenade is thrown at once.
    if (card === 'frag-grenades') s.nextFragAt = 0;
    const front = Math.max(...s.layers.map((l) => l.x)) + WALL.depth;
    // Each enemy's last place seen, half a second apart; one gone was killed there.
    let seen = new Map<number, number>();
    while (s.outcome === 'fighting') {
      if (s.time > 1500) throw new RangeError(`seed ${seed} never ended`);
      // No other card: the offer is turned down.
      if (s.offer) s = { ...s, offer: null };
      s = tick(s, 0.5);
      const now = new Map(s.enemies.filter((e) => e.hp > 0).map((e) => [e.id, e.x]));
      for (const [id, x] of seen) {
        if (now.has(id)) continue;
        out += x - front;
        kills += 1;
      }
      seen = now;
    }
    if (s.outcome === 'won') wins += 1;
  }
  return { wins, killedAt: out / kills };
}

describe('each ID-077 card makes a measurable difference (Horde 4, three survivors)', () => {
  let none: ReturnType<typeof play>;
  const withCard = new Map<UpgradeId, ReturnType<typeof play>>();
  beforeAll(() => {
    none = play(null);
    for (const id of CARDS) withCard.set(id, play(id));
  }, 120_000);

  it('the fight is close without a card: lost on most seeds, won on some at most', () => {
    expect(none.wins).toBeLessThanOrEqual(SEEDS / 4);
  });

  it.each(CARDS)('%s wins more of the same fights', (id) => {
    expect(withCard.get(id)!.wins).toBeGreaterThan(none.wins);
  });

  it.each(CARDS)('%s kills further out from the wall, by at least 5 px on average', (id) => {
    expect(withCard.get(id)!.killedAt).toBeGreaterThanOrEqual(none.killedAt + 5);
  });
});
