// The world map (ID-219, a slice of design §10): bench survivors go out as a patrol team to
// scavenge one of the map's areas and come back in real time, so a patrol finishes while the
// game is closed. A team's power (its members' Squad Power shares: levels and guns) against
// the area's danger sets each member's injury chance and the odds of each loot roll; each
// member rolls once. Everything a patrol brings is rolled from the seed it left with, so a
// reload gives the same report, and it pays once, when the report is taken. Pure: real time
// comes in as `now`; randomness only through `rng.ts`. The full game's patrols (`patrol.ts`)
// are a separate system and stay as they are.
import { rollSquadGun, replayWeights, type OwnedWeapon } from './armoury.ts';
import { BLUEPRINT_GUNS, withBlueprint } from './craft.ts';
import {
  AREA_IDS,
  AREAS,
  BLUEPRINT,
  DANGER_IDS,
  DANGERS,
  INJURY_REST,
  MAP_PATROL,
  MAX_COUNT,
  SQUAD_CAP,
  type AreaId,
  type AreaLoot,
  type Danger,
  type WeaponId,
} from './data.ts';
import { hordeXp, onMapPatrol, type GameState, type RosterDefender } from './game.ts';
import {
  autoSquad,
  isFit,
  salvageOf,
  scrapAfter,
  stashCap,
  stashWith,
  survivorPower,
  winScrap,
} from './hordeonly.ts';
import { topBeaten } from './modes.ts';
import { chance, createRng, int, pick, type Rng } from './rng.ts';
import { recommendedPower } from './squadpower.ts';
import { levelOf } from './stats.ts';

/** One area on the map: what it is and how dangerous, fixed until a patrol searches it. */
export interface MapArea {
  kind: AreaId;
  danger: Danger;
}

/** A patrol team out on the map. */
export interface MapPatrol {
  /** 1 for the first patrol sent, then up by one; its guns are `m<no>-<k>`. */
  no: number;
  area: AreaId;
  danger: Danger;
  /** Bench survivor ids, in the order picked, 1 to `MAP_PATROL.max`. */
  members: string[];
  /** When it left and when it is back (ms, whole): `backAt` is `sentAt` plus the trip. */
  sentAt: number;
  backAt: number;
  seed: number;
  /** The best horde beaten when it left (at least 1): its XP, Scrap and gun level come from it. */
  best: number;
  /** The team's power when it left (`teamPower`). */
  power: number;
}

/** The world map: its areas, the patrols out, and the draws so far. */
export interface WorldMap {
  /** The seed every area is drawn from, with `drawn`. */
  seed: number;
  /** Areas drawn so far: the next draw is number `drawn`. */
  drawn: number;
  /** `MAP_PATROL.areas` areas, each kind at most once. */
  areas: MapArea[];
  /** One at most per area, in the order sent. */
  patrols: MapPatrol[];
  /** Patrols sent so far. */
  sent: number;
}

/** The stream an area draw rolls from. */
const AREA_STREAM = 0x3ac5e7f1;

/** Area draw `n` of a map with `seed`, of a kind not in `taken`. */
function drawArea(seed: number, n: number, taken: readonly AreaId[]): MapArea {
  const rng = createRng((seed ^ AREA_STREAM ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  const kinds = AREA_IDS.filter((k) => !taken.includes(k));
  return { kind: pick(rng, kinds), danger: pick(rng, DANGER_IDS) };
}

/** A fresh map from `seed`: `MAP_PATROL.areas` areas, each kind once, no patrols. */
export function newMap(seed: number): WorldMap {
  const areas: MapArea[] = [];
  for (let n = 0; n < MAP_PATROL.areas; n++) {
    areas.push(
      drawArea(
        seed >>> 0,
        n,
        areas.map((a) => a.kind),
      ),
    );
  }
  return { seed: seed >>> 0, drawn: MAP_PATROL.areas, areas, patrols: [], sent: 0 };
}

/** `game` with a world map: its own, or a fresh one from `seed` (a new game, an older save). */
export const withMap = (game: GameState, seed: number): GameState =>
  game.map ? game : { ...game, map: newMap(seed) };

/** The map of `game`, or an empty one before it is drawn. */
const mapOf = (game: Pick<GameState, 'map'>): WorldMap =>
  game.map ?? { seed: 0, drawn: 0, areas: [], patrols: [], sent: 0 };

/** The patrol out at `area`, or null. */
export const patrolAt = (game: Pick<GameState, 'map'>, area: AreaId): MapPatrol | null =>
  mapOf(game).patrols.find((p) => p.area === area) ?? null;

/** The patrol survivor `id` is out with, or null. */
export const patrolOf = (game: Pick<GameState, 'map'>, id: string): MapPatrol | null =>
  mapOf(game).patrols.find((p) => p.members.includes(id)) ?? null;

/** The best horde beaten on any mode (its strength), at least 1: what a patrol's rewards scale with. */
export const bestHorde = (game: Parameters<typeof topBeaten>[0]): number =>
  Math.max(1, topBeaten(game));

/** A trip to an area of `danger`, in ms. */
export const tripMs = (danger: Danger): number => DANGERS[danger].minutes * 60_000;

/** A team's power: its members' shares of Squad Power (their levels and guns). */
export const teamPower = (members: readonly RosterDefender[]): number =>
  members.reduce((t, d) => t + survivorPower(d), 0);

/** The power `danger` asks at best horde `best`: a team of it has a ratio of 1. */
const dangerNeed = (danger: Danger, best: number): number =>
  (recommendedPower(best) / SQUAD_CAP) * DANGERS[danger].need;

/**
 * A team of `power` against `danger` at best horde `best`: its power over what the danger
 * asks (`need` survivors at the horde's Recommended Power per squad survivor).
 */
export function teamRatio(power: number, danger: Danger, best: number): number {
  const need = dangerNeed(danger, best);
  return need > 0 ? Math.max(0, power) / need : 0;
}

/** The team power that rates Safe against `danger` at best horde `best` (ID-246). */
export const safePower = (danger: Danger, best: number): number =>
  dangerNeed(danger, best) * MAP_PATROL.safeAt;

/** A patrol's ratio from the power and best horde it left with: later changes don't move it (ID-246). */
export const patrolRatio = (p: Pick<MapPatrol, 'power' | 'danger' | 'best'>): number =>
  teamRatio(p.power, p.danger, p.best);

/** Each member's injury chance at team ratio `ratio`: falls with every bit of power. */
export const injuryChance = (ratio: number): number =>
  MAP_PATROL.injury / (1 + MAP_PATROL.k * Math.max(0, ratio) ** 2);

/** Each loot roll's chance in `danger` at `ratio`: the danger's, plus up to `dropBonus` for a strong team. */
export const dropChance = (danger: Danger, ratio: number): number =>
  Math.min(
    MAP_PATROL.dropMax,
    DANGERS[danger].drop + MAP_PATROL.dropBonus * Math.min(1, Math.max(0, ratio) / 2),
  );

/** How the team stands against the area's danger, as its rating says. */
export const teamRating = (ratio: number): Danger =>
  ratio >= MAP_PATROL.safeAt ? 'safe' : ratio >= MAP_PATROL.riskyAt ? 'risky' : 'dangerous';

/** What the picker shows for a team: its rating, each member's injury chance, a roll's chance. */
export interface TeamRisk {
  rating: Danger;
  injury: number;
  drop: number;
}

/** The risk `members` run at an area of `danger` in `game` (none picked: the worst). */
export function teamRisk(
  game: Pick<GameState, 'hordeNumber' | 'mode' | 'modes'>,
  members: readonly RosterDefender[],
  danger: Danger,
): TeamRisk {
  const ratio = teamRatio(teamPower(members), danger, bestHorde(game));
  return {
    rating: teamRating(ratio),
    injury: injuryChance(ratio),
    drop: dropChance(danger, ratio),
  };
}

/** The XP each member earns from a patrol to `danger` at best horde `best`, injured or not. */
export const patrolXp = (danger: Danger, best: number): number =>
  Math.floor(hordeXp(best) * DANGERS[danger].xp);

/** One Scrap find in `danger` at best horde `best`. */
export const scrapFind = (danger: Danger, best: number): number =>
  Math.max(1, Math.round(winScrap(best) * DANGERS[danger].scrap));

/** What an area can drop, with the chance of each per member's roll, for its card. */
export function areaDrops(area: MapArea, ratio = 0): { loot: AreaLoot; chance: number }[] {
  const { mostly, sometimes } = AREAS[area.kind];
  const roll = dropChance(area.danger, ratio);
  const w = MAP_PATROL.mostly;
  return [
    { loot: mostly, chance: (roll * w) / (w + 1) },
    { loot: sometimes, chance: roll / (w + 1) },
  ];
}

/** Who can go on a patrol: bench survivors who are fit and not out already. */
export const canPatrol = (game: GameState, d: RosterDefender): boolean =>
  game.reserve.some((r) => r.id === d.id) && isFit(d) && !onMapPatrol(game, d.id);

/** The bench survivors free to pick for a patrol, in bench order. */
export const patrolPool = (game: GameState): RosterDefender[] =>
  game.reserve.filter((d) => canPatrol(game, d));

/**
 * Why `memberIds` can't go to `area` now, or null: the area isn't on the map or has a patrol
 * out, the team is empty or over `MAP_PATROL.max`, someone is picked twice, isn't on the
 * bench, is resting or is out already.
 */
export function sendRefusal(
  game: GameState,
  area: AreaId,
  memberIds: readonly string[],
): string | null {
  const spot = mapOf(game).areas.find((a) => a.kind === area);
  if (!spot) return 'That area is not on the map';
  if (patrolAt(game, area)) return `A patrol is already out at ${AREAS[area].name}`;
  if (memberIds.length < MAP_PATROL.min) return 'Pick someone to send';
  if (memberIds.length > MAP_PATROL.max) return `At most ${MAP_PATROL.max} can go`;
  if (new Set(memberIds).size !== memberIds.length) return 'Someone is picked twice';
  for (const id of memberIds) {
    const d = game.reserve.find((r) => r.id === id);
    if (!d) {
      return game.roster.some((r) => r.id === id)
        ? 'Squad survivors stay to defend'
        : 'Pick survivors from the camp';
    }
    if (onMapPatrol(game, id)) return `${d.name} is on patrol`;
    if (!isFit(d)) return `${d.name} is resting`;
  }
  return null;
}

/**
 * Sends `memberIds` (bench survivors) to `area` at `now` with `seed`; refused as
 * `sendRefusal` says. The team's power and the best horde are fixed as it leaves.
 */
export function sendMapPatrol(
  game: GameState,
  area: AreaId,
  memberIds: readonly string[],
  seed: number,
  now: number,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  if (!Number.isFinite(now)) throw new RangeError(`sendMapPatrol: bad time ${now}`);
  if (!Number.isInteger(seed)) throw new RangeError(`sendMapPatrol: bad seed ${seed}`);
  const reason = sendRefusal(game, area, memberIds);
  if (reason) return { ok: false, reason };
  const map = mapOf(game);
  const danger = map.areas.find((a) => a.kind === area)!.danger;
  const members = memberIds.map((id) => game.reserve.find((r) => r.id === id)!);
  const sentAt = Math.max(0, Math.floor(now));
  const patrol: MapPatrol = {
    no: map.sent + 1,
    area,
    danger,
    members: [...memberIds],
    sentAt,
    backAt: sentAt + tripMs(danger),
    seed: seed >>> 0,
    best: bestHorde(game),
    power: teamPower(members),
  };
  return {
    ok: true,
    game: { ...game, map: { ...map, patrols: [...map.patrols, patrol], sent: patrol.no } },
  };
}

/** Ms until `p` is back at `now`: never below 0, never above the whole trip. */
export const timeLeft = (p: MapPatrol, now: number): number =>
  Math.min(p.backAt - p.sentAt, Math.max(0, p.backAt - now));

/** Whether `p` is back at `now`: a clock set back never brings it home early. */
export const isBack = (p: MapPatrol, now: number): boolean => now >= p.backAt;

/**
 * `game` with its patrols' times moved so that time that runs backwards counts as 0. `seen` is
 * the latest time the game has seen (the save's own time on a load): when `now` is earlier, the
 * clock was set back, and every trip moves back by as much, so it keeps exactly the time it
 * had left, never finishing early and never losing progress. A patrol that still left after
 * `now` (a save that says so) leaves at `now`, its trip whole. A clock set forward can't be
 * told from real time passing, so it shortens a trip. Returns `game` itself when nothing moves.
 */
export function clockCheck(game: GameState, now: number, seen = now): GameState {
  const map = game.map;
  if (!map || !Number.isFinite(now) || !Number.isFinite(seen)) return game;
  const back = Math.max(0, Math.floor(seen - now));
  const at = Math.max(0, Math.floor(now));
  let moved = false;
  const patrols = map.patrols.map((p) => {
    const trip = p.backAt - p.sentAt;
    // Never before 0: a save's times are whole numbers from 0.
    const by = Math.min(back, p.sentAt);
    const sentAt = p.sentAt - by > now ? at : p.sentAt - by;
    if (sentAt === p.sentAt) return p;
    moved = true;
    return { ...p, sentAt, backAt: sentAt + trip };
  });
  return moved ? { ...game, map: { ...map, patrols } } : game;
}

/** A member as the report shows them. */
export interface ReportMember {
  id: string;
  name: string;
  injured: boolean;
  xp: number;
  /** Their level once the XP is in, and how many levels it gained. */
  level: number;
  levels: number;
}

/** A blueprint found: added, or lost at `BLUEPRINT.cap` of its type. */
export interface ReportBlueprint {
  base: WeaponId;
  kept: boolean;
}

/** What a patrol brought back. */
export interface MapReport {
  no: number;
  area: AreaId;
  danger: Danger;
  members: ReportMember[];
  /** Members whose one loot roll found something: at most one each. */
  finds: number;
  /** Guns found, in roll order, and the ones a full stash throws away for them. */
  weapons: OwnedWeapon[];
  thrown: OwnedWeapon[];
  blueprints: ReportBlueprint[];
  /** Scrap found, and Scrap the thrown guns salvage for. */
  scrap: number;
  salvage: number;
  medicine: number;
}

/** The stream a patrol's rolls come from. */
const PATROL_STREAM = 0x71c3a9e5;

/** One member's find: `loot`, by the area's table (mostly `MAP_PATROL.mostly` to 1). */
function rollLoot(rng: Rng, area: AreaId): AreaLoot {
  const { mostly, sometimes } = AREAS[area];
  return int(rng, 0, MAP_PATROL.mostly) < MAP_PATROL.mostly ? mostly : sometimes;
}

/**
 * The report patrol `p` brings back to `game`: from its seed alone, so the same patrol always
 * brings the same. Each member who is still in the camp rolls for an injury, then once for
 * loot. Every member earns `patrolXp`, injured or not.
 */
export function patrolReport(game: GameState, p: MapPatrol): MapReport {
  const rng = createRng((p.seed ^ PATROL_STREAM) >>> 0);
  const ratio = teamRatio(p.power, p.danger, p.best);
  const hurt = injuryChance(ratio);
  const roll = dropChance(p.danger, ratio);
  const xp = patrolXp(p.danger, p.best);
  const steps = DANGERS[p.danger].steps + AREAS[p.area].rarity;
  const members: ReportMember[] = [];
  const weapons: OwnedWeapon[] = [];
  const blueprints: ReportBlueprint[] = [];
  const held = { ...game.craft?.blueprints };
  let scrap = 0;
  let medicine = 0;
  let finds = 0;
  for (const id of p.members) {
    const d = game.reserve.find((r) => r.id === id) ?? game.roster.find((r) => r.id === id);
    if (!d) continue;
    const injured = chance(rng, hurt);
    const before = levelOf(d.xp).level;
    const after = levelOf(Math.min(MAX_COUNT, d.xp + xp)).level;
    members.push({ id, name: d.name, injured, xp, level: after, levels: after - before });
    if (!chance(rng, roll)) continue;
    finds += 1;
    const loot = rollLoot(rng, p.area);
    if (loot === 'weapon') {
      weapons.push(
        rollSquadGun(
          rng,
          `m${p.no}-${weapons.length + 1}`,
          replayWeights(p.best, 0, steps),
          p.best,
        ),
      );
    } else if (loot === 'blueprint') {
      const base = pick(rng, BLUEPRINT_GUNS);
      const kept = (held[base] ?? 0) < BLUEPRINT.cap;
      if (kept) held[base] = (held[base] ?? 0) + 1;
      blueprints.push({ base, kept });
    } else if (loot === 'scrap') {
      scrap += scrapFind(p.danger, p.best);
    } else {
      const [from, to] = AREAS[p.area].medicine;
      medicine += int(rng, from, to);
    }
  }
  const thrown = stashWith(game.armoury, weapons, stashCap(game)).thrown;
  // What the store takes: Medicine past `MAP_PATROL.medicineMax` is lost, so it isn't shown.
  medicine = Math.min(medicine, Math.max(0, MAP_PATROL.medicineMax - (game.medicine ?? 0)));
  return {
    no: p.no,
    area: p.area,
    danger: p.danger,
    members,
    finds,
    weapons,
    thrown,
    blueprints,
    scrap,
    salvage: salvageOf(thrown),
    medicine,
  };
}

/** The patrols back at `now`, in the order sent. */
export const backPatrols = (game: Pick<GameState, 'map'>, now: number): MapPatrol[] =>
  mapOf(game).patrols.filter((p) => isBack(p, now));

/**
 * Takes the report of the patrol at `area` (OK on the report): its XP, injuries (they rest
 * as if downed in a won fight), guns (into the stash, the weakest thrown away and salvaged),
 * blueprints, Scrap and Medicine go into the camp, the patrol is gone and its area is
 * replaced by a newly drawn one. Refused when no patrol is there or it isn't back at `now`,
 * so a report pays once.
 */
export function takeReport(
  game: GameState,
  area: AreaId,
  now: number,
): { ok: true; game: GameState; report: MapReport } | { ok: false; reason: string } {
  const p = patrolAt(game, area);
  if (!p) return { ok: false, reason: 'No patrol is out there' };
  if (!isBack(p, now)) return { ok: false, reason: 'The patrol is not back yet' };
  const report = patrolReport(game, p);
  const byId = new Map(report.members.map((m) => [m.id, m]));
  const back = (d: RosterDefender): RosterDefender => {
    const m = byId.get(d.id);
    if (!m) return d;
    const out = { ...d, xp: Math.min(MAX_COUNT, d.xp + m.xp) };
    return m.injured ? { ...out, rest: INJURY_REST.downed } : out;
  };
  const map = mapOf(game);
  // A new area in its place: never the one just searched, never one already on the map.
  const fresh = drawArea(
    map.seed,
    map.drawn,
    map.areas.map((a) => a.kind),
  );
  let craft = game.craft;
  for (const b of report.blueprints) if (b.kept) craft = withBlueprint(craft, b.base);
  const g: GameState = {
    ...game,
    roster: game.roster.map(back),
    reserve: game.reserve.map(back),
    armoury: stashWith(game.armoury, report.weapons, stashCap(game)).armoury,
    stock: scrapAfter(game.stock, report.scrap + report.salvage),
    map: {
      ...map,
      drawn: map.drawn + 1,
      areas: map.areas.map((a) => (a.kind === area ? fresh : a)),
      patrols: map.patrols.filter((x) => x !== p),
    },
  };
  if (craft) g.craft = craft;
  const medicine = Math.min(MAP_PATROL.medicineMax, (game.medicine ?? 0) + report.medicine);
  if (medicine > 0) g.medicine = medicine;
  return { ok: true, game: autoSquad(g), report };
}
