// @vitest-environment jsdom
// ID-066 through the real wiring (app.ts) with the horde-only flag on: a start screen,
// then fight → result → next horde. A win saves the XP and the new survivor; a loss
// replays the same horde. The build panel and all it opens (world map, patrols,
// research, workbench, camp, perks) are never on the page. Canvas and art are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FARM, FIELD, HORDE_ONLY, SKILLS, STASH_CAP } from '../core/data.ts';
import { rollWeapon, statsOf, type OwnedWeapon } from '../core/armoury.ts';
import { rollOffer } from '../core/cards.ts';
import { recruit } from '../core/camp.ts';
import { joiners } from '../core/hordeonly.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { levelOf, xpForLevel } from '../core/stats.ts';
import { noJoinText } from './joining.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import { tick, type HordeState } from '../core/horde.ts';
import { enemy } from '../core/testing.ts';
import { decodeSave, encodeSave, SAVE_KEY } from '../storage/save.ts';
import { MUTE_KEY } from '../storage/settings.ts';
import { NOW } from '../storage/testing.ts';
import { SoundEngine } from './audio.ts';
import { FIGHT_REFUSAL, SAVE_STATUS } from './menu.ts';
import { LEVEL_ONE_TEXT } from './statlines.ts';
import { start } from './app.ts';
import { ASK_CHANGED } from './confirm.ts';
import { answerConfirm, confirmPanel, confirmQuestion, flush, skipIntro } from './testing.ts';
import { AIM_HELD_PROMPT, AIM_PROMPT, BEST_GUNS, BEST_GUNS_NONE, blueprintLine } from './hud.ts';
import { BLUEPRINT_GUNS, rollBlueprint } from '../core/craft.ts';
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
  const button = () => result().querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!;
  // The corner as read: its tooltip (the horde) and its live wave line (ID-167).
  const bar = () =>
    `${root.querySelector<HTMLElement>('.hud-corner')!.title} · ${root.querySelector('.hud-corner-wave')!.textContent}`;
  const saved = () => decodeSave(localStorage.getItem(SAVE_KEY))!.game;
  return { root, result, title, button, bar, saved };
}

/** Presses Accept for the first survivor asking to join (ID-150). */
function accept(root: ParentNode): void {
  const b = [...root.querySelectorAll<HTMLButtonElement>('.join-btn')].find(
    (x) => x.getAttribute('aria-label')?.startsWith('Accept ') === true,
  );
  if (!b) throw new Error('nobody is asking to join');
  b.click();
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
    expect(bar()).toMatch(/^Horde 1 · Wave 1\//);
    endNextTick('won');
    step(48);
    expect(result().hidden).toBe(false);
    expect(title()).toBe('Horde 1 - You hold the line');
    expect(button().textContent).toBe('Start Horde 2');
    // Saved as the fight ends: a reload here keeps the win.
    expect(saved().hordeNumber).toBe(2);
    // The new survivor asks to join (ID-150): accepted, they fight the next horde.
    expect(saved().joining).toHaveLength(1);
    accept(root);
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
    expect(title()).toBe('Horde 1 - You hold the line');
  });

  it('a loss shows its result at once (ID-110)', () => {
    const { result, title, button } = boot();
    step(0);
    button().click();
    step(16);
    endNextTick('lost');
    step(32);
    expect(result().hidden).toBe(false);
    expect(title()).not.toBe('Horde 1 - You hold the line');
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
    expect(title()).toBe('Horde 4 - Camp has fallen');
    expect(button().textContent).toBe('Retry Horde 4');
    button().click();
    expect(saved().hordeNumber).toBe(4);
    expect(saved().roster).toEqual(newGame('horde').roster);
    step(48);
    expect(bar()).toMatch(/^Horde 4 · Wave 1\//);
  });

  describe('the Menu’s Load and New camp between hordes (ID-156)', () => {
    /** The Menu's Save tab: Load code and New camp, and the reasons showing. */
    function saveTab(root: ParentNode) {
      const dialog = document.querySelector<HTMLElement>('.menu-scrim')!;
      const open = () => {
        root.querySelector<HTMLButtonElement>('.menu-button')!.click();
        dialog.querySelector<HTMLButtonElement>('#menu-tab-save')!.click();
      };
      const byText = (label: string) =>
        [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent === label,
        )!;
      const reasons = () =>
        [...dialog.querySelectorAll<HTMLElement>('.build-option-reason')].filter((r) => !r.hidden);
      const close = () => byText('Close').click();
      return { open, byText, reasons, close };
    }

    it('on the start screen they work; in a fight they are off with the reason', () => {
      const { root, button } = boot();
      step(0);
      const menu = saveTab(root);
      menu.open();
      expect(menu.byText('Load code').disabled).toBe(false);
      expect(menu.byText('New camp').disabled).toBe(false);
      expect(menu.reasons()).toEqual([]);
      menu.close();
      button().click();
      step(16);
      menu.open();
      expect(menu.byText('Load code').disabled).toBe(true);
      expect(menu.byText('New camp').disabled).toBe(true);
      expect(menu.reasons().map((r) => r.textContent)).toEqual([FIGHT_REFUSAL, FIGHT_REFUSAL]);
    });

    it('open while a win’s last kill dies: locked, then unlocked as the result shows', () => {
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
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
      const { root, result, button } = boot();
      step(0);
      button().click();
      step(16);
      const real = vi.mocked(tick).getMockImplementation()!;
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
      const menu = saveTab(root);
      menu.open();
      expect(menu.byText('Load code').disabled).toBe(true);
      expect(menu.byText('New camp').disabled).toBe(true);
      clock.mockReturnValue(NOW + 1000);
      step(64);
      expect(result().hidden).toBe(false);
      // Unlocked in the open Menu, with no reopen.
      expect(menu.byText('Load code').disabled).toBe(false);
      expect(menu.byText('New camp').disabled).toBe(false);
      expect(menu.reasons()).toEqual([]);
    });

    it.each(['won', 'lost'] as const)(
      'on the result screen of a horde %s they work; New camp starts over at Horde 1',
      (outcome) => {
        localStorage.setItem(SAVE_KEY, encodeSave({ ...newGame('horde'), hordeNumber: 3 }, NOW));
        const { root, title, button, bar, saved } = boot();
        step(0);
        button().click();
        step(16);
        endNextTick(outcome);
        step(32);
        expect(title()).not.toBe('Horde 3');
        const menu = saveTab(root);
        menu.open();
        expect(menu.byText('Load code').disabled).toBe(false);
        expect(menu.byText('New camp').disabled).toBe(false);
        expect(menu.reasons()).toEqual([]);
        menu.byText('New camp').click();
        menu.byText('Start new camp').click();
        expect(saved().hordeNumber).toBe(1);
        // The old camp's result screen is gone: the new camp's start screen is up.
        expect(title()).toBe('Horde 1');
        expect(button().textContent).toBe('Start Horde 1');
        menu.close();
        button().click();
        step(48);
        expect(bar()).toMatch(/^Horde 1 · Wave 1\//);
      },
    );
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
    const invScrim = document.querySelector<HTMLElement>('.camp-scrim')!;
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
    const { invButton, invScrim } = seeded();
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
    // Equip from the dialog itself: the squad's slot and the stash count follow it.
    invScrim.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:h1"]')!.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-equip-on')!.click();
    expect(heading()).toBe(`Stash 0/${STASH_CAP}`);
    expect(squadGun()).toBe('Relic Carbine');
  });

  it('Best gun for everyone in the Inventory hands out the stash, saved; greyed in a fight', () => {
    const { button, invButton, invScrim, saved } = seeded();
    invButton.click();
    const best = invScrim.querySelector<HTMLButtonElement>('.inv-best')!;
    const status = () => invScrim.querySelector('.inv-status')!.textContent;
    expect(best.textContent).toBe(BEST_GUNS);
    expect(best.disabled).toBe(false);
    best.click();
    expect(status()).toBe(`Equipped: ${recruit(1).name} → Relic Carbine`);
    expect(saved().armoury).toEqual([]);
    expect(saved().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
    best.click();
    expect(status()).toBe(BEST_GUNS_NONE);
    invScrim.querySelector<HTMLButtonElement>('.menu-close')!.click();
    button().click();
    step(16);
    invButton.click();
    expect(best.disabled).toBe(true);
    expect(best.title).toBe(GUNS_WAIT);
  });

  it('equips from the Inventory (ID-095): saved at once, and unequip puts it back', () => {
    const { invButton, invScrim, saved } = seeded();
    invButton.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:h1"]')!.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-equip-on')!.click();
    expect(saved().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
    expect(saved().armoury).toHaveLength(0);
    expect(invScrim.querySelector('.inv-status')!.textContent).toMatch(/now holds Relic Carbine$/);
    // And back: Unequip puts it in the stash.
    invScrim.querySelector<HTMLButtonElement>('.inv-unequip')!.click();
    expect(saved().roster[0]!.loadout.primary).toBe('pistol');
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
    const invScrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const combineButtons = () => invScrim.querySelectorAll('.inv-combine-button');
    const close = () => invScrim.querySelector<HTMLButtonElement>('.camp-done')!.click();
    return { ...booted, invButton, invScrim, combineButtons, close };
  }

  it('on the start screen combines and saves the new gun', () => {
    const { invButton, invScrim, saved } = seeded();
    invButton.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    invScrim.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(saved().armoury.map((w) => [w.uid, w.rarity, w.base])).toEqual([
      ['h1', 'common', 'smg'],
    ]);
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
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
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

  it('the start screen’s cards read each survivor’s level aloud; the Roster shows the level line (ID-146, ID-196)', () => {
    const { root, scrim, rosterButton } = seeded();
    const cardLabel = (id: string) =>
      root
        .querySelector(`.squad-card[data-defender="${id}"] .squad-card-open`)!
        .getAttribute('aria-label');
    expect(cardLabel('recruit-1')).toMatch(/, level 4: open survivor card$/);
    expect(cardLabel('recruit-2')).toMatch(/, level 1: open survivor card$/);
    expect(root.querySelector('.squad-card-bonus')).toBeNull();
    rosterButton.click();
    expect(scrim.querySelector('.rv-who-level')!.textContent).toMatch(/^Level 4 · /);
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
    expect(scrim.querySelector('.rv-who-level')!.textContent).toMatch(/^Level 4 · /);
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
    expect(name.getAttribute('aria-label')).toBe(`${recruit(1).name}, level 4: open survivor card`);
    expect(card.querySelector('.squad-card-bonus')).toBeNull();
    expect(root.querySelector(NO_STAT_UI)).toBeNull();
    name.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelector('.rv-who-name')!.textContent).toBe(recruit(1).name);
    expect(scrim.querySelector('.rv-who-level')!.textContent).toMatch(/^Level 4 · /);
    expect(scrim.querySelector(NO_STAT_UI)).toBeNull();
    scrim.querySelector<HTMLButtonElement>('.camp-close')!.click();
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
  /** The clock while `wonWithPoints` fights its horde. */
  const PINNED = 1_700_000_000_000;

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
    // The clock is the app's only input from outside (the fight's seed, how long things
    // took): pinned while the fight is fought, so every run wins the same fight with the
    // same drops, whatever the machine's time or speed.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(PINNED);
    let booted: ReturnType<typeof boot>;
    try {
      booted = boot();
      step(0);
      booted.button().click();
      step(16);
      endNextTick('won');
      step(32);
      // The newcomer joins (ID-150), so the Roster has all three.
      accept(booted.root);
    } finally {
      clock.mockRestore();
    }
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const card = () =>
      booted.root.querySelector<HTMLElement>('.squad-card[data-defender="recruit-1"]')!;
    const open = () => card().querySelector<HTMLButtonElement>('.squad-card-open')!.click();
    const close = () => scrim.querySelector<HTMLButtonElement>('.camp-close')!.click();
    return { ...booted, scrim, card, open, close };
  }

  it('a result card has no level line and no stat block; the keyboard is on the button', () => {
    const { card, button } = wonWithPoints();
    expect(card().querySelector('.squad-card-open')!.getAttribute('aria-label')).toMatch(
      /, level 4: open survivor card$/,
    );
    expect(card().querySelector('.squad-card-bonus')).toBeNull();
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

  it('a survivor with no card on a win changes guns from the Roster (ID-134)', () => {
    const { root, saved, scrim, close } = wonWithPoints(150);
    expect(root.querySelector('.squad-card[data-defender="recruit-1"]')).toBeNull();
    const rosterButton = root.querySelector<HTMLButtonElement>('.roster-button')!;
    expect(rosterButton.hidden).toBe(false);
    rosterButton.click();
    expect(scrim.hidden).toBe(false);
    expect(scrim.querySelector('.rv-who-level')!.textContent).toMatch(/^Level 4 · /);
    scrim.querySelector<HTMLButtonElement>('.rv-best')!.click();
    close();
    expect(
      saved().roster.some(
        (d) => typeof d.loadout.primary === 'object' && d.loadout.primary.uid === 'h1',
      ),
    ).toBe(true);
  });

  it('Best gun for everyone beside the result screen’s Squad heading: equipped, saved, said', () => {
    const { root, saved } = wonWithPoints();
    const best = root.querySelector<HTMLButtonElement>('.debrief-squad-head .debrief-best-guns')!;
    expect(best.textContent).toBe(BEST_GUNS);
    best.click();
    const toast = () => root.querySelector('.hud-toast')!.textContent!;
    expect(toast()).toMatch(/^Equipped: .+ → .+$/);
    expect(toast()).toContain(' → Relic Carbine');
    expect(saved().armoury.some((w) => w.uid === 'h1')).toBe(false);
    expect(
      saved().roster.some(
        (d) => typeof d.loadout.primary === 'object' && d.loadout.primary.uid === 'h1',
      ),
    ).toBe(true);
    // The card has no gun picker: guns change in the Roster (ID-196).
    expect(root.querySelector('.squad-card select')).toBeNull();
    root.querySelector<HTMLButtonElement>('.debrief-best-guns')!.click();
    expect(toast()).toBe(BEST_GUNS_NONE);
  });

  it('Best gun for everyone reaches a survivor with no card on the win (ID-134)', () => {
    const { root, saved } = wonWithPoints(150);
    expect(root.querySelector('.squad-card[data-defender="recruit-1"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('.debrief-squad-head .debrief-best-guns')!.click();
    expect(saved().armoury.some((w) => w.uid === 'h1')).toBe(false);
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
    // The horde's seed is the clock's. A replay win brings a survivor 1 in 20 (ID-170),
    // and the result's button then asks before leaving: a fixed seed with nobody keeps these
    // tests from depending on the time of day.
    let seed = 1;
    while (joiners(saved, seed, true).length > 0) seed++;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
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
    expect(title()).toBe('Horde 3 - You hold the line (replay)');
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
    expect(title()).toBe('Horde 5 - You hold the line');
    expect(saved().hordeNumber).toBe(6);
    accept(document.body);
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
    expect(root.querySelector('#hud-skill-label')!.textContent).toBe('Skills');
    // The only skill, picked: no note at all (ID-185).
    expect(root.querySelector<HTMLElement>('.hud-skill-note')!.hidden).toBe(true);
    // No ×2 claim on the card (ID-174).
    expect(option(root, 'airstrike').textContent).not.toMatch(/×|twice/);
    option(root, 'airstrike').click();
    expect(saved().skillPick).toEqual([]);
    expect(pressed(root)).toEqual([]);
    expect(root.querySelector('.hud-skill-note')!.textContent).toBe('No skill picked');
    expect(root.querySelector<HTMLElement>('.hud-skill-note')!.hidden).toBe(false);
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
    expect(labels(root)).toEqual(['Airstrike']);
    expect(shown(root).map((b) => b.querySelector('.btn-cost')!.textContent)).toEqual(['']);
    // Q on a layout that types another letter there still arms it (ID-107),
    // and a click on the field drops it there.
    key('ц', 'KeyQ');
    step(32);
    expect(shown(root)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(labels(root)).toEqual(['Airstrike']);
    clickField(root, 1000, 400);
    step(48);
    expect(labels(root)).toEqual([`Airstrike ${SKILLS.airstrike.cooldown}s`]);
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming.map((i) => i.skill)).toEqual(
      Array(SKILLS.airstrike.count).fill('airstrike'),
    );
    // W holds no skill now, and neither does a key no skill holds.
    key('w');
    key('e');
    expect(root.querySelector(HIDDEN)).toBeNull();
  });

  it('an armed Airstrike stays armed when a card offer opens and is picked (ID-159)', () => {
    const { root, button } = boot();
    step(0);
    button().click();
    step(16);
    const [flash] = shown(root);
    flash!.click();
    step(32);
    const caption = root.querySelector<HTMLElement>('.hud-aim-caption')!;
    expect(caption.hidden).toBe(false);
    // A level-up offer opens on the next fight frame.
    const real = vi.mocked(tick).getMockImplementation()!;
    vi.mocked(tick).mockImplementationOnce((s, dt) => {
      const next = real(s, dt);
      return { ...next, offer: rollOffer(createRng(1), next) };
    });
    step(48);
    expect(root.querySelector<HTMLElement>('.hud-cards')!.hidden).toBe(false);
    // The offer only holds skills, it does not put the armed one away; the caption says
    // what comes next.
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe(AIM_HELD_PROMPT);
    // A click on the field before the pick throws nothing and keeps it armed.
    clickField(root, 1100, 300);
    step(56);
    expect(root.querySelector('.hud-toast')!.textContent).toBe('Pick first');
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming).toHaveLength(0);
    expect(caption.hidden).toBe(false);
    // Nor does the skill's key put it away while the offer is up.
    key('q');
    step(60);
    expect(caption.hidden).toBe(false);
    key('1');
    step(64);
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe(AIM_PROMPT.airstrike);
    expect(flash!.getAttribute('aria-pressed')).toBe('true');
    // Still armed, so the click throws the strike.
    clickField(root, 1100, 300);
    step(80);
    expect(vi.mocked(drawScene).mock.lastCall![2].incoming).toHaveLength(SKILLS.airstrike.count);
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

describe('joining the camp in the game (app.ts, ID-150)', () => {
  /** A saved camp of `n` (6 in the squad, the rest benched), the bench's first holding a gun. */
  function campOf(n: number, extra: Partial<GameState> = {}) {
    const g = newGame('horde');
    const all = Array.from({ length: n }, (_, i) => recruit(i + 1));
    const gun = rollWeapon(createRng(3), 'h1', 'rifle', 'military', 1);
    if (all[6]) all[6] = { ...all[6], loadout: { primary: gun, secondary: null, item: null } };
    return {
      ...g,
      hordeNumber: 2,
      roster: all.slice(0, 6),
      reserve: all.slice(6),
      camp: { ...g.camp, recruits: n },
      ...extra,
    };
  }

  /** Wins Horde 1 from a new game: the result screen up with one survivor asking to join. */
  function wonFirst() {
    const booted = boot();
    step(0);
    booted.button().click();
    step(16);
    endNextTick('won');
    step(32);
    const join = () => booted.root.querySelector<HTMLElement>('.debrief-join')!;
    const press = (label: 'Accept' | 'Refuse') =>
      [...join().querySelectorAll<HTMLButtonElement>('.join-btn')]
        .find((b) => b.getAttribute('aria-label')?.startsWith(`${label} `))!
        .click();
    const toast = () => booted.root.querySelector('.hud-toast')!.textContent;
    return { ...booted, join, press, toast };
  }

  it('the result screen shows the newcomer with Accept and Refuse; Accept saves them in the squad', () => {
    const { join, press, saved, toast } = wonFirst();
    const asking = saved().joining![0]!;
    expect(join().hidden).toBe(false);
    expect(join().querySelector('.join-name')!.textContent).toBe(asking.name);
    expect(join().querySelector('.join-who')!.textContent).toMatch(/^.+ · .+ asks to join$/);
    expect(join().querySelector<HTMLElement>('.join-who')!.title).toMatch(/^Lv 1 · .+ · Pistol\. /);
    press('Accept');
    expect(saved().roster.map((d) => d.id)).toEqual(['recruit-1', asking.id]);
    expect(saved().joining).toBeUndefined();
    // The answer stays on the result's offer line (ID-182, ID-196), in the toast's own words.
    expect(join().hidden).toBe(false);
    expect(join().querySelector('.join-row')).toBeNull();
    expect(join().querySelector('.join-answer')!.textContent).toBe(
      `${asking.name} joined the squad`,
    );
    expect(toast()).toBe(`${asking.name} joined the squad`);
  });

  it('Accept on a win: the newcomer’s card joins the Squad section, marked New (ID-157)', () => {
    const { press, result, saved } = wonFirst();
    const asking = saved().joining![0]!;
    const cards = () => [...result().querySelectorAll<HTMLElement>('.squad-card')];
    expect(cards().map((c) => c.dataset.defender)).not.toContain(asking.id);
    press('Accept');
    const card = cards().find((c) => c.dataset.defender === asking.id)!;
    expect(card).toBeDefined();
    expect(card.classList.contains('squad-card-new')).toBe(true);
    expect(card.querySelector('.squad-badge-new')!.textContent).toBe('New');
    expect(card.querySelector('.squad-card-name')!.textContent).toBe(asking.name);
    // No "nobody levelled up" line left beside a card, and the card has no gun picker.
    expect(result().querySelector('.debrief-empty')).toBeNull();
    expect(card.querySelector('select')).toBeNull();
    // Only the newcomer is marked.
    expect(result().querySelectorAll('.squad-card-new')).toHaveLength(1);
  });

  it('Accept on the start screen after a reload marks their card New (ID-157)', () => {
    const g = campOf(2);
    const save = { ...g, camp: { ...g.camp, recruits: 3 }, joining: [recruit(3)] };
    localStorage.setItem(SAVE_KEY, encodeSave(save, NOW));
    const { root, saved } = boot();
    step(0);
    accept(root);
    expect(saved().roster.map((d) => d.id)).toContain('recruit-3');
    const marked = [...root.querySelectorAll<HTMLElement>('.squad-card-new')];
    expect(marked.map((c) => c.dataset.defender)).toEqual(['recruit-3']);
    expect(marked[0]!.querySelectorAll('.squad-badge-new')).toHaveLength(1);
  });

  it('Accept onto the bench (squad full) adds no squad card (ID-157)', () => {
    const g = campOf(6);
    const save = { ...g, camp: { ...g.camp, recruits: 7 }, joining: [recruit(7)] };
    localStorage.setItem(SAVE_KEY, encodeSave(save, NOW));
    const { root, saved } = boot();
    step(0);
    accept(root);
    expect(saved().reserve.map((d) => d.id)).toContain('recruit-7');
    expect(root.querySelector('.squad-card-new')).toBeNull();
    expect(root.querySelector('.squad-card[data-defender="recruit-7"]')).toBeNull();
  });

  it('Refuse: gone for good, saved at once; the button then goes on with no question', () => {
    const { press, saved, button, bar, toast, join } = wonFirst();
    const asking = saved().joining![0]!;
    press('Refuse');
    expect(saved().roster.map((d) => d.id)).toEqual(['recruit-1']);
    expect(saved().joining).toBeUndefined();
    expect(saved().camp.recruits).toBe(2);
    expect(toast()).toBe(`${asking.name} was turned away`);
    expect(join().querySelector('.join-answer')!.textContent).toBe(
      `${asking.name} was turned away`,
    );
    button().click();
    expect(confirmPanel()).toBeNull();
    step(48);
    expect(bar()).toMatch(/^Horde 2 /);
  });

  it('going on without answering asks first: no keeps the screen and the ask; yes refuses them', async () => {
    const { button, result, saved, join, bar } = wonFirst();
    const asking = saved().joining![0]!;
    button().click();
    expect(confirmQuestion()).toBe(
      `${asking.name} is still asking to join. Go on without answering? They are refused and gone for good.`,
    );
    // A second press while it is up asks nothing more.
    button().click();
    expect(document.querySelectorAll('.confirm-scrim')).toHaveLength(1);
    await answerConfirm(false);
    expect(confirmPanel()).toBeNull();
    expect(result().hidden).toBe(false);
    expect(join().hidden).toBe(false);
    expect(saved().joining).toHaveLength(1);
    button().click();
    await answerConfirm(true);
    expect(saved().joining).toBeUndefined();
    expect(saved().roster).toHaveLength(1);
    step(48);
    expect(bar()).toMatch(/^Horde 2 /);
  });

  it('a reload mid-offer: the start screen still asks, and Accept puts them on the wall', () => {
    const { saved } = wonFirst();
    const asking = saved().joining![0]!;
    // Reload: a new page on the same save.
    const again = boot();
    step(100);
    expect(again.title()).toMatch(/Horde 2/);
    expect(again.result().textContent).toContain(asking.name);
    const join = again.root.querySelector<HTMLElement>('.debrief-join')!;
    expect(join.hidden).toBe(false);
    [...join.querySelectorAll<HTMLButtonElement>('.join-btn')]
      .find((b) => b.getAttribute('aria-label')?.startsWith('Accept '))!
      .click();
    expect(again.saved().roster.map((d) => d.id)).toContain(asking.id);
    // Answered: the box is gone from the offer line's place, or hidden once the screen moves on.
    expect(again.root.querySelector<HTMLElement>('.debrief-join .join-row') ?? null).toBeNull();
    step(116);
    expect(vi.mocked(drawScene).mock.lastCall![2].defenders).toHaveLength(2);
  });

  /** The Roster opened on bench survivor `id`. */
  function rosterOn(id: string) {
    const booted = boot();
    step(0);
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    booted.root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    scrim.querySelector<HTMLButtonElement>(`.rv-tab[data-defender="${id}"]`)!.click();
    const letGo = () => scrim.querySelector<HTMLButtonElement>('.rv-letgo')!;
    const status = () => scrim.querySelector('.rv-status')!.textContent;
    return { ...booted, scrim, letGo, status };
  }

  it('Let go past 6: a confirm naming the gun; no keeps them, yes saves them gone and the gun stashed', async () => {
    localStorage.setItem(SAVE_KEY, encodeSave(campOf(7), NOW));
    const { letGo, saved, status } = rosterOn('recruit-7');
    // A real press focuses the button (jsdom's click doesn't).
    letGo().focus();
    letGo().click();
    expect(await answerConfirm(false)).toMatch(
      new RegExp(
        `^Let ${recruit(7).name} go\\? They leave the camp for good\\. Their Lv 1 .+ goes back to the stash\\.$`,
      ),
    );
    expect(saved().reserve).toHaveLength(1);
    expect(status()).toBe('');
    // Back on the button that opened it.
    expect(document.activeElement).toBe(letGo());
    letGo().click();
    await answerConfirm(true);
    const after = saved();
    expect([...after.roster, ...after.reserve].map((d) => d.id)).not.toContain('recruit-7');
    expect(after.armoury.map((w) => w.uid)).toEqual(['h1']);
    expect(status()).toBe(`${recruit(7).name} has left the camp.`);
  });

  it('Let go at 6, all in the squad: shown greyed, and a press says why', () => {
    localStorage.setItem(SAVE_KEY, encodeSave(campOf(6), NOW));
    const { letGo, status, scrim } = rosterOn('recruit-3');
    expect(letGo().classList.contains('rv-letgo-locked')).toBe(true);
    // The reason under the button too, before any press.
    expect(scrim.querySelector('.rv-letgo-why')!.textContent).toBe(
      'Needs 7+ survivors to let one go (camp 6)',
    );
    letGo().click();
    expect(confirmPanel()).toBeNull();
    expect(status()).toBe('Needs 7+ survivors to let one go (camp 6)');
  });

  it('Accept on the start screen after a reload keeps the keyboard there', () => {
    wonFirst();
    const again = boot();
    step(100);
    const accept = [...again.root.querySelectorAll<HTMLButtonElement>('.join-btn')].find(
      (b) => b.getAttribute('aria-label')?.startsWith('Accept ') === true,
    )!;
    accept.focus();
    accept.click();
    expect(document.activeElement).toBe(again.button());
  });

  /** Seven survivors: recruit 1 and the armed bench recruit 7 Soldiers, the rest Chefs. */
  function soldiers() {
    const g = campOf(7);
    const job = (d: GameState['roster'][number], i: number) => ({
      ...d,
      job: i === 0 ? ('soldier' as const) : ('chef' as const),
      xp: i === 0 ? 300 : 0,
    });
    return {
      ...g,
      roster: g.roster.map(job),
      reserve: g.reserve.map((d) => ({ ...d, job: 'soldier' as const, xp: 400 })),
    };
  }

  it('Combine (ID-170): a pick of the same profession, a confirm; yes saves the XP, them gone, the gun stashed', async () => {
    localStorage.setItem(SAVE_KEY, encodeSave(soldiers(), NOW));
    const { scrim, saved, status } = rosterOn('recruit-1');
    const combine = () => scrim.querySelector<HTMLButtonElement>('.rv-combine')!;
    expect(combine().disabled).toBe(false);
    expect(scrim.querySelector('.rv-combine-pick')).toBeNull();
    combine().click();
    expect(combine().getAttribute('aria-expanded')).toBe('true');
    const picks = [...scrim.querySelectorAll<HTMLButtonElement>('.rv-combine-pick button')];
    // Only the other Soldier, then Cancel.
    expect(picks.map((b) => b.textContent)).toEqual([
      `${recruit(7).name} · Lv ${levelOf(400).level} · Lv 1 Military Carbine`,
      'Cancel',
    ]);
    expect(document.activeElement).toBe(picks[0]);
    picks[0]!.click();
    expect(await answerConfirm(false)).toBe(
      `Combine ${recruit(7).name} into ${recruit(1).name}? ${recruit(7).name} (Lv ${levelOf(400).level}) leaves the camp for good. ${recruit(1).name} gains 200 XP (Lv ${levelOf(300).level} → ${levelOf(500).level}). ${recruit(7).name}'s Lv 1 Military Carbine goes back to the stash.`,
    );
    expect(saved().reserve).toHaveLength(1);
    expect(status()).toBe('');
    scrim.querySelector<HTMLButtonElement>('.rv-combine-pick button')!.click();
    await answerConfirm(true);
    const after = saved();
    expect([...after.roster, ...after.reserve].map((d) => d.id)).not.toContain('recruit-7');
    expect(after.roster.find((d) => d.id === 'recruit-1')!.xp).toBe(500);
    expect(after.armoury.map((w) => w.uid)).toEqual(['h1']);
    expect(status()).toBe(`${recruit(1).name} took in ${recruit(7).name}: +200 XP.`);
    // Back at 6, nobody else of their profession: no Combine button.
    expect(scrim.querySelector('.rv-combine')).toBeNull();
  });

  it('Combine: Cancel closes the pick; a Chef among Chefs has one; locked at 6', () => {
    localStorage.setItem(SAVE_KEY, encodeSave(soldiers(), NOW));
    const { scrim } = rosterOn('recruit-1');
    const combine = () => scrim.querySelector<HTMLButtonElement>('.rv-combine')!;
    combine().click();
    [...scrim.querySelectorAll<HTMLButtonElement>('.rv-combine-pick button')].at(-1)!.click();
    expect(scrim.querySelector('.rv-combine-pick')).toBeNull();
    expect(confirmPanel()).toBeNull();
    // A Chef among Chefs has partners; a lone profession has none.
    scrim.querySelector<HTMLButtonElement>('.rv-tab[data-defender="recruit-2"]')!.click();
    expect(scrim.querySelector('.rv-combine')).not.toBeNull();
    // At 6: greyed, a press says why, no pick opens.
    const six = soldiers();
    six.reserve = [];
    six.roster = [...six.roster.slice(0, 5), { ...six.roster[5]!, job: 'soldier' }];
    localStorage.setItem(SAVE_KEY, encodeSave(six, NOW));
    const again = rosterOn('recruit-1');
    const locked = again.scrim.querySelector<HTMLButtonElement>('.rv-combine')!;
    expect(locked.classList.contains('rv-letgo-locked')).toBe(true);
    // Under the buttons the reason names both locked buttons.
    expect(again.scrim.querySelector('.rv-letgo-why')!.textContent).toBe(
      'Needs 7+ survivors to combine or let one go (camp 6)',
    );
    locked.click();
    expect(again.scrim.querySelector('.rv-combine-pick')).toBeNull();
    expect(again.status()).toBe('Needs 7+ survivors to combine (camp 6)');
    expect(confirmPanel()).toBeNull();
  });

  it('Let go at 6 (one resting on the bench): greyed, and a press says why; nothing is asked', () => {
    const six = campOf(6);
    const resting = { ...six.roster[5]!, rest: 1 };
    localStorage.setItem(
      SAVE_KEY,
      encodeSave({ ...six, roster: six.roster.slice(0, 5), reserve: [resting] }, NOW),
    );
    const { letGo, saved, status } = rosterOn('recruit-6');
    expect(letGo().classList.contains('rv-letgo-locked')).toBe(true);
    expect(letGo().getAttribute('aria-disabled')).toBe('true');
    letGo().click();
    expect(confirmPanel()).toBeNull();
    expect(status()).toBe('Needs 7+ survivors to let one go (camp 6)');
    expect([...saved().roster, ...saved().reserve]).toHaveLength(6);
  });

  it('Let go: a horde starting while the question is up commits nothing (ID-191)', async () => {
    localStorage.setItem(SAVE_KEY, encodeSave(campOf(7), NOW));
    const { letGo, saved, status, button } = rosterOn('recruit-7');
    letGo().click();
    expect(confirmPanel()).not.toBeNull();
    // The fight starts from behind the panel (a shortcut, a timer): the answer is stale.
    button().click();
    step(16);
    await answerConfirm(true);
    expect([...saved().roster, ...saved().reserve].map((d) => d.id)).toContain('recruit-7');
    expect(status()).toBe('Pick the squad between hordes');
  });

  it('Buy a squad slot: a horde starting while the question is up buys nothing', async () => {
    const g = campOf(7);
    localStorage.setItem(SAVE_KEY, encodeSave({ ...g, stock: { ...g.stock, scrap: 2000 } }, NOW));
    const { scrim, saved, status, button } = rosterOn('recruit-7');
    scrim.querySelector<HTMLButtonElement>('.rv-buy-squad')!.click();
    button().click();
    step(16);
    await answerConfirm(true);
    expect(saved().stock.scrap).toBe(2000);
    expect(saved().slots?.squad ?? 0).toBe(0);
    expect(status()).toBe('Buy slots between hordes');
  });

  it('Buy a squad slot: Scrap that moved while the question is up buys nothing and says so', async () => {
    const g = campOf(7);
    localStorage.setItem(SAVE_KEY, encodeSave({ ...g, stock: { ...g.stock, scrap: 2000 } }, NOW));
    const { root, scrim, saved, status, button } = rosterOn('recruit-7');
    scrim.querySelector<HTMLButtonElement>('.rv-buy-squad')!.click();
    // The first horde is won from behind the panel: its Scrap changes "You have N".
    // An open Roster holds the fight, so it is closed too.
    button().click();
    scrim.querySelector<HTMLButtonElement>('.camp-close')!.click();
    step(16);
    endNextTick('won');
    step(32);
    const paid = saved().stock.scrap;
    expect(paid).toBeGreaterThan(2000);
    // Back in the Roster (it says the answer there) with the question still up.
    root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    await answerConfirm(true);
    expect(saved().stock.scrap).toBe(paid);
    expect(saved().slots?.squad ?? 0).toBe(0);
    expect(status()).toBe(ASK_CHANGED);
  });

  it('Combine: a keeper whose level moved while the question is up combines nothing and says so', async () => {
    const s = soldiers();
    const keeper = { ...s.roster[0]!, xp: xpForLevel(5) - 1 };
    localStorage.setItem(
      SAVE_KEY,
      encodeSave({ ...s, roster: [keeper, ...s.roster.slice(1)] }, NOW),
    );
    const { root, scrim, saved, status, button } = rosterOn('recruit-1');
    scrim.querySelector<HTMLButtonElement>('.rv-combine')!.click();
    scrim.querySelector<HTMLButtonElement>('.rv-combine-pick button')!.click();
    button().click();
    scrim.querySelector<HTMLButtonElement>('.camp-close')!.click();
    step(16);
    endNextTick('won');
    step(32);
    expect(saved().roster.find((d) => d.id === 'recruit-1')!.xp).toBeGreaterThan(keeper.xp);
    root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    await answerConfirm(true);
    expect([...saved().roster, ...saved().reserve].map((d) => d.id)).toContain('recruit-7');
    expect(status()).toBe(ASK_CHANGED);
  });

  it('Esc on the confirm over the Roster cancels only the confirm; the Roster stays open', async () => {
    localStorage.setItem(SAVE_KEY, encodeSave(campOf(7), NOW));
    const { letGo, scrim, saved } = rosterOn('recruit-7');
    letGo().focus();
    letGo().click();
    const yes = confirmPanel()!.querySelector<HTMLButtonElement>('.confirm-yes')!;
    expect(document.activeElement).toBe(yes);
    yes.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(confirmPanel()).toBeNull();
    expect(scrim.hidden).toBe(false);
    expect(saved().reserve).toHaveLength(1);
    expect(document.activeElement).toBe(letGo());
  });

  it('Buy a squad slot (ID-179): the game panel asks; Cancel buys nothing, Confirm pays', async () => {
    const g = campOf(7);
    localStorage.setItem(SAVE_KEY, encodeSave({ ...g, stock: { ...g.stock, scrap: 2000 } }, NOW));
    const { scrim, saved, status } = rosterOn('recruit-7');
    const buy = () => scrim.querySelector<HTMLButtonElement>('.rv-buy-squad')!;
    buy().click();
    expect(await answerConfirm(false)).toBe('Buy 1 squad slot for 500 Scrap? You have 2,000.');
    expect(saved().stock.scrap).toBe(2000);
    expect(status()).toBe('');
    buy().click();
    await answerConfirm(true);
    expect(saved().stock.scrap).toBe(1500);
    expect(saved().slots?.squad).toBe(1);
    expect(status()).toBe('Bought 1 squad slot · 500 Scrap spent, 1,500 left.');
  });

  it('Buy stash slots (ID-179): the game panel asks; Cancel buys nothing, Confirm pays', async () => {
    const g = campOf(6);
    localStorage.setItem(SAVE_KEY, encodeSave({ ...g, stock: { ...g.stock, scrap: 400 } }, NOW));
    const { root, saved } = boot();
    step(0);
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const buy = () => scrim.querySelector<HTMLButtonElement>('.inv-buy')!;
    buy().click();
    expect(await answerConfirm(false)).toBe('Buy 10 stash slots for 150 Scrap? You have 400.');
    expect(saved().stock.scrap).toBe(400);
    buy().click();
    await answerConfirm(true);
    expect(saved().stock.scrap).toBe(250);
    expect(scrim.querySelector('.inv-status')!.textContent).toBe(
      'Bought 10 stash slots · 150 Scrap spent, 250 left.',
    );
  });

  it('never opens the browser popup: every ask is the game panel', async () => {
    const g = campOf(7);
    localStorage.setItem(SAVE_KEY, encodeSave({ ...g, stock: { ...g.stock, scrap: 2000 } }, NOW));
    const { scrim, letGo } = rosterOn('recruit-7');
    letGo().click();
    await answerConfirm(false);
    scrim.querySelector<HTMLButtonElement>('.rv-buy-squad')!.click();
    await answerConfirm(false);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

describe('Best gun with Auto on (app.ts, ID-154)', () => {
  it('re-picks the squad on every press, even when no gun changes', () => {
    const g = newGame('horde');
    // A squad picked by hand: a veteran left on the bench, Auto on. Loading never re-picks.
    const camp: GameState = {
      ...g,
      hordeNumber: 4,
      roster: [1, 2, 3, 4, 5, 6].map((n) => recruit(n)),
      reserve: [{ ...recruit(7), xp: 30000 }],
      camp: { ...g.camp, recruits: 7 },
      autoSquad: true,
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const { root, saved } = boot();
    step(0);
    expect(saved().reserve.map((d) => d.id)).toEqual(['recruit-7']);
    root.querySelector<HTMLButtonElement>('.roster-button')!.click();
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    scrim.querySelector<HTMLButtonElement>('[data-key="best"]')!.click();
    // No stash, so no gun moved; Auto still brought the veteran in.
    expect(scrim.querySelector('.rv-status')!.textContent).toBe(
      'Everyone already holds the best gun they can get.',
    );
    expect(saved().roster.map((d) => d.id)).toContain('recruit-7');
  });

  it('the start screen’s Best gun re-picks the squad too; the keyboard stays on the button', () => {
    const g = newGame('horde');
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const camp: GameState = {
      ...g,
      hordeNumber: 4,
      roster: [1, 2, 3, 4, 5, 6].map((n) => recruit(n)),
      reserve: [{ ...recruit(7), xp: 30000 }],
      camp: { ...g.camp, recruits: 7 },
      armoury: [relic],
      autoSquad: true,
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const { root, saved } = boot();
    step(0);
    const best = () => root.querySelector<HTMLButtonElement>('.debrief-best-guns')!;
    const toast = () => root.querySelector('.hud-toast')!.textContent!;
    best().focus();
    best().click();
    expect(toast()).toMatch(/^Equipped: .+ → Relic Carbine$/);
    expect(saved().armoury).toEqual([]);
    expect(saved().roster.map((d) => d.id)).toContain('recruit-7');
    // The relic is in the squad's hands, not left with someone Auto benched.
    const holder = saved().roster.find(
      (d) => typeof d.loadout.primary === 'object' && d.loadout.primary.uid === 'h1',
    );
    expect(holder).toBeDefined();
    expect(toast()).toBe(`Equipped: ${holder!.name} → Relic Carbine`);
    // The start screen was drawn afresh with the new squad and guns.
    expect(root.querySelector('.squad-card[data-defender="recruit-7"]')).not.toBeNull();
    expect(document.activeElement).toBe(best());
    best().click();
    expect(toast()).toBe(BEST_GUNS_NONE);
  });
});

describe('the result and the camp tile agree (app.ts, ID-182)', () => {
  /** `save` booted on its start screen, the fight at Horde `horde` seeded `seed`, then won. */
  function playWin(
    save: GameState,
    seed: number,
    horde: number | null = null,
    outcome: 'won' | 'lost' = 'won',
  ) {
    localStorage.setItem(SAVE_KEY, encodeSave(save, NOW));
    // The horde's seed is the clock's: fixed, so the roll is known.
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    const booted = boot();
    step(0);
    if (horde !== null) {
      const select = booted.root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
      select.value = String(horde);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    booted.button().click();
    step(16);
    endNextTick(outcome);
    step(32);
    const tile = () => booted.root.querySelector<HTMLElement>('.debrief-join');
    const press = (label: 'Accept' | 'Refuse') =>
      [...tile()!.querySelectorAll<HTMLButtonElement>('.join-btn')]
        .find((b) => b.getAttribute('aria-label')?.startsWith(`${label} `))!
        .click();
    const toast = () => booted.root.querySelector<HTMLElement>('.hud-toast')!;
    return { ...booted, tile, press, toast };
  }

  /** A camp of `n` at Horde 5 (6 in the squad, the rest on the bench). */
  function camp(n: number): GameState {
    const g = newGame('horde');
    const all = Array.from({ length: n }, (_, i) => recruit(i + 1));
    return {
      ...g,
      hordeNumber: 5,
      roster: all.slice(0, 6),
      reserve: all.slice(6),
      camp: { ...g.camp, recruits: n },
    };
  }

  /** The first seeds from 1 that ask, and that do not, for `n` survivors. */
  function seeds(n: number, replay: boolean, asks: boolean, count: number): number[] {
    const out: number[] = [];
    for (let s = 1; out.length < count; s++) {
      if (joiners(camp(n), s, replay).length > 0 === asks) out.push(s);
    }
    return out;
  }

  const cases: [string, number, boolean, boolean][] = [
    ['first clear of a camp of 2, someone asks', 2, false, true],
    ['first clear past 6, someone asks', 7, false, true],
    ['first clear past 6, nobody', 7, false, false],
    ['replay, someone asks', 7, true, true],
    ['replay, nobody', 7, true, false],
    ['camp of 40, first clear', 40, false, false],
    ['camp of 40, replay', 40, true, false],
  ];
  it.each(cases)(
    '%s: the offer rows are the saved ask, else the reason shows',
    (_n, n, replay, asks) => {
      // A full camp never asks, whatever the seed: any will do.
      const seed = n >= 40 ? 1 : seeds(n, replay, asks, 1)[0]!;
      const { tile, saved, root } = playWin(camp(n), seed, replay ? 3 : null);
      const asking = saved().joining ?? [];
      const rows = [...tile()!.querySelectorAll<HTMLElement>('.join-row')];
      expect(rows.map((r) => r.querySelector('.join-name')!.textContent)).toEqual(
        asking.map((d) => d.name),
      );
      const notes = [...root.querySelectorAll('.debrief-notes li')].map((li) => li.textContent);
      if (asking.length > 0) {
        expect(tile()!.hidden).toBe(false);
        expect(tile()!.getAttribute('aria-label')).toBe('Asking to join');
        expect(notes.join(' ')).not.toMatch(/Nobody new|Camp is full/);
      } else {
        // Nobody asks: the box is hidden and the details say why, last.
        const why = n >= 40 ? 'camp-full' : replay ? 'nobody-replay' : 'nobody-first';
        expect(tile()!.hidden).toBe(true);
        expect(notes.at(-1)).toBe(noJoinText(why, n));
      }
      expect(asking.length > 0).toBe(asks && n < 40);
    },
  );

  /** Ends the toast: its timer runs out. */
  const toastGone = (toast: () => HTMLElement): void => {
    vi.advanceTimersByTime(5000);
    expect(toast().hidden).toBe(true);
  };

  it('Accept into the squad, then the toast is gone: the result still names them', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { tile, press, toast, saved } = playWin(camp(3), 1);
    const asking = saved().joining![0]!;
    press('Accept');
    expect(toast().textContent).toBe(`${asking.name} joined the squad`);
    toastGone(toast);
    expect(tile()!.hidden).toBe(false);
    expect(tile()!.textContent).toContain(`${asking.name} joined the squad`);
    expect(saved().roster.map((d) => d.id)).toContain(asking.id);
  });

  it('Accept onto the bench (squad full): named as the bench in the toast, the tile and the save', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const [seed] = seeds(6, false, true, 1);
    const { tile, press, toast, saved } = playWin(camp(6), seed!);
    const asking = saved().joining![0]!;
    press('Accept');
    const said = `${asking.name} joined the camp, on the bench`;
    expect(toast().textContent).toBe(said);
    toastGone(toast);
    expect(tile()!.textContent).toContain(said);
    expect(saved().reserve.map((d) => d.id)).toContain(asking.id);
    expect(saved().roster.map((d) => d.id)).not.toContain(asking.id);
  });

  it('Refuse, then the toast is gone: the result says they were turned away', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { tile, press, toast, saved } = playWin(camp(3), 1);
    const asking = saved().joining![0]!;
    press('Refuse');
    toastGone(toast);
    expect(tile()!.textContent).toContain(`${asking.name} was turned away`);
    expect(tile()!.querySelector('.join-btn')).toBeNull();
  });

  it('a replay with nobody says why; a first clear with nobody says why and offers no one', () => {
    const [replaySeed] = seeds(7, true, false, 1);
    const a = playWin(camp(7), replaySeed!, 3);
    // The reason is the last of the details; the offer line itself is hidden.
    expect(a.root.querySelector('.debrief-notes li:last-child')!.textContent).toBe(
      noJoinText('nobody-replay', 7),
    );
    expect(a.saved().joining).toBeUndefined();
    expect(a.tile()!.hidden).toBe(true);
    expect(a.tile()!.querySelector('.join-btn')).toBeNull();
    // Odds come off the data: 1 in 20 and 1 in 7.
    expect(noJoinText('nobody-replay', 7)).toBe(
      'Nobody new this time. A replay rarely brings a survivor (about 1 in 20).',
    );
    expect(noJoinText('nobody-first', 7)).toBe(
      'Nobody new this time. At 6 survivors or more, a new horde brings one about 1 in 7.',
    );
    expect(noJoinText('camp-full', 40)).toBe('Camp is full (40): nobody new can join.');
    expect(noJoinText('no-drop', 7)).toBe('No drop and nobody new: replay limit reached.');
    expect(noJoinText('lost', 7)).toBeNull();
  });

  it('a lost fight has no offer line at all', () => {
    const { root, title } = playWin(camp(7), 1, null, 'lost');
    expect(title()).toBe('Horde 5 - Camp has fallen');
    expect(root.querySelector('.debrief-join')).toBeNull();
  });

  it('a replay past the replay limit drops nothing and says so in the details (no-drop)', () => {
    const g = camp(7);
    const save = { ...g, farm: { ...g.farm, replays: FARM.maxReplays } };
    const { tile, saved, root } = playWin(save, 1, 3);
    expect(tile()!.hidden).toBe(true);
    expect(root.querySelector('.debrief-notes li:last-child')!.textContent).toBe(
      noJoinText('no-drop', 7),
    );
    expect(root.querySelector('.debrief-guns')).toBeNull();
    expect(saved().joining).toBeUndefined();
  });
});

describe('Upgrade through the app (ID-208)', () => {
  const HELD: OwnedWeapon = {
    uid: 'h1',
    base: 'smg',
    rarity: 'common',
    affixes: [],
    level: 3,
  };
  const STASHED: OwnedWeapon = { ...HELD, uid: 'h2', level: 2 };

  /** Horde 6, one survivor holding Lv 3 `h1`, Lv 2 `h2` in the stash, `scrap` Scrap. */
  function upgradeCamp(scrap: number, horde = 6) {
    const g = newGame('horde');
    const who = recruit(1);
    const camp: GameState = {
      ...g,
      hordeNumber: horde,
      roster: [{ ...who, loadout: { ...who.loadout, primary: HELD } }],
      camp: { ...g.camp, recruits: 1 },
      armoury: [STASHED],
      stock: { ...g.stock, scrap },
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    let seed = 1;
    while (joiners(camp, seed, true).length > 0) seed++;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    const booted = boot();
    step(0);
    let t = 0;
    const frame = () => step((t += 16));
    const open = () => booted.root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const scrim = () => document.querySelector<HTMLElement>('.camp-scrim')!;
    const chip = () => document.querySelector('.scrap-chip')!.textContent;
    const pickGun = (key: string) =>
      scrim().querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!.click();
    const upgrade = () => scrim().querySelector<HTMLButtonElement>('.inv-upgrade-button')!;
    const status = () => scrim().querySelector('.inv-status')!.textContent;
    return { ...booted, frame, open, scrim, chip, pickGun, upgrade, status, camp };
  }

  it('between hordes: a held gun is upgraded, saved, and the Scrap chip and status follow', () => {
    const m = upgradeCamp(500);
    expect(m.chip()).toBe('Scrap 500');
    m.open();
    m.pickGun(`squad:${recruit(1).id}`);
    expect(m.upgrade().textContent).toBe('Upgrade +1 · 30\u00a0Scrap');
    m.upgrade().click();
    expect(m.saved().stock.scrap).toBe(470);
    expect(m.saved().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1', step: 1 });
    expect(m.chip()).toBe('Scrap 470');
    expect(m.status()).toBe('Upgraded Lv 3 Common SMG +1 · 30 Scrap spent, 470 left.');
  });

  it('between hordes: a stash gun is upgraded too', () => {
    const m = upgradeCamp(500);
    m.open();
    m.pickGun('stash:h2');
    m.upgrade().click();
    expect(m.saved().armoury[0]).toMatchObject({ uid: 'h2', step: 1 });
    expect(m.saved().stock.scrap).toBe(480);
  });

  it('in a fight: the live defender fights with the upgraded gun, and the power chip follows', () => {
    const m = upgradeCamp(500);
    m.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
    m.frame();
    m.frame();
    const label = () => m.root.querySelector('.hud-power-label')!.textContent;
    const before = label();
    m.open();
    m.pickGun(`squad:${recruit(1).id}`);
    m.upgrade().click();
    expect(label()).not.toBe(before);
    const power = squadPower({
      roster: [
        {
          ...m.camp.roster[0]!,
          loadout: { ...m.camp.roster[0]!.loadout, primary: { ...HELD, step: 1 } },
        },
      ],
    });
    expect(label()).toContain(`Power ${power.toLocaleString('en-US')}`);
    expect(m.saved().stock.scrap).toBe(470);
    expect(m.chip()).toBe('Scrap 470');
    // Closed again, the fight resumes with the new gun in the defender's hands.
    document.querySelector<HTMLButtonElement>('.camp-done')!.click();
    vi.mocked(tick).mockClear();
    m.frame();
    m.frame();
    const live = vi.mocked(tick).mock.calls.at(-1)![0];
    expect(live.defenders[0]!.loadout.primary).toMatchObject({ uid: 'h1', step: 1 });
    // The upgraded gun hits harder than the one it was.
    expect(statsOf(live.defenders[0]!.loadout.primary).damage).toBeCloseTo(
      statsOf(HELD).damage * 1.04,
      9,
    );
  });

  it('on the result screen: the Scrap it shows follows an upgrade', () => {
    const m = upgradeCamp(500);
    m.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
    m.frame();
    m.frame();
    endNextTick('won');
    m.frame();
    // The balance after the win is in the chip's tooltip and the details' line.
    const text = () =>
      [...m.result().querySelectorAll<HTMLElement>('[title]')].map((e) => e.title).join(' | ');
    // 10 + 5 × 6 = 40 Scrap for the win: 540 now.
    expect(text()).toContain('now 540');
    expect(m.chip()).toBe('Scrap 540');
    m.open();
    m.pickGun('stash:h2');
    m.upgrade().click();
    expect(m.chip()).toBe('Scrap 520');
    expect(text()).toContain('now 520');
    expect(text()).not.toContain('now 540');
    // The start button and picker still stand.
    expect(m.button().textContent).toMatch(/^Start Horde 7/);
  });

  /** A won result screen over the upgrade camp, the Weapons tab not yet open. */
  function won(scrap = 500, horde = 6) {
    const m = upgradeCamp(scrap, horde);
    m.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
    m.frame();
    m.frame();
    endNextTick('won');
    m.frame();
    const picked = () =>
      [...m.result().querySelectorAll<HTMLButtonElement>('.hud-skill-option')]
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.dataset.skill);
    const upgradeStash = () => {
      m.open();
      m.pickGun('stash:h2');
      m.upgrade().click();
      document.querySelector<HTMLButtonElement>('.camp-done')!.click();
    };
    return { ...m, picked, upgradeStash };
  }

  it('on the result screen: a skill toggled there is still shown as picked after an upgrade', () => {
    const m = won();
    expect(m.picked()).toEqual(['airstrike']);
    m.result()
      .querySelector<HTMLButtonElement>('.hud-skill-option[data-skill="airstrike"]')!
      .click();
    expect(m.saved().skillPick).toEqual([]);
    expect(m.picked()).toEqual([]);
    m.upgradeStash();
    // The screen was not rebuilt from the camp before the win: the pick is the saved one.
    expect(m.picked()).toEqual([]);
    expect(m.saved().skillPick).toEqual([]);
    m.result()
      .querySelector<HTMLButtonElement>('.hud-skill-option[data-skill="airstrike"]')!
      .click();
    m.upgradeStash();
    expect(m.picked()).toEqual(['airstrike']);
    expect(m.saved().skillPick).toEqual(['airstrike']);
  });

  it('on the result screen: open details stay open through an upgrade, and so does the scroll', () => {
    // A boss horde's first clear has a note, so the screen has its details.
    const m = won(500, 10);
    const toggle = () => m.result().querySelector<HTMLElement>('[data-details-toggle]')!;
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(m.result().dataset.details).toBeDefined();
    m.upgradeStash();
    expect(m.result().dataset.details).toBeDefined();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const body = m.result().querySelector<HTMLElement>('.hud-result-scroll')!;
    body.scrollTop = 40;
    m.upgradeStash();
    expect(m.result().dataset.details).toBeDefined();
    expect(body.scrollTop).toBe(40);
  });

  it('on the result screen: a slot purchase refreshes the Scrap figure too', async () => {
    const m = won(2000);
    expect(
      [...m.result().querySelectorAll<HTMLElement>('[title]')].some((e) =>
        e.title.includes('now 2,040'),
      ),
    ).toBe(true);
    m.open();
    m.scrim().querySelector<HTMLButtonElement>('.inv-buy')!.click();
    await answerConfirm(true);
    expect(m.chip()).toBe('Scrap 1,890');
    const titles = [...m.result().querySelectorAll<HTMLElement>('[title]')].map((e) => e.title);
    expect(titles.some((t) => t.includes('now 1,890'))).toBe(true);
    expect(titles.some((t) => t.includes('now 2,040'))).toBe(false);
  });
});

describe('Craft through the app (ID-209)', () => {
  const GUN = BLUEPRINT_GUNS[0]!;

  /** Horde 6, one survivor, `scrap` Scrap and (optionally) a blueprint of `GUN`. */
  function craftCamp(scrap: number, bp = 1, seedWith: 'drop' | 'none' = 'none') {
    const g = newGame('horde');
    const camp: GameState = {
      ...g,
      hordeNumber: 6,
      roster: [recruit(1)],
      camp: { ...g.camp, recruits: 1 },
      stock: { ...g.stock, scrap },
      ...(bp > 0 ? { craft: { blueprints: { [GUN]: bp }, made: 0 } } : {}),
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    let seed = 1;
    while (
      joiners(camp, seed, true).length > 0 ||
      (rollBlueprint(seed) !== null) !== (seedWith === 'drop')
    )
      seed++;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    const booted = boot();
    step(0);
    let t = 0;
    const frame = () => step((t += 16));
    const open = () => booted.root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const scrim = () => document.querySelector<HTMLElement>('.camp-scrim')!;
    const tabs = () => [...scrim().querySelectorAll('.camp-tab')].map((x) => x.textContent);
    const craftTab = () => scrim().querySelector<HTMLButtonElement>('#camp-tab-craft')!;
    const go = () => scrim().querySelector<HTMLButtonElement>('.craft-go')!;
    const chip = () => document.querySelector('.scrap-chip')!.textContent;
    const fight = () => {
      booted.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
      frame();
      frame();
    };
    return { ...booted, frame, open, scrim, tabs, craftTab, go, chip, fight, seed };
  }

  it('has the Craft tab after Weapons (and the Roster before them)', () => {
    const m = craftCamp(100);
    m.open();
    expect(m.tabs()).toEqual(['Roster', 'Weapons', 'Craft · 1', 'World map']);
  });

  it('crafts between hordes: saved, in the stash, Scrap spent, the chip follows', () => {
    const m = craftCamp(500);
    m.open();
    m.craftTab().click();
    expect(m.go().textContent).toBe('Craft · 20 Scrap');
    m.go().click();
    expect(m.saved().stock.scrap).toBe(480);
    expect(m.saved().armoury).toHaveLength(1);
    expect(m.saved().armoury[0]).toMatchObject({ uid: 'f1', base: GUN, level: 5 });
    expect(m.saved().craft).toEqual({ blueprints: {}, made: 1 });
    expect(m.chip()).toBe('Scrap 480');
    expect(m.scrim().querySelector('.craft-result-line')!.textContent).toMatch(/^Crafted: Lv 5 /);
  });

  it('salvages a blueprint for 5 Scrap after the confirm, saved', async () => {
    const m = craftCamp(500, 2);
    m.open();
    m.craftTab().click();
    m.scrim().querySelector<HTMLButtonElement>('.craft-salvage')!.click();
    expect(confirmQuestion()).toMatch(/^Salvage 1 .+ blueprint for 5 Scrap\?$/);
    await answerConfirm(true);
    expect(m.saved().stock.scrap).toBe(505);
    expect(m.saved().craft!.blueprints[GUN]).toBe(1);
    expect(m.chip()).toBe('Scrap 505');
  });

  it('on the result screen a craft refreshes the drop tile’s stash count in place', () => {
    const m = craftCamp(500, 1);
    m.fight();
    endNextTick('won');
    m.frame();
    const chip = m.result().querySelector<HTMLButtonElement>('.gun-chip')!;
    chip.click();
    const before = m.result().querySelector('.tile-stash')!.textContent!;
    const n = Number(/^Stash (\d+)/.exec(before)![1]);
    m.open();
    m.craftTab().click();
    m.go().click();
    expect(m.result().querySelector('.tile-stash')!.textContent).toBe(
      before.replace(/^Stash \d+/, `Stash ${n + 1}`),
    );
  });

  it('in a fight the Craft button is greyed and nothing is made', () => {
    const m = craftCamp(500);
    m.fight();
    m.open();
    m.craftTab().click();
    expect(m.go().disabled).toBe(true);
    m.go().click();
    expect(m.saved().armoury).toHaveLength(0);
    expect(m.saved().craft!.blueprints[GUN]).toBe(1);
  });

  it('a won horde that drops a blueprint saves it and the result panel shows it with the loot', () => {
    const m = craftCamp(0, 0, 'drop');
    const base = rollBlueprint(m.seed)!;
    m.fight();
    endNextTick('won');
    m.frame();
    expect(m.saved().craft).toEqual({ blueprints: { [base]: 1 }, made: 0 });
    expect(m.result().querySelector('.gun-blueprint')!.textContent).toBe(blueprintLine(base));
  });

  it('a won horde with no blueprint drop leaves the save with no craft', () => {
    const m = craftCamp(0, 0, 'none');
    m.fight();
    endNextTick('won');
    m.frame();
    expect(m.saved().craft).toBeUndefined();
    expect(m.result().querySelector('.gun-blueprint')).toBeNull();
  });

  it('crafts on the result screen too, after a win', () => {
    const m = craftCamp(500, 1);
    m.fight();
    endNextTick('won');
    m.frame();
    m.open();
    m.craftTab().click();
    expect(m.go().disabled).toBe(false);
    m.go().click();
    expect(m.saved().armoury.some((w) => w.uid === 'f1')).toBe(true);
  });
});

describe('Salvage through the app (ID-207)', () => {
  const HELD: OwnedWeapon = { uid: 'h1', base: 'smg', rarity: 'common', affixes: [], level: 3 };
  /** A gun the save accepts: its rarity's affixes rolled, the level and step as given. */
  const gunOf = (
    uid: string,
    extra: { rarity?: OwnedWeapon['rarity']; level?: number; step?: number } = {},
  ): OwnedWeapon => {
    const { step, ...rest } = extra;
    const w = rollWeapon(createRng(7), uid, 'smg', rest.rarity ?? 'common', rest.level);
    return step ? { ...w, step } : w;
  };

  /** Horde 6, one survivor holding Lv 3 `h1`, `stash` in the stash, 500 Scrap. */
  function salvageCamp(stash: OwnedWeapon[]) {
    const g = newGame('horde');
    const who = recruit(1);
    const camp: GameState = {
      ...g,
      hordeNumber: 6,
      roster: [{ ...who, loadout: { ...who.loadout, primary: HELD } }],
      camp: { ...g.camp, recruits: 1 },
      armoury: stash,
      stock: { ...g.stock, scrap: 500 },
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    let seed = 1;
    while (joiners(camp, seed, true).length > 0) seed++;
    vi.spyOn(Date, 'now').mockReturnValue(seed);
    const booted = boot();
    step(0);
    let t = 0;
    const frame = () => step((t += 16));
    const open = () => booted.root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const scrim = () => document.querySelector<HTMLElement>('.camp-scrim')!;
    const chip = () => document.querySelector('.scrap-chip')!.textContent;
    const pickGun = (key: string) =>
      scrim().querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!.click();
    const salvage = () => scrim().querySelector<HTMLButtonElement>('.inv-salvage-button')!;
    const status = () => scrim().querySelector('.inv-status')!.textContent;
    return { ...booted, frame, open, scrim, chip, pickGun, salvage, status };
  }

  it('between hordes: a lower rarity goes in one tap; saved, chip and status follow', async () => {
    const m = salvageCamp([gunOf('h2', { rarity: 'military', level: 2, step: 2 }), gunOf('h3')]);
    m.open();
    m.pickGun('stash:h2');
    expect(m.salvage().textContent).toBe('Salvage · +55\u00a0Scrap');
    m.salvage().click();
    await flush();
    expect(confirmPanel()).toBeNull();
    expect(m.saved().armoury.map((w) => w.uid)).toEqual(['h3']);
    expect(m.saved().stock.scrap).toBe(555);
    expect(m.chip()).toBe('Scrap 555');
    expect(m.status()).toBe('Salvaged Lv 2 Military SMG +2 · +55 Scrap, 555 now.');
  });

  it('a Prototype asks first: a no keeps the gun, a yes salvages it', async () => {
    const m = salvageCamp([gunOf('h2', { rarity: 'prototype', level: 3, step: 1 })]);
    m.open();
    m.pickGun('stash:h2');
    m.salvage().click();
    await flush();
    expect(confirmQuestion()).toBe(
      'Salvage Lv 3 Prototype SMG +1 for 65 Scrap? The gun is gone for good.',
    );
    await answerConfirm(false);
    expect(m.saved().armoury).toHaveLength(1);
    expect(m.saved().stock.scrap).toBe(500);
    // The press is locked for a moment (the clock is the test's own), so move it on.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    m.salvage().click();
    await flush();
    await answerConfirm(true);
    expect(m.saved().armoury).toHaveLength(0);
    expect(m.saved().stock.scrap).toBe(565);
    expect(m.chip()).toBe('Scrap 565');
  });

  it('a Relic asks first too', async () => {
    const m = salvageCamp([gunOf('h2', { rarity: 'relic' })]);
    m.open();
    m.pickGun('stash:h2');
    m.salvage().click();
    await flush();
    expect(confirmQuestion()).toMatch(/^Salvage Lv 1 Relic SMG for 100 Scrap\?/);
    await answerConfirm(true);
    expect(m.saved().stock.scrap).toBe(600);
  });

  it('a held gun is greyed, saying to put it back in the stash first', () => {
    const m = salvageCamp([gunOf('h2')]);
    m.open();
    m.pickGun(`squad:${recruit(1).id}`);
    expect(m.salvage().disabled).toBe(true);
    expect(m.salvage().textContent).toBe('Put it back in the stash first');
    m.salvage().click();
    expect(m.saved().stock.scrap).toBe(500);
  });

  it('in a fight: a stash gun is salvaged and the fight carries on', async () => {
    const m = salvageCamp([gunOf('h2')]);
    m.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
    m.frame();
    m.frame();
    m.open();
    m.pickGun('stash:h2');
    expect(m.salvage().disabled).toBe(false);
    m.salvage().click();
    await flush();
    expect(m.saved().armoury).toHaveLength(0);
    expect(m.saved().stock.scrap).toBe(510);
    expect(m.chip()).toBe('Scrap 510');
  });

  describe('several at once (ID-215)', () => {
    const selectOn = (m: ReturnType<typeof salvageCamp>) =>
      m.scrim().querySelector<HTMLButtonElement>('.inv-select')!.click();
    const quick = (m: ReturnType<typeof salvageCamp>, rarity: string) =>
      m
        .scrim()
        .querySelector<HTMLButtonElement>(`.inv-select-pick[data-rarity="${rarity}"]`)!
        .click();
    const bulk = (m: ReturnType<typeof salvageCamp>) =>
      m.scrim().querySelector<HTMLButtonElement>('.inv-select-salvage')!;

    it('lower rarities go in one tap: saved once, chip and status follow', async () => {
      const m = salvageCamp([
        gunOf('h2'),
        gunOf('h3'),
        gunOf('h4', { rarity: 'military' }),
        gunOf('h5', { rarity: 'rusty' }),
      ]);
      m.open();
      selectOn(m);
      quick(m, 'common');
      m.pickGun('stash:h4');
      expect(bulk(m).textContent).toBe('Salvage 3 · +45 Scrap');
      bulk(m).click();
      await flush();
      expect(confirmPanel()).toBeNull();
      expect(m.saved().armoury.map((w) => w.uid)).toEqual(['h5']);
      expect(m.saved().stock.scrap).toBe(545);
      expect(m.chip()).toBe('Scrap 545');
      expect(m.status()).toBe('Salvaged 3 guns · +45 Scrap, 545 now.');
    });

    it('a Prototype in the selection asks first: a no keeps every gun, a yes salvages them all', async () => {
      const m = salvageCamp([gunOf('h2', { rarity: 'prototype' }), gunOf('h3')]);
      m.open();
      selectOn(m);
      quick(m, 'prototype');
      quick(m, 'common');
      bulk(m).click();
      await flush();
      expect(confirmQuestion()).toBe(
        'Salvage 2 guns (1 Prototype) for 60 Scrap? The guns are gone for good.',
      );
      await answerConfirm(false);
      expect(m.saved().armoury).toHaveLength(2);
      expect(m.saved().stock.scrap).toBe(500);
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
      bulk(m).click();
      await flush();
      await answerConfirm(true);
      expect(m.saved().armoury).toHaveLength(0);
      expect(m.saved().stock.scrap).toBe(560);
      expect(m.chip()).toBe('Scrap 560');
    });

    it('works in a fight', async () => {
      const m = salvageCamp([gunOf('h2'), gunOf('h3', { rarity: 'rusty' })]);
      m.root.querySelector<HTMLButtonElement>('.hud-start-row > .hud-button')!.click();
      m.frame();
      m.frame();
      m.open();
      selectOn(m);
      quick(m, 'common');
      quick(m, 'rusty');
      bulk(m).click();
      await flush();
      expect(m.saved().armoury).toHaveLength(0);
      expect(m.saved().stock.scrap).toBe(515);
    });
  });
});

describe('Medicine treats the resting in the game (app.ts, ID-220)', () => {
  /** A Horde 2 camp: survivors 1–2 in the squad, 3 resting on the bench, `medicine` in stock. */
  function hurtCamp(medicine = 2) {
    const g = newGame('horde');
    const camp: GameState = {
      ...g,
      hordeNumber: 2,
      roster: [recruit(1), recruit(2)],
      reserve: [{ ...recruit(3), rest: 1 }],
      camp: { ...g.camp, recruits: 3 },
      medicine,
    };
    localStorage.setItem(SAVE_KEY, encodeSave(camp, NOW));
    const booted = boot();
    step(0);
    const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
    const chip = () => document.querySelector('.medicine-chip-count')?.textContent ?? null;
    const treat = () => scrim.querySelector<HTMLButtonElement>('[data-key="treat"]');
    const openOn = (id: string) => {
      booted.root.querySelector<HTMLButtonElement>('.roster-button')!.click();
      scrim.querySelector<HTMLElement>(`[data-key="tab:${id}"]`)!.click();
    };
    return { ...booted, scrim, chip, treat, openOn };
  }

  it('between hordes: 1 Medicine ends the rest, saved, and the chip counts down at once', () => {
    const t = hurtCamp(2);
    expect(t.chip()).toBe('2');
    t.openOn('recruit-3');
    expect(t.treat()!.disabled).toBe(false);
    t.treat()!.click();
    expect(t.chip()).toBe('1');
    const saved = t.saved();
    expect(saved.medicine).toBe(1);
    expect(saved.reserve.find((d) => d.id === 'recruit-3')!.rest).toBeUndefined();
    expect(t.treat()).toBeNull();
  });

  it('the last Medicine: the chip drops it and nothing is left to spend', () => {
    const t = hurtCamp(1);
    t.openOn('recruit-3');
    t.treat()!.click();
    expect(t.chip()).toBeNull();
    expect(t.saved().medicine).toBeUndefined();
  });

  it('on the result screen: a survivor downed in the win is treated; the debrief stays as fought', () => {
    const t = hurtCamp(2);
    t.button().click();
    step(16);
    // The next tick wins the fight with survivor 2 downed in it.
    const real = vi.mocked(tick).getMockImplementation()!;
    vi.mocked(tick).mockImplementationOnce((s: HordeState, dt: number) => {
      const r = real(s, dt);
      const d = r.defenders.find((x) => x.id === 'recruit-2')!;
      return {
        ...r,
        outcome: 'won',
        defenders: r.defenders.filter((x) => x !== d),
        injured: [
          ...r.injured,
          {
            defender: { id: d.id, name: d.name, loadout: d.loadout },
            postId: d.postId,
            at: 0,
            offered: false,
            by: null,
          },
        ],
      };
    });
    step(32);
    expect(t.title()).toMatch(/Horde 2/);
    expect(t.saved().reserve.find((d) => d.id === 'recruit-2')?.rest).toBe(1);
    const debrief = t.result().textContent;
    expect(debrief).toContain('Resting');
    t.openOn('recruit-2');
    expect(t.treat()!.disabled).toBe(false);
    t.treat()!.click();
    expect(t.chip()).toBe('1');
    expect(t.saved().reserve.find((d) => d.id === 'recruit-2')?.rest).toBeUndefined();
    // The result reports what the fight did (ID-220 review): it is not redrawn.
    expect(t.result().textContent).toBe(debrief);
  });

  it('mid-fight: greyed; the rest and the Medicine stay', () => {
    const t = hurtCamp(2);
    t.button().click();
    step(16);
    t.openOn('recruit-3');
    expect(t.treat()!.disabled).toBe(true);
    t.treat()!.click();
    expect(t.chip()).toBe('2');
    expect(t.saved().reserve.find((d) => d.id === 'recruit-3')!.rest).toBe(1);
  });
});
