// The Craft tab (ID-209): the third tab of the camp window, after Weapons. It lists every
// blueprint the camp holds with a count per gun type, and the crafting area for the one
// picked: the gun type, the Scrap to put in, the odds of each rarity for that amount (live as
// the amount changes), and a Craft button. A craft makes the gun at once, so the result shows
// where it was made, with a button to see it in Weapons. A blueprint not wanted salvages for a
// little Scrap. Text reaches the page only through textContent.
import { levelName, type OwnedWeapon } from '../core/armoury.ts';
import { blueprintsOf, craftOdds } from '../core/craft.ts';
import { BLUEPRINT, CRAFT, RARITIES, RARITY_ORDER, WEAPONS, type WeaponId } from '../core/data.ts';
import type { GameState } from '../core/game.ts';
import { craftRefusal, stashCap } from '../core/hordeonly.ts';
import { topBeaten } from '../core/modes.ts';
import type { CampWindow } from './campwindow.ts';
import { askConfirm } from './confirm.ts';
import { el } from './hud.ts';
import { ART_URLS, GUN_ICON, type GunId } from './sprites.ts';

export const CRAFT_EMPTY = 'No blueprints yet. A won horde can drop one.';
export const CRAFT_WAIT = 'Craft between hordes, on the start or result screen.';
export const CRAFT_NOTE =
  'A blueprint names a gun type. More Scrap raises the odds of a better rarity.';
/** The Craft button's label for `amount` Scrap. */
export const craftLabel = (amount: number): string => `Craft · ${amount} Scrap`;
/** The result line (ID-209), as the ticket words it: "Crafted: Lv 12 Military LMG". */
export const craftedLine = (w: OwnedWeapon): string => `Crafted: ${levelName(w)}`;
/** The Craft tab's label: a count of the blueprints held when there are any ("Craft · 3"). */
export const craftTabLabel = (count: number): string => (count > 0 ? `Craft · ${count}` : 'Craft');
/** The salvage question (the game's own confirm): "Salvage 1 LMG blueprint for 5 Scrap?". */
export const salvageQuestion = (name: string): string =>
  `Salvage 1 ${name} blueprint for ${BLUEPRINT.salvage} Scrap?`;
/** The salvage button's label. */
export const salvageLabel = `Salvage for ${BLUEPRINT.salvage} Scrap`;
/** An odds figure in percent, one decimal only when it has one: "32.5%", "20%". */
export const percent = (n: number): string => `${Number(n.toFixed(1))}%`;

const MAX_AMOUNT = CRAFT.min + CRAFT.step * CRAFT.steps;

export interface CraftOptions {
  /** The camp now, whether closing resumes a fight, and whether crafting works now (between hordes). */
  state: () => { game: GameState; resumes: boolean; canCraft: boolean };
  /** Crafts a `base` gun for `amount` Scrap, saved at once: the gun, or why not. */
  onCraft: (
    base: WeaponId,
    amount: number,
  ) => { ok: true; weapon: OwnedWeapon } | { ok: false; reason: string };
  /** Salvages one `base` blueprint: the Scrap it gave, or why not. */
  onSalvage: (base: WeaponId) => { ok: true; scrap: number } | { ok: false; reason: string };
  /** Shows gun `uid` in the Weapons tab. */
  onView: (uid: string) => void;
}

export interface CraftTab {
  isOpen(): boolean;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
}

const gunName = (base: WeaponId): string => WEAPONS[base].name;

/**
 * Adds the Craft tab to `win`; `button` is the top-bar button the keyboard goes back to on a
 * close (the Weapons button: the tab has none of its own).
 */
export function createCraft(opts: CraftOptions, win: CampWindow, button: HTMLElement): CraftTab {
  let opened = false;
  let listed: GameState | null = null;
  let listedCan = false;
  let selected: WeaponId | null = null;
  let amount: number = CRAFT.min;
  // The last craft's result: its line, and the gun's uid for "View in Weapons".
  let made: { line: string; uid: string } | null = null;

  const pane = el('div', 'craft-dialog');
  const body = el('div', 'craft-body');
  pane.append(body);
  const status = el('p', 'menu-note inv-status craft-status');
  status.setAttribute('role', 'status');
  const say = (text: string, refused = false): void => {
    if (refused) status.dataset.tone = 'refused';
    else delete status.dataset.tone;
    status.textContent = text;
  };

  // The live parts of the crafting area, set by `draw`, updated as the amount moves.
  let range: HTMLInputElement | null = null;
  let amountText: HTMLElement | null = null;
  let go: HTMLButtonElement | null = null;
  const cells = new Map<string, HTMLElement>();

  /** What the Craft button says and whether it works, for `amount` Scrap on this camp. */
  function goState(
    game: GameState,
    base: WeaponId,
  ): { text: string; disabled: boolean; why: string } {
    if (!listedCan) return { text: craftLabel(amount), disabled: true, why: CRAFT_WAIT };
    const why = craftRefusal(game, base, amount);
    return why === null
      ? { text: craftLabel(amount), disabled: false, why: '' }
      : { text: why, disabled: true, why };
  }

  /** Sets the odds, the amount and the button for `amount`. */
  function live(): void {
    if (!range || !amountText || !go || !selected || !listed) return;
    amountText.textContent = `${amount} Scrap`;
    range.value = String(amount);
    range.setAttribute('aria-valuetext', `${amount} Scrap`);
    const odds = craftOdds(amount);
    for (const r of RARITY_ORDER) {
      const cell = cells.get(r);
      if (!cell) continue;
      cell.querySelector('.craft-odd-pct')!.textContent = percent(odds[r]);
      cell.dataset.zero = String(odds[r] === 0);
    }
    const s = goState(listed, selected);
    go.textContent = s.text;
    go.disabled = s.disabled;
    go.title = s.why;
    if (s.disabled && s.why) go.setAttribute('aria-label', `${craftLabel(amount)}. ${s.why}`);
    else go.removeAttribute('aria-label');
  }

  function blueprintList(game: GameState): HTMLElement {
    const section = el('section', 'craft-list');
    section.setAttribute('aria-label', 'Blueprints');
    section.append(el('h3', 'craft-head', 'Blueprints'));
    const list = blueprintsOf(game);
    if (list.length === 0) {
      section.append(el('p', 'craft-empty', CRAFT_EMPTY));
      return section;
    }
    const rows = el('div', 'craft-bps');
    for (const { base, count } of list) {
      const b = el('button', 'craft-bp');
      b.type = 'button';
      b.dataset.base = base;
      b.setAttribute('aria-pressed', String(base === selected));
      b.setAttribute('aria-label', `${gunName(base)} blueprint, ${count} held`);
      const img = el('img', 'craft-bp-icon');
      img.alt = '';
      img.src = ART_URLS[GUN_ICON[base as GunId]] ?? '';
      b.append(
        img,
        el('span', 'craft-bp-name', gunName(base)),
        el('span', 'craft-bp-count', `×${count}`),
      );
      b.addEventListener('click', () => {
        selected = base;
        made = null;
        draw();
        say('');
        pane.querySelector<HTMLElement>(`.craft-bp[data-base="${base}"]`)?.focus();
      });
      rows.append(b);
    }
    section.append(rows);
    return section;
  }

  function area(game: GameState, base: WeaponId): HTMLElement {
    const section = el('section', 'craft-area');
    section.setAttribute('aria-label', 'Crafting');
    const level = Math.max(1, topBeaten(game));
    // The gun type, and the Scrap and stash it works with, in one row.
    const head = el('div', 'craft-headrow');
    head.append(
      el('h3', 'craft-head craft-gun', `${gunName(base)} blueprint`),
      el(
        'p',
        'craft-have',
        `Scrap ${game.stock.scrap.toLocaleString('en-US')} · Stash ${game.armoury.length}/${stashCap(game)}`,
      ),
    );
    section.append(head);
    // What was just made takes the place of the line under the heading, so the area never
    // grows; with crafting shut (a fight) that line says why, up here where it is seen.
    if (made) section.append(resultBlock());
    else if (!listedCan) section.append(el('p', 'craft-sub craft-wait', CRAFT_WAIT));
    else
      section.append(
        el('p', 'craft-sub', `Makes a Lv ${level} ${gunName(base)}, rarity rolled when you craft.`),
      );
    // The Scrap to put in: 20 to 220 in steps of 20, its ends named.
    const field = el('div', 'craft-field');
    const label = el('label', 'craft-label', 'Scrap to put in');
    range = el('input', 'craft-range');
    range.type = 'range';
    range.min = String(CRAFT.min);
    range.max = String(MAX_AMOUNT);
    range.step = String(CRAFT.step);
    range.id = 'craft-amount';
    label.htmlFor = range.id;
    amountText = el('span', 'craft-amount');
    amountText.setAttribute('aria-hidden', 'true');
    const ends = el('div', 'craft-ends');
    ends.setAttribute('aria-hidden', 'true');
    ends.append(el('span', '', String(CRAFT.min)), el('span', '', String(MAX_AMOUNT)));
    field.append(label, amountText, range, ends);
    range.addEventListener('input', () => {
      amount = Number(range!.value);
      live();
    });
    // The odds: one cell per rarity, in rarity order.
    const odds = el('ul', 'craft-odds');
    odds.setAttribute('aria-label', 'Odds of each rarity');
    cells.clear();
    for (const r of RARITY_ORDER) {
      const cell = el('li', 'craft-odd');
      cell.dataset.rarity = r;
      cell.append(el('span', 'craft-odd-name', RARITIES[r].name), el('span', 'craft-odd-pct'));
      cells.set(r, cell);
      odds.append(cell);
    }
    go = el('button', 'hud-button craft-go');
    go.type = 'button';
    go.addEventListener('click', () => craft());
    // Secondary: an outline, so Craft is the one filled button.
    const salvage = el('button', 'craft-salvage', salvageLabel);
    salvage.type = 'button';
    salvage.disabled = !listedCan;
    salvage.title = listedCan ? '' : CRAFT_WAIT;
    salvage.addEventListener('click', () => void doSalvage());
    const buttons = el('div', 'craft-buttons');
    buttons.append(go, salvage);
    section.append(field, odds, buttons);
    return section;
  }

  function resultBlock(): HTMLElement {
    const box = el('div', 'craft-result');
    const line = el('p', 'craft-result-line', made!.line);
    line.tabIndex = -1;
    const view = el('button', 'hud-button craft-view', 'View in Weapons');
    view.type = 'button';
    view.addEventListener('click', () => made && opts.onView(made.uid));
    box.append(line, view);
    return box;
  }

  /** Draws the whole tab off the camp as it stands. */
  function draw(): void {
    const { game, canCraft } = opts.state();
    listed = game;
    listedCan = canCraft;
    const held = blueprintsOf(game);
    if (!held.some((b) => b.base === selected)) selected = held[0]?.base ?? null;
    range = amountText = go = null;
    const parts: HTMLElement[] = [];
    // With no blueprint left to show an area, the result stands on its own at the top.
    if (made && !selected) parts.push(resultBlock());
    const main = el('div', 'craft-main');
    main.append(blueprintList(game));
    if (selected) main.append(area(game, selected));
    parts.push(main);
    // The standing note; with crafting shut the area already says so up top.
    if (canCraft || !selected) {
      parts.push(el('p', 'menu-note craft-note', canCraft ? CRAFT_NOTE : CRAFT_WAIT));
    }
    body.replaceChildren(...parts);
    relabel(game);
    live();
  }

  function craft(): void {
    if (!selected) return;
    const base = selected;
    const r = opts.onCraft(base, amount);
    if (!r.ok) {
      say(r.reason, true);
      draw();
      return;
    }
    made = { line: craftedLine(r.weapon), uid: r.weapon.uid };
    say(made.line);
    draw();
    // Focus on the line saying what it made: a screen reader reads it.
    pane.querySelector<HTMLElement>('.craft-result-line')?.focus();
  }

  async function doSalvage(): Promise<void> {
    if (!selected) return;
    const base = selected;
    // A blueprint is gone for good: the game's own confirm first.
    const yes = await askConfirm(salvageQuestion(gunName(base)), {
      confirm: 'Salvage',
      cancel: 'Keep',
    });
    if (!yes) {
      pane.querySelector<HTMLElement>('.craft-salvage')?.focus();
      return;
    }
    const r = opts.onSalvage(base);
    made = null;
    say(r.ok ? `Salvaged a ${gunName(base)} blueprint for ${r.scrap} Scrap` : r.reason, !r.ok);
    draw();
    (pane.querySelector<HTMLElement>('.craft-bp[aria-pressed="true"]') ?? pane).focus?.();
  }

  /** The tab's label follows the blueprints held. */
  function relabel(game: GameState): void {
    win.relabel('craft', craftTabLabel(blueprintsOf(game).reduce((n, b) => n + b.count, 0)));
  }

  win.add({
    id: 'craft',
    label: 'Craft',
    panel: pane,
    status,
    button,
    show() {
      opened = true;
      selected = null;
      made = null;
      say('');
      listed = null;
      api.refresh();
      pane
        .querySelector<HTMLElement>('.craft-bp[aria-pressed="true"]')
        ?.focus({ preventScroll: true });
    },
    hide() {
      opened = false;
    },
  });

  const api: CraftTab = {
    isOpen: () => opened,
    refresh() {
      const { game, resumes, canCraft } = opts.state();
      relabel(game);
      if (!opened) return;
      win.setResumes(resumes);
      if (game === listed && canCraft === listedCan) return;
      draw();
    },
  };
  relabel(opts.state().game);
  return api;
}
