// The roster screen between hordes (design §6): each defender's level, stats, titles
// and status, their stat-point picker and loadout pickers, and the title badge (§15).
// Text only via textContent; the badge colour is a constant.
import {
  ITEMS,
  PROFESSIONS,
  RARITY_ORDER,
  STAT_NAMES,
  STATS,
  FREE_WEAPONS,
  WEAPONS,
  type FreeWeaponId,
  type ItemId,
  type Profession,
  type Stat,
} from '../core/data.ts';
import { heldLabel, type Held } from '../core/armoury.ts';
import {
  available,
  carrierOf,
  equip,
  ownedWeapons,
  spendPoint,
  type GameState,
  type RosterDefender,
} from '../core/game.ts';
import { isGun, weaponOf, type Loadout } from '../core/loadout.ts';
import { badgeOf, levelOf, titleIn, titleName, unspentPoints } from '../core/stats.ts';
import { defenderLabel, el, STAT_HINT } from './hud.ts';
import { BADGE_COLOUR } from './render.ts';

/** "●●" for an Adept: one pip per rank. */
export const pipText = (pips: number): string => '●'.repeat(pips);

/**
 * The free weapons each slot may hold (design §6): guns as primary; a sidearm, blade or
 * tool as secondary. Specialised guns are owned items, listed with the armoury's.
 */
export const PRIMARY_OPTIONS: readonly FreeWeaponId[] = FREE_WEAPONS.filter((id) => isGun(id));
export const SECONDARY_OPTIONS: readonly (FreeWeaponId | null)[] = [
  null,
  ...FREE_WEAPONS.filter((id) => weaponOf(id).kind !== 'gun'),
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
 * The choice a picker's `raw` value names ('' is none), or undefined: a value edited in
 * the page never reaches the core unless it is one of ours.
 */
export function choiceFor<T>(choices: readonly Choice<T>[], raw: string): Choice<T> | undefined {
  return choices.find((c) => c.value === raw);
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

/** One option of a picker: the value in the page, its text, and what choosing it gives. */
export interface Choice<T> {
  value: string;
  label: string;
  pick: T;
}

const plain = <T extends string | null>(
  options: readonly T[],
  table: Readonly<Record<string, { name: string }>>,
): Choice<T>[] =>
  options.map((id) => ({
    value: id ?? '',
    label: id === null ? 'None' : table[id]!.name,
    pick: id,
  }));

/**
 * What `d` may pick for `slot`: the free weapons, then every owned weapon that fits
 * (design §6 Gear), rarest first, each named with its rarity and affixes, and who carries it if
 * someone else does. Picking one carried by another defender is refused by `equip`.
 */
export function weaponChoices(
  game: GameState,
  d: RosterDefender,
  slot: 'primary' | 'secondary',
): Choice<Held | null>[] {
  const fits = (h: Held): boolean => (slot === 'primary' ? isGun(h) : weaponOf(h).kind !== 'gun');
  const owned = ownedWeapons(game)
    .filter(fits)
    // Rarest first, then by name, so a full armoury reads at a glance.
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
        heldLabel(a).localeCompare(heldLabel(b)) ||
        a.uid.localeCompare(b.uid),
    )
    .map((w) => {
      const by = carrierOf(game, w.uid);
      const note = by && by.id !== d.id ? ` · carried by ${by.name}` : '';
      return { value: w.uid, label: `${heldLabel(w)}${note}`, pick: w };
    });
  return [...plain(slot === 'primary' ? PRIMARY_OPTIONS : SECONDARY_OPTIONS, WEAPONS), ...owned];
}

export const ITEM_CHOICES: readonly Choice<ItemId | null>[] = plain(ITEM_OPTIONS, ITEMS);

/** The page value of what a slot holds: the weapon id, the owned weapon's uid, or '' for none. */
const valueOf = (h: Held | ItemId | null): string =>
  h === null ? '' : typeof h === 'string' ? h : h.uid;

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
    const pick = <T>(
      label: string,
      choices: readonly Choice<T>[],
      current: string,
      change: (value: T) => Loadout,
    ): HTMLElement => {
      const select = el('select', 'build-select');
      for (const c of choices) {
        const o = el('option', '', c.label);
        o.value = c.value;
        o.selected = c.value === current;
        select.append(o);
      }
      select.addEventListener('change', () => {
        const chosen = choiceFor(choices, select.value);
        if (chosen === undefined) return;
        const r = equip(game, d.id, change(chosen.pick));
        if (r.ok) {
          onChange(r.game);
        } else {
          note.textContent = r.reason;
          select.value = current;
        }
      });
      const field = el('label', 'build-field', label);
      field.append(select);
      return field;
    };
    const l = d.loadout;
    card.append(
      pick('Primary', weaponChoices(game, d, 'primary'), valueOf(l.primary), (primary) => ({
        ...l,
        primary: primary!,
      })),
      pick('Secondary', weaponChoices(game, d, 'secondary'), valueOf(l.secondary), (secondary) => ({
        ...l,
        secondary,
      })),
      pick('Item', ITEM_CHOICES, valueOf(l.item), (item) => ({ ...l, item })),
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
