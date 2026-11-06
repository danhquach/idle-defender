// The Inventory (ID-079, redrawn as a grid in ID-092): a top-bar button beside the Menu
// opens a dialog of everything the camp holds now. A Weapons tab shows the squad's guns
// in a row (each survivor's, then the free pistol) over the stash: one square slot per
// place up to its cap, each gun as its icon framed in its rarity's colour, strongest
// first, the empty places shown empty. Selecting a slot (click, tap, arrow keys) or
// hovering it shows its details beside the grid: name, rarity, each affix and dmg/s.
// Between hordes a stash gun's details hold its set's Combine (ID-091): three of one kind
// and rarity make one of the next rarity, after a confirm. Like the Menu, the field goes
// inert behind it and an open Inventory holds a fight. Between hordes guns move by drag
// and drop (ID-095): a stash gun or the free pistol onto a survivor equips it, a
// survivor's gun into the stash takes it off them, and a stash gun onto one of its set
// opens that set's Combine; a gun's details have buttons that do the same. Text reaches
// the page only through textContent.
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
import {
  combineSets,
  nextRarity,
  squadOf,
  type CombineSet,
  type GunChoice,
} from '../core/hordeonly.ts';
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
  /**
   * Each survivor in the squad and the gun they fight with, in squad order; `uid` is the
   * stash gun they hold, null on the free pistol.
   */
  squad: { id: string; name: string; gun: InventoryItem; uid: string | null }[];
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
export const DRAG_NOTE =
  'Drag a gun onto a survivor to equip it, into the stash to take it off them, or onto a gun like it to combine.';
export const DRAG_NOTE_TOUCH =
  'Hold a gun, then drag it onto a survivor to equip it, into the stash to take it off them, or onto a gun like it to combine.';
export const GUNS_WAIT = 'Change guns between hordes, on the start or result screen.';
export const STASH_FULL = 'Stash full';

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
    squad: squadOf(game).map((d) => {
      // What they fight with: a primary that is no gun fights as the pistol (as squadGear).
      const held = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
      return {
        id: d.id,
        name: d.name,
        gun: item(held, `squad:${d.id}`, `Held by ${d.name}.`, d.name),
        uid: isOwned(held) ? held.uid : null,
      };
    }),
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

/** What dropping one slot on another does (ID-095); `refused` says why, `none` puts it back. */
export type Drop =
  | { kind: 'equip'; defender: string; choice: GunChoice }
  | { kind: 'combine'; uses: OwnedWeapon[] }
  | { kind: 'refused'; reason: string }
  | { kind: 'none' };

/** Whether slot `key` can be picked up: a stash gun, the free pistol, or a survivor's stash gun. */
export function canDrag(view: InventoryView, key: string): boolean {
  if (key === 'pistol') return true;
  if (view.squad.some((s) => s.gun.key === key && s.uid !== null)) return true;
  return view.stash.some((it) => it.key === key && it.power !== null);
}

/**
 * Dropping slot `from` on `to`: a slot's key, `stash` (the stash grid itself, an empty
 * place or its heading) or null (nothing). A stash gun or the free pistol on a survivor
 * equips it; a survivor's gun anywhere in the stash takes it off them; a stash gun on
 * another of its set opens that set's Combine (the weakest 3, as its button does).
 */
export function dropAction(view: InventoryView, from: string, to: string | null): Drop {
  if (to === null || to === from || !canDrag(view, from)) return { kind: 'none' };
  const onto = view.squad.find((s) => s.gun.key === to);
  const mine = view.squad.find((s) => s.gun.key === from);
  if (mine) {
    // Into the stash, onto a stash gun too: a gun in hand never combines.
    if (to !== 'stash' && !to.startsWith('stash:')) return { kind: 'none' };
    if (view.free === 0) return { kind: 'refused', reason: STASH_FULL };
    return { kind: 'equip', defender: mine.id, choice: 'pistol' };
  }
  if (from === 'pistol') {
    if (!onto || onto.uid === null) return { kind: 'none' };
    if (view.free === 0) return { kind: 'refused', reason: STASH_FULL };
    return { kind: 'equip', defender: onto.id, choice: 'pistol' };
  }
  const gun = view.stash.find((it) => it.key === from)!.owned!;
  if (onto) return { kind: 'equip', defender: onto.id, choice: gun.uid };
  const other = view.stash.find((it) => it.key === to)?.owned;
  if (!other) return { kind: 'none' };
  if (!isGun(other)) return { kind: 'refused', reason: COMBINE_NOT_GUN };
  if (other.base !== gun.base || other.rarity !== gun.rarity) {
    const name = (k: string): string => view.stash.find((it) => it.key === k)!.name;
    return {
      kind: 'refused',
      reason: `${name(from)} and ${name(to)} don't combine.`,
    };
  }
  const row = rowOf(view.combine, other);
  if (!row) return { kind: 'refused', reason: COMBINE_TOP };
  if (!row.uses) return { kind: 'refused', reason: row.note };
  return { kind: 'combine', uses: row.uses };
}

/** The line read out after equip `d` from `view` (the camp before it): "Mara now holds …". */
export function equipMessage(view: InventoryView, d: Extract<Drop, { kind: 'equip' }>): string {
  const s = view.squad.find((x) => x.id === d.defender);
  if (!s) return '';
  const back = s.uid === null ? '' : `; ${s.gun.name} is back in the stash`;
  if (d.choice === 'pistol') return `${s.name} now holds the free pistol${back}`;
  const it = view.stash.find((x) => x.owned?.uid === d.choice);
  return `${s.name} now holds ${it?.name ?? 'it'}${back}`;
}

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

/**
 * The squad row and the stash grid for `view`, under `note`; with `canCombine` (between
 * hordes) slots in a set ready to combine are marked, and with `drag` too the slots that
 * can be picked up.
 */
export function inventoryGrid(
  view: InventoryView,
  canCombine = false,
  note = INVENTORY_NOTE,
  drag = false,
): HTMLElement[] {
  const ready = (it: InventoryItem): boolean =>
    canCombine && !!it.owned && !!rowOf(view.combine, it.owned)?.uses;
  const mark = (li: HTMLElement): HTMLElement => {
    const b = li.querySelector<HTMLElement>('.inv-slot')!;
    if (drag && canCombine && canDrag(view, b.dataset.key!)) b.dataset.drag = 'true';
    return li;
  };
  const empty = Array.from({ length: view.free }, () => {
    const li = el('li', 'inv-cell');
    li.setAttribute('aria-hidden', 'true');
    li.append(el('div', 'inv-slot inv-slot-empty'));
    return li;
  });
  // The whole stash section is one drop place for a survivor's gun.
  const stash = section(
    el('h3', 'menu-heading inv-stash-heading', view.stashHeading),
    ...(view.stash.length > 0 ? [] : [el('p', 'menu-note', STASH_EMPTY)]),
    el('p', 'menu-note inv-note', note),
    list('Stash', 'inv-grid inv-stash', [
      ...view.stash.map((it) => mark(slot(it, ready(it)))),
      ...empty,
    ]),
  );
  stash.classList.add('inv-stash-zone');
  return [
    section(
      el('h3', 'menu-heading', 'Squad'),
      list('Squad', 'inv-grid inv-squad', [
        ...view.squad.map((s) => mark(slot(s.gun, false, s.name))),
        mark(slot(view.pistol, false, 'Free pistol', PISTOL_NOTE)),
      ]),
    ),
    stash,
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

/** What the Equip part of the details shows, between hordes, and what its buttons call. */
export interface GearUi {
  view: InventoryView;
  /** Does what dropping slot `from` on `to` does (`dropAction`). */
  move(from: string, to: string): void;
}

/**
 * The buttons that move a gun without dragging (ID-095): a stash gun or the free pistol
 * has Equip on, one button per survivor it could go to; a survivor's stash gun Unequip.
 */
function gearBlock(it: InventoryItem, ui: GearUi): HTMLElement | null {
  const mine = ui.view.squad.find((s) => s.gun.key === it.key);
  if (mine) {
    if (mine.uid === null) return null;
    const b = button('Unequip', () => ui.move(it.key, 'stash'), 'inv-unequip');
    b.setAttribute('aria-label', `Unequip ${it.name} from ${mine.name}`);
    const block = el('div', 'inv-gear menu-row');
    block.append(b);
    return block;
  }
  if (!canDrag(ui.view, it.key)) return null;
  // The pistol goes only to a survivor holding a stash gun; a stash gun to anyone.
  const who = ui.view.squad.filter((s) => it.key !== 'pistol' || s.uid !== null);
  if (who.length === 0) return null;
  const block = el('div', 'inv-gear');
  block.setAttribute('role', 'group');
  block.setAttribute('aria-label', `Equip ${it.name} on`);
  const row = el('div', 'menu-row inv-equip');
  for (const s of who) {
    const b = button(s.name, () => ui.move(it.key, s.gun.key), 'inv-equip-on');
    b.setAttribute('aria-label', `Equip ${it.name} on ${s.name}`);
    b.dataset.defender = s.id;
    row.append(b);
  }
  block.append(el('h4', 'inv-combine-label', 'Equip on…'), row);
  return block;
}

/**
 * The details beside the grid for `it`; with its Combine when `combine` is given, and its
 * Equip on or Unequip when `gear` is (between hordes).
 */
export function detailsPanel(
  it: InventoryItem | null,
  combine?: { rows: readonly CombineRow[]; ui: CombineUi },
  gear?: GearUi,
): HTMLElement[] {
  if (!it) return [el('p', 'menu-note', STASH_EMPTY)];
  const out = [...facts(it), el('p', 'menu-note inv-where', it.where)];
  const g = gear ? gearBlock(it, gear) : null;
  if (g) out.push(g);
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
  /**
   * Gives survivor `defenderId` gun `choice` (ID-095, between hordes), their gun going to
   * the stash; without it guns can't be dragged and the details have no Equip.
   */
  onEquip?: (defenderId: string, choice: GunChoice) => { ok: true } | { ok: false; reason: string };
}

/** A mouse press becomes a drag once it moves this far (px). */
export const DRAG_SLOP = 6;
/** A touch held this still for this long starts a drag (ms); one that moves first scrolls. */
export const LONG_PRESS = 350;
/** How far a touch may wander before its long-press is a scroll instead (px). */
export const TOUCH_SLOP = 10;
/** A drag this near the grid's top or bottom edge scrolls it (px)... */
export const EDGE = 40;
/** ...by at most this much a tick (px, about 60 ticks a second). */
export const EDGE_SPEED = 12;

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
  // What the last move did, or why it was refused (ID-095): shown, and read out.
  const status = el('p', 'menu-note inv-status');
  status.setAttribute('role', 'status');
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  /** Shows `text` in the status line; `refused` marks it as a no. */
  const say = (text: string, refused = false): void => {
    clearTimeout(sayTimer);
    if (refused) status.dataset.tone = 'refused';
    else delete status.dataset.tone;
    if (text !== '' && status.textContent === text) {
      // The same line again (a second refusal): emptied, then refilled, so it is read again.
      status.textContent = '';
      sayTimer = setTimeout(() => (status.textContent = text), 50);
      return;
    }
    status.textContent = text;
  };
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
  foot.append(hint, status, done);
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
      // A drag goes first: the gun goes back where it was (and its release is no click).
      if (press) {
        if (press.ghost) swallowClick = true;
        stopDrag();
      } else if (confirming) cancel();
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
    // The click a drag's release makes is no selection (a key's click has no detail).
    if (swallowClick && e.detail !== 0) {
      swallowClick = false;
      return;
    }
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    if (b) select(b.dataset.key!, true);
  });
  body.addEventListener('mouseover', (e) => {
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    const key = b?.dataset.key ?? null;
    // A confirm stays up while the pointer wanders over the grid; a drag keeps its gun's.
    if (key === hovered || confirming || press?.ghost) return;
    hovered = key;
    drawDetails();
  });
  body.addEventListener('mouseleave', () => {
    if (hovered === null || press?.ghost) return;
    hovered = null;
    drawDetails();
  });

  // Drag and drop (ID-095), between hordes: a press on a slot that can be picked up
  // becomes a drag once a mouse moves DRAG_SLOP, or a touch is held LONG_PRESS still (a
  // touch that moves first scrolls the grid). `ghost` is the gun under the pointer.
  let press: {
    key: string;
    id: number;
    x: number;
    y: number;
    touch: boolean;
    timer: ReturnType<typeof setTimeout> | undefined;
    ghost: HTMLElement | null;
    scroller?: ReturnType<typeof setInterval>;
  } | null = null;
  let swallowClick = false;

  body.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    // A press whose release never came (the window lost it): dropped, not a dead end. A
    // second finger or a palm (not primary) leaves a drag under way alone.
    if (e.isPrimary) stopDrag();
    if (!view || !opts.onEquip || !listedCombine) return;
    if (e.button !== 0 || !e.isPrimary) return;
    const b =
      e.target instanceof Element ? e.target.closest<HTMLElement>('.inv-slot[data-key]') : null;
    const key = b?.dataset.key;
    if (!key || !canDrag(view, key)) return;
    const touch = e.pointerType === 'touch';
    press = {
      key,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      touch,
      timer: undefined,
      ghost: null,
    };
    if (touch) press.timer = setTimeout(() => press && lift(press.x, press.y), LONG_PRESS);
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.defaultView?.addEventListener('blur', stopDrag);
    doc.addEventListener('touchmove', holdStill, { passive: false });
  });
  // A long-press on a phone opens no menu over a slot.
  body.addEventListener('contextmenu', (e) => {
    if (press) e.preventDefault();
  });

  /** While a touch drags, the page does not scroll under it. */
  function holdStill(e: TouchEvent): void {
    if (press?.ghost) e.preventDefault();
  }

  function onMove(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    // A mouse moving with no button down: its release was lost (outside the window).
    if (!press.touch && e.buttons === 0) {
      stopDrag();
      return;
    }
    if (!press.ghost) {
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.touch) {
        // Moved before the long-press: a scroll, not a drag.
        if (moved > TOUCH_SLOP) stopDrag();
        return;
      }
      if (moved < DRAG_SLOP) return;
      lift(e.clientX, e.clientY);
    }
    e.preventDefault();
    follow(e.clientX, e.clientY);
  }

  /** A cancel of the drag's own pointer ends it; another finger's does not. */
  function onCancel(e: PointerEvent): void {
    if (press && e.pointerId === press.id) stopDrag();
  }

  function onUp(e: PointerEvent): void {
    if (!press || e.pointerId !== press.id) return;
    const from = press.ghost ? press.key : null;
    stopDrag();
    if (from === null || !view) return;
    swallowClick = true;
    const to = targetAt(e.clientX, e.clientY);
    act(dropAction(view, from, to), from, to);
  }

  /** The press becomes a drag: its gun follows the pointer and the drop places light up. */
  function lift(x: number, y: number): void {
    if (!press || !view) return;
    const it = items().find((i) => i.key === press!.key);
    if (!it) return;
    select(press.key, false);
    const ghost = el('div', 'inv-slot inv-ghost');
    ghost.dataset.rarity = it.rarity;
    // On touch it rides above the finger, so the finger hides neither it nor the target.
    if (press.touch) {
      ghost.dataset.touch = 'true';
      doc.defaultView?.navigator.vibrate?.(10);
    }
    ghost.setAttribute('aria-hidden', 'true');
    ghost.append(...slotFace(it));
    scrim.append(ghost);
    press.ghost = ghost;
    dialog.classList.add('inv-dragging');
    for (const b of slots()) {
      const key = b.dataset.key!;
      if (key === press.key) b.dataset.dragFrom = 'true';
      else b.dataset.drop = droppable(dropAction(view, press.key, key)) ? 'ok' : 'no';
    }
    const zone = body.querySelector<HTMLElement>('.inv-stash-zone');
    const d = dropAction(view, press.key, 'stash');
    if (zone && d.kind !== 'none') zone.dataset.drop = droppable(d) ? 'ok' : 'no';
    // Held back only by the stash being full (a survivor's gun, or the pistol while
    // someone holds a gun to send there): said at once.
    const full =
      view.free === 0 &&
      (press.key.startsWith('squad:') ||
        (press.key === 'pistol' && view.squad.some((s) => s.uid !== null)));
    say(full ? STASH_FULL : '', full);
    press.scroller = setInterval(edgeScroll, 16);
    follow(x, y);
  }

  const droppable = (d: Drop): boolean =>
    d.kind === 'equip' || (d.kind === 'combine' && !!opts.onCombine);

  /**
   * Near the grid's top or bottom edge a drag scrolls it, faster the closer it gets, so a
   * slot scrolled out of sight (on a phone, the squad row or the stash's last rows) is in
   * reach. Runs on a timer, so a pointer held still at the edge keeps scrolling.
   */
  function edgeScroll(): void {
    if (!press?.ghost) return;
    const r = body.getBoundingClientRect();
    if (r.height === 0) return;
    const into =
      press.y < r.top + EDGE ? press.y - r.top - EDGE : Math.max(0, press.y - r.bottom + EDGE);
    if (into === 0) return;
    const step = Math.sign(into) * Math.min(EDGE_SPEED, Math.max(2, Math.abs(into) / 3));
    const was = body.scrollTop;
    body.scrollTop = was + step;
    if (body.scrollTop !== was) follow(press.x, press.y);
  }

  /** Moves the gun to the pointer, and marks the place under it. */
  function follow(x: number, y: number): void {
    if (!press?.ghost) return;
    // Where the pointer is now, for the edge scroll.
    press.x = x;
    press.y = y;
    press.ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const to = targetAt(x, y);
    for (const n of dialog.querySelectorAll<HTMLElement>('[data-over]')) delete n.dataset.over;
    const over =
      to === 'stash'
        ? body.querySelector<HTMLElement>('.inv-stash-zone')
        : to === null
          ? null
          : (slotOf(to) ?? null);
    if (over) over.dataset.over = 'true';
  }

  /** The drop place at (x, y): a slot's key, `stash` (the stash section) or null. */
  function targetAt(x: number, y: number): string | null {
    const at = doc.elementFromPoint?.(x, y);
    if (!at || !body.contains(at)) return null;
    const b = at.closest<HTMLElement>('.inv-slot[data-key]');
    if (b) return b.dataset.key!;
    return at.closest('.inv-stash-zone') ? 'stash' : null;
  }

  /** Ends a press or drag with nothing moved: the gun is back where it was. */
  function stopDrag(): void {
    if (!press) return;
    clearTimeout(press.timer);
    clearInterval(press.scroller);
    press.ghost?.remove();
    press = null;
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    doc.defaultView?.removeEventListener('blur', stopDrag);
    doc.removeEventListener('touchmove', holdStill);
    dialog.classList.remove('inv-dragging');
    for (const n of dialog.querySelectorAll<HTMLElement>(
      '[data-drop], [data-drag-from], [data-over]',
    )) {
      delete n.dataset.drop;
      delete n.dataset.dragFrom;
      delete n.dataset.over;
    }
  }

  /** Does `d`, the drop of slot `from` on `to` (or its button), and says what it did. */
  function act(d: Drop, from: string, to: string | null): void {
    if (!view || d.kind === 'none') return;
    if (d.kind === 'refused') {
      say(d.reason, true);
      return;
    }
    if (d.kind === 'combine') {
      if (!opts.onCombine || to === null) return;
      say('');
      select(to, true);
      ask(d.uses);
      return;
    }
    if (!opts.onEquip) return;
    const before = view;
    const r = opts.onEquip(d.defender, d.choice);
    if (!r.ok) {
      say(r.reason, true);
      return;
    }
    // The gun is selected where it went: a survivor's back in the stash, else in their hands.
    const mine = before.squad.find((s) => s.gun.key === from);
    selected = mine?.uid ? `stash:${mine.uid}` : `squad:${d.defender}`;
    hovered = null;
    confirming = null;
    result = null;
    // onEquip's save has usually redrawn the grid already; drawn again for the new selection.
    const { game, canCombine = false } = opts.state();
    draw(game, canCombine);
    say(equipMessage(before, d));
    const b = slotOf(selected);
    b?.focus();
    b?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Selects the slot `key`; `focus` moves the keyboard there too. */
  function select(key: string, focus: boolean): void {
    if (key !== selected) {
      confirming = null;
      result = null;
      // The last move's line is about another gun now.
      say('');
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
              ask,
              confirm,
              cancel,
            },
          }
        : undefined;
    const gear =
      opts.onEquip && view && listedCombine
        ? { view, move: (from: string, to: string) => act(dropAction(view!, from, to), from, to) }
        : undefined;
    details.replaceChildren(...detailsPanel(it, combine, gear));
  }

  /** Puts up the Combine confirm for `uses`. */
  function ask(uses: readonly OwnedWeapon[]): void {
    // Asked from a hovered gun's details: that gun becomes the selected one, so the
    // confirm stays up for it when the pointer moves on.
    if (hovered !== null) selected = hovered;
    hovered = null;
    markSelected();
    confirming = uses;
    result = null;
    drawDetails();
    details.querySelector<HTMLElement>('.inv-combine-no')?.focus();
  }

  /** Draws the grid for `game`; a confirm whose guns have left the stash is dropped. */
  function draw(game: Pick<GameState, 'armoury' | 'roster'>, canCombine: boolean): void {
    // The slots are redrawn: a drag under way goes back.
    stopDrag();
    listed = game;
    listedCombine = canCombine;
    if (confirming && !(canCombine && confirming.every((w) => game.armoury.includes(w)))) {
      confirming = null;
    }
    // Focus in the grid or the details: both are redrawn, so it comes back to the slot.
    const hadFocus = body.contains(doc.activeElement) || details.contains(doc.activeElement);
    view = inventoryView(game);
    // On a touch screen a plain drag scrolls: the note says to hold first.
    const touch = !!doc.defaultView?.matchMedia?.('(pointer: coarse)').matches;
    const note = opts.onEquip
      ? canCombine
        ? touch
          ? DRAG_NOTE_TOUCH
          : DRAG_NOTE
        : GUNS_WAIT
      : INVENTORY_NOTE;
    body.replaceChildren(...inventoryGrid(view, canCombine, note, !!opts.onEquip));
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
    say('');
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
      say('');
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
      stopDrag();
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
