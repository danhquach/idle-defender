// @vitest-environment jsdom
// ID-066 through the real wiring (app.ts) with the horde-only flag on: a start screen,
// then fight → result → next horde. A win saves the XP and the new survivor; a loss
// replays the same horde. The build panel and all it opens (world map, patrols,
// research, workbench, camp, perks) are never on the page. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HORDE_ONLY } from '../core/data.ts';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
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

describe('the Inventory in the game (app.ts, ID-079)', () => {
  function seeded() {
    const g = newGame('horde');
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const camp = {
      ...g,
      hordeNumber: 2,
      roster: [recruit(1)],
      camp: { ...g.camp, recruits: 1 },
      armoury: [relic],
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    const invButton = booted.root.querySelector<HTMLButtonElement>('.inv-button')!;
    const invScrim = document.querySelector<HTMLElement>('.inv-scrim')!;
    const menuScrim = document.querySelector<HTMLElement>('.menu-scrim')!;
    return { ...booted, invButton, invScrim, menuScrim };
  }
  const press = (k: string) =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('while open, Esc and the speed keys on the page reach neither the Menu nor the fight', () => {
    const { root, button, invButton, invScrim, menuScrim } = seeded();
    button().click();
    step(16);
    const pressed = () => root.querySelector('.hud-speed-button[aria-pressed="true"]')!.textContent;
    const before = pressed();
    invButton.click();
    press('Escape');
    expect(menuScrim.hidden).toBe(true);
    expect(invScrim.hidden).toBe(false);
    press('d');
    press(' ');
    expect(pressed()).toBe(before);
    expect(root.querySelector<HTMLElement>('.hud-speed .menu-chip')!.hidden).toBe(true);
  });

  it('follows the camp while open: a gun equipped moves from the stash to the squad', () => {
    const { root, invButton, invScrim } = seeded();
    invButton.click();
    const heading = () => invScrim.querySelector('.menu-heading')!.textContent;
    const squadGun = () => invScrim.querySelector('[aria-label="Squad"] .inv-name')!.textContent;
    expect(heading()).toBe('Stash 1/20');
    expect(squadGun()).toBe('Pistol');
    // The field is inert behind the dialog in a browser; jsdom lets the change through.
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    select.value = 'h1';
    select.dispatchEvent(new Event('change'));
    expect(heading()).toBe('Stash 0/20');
    expect(squadGun()).toBe('Relic Rifle');
  });
});

describe('the Roster in the game (app.ts, ID-086)', () => {
  /** A camp at Horde 2 with survivor 1 at level 2 (3 points to spend) and survivor 2 fresh. */
  function seeded() {
    const g = newGame('horde');
    const camp = {
      ...g,
      hordeNumber: 2,
      roster: [{ ...recruit(1), xp: 25 }, recruit(2)],
      camp: { ...g.camp, recruits: 2 },
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
    const rosterButton = booted.root.querySelector<HTMLButtonElement>('.roster-button')!;
    const plus = (i: number) => scrim.querySelectorAll<HTMLButtonElement>('.roster-stat-add')[i]!;
    return { ...booted, scrim, rosterButton, plus };
  }

  it('on the start screen a + spends the point at once and saves it', () => {
    const { scrim, rosterButton, plus, saved } = seeded();
    rosterButton.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelectorAll('.roster-tile')).toHaveLength(2);
    scrim.querySelector<HTMLButtonElement>('.roster-tile')!.click();
    plus(1).click();
    expect(saved().roster[0]!.stats.agility).toBe(1);
    expect(scrim.querySelector('.roster-card-points')!.textContent).toBe('2 points to spend');
  });

  it('mid-fight the card is view-only and holds the fight', () => {
    const { scrim, rosterButton, button, plus, saved } = seeded();
    button().click();
    step(16);
    rosterButton.click();
    scrim.querySelector<HTMLButtonElement>('.roster-tile')!.click();
    expect(plus(0).disabled).toBe(true);
    plus(0).click();
    expect(saved().roster[0]!.stats.instinct).toBe(0);
    const ticks = vi.mocked(tick).mock.calls.length;
    step(32);
    step(48);
    expect(vi.mocked(tick).mock.calls.length).toBe(ticks);
  });

  it('on the result screen a name opens the card; its + joins the screen’s picks and is saved with its button', () => {
    const { root, result, button, scrim, plus, saved } = seeded();
    button().click();
    step(16);
    endNextTick('won');
    step(32);
    const name = [...result().querySelectorAll<HTMLButtonElement>('.squad-card-open')][0]!;
    expect(name.textContent).toBe(recruit(1).name);
    const left = saved().roster[0]!;
    name.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelector('.roster-card-name')!.textContent).toBe(recruit(1).name);
    const card = () => root.querySelector<HTMLElement>(`.squad-card[data-defender="recruit-1"]`)!;
    const before = card().querySelector('.squad-points')!.textContent;
    plus(2).click();
    // The result screen's own picker counts the point spent in the card.
    expect(card().querySelector('.squad-points')!.textContent).not.toBe(before);
    // Not saved until the screen's button, like a point spent on the screen itself.
    expect(saved().roster[0]!.stats.mind).toBe(left.stats.mind);
    scrim.querySelector<HTMLButtonElement>('.menu-close')!.click();
    expect(document.activeElement).toBe(name);
    button().click();
    expect(saved().roster[0]!.stats.mind).toBe(left.stats.mind + 1);
  });
});

describe('the Roster and the result screen together (app.ts, ID-086)', () => {
  function wonWithPoints() {
    const g = newGame('horde');
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const camp = {
      ...g,
      hordeNumber: 2,
      roster: [{ ...recruit(1), xp: 25 }, recruit(2)],
      camp: { ...g.camp, recruits: 2 },
      armoury: [relic],
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    booted.button().click();
    step(16);
    endNextTick('won');
    step(32);
    const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
    const card = () =>
      booted.root.querySelector<HTMLElement>('.squad-card[data-defender="recruit-1"]')!;
    const pickerButtons = () => [...card().querySelectorAll<HTMLButtonElement>('.hud-pick-stat')];
    const plus = () => [...scrim.querySelectorAll<HTMLButtonElement>('.roster-stat-add')];
    const open = () => card().querySelector<HTMLButtonElement>('.squad-card-open')!.click();
    const close = () => scrim.querySelector<HTMLButtonElement>('.menu-close')!.click();
    return { ...booted, scrim, card, pickerButtons, plus, open, close };
  }
  const spent = (d: { stats: Record<string, number> }) =>
    Object.values(d.stats).reduce((a, b) => a + b, 0);

  it('points spent across the picker and the card never add up to more than were earned', () => {
    const { button, saved, scrim, pickerButtons, plus, open, close } = wonWithPoints();
    const start = saved().roster[0]!;
    const earned = Number(
      /^(\d+) point/.exec(
        document.querySelector('.squad-card[data-defender="recruit-1"] .squad-points')!
          .textContent!,
      )![1],
    );
    expect(earned).toBeGreaterThan(1);
    // One on the screen's picker first: the card opens one point down.
    pickerButtons()[0]!.click();
    open();
    expect(scrim.querySelector('.roster-card-points')!.textContent).toBe(
      `${earned - 1} point${earned - 1 === 1 ? '' : 's'} to spend`,
    );
    // The rest in the card: every + greys out.
    for (let i = 1; i < earned; i++) plus()[1]!.click();
    expect(plus().every((b) => b.disabled)).toBe(true);
    close();
    // The picker took the card's spends: nothing left to click.
    expect(pickerButtons().every((b) => b.disabled)).toBe(true);
    pickerButtons()[0]!.click();
    button().click();
    expect(spent(saved().roster[0]!)).toBe(spent(start) + earned);
  });

  it('follows the camp while open: a gun equipped on the result screen shows on the tile', () => {
    const { root, scrim } = wonWithPoints();
    root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    const gun = () => scrim.querySelector('.roster-tile-gun')!.textContent;
    expect(gun()).toBe('Pistol');
    // The field is inert behind the dialog in a browser; jsdom lets the change through.
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    select.value = 'h1';
    select.dispatchEvent(new Event('change'));
    expect(gun()).toBe('Relic Rifle');
  });

  it('an id the page was edited to (unknown, __proto__) opens the list, nothing else', () => {
    const { card, scrim, open, close } = wonWithPoints();
    const name = card().querySelector<HTMLButtonElement>('.squad-card-open')!;
    for (const id of ['nobody', '__proto__', 'constructor']) {
      name.dataset.openSurvivor = id;
      open();
      expect(scrim.hidden).toBe(false);
      expect(scrim.querySelectorAll('.roster-tile')).toHaveLength(3);
      expect(scrim.querySelector('.roster-card')).toBeNull();
      close();
    }
  });
});
