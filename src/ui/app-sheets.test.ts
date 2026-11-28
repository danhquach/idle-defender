// @vitest-environment jsdom
// ID-276 through the real wiring (app.ts): on the phone shell every window is a sheet between
// the rails and the rail is its tabs. The lit button closes it, another switches, a tap on the
// empty backdrop or Esc from a rail button closes it too; off the shell nothing of this runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HORDE_ONLY } from '../core/data.ts';
import { SHORT_TOUCH } from './landscape.ts';
import { start } from './app.ts';
import { skipIntro } from './testing.ts';
import type { Art } from './sprites.ts';

/** A 2D context that takes every call and property and draws nothing. */
const ctx: unknown = new Proxy(function () {}, {
  get: (_t, key) =>
    key === Symbol.toPrimitive
      ? () => 0
      : key === 'canvas'
        ? document.createElement('canvas')
        : ctx,
  set: () => true,
  apply: () => ctx,
});
const art = new Proxy({}, { get: () => document.createElement('img') }) as Art;

let shell = true;
let listeners: Set<() => void>;
const turn = (on: boolean): void => {
  shell = on;
  for (const cb of [...listeners]) cb();
};

beforeEach(() => {
  shell = true;
  listeners = new Set();
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('DOMMatrix', function () {
    return ctx;
  } as unknown as typeof DOMMatrix);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as CanvasRenderingContext2D,
  );
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: shell && q === SHORT_TOUCH,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function boot() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  skipIntro();
  const rail = (cls: string): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>(`:scope > .${cls}`)!;
  const lit = (): string[] =>
    ['roster', 'inv', 'map', 'research', 'menu'].filter(
      (n) => rail(`${n}-button`).getAttribute('aria-expanded') === 'true',
    );
  const camp = document.querySelector<HTMLElement>('.camp-scrim')!;
  const scrims = [...document.querySelectorAll<HTMLElement>('.camp-scrim')];
  const research = scrims.find((s) => s !== camp)!;
  const menu = document.querySelector<HTMLElement>('.menu-scrim')!;
  const tap = (b: Element): void => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };
  const key = (target: Element, k: string): KeyboardEvent => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { root, rail, lit, camp, scrims, research, menu, tap, key };
}

describe('the rail is the sheets tabs (ID-276)', () => {
  it('runs with the flag on', () => {
    expect(HORDE_ONLY).toBe(true);
  });

  it('a tap opens the sheet, its button lit with what it controls; the rail stays live, the rest inert', () => {
    const { root, rail, lit, camp, tap } = boot();
    expect(lit()).toEqual([]);
    tap(rail('roster-button'));
    expect(camp.hidden).toBe(false);
    expect(lit()).toEqual(['roster']);
    expect(rail('roster-button').getAttribute('aria-controls')).toBe(
      camp.querySelector('[role="dialog"]')!.id,
    );
    expect(root.hasAttribute('inert')).toBe(false);
    expect(root.querySelector('.hud')!.hasAttribute('inert')).toBe(true);
    for (const n of ['roster', 'inv', 'map', 'research', 'menu']) {
      expect(rail(`${n}-button`).hasAttribute('inert')).toBe(false);
    }
    expect(camp.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('false');
  });

  it('tapping the lit button closes the sheet and gives the keyboard back to it', () => {
    const { root, rail, lit, camp, tap } = boot();
    tap(rail('roster-button'));
    tap(rail('roster-button'));
    expect(camp.hidden).toBe(true);
    expect(lit()).toEqual([]);
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
    expect(document.activeElement).toBe(rail('roster-button'));
  });

  it('another button switches inside one window without ever closing it', () => {
    const { rail, lit, camp, tap } = boot();
    tap(rail('roster-button'));
    const writes: boolean[] = [];
    const set = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden')!;
    Object.defineProperty(camp, 'hidden', {
      get: () => set.get!.call(camp) as boolean,
      set: (v: boolean) => {
        writes.push(v);
        set.set!.call(camp, v);
      },
    });
    tap(rail('inv-button'));
    expect(lit()).toEqual(['inv']);
    expect(camp.querySelector<HTMLElement>('[data-tab]')!.dataset.tab).toBe('weapons');
    tap(rail('map-button'));
    expect(lit()).toEqual(['map']);
    expect(writes).toEqual([]);
    expect(camp.hidden).toBe(false);
  });

  it('switching to another window closes the first and opens the second; the keyboard goes to the tapped button', () => {
    const { rail, lit, camp, research, menu, tap } = boot();
    tap(rail('roster-button'));
    tap(rail('research-button'));
    expect(camp.hidden).toBe(true);
    expect(research.hidden).toBe(false);
    expect(lit()).toEqual(['research']);
    tap(rail('menu-button'));
    expect(research.hidden).toBe(true);
    expect(menu.hidden).toBe(false);
    expect(lit()).toEqual(['menu']);
    tap(rail('inv-button'));
    expect(menu.hidden).toBe(true);
    expect(camp.hidden).toBe(false);
    expect(lit()).toEqual(['inv']);
    tap(rail('inv-button'));
    expect(document.activeElement).toBe(rail('inv-button'));
  });

  it('Weapons stays lit on the Craft pill, and a tap on it closes the sheet', () => {
    const { rail, lit, camp, tap } = boot();
    tap(rail('inv-button'));
    const craft = camp.querySelector<HTMLButtonElement>('#camp-tab-craft')!;
    const weapons = camp.querySelector<HTMLButtonElement>('#camp-tab-weapons')!;
    // The pills show on these two tabs only; the rest of the strip is hidden.
    expect(craft.hidden || weapons.hidden).toBe(false);
    expect(camp.querySelector<HTMLButtonElement>('#camp-tab-roster')!.hidden).toBe(true);
    tap(craft);
    expect(lit()).toEqual(['inv']);
    tap(rail('inv-button'));
    expect(camp.hidden).toBe(true);
    expect(lit()).toEqual([]);
  });

  it('no x, Esc hint or Done on the sheet; the Menu has none either', () => {
    const { rail, camp, menu, tap } = boot();
    tap(rail('roster-button'));
    for (const sel of ['.camp-close', '.camp-hint', '.camp-done']) {
      expect(camp.querySelector<HTMLElement>(sel)!.hidden).toBe(true);
    }
    tap(rail('menu-button'));
    expect(menu.querySelector<HTMLElement>('.menu-close')!.hidden).toBe(true);
    expect(menu.querySelector<HTMLElement>('.menu-foot')!.hidden).toBe(true);
    expect(menu.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('false');
  });

  it('Esc closes the sheet from inside it and from a rail button, and never opens the Menu', () => {
    const { rail, lit, camp, menu, tap, key } = boot();
    tap(rail('roster-button'));
    key(camp.querySelector('[role="dialog"]')!, 'Escape');
    expect(camp.hidden).toBe(true);
    tap(rail('roster-button'));
    rail('inv-button').focus();
    const e = key(rail('inv-button'), 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(camp.hidden).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(lit()).toEqual([]);
  });

  it('a tap on the empty backdrop closes the sheet; one that began in it, or a drag, does not', () => {
    const { rail, camp, tap } = boot();
    const down = (t: Element): void => {
      t.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    };
    tap(rail('roster-button'));
    const dialog = camp.querySelector('[role="dialog"]')!;
    // Down in the sheet, up on the backdrop: a drag.
    down(dialog);
    tap(camp);
    expect(camp.hidden).toBe(false);
    // A click with no press on the backdrop (a stray one).
    tap(camp);
    expect(camp.hidden).toBe(false);
    down(camp);
    tap(camp);
    expect(camp.hidden).toBe(true);
  });

  it('a tap on the backdrop closes the Menu sheet too', () => {
    const { rail, menu, tap } = boot();
    tap(rail('menu-button'));
    menu.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    tap(menu);
    expect(menu.hidden).toBe(true);
  });

  it('the shell is read at the tap: turned off, a tap on the lit button leaves the sheet to the window', () => {
    const { root, rail, camp, tap } = boot();
    tap(rail('roster-button'));
    turn(false);
    expect(root.hasAttribute('inert')).toBe(true);
    tap(rail('roster-button'));
    expect(camp.hidden).toBe(false);
    turn(true);
    expect(root.hasAttribute('inert')).toBe(false);
    tap(rail('roster-button'));
    expect(camp.hidden).toBe(true);
  });

  it('a rail button added while a sheet is open still reaches the coordinator', () => {
    const { root, rail, lit, camp, tap } = boot();
    tap(rail('roster-button'));
    const map = rail('map-button');
    map.remove();
    root.append(map);
    tap(map);
    expect(lit()).toEqual(['map']);
    expect(camp.hidden).toBe(false);
  });

  it('the Help card from the Menu sheet: the sheet closes first, the card holds the whole field, and nothing stays inert after', () => {
    const { root, rail, lit, menu, tap } = boot();
    tap(rail('menu-button'));
    menu.querySelector<HTMLButtonElement>('#menu-tab-help')!.click();
    const show = [...menu.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Show the how-to-play card',
    )!;
    show.click();
    expect(menu.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(lit()).toEqual([]);
    document.querySelector<HTMLButtonElement>('.intro-card .btn-primary')!.click();
    expect(root.querySelectorAll('[inert]')).toHaveLength(0);
    expect(rail('roster-button').hasAttribute('inert')).toBe(false);
  });

  it('no window leaves a shell listener behind once it is closed', () => {
    const { rail, tap } = boot();
    const base = listeners.size;
    tap(rail('roster-button'));
    tap(rail('menu-button'));
    tap(rail('research-button'));
    expect(listeners.size).toBeGreaterThan(base);
    tap(rail('research-button'));
    expect(listeners.size).toBe(base);
  });

  it('off the shell nothing changes: the field is inert, a window opens and closes as ever', () => {
    shell = false;
    const { root, rail, lit, camp, tap } = boot();
    tap(rail('roster-button'));
    expect(camp.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(root.querySelectorAll('[inert] [inert]')).toHaveLength(0);
    expect(camp.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(camp.querySelector<HTMLElement>('.camp-close')!.hidden).toBe(false);
    expect(lit()).toEqual(['roster']);
  });
});
