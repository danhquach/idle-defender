// The Inventory (ID-079): a top-bar button beside the Menu opens a view-only dialog of
// everything the camp holds now. The stash's weapons against its cap, the gun each
// survivor in the squad holds, and the free pistol; each with its name, rarity, affixes
// and dmg/s, the stash strongest first like the equip picker. Like the Menu, the field
// goes inert behind it and an open Inventory holds a fight. Text reaches the page only
// through textContent.
import { affixText, gunPower, heldName, isOwned, type Held } from '../core/armoury.ts';
import { STASH_CAP, type Rarity } from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { squadOf } from '../core/hordeonly.ts';
import { isGun } from '../core/loadout.ts';
import { el } from './hud.ts';

/** One weapon as the Inventory lists it. */
export interface InventoryItem {
  /** "Military Rifle"; the free pistol is "Pistol". */
  name: string;
  rarity: Rarity;
  /** "+7% damage, +21% magazine"; '' with none. */
  affixes: string;
  /** "17.2 dmg/s"; null for a weapon that is no gun (an older save's blade or tool). */
  power: string | null;
}

export interface InventoryView {
  /** "Stash 12/20"; "Stash 20/20 (full)" once the next drop would throw the weakest away. */
  stashHeading: string;
  /** The stash, strongest first; anything that is no gun after the guns. */
  stash: InventoryItem[];
  /** Each survivor in the squad and the gun they fight with, in squad order. */
  squad: { id: string; name: string; gun: InventoryItem }[];
  pistol: InventoryItem;
}

export const STASH_EMPTY = 'Empty. Every horde won drops a gun here.';
export const PISTOL_NOTE = 'Free and unlimited: every survivor has one.';
export const INVENTORY_NOTE = 'View only. Pick each survivor’s gun between hordes.';

const powerOf = (h: Held): number => (isGun(h) ? gunPower(h) : -1);

function item(h: Held): InventoryItem {
  const rarity: Rarity = isOwned(h) ? h.rarity : 'common';
  return {
    name: heldName(h),
    rarity,
    affixes: isOwned(h) ? h.affixes.map(affixText).join(', ') : '',
    power: isGun(h) ? `${gunPower(h).toFixed(1)} dmg/s` : null,
  };
}

/** What the Inventory shows for `game`. */
export function inventoryView(game: Pick<GameState, 'armoury' | 'roster'>): InventoryView {
  return {
    // An older save's stash past the cap is kept as it is (design §6), and is full too.
    stashHeading: `Stash ${game.armoury.length}/${STASH_CAP}${game.armoury.length >= STASH_CAP ? ' (full)' : ''}`,
    // A stable sort: equal guns keep the stash's order.
    stash: game.armoury
      .map((h) => ({ h, power: powerOf(h) }))
      .sort((a, b) => b.power - a.power)
      .map(({ h }) => item(h)),
    squad: squadOf(game).map((d) => ({
      id: d.id,
      name: d.name,
      // What they fight with: a primary that is no gun fights as the pistol (as squadGear).
      gun: item(isGun(d.loadout.primary) ? d.loadout.primary : 'pistol'),
    })),
    pistol: item('pistol'),
  };
}

/** A weapon's row: its name in its rarity's colour, its affixes under it, its dmg/s on the right. */
function row(it: InventoryItem, who?: string): HTMLElement {
  const li = el('li', 'inv-row');
  li.dataset.rarity = it.rarity;
  if (who !== undefined) {
    // A long name is cut short with an ellipsis; the whole name shows on hover.
    const name = el('span', 'inv-who', who);
    name.title = who;
    li.append(name);
  }
  const what = el('span', 'inv-what');
  what.append(el('span', 'inv-name', it.name));
  if (it.affixes) what.append(el('span', 'inv-affixes', it.affixes));
  li.append(what);
  if (it.power) li.append(el('span', 'inv-power', it.power));
  return li;
}

function list(label: string, rows: HTMLElement[]): HTMLElement {
  const ul = el('ul', 'inv-list');
  // Some screen readers drop a list's role once its bullets are styled away.
  ul.setAttribute('role', 'list');
  ul.setAttribute('aria-label', label);
  ul.append(...rows);
  return ul;
}

/** The Inventory's sections for `view`. */
export function inventorySections(view: InventoryView): HTMLElement[] {
  const section = (...children: HTMLElement[]): HTMLElement => {
    const s = el('section', 'menu-section');
    s.append(...children);
    return s;
  };
  const stash =
    view.stash.length > 0
      ? list(
          'Stash',
          view.stash.map((it) => row(it)),
        )
      : el('p', 'menu-note', STASH_EMPTY);
  return [
    section(
      el('h3', 'menu-heading', view.stashHeading),
      el('p', 'menu-note', INVENTORY_NOTE),
      stash,
    ),
    section(
      el('h3', 'menu-heading', 'Squad'),
      list(
        'Squad',
        view.squad.map((s) => row(s.gun, s.name)),
      ),
    ),
    section(
      el('h3', 'menu-heading', 'Free pistol'),
      el('p', 'menu-note', PISTOL_NOTE),
      list('Free pistol', [row(view.pistol)]),
    ),
  ];
}

export interface InventoryOptions {
  /** The camp now, and whether a fight is on and not held by Space (for the Close label). */
  state: () => { game: Pick<GameState, 'armoury' | 'roster'>; resumes: boolean };
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
  // The camp drawn last: a redraw only when it changes, so the list keeps its scroll.
  let listed: Pick<GameState, 'armoury' | 'roster'> | null = null;

  const button = el('button', 'inv-button', 'Inventory');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', () => api.open());
  root.append(button);

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
  const head = el('div', 'menu-head inv-head');
  head.append(title, closeX);
  // Nothing in the list takes focus, so the list itself does: keys can scroll it.
  const body = el('div', 'menu-body');
  body.tabIndex = 0;
  body.setAttribute('aria-label', 'Weapons held');
  const hintText = el('span', '');
  const hint = el('span', 'inv-hint');
  hint.append(el('kbd', 'menu-key', 'Esc'), hintText);
  const done = el('button', 'hud-button', 'Close');
  done.type = 'button';
  done.addEventListener('click', () => api.close());
  const foot = el('div', 'menu-foot');
  foot.append(hint, done);
  dialog.append(head, body, foot);

  // Keys stay in the dialog (the field's keys never see them); Esc closes, Tab cycles.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      // A held-down Esc repeats: only a fresh press closes it.
      if (!e.repeat) api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list: HTMLElement[] = [closeX, body, done];
    const at = doc.activeElement;
    const i = list.indexOf(at as HTMLElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      done.focus();
    } else if (!e.shiftKey && (i < 0 || i === list.length - 1)) {
      e.preventDefault();
      closeX.focus();
    }
  });

  const api: Inventory = {
    isOpen: () => opened,
    open() {
      if (opened) return;
      opened = true;
      scrim.hidden = false;
      root.setAttribute('inert', '');
      api.refresh();
      body.scrollTop = 0;
      body.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      scrim.hidden = true;
      root.removeAttribute('inert');
      button.focus();
    },
    refresh() {
      if (!opened) return;
      const { game, resumes } = opts.state();
      hintText.textContent = resumes ? ' closes and resumes' : ' closes';
      done.textContent = resumes ? 'Resume' : 'Close';
      if (game === listed) return;
      listed = game;
      body.replaceChildren(...inventorySections(inventoryView(game)));
    },
  };
  return api;
}
