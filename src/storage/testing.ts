// Fixtures shared by the storage tests; never imported by game code.
import { buildPost, buildSegment, buildTrap, buildTurret, upgradeSegment } from '../core/base.ts';
import { finishHorde, newGame, startHorde, type GameState } from '../core/game.ts';
import { upgradeLab, type GameResult } from '../core/research.ts';
import { researchNow } from '../core/testing.ts';
import { BUILDING_MATERIALS, stockOf } from '../core/data.ts';
import { bankedPoints } from '../core/stats.ts';

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
  const json = prePlazas(game);
  delete json.camp;
  return json;
}

/** A stats object in the shape before ID-084: Grit for Instinct, Might for Agility, Aim for Sharp Mind, Tech for Tinker. */
const oldStatsOf = (s: Record<string, number>): Record<string, number> => ({
  aim: s.mind!,
  might: s.agility!,
  tech: s.tinker!,
  grit: s.instinct!,
});

/**
 * `game` as JSON from before ID-084 (v12 and older): the old four stats on every defender
 * and every survivor waiting to join.
 */
export function preStats(game: GameState): Record<string, unknown> {
  const json = preBank(game);
  forEveryone(json, (d) => {
    if (d.stats) d.stats = oldStatsOf(d.stats);
  });
  return json;
}

type JsonPointed = { stats?: Record<string, number>; banked?: number };

/** Runs `f` on every defender and survivor waiting to join in save JSON `json`. */
function forEveryone(json: Record<string, unknown>, f: (d: JsonPointed) => void): void {
  for (const d of json.roster as JsonPointed[]) f(d);
  for (const d of (json.reserve ?? []) as JsonPointed[]) f(d);
  const camp = json.camp as { offers: { survivor: JsonPointed | null }[] } | undefined;
  for (const o of camp?.offers ?? []) if (o.survivor) f(o.survivor);
  const reports = (json.reports ?? []) as { survivors?: JsonPointed[] }[];
  for (const r of reports) for (const s of r.survivors ?? []) f(s);
}

/** Drops `level` from every owned weapon (anything with a uid) in `v`, in place. */
function dropLevels(v: unknown): void {
  if (Array.isArray(v)) v.forEach(dropLevels);
  else if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.uid === 'string') delete o.level;
    Object.values(o).forEach(dropLevels);
  }
}

/** `game` as JSON from before ID-098 (v14 and older): no farm, and no gun levels. */
export function preFarm(game: GameState): Record<string, unknown> {
  const json = JSON.parse(JSON.stringify(game)) as Record<string, unknown>;
  delete json.farm;
  dropLevels(json);
  return json;
}

/** `game` as JSON from before ID-096 (v13 and older): no banked points. */
export function preBank(game: GameState): Record<string, unknown> {
  const json = preFarm(game);
  forEveryone(json, (d) => delete d.banked);
  return json;
}

type Pointed = { xp: number; stats: GameState['roster'][number]['stats']; banked?: number };

/** `game` with `f` applied to every defender and every survivor waiting to join. */
function everyone(game: GameState, f: <T extends Pointed>(d: T) => T): GameState {
  return {
    ...game,
    roster: game.roster.map(f),
    reserve: game.reserve.map(f),
    camp: {
      ...game.camp,
      offers: game.camp.offers.map((o) => ({ ...o, survivor: o.survivor && f(o.survivor) })),
    },
    reports: game.reports.map((r) => ({ ...r, survivors: r.survivors.map(f) })),
  };
}

/**
 * `game` as a v13 or older save loads it (ID-096): everyone above level 1 banks the points
 * the old 3 a level gave over today's 1.
 */
export const banked = (game: GameState): GameState =>
  everyone(game, (d) => {
    const b = bankedPoints(d.xp);
    return b > 0 ? { ...d, banked: b } : d;
  });

/**
 * `game` as an old save (v12 or older) loads it (ID-084): every spent stat point refunded,
 * and the old levels' points banked (ID-096).
 */
export const refunded = (game: GameState): GameState =>
  banked(everyone(game, (d) => ({ ...d, stats: { instinct: 0, agility: 0, mind: 0, tinker: 0 } })));

/** `game` as JSON from before ID-066 (v11 and older): no reserve. */
export function preReserve(game: GameState): Record<string, unknown> {
  const json = preStats(game);
  delete json.reserve;
  return json;
}

/** `game` as JSON from before ID-035 (v10 and older): no research queue or perk levels. */
export function preQueue(game: GameState): Record<string, unknown> {
  const json = preReserve(game);
  delete json.queue;
  delete json.perkLevels;
  return json;
}

/** `game` as JSON from before ID-030 (v9 and older): no car in the camp, every patrol on foot. */
export function preCars(game: GameState): Record<string, unknown> {
  const json = preQueue(game);
  delete (json.camp as Record<string, unknown>).cars;
  for (const p of json.patrols as Record<string, unknown>[]) delete p.car;
  return json;
}

/** `game` as JSON from ID-029 (v8): no survivors in its reports, and camp offers are bare lists of picks. */
export function preSurvivors(game: GameState): Record<string, unknown> {
  const json = preCars(game);
  for (const r of json.reports as Record<string, unknown>[]) delete r.survivors;
  const camp = json.camp as { offers: unknown[] };
  camp.offers = (camp.offers as { picks: string[] }[]).map((o) => o.picks);
  return json;
}

/** `game` as JSON from before ID-029 (v7 and older): no buildings, focus or order, no big horde or retreat in reports. */
export function prePlazas(game: GameState): Record<string, unknown> {
  const json = preSurvivors(game);
  for (const p of json.patrols as Record<string, unknown>[]) {
    for (const key of ['buildings', 'focus', 'order']) delete p[key];
  }
  for (const r of json.reports as Record<string, unknown>[]) {
    for (const key of ['buildings', 'searched', 'bigHorde', 'order', 'focus', 'lost'])
      delete r[key];
  }
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
    (x) => researchNow(x, 'metal-walls'),
    upgradeLab,
    (x) => researchNow(x, 'auto-turret'),
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
