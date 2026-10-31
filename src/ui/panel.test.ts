// @vitest-environment jsdom
// Design §5, as built ID-021: the build panel opens the perk loadout and the roster in
// its place; Equip and Unequip hand the new game on; Back returns focus to the opener.
import { describe, expect, it } from 'vitest';
import { buildSegment, type Base } from '../core/base.ts';
import { stockOf } from '../core/data.ts';
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
    const g = { ...newGame(), research: ['fortify' as const] };
    g.perkLevels.fortify = 1; // researched perks are owned
    const { button, games } = panelFor(g);
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

describe('gates in the build menu (ID-026)', () => {
  /** The panel on `game` with slot `column`, `row` picked; each build is kept in `built`. */
  function slotPanel(game: GameState, column: number, row: number) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const built: Base[] = [];
    const panel = createBuildPanel(
      root,
      (base) => built.push(base),
      () => {},
      () => {},
    );
    panel.show(game, { column, row, what: 'segment' });
    const button = (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
    return { built, button };
  }

  it('builds a gate on an empty slot of a new layer', () => {
    const { built, button } = slotPanel(newGame(), 1, 2);
    const gate = button('Wood gate')!;
    expect(gate.disabled).toBe(false);
    gate.click();
    expect(built[0]!.layers.find((l) => l.column === 1)!.slots[2]!.kind).toBe('gate');
    // Locked tiers say so, as walls do, with the kit's lock badge (ID-056).
    expect(button('Metal gate')!.disabled).toBe(true);
    expect(button('Metal gate')!.classList.contains('btn-locked')).toBe(true);
    expect(button('Metal gate')!.querySelector('.btn-lock')).not.toBeNull();
  });

  it('shows an option the stock can’t pay for as unaffordable, its cost in red (ID-056)', () => {
    const { button } = slotPanel({ ...newGame(), stock: stockOf() }, 1, 2);
    const gate = button('Wood gate')!;
    expect(gate.disabled).toBe(true);
    expect(gate.classList.contains('btn-unaffordable')).toBe(true);
    expect(gate.querySelector('.btn-lock')).toBeNull();
    // Only what the stock can't pay turns red; the reason moves to the tooltip.
    const cost = gate.querySelector('.btn-cost')!;
    expect([...cost.querySelectorAll('.btn-cost-short')].map((n) => n.textContent)).toEqual(
      [...cost.querySelectorAll('span')].map((n) => n.textContent),
    );
    expect(gate.querySelector('.btn-reason')).toBeNull();
    expect(gate.title).toMatch(/^Not enough /);
  });

  it('offers no gate on a layer that has one', () => {
    const g = newGame();
    const r = buildSegment(g.base, g.stock, g.tiers, 1, 0, 'gate', 'wood');
    if (!r.ok) throw new Error(r.reason);
    const { button } = slotPanel({ ...g, base: r.base, stock: r.stock }, 1, 1);
    expect(button('Wood gate')).toBeUndefined();
    expect(button('Wood wall')!.disabled).toBe(false);
  });
});
