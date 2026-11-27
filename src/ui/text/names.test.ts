// Names built from ids and numbers (ID-269), pinned to the text core gave before it moved.
import { describe, expect, it } from 'vitest';
import { ENEMY_TRAITS, PERK_IDS, RESEARCH_IDS } from '../../core/data.ts';
import {
  entryName,
  hordeName,
  PERK_NAME,
  placeName,
  RESEARCH_NAME,
  restLabel,
  traitName,
  unlockHint,
} from './names.ts';

describe('name tables (ID-269)', () => {
  it('every perk and research node has a name; every enemy trait one too', () => {
    for (const id of PERK_IDS) expect(PERK_NAME[id].length).toBeGreaterThan(0);
    for (const id of RESEARCH_IDS) expect(RESEARCH_NAME[id].length).toBeGreaterThan(0);
    for (const [kind, t] of Object.entries(ENEMY_TRAITS)) {
      expect(traitName(kind as keyof typeof ENEMY_TRAITS) !== '').toBe(t !== null);
    }
  });
});

describe('names (ID-269)', () => {
  it('a horde by mode and number, and what unlocks a mode', () => {
    expect(hordeName('normal', 12)).toBe('Normal 12');
    expect(hordeName('nightmare', 30)).toBe('Nightmare 30');
    expect(hordeName('hell', 15)).toBe('Hell 15');
    expect(unlockHint('normal')).toBe('');
    expect(unlockHint('nightmare')).toBe('Hold Normal 50 to unlock Nightmare');
    expect(unlockHint('hell')).toBe('Hold Nightmare 50 to unlock Hell');
  });

  it('a rest, singular and plural', () => {
    expect(restLabel(1)).toBe('Resting: 1 horde');
    expect(restLabel(2)).toBe('Resting: 2 hordes');
    expect(restLabel(0)).toBe('Resting: 0 hordes');
  });

  it('a patrol place: a location or a plaza', () => {
    expect(placeName('gas-station')).toBe('Gas station');
    expect(placeName('crater')).toBe('The crater');
    expect(placeName('riverside')).toBe('Riverside Plaza');
  });

  it('a research queue entry: a node, or a perk level', () => {
    expect(entryName('auto-turret', null)).toBe('Auto-turret');
    expect(entryName('level-steady-fire', 3)).toBe('Steady Fire level 3');
    expect(entryName('level-fortify', 2)).toBe('Fortify level 2');
  });
});
