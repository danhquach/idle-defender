// Design §11, as built ID-014: the Research Lab is levelled with materials, and its
// nodes are bought with materials, each after its Lab level and earlier node.
import { describe, expect, it } from 'vitest';
import { buildSegment } from './base.ts';
import { LAB_LEVELS, RESEARCH, type ResearchId, stockOf } from './data.ts';
import { newGame, type GameState } from './game.ts';
import { labCost, research, researched, researchLock, upgradeLab } from './research.ts';

const rich = (): GameState => ({
  ...newGame(),
  stock: stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
});

function ok(r: ReturnType<typeof upgradeLab>): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

describe('Research Lab', () => {
  it('a new game has no Lab, nothing researched and Wood only', () => {
    const g = newGame();
    expect(g.lab).toBe(0);
    expect(g.research).toEqual([]);
    expect(g.tiers).toEqual(['wood']);
  });

  it('builds and upgrades for its cost, up to the top level', () => {
    let g = rich();
    g = ok(upgradeLab(g));
    expect(g.lab).toBe(1);
    expect(g.stock).toMatchObject({ scrap: 999 - 20, wood: 999 - 30 });
    g = ok(upgradeLab(g));
    expect(g.lab).toBe(2);
    expect(g.stock).toMatchObject({ scrap: 999 - 80, wood: 999 - 110 });
    expect(labCost(g)).toBeNull();
    expect(upgradeLab(g)).toEqual({ ok: false, reason: 'The Lab is at the top level' });
    expect(LAB_LEVELS).toHaveLength(2);
  });

  it('refuses when materials are short, naming the first one, and changes nothing', () => {
    const g = { ...newGame(), stock: stockOf({ scrap: 20, wood: 29, metal: 0, concrete: 0 }) };
    const before = structuredClone(g);
    expect(upgradeLab(g)).toEqual({ ok: false, reason: 'Not enough wood' });
    expect(g).toEqual(before);
  });
});

describe('research', () => {
  it('Metal walls needs a Lab, then unlocks the Metal tier for building', () => {
    let g = rich();
    expect(research(g, 'metal-walls')).toEqual({ ok: false, reason: 'Needs a Research Lab' });
    const locked = buildSegment(g.base, g.stock, g.tiers, 1, 0, 'wall', 'metal');
    expect(locked).toEqual({ ok: false, reason: 'Metal is locked' });
    g = ok(upgradeLab(g));
    g = ok(research(g, 'metal-walls'));
    expect(g.research).toEqual(['metal-walls']);
    expect(g.tiers).toEqual(['wood', 'metal']);
    expect(g.stock).toMatchObject({ scrap: 999 - 20 - 40, wood: 999 - 30 - 40 });
    g = { ...g, stock: { ...g.stock, metal: 10 } };
    expect(buildSegment(g.base, g.stock, g.tiers, 1, 0, 'wall', 'metal').ok).toBe(true);
  });

  it('Auto-turret needs Lab level 2 and Metal walls first', () => {
    let g = ok(upgradeLab(rich()));
    expect(researchLock(g, 'auto-turret')).toBe('Needs Lab level 2');
    g = ok(upgradeLab(g));
    expect(research(g, 'auto-turret')).toEqual({ ok: false, reason: 'Needs Metal walls' });
    g = ok(research(g, 'metal-walls'));
    expect(researched(g, 'auto-turret')).toBe(false);
    g = ok(research(g, 'auto-turret'));
    expect(researched(g, 'auto-turret')).toBe(true);
    expect(g.tiers).toEqual(['wood', 'metal']); // unlocks no tier
  });

  it('never twice, and a short stock refuses without paying', () => {
    let g = ok(research(ok(upgradeLab(rich())), 'metal-walls'));
    expect(research(g, 'metal-walls')).toEqual({ ok: false, reason: 'Already researched' });
    g = ok(upgradeLab(g));
    g = { ...g, stock: stockOf({ scrap: 59, wood: 99, metal: 0, concrete: 0 }) };
    expect(research(g, 'auto-turret')).toEqual({ ok: false, reason: 'Not enough scrap' });
    expect(g.research).toEqual(['metal-walls']);
  });

  it('throws on a node that does not exist, including inherited names', () => {
    for (const id of ['death-ray', '__proto__', 'constructor', 'toString']) {
      expect(() => research(rich(), id as ResearchId)).toThrow(RangeError);
    }
  });

  it('every node needs a Lab level the Lab can reach, and an earlier node that exists', () => {
    for (const node of Object.values(RESEARCH)) {
      expect(node.lab).toBeGreaterThanOrEqual(1);
      expect(node.lab).toBeLessThanOrEqual(LAB_LEVELS.length);
      if (node.needs) expect(Object.hasOwn(RESEARCH, node.needs)).toBe(true);
    }
  });
});
