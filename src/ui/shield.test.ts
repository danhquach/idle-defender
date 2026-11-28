// @vitest-environment jsdom
// ID-276: the field behind an open window. Off the phone shell the whole field is inert, as it
// always was; on it only the rail stays live. Holds are counted by owner, and a release clears
// only what the shield set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHORT_TOUCH } from './landscape.ts';
import { holdField, RAIL_BUTTONS, refreshFields, releaseField } from './shield.ts';
import { answerConfirm, flush } from './testing.ts';
import { askConfirm } from './confirm.ts';

let shell = false;
let listeners: Set<() => void>;
/** The phone turning: the media query changes and tells its listeners. */
function turn(on: boolean): void {
  shell = on;
  for (const cb of [...listeners]) cb();
}

let root: HTMLElement;
const add = (cls: string, tag = 'button'): HTMLElement => {
  const n = document.createElement(tag);
  n.className = cls;
  root.append(n);
  return n;
};
const inert = (n: Element): boolean => n.hasAttribute('inert');

let canvas: HTMLElement;
let hud: HTMLElement;
let rail: Record<string, HTMLElement>;
beforeEach(() => {
  shell = false;
  listeners = new Set();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: shell && q === SHORT_TOUCH,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  }));
  root = document.createElement('div');
  document.body.replaceChildren(root);
  canvas = add('field', 'canvas');
  hud = add('hud', 'div');
  rail = {
    roster: add('roster-button'),
    inv: add('inv-button'),
    map: add('map-button'),
    research: add('research-button'),
    menu: add('menu-button'),
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('off the phone shell', () => {
  it('makes the whole field inert and touches nothing else; a release lifts it', () => {
    holdField(root, 'a');
    expect(inert(root)).toBe(true);
    for (const n of [canvas, hud, ...Object.values(rail)]) expect(inert(n)).toBe(false);
    releaseField(root, 'a');
    expect(inert(root)).toBe(false);
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('a window holds the field as the same owner only once', () => {
    holdField(root, 'a');
    holdField(root, 'a');
    releaseField(root, 'a');
    expect(inert(root)).toBe(false);
  });
});

describe('on the phone shell', () => {
  beforeEach(() => {
    shell = true;
  });

  it('leaves the rail live and every other child inert; the field itself is not', () => {
    holdField(root, 'a');
    expect(inert(root)).toBe(false);
    expect(inert(canvas) && inert(hud)).toBe(true);
    for (const n of Object.values(rail)) expect(inert(n)).toBe(false);
    releaseField(root, 'a');
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('works with any rail button absent, or present later', () => {
    rail.research!.remove();
    rail.map!.remove();
    holdField(root, 'a');
    expect(inert(canvas)).toBe(true);
    expect(inert(rail.roster!)).toBe(false);
    expect(root.matches(RAIL_BUTTONS)).toBe(false);
    releaseField(root, 'a');
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('a child added while held (a toast) goes inert; a rail button added stays live', async () => {
    holdField(root, 'a');
    const toast = add('hud-toast', 'div');
    const late = add('map-button');
    await flush();
    expect(inert(toast)).toBe(true);
    expect(inert(late)).toBe(false);
    releaseField(root, 'a');
    expect(inert(toast)).toBe(false);
  });

  it('watches the child list only, and stops when released', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    holdField(root, 'a');
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0]![1]).toEqual({ childList: true });
    releaseField(root, 'a');
    expect(disconnect).toHaveBeenCalled();
    observe.mockRestore();
    disconnect.mockRestore();
  });

  it('a release clears only the nodes the shield set', () => {
    hud.setAttribute('inert', '');
    holdField(root, 'a');
    releaseField(root, 'a');
    expect(inert(hud)).toBe(true);
    expect(inert(canvas)).toBe(false);
  });

  it('is released only when the last holder lets go', () => {
    holdField(root, 'a');
    holdField(root, 'b');
    releaseField(root, 'a');
    expect(inert(canvas)).toBe(true);
    releaseField(root, 'b');
    expect(inert(canvas)).toBe(false);
  });

  it('a full hold kills the rail too; back to the rail alone when it lets go, the other kept', () => {
    // The Menu's sheet, then the Help card over it, then the card closes.
    holdField(root, 'menu');
    holdField(root, 'intro', { rail: false });
    expect(inert(root)).toBe(true);
    expect(inert(canvas)).toBe(false);
    releaseField(root, 'intro');
    expect(inert(root)).toBe(false);
    expect(inert(canvas) && inert(hud)).toBe(true);
    for (const n of Object.values(rail)) expect(inert(n)).toBe(false);
    // The Menu's later release clears its own nodes, and the rail was never touched.
    releaseField(root, 'menu');
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('a full hold alone: the rail is dead behind the title screen', () => {
    holdField(root, 'intro', { rail: false });
    expect(inert(root)).toBe(true);
    releaseField(root, 'intro');
    expect(inert(root)).toBe(false);
  });

  it('the phone turning while held redoes the field both ways', () => {
    holdField(root, 'a');
    turn(false);
    expect(inert(root)).toBe(true);
    expect(inert(canvas)).toBe(false);
    turn(true);
    expect(inert(root)).toBe(false);
    expect(inert(canvas)).toBe(true);
    releaseField(root, 'a');
    expect(listeners.size).toBe(0);
  });

  it('a confirm over a sheet: the phone turning under it, then the confirm cancelled, the field stays inert', async () => {
    holdField(root, 'a');
    const asked = askConfirm('Sure?');
    expect(inert(root)).toBe(true);
    turn(false);
    expect(inert(root)).toBe(true);
    await answerConfirm(false);
    await asked;
    expect(inert(root)).toBe(true);
    releaseField(root, 'a');
    expect(inert(root)).toBe(false);
  });

  it('a confirm over a sheet, answered with the shell unchanged, leaves the sheet as it was', async () => {
    holdField(root, 'a');
    const asked = askConfirm('Sure?');
    await answerConfirm(true);
    expect(await asked).toBe(true);
    expect(inert(root)).toBe(false);
    expect(inert(canvas)).toBe(true);
    expect(inert(rail.menu!)).toBe(false);
    refreshFields();
    releaseField(root, 'a');
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
  });
});
