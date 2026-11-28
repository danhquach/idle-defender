// ID-263: what each Research Center node does in a fight, each against its unresearched twin.
import { describe, expect, it } from 'vitest';
import { chooseCard } from './cards.ts';
import { CARD, SEGMENT_HEIGHT, STEP, TECH_FX, WEAPONS, type TechId } from './data.ts';
import {
  burnDpsOf,
  hitDamage,
  newHorde,
  scavengeOf,
  shamblerHp,
  slickRadius,
  slicksUnder,
  tick,
  wallFront,
  wireMax,
  type Bullet,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { enemy, setup } from './testing.ts';

const tough = { hp: 1000, maxHp: 1000 };
const ROW4 = 4.5 * SEGMENT_HEIGHT;
const FRONT = 520;

/** Horde 1, nothing to spawn, nobody fires; `tech` researched. */
function quiet(tech: readonly TechId[] = []): HordeState {
  const s = newHorde(1, { ...setup(), ...(tech.length > 0 ? { tech } : {}) });
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
function picked(s: HordeState, id: UpgradeId, times = 1): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = { ...t, offer: [{ kind: 'upgrade', id }] };
    t = chooseCard(t, 0);
    t.offer = null;
  }
  return t;
}
const at = (id: UpgradeId, level: number, tech: readonly TechId[] = []): HordeState =>
  picked(quiet(tech), id, level);
function shoot(s: HordeState, b: Partial<Bullet> & Pick<Bullet, 'x' | 'y'>): void {
  s.bullets.push({
    dx: 1,
    dy: 0,
    speed: 1800,
    damage: 10,
    owner: 'a',
    fromX: b.x,
    fromY: b.y,
    aim: 100,
    left: 1000,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
    ...b,
  });
}
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;
const segs = (s: HordeState) => s.layers.flatMap((l) => l.segments);
const WALL1: TechId[] = ['reinforced-wall'];
const WALL2: TechId[] = ['reinforced-wall', 'steel-plating'];
const WIRE3: TechId[] = ['razor-wire', 'thick-coils', 'electric-wire'];

describe('Reinforced Wall and Steel Plating', () => {
  it('raise every segment’s HP and max HP by 15% and 30% (the highest counts, not the sum)', () => {
    const base = segs(quiet());
    for (const [tech, share] of [
      [WALL1, 0.15],
      [WALL2, 0.3],
    ] as const) {
      const got = segs(quiet(tech));
      expect(got.length).toBe(base.length);
      got.forEach((seg, i) => {
        expect(seg.maxHp).toBeCloseTo(base[i]!.maxHp * (1 + share), 9);
        expect(seg.hp).toBeCloseTo(base[i]!.hp * (1 + share), 9);
      });
    }
    expect(base.some((seg) => seg.maxHp > 0)).toBe(true);
  });

  it('applies in every fight, and stacks with Reinforce (a step of the max HP it started with)', () => {
    for (let fight = 0; fight < 3; fight++) {
      expect(segs(quiet(WALL2))[0]!.maxHp).toBeCloseTo(segs(quiet())[0]!.maxHp * 1.3, 9);
    }
    const plain = picked(quiet(), 'reinforce');
    const researched = picked(quiet(WALL2), 'reinforce');
    segs(researched).forEach((seg, i) => {
      expect(seg.maxHp).toBeCloseTo(segs(plain)[i]!.maxHp * 1.3, 9);
    });
  });

  it('keeps a wall’s damage share: HP scales with max HP, nothing is healed', () => {
    const plain = quiet();
    const res = quiet(WALL2);
    segs(res).forEach((seg, i) => {
      expect(seg.hp / seg.maxHp).toBeCloseTo(segs(plain)[i]!.hp / segs(plain)[i]!.maxHp, 9);
    });
  });
});

describe('Spiked Wall', () => {
  const crawlerAtWall = (s: HordeState) =>
    enemy(s, { ...tough, kind: 'crawler', x: wallFront(s) + 1, y: ROW4 });

  it('a Crawler climbing the wall loses 20% of a Shambler’s HP a second', () => {
    const s = quiet(['spiked-wall']);
    const e = crawlerAtWall(s);
    // The first step puts it on the wall; each step after costs it.
    const t = tick(tick(s, STEP), STEP);
    expect(find(t, e.id).climbUntil).toBeGreaterThan(0);
    expect(1000 - find(t, e.id).hp).toBeCloseTo(TECH_FX.spikes * shamblerHp(s) * STEP, 9);
    const twin = quiet();
    const e2 = crawlerAtWall(twin);
    expect(find(tick(tick(twin, STEP), STEP), e2.id).hp).toBe(1000);
  });

  it('a Crawler walking toward the wall, and any other kind at it, lose nothing', () => {
    const s = quiet(['spiked-wall']);
    const walking = enemy(s, { ...tough, kind: 'crawler', x: FRONT + 300, y: ROW4 });
    const brute = enemy(s, { ...tough, kind: 'brute', x: wallFront(s) + 1, y: ROW4 + 40 });
    const t = tick(tick(s, STEP), STEP);
    expect(find(t, walking.id).hp).toBe(1000);
    expect(find(t, brute.id).hp).toBe(1000);
  });
});

describe('Razor Wire', () => {
  it('Barbed Wire’s bleed is 25% stronger', () => {
    const lost = (tech: readonly TechId[]): number => {
      const s = at('barbed-wire', 1, tech);
      const e = enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
      return 1000 - find(tick(s, STEP), e.id).hp;
    };
    expect(lost(['razor-wire'])).toBeCloseTo(lost([]) * TECH_FX.bleed, 9);
    expect(lost([])).toBeGreaterThan(0);
  });
});

describe('Thick Coils', () => {
  it('rows have 50% more HP at the pick, at a wave break and at the start', () => {
    expect(wireMax(2, 5)).toBe(20);
    expect(wireMax(2, 5, 1.5)).toBe(30);
    expect(wireMax(1, 60, 1.5)).toBe(Math.round(10 * 2 * 1.5));
    expect(quiet(['razor-wire', 'thick-coils']).wire.every((r) => r.max === 15)).toBe(true);
    expect(quiet().wire.every((r) => r.max === 10)).toBe(true);
    const pick = at('barbed-wire', 2, ['razor-wire', 'thick-coils']);
    expect(pick.wire.every((r) => r.durability === 30 && r.max === 30)).toBe(true);
    const next = tick(pick, STEP);
    expect(next.wave).toBe(2);
    expect(next.wire.every((r) => r.max === 30)).toBe(true);
  });
});

describe('Electric Wire', () => {
  const inRow = (s: HordeState, y = ROW4) => enemy(s, { ...tough, x: FRONT + 300, y });
  const withWire = () => at('barbed-wire', 1, WIRE3);

  it('stuns an enemy for 1 s on its first entry into a working row', () => {
    const s = withWire();
    const e = inRow(s);
    const t = tick(s, STEP);
    expect(find(t, e.id).dazedUntil).toBeCloseTo(s.time + TECH_FX.shockSeconds, 9);
    expect(find(t, e.id).stunnedUntil).toBeCloseTo(s.time + TECH_FX.shockSeconds, 9);
    const twin = at('barbed-wire', 1, ['razor-wire', 'thick-coils']);
    const e2 = inRow(twin);
    expect(find(tick(twin, STEP), e2.id).stunnedUntil).toBe(0);
  });

  it('does not stun again inside the 3 s immunity, and does once it has passed', () => {
    let s = withWire();
    const e = inRow(s);
    s = tick(s, STEP);
    s.time = find(s, e.id).dazedUntil! + 0.5;
    find(s, e.id).y = ROW4 + SEGMENT_HEIGHT;
    const before = find(s, e.id).stunnedUntil;
    s = tick(s, STEP);
    expect(find(s, e.id).stunnedUntil).toBe(before);
    s.time = find(s, e.id).dazedUntil! + CARD.flashbang.immune + 0.5;
    find(s, e.id).y = ROW4 + 2 * SEGMENT_HEIGHT;
    s = tick(s, STEP);
    expect(find(s, e.id).stunnedUntil).toBeGreaterThan(s.time);
  });

  it('a Flashbang’s daze inside the window skips it, and a row the crossing broke stuns no one', () => {
    const flashed = withWire();
    const e = inRow(flashed);
    e.dazedUntil = flashed.time - 1;
    expect(find(tick(flashed, STEP), e.id).stunnedUntil).toBe(0);
    const worn = withWire();
    worn.wire[4]!.durability = CARD.wire.wear.shambler / 2;
    const f = inRow(worn);
    const t = tick(worn, STEP);
    expect(t.wire[4]!.broken).toBe(true);
    expect(find(t, f.id).stunnedUntil).toBe(0);
  });
});

describe('Quick Mortars, Wide Slick, Napalm Mortar', () => {
  const mortar = (tech: readonly TechId[]) => {
    const s = at('oil-bomb', 1, tech);
    enemy(s, { ...tough, x: FRONT + 300, y: ROW4 });
    return s;
  };

  it('Quick Mortars: the wait after a throw is 16 s, the first throw is as soon as ever', () => {
    const plain = mortar([]);
    const quick = mortar(['quick-mortars']);
    expect(quick.nextTarAt).toBe(plain.nextTarAt);
    const a = tick(plain, STEP);
    const b = tick(quick, STEP);
    expect(a.tarBombs.length).toBe(1);
    expect(b.tarBombs.length).toBe(1);
    expect(a.nextTarAt! - b.nextTarAt!).toBeCloseTo(CARD.oil.every - TECH_FX.oilEvery, 9);
  });

  function landing(tech: readonly TechId[]) {
    let s = mortar(tech);
    for (let i = 0; i < 300 && s.slicks.length === 0; i++) s = tick(s, STEP);
    return s.slicks[0]!;
  }

  it('Wide Slick: a slick is 25% wider, in the reach of the slick and of a Molotov’s light', () => {
    expect(slickRadius(landing([]))).toBe(CARD.oil.radius);
    const wide = landing(['quick-mortars', 'wide-slick']);
    expect(wide.radius).toBe(CARD.oil.radius * TECH_FX.slick);
    expect(slickRadius(wide)).toBeCloseTo(112.5, 9);
    const s = quiet();
    const e = enemy(s, { ...tough, x: 100, y: 100 });
    s.slicks.push({ x: 100 + 100, y: 100, at: 0, until: 99, radius: 112.5 });
    expect(slicksUnder(s, e).length).toBe(1);
    s.slicks[0]!.radius = undefined;
    expect(slicksUnder(s, e).length).toBe(0);
    // A Molotov 130 px away lights a wide slick (112.5 + 40) but not a plain one (90 + 40).
    for (const [radius, lit] of [
      [112.5, true],
      [undefined, false],
    ] as const) {
      const t = quiet();
      t.slicks.push({ x: 300, y: 300, at: 0, until: 99, ...(radius ? { radius } : {}) });
      // Past a plain slick's reach with the fire, inside a wide one's.
      t.fires.push({
        x: 300 + CARD.oil.radius + CARD.molotov.radius + 5,
        y: 300,
        at: 0,
        until: 99,
      });
      expect(tick(t, STEP).slicks[0]!.litAt !== undefined, String(radius)).toBe(lit);
    }
  });

  it('Napalm Mortar: a slick lands burning with its full 10 s life, and burns who stands in it', () => {
    const plain = landing([]);
    const napalm = landing(['quick-mortars', 'wide-slick', 'napalm-mortar']);
    expect(plain.litAt).toBeUndefined();
    expect(napalm.litAt).toBe(napalm.at);
    expect(napalm.until - napalm.at).toBe(CARD.oil.seconds);
    const s = quiet();
    const e = enemy(s, { ...tough, x: 300, y: 300 });
    s.slicks.push({ ...napalm, x: 300, y: 300, at: s.time, until: s.time + 10, litAt: s.time });
    const t = tick(s, STEP);
    expect(find(t, e.id).hp).toBeLessThan(1000);
  });
});

describe('Hand-loads no longer strengthens the ammo cards (ID-284)', () => {
  const HL: TechId[] = ['hand-loads'];

  it('Incendiary, Shock, Piercing, Scavenged and Heavy Rounds have their plain numbers', () => {
    expect(burnDpsOf(at('incendiary-rounds', 3, HL))).toBe(burnDpsOf(at('incendiary-rounds', 3)));
    expect(scavengeOf(at('scavenged-ammo', 2, HL))).toBe(CARD.scavenge[1]);
    expect(at('hollow-points', 1, HL).mods.damage).toBe(CARD.heavyRounds.damage);
    expect(quiet(HL).mods).toEqual(quiet().mods);
  });

  it('Shock Rounds paralyse as long as ever', () => {
    const run = (tech: readonly TechId[]) => {
      const s = at('shock-rounds', 2, tech);
      const e = enemy(s, { ...tough, x: 700, y: ROW4 });
      shoot(s, { x: 690, y: ROW4 });
      const time = s.time;
      return find(tick(s, STEP), e.id).shockUntil! - time;
    };
    expect(run(HL)).toBeCloseTo(run([]), 9);
  });
});

describe('Armour-piercing', () => {
  const brute = (s: HordeState) => enemy(s, { ...tough, kind: 'brute', x: 700, y: ROW4 });
  const plates = (s: HordeState) =>
    enemy(s, {
      ...tough,
      kind: 'horror',
      x: 700,
      y: ROW4,
      horror: { skills: ['plates'], nextAt: {} } as never,
    });

  it('takes 20% off flat armour, and 20% of the plates’ and Shield’s cut back', () => {
    const s = quiet();
    const b = brute(s);
    expect(hitDamage(b, 10)).toBe(7);
    expect(hitDamage(b, 10, false, false, 0.2)).toBeCloseTo(10 - 3 * 0.8, 9);
    const p = plates(s);
    expect(hitDamage(p, 100, false, false, 0.2)).toBeCloseTo(100 * 0.6 - 2 * 0.8, 9);
    const sh = enemy(s, { ...tough, x: 700, y: ROW4, shielded: true });
    expect(hitDamage(sh, 100)).toBeCloseTo(60, 9);
    expect(hitDamage(sh, 100, false, false, 0.2)).toBeCloseTo(68, 9);
    // With Breaching Rounds' half back: plates 0.5 -> 0.75, then 20% of the rest: 0.8.
    const plate2 = plates(s);
    expect(hitDamage(plate2, 100, false, true, 0.2)).toBeCloseTo(100 * 0.8 - 2 * 0.8, 9);
    expect(hitDamage(sh, 100, true, false, 0.2)).toBe(100);
  });

  it('works only while an ammo card is held, and never for a turret’s bullets', () => {
    const loss = (tech: readonly TechId[], card: UpgradeId | null, owner = 'a'): number => {
      const s = card ? at(card, 1, tech) : quiet(tech);
      const e = brute(s);
      shoot(s, { x: 690, y: ROW4, damage: 10, owner });
      return 1000 - find(tick(s, STEP), e.id).hp;
    };
    const AP: TechId[] = ['hand-loads', 'armour-piercing'];
    expect(loss(AP, 'scavenged-ammo')).toBeCloseTo(10 - 3 * 0.8, 9);
    expect(loss(AP, null)).toBeCloseTo(7, 9);
    expect(loss([], 'scavenged-ammo')).toBeCloseTo(7, 9);
    expect(loss(AP, 'scavenged-ammo', 'turret:1')).toBeCloseTo(7, 9);
  });

  it('works while Toxin Rounds is held too (ID-285): its poison tick comes on top of the bullet', () => {
    const AP: TechId[] = ['hand-loads', 'armour-piercing'];
    const run = (tech: readonly TechId[]): number => {
      const s = at('toxin-rounds', 1, tech);
      const e = brute(s);
      shoot(s, { x: 690, y: ROW4, damage: 10 });
      const t = tick(s, STEP);
      return 1000 - find(t, e.id).hp - find(t, e.id).toxDps! * STEP;
    };
    expect(run(AP)).toBeCloseTo(10 - 3 * 0.8, 9);
    expect(run([])).toBeCloseTo(7, 9);
  });
});
