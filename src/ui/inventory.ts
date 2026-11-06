// The Inventory (ID-079, redrawn as a grid in ID-092): a top-bar button beside the Menu
// opens a dialog of everything the camp holds now. A Weapons tab shows the squad's guns
// in a row (each survivor's, then the free pistol) over the stash: one square slot per
// place up to its cap, each gun as its icon framed in its rarity's colour, strongest
// first, the empty places shown empty. Selecting a slot (click, tap, arrow keys) or
// hovering it shows its details beside the grid: name, rarity, each affix and dmg/s.
// Between hordes a stash gun's details hold its set's Combine (ID-091): three of one kind
// and rarity make one of the next rarity, after a confirm. Like the Menu, the field goes
// inert behind it and an open Inventory holds a fight. Text reaches the page only
// through textContent.
import {
  affixCount,
  affixText,
  baseOf,
  gunPower,
  heldLabel,
  heldName,
  isOwned,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import {
  COMBINE_COUNT,
  RARITIES,
  STASH_CAP,
  WEAPONS,
  type Rarity,
  type WeaponId,
} from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { combineSets, nextRarity, squadOf, type CombineSet } from '../core/hordeonly.ts';
import { isGun } from '../core/loadout.ts';
import { el } from './hud.ts';
import { ART_URLS, GUN_ICON, type ArtId, type GunId } from './sprites.ts';

/** One weapon as the Inventory shows it. */
export interface InventoryItem {
  /** Which slot it is, kept across redraws: `stash:<uid>`, `squad:<id>` or `pistol`. */
  key: string;
  /** "Military Rifle"; the free pistol is "Pistol". */
  name: string;
  base: WeaponId;
  rarity: Rarity;
  /** Each affix as a line: "+7% damage". */
  affixes: string[];
  /** "17.2 dmg/s"; null for a weapon that is no gun (an older save's blade or tool). */
  power: string | null;
  /** The slot's badge: dmg/s rounded ("17"); null for no gun. */
  badge: string | null;
  /** The gun's icon; null for a weapon that is no gun. */
  icon: ArtId | null;
  /** Who fights with it ("Held by Ana"), the free pistol's note, or "In the stash". */
  where: string;
  /** The survivor who fights with it; null in the stash and for the free pistol. */
  holder: string | null;
  /** The stash gun itself, for its set's Combine; null for a gun in hand or the pistol. */
  owned: OwnedWeapon | null;
}

export interface InventoryView {
  /** "Stash 12/20"; "Stash 20/20 (full)" once the next drop would throw the weakest away. */
  stashHeading: string;
  /** The stash, strongest first; anything that is no gun after the guns. */
  stash: InventoryItem[];
  /** Empty places left under the cap (0 when full, or past it from an older save). */
  free: number;
  /** Each survivor in the squad and the gun they fight with, in squad order. */
  squad: { id: string; name: string; gun: InventoryItem }[];
  pistol: InventoryItem;
  /** Every stash set below Relic (ID-091): ready ones first, then by base weapon and rarity. */
  combine: CombineRow[];
}

/** One base weapon at one rarity in the stash, as the Combine shows it (ID-091). */
export interface CombineRow {
  /** "Rusty SMG". */
  name: string;
  base: WeaponId;
  rarity: Rarity;
  /** "2/3" while short; "4 in stash" once it can combine. */
  count: string;
  /** "1 more for a Common SMG"; "3 make a Common SMG". */
  note: string;
  /** The guns a combine uses up, weakest first; null while short of `COMBINE_COUNT`. */
  uses: OwnedWeapon[] | null;
}

/** What the Combine confirm shows: the guns used up and what comes out. */
export interface CombinePreview {
  used: InventoryItem[];
  makes: InventoryItem;
}

export const STASH_EMPTY = 'Empty. Every horde won drops a gun here.';
export const PISTOL_NOTE = 'Free and unlimited: every survivor has one.';
export const IN_STASH = 'In the stash.';
export const INVENTORY_NOTE = 'Pick each survivor’s gun on the start and result screens.';
export const COMBINE_NOTE = `${COMBINE_COUNT} stash guns of one kind and rarity make 1 of the next rarity.`;
export const COMBINE_HELD = 'Only stash guns combine: put it back in the stash first.';
export const COMBINE_TOP = 'Relic is the top rarity: it combines no further.';
export const COMBINE_WAIT = 'Combine between hordes, on the start or result screen.';
export const NO_AFFIXES = 'No affixes';
export const COMBINE_NOT_GUN = 'Only guns combine.';

const powerOf = (h: Held): number => (isGun(h) ? gunPower(h) : -1);

/** `h` as a slot: `key` names the slot, `where` says who has it, `holder` fights with it. */
function item(h: Held, key: string, where: string, holder: string | null = null): InventoryItem {
  const base = baseOf(h);
  const gun = isGun(h);
  const power = gun ? gunPower(h) : 0;
  return {
    key,
    name: heldName(h),
    base,
    rarity: isOwned(h) ? h.rarity : 'common',
    affixes: isOwned(h) ? h.affixes.map(affixText) : [],
    power: gun ? `${power.toFixed(1)} dmg/s` : null,
    badge: gun ? String(Math.round(power)) : null,
    icon: gun ? GUN_ICON[base as GunId] : null,
    where,
    holder,
    owned: key.startsWith('stash:') && isOwned(h) ? h : null,
  };
}

/** What the Inventory shows for `game`. */
export function inventoryView(game: Pick<GameState, 'armoury' | 'roster'>): InventoryView {
  const n = game.armoury.length;
  return {
    // An older save's stash past the cap is kept as it is (design §6), and is full too.
    stashHeading: `Stash ${n}/${STASH_CAP}${n >= STASH_CAP ? ' (full)' : ''}`,
    // A stable sort: equal guns keep the stash's order.
    stash: game.armoury
      .map((h) => ({ h, power: powerOf(h) }))
      .sort((a, b) => b.power - a.power)
      .map(({ h }) => item(h, `stash:${h.uid}`, IN_STASH)),
    free: Math.max(0, STASH_CAP - n),
    squad: squadOf(game).map((d) => ({
      id: d.id,
      name: d.name,
      // What they fight with: a primary that is no gun fights as the pistol (as squadGear).
      gun: item(
        isGun(d.loadout.primary) ? d.loadout.primary : 'pistol',
        `squad:${d.id}`,
        `Held by ${d.name}.`,
        d.name,
      ),
    })),
    pistol: item('pistol', 'pistol', PISTOL_NOTE),
    combine: combineRows(game),
  };
}

/** "Common SMG": a base weapon's name at `rarity`. */
const kindName = (set: Pick<CombineSet, 'base'>, rarity: Rarity): string =>
  `${RARITIES[rarity].name} ${WEAPONS[set.base].name}`;

function combineRows(game: Pick<GameState, 'armoury'>): CombineRow[] {
  const rows = combineSets(game).flatMap((set): CombineRow[] => {
    if (!set.next) return [];
    const n = set.guns.length;
    const makes = kindName(set, set.next);
    const ready = n >= COMBINE_COUNT;
    return [
      {
        name: kindName(set, set.rarity),
        base: set.base,
        rarity: set.rarity,
        count: ready ? `${n} in stash` : `${n}/${COMBINE_COUNT}`,
        note: ready
          ? `${COMBINE_COUNT} make a ${makes}`
          : `${COMBINE_COUNT - n} more for a ${makes}`,
        uses: ready ? set.guns.slice(0, COMBINE_COUNT) : null,
      },
    ];
  });
  // A stable sort: the ready sets first, each part in combineSets' order.
  return rows.sort((a, b) => Number(!a.uses) - Number(!b.uses));
}

/** The set `w` belongs to, or null at Relic (no set: it combines no further). */
const rowOf = (rows: readonly CombineRow[], w: OwnedWeapon): CombineRow | null =>
  rows.find((r) => r.base === w.base && r.rarity === w.rarity) ?? null;

/**
 * The confirm for combining `uses` (ID-091): the guns used up, and what comes out — its
 * rarity, how many affixes it rolls, and its dmg/s before them (the exact figure with none).
 */
export function combinePreview(uses: readonly OwnedWeapon[]): CombinePreview {
  const first = uses[0]!;
  const next = nextRarity(first.rarity)!;
  const n = affixCount(first.base, next);
  const bare = gunPower({ uid: '', base: first.base, rarity: next, affixes: [] });
  return {
    used: uses.map((w) => item(w, `stash:${w.uid}`, IN_STASH)),
    makes: {
      ...item({ uid: '', base: first.base, rarity: next, affixes: [] }, 'makes', ''),
      affixes: [
        n === 0 ? NO_AFFIXES : `${n} random ${n === 1 ? 'affix' : 'affixes'}, rolled on combine`,
      ],
      // With affixes still to roll, the figure is the gun's base, before them.
      power: `${n === 0 ? '' : 'base '}${bare.toFixed(1)} dmg/s`,
    },
  };
}

/** The line after a combine: "Made: Common SMG, 14.2 dmg/s"; with its affixes in brackets. */
export const combineResult = (w: OwnedWeapon): string =>
  `Made: ${heldLabel(w)}, ${gunPower(w).toFixed(1)} dmg/s`;

/** A slot's screen-reader name: "Military Rifle, Military rarity, 17.2 dmg/s, 2 affixes". */
export function slotLabel(it: InventoryItem, ready = false): string {
  const parts = [it.name, `${RARITIES[it.rarity].name} rarity`];
  if (it.power) parts.push(it.power);
  parts.push(
    it.affixes.length === 0
      ? 'no affixes'
      : `${it.affixes.length} ${it.affixes.length === 1 ? 'affix' : 'affixes'}`,
  );
  if (it.holder !== null) parts.push(`held by ${it.holder}`);
  if (ready) parts.push('can combine');
  return parts.join(', ');
}

/** The square art of a slot: the gun's icon (or its name, for no gun) and its badge. */
function slotFace(it: InventoryItem): HTMLElement[] {
  const face: HTMLElement[] = [];
  const url = it.icon ? ART_URLS[it.icon] : undefined;
  if (url) {
    // Decoration only: the slot's label names the gun.
    const img = el('img', 'gun-icon');
    img.alt = '';
    img.dataset.gun = it.base;
    img.src = url;
    img.draggable = false;
    face.push(img);
  } else {
    face.push(el('span', 'inv-slot-text', WEAPONS[it.base].name));
  }
  if (it.badge) face.push(el('span', 'inv-slot-badge', it.badge));
  return face;
}

/** A slot's button: its face, framed in its rarity's colour; `caption` under it (a name). */
function slot(it: InventoryItem, ready: boolean, caption?: string, tip = caption): HTMLElement {
  const li = el('li', 'inv-cell');
  const b = el('button', 'inv-slot');
  b.type = 'button';
  b.dataset.key = it.key;
  b.dataset.rarity = it.rarity;
  b.setAttribute('aria-label', slotLabel(it, ready));
  b.setAttribute('aria-pressed', 'false');
  b.tabIndex = -1;
  b.append(...slotFace(it));
  if (ready) b.append(el('span', 'inv-slot-ready', '▲'));
  li.append(b);
  if (caption !== undefined) {
    // A long name is cut short with an ellipsis; the whole name (or `tip`) shows on hover.
    const who = el('span', 'inv-who', caption);
    who.title = tip ?? caption;
    who.setAttribute('aria-hidden', 'true');
    li.append(who);
  }
  return li;
}

function list(label: string, className: string, cells: HTMLElement[]): HTMLElement {
  const ul = el('ul', className);
  // Some screen readers drop a list's role once its bullets are styled away.
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', label);
  ul.append(...cells);
  return ul;
}

const section = (...children: HTMLElement[]): HTMLElement => {
  const s = el('section', 'menu-section');
  s.append(...children);
  return s;
};

const button = (text: string, onClick: () => void, extra = ''): HTMLButtonElement => {
  const b = el('button', `build-option menu-action ${extra}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

/** The squad row and the stash grid for `view`; slots in a set ready to combine marked. */
export function inventoryGrid(view: InventoryView, canCombine = false): HTMLElement[] {
  const ready = (it: InventoryItem): boolean =>
    canCombine && !!it.owned && !!rowOf(view.combine, it.owned)?.uses;
  const empty = Array.from({ length: view.free }, () => {
    const li = el('li', 'inv-cell');
    li.setAttribute('aria-hidden', 'true');
    li.append(el('div', 'inv-slot inv-slot-empty'));
    return li;
  });
  return [
    section(
      el('h3', 'menu-heading', 'Squad'),
      list('Squad', 'inv-grid inv-squad', [
        ...view.squad.map((s) => slot(s.gun, false, s.name)),
        slot(view.pistol, false, 'Free pistol', PISTOL_NOTE),
      ]),
    ),
    section(
      el('h3', 'menu-heading inv-stash-heading', view.stashHeading),
      el('p', 'menu-note', view.stash.length > 0 ? INVENTORY_NOTE : STASH_EMPTY),
      list('Stash', 'inv-grid inv-stash', [
        ...view.stash.map((it) => slot(it, ready(it))),
        ...empty,
      ]),
    ),
  ];
}

/** What the Combine part of the details is doing now, and what its buttons call (ID-091). */
export interface CombineUi {
  /** Between hordes only: in a fight the set's count shows, with no button. */
  canCombine: boolean;
  /** The guns a confirm is up for, or null. */
  confirming: readonly OwnedWeapon[] | null;
  /** The line after the last combine (or why it was refused), or null. */
  result: string | null;
  ask(uses: readonly OwnedWeapon[]): void;
  confirm(): void;
  cancel(): void;
}

/** A gun's lines in the details: rarity, then each affix, then dmg/s. */
function facts(it: InventoryItem): HTMLElement[] {
  const name = el('p', 'inv-name', it.name);
  name.dataset.rarity = it.rarity;
  const rarity = el(
    'p',
    'inv-rarity',
    `${RARITIES[it.rarity].name} rarity · ${WEAPONS[it.base].name}`,
  );
  rarity.dataset.rarity = it.rarity;
  const affixes =
    it.affixes.length > 0
      ? list(
          'Affixes',
          'inv-affixes',
          it.affixes.map((a) => el('li', '', a)),
        )
      : el('p', 'inv-affixes inv-affixes-none', NO_AFFIXES);
  const out = [name, rarity, affixes];
  if (it.power) out.push(el('p', 'inv-power', it.power));
  return out;
}

/** `items` with each run of identical lines (name, affixes, dmg/s) counted once. */
function groups(items: readonly InventoryItem[]): { item: InventoryItem; n: number }[] {
  const out: { item: InventoryItem; n: number }[] = [];
  const same = (a: InventoryItem, b: InventoryItem): boolean =>
    a.name === b.name && a.power === b.power && a.affixes.join('\n') === b.affixes.join('\n');
  for (const it of items) {
    const last = out.at(-1);
    if (last && same(last.item, it)) last.n++;
    else out.push({ item: it, n: 1 });
  }
  return out;
}

/** The Combine part of a gun's details: its set's count and button, or why it can't. */
function combineBlock(it: InventoryItem, rows: readonly CombineRow[], ui: CombineUi): HTMLElement {
  const block = el('div', 'inv-combine');
  block.append(el('h4', 'inv-combine-label', 'Combine'));
  const status = el('p', 'menu-note inv-combine-result', ui.result ?? '');
  status.setAttribute('role', 'status');
  status.hidden = ui.result === null;
  // Focused after a combine (not a Tab stop), so it is read out and scrolled into view.
  status.tabIndex = -1;
  block.append(status);
  // An older save's blade or tool, in the stash or not: only guns combine.
  if (it.power === null) {
    block.append(el('p', 'menu-note', COMBINE_NOT_GUN));
    return block;
  }
  if (!it.owned) {
    block.append(el('p', 'menu-note', it.key === 'pistol' ? PISTOL_NOTE : COMBINE_HELD));
    return block;
  }
  const row = rowOf(rows, it.owned);
  if (!row) {
    block.append(el('p', 'menu-note', COMBINE_TOP));
    return block;
  }
  const uses = row.uses;
  if (ui.confirming && ui.canCombine) {
    const p = combinePreview(ui.confirming);
    const confirm = el('div', 'inv-combine-confirm');
    confirm.setAttribute('role', 'group');
    confirm.setAttribute('aria-label', `Combine into a ${p.makes.name}`);
    const lines = (label: string, items: InventoryItem[]): HTMLElement =>
      list(
        label,
        'inv-combine-list',
        groups(items).map(({ item: u, n }) => {
          const li = el('li', 'inv-combine-row');
          li.dataset.rarity = u.rarity;
          // Identical guns as one line: "3 × Rusty SMG".
          li.append(el('span', 'inv-name', n > 1 ? `${n} × ${u.name}` : u.name));
          li.append(el('span', 'inv-combine-affixes', u.affixes.join(', ') || NO_AFFIXES));
          if (u.power) li.append(el('span', 'inv-combine-power', u.power));
          return li;
        }),
      );
    const actions = el('div', 'menu-row');
    actions.append(
      button(`Combine into ${p.makes.name}`, ui.confirm, 'inv-combine-yes'),
      button('Cancel', ui.cancel, 'inv-combine-no'),
    );
    confirm.append(
      el('p', 'inv-combine-label', 'Uses up'),
      lines('Uses up', p.used),
      el('p', 'inv-combine-label', 'Makes'),
      lines('Makes', [p.makes]),
      actions,
    );
    block.append(confirm);
    return block;
  }
  block.append(el('p', 'menu-note inv-combine-count', `${row.name}: ${row.count} · ${row.note}`));
  if (uses && ui.canCombine) {
    const b = button(`Combine ${COMBINE_COUNT}`, () => ui.ask(uses), 'inv-combine-button');
    b.setAttribute('aria-label', `Combine ${COMBINE_COUNT} ${row.name}`);
    b.dataset.set = row.name;
    block.append(b, el('p', 'menu-note', COMBINE_NOTE));
  } else if (!ui.canCombine) {
    block.append(el('p', 'menu-note', COMBINE_WAIT));
  } else {
    block.append(el('p', 'menu-note', COMBINE_NOTE));
  }
  return block;
}

/** The details beside the grid for `it`; with its Combine when `combine` is given. */
export function detailsPanel(
  it: InventoryItem | null,
  combine?: { rows: readonly CombineRow[]; ui: CombineUi },
): HTMLElement[] {
  if (!it) return [el('p', 'menu-note', STASH_EMPTY)];
  const out = [...facts(it), el('p', 'menu-note inv-where', it.where)];
  if (combine) out.push(combineBlock(it, combine.rows, combine.ui));
  return out;
}

export interface InventoryOptions {
  /**
   * The camp now, whether a fight is on and not held by Space (for the Close label), and
   * whether guns can be combined now (between hordes).
   */
  state: () => {
    game: Pick<GameState, 'armoury' | 'roster'>;
    resumes: boolean;
    canCombine?: boolean;
  };
  /** Combines the stash guns `uids` (ID-091); without it the details have no Combine. */
  onCombine?: (uids: string[]) => { ok: true; weapon: OwnedWeapon } | { ok: false; reason: string };
}

export interface Inventory {
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
}

/** The Inventory button, top-right left of the Menu, and its dialog. */
export function createInventory(root: HTMLElement, opts: InventoryOptions): Inventory {
  const doc = root.ownerDocument;
  let opened = false;
  // The camp drawn last: a redraw only when it changes, so the grid keeps its scroll.
  let listed: Pick<GameState, 'armoury' | 'roster'> | null = null;
  let listedCombine = false;
  let view: InventoryView | null = null;
  // The slot selected (its key), and the one under the pointer, whose details show first.
  let selected: string | null = null;
  let hovered: string | null = null;
  // The Combine confirm up, and the line after the last combine (ID-091).
  let confirming: readonly OwnedWeapon[] | null = null;
  let result: string | null = null;

  const openButton = el('button', 'inv-button', 'Inventory');
  openButton.type = 'button';
  openButton.setAttribute('aria-haspopup', 'dialog');
  openButton.addEventListener('click', () => api.open());
  root.append(openButton);

  // Outside `root`, like the Menu, so the field can go inert behind it. It shares the
  // Menu's dialog classes for its look; tests and code reach either through its own scrim.
  const scrim = el('div', 'inv-scrim');
  scrim.hidden = true;
  const dialog = el('div', 'menu inv-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'inv-title');
  dialog.tabIndex = -1;
  scrim.append(dialog);
  doc.body.append(scrim);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });

  const title = el('h2', 'menu-title', 'Inventory');
  title.id = 'inv-title';
  const closeX = el('button', 'menu-close', '×');
  closeX.type = 'button';
  closeX.setAttribute('aria-label', 'Close inventory');
  closeX.addEventListener('click', () => api.close());
  const head = el('div', 'menu-head');
  head.append(title, closeX);
  // Tabs: Weapons for now; items and materials can join it later.
  const tablist = el('div', 'menu-tabs');
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Inventory');
  const tab = el('button', 'menu-tab', 'Weapons');
  tab.type = 'button';
  tab.id = 'inv-tab-weapons';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('aria-controls', 'inv-panel-weapons');
  tablist.append(tab);
  const panel = el('div', 'inv-panel');
  panel.id = 'inv-panel-weapons';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  const body = el('div', 'menu-body inv-body');
  const details = el('div', 'inv-details');
  details.setAttribute('role', 'region');
  // No live region: the focused slot's label already says what it is; the Combine
  // result line is its own status.
  details.setAttribute('aria-label', 'Details');
  panel.append(body, details);
  const hintText = el('span', '');
  const hint = el('span', 'inv-hint');
  hint.append(el('kbd', 'menu-key', 'Esc'), hintText);
  const done = el('button', 'hud-button', 'Close');
  done.type = 'button';
  done.addEventListener('click', () => api.close());
  const foot = el('div', 'menu-foot');
  foot.append(hint, done);
  dialog.append(head, tablist, panel, foot);

  const slots = (): HTMLButtonElement[] => [
    ...body.querySelectorAll<HTMLButtonElement>('.inv-slot[data-key]'),
  ];
  const slotOf = (key: string | null): HTMLButtonElement | undefined =>
    slots().find((b) => b.dataset.key === key);
  const items = (): InventoryItem[] =>
    view ? [...view.squad.map((s) => s.gun), view.pistol, ...view.stash] : [];

  // Keys stay in the dialog (the field's keys never see them); Esc closes, Tab cycles.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      // A held-down Esc repeats: only a fresh press acts. An open Combine confirm goes first.
      if (e.repeat) return;
      if (confirming) cancel();
      else api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const at = doc.activeElement as HTMLElement | null;
    const stops = [...dialog.querySelectorAll<HTMLElement>('button, [tabindex]')].filter(
      (n) => n !== dialog && (n.tabIndex >= 0 || n === at) && !n.closest('[hidden]'),
    );
    const i = at ? stops.indexOf(at) : -1;
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      done.focus();
    } else if (!e.shiftKey && (i < 0 || i === stops.length - 1)) {
      e.preventDefault();
      closeX.focus();
    }
  });

  // The grid: one Tab stop; arrows, Home and End move through every slot.
  body.addEventListener('keydown', (e) => {
    const all = slots();
    const i = all.indexOf(doc.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let next: number;
    if (e.key === 'ArrowRight') next = Math.min(all.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = all.length - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      next = vertical(all, i, e.key === 'ArrowDown');
    else return;
    e.preventDefault();
    const to = all[next];
    if (to) select(to.dataset.key!, true);
  });

  /** The slot above or below `all[i]`: nearest across in the next row up or down. */
  function vertical(all: HTMLButtonElement[], i: number, down: boolean): number {
    const from = all[i]!.getBoundingClientRect();
    let best = i;
    let bestRow = Infinity;
    let bestX = Infinity;
    all.forEach((b, j) => {
      const r = b.getBoundingClientRect();
      const dy = down ? r.top - from.top : from.top - r.top;
      if (dy <= 1) return;
      const dx = Math.abs(r.left - from.left);
      if (dy < bestRow - 1 || (Math.abs(dy - bestRow) <= 1 && dx < bestX)) {
        best = j;
        bestRow = dy;
        bestX = dx;
      }
    });
    return best;
  }

  body.addEventListener('click', (e) => {
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    if (b) select(b.dataset.key!, true);
  });
  body.addEventListener('mouseover', (e) => {
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    const key = b?.dataset.key ?? null;
    // A confirm stays up while the pointer wanders over the grid.
    if (key === hovered || confirming) return;
    hovered = key;
    drawDetails();
  });
  body.addEventListener('mouseleave', () => {
    if (hovered === null) return;
    hovered = null;
    drawDetails();
  });

  /** Selects the slot `key`; `focus` moves the keyboard there too. */
  function select(key: string, focus: boolean): void {
    if (key !== selected) {
      confirming = null;
      result = null;
    }
    selected = key;
    hovered = null;
    markSelected();
    drawDetails();
    if (focus) {
      const b = slotOf(key);
      b?.focus();
      b?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  function markSelected(): void {
    for (const b of slots()) {
      const on = b.dataset.key === selected;
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function drawDetails(): void {
    const all = items();
    const it = all.find((x) => x.key === (hovered ?? selected)) ?? null;
    const combine =
      opts.onCombine && view
        ? {
            rows: view.combine,
            ui: {
              canCombine: listedCombine,
              confirming: hovered ? null : confirming,
              result: hovered ? null : result,
              ask(uses: readonly OwnedWeapon[]) {
                // Asked from a hovered gun's details: that gun becomes the selected one,
                // so the confirm stays up for it when the pointer moves on.
                if (hovered !== null) selected = hovered;
                hovered = null;
                markSelected();
                confirming = uses;
                result = null;
                drawDetails();
                details.querySelector<HTMLElement>('.inv-combine-no')?.focus();
              },
              confirm,
              cancel,
            },
          }
        : undefined;
    details.replaceChildren(...detailsPanel(it, combine));
  }

  /** Draws the grid for `game`; a confirm whose guns have left the stash is dropped. */
  function draw(game: Pick<GameState, 'armoury' | 'roster'>, canCombine: boolean): void {
    listed = game;
    listedCombine = canCombine;
    if (confirming && !(canCombine && confirming.every((w) => game.armoury.includes(w)))) {
      confirming = null;
    }
    // Focus in the grid or the details: both are redrawn, so it comes back to the slot.
    const hadFocus = body.contains(doc.activeElement) || details.contains(doc.activeElement);
    view = inventoryView(game);
    body.replaceChildren(...inventoryGrid(view, canCombine));
    const keys = items().map((x) => x.key);
    if (selected === null || !keys.includes(selected)) {
      // The strongest stash gun first; with an empty stash, the first survivor's gun.
      selected = view.stash[0]?.key ?? keys[0] ?? null;
    }
    if (hovered !== null && !keys.includes(hovered)) hovered = null;
    markSelected();
    drawDetails();
    if (hadFocus && !dialog.contains(doc.activeElement)) slotOf(selected)?.focus();
  }

  function confirm(): void {
    const uses = confirming;
    if (!uses || !opts.onCombine) return;
    confirming = null;
    const r = opts.onCombine(uses.map((w) => w.uid));
    result = r.ok ? combineResult(r.weapon) : r.reason;
    // The new gun takes a used gun's place: select it, so its details say what was made.
    if (r.ok) selected = `stash:${r.weapon.uid}`;
    const { game, canCombine = false } = opts.state();
    draw(game, canCombine);
    // Focus on the line saying what it made: a screen reader reads it.
    (details.querySelector<HTMLElement>('.inv-combine-result') ?? slotOf(selected))?.focus();
  }

  function cancel(): void {
    if (!confirming) return;
    confirming = null;
    drawDetails();
    // Back to the set's own Combine button.
    (details.querySelector<HTMLElement>('.inv-combine-button') ?? slotOf(selected))?.focus();
  }

  const api: Inventory = {
    isOpen: () => opened,
    open() {
      if (opened) return;
      opened = true;
      confirming = null;
      result = null;
      selected = null;
      hovered = null;
      // Drawn afresh: the details start on the strongest gun, with no confirm or result.
      listed = null;
      scrim.hidden = false;
      root.setAttribute('inert', '');
      api.refresh();
      body.scrollTop = 0;
      slotOf(selected)?.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      scrim.hidden = true;
      root.removeAttribute('inert');
      openButton.focus();
    },
    refresh() {
      if (!opened) return;
      const { game, resumes, canCombine = false } = opts.state();
      hintText.textContent = resumes ? ' closes and resumes' : ' closes';
      done.textContent = resumes ? 'Resume' : 'Close';
      if (game === listed && canCombine === listedCombine) return;
      draw(game, canCombine);
    },
  };
  return api;
}
