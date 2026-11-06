// Design §12, ID-084: save version 13 and the stat rework. An old save's spent points come
// back as unspent points with a one-time note; points in locked Tinker are refunded too.
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { partyStrength, sendPatrol } from '../core/patrol.ts';
import { unspentPoints } from '../core/stats.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preStats } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const H = 3_600_000;
const read = (v: number, game: unknown) => decodeSave(JSON.stringify({ v, savedAt: NOW, game }));

/** A new game where Bob (level 3, 6 points) has every point spent. */
function spent(): GameState {
  const g = newGame();
  g.roster[0]!.xp = 75;
  g.roster[0]!.stats = { instinct: 2, agility: 2, mind: 2, tinker: 0 };
  return g;
}

describe('save: the stat rework (ID-084)', () => {
  it('is version 13', () => {
    expect(SAVE_VERSION).toBe(13);
  });

  it('a v12 save loads with every spent point refunded, and says so once', () => {
    const v12 = preStats(spent()) as Loose;
    expect(v12.roster[0].stats).toEqual({ aim: 2, might: 2, tech: 0, grit: 2 });
    const loaded = read(12, v12)!;
    expect(loaded.refunded).toBe(true);
    const bob = loaded.game.roster[0]!;
    expect(bob.stats).toEqual({ instinct: 0, agility: 0, mind: 0, tinker: 0 });
    expect(unspentPoints(bob)).toBe(6);
    // Saved again, it is the new version, and loads with no note.
    const again = decodeSave(encodeSave(loaded.game, NOW))!;
    expect(again.refunded).toBeUndefined();
    expect(again.game).toEqual(loaded.game);
  });

  it('a v12 save with nothing spent loads with no note', () => {
    expect(read(12, preStats(newGame()))!.refunded).toBeUndefined();
  });

  it('a v12 save is still checked: whole points, no more than earned, the old keys exactly', () => {
    const poke = (change: (stats: Loose) => void) => {
      const v12 = preStats(spent()) as Loose;
      change(v12.roster[0].stats);
      return read(12, v12);
    };
    expect(poke(() => {})).not.toBeNull();
    expect(poke((s) => (s.aim = 3))).toBeNull(); // 7 points at level 3
    expect(poke((s) => (s.aim = -1))).toBeNull();
    expect(poke((s) => (s.aim = 0.5))).toBeNull();
    expect(poke((s) => (s.aim = '1'))).toBeNull();
    expect(poke((s) => (s.luck = 0))).toBeNull();
    expect(poke((s) => delete s.grit)).toBeNull();
    // A v12 save never held the new stats, and a v13 one never holds the old.
    expect(read(12, JSON.parse(encodeSave(spent(), NOW)).game)).toBeNull();
    expect(read(SAVE_VERSION, preStats(spent()))).toBeNull();
    const proto = JSON.stringify({ v: 12, savedAt: NOW, game: preStats(spent()) }).replace(
      '"stats":{"aim"',
      '"stats":{"__proto__":{"polluted":1},"aim"',
    );
    expect(decodeSave(proto)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a reserve defender is refunded and checked the same way', () => {
    const g = spent();
    const reserved: GameState = { ...g, roster: g.roster.slice(1), reserve: [g.roster[0]!] };
    const loaded = read(12, preStats(reserved))!;
    expect(loaded.refunded).toBe(true);
    const everyone = [...loaded.game.roster, ...loaded.game.reserve];
    expect(everyone.find((d) => d.id === 'bob')!.stats).toEqual({
      instinct: 0,
      agility: 0,
      mind: 0,
      tinker: 0,
    });
    const over = preStats(reserved) as Loose;
    over.reserve[0].stats.aim = 9;
    expect(read(12, over)).toBeNull();
    const json = JSON.parse(encodeSave(reserved, NOW));
    json.game.reserve[0].stats.tinker = 1;
    expect(decodeSave(JSON.stringify(json))).toBeNull(); // 7 points at level 3
    json.game.reserve[0].stats = { instinct: 1, agility: 1, mind: 1, tinker: 3 };
    expect(decodeSave(JSON.stringify(json))!.refunded).toBe(true);
  });

  it('a save edited to put points in Tinker loads with them refunded, and says so', () => {
    const g = spent();
    const json = JSON.parse(encodeSave(g, NOW));
    json.game.roster[0].stats = { instinct: 1, agility: 1, mind: 1, tinker: 3 };
    const loaded = decodeSave(JSON.stringify(json))!;
    expect(loaded.refunded).toBe(true);
    expect(loaded.game.roster[0]!.stats).toEqual({ instinct: 1, agility: 1, mind: 1, tinker: 0 });
    expect(unspentPoints(loaded.game.roster[0]!)).toBe(3);
    // Still no more than earned in all.
    json.game.roster[0].stats = { instinct: 2, agility: 2, mind: 2, tinker: 1 };
    expect(decodeSave(JSON.stringify(json))).toBeNull();
    // A current save with no Tinker points carries no note.
    expect(decodeSave(encodeSave(g, NOW))!.refunded).toBeUndefined();
  });

  it("a v12 patrol out keeps a strength no higher than its party's today (Grit no longer adds)", () => {
    const g: GameState = { ...spent(), hordeNumber: 3 };
    const r = sendPatrol(g, 'gas-station', ['bob'], 0, NOW - H);
    if (!r.ok) throw new Error(r.reason);
    const today = partyStrength([r.game.roster[0]!]);
    const v12 = preStats(r.game) as Loose;
    // The old strength counted Bob's 2 Grit.
    v12.patrols[0].strength = today + 2;
    const loaded = read(12, v12)!;
    expect(loaded.game.patrols[0]!.strength).toBe(today);
    // A current save is never clamped: a stronger patrol than its party is refused.
    const json = JSON.parse(encodeSave(r.game, NOW));
    json.game.patrols[0].strength = today + 2;
    expect(decodeSave(JSON.stringify(json))).toBeNull();
  });
});
