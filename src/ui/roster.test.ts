// Design §6: the roster screen's lines and loadout options.
import { describe, expect, it } from 'vitest';
import { type Stats } from '../core/data.ts';
import { newGame, type RosterDefender } from '../core/game.ts';
import { NO_STATS } from '../core/stats.ts';
import { BADGE_COLOUR } from './render.ts';
import {
  badgeStyle,
  ITEM_OPTIONS,
  optionFor,
  pipText,
  PRIMARY_OPTIONS,
  restLeft,
  rosterEntry,
  SECONDARY_OPTIONS,
} from './roster.ts';

const NOW = 1_700_000_000_000;
const jack = (d: Partial<RosterDefender> = {}, stats: Partial<Stats> = {}): RosterDefender => ({
  ...newGame().roster[1]!,
  ...d,
  stats: { ...NO_STATS, ...stats },
});

describe('roster entry', () => {
  it('a new defender: level 1, no stats, no titles, no points, fit', () => {
    expect(rosterEntry(jack(), NOW)).toEqual({
      label: 'Jack — Ripper',
      level: 'level 1 · 0/25 XP',
      stats: 'Aim 0 · Might 0 · Tech 0 · Grit 0',
      titles: 'No titles yet',
      points: '',
      status: 'Fit',
    });
  });

  it('shows level progress, unspent points and every title held', () => {
    // Level 3 needs 75 XP; 95 is 20 into the 75 that level 4 costs. 6 points earned.
    const e = rosterEntry(jack({ xp: 95 }, { might: 5 }), NOW);
    expect(e.level).toBe('level 3 · 20/75 XP');
    expect(e.points).toBe('1 stat point to spend');
    expect(rosterEntry(jack({ xp: 95 }), NOW).points).toBe('6 stat points to spend');
    const titled = jack({ xp: 1e6 }, { aim: 10, might: 25 });
    expect(rosterEntry(titled, NOW)).toMatchObject({
      label: 'Jack the Ripper — Ripper',
      titles: 'Junior Gunner, Adept Ripper',
    });
  });

  it('all points spent: no picker line', () => {
    expect(rosterEntry(jack({ xp: 25 }, { grit: 3 }), NOW).points).toBe('');
  });

  it('a resting defender says how long is left, rounded up to the minute', () => {
    const resting = jack({ injuredUntil: NOW + 72 * 60_000 });
    expect(rosterEntry(resting, NOW).status).toBe('Resting · 1h 12m left');
    expect(rosterEntry(jack({ injuredUntil: NOW }), NOW).status).toBe('Fit');
    expect(restLeft(NOW + 1, NOW)).toBe('1m');
    expect(restLeft(NOW + 59 * 60_000 + 1, NOW)).toBe('1h 0m');
    expect(restLeft(NOW + 2 * 3_600_000, NOW)).toBe('2h 0m');
  });
});

describe('loadout options', () => {
  it('guns as primary; none, a sidearm, blade or tool as secondary; none or a shield as item', () => {
    expect(PRIMARY_OPTIONS).toEqual(['pistol']);
    expect(SECONDARY_OPTIONS).toEqual([null, 'pistol', 'knife', 'toolkit']);
    expect(ITEM_OPTIONS).toEqual([null, 'shield']);
  });

  it('one pip per rank', () => {
    expect([1, 2, 3, 4].map(pipText)).toEqual(['●', '●●', '●●●', '●●●●']);
  });

  it('a picker value maps back to one of our options, or to nothing', () => {
    expect(optionFor(PRIMARY_OPTIONS, 'pistol')).toBe('pistol');
    expect(optionFor(SECONDARY_OPTIONS, '')).toBeNull();
    expect(optionFor(ITEM_OPTIONS, '')).toBeNull();
    expect(optionFor(ITEM_OPTIONS, 'shield')).toBe('shield');
    // A primary is never none; edited values never match.
    for (const raw of [
      '',
      '__proto__',
      'constructor',
      'toString',
      'Pistol',
      ' pistol',
      'pist\u043el', // Cyrillic о
      'pis\u200btol', // zero-width space
      'shield',
      'a'.repeat(100_000),
    ]) {
      expect(optionFor(PRIMARY_OPTIONS, raw), raw.slice(0, 20)).toBeUndefined();
    }
    expect(optionFor(SECONDARY_OPTIONS, 'kn\u0456fe')).toBeUndefined(); // Cyrillic і
    expect(optionFor(ITEM_OPTIONS, '__proto__')).toBeUndefined();
  });
});

describe('title badge', () => {
  it("the top title's colour, its pips and its name; none without a title", () => {
    expect(badgeStyle({ ...NO_STATS })).toBeNull();
    expect(badgeStyle({ ...NO_STATS, grit: 300, aim: 9 })).toBeNull();
    expect(badgeStyle({ ...NO_STATS, aim: 25 })).toEqual({
      colour: BADGE_COLOUR.gunner,
      pips: '●●',
      title: 'Adept Gunner',
    });
    expect(badgeStyle({ ...NO_STATS, might: 100, tech: 50 })).toEqual({
      colour: BADGE_COLOUR.ripper,
      pips: '●●●●',
      title: 'Legendary Ripper',
    });
    expect(badgeStyle({ ...NO_STATS, tech: 10 })?.title).toBe('Junior Engineer');
  });
});
