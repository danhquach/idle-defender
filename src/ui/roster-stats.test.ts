// @vitest-environment jsdom
// Design §6, ID-084: the roster's stat buttons: every stat, Tinker shown but locked.
import { describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { rosterSection } from './roster.ts';

const NOW = 1_700_000_000_000;

describe("the roster's stat picker (ID-084)", () => {
  it('a button per stat; Tinker is greyed out, says it unlocks later and takes no point', () => {
    const g = newGame();
    g.roster[0]!.xp = 25; // Bob: 3 points
    const onChange = vi.fn<(next: GameState) => void>();
    const root = document.createElement('div');
    root.append(...rosterSection(g, NOW, onChange, () => false));
    const bob = [...root.querySelectorAll('.roster-entry')].find((c) =>
      c.textContent?.startsWith('Bob'),
    )!;
    const buttons = [...bob.querySelectorAll<HTMLButtonElement>('.hud-pick-stat')];
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Instinct +1',
      'Agility +1',
      'Sharp Mind +1',
      'Tinker (locked)',
    ]);
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, false, true]);
    expect(bob.textContent).toContain('Tinker (unlocks later)');
    buttons[3]!.click();
    expect(onChange).not.toHaveBeenCalled();
    buttons[2]!.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].roster[0]!.stats).toEqual({
      instinct: 0,
      agility: 0,
      mind: 1,
      tinker: 0,
    });
  });
});
