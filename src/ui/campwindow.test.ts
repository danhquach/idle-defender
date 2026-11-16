// @vitest-environment jsdom
// ID-183: the Roster and the Inventory's Weapons are tabs of one camp window. Switching
// tabs keeps it open; each top-bar button opens it on its own tab.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createCampWindow, shortLabel, type CampTab } from './campwindow.ts';
import { createInventory } from './inventory.ts';
import { createRoster, type RosterOptions } from './squadroster.ts';

function mount() {
  const root = document.createElement('div');
  const field = document.createElement('button');
  root.append(field);
  document.body.replaceChildren(root);
  const win = createCampWindow(root);
  const tab = (id: string, escape?: () => boolean, status?: HTMLElement) => {
    const button = document.createElement('button');
    root.append(button);
    const t = {
      id,
      label: id.toUpperCase(),
      panel: document.createElement('div'),
      tools: [document.createElement('button')],
      button,
      show: vi.fn(),
      hide: vi.fn(),
      ...(escape ? { escape } : {}),
      ...(status ? { status } : {}),
    } satisfies CampTab;
    win.add(t);
    return t;
  };
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const strip = () => [...win.dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  return { root, field, win, tab, key, strip };
}

describe('the camp window (ID-183)', () => {
  it('lists Roster left of Weapons whichever is added first; an unknown tab goes last', () => {
    const { tab, strip } = mount();
    tab('other');
    tab('weapons');
    tab('roster');
    expect(strip().map((b) => b.textContent)).toEqual(['ROSTER', 'WEAPONS', 'OTHER']);
  });

  it('opens on the tab asked for: one panel and its tools on show, the field inert', () => {
    const { root, win, tab, strip } = mount();
    const weapons = tab('weapons');
    const roster = tab('roster');
    expect(win.scrim.hidden).toBe(true);
    expect(win.isOpen()).toBe(false);
    expect(win.current()).toBeNull();

    win.open('weapons');
    expect(win.scrim.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(win.current()).toBe('weapons');
    expect(win.dialog.dataset.tab).toBe('weapons');
    expect(weapons.panel.hidden).toBe(false);
    expect(roster.panel.hidden).toBe(true);
    expect(weapons.tools[0]!.closest('[hidden]')).toBeNull();
    expect(roster.tools[0]!.closest('[hidden]')).not.toBeNull();
    expect(strip().map((b) => b.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(strip().map((b) => b.tabIndex)).toEqual([-1, 0]);
    expect(weapons.show).toHaveBeenCalledTimes(1);
    expect(roster.show).not.toHaveBeenCalled();
  });

  it('ties each tab to its panel for a screen reader', () => {
    const { win, tab, strip } = mount();
    const roster = tab('roster');
    const [button] = strip();
    expect(win.dialog.getAttribute('role')).toBe('dialog');
    expect(win.dialog.getAttribute('aria-modal')).toBe('true');
    expect(button!.parentElement!.getAttribute('role')).toBe('tablist');
    // The strip is named by its tabs: one alone in the build without the Roster.
    expect(button!.parentElement!.getAttribute('aria-label')).toBe('ROSTER');
    tab('weapons');
    expect(button!.parentElement!.getAttribute('aria-label')).toBe('ROSTER and WEAPONS');
    expect(roster.panel.getAttribute('role')).toBe('tabpanel');
    expect(button!.getAttribute('aria-controls')).toBe(roster.panel.id);
    expect(roster.panel.getAttribute('aria-labelledby')).toBe(button!.id);
  });

  it('a click on the other tab switches without closing; the keyboard stays on the strip', () => {
    const { root, win, tab, strip } = mount();
    const weapons = tab('weapons');
    const roster = tab('roster');
    win.open('roster');
    strip()[1]!.click();
    expect(win.isOpen()).toBe(true);
    expect(win.scrim.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(win.current()).toBe('weapons');
    expect(roster.hide).toHaveBeenCalledTimes(1);
    expect(weapons.show).toHaveBeenCalledTimes(1);
    expect(roster.panel.hidden).toBe(true);
    expect(weapons.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(strip()[1]);
    // The tab already on show: nothing is drawn again.
    strip()[1]!.click();
    expect(weapons.show).toHaveBeenCalledTimes(1);
  });

  it('arrows, Home and End move between the tabs, wrapping', () => {
    const { win, tab, key, strip } = mount();
    tab('roster');
    tab('weapons');
    win.open('roster');
    const [r, w] = strip();
    expect(key(r!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(win.current()).toBe('weapons');
    expect(document.activeElement).toBe(w);
    key(w!, 'ArrowRight');
    expect(win.current()).toBe('roster');
    key(r!, 'ArrowLeft');
    expect(win.current()).toBe('weapons');
    key(w!, 'Home');
    expect(win.current()).toBe('roster');
    key(r!, 'End');
    expect(win.current()).toBe('weapons');
    // A key that is no move, or a prototype's name, does nothing.
    expect(key(w!, 'a').defaultPrevented).toBe(false);
    expect(key(w!, 'constructor').defaultPrevented).toBe(false);
    expect(win.current()).toBe('weapons');
  });

  it('Esc steps back in the tab first, then closes; a held Esc does neither', () => {
    const { win, tab, key } = mount();
    let layers = 1;
    tab('roster', () => layers-- > 0);
    win.open('roster');
    expect(key(win.dialog, 'Escape', { repeat: true }).defaultPrevented).toBe(true);
    expect(layers).toBe(1);
    key(win.dialog, 'Escape');
    expect(win.isOpen()).toBe(true);
    key(win.dialog, 'Escape');
    expect(win.isOpen()).toBe(false);
  });

  it('keys pressed in the window never reach the field', () => {
    const { win, tab, key } = mount();
    tab('roster');
    win.open('roster');
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    key(win.dialog, 'Escape');
    key(win.dialog, ' ');
    document.removeEventListener('keydown', heard);
    expect(heard).not.toHaveBeenCalled();
  });

  it('Tab wraps from the last stop to the first and back; in between it is the browser’s', () => {
    const { win, tab, key, strip } = mount();
    const roster = tab('roster');
    const weapons = tab('weapons');
    const inPanel = document.createElement('button');
    const off = document.createElement('button');
    off.disabled = true;
    roster.panel.append(inPanel, off);
    weapons.panel.append(document.createElement('button'));
    win.open('roster');
    const close = win.dialog.querySelector<HTMLButtonElement>('.camp-close')!;
    const done = win.dialog.querySelector<HTMLButtonElement>('.camp-done')!;
    // Stops: the selected tab, the Roster's tool, the close, the panel's button, the foot's.
    done.focus();
    expect(key(done, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(strip()[0]);
    expect(key(strip()[0]!, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(done);
    inPanel.focus();
    expect(key(inPanel, 'Tab').defaultPrevented).toBe(false);
    // In the middle Tab is the browser's.
    close.focus();
    expect(key(close, 'Tab').defaultPrevented).toBe(false);
  });

  it('closing hides everything and gives the keyboard back to what opened it', () => {
    const { root, field, win, tab, strip } = mount();
    const roster = tab('roster');
    const weapons = tab('weapons');
    // From a control in the field (a name on the squad screen).
    win.open('roster', field);
    strip()[1]!.click();
    win.close();
    expect(win.scrim.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(false);
    expect(win.current()).toBeNull();
    expect(weapons.hide).toHaveBeenCalledTimes(1);
    expect(roster.panel.hidden && weapons.panel.hidden).toBe(true);
    expect(strip().every((b) => b.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(document.activeElement).toBe(field);
    // With the opener gone, the button of the tab it opened on.
    win.open('roster', field);
    strip()[1]!.click();
    field.remove();
    win.close();
    expect(document.activeElement).toBe(roster.button);
    // A second close, or an unknown tab, does nothing.
    win.close();
    win.open('nope');
    expect(win.isOpen()).toBe(false);
    expect(weapons.hide).toHaveBeenCalledTimes(2);
  });

  it('the window takes the name of the tab on show', () => {
    const { win, tab, strip } = mount();
    tab('roster');
    tab('weapons');
    expect(win.dialog.hasAttribute('aria-label')).toBe(false);
    expect(win.dialog.getAttribute('aria-labelledby')).toBe(strip()[0]!.id);
    win.open('weapons');
    expect(win.dialog.getAttribute('aria-labelledby')).toBe(strip()[1]!.id);
    strip()[0]!.click();
    expect(win.dialog.getAttribute('aria-labelledby')).toBe(strip()[0]!.id);
  });

  it('the close, the hint and the foot button say when closing resumes a fight', () => {
    const { win, tab } = mount();
    tab('roster');
    const close = win.dialog.querySelector<HTMLButtonElement>('.camp-close')!;
    const done = win.dialog.querySelector<HTMLButtonElement>('.camp-done')!;
    const hint = win.dialog.querySelector('.camp-hint')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(done.textContent).toBe('Close');
    expect(hint.textContent).toBe('Esc closes');
    win.setResumes(true);
    expect(close.getAttribute('aria-label')).toBe('Close and resume');
    expect(done.textContent).toBe('Resume');
    expect(hint.textContent).toBe('Esc closes and resumes');
    win.open('roster');
    close.click();
    expect(win.isOpen()).toBe(false);
    win.open('roster');
    done.click();
    expect(win.isOpen()).toBe(false);
  });

  it('the foot shows the status line of the tab on show only', () => {
    const { win, tab, strip } = mount();
    const b = document.createElement('p');
    tab('roster');
    tab('weapons', undefined, b);
    expect(win.dialog.querySelector('.camp-foot')!.contains(b)).toBe(true);
    win.open('roster');
    expect(b.closest('[hidden]')).not.toBeNull();
    strip()[1]!.click();
    expect(b.closest('[hidden]')).toBeNull();
    win.close();
    expect(b.closest('[hidden]')).not.toBeNull();
  });

  it('a short label keeps its full name for a screen reader', () => {
    const b = document.createElement('button');
    shortLabel(b, 'Best gun', ' for everyone');
    expect(b.textContent).toBe('Best gun for everyone');
    expect(b.getAttribute('aria-label')).toBe('Best gun for everyone');
    expect(b.querySelector('.camp-long')!.textContent).toBe(' for everyone');
  });
});

function camp(): GameState {
  const g = newGame('horde');
  return { ...g, hordeNumber: 3, roster: [recruit(1), recruit(2)], reserve: [] };
}

function mountBoth(canGear = true, game: GameState = camp(), more: Partial<RosterOptions> = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const win = createCampWindow(root);
  const inventory = createInventory(
    root,
    {
      state: () => ({ game, resumes: !canGear, canCombine: canGear }),
      onBestGuns: () => ({ ok: true, moves: [] }),
      onCombine: () => ({ ok: false, reason: 'no' }),
    },
    win,
  );
  const opts: RosterOptions = {
    state: () => ({ game, fight: null, canGear, resumes: !canGear }),
    onEquip: () => ({ ok: true }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    ...more,
  };
  const roster = createRoster(root, opts, win);
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => win.dialog.querySelector<T>(sel)!;
  const shown = (sel: string) => q(sel).closest('[hidden]') === null;
  return {
    root,
    win,
    inventory,
    roster,
    q,
    shown,
    rosterButton: root.querySelector<HTMLButtonElement>('.roster-button')!,
    invButton: root.querySelector<HTMLButtonElement>('.inv-button')!,
    rosterTab: q<HTMLButtonElement>('#camp-tab-roster'),
    weaponsTab: q<HTMLButtonElement>('#camp-tab-weapons'),
  };
}

describe('the Roster and Weapons in one window (ID-183)', () => {
  it('is one dialog with the two tabs, Roster first', () => {
    const m = mountBoth();
    expect(document.querySelectorAll('.camp-scrim')).toHaveLength(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect([...m.win.dialog.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual([
      'Roster',
      'Weapons',
    ]);
  });

  it('each top-bar button opens the window on its own tab', () => {
    const m = mountBoth();
    m.rosterButton.click();
    expect(m.win.current()).toBe('roster');
    expect(m.roster.isOpen()).toBe(true);
    expect(m.inventory.isOpen()).toBe(false);
    expect(m.shown('.rv-tabs')).toBe(true);
    expect(m.shown('.inv-body')).toBe(false);
    m.win.close();
    m.invButton.click();
    expect(m.win.current()).toBe('weapons');
    expect(m.inventory.isOpen()).toBe(true);
    expect(m.roster.isOpen()).toBe(false);
    expect(m.shown('.inv-body')).toBe(true);
    expect(m.shown('.rv-tabs')).toBe(false);
    expect(m.q('.inv-slot')).not.toBeNull();
  });

  it('switching tabs keeps the window open and draws the other tab', () => {
    const m = mountBoth();
    m.rosterButton.click();
    m.weaponsTab.click();
    expect(m.win.isOpen()).toBe(true);
    expect(m.root.hasAttribute('inert')).toBe(true);
    expect(m.inventory.isOpen()).toBe(true);
    expect(m.roster.isOpen()).toBe(false);
    expect(m.q('.inv-slot')).not.toBeNull();
    expect(document.activeElement).toBe(m.weaponsTab);
    m.rosterTab.click();
    expect(m.roster.isOpen()).toBe(true);
    expect(m.inventory.isOpen()).toBe(false);
    expect(m.q('.rv-tab')).not.toBeNull();
    expect(document.activeElement).toBe(m.rosterTab);
    // Closed from the other tab's side, the keyboard goes back to the button that opened it.
    m.weaponsTab.click();
    m.q<HTMLButtonElement>('.camp-close').click();
    expect(m.win.isOpen()).toBe(false);
    expect(m.inventory.isOpen() || m.roster.isOpen()).toBe(false);
    expect(document.activeElement).toBe(m.rosterButton);
  });

  it('shows only the open tab’s "Best gun for everyone"', () => {
    const m = mountBoth();
    m.rosterButton.click();
    expect(m.shown('.rv-best')).toBe(true);
    expect(m.shown('.inv-best')).toBe(false);
    m.weaponsTab.click();
    expect(m.shown('.rv-best')).toBe(false);
    expect(m.shown('.inv-best')).toBe(true);
  });

  it('each tab’s status line sits in the one foot, shown with its tab', () => {
    const m = mountBoth();
    m.rosterButton.click();
    m.q<HTMLButtonElement>('.rv-best').click();
    expect(m.q('.camp-foot .rv-status').textContent).not.toBe('');
    expect(m.shown('.rv-status')).toBe(true);
    m.weaponsTab.click();
    expect(m.shown('.rv-status')).toBe(false);
    m.q<HTMLButtonElement>('.inv-best').click();
    expect(m.q('.camp-foot .inv-status').textContent).not.toBe('');
    // Back on the Roster the line starts empty: what it said was about the last visit.
    m.rosterTab.click();
    expect(m.q('.rv-status').textContent).toBe('');
    m.weaponsTab.click();
    expect(m.q('.inv-status').textContent).toBe('');
  });

  it('a survivor asked for while the Weapons tab is up switches to the Roster on them', () => {
    const m = mountBoth();
    m.invButton.click();
    m.roster.open('recruit-2');
    expect(m.win.current()).toBe('roster');
    expect(m.q('.rv-tab[aria-current="true"]').dataset.defender).toBe('recruit-2');
    // Asked again with the Roster up: it moves to that survivor in place.
    m.roster.open('recruit-1');
    expect(m.win.isOpen()).toBe(true);
    expect(m.q('.rv-tab[aria-current="true"]').dataset.defender).toBe('recruit-1');
  });

  it('in a fight both tabs open read-only and the close says it resumes', () => {
    const m = mountBoth(false);
    m.rosterButton.click();
    expect(m.q<HTMLButtonElement>('.rv-best').disabled).toBe(true);
    expect(m.q('.camp-close').getAttribute('aria-label')).toBe('Close and resume');
    m.weaponsTab.click();
    expect(m.q<HTMLButtonElement>('.inv-best').disabled).toBe(true);
    expect(m.q('.camp-close').getAttribute('aria-label')).toBe('Close and resume');
  });

  it('a Combine confirm left open is gone after a switch away and back', () => {
    const rusty = (uid: string) => ({
      uid,
      base: 'smg' as const,
      rarity: 'rusty' as const,
      affixes: [],
    });
    const m = mountBoth(true, { ...camp(), armoury: [rusty('h1'), rusty('h2'), rusty('h3')] });
    m.invButton.click();
    m.q<HTMLButtonElement>('.inv-combine-button').click();
    expect(m.win.dialog.querySelector('.inv-combine-no')).not.toBeNull();
    m.rosterTab.click();
    m.weaponsTab.click();
    expect(m.win.dialog.querySelector('.inv-combine-no')).toBeNull();
    expect(m.q('.inv-combine-button')).not.toBeNull();
  });

  it('a Roster confirm answered after a switch to Weapons leaves both tabs as they were', async () => {
    let answer!: (a: { ok: true; text: string }) => void;
    const onLetGo = vi.fn(
      () => new Promise<{ ok: true; text: string }>((resolve) => (answer = resolve)),
    );
    const all = Array.from({ length: 7 }, (_, i) => recruit(i + 1));
    const game = { ...camp(), roster: all.slice(0, 6), reserve: all.slice(6) };
    const m = mountBoth(true, game, { onLetGo });
    m.roster.open('recruit-7');
    m.q<HTMLButtonElement>('.rv-letgo').click();
    expect(onLetGo).toHaveBeenCalledWith('recruit-7');
    m.weaponsTab.click();
    const weapons = m.q('.inv-dialog').innerHTML;
    answer({ ok: true, text: 'Gone' });
    await Promise.resolve();
    await Promise.resolve();
    expect(m.win.current()).toBe('weapons');
    expect(m.q('.inv-dialog').innerHTML).toBe(weapons);
    expect(m.shown('.rv-status')).toBe(false);
    // Back on the Roster the line is empty: the answer was to a visit that is over.
    m.rosterTab.click();
    expect(m.q('.rv-status').textContent).toBe('');
  });

  it('a module’s close leaves the window alone while the other tab is up', () => {
    const m = mountBoth();
    m.rosterButton.click();
    m.inventory.close();
    expect(m.win.current()).toBe('roster');
    m.roster.close();
    expect(m.win.isOpen()).toBe(false);
  });
});
