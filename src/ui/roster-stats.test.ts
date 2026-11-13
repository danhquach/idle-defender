// @vitest-environment jsdom
// Design §6, ID-146: the roster shows each survivor's level line and no stat-point controls.
import { describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { rosterSection } from './roster.ts';
import { levelText } from './statlines.ts';

const NOW = 1_700_000_000_000;

describe('the roster’s level line (ID-146)', () => {
  it('shows the level and what it gives; no stat buttons, points line or Undo', () => {
    const g = newGame();
    g.roster[0]!.xp = 75; // Bob: level 3
    const root = document.createElement('div');
    root.append(...rosterSection(g, NOW, vi.fn<(next: GameState) => void>(), () => false));
    const bob = [...root.querySelectorAll('.roster-entry')].find((c) =>
      c.textContent?.startsWith('Bob'),
    )!;
    expect(bob.textContent).toContain(levelText(3));
    expect(root.querySelector('.hud-pick-stat')).toBeNull();
    expect(root.textContent).not.toMatch(/stat point|Instinct|Agility|Sharp Mind|Tinker|Undo/);
  });
});
