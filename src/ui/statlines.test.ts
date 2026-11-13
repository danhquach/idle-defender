// ID-146: what a survivor's level gives, as the survivor card's one line.
import { describe, expect, it } from 'vitest';
import { levelGains, LEVEL_ONE_SHORT, LEVEL_ONE_TEXT, levelText } from './statlines.ts';

const num = (s: string): number => Number(/[\d.]+/.exec(s)![0]);

describe('the level line (ID-146)', () => {
  it('level 1 gives nothing yet', () => {
    expect(levelGains(1)).toEqual([]);
    expect(levelText(1)).toBe(LEVEL_ONE_TEXT);
  });

  it('a higher level lists all six bonuses', () => {
    const gains = levelGains(7);
    expect(gains).toHaveLength(6);
    // One "+X stat" pattern, each bonus kept whole on a line (non-breaking spaces).
    expect(gains[0]).toMatch(/^\+\d+\u00a0HP$/);
    expect(gains[1]).toMatch(/^\+\d\.\d\u00a0armour$/);
    expect(gains[2]).toMatch(/^\+\d+\.\d%\u00a0fire\u00a0rate$/);
    expect(gains[3]).toMatch(/^\+\d+\.\d%\u00a0reload\u00a0speed$/);
    expect(gains[4]).toMatch(/^\+\d+\.\d%\u00a0accuracy$/);
    expect(gains[5]).toMatch(/^\+\d+\.\d%\u00a0crit$/);
    expect(levelText(7)).toBe(gains.join('\u00a0· '));
    // No "Lv N:" prefix: the card and the Roster show the level already.
    expect(levelText(7)).not.toMatch(/Lv/);
  });

  it('a squad card gets short labels, still one "+X stat" pattern (ID-146)', () => {
    expect(levelText(7, true)).toBe(levelGains(7, true).join('\u00a0· '));
    expect(levelGains(7, true).map((g) => g.split('\u00a0')[1])).toEqual([
      'HP',
      'arm',
      'fire',
      'reload',
      'aim',
      'crit',
    ]);
    // Shorter than the Roster's line, at any level shown.
    for (const l of [2, 7, 25, 60]) {
      expect(levelText(l, true).length).toBeLessThan(levelText(l).length);
      expect(levelText(l, true).length).toBeLessThanOrEqual(80);
    }
    expect(levelText(1, true)).toBe(LEVEL_ONE_SHORT);
  });

  it('pins the real numbers: level 7 as in the design table (§6 Stats)', () => {
    const n = (s: string) => s.replaceAll('\u00a0', ' ');
    expect(n(levelText(7))).toBe(
      '+14 HP · +0.5 armour · +6.9% fire rate · +6.9% reload speed · +6.9% accuracy · +4.6% crit',
    );
    expect(n(levelText(7, true))).toBe(
      '+14 HP · +0.5 arm · +6.9% fire · +6.9% reload · +6.9% aim · +4.6% crit',
    );
  });

  it('every bonus grows with level', () => {
    const low = levelGains(3);
    const high = levelGains(20);
    low.forEach((g, i) => expect(num(high[i]!)).toBeGreaterThan(num(g)));
  });

  it('prints no stat-point words', () => {
    expect(levelText(12)).not.toMatch(/point|Instinct|Agility|Sharp Mind|Tinker/);
  });
});
