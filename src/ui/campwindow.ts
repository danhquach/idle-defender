// The camp window (ID-183): the one dialog the Roster and the Inventory's Weapons share, each
// as a tab, so moving between them never closes it. The window owns what a dialog needs once:
// the scrim, the header (the tab strip, the tab's own tools, the close), the foot (the Esc
// hint, the tab's status line, Close or Resume), the keys (Esc, Tab, the arrows between
// tabs), the inert field behind it and where the keyboard goes back to. A tab owns its panel and
// says what happens when it is shown, hidden or asked to step back. Text reaches the page
// only through textContent.
import { el } from './hud.ts';
import { isShortTouch, watchShortTouch } from './landscape.ts';
import { holdField, releaseField } from './shield.ts';

export interface CampTab {
  /** Names the tab in ids and in `data-tab`: letters only. */
  id: string;
  label: string;
  /** The tab's content; the window makes it the tab's panel. */
  panel: HTMLElement;
  /** The tab's own controls in the window's header (shown with the tab only). */
  tools?: HTMLElement[];
  /** The tab's status line, in the window's foot (shown with the tab only). */
  status?: HTMLElement;
  /** The top-bar button that opens the tab: the keyboard goes back to it on a close. */
  button: HTMLElement;
  /** The tab is on show (the window opened on it, or the player switched to it): draw it. */
  show(): void;
  /** The tab is off show (another tab, or the window closed): drop what was under way. */
  hide(): void;
  /** Esc: true when the tab used it to step back a layer, so the window stays open. */
  escape?(): boolean;
}

export interface CampWindow {
  /** The layer over the field: what a tab floats over the dialog (a dragged gun) goes here. */
  readonly scrim: HTMLElement;
  readonly dialog: HTMLElement;
  /** Adds a tab (Roster, Weapons, Craft, left to right); its panel stays hidden until it is shown. */
  add(tab: CampTab): void;
  isOpen(): boolean;
  /** The tab on show; null with the window closed. */
  current(): string | null;
  /**
   * Opens on tab `id` (or switches to it). On a close the keyboard goes back to `from`, else
   * to what had it in the field, else to the button of the tab it opened on.
   */
  open(id: string, from?: HTMLElement | null): void;
  close(): void;
  /** `cb` runs whenever the open tab changes or the window closes (the rail's lit button follows). */
  onChange(cb: () => void): void;
  /** Sets the label on tab `id`'s button (a count, say); the strip's name keeps the tab's own label. */
  relabel(id: string, label: string): void;
  /** Whether closing resumes a fight: the close button, the hint and the foot's button say so. */
  setResumes(resumes: boolean): void;
}

/**
 * A header button's label that drops its tail on a very narrow window ("Best gun" for "Best
 * gun for everyone"): `lead` always shows, `tail` only with the room. Read out in full.
 */
export function shortLabel(button: HTMLElement, lead: string, tail: string): void {
  button.replaceChildren(el('span', '', lead), el('span', 'camp-long', tail));
  button.setAttribute('aria-label', `${lead}${tail}`);
}

/**
 * Whether a control is really on the screen. Only the phone shell lays boxes out by CSS alone (a
 * Roster pane that replaces the squad, a Weapons pane that replaces the squad list), so only
 * there is a control with no box or a hidden one out of reach; off the shell this is always
 * true, so desktop and iPad keep every stop they had (ID-277).
 */
export function onScreen(n: HTMLElement): boolean {
  if (!isShortTouch(window)) return true;
  return n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
}

/**
 * A slot offer's words with the ones a narrow sheet can lose in their own spans (`camp-long`-like,
 * `inv-buy-long`): "+10 slots · 150 Scrap" is "+10 · 150" there. The text reads whole either way.
 */
export function shortOffer(text: string): (string | HTMLElement)[] {
  const m = /^(\+\d+)( slots?)( · )(.*?)( Scrap)$/.exec(text);
  if (!m) return [text];
  // One inline span: the flex button around it lays out one item, so no gap splits the words.
  const whole = el('span', 'inv-buy-text');
  whole.append(
    m[1]!,
    el('span', 'inv-buy-long', m[2]),
    m[3]!,
    m[4]!,
    el('span', 'inv-buy-long', m[5]),
  );
  return [whole];
}

/** The tabs left to right, whichever is added first; one not listed goes last. */
const ORDER = ['roster', 'weapons', 'craft', 'map'];
const place = (id: string): number => (ORDER.indexOf(id) + ORDER.length + 1) % (ORDER.length + 1);

let serial = 0;

export function createCampWindow(root: HTMLElement): CampWindow {
  const doc = root.ownerDocument;
  const listeners: (() => void)[] = [];
  const tabs: {
    tab: CampTab;
    button: HTMLButtonElement;
    tools: HTMLElement;
    status: HTMLElement;
  }[] = [];
  let shown: CampTab | null = null;
  let opener: HTMLElement | null = null;
  // The tab it opened on: its button gets the keyboard back when nothing else had it.
  let first: CampTab | null = null;

  // Outside `root`, like the Menu, so the field can go inert behind it.
  const scrim = el('div', 'camp-scrim');
  scrim.hidden = true;
  const dialog = el('div', 'menu camp-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  // What the rail's button controls (ID-276).
  dialog.id = `camp-dialog-${++serial}`;
  scrim.append(dialog);
  doc.body.append(scrim);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });
  // On the phone shell a tap on the empty backdrop below a short sheet closes it. It must also
  // have begun there: a drag that ends on the backdrop (a gun let go outside) is not a tap.
  let downOnScrim = false;
  scrim.addEventListener('pointerdown', (e) => {
    downOnScrim = e.target === scrim;
  });
  scrim.addEventListener('click', (e) => {
    const tap = downOnScrim && e.target === scrim;
    downOnScrim = false;
    if (tap && isShortTouch(window)) api.close();
  });

  const tablist = el('div', 'camp-tabs');
  tablist.setAttribute('role', 'tablist');
  const closeX = el('button', 'menu-close camp-close', '×');
  closeX.type = 'button';
  closeX.dataset.key = 'close';
  closeX.addEventListener('click', () => api.close());
  const head = el('div', 'camp-head');
  head.append(tablist, closeX);
  const hintText = el('span', '');
  const hint = el('span', 'camp-hint');
  hint.append(el('kbd', 'menu-key', 'Esc'), hintText);
  const done = el('button', 'hud-button camp-done');
  done.type = 'button';
  done.dataset.key = 'done';
  done.addEventListener('click', () => api.close());
  const foot = el('div', 'camp-foot');
  foot.append(hint, done);
  dialog.append(head, foot);

  /**
   * The phone shell's sheet (ID-276): no ×, Esc hint or Done (the lit rail button closes it), the
   * tab strip gone but for the Weapons and Craft pills on those two tabs, the status line up in
   * the header's band (no foot), and the dialog not modal (the rail beside it stays live).
   * Hidden by the attribute, so Tab and the arrows skip them; leaving the shell restores all.
   */
  function applySheet(): void {
    const on = isShortTouch(window);
    dialog.setAttribute('aria-modal', String(!on));
    closeX.hidden = hint.hidden = done.hidden = on;
    const pills = shown?.id === 'weapons' || shown?.id === 'craft';
    for (const t of tabs) {
      t.button.hidden = on && !(pills && (t.tab.id === 'weapons' || t.tab.id === 'craft'));
    }
    if (on && foot.parentElement !== head) head.insertBefore(foot, tablist.nextSibling);
    else if (!on && foot.parentElement !== dialog) dialog.append(foot);
  }
  // Followed while open only: a closed window has no sheet to redo.
  let unwatch: (() => void) | null = null;

  /** What Tab may land on: shown, enabled controls (a grid or a tab strip is one stop). */
  function stops(): HTMLElement[] {
    const at = doc.activeElement;
    return [...dialog.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')].filter(
      (n) =>
        (n.tabIndex >= 0 || n === at) &&
        !(n as HTMLButtonElement).disabled &&
        !n.closest('[hidden]') &&
        onScreen(n),
    );
  }

  // Keys stay in the window (the field's keys never see them): Esc steps back, then closes;
  // Tab cycles; the arrows, Home and End move between the tabs.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      // A held-down Esc repeats: only a fresh press acts.
      if (e.repeat) return;
      if (!shown?.escape?.()) api.close();
      return;
    }
    if (e.key === 'Tab') {
      const list = stops();
      const i = list.indexOf(doc.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && (i < 0 || i === list.length - 1)) {
        e.preventDefault();
        list[0]?.focus();
      }
      return;
    }
    // A tab hidden on the phone shell is no stop on the strip.
    const strip = tabs.filter((t) => !t.button.hidden);
    const index = strip.findIndex((t) => t.button === e.target);
    if (index < 0) return;
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: strip.length - 1,
    };
    if (!Object.hasOwn(moves, e.key)) return;
    e.preventDefault();
    const next = strip[(moves[e.key]! + strip.length) % strip.length]!;
    select(next.tab);
    next.button.focus();
  });

  /** Puts tab `next` on show, the one before it off. */
  function select(next: CampTab): void {
    if (next === shown) return;
    const before = shown;
    shown = next;
    dialog.dataset.tab = next.id;
    for (const t of tabs) {
      const on = t.tab === next;
      t.button.setAttribute('aria-selected', String(on));
      t.button.tabIndex = on ? 0 : -1;
      t.tab.panel.hidden = t.tools.hidden = t.status.hidden = !on;
      if (on) dialog.setAttribute('aria-labelledby', t.button.id);
    }
    applySheet();
    before?.hide();
    next.show();
    for (const cb of listeners) cb();
  }

  const api: CampWindow = {
    scrim,
    dialog,
    add(tab) {
      const button = el('button', 'menu-tab camp-tab', tab.label);
      button.type = 'button';
      button.id = `camp-tab-${tab.id}`;
      button.dataset.key = `camp:${tab.id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.tabIndex = -1;
      tab.panel.id = `camp-panel-${tab.id}`;
      button.setAttribute('aria-controls', tab.panel.id);
      tab.panel.setAttribute('role', 'tabpanel');
      tab.panel.setAttribute('aria-labelledby', button.id);
      tab.panel.hidden = true;
      // The player's own switch: the keyboard stays on the tab strip.
      button.addEventListener('click', () => {
        select(tab);
        button.focus();
      });
      const tools = el('div', 'camp-tools');
      tools.hidden = true;
      tools.append(...(tab.tools ?? []));
      const status = el('div', 'camp-status');
      status.hidden = true;
      if (tab.status) status.append(tab.status);
      const at = tabs.findIndex((t) => place(t.tab.id) > place(tab.id));
      const i = at < 0 ? tabs.length : at;
      tablist.insertBefore(button, tabs[i]?.button ?? null);
      head.insertBefore(tools, closeX);
      foot.insertBefore(status, done);
      dialog.insertBefore(tab.panel, foot.parentElement === dialog ? foot : null);
      tabs.splice(i, 0, { tab, button, tools, status });
      // The strip is called by what it holds ("Roster, Weapons and Craft"); the window takes
      // the open tab's name.
      const names = tabs.map((t) => t.tab.label);
      tablist.setAttribute(
        'aria-label',
        names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`,
      );
      // Named before it first opens too.
      if (!dialog.hasAttribute('aria-labelledby'))
        dialog.setAttribute('aria-labelledby', button.id);
    },
    isOpen: () => shown !== null,
    current: () => shown?.id ?? null,
    open(id, from) {
      const next = tabs.find((t) => t.tab.id === id)?.tab;
      if (!next) return;
      if (!shown) {
        const at = from ?? doc.activeElement;
        opener = at instanceof HTMLElement && root.contains(at) ? at : null;
        first = next;
        scrim.hidden = false;
        holdField(root, scrim);
        unwatch = watchShortTouch(window, applySheet);
      } else if (from instanceof HTMLElement && root.contains(from)) {
        // Switched from the rail: the keyboard goes back to the button that was tapped.
        opener = from;
      }
      select(next);
    },
    close() {
      if (!shown) return;
      const last = shown;
      shown = null;
      delete dialog.dataset.tab;
      for (const t of tabs) {
        t.button.setAttribute('aria-selected', 'false');
        t.tab.panel.hidden = t.tools.hidden = t.status.hidden = true;
      }
      last.hide();
      scrim.hidden = true;
      unwatch?.();
      unwatch = null;
      releaseField(root, scrim);
      (opener?.isConnected ? opener : (first ?? last).button).focus();
      opener = first = null;
      for (const cb of listeners) cb();
    },
    onChange(cb) {
      listeners.push(cb);
    },
    relabel(id, label) {
      const t = tabs.find((x) => x.tab.id === id);
      if (t) t.button.textContent = label;
    },
    setResumes(resumes) {
      closeX.setAttribute('aria-label', resumes ? 'Close and resume' : 'Close');
      hintText.textContent = resumes ? ' closes and resumes' : ' closes';
      done.textContent = resumes ? 'Resume' : 'Close';
    },
  };
  api.setResumes(false);
  return api;
}
