// The Inventory (ID-079): a top-bar button beside the Menu opens a dialog of everything
// the camp holds now. The stash's weapons against its cap, the gun each survivor in the
// squad holds, and the free pistol; each with its name, rarity, affixes and dmg/s, the
// stash strongest first like the equip picker. Between hordes its Combine list turns
// three stash guns of one kind and rarity into one of the next rarity (ID-091), after a
// confirm. Like the Menu, the field goes inert behind it and an open Inventory holds a
// fight. Text reaches the page only through textContent.
import {
  affixCount,
  affixText,
  gunPower,
  heldLabel,
  heldName,
  isOwned,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import { COMBINE_COUNT, RARITIES, STASH_CAP, WEAPONS, type Rarity } from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { combineSets, nextRarity, squadOf, type CombineSet } from '../core/hordeonly.ts';
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
  /** Every stash set below Relic (ID-091): ready ones first, then by base weapon and rarity. */
  combine: CombineRow[];
}

/** One base weapon at one rarity in the stash, as the Combine list shows it (ID-091). */
export interface CombineRow {
  /** "Rusty SMG". */
  name: string;
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
export const INVENTORY_NOTE = 'Pick each survivor’s gun on the start and result screens.';
export const COMBINE_NOTE = `${COMBINE_COUNT} stash guns of one kind and rarity make 1 of the next rarity. A survivor’s gun must be back in the stash first.`;
export const COMBINE_EMPTY = 'Nothing to combine yet.';
export const COMBINE_WAIT = 'Combine between hordes, on the start or result screen.';

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
    used: uses.map(item),
    makes: {
      name: kindName(first, next),
      rarity: next,
      affixes:
        n === 0 ? 'No affixes' : `${n} random ${n === 1 ? 'affix' : 'affixes'}, rolled on combine`,
      // With affixes still to roll, the figure is the gun's base, before them.
      power: `${n === 0 ? '' : 'base '}${bare.toFixed(1)} dmg/s`,
    },
  };
}

/** The line after a combine: "Made: Common SMG, 14.2 dmg/s"; with its affixes in brackets. */
export const combineResult = (w: OwnedWeapon): string =>
  `Made: ${heldLabel(w)}, ${gunPower(w).toFixed(1)} dmg/s`;

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

/** What the Combine section is doing now, and what its buttons call (ID-091). */
export interface CombineUi {
  /** Between hordes only: in a fight the list shows, with no buttons. */
  canCombine: boolean;
  /** The guns a confirm is up for, or null. */
  confirming: readonly OwnedWeapon[] | null;
  /** The line after the last combine (or why it was refused), or null. */
  result: string | null;
  ask(uses: readonly OwnedWeapon[]): void;
  confirm(): void;
  cancel(): void;
}

/** The Combine section: the confirm while one is up, else every set with its count. */
export function combineSection(rows: readonly CombineRow[], ui: CombineUi): HTMLElement {
  const heading = el('h3', 'menu-heading', 'Combine');
  const status = el('p', 'menu-note inv-combine-result', ui.result ?? '');
  status.setAttribute('role', 'status');
  status.hidden = ui.result === null;
  // Focused after a combine (not a Tab stop), so it is read out and scrolled into view.
  status.tabIndex = -1;
  if (ui.confirming && ui.canCombine) {
    const p = combinePreview(ui.confirming);
    const confirm = el('div', 'inv-combine-confirm');
    confirm.setAttribute('role', 'group');
    confirm.setAttribute('aria-label', `Combine into a ${p.makes.name}`);
    const actions = el('div', 'menu-row');
    actions.append(
      button(`Combine into ${p.makes.name}`, ui.confirm, 'inv-combine-yes'),
      button('Cancel', ui.cancel, 'inv-combine-no'),
    );
    confirm.append(
      el('p', 'inv-combine-label', 'Uses up'),
      list(
        'Uses up',
        p.used.map((it) => row(it)),
      ),
      el('p', 'inv-combine-label', 'Makes'),
      list('Makes', [row(p.makes)]),
      actions,
    );
    return section(heading, confirm);
  }
  const body: HTMLElement[] = [el('p', 'menu-note', ui.canCombine ? COMBINE_NOTE : COMBINE_WAIT)];
  if (rows.length === 0) body.push(el('p', 'menu-note', COMBINE_EMPTY));
  else
    body.push(
      list(
        'Combine',
        rows.map((r) => {
          const li = row({ name: r.name, rarity: r.rarity, affixes: r.note, power: null });
          li.classList.add('inv-combine-row');
          const uses = r.uses;
          if (uses && ui.canCombine) {
            const b = button('Combine', () => ui.ask(uses), 'inv-combine-button');
            b.setAttribute('aria-label', `Combine ${COMBINE_COUNT} ${r.name}`);
            b.dataset.set = r.name;
            li.append(el('span', 'inv-power', r.count), b);
          } else {
            li.append(el('span', 'inv-power', r.count));
          }
          return li;
        }),
      ),
    );
  return section(heading, status, ...body);
}

/** The Inventory's sections for `view`; the Combine section, when given, after the stash. */
export function inventorySections(view: InventoryView, combine?: HTMLElement): HTMLElement[] {
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
    ...(combine ? [combine] : []),
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
  /**
   * The camp now, whether a fight is on and not held by Space (for the Close label), and
   * whether guns can be combined now (between hordes).
   */
  state: () => {
    game: Pick<GameState, 'armoury' | 'roster'>;
    resumes: boolean;
    canCombine?: boolean;
  };
  /** Combines the stash guns `uids` (ID-091); without it the Combine section is left out. */
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
  // The camp drawn last: a redraw only when it changes, so the list keeps its scroll.
  let listed: Pick<GameState, 'armoury' | 'roster'> | null = null;
  let listedCombine = false;
  // The Combine confirm up, and the line after the last combine (ID-091).
  let confirming: readonly OwnedWeapon[] | null = null;
  let result: string | null = null;

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
  body.setAttribute('aria-label', 'Weapons held and Combine');
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
      // A held-down Esc repeats: only a fresh press acts. An open Combine confirm goes first.
      if (e.repeat) return;
      if (confirming) cancel();
      else api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const inner = body.querySelectorAll<HTMLElement>('button, .inv-combine-result');
    const list: HTMLElement[] = [closeX, body, ...inner, done];
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

  /** Draws the lists for `game`; a confirm whose guns have left the stash is dropped. */
  function draw(game: Pick<GameState, 'armoury' | 'roster'>, canCombine: boolean): void {
    listed = game;
    listedCombine = canCombine;
    if (confirming && !(canCombine && confirming.every((w) => game.armoury.includes(w)))) {
      confirming = null;
    }
    const view = inventoryView(game);
    const combine = opts.onCombine
      ? combineSection(view.combine, {
          canCombine,
          confirming,
          result,
          ask(uses) {
            confirming = uses;
            result = null;
            draw(game, canCombine);
            body.querySelector<HTMLElement>('.inv-combine-no')?.focus();
          },
          confirm,
          cancel,
        })
      : undefined;
    body.replaceChildren(...inventorySections(view, combine));
  }

  function confirm(): void {
    const uses = confirming;
    if (!uses || !opts.onCombine) return;
    confirming = null;
    const r = opts.onCombine(uses.map((w) => w.uid));
    result = r.ok ? combineResult(r.weapon) : r.reason;
    const { game, canCombine = false } = opts.state();
    draw(game, canCombine);
    // Focus on the line saying what it made: it scrolls into view and a screen reader reads it.
    (body.querySelector<HTMLElement>('.inv-combine-result') ?? body).focus();
  }

  function cancel(): void {
    if (!confirming) return;
    const set = kindName(confirming[0]!, confirming[0]!.rarity);
    confirming = null;
    draw(listed!, listedCombine);
    // Back to the set's own Combine button.
    const again = [...body.querySelectorAll<HTMLElement>('.inv-combine-button')].find(
      (b) => b.dataset.set === set,
    );
    (again ?? body).focus();
  }

  const api: Inventory = {
    isOpen: () => opened,
    open() {
      if (opened) return;
      opened = true;
      confirming = null;
      result = null;
      // Drawn afresh: the Combine section starts with no confirm and no result line.
      listed = null;
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
      const { game, resumes, canCombine = false } = opts.state();
      hintText.textContent = resumes ? ' closes and resumes' : ' closes';
      done.textContent = resumes ? 'Resume' : 'Close';
      if (game === listed && canCombine === listedCombine) return;
      draw(game, canCombine);
    },
  };
  return api;
}
