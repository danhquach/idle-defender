// @vitest-environment jsdom
// ID-096: hold to add is wired on every screen that spends stat points: the result
// screen's survivor cards, the Roster's survivor card (horde-only) and the full game's
// roster in the build panel. A hold past HOLD.delay adds more than 1 point on each.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import type { Stat } from '../core/data.ts';
import { createBuildPanel } from './build.ts';
import { HOLD, HOLD_ATTR } from './hold.ts';
import { createHud, squadScreen } from './hud.ts';
import { createRoster } from './squadroster.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

/** Holds `find()`'s button down for `ms` with the mouse, then lets go. */
function holdDown(find: () => HTMLButtonElement, ms: number): void {
  const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperties(down, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
  find().dispatchEvent(down);
  vi.advanceTimersByTime(ms);
  const up = new MouseEvent('pointerup', { bubbles: true });
  Object.defineProperty(up, 'pointerId', { value: 1 });
  window.dispatchEvent(up);
}

/** A level-5 survivor: 4 points to spend. */
const vet = (n: number): RosterDefender => ({ ...recruit(n), xp: xpForLevel(5) });
const spend = (g: GameState, id: string, stat: Stat): GameState => ({
  ...g,
  roster: g.roster.map((d) =>
    d.id === id ? { ...d, stats: { ...d.stats, [stat]: d.stats[stat] + 1 } } : d,
  ),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('hold to add, on each screen (ID-096)', () => {
  it('the result screen’s survivor cards', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const spent: Stat[] = [];
    const h = createHud(
      root,
      noop,
      noop,
      noop,
      noop,
      (_, s) => {
        spent.push(s);
      },
      noop,
      noop,
      noop,
      noop,
      noop,
      true,
    );
    const g0 = newGame('horde');
    const g: GameState = { ...g0, roster: [vet(1)], camp: { ...g0.camp, recruits: 1 } };
    h.showResult(squadScreen(g, { ...startSquadHorde(g, 1, NOW), outcome: 'won' }));
    // The card's "+N" opens its stat block (ID-126): a closed block's buttons don't repeat.
    root.querySelector<HTMLButtonElement>('.squad-plus')!.click();
    const plus = () => root.querySelector<HTMLButtonElement>(`.hud-pick-stat[${HOLD_ATTR}]`)!;
    expect(plus().getAttribute(HOLD_ATTR)).toBe('recruit-1:instinct');
    holdDown(plus, HOLD.delay + HOLD.every + 10);
    expect(spent).toEqual(['instinct', 'instinct']);
  });

  it('the Roster’s + spends a point at each repeat, held (ID-126)', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const g0 = newGame('horde');
    let g: GameState = { ...g0, roster: [vet(1)], camp: { ...g0.camp, recruits: 1 } };
    const roster = createRoster(root, {
      state: () => ({ game: g, fight: null, canSpend: true, canGear: true, resumes: false }),
      onSpend: (id, stat) => {
        g = spend(g, id, stat);
        roster.refresh();
      },
      onUnspend: () => {},
      onEquip: () => ({ ok: true }),
      onBestGuns: () => ({ ok: true, moves: [] }),
    });
    roster.open('recruit-1');
    const plus = () => document.querySelector<HTMLButtonElement>(`[${HOLD_ATTR}^="add:"]`)!;
    holdDown(plus, HOLD.delay + 2 * HOLD.every + 10);
    // Spent at once, one point a repeat: no draft to confirm.
    expect(g.roster[0]!.stats.instinct).toBe(3);
    expect(document.querySelector(`[${HOLD_ATTR}^="sub:"]`)).toBeNull();
  });

  it('the full game’s roster in the build panel', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let g: GameState = {
      ...newGame(),
      roster: newGame().roster.map((d, i) => (i === 0 ? { ...d, xp: xpForLevel(5) } : d)),
    };
    const panel = createBuildPanel(root, noop, noop, (next) => {
      g = next;
      panel.show(next, null);
    });
    panel.show(g, null);
    panel.reveal(g, 'camp');
    const plus = () =>
      root.querySelector<HTMLButtonElement>(`[${HOLD_ATTR}="${g.roster[0]!.id}:instinct"]`)!;
    expect(plus()).not.toBeNull();
    holdDown(plus, HOLD.delay + 2 * HOLD.every + 10);
    expect(g.roster[0]!.stats.instinct).toBe(3);
  });
});
