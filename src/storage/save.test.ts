import { describe, expect, it } from 'vitest';
import { RECOVERY_MS } from '../core/data.ts';
import { newGame, recover } from '../core/game.ts';
import {
  decodeSave,
  encodeSave,
  loadSave,
  MAX_SAVE_CHARS,
  REJECTED_KEY,
  SAVE_KEY,
  writeSave,
  type SaveStorage,
} from './save.ts';
import { NOW, played } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** The JSON of a valid save of `played()`, changed by `change`, run through decodeSave. */
function hostile(change: (save: { v: unknown; savedAt: unknown; game: Loose }) => void): unknown {
  const save = JSON.parse(encodeSave(played(), NOW));
  change(save);
  return decodeSave(JSON.stringify(save));
}

function memory(): SaveStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, v),
  };
}

describe('save', () => {
  it('round-trips a new game and a played one exactly', () => {
    for (const game of [newGame(), played()]) {
      const save = decodeSave(encodeSave(game, NOW));
      expect(save).toEqual({ game, savedAt: NOW });
    }
    const g = played();
    expect(g.roster[0]!.injuredUntil).not.toBeNull();
    expect(g.base.layers[0]!.slots[0]!.hp).toBe(124); // a horde leaves whole HP
  });

  it('keeps an injury resting across a reload: real time decides, not the session', () => {
    const save = decodeSave(encodeSave(played(), NOW))!;
    const until = save.game.roster[0]!.injuredUntil!;
    expect(recover(save.game, until - 1)).toBe(save.game);
    expect(recover(save.game, until).roster[0]!.injuredUntil).toBeNull();
  });

  it('writes and loads through storage', () => {
    const s = memory();
    expect(loadSave(s)).toEqual({ save: null, rejected: false });
    expect(writeSave(s, played(), NOW)).toBe(true);
    expect(loadSave(s)).toEqual({ save: { game: played(), savedAt: NOW }, rejected: false });
  });

  it('keeps an unreadable save aside instead of losing it', () => {
    const s = memory();
    s.items.set(SAVE_KEY, '{"v":1,"broken"');
    expect(loadSave(s)).toEqual({ save: null, rejected: true });
    expect(s.items.get(REJECTED_KEY)).toBe('{"v":1,"broken"');
    // A huge value is not ours and isn't copied.
    s.items.delete(REJECTED_KEY);
    s.items.set(SAVE_KEY, 'x'.repeat(MAX_SAVE_CHARS + 1));
    expect(loadSave(s).rejected).toBe(true);
    expect(s.items.has(REJECTED_KEY)).toBe(false);
  });

  it('survives storage that throws on every call', () => {
    const blocked: SaveStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadSave(blocked)).toEqual({ save: null, rejected: false });
    expect(writeSave(blocked, newGame(), NOW)).toBe(false);
  });

  describe('refuses hostile or broken saves', () => {
    it('anything not a save', () => {
      for (const raw of [
        null,
        42,
        '',
        'null',
        '[]',
        '"save"',
        '{}',
        'not json',
        '{"v":1,"savedAt":0,"game":{}}',
        'x'.repeat(MAX_SAVE_CHARS + 1),
      ]) {
        expect(decodeSave(raw)).toBeNull();
      }
    });

    it('a wrong version, time or extra key at the top', () => {
      expect(hostile((s) => (s.v = 2))).toBeNull();
      expect(hostile((s) => (s.v = '1'))).toBeNull();
      expect(hostile((s) => (s.savedAt = -1))).toBeNull();
      expect(hostile((s) => (s.savedAt = 1.5))).toBeNull();
      expect(hostile((s) => (s.savedAt = 1e14))).toBeNull();
      expect(hostile((s) => Object.assign(s, { extra: 1 }))).toBeNull();
    });

    it('prototype keys anywhere, without polluting Object.prototype', () => {
      const raws = [
        '{"__proto__":{"polluted":1},"v":1}',
        encodeSave(played(), NOW).replace(
          '"hordeNumber"',
          '"__proto__":{"polluted":1},"hordeNumber"',
        ),
        encodeSave(played(), NOW).replace('"scrap"', '"constructor":{"polluted":1},"scrap"'),
        encodeSave(played(), NOW).replace('"xp"', '"prototype":{},"xp"'),
      ];
      for (const raw of raws) expect(decodeSave(raw)).toBeNull();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('numbers out of range, fractional, as text or overflowing to Infinity', () => {
      expect(hostile((s) => (s.game.hordeNumber = 0))).toBeNull();
      expect(hostile((s) => (s.game.hordeNumber = 2.5))).toBeNull();
      expect(hostile((s) => (s.game.hordeNumber = '3'))).toBeNull();
      expect(hostile((s) => (s.game.stock.scrap = -1))).toBeNull();
      expect(hostile((s) => (s.game.stock.wood = 1e13))).toBeNull();
      expect(hostile((s) => (s.game.stock.metal = 0.5))).toBeNull();
      expect(hostile((s) => (s.game.roster[1].xp = -5))).toBeNull();
      expect(
        decodeSave(encodeSave(played(), NOW).replace('"hordeNumber":1', '"hordeNumber":1e999')),
      ).toBeNull();
    });

    it('a stock with a missing or unknown material', () => {
      expect(hostile((s) => delete s.game.stock.concrete)).toBeNull();
      expect(hostile((s) => (s.game.stock.gold = 1))).toBeNull();
    });

    it('tiers that are unknown, look-alike, padded or repeated', () => {
      expect(hostile((s) => (s.game.tiers = ['wood', 'gold']))).toBeNull();
      expect(hostile((s) => (s.game.tiers = ['wооd']))).toBeNull(); // Cyrillic o
      expect(hostile((s) => (s.game.tiers = ['wood ']))).toBeNull();
      expect(hostile((s) => (s.game.tiers = ['wood', 'metal', 'metal']))).toBeNull();
      expect(hostile((s) => (s.game.tiers = []))).toBeNull();
    });

    it('segments the build rules never make', () => {
      const seg = (s: Loose, column: number, row: number) => s.game.base.layers[column].slots[row];
      expect(hostile((s) => (seg(s, 0, 0).hp = -1))).toBeNull();
      expect(hostile((s) => (seg(s, 0, 0).hp = 10.5))).toBeNull();
      expect(hostile((s) => (seg(s, 0, 0).hp = 1e13))).toBeNull();
      expect(hostile((s) => (seg(s, 0, 0).kind = 'tower'))).toBeNull();
      // A second gate, with a gate's HP so only the gate rule can refuse it.
      expect(
        hostile((s) => Object.assign(seg(s, 0, 1), { kind: 'gate', hp: 150, maxHp: 150 })),
      ).toBeNull();
      expect(hostile((s) => (s.game.tiers = ['wood']))).toBeNull(); // metal wall, metal locked
      expect(hostile((s) => s.game.base.layers[0].slots.push(null))).toBeNull();
      expect(
        hostile((s) => (s.game.base.layers[0].slots = [null, null, null, null, null])),
      ).toBeNull();
    });

    it('layers out of order, repeated, off the grid or missing', () => {
      expect(hostile((s) => s.game.base.layers.reverse())).toBeNull();
      expect(hostile((s) => (s.game.base.layers[1].column = 0))).toBeNull();
      expect(hostile((s) => (s.game.base.layers[1].column = 3))).toBeNull();
      expect(hostile((s) => (s.game.base.layers = []))).toBeNull();
    });

    it('posts unknown, repeated, out of order, off the grid or with no wall', () => {
      const posts = (s: Loose) => s.game.base.posts;
      expect(hostile((s) => (posts(s)[0].kind = 'turret'))).toBeNull();
      expect(hostile((s) => posts(s).push({ ...posts(s)[0] }))).toBeNull();
      expect(hostile((s) => posts(s).reverse())).toBeNull();
      expect(hostile((s) => (posts(s)[0].row = 5))).toBeNull();
      expect(hostile((s) => posts(s).push({ kind: 'tower', column: 2, row: 0 }))).toBeNull();
      expect(hostile((s) => posts(s).push({ kind: 'wall-walk', column: 1, row: 1 }))).toBeNull();
    });

    it('roster entries that are hostile text, repeated, unknown or resting too long', () => {
      const bob = (s: Loose) => s.game.roster[0];
      expect(hostile((s) => (s.game.roster = []))).toBeNull();
      expect(hostile((s) => s.game.roster.push({ ...bob(s) }))).toBeNull(); // same id
      expect(hostile((s) => (bob(s).weapon = 'railgun'))).toBeNull();
      // Weapon ids match exactly: no case, padding, look-alikes or prototype names.
      for (const weapon of [
        'Knife',
        ' knife',
        'knife ',
        'kn\u0456fe', // Cyrillic і
        'tool\u200bkit', // zero-width space
        '__proto__',
        'constructor',
        'toString',
        'hasOwnProperty',
        'profession',
        1,
        null,
        ['knife'],
        { knife: true },
      ]) {
        expect(
          hostile((s) => (bob(s).weapon = weapon)),
          String(weapon),
        ).toBeNull();
      }
      expect(hostile((s) => (bob(s).name = '<img src=x onerror=alert(1)>'))).toBeNull();
      expect(hostile((s) => (bob(s).name = 'Bob‮gnp.exe'))).toBeNull(); // bidi override
      expect(hostile((s) => (bob(s).name = 'B​ob'))).toBeNull(); // zero-width space
      expect(hostile((s) => (bob(s).name = 'Вob'))).toBeNull(); // Cyrillic B
      expect(hostile((s) => (bob(s).name = 'B'.repeat(25)))).toBeNull();
      expect(hostile((s) => (bob(s).name = ''))).toBeNull();
      expect(hostile((s) => (bob(s).id = 'Bob'))).toBeNull();
      expect(hostile((s) => (bob(s).id = 'bob"><x'))).toBeNull();
      expect(hostile((s) => (bob(s).injuredUntil = -1))).toBeNull();
      expect(hostile((s) => (bob(s).injuredUntil = 'later'))).toBeNull();
      expect(hostile((s) => delete bob(s).injuredUntil)).toBeNull();
      expect(
        hostile(
          (s) =>
            (s.game.roster = Array.from({ length: 101 }, (_, i) => ({ ...bob(s), id: `d${i}` }))),
        ),
      ).toBeNull();
    });

    it('a deep nest or a long array within the size cap, quickly', () => {
      const deep = '['.repeat(20_000) + ']'.repeat(20_000);
      const wide = `{"v":1,"savedAt":0,"game":{"hordeNumber":1,"base":{"layers":[],"posts":[]},"stock":{},"tiers":[${'"wood",'.repeat(5000)}"wood"],"roster":[]}}`;
      const started = performance.now();
      expect(decodeSave(deep)).toBeNull();
      expect(decodeSave(wide)).toBeNull();
      expect(performance.now() - started).toBeLessThan(500);
    });

    it('long hostile text checks in linear time (no ReDoS)', () => {
      const started = performance.now();
      expect(hostile((s) => (s.game.roster[0].name = 'a'.repeat(40_000) + '!'))).toBeNull();
      expect(hostile((s) => (s.game.roster[0].id = 'a-'.repeat(20_000) + '!'))).toBeNull();
      expect(performance.now() - started).toBeLessThan(500);
    });
  });

  it('cuts a rest to 2 h past the save, never refusing it (clocks differ between devices)', () => {
    const save = hostile((s) => (s.game.roster[0].injuredUntil = NOW + 3 * RECOVERY_MS)) as Loose;
    expect(save.game.roster[0].injuredUntil).toBe(NOW + RECOVERY_MS);
    expect(hostile((s) => (s.game.roster[0].injuredUntil = 1e14))).toBeNull();
  });

  it("takes max HP from today's numbers and cuts HP to it, so a retune keeps old saves", () => {
    const save = hostile((s) => {
      s.game.base.layers[0].slots[1] = { kind: 'wall', tier: 'wood', hp: 900, maxHp: 1000 };
    }) as Loose;
    expect(save.game.base.layers[0].slots[1]).toEqual({
      kind: 'wall',
      tier: 'wood',
      hp: 200,
      maxHp: 200,
    });
    expect(hostile((s) => (s.game.base.layers[0].slots[1].maxHp = 0))).toBeNull();
    expect(hostile((s) => (s.game.base.layers[0].slots[1].maxHp = 'x'))).toBeNull();
  });

  it('loads every weapon, and an older camp of three pistols unchanged', () => {
    for (const weapon of ['pistol', 'knife', 'toolkit']) {
      const loaded = hostile((s) => (s.game.roster[0].weapon = weapon)) as Loose;
      expect(loaded.game.roster[0].weapon).toBe(weapon);
    }
    const old = played();
    for (const d of old.roster) d.weapon = 'pistol';
    expect(decodeSave(encodeSave(old, NOW))).toEqual({ savedAt: NOW, game: old });
  });

  it('round-trips stats, and loads a save from before stats with all 0', () => {
    const g = played();
    g.roster[1]!.xp = 75;
    g.roster[1]!.stats = { aim: 1, might: 3, tech: 0, grit: 2 };
    expect(decodeSave(encodeSave(g, NOW))).toEqual({ savedAt: NOW, game: g });
    const old = hostile((s) => {
      for (const d of s.game.roster) delete d.stats;
    }) as Loose;
    expect(old.game.roster.map((d: Loose) => d.stats)).toEqual(
      played().roster.map(() => ({ aim: 0, might: 0, tech: 0, grit: 0 })),
    );
  });

  it('refuses hostile stats', () => {
    const at = (change: (stats: Loose) => void, xp = 75) =>
      hostile((s) => {
        s.game.roster[0].xp = xp;
        change(s.game.roster[0].stats);
      });
    expect(at(() => {})).not.toBeNull();
    expect(at((t) => (t.aim = 6))).not.toBeNull(); // level 3: exactly the 6 points earned
    expect(at((t) => (t.aim = 7))).toBeNull(); // more than earned
    expect(at((t) => Object.assign(t, { aim: 2, might: 2, tech: 2, grit: 1 }))).toBeNull();
    expect(at((t) => (t.aim = 1), 24)).toBeNull(); // level 1 has none
    expect(at((t) => (t.aim = -1))).toBeNull();
    expect(at((t) => (t.aim = 0.5))).toBeNull();
    expect(at((t) => (t.aim = '1'))).toBeNull();
    expect(at((t) => (t.aim = 1e13), 1e12)).toBeNull();
    expect(at((t) => (t.luck = 1))).toBeNull();
    expect(at((t) => delete t.grit)).toBeNull();
    expect(hostile((s) => (s.game.roster[0].stats = null))).toBeNull();
    expect(hostile((s) => (s.game.roster[0].stats = [0, 0, 0, 0]))).toBeNull();
    expect(hostile((s) => (s.game.roster[0].stats = 'aim'))).toBeNull();
    // The old shape only for the whole roster: one defender without stats among others is refused.
    expect(hostile((s) => delete s.game.roster[0].stats)).toBeNull();
    expect(hostile((s) => (s.game.roster[0].level = 9))).toBeNull();
    // The old shape is exact too: no extra key, no __proto__.
    const old = (change: (d: Loose) => void) =>
      hostile((s) => {
        for (const d of s.game.roster) delete d.stats;
        change(s.game.roster[0]);
      });
    expect(old(() => {})).not.toBeNull();
    expect(old((d) => (d.level = 9))).toBeNull();
    const oldRaw = encodeSave(played(), NOW)
      .replace(/,"stats":\{[^}]*\}/g, '')
      .replace('"xp"', '"__proto__":{"polluted":1},"xp"');
    expect(oldRaw).not.toContain('"stats"');
    expect(decodeSave(oldRaw)).toBeNull();
    // Overspent at scale: the earned-points check, not the per-stat cap, refuses it.
    expect(at((t) => (t.aim = 3 * 282_842 + 1), 1e12)).toBeNull();
    expect(at((t) => (t.aim = 3 * 282_842), 1e12)).not.toBeNull();
    const raw = encodeSave(played(), NOW).replace('"aim"', '"__proto__":{"polluted":1},"aim"');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts the edges the rules allow', () => {
    expect(hostile((s) => (s.game.roster[0].injuredUntil = NOW + RECOVERY_MS))).not.toBeNull();
    expect(hostile((s) => (s.game.roster[0].name = "Mary-Jo O'Neil"))).not.toBeNull();
    expect(hostile((s) => (s.game.base.layers[0].slots[0].hp = 0))).not.toBeNull();
    expect(hostile((s) => (s.game.base.posts = []))).not.toBeNull();
  });
});
