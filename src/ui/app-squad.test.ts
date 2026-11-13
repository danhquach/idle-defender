// @vitest-environment jsdom
// ID-066 through the real wiring (app.ts) with the horde-only flag on: a start screen,
// then fight → result → next horde. A win saves the XP and the new survivor; a loss
// replays the same horde. The build panel and all it opens (world map, patrols,
// research, workbench, camp, perks) are never on the page. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD, HORDE_ONLY, SKILLS, STASH_CAP } from '../core/data.ts';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import { tick, type HordeState } from '../core/horde.ts';
import { enemy } from '../core/testing.ts';
import { decodeSave, encodeSave, SAVE_KEY } from '../storage/save.ts';
import { MUTE_KEY } from '../storage/settings.ts';
import { NOW } from '../storage/testing.ts';
import { SoundEngine } from './audio.ts';
import { SAVE_STATUS } from './menu.ts';
import { LEVEL_ONE_SHORT, LEVEL_ONE_TEXT, levelText } from './statlines.ts';
import { start } from './app.ts';
import { skipIntro } from './testing.ts';
import { AIM_PROMPT } from './hud.ts';
import { project } from './projection.ts';
import { GUNS_WAIT } from './inventory.ts';
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
  // The cash shop; the picked skills (ID-100) show in the same row.
  '.hud-shop-item:not(.hud-skill):not([hidden])',
  '.hud-card-camp',
].join(', ');

function boot() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  start(root, art);
  skipIntro();
  const result = () => root.querySelector<HTMLElement>('.hud-result')!;
  const title = () => result().querySelector('.hud-result-title')!.textContent;
  const button = () => result().querySelector<HTMLButtonElement>('.hud-result-foot > .hud-button')!;
  // The corner's tooltip carries the status line the old top bar showed.
  const bar = () => root.querySelector<HTMLElement>('.hud-corner')!.title;
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

  it('a win whose last kill is still dying shows its result once it has died, saved at once (ID-110)', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
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
    const { result, title, button, saved } = boot();
    step(0);
    button().click();
    step(16);
    const real = vi.mocked(tick).getMockImplementation()!;
    // One enemy on the field, killed by the step that wins the fight.
    vi.mocked(tick).mockImplementationOnce((s: HordeState, dt: number) => {
      const next = real(s, dt);
      return { ...next, enemies: [...next.enemies, enemy(next, { x: 900, y: 60 })] };
    });
    step(32);
    vi.mocked(tick).mockImplementationOnce((s: HordeState, dt: number) => ({
      ...real(s, dt),
      enemies: [],
      outcome: 'won',
    }));
    step(48);
    expect(result().hidden).toBe(true);
    // The win is saved as the fight ends all the same.
    expect(saved().hordeNumber).toBe(2);
    // The scene still draws its last kill dying: real seconds since the end.
    expect(vi.mocked(drawScene).mock.lastCall![2].ended).toBe(0);
    clock.mockReturnValue(NOW + 500);
    step(64);
    expect(result().hidden).toBe(true);
    clock.mockReturnValue(NOW + 1000);
    step(80);
    expect(result().hidden).toBe(false);
    expect(title()).toBe('Horde 1 held');
  });

  it('a loss shows its result at once (ID-110)', () => {
    const { result, title, button } = boot();
    step(0);
    button().click();
    step(16);
    endNextTick('lost');
    step(32);
    expect(result().hidden).toBe(false);
    expect(title()).not.toBe('Horde 1 held');
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
    const heading = () => invScrim.querySelector('.inv-stash-heading')!.textContent;
    // The first survivor's slot is named for the gun they hold.
    const squadGun = () =>
      invScrim
        .querySelector('[aria-label="Squad"] .inv-slot')!
        .getAttribute('aria-label')!
        .split(',')[0];
    expect(heading()).toBe(`Stash 1/${STASH_CAP}`);
    expect(squadGun()).toBe('Pistol');
    // The field is inert behind the dialog in a browser; jsdom lets the change through.
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    select.value = 'h1';
    select.dispatchEvent(new Event('change'));
    expect(heading()).toBe(`Stash 0/${STASH_CAP}`);
    expect(squadGun()).toBe('Relic Carbine');
  });

  it('equips from the Inventory (ID-095): saved at once, and the gun picker follows', () => {
    const { root, invButton, invScrim, saved } = seeded();
    invButton.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:h1"]')!.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-equip-on')!.click();
    expect(saved().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
    expect(saved().armoury).toHaveLength(0);
    expect(root.querySelector<HTMLSelectElement>('.hud-gear-select')!.value).toBe('h1');
    expect(invScrim.querySelector('.inv-status')!.textContent).toMatch(/now holds Relic Carbine$/);
    // And back: Unequip puts it in the stash.
    invScrim.querySelector<HTMLButtonElement>('.inv-unequip')!.click();
    expect(saved().roster[0]!.loadout.primary).toBe('pistol');
    expect(root.querySelector<HTMLSelectElement>('.hud-gear-select')!.value).toBe('pistol');
  });

  it('mid-fight the Inventory moves no guns and says when they change (ID-095)', () => {
    const { button, invButton, invScrim } = seeded();
    button().click();
    step(16);
    invButton.click();
    expect(invScrim.textContent).toContain(GUNS_WAIT);
    expect(invScrim.querySelectorAll('.inv-equip-on, .inv-unequip, [data-drag]')).toHaveLength(0);
  });
});

describe('Combine in the game (app.ts, ID-091)', () => {
  function seeded() {
    const g = newGame('horde');
    const rusty = (uid: string) => ({
      uid,
      base: 'smg' as const,
      rarity: 'rusty' as const,
      affixes: [],
    });
    const camp = {
      ...g,
      hordeNumber: 4,
      roster: [recruit(1)],
      camp: { ...g.camp, recruits: 1 },
      armoury: [rusty('h1'), rusty('h2'), rusty('h3')],
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    const invButton = booted.root.querySelector<HTMLButtonElement>('.inv-button')!;
    const invScrim = document.querySelector<HTMLElement>('.inv-scrim')!;
    const combineButtons = () => invScrim.querySelectorAll('.inv-combine-button');
    const close = () => invScrim.querySelector<HTMLButtonElement>('.menu-foot button')!.click();
    return { ...booted, invButton, invScrim, combineButtons, close };
  }

  it('on the start screen combines, saves, and the gun picker lists the new gun', () => {
    const { root, invButton, invScrim, saved } = seeded();
    invButton.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(saved().armoury.map((w) => [w.uid, w.rarity, w.base])).toEqual([
      ['h1', 'common', 'smg'],
    ]);
    const options = [...root.querySelectorAll<HTMLOptionElement>('.hud-gear-select option')];
    expect(options.map((o) => o.value)).toContain('h1');
    expect(options.find((o) => o.value === 'h1')!.textContent).toContain('Common SMG');
    expect(invScrim.querySelector('.inv-combine-result')!.textContent).toMatch(
      /^Made: Lv 1 Common SMG/,
    );
  });

  it('mid-fight shows no Combine button; on the result screen it is back', () => {
    const { button, invButton, invScrim, combineButtons, close, title } = seeded();
    button().click();
    step(16);
    invButton.click();
    expect(combineButtons()).toHaveLength(0);
    close();
    endNextTick('won');
    step(32);
    expect(title()).toMatch(/Horde 4/);
    invButton.click();
    // The win's drop may be the strongest gun, selected first: pick an SMG of the set.
    invScrim.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:h1"]')!.click();
    expect(combineButtons()).toHaveLength(1);
  });
});

describe('the Roster in the game (app.ts, ID-086, ID-108, ID-146)', () => {
  /**
   * A camp at Horde 2 with survivor 1 at level 4 and survivor 2 fresh; `xp` 149 puts
   * survivor 1 one XP short of level 4, so a win levels them up (ID-134).
   */
  function seeded(armoury: ReturnType<typeof rollWeapon>[] = [], xp = 150) {
    const g = newGame('horde');
    const camp = {
      ...g,
      hordeNumber: 2,
      roster: [{ ...recruit(1), xp }, recruit(2)],
      camp: { ...g.camp, recruits: 2 },
      armoury,
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
    const rosterButton = booted.root.querySelector<HTMLButtonElement>('.roster-button')!;
    const key = (k: string) => scrim.querySelector<HTMLButtonElement>(`[data-key="${k}"]`)!;
    return { ...booted, scrim, rosterButton, key };
  }

  /** What no screen shows any more (ID-146): stat buttons, a points badge or count, Undo. */
  const NO_STAT_UI =
    '.hud-pick-stat, .squad-plus, .squad-points, .squad-undo, .squad-pick, .roster-dot, ' +
    '.rv-badge, .rv-sb, .rv-stat, [data-key="undo"], [data-key^="add:"]';

  it('the button has no points badge, and the start screen has no stat UI (ID-146)', () => {
    const { root, rosterButton, scrim } = seeded();
    expect(rosterButton.querySelector('.roster-dot')).toBeNull();
    expect(rosterButton.textContent).toBe('Roster');
    expect(root.querySelector(NO_STAT_UI)).toBeNull();
    rosterButton.click();
    expect(scrim.querySelector(NO_STAT_UI)).toBeNull();
    expect(root.textContent).not.toMatch(/stat point|points? left|Undo/);
  });

  it('the start screen’s cards and the Roster show each survivor’s level line (ID-146)', () => {
    const { root, scrim, rosterButton } = seeded();
    const cardLine = (id: string) =>
      root.querySelector(`.squad-card[data-defender="${id}"] .squad-card-bonus`)!.textContent;
    expect(cardLine('recruit-1')).toBe(levelText(4, true));
    expect(cardLine('recruit-2')).toBe(LEVEL_ONE_SHORT);
    rosterButton.click();
    expect(scrim.querySelector('.rv-level')!.textContent).toBe(levelText(4));
    scrim.querySelector<HTMLButtonElement>('.rv-tab[data-defender="recruit-2"]')!.click();
    expect(scrim.querySelector('.rv-level')!.textContent).toBe(LEVEL_ONE_TEXT);
  });

  it('a gun picked in the Roster is equipped and saved; Best gun for everyone hands out the stash', () => {
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const mil = rollWeapon(createRng(2), 'c1', 'smg', 'military');
    const { scrim, rosterButton, key, saved } = seeded([mil, relic]);
    rosterButton.click();
    key('slot').click();
    key('equip').click();
    expect(saved().roster[0]!.loadout.primary).toMatchObject({ uid: expect.any(String) });
    expect(scrim.querySelector('.rv-status')!.textContent).toContain('now holds');
    key('best').click();
    expect(scrim.querySelector('.rv-status')!.textContent).toMatch(/^Equipped: /);
    expect(saved().roster.map((d) => d.loadout.primary)).not.toContain('pistol');
    expect(saved().armoury).toEqual([]);
    key('best').click();
    expect(scrim.querySelector('.rv-status')!.textContent).toBe(
      'Everyone already holds the best gun they can get.',
    );
  });

  it('mid-fight the Roster holds the fight; guns stay locked and no stat UI shows', () => {
    const { scrim, rosterButton, button, key } = seeded();
    button().click();
    step(16);
    rosterButton.click();
    expect(key('slot').textContent).toContain(GUNS_WAIT);
    expect(key('best').disabled).toBe(true);
    expect(scrim.querySelector(NO_STAT_UI)).toBeNull();
    expect(scrim.textContent).not.toMatch(/Spend points|stat point|Undo/);
    expect(scrim.querySelector('.rv-level')!.textContent).toBe(levelText(4));
    const ticks = vi.mocked(tick).mock.calls.length;
    step(32);
    step(48);
    expect(vi.mocked(tick).mock.calls.length).toBe(ticks);
  });

  it('a survivor’s level bonus is fought with, and kept after the horde (ID-146)', () => {
    const { button, saved } = seeded();
    button().click();
    step(16);
    const fighter = () =>
      vi.mocked(drawScene).mock.lastCall![2].defenders.find((d) => d.id === 'recruit-1')!;
    const rookie = vi
      .mocked(drawScene)
      .mock.lastCall![2].defenders.find((d) => d.id === 'recruit-2')!;
    // Level 4 against level 1: more max HP, from the level alone.
    expect(fighter().maxHp).toBeGreaterThan(rookie.maxHp);
    expect(fighter().xp).toBe(150);
    endNextTick('lost');
    step(48);
    expect(saved().roster[0]!.xp).toBeGreaterThanOrEqual(150);
  });

  it('on the result screen a name opens the survivor, with no stat UI on the card or in the Roster', () => {
    // Survivor 1 levels up in the win, so the result screen has their card (ID-134).
    const { root, result, button, scrim, saved } = seeded([], 149);
    button().click();
    step(16);
    endNextTick('won');
    step(32);
    const name = [...result().querySelectorAll<HTMLButtonElement>('.squad-card-open')][0]!;
    expect(name.textContent).toBe(recruit(1).name);
    const card = root.querySelector<HTMLElement>(`.squad-card[data-defender="recruit-1"]`)!;
    expect(card.querySelector('.squad-card-bonus')!.textContent).toBe(levelText(4, true));
    expect(root.querySelector(NO_STAT_UI)).toBeNull();
    name.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelector('.rv-who-name')!.textContent).toBe(recruit(1).name);
    expect(scrim.querySelector('.rv-level')!.textContent).toBe(levelText(4));
    expect(scrim.querySelector(NO_STAT_UI)).toBeNull();
    scrim.querySelector<HTMLButtonElement>('.rv-close')!.click();
    expect(document.activeElement).toBe(name);
    // Nothing waits for the button: the win was saved as the fight ended.
    expect(saved().roster[0]!.xp).toBeGreaterThanOrEqual(150);
  });
});

describe('the Roster and the result screen together (app.ts, ID-086, ID-108)', () => {
  /**
   * A won Horde 2. `xp` 149 is one short of level 4: the win levels survivor 1 up, so they
   * have a card (ID-134); at 150 (level 4 already) the win doesn't, so no card.
   */
  function wonWithPoints(xp = 149) {
    const g = newGame('horde');
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const camp = {
      ...g,
      hordeNumber: 2,
      roster: [{ ...recruit(1), xp }, recruit(2)],
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
    const open = () => card().querySelector<HTMLButtonElement>('.squad-card-open')!.click();
    const close = () => scrim.querySelector<HTMLButtonElement>('.rv-close')!.click();
    return { ...booted, scrim, card, open, close };
  }

  it('a result card shows the level line and no stat block; the keyboard is on the button', () => {
    const { card, button } = wonWithPoints();
    expect(card().querySelector('.squad-card-bonus')!.textContent).toBe(levelText(4, true));
    expect(card().querySelector('.squad-plus, .squad-pick, .hud-pick-stat')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('Best gun on the result screen: the new guns are saved', () => {
    const { saved, scrim, open, close } = wonWithPoints();
    open();
    scrim.querySelector<HTMLButtonElement>('.rv-best')!.click();
    // The relic, and the gun the win dropped, both go to survivors holding the pistol (the
    // drop is rolled from the clock and may be the stronger, so either can come first).
    const status = scrim.querySelector('.rv-status')!.textContent!;
    expect(status).toMatch(/^Equipped: .+ → .+ · .+ → .+$/);
    expect(status).toContain(' → Relic Carbine');
    close();
    const after = saved();
    // The relic left the stash for a survivor's hands.
    expect(after.armoury.some((w) => w.uid === 'h1')).toBe(false);
    expect(
      after.roster.some(
        (d) => typeof d.loadout.primary === 'object' && d.loadout.primary.uid === 'h1',
      ),
    ).toBe(true);
  });

  it('follows the camp while open: a gun equipped on the result screen shows in the slot', () => {
    const { root, scrim } = wonWithPoints();
    root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    const slot = () => scrim.querySelector('[data-key="slot"]')!.textContent!;
    expect(slot()).toContain('Pistol');
    // The field is inert behind the dialog in a browser; jsdom lets the change through.
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    select.value = 'h1';
    select.dispatchEvent(new Event('change'));
    expect(slot()).toContain('Relic Carbine');
  });

  it('a survivor with no card on a win changes guns from the Roster (ID-134)', () => {
    const { root, saved, scrim, close } = wonWithPoints(150);
    expect(root.querySelector('.squad-card[data-defender="recruit-1"]')).toBeNull();
    const rosterButton = root.querySelector<HTMLButtonElement>('.roster-button')!;
    expect(rosterButton.hidden).toBe(false);
    rosterButton.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelector('.rv-level')!.textContent).toBe(levelText(4));
    scrim.querySelector<HTMLButtonElement>('.rv-best')!.click();
    close();
    expect(
      saved().roster.some(
        (d) => typeof d.loadout.primary === 'object' && d.loadout.primary.uid === 'h1',
      ),
    ).toBe(true);
  });

  it('an id the page was edited to (unknown, __proto__) opens the first survivor, nothing else', () => {
    const { card, scrim, open, close } = wonWithPoints();
    const name = card().querySelector<HTMLButtonElement>('.squad-card-open')!;
    for (const id of ['nobody', '__proto__', 'constructor']) {
      name.dataset.openSurvivor = id;
      open();
      expect(scrim.hidden).toBe(false);
      expect(scrim.querySelectorAll('.rv-tab')).toHaveLength(3);
      close();
    }
  });
});

describe('farming in the game (app.ts, ID-098)', () => {
  /** A saved game at Horde `n` with `recruits` survivors, booted onto its start screen. */
  function at(n: number, recruits = 2) {
    const g = newGame('horde');
    const saved = {
      ...g,
      hordeNumber: n,
      roster: Array.from({ length: recruits }, (_, i) => recruit(i + 1)),
      camp: { ...g.camp, recruits },
    };
    localStorage.setItem(SAVE_KEY, encodeSave(saved, NOW));
    const booted = boot();
    step(0);
    const select = () => booted.root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
    const pick = (horde: number) => {
      select().value = String(horde);
      select().dispatchEvent(new Event('change', { bubbles: true }));
    };
    const badge = () => booted.root.querySelector('.hud-badge-num')!.textContent;
    let t = 0;
    const frame = () => step((t += 16));
    return { ...booted, select, pick, badge, frame, start: saved };
  }

  it('the start screen opens on the next new horde with the picker; picking a beaten horde starts that one', () => {
    const { button, select, pick, badge, frame, title } = at(5);
    expect(select().value).toBe('5');
    expect([...select().options].map((o) => o.value)).toEqual(['5', '4', '3', '2', '1']);
    expect(button().textContent).toMatch(/^Start Horde 5/);
    pick(2);
    expect(title()).toContain('Horde 2');
    expect(button().textContent).toBe('Replay Horde 2');
    button().click();
    frame();
    frame();
    expect(badge()).toBe('2');
  });

  it('a replay win: saved as a replay, the same horde stays picked, nobody joins, the XP is kept', () => {
    const { button, select, pick, title, frame, saved, result, badge } = at(5);
    pick(3);
    button().click();
    frame();
    endNextTick('won');
    frame();
    expect(title()).toBe('Horde 3 held (replay)');
    expect(result().textContent).not.toContain('New survivor');
    // The next new horde has not moved; the roster has not grown; the XP is paid.
    expect(saved().hordeNumber).toBe(5);
    expect(saved().roster).toHaveLength(2);
    expect(saved().roster[0]!.xp).toBeGreaterThan(0);
    expect(select().value).toBe('3');
    expect(button().textContent).toBe('Replay Horde 3');
    // The picker's list is the saved game's: five hordes, the new one first.
    expect([...select().options].map((o) => o.value)).toEqual(['5', '4', '3', '2', '1']);
    expect(result().textContent).toContain('Replay');
    button().click();
    frame();
    frame();
    expect(badge()).toBe('3');
  });

  it('a first clear moves the pick to the next new horde, now in the list', () => {
    const { button, select, title, frame, saved, badge } = at(5);
    button().click();
    frame();
    endNextTick('won');
    frame();
    expect(title()).toBe('Horde 5 held');
    expect(saved().hordeNumber).toBe(6);
    expect(select().value).toBe('6');
    expect([...select().options].map((o) => o.value)).toEqual(['6', '5', '4', '3', '2', '1']);
    expect(button().textContent).toMatch(/^Start Horde 6/);
    button().click();
    frame();
    frame();
    expect(badge()).toBe('6');
  });

  it('a loss retries the same horde, or any easier one picked instead', () => {
    const { button, select, pick, frame, badge, saved } = at(4);
    button().click();
    frame();
    endNextTick('lost');
    frame();
    expect(select().value).toBe('4');
    expect(button().textContent).toMatch(/^Retry Horde 4/);
    pick(1);
    expect(button().textContent).toBe('Replay Horde 1');
    button().click();
    frame();
    frame();
    expect(badge()).toBe('1');
    expect(saved().hordeNumber).toBe(4);
  });

  it('the fight’s corner shows Squad Power against the horde’s Recommended Power', () => {
    const { button, pick, frame, root, start } = at(5);
    pick(3);
    button().click();
    frame();
    frame();
    const label = root.querySelector('.hud-power-label')!.textContent;
    const power = squadPower(start);
    expect(label).toBe(
      `Power ${power.toLocaleString('en-US')} · rec ${recommendedPower(3).toLocaleString('en-US')}`,
    );
    expect(root.querySelector<HTMLElement>('.hud-power')!.hidden).toBe(false);
    expect(root.querySelector('.hud-xp-label')!.textContent).toMatch(/^Lv 1 · 0\/\d+$/);
  });

  it('the Inventory’s Squad Power line follows the horde picked', () => {
    const { pick, root } = at(8);
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const line = () => document.querySelector('.inv-power-line')!.textContent;
    expect(line()).toContain(`rec ${recommendedPower(8).toLocaleString('en-US')}`);
    document.querySelector<HTMLButtonElement>('.inv-done, .inv-close')?.click();
    pick(2);
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    expect(line()).toContain(`rec ${recommendedPower(2).toLocaleString('en-US')}`);
  });

  it('on a loss screen the Inventory’s line follows a new pick, not the horde lost', () => {
    const { button, pick, frame, root } = at(8);
    button().click();
    frame();
    endNextTick('lost');
    frame();
    pick(3);
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const line = document.querySelector('.inv-power-line')!.textContent;
    expect(line).toContain(`rec ${recommendedPower(3).toLocaleString('en-US')}`);
  });
});

describe('skills in the horde-only build, through the app (ID-100)', () => {
  const options = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLButtonElement>('.hud-result .hud-skill-option'),
  ];
  const option = (root: HTMLElement, skill: string) =>
    options(root).find((b) => b.dataset.skill === skill)!;
  const pressed = (root: HTMLElement) =>
    options(root)
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.dataset.skill);
  const shown = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLButtonElement>('.hud-skill:not([hidden])'),
  ];
  const labels = (root: HTMLElement) =>
    shown(root).map((b) => b.querySelector('.hud-shop-label')!.textContent);
  const key = (k: string, code = `Key${k.toUpperCase()}`) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
  /** A click (or tap) on the field at `(x, y)`, where the last frame's camera shows it. */
  const clickField = (root: HTMLElement, x: number, y: number) => {
    const canvas = root.querySelector('canvas')!;
    canvas.setPointerCapture = () => {};
    const at = project({ x, y }, vi.mocked(drawScene).mock.lastCall![3]);
    for (const type of ['pointerdown', 'pointerup']) {
      const e = new PointerEvent(type, { isPrimary: true, button: 0 });
      Object.defineProperties(e, { offsetX: { value: at.sx }, offsetY: { value: at.sy } });
      canvas.dispatchEvent(e);
    }
  };

  it('a new game starts with the Airstrike picked; a toggle is saved at once (ID-139)', () => {
    const { root, saved } = boot();
    step(0);
    expect(options(root).map((b) => b.dataset.skill)).toEqual(['airstrike']);
    expect(pressed(root)).toEqual(['airstrike']);
    expect(option(root, 'airstrike').disabled).toBe(false);
    // One skill to pick: the header asks for no second one.
    expect(root.querySelector('#hud-skill-label')!.textContent).toBe('Skill');
    expect(root.querySelector('.hud-skill-note')!.textContent).toBe(
      '×2 power: your only skill, so it hits twice as hard',
    );
    expect(option(root, 'airstrike').querySelector('.hud-skill-option-boost')!.textContent).toBe(
      '×2: hits twice as hard',
    );
    option(root, 'airstrike').click();
    expect(saved().skillPick).toEqual([]);
    expect(pressed(root)).toEqual([]);
    expect(root.querySelector('.hud-skill-note')!.textContent).toBe(
      'No skill picked. Airstrike hits ×2 as your only skill',
    );
    option(root, 'airstrike').click();
    expect(saved().skillPick).toEqual(['airstrike']);
    // The skill row waits under the screen, and its keys do nothing there.
    expect(root.querySelector<HTMLElement>('.hud-shop')!.hidden).toBe(true);
    key('q');
    expect(saved().skillPick).toEqual(['airstrike']);
  });

  it('the fight shows the picked skill, free, on Q, whatever the layout (ID-139)', () => {
    const { root, button } = boot();
    step(0);
    button().click();
    step(16);
    expect(shown(root).map((b) => b.querySelector('.hud-skill-key')!.textContent)).toEqual(['Q']);
    expect(labels(root)).toEqual(['Airstrike ×2']);
    expect(shown(root).map((b) => b.querySelector('.btn-cost')!.textContent)).toEqual(['']);
    // Q on a layout that types another letter there still arms it (ID-107),
    // and a click on the field drops it there.
    key('ц', 'KeyQ');
    step(32);
    expect(shown(root)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(labels(root)).toEqual(['Airstrike ×2']);
    clickField(root, 1000, 400);
    step(48);
    expect(labels(root)).toEqual([`Airstrike ×2 ${SKILLS.airstrike.cooldown}s`]);
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming.map((i) => i.skill)).toEqual(
      Array(SKILLS.airstrike.count).fill('airstrike'),
    );
    // W holds no skill now, and neither does a key no skill holds.
    key('w');
    key('e');
    expect(root.querySelector(HIDDEN)).toBeNull();
  });

  it('the Airstrike arms with a caption, the area shows at the pointer, Esc or a second press cancels (ID-107, ID-139)', () => {
    const { root, button } = boot();
    step(0);
    button().click();
    step(16);
    const caption = root.querySelector<HTMLElement>('.hud-aim-caption')!;
    const [flash] = shown(root);
    expect(caption.hidden).toBe(true);
    flash!.click();
    step(32);
    expect(flash!.getAttribute('aria-pressed')).toBe('true');
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe(AIM_PROMPT.airstrike);
    // Nothing is thrown on the press.
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming).toEqual([]);
    // A second press puts it away.
    flash!.click();
    step(48);
    expect(flash!.getAttribute('aria-pressed')).toBe('false');
    expect(caption.hidden).toBe(true);
    // Esc puts it away too.
    flash!.click();
    step(64);
    expect(caption.textContent).toBe(AIM_PROMPT.airstrike);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    step(80);
    expect(flash!.getAttribute('aria-pressed')).toBe('false');
    expect(caption.hidden).toBe(true);
    // Armed, the hovered spot is the aim drawn; a click drops every bomb into the area.
    key('q');
    step(96);
    const canvas = root.querySelector('canvas')!;
    const cam = vi.mocked(drawScene).mock.lastCall![3];
    const at = project({ x: 1100, y: 300 }, cam);
    const move = new PointerEvent('pointermove', { isPrimary: true });
    Object.defineProperties(move, { offsetX: { value: at.sx }, offsetY: { value: at.sy } });
    canvas.dispatchEvent(move);
    step(112);
    const aim = vi.mocked(drawScene).mock.lastCall![7]!;
    expect(aim.skill).toBe('airstrike');
    expect(aim.x).toBeCloseTo(1100, 6);
    expect(aim.y).toBeCloseTo(300, 6);
    clickField(root, 1100, 300);
    step(128);
    const thrown = vi.mocked(drawScene).mock.lastCall![2].incoming;
    expect(thrown).toHaveLength(SKILLS.airstrike.count);
    for (const i of thrown) {
      expect(Math.hypot(i.x - 1100, i.y - 300)).toBeLessThanOrEqual(SKILLS.airstrike.area + 1e-6);
    }
    expect(flash!.getAttribute('aria-pressed')).toBe('false');
    expect(caption.hidden).toBe(true);
  });

  it('on touch, an armed skill shows its area under the finger and throws where a drag lets go (ID-107)', () => {
    const { root, button } = boot();
    step(0);
    button().click();
    step(16);
    const canvas = root.querySelector('canvas')!;
    canvas.setPointerCapture = () => {};
    const cam = () => vi.mocked(drawScene).mock.lastCall![3];
    const touch = (type: string, x: number, y: number, client: number) => {
      const at = project({ x, y }, cam());
      const e = new PointerEvent(type, {
        isPrimary: true,
        button: 0,
        pointerType: 'touch',
        clientX: client,
        clientY: client,
      });
      Object.defineProperties(e, { offsetX: { value: at.sx }, offsetY: { value: at.sy } });
      canvas.dispatchEvent(e);
    };
    key('q');
    step(32);
    // The press shows the area under the finger at once, before any move.
    touch('pointerdown', 1000, 300, 100);
    step(48);
    const aim = vi.mocked(drawScene).mock.lastCall![7]!;
    expect([aim.skill, Math.round(aim.x), Math.round(aim.y)]).toEqual(['airstrike', 1000, 300]);
    // A drag well past the click slop, then the finger lifts: thrown where it let go.
    touch('pointermove', 1200, 450, 160);
    touch('pointerup', 1200, 450, 160);
    step(64);
    const thrown = vi.mocked(drawScene).mock.lastCall![2].incoming;
    expect(thrown).toHaveLength(SKILLS.airstrike.count);
    for (const i of thrown) {
      expect(Math.hypot(i.x - 1200, i.y - 450)).toBeLessThanOrEqual(SKILLS.airstrike.area + 1e-6);
    }
    expect(shown(root)[0]!.getAttribute('aria-pressed')).toBe('false');
  });

  it('a drag with nothing armed throws nothing; a cancelled press keeps the skill armed (ID-107)', () => {
    const { root, button } = boot();
    step(0);
    button().click();
    step(16);
    const canvas = root.querySelector('canvas')!;
    canvas.setPointerCapture = () => {};
    key('q');
    step(32);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { isPrimary: true, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointercancel', { isPrimary: true }));
    step(48);
    expect(shown(root)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming).toEqual([]);
    // A drag let go off the field's far edge keeps it armed too: nothing thrown.
    const cam = vi.mocked(drawScene).mock.lastCall![3];
    const press = (type: string, x: number, client: number) => {
      const at = project({ x, y: 300 }, cam);
      const e = new PointerEvent(type, { isPrimary: true, button: 0, clientX: client });
      Object.defineProperties(e, { offsetX: { value: at.sx }, offsetY: { value: at.sy } });
      canvas.dispatchEvent(e);
    };
    press('pointerdown', 1400, 0);
    press('pointermove', FIELD.right + 300, 200);
    press('pointerup', FIELD.right + 300, 200);
    step(64);
    expect(shown(root)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming).toEqual([]);
  });

  it('the pick is pre-selected after a horde, and after a reload; a dropped skill stays dropped', () => {
    const { root, button, saved } = boot();
    step(0);
    button().click();
    step(16);
    endNextTick('lost');
    step(32);
    expect(pressed(root)).toEqual(['airstrike']);
    expect(saved().skillPick).toEqual(['airstrike']);
    const again = boot();
    step(0);
    expect(pressed(again.root)).toEqual(['airstrike']);
    // Dropped before a horde, it is still dropped after it and after a reload.
    option(again.root, 'airstrike').click();
    again.button().click();
    step(16);
    endNextTick('lost');
    step(32);
    expect(pressed(again.root)).toEqual([]);
    expect(saved().skillPick).toEqual([]);
    const third = boot();
    step(0);
    expect(pressed(third.root)).toEqual([]);
  });
});

describe('the intro in the game (app.ts, ID-106)', () => {
  function launch() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    start(root, art);
    const intro = () => document.querySelector<HTMLElement>('.intro-scrim')!;
    const shown = (scope: ParentNode, label: string) =>
      [...scope.querySelectorAll('button')].find(
        (b) => b.textContent === label && !b.hidden && !b.closest('[hidden]'),
      );
    const menuScrim = () => document.querySelector<HTMLElement>('.menu-scrim')!;
    const esc = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { root, intro, shown, menuScrim, esc };
  }

  it('covers the start screen at launch; Esc does not open the Menu behind it', () => {
    const { root, intro, menuScrim, esc } = launch();
    step(0);
    expect(intro().hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    esc();
    expect(menuScrim().hidden).toBe(true);
  });

  it('first launch: New game saves at once, then the card once; the next launch continues', () => {
    const first = launch();
    expect(first.shown(first.intro(), 'Continue')).toBeUndefined();
    first.shown(first.intro(), 'New game')!.click();
    expect(decodeSave(localStorage.getItem(SAVE_KEY))!.game.hordeNumber).toBe(1);
    expect(first.shown(first.intro(), 'Got it')).toBeDefined();
    first.shown(first.intro(), 'Got it')!.click();
    expect(first.intro().hidden).toBe(true);
    expect(first.root.hasAttribute('inert')).toBe(false);
    const again = launch();
    again.shown(again.intro(), 'Continue')!.click();
    expect(again.intro().hidden).toBe(true);
  });

  it('the title art fills the intro behind its pages', () => {
    const { intro } = launch();
    const art = intro().querySelector<HTMLImageElement>('img.intro-art')!;
    expect(art).not.toBeNull();
    expect(art.alt).toBe('');
    expect(intro().querySelector('.intro-shade')).not.toBeNull();
  });

  it('with a save: Continue keeps it; New game asks, then starts over from Horde 1', () => {
    localStorage.setItem(SAVE_KEY, encodeSave({ ...newGame('horde'), hordeNumber: 4 }, NOW));
    const kept = launch();
    kept.shown(kept.intro(), 'Continue')!.click();
    expect(decodeSave(localStorage.getItem(SAVE_KEY))!.game.hordeNumber).toBe(4);
    const fresh = launch();
    fresh.shown(fresh.intro(), 'New game')!.click();
    expect(decodeSave(localStorage.getItem(SAVE_KEY))!.game.hordeNumber).toBe(4);
    fresh.shown(fresh.intro(), 'Start new game')!.click();
    expect(fresh.intro().hidden).toBe(true);
    expect(decodeSave(localStorage.getItem(SAVE_KEY))!.game.hordeNumber).toBe(1);
    step(0);
    expect(fresh.root.querySelector('.hud-result-title')!.textContent).toBe('Horde 1');
  });

  it('Mute on the intro is stored and the Menu shows it; the Menu reopens the card', () => {
    const { root, intro, shown, menuScrim } = launch();
    intro().querySelector<HTMLInputElement>('#intro-mute')!.click();
    expect(localStorage.getItem(MUTE_KEY)).toBe('1');
    skipIntro();
    expect(document.querySelector<HTMLInputElement>('#menu-mute')!.checked).toBe(true);
    root.querySelector<HTMLButtonElement>('.menu-button')!.click();
    menuScrim().querySelector<HTMLButtonElement>('#menu-tab-help')!.click();
    shown(menuScrim(), 'Show the how-to-play card')!.click();
    expect(menuScrim().hidden).toBe(true);
    expect(intro().hidden).toBe(false);
    expect(shown(intro(), 'Got it')).toBeDefined();
    shown(intro(), 'Got it')!.click();
    expect(intro().hidden).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('.menu-button'));
  });
});

describe('the intro and an unreadable save (app.ts, ID-106)', () => {
  it('no Continue, no confirm; the rejected note shows once the intro is gone', () => {
    localStorage.setItem(SAVE_KEY, 'not a save');
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    start(root, art);
    const intro = document.querySelector<HTMLElement>('.intro-scrim')!;
    expect(intro.querySelector('.btn-primary')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.hud-toast')?.textContent ?? '').not.toContain(
      SAVE_STATUS.rejected.text,
    );
    skipIntro();
    expect(intro.hidden).toBe(true);
    expect(root.querySelector('.hud-toast')!.textContent).toBe(SAVE_STATUS.rejected.text);
    // New game saved the fresh camp, and the Save tab still says the old one was set aside.
    expect(decodeSave(localStorage.getItem(SAVE_KEY))!.game.hordeNumber).toBe(1);
    root.querySelector<HTMLButtonElement>('.menu-button')!.click();
    expect(document.querySelector('.menu-status')!.textContent).toBe(SAVE_STATUS.rejected.text);
  });
});

describe('the Mute switch is silent when it mutes (app.ts, ID-106)', () => {
  it('no click sound switching Mute on; one switching it off', () => {
    const play = vi.spyOn(SoundEngine.prototype, 'play');
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    start(root, art);
    const mute = document.querySelector<HTMLInputElement>('#intro-mute')!;
    mute.click();
    expect(mute.checked).toBe(true);
    expect(play).not.toHaveBeenCalledWith('click');
    mute.click();
    expect(play).toHaveBeenCalledWith('click');
  });
});
