import { describe, expect, it } from 'vitest';
import { newBase } from '../core/base.ts';
import { newHorde } from '../core/horde.ts';
import { statusText } from './hud.ts';

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
});
