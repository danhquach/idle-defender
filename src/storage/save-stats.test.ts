// Design §12, ID-146: save version 17. Stat points are gone; an old save's points (spent,
// unspent or banked) are dropped as it loads, and each survivor's bonus comes from their
// level alone, with a one-time note. ID-084: a v12 patrol's strength no longer counts Grit.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { partyStrength, sendPatrol } from '../core/patrol.ts';
import { maxHpOf, xpForLevel } from '../core/stats.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preBank, prePick, prePoints, preStats, rolled } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const H = 3_600_000;
const read = (v: number, game: unknown) => decodeSave(JSON.stringify({ v, savedAt: NOW, game }));

/** A new game where Bob is level 3 and John level 6 (Jack stays level 1). */
function levelled(): GameState {
  const g = newGame();
  g.roster[0]!.xp = xpForLevel(3);
  g.roster[2]!.xp = xpForLevel(6) + 10;
  return g;
}

describe('save: levels give an all-round bonus, no stat points (ID-146)', () => {
  it('is version 19 (17 was ID-146’s)', () => {
    expect(SAVE_VERSION).toBe(19);
  });

  it('a v16 save with spent and unspent points loads with them dropped, and says so once', () => {
    const v16 = prePoints(levelled()) as Loose;
    // Bob has 1 point spent, the rest unspent, and 4 banked.
    expect(v16.roster[0].stats).toEqual({ instinct: 0, agility: 0, mind: 1, tinker: 0 });
    expect(v16.roster[0].banked).toBe(4);
    const loaded = read(16, v16)!;
    expect(loaded.reworked).toBe(true);
    expect(loaded.game).toEqual(rolled(levelled()));
    for (const d of loaded.game.roster) {
      expect(Object.hasOwn(d, 'stats')).toBe(false);
      expect(Object.hasOwn(d, 'banked')).toBe(false);
    }
    // Saved again, it is the new version, and loads with no note.
    const again = decodeSave(encodeSave(loaded.game, NOW))!;
    expect(again.reworked).toBeUndefined();
    expect(again.game).toEqual(loaded.game);
  });

  it("each survivor's stats match their level: nobody weaker than a fresh survivor of it", () => {
    const loaded = read(16, prePoints(levelled()))!.game;
    for (const d of loaded.roster) {
      const fresh = { ...recruit(9), loadout: d.loadout, xp: d.xp };
      expect(maxHpOf(d)).toBe(maxHpOf(fresh));
    }
    expect(maxHpOf(loaded.roster[2]!)).toBeGreaterThan(maxHpOf(loaded.roster[1]!));
  });

  it('every older version drops its points the same way', () => {
    const g = levelled();
    for (const [v, game] of [
      [15, prePick(g)],
      [13, preBank(g)],
      [12, preStats(g)],
    ] as const) {
      const loaded = read(v, game)!;
      expect(loaded, `v${v}`).not.toBeNull();
      expect(loaded.reworked, `v${v}`).toBe(true);
      expect(loaded.game.roster, `v${v}`).toEqual(rolled(g).roster);
    }
  });

  it('a save with everyone at level 1 loads with no note', () => {
    expect(read(16, prePoints(newGame()))!.reworked).toBeUndefined();
    expect(read(12, preStats(newGame()))!.reworked).toBeUndefined();
  });

  it('a reserve defender, a survivor waiting in the camp and one in a report lose theirs too', () => {
    const g = levelled();
    const reserved: GameState = { ...g, roster: g.roster.slice(1), reserve: [g.roster[0]!] };
    const json = prePoints(reserved) as Loose;
    expect(json.reserve[0].stats).toBeDefined();
    const loaded = read(16, json)!;
    expect(loaded.game.reserve).toEqual(rolled(reserved).reserve);
    expect(loaded.reworked).toBe(true);
  });

  it('an old save’s points are never read: any value there loads, and touches nothing', () => {
    const hostile = [
      null,
      'x'.repeat(1000),
      -1,
      1e300,
      [1, 2],
      { instinct: 1e9, agility: -5, mind: 0.5, tinker: 9, luck: 3 },
    ];
    for (const bad of hostile) {
      const v16 = prePoints(levelled()) as Loose;
      v16.roster[0].stats = bad;
      v16.roster[0].banked = bad;
      const loaded = read(16, v16);
      expect(loaded?.game, JSON.stringify(bad).slice(0, 40)).toEqual(rolled(levelled()));
    }
    const proto = JSON.stringify({ v: 16, savedAt: NOW, game: prePoints(levelled()) }).replace(
      '"stats":{"instinct"',
      '"stats":{"__proto__":{"polluted":1},"instinct"',
    );
    expect(proto).toContain('__proto__');
    expect(decodeSave(proto)!.game).toEqual(rolled(levelled()));
    // A prototype key on the defender itself is an unknown key: refused, old save or not.
    const top = JSON.stringify({ v: 16, savedAt: NOW, game: prePoints(levelled()) }).replace(
      '"stats":{"instinct"',
      '"__proto__":{"polluted":1},"stats":{"instinct"',
    );
    expect(decodeSave(top)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('a v17 save never holds stats or banked: either key is refused', () => {
    for (const [key, value] of [
      ['stats', { instinct: 0, agility: 0, mind: 0, tinker: 0 }],
      ['banked', 4],
    ] as const) {
      const json = JSON.parse(encodeSave(levelled(), NOW));
      json.game.roster[0][key] = value;
      expect(decodeSave(JSON.stringify(json)), key).toBeNull();
    }
    expect(decodeSave(encodeSave(levelled(), NOW))!.game).toEqual(levelled());
  });

  it("a v12 patrol out keeps a strength no higher than its party's today (Grit no longer adds)", () => {
    const g: GameState = { ...levelled(), hordeNumber: 3 };
    const r = sendPatrol(g, 'gas-station', ['bob'], 0, NOW - H);
    if (!r.ok) throw new Error(r.reason);
    const today = partyStrength([r.game.roster[0]!]);
    const v12 = preStats(r.game) as Loose;
    // The old strength counted Bob's Grit.
    v12.patrols[0].strength = today + 2;
    const loaded = read(12, v12)!;
    expect(loaded.game.patrols[0]!.strength).toBe(today);
    // A current save is never clamped: a stronger patrol than its party is refused.
    const json = JSON.parse(encodeSave(r.game, NOW));
    json.game.patrols[0].strength = today + 2;
    expect(decodeSave(JSON.stringify(json))).toBeNull();
  });
});
