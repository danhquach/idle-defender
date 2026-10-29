// Fixtures shared by the storage tests; never imported by game code.
import { buildPost, buildSegment, upgradeSegment } from '../core/base.ts';
import { finishHorde, newGame, startHorde, type GameState } from '../core/game.ts';

/** A fixed save time, in ms since the epoch. */
export const NOW = 1_800_000_000_000;

/** A game a player could reach: built on, upgraded, a horde lost with Bob injured and a wall hurt. */
export function played(): GameState {
  let g: GameState = { ...newGame(), tiers: ['wood', 'metal'] };
  g = { ...g, stock: { scrap: 500, wood: 500, metal: 50, concrete: 0 } };
  const steps = [
    (x: GameState) => buildSegment(x.base, x.stock, x.tiers, 1, 0, 'wall', 'wood'),
    (x: GameState) => buildSegment(x.base, x.stock, x.tiers, 1, 4, 'gate', 'wood'),
    (x: GameState) => upgradeSegment(x.base, x.stock, x.tiers, 1, 0),
    (x: GameState) => buildPost(x.base, x.stock, { kind: 'wall-walk', column: 1, row: 0 }),
    (x: GameState) => buildPost(x.base, x.stock, { kind: 'ground', column: 1, row: 2 }),
  ];
  for (const step of steps) {
    const r = step(g);
    if (!r.ok) throw new Error(r.reason);
    g = { ...g, base: r.base, stock: r.stock };
  }
  const h = startHorde(g, 7, 'bob', 0, NOW);
  h.layers[0]!.segments[0]!.hp = 123.5;
  h.time = 41.3;
  const [bob] = h.defenders.splice(0, 1);
  h.posts[bob!.postId]!.defenderId = null;
  h.injured.push({
    defender: { id: bob!.id, name: bob!.name, weapon: bob!.weapon },
    postId: bob!.postId,
    at: 12.7,
    offered: true,
    by: 'shambler',
  });
  h.outcome = 'lost';
  return finishHorde(g, h, NOW);
}
