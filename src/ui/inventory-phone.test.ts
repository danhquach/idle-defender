// @vitest-environment jsdom
// ID-277: Weapons on the phone shell. The details are on demand: a gun tapped (or reached by key,
// asked for, ticked in Select, compared in the bench picker) opens them; a second tap, the x and
// Esc put them away; a gun lifted by a drag closes them. At 862 they sit beside the squad and
// the stash, under 700 in the squad list's place. The keyboard never lands on the page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import type { Rarity, WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun, type GunChoice } from '../core/hordeonly.ts';
import { createInventory, DRAG_SLOP, LONG_PRESS } from './inventory.ts';
import { SHORT_TOUCH } from './landscape.ts';
import type { Refused } from './text/index.ts';

const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});
const named = (no: number, name: string, held?: OwnedWeapon): RosterDefender => {
  const d = recruit(no);
  return { ...d, name, loadout: { ...d.loadout, primary: held ?? 'pistol' } };
};

/** Zed and Yu in the squad; Ana and Bo on the bench; three guns in the stash. */
function camp(): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 9,
    roster: [named(1, 'Zed'), named(2, 'Yu')],
    reserve: [named(3, 'Ana', gun('h1', 'rifle', 'military')), named(4, 'Bo')],
    camp: { ...g.camp, recruits: 4 },
    armoury: [
      gun('s1', 'smg', 'military'),
      gun('s2', 'rifle', 'rusty'),
      gun('s3', 'lmg', 'prototype'),
    ],
  };
}

let shell = false;
/** Under 700 px the pane takes the squad list's place: the squad list has no box then. */
let swap = false;
let listeners: Set<() => void>;
const turn = (on: boolean): void => {
  shell = on;
  for (const cb of [...listeners]) cb();
};
const scrolled = new WeakMap<Element, number>();
let under: Element | null = null;

function mount() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = camp();
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine: true }),
    onEquip: (id: string, choice: GunChoice): { ok: true } | Refused => {
      const r = equipGun(g, id, choice);
      if (r.ok) g = r.game;
      return r.ok ? { ok: true as const } : r;
    },
    onCombine: () => ({ ok: false, reason: 'no' }),
    onSalvageMany: () => null,
    onUpgrade: () => ({ ok: false, reason: 'no' }),
    onSalvage: () => ({ ok: false, reason: 'no' }),
  });
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement = HTMLElement>(s: string): T => scrim.querySelector<T>(s)!;
  const panel = q('.inv-panel');
  const slot = (key: string): HTMLButtonElement =>
    q<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`);
  const x = (): HTMLButtonElement => q<HTMLButtonElement>('.pane-x');
  const key = (target: Element, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const esc = (): KeyboardEvent => key(document.activeElement ?? document.body, 'Escape');
  inv.open();
  return {
    inv,
    scrim,
    q,
    panel,
    slot,
    x,
    key,
    esc,
    refresh: () => {
      g = { ...g };
      inv.refresh();
    },
    set: (next: (g: GameState) => GameState) => {
      g = next(g);
      inv.refresh();
    },
    game: () => g,
    open: () => panel.dataset.details === 'open',
  };
}

function pointer(target: EventTarget, type: string, x: number, y: number): void {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons: type === 'pointermove' ? 1 : 0,
  });
  Object.defineProperties(e, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  target.dispatchEvent(e);
}

beforeEach(() => {
  shell = false;
  swap = false;
  under = null;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: shell && query === SHORT_TOUCH,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  }));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    const gone =
      swap &&
      this.closest('.inv-squad-zone') !== null &&
      this.closest('.inv-panel')?.getAttribute('data-details') === 'open';
    return (gone ? [] : [{}]) as unknown as DOMRectList;
  });
  // jsdom keeps no scroll offsets: remembered here, so a redraw that loses one shows.
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return scrolled.get(this) ?? 0;
    },
    set(this: Element, v: number) {
      scrolled.set(this, v);
    },
  });
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop');
  Reflect.deleteProperty(document, 'elementFromPoint');
  document.body.replaceChildren();
});

describe('Weapons on the phone shell (ID-277)', () => {
  it('opens with the details put away; a gun tapped opens them, tapped again closes them', () => {
    shell = true;
    const m = mount();
    expect(m.open()).toBe(false);
    expect(m.x().hidden).toBe(true);
    m.slot('stash:s2').click();
    expect(m.open()).toBe(true);
    expect(m.x().hidden).toBe(false);
    expect(m.q('.inv-details').textContent).toContain('Rusty');
    // Another gun: still open, now on that gun.
    m.slot('stash:s3').click();
    expect(m.open()).toBe(true);
    expect(m.q('.inv-details').textContent).toContain('Prototype');
    // The same gun again: away; the keyboard stays on it.
    m.slot('stash:s3').click();
    expect(m.open()).toBe(false);
    expect(m.x().hidden).toBe(true);
    expect(document.activeElement).toBe(m.slot('stash:s3'));
  });

  it('an arrow key to another gun opens them too', () => {
    shell = true;
    const m = mount();
    m.slot('stash:s1').focus();
    m.key(m.slot('stash:s1'), 'ArrowRight');
    expect(m.open()).toBe(true);
    expect(document.activeElement).toBe(m.slot('stash:s2'));
  });

  it('under 700 a squad slot hides under its pane: the keyboard is on the x; the x, a second Esc and the sheet go back to the slot', () => {
    shell = true;
    swap = true;
    const m = mount();
    m.slot('squad:recruit-2').focus();
    m.slot('squad:recruit-2').click();
    expect(m.open()).toBe(true);
    expect(document.activeElement).toBe(m.x());
    m.x().click();
    expect(m.open()).toBe(false);
    expect(document.activeElement).toBe(m.slot('squad:recruit-2'));
    // Esc closes the pane first, the keyboard back on the slot; the next Esc closes the sheet.
    m.slot('squad:recruit-2').click();
    expect(document.activeElement).toBe(m.x());
    m.esc();
    expect(m.open()).toBe(false);
    expect(document.activeElement).toBe(m.slot('squad:recruit-2'));
    expect(m.inv.isOpen()).toBe(true);
    m.esc();
    expect(m.inv.isOpen()).toBe(false);
  });

  it('arrows skip the squad slots the pane hides', () => {
    shell = true;
    swap = true;
    const m = mount();
    m.slot('stash:s1').click();
    m.slot('stash:s1').focus();
    m.key(m.slot('stash:s1'), 'Home');
    // The first slot in reach is the stash's, not a squad slot under the pane.
    expect(document.activeElement?.getAttribute('data-key')).toMatch(/^stash:/);
    expect(m.open()).toBe(true);
  });

  it('Select opens the pane in the squad list place; the keyboard stays where it was pressed; leaving closes it', () => {
    shell = true;
    swap = true;
    const m = mount();
    const toggle = m.q<HTMLButtonElement>('.inv-select');
    toggle.focus();
    toggle.click();
    expect(m.open()).toBe(true);
    expect(m.q('.inv-select-info')).not.toBeNull();
    expect(document.activeElement).toBe(m.q('.inv-select'));
    // Ticking a stash gun keeps the keyboard on that gun and the pane up.
    m.slot('stash:s2').click();
    expect(document.activeElement).toBe(m.slot('stash:s2'));
    expect(m.open()).toBe(true);
    // Esc ends Select and puts the pane away; the keyboard is on Select, never the page.
    m.esc();
    expect(m.open()).toBe(false);
    expect(m.q('.inv-select').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(m.q('.inv-select'));
    // Select again, and the button itself leaves it.
    m.q<HTMLButtonElement>('.inv-select').click();
    expect(m.open()).toBe(true);
    m.q<HTMLButtonElement>('.inv-select').click();
    expect(m.open()).toBe(false);
    expect(document.activeElement).toBe(m.q('.inv-select'));
    // The x on the Select panel leaves Select too.
    m.q<HTMLButtonElement>('.inv-select').click();
    m.x().click();
    expect(m.open()).toBe(false);
    expect(m.q('.inv-select').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(m.q('.inv-select'));
  });

  it('the bench picker opens the pane with its Equip; Esc steps back picker, pane, then sheet', () => {
    shell = true;
    const m = mount();
    m.q<HTMLButtonElement>('.inv-tab[data-tab="bench"]').click();
    m.slot('bench:recruit-4').click();
    expect(m.open()).toBe(true);
    m.x().click();
    expect(m.open()).toBe(false);
    m.slot('bench:recruit-4').click();
    const change = [...m.q('.inv-details').querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Change gun',
    )!;
    change.click();
    expect(m.q('.inv-bench-picker').hidden).toBe(false);
    expect(m.open()).toBe(true);
    m.esc();
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(m.open()).toBe(true);
    m.esc();
    expect(m.open()).toBe(false);
    expect(m.inv.isOpen()).toBe(true);
    m.esc();
    expect(m.inv.isOpen()).toBe(false);
  });

  it('a gun lifted by a drag puts the pane away, so the squad list is there to drop on; the drop works', () => {
    shell = true;
    swap = true;
    const m = mount();
    m.slot('stash:s1').click();
    expect(m.open()).toBe(true);
    under = m.slot('stash:s1');
    pointer(m.slot('stash:s1'), 'pointerdown', 10, 10);
    under = m.slot('squad:recruit-1');
    pointer(m.slot('stash:s1'), 'pointermove', 10 + DRAG_SLOP + 4, 10);
    expect(m.open()).toBe(false);
    expect(m.scrim.querySelector('.inv-ghost')).not.toBeNull();
    pointer(m.slot('stash:s1'), 'pointermove', 200, 200);
    pointer(m.slot('squad:recruit-1'), 'pointerup', 200, 200);
    expect(m.game().roster[0]!.loadout.primary).toMatchObject({ uid: 's1' });
    expect(m.open()).toBe(false);
  });

  it('a long press (touch) lifts the same way', () => {
    vi.useFakeTimers();
    shell = true;
    const m = mount();
    m.slot('stash:s1').click();
    expect(m.open()).toBe(true);
    under = m.slot('stash:s1');
    const e = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 5,
      clientY: 5,
    });
    Object.defineProperties(e, {
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
    });
    m.slot('stash:s1').dispatchEvent(e);
    vi.advanceTimersByTime(LONG_PRESS + 10);
    expect(m.open()).toBe(false);
    expect(m.scrim.querySelector('.inv-ghost')).not.toBeNull();
  });

  it('asked for by gun the details are open on it; the next visit starts shut', () => {
    shell = true;
    const m = mount();
    m.inv.close();
    m.inv.open('s3');
    expect(m.open()).toBe(true);
    expect(m.q('.inv-details').textContent).toContain('Prototype');
    m.inv.close();
    m.inv.open();
    expect(m.open()).toBe(false);
  });

  it('turning the shell clears the pane; the watcher lives only while open', () => {
    shell = true;
    const m = mount();
    m.slot('stash:s1').click();
    expect(m.open()).toBe(true);
    m.q<HTMLButtonElement>('.inv-key-toggle').click();
    expect(m.q('.inv-key-note')).not.toBeNull();
    expect(m.q('.inv-filter-toggle')).not.toBeNull();
    turn(false);
    expect(m.panel.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    // Drawn again: the phone-only Filter button and help line in the key are gone.
    expect(m.scrim.querySelector('.inv-filter-toggle')).toBeNull();
    expect(m.scrim.querySelector('.inv-key-note')).toBeNull();
    const idle = listeners.size;
    m.inv.close();
    expect(listeners.size).toBeLessThan(idle);
  });

  it('a redraw from the camp keeps the pane, the details scroll and each box own scroll', () => {
    shell = true;
    const m = mount();
    m.slot('stash:s1').click();
    const details = m.q('.inv-details');
    details.scrollTop = 41;
    m.q('.inv-squad-zone').scrollTop = 55;
    m.q('.inv-stash').scrollTop = 12;
    m.refresh();
    expect(m.open()).toBe(true);
    expect(m.q('.inv-details').scrollTop).toBe(41);
    expect(m.q('.inv-squad-zone').scrollTop).toBe(55);
    expect(m.q('.inv-stash').scrollTop).toBe(12);
  });

  it('the Stash and Bench tabs each keep their own scroll', () => {
    shell = true;
    const m = mount();
    const stash = m.q('[data-panel="stash"] .inv-stash');
    stash.scrollTop = 33;
    m.q<HTMLButtonElement>('.inv-tab[data-tab="bench"]').click();
    expect(m.q('[data-panel="bench"]').scrollTop).toBe(0);
    m.q<HTMLButtonElement>('.inv-tab[data-tab="stash"]').click();
    expect(m.q('[data-panel="stash"] .inv-stash').scrollTop).toBe(33);
  });
});

describe('Weapons stash chrome on the shell (ID-277)', () => {
  it('the help line moves into the key; the "Stash" word is its own span; the DPS separator is its own span', () => {
    shell = true;
    const m = mount();
    expect(m.q('.inv-stash-zone > .inv-note').textContent).not.toBe('');
    m.q<HTMLButtonElement>('.inv-key-toggle').click();
    expect(m.q('.inv-key-note').textContent).toBe(m.q('.inv-note').textContent);
    expect(m.q('.inv-stash-heading').textContent).toMatch(/^Stash \d+\/\d+/);
    expect(m.q('.inv-stash-heading .inv-stash-word').textContent).toBe('Stash ');
    m.slot('squad:recruit-1').click();
    expect(m.q('.inv-power-sep')).not.toBeNull();
  });

  it('the Filter button opens the two menus; Esc shuts it before anything else; it is drawn on the shell only', () => {
    shell = true;
    const m = mount();
    const f = () => m.q<HTMLButtonElement>('.inv-filter-toggle');
    expect(f().getAttribute('aria-expanded')).toBe('false');
    expect(m.q('.inv-stash-tools').dataset.filter).toBe('shut');
    f().click();
    expect(f().getAttribute('aria-expanded')).toBe('true');
    expect(m.q('.inv-stash-tools').dataset.filter).toBe('open');
    expect(document.activeElement).toBe(f());
    // The menus are the same selects, so a choice filters as ever, and the popover stays up.
    const type = m.q<HTMLSelectElement>('select[data-pick="type"]');
    type.value = type.options[1]!.value;
    type.dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.q('.inv-stash-tools').dataset.filter).toBe('open');
    expect(f().textContent).toBe('Filter • ▾');
    m.esc();
    expect(m.q('.inv-stash-tools').dataset.filter).toBe('shut');
    expect(m.inv.isOpen()).toBe(true);
    expect(document.activeElement).toBe(f());
  });

  it('the slots button reads whole and short: "+10 slots · 150 Scrap" is "+10 · 150" by CSS', () => {
    shell = true;
    const m = mount();
    const buy = m.scrim.querySelector<HTMLElement>('.inv-buy');
    if (!buy) return;
    expect(buy.textContent).toMatch(/^\+\d+ slots · .* Scrap$/);
    expect([...buy.querySelectorAll('.inv-buy-long')].map((s) => s.textContent)).toEqual([
      ' slots',
      ' Scrap',
    ]);
  });

  it('a held gun says "Held by" once: the plain line is marked for the CSS to drop', () => {
    shell = true;
    const m = mount();
    m.slot('squad:recruit-2').click();
    expect(m.q('.inv-where').dataset.held).toBe('true');
    expect(m.q('.inv-gear .inv-combine-label').textContent).toMatch(/^Held by /);
  });

  it('the Filter name says when filtered; a visit starts with it shut', () => {
    shell = true;
    const m = mount();
    const f = () => m.q<HTMLButtonElement>('.inv-filter-toggle');
    expect(f().getAttribute('aria-label')).toBe('Filter by gun type and rarity');
    f().click();
    const type = m.q<HTMLSelectElement>('select[data-pick="type"]');
    type.value = type.options[1]!.value;
    type.dispatchEvent(new Event('change', { bubbles: true }));
    expect(f().getAttribute('aria-label')).toBe('Filter by gun type and rarity, filtered');
    m.inv.close();
    m.inv.open();
    expect(m.q('.inv-stash-tools').dataset.filter).toBe('shut');
  });

  it('Select ending because the stash emptied closes the pane with it', () => {
    shell = true;
    const m = mount();
    m.q<HTMLButtonElement>('.inv-select').click();
    expect(m.open()).toBe(true);
    m.set((g) => ({ ...g, armoury: [] }));
    expect(m.open()).toBe(false);
  });

  it('off the shell the key has no help line', () => {
    const m = mount();
    m.q<HTMLButtonElement>('.inv-key-toggle').click();
    expect(m.scrim.querySelector('.inv-key-note')).toBeNull();
    expect(m.scrim.querySelector('.inv-filter-toggle')).toBeNull();
  });
});

describe('Weapons off the shell is as it was (ID-277)', () => {
  it('no pane attribute, no x, the body scrolls; a second tap changes nothing; Esc closes the sheet', () => {
    const m = mount();
    m.slot('stash:s2').click();
    expect(m.panel.dataset.details).toBeUndefined();
    expect(m.x().hidden).toBe(true);
    m.slot('stash:s2').click();
    expect(m.q('.inv-details').textContent).toContain('Rusty');
    m.slot('stash:s2').focus();
    m.esc();
    expect(m.inv.isOpen()).toBe(false);
  });
});
