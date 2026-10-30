// Design §5, as built ID-021: the perk loadout's lines and its Equip/Unequip dry runs.
import { describe, expect, it } from 'vitest';
import { PERK_IDS, PERKS, type PerkId, type ResearchId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { MAX_PERK_SLOTS, perkLines, perkText, researchText, type PerkLine } from './perks.ts';

/** A new game with `research` done and `perks` equipped (no costs: the lines only read). */
const game = (research: ResearchId[] = [], perks: PerkId[] = ['steady-fire']): GameState => ({
  ...newGame(),
  research,
  perks,
});

const texts = (lines: PerkLine[]): string[] =>
  lines.map((l) => (l.kind === 'action' ? `[${l.label}]` : l.text));
const action = (lines: PerkLine[], label: string) => {
  const line = lines.find((l) => l.kind === 'action' && l.label === label);
  if (!line || line.kind !== 'action') throw new Error(`no action ${label}`);
  return line.result;
};

describe('perk loadout lines', () => {
  it('a new game: 1 of 4 slots holding Steady Fire, the rest locked with their research', () => {
    expect(MAX_PERK_SLOTS).toBe(4);
    expect(texts(perkLines(newGame())).slice(0, 6)).toEqual([
      'Perk slots: 1 of 4',
      'Slot 1 · Steady Fire: Guns fire 15% faster',
      '[Unequip Steady Fire]',
      'Slot 2 · locked · Lab 1, 50 scrap, 50 wood',
      'Slot 3 · locked · Lab 2, 80 scrap, 80 wood, after Perk slot 2',
      'Slot 4 · locked · Lab 2, 120 scrap, 120 wood, after Perk slot 3',
    ]);
  });

  it('lists every perk in data order with its effect: equipped, or where to research it', () => {
    const lines = texts(perkLines(newGame()));
    const perks = lines.slice(lines.indexOf('Perks') + 1);
    expect(perks).toEqual([
      'Steady Fire: Guns fire 15% faster · Equipped',
      ...PERK_IDS.slice(1).map(
        (id) =>
          `${perkText(id)} · Research at the Lab · ${researchText(id as Exclude<PerkId, 'steady-fire'>)}`,
      ),
    ]);
    expect(perks).toContain(
      'Overclock: Turrets +20% damage, +10% energy use · Research at the Lab · Lab 2, 60 scrap, 40 wood, after Auto-turret',
    );
  });

  it('slots 2–4 researched: 4 of 4, the empty ones say so', () => {
    const lines = texts(perkLines(game(['perk-slot-2', 'perk-slot-3', 'perk-slot-4'])));
    expect(lines.slice(0, 6)).toEqual([
      'Perk slots: 4 of 4',
      'Slot 1 · Steady Fire: Guns fire 15% faster',
      '[Unequip Steady Fire]',
      'Slot 2 · Empty',
      'Slot 3 · Empty',
      'Slot 4 · Empty',
    ]);
  });

  it('a researched perk with full slots: Equip is refused with the core reason', () => {
    const lines = perkLines(game(['fortify']));
    expect(texts(lines)).toContain('Fortify: Barrier segments +30% max HP');
    expect(action(lines, 'Equip Fortify')).toEqual({
      ok: false,
      reason: 'All perk slots are full',
    });
  });

  it('a free slot: Equip gives the game with the perk in the next slot', () => {
    const g = game(['fortify', 'perk-slot-2']);
    const r = action(perkLines(g), 'Equip Fortify');
    expect(r.ok && r.game.perks).toEqual(['steady-fire', 'fortify']);
    expect(g.perks).toEqual(['steady-fire']); // the dry run leaves the shown game alone
    const after = texts(perkLines(r.ok ? r.game : g));
    expect(after).toContain('Slot 2 · Fortify: Barrier segments +30% max HP');
    expect(after).toContain('[Unequip Fortify]');
    expect(after).toContain('Fortify: Barrier segments +30% max HP · Equipped');
    expect(after).not.toContain('[Equip Fortify]');
  });

  it('Unequip empties the slot and the perk can be equipped again (a swap)', () => {
    const g = game(['fortify']);
    const out = action(perkLines(g), 'Unequip Steady Fire');
    if (!out.ok) throw new Error(out.reason);
    expect(out.game.perks).toEqual([]);
    const lines = perkLines(out.game);
    expect(texts(lines)).toContain('Slot 1 · Empty');
    const swapped = action(lines, 'Equip Fortify');
    expect(swapped.ok && swapped.game.perks).toEqual(['fortify']);
  });

  it('one slot node researched: slot 2 empty, slot 3 locked after it', () => {
    expect(texts(perkLines(game(['perk-slot-2']))).slice(0, 6)).toEqual([
      'Perk slots: 2 of 4',
      'Slot 1 · Steady Fire: Guns fire 15% faster',
      '[Unequip Steady Fire]',
      'Slot 2 · Empty',
      'Slot 3 · locked · Lab 2, 80 scrap, 80 wood, after Perk slot 2',
      'Slot 4 · locked · Lab 2, 120 scrap, 120 wood, after Perk slot 3',
    ]);
  });

  it('a researched perk with a free slot: its note, then an allowed Equip', () => {
    const lines = texts(perkLines(game(['rally-call', 'perk-slot-2'])));
    const at = lines.indexOf(perkText('rally-call'));
    expect(lines[at + 1]).toBe('[Equip Rally Call]');
    expect(action(perkLines(game(['rally-call', 'perk-slot-2'])), 'Equip Rally Call').ok).toBe(
      true,
    );
  });

  it('slots keep the order perks were equipped in', () => {
    const lines = texts(
      perkLines(game(['perk-slot-2', 'rally-call'], ['rally-call', 'steady-fire'])),
    );
    expect(lines.slice(1, 5)).toEqual([
      `Slot 1 · ${perkText('rally-call')}`,
      '[Unequip Rally Call]',
      `Slot 2 · ${perkText('steady-fire')}`,
      '[Unequip Steady Fire]',
    ]);
  });

  it('every perk name appears exactly once in the perk list', () => {
    const lines = texts(perkLines(newGame()));
    const perks = lines.slice(lines.indexOf('Perks') + 1);
    for (const id of PERK_IDS) {
      expect(perks.filter((t) => t.startsWith(`${PERKS[id].name}:`))).toHaveLength(1);
    }
  });
});
