// Fixtures shared by the storage tests; never imported by game code.
import { buildPost, buildSegment, buildTrap, buildTurret, upgradeSegment } from '../core/base.ts';
import { finishHorde, newGame, startHorde, type GameState } from '../core/game.ts';
import { research, upgradeLab, type GameResult } from '../core/research.ts';

/** A fixed save time, in ms since the epoch. */
export const NOW = 1_800_000_000_000;

/**
 * A game a player could reach: a Lab at level 2 with Metal walls and the Auto-turret
 * researched, built on, upgraded, a turret on a tower, barbed wire and spikes, a horde
 * lost with Bob injured, a wall hurt, the turret worn and the spikes sprung.
 */
export function played(): GameState {
  let g: GameState = { ...newGame(), stock: { scrap: 500, wood: 500, metal: 50, concrete: 0 } };
  const lab: ((x: GameState) => GameResult)[] = [
    upgradeLab,
    (x) => research(x, 'metal-walls'),
    upgradeLab,
    (x) => research(x, 'auto-turret'),
  ];
  for (const step of lab) {
    const r = step(g);
    if (!r.ok) throw new Error(r.reason);
    g = r.game;
  }
  const steps = [
    (x: GameState) => buildSegment(x.base, x.stock, x.tiers, 1, 0, 'wall', 'wood'),
    (x: GameState) => buildSegment(x.base, x.stock, x.tiers, 1, 4, 'gate', 'wood'),
    (x: GameState) => upgradeSegment(x.base, x.stock, x.tiers, 1, 0),
    (x: GameState) => buildPost(x.base, x.stock, { kind: 'wall-walk', column: 1, row: 0 }),
    (x: GameState) => buildPost(x.base, x.stock, { kind: 'ground', column: 1, row: 2 }),
    (x: GameState) => buildTurret(x.base, x.stock, true, 'tower', 0, 2),
    (x: GameState) => buildTrap(x.base, x.stock, 'wire', 1),
    (x: GameState) => buildTrap(x.base, x.stock, 'spikes', 3),
  ];
  for (const step of steps) {
    const r = step(g);
    if (!r.ok) throw new Error(r.reason);
    g = { ...g, base: r.base, stock: r.stock };
  }
  const h = startHorde(g, 7, 'bob', 0, NOW);
  h.layers[0]!.segments[0]!.hp = 123.5;
  h.turrets[0]!.condition = 61.2;
  h.traps[1]!.durability = 17;
  h.time = 41.3;
  const [bob] = h.defenders.splice(0, 1);
  h.posts[bob!.postId]!.defenderId = null;
  h.injured.push({
    defender: { id: bob!.id, name: bob!.name, loadout: { ...bob!.loadout } },
    postId: bob!.postId,
    at: 12.7,
    offered: true,
    by: 'shambler',
  });
  h.outcome = 'lost';
  return finishHorde(g, h, NOW);
}
