// @vitest-environment jsdom
// ID-066 through the real wiring (app.ts) with the horde-only flag on: a start screen,
// then fight → result → next horde. A win saves the XP and the new survivor; a loss
// replays the same horde. The build panel and all it opens (world map, patrols,
// research, workbench, camp, perks) are never on the page. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HORDE_ONLY } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { tick, type HordeState } from '../core/horde.ts';
import { decodeSave, encodeSave, SAVE_KEY } from '../storage/save.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import { drawScene } from './render.ts';
import type { Art } from './sprites.ts';

vi.mock('../core/horde.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../core/horde.ts')>();
  return { ...real, tick: vi.fn(real.tick) };
});
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
function step(t: number): void {
  const now = frames;
  frames = [];
  for (const f of now) f(t);
}

/** Every part of the full game this build hides (ID-066). */
const HIDDEN = [
  '.build-panel',
  '.build-bar',
  '.worldmap-backdrop',
  '.hud-shop:not([hidden])',
  '.hud-card-camp',
].join(', ');

function boot() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  const result = () => root.querySelector<HTMLElement>('.hud-result')!;
  const title = () => result().querySelector('.hud-result-title')!.textContent;
  const button = () => result().querySelector<HTMLButtonElement>('.hud-result-foot > .hud-button')!;
  const bar = () => root.querySelector('.hud-fight-bar')!.textContent;
  const saved = () => decodeSave(localStorage.getItem(SAVE_KEY))!.game;
  return { root, result, title, button, bar, saved };
}

/** The next tick ends the fight as `outcome`. */
function endNextTick(outcome: 'won' | 'lost'): void {
  const real = vi.mocked(tick).getMockImplementation()!;
  vi.mocked(tick).mockImplementationOnce((s: HordeState, dt: number) => ({
    ...real(s, dt),
    outcome,
  }));
}

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
  vi.mocked(tick).mockClear();
  vi.mocked(drawScene).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the horde-only build in the game (app.ts, ID-066)', () => {
  it('runs with the flag on', () => {
    expect(HORDE_ONLY).toBe(true);
  });

  it('opens on Horde 1’s start screen over the squad on the wall; nothing hidden is on the page', () => {
    const { root, result, title, button } = boot();
    step(0);
    expect(result().hidden).toBe(false);
    expect(title()).toBe('Horde 1');
    expect(button().textContent).toBe('Start Horde 1');
    expect(root.querySelector(HIDDEN)).toBeNull();
    const scene = vi.mocked(drawScene).mock.lastCall![2];
    expect(scene.defenders).toHaveLength(1);
    expect(vi.mocked(tick)).not.toHaveBeenCalled();
  });

  it('a click on the field between hordes does nothing, and Esc opens the menu', () => {
    const { root } = boot();
    step(0);
    const canvas = root.querySelector('canvas')!;
    canvas.setPointerCapture = () => {};
    canvas.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { isPrimary: true, button: 0 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector<HTMLElement>('.menu-scrim')!.hidden).toBe(false);
    expect(root.querySelector(HIDDEN)).toBeNull();
  });

  it('a win: XP and a new survivor are saved, and the next horde starts with them', () => {
    const { root, result, title, button, bar, saved } = boot();
    step(0);
    button().click();
    step(16);
    step(32);
    expect(bar()).toMatch(/^Horde 1 · Waves cleared 0\//);
    endNextTick('won');
    step(48);
    expect(result().hidden).toBe(false);
    expect(title()).toBe('Horde 1 held');
    expect(button().textContent).toBe('Start Horde 2');
    // Saved as the fight ends: a reload here keeps the win.
    expect(saved().hordeNumber).toBe(2);
    button().click();
    const g = saved();
    expect(g.hordeNumber).toBe(2);
    expect(g.roster).toHaveLength(2);
    expect(g.roster[0]!.xp).toBeGreaterThan(0);
    step(64);
    expect(bar()).toMatch(/^Horde 2 /);
    expect(vi.mocked(drawScene).mock.lastCall![2].defenders).toHaveLength(2);
    expect(root.querySelector(HIDDEN)).toBeNull();
  });

  it('a loss: nothing gained, and the same horde again with everyone', () => {
    localStorage.setItem(SAVE_KEY, encodeSave({ ...newGame('horde'), hordeNumber: 4 }, NOW));
    const { title, button, bar, saved } = boot();
    step(0);
    expect(title()).toBe('Horde 4');
    button().click();
    step(16);
    endNextTick('lost');
    step(32);
    expect(title()).toBe('The wall fell');
    expect(button().textContent).toBe('Retry Horde 4');
    button().click();
    expect(saved().hordeNumber).toBe(4);
    expect(saved().roster).toEqual(newGame('horde').roster);
    step(48);
    expect(bar()).toMatch(/^Horde 4 · Waves cleared 0\//);
  });

  it('a saved over-full roster loads capped at 6, the rest in the reserve', () => {
    const g = newGame('horde');
    const roster = Array.from({ length: 8 }, (_, i) => ({ ...g.roster[0]!, id: `p-${i}`, xp: i }));
    const json = JSON.parse(encodeSave({ ...g, camp: { ...g.camp, upgrades: 2 } }, NOW));
    json.game.roster = roster;
    localStorage.setItem(SAVE_KEY, JSON.stringify(json));
    const { result } = boot();
    step(0);
    expect(result().textContent).toContain('Squad 6/6');
  });
});
