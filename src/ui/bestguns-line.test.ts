// ID-188: "Best gun for everyone" arms the bench too; its line marks a bench survivor's gun.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import type { GunMove } from '../core/hordeonly.ts';
import { BEST_GUNS_NONE, BEST_GUNS_SHOWN, bestGunsLine, markBench } from './hud.ts';

const relic: OwnedWeapon = { uid: 'c', base: 'lmg', rarity: 'relic', affixes: [] };

describe('the Best gun line (ID-108, ID-188)', () => {
  it('names each new gun, a bench survivor’s marked "(bench)", squad first', () => {
    expect(
      bestGunsLine([
        { name: 'Ivan', to: relic },
        { name: 'Sam', to: 'pistol', bench: true },
      ]),
    ).toBe('Equipped: Ivan → Relic LMG · Sam (bench) → Pistol');
  });

  it('says so when nobody changed', () => {
    expect(bestGunsLine([])).toBe(BEST_GUNS_NONE);
  });
});

describe('marked by where each survivor ends (ID-188)', () => {
  const move = (id: string, bench?: true): GunMove => ({
    id,
    name: id,
    from: 'pistol',
    to: relic,
    ...(bench ? { bench } : {}),
  });

  it('a bench survivor Auto brought into the squad loses the mark; one sent to the bench gains it', () => {
    const moves = [move('a'), move('b', true)];
    // b ends in the squad, a on the bench.
    const marked = markBench(moves, new Set(['b']));
    expect(marked).toEqual([move('b'), move('a', true)]);
    expect(bestGunsLine(marked)).toBe('Equipped: b → Relic LMG · a (bench) → Relic LMG');
  });

  it('keeps the squad first, each group in its own order', () => {
    const moves = [move('x', true), move('a'), move('y', true), move('b')];
    expect(markBench(moves, new Set(['a', 'b'])).map((m) => m.id)).toEqual(['a', 'b', 'x', 'y']);
  });
});

describe('a long hand-out stays short (ID-188)', () => {
  const m = (name: string, bench?: true) => ({ name, to: relic, ...(bench ? { bench } : {}) });

  it('names the first four, then counts the rest and how many are on the bench', () => {
    expect(BEST_GUNS_SHOWN).toBe(4);
    const moves = [m('a'), m('b'), m('c'), m('d'), m('e'), m('x', true), m('y', true)];
    expect(bestGunsLine(moves)).toBe(
      'Equipped: a → Relic LMG · b → Relic LMG · c → Relic LMG · d → Relic LMG · 3 more (2 on the bench)',
    );
    expect(bestGunsLine(moves.slice(0, 5))).toMatch(/· 1 more$/);
    expect(bestGunsLine(moves.slice(0, 4))).not.toMatch(/more/);
  });
});
