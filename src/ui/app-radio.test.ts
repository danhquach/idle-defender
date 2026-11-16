// @vitest-environment jsdom
// The radio chip's explanation through the real wiring (ID-190): open on a first launch (the
// flag saved), closed after, kept as the player left it across redraws, and no crash or
// reopening with storage that refuses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { encodeSave, SAVE_KEY } from '../storage/save.ts';
import { RADIO_SEEN_KEY } from '../storage/settings.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import { skipIntro } from './testing.ts';
import { drawScene } from './render.ts';
import type { Art } from './sprites.ts';

vi.mock('./render.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./render.ts')>();
  return { ...real, drawScene: vi.fn(real.drawScene) };
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
const step = (t: number): void => {
  const now = frames;
  frames = [];
  for (const f of now) f(t);
};

beforeEach(() => {
  frames = [];
  localStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), 1));
  vi.stubGlobal('DOMMatrix', function () {
    return ctx;
  } as unknown as typeof DOMMatrix);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as CanvasRenderingContext2D,
  );
  vi.mocked(drawScene).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Horde 2 with a Relic rifle in the stash, so "Best gun for everyone" redraws the screen. */
function boot() {
  const g = newGame('horde');
  const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
  const camp = {
    ...g,
    hordeNumber: 2,
    roster: [recruit(1)],
    camp: { ...g.camp, recruits: 1 },
    armoury: [relic],
  };
  const stored = globalThis.localStorage;
  stored.setItem(SAVE_KEY, encodeSave(camp, NOW));
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  skipIntro();
  step(0);
  const chip = () => root.querySelector<HTMLButtonElement>('button.chip-toggle')!;
  const help = () => root.querySelector<HTMLElement>('.radio-help')!;
  /** Hands out the stash: the start screen redraws with the new gun. */
  const redraw = () => {
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    document.querySelector<HTMLButtonElement>('.inv-best')!.click();
  };
  return { root, chip, help, redraw };
}

describe('the radio explanation in the game (ID-190)', () => {
  it('first boot: open, and the flag is written', () => {
    const { chip, help } = boot();
    expect(help().hidden).toBe(false);
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem(RADIO_SEEN_KEY)).toBe('1');
  });

  it('a second boot with the flag: closed', () => {
    localStorage.setItem(RADIO_SEEN_KEY, '1');
    const { chip, help } = boot();
    expect(help().hidden).toBe(true);
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it('opened by hand stays open through a redraw', () => {
    localStorage.setItem(RADIO_SEEN_KEY, '1');
    const { chip, help, redraw, root } = boot();
    chip().click();
    const before = root.querySelector('.squad-card')!.outerHTML;
    redraw();
    expect(root.querySelector('.squad-card')!.outerHTML).not.toBe(before);
    expect(help().hidden).toBe(false);
    expect(chip().getAttribute('aria-expanded')).toBe('true');
  });

  it('closed by hand stays closed through a redraw', () => {
    const { chip, help, redraw, root } = boot();
    chip().click();
    expect(help().hidden).toBe(true);
    const before = root.querySelector('.squad-card')!.outerHTML;
    redraw();
    expect(root.querySelector('.squad-card')!.outerHTML).not.toBe(before);
    expect(help().hidden).toBe(true);
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it('storage that refuses: no crash, open once, and closed redraws stay closed', () => {
    const real = globalThis.localStorage;
    const refusing = {
      getItem: (k: string): string | null => {
        if (k === SAVE_KEY) return real.getItem(k);
        throw new Error('blocked');
      },
      setItem: (k: string, v: string): void => {
        if (k === SAVE_KEY) real.setItem(k, v);
        else throw new Error('full');
      },
      removeItem: (k: string): void => real.removeItem(k),
    };
    vi.stubGlobal('localStorage', refusing);
    const { chip, help, redraw } = boot();
    expect(help().hidden).toBe(false);
    chip().click();
    redraw();
    expect(help().hidden).toBe(true);
  });
});
