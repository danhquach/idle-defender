// @vitest-environment jsdom
// ID-277: the Roster on the phone shell. Every visit starts with the pane shut; a card opens it
// (a second tap, the x or Esc puts it away, the keyboard back on the card), the kept Details fold
// is never written, and the shell turning follows. Off the shell it is the Roster it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { SHORT_TOUCH } from './landscape.ts';
import { ROSTER_FOLD_KEYS } from '../storage/settings.ts';
import { createRoster } from './squadroster.ts';

const NOW = 1_700_000_000_000;
const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => recruit(from + i));

function campGame(squad: RosterDefender[], bench: RosterDefender[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 3,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

let shell = false;
/** Whether the boxes beside the pane are laid out (862) or gone (the swap, under 700). */
let swap = false;
let listeners: Set<() => void>;
const turn = (on: boolean): void => {
  shell = on;
  for (const cb of [...listeners]) cb();
};

function memory() {
  const data = new Map<string, string>();
  const sets: [string, string][] = [];
  return {
    sets,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      sets.push([k, v]);
      data.set(k, v);
    },
  };
}

function mount(game: GameState = campGame(people(6), people(3, 7))) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const storage = memory();
  const roster = createRoster(root, {
    state: () => ({ game, fight: null, canGear: true, resumes: false }),
    storage,
    onEquip: () => ({ ok: true }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
  });
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    scrim.querySelector<T>(sel) as T;
  const pane = q('.roster-dialog');
  const card = (n: number): HTMLButtonElement =>
    scrim.querySelector<HTMLButtonElement>(`[data-key="tab:recruit-${n}"]`)!;
  const x = (): HTMLButtonElement => q<HTMLButtonElement>('.pane-x');
  const esc = (): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(e);
    return e;
  };
  return { roster, scrim, q, pane, card, x, esc, storage };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW + 60_000, toFake: ['Date'] });
  shell = false;
  swap = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: shell && query === SHORT_TOUCH,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  }));
  // jsdom lays nothing out. In the swap the boxes beside the pane have no box, and the survivor
  // row has none while the gun picker shows (the CSS hides both).
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    const dialog = this.closest<HTMLElement>('.roster-dialog');
    const gone =
      (swap &&
        dialog?.dataset.details === 'open' &&
        this.closest('.rv-box:not(.rv-box-details)') !== null) ||
      (this.closest('.rv-top') !== null && dialog?.querySelector('.rv-phead') != null);
    return (gone ? [] : [{}]) as unknown as DOMRectList;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('the Roster on the phone shell (ID-277)', () => {
  it('opens with the pane shut: no pane, no x; a card opens it, the kept fold untouched', () => {
    shell = true;
    const m = mount();
    m.roster.open();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    m.card(2).click();
    expect(m.pane.dataset.details).toBe('open');
    expect(m.x().hidden).toBe(false);
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(false);
    expect(m.q('.rv-who-name').textContent).toBe(recruit(2).name);
    expect(m.storage.sets).toEqual([]);
  });

  it('a second tap on the card shown puts the pane away (862): the keyboard stays on the card', () => {
    shell = true;
    const m = mount();
    m.roster.open();
    m.card(2).click();
    m.card(2).click();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    expect(document.activeElement).toBe(m.card(2));
    // Another card while it is open moves the pane to that survivor, still open.
    m.card(2).click();
    m.card(3).click();
    expect(m.pane.dataset.details).toBe('open');
    expect(m.q('.rv-who-name').textContent).toBe(recruit(3).name);
  });

  it('under 700 the cards are gone while it is open: the keyboard is on the x; the x, Esc and the sheet close it back to the card', () => {
    shell = true;
    swap = true;
    const m = mount();
    m.roster.open();
    m.card(3).focus();
    m.card(3).click();
    expect(document.activeElement).toBe(m.x());
    // The x closes it; the card that opened it has the keyboard, never the page.
    m.x().click();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(document.activeElement).toBe(m.card(3));
    // Esc puts it away first; the next Esc closes the sheet.
    m.card(3).click();
    expect(document.activeElement).toBe(m.x());
    m.esc();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(document.activeElement).toBe(m.card(3));
    expect(m.roster.isOpen()).toBe(true);
    m.esc();
    expect(m.roster.isOpen()).toBe(false);
  });

  it('a survivor asked for by name has the pane open; the gun picker starts at its top, the keyboard in it', () => {
    shell = true;
    const m = mount();
    m.roster.open('recruit-2', undefined, { guns: true });
    expect(m.pane.dataset.details).toBe('open');
    expect(m.q('.rv-phead')).not.toBeNull();
    // The survivor row is gone under the picker; the keyboard is on "Stats", not the page.
    expect(document.activeElement).toBe(m.q('[data-key="level"]'));
    expect(m.storage.sets).toEqual([]);
    // Esc: the picker first, then the pane.
    m.esc();
    expect(m.q('.rv-phead')).toBeNull();
    expect(m.pane.dataset.details).toBe('open');
    m.esc();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.roster.isOpen()).toBe(true);
  });

  it('the squad controls move into the sheet header beside Best gun, and back off the shell', () => {
    shell = true;
    const m = mount();
    m.roster.open();
    const row = m.q('.rv-squad-row');
    expect(row.parentElement).toBe(m.q('.camp-tools:not([hidden])'));
    expect(row.nextElementSibling).toBe(m.q('.rv-best'));
    expect(m.q('.rv-box-squad').contains(row)).toBe(false);
    turn(false);
    expect(m.q('.rv-box-squad').firstElementChild).toBe(row);
  });

  it('a name asked for without guns opens the pane on that card too', () => {
    shell = true;
    const m = mount();
    m.roster.open('recruit-4');
    expect(m.pane.dataset.details).toBe('open');
    expect(m.q('.rv-who-name').textContent).toBe(recruit(4).name);
  });

  it('the Details fold button closes the pane without writing the kept fold', () => {
    shell = true;
    const m = mount();
    m.roster.open('recruit-1');
    m.q<HTMLButtonElement>('[data-key="fold:details"]').click();
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.storage.sets).toEqual([]);
  });

  it('the shell turning while it is open redraws: on, the pane shuts; off, the kept fold is back', () => {
    const m = mount();
    m.roster.open('recruit-1');
    // Off the shell the kept fold (open) shows details.
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(false);
    turn(true);
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(true);
    expect(m.pane.dataset.details).toBeUndefined();
    m.card(2).click();
    expect(m.pane.dataset.details).toBe('open');
    turn(false);
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(false);
  });

  it('leaving and opening again on the phone starts shut; the watcher follows only while open', () => {
    shell = true;
    const m = mount();
    const idle = listeners.size;
    m.roster.open('recruit-1');
    expect(listeners.size).toBeGreaterThan(idle);
    m.roster.close();
    expect(listeners.size).toBe(idle);
    m.roster.open();
    expect(m.pane.dataset.details).toBeUndefined();
  });
});

describe('the Roster off the shell is as it was (ID-277)', () => {
  it('details open from the kept fold, a card tapped again leaves it, no x, no phone attribute', () => {
    const m = mount();
    m.roster.open();
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(false);
    expect(m.pane.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    m.card(2).click();
    m.card(2).click();
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(false);
    // The fold writes the kept choice, as ever.
    m.q<HTMLButtonElement>('[data-key="fold:details"]').click();
    expect(m.storage.sets).toEqual([[ROSTER_FOLD_KEYS.details, '1']]);
    expect(m.q('.rv-box-details .rv-fold-body').hidden).toBe(true);
    // Esc closes the sheet at once (no pane layer).
    m.esc();
    expect(m.roster.isOpen()).toBe(false);
  });
});
