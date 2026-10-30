// Design §4, as built ID-018: kills drop horde cash, spent mid-fight on timed buffs
// (defenders and turrets), a wall patch and a turret fix; it is gone when the horde ends.
import { describe, expect, it } from 'vitest';
import { buildTurret, newBase } from './base.ts';
import {
  ENEMIES,
  MAX_CONDITION,
  SHOP,
  SHOP_ITEMS,
  STEP,
  TURRET,
  type Stock,
  stockOf,
} from './data.ts';
import { finishHorde, newGame } from './game.ts';
import { boost, newHorde, tick, type HordeState } from './horde.ts';
import { buffLeft, buy, shopLock } from './shop.ts';
import { enemy, landed, setup } from './testing.ts';

const RICH: Stock = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });

/** A horde with no spawns left, `cash` in hand, and `a` on post 0. */
function fight(cash = 100, turrets = 0): HordeState {
  let base = newBase();
  for (let row = 0; row < turrets; row++) {
    const r = buildTurret(base, RICH, true, 'wall-walk', 0, row);
    if (!r.ok) throw new Error(r.reason);
    base = r.base;
  }
  const s = newHorde(1, { ...setup(), base });
  s.toSpawn = 0;
  s.cash = cash;
  return s;
}

function bought(s: HordeState, item: Parameters<typeof buy>[1]): HordeState {
  const r = buy(s, item);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe('horde cash', () => {
  it('starts at 0 and each kill pays its enemy cash, whoever made it', () => {
    const s = newHorde(1, setup());
    expect(s.cash).toBe(0);
    s.toSpawn = 0;
    enemy(s, { hp: 0 });
    enemy(s, { hp: -3, x: 900 });
    expect(tick(s, STEP).cash).toBe(2 * ENEMIES.shambler.cash);
  });

  it('never reaches the base or the game when the horde ends', () => {
    const game = newGame();
    const s = newHorde(1, { ...setup(), roster: game.roster, startDefenderId: game.roster[0]!.id });
    s.cash = 500;
    s.outcome = 'won';
    const after = finishHorde(game, s, 0);
    expect(JSON.stringify(after)).not.toContain('cash');
    expect(newHorde(2, setup()).cash).toBe(0);
  });
});

describe('buffs', () => {
  it('Adrenaline costs its price and multiplies damage for defenders and turrets for 30 s', () => {
    const s = bought(fight(), 'adrenaline');
    expect(s.cash).toBe(100 - SHOP.adrenaline.cost);
    expect(boost(s, 'damage')).toBe(SHOP.adrenaline.damage);
    expect(boost(s, 'fireRate')).toBe(1);
    expect(buffLeft(s, 'adrenaline')).toBe(SHOP.adrenaline.seconds);

    // A turret's shot: 5 base damage × 1.25.
    const t = fight(100, 1);
    t.defenders = [];
    for (const p of t.posts) p.defenderId = null;
    const e = enemy(t, { x: 700, y: 40, hp: 100, maxHp: 100 });
    const hit = landed(tick(bought(t, 'adrenaline'), STEP));
    expect(100 - hit.enemies.find((x) => x.id === e.id)!.hp).toBeCloseTo(
      TURRET.damage * SHOP.adrenaline.damage,
    );
  });

  it('Overdrive shortens defender and turret fire intervals', () => {
    const t = fight(100, 1);
    t.defenders = [];
    for (const p of t.posts) p.defenderId = null;
    enemy(t, { x: 700, y: 40, hp: 100, maxHp: 100 });
    const after = tick(bought(t, 'overdrive'), STEP);
    expect(after.turrets[0]!.nextShotAt).toBeCloseTo(TURRET.fireInterval / SHOP.overdrive.fireRate);

    const plain = fight();
    enemy(plain, { hp: 100, maxHp: 100 });
    const fast = bought(plain, 'overdrive');
    const gap = (s: HordeState) => tick(s, STEP).defenders[0]!.nextShotAt;
    expect(gap(plain) / gap(fast)).toBeCloseTo(SHOP.overdrive.fireRate);
  });

  it('refuses a running buff, and ends after 30 s of fight time only', () => {
    let s = bought(fight(), 'adrenaline');
    expect(buy(s, 'adrenaline')).toEqual({ ok: false, reason: 'Already active' });
    expect(buy(s, 'overdrive').ok).toBe(true); // the other buff is separate

    // A pending card pick stops the clock.
    s.offer = [];
    const held = tick(s, 10);
    expect(buffLeft(held, 'adrenaline')).toBe(SHOP.adrenaline.seconds);
    s.offer = null;

    s = tick(s, SHOP.adrenaline.seconds - 1);
    expect(buffLeft(s, 'adrenaline')).toBeGreaterThan(0);
    s = tick(s, 1 + STEP);
    expect(buffLeft(s, 'adrenaline')).toBe(0);
    expect(boost(s, 'damage')).toBe(1);
    expect(shopLock(s, 'adrenaline')).toBeNull(); // can be bought again
  });
});

describe('repairs', () => {
  it('Patch wall heals the lowest-share standing segment, capped, never a broken one', () => {
    const s = fight();
    const segs = s.layers[0]!.segments;
    segs[0]!.hp = 0; // broken: never patched
    segs[1]!.hp = segs[1]!.maxHp - 40;
    segs[3]!.hp = segs[3]!.maxHp / 2;
    const p = bought(s, 'patch');
    expect(p.cash).toBe(100 - SHOP.patch.cost);
    expect(p.layers[0]!.segments[3]!.hp).toBe(segs[3]!.maxHp / 2 + SHOP.patch.hp);
    expect(p.layers[0]!.segments[0]!.hp).toBe(0);
    // Segment 3 is full now; segment 1 is next, capped at its max.
    const again = bought(p, 'patch');
    expect(again.layers[0]!.segments[1]!.hp).toBe(segs[1]!.maxHp);
    expect(again.layers[0]!.segments[0]!.hp).toBe(0);
    expect(buy(again, 'patch')).toEqual({ ok: false, reason: 'No wall to patch' });
  });

  it('breaks Patch wall ties by the outer layer, then the lower row', () => {
    const s = fight();
    const outer = structuredClone(s.layers[0]!);
    outer.column = 1;
    outer.x += 100;
    s.layers.push(outer);
    for (const l of s.layers) for (const seg of l.segments) seg.hp = seg.maxHp / 2;
    const p = bought(s, 'patch');
    expect(p.layers[1]!.segments[0]!.hp).toBe(outer.segments[0]!.maxHp / 2 + SHOP.patch.hp);
    expect(p.layers[0]!.segments[0]!.hp).toBe(s.layers[0]!.segments[0]!.maxHp / 2);
  });

  it('refuses Patch wall when every standing segment is full', () => {
    const s = fight();
    s.layers[0]!.segments[2]!.hp = 0;
    expect(buy(s, 'patch')).toEqual({ ok: false, reason: 'No wall to patch' });
  });

  it('Fix turret unjams the most worn turret first, capped at full', () => {
    const s = fight(100, 3);
    s.turrets[0]!.condition = 40;
    s.turrets[1]!.condition = 0; // jammed
    s.turrets[2]!.condition = 90;
    const f = bought(s, 'fix');
    expect(f.turrets.map((t) => t.condition)).toEqual([40, SHOP.fix.condition, 90]);
    const g = bought(bought(f, 'fix'), 'fix');
    expect(g.turrets.map((t) => t.condition)).toEqual([70, 60, 90]);
    const h = bought(bought(g, 'fix'), 'fix');
    expect(h.turrets.map((t) => t.condition)).toEqual([MAX_CONDITION, 90, 90]);
  });

  it('a fixed jammed turret fires again', () => {
    const s = fight(100, 1);
    s.defenders = [];
    for (const p of s.posts) p.defenderId = null;
    s.turrets[0]!.condition = 0;
    const e = enemy(s, { x: 700, y: 40, hp: 100, maxHp: 100 });
    expect(tick(s, STEP).enemies.find((x) => x.id === e.id)!.hp).toBe(100);
    const fixed = landed(tick(bought(s, 'fix'), STEP));
    expect(fixed.enemies.find((x) => x.id === e.id)!.hp).toBeLessThan(100);
  });

  it('refuses Fix turret with no turret, or all at full', () => {
    expect(buy(fight(), 'fix')).toEqual({ ok: false, reason: 'No turret to fix' });
    expect(buy(fight(100, 2), 'fix')).toEqual({ ok: false, reason: 'No turret to fix' });
  });
});

describe('refusals', () => {
  it('refuses short cash, a pick, a replacement or a finished fight, changing nothing', () => {
    const s = fight(SHOP.adrenaline.cost - 1);
    const before = structuredClone(s);
    expect(buy(s, 'adrenaline')).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(s).toEqual(before);
    const rich = fight();
    expect(buy({ ...rich, offer: [] }, 'overdrive')).toEqual({ ok: false, reason: 'Pick first' });
    expect(buy({ ...rich, replace: { injuryIndex: 0 } as never }, 'overdrive')).toEqual({
      ok: false,
      reason: 'Pick first',
    });
    expect(buy({ ...rich, outcome: 'won' }, 'overdrive')).toEqual({
      ok: false,
      reason: 'The horde is over',
    });
  });

  it('throws on an unknown item', () => {
    expect(() => buy(fight(), 'nuke' as never)).toThrow(RangeError);
    expect(() => buy(fight(), 'toString' as never)).toThrow(RangeError);
    expect(SHOP_ITEMS).toEqual(['adrenaline', 'overdrive', 'patch', 'fix']);
  });
});
