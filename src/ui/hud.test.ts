import { describe, expect, it } from 'vitest';
import { newHorde, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { fallingText, payoutText, resultLines, statusText, stockText } from './hud.ts';

const horde = (): HordeState => newHorde(1, setup());

describe('hud', () => {
  it('shows horde, wave and level', () => {
    const s = horde();
    s.xp = 4;
    expect(statusText(s)).toBe(`Horde 1 · Wave 1/${s.waveCount} · Lv 1 (4/10)`);
  });

  it('lists amounts in material order, skipping zeros', () => {
    expect(stockText({ wood: 10, scrap: 5 })).toBe('5 scrap, 10 wood');
    expect(stockText({ scrap: 0, wood: 0, metal: 0, concrete: 0 })).toBe('nothing');
  });

  it('shows the payout once the horde is over', () => {
    const s = horde();
    expect(payoutText(s)).toBe('');
    s.outcome = 'won';
    expect(payoutText(s)).toBe('Payout: 20 scrap, 30 wood');
    s.outcome = 'lost';
    expect(payoutText(s)).toBe('Payout: 1 scrap, 1 wood');
  });

  it('result lines: XP per defender on a win, the injured either way', () => {
    const s = horde();
    expect(resultLines(s)).toEqual([]);
    s.injured.push({
      defender: { id: 'b', name: 'B', weapon: 'pistol' },
      postId: 1,
      at: 0,
      offered: true,
    });
    s.bench = s.bench.filter((d) => d.id !== 'b');
    s.tookPart.push('b');
    s.outcome = 'won';
    expect(resultLines(s)).toEqual(['A +15 XP', 'B +15 XP · injured']);
    s.outcome = 'lost';
    expect(resultLines(s)).toEqual(['No XP on a loss', 'B · injured']);
  });

  it('counts down while the camp is falling', () => {
    const s = horde();
    expect(fallingText(s)).toBe('');
    s.fallingFor = 0.2;
    expect(fallingText(s)).toBe('The camp is falling — 10 s');
    s.fallingFor = 9.5;
    expect(fallingText(s)).toBe('The camp is falling — 1 s');
    s.outcome = 'lost';
    expect(fallingText(s)).toBe('');
  });
});
