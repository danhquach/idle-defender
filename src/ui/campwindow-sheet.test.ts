// @vitest-environment jsdom
// ID-276: the camp window on the phone shell is a sheet: no x, Esc hint or Done, the tab strip
// hidden but for the Weapons and Craft pills, the status line up in the header, not modal.
// Hidden by the attribute, so Tab and the arrows skip them; leaving the shell restores all.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCampWindow, type CampTab } from './campwindow.ts';
import { SHORT_TOUCH } from './landscape.ts';

let shell = false;
let listeners: Set<() => void>;
const turn = (on: boolean): void => {
  shell = on;
  for (const cb of [...listeners]) cb();
};

function mount() {
  const root = document.createElement('div');
  const field = document.createElement('div');
  root.append(field);
  document.body.replaceChildren(root);
  const win = createCampWindow(root);
  const buttons: Record<string, HTMLButtonElement> = {};
  for (const id of ['roster', 'weapons', 'craft', 'map']) {
    const button = document.createElement('button');
    root.append(button);
    buttons[id] = button;
    const status = document.createElement('p');
    status.textContent = `${id} status`;
    win.add({
      id,
      label: id.toUpperCase(),
      panel: document.createElement('div'),
      tools: [document.createElement('button')],
      status,
      button,
      show: vi.fn(),
      hide: vi.fn(),
    } satisfies CampTab);
  }
  const strip = () => [...win.dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const shown = () =>
    strip()
      .filter((b) => !b.hidden)
      .map((b) => b.id.replace('camp-tab-', ''));
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const close = win.dialog.querySelector<HTMLButtonElement>('.camp-close')!;
  const done = win.dialog.querySelector<HTMLButtonElement>('.camp-done')!;
  const head = win.dialog.querySelector<HTMLElement>('.camp-head')!;
  const foot = win.dialog.querySelector<HTMLElement>('.camp-foot')!;
  return { root, field, win, buttons, strip, shown, key, close, done, head, foot };
}

beforeEach(() => {
  shell = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: shell && q === SHORT_TOUCH,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('the camp window as a sheet (ID-276)', () => {
  it('off the shell it is the modal it was: all four tabs, the x, the hint, Done, the foot at the end', () => {
    const { win, shown, close, done, foot, root } = mount();
    win.open('roster');
    expect(shown()).toEqual(['roster', 'weapons', 'craft', 'map']);
    expect(close.hidden || done.hidden).toBe(false);
    expect(win.dialog.getAttribute('aria-modal')).toBe('true');
    expect(foot.parentElement).toBe(win.dialog);
    expect(win.dialog.lastElementChild).toBe(foot);
    expect(root.hasAttribute('inert')).toBe(true);
  });

  it('on the shell: no x, hint or Done, no strip on Roster, not modal, the rail left live', () => {
    shell = true;
    const { win, shown, close, done, foot, head, root, field } = mount();
    win.open('roster');
    expect(close.hidden && done.hidden).toBe(true);
    expect(win.dialog.querySelector<HTMLElement>('.camp-hint')!.hidden).toBe(true);
    expect(shown()).toEqual([]);
    expect(win.dialog.getAttribute('aria-modal')).toBe('false');
    // The status line moved up into the header, after the strip and before the tools.
    expect(foot.parentElement).toBe(head);
    expect(foot.previousElementSibling).toBe(head.querySelector('.camp-tabs'));
    expect(root.hasAttribute('inert')).toBe(false);
    expect(field.hasAttribute('inert')).toBe(true);
  });

  it('the Weapons and Craft pills show on those two tabs only', () => {
    shell = true;
    const { win, shown } = mount();
    win.open('weapons');
    expect(shown()).toEqual(['weapons', 'craft']);
    win.open('craft');
    expect(shown()).toEqual(['weapons', 'craft']);
    win.open('map');
    expect(shown()).toEqual([]);
    win.open('roster');
    expect(shown()).toEqual([]);
  });

  it('Tab skips what is hidden and wraps; the arrows move between the two pills only', () => {
    shell = true;
    const { win, strip, key, buttons } = mount();
    win.open('weapons');
    const [, weapons, craft] = strip();
    weapons!.focus();
    key(weapons!, 'ArrowRight');
    expect(win.current()).toBe('craft');
    expect(document.activeElement).toBe(craft);
    key(craft!, 'ArrowRight');
    expect(win.current()).toBe('weapons');
    key(weapons!, 'End');
    expect(win.current()).toBe('craft');
    key(craft!, 'Home');
    expect(win.current()).toBe('weapons');
    // Tab from the last stop wraps to the first; none of them is a hidden control.
    const stops = [...win.dialog.querySelectorAll<HTMLElement>('button')].filter(
      (b) => !b.closest('[hidden]') && b.tabIndex >= 0,
    );
    expect(stops.every((b) => !b.hidden && !b.classList.contains('camp-close'))).toBe(true);
    stops.at(-1)!.focus();
    const e = key(stops.at(-1)!, 'Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    expect(buttons.roster).toBeDefined();
  });

  it('leaving the shell restores everything; coming back hides it again', () => {
    shell = true;
    const { win, shown, close, done, foot, strip } = mount();
    win.open('weapons');
    turn(false);
    expect(shown()).toEqual(['roster', 'weapons', 'craft', 'map']);
    expect(close.hidden || done.hidden).toBe(false);
    expect(win.dialog.getAttribute('aria-modal')).toBe('true');
    expect(win.dialog.lastElementChild).toBe(foot);
    expect(strip().some((b) => b.hidden)).toBe(false);
    turn(true);
    expect(shown()).toEqual(['weapons', 'craft']);
    expect(close.hidden && done.hidden).toBe(true);
  });

  it('a switch from the rail sends the keyboard back to the button that was tapped; onChange hears every move', () => {
    shell = true;
    const { win, buttons, root } = mount();
    const moves = vi.fn();
    win.onChange(moves);
    win.open('roster', buttons.roster);
    win.open('weapons', buttons.weapons);
    expect(moves).toHaveBeenCalledTimes(2);
    win.close();
    expect(moves).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(buttons.weapons);
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('gives the dialog an id for the rail button to control, one per window', () => {
    const a = mount().win.dialog.id;
    const b = mount().win.dialog.id;
    expect(a).toMatch(/^camp-dialog-\d+$/);
    expect(a).not.toBe(b);
  });
});
