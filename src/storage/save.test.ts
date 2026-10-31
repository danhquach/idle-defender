import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { buildTurret, lineWall, spotOf } from '../core/base.ts';
import { newCamp, NO_PICKS, recruitArrivals } from '../core/camp.ts';
import {
  ARMOURY_CAP,
  BANK_CAP,
  CAMP_PICK_RANKS,
  CAMP_SIZE,
  CAMP_UPGRADES,
  MAX_COUNT,
  PATROL,
  RECOVERY_MS,
  SEGMENTS,
  STEP,
  stockOf,
} from '../core/data.ts';
import { finishHorde, newGame, recover, startHorde, type GameState } from '../core/game.ts';
import { tick } from '../core/horde.ts';
import { isGun, type Loadout } from '../core/loadout.ts';
import {
  patrolLoot,
  patrolOutcome,
  sendPatrol,
  settlePatrols,
  type Patrol,
  type PatrolOutcome,
} from '../core/patrol.ts';
import {
  decodeSave,
  encodeSave,
  loadSave,
  MAX_SAVE_CHARS,
  REJECTED_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  writeSave,
  type SaveStorage,
} from './save.ts';
import { NOW, oldStock, played, preCamp, prePatrol, prePlazas, preRisk } from './testing.ts';

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
      expect(hostile((s) => (s.v = SAVE_VERSION + 1))).toBeNull();
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
      expect(hostile((s) => (s.game.base.layers[0].slots = Array(SEGMENTS).fill(null)))).toBeNull();
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
      expect(hostile((s) => (posts(s)[0].row = SEGMENTS))).toBeNull();
      expect(hostile((s) => posts(s).push({ kind: 'tower', column: 2, row: 0 }))).toBeNull();
      expect(hostile((s) => posts(s).push({ kind: 'wall-walk', column: 1, row: 1 }))).toBeNull();
    });

    it('roster entries that are hostile text, repeated, unknown or resting too long', () => {
      const bob = (s: Loose) => s.game.roster[0];
      expect(hostile((s) => (s.game.roster = []))).toBeNull();
      expect(hostile((s) => s.game.roster.push({ ...bob(s) }))).toBeNull(); // same id
      expect(hostile((s) => (bob(s).loadout.primary = 'railgun'))).toBeNull();
      // Weapon and item ids match exactly: no case, padding, look-alikes or prototype names.
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
          hostile((s) => (bob(s).loadout.primary = weapon)),
          String(weapon),
        ).toBeNull();
        expect(
          hostile((s) => (bob(s).loadout.secondary = weapon === null ? 'railgun' : weapon)),
          String(weapon),
        ).toBeNull();
        // The old single `weapon` (before loadouts) goes through the same allow-list.
        expect(
          hostile((s) => {
            for (const d of s.game.roster) {
              delete d.loadout;
              d.weapon = 'pistol';
            }
            bob(s).weapon = weapon;
          }),
          String(weapon),
        ).toBeNull();
        expect(
          hostile((s) => (bob(s).loadout.item = weapon === null ? 'Shield' : weapon)),
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

  it('round-trips every loadout the game allows', () => {
    const loadouts: Loadout[] = [
      { primary: 'pistol', secondary: null, item: null },
      { primary: 'pistol', secondary: 'pistol', item: null },
      { primary: 'pistol', secondary: 'knife', item: null },
      { primary: 'pistol', secondary: 'knife', item: 'shield' },
      { primary: 'pistol', secondary: 'toolkit', item: null },
    ];
    for (const loadout of loadouts) {
      const g = played();
      g.roster[0]!.loadout = loadout;
      expect(decodeSave(encodeSave(g, NOW)), JSON.stringify(loadout)).toEqual({
        savedAt: NOW,
        game: g,
      });
    }
  });

  it('loads a save from before loadouts: each weapon becomes a pistol plus that weapon', () => {
    const old = hostile((s) => {
      const weapons = ['pistol', 'knife', 'toolkit'];
      s.game.roster.forEach((d: Loose, i: number) => {
        delete d.loadout;
        d.weapon = weapons[i];
      });
    }) as Loose;
    expect(old.game.roster.map((d: Loose) => d.loadout)).toEqual([
      { primary: 'pistol', secondary: null, item: null },
      { primary: 'pistol', secondary: 'knife', item: null },
      { primary: 'pistol', secondary: 'toolkit', item: null },
    ]);
    // A camp from before ID-010: three pistols, still three pistols.
    const pistols = hostile((s) => {
      for (const d of s.game.roster) {
        delete d.loadout;
        d.weapon = 'pistol';
      }
    }) as Loose;
    expect(pistols.game.roster.every((d: Loose) => d.loadout.secondary === null)).toBe(true);
    // Every old weapon was free: a specialised gun there is refused (ID-046).
    for (const never of ['smg', 'sniper', 'constructor']) {
      const forged = hostile((s) => {
        s.game.roster.forEach((d: Loose, i: number) => {
          delete d.loadout;
          d.weapon = i === 0 ? never : 'pistol';
        });
      });
      expect(forged, never).toBeNull();
    }
  });

  it('refuses loadouts the game does not allow, and mixed or hostile shapes', () => {
    const set = (loadout: unknown) => hostile((s) => (s.game.roster[0].loadout = loadout));
    // A blade or tool as primary; a shield without a blade.
    expect(set({ primary: 'knife', secondary: null, item: null })).toBeNull();
    expect(set({ primary: 'toolkit', secondary: 'pistol', item: null })).toBeNull();
    expect(set({ primary: 'pistol', secondary: null, item: 'shield' })).toBeNull();
    expect(set({ primary: 'pistol', secondary: 'toolkit', item: 'shield' })).toBeNull();
    expect(set({ primary: 'pistol', secondary: 'pistol', item: 'shield' })).toBeNull();
    // Exact shape: no missing, extra or prototype keys; an object, not a list.
    expect(set({ primary: 'pistol', secondary: null })).toBeNull();
    expect(set({ primary: 'pistol', secondary: null, item: null, ammo: 99 })).toBeNull();
    expect(set(['pistol', null, null])).toBeNull();
    expect(set('pistol')).toBeNull();
    expect(set(null)).toBeNull();
    const raw = encodeSave(played(), NOW).replace(
      '"primary"',
      '"__proto__":{"polluted":1},"primary"',
    );
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Old and new shapes never mix: both keys on one defender, or one of each in a roster.
    expect(hostile((s) => (s.game.roster[0].weapon = 'pistol'))).toBeNull();
    expect(
      hostile((s) => {
        delete s.game.roster[0].loadout;
        s.game.roster[0].weapon = 'knife';
      }),
    ).toBeNull();
    // An old weapon is read through the same allow-list.
    expect(
      hostile((s) => {
        for (const d of s.game.roster) {
          delete d.loadout;
          d.weapon = '__proto__';
        }
      }),
    ).toBeNull();
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

describe('save: the armoury (design §6 Gear)', () => {
  const mil = (uid = 'h3'): OwnedWeapon => ({
    uid,
    base: 'pistol',
    rarity: 'military',
    affixes: [{ id: 'damage', value: 12 }],
  });
  /** A played game at horde 10: a Prototype toolkit in the armoury, Bob holding a Military Pistol. */
  function armed(): GameState {
    const g = { ...played(), hordeNumber: 10 };
    g.armoury = [
      {
        uid: 'h7',
        base: 'toolkit',
        rarity: 'prototype',
        affixes: [
          { id: 'repair', value: 25 },
          { id: 'fireRate', value: 5 },
        ],
      },
    ];
    g.roster[0]!.loadout.primary = mil();
    return g;
  }
  const encoded = (): Loose => JSON.parse(encodeSave(armed(), NOW));
  const load = (save: Loose): unknown => decodeSave(JSON.stringify(save));
  const tweaked = (change: (s: Loose) => void): unknown => {
    const save = encoded();
    change(save);
    return load(save);
  };

  it('round-trips owned weapons in the armoury and in hands', () => {
    expect(decodeSave(encodeSave(armed(), NOW))).toEqual({ game: armed(), savedAt: NOW });
  });

  it('round-trips the specialised guns, a sniper with a pierce affix in hands (ID-046)', () => {
    const g = armed();
    g.armoury.push(
      { uid: 'h4', base: 'shotgun', rarity: 'common', affixes: [] },
      { uid: 'h5', base: 'lmg', rarity: 'rusty', affixes: [] },
    );
    g.roster[0]!.loadout.primary = {
      uid: 'h8',
      base: 'sniper',
      rarity: 'military',
      affixes: [{ id: 'pierce', value: 1 }],
    };
    expect(decodeSave(encodeSave(g, NOW))).toEqual({ game: g, savedAt: NOW });
  });

  it('loads a save from before the armoury with an empty one', () => {
    const save = JSON.parse(encodeSave(played(), NOW));
    delete save.game.armoury;
    expect(load(save)).toEqual({ game: played(), savedAt: NOW });
  });

  it('refuses owned weapons the game could not have made', () => {
    const w = (s: Loose): Loose => s.game.armoury[0];
    const held = (s: Loose): Loose => s.game.roster[0].loadout.primary;
    const cases: [string, (s: Loose) => void][] = [
      ['unknown rarity', (s) => (w(s).rarity = 'legendary')],
      ['look-alike rarity', (s) => (w(s).rarity = 'milіtary')],
      ['unknown base', (s) => (w(s).base = 'flamethrower')],
      ['prototype key', (s) => (w(s).base = '__proto__')],
      ['constructor as base', (s) => (w(s).base = 'constructor')],
      ['toString as base', (s) => (w(s).base = 'toString')],
      ['too few affixes', (s) => w(s).affixes.pop()],
      ['too many affixes', (s) => w(s).affixes.push({ id: 'damage', value: 5 })],
      ['affix twice', (s) => (w(s).affixes[1] = { id: 'repair', value: 10 })],
      ['affix that does not fit', (s) => (w(s).affixes[1] = { id: 'pierce', value: 1 })],
      ['unknown affix', (s) => (w(s).affixes[1] = { id: 'burning', value: 5 })],
      ['affix too big', (s) => (w(s).affixes[0].value = 26)],
      ['affix too small', (s) => (w(s).affixes[0].value = 9)],
      ['affix not whole', (s) => (w(s).affixes[0].value = 12.5)],
      ['affix as text', (s) => (w(s).affixes[0].value = '12')],
      ['affix extra key', (s) => (w(s).affixes[0].note = 'x')],
      ['weapon extra key', (s) => (w(s).owner = 'bob')],
      ['weapon missing key', (s) => delete w(s).affixes],
      ['uid from a horde not yet won', (s) => (w(s).uid = 'h10')],
      ['uid of another shape', (s) => (w(s).uid = 'pistol')],
      ['uid with a zero-width space', (s) => (w(s).uid = 'h​7')],
      ['uid with a bidi override', (s) => (w(s).uid = '‮h7')],
      ['uid oversized', (s) => (w(s).uid = 'h' + '1'.repeat(10_000))],
      ['the same uid in the armoury and in hands', (s) => (w(s).uid = 'h3')],
      ['the same uid in two pairs of hands', (s) => (s.game.roster[1].loadout.primary = held(s))],
      ['held weapon that breaks the rules', (s) => (held(s).base = 'knife')],
      // A specialised gun is only ever an owned item: by id it would be free and unlimited.
      ['specialised gun held by id', (s) => (s.game.roster[0].loadout.primary = 'smg')],
      ['sniper held by id', (s) => (s.game.roster[1].loadout.primary = 'sniper')],
      [
        'specialised gun held by id as secondary',
        (s) => (s.game.roster[1].loadout.secondary = 'smg'),
      ],
      ['constructor held by id', (s) => (s.game.roster[1].loadout.primary = 'constructor')],
      ['toString held by id', (s) => (s.game.roster[1].loadout.secondary = 'toString')],
      ['armoury not a list', (s) => (s.game.armoury = { 0: w(s) })],
      ['armoury entry not an object', (s) => (s.game.armoury = ['h7'])],
      [
        'more than the cap',
        (s) =>
          (s.game.armoury = Array.from({ length: ARMOURY_CAP }, (_, i) => ({
            uid: `h${i + 1}`,
            base: 'knife',
            rarity: 'rusty',
            affixes: [],
          }))),
      ],
    ];
    for (const [why, change] of cases) expect(tweaked(change), why).toBeNull();
    expect(load({ ...encoded(), game: { ...encoded().game, armoury: null } })).toBeNull();
  });

  it('refuses a polluted owned weapon and leaves Object.prototype alone', () => {
    const raw = encodeSave(armed(), NOW).replace(
      '"uid":"h7"',
      '"__proto__":{"polluted":1},"uid":"h7"',
    );
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts the edges: a full armoury, a Relic, the last horde won', () => {
    expect(
      tweaked((s) => {
        s.game.armoury = Array.from({ length: ARMOURY_CAP - 1 }, (_, i) => ({
          uid: `h${i + 10}`,
          base: 'knife',
          rarity: 'relic',
          affixes: [
            { id: 'damage', value: 15 },
            { id: 'fireRate', value: 5 },
          ],
        }));
        s.game.hordeNumber = 100;
      }),
    ).not.toBeNull();
    expect(tweaked((s) => (s.game.armoury[0].uid = 'h9'))).not.toBeNull();
    // A full armoury of Relic toolkits (three affixes each) stays far under the size cap.
    const full = armed();
    full.armoury = Array.from({ length: ARMOURY_CAP - 1 }, (_, i) => ({
      uid: `h${i + 1000}`,
      base: 'toolkit' as const,
      rarity: 'relic' as const,
      affixes: [
        { id: 'damage' as const, value: 15 },
        { id: 'fireRate' as const, value: 15 },
        { id: 'repair' as const, value: 25 },
      ],
    }));
    full.hordeNumber = 2000;
    expect(decodeSave(encodeSave(full, NOW))).not.toBeNull();
    expect(encodeSave(full, NOW).length).toBeLessThan(MAX_SAVE_CHARS / 5);
  });
});

describe('save: Research Lab, research and turrets (ID-014)', () => {
  const turrets = (s: Loose) => s.game.base.turrets;

  it('round-trips the Lab, research and a worn turret', () => {
    const game = played();
    expect(game.lab).toBe(2);
    expect(game.research).toEqual(['metal-walls', 'auto-turret']);
    expect(game.base.turrets).toEqual([{ mount: 'tower', column: 0, row: 2, condition: 61.2 }]);
    expect(decodeSave(encodeSave(game, NOW))).toEqual({ game, savedAt: NOW });
  });

  it('loads a save from before the Lab and turrets: none built, nothing researched, tiers kept', () => {
    const save = JSON.parse(encodeSave(newGame(), NOW));
    delete save.game.lab;
    delete save.game.research;
    delete save.game.base.turrets;
    delete save.game.base.traps;
    expect(decodeSave(JSON.stringify(save))).toEqual({ game: newGame(), savedAt: NOW });
  });

  it('refuses a Lab level or research the game could not reach', () => {
    expect(hostile((s) => delete s.game.lab)).toBeNull(); // research without its Lab
    expect(hostile((s) => (s.game.lab = 3))).toBeNull();
    expect(hostile((s) => (s.game.lab = -1))).toBeNull();
    expect(hostile((s) => (s.game.lab = 1.5))).toBeNull();
    expect(hostile((s) => (s.game.lab = '2'))).toBeNull();
    expect(hostile((s) => (s.game.lab = 1))).toBeNull(); // Auto-turret needs Lab 2
    expect(hostile((s) => s.game.research.reverse())).toBeNull(); // out of order
    expect(hostile((s) => s.game.research.push('auto-turret'))).toBeNull();
    expect(hostile((s) => (s.game.research = ['metal-walls', 'death-ray']))).toBeNull();
    expect(hostile((s) => (s.game.research = ['metal-walls', 'auto-turret ']))).toBeNull();
    expect(hostile((s) => (s.game.research = ['metal-walls', 'autо-turret']))).toBeNull(); // Cyrillic o
    expect(hostile((s) => (s.game.research = ['metal-walls', 'auto​-turret']))).toBeNull();
    expect(hostile((s) => (s.game.research = ['metal-walls', '__proto__']))).toBeNull();
    expect(hostile((s) => (s.game.research = 'metal-walls'))).toBeNull();
    expect(hostile((s) => (s.game.research = { 0: 'metal-walls' }))).toBeNull();
  });

  it('round-trips skill research (ID-019) and refuses it out of order or above the Lab', () => {
    const g = newGame();
    const raw = (game: Loose) =>
      decodeSave(JSON.stringify({ v: SAVE_VERSION, savedAt: NOW, game }));
    const all = { ...g, lab: 2, research: ['flashbang', 'molotov', 'airstrike'] };
    expect(raw(all)?.game.research).toEqual(['flashbang', 'molotov', 'airstrike']);
    expect(raw({ ...all, lab: 1 })).toBeNull(); // Airstrike needs Lab 2
    expect(raw({ ...g, lab: 1, research: ['molotov'] })).toBeNull(); // needs Flashbang
    expect(raw({ ...g, lab: 1, research: ['molotov', 'flashbang'] })).toBeNull();
    expect(raw({ ...g, lab: 1, research: ['flashbang', 'flashbang'] })).toBeNull();
    expect(raw({ ...g, research: ['flashbang'] })).toBeNull(); // no Lab
    expect(raw({ ...g, lab: 1, research: ['flashbаng'] })).toBeNull(); // Cyrillic a
    expect(raw({ ...g, lab: 1, research: ['constructor'] })).toBeNull();
    expect(raw({ ...g, lab: 1, research: ['__proto__'] })).toBeNull();
  });

  it('refuses research whose tier is not unlocked', () => {
    const g = newGame();
    const raw = (game: Loose) =>
      decodeSave(JSON.stringify({ v: SAVE_VERSION, savedAt: NOW, game }));
    expect(raw({ ...g, lab: 1, research: ['metal-walls'] })).toBeNull(); // Metal not unlocked
    expect(
      raw({ ...g, lab: 1, research: ['metal-walls'], tiers: ['wood', 'metal'] }),
    ).not.toBeNull();
  });

  it('a save from before the Lab keeps its tiers, and still loads after it is saved again', () => {
    const save = JSON.parse(encodeSave(played(), NOW));
    delete save.game.lab;
    delete save.game.research;
    delete save.game.base.turrets;
    delete save.game.base.traps;
    const first = decodeSave(JSON.stringify(save));
    expect(first?.game).toMatchObject({ tiers: ['wood', 'metal'], lab: 0, research: [] });
    const again = decodeSave(encodeSave(first!.game, NOW));
    expect(again).toEqual(first);
  });

  it('refuses turrets the build rules never make', () => {
    expect(hostile((s) => (turrets(s)[0].condition = 101))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].condition = -1))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].condition = '50'))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].mount = 'ground'))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].mount = 'tower '))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].row = SEGMENTS))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].column = 3))).toBeNull();
    expect(hostile((s) => (turrets(s)[0].extra = 1))).toBeNull();
    expect(hostile((s) => delete turrets(s)[0].condition)).toBeNull();
    expect(hostile((s) => turrets(s).push({ ...turrets(s)[0] }))).toBeNull(); // repeated
    expect(
      hostile((s) => turrets(s).unshift({ mount: 'tower', column: 1, row: 0, condition: 9 })),
    ).toBeNull(); // out of order
    expect(
      hostile((s) => turrets(s).push({ mount: 'tower', column: 2, row: 0, condition: 9 })),
    ).toBeNull(); // no wall
    expect(
      hostile((s) => turrets(s).push({ mount: 'wall-walk', column: 1, row: 1, condition: 9 })),
    ).toBeNull(); // wall mount over an empty slot
    expect(
      hostile((s) => turrets(s).push({ mount: 'wall-walk', column: 1, row: 0, condition: 9 })),
    ).toBeNull(); // the spot holds a wall-walk post
    expect(
      hostile((s) => turrets(s).push({ mount: 'tower', column: 0, row: 4, condition: 9 })),
    ).toBeNull(); // the spot holds a tower post
    expect(hostile((s) => (s.game.research = ['metal-walls']))).toBeNull(); // not researched
    expect(hostile((s) => (s.game.base.turrets = null))).toBeNull();
  });

  it('reads a raw turret condition as a finite number in range, fractions included', () => {
    const raw = encodeSave(played(), NOW);
    const at = (text: string) => decodeSave(raw.replace('"condition":61.2', `"condition":${text}`));
    expect(raw).toContain('"condition":61.2');
    expect(at('1e999')).toBeNull(); // Infinity
    expect(at('-1e-320')).toBeNull();
    expect(at('100.0001')).toBeNull();
    expect(at('1e-320')?.game.base.turrets[0]!.condition).toBe(1e-320);
    expect(at('-0')?.game.base.turrets[0]!.condition).toBe(0);
  });

  it('refuses more turrets than the grid holds, quickly', () => {
    const many = Array.from({ length: 31 }, () => ({
      mount: 'tower',
      column: 0,
      row: 0,
      condition: 0,
    }));
    const t0 = performance.now();
    expect(hostile((s) => (s.game.base.turrets = many))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('refuses a polluted turret or research entry and leaves Object.prototype alone', () => {
    const raw = encodeSave(played(), NOW);
    const raws = [
      raw.replace('"mount"', '"__proto__":{"polluted":1},"mount"'),
      raw.replace('"research":[', '"research":[{"__proto__":{"polluted":1}},'),
    ];
    for (const r of raws) expect(decodeSave(r)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: traps (ID-017)', () => {
  const traps = (s: Loose) => s.game.base.traps;

  it('round-trips the traps and their wear', () => {
    const game = played();
    expect(game.base.traps).toEqual([
      { kind: 'wire', row: 1, durability: 30 },
      { kind: 'spikes', row: 3, durability: 17 },
    ]);
    expect(decodeSave(encodeSave(game, NOW))).toEqual({ game, savedAt: NOW });
  });

  it('loads a save from before traps with none, and saves it again with them', () => {
    const save = JSON.parse(encodeSave(played(), NOW));
    delete save.game.base.traps;
    const first = decodeSave(JSON.stringify(save));
    expect(first?.game.base.traps).toEqual([]);
    expect(first?.game.base.turrets).toHaveLength(1);
    expect(decodeSave(encodeSave(first!.game, NOW))).toEqual(first);
  });

  it('refuses traps the build rules never make', () => {
    expect(hostile((s) => (traps(s)[0].durability = 31))).toBeNull();
    expect(hostile((s) => (traps(s)[0].durability = -1))).toBeNull();
    expect(hostile((s) => (traps(s)[0].durability = 12.5))).toBeNull();
    expect(hostile((s) => (traps(s)[0].durability = '30'))).toBeNull();
    expect(hostile((s) => (traps(s)[0].durability = null))).toBeNull();
    expect(hostile((s) => (traps(s)[0].kind = 'mines'))).toBeNull();
    expect(hostile((s) => (traps(s)[0].kind = 'wire '))).toBeNull();
    expect(hostile((s) => (traps(s)[0].kind = 'Wire'))).toBeNull();
    expect(hostile((s) => (traps(s)[0].kind = 'wіre'))).toBeNull(); // Cyrillic i
    expect(hostile((s) => (traps(s)[0].kind = 'wi\u200bre'))).toBeNull(); // zero-width space
    expect(hostile((s) => (traps(s)[0].kind = '\u202ewire'))).toBeNull(); // bidi override
    expect(hostile((s) => (traps(s)[0].kind = ['wire']))).toBeNull();
    expect(hostile((s) => (traps(s)[0].row = SEGMENTS))).toBeNull();
    expect(hostile((s) => (traps(s)[0].row = -1))).toBeNull();
    expect(hostile((s) => (traps(s)[0].row = 0.5))).toBeNull();
    expect(hostile((s) => (traps(s)[0].extra = 1))).toBeNull();
    expect(hostile((s) => delete traps(s)[0].durability)).toBeNull();
    expect(hostile((s) => traps(s).push({ ...traps(s)[1] }))).toBeNull(); // same cell twice
    expect(hostile((s) => traps(s).reverse())).toBeNull(); // out of order
    expect(hostile((s) => (s.game.base.traps = null))).toBeNull();
    expect(hostile((s) => (s.game.base.traps = { 0: traps(s)[0] }))).toBeNull();
    expect(hostile((s) => (traps(s)[0] = null))).toBeNull();
    expect(hostile((s) => (traps(s)[0] = 'wire'))).toBeNull();
  });

  it('refuses traps without turrets: no save ever had them', () => {
    expect(hostile((s) => delete s.game.base.turrets)).toBeNull();
  });

  it('refuses more traps than the strip holds, and an oversized list quickly', () => {
    const row = (n: number) => ({ kind: 'wire', row: n % 5, durability: 0 });
    expect(
      hostile((s) => (s.game.base.traps = Array.from({ length: 6 }, (_, n) => row(n)))),
    ).toBeNull();
    const many = Array.from({ length: 100_000 }, (_, n) => row(n));
    const t0 = performance.now();
    expect(hostile((s) => (s.game.base.traps = many))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('refuses a polluted trap and leaves Object.prototype alone', () => {
    const raw = encodeSave(played(), NOW);
    expect(raw).toContain('"kind":"wire"');
    const bad = raw.replace('{"kind":"wire"', '{"__proto__":{"polluted":1},"kind":"wire"');
    expect(decodeSave(bad)).toBeNull();
    const ctor = raw.replace(
      '{"kind":"wire"',
      '{"constructor":{"prototype":{"polluted":1}},"kind":"wire"',
    );
    expect(decodeSave(ctor)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: battery bank and generator (ID-015)', () => {
  const power = (s: Loose) => s.game.power;
  /** played() with a generator running since `at`, some Gas, a part-drawn bank and batteries left over. */
  function powered(at = NOW - 1000): GameState {
    const g = played();
    return {
      ...g,
      power: {
        bank: 990.25, // no battery fits, so loading leaves it as it is
        gas: 7,
        batteries: { makeshift: 1, standard: 0, 'high-capacity': 2, military: 3 },
        generator: { at },
      },
    };
  }
  const encoded = (game: GameState): Loose => JSON.parse(encodeSave(game, NOW));
  const decode = (save: Loose) => decodeSave(JSON.stringify(save));

  it('round-trips the bank, Gas, batteries and a running or idle generator', () => {
    for (const game of [
      powered(),
      { ...powered(), power: { ...powered().power, generator: { at: null } } },
    ]) {
      expect(decodeSave(encodeSave(game, NOW))).toEqual({ game, savedAt: NOW });
    }
    const none = { ...powered(), power: { ...powered().power, generator: null } };
    expect(decodeSave(encodeSave(none, NOW))).toEqual({ game: none, savedAt: NOW });
  });

  it('loads batteries waiting in storage into the bank on load', () => {
    const s = encoded(powered());
    power(s).bank = 0;
    expect(decode(s)!.game.power).toMatchObject({
      bank: 3 * 250 + 160 + 60,
      batteries: { makeshift: 0, standard: 0, 'high-capacity': 1, military: 0 },
    });
  });

  it('loads a save from before the bank with a new game power, its batteries loaded', () => {
    const s = encoded(newGame());
    delete s.game.power;
    expect(decode(s)).toEqual({ game: newGame(), savedAt: NOW });
    const played0 = encoded(played());
    delete played0.game.power;
    expect(decode(played0)!.game.power).toEqual(newGame().power);
  });

  it('cuts a generator clock later than the save to the save', () => {
    const s = encoded(powered(NOW + 5 * 60 * 60 * 1000));
    expect(decode(s)!.game.power.generator).toEqual({ at: NOW });
  });

  it('refuses hostile bank, Gas, battery and generator shapes', () => {
    const bad: ((p: Loose) => void)[] = [
      (p) => (p.bank = -0.01),
      (p) => (p.bank = 1000.01),
      (p) => (p.bank = '500'),
      (p) => (p.bank = null),
      (p) => (p.bank = Number.NaN), // JSON turns it into null
      (p) => (p.gas = 1.5),
      (p) => (p.gas = -1),
      (p) => (p.gas = 1e13),
      (p) => (p.gas = '7'),
      (p) => (p.batteries.military = 0.5),
      (p) => (p.batteries.military = -1),
      (p) => (p.batteries.military = 1e13),
      (p) => (p.batteries.military = '3'),
      (p) => (p.batteries.nuclear = 1),
      (p) => (p.batteries['military '] = 1),
      (p) => (p.batteries['mіlitary'] = 1), // Cyrillic i
      (p) => delete p.batteries.standard,
      (p) => (p.batteries = [1, 2, 3, 4]),
      (p) => (p.batteries = null),
      (p) => (p.generator = {}),
      (p) => (p.generator = { at: 1.5 }),
      (p) => (p.generator = { at: -1 }),
      (p) => (p.generator = { at: '1' }),
      (p) => (p.generator = { at: 1e14 }),
      (p) => (p.generator = { at: 1, extra: 1 }),
      (p) => (p.generator = true),
      (p) => (p.generator = [1]),
      (p) => delete p.generator,
      (p) => delete p.gas,
      (p) => (p.extra = 1),
    ];
    for (const change of bad) expect(hostile((s) => change(power(s)))).toBeNull();
    expect(hostile((s) => (s.game.power = null))).toBeNull();
    expect(hostile((s) => (s.game.power = 'full'))).toBeNull();
    expect(hostile((s) => (s.game.power = []))).toBeNull();
  });

  it('accepts the edge values and refuses Infinity written into the raw save', () => {
    const edge = (change: (p: Loose) => void) => {
      const s = encoded(powered());
      change(power(s));
      return decode(s);
    };
    const empty = edge((p) => {
      p.bank = 0;
      for (const k of Object.keys(p.batteries)) p.batteries[k] = 0;
    });
    expect(empty?.game.power.bank).toBe(0);
    expect(edge((p) => (p.bank = BANK_CAP))?.game.power.bank).toBe(BANK_CAP);
    expect(edge((p) => (p.gas = 1e12))?.game.power.gas).toBe(1e12);
    expect(edge((p) => (p.gas = 1e12 + 1))).toBeNull();
    expect(edge((p) => (p.batteries.makeshift = 1e12))).not.toBeNull();
    expect(edge((p) => (p.generator = { at: 0 }))?.game.power.generator).toEqual({ at: 0 });
    const raw = encodeSave(powered(), NOW);
    for (const r of [
      raw.replace('"bank":990.25', '"bank":1e999'),
      raw.replace('"gas":7', '"gas":1e999'),
      raw.replace(`"at":${NOW - 1000}`, '"at":1e999'),
    ]) {
      expect(r).not.toBe(raw);
      expect(decodeSave(r)).toBeNull();
    }
  });

  it('refuses a polluted power entry and leaves Object.prototype alone', () => {
    const raw = encodeSave(powered(), NOW);
    const raws = [
      raw.replace('"power":{', '"power":{"__proto__":{"polluted":1},'),
      raw.replace('"batteries":{', '"batteries":{"__proto__":{"polluted":1},'),
      raw.replace('"generator":{', '"generator":{"constructor":{"prototype":{"polluted":1}},'),
    ];
    for (const r of raws) {
      expect(r).not.toBe(raw);
      expect(decodeSave(r)).toBeNull();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: the taller field (ID-047)', () => {
  const wood = (kind: 'wall' | 'gate', hp = kind === 'gate' ? 150 : 200) => ({
    kind,
    tier: 'wood',
    hp,
    maxHp: kind === 'gate' ? 150 : 200,
  });
  /** The 5-row starting base a v1 save held: gate on row 2, towers on rows 1 and 3. */
  const oldStart = () => ({
    layers: [
      { column: 0, slots: [wood('wall'), wood('wall'), wood('gate'), wood('wall'), wood('wall')] },
    ],
    posts: [
      { kind: 'tower', column: 0, row: 1 },
      { kind: 'tower', column: 0, row: 3 },
    ],
    turrets: [],
    traps: [],
  });
  /** `game` as a v1 save JSON with `base` in its place and only the building materials. */
  const v1 = (game: GameState, base: Loose): string =>
    JSON.stringify({
      v: 1,
      savedAt: NOW,
      game: { ...prePatrol(game), base, stock: oldStock(game) },
    });

  it('moves an old base onto rows 3–7; the new rows are empty ground', () => {
    const base = {
      layers: [
        {
          column: 0,
          slots: [wood('wall', 123), wood('wall'), wood('gate'), wood('wall'), wood('wall')],
        },
        { column: 1, slots: [null, null, null, null, wood('wall')] },
      ],
      posts: [
        { kind: 'tower', column: 0, row: 1 },
        { kind: 'tower', column: 0, row: 3 },
        { kind: 'wall-walk', column: 1, row: 4 },
      ],
      turrets: [{ mount: 'tower', column: 0, row: 2, condition: 61.2 }],
      traps: [{ kind: 'wire', row: 0, durability: 17 }],
    };
    const game = played();
    const save = decodeSave(v1(game, base))!;
    expect(save.grew).toBe(true);
    const b = save.game.base;
    expect(b.layers[0]!.slots.map((s) => s?.kind ?? null)).toEqual([
      ...[null, null, null],
      ...['wall', 'wall', 'gate', 'wall', 'wall'],
      ...[null, null],
    ]);
    expect(b.layers[0]!.slots[3]!.hp).toBe(123);
    expect(b.layers[1]!.slots.map((s) => s?.kind ?? null)).toEqual([
      ...Array(7).fill(null),
      'wall',
      null,
      null,
    ]);
    expect(b.posts).toEqual([
      { kind: 'tower', column: 0, row: 4 },
      { kind: 'tower', column: 0, row: 6 },
      { kind: 'wall-walk', column: 1, row: 7 },
    ]);
    expect(b.turrets).toEqual([{ mount: 'tower', column: 0, row: 5, condition: 61.2 }]);
    expect(b.traps).toEqual([{ kind: 'wire', row: 3, durability: 17 }]);
    // No lost resources: everything but the base is as saved.
    expect({ ...save.game, base: null }).toEqual({ ...game, base: null });
  });

  it('the old starting base lands where the new one stands, less the new rows', () => {
    const b = decodeSave(v1(newGame(), oldStart()))!.game.base;
    const start = newGame().base;
    expect(b.posts).toEqual(start.posts);
    b.layers[0]!.slots.forEach((s, row) =>
      expect(s).toEqual(row >= 3 && row <= 7 ? start.layers[0]!.slots[row] : null),
    );
  });

  it('saves again as the current version and reloads the same, without the notice', () => {
    const first = decodeSave(v1(newGame(), oldStart()))!;
    const raw = encodeSave(first.game, NOW);
    expect(JSON.parse(raw).v).toBe(SAVE_VERSION);
    expect(decodeSave(raw)).toEqual({ game: first.game, savedAt: NOW });
  });

  it('loads through storage with the notice flag', () => {
    const s = memory();
    s.setItem(SAVE_KEY, v1(newGame(), oldStart()));
    const loaded = loadSave(s);
    expect(loaded.rejected).toBe(false);
    expect(loaded.save?.grew).toBe(true);
  });

  it('plays a horde on a moved base without crashing', () => {
    const game = decodeSave(v1(newGame(), oldStart()))!.game;
    let h = startHorde(game, 1, game.roster[0]!.id, 0, NOW);
    // The empty new rows are open gaps until built, so the fight may end early; it must not throw.
    for (let i = 0; i < 60 / STEP && h.outcome === 'fighting'; i++) h = tick(h, STEP);
    expect(h.time).toBeGreaterThan(0);
  });

  it('refuses a v1 save that is not 5 rows, an old row off its grid, or an unknown version', () => {
    const start = oldStart();
    const ten = { ...start, layers: [{ column: 0, slots: newGame().base.layers[0]!.slots }] };
    expect(decodeSave(v1(newGame(), ten))).toBeNull();
    const offGrid = { ...start, posts: [...start.posts, { kind: 'tower', column: 0, row: 5 }] };
    expect(decodeSave(v1(newGame(), offGrid))).toBeNull();
    const trap = { ...start, traps: [{ kind: 'wire', row: 5, durability: 1 }] };
    expect(decodeSave(v1(newGame(), trap))).toBeNull();
    // Rows are checked on the old grid before the shift: -1 never becomes row 2.
    for (const row of [-1, 5]) {
      const posts = [{ kind: 'tower', column: 0, row }, ...start.posts];
      expect(decodeSave(v1(newGame(), { ...start, posts })), `post ${row}`).toBeNull();
      const traps = [{ kind: 'wire', row, durability: 1 }];
      expect(decodeSave(v1(newGame(), { ...start, traps })), `trap ${row}`).toBeNull();
      const turrets = [{ mount: 'tower', column: 0, row, condition: 50 }];
      expect(decodeSave(v1(played(), { ...start, turrets })), `turret ${row}`).toBeNull();
    }
    // The same turret on a good old row loads, so only the row refuses above.
    const turrets = [{ mount: 'tower', column: 0, row: 2, condition: 50 }];
    expect(decodeSave(v1(played(), { ...start, turrets }))).not.toBeNull();
    // Layers of the wrong length, empty, or with two gates.
    const layer = (slots: unknown[]) => ({ ...start, layers: [{ column: 0, slots }] });
    expect(decodeSave(v1(newGame(), layer(start.layers[0]!.slots.slice(0, 4))))).toBeNull();
    expect(decodeSave(v1(newGame(), layer([...start.layers[0]!.slots, null])))).toBeNull();
    expect(decodeSave(v1(newGame(), layer(Array(5).fill(null))))).toBeNull();
    const twoGates = [wood('gate'), wood('wall'), wood('gate'), wood('wall'), wood('wall')];
    expect(decodeSave(v1(newGame(), layer(twoGates)))).toBeNull();
    // Unknown keys on the v1 path, prototype names included.
    expect(decodeSave(v1(newGame(), { ...start, extra: 1 }))).toBeNull();
    const proto = v1(newGame(), start).replace('"layers":', '"__proto__":{"x":1},"layers":');
    expect(decodeSave(proto)).toBeNull();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    for (const v of [0, 9, '1', '8', 1.5, null]) {
      expect(decodeSave(JSON.stringify({ v, savedAt: NOW, game: newGame() }))).toBeNull();
    }
    // A current save never takes the v1 path: 5 slots are refused.
    expect(
      decodeSave(
        JSON.stringify({ v: SAVE_VERSION, savedAt: NOW, game: { ...newGame(), base: start } }),
      ),
    ).toBeNull();
  });
});

describe('save: wall-walk spots (ID-048)', () => {
  const RICH = stockOf({ scrap: 9999, wood: 9999, metal: 0, concrete: 0 });
  /** `played()` with a wall mount on row 9's spot 2, then the rest of layer 1 lined with posts. */
  function lined(): GameState {
    const game = played();
    const t = buildTurret(game.base, RICH, true, 'wall-walk', 0, 9, 1);
    if (!t.ok) throw new Error(t.reason);
    const r = lineWall(t.base, t.stock, 0);
    if (!r.ok) throw new Error(r.reason);
    return { ...game, base: r.base };
  }
  const tweaked = (change: (base: Loose) => void): unknown => {
    const save = JSON.parse(encodeSave(lined(), NOW));
    change(save.game.base);
    return decodeSave(JSON.stringify(save));
  };
  const walk = (base: Loose, row: number, spot?: number): number =>
    base.posts.findIndex(
      (p: Loose) => p.kind === 'wall-walk' && p.row === row && (p.spot ?? 0) === (spot ?? 0),
    );

  it('round-trips both spots, writing a spot only past the first', () => {
    const game = lined();
    // Layer 1: 20 spots, one taken by the turret; layer 2 keeps its one post.
    expect(game.base.posts.filter((p) => p.kind === 'wall-walk' && p.column === 0)).toHaveLength(
      19,
    );
    const json = JSON.parse(encodeSave(game, NOW));
    expect(json.game.base.posts[walk(json.game.base, 2)]).toEqual({
      kind: 'wall-walk',
      column: 0,
      row: 2,
    });
    expect(json.game.base.turrets).toContainEqual({
      mount: 'wall-walk',
      column: 0,
      row: 9,
      spot: 1,
      condition: 100,
    });
    expect(decodeSave(encodeSave(game, NOW))).toEqual({ game, savedAt: NOW });
  });

  it('loads an older wall-walk post (no spot) on the first spot of its segment', () => {
    const save = JSON.parse(encodeSave(newGame(), NOW));
    save.game.base.posts.push({ kind: 'wall-walk', column: 0, row: 3 });
    const loaded = decodeSave(JSON.stringify(save));
    const post = loaded!.game.base.posts.find((p) => p.kind === 'wall-walk')!;
    expect(post).toEqual({ kind: 'wall-walk', column: 0, row: 3 });
    expect(spotOf(post)).toBe(0);
  });

  it('refuses a spot the game never writes', () => {
    for (const spot of [0, 2, -1, 1.5, '1', null, true, 1e300]) {
      expect(
        tweaked((b) => (b.posts[walk(b, 2, 1)].spot = spot)),
        String(spot),
      ).toBeNull();
    }
    // Only a wall-walk or wall mount has a second spot.
    expect(tweaked((b) => (b.posts[0].spot = 1))).toBeNull();
    expect(
      tweaked((b) => {
        expect(b.turrets[0].mount).toBe('tower');
        b.turrets[0].spot = 1;
      }),
    ).toBeNull();
    // A look-alike key, or a prototype name, is an unknown key.
    expect(
      tweaked((b) => (b.posts[walk(b, 2, 1)] = { ...b.posts[walk(b, 2, 1)], spоt: 1 })),
    ).toBeNull();
    const proto = encodeSave(lined(), NOW).replace(
      '"row":2,"spot":1',
      '"row":2,"__proto__":{"x":1},"spot":1',
    );
    expect(proto).not.toBe(encodeSave(lined(), NOW));
    expect(decodeSave(proto)).toBeNull();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('refuses spots out of order, a spot twice, or a post and a turret on one spot', () => {
    expect(
      tweaked((b) => {
        const [first, second] = [walk(b, 2), walk(b, 2, 1)];
        [b.posts[first], b.posts[second]] = [b.posts[second], b.posts[first]];
      }),
    ).toBeNull();
    expect(tweaked((b) => b.posts.splice(walk(b, 2, 1), 0, b.posts[walk(b, 2, 1)]))).toBeNull();
    // Row 9's spot 2 holds the turret: a post there too is refused, on spot 1 it is fine.
    expect(
      tweaked((b) =>
        b.posts.splice(walk(b, 9) + 1, 0, { kind: 'wall-walk', column: 0, row: 9, spot: 1 }),
      ),
    ).toBeNull();
    expect(tweaked(() => {})).not.toBeNull();
  });

  const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
  /** Every layer a full wood wall, so every slot can hold every post or turret. */
  const fullWalls = (b: Loose): void => {
    const wall = { kind: 'wall', tier: 'wood', hp: 200, maxHp: 200 };
    b.layers = [0, 1, 2].map((column) => ({
      column,
      slots: Array.from({ length: SEGMENTS }, () => ({ ...wall })),
    }));
  };
  const everySlot = <T>(make: (column: number, row: number) => T[]): T[] =>
    [0, 1, 2]
      .flatMap((column) => Array.from({ length: SEGMENTS }, (_, row) => make(column, row)))
      .flat();

  it('loads a grid full of posts or of turrets, and refuses one more of either', () => {
    // Per slot: a ground post, a tower and both wall-walk spots (in buildPost's order).
    const posts = everySlot((column, row) => [
      { kind: 'ground', column, row },
      { kind: 'tower', column, row },
      { kind: 'wall-walk', column, row },
      { kind: 'wall-walk', column, row, spot: 1 },
    ]).sort(
      (a, b) =>
        a.column - b.column ||
        cmp(a.kind, b.kind) ||
        a.row - b.row ||
        (a.spot ?? 0) - (b.spot ?? 0),
    );
    const full = (b: Loose) => {
      fullWalls(b);
      b.posts = posts;
      b.turrets = [];
    };
    expect(posts).toHaveLength(3 * SEGMENTS * 4);
    expect(tweaked(full)).not.toBeNull();
    expect(tweaked((b) => (full(b), b.posts.push({ ...posts.at(-1) })))).toBeNull();

    // Per slot: a tower mount and both wall mounts; ground posts only, so no spot clashes.
    const turrets = everySlot((column, row) => [
      { mount: 'tower', column, row, condition: 100 },
      { mount: 'wall-walk', column, row, condition: 100 },
      { mount: 'wall-walk', column, row, spot: 1, condition: 100 },
    ]).sort(
      (a, b) =>
        a.column - b.column ||
        cmp(a.mount, b.mount) ||
        a.row - b.row ||
        (a.spot ?? 0) - (b.spot ?? 0),
    );
    const armed = (b: Loose) => {
      fullWalls(b);
      b.posts = [{ kind: 'ground', column: 0, row: 0 }];
      b.turrets = turrets;
    };
    expect(turrets).toHaveLength(3 * SEGMENTS * 3);
    expect(tweaked(armed)).not.toBeNull();
    expect(tweaked((b) => (armed(b), b.turrets.push({ ...turrets.at(-1) })))).toBeNull();
  });
});

describe('save: commander perks (ID-020)', () => {
  const raw = (game: Loose) => decodeSave(JSON.stringify({ v: SAVE_VERSION, savedAt: NOW, game }));
  /** A new game with the Lab at 2 and `research` done. */
  const lab2 = (research: string[], perks: string[]) => ({ ...newGame(), lab: 2, research, perks });

  it('round-trips equipped perks and slots researched', () => {
    const game = {
      ...lab2(
        ['metal-walls', 'auto-turret', 'overclock', 'perk-slot-2'],
        ['overclock', 'steady-fire'],
      ),
      tiers: ['wood', 'metal'],
    };
    expect(raw(game)?.game).toEqual(game);
    expect(raw(lab2([], []))?.game.perks).toEqual([]); // an empty slot is fine
  });

  it('loads a save from before perks with 1 slot and Steady Fire equipped', () => {
    const save = JSON.parse(encodeSave(played(), NOW));
    delete save.game.perks;
    expect(decodeSave(JSON.stringify(save))?.game.perks).toEqual(['steady-fire']);
  });

  it('still loads a version 2 save, which saves again as the current version', () => {
    const save = JSON.parse(encodeSave(played(), NOW));
    save.v = 2;
    save.game = prePatrol(played());
    save.game.stock = oldStock(played());
    delete save.game.perks;
    const loaded = decodeSave(JSON.stringify(save));
    expect(loaded?.game).toEqual(played()); // its new resources are all 0, as a v2 save loads them
    expect(JSON.parse(encodeSave(loaded!.game, NOW)).v).toBe(SAVE_VERSION);
  });

  it('refuses perks the game could not have equipped', () => {
    expect(raw(lab2([], ['fortify']))).toBeNull(); // not researched
    expect(raw(lab2(['fortify'], ['fortify', 'steady-fire']))).toBeNull(); // one slot only
    expect(raw(lab2(['perk-slot-2'], ['steady-fire', 'steady-fire']))).toBeNull();
    expect(raw(lab2([], ['death-ray']))).toBeNull();
    expect(raw(lab2([], ['steady-fire ']))).toBeNull();
    expect(raw(lab2([], ['steady‐fire']))).toBeNull(); // a Unicode hyphen
    expect(raw(lab2([], ['steady-fire\u200b']))).toBeNull(); // zero-width space
    expect(raw(lab2([], ['\u202esteady-fire']))).toBeNull(); // bidi override
    expect(raw(lab2([], ['__proto__']))).toBeNull();
    expect(raw(lab2([], ['constructor']))).toBeNull();
    expect(raw({ ...newGame(), perks: 'steady-fire' })).toBeNull();
    expect(raw({ ...newGame(), perks: { 0: 'steady-fire' } })).toBeNull();
    expect(raw({ ...newGame(), perks: [1] })).toBeNull();
    expect(raw({ ...newGame(), perks: null })).toBeNull();
    expect(raw(lab2(['perk-slot-3'], []))).toBeNull(); // a slot out of order
  });

  it('refuses an oversized perk list without reading it', () => {
    expect(
      raw(
        lab2(
          [],
          Array.from({ length: 10_000 }, () => 'steady-fire'),
        ),
      ),
    ).toBeNull();
  });

  it('refuses a polluted perk entry and leaves Object.prototype alone', () => {
    const r = encodeSave(newGame(), NOW).replace(
      '"perks":[',
      '"perks":[{"__proto__":{"polluted":1}},',
    );
    expect(decodeSave(r)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: resource inventory (ID-025)', () => {
  const raw = (v: number, game: Loose) => decodeSave(JSON.stringify({ v, savedAt: NOW, game }));
  const withStock = (stock: Loose) => ({ ...newGame(), stock });
  const oldWithStock = (stock: Loose) => ({ ...prePatrol(newGame()), stock });
  const full = stockOf({ scrap: 5, parts: 1, food: 2, medicine: 3, chemicals: 4, genes: 99 });

  it('round-trips every resource', () => {
    expect(SAVE_VERSION).toBe(8);
    const game = withStock(full);
    expect(decodeSave(encodeSave(game, NOW))?.game.stock).toEqual(full);
  });

  it('loads a v3 save with only the building materials; the rest start at 0', () => {
    const old = { scrap: 7, wood: 8, metal: 9, concrete: 1 };
    expect(raw(3, oldWithStock(old))?.game.stock).toEqual(stockOf(old));
    // A v3 save never held the new keys, so one that does is not ours.
    expect(raw(3, oldWithStock({ ...old, genes: 5 }))).toBeNull();
    // And a current save must hold them all.
    expect(raw(SAVE_VERSION, withStock(old))).toBeNull();
  });

  it('refuses hostile counts and keys', () => {
    for (const genes of [-1, 1.5, MAX_COUNT + 1, '5', null, NaN, Infinity, [5], { n: 5 }, true]) {
      expect(raw(SAVE_VERSION, withStock({ ...full, genes })), String(genes)).toBeNull();
    }
    expect(raw(SAVE_VERSION, withStock({ ...full, gold: 1 }))).toBeNull();
    expect(raw(SAVE_VERSION, withStock({ ...full, 'genes​': 1 }))).toBeNull();
    expect(raw(SAVE_VERSION, withStock({ ...full, '\u202egenes': 1 }))).toBeNull(); // bidi override
    expect(raw(SAVE_VERSION, withStock({ ...full, Genes: 1 }))).toBeNull();
    expect(raw(SAVE_VERSION, withStock({ ...full, constructor: 1 }))).toBeNull();
    expect(raw(SAVE_VERSION, withStock(Object.entries(full)))).toBeNull();
    const proto = JSON.stringify({ v: SAVE_VERSION, savedAt: NOW, game: withStock(full) }).replace(
      '"genes":99',
      '"genes":99,"__proto__":{"polluted":1}',
    );
    expect(decodeSave(proto)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(raw(SAVE_VERSION, withStock({ ...full, genes: MAX_COUNT }))?.game.stock.genes).toBe(
      MAX_COUNT,
    );
  });
});

describe('save: patrols (ID-026)', () => {
  const H = 60 * 60 * 1000;
  /**
   * Horde 3: Bob back from the gas station (patrol 1), a police patrol (2) back with its
   * weapons, and Jack and John out at the electronics store (3).
   */
  /** The first seed from 1 for which `test` passes on `p`. */
  function seedFor(p: Patrol, test: (o: PatrolOutcome, seed: number) => boolean): number {
    for (let seed = 1; seed < 10_000; seed++) {
      if (test(patrolOutcome({ ...p, seed }), seed)) return seed;
    }
    throw new Error('no such seed');
  }
  const unhurt = (o: PatrolOutcome) => !o.wiped && o.dead.length + o.injured.length === 0;
  /** `game` with its last patrol on the first seed where `test` passes. */
  function reseed(game: GameState, test: (o: PatrolOutcome) => boolean): GameState {
    const p = game.patrols.at(-1)!;
    return { ...game, patrols: [...game.patrols.slice(0, -1), { ...p, seed: seedFor(p, test) }] };
  }

  function patrolling(): GameState {
    let g: GameState = { ...newGame(), hordeNumber: 3 };
    // Seeds where everyone comes back fit, so this fixture is about loot only.
    const r1 = sendPatrol(g, 'gas-station', ['bob'], 0, NOW - 3 * H);
    if (!r1.ok) throw new Error(r1.reason);
    g = settlePatrols(reseed(r1.game, unhurt), NOW - 2 * H);
    // The police station waits for research, so this patrol is placed by hand; it finds weapons.
    const police: Patrol = {
      ...g.patrols[0]!,
      ...{ no: 2, location: 'police', buildings: ['police'], members: ['bob'] },
      ...{ sentAt: NOW - 2.5 * H, focus: 'anything', order: 'balanced' },
      ...{ sentHorde: 3, strength: 1, seed: 0 },
    };
    police.seed = seedFor(
      police,
      (o, seed) => unhurt(o) && patrolLoot({ ...police, seed }).weapons.length > 0,
    );
    g = settlePatrols({ ...g, patrols: [police], patrolsSent: 2 }, NOW - H / 2);
    const r3 = sendPatrol(g, 'electronics', ['jack', 'john'], 0, NOW - H / 4);
    if (!r3.ok) throw new Error(r3.reason);
    return reseed(r3.game, unhurt);
  }
  const raw = (game: Loose, v: unknown = SAVE_VERSION) =>
    decodeSave(JSON.stringify({ v, savedAt: NOW, game }));
  const poke = (change: (g: Loose) => void) => {
    const g = JSON.parse(JSON.stringify(patrolling()));
    change(g);
    return raw(g);
  };

  it('round-trips patrols out, the count, reports and weapons found', () => {
    const g = patrolling();
    expect(g.armoury.some((w) => w.uid.startsWith('p2-'))).toBe(true);
    expect(g.reports.map((r) => r.no)).toEqual([1, 2]);
    expect(decodeSave(encodeSave(g, NOW))?.game).toEqual(g);
  });

  it('settles a patrol that came due while the game was closed', () => {
    const loaded = decodeSave(encodeSave(patrolling(), NOW))!.game;
    const back = settlePatrols(loaded, NOW + H);
    expect(back.patrols).toEqual([]);
    expect(back.reports.at(-1)!.names).toEqual(['Jack', 'John']);
  });

  it('loads a v4 save with no patrols, and refuses a v5 save without them', () => {
    const old = raw(prePatrol(newGame()), 4);
    expect(old?.game.patrols).toEqual([]);
    expect(old?.game.patrolsSent).toBe(0);
    expect(old?.game.reports).toEqual([]);
    expect(raw(prePatrol(newGame()))).toBeNull();
    expect(raw(newGame(), 4)).toBeNull();
  });

  it('cuts a send time after the save to the save', () => {
    const loaded = poke((g) => (g.patrols[0].sentAt = NOW + 9 * H));
    expect(loaded?.game.patrols[0]!.sentAt).toBe(NOW);
  });

  it('refuses patrols the game could not have sent', () => {
    const cases: [string, (g: Loose) => void][] = [
      ['unknown location', (g) => (g.patrols[0].location = 'mall')],
      ['hidden location', (g) => (g.patrols[0].location = 'crater')],
      ['not yet revealed when sent', (g) => (g.patrols[0].location = 'hardware')],
      ['look-alike location', (g) => (g.patrols[0].location = 'electronics​')],
      ['bidi location', (g) => (g.patrols[0].location = '‮electronics')],
      ['unknown member', (g) => (g.patrols[0].members = ['zed'])],
      ['member twice', (g) => (g.patrols[0].members = ['jack', 'jack'])],
      ['no members', (g) => (g.patrols[0].members = [])],
      [
        'member on two patrols',
        (g) => {
          g.patrolsSent = 4;
          g.patrols.push({ ...g.patrols[0], no: 4, members: ['john'], strength: 0 });
        },
      ],
      [
        'patrols out of order',
        (g) => {
          g.patrolsSent = 4;
          g.patrols.unshift({ ...g.patrols[0], no: 4, members: ['bob'], strength: 0 });
        },
      ],
      [
        'number twice',
        (g) => {
          g.patrolsSent = 4;
          g.patrols.push({ ...g.patrols[0], members: ['bob'], strength: 0 });
        },
      ],
      ['bidi member id', (g) => (g.patrols[0].members = ['\u202ejack'])],
      ['zero-width member id', (g) => (g.patrols[0].members = ['ja\u200bck'])],
      ['number past the count', (g) => (g.patrols[0].no = 4)],
      ['number 0', (g) => (g.patrols[0].no = 0)],
      ['sent before patrols opened', (g) => (g.patrols[0].sentHorde = 2)],
      ['sent from a future horde', (g) => (g.patrols[0].sentHorde = 4)],
      ['stronger than its party', (g) => (g.patrols[0].strength = 99)],
      ['sent injured', (g) => (g.roster[1].injuredUntil = NOW)],
      ['negative seed', (g) => (g.patrols[0].seed = -1)],
      ['fractional seed', (g) => (g.patrols[0].seed = 1.5)],
      ['huge seed', (g) => (g.patrols[0].seed = 2 ** 32)],
      ['string time', (g) => (g.patrols[0].sentAt = String(NOW))],
      ['NaN strength', (g) => (g.patrols[0].strength = 'NaN')],
      ['extra key', (g) => (g.patrols[0].extra = 1)],
      ['missing key', (g) => delete g.patrols[0].seed],
      ['patrols not an array', (g) => (g.patrols = {})],
      ['more patrols than defenders', (g) => (g.patrols = Array(4).fill(g.patrols[0]))],
      ['count negative', (g) => (g.patrolsSent = -1)],
      ['count fractional', (g) => (g.patrolsSent = 3.5)],
      ['count too high', (g) => (g.patrolsSent = MAX_COUNT + 1)],
      ['weapon from a patrol still out', (g) => (g.armoury[0].uid = 'p3-0')],
      ['weapon from a patrol never sent', (g) => (g.armoury[0].uid = 'p4-0')],
      ['weapon uid malformed', (g) => (g.armoury[0].uid = 'p2-')],
      ['weapon uid oversized', (g) => (g.armoury[0].uid = 'p2-0000')],
      ['weapon uid padded', (g) => (g.armoury[0].uid = 'p2-00')],
      ['count past what a uid holds', (g) => (g.patrolsSent = 1_000_000)],
    ];
    for (const [name, change] of cases) expect(poke(change), name).toBeNull();
  });

  it('refuses reports the game could not have written', () => {
    const cases: [string, (g: Loose) => void][] = [
      ['from a patrol still out', (g) => (g.reports[0].no = 3)],
      ['from a patrol never sent', (g) => (g.reports[0].no = 4)],
      ['twice', (g) => (g.reports[1].no = 1)],
      ['unknown location', (g) => (g.reports[0].location = 'mall')],
      ['bidi name', (g) => (g.reports[0].names = ['‮Bob'])],
      ['zero-width name', (g) => (g.reports[0].names = ['Bo​b'])],
      ['markup name', (g) => (g.reports[0].names = ['<img src=x>'])],
      ['oversized name', (g) => (g.reports[0].names = ['B'.repeat(25)])],
      ['kept not a boolean', (g) => (g.reports[1].weapons[0].kept = 'yes')],
      ['unknown weapon', (g) => (g.reports[1].weapons[0].base = 'bazooka')],
      ['too many weapons', (g) => (g.reports[1].weapons = Array(6).fill(g.reports[1].weapons[0]))],
      ['negative gas', (g) => (g.reports[0].gas = -1)],
      ['unknown material', (g) => (g.reports[0].stock.gold = 1)],
      ['missing battery', (g) => delete g.reports[0].batteries.makeshift],
      ['fractional xp', (g) => (g.reports[0].xp = 1.5)],
      ['too many reports', (g) => (g.reports = Array(21).fill(g.reports[0]))],
      ['too many names', (g) => (g.reports[0].names = Array(101).fill('Bob'))],
      ['unknown rarity', (g) => (g.reports[1].weapons[0].rarity = 'legendary')],
      ['string return time', (g) => (g.reports[0].returnedAt = String(NOW))],
    ];
    for (const [name, change] of cases) expect(poke(change), name).toBeNull();
  });

  it('refuses polluted patrols and reports and leaves Object.prototype alone', () => {
    const json = encodeSave(patrolling(), NOW);
    for (const [from, to] of [
      ['"location":"electronics"', '"location":"electronics","__proto__":{"polluted":1}'],
      ['"returnedAt":', '"__proto__":{"polluted":1},"returnedAt":'],
      ['"patrolsSent":', '"constructor":{"polluted":1},"patrolsSent":'],
    ] as const) {
      expect(json.includes(from), from).toBe(true);
      expect(decodeSave(json.replace(from, to)), to).toBeNull();
    }
    // Inside a report's stock: `power` has no `returnedAt`, so this lands in a report.
    const inStock = json.replace(/("returnedAt":\d+,"stock":\{)/, '$1"__proto__":{"polluted":1},');
    expect(inStock).not.toBe(json);
    expect(decodeSave(inStock)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('loads a second patrol in order, so the cases above fail only on their fault', () => {
    const g = JSON.parse(JSON.stringify(patrolling()));
    g.patrolsSent = 4;
    g.patrols.push({ ...g.patrols[0], no: 4, members: ['bob'], strength: 0 });
    expect(raw(g)?.game.patrols.map((p) => p.no)).toEqual([3, 4]);
  });
  /**
   * Patrolling's camp an hour on: John took a police gun to the electronics store and
   * died there, leaving it behind; Jack came back injured.
   */
  function losing(): GameState {
    const g = structuredClone(patrolling());
    const gun = g.armoury.findIndex((w) => isGun(w));
    const john = g.roster.find((d) => d.id === 'john')!;
    john.loadout = { ...john.loadout, primary: g.armoury.splice(gun, 1)[0]! };
    g.patrols[0] = { ...g.patrols[0]!, strength: 3.6 };
    const hurt = (o: PatrolOutcome) =>
      !o.wiped && o.dead.join() === 'john' && o.injured.join() === 'jack';
    return settlePatrols(reseed(g, hurt), NOW + H);
  }
  const lost = (change: (g: Loose) => void, v: unknown = SAVE_VERSION) => {
    const g = JSON.parse(JSON.stringify(losing()));
    change(g);
    return decodeSave(JSON.stringify({ v, savedAt: NOW + H, game: g }));
  };

  it('round-trips casualties and the weapons the dead left (ID-027)', () => {
    const g = losing();
    expect(g.reports.at(-1)).toMatchObject({ injured: ['Jack'], dead: ['John'], wiped: false });
    expect(g.leftBehind.map((l) => l.location)).toEqual(['electronics']);
    expect(decodeSave(encodeSave(g, NOW + H))?.game).toEqual(g);
  });

  it('loads a v5 save with no weapons left and no casualties, and refuses a v6 save without them', () => {
    const v5 = preRisk(patrolling());
    const old = raw(v5, 5)?.game;
    expect(old?.leftBehind).toEqual([]);
    expect(old?.reports.map((r) => [r.injured, r.dead, r.wiped, r.recovered])).toEqual([
      [[], [], false, []],
      [[], [], false, []],
    ]);
    expect(raw(v5)).toBeNull();
    expect(raw(patrolling(), 5)).toBeNull();
  });

  it('refuses weapons left behind and casualties the game could not have written', () => {
    const cases: [string, (g: Loose) => void][] = [
      ['left not an array', (g) => (g.leftBehind = {})],
      ['too many left', (g) => (g.leftBehind = Array(PATROL.left + 1).fill(g.leftBehind[0]))],
      ['left at an unknown location', (g) => (g.leftBehind[0].location = 'mall')],
      ['left at a hidden location', (g) => (g.leftBehind[0].location = 'crater')],
      ['left at a bidi location', (g) => (g.leftBehind[0].location = '\u202eelectronics')],
      ['left weapon malformed', (g) => (g.leftBehind[0].weapon.uid = 'x1')],
      ['left weapon also in the armoury', (g) => g.armoury.push(g.leftBehind[0].weapon)],
      ['left weapon twice', (g) => g.leftBehind.push(g.leftBehind[0])],
      ['left weapon from the future', (g) => (g.leftBehind[0].weapon.uid = 'p9-0')],
      ['left extra key', (g) => (g.leftBehind[0].extra = 1)],
      ['left missing weapon', (g) => delete g.leftBehind[0].weapon],
      ['dead not in the party', (g) => (g.reports.at(-1).dead = ['Bob'])],
      ['injured not in the party', (g) => (g.reports.at(-1).injured = ['Bob'])],
      ['injured and dead', (g) => (g.reports.at(-1).injured = ['John'])],
      ['dead twice', (g) => (g.reports.at(-1).dead = ['John', 'John'])],
      ['injured twice', (g) => (g.reports.at(-1).injured = ['Jack', 'Jack'])],
      [
        'wiped by one name twice',
        (g) =>
          Object.assign(g.reports.at(-1), { dead: ['John', 'John'], injured: [], wiped: true }),
      ],
      ['oversized casualty', (g) => (g.reports.at(-1).dead = ['J'.repeat(25)])],
      ['bidi casualty', (g) => (g.reports.at(-1).dead = ['\u202eJohn'])],
      ['zero-width casualty', (g) => (g.reports.at(-1).dead = ['Jo\u200bhn'])],
      ['markup casualty', (g) => (g.reports.at(-1).dead = ['<b>John</b>'])],
      ['casualties not an array', (g) => (g.reports.at(-1).dead = 'John')],
      ['wiped not a boolean', (g) => (g.reports.at(-1).wiped = 'no')],
      ['wiped with a survivor', (g) => (g.reports.at(-1).wiped = true)],
      ['all dead but not wiped', (g) => (g.reports.at(-1).dead = ['Jack', 'John'])],
      [
        'wiped but brought loot back',
        (g) => {
          const r = g.reports.at(-1);
          Object.assign(r, { dead: ['Jack', 'John'], injured: [], wiped: true, xp: 0, gas: 1 });
        },
      ],
      [
        'too many recovered',
        (g) =>
          (g.reports.at(-1).recovered = Array(PATROL.left + 1).fill({
            base: 'pistol',
            rarity: 'rusty',
            kept: true,
          })),
      ],
      [
        'recovered kept not a boolean',
        (g) => (g.reports.at(-1).recovered = [{ base: 'pistol', rarity: 'rusty', kept: 1 }]),
      ],
      ['missing casualties key', (g) => delete g.reports.at(-1).dead],
      ['missing left key', (g) => delete g.leftBehind],
    ];
    for (const [name, change] of cases) expect(lost(change), name).toBeNull();
    // A wiped-out party that brought nothing back loads, so the case above fails on its loot.
    const wiped = lost((g) => {
      const r = g.reports.at(-1);
      Object.assign(r, {
        dead: ['Jack', 'John'],
        injured: [],
        wiped: true,
        xp: 0,
        gas: 0,
        weapons: [],
      });
      for (const k of Object.keys(r.stock)) r.stock[k] = 0;
      for (const k of Object.keys(r.batteries)) r.batteries[k] = 0;
    });
    expect(wiped?.game.reports.at(-1)!.wiped).toBe(true);
  });

  it('refuses polluted weapons left behind and leaves Object.prototype alone', () => {
    const json = encodeSave(losing(), NOW + H);
    const from = '"leftBehind":[{';
    expect(json.includes(from)).toBe(true);
    expect(decodeSave(json.replace(from, `${from}"__proto__":{"polluted":1},`))).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: the camp (ID-033)', () => {
  /** A camp at level 3 (90 XP) with one pick taken and one offer waiting, a clock running, 4 people. */
  function camped(): GameState {
    const g = played();
    return {
      ...g,
      roster: [...g.roster, { ...g.roster[0]!, id: 'recruit-1', name: 'Ava', injuredUntil: null }],
      camp: {
        upgrades: 1,
        xp: 90,
        picks: { ...NO_PICKS, medic: 1 },
        offers: [['salvage', 'foraging', 'medic']],
        recruitAt: NOW + 30 * 60 * 1000,
        recruits: 1,
      },
    };
  }
  const withCamp = (change: (camp: Loose, game: Loose) => void): unknown => {
    const save = JSON.parse(encodeSave(camped(), NOW));
    change(save.game.camp, save.game);
    return decodeSave(JSON.stringify(save));
  };

  it('round-trips a camp exactly', () => {
    expect(decodeSave(encodeSave(camped(), NOW))?.game).toEqual(camped());
  });

  it('round-trips a game straight after a win that levelled the camp twice', () => {
    const g = { ...played(), hordeNumber: 23, camp: { ...newCamp(), xp: 29 } };
    const h = startHorde(recover(g, NOW + 3 * 60 * 60 * 1000), 5, 'jack', 0, NOW);
    h.outcome = 'won';
    const after = finishHorde(g, h, NOW);
    expect(after.camp.offers).toHaveLength(2);
    expect(decodeSave(encodeSave(after, NOW))?.game).toEqual(after);
  });

  it('loads a v6 save with a new camp, and refuses a v7 save without one', () => {
    const v6 = JSON.stringify({ v: 6, savedAt: NOW, game: preCamp(played()) });
    expect(decodeSave(v6)?.game.camp).toEqual(newCamp());
    expect(hostile((s) => delete s.game.camp)).toBeNull();
    expect(decodeSave(JSON.stringify({ v: 6, savedAt: NOW, game: played() }))).toBeNull();
  });

  it('round-trips a stopped clock, and a far-past one stops at the floor once loaded', () => {
    const stopped = withCamp((c) => (c.recruitAt = null)) as { game: GameState };
    expect(stopped.game.camp.recruitAt).toBeNull();
    const past = withCamp((c, g) => {
      c.recruitAt = 0;
      g.roster = g.roster.slice(0, 1);
      g.patrols = [];
    }) as { game: GameState };
    const caught = recruitArrivals(past.game, NOW);
    expect(caught.roster).toHaveLength(3);
    expect(caught.camp.recruitAt).toBeNull();
    expect(decodeSave(encodeSave(caught, NOW))?.game).toEqual(caught);
  });

  it('a recruit count at or near its cap stops there and still reloads', () => {
    for (const recruits of [MAX_COUNT - 1, MAX_COUNT]) {
      const near = withCamp((c, g) => {
        Object.assign(c, { recruits, recruitAt: 0 });
        g.roster = g.roster.slice(0, 1);
        g.patrols = [];
      }) as { game: GameState };
      const after = recruitArrivals(near.game, NOW);
      expect(after.camp.recruits).toBeLessThanOrEqual(MAX_COUNT);
      expect(after.camp.recruitAt).toBeNull();
      expect(recruitArrivals(after, NOW + 10 * 60 * 60 * 1000)).toBe(after);
      expect(decodeSave(encodeSave(after, NOW))?.game).toEqual(after);
    }
  });

  it('cuts a recruit clock past an hour from the save to that', () => {
    const later = withCamp((c) => (c.recruitAt = NOW + 50 * 60 * 60 * 1000)) as { game: GameState };
    expect(later.game.camp.recruitAt).toBe(NOW + CAMP_SIZE.recruitMs);
  });

  it('refuses a camp the game could not have reached', () => {
    const cases: [string, (c: Loose, g: Loose) => void][] = [
      ['not an object', (c, g) => (g.camp = [c])],
      ['extra key', (c) => (c.extra = 1)],
      ['missing key', (c) => delete c.recruits],
      ['upgrades negative', (c) => (c.upgrades = -1)],
      ['upgrades past the last', (c) => (c.upgrades = CAMP_UPGRADES.length + 1)],
      ['upgrades fractional', (c) => (c.upgrades = 0.5)],
      ['upgrades as text', (c) => (c.upgrades = '1')],
      ['xp negative', (c) => (c.xp = -1)],
      ['xp too big', (c) => (c.xp = MAX_COUNT + 1)],
      ['xp NaN-ish', (c) => (c.xp = null)],
      ['pick over its ranks', (c) => (c.picks.medic = CAMP_PICK_RANKS + 1)],
      ['unknown pick', (c) => (c.picks.cheat = 1)],
      ['missing pick', (c) => delete c.picks.medic],
      ['picks not earned', (c) => (c.picks.salvage = 2)],
      ['offers not earned', (c) => c.offers.push(['salvage'])],
      ['offer empty', (c) => (c.offers = [[]])],
      ['offer of four', (c) => (c.offers = [['salvage', 'foraging', 'medic', 'stockpile']])],
      ['pick twice in an offer', (c) => (c.offers = [['salvage', 'salvage']])],
      ['unknown offered pick', (c) => (c.offers = [['cheat']])],
      ['bidi offered pick', (c) => (c.offers = [['‮medic']])],
      ['zero-width offered pick', (c) => (c.offers = [['med​ic']])],
      ['padded offered pick', (c) => (c.offers = [[' medic']])],
      ['offers not an array', (c) => (c.offers = 'salvage')],
      ['too many offers', (c) => (c.offers = Array(26).fill(['salvage']))],
      [
        'offer at the top rank',
        (c) => {
          c.xp = MAX_COUNT;
          c.picks.medic = CAMP_PICK_RANKS;
          c.offers = [['medic']];
        },
      ],
      ['recruitAt negative', (c) => (c.recruitAt = -1)],
      ['recruitAt as text', (c) => (c.recruitAt = '1')],
      ['recruits negative', (c) => (c.recruits = -1)],
      ['recruits fractional', (c) => (c.recruits = 1.5)],
      ['recruits as text', (c) => (c.recruits = '1')],
      ['recruits past the cap', (c) => (c.recruits = MAX_COUNT + 1)],
      ['recruit not counted', (c) => (c.recruits = 0)],
      ['recruitAt past the latest time', (c) => (c.recruitAt = 1e14)],
      [
        'more people than slots',
        (c, g) => {
          c.upgrades = 0;
          g.roster.push({ ...g.roster[0], id: 'extra-a' }, { ...g.roster[0], id: 'extra-b' });
        },
      ],
    ];
    for (const [name, change] of cases) expect(withCamp(change), name).toBeNull();
  });

  it('refuses a polluted camp and leaves Object.prototype alone', () => {
    const json = encodeSave(camped(), NOW);
    for (const from of ['"camp":{', '"picks":{']) {
      expect(json.includes(from)).toBe(true);
      expect(decodeSave(json.replace(from, `${from}"__proto__":{"polluted":1},`))).toBeNull();
    }
    const offer = '"offers":[[';
    expect(json.includes(offer)).toBe(true);
    expect(decodeSave(json.replace(offer, `${offer}{"__proto__":{"polluted":1}},`))).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('save: plazas and orders (ID-029)', () => {
  const H = 60 * 60 * 1000;
  const ticked = ['gas-station', 'hardware'] as const;

  /** Horde 6: Jack and John out at Riverside Plaza, searching the gas station and the hardware store. */
  function plazaOut(): GameState {
    const g: GameState = { ...newGame(), hordeNumber: 6 };
    const r = sendPatrol(g, 'riverside', ['jack', 'john'], 7, NOW - H / 4, {
      buildings: [...ticked],
      focus: 'gas',
      order: 'loot',
    });
    if (!r.ok) throw new Error(r.reason);
    return r.game;
  }

  /** The same patrol back a while ago, fenced off by a big horde with nobody lost: its report holds a retreat. */
  function fenced(): GameState {
    const g: GameState = { ...newGame(), hordeNumber: 6 };
    const r = sendPatrol(g, 'riverside', ['jack'], 0, NOW - 3 * H, {
      buildings: [...ticked],
      order: 'loot',
    });
    if (!r.ok) throw new Error(r.reason);
    const p = r.game.patrols[0]!;
    let seed = 0;
    while (!(
      patrolOutcome({ ...p, seed }).bigHorde === 'fence' && !patrolOutcome({ ...p, seed }).wiped
    )) {
      seed++;
    }
    return settlePatrols({ ...r.game, patrols: [{ ...p, seed }] }, NOW - H);
  }

  const raw = (game: Loose, v: unknown = SAVE_VERSION) =>
    decodeSave(JSON.stringify({ v, savedAt: NOW, game }));
  const poke = (make: () => GameState, change: (g: Loose) => void) => {
    const g = JSON.parse(JSON.stringify(make()));
    change(g);
    return raw(g);
  };

  const gun = (uid: string) => ({ uid, base: 'pistol', rarity: 'rusty', affixes: [] });
  const withUid = (uid: string) => ({
    ...newGame(),
    hordeNumber: 6,
    patrolsSent: 1,
    armoury: [gun(uid)],
  });

  it('reads a patrol weapon uid up to the most three buildings can find, and no other', () => {
    expect(PATROL.rolls + PATROL.bonusRolls).toBe(5);
    expect(raw(withUid('p1-0'))).not.toBeNull();
    expect(raw(withUid('p1-9'))).not.toBeNull();
    expect(raw(withUid('p1-14'))).not.toBeNull();
    for (const uid of [
      'p1-15',
      'p1-010',
      'p1-01',
      'p1-1\u200b4',
      'p1-\u202e14',
      'p1-',
      'p1--1',
      `p1-${'1'.repeat(10_000)}`,
    ]) {
      expect(raw(withUid(uid)), uid.slice(0, 12)).toBeNull();
    }
  });

  it('round-trips a three-building haul of more than ten weapons', () => {
    const g: GameState = {
      ...newGame(),
      hordeNumber: 6,
      patrolsSent: 1,
      armoury: Array.from({ length: 13 }, (_, k) => gun(`p1-${k}`)) as GameState['armoury'],
    };
    const back = decodeSave(encodeSave(g, NOW))?.game;
    expect(back).toEqual(g);
    expect(back!.armoury.map((w) => w.uid)).toContain('p1-12');
  });

  it('is version 8', () => {
    expect(SAVE_VERSION).toBe(8);
  });

  it('round-trips a plaza patrol out, with its buildings, focus and order', () => {
    const g = plazaOut();
    expect(g.patrols[0]).toMatchObject({
      location: 'riverside',
      buildings: ticked,
      focus: 'gas',
      order: 'loot',
    });
    expect(decodeSave(encodeSave(g, NOW))?.game).toEqual(g);
  });

  it('round-trips a report of a retreat, with what it lost', () => {
    const g = fenced();
    const r = g.reports.at(-1)!;
    expect(r).toMatchObject({ location: 'riverside', bigHorde: 'fence', order: 'loot' });
    expect(r.searched).toBeLessThan(2);
    expect(decodeSave(encodeSave(g, NOW))?.game).toEqual(g);
  });

  it('loads a v7 save with single-building patrols, Anything and Balanced, and reports with defaults', () => {
    let g: GameState = { ...newGame(), hordeNumber: 3 };
    const r1 = sendPatrol(g, 'gas-station', ['bob'], 0, NOW - 3 * H);
    if (!r1.ok) throw new Error(r1.reason);
    g = settlePatrols(r1.game, NOW - 2 * H);
    const r2 = sendPatrol(g, 'electronics', ['jack'], 0, NOW - H / 4);
    if (!r2.ok) throw new Error(r2.reason);
    g = r2.game;
    const old = raw(prePlazas(g), 7)?.game;
    expect(old?.patrols[0]).toMatchObject({
      location: 'electronics',
      buildings: ['electronics'],
      focus: 'anything',
      order: 'balanced',
    });
    expect(old?.reports[0]).toMatchObject({
      location: 'gas-station',
      buildings: ['gas-station'],
      searched: 1,
      bigHorde: null,
      order: 'balanced',
      focus: 'anything',
    });
    expect(old?.reports[0]!.lost.weapons).toBe(0);
    expect(JSON.parse(encodeSave(old!, NOW)).v).toBe(8);
    // A v8 save must carry the new fields; a v7 one cannot name a plaza.
    expect(raw(prePlazas(g))).toBeNull();
    expect(raw(g, 7)).toBeNull();
    expect(raw(prePlazas(plazaOut()), 7)).toBeNull();
  });

  it('refuses patrols the game could not have sent', () => {
    const cases: [string, (g: Loose) => void][] = [
      ['unknown place', (g) => (g.patrols[0].location = 'mall')],
      ['look-alike place', (g) => (g.patrols[0].location = 'riverside\u200b')],
      ['bidi place', (g) => (g.patrols[0].location = '\u202eriverside')],
      ['place __proto__', (g) => (g.patrols[0].location = '__proto__')],
      ['place not a string', (g) => (g.patrols[0].location = 7)],
      ['plaza not yet revealed when sent', (g) => (g.patrols[0].sentHorde = 5)],
      ['no buildings', (g) => (g.patrols[0].buildings = [])],
      ['buildings not an array', (g) => (g.patrols[0].buildings = 'hardware')],
      ['buildings an object', (g) => (g.patrols[0].buildings = { 0: 'hardware' })],
      ['building from another place', (g) => (g.patrols[0].buildings = ['supermarket'])],
      ['building twice', (g) => (g.patrols[0].buildings = ['hardware', 'hardware'])],
      ['buildings out of order', (g) => (g.patrols[0].buildings = ['hardware', 'gas-station'])],
      ['unknown building', (g) => (g.patrols[0].buildings = ['bank'])],
      ['look-alike building', (g) => (g.patrols[0].buildings = ['hardware\u200b'])],
      ['bidi building', (g) => (g.patrols[0].buildings = ['\u202ehardware'])],
      ['building __proto__', (g) => (g.patrols[0].buildings = ['__proto__'])],
      ['building not a string', (g) => (g.patrols[0].buildings = [1])],
      ['building an object', (g) => (g.patrols[0].buildings = [{ id: 'hardware' }])],
      ['one building too many', (g) => (g.patrols[0].buildings = [...ALL_THREE, 'hardware'])],
      ['oversized buildings', (g) => (g.patrols[0].buildings = Array(10_000).fill('hardware'))],
      ['buildings missing', (g) => delete g.patrols[0].buildings],
      ['unknown focus', (g) => (g.patrols[0].focus = 'gold')],
      ['focus in capitals', (g) => (g.patrols[0].focus = 'GAS')],
      ['focus not a string', (g) => (g.patrols[0].focus = ['gas'])],
      ['focus __proto__', (g) => (g.patrols[0].focus = '__proto__')],
      ['focus nothing ticked can drop', (g) => (g.patrols[0].focus = 'medicine')],
      ['focus missing', (g) => delete g.patrols[0].focus],
      ['unknown order', (g) => (g.patrols[0].order = 'run')],
      ['order empty', (g) => (g.patrols[0].order = '')],
      ['order null', (g) => (g.patrols[0].order = null)],
      ['order __proto__', (g) => (g.patrols[0].order = '__proto__')],
      ['order missing', (g) => delete g.patrols[0].order],
      ['extra key', (g) => (g.patrols[0].extra = 1)],
    ];
    for (const [name, change] of cases) expect(poke(plazaOut, change), name).toBeNull();
    // The patrol itself loads, so each case above fails on its own fault.
    expect(poke(plazaOut, () => {})?.game.patrols).toHaveLength(1);
    expect(poke(plazaOut, (g) => (g.patrols[0].buildings = ['gas-station']))).not.toBeNull();
    expect(poke(plazaOut, (g) => (g.patrols[0].focus = 'weapons'))).not.toBeNull();
  });

  it('refuses a single-building patrol that names buildings it does not hold', () => {
    const single = (): GameState => {
      const r = sendPatrol(
        { ...newGame(), hordeNumber: 3 },
        'electronics',
        ['jack'],
        1,
        NOW - H / 4,
      );
      if (!r.ok) throw new Error(r.reason);
      return r.game;
    };
    expect(poke(single, () => {})).not.toBeNull();
    expect(poke(single, (g) => (g.patrols[0].buildings = ['supermarket']))).toBeNull();
    expect(
      poke(single, (g) => (g.patrols[0].buildings = ['electronics', 'supermarket'])),
    ).toBeNull();
    expect(poke(single, (g) => (g.patrols[0].focus = 'gas'))).toBeNull();
  });

  it('refuses reports the game could not have written', () => {
    const last = (g: Loose) => g.reports.at(-1);
    const cases: [string, (g: Loose) => void][] = [
      ['unknown place', (g) => (last(g).location = 'mall')],
      ['bidi place', (g) => (last(g).location = '\u202eriverside')],
      ['building from another place', (g) => (last(g).buildings = ['supermarket'])],
      ['buildings out of order', (g) => (last(g).buildings = ['hardware', 'gas-station'])],
      ['building twice', (g) => (last(g).buildings = ['hardware', 'hardware'])],
      ['no buildings', (g) => (last(g).buildings = [])],
      ['oversized buildings', (g) => (last(g).buildings = Array(10_000).fill('hardware'))],
      ['searched past the buildings', (g) => (last(g).searched = 3)],
      ['searched negative', (g) => (last(g).searched = -1)],
      ['searched a fraction', (g) => (last(g).searched = 0.5)],
      ['searched not a number', (g) => (last(g).searched = '1')],
      ['unknown big horde', (g) => (last(g).bigHorde = 'win')],
      ['big horde not a string', (g) => (last(g).bigHorde = 1)],
      ['big horde __proto__', (g) => (last(g).bigHorde = '__proto__')],
      [
        'searched less without a retreat',
        (g) => {
          last(g).bigHorde = null;
          last(g).searched = 0;
        },
      ],
      [
        'searched less after a beaten horde',
        (g) => {
          last(g).bigHorde = 'defeat';
          last(g).searched = 0;
        },
      ],
      ['unknown order', (g) => (last(g).order = 'run')],
      ['unknown focus', (g) => (last(g).focus = 'gold')],
      ['focus nothing searched can drop', (g) => (last(g).focus = 'medicine')],
      ['lost missing', (g) => delete last(g).lost],
      ['lost not an object', (g) => (last(g).lost = 5)],
      ['lost extra key', (g) => (last(g).lost.extra = 1)],
      ['lost gas negative', (g) => (last(g).lost.gas = -1)],
      ['lost gas a string', (g) => (last(g).lost.gas = '1')],
      ['lost weapons over the haul', (g) => (last(g).lost.weapons = 11)],
      ['lost stock unknown material', (g) => (last(g).lost.stock.gold = 1)],
      ['lost batteries missing', (g) => delete last(g).lost.batteries.standard],
      ['lost an array', (g) => (last(g).lost = [])],
      ['missing key', (g) => delete last(g).bigHorde],
    ];
    for (const [name, change] of cases) expect(poke(fenced, change), name).toBeNull();
    expect(poke(fenced, () => {})).not.toBeNull();
    // A single building never meets a big horde.
    const single = (): GameState => {
      let g: GameState = { ...newGame(), hordeNumber: 3 };
      const r = sendPatrol(g, 'gas-station', ['bob'], 0, NOW - 3 * H);
      if (!r.ok) throw new Error(r.reason);
      g = settlePatrols(r.game, NOW - 2 * H);
      return g;
    };
    expect(poke(single, () => {})).not.toBeNull();
    expect(poke(single, (g) => (last(g).bigHorde = 'fence'))).toBeNull();
  });

  it('refuses polluted patrols and reports and leaves Object.prototype alone', () => {
    const pollute = (json: string, from: string, to: string) => {
      expect(json.includes(from), from).toBe(true);
      expect(decodeSave(json.replace(from, to)), to).toBeNull();
    };
    const out = encodeSave(plazaOut(), NOW);
    pollute(out, '"buildings":[', '"__proto__":{"polluted":1},"buildings":[');
    pollute(out, '"focus":"gas"', '"focus":"gas","constructor":{"polluted":1}');
    const back = encodeSave(fenced(), NOW);
    pollute(back, '"searched":', '"__proto__":{"polluted":1},"searched":');
    pollute(back, '"lost":{', '"lost":{"__proto__":{"polluted":1},');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps weapons the dead left at a plaza, and refuses one from a plaza not yet on the map', () => {
    const gun = { uid: 'h1', base: 'pistol', rarity: 'rusty', affixes: [] };
    const left = (g: Loose) => (g.leftBehind = [{ location: 'riverside', weapon: gun }]);
    const game = (): GameState => ({ ...newGame(), hordeNumber: 6 });
    expect(poke(game, left)?.game.leftBehind[0]!.location).toBe('riverside');
    expect(
      poke(game, (g) => {
        left(g);
        g.hordeNumber = 5;
      }),
    ).toBeNull();
    const g = JSON.parse(JSON.stringify(game()));
    left(g);
    expect(raw(g, 7)).toBeNull();
  });

  it('refuses pollution aimed at a left-behind entry and the lost batteries of a report', () => {
    const gun1 = { uid: 'h1', base: 'pistol', rarity: 'rusty', affixes: [] };
    const base = { ...fenced(), leftBehind: [{ location: 'riverside' as const, weapon: gun1 }] };
    const json = encodeSave(base as GameState, NOW);
    expect(decodeSave(json)).not.toBeNull();
    const lostBatteries = /("lost":\{"stock":\{[^}]*\},"gas":\d+,"batteries":\{)/;
    expect(lostBatteries.test(json)).toBe(true);
    for (const key of ['__proto__', 'constructor']) {
      const evil = `"${key}":{"polluted":1},`;
      expect(decodeSave(json.replace('"leftBehind":[{', `"leftBehind":[{${evil}`)), key).toBeNull();
      expect(decodeSave(json.replace('"weapon":{', `"weapon":{${evil}`)), key).toBeNull();
      expect(decodeSave(json.replace(lostBatteries, `$1${evil}`)), key).toBeNull();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

const ALL_THREE = ['gas-station', 'pharmacy', 'hardware'];
