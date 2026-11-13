// Balance: the epic cards after their costs (ID-137; see shared.ts). Each is still a fair
// pick next to the strongest common and rare cards: a real horde-only fight is played on
// every seed with one card picked and no other taken. Field Repairs is the best pick in one
// wall setup and not in another. Frag Grenades is the best pick in every scene measured
// and Concussion Rounds in none (Frag Grenades wins every squad fight): the PM relaxed
// that check for both (ID-137), so Frag's lead where its cost bites hardest stays small,
// and Concussion must stay well clear of no card. A card's pick comes at the start, or for
// the wall cards the moment the weakest wall segment falls to a share of its max HP.
import { beforeAll, describe, expect, it } from 'vitest';
import { recruit } from '../camp.ts';
import { chooseCard } from '../cards.ts';
import { newGame, type GameState } from '../game.ts';
import { tick, type HordeState, type UpgradeId } from '../horde.ts';
import { startSquadHorde } from '../hordeonly.ts';
import { cacheFor } from './cache.ts';
import { SEEDS } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** Horde `n` with `size` fresh survivors, each with the Pistol they start with. */
function fight(n: number, size: number): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: n,
    roster: Array.from({ length: size }, (_, i) => ({ ...recruit(i + 1), xp: 0 })),
    camp: { ...g.camp, recruits: size },
  };
}

/** The weakest wall segment's share of its max HP. */
function weakest(s: HordeState): number {
  let low = 1;
  for (const l of s.layers) {
    for (const seg of l.segments) {
      if (seg.maxHp > 0) low = Math.min(low, Math.max(0, seg.hp) / seg.maxHp);
    }
  }
  return low;
}

/**
 * Wins over every seed with `card` picked (as an offer would) once the weakest segment is
 * at or under `wall` of its max HP (1: at the start), over `seeds` seeds; every other offer
 * turned down.
 */
function wins(game: GameState, card: UpgradeId | null, wall = 1, seeds = SEEDS): number {
  let won = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let s: HordeState = startSquadHorde(game, seed, 0);
    s.research = ['hollow-points', 'field-repairs'];
    let pending = card;
    while (s.outcome === 'fighting') {
      if (s.time > 1500) throw new RangeError(`seed ${seed} never ended`);
      if (s.offer) s = { ...s, offer: null };
      if (pending && weakest(s) <= wall + 1e-9) {
        s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: pending }] }, 0);
        s.offer = null;
        pending = null;
      }
      s = tick(s, 0.5);
    }
    if (pending) throw new RangeError(`seed ${seed}: ${card} never picked`);
    if (s.outcome === 'won') won += 1;
  }
  return won;
}

/** The squad scene: Horde 4, three survivors (no card wins 2 of 20). */
const SQUAD = ['concussion-rounds', 'frag-grenades', 'sharpshooter', 'incendiary-rounds'];

describe('the epic cards after their costs are fair picks (ID-137)', () => {
  const squad = new Map<string, number>();
  const lone = new Map<string, number>();
  const broken = new Map<string, number>();
  const worn = new Map<string, number>();
  beforeAll(() => {
    const three = fight(4, 3);
    squad.set(
      'none',
      keep('squad none', () => wins(three, null)),
    );
    for (const id of SQUAD)
      squad.set(
        id,
        keep(`squad ${id}`, () => wins(three, id as UpgradeId)),
      );
    const one = fight(2, 1);
    // A lone survivor's fights are short and the margin thin, so twice the seeds.
    for (const id of ['frag-grenades', 'sharpshooter', 'incendiary-rounds'] as const)
      lone.set(
        id,
        keep(`lone ${id}`, () => wins(one, id, 1, 2 * SEEDS)),
      );
    for (const id of ['field-repairs', 'frag-grenades', 'patch-up', 'incendiary-rounds'] as const)
      broken.set(
        id,
        keep(`broken ${id}`, () => wins(three, id, 0.3)),
      );
    for (const id of ['field-repairs', 'frag-grenades'] as const)
      worn.set(
        id,
        keep(`worn ${id}`, () => wins(three, id, 0.6)),
      );
  }, 300_000);
  const table = (m: Map<string, number>): string => JSON.stringify(Object.fromEntries(m));

  // Measured: Frag 20, Incendiary Rounds 19, Sharpshooter 17, Concussion Rounds 16, none 2.
  it('Frag Grenades is the best pick for a squad of three: no card wins more', () => {
    for (const id of SQUAD.filter((x) => x !== 'frag-grenades')) {
      expect(squad.get('frag-grenades'), table(squad)).toBeGreaterThanOrEqual(squad.get(id)!);
    }
  });

  // Its pause costs a lone survivor all its fire for a while, so its lead there is small
  // (40 seeds: Frag 7, Incendiary Rounds 6, Sharpshooter 5; 19 of 20 with no cost).
  it('Frag Grenades leads a lone survivor’s picks by at most 2 wins of 40', () => {
    const best = Math.max(lone.get('sharpshooter')!, lone.get('incendiary-rounds')!);
    expect(lone.get('frag-grenades')! - best, table(lone)).toBeLessThanOrEqual(2);
  });

  // Measured: Field Repairs 20, Frag 20, Incendiary Rounds 13, Patch Up 12.
  it('Field Repairs is the best pick once a wall segment is down to 30%', () => {
    for (const [id, n] of broken) {
      expect(broken.get('field-repairs'), `${id} ${table(broken)}`).toBeGreaterThanOrEqual(n);
    }
  });

  // Measured: Frag 20, Field Repairs 13 (Incendiary Rounds 17).
  it('Field Repairs is not the best pick with the weakest segment still at 60%', () => {
    expect(worn.get('frag-grenades'), table(worn)).toBeGreaterThan(worn.get('field-repairs')!);
  });

  it('Concussion Rounds is a fair pick: at least 10 more wins than none, but not the best', () => {
    const c = squad.get('concussion-rounds')!;
    expect(c, table(squad)).toBeGreaterThanOrEqual(squad.get('none')! + 10);
    expect(c, table(squad)).toBeLessThan(squad.get('frag-grenades')!);
  });
});
