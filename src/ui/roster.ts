// The roster screen between hordes (design §6): the camp (§11: people and slots, the
// camp upgrade, camp level and picks, the next free recruit), then each defender's
// level, stats, titles and status, their stat-point picker, loadout pickers and Dismiss,
// and the title badge (§15). Text only via textContent; the badge colour is a constant.
import {
  campLevelOf,
  campSlots,
  campUpgradeCost,
  dismiss,
  dismissLock,
  takeCampPick,
  upgradeCamp,
} from '../core/camp.ts';
import {
  CAMP_PICK_IDS,
  CAMP_PICK_RANKS,
  CAMP_PICKS,
  ITEMS,
  LOCATIONS,
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
import { patrolDue, type Patrol } from '../core/patrol.ts';
import { badgeOf, levelOf, titleIn, titleName, unspentPoints } from '../core/stats.ts';
import { campPickText, defenderLabel, el, STAT_HINT, stockText } from './hud.ts';
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

/** `patrol` is the one `d` is out on, if any. */
export function rosterEntry(d: RosterDefender, now: number, patrol?: Patrol): RosterEntry {
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
    status: patrol
      ? `On patrol · ${LOCATIONS[patrol.location].name} · ${restLeft(patrolDue(patrol), now)} left`
      : available(d, now)
        ? 'Fit'
        : `Resting · ${restLeft(d.injuredUntil!, now)} left`,
  };
}

/**
 * The camp's lines (design §11): people and slots, the camp level and its XP, the picks
 * taken, and when the roster floor's next free recruit arrives.
 */
export function campLines(game: GameState, now: number): string[] {
  const { level, into, next } = campLevelOf(game.camp.xp);
  const taken = CAMP_PICK_IDS.filter((id) => game.camp.picks[id] > 0).map(
    (id) => `${CAMP_PICKS[id].name} ${game.camp.picks[id]}/${CAMP_PICK_RANKS}`,
  );
  const at = game.camp.recruitAt;
  return [
    `Camp ${game.roster.length}/${campSlots(game)} people`,
    `Camp level ${level} · ${into}/${next} XP`,
    taken.length ? `Camp picks: ${taken.join(', ')}` : 'No camp picks yet',
    ...(at === null ? [] : [`A free recruit arrives in ${restLeft(at, now)}`]),
  ];
}

/**
 * The camp section: its lines, the next camp upgrade with its cost or why not, and any
 * camp-level offer still waiting. A change goes out through `onChange`.
 */
export function campSection(
  game: GameState,
  now: number,
  onChange: (next: GameState) => void,
): HTMLElement {
  const section = el('section', 'roster-entry');
  section.append(
    el('h3', 'build-slot-title', 'Camp'),
    ...campLines(game, now).map((line) => el('p', 'build-slot-note', line)),
  );
  const cost = campUpgradeCost(game);
  const upgrade = el('button', 'build-option');
  upgrade.type = 'button';
  upgrade.append(
    el('span', 'build-option-label', cost ? 'Expand the camp (+2 people)' : 'Expand the camp'),
  );
  if (cost) upgrade.append(el('span', 'build-option-cost', `(${stockText(cost)})`));
  const r = upgradeCamp(game);
  if (r.ok) upgrade.addEventListener('click', () => onChange(r.game));
  else {
    upgrade.disabled = true;
    upgrade.append(el('span', 'build-option-reason', r.reason));
  }
  section.append(upgrade);
  const offer = game.camp.offers[0];
  if (offer) {
    const row = el('div', 'hud-pick-row');
    for (const id of offer) {
      const button = el('button', 'hud-button', campPickText(game.camp, id));
      button.type = 'button';
      button.addEventListener('click', () => {
        const taken = takeCampPick(game, id);
        if (taken.ok) onChange(taken.game);
      });
      row.append(button);
    }
    section.append(el('p', 'build-slot-note', 'Camp level up: pick one'), row);
  }
  return section;
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
 * The camp section, then the roster's entries for `game` at `now`. A spend, an allowed
 * equip or a dismiss `ask` agrees to goes out through `onChange` with the new game; a
 * refused equip says why under that defender and changes nothing.
 */
export function rosterSection(
  game: GameState,
  now: number,
  onChange: (next: GameState) => void,
  ask: (question: string) => boolean,
): HTMLElement[] {
  return [campSection(game, now, onChange), ...game.roster.map((d) => defenderCard(d))];

  function defenderCard(d: RosterDefender): HTMLElement {
    const entry = rosterEntry(
      d,
      now,
      game.patrols.find((p) => p.members.includes(d.id)),
    );
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
      dismissButton(game, d, onChange, ask),
      note,
    );
    return card;
  }
}

/** "Dismiss": asks first; the defender leaves for good and their weapons go to the armoury. */
function dismissButton(
  game: GameState,
  d: RosterDefender,
  onChange: (next: GameState) => void,
  ask: (question: string) => boolean,
): HTMLElement {
  const button = el('button', 'build-option');
  button.type = 'button';
  button.append(el('span', 'build-option-label', 'Dismiss'));
  const lock = dismissLock(game, d.id);
  if (lock !== null) {
    button.disabled = true;
    button.append(el('span', 'build-option-reason', lock));
    return button;
  }
  button.addEventListener('click', () => {
    if (!ask(dismissQuestion(d))) return;
    const r = dismiss(game, d.id);
    if (r.ok) onChange(r.game);
  });
  return button;
}

/** "Ava joined the camp as a free recruit." / "Ava and Ben joined the camp as free recruits." */
export function recruitNotice(names: readonly string[]): string {
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return names.length > 1
    ? `${who} joined the camp as free recruits.`
    : `${who} joined the camp as a free recruit.`;
}

/** The confirm for dismissing `d`. */
export const dismissQuestion = (d: Pick<RosterDefender, 'name'>): string =>
  `Dismiss ${d.name}? They leave the camp for good; their weapons go to the armoury.`;

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
