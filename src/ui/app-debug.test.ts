// @vitest-environment jsdom
// Debug mode (ID-197) through the real wiring (app.ts): without `?debug=1` there is no debug
// UI and the game saves as ever; with it, the DEBUG badge stays up, the camp lives in its own
// save slot (the player's is never read or written), and each control works from a fresh
// debug save. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { tick } from '../core/horde.ts';
import { campOf, squadOf } from '../core/hordeonly.ts';
import { levelOf } from '../core/stats.ts';
import { DEBUG_SAVE_KEY } from '../storage/debug.ts';
import { decodeSave, encodeSave, SAVE_KEY } from '../storage/save.ts';
import { NOW } from '../storage/testing.ts';
import { start } from './app.ts';
import { skipIntro } from './testing.ts';
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
let at = 0;
/** The page's clock: it moves with the frames, so a win's result comes up on time. */
let clock = NOW;
/** Runs the frames queued so far, 16 ms after the last. */
function step(): void {
  const now = frames;
  frames = [];
  at += 16;
  clock += 16;
  for (const f of now) f(at);
}

function boot(search: string, open = true) {
  window.history.replaceState(null, '', `/${search}`);
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  skipIntro();
  step();
  const panel = () => document.querySelector<HTMLElement>('#debug-panel');
  const badge = () => document.querySelector<HTMLButtonElement>('.debug-badge');
  // Open, so the frames keep it up to date.
  if (open && badge()) {
    badge()!.click();
    step();
  }
  const status = () => panel()!.querySelector('.debug-status')!.textContent;
  const row = (label: string) =>
    [...panel()!.querySelectorAll('.debug-row')].find((r) => r.firstChild!.textContent === label)!;
  const type = (label: string, value: string) => {
    panel()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.value = value;
  };
  const choose = (label: string, value: string) => {
    panel()!.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!.value = value;
  };
  /** Presses `text` in row `label`, then lets a frame run. */
  const press = (label: string, text: string) => {
    const b = [...row(label).querySelectorAll('button')].find((x) => x.textContent === text)!;
    b.click();
    step();
    return status();
  };
  const debugSaved = (): GameState => decodeSave(localStorage.getItem(DEBUG_SAVE_KEY))!.game;
  const corner = () => root.querySelector<HTMLElement>('.hud-corner')!.title;
  const resultTitle = () => root.querySelector('.hud-result-title')!.textContent;
  const resultUp = () => !root.querySelector<HTMLElement>('.hud-result')!.hidden;
  return {
    root,
    panel,
    badge,
    status,
    type,
    choose,
    press,
    debugSaved,
    corner,
    resultTitle,
    resultUp,
  };
}

const REAL = encodeSave({ ...newGame('horde', 1), hordeNumber: 4 }, NOW);

beforeEach(() => {
  frames = [];
  localStorage.clear();
  localStorage.setItem('idle-defender.mute', '1');
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (frames.push(f), 1));
  vi.stubGlobal('DOMMatrix', function () {
    return ctx;
  } as unknown as typeof DOMMatrix);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as CanvasRenderingContext2D,
  );
  vi.mocked(tick).mockClear();
  clock = NOW;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  // The killing blow's white flash is painted on a canvas of its own.
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        return ctx;
      }
    },
  );
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('debug mode off (ID-197)', () => {
  it.each(['', '?debug=0', '?debug=true', '?debug=1&debug=1'])(
    'with %j: no debug UI, and the real save is the one read and written',
    (search) => {
      localStorage.setItem(SAVE_KEY, REAL);
      const { panel, badge, root } = boot(search);
      expect(badge()).toBeNull();
      expect(panel()).toBeNull();
      expect(document.body.textContent).not.toMatch(/DEBUG/);
      expect(root.querySelector('.hud-result-title')!.textContent).toBe('Normal 4');
      expect(localStorage.getItem(DEBUG_SAVE_KEY)).toBeNull();
    },
  );
});

describe('debug mode on (ID-197)', () => {
  it('shows the DEBUG badge, which opens and closes the panel', () => {
    const { badge, panel } = boot('?debug=1', false);
    expect(badge()!.textContent).toBe('DEBUG');
    expect(panel()!.hidden).toBe(true);
    badge()!.click();
    expect(panel()!.hidden).toBe(false);
    expect(badge()!.getAttribute('aria-expanded')).toBe('true');
    badge()!.click();
    expect(panel()!.hidden).toBe(true);
  });

  it('never reads or writes the real save: a fresh debug camp, kept in its own slot', () => {
    localStorage.setItem(SAVE_KEY, REAL);
    const { type, press, debugSaved, resultTitle } = boot('?debug=1');
    expect(resultTitle()).toBe('Normal 1');
    type('Scrap', '777');
    expect(press('Scrap', 'Set')).toBe('Scrap set');
    expect(debugSaved().stock.scrap).toBe(777);
    expect(localStorage.getItem(SAVE_KEY)).toBe(REAL);
  });

  it('sets the camp between hordes: level, Scrap, squad, survivor levels, guns, skill', () => {
    const { type, press, debugSaved } = boot('?debug=1');
    type('Horde', '20');
    type('Seed', '5');
    expect(press('Horde', 'Start')).toBe('Horde 20 started');
    // A reload mid-fight comes back to the camp before it: Normal 20 is the next one.
    const s = boot('?debug=1');
    s.type('Camp level', '9');
    expect(s.press('Camp', 'Set')).toBe('Camp level set');
    s.type('Squad size', '8');
    expect(s.press('Squad', 'Set')).toBe('Squad set');
    expect(squadOf(debugSaved())).toHaveLength(8);
    s.type('Survivor level', '15');
    expect(s.press('Level', 'Set')).toBe('Level set');
    expect(campOf(debugSaved()).every((d) => levelOf(d.xp).level === 15)).toBe(true);
    s.choose('Gun', 'smg');
    s.choose('Rarity', 'relic');
    expect(s.press('Gun', 'Add')).toBe('Gun added');
    expect(debugSaved().armoury.at(-1)).toEqual(
      expect.objectContaining({ base: 'smg', rarity: 'relic' }),
    );
    s.type('Stash guns', '30');
    expect(s.press('Stash', 'Fill')).toBe('Stash filled');
    expect(debugSaved().armoury).toHaveLength(30);
    s.choose('Skill', '');
    expect(s.press('Skill', 'Set')).toBe('Skill set');
    expect(debugSaved().skillPick).toEqual([]);
  });

  it('refuses malformed and out-of-range input with its reason, and saves nothing', () => {
    const { type, press } = boot('?debug=1');
    const before = localStorage.getItem(DEBUG_SAVE_KEY);
    for (const raw of ['', '-1', '1e3', '0x10', ' 12', '1000', '<b>9</b>']) {
      type('Horde', raw);
      expect(press('Horde', 'Start')).toBe('Horde: type 1 to 999');
    }
    type('Scrap', '1000001');
    expect(press('Scrap', 'Set')).toBe('Scrap: type 0 to 1000000');
    type('Stash guns', '5');
    expect(press('Stash', 'Fill')).toMatch(/^No horde beaten/);
    expect(localStorage.getItem(DEBUG_SAVE_KEY)).toBe(before);
  });

  it('starts any horde from a typed seed, shown in the panel', () => {
    const { type, press, panel, corner, debugSaved } = boot('?debug=1');
    type('Horde', '12');
    type('Seed', '4242');
    expect(press('Horde', 'Start')).toBe('Horde 12 started');
    step();
    expect(corner()).toMatch(/^Normal 12/);
    expect(panel()!.querySelector('.debug-note')!.textContent).toBe('Now: 4242');
    expect(debugSaved().hordeNumber).toBe(12);
    // A camp edit waits for the fight to end.
    const setScrap = [...panel()!.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Set',
    );
    expect(setScrap.every((b) => b.disabled)).toBe(true);
  });

  it('fight controls: offer, grant, speed, pause, down, win and lose', () => {
    const { type, choose, press, panel, resultUp, resultTitle } = boot('?debug=1');
    type('Squad size', '3');
    press('Squad', 'Set');
    type('Horde', '1');
    press('Horde', 'Start');
    step();
    const cards = [
      ...panel()!.querySelectorAll<HTMLOptionElement>('select[aria-label="Card"] option'),
    ];
    expect(cards.length).toBeGreaterThan(3);
    choose('Card', cards[0]!.value);
    expect(press('Card', 'Offer')).toBe('Offered');
    expect(press('Card', 'Grant')).toBe('Pick first');
    document.querySelector<HTMLElement>('.hud-card')!.click();
    step();
    choose('Card', cards[1]!.value);
    expect(press('Card', 'Grant')).toBe('Granted');
    // ×10 runs ten times the steps of a frame.
    press('Speed', '×10');
    vi.mocked(tick).mockClear();
    step();
    expect(vi.mocked(tick).mock.lastCall![1]).toBeCloseTo(0.16, 5);
    press('Speed', 'Pause');
    vi.mocked(tick).mockClear();
    step();
    expect(vi.mocked(tick)).not.toHaveBeenCalled();
    press('Speed', 'Resume');
    const line = () => [
      ...panel()!.querySelectorAll('select[aria-label="Survivor to down"] option'),
    ];
    expect(line()).toHaveLength(3);
    expect(press('Down', 'Down')).toBe('Downed');
    step();
    expect(line()).toHaveLength(2);
    expect(press('End', 'Win')).toBe('Win forced');
    for (let i = 0; i < 1000 && !resultUp(); i++) step();
    expect(resultTitle()).toMatch(/^Normal 1 - /);
    expect(resultTitle()).not.toMatch(/fallen/);
    type('Horde', '2');
    expect(press('Horde', 'Start')).toBe('Horde 2 started');
    expect(resultUp()).toBe(false);
    expect(press('End', 'Lose')).toBe('Loss forced');
    step();
    expect(resultUp()).toBe(true);
    expect(resultTitle()).toMatch(/^Normal 2 - Camp has fallen/);
    // From the result screen, a debug Start leaves it for the new fight.
    type('Squad size', '2');
    expect(press('Squad', 'Set')).toBe('Squad set');
    type('Horde', '2');
    expect(press('Horde', 'Start')).toBe('Horde 2 started');
    step();
    expect(resultUp()).toBe(false);
    expect(panel()!.querySelectorAll('select[aria-label="Survivor to down"] option')).toHaveLength(
      2,
    );
  });

  it('shows what each camp field holds now while it is empty', () => {
    const { type, press, panel } = boot('?debug=1');
    type('Scrap', '321');
    press('Scrap', 'Set');
    type('Scrap', '');
    step();
    const field = (l: string) =>
      panel()!.querySelector<HTMLInputElement>(`input[aria-label="${l}"]`)!;
    expect(field('Scrap').placeholder).toBe('321');
    expect(field('Horde').placeholder).toBe('1');
    expect(field('Camp level').placeholder).toBe('1');
    expect(field('Stash guns').placeholder).toBe('0');
  });

  it('Reset debug save starts a new debug camp; the real save stays', () => {
    localStorage.setItem(SAVE_KEY, REAL);
    const { type, press, debugSaved, panel } = boot('?debug=1');
    type('Horde', '9');
    press('Horde', 'Start');
    // Mid-fight: the fight goes with the old camp.
    panel()!.querySelector<HTMLButtonElement>('.debug-reset')!.click();
    step();
    expect(document.querySelector('.hud-corner')!.getAttribute('title') ?? '').not.toMatch(
      /^Normal 9/,
    );
    step();
    expect(debugSaved().hordeNumber).toBe(1);
    expect(localStorage.getItem(SAVE_KEY)).toBe(REAL);
  });
});
