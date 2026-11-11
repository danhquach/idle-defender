// ID-096: what a stat's next point adds, one line per active effect (STAT_ACTIVE), shown
// on the survivor card, the result screen and in each + button's hint.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { STAT_ACTIVE, STAT_EFFECT, type Stats } from '../core/data.ts';
import type { RosterDefender } from '../core/game.ts';
import { xpForLevel } from '../core/stats.ts';
import { statHint, STAT_HINT } from './hud.ts';
import { effectChange, nextGains, nextPointText } from './statlines.ts';

const at = (s: Partial<Stats> = {}): RosterDefender => ({
  ...recruit(1),
  xp: xpForLevel(5),
  stats: { instinct: 0, agility: 0, mind: 0, tinker: 0, ...s },
});

describe('the next point, per active effect (ID-096)', () => {
  it('one gain per active effect, in STAT_ACTIVE order', () => {
    for (const stat of ['instinct', 'agility', 'mind'] as const) {
      expect(nextGains(at(), stat)).toHaveLength(STAT_ACTIVE[stat].length);
      expect(effectChange(at(), stat)).toHaveLength(STAT_ACTIVE[stat].length);
    }
    expect(nextGains(at(), 'instinct')).toEqual([
      '+2 max HP',
      '+0.10 armour',
      '+0.7% survive',
      `+${((100 * STAT_EFFECT.wallDamage) / 41).toFixed(1)}% damage near the wall`,
    ]);
    expect(nextGains(at(), 'agility')[1]).toBe(
      `+${((100 * STAT_EFFECT.fireRate) / 21).toFixed(1)}% fire rate`,
    );
    // Crit chance: the cap over 31 (one point, three effects).
    expect(nextGains(at(), 'mind')[0]).toBe(
      `+${((100 * STAT_EFFECT.crit) / 31).toFixed(1)}% crit chance`,
    );
    expect(nextGains(at(), 'mind')[1]).toBe('+×0.06 crit damage');
    // Faster reload and a narrower cone read as gains, not minuses.
    expect(nextGains(at(), 'agility')[0]).toMatch(/^\d\.\d\d s faster reload$/);
    expect(nextGains(at(), 'mind')[2]).toMatch(/^\d\.\d\d° tighter spread$/);
  });

  it('each point adds less than the one before', () => {
    const hp = (d: RosterDefender) => Number(/^\+(\d+)/.exec(nextGains(d, 'instinct')[0]!)![1]);
    expect(hp(at())).toBeGreaterThanOrEqual(hp(at({ instinct: 30 })));
    expect(hp(at({ instinct: 30 }))).toBeLessThan(3);
  });

  it('Tinker, locked, has no effect lines and no next point', () => {
    expect(nextGains(at(), 'tinker')).toEqual([]);
    expect(effectChange(at(), 'tinker')).toEqual([]);
    expect(nextPointText(at(), 'tinker')).toBe('');
    expect(statHint(at(), 'tinker')).toBe(STAT_HINT.tinker);
  });

  it('a + button’s hint: what the stat does, then what the next point adds', () => {
    expect(nextPointText(at(), 'instinct')).toMatch(
      /^Next point: \+2 max HP · \+0\.10 armour · \+0\.7% survive · \+\d\.\d% damage near the wall$/,
    );
    expect(statHint(at(), 'agility')).toMatch(
      /^Faster reloads and faster fire with every gun\. Next point: \d\.\d\d s faster reload · \+\d\.\d% fire rate$/,
    );
  });
});

describe('effects with drafted points (ID-108)', () => {
  it('now → with n more points; by default one more', () => {
    const d = at({ agility: 1 });
    const [one] = effectChange(d, 'agility');
    expect(`${one!.label} ${one!.from} → ${one!.to}`).toMatch(/^Reload \d\.\d\d s → \d\.\d\d s$/);
    expect(effectChange(d, 'agility', 1)).toEqual(effectChange(d, 'agility'));
    const [three] = effectChange(d, 'agility', 3);
    expect(three!.from).toBe(one!.from);
    // More points, a faster reload: the printed number falls.
    expect(parseFloat(three!.to)).toBeLessThan(parseFloat(one!.to));
    expect(effectChange(d, 'tinker', 2)).toEqual([]);
    expect(effectChange(d, 'instinct', 2)).toHaveLength(STAT_ACTIVE.instinct.length);
  });
});
