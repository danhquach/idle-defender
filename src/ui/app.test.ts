// @vitest-environment jsdom
// ID-039 through the real wiring (app.ts): Esc opens the menu, the open menu holds the
// fight, and a camp from the menu (a code, a new camp) is saved, with a refused write
// marking the Menu button. The canvas and art are stand-ins: nothing here is drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../core/game.ts';
import { tick } from '../core/horde.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave, SAVE_KEY } from '../storage/save.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import type { Art } from './sprites.ts';

vi.mock('../core/horde.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../core/horde.ts')>();
  return { ...real, tick: vi.fn(real.tick) };
});

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

let frames: FrameRequestCallback[] = [];
/** Runs the frames queued so far at time `t` ms. */
function step(t: number): void {
  const now = frames;
  frames = [];
  for (const f of now) f(t);
}

function boot() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  const menuButton = root.querySelector<HTMLButtonElement>('.menu-button')!;
  const scrim = () => document.querySelector<HTMLElement>('.menu-scrim')!;
  const dialogButton = (label: string) =>
    [...scrim().querySelectorAll('button')].find(
      (b) => b.textContent === label && !b.closest('[hidden]') && !b.hidden,
    )!;
  const esc = (target: EventTarget = document, repeat = false) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, repeat }));
  const bar = () => root.querySelector('.build-bar')!.textContent;
  return { root, menuButton, scrim, dialogButton, esc, bar };
}

beforeEach(() => {
  frames = [];
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), 1));
  // The fight's sprites use pattern transforms, which jsdom lacks.
  vi.stubGlobal('DOMMatrix', function () {
    return ctx;
  } as unknown as typeof DOMMatrix);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as CanvasRenderingContext2D,
  );
  vi.mocked(tick).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Menu in the game (app.ts)', () => {
  it('Esc with nothing to cancel opens it; a held-down repeat does not', () => {
    const { scrim, esc, menuButton } = boot();
    esc(document, true);
    expect(scrim().hidden).toBe(true);
    esc();
    expect(scrim().hidden).toBe(false);
    // Held: its repeats reach the dialog and don't close it again.
    esc(document.activeElement!, true);
    expect(scrim().hidden).toBe(false);
    esc(document.activeElement!);
    expect(scrim().hidden).toBe(true);
    expect(document.activeElement).toBe(menuButton);
  });

  it('the open menu holds the fight; Resume carries on without a jump', () => {
    const { root, esc, dialogButton } = boot();
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Start Horde'))!
      .click();
    step(0);
    step(16);
    step(32);
    expect(vi.mocked(tick)).toHaveBeenCalledTimes(2);
    esc();
    vi.mocked(tick).mockClear();
    step(48);
    step(5000);
    expect(tick).not.toHaveBeenCalled();
    dialogButton('Resume').click();
    step(5016);
    expect(tick).not.toHaveBeenCalled(); // the first frame back counts no time
    step(5032);
    expect(vi.mocked(tick)).toHaveBeenCalledOnce();
    expect(vi.mocked(tick).mock.calls[0]![1]).toBeCloseTo(0.016);
  });

  it('a loaded code and a new camp become the game and are saved', () => {
    const { menuButton, scrim, dialogButton, bar } = boot();
    const g = { ...newGame(), hordeNumber: 9 };
    menuButton.click();
    scrim().querySelector<HTMLButtonElement>('#menu-tab-save')!.click();
    scrim().querySelector<HTMLTextAreaElement>('[aria-label="Backup code to load"]')!.value =
      exportCode(encodeSave(g, NOW));
    dialogButton('Load code').click();
    dialogButton('Replace camp').click();
    expect(bar()).toMatch(/^Horde 9 next/);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.hordeNumber).toBe(9);
    dialogButton('New camp').click();
    dialogButton('Start new camp').click();
    expect(bar()).toMatch(/^Horde 1 next/);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).game.hordeNumber).toBe(1);
  });

  it('a refused write marks the Menu button; the next good one clears it', () => {
    const { menuButton, scrim, dialogButton } = boot();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    menuButton.click();
    scrim().querySelector<HTMLButtonElement>('#menu-tab-save')!.click();
    dialogButton('New camp').click();
    dialogButton('Start new camp').click();
    expect(menuButton.getAttribute('aria-label')).toBe('Menu, saving problem');
    write.mockRestore();
    dialogButton('New camp').click();
    dialogButton('Start new camp').click();
    expect(menuButton.getAttribute('aria-label')).toBe('Menu');
  });
});
