// @vitest-environment jsdom
// Design §5, as built ID-021: the build panel opens the perk loadout and the roster in
// its place; Equip and Unequip hand the new game on; Back returns focus to the opener.
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { createBuildPanel } from './build.ts';

/** A panel showing `game`; every game handed on is kept in `games` and shown again. */
function panelFor(game: GameState) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const games: GameState[] = [];
  const panel = createBuildPanel(
    root,
    () => {},
    () => {},
    () => {},
    (next) => {
      games.push(next);
      panel.show(next, null);
    },
  );
  panel.show(game, null);
  const button = (label: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith(label),
    );
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };
  const title = (): string | null | undefined => root.querySelector('.build-title')?.textContent;
  return { panel, games, button, title };
}

describe('perk loadout in the build panel', () => {
  it('Perks opens the loadout with Back focused; Back returns focus to Perks', () => {
    const { button, title } = panelFor(newGame());
    button('Perks').click();
    expect(title()).toBe('Perks');
    expect(document.activeElement?.textContent).toBe('Back');
    button('Back').click();
    expect(title()).toBe('Build');
    expect(document.activeElement?.textContent).toBe('Perks');
  });

  it('Back from the roster still returns focus to Roster', () => {
    const { button, title } = panelFor(newGame());
    button('Roster').click();
    expect(title()).toBe('Roster');
    button('Back').click();
    expect(document.activeElement?.textContent).toBe('Roster');
  });

  it('Unequip, then Equip, hand on each new game and redraw the loadout', () => {
    const { button, games, title } = panelFor(newGame());
    button('Perks').click();
    button('Unequip Steady Fire').click();
    expect(games.at(-1)!.perks).toEqual([]);
    expect(title()).toBe('Perks');
    button('Equip Steady Fire').click();
    expect(games.at(-1)!.perks).toEqual(['steady-fire']);
    expect(games).toHaveLength(2);
  });

  it('a refused Equip is disabled with the reason and hands on nothing', () => {
    const { button, games } = panelFor({ ...newGame(), research: ['fortify'] });
    button('Perks').click();
    const equip = button('Equip Fortify');
    expect(equip.disabled).toBe(true);
    expect(equip.textContent).toContain('All perk slots are full');
    equip.click();
    expect(games).toEqual([]);
  });

  it('hiding the panel (a horde starts) closes the loadout', () => {
    const { panel, button, title } = panelFor(newGame());
    button('Perks').click();
    panel.hide();
    panel.show(newGame(), null);
    expect(title()).toBe('Build');
  });
});
