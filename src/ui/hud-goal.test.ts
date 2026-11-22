// @vitest-environment jsdom
// ID-217 The next goal: one line on the start screen and a win's result naming the next boss
// horde, its radio part and any card it unlocks, or the finale; none in Endless, on a loss or
// on the ending screen. Text reaches the page only through textContent.
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

describe('nextGoalLine (ID-217)', () => {
  it('names the next boss horde not yet beaten, its part and its card', () => {
    for (const n of [1, 2, 9, 10]) expect(nextGoalLine({ hordeNumber: n })).toBe(H10);
    for (const n of [11, 15, 20]) expect(nextGoalLine({ hordeNumber: n })).toBe(H20);
    for (const n of [21, 29, 30]) expect(nextGoalLine({ hordeNumber: n })).toBe(H30);
  });

  it('is null in Endless, past the finale', () => {
    expect(nextGoalLine({ hordeNumber: FINALE_HORDE + 1 })).toBeNull();
    expect(nextGoalLine({ hordeNumber: 500 })).toBeNull();
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

  it('Endless: the chip and its line stay, and no goal line is added', () => {
    const s = squadStart(squadGame(2, 45));
    expect(s.debrief!.goal).toBeUndefined();
    expect(s.debrief!.chips[0]!.text).toBe('Endless · best 44');
    expect(s.lines.join(' ')).not.toMatch(/Next:/);
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

  it('none on a loss, on the ending screen or on an Endless win', () => {
    const g = squadGame(3, 6);
    expect(squadScreen(g, fought(g, 6, 'lost', 2)).debrief!.goal).toBeUndefined();
    const fin = squadGame(SQUAD_CAP, FINALE_HORDE);
    expect(squadScreen(fin, fought(fin, FINALE_HORDE, 'won')).debrief!.goal).toBeUndefined();
    const end = squadGame(3, 40);
    expect(squadScreen(end, fought(end, 40, 'won')).debrief!.goal).toBeUndefined();
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
    expect(root.querySelector('.debrief-goal')).toBeNull();
  });
});
