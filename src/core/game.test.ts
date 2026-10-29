import { describe, expect, it } from 'vitest';
import { newBase } from './base.ts';
import { RECOVERY_MS, START_STOCK, START_TIERS } from './data.ts';
import {
  available,
  finishHorde,
  hordePayout,
  hordeXp,
  injuredUntil,
  levelGains,
  newGame,
  recover,
  spendPoint,
  equip,
  startHorde,
  xpGains,
  type GameState,
} from './game.ts';
import { standing, type HordeState } from './horde.ts';
import { NO_STATS, spentPoints } from './stats.ts';
import { loadoutFrom, type Loadout } from './loadout.ts';

const NOW = 1_000_000;

/** Horde `game.hordeNumber` fought to `outcome`, with row 0 of column 0 left at 120 HP. */
function fought(game: GameState, outcome: 'won' | 'lost'): HordeState {
  const h = startHorde(game, 1, game.roster[0]!.id, 0, NOW);
  h.layers[0]!.segments[0]!.hp = 120;
  h.outcome = outcome;
  return h;
}

/** `h` with the start defender injured (out of the fight) and `recruit` sent in from the bench. */
function withInjuryAndRecruit(h: HordeState, recruit: string): HordeState {
  const [d] = h.defenders.splice(0, 1);
  h.posts[d!.postId]!.defenderId = null;
  h.injured.push({
    defender: { id: d!.id, name: d!.name, loadout: { ...d!.loadout } },
    postId: d!.postId,
    at: h.time,
    offered: true,
    by: null,
  });
  const spec = h.bench.find((b) => b.id === recruit)!;
  h.bench = h.bench.filter((b) => b !== spec);
  h.defenders.push(standing(spec, h.posts[1]!, 0));
  h.posts[1]!.defenderId = recruit;
  h.tookPart.push(recruit);
  return h;
}

describe('game', () => {
  it('starts at horde 1 on the starting base and stock, everyone fit with no XP', () => {
    const g = newGame();
    expect(g.hordeNumber).toBe(1);
    expect(g.base).toEqual(newBase());
    expect(g.stock).toEqual(START_STOCK);
    expect(g.tiers).toEqual(START_TIERS);
    // One per profession, each with a pistol (design §6, §11).
    expect(g.roster.map((d) => [d.name, d.loadout])).toEqual([
      ['Bob', { primary: 'pistol', secondary: null, item: null }],
      ['Jack', { primary: 'pistol', secondary: 'knife', item: null }],
      ['John', { primary: 'pistol', secondary: 'toolkit', item: null }],
    ]);
    expect(g.roster.every((d) => d.xp === 0 && d.injuredUntil === null)).toBe(true);
    expect(g.roster.every((d) => spentPoints(d.stats) === 0)).toBe(true);
  });

  it('starts a horde with the chosen defender on the chosen post', () => {
    const g = newGame();
    const h = startHorde(g, 7, g.roster[1]!.id, 1, NOW);
    expect(h.hordeNumber).toBe(1);
    expect(h.posts[1]!.defenderId).toBe(g.roster[1]!.id);
    expect(h.posts[0]!.defenderId).toBeNull();
    expect(h.defenders.map((d) => d.id)).toEqual([g.roster[1]!.id]);
    expect(h.bench).toEqual([
      { id: 'bob', name: 'Bob', loadout: loadoutFrom('pistol'), stats: { ...NO_STATS } },
      { id: 'john', name: 'John', loadout: loadoutFrom('toolkit'), stats: { ...NO_STATS } },
    ]);
  });

  it('pays a win in full, more each horde', () => {
    expect(hordePayout({ hordeNumber: 1, outcome: 'won', wave: 5, waveCount: 5 })).toEqual({
      scrap: 20,
      wood: 30,
      metal: 0,
      concrete: 0,
    });
    expect(hordePayout({ hordeNumber: 4, outcome: 'won', wave: 6, waveCount: 6 })).toEqual({
      scrap: 35,
      wood: 60,
      metal: 0,
      concrete: 0,
    });
  });

  it('pays a loss a quarter scaled by the wave reached, rounded down', () => {
    const lost = (wave: number) =>
      hordePayout({ hordeNumber: 1, outcome: 'lost', wave, waveCount: 5 });
    expect(lost(1)).toEqual({ scrap: 1, wood: 1, metal: 0, concrete: 0 });
    expect(lost(3)).toEqual({ scrap: 3, wood: 4, metal: 0, concrete: 0 });
    expect(lost(5)).toEqual({ scrap: 5, wood: 7, metal: 0, concrete: 0 });
    // Never beats a win, at any horde and wave.
    for (let n = 1; n <= 30; n++) {
      const win = hordePayout({ hordeNumber: n, outcome: 'won', wave: 1, waveCount: 10 });
      for (let wave = 1; wave <= 10; wave++) {
        const loss = hordePayout({ hordeNumber: n, outcome: 'lost', wave, waveCount: 10 });
        expect(loss.scrap * 4).toBeLessThanOrEqual(win.scrap);
        expect(loss.wood * 4).toBeLessThanOrEqual(win.wood);
      }
    }
    expect(() =>
      hordePayout({ hordeNumber: 1, outcome: 'fighting', wave: 1, waveCount: 5 }),
    ).toThrow(RangeError);
  });

  it('a win moves to the next horde, pays, gives XP and carries damage', () => {
    const g = newGame();
    const next = finishHorde(g, fought(g, 'won'), NOW);
    expect(next.hordeNumber).toBe(2);
    expect(next.stock).toEqual({ scrap: 80, wood: 90, metal: 0, concrete: 0 });
    expect(next.base.layers[0]!.slots[0]!.hp).toBe(120);
    expect(next.base.layers[0]!.slots[1]!.hp).toBe(200);
    expect(next.roster.map((d) => d.xp)).toEqual([hordeXp(1), 0, 0]);
    expect(hordeXp(1)).toBe(15);
    expect(hordeXp(4)).toBe(30);
  });

  it('XP goes in full to everyone who took part, injured or not; bench-only gets none', () => {
    const g = newGame();
    const h = withInjuryAndRecruit(fought(g, 'won'), 'john');
    expect(xpGains(h)).toEqual([
      { id: 'bob', name: 'Bob', xp: 15, injured: true },
      { id: 'john', name: 'John', xp: 15, injured: false },
    ]);
    const next = finishHorde(g, h, NOW);
    expect(next.roster.map((d) => [d.id, d.xp])).toEqual([
      ['bob', 15],
      ['jack', 0],
      ['john', 15],
    ]);
  });

  it('levelGains: the level after a win, XP into it, and the stat points it brought', () => {
    const g = newGame();
    g.roster[0]!.xp = 20; // Bob: 5 short of level 2
    g.roster[2]!.xp = 70; // John: level 2, 5 short of 3
    const h = withInjuryAndRecruit(fought(g, 'won'), 'john');
    expect(levelGains(g, h)).toEqual([
      {
        id: 'bob',
        name: 'Bob',
        xp: 15,
        injured: true,
        level: 2,
        into: 10,
        next: 50,
        levels: 1,
        points: 3,
      },
      {
        id: 'john',
        name: 'John',
        xp: 15,
        injured: false,
        level: 3,
        into: 10,
        next: 75,
        levels: 1,
        points: 3,
      },
    ]);
    g.roster[0]!.xp = 0;
    expect(levelGains(g, h)[0]).toMatchObject({
      level: 1,
      into: 15,
      next: 25,
      levels: 0,
      points: 0,
    });
    expect(levelGains(g, fought(g, 'lost'))).toEqual([]);
  });

  it('spendPoint puts a point in a stat, refuses with none left, leaves the game untouched', () => {
    const g = newGame();
    g.roster[1]!.xp = 25;
    let cur = g;
    for (let i = 0; i < 3; i++) {
      const r = spendPoint(cur, 'jack', 'might');
      if (!r.ok) throw new Error(r.reason);
      cur = r.game;
    }
    expect(cur.roster[1]!.stats).toEqual({ ...NO_STATS, might: 3 });
    expect(spendPoint(cur, 'jack', 'grit')).toEqual({ ok: false, reason: 'No stat points left' });
    expect(spendPoint(cur, 'bob', 'aim')).toEqual({ ok: false, reason: 'No stat points left' });
    expect(g.roster[1]!.stats).toEqual(NO_STATS);
    expect(() => spendPoint(g, 'nobody', 'aim')).toThrow(RangeError);
  });

  it('equip swaps a loadout, injured or not, and leaves the game untouched', () => {
    const g = newGame();
    g.roster[0]!.injuredUntil = NOW + 1000;
    const r = equip(g, 'bob', { primary: 'pistol', secondary: 'knife', item: 'shield' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster[0]!.loadout).toEqual({
      primary: 'pistol',
      secondary: 'knife',
      item: 'shield',
    });
    expect(r.game.roster.slice(1)).toEqual(g.roster.slice(1));
    expect(g.roster[0]!.loadout).toEqual(loadoutFrom('pistol'));
    // Back to a Gunner: the shield has to go with the knife.
    const back = equip(r.game, 'bob', { primary: 'pistol', secondary: null, item: null });
    expect(back.ok && back.game.roster[0]!.loadout).toEqual(loadoutFrom('pistol'));
  });

  it('equip refuses what the game does not allow; unknown ids throw', () => {
    const g = newGame();
    expect(equip(g, 'jack', { primary: 'pistol', secondary: null, item: 'shield' })).toEqual({
      ok: false,
      reason: 'A shield needs a blade',
    });
    expect(equip(g, 'jack', { primary: 'knife', secondary: null, item: null })).toEqual({
      ok: false,
      reason: 'The primary must be a gun',
    });
    expect(() => equip(g, 'nobody', loadoutFrom('pistol'))).toThrow(RangeError);
    for (const bad of [
      { primary: 'railgun', secondary: null, item: null },
      { primary: 'pistol', secondary: 'toString', item: null },
      { primary: 'pistol', secondary: 'knife', item: 'cape' },
      { primary: null, secondary: null, item: null },
      { primary: 'pistol', secondary: '__proto__', item: null },
      { primary: 'pistol', secondary: 'knife', item: 'constructor' },
      { primary: 'pist\u043el', secondary: null, item: null }, // Cyrillic о
      { primary: 'pis\u200btol', secondary: null, item: null }, // zero-width space
      { primary: 'Pistol', secondary: null, item: null },
      { primary: 1, secondary: null, item: null },
      { primary: 'a'.repeat(100_000), secondary: null, item: null },
    ]) {
      expect(
        () => equip(g, 'bob', bad as unknown as Loadout),
        JSON.stringify(bad).slice(0, 80),
      ).toThrow(RangeError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it('a horde fights with the roster stats', () => {
    const g = newGame();
    g.roster[0]!.xp = 25;
    g.roster[0]!.stats = { ...NO_STATS, grit: 3 };
    const h = startHorde(g, 7, 'bob', 0, NOW);
    expect(h.defenders[0]).toMatchObject({ maxHp: 115, stats: { ...NO_STATS, grit: 3 } });
    h.defenders[0]!.stats = { ...NO_STATS, aim: 99 };
    expect(g.roster[0]!.stats.aim).toBe(0);
  });

  it('a loss keeps the horde number, pays by the wave reached and gives no XP', () => {
    const g = newGame();
    const h = fought(g, 'lost');
    h.wave = 5;
    const next = finishHorde(g, h, NOW);
    expect(next.hordeNumber).toBe(1);
    expect(next.stock).toEqual({ scrap: 65, wood: 67, metal: 0, concrete: 0 });
    expect(next.base.layers[0]!.slots[0]!.hp).toBe(120);
    expect(xpGains(h)).toEqual([]);
    expect(next.roster.every((d) => d.xp === 0)).toBe(true);
  });

  it('the injured rest 2 h: unavailable until the mark, fit at it', () => {
    const g = newGame();
    const next = finishHorde(g, withInjuryAndRecruit(fought(g, 'lost'), 'john'), NOW);
    const bob = next.roster[0]!;
    expect(bob.injuredUntil).toBe(NOW + RECOVERY_MS);
    expect(next.roster[2]!.injuredUntil).toBeNull();
    expect(available(bob, NOW + RECOVERY_MS - 1)).toBe(false);
    expect(available(bob, NOW + RECOVERY_MS)).toBe(true);
    // Can't start, and isn't on the bench to be recruited or sent in.
    expect(() => startHorde(next, 1, 'bob', 0, NOW + RECOVERY_MS - 1)).toThrow(RangeError);
    const h = startHorde(next, 1, 'jack', 0, NOW + RECOVERY_MS - 1);
    expect(h.bench.map((d) => d.id)).toEqual(['john']);
    expect(startHorde(next, 1, 'bob', 0, NOW + RECOVERY_MS).defenders[0]!.id).toBe('bob');
  });

  it('rest is timed from the injury, not from the end of the horde', () => {
    const g = newGame();
    const h = fought(g, 'lost');
    h.time = 100;
    withInjuryAndRecruit(h, 'john').injured[0]!.at = 30;
    expect(finishHorde(g, h, NOW).roster[0]!.injuredUntil).toBe(NOW - 70_000 + RECOVERY_MS);
    // The result screen's time is the one finishHorde stores.
    expect(injuredUntil(h, h.injured[0]!, NOW)).toBe(NOW - 70_000 + RECOVERY_MS);
    expect(() => injuredUntil(h, h.injured[0]!, NaN)).toThrow(RangeError);
  });

  it('recover clears healed injuries only, and returns the same game when none has', () => {
    const g = newGame();
    const next = finishHorde(g, withInjuryAndRecruit(fought(g, 'lost'), 'john'), NOW);
    expect(recover(next, NOW + RECOVERY_MS - 1)).toBe(next);
    const healed = recover(next, NOW + RECOVERY_MS);
    expect(healed.roster[0]!.injuredUntil).toBeNull();
    expect(next.roster[0]!.injuredUntil).toBe(NOW + RECOVERY_MS);
  });

  it('refuses a bad time, a horde still fighting or from another horde', () => {
    const g = newGame();
    expect(() => finishHorde(g, startHorde(g, 1, g.roster[0]!.id, 0, NOW), NOW)).toThrow(
      RangeError,
    );
    const other = fought({ ...g, hordeNumber: 3 }, 'won');
    expect(() => finishHorde(g, other, NOW)).toThrow(RangeError);
    for (const bad of [NaN, Infinity]) {
      expect(() => startHorde(g, 1, 'bob', 0, bad)).toThrow(RangeError);
      expect(() => finishHorde(g, fought(g, 'won'), bad)).toThrow(RangeError);
      expect(() => recover(g, bad)).toThrow(RangeError);
    }
  });

  it('leaves its inputs untouched', () => {
    const g = newGame();
    const h = fought(g, 'won');
    const gBefore = structuredClone(g);
    const hBefore = structuredClone(h);
    startHorde(g, 1, g.roster[0]!.id, 0, NOW);
    const next = finishHorde(g, h, NOW);
    expect(g).toEqual(gBefore);
    expect(h).toEqual(hBefore);
    next.roster[0]!.name = 'changed';
    next.tiers.push('metal');
    expect(g).toEqual(gBefore);
  });
});
