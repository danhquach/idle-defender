// @vitest-environment jsdom
// ID-039 through the real wiring (app.ts): Esc opens the menu, the open menu holds the
// fight, and a camp from the menu (a code, a new camp) is saved, with a refused write
// marking the Menu button. ID-062: Space pauses a fight and A S D set its speed. The canvas and art are stand-ins: nothing here is drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../core/game.ts';
import { rollOffer } from '../core/cards.ts';
import { tick } from '../core/horde.ts';
import { createRng } from '../core/rng.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave, SAVE_KEY } from '../storage/save.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import { PANEL_SPACE } from './build.ts';
import { buildCamera, EASE_MS, PLOT_AT } from './buildscene.ts';
import { FRAME, frameCamera, project, type Camera } from './projection.ts';
import { MOTION_KEY, SPEED_KEY } from '../storage/settings.ts';
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
  vi.mocked(drawScene).mockClear();
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

describe('the camera in the game (app.ts, ID-064)', () => {
  /** The camera the last frame was drawn with. */
  const drawnCam = (): Camera => vi.mocked(drawScene).mock.lastCall![3];
  const key = (type: 'keydown' | 'keyup', k: string) =>
    document.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  const view = () => ({ w: window.innerWidth, h: window.innerHeight });

  /** The build scene's frame beside the panel (jsdom lays nothing out, so the panel's CSS width). */
  const built = (v = view()) => buildCamera(v, v.w - PANEL_SPACE);
  const start = (root: HTMLElement) =>
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Start Horde'))!
      .click();

  it('draws the build scene’s fixed frame, and no key, wheel or Home moves it (ID-065)', () => {
    const { root } = boot();
    step(0);
    const framed = built();
    expect(drawnCam()).toEqual(framed);
    let t = 16;
    for (const k of ['ArrowRight', 'ArrowDown', 'd', 's', 'w', 'a', 'Home']) {
      key('keydown', k);
      step(t);
      step((t += 1000));
      key('keyup', k);
    }
    root.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 400 }));
    step(t + 16);
    expect(drawnCam()).toEqual(framed);
  });

  it('fits the frame again when the window is resized', () => {
    boot();
    step(0);
    const before = drawnCam();
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 720);
    window.dispatchEvent(new Event('resize'));
    step(16);
    expect(drawnCam()).toEqual(built({ w: 1280, h: 720 }));
    expect(drawnCam()).not.toEqual(before);
  });

  it('draws the camp and every ghost in the build scene', () => {
    boot();
    step(0);
    const call = vi.mocked(drawScene).mock.lastCall!;
    expect(call[5]).toMatchObject({ selected: null, hover: null });
    expect(call[5]!.ghosts.slots.length).toBeGreaterThan(0);
    expect(call[9]).toMatchObject({ fence: 'wood' });
    expect(call[9]!.plots.map((p) => p.id)).toEqual(['lab', 'generator', 'hut-0']);
  });

  it('Start Horde eases into the fight frame over EASE_MS, showing the camp until it lands', () => {
    // A wide window, so the fight frame has spare ground left of its edge to slide the clip to.
    vi.stubGlobal('innerWidth', 2560);
    vi.stubGlobal('innerHeight', 1080);
    const { root } = boot();
    step(0);
    const from = built();
    start(root);
    const to = frameCamera(view());
    step(1000);
    expect(drawnCam()).toEqual(from);
    expect(vi.mocked(drawScene).mock.lastCall![9]).not.toBeNull();
    expect(vi.mocked(drawScene).mock.lastCall![10]).toBe(0);
    step(1000 + EASE_MS / 2);
    const mid = drawnCam();
    expect(mid.zoom).toBeGreaterThan(Math.min(from.zoom, to.zoom));
    expect(mid.zoom).toBeLessThan(Math.max(from.zoom, to.zoom));
    // The clip slides halfway to the fight frame's left edge.
    const edge = project({ x: FRAME.left, y: 0 }, to).sx;
    expect(edge).toBeGreaterThan(40);
    expect(vi.mocked(drawScene).mock.lastCall![10]).toBeCloseTo(edge / 2, 9);
    step(1000 + EASE_MS);
    expect(drawnCam()).toEqual(to);
    expect(vi.mocked(drawScene).mock.lastCall![9]).toBeNull();
    expect(vi.mocked(drawScene).mock.lastCall![10]).toBeNull();
  });

  it('with Reduce motion on, Start Horde is a hard cut to the fight frame', () => {
    localStorage.setItem(MOTION_KEY, '1');
    const { root } = boot();
    step(0);
    start(root);
    step(16);
    expect(drawnCam()).toEqual(frameCamera(view()));
    expect(vi.mocked(drawScene).mock.lastCall![9]).toBeNull();
  });

  it('hovering a plot shows a pointer and highlights it; a click opens its part of the panel', () => {
    const { root } = boot();
    step(0);
    const canvas = root.querySelector('canvas')!;
    const at = project({ ...PLOT_AT.generator }, built());
    const pointer = (type: string) => {
      const e = new MouseEvent(type, { bubbles: true, button: 0, clientX: at.sx, clientY: at.sy });
      for (const [k, v] of Object.entries({
        isPrimary: true,
        pointerId: 1,
        offsetX: at.sx,
        offsetY: at.sy,
      })) {
        Object.defineProperty(e, k, { value: v });
      }
      canvas.dispatchEvent(e);
    };
    canvas.setPointerCapture = () => {};
    pointer('pointermove');
    step(16);
    expect(canvas.style.cursor).toBe('pointer');
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).toMatchObject({
      plot: { id: 'generator' },
    });
    // From the Camp tab, the generator's plot opens the Build tab.
    root.querySelector<HTMLButtonElement>('#build-tab-camp')!.click();
    pointer('pointerdown');
    pointer('pointerup');
    expect(root.querySelector('[aria-selected="true"]')!.textContent).toBe('Build');
    expect(root.querySelector('.build-power')).not.toBeNull();
  });

  it('works the hovered target out each frame, so a resize under a still pointer never leaves it stale', () => {
    const { root } = boot();
    step(0);
    const canvas = root.querySelector('canvas')!;
    const at = project({ ...PLOT_AT.lab }, built());
    const e = new MouseEvent('pointermove', { bubbles: true });
    for (const [k, v] of Object.entries({ isPrimary: true, offsetX: at.sx, offsetY: at.sy })) {
      Object.defineProperty(e, k, { value: v });
    }
    canvas.dispatchEvent(e);
    step(16);
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).toMatchObject({ plot: { id: 'lab' } });
    // A finger lifted hovers nothing; a mouse button let go still hovers.
    const lift = (pointerType: string) => {
      const up = new MouseEvent('pointerup', { bubbles: true });
      for (const [k, v] of Object.entries({
        isPrimary: true,
        pointerType,
        offsetX: 0,
        offsetY: 0,
      })) {
        Object.defineProperty(up, k, { value: v });
      }
      canvas.dispatchEvent(up);
      step(40);
    };
    canvas.dispatchEvent(e);
    lift('mouse');
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).not.toBeNull();
    lift('touch');
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).toBeNull();
    canvas.dispatchEvent(e);
    step(44);
    // The frame moves under the pointer: what is under it now is worked out again.
    vi.stubGlobal('innerWidth', 600);
    vi.stubGlobal('innerHeight', 400);
    window.dispatchEvent(new Event('resize'));
    step(32);
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).not.toMatchObject({
      plot: { id: 'lab' },
    });
    canvas.dispatchEvent(new MouseEvent('pointerleave'));
    step(48);
    expect(vi.mocked(drawScene).mock.lastCall![5]!.hover).toBeNull();
    expect(canvas.style.cursor).toBe('');
  });
});

describe('pause and game speed in the game (app.ts, ID-062)', () => {
  const press = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  function fight() {
    const booted = boot();
    [...booted.root.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Start Horde'))!
      .click();
    const chip = booted.root.querySelector<HTMLElement>('.hud-speed .menu-chip')!;
    const speedButton = (n: number) =>
      [...booted.root.querySelectorAll<HTMLButtonElement>('.hud-speed-button')].find((b) =>
        b.textContent!.startsWith(`${n}×`),
      )!;
    const pressed = () =>
      [...booted.root.querySelectorAll('.hud-speed-button[aria-pressed="true"]')].map(
        (b) => b.textContent,
      );
    step(0);
    vi.mocked(tick).mockClear();
    return { ...booted, chip, speedButton, pressed };
  }

  it('Space holds the fight and shows Paused; the menu opening and closing keeps it held', () => {
    const { chip, esc, dialogButton } = fight();
    expect(chip.hidden).toBe(true);
    const e = press(' ');
    expect(e.defaultPrevented).toBe(true);
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe('PausedSpace');
    step(16);
    step(5000);
    // A held key's repeats don't toggle it back.
    press(' ', { repeat: true });
    step(5016);
    esc();
    // Closing leaves it held, and the menu says so.
    expect(document.querySelector('.menu-hint')!.textContent).toBe('Esc closes');
    dialogButton('Close').click();
    step(5032);
    step(5048);
    expect(tick).not.toHaveBeenCalled();
    expect(chip.hidden).toBe(false);
    press(' ');
    expect(chip.hidden).toBe(true);
    step(5064); // the first frame back counts no time
    expect(tick).not.toHaveBeenCalled();
    step(5080);
    expect(vi.mocked(tick)).toHaveBeenCalledOnce();
    expect(vi.mocked(tick).mock.calls[0]![1]).toBeCloseTo(0.016);
  });

  it('Space on a focused HUD button pauses instead of pressing it', () => {
    const { chip, speedButton, pressed } = fight();
    speedButton(3).focus();
    const e = press(' ', {}, speedButton(3));
    expect(e.defaultPrevented).toBe(true);
    expect(chip.hidden).toBe(false);
    expect(pressed()).toEqual(['1×A']);
  });

  it('a list or text field keeps Space and the speed keys; so do Ctrl, Cmd and Alt', () => {
    const { root, chip, pressed } = fight();
    const list = document.createElement('select');
    root.append(list);
    expect(press(' ', {}, list).defaultPrevented).toBe(false);
    press('d', {}, list);
    const text = document.createElement('textarea');
    root.append(text);
    press(' ', {}, text);
    press('s', {}, text);
    press('s', { ctrlKey: true });
    press('d', { metaKey: true });
    press(' ', { altKey: true });
    expect(chip.hidden).toBe(true);
    expect(pressed()).toEqual(['1×A']);
  });

  it('a fight starts running, whatever Space did between hordes', () => {
    const { root } = boot();
    press(' ');
    [...root.querySelectorAll('button')]
      .find((b) => b.textContent?.startsWith('Start Horde'))!
      .click();
    expect(root.querySelector<HTMLElement>('.hud-speed .menu-chip')!.hidden).toBe(true);
    step(0);
    step(16);
    expect(tick).toHaveBeenCalled();
  });

  it('1× 2× 3× buttons and A S D run that many fixed steps a frame, and the choice is stored', () => {
    const { speedButton, pressed } = fight();
    expect(pressed()).toEqual(['1×A']);
    speedButton(3).click();
    expect(pressed()).toEqual(['3×D']);
    expect(localStorage.getItem(SPEED_KEY)).toBe('3');
    step(16);
    expect(vi.mocked(tick).mock.lastCall![1]).toBeCloseTo(0.048);
    press('s');
    expect(pressed()).toEqual(['2×S']);
    expect(localStorage.getItem(SPEED_KEY)).toBe('2');
    step(32);
    expect(vi.mocked(tick).mock.lastCall![1]).toBeCloseTo(0.032);
    press('A');
    expect(pressed()).toEqual(['1×A']);
    // A frame stalls at MAX_DT (0.1 s), times the speed: never a skipped stretch.
    press('d');
    step(5000);
    expect(vi.mocked(tick).mock.lastCall![1]).toBeCloseTo(0.3);
  });

  it('Space stacks with a card offer: 1 still picks, the fight stays held, and resuming carries on', () => {
    const { root, chip } = fight();
    const real = vi.mocked(tick).getMockImplementation()!;
    vi.mocked(tick).mockImplementationOnce((s, dt) => {
      const next = real(s, dt);
      return { ...next, offer: rollOffer(createRng(1), next) };
    });
    step(16);
    step(32);
    const cards = root.querySelector<HTMLElement>('.hud-cards')!;
    expect(cards.hidden).toBe(false);
    press(' ');
    expect(chip.hidden).toBe(false);
    press('1');
    expect(cards.hidden).toBe(true);
    vi.mocked(tick).mockClear();
    step(48);
    step(64);
    expect(tick).not.toHaveBeenCalled();
    press(' ');
    step(80); // the first frame back counts no time, so the next covers 96 − 80 ms
    step(96);
    expect(vi.mocked(tick).mock.lastCall![0].offer).toBeNull();
    expect(vi.mocked(tick).mock.lastCall![1]).toBeCloseTo(0.016);
  });

  it('Space on the result screen holds nothing', () => {
    const { chip } = fight();
    const real = vi.mocked(tick).getMockImplementation()!;
    vi.mocked(tick).mockImplementationOnce((s, dt) => ({ ...real(s, dt), outcome: 'won' }));
    step(16);
    step(32);
    press(' ');
    expect(chip.hidden).toBe(true);
  });

  it('the stored speed comes back on the next load; a bad one is 1×', () => {
    localStorage.setItem(SPEED_KEY, '3');
    expect(fight().pressed()).toEqual(['3×D']);
    localStorage.setItem(SPEED_KEY, '9');
    expect(fight().pressed()).toEqual(['1×A']);
  });

  it('the open menu keeps the speed keys', () => {
    const { esc, pressed } = fight();
    esc();
    press('d', {}, document.activeElement!);
    expect(pressed()).toEqual(['1×A']);
  });
});
