// The world map between hordes (design §10, ID-028): the region with each revealed
// location, its route from the camp and its risk colour; the patrols out on their
// routes; and, in the build panel, the picked location, the party picker, the risk
// screen and the patrol reports. Text only via textContent; colours are constants.
import {
  BATTERIES,
  LOCATIONS,
  MAP_CAMP,
  MAP_SPOTS,
  PATROL,
  RARITIES,
  WEAPONS,
  type LocationId,
  type LootEntry,
  type RiskRating,
} from '../core/data.ts';
import { onPatrol, type GameState, type RosterDefender } from '../core/game.ts';
import {
  bonusRolls,
  idle,
  locationDanger,
  memberStrength,
  partyStrength,
  patrolDue,
  patrolRisk,
  patrolsUnlocked,
  revealedLocations,
  tripMinutes,
  type Patrol,
  type PatrolReport,
  type ReportWeapon,
} from '../core/patrol.ts';
import { clockTime, defenderLabel, el, stockText } from './hud.ts';
import { restLeft } from './roster.ts';
import { ART_URLS, MAP_ART, MAP_PICTURE } from './sprites.ts';

export const RISK_NAME: Readonly<Record<RiskRating, string>> = {
  safe: 'Safe',
  risky: 'Risky',
  dangerous: 'Dangerous',
  deadly: 'Deadly',
};

/** Each rating's ring on the map; the rating is always written beside it too. */
export const RISK_COLOUR: Readonly<Record<RiskRating, string>> = {
  safe: '#6f9a5a',
  risky: '#c9a93f',
  dangerous: '#c9733a',
  deadly: '#b8433a',
};

/** Why the world map can't open yet, or null when it can. */
export const mapRefusal = (game: GameState): string | null =>
  patrolsUnlocked(game) ? null : `Patrols open after Horde ${PATROL.unlock - 1}`;

const capital = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
const percent = (p: number): string => `${Math.round(p * 100)}%`;

/** One loot line's name: "Food", "Gas", "Standard batteries", "Pistol or Shotgun", "Anything". */
export function lootName(e: LootEntry): string {
  switch (e.kind) {
    case 'material':
      return capital(e.id);
    case 'gas':
      return 'Gas';
    case 'battery':
      return `${BATTERIES[e.id].name} batteries`;
    case 'weapon':
      return e.bases.map((b) => WEAPONS[b].name).join(' or ');
    case 'anything':
      return 'Anything';
  }
}

/** What `location` mostly drops (at least half the top weight) and sometimes drops. */
export function lootLines(location: LocationId): { mostly: string; sometimes: string } {
  const loot = LOCATIONS[location].loot;
  const top = Math.max(...loot.map((e) => e.weight));
  const names = (keep: (e: LootEntry) => boolean): string =>
    loot.filter(keep).map(lootName).join(', ') || 'nothing else';
  return {
    mostly: names((e) => e.weight * 2 >= top),
    sometimes: names((e) => e.weight * 2 < top),
  };
}

/** "1h 30m" for a trip of `minutes`. */
export function tripText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * The biggest party that may leave at `now`: every idle defender, less the weakest when
 * that would take everyone left at the camp (one must stay, ID-027).
 */
export function biggestParty(game: GameState, now: number): RosterDefender[] {
  const free = game.roster.filter((d) => idle(game, d, now));
  const home = game.roster.filter((d) => !onPatrol(game, d.id));
  if (free.length < home.length || free.length === 0) return free;
  const weakest = free.reduce((w, d) => (memberStrength(d) < memberStrength(w) ? d : w));
  return free.filter((d) => d !== weakest);
}

/** The picked party: the picked ids that are idle at `now`, in roster order. */
export const pickedParty = (
  game: GameState,
  picked: ReadonlySet<string>,
  now: number,
): RosterDefender[] => game.roster.filter((d) => picked.has(d.id) && idle(game, d, now));

/** The party the map rates (design D2): the picked one, or the biggest allowed. */
export function ratedParty(
  game: GameState,
  picked: ReadonlySet<string>,
  now: number,
): RosterDefender[] {
  const party = pickedParty(game, picked, now);
  return party.length > 0 ? party : biggestParty(game, now);
}

/** `location`'s rating for `party`, or null with nobody to send. */
export const mapRating = (
  party: readonly RosterDefender[],
  location: LocationId,
): RiskRating | null => (party.length > 0 ? patrolRisk(party, location).rating : null);

const strengthText = (s: number): string => (Math.round(s * 10) / 10).toString();

/** The risk screen's lines for `party` at `location`. */
export function riskLines(party: readonly RosterDefender[], location: LocationId): string[] {
  if (party.length === 0) return ['Pick who goes to see the risk.'];
  const strength = partyStrength(party);
  const risk = patrolRisk(party, location);
  return [
    `Risk: ${RISK_NAME[risk.rating]}`,
    `Party strength ${strengthText(strength)} vs danger ${locationDanger(location)}`,
    `Each member: ${percent(risk.injured)} injured, ${percent(risk.dead)} killed`,
    `Whole party lost: ${percent(risk.wipe)}`,
    `Loot rolls: ${PATROL.rolls} + ${bonusRolls(strength, location)}`,
  ];
}

/** One roster line in the party picker: free to send, or why not. */
export interface PartyRow {
  id: string;
  label: string;
  free: boolean;
}

export function partyRows(game: GameState, now: number): PartyRow[] {
  return game.roster.map((d) => {
    const label = `${defenderLabel(d)} · strength ${strengthText(memberStrength(d))}`;
    const out = game.patrols.find((p) => p.members.includes(d.id));
    if (out) {
      return {
        id: d.id,
        label: `${label} · on patrol, back at ${clockTime(patrolDue(out))}`,
        free: false,
      };
    }
    if (!idle(game, d, now)) {
      return {
        id: d.id,
        label: `${label} · injured until ${clockTime(d.injuredUntil!)}`,
        free: false,
      };
    }
    return { id: d.id, label, free: true };
  });
}

/** Weapons the dead left at `location`, waiting for the next patrol there. */
export const waitingAt = (game: GameState, location: LocationId): number =>
  game.leftBehind.filter((w) => w.location === location).length;

/** The location panel's facts: tier, trip, loot and weapons waiting. */
export function locationLines(game: GameState, location: LocationId): string[] {
  const loot = lootLines(location);
  const waiting = waitingAt(game, location);
  return [
    `Tier ${LOCATIONS[location].tier} · round trip ${tripText(tripMinutes(location))}`,
    `Mostly: ${loot.mostly}`,
    `Sometimes: ${loot.sometimes}`,
    ...(waiting > 0
      ? [`${waiting} weapon${waiting === 1 ? '' : 's'} left here by the fallen`]
      : []),
  ];
}

/** How far along its route `p` is at `now`: 0 at the camp, 1 at the location. */
export function routeShare(p: Patrol, now: number): number {
  const { travel, search } = LOCATIONS[p.location];
  const minutes = (now - p.sentAt) / 60_000;
  if (minutes <= 0) return 0;
  if (minutes < travel) return minutes / travel;
  if (minutes < travel + search) return 1;
  return Math.max(0, 1 - (minutes - travel - search) / travel);
}

/** "Gas station · Bob, Ann · 12m left". */
export function patrolLine(game: GameState, p: Patrol, now: number): string {
  const names = p.members.map((id) => game.roster.find((d) => d.id === id)?.name ?? '?');
  return `${LOCATIONS[p.location].name} · ${names.join(', ')} · ${restLeft(patrolDue(p), now)} left`;
}

const weaponText = (w: ReportWeapon): string =>
  `${RARITIES[w.rarity].name} ${WEAPONS[w.base].name}${w.kept ? '' : ' (salvaged)'}`;

/** A report's heading and lines, newest first in the list. */
export function reportLines(r: PatrolReport): { title: string; lines: string[] } {
  const title = `${LOCATIONS[r.location].name} · back at ${clockTime(r.returnedAt)}`;
  const lines = [`Sent: ${r.names.join(', ')}`];
  if (r.wiped) return { title, lines: [...lines, 'The whole party was lost. Nothing came back.'] };
  const batteries = (Object.keys(r.batteries) as (keyof typeof r.batteries)[])
    .filter((b) => r.batteries[b] > 0)
    .map(
      (b) =>
        `${r.batteries[b]} ${BATTERIES[b].name.toLowerCase()} batter${r.batteries[b] === 1 ? 'y' : 'ies'}`,
    );
  const found = [
    ...(stockText(r.stock) === 'nothing' ? [] : [stockText(r.stock)]),
    ...(r.gas > 0 ? [`${r.gas} gas`] : []),
    ...batteries,
  ];
  lines.push(`Found: ${found.length > 0 ? found.join(', ') : 'no materials'}`);
  if (r.weapons.length > 0) lines.push(`Weapons: ${r.weapons.map(weaponText).join(', ')}`);
  if (r.recovered.length > 0) lines.push(`Recovered: ${r.recovered.map(weaponText).join(', ')}`);
  lines.push(`${r.xp} XP each`);
  if (r.injured.length > 0) lines.push(`Injured: ${r.injured.join(', ')}`);
  if (r.dead.length > 0) lines.push(`Didn't come back: ${r.dead.join(', ')}`);
  return { title, lines };
}

const SVG = 'http://www.w3.org/2000/svg';

/** A place's icon inside its ring; empty alt text, so a screen reader reads the name. */
function icon(src: string): HTMLElement {
  const ring = el('span', 'worldmap-icon');
  const img = el('img', 'worldmap-icon-art');
  img.src = src;
  img.alt = '';
  ring.append(img);
  return ring;
}
const pct = (share: number): string => `${share * 100}%`;

/**
 * The map's contents: routes, the camp, each revealed location (a button that picks
 * it, ringed in its risk colour with the rating written under it) and a marker per
 * patrol out. Markers and their timers move with `tickMap`.
 */
export function mapContents(
  game: GameState,
  party: readonly RosterDefender[],
  selected: LocationId | null,
  now: number,
  onPick: (location: LocationId) => void,
): Element[] {
  const shown = revealedLocations(game);
  // The region's art, decoration only: places and routes carry the meaning.
  const region = el('img', 'worldmap-region');
  region.src = ART_URLS[MAP_PICTURE] ?? '';
  region.alt = '';
  const routes = document.createElementNS(SVG, 'svg');
  routes.setAttribute('class', 'worldmap-routes');
  routes.setAttribute('viewBox', '0 0 100 100');
  routes.setAttribute('preserveAspectRatio', 'none');
  routes.setAttribute('aria-hidden', 'true');
  for (const id of shown) {
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', String(MAP_CAMP.x * 100));
    line.setAttribute('y1', String(MAP_CAMP.y * 100));
    line.setAttribute('x2', String(MAP_SPOTS[id].x * 100));
    line.setAttribute('y2', String(MAP_SPOTS[id].y * 100));
    line.setAttribute('class', id === selected ? 'worldmap-route is-picked' : 'worldmap-route');
    routes.append(line);
  }
  const camp = el('div', 'worldmap-camp', 'Camp');
  camp.style.left = pct(MAP_CAMP.x);
  camp.style.top = pct(MAP_CAMP.y);
  const spots = shown.map((id) => {
    const rating = mapRating(party, id);
    const button = el('button', id === selected ? 'worldmap-spot is-picked' : 'worldmap-spot');
    button.type = 'button';
    button.style.left = pct(MAP_SPOTS[id].x);
    button.style.top = pct(MAP_SPOTS[id].y);
    button.style.setProperty('--risk', rating ? RISK_COLOUR[rating] : '#777');
    button.setAttribute('aria-pressed', String(id === selected));
    button.dataset.location = id;
    button.append(
      icon(ART_URLS[MAP_ART[id]] ?? ''),
      el('span', 'worldmap-name', `${LOCATIONS[id].name} · T${LOCATIONS[id].tier}`),
      el('span', 'worldmap-risk', rating ? RISK_NAME[rating] : 'Nobody can go'),
    );
    button.addEventListener('click', () => onPick(id));
    return button;
  });
  const markers = game.patrols.map((p) => {
    const marker = el('div', 'worldmap-patrol');
    marker.dataset.patrol = String(p.no);
    marker.append(el('span', 'worldmap-patrol-label', patrolLine(game, p, now)));
    placeMarker(marker, p, now);
    return marker;
  });
  return [region, routes, camp, ...spots, ...markers];
}

function placeMarker(marker: HTMLElement, p: Patrol, now: number): void {
  const t = routeShare(p, now);
  const to = MAP_SPOTS[p.location];
  marker.style.left = pct(MAP_CAMP.x + (to.x - MAP_CAMP.x) * t);
  marker.style.top = pct(MAP_CAMP.y + (to.y - MAP_CAMP.y) * t);
}

/** Moves the patrol markers and rewrites each patrol's time left (the panel's lines included). */
export function tickMap(root: ParentNode, game: GameState, now: number): void {
  for (const p of game.patrols) {
    const line = patrolLine(game, p, now);
    const no = String(p.no);
    for (const node of root.querySelectorAll<HTMLElement>('[data-patrol]')) {
      if (node.dataset.patrol !== no) continue;
      if (node.classList.contains('worldmap-patrol')) {
        placeMarker(node, p, now);
        const label = node.querySelector('.worldmap-patrol-label');
        if (label) label.textContent = line;
      } else {
        node.textContent = line;
      }
    }
  }
}
