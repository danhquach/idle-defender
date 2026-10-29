// The roster screen between hordes (design §6): each defender's level, stats, titles
// and status, their stat-point picker and loadout pickers, and the title badge (§15).
// Text only via textContent; the badge colour is a constant.
import {
  ITEMS,
  PROFESSIONS,
  STAT_NAMES,
  STATS,
  WEAPONS,
  type ItemId,
  type Profession,
  type Stat,
  type WeaponId,
} from '../core/data.ts';
import { available, equip, spendPoint, type GameState, type RosterDefender } from '../core/game.ts';
import { weaponOf, type Loadout } from '../core/loadout.ts';
import { badgeOf, levelOf, titleIn, titleName, unspentPoints } from '../core/stats.ts';
import { defenderLabel, el, STAT_HINT } from './hud.ts';
import { BADGE_COLOUR } from './render.ts';

/** "●●" for an Adept: one pip per rank. */
export const pipText = (pips: number): string => '●'.repeat(pips);

const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
/** What each slot may hold (design §6): guns as primary; a sidearm, blade or tool as secondary. */
export const PRIMARY_OPTIONS: readonly WeaponId[] = WEAPON_IDS.filter((id) => {
  const kind = weaponOf(id).kind;
  return kind === 'sidearm' || kind === 'gun';
});
export const SECONDARY_OPTIONS: readonly (WeaponId | null)[] = [
  null,
  ...WEAPON_IDS.filter((id) => weaponOf(id).kind !== 'gun'),
];
export const ITEM_OPTIONS: readonly (ItemId | null)[] = [null, ...(Object.keys(ITEMS) as ItemId[])];

/** "1h 12m" until `until`, rounded up to the minute. */
export function restLeft(until: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One defender's lines on the roster. */
export interface RosterEntry {
  label: string;
  level: string;
  stats: string;
  titles: string;
  points: string;
  status: string;
}

export function rosterEntry(d: RosterDefender, now: number): RosterEntry {
  const { level, into, next } = levelOf(d.xp);
  const titles = (Object.keys(PROFESSIONS) as Profession[])
    .map((p) => titleIn(d.stats, p))
    .flatMap((t) => (t ? [titleName(t)] : []));
  const left = unspentPoints(d);
  return {
    label: defenderLabel(d),
    level: `level ${level} · ${into}/${next} XP`,
    stats: STATS.map((s) => `${STAT_NAMES[s]} ${d.stats[s]}`).join(' · '),
    titles: titles.length ? titles.join(', ') : 'No titles yet',
    points: left > 0 ? `${left} stat point${left === 1 ? '' : 's'} to spend` : '',
    status: available(d, now) ? 'Fit' : `Resting · ${restLeft(d.injuredUntil!, now)} left`,
  };
}

/**
 * The option of `options` a picker's `raw` value names ('' is none), or undefined:
 * a value edited in the page never reaches the core unless it is one of ours.
 */
export function optionFor<T extends string | null>(
  options: readonly T[],
  raw: string,
): T | undefined {
  return options.find((id) => (id ?? '') === raw);
}

/** The title badge for `stats`: colour, pips and the title it stands for; null with no title. */
export function badgeStyle(
  stats: RosterDefender['stats'],
): { colour: string; pips: string; title: string } | null {
  const badge = badgeOf(stats);
  if (!badge) return null;
  return {
    colour: BADGE_COLOUR[badge.profession],
    pips: pipText(badge.pips),
    title: titleName(titleIn(stats, badge.profession)!),
  };
}

/** The title badge as a page element, or null with no title. */
export function badgeElement(d: RosterDefender): HTMLElement | null {
  const badge = badgeStyle(d.stats);
  if (!badge) return null;
  const span = el('span', 'roster-badge', badge.pips);
  span.style.backgroundColor = badge.colour;
  span.title = badge.title;
  span.setAttribute('aria-label', badge.title);
  return span;
}

const slotName = (id: string | null, table: Readonly<Record<string, { name: string }>>): string =>
  id === null ? 'None' : table[id]!.name;

/**
 * The roster's entries for `game` at `now`. A spend or an allowed equip goes out
 * through `onChange` with the new game; a refused equip says why under that defender
 * and changes nothing.
 */
export function rosterSection(
  game: GameState,
  now: number,
  onChange: (next: GameState) => void,
): HTMLElement[] {
  return game.roster.map((d) => {
    const entry = rosterEntry(d, now);
    const card = el('section', 'roster-entry');
    const head = el('h3', 'build-slot-title', entry.label);
    const badge = badgeElement(d);
    if (badge) head.prepend(badge);
    card.append(
      head,
      el('p', 'build-slot-note', `${entry.level} · ${entry.status}`),
      el('p', 'build-slot-note', entry.stats),
      el('p', 'build-slot-note', entry.titles),
    );
    if (entry.points) {
      const row = el('div', 'hud-pick-row');
      for (const stat of STATS) row.append(statButton(game, d, stat, onChange));
      card.append(el('p', 'build-slot-note', entry.points), row);
    }
    const note = el('p', 'build-option-reason');
    note.setAttribute('role', 'status');
    const pick = <T extends string | null>(
      label: string,
      options: readonly T[],
      current: T,
      table: Readonly<Record<string, { name: string }>>,
      change: (value: T) => Loadout,
    ): HTMLElement => {
      const select = el('select', 'build-select');
      for (const id of options) {
        const o = el('option', '', slotName(id, table));
        o.value = id ?? '';
        o.selected = id === current;
        select.append(o);
      }
      select.addEventListener('change', () => {
        const value = optionFor(options, select.value);
        if (value === undefined) return;
        const r = equip(game, d.id, change(value));
        if (r.ok) {
          onChange(r.game);
        } else {
          note.textContent = r.reason;
          select.value = current ?? '';
        }
      });
      const field = el('label', 'build-field', label);
      field.append(select);
      return field;
    };
    const l = d.loadout;
    card.append(
      pick('Primary', PRIMARY_OPTIONS, l.primary, WEAPONS, (primary) => ({ ...l, primary })),
      pick('Secondary', SECONDARY_OPTIONS, l.secondary, WEAPONS, (secondary) => ({
        ...l,
        secondary,
      })),
      pick('Item', ITEM_OPTIONS, l.item, ITEMS, (item) => ({ ...l, item })),
      note,
    );
    return card;
  });
}

function statButton(
  game: GameState,
  d: RosterDefender,
  stat: Stat,
  onChange: (next: GameState) => void,
): HTMLElement {
  const button = el('button', 'hud-button hud-pick-stat', `${STAT_NAMES[stat]} +1`);
  button.type = 'button';
  button.title = STAT_HINT[stat];
  button.addEventListener('click', () => {
    const r = spendPoint(game, d.id, stat);
    if (r.ok) onChange(r.game);
  });
  return button;
}
