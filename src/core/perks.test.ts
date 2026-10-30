// Design §5, as built ID-020: commander perks unlocked at the Lab, equipped in perk
// slots between hordes, fixed for the fight, each changing the whole battlefield.
import { describe, expect, it } from 'vitest';
import { buildPost, buildTurret, newBase, type Base } from './base.ts';
import { chooseCard, rerollLock, rerollOffer, rollOffer } from './cards.ts';
import {
  ENEMIES,
  PERK,
  PERK_IDS,
  PERKS,
  RESEARCH,
  STEP,
  TURRET,
  type PerkId,
  type ResearchId,
  type Stock,
} from './data.ts';
import { newGame, startHorde, type GameState } from './game.ts';
import { baseAfter, drawFactor, newHorde, removeDead, tick, type HordeState } from './horde.ts';
import { equipPerk, perkLock, perkSlots, unequipPerk, unlockedPerks } from './perks.ts';
import { research, researchLock, upgradeLab } from './research.ts';
import { createRng } from './rng.ts';
import { enemy, landed, setup } from './testing.ts';

const RICH: Stock = { scrap: 9999, wood: 9999, metal: 0, concrete: 0 };
const tough = { hp: 1000, maxHp: 1000 };
const still = { stunnedUntil: 1e9 };

/** A rich game with the Lab at level 2 and `ids` researched, in order. */
function researchedGame(...ids: ResearchId[]): GameState {
  let g: GameState = { ...newGame(), stock: { ...RICH } };
  for (const step of [
    upgradeLab,
    upgradeLab,
    ...ids.map((id) => (x: GameState) => research(x, id)),
  ]) {
    const r = step(g);
    if (!r.ok) throw new Error(r.reason);
    g = r.game;
  }
  return g;
}

/** Horde 1 with nothing left to spawn and the perks `perks`. */
function fight(perks: PerkId[], base: Base = newBase()): HordeState {
  const s = newHorde(1, { ...setup(), base, perks });
  s.toSpawn = 0;
  return s;
}

describe('perk data and slots', () => {
  it('has the eight perks of §5, every one but Steady Fire behind a Lab node', () => {
    expect(PERK_IDS).toEqual([
      'steady-fire',
      'scavengers-eye',
      'fortify',
      'butchers-hunger',
      'rally-call',
      'second-look',
      'overclock',
      'power-saver',
    ]);
    for (const id of PERK_IDS) expect(PERKS[id].name.length).toBeGreaterThan(0);
    expect(Object.hasOwn(RESEARCH, 'steady-fire')).toBe(false);
    expect(RESEARCH['scavengers-eye']).toMatchObject({
      lab: 1,
      needs: null,
      cost: { scrap: 30, wood: 30 },
    });
    expect(RESEARCH.fortify).toMatchObject({ lab: 1, cost: { scrap: 40, wood: 40 } });
    expect(RESEARCH['rally-call']).toMatchObject({ lab: 1, cost: { scrap: 30, wood: 20 } });
    expect(RESEARCH['second-look']).toMatchObject({ lab: 2, needs: null });
    expect(RESEARCH.overclock).toMatchObject({ lab: 2, needs: 'auto-turret' });
    expect(RESEARCH['power-saver']).toMatchObject({ lab: 2, needs: 'auto-turret' });
  });

  it('a new game has 1 slot with Steady Fire unlocked and equipped', () => {
    const g = newGame();
    expect(g.perks).toEqual(['steady-fire']);
    expect(unlockedPerks(g)).toEqual(['steady-fire']);
    expect(perkSlots(g)).toBe(1);
  });

  it('slots 2–4 are researched in order, each adding one', () => {
    const g = researchedGame();
    expect(researchLock(g, 'perk-slot-3')).toBe('Needs Perk slot 2');
    expect(researchLock(g, 'perk-slot-4')).toBe('Needs Perk slot 3');
    expect(researchLock({ lab: 1, research: [] }, 'perk-slot-3')).toBe('Needs Lab level 2');
    expect(perkSlots(researchedGame('perk-slot-2'))).toBe(2);
    expect(perkSlots(researchedGame('perk-slot-2', 'perk-slot-3', 'perk-slot-4'))).toBe(4);
  });

  it('researching a perk unlocks it; it costs its materials', () => {
    const g = researchedGame('fortify');
    expect(unlockedPerks(g)).toEqual(['steady-fire', 'fortify']);
    const before = researchedGame();
    expect(before.stock.scrap - g.stock.scrap).toBe(40);
  });
});

describe('equipping perks', () => {
  it('equips an unlocked perk into a free slot and takes it out again', () => {
    let g = researchedGame('fortify', 'perk-slot-2');
    const r = equipPerk(g, 'fortify');
    if (!r.ok) throw new Error(r.reason);
    g = r.game;
    expect(g.perks).toEqual(['steady-fire', 'fortify']);
    const off = unequipPerk(g, 'steady-fire');
    if (!off.ok) throw new Error(off.reason);
    expect(off.game.perks).toEqual(['fortify']);
    expect(g.perks).toEqual(['steady-fire', 'fortify']); // pure
  });

  it('refuses a locked perk, a full set of slots, a perk twice, and unequipping one not on', () => {
    const g = researchedGame('fortify');
    expect(equipPerk(g, 'overclock')).toEqual({ ok: false, reason: 'Not researched' });
    expect(equipPerk(g, 'fortify')).toEqual({ ok: false, reason: 'All perk slots are full' });
    expect(equipPerk(g, 'steady-fire')).toEqual({ ok: false, reason: 'Already equipped' });
    expect(unequipPerk(g, 'fortify')).toEqual({ ok: false, reason: 'Not equipped' });
    expect(perkLock({ ...g, perks: [] }, 'fortify')).toBeNull();
  });

  it('throws on a perk that does not exist', () => {
    const g = newGame();
    expect(() => equipPerk(g, '__proto__' as PerkId)).toThrow(RangeError);
    expect(() => unequipPerk(g, 'toString' as PerkId)).toThrow(RangeError);
  });

  it('a horde gets a copy of the equipped perks, fixed for the fight', () => {
    const g = newGame();
    const s = startHorde(g, 1, 'bob', 0, 0);
    expect(s.perks).toEqual(['steady-fire']);
    g.perks.length = 0;
    expect(s.perks).toEqual(['steady-fire']);
  });
});

describe('perks in the horde', () => {
  it('Steady Fire: guns fire 15% faster; stacks with the cards', () => {
    const interval = (perks: PerkId[], rapid = 1): number => {
      const s = fight(perks);
      s.mods.fireRate = rapid;
      enemy(s, { ...tough, ...still, x: 600, y: 360 });
      return tick(s, STEP).defenders[0]!.nextShotAt; // it fires at time 0
    };
    const base = interval([]);
    expect(interval(['steady-fire'])).toBeCloseTo(base / PERK.steadyFire, 6);
    expect(interval(['steady-fire'], 1.2)).toBeCloseTo(base / (PERK.steadyFire * 1.2), 6);
  });

  it('Steady Fire leaves a blade alone', () => {
    const swing = (perks: PerkId[]): number => {
      const r = buildPost(newBase(), RICH, { kind: 'ground', column: 0, row: 4 });
      if (!r.ok) throw new Error(r.reason);
      const s = newHorde(1, {
        ...setup(),
        roster: [
          { id: 'a', name: 'A', loadout: { primary: 'pistol', secondary: 'knife', item: null } },
        ],
        base: r.base,
        startPostId: r.base.posts.findIndex((p) => p.kind === 'ground'),
        perks,
      });
      s.toSpawn = 0;
      const post = s.posts[s.defenders[0]!.postId]!;
      enemy(s, { ...tough, ...still, x: post.x + 20, y: post.y });
      return tick(s, STEP).defenders[0]!.nextShotAt;
    };
    expect(swing(['steady-fire'])).toBe(swing([]));
  });

  it("Scavenger's Eye: kills pay 25% more cash", () => {
    const paid = (perks: PerkId[]): number => {
      const s = fight(perks);
      enemy(s, { hp: 0 });
      enemy(s, { kind: 'brute', hp: 0 });
      removeDead(s);
      return s.cash;
    };
    const plain = ENEMIES.shambler.cash + ENEMIES.brute.cash;
    expect(paid([])).toBe(plain);
    expect(paid(['scavengers-eye'])).toBeCloseTo(plain * PERK.cash, 9);
  });

  it('Fortify: every built segment has 30% more HP for the fight; the base keeps its share', () => {
    const plain = fight([]);
    const s = fight(['fortify']);
    plain.layers.forEach((l, i) =>
      l.segments.forEach((seg, row) => {
        const f = s.layers[i]!.segments[row]!;
        expect(f.maxHp).toBeCloseTo(seg.maxHp * PERK.fortify, 9);
        expect(f.hp).toBeCloseTo(seg.hp * PERK.fortify, 9);
      }),
    );
    const base = newBase();
    const seg = s.layers[0]!.segments.find((x) => x.maxHp > 0)!;
    const slot = base.layers[0]!.slots[seg.index]!;
    expect(baseAfter(base, s).layers[0]!.slots[seg.index]!.hp).toBe(slot.hp); // untouched: full
    seg.hp = seg.maxHp / 2;
    expect(baseAfter(base, s).layers[0]!.slots[seg.index]!.hp).toBe(Math.ceil(slot.maxHp / 2));
    seg.hp = 0;
    expect(baseAfter(base, s).layers[0]!.slots[seg.index]!.hp).toBe(0);
  });

  it('Fortify with Reinforce: the in-fight max-HP rises never stick to the base', () => {
    const base = newBase();
    const s = fight(['fortify']);
    s.offer = [{ kind: 'upgrade', id: 'reinforce' }];
    const t = chooseCard(s, 0);
    const i = t.layers[0]!.segments.findIndex((x) => x.maxHp > 0);
    const seg = t.layers[0]!.segments[i]!;
    expect(seg.maxHp).toBeGreaterThan(s.layers[0]!.segments[i]!.maxHp);
    seg.hp = seg.maxHp;
    const slot = base.layers[0]!.slots[i]!;
    expect(baseAfter(base, t).layers[0]!.slots[i]!.hp).toBe(slot.maxHp);
  });

  it("Butcher's Hunger: a blade kill heals the nearest damaged wall 3 HP, never past max", () => {
    const kill = (perks: PerkId[], hurt: number, secondary: 'knife' | null = 'knife') => {
      const r = buildPost(newBase(), RICH, { kind: 'ground', column: 0, row: 4 });
      if (!r.ok) throw new Error(r.reason);
      const s = newHorde(1, {
        ...setup(),
        roster: [{ id: 'a', name: 'A', loadout: { primary: 'pistol', secondary, item: null } }],
        base: r.base,
        startPostId: r.base.posts.findIndex((p) => p.kind === 'ground'),
        perks,
      });
      s.toSpawn = 0;
      const post = s.posts[s.defenders[0]!.postId]!;
      const near = s.layers[0]!.segments[post.row]!;
      const far = s.layers[0]!.segments[0]!;
      near.hp = near.maxHp - hurt;
      far.hp = far.maxHp - 50;
      enemy(s, { ...still, hp: 1, maxHp: 1, x: post.x + 20, y: post.y });
      const t = landed(tick(s, STEP));
      expect(t.enemies).toEqual([]);
      return {
        near: t.layers[0]!.segments[post.row]!.hp - near.hp,
        far: t.layers[0]!.segments[0]!.hp - far.hp,
      };
    };
    expect(kill(['butchers-hunger'], 10)).toEqual({ near: PERK.butcherHeal, far: 0 });
    expect(kill(['butchers-hunger'], 1)).toEqual({ near: 1, far: 0 }); // capped
    expect(kill([], 10)).toEqual({ near: 0, far: 0 });
    expect(kill(['butchers-hunger'], 10, null)).toEqual({ near: 0, far: 0 }); // a gun kill
  });

  it("Butcher's Hunger: each cleave kill heals 3 HP more", () => {
    const r = buildPost(newBase(), RICH, { kind: 'ground', column: 0, row: 4 });
    if (!r.ok) throw new Error(r.reason);
    const s = newHorde(1, {
      ...setup(),
      roster: [
        { id: 'a', name: 'A', loadout: { primary: 'pistol', secondary: 'knife', item: null } },
      ],
      base: r.base,
      startPostId: r.base.posts.findIndex((p) => p.kind === 'ground'),
      perks: ['butchers-hunger'],
    });
    s.toSpawn = 0;
    s.taken = ['cleave'];
    const post = s.posts[s.defenders[0]!.postId]!;
    const seg = s.layers[0]!.segments[post.row]!;
    seg.hp = seg.maxHp - 20;
    enemy(s, { ...still, hp: 1, maxHp: 1, x: post.x + 20, y: post.y });
    enemy(s, { ...still, hp: 0.1, maxHp: 1, x: post.x + 20, y: post.y + 20 });
    const t = tick(s, STEP);
    expect(t.enemies).toEqual([]);
    expect(t.layers[0]!.segments[post.row]!.hp - seg.hp).toBe(2 * PERK.butcherHeal);
  });

  it('Rally Call: recruit cards come twice as often, still one per offer at most', () => {
    const firstIsRecruit = (perks: PerkId[]): number => {
      const s = fight(perks);
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        const offer = rollOffer(createRng(seed), s);
        expect(offer.filter((c) => c.kind === 'recruit').length).toBeLessThanOrEqual(1);
        if (offer[0]!.kind === 'recruit') n += 1;
      }
      return n / 400;
    };
    const plain = firstIsRecruit([]);
    const rally = firstIsRecruit(['rally-call']);
    expect(plain).toBeGreaterThan(0.22);
    expect(plain).toBeLessThan(0.38);
    expect(rally).toBeGreaterThan(0.52);
    expect(rally).toBeLessThan(0.68);
  });

  it('Overclock and Power Saver: turret damage and draw; together they multiply', () => {
    const r = buildTurret(newBase(), RICH, true, 'tower', 0, 5);
    if (!r.ok) throw new Error(r.reason);
    const shot = (perks: PerkId[]) => {
      const s = fight(perks, r.base);
      s.defenders = [];
      s.bench = [];
      for (const p of s.posts) p.defenderId = null;
      enemy(s, { ...tough, ...still, x: 600, y: 440 });
      const t = tick(s, STEP);
      return { damage: t.bullets[0]!.damage, drawn: s.energy - t.energy };
    };
    const plain = shot([]);
    expect(plain.damage).toBe(TURRET.damage);
    expect(shot(['overclock']).damage).toBeCloseTo(TURRET.damage * PERK.overclock.damage, 9);
    expect(shot(['overclock']).drawn).toBeCloseTo(plain.drawn * PERK.overclock.draw, 9);
    expect(shot(['power-saver']).drawn).toBeCloseTo(plain.drawn * PERK.powerSaver, 9);
    expect(shot(['power-saver']).damage).toBe(TURRET.damage);
    expect(shot(['overclock', 'power-saver']).drawn).toBeCloseTo(plain.drawn * 1.1 * 0.75, 9);
    expect(drawFactor({ perks: ['overclock', 'power-saver'] })).toBeCloseTo(0.825, 9);
  });
});

describe('Second Look', () => {
  /** A horde at wave `wave` with an offer open. */
  function offered(perks: PerkId[], seed = 3): HordeState {
    const s = fight(perks);
    s.rng = { s: seed };
    s.offer = rollOffer(createRng(seed), s);
    return s;
  }

  it('rerolls the open offer once per wave, seeded', () => {
    const s = offered(['second-look']);
    expect(rerollLock(s)).toBeNull();
    const a = rerollOffer(s);
    expect(rerollOffer(s)).toEqual(a); // same seed, same cards
    expect(a.rerolledWave).toBe(1);
    expect(a.offer).toHaveLength(3);
    expect(s.rerolledWave).toBe(0); // pure
    expect(rerollLock(a)).toBe('Already rerolled this wave');
    expect(() => rerollOffer(a)).toThrow(RangeError);
    expect(rerollLock({ ...a, wave: 2 })).toBeNull();
  });

  it('a different seed can deal different cards', () => {
    const offers = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        JSON.stringify(rerollOffer(offered(['second-look'], seed)).offer),
      ),
    );
    expect(offers.size).toBeGreaterThan(1);
  });

  it('needs the perk and an open offer', () => {
    expect(rerollLock(offered([]))).toBe('Needs Second Look');
    expect(rerollLock({ ...offered(['second-look']), offer: null })).toBe('No offer to reroll');
  });
});
