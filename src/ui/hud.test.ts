import { describe, expect, it } from 'vitest';
import { newBase } from '../core/base.ts';
import { newHorde } from '../core/horde.ts';
import { payoutText, statusText, stockText } from './hud.ts';

describe('hud', () => {
  it('shows horde, wave, camp and level', () => {
    const s = newHorde(1, {
      hordeNumber: 1,
      roster: [{ id: 'a', name: 'A', weapon: 'pistol' }],
      startDefenderId: 'a',
      base: newBase(),
      startPostId: 0,
    });
    s.camp.hp = 432.5;
    s.xp = 4;
    expect(statusText(s)).toBe(`Horde 1 · Wave 1/${s.waveCount} · Camp 433/500 · Lv 1 (4/10)`);
  });

  it('lists amounts in material order, skipping zeros', () => {
    expect(stockText({ wood: 10, scrap: 5 })).toBe('5 scrap, 10 wood');
    expect(stockText({ scrap: 0, wood: 0, metal: 0, concrete: 0 })).toBe('nothing');
  });

  it('shows the payout once the horde is over', () => {
    const s = newHorde(1, {
      hordeNumber: 1,
      roster: [{ id: 'a', name: 'A', weapon: 'pistol' }],
      startDefenderId: 'a',
      base: newBase(),
      startPostId: 0,
    });
    expect(payoutText(s)).toBe('');
    s.outcome = 'won';
    expect(payoutText(s)).toBe('Payout: 20 scrap, 30 wood');
    s.outcome = 'lost';
    expect(payoutText(s)).toBe('Payout: 5 scrap, 7 wood');
  });
});
