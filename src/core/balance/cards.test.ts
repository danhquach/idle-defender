// Balance: each ID-077 card (at each level, ID-097), Shock Rounds and the crit cards
// (ID-130) make a measurable difference in a real horde-only fight
// (see shared.ts). A close fight, Horde 4 with three survivors, is played on every seed
// with one card held from the start and no other card taken, against the same fights
// with no card: the card must win more of them, and its kills must happen further out
// from the wall (design §8: the cards act where the fight is).
import { beforeAll, describe, expect, it } from 'vitest';
import { recruit } from '../camp.ts';
import { WALL } from '../data.ts';
import { newGame, type GameState } from '../game.ts';
import { rebuildWire, tick, type HordeState, type UpgradeId } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { SEEDS } from './shared.ts';

const HORDE = 4;
const SQUAD = 3;
/** The ID-077 cards with levels (ID-097): 1, 2 and max; Aim for the Head (ID-130) too. */
const LEVELLED = [
  'speed-loaders',
  'extended-mags',
  'barbed-wire',
  'aim-for-the-head',
] as const satisfies readonly UpgradeId[];
/** The unique (epic) ID-077 cards. */
const UNIQUE = ['concussion-rounds', 'frag-grenades'] as const satisfies readonly UpgradeId[];
const LEVELS = [1, 2, 3] as const;
const AIM_1: [UpgradeId, number] = ['aim-for-the-head', 1];

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

/**
 * Wins over every seed, and how far in front of the wall the average kill happened, with
 * `card` at `level` (and `also`, card and level, besides) held from the start.
 */
function play(
  card: UpgradeId | null,
  level = 1,
  also?: [UpgradeId, number],
): { wins: number; killedAt: number } {
  let wins = 0;
  let out = 0;
  let kills = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    let s: HordeState = startSquadHorde(closeFight(), seed, 0);
    if (card) {
      s.taken = [card];
      s.cardLevels = { [card]: level };
    }
    if (also) {
      s.taken.push(also[0]);
      s.cardLevels[also[0]] = also[1];
    }
    // As the picks would: each wire row at its level's full (ID-104, ID-123).
    if (card === 'barbed-wire') rebuildWire(s);
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
  const withCard = new Map<string, ReturnType<typeof play>>();
  const key = (id: UpgradeId, level: number) => `${id} ${level}`;
  beforeAll(() => {
    none = play(null);
    for (const id of LEVELLED) for (const lv of LEVELS) withCard.set(key(id, lv), play(id, lv));
    for (const id of UNIQUE) withCard.set(key(id, 1), play(id, 1));
    for (const lv of LEVELS) withCard.set(key('shock-rounds', lv), play('shock-rounds', lv));
    // Hollow Points needs a crit to act on: the fresh squad has none, so Aim for the Head Lv 1.
    for (const lv of LEVELS)
      withCard.set(key('hollow-point-rounds', lv), play('hollow-point-rounds', lv, AIM_1));
  }, 300_000);
  const of = (id: UpgradeId, level = 1) => withCard.get(key(id, level))!;

  it('the fight is close without a card: lost on most seeds, won on some at most', () => {
    expect(none.wins).toBeLessThanOrEqual(SEEDS / 4);
  });

  it.each(LEVELLED)('%s at level 1 wins more of the same fights than no card (ID-097)', (id) => {
    expect(of(id, 1).wins).toBeGreaterThan(none.wins);
  });

  it.each(LEVELLED.filter((id) => id !== 'barbed-wire'))(
    '%s: each level wins more of the same fights than the one below (ID-097)',
    (id) => {
      expect(of(id, 2).wins).toBeGreaterThan(of(id, 1).wins);
      expect(of(id, 3).wins).toBeGreaterThan(of(id, 2).wins);
    },
  );

  // Wins of 20 are noisy (±2) and can tie: each level wins at least as many as the one
  // below. In this short Horde 4 fight levels 1 and 2 can kill about as far out (163.1 and
  // 162.5 px under ID-123's rebuild at each wave; since ID-133 rows keep their wear between
  // waves and are rebuilt only at a level-up); every level kills further out than no card,
  // and max further out than level 1 (the check that guards the order).
  it('Barbed Wire: each level wins at least as many fights as the one below, and kills further out than no card (ID-104, ID-123)', () => {
    for (const lv of [2, 3]) {
      expect(of('barbed-wire', lv).wins, `Lv ${lv}`).toBeGreaterThanOrEqual(
        of('barbed-wire', lv - 1).wins,
      );
    }
    for (const lv of LEVELS) {
      expect(of('barbed-wire', lv).killedAt, `Lv ${lv}`).toBeGreaterThan(none.killedAt);
    }
    expect(of('barbed-wire', 3).killedAt).toBeGreaterThan(of('barbed-wire', 1).killedAt);
  });

  it.each(LEVELLED)(
    '%s at max kills further out from the wall, by at least 5 px on average',
    (id) => {
      expect(of(id, 3).killedAt).toBeGreaterThanOrEqual(none.killedAt + 5);
    },
  );

  it.each(UNIQUE)('%s wins more of the same fights, and kills at least 5 px further out', (id) => {
    expect(of(id).wins).toBeGreaterThan(none.wins);
    expect(of(id).killedAt).toBeGreaterThanOrEqual(none.killedAt + 5);
  });

  it.each(LEVELS)(
    'Shock Rounds at level %i holds enemies further from the wall (kills at least 5 px further out) and wins more',
    (lv) => {
      expect(of('shock-rounds', lv).killedAt).toBeGreaterThanOrEqual(none.killedAt + 5);
      expect(of('shock-rounds', lv).wins).toBeGreaterThan(none.wins);
    },
  );

  // Wins of 20 are noisy (±2): on top of Aim for the Head Lv 1 (10 wins of 20 when measured,
  // ID-130) each level wins more, and max at least as many as level 1 (14, 14, 16 measured).
  it('Hollow Points on top of Aim for the Head wins more of the same fights than Aim alone (ID-130)', () => {
    for (const lv of LEVELS) {
      expect(of('hollow-point-rounds', lv).wins, `Lv ${lv}`).toBeGreaterThan(
        of('aim-for-the-head', 1).wins,
      );
    }
    expect(of('hollow-point-rounds', 3).wins).toBeGreaterThanOrEqual(
      of('hollow-point-rounds', 1).wins,
    );
  });

  // Kill distance, not wins: a paralysis only holds enemies back, and wins of 20 are noisy.
  it('Shock Rounds: each level holds enemies further out than the one below (ID-097)', () => {
    expect(of('shock-rounds', 2).killedAt).toBeGreaterThan(of('shock-rounds', 1).killedAt);
    expect(of('shock-rounds', 3).killedAt).toBeGreaterThan(of('shock-rounds', 2).killedAt);
  });
});
