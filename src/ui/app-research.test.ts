// @vitest-environment jsdom
// ID-263 through the real wiring (app.ts, horde-only): the Research button opens the window, a
// purchase asks first and saves at once, buying waits for the end of a fight, and what is
// researched reaches the next horde. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TechId } from '../core/data.ts';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { tick, type HordeState } from '../core/horde.ts';
import { decodeSave, encodeSave, SAVE_KEY } from '../storage/save.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import { answerConfirm, confirmPanel, confirmQuestion, skipIntro } from './testing.ts';
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

function boot() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  skipIntro();
  const result = () => root.querySelector<HTMLElement>('.hud-result')!;
  const title = () => result().querySelector('.hud-result-title')!.textContent;
  const button = () => result().querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!;
  // The corner as read: its tooltip (the horde) and its live wave line (ID-167).
  const bar = () =>
    `${root.querySelector<HTMLElement>('.hud-corner')!.title} · ${root.querySelector('.hud-corner-wave')!.textContent}`;
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
  // The browser's popup is gone (ID-191): every question is the game's own panel.
  vi.spyOn(window, 'confirm').mockImplementation(() => {
    throw new Error("window.confirm is banned: use the game's own confirm panel");
  });
});
afterEach(() => {
  vi.useRealTimers();
  // A confirm left open keeps its capture keydown listener on the document, which swallows
  // every key of the tests after it: answer No, whatever a test left asking.
  confirmPanel()?.querySelector<HTMLButtonElement>('.confirm-no')?.click();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function camp(scrap: number, tech: TechId[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 2,
    roster: [recruit(1)],
    camp: { ...g.camp, recruits: 1 },
    stock: { ...g.stock, scrap },
    ...(tech.length > 0 ? { tech } : {}),
  };
}

/** The camp saved and booted; the Research window's own pieces. */
function seeded(game: GameState) {
  localStorage.setItem(SAVE_KEY, encodeSave(game, NOW));
  const booted = boot();
  step(0);
  const open = booted.root.querySelector<HTMLButtonElement>('.research-button')!;
  const node = (id: TechId) =>
    document.querySelector<HTMLButtonElement>(`.research-node[data-id="${id}"]`)!;
  const go = () => document.querySelector<HTMLButtonElement>('.research-go')!;
  const status = () => document.querySelector('.research-status')!.textContent;
  const chip = () => document.querySelector('.scrap-chip')!.textContent;
  return { ...booted, open, node, go, status, chip };
}

describe('the Research Center in the game (app.ts, ID-263)', () => {
  it('the top bar has a labelled Research button between the globe and Roster', () => {
    const { root } = seeded(camp(0));
    const order = [...root.children]
      .map((c) => c.className)
      .filter((c) => /map-button|research-button|roster-button|inv-button|menu-button/.test(c));
    expect(order).toEqual([
      'map-button',
      'research-button',
      'roster-button',
      'inv-button',
      'menu-button',
    ]);
    expect(root.querySelector('.research-label')!.textContent).toBe('Research');
  });

  it('a purchase asks first: No buys nothing, Yes pays, saves at once and says so', async () => {
    const { open, node, go, status, saved, chip } = seeded(camp(2340));
    open.click();
    node('steel-plating').click();
    expect(go().disabled).toBe(true);
    node('reinforced-wall').click();
    go().click();
    expect(await answerConfirm(false)).toBe(
      'Research Reinforced Wall for 200 Scrap? You have 2,340.',
    );
    expect(saved().stock.scrap).toBe(2340);
    expect(saved().tech).toBeUndefined();
    expect(status()).toBe('');
    go().click();
    await answerConfirm(true);
    expect(saved().stock.scrap).toBe(2140);
    expect(saved().tech).toEqual(['reinforced-wall']);
    expect(status()).toBe('Researched Reinforced Wall · 200 Scrap spent, 2,140 left.');
    expect(chip()).toContain('2,140');
    expect(document.querySelector('.camp-tab[aria-selected="true"]')!.textContent).toBe(
      'Upgrades · 1/14',
    );
    // A node whose prerequisite is not bought stays greyed.
    node('spiked-wall').click();
    expect(go().disabled).toBe(true);
  });

  it('a purchase on the start screen shows on the waiting wall at once (ID-270)', async () => {
    const { open, node, go } = seeded(camp(2340));
    // Omitted from the fight's state while empty.
    const shown = () => vi.mocked(drawScene).mock.calls.at(-1)![2].tech ?? [];
    step(16);
    expect(shown()).toEqual([]);
    open.click();
    node('reinforced-wall').click();
    go().click();
    await answerConfirm(true);
    step(32);
    expect(shown()).toEqual(['reinforced-wall']);
  });

  it('a Tier 3 confirm repeats the effect', async () => {
    const { open, node, go } = seeded(camp(3100, ['reinforced-wall', 'steel-plating']));
    open.click();
    node('spiked-wall').click();
    go().click();
    expect(await answerConfirm(false)).toBe(
      "Research Spiked Wall for 1,500 Scrap? Crawlers climbing the wall lose 20% of a Shambler's HP a second. You have 3,100.",
    );
  });

  it('is refused in a fight with the exact words, and an open window holds the fight', () => {
    const { open, node, go, button } = seeded(camp(5000));
    button().click();
    step(16);
    open.click();
    node('reinforced-wall').click();
    expect(go().disabled).toBe(true);
    expect(document.querySelector('.research-wait')!.textContent).toBe('Research between hordes');
    const ticks = vi.mocked(tick).mock.calls.length;
    step(32);
    step(48);
    expect(vi.mocked(tick).mock.calls.length).toBe(ticks);
  });

  it('a fight that starts while the confirm is open is refused, and no Scrap is spent', async () => {
    const { open, node, go, button, status, saved } = seeded(camp(1000));
    open.click();
    node('reinforced-wall').click();
    go().click();
    expect(confirmQuestion()).toContain('Research Reinforced Wall');
    button().click();
    step(16);
    await answerConfirm(true);
    expect(status()).toBe('Research between hordes');
    expect(saved().stock.scrap).toBe(1000);
    expect(saved().tech).toBeUndefined();
  });

  it('on the result screen a purchase is allowed: the finished horde is unchanged, the next has it', async () => {
    const { open, node, go, button, saved, status } = seeded(camp(1000));
    button().click();
    step(16);
    endNextTick('won');
    step(32);
    expect(document.querySelector<HTMLElement>('.hud-result')!.hidden).toBe(false);
    open.click();
    node('reinforced-wall').click();
    expect(go().disabled).toBe(false);
    go().click();
    await answerConfirm(true);
    expect(status()).toMatch(/^Researched Reinforced Wall/);
    expect(saved().tech).toEqual(['reinforced-wall']);
    // The fight that ended was ticked without it.
    expect(vi.mocked(tick).mock.calls.every(([s]) => s.tech === undefined)).toBe(true);
    document.querySelector<HTMLButtonElement>('.camp-scrim:not([hidden]) .camp-done')!.click();
    // The new survivor who asks to join is turned away, so the button goes on without a question.
    [...document.querySelectorAll<HTMLButtonElement>('.join-btn')]
      .find((x) => x.getAttribute('aria-label')?.startsWith('Refuse') === true)
      ?.click();
    button().click();
    step(48);
    step(64);
    expect(vi.mocked(tick).mock.lastCall![0].tech).toEqual(['reinforced-wall']);
  });

  it('the dot follows Scrap and the fight', () => {
    const { root, button } = seeded(camp(200));
    const dot = () => !root.querySelector<HTMLElement>('.research-dot')!.hidden;
    expect(dot()).toBe(true);
    button().click();
    step(16);
    expect(dot()).toBe(false);
  });
});
