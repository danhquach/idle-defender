// Fixtures shared by the storage tests; never imported by game code.
import { buildPost, buildSegment, buildTrap, buildTurret, upgradeSegment } from '../core/base.ts';
import { finishHorde, newGame, startHorde, type GameState } from '../core/game.ts';
import { research, upgradeLab, type GameResult } from '../core/research.ts';
import { BUILDING_MATERIALS, stockOf } from '../core/data.ts';

/** `game`'s stock as a save from before ID-025 (v3 and older) holds it: building materials only. */
export const oldStock = (game: GameState): Record<string, number> =>
  Object.fromEntries(BUILDING_MATERIALS.map((m) => [m, game.stock[m]]));

/** `game` as JSON from before ID-026 (v4 and older): no patrols, count, reports or weapons left. */
export function prePatrol(game: GameState): Record<string, unknown> {
  const json = preRisk(game);
  for (const key of ['patrols', 'patrolsSent', 'reports']) delete json[key];
  return json;
}

/** `game` as JSON from ID-026 (v5): no weapons left on the map, and no casualties in its reports. */
export function preRisk(game: GameState): Record<string, unknown> {
  const json = preCamp(game);
  delete json.leftBehind;
  for (const r of json.reports as Record<string, unknown>[]) {
    for (const key of ['injured', 'dead', 'wiped', 'recovered']) delete r[key];
  }
  return json;
}

/** `game` as JSON from before ID-033 (v6 and older): no camp. */
export function preCamp(game: GameState): Record<string, unknown> {
  const json = preSurvivors(game);
  delete json.camp;
  return json;
}

/** `game` as JSON from ID-033 (v7): no survivors in its reports, and camp offers are bare lists of picks. */
export function preSurvivors(game: GameState): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(game)) as Record<string, unknown>;
  for (const r of json.reports as Record<string, unknown>[]) delete r.survivors;
  const camp = json.camp as { offers: unknown[] };
  camp.offers = (camp.offers as { picks: string[] }[]).map((o) => o.picks);
  return json;
}

/** A fixed save time, in ms since the epoch. */
export const NOW = 1_800_000_000_000;

/**
 * A game a player could reach: a Lab at level 2 with Metal walls and the Auto-turret
 * researched, built on, upgraded, a turret on a tower, barbed wire and spikes, a horde
 * lost with Bob injured, a wall hurt, the turret worn and the spikes sprung.
 */
export function played(): GameState {
  let g: GameState = {
    ...newGame(),
    stock: stockOf({ scrap: 500, wood: 500, metal: 50, concrete: 0 }),
  };
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
