// @vitest-environment jsdom
// ID-217 The next goal: one line on the start screen and a win's result naming the next boss
// horde, its radio part and any card it unlocks, or the finale; past it the next mode to unlock
// (ID-218); none on a loss or on the ending screen. Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { FINALE_HORDE, SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { createHud, nextGoalLine, squadScreen, squadStart } from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function squadGame(n: number, horde: number): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
  };
}
const fought = (g: GameState, n: number, outcome: 'won' | 'lost', wave = 1) => ({
  ...startSquadHorde(g, 1, NOW, n),
  outcome,
  wave,
});

const H10 = 'Next: Horde 10 boss · radio part 1/3 · new card Heavy Rounds';
const H20 = 'Next: Horde 20 boss · radio part 2/3 · new card Field Repairs';
const H30 = 'Next: Horde 30 · call the evacuation';
const UNLOCK_N = 'Next: hold Horde 50 · unlocks Nightmare';
const UNLOCK_H = 'Next: hold Horde 50 · unlocks Hell';

describe('nextGoalLine (ID-217)', () => {
  it('names the next boss horde not yet beaten, its part and its card', () => {
    for (const n of [1, 2, 9, 10]) expect(nextGoalLine({ hordeNumber: n })).toBe(H10);
    for (const n of [11, 15, 20]) expect(nextGoalLine({ hordeNumber: n })).toBe(H20);
    for (const n of [21, 29, 30]) expect(nextGoalLine({ hordeNumber: n })).toBe(H30);
  });

  it('past the finale it names the next mode to unlock, until it is open (ID-218)', () => {
    for (const n of [FINALE_HORDE + 1, 45, 50])
      expect(nextGoalLine({ hordeNumber: n })).toBe(UNLOCK_N);
    expect(nextGoalLine({ hordeNumber: 51 })).toBeNull();
    expect(nextGoalLine({ hordeNumber: 500 })).toBeNull();
  });

  it('on Nightmare it names Hell; on Hell, nothing (ID-218)', () => {
    const nm = (n: number) => ({
      hordeNumber: 60,
      mode: 'nightmare' as const,
      modes: { nightmare: n },
    });
    for (const n of [1, 30, 50]) expect(nextGoalLine(nm(n))).toBe(UNLOCK_H);
    expect(nextGoalLine(nm(51))).toBeNull();
    const hell = { hordeNumber: 60, mode: 'hell' as const, modes: { nightmare: 60, hell: 3 } };
    expect(nextGoalLine(hell)).toBeNull();
  });
});

describe('the goal line on the panel (ID-217)', () => {
  it('the start screen: one goal line, whichever horde is picked', () => {
    const g = squadGame(2, 12);
    expect(squadStart(g).debrief!.goal).toBe(H20);
    // A replay of the boss already beaten names the goal ahead, not the one replayed.
    expect(squadStart(g, 10).debrief!.goal).toBe(H20);
    expect(squadStart(g).lines).toContain(H20);
  });

  it('Endless: the chip and its line stay, and the goal is the next mode (ID-218)', () => {
    const s = squadStart(squadGame(2, 45));
    expect(s.debrief!.goal).toBe(UNLOCK_N);
    expect(s.debrief!.chips[0]!.text).toBe('Endless · best 44');
    expect(s.lines.at(-1)).toBe(UNLOCK_N);
    // With Nightmare open the goal is gone.
    expect(squadStart(squadGame(2, 60)).debrief!.goal).toBeUndefined();
  });

  it("a win's result names the goal once the win has counted", () => {
    const g = squadGame(3, 9);
    expect(squadScreen(g, fought(g, 9, 'won')).debrief!.goal).toBe(H10);
    const boss = squadGame(3, 10);
    const s = squadScreen(boss, fought(boss, 10, 'won'));
    expect(s.debrief!.goal).toBe(H20);
    expect(s.lines).toContain(H20);
    const last = squadGame(3, 29);
    expect(squadScreen(last, fought(last, 29, 'won')).debrief!.goal).toBe(H30);
  });

  it('a replayed boss win names the next goal not yet reached, never the horde replayed', () => {
    const g = squadGame(3, 15);
    expect(squadScreen(g, fought(g, 10, 'won')).debrief!.goal).toBe(H20);
  });

  it('none on a loss or on the ending screen; an Endless win names the next mode', () => {
    const g = squadGame(3, 6);
    expect(squadScreen(g, fought(g, 6, 'lost', 2)).debrief!.goal).toBeUndefined();
    const fin = squadGame(SQUAD_CAP, FINALE_HORDE);
    expect(squadScreen(fin, fought(fin, FINALE_HORDE, 'won')).debrief!.goal).toBeUndefined();
    const end = squadGame(3, 40);
    expect(squadScreen(end, fought(end, 40, 'won')).debrief!.goal).toBe(UNLOCK_N);
    const open = squadGame(3, 60);
    expect(squadScreen(open, fought(open, 60, 'won')).debrief!.goal).toBeUndefined();
  });

  it('reaches the page as one plain-text line', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.showResult(squadStart(squadGame(2, 1)));
    const lines = root.querySelectorAll('.debrief-goal');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe(H10);
    expect(lines[0]!.children).toHaveLength(0);
    h.showResult(squadStart(squadGame(2, 45)));
    expect(root.querySelector('.debrief-goal')!.textContent).toBe(UNLOCK_N);
    h.showResult(squadStart(squadGame(2, 60)));
    expect(root.querySelector('.debrief-goal')).toBeNull();
  });
});
