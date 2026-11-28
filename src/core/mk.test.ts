// ID-284: the Mk II and Mk III numbers of the five ammo and throwable cards, against the design's
// table; the highest Mk counts, never the sum; a card from an offer and from the starting pick are
// the same card; a Flashbang or Molotov not thrown by the held card gets no Mk.
import { describe, expect, it } from 'vitest';
import { chooseCard } from './cards.ts';
import { CARD, SEGMENT_HEIGHT, STEP, TECH_FX, WEAPONS, type TechId } from './data.ts';
import type { GameState } from './game.ts';
import {
  burnDpsOf,
  fireDps,
  flashRadius,
  fragDamage,
  fragRadius,
  mkOf,
  newHorde,
  shamblerHp,
  stunSeconds,
  fireSeconds,
  tick,
  type Bullet,
  type HordeState,
  type MkCard,
  type UpgradeId,
} from './horde.ts';
import { startSquadHorde } from './hordeonly.ts';
import { squadAt } from './balance/shared.ts';
import { enemy, setup } from './testing.ts';

const ROW4 = 4.5 * SEGMENT_HEIGHT;
const CARDS: MkCard[] = [
  'incendiary-rounds',
  'shock-rounds',
  'frag-grenades',
  'flashbang',
  'molotov',
];

/** The nodes of card `id` up to Mk `mk` (0 = the unlock only). */
const nodes = (id: MkCard, mk: 0 | 1 | 2 | null): TechId[] =>
  mk === null
    ? []
    : ([id, ...(mk >= 1 ? [`${id}-mk2`] : []), ...(mk >= 2 ? [`${id}-mk3`] : [])] as TechId[]);
type Mk = null | 0 | 1 | 2;

/** Horde 1, nothing to spawn, nobody fires; `tech` researched. */
function quiet(tech: readonly TechId[] = []): HordeState {
  const s = newHorde(1, { ...setup(), ...(tech.length > 0 ? { tech } : {}) });
  s.toSpawn = 0;
  for (const d of s.defenders) d.nextShotAt = 1e9;
  return s;
}
/** `s` with card `id` taken `level` times. */
function held(s: HordeState, id: UpgradeId, level = 1): HordeState {
  let t = s;
  for (let i = 0; i < level; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}
const at = (id: MkCard, level: number, mk: Mk): HordeState => held(quiet(nodes(id, mk)), id, level);
const find = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;
const run = (s: HordeState, seconds: number): HordeState => {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
};

describe('Mk of a held card (ID-284)', () => {
  it('is 0 without the nodes, 0 with the unlock alone, 1 with Mk II and 2 with Mk III', () => {
    for (const id of CARDS) {
      expect(mkOf(at(id, 1, null), id)).toBe(0);
      expect(mkOf(at(id, 1, 0), id)).toBe(0);
      expect(mkOf(at(id, 1, 1), id)).toBe(1);
      expect(mkOf(at(id, 1, 2), id)).toBe(2);
    }
  });

  it('the highest counts: Mk III is Mk III’s number whether Mk II is there or not', () => {
    for (const id of CARDS) {
      expect(mkOf(held(quiet([`${id}-mk3`] as never), id), id)).toBe(2);
      expect(mkOf(held(quiet([`${id}-mk2`, `${id}-mk3`] as never), id), id)).toBe(2);
    }
  });

  it('is the card’s own: another card’s Mk, or a card not held, gives none', () => {
    const s = held(quiet(['incendiary-rounds-mk3', 'molotov-mk3'] as never), 'molotov');
    expect(mkOf(s, 'molotov')).toBe(2);
    expect(mkOf(s, 'incendiary-rounds')).toBe(0);
    const notHeld = quiet(['molotov-mk3'] as never);
    expect(mkOf(notHeld, 'molotov')).toBe(0);
  });
});

describe('Incendiary Rounds burn (ID-284)', () => {
  const SHARE = [0.03, 0.06, 0.09];
  it('Lv 1-3 at none, Mk II and Mk III: +15% and +30%', () => {
    const want = {
      none: [3, 6, 9],
      mk2: [3.45, 6.9, 10.35],
      mk3: [3.9, 7.8, 11.7],
    };
    for (const level of [1, 2, 3]) {
      for (const [mk, key] of [
        [null, 'none'],
        [0, 'none'],
        [1, 'mk2'],
        [2, 'mk3'],
      ] as const) {
        const s = at('incendiary-rounds', level, mk);
        expect((burnDpsOf(s) / shamblerHp(s)) * 100, `Lv ${level} ${key}`).toBeCloseTo(
          want[key][level - 1]!,
          9,
        );
      }
    }
    expect(SHARE).toEqual([...CARD.burn.share]);
  });
});

describe('Shock Rounds paralysis (ID-284)', () => {
  function paralysed(level: number, mk: Mk, kind = 'shambler'): number {
    const s = at('shock-rounds', level, mk);
    const e = enemy(s, { hp: 1e6, maxHp: 1e6, x: 700, y: ROW4, kind: kind as never });
    s.bullets.push({
      x: 690,
      y: ROW4,
      dx: 1,
      dy: 0,
      speed: 1800,
      damage: 10,
      owner: 'a',
      fromX: 690,
      fromY: ROW4,
      aim: 100,
      left: 1000,
      pierce: 0,
      hit: [],
      tracer: WEAPONS.pistol.tracer,
    } satisfies Bullet);
    const time = s.time;
    return find(tick(s, STEP), e.id).shockUntil! - time;
  }

  it('Lv 1-3: 0.2 / 0.3 / 0.4 s, Mk II 0.23 / 0.345 / 0.46 s, Mk III 0.26 / 0.39 / 0.52 s', () => {
    const want = { none: [0.2, 0.3, 0.4], mk2: [0.23, 0.345, 0.46], mk3: [0.26, 0.39, 0.52] };
    for (const level of [1, 2, 3]) {
      for (const [mk, key] of [
        [null, 'none'],
        [0, 'none'],
        [1, 'mk2'],
        [2, 'mk3'],
      ] as const) {
        expect(paralysed(level, mk), `Lv ${level} ${key}`).toBeCloseTo(want[key][level - 1]!, 9);
      }
    }
  });

  it('the heavy kinds get half of the Mk’s number', () => {
    const heavy = CARD.shock.heavyKinds[0]!;
    expect(paralysed(3, 2, heavy)).toBeCloseTo(0.52 * CARD.shock.heavy, 9);
    expect(paralysed(3, 1, heavy)).toBeCloseTo(0.46 * CARD.shock.heavy, 9);
    expect(paralysed(3, null, heavy)).toBeCloseTo(0.4 * CARD.shock.heavy, 9);
  });
});

describe('Frag Grenades burst and reach (ID-284)', () => {
  it('the burst is 25% of a Shambler’s HP, 28.75% at Mk II and 32.5% at Mk III, at every level', () => {
    for (const level of [1, 2, 3]) {
      for (const [mk, share] of [
        [null, 25],
        [0, 25],
        [1, 28.75],
        [2, 32.5],
      ] as const) {
        const s = at('frag-grenades', level, mk);
        expect((fragDamage(s) / shamblerHp(s)) * 100, `Lv ${level}`).toBeCloseTo(share, 9);
      }
    }
  });

  it('only Mk III widens the burst, by 10% (70 to 77 px)', () => {
    expect(fragRadius(at('frag-grenades', 1, null))).toBe(CARD.frag.radius);
    expect(fragRadius(at('frag-grenades', 1, 1))).toBe(CARD.frag.radius);
    expect(fragRadius(at('frag-grenades', 1, 2))).toBeCloseTo(77, 9);
  });

  /** A pair 60 px apart at x 900, and a line of three 75 px apart at x 800: which one is aimed at. */
  function aim(mk: Mk) {
    const s = at('frag-grenades', 1, mk);
    const pair = [0, 60].map((dy) => enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + dy }));
    const line = [0, 75, 150].map((dy) =>
      enemy(s, { hp: 1e6, maxHp: 1e6, x: 800, y: ROW4 - 80 + dy }),
    );
    const t = tick(s, STEP);
    return { grenade: t.grenades[0]!, pair, line };
  }

  it('Mk III’s wider reach changes the aim’s cluster count: the line’s middle beats the pair', () => {
    const base = aim(null);
    expect(base.grenade.x).toBe(900);
    const wide = aim(2);
    const middle = wide.line[1]!;
    expect({ x: wide.grenade.x, y: wide.grenade.y }).toEqual({ x: middle.x, y: middle.y });
    // Mk II does not widen: still the pair.
    expect(aim(1).grenade.x).toBe(900);
  });

  it('the burst reaches 77 px at Mk III and 70 px below it', () => {
    for (const [mk, hurt] of [
      [1, false],
      [2, true],
    ] as const) {
      const s = at('frag-grenades', 1, mk);
      const centre = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
      const far = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + 74 });
      const t = run(s, CARD.frag.flight + 0.2);
      expect(find(t, centre.id).hp).toBeLessThan(1e6);
      expect(find(t, far.id).hp < 1e6, `Mk ${mk + 1}`).toBe(hurt);
    }
  });
});

describe('Flashbang stun and reach (ID-284)', () => {
  it('thrown with its level’s seconds plus 0.5 (Mk II) or 1 (Mk III)', () => {
    const want = { none: [3, 4, 5], mk2: [3.5, 4.5, 5.5], mk3: [4, 5, 6] };
    for (const level of [1, 2, 3]) {
      for (const [mk, key] of [
        [null, 'none'],
        [0, 'none'],
        [1, 'mk2'],
        [2, 'mk3'],
      ] as const) {
        const s = at('flashbang', level, mk);
        enemy(s, { hp: 1e6, maxHp: 1e6, x: 700, y: ROW4 });
        const t = tick(s, STEP);
        expect(t.grenades[0]!.seconds, `Lv ${level} ${key}`).toBeCloseTo(want[key][level - 1]!, 9);
      }
    }
    expect(stunSeconds(at('flashbang', 1, 2), 3)).toBe(3 + TECH_FX.mk.stun[1]);
  });

  it('only Mk III widens the landing reach, by 10% (100 to 110 px)', () => {
    expect(flashRadius(at('flashbang', 1, null))).toBe(CARD.flashbang.radius);
    expect(flashRadius(at('flashbang', 1, 1))).toBe(CARD.flashbang.radius);
    expect(flashRadius(at('flashbang', 1, 2))).toBeCloseTo(110, 9);
  });

  it('Mk III stuns an enemy 105 px from the landing point, Mk II does not', () => {
    for (const [mk, stunned] of [
      [1, false],
      [2, true],
    ] as const) {
      const s = at('flashbang', 1, mk);
      const e = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
      const f = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + 105 });
      const t = run(s, CARD.flashbang.flight + 0.2);
      expect(find(t, e.id).dazedUntil).toBeDefined();
      expect(find(t, f.id).dazedUntil !== undefined, `Mk ${mk + 1}`).toBe(stunned);
    }
  });

  it('Mk III’s wider reach changes the aim’s cluster count', () => {
    // Two enemies 105 px apart at x 900, and a lone enemy at x 800: with 100 px a lone enemy is no
    // cluster, so the nearest to the wall (lowest x) is aimed at; with 110 px the pair is one.
    const aimed = (mk: Mk) => {
      const s = at('flashbang', 1, mk);
      enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
      enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + 105 });
      enemy(s, { hp: 1e6, maxHp: 1e6, x: 800, y: ROW4 - 300 });
      return tick(s, STEP).grenades[0]!;
    };
    expect(aimed(1).x).toBe(800);
    expect(aimed(2).x).toBe(900);
  });

  it('the 3 s immunity starts when the longer stun ends', () => {
    // One enemy, so the second throw waits for it to be flashable again: stun, then immunity.
    for (const [mk, extra] of [
      [null, 0],
      [1, 0.5],
      [2, 1],
    ] as const) {
      const s = at('flashbang', 1, mk);
      const e = enemy(s, { hp: 1e9, maxHp: 1e9, x: 700, y: ROW4 });
      let t = s;
      let first: number | null = null;
      let second: number | null = null;
      for (let i = 0; i < 600 && second === null; i++) {
        t = tick(t, STEP);
        const stuns = t.grenades.filter((g) => g.item === 'flashbang');
        if (first === null && stuns.length > 0) first = stuns[0]!.lands;
        if (stuns.length > 1 || (first !== null && stuns.some((g) => g.lands > first!))) {
          second = Math.max(...stuns.map((g) => g.lands));
        }
      }
      expect(first, 'thrown').not.toBeNull();
      expect(second, 'thrown again').not.toBeNull();
      const gap = second! - first!;
      // Stun (3 + the Mk's) then the 3 s immunity, and the throw's own flight: never sooner.
      expect(gap).toBeGreaterThanOrEqual(3 + extra + CARD.flashbang.immune - 2 * STEP);
      expect(gap).toBeLessThan(3 + extra + CARD.flashbang.immune + 1.5);
      expect(find(t, e.id)).toBeDefined();
    }
  });
});

describe('Molotov fire (ID-284)', () => {
  it('burns 10% of a Shambler’s HP a second, 11.5% at Mk II and 13% at Mk III', () => {
    for (const level of [1, 2, 3]) {
      for (const [mk, pct] of [
        [null, 10],
        [0, 10],
        [1, 11.5],
        [2, 13],
      ] as const) {
        const s = at('molotov', level, mk);
        expect((fireDps(s) / shamblerHp(s)) * 100, `Lv ${level}`).toBeCloseTo(pct, 9);
      }
    }
  });

  it('burns 4 / 6 / 8 s, and 5 / 7 / 9 s at Mk III (+1 s); Mk II adds none', () => {
    const want = { none: [4, 6, 8], mk2: [4, 6, 8], mk3: [5, 7, 9] };
    for (const level of [1, 2, 3]) {
      for (const [mk, key] of [
        [null, 'none'],
        [1, 'mk2'],
        [2, 'mk3'],
      ] as const) {
        const s = at('molotov', level, mk);
        enemy(s, { hp: 1e6, maxHp: 1e6, x: 700, y: ROW4 });
        const t = tick(s, STEP);
        expect(t.grenades[0]!.seconds, `Lv ${level} ${key}`).toBe(want[key][level - 1]);
      }
    }
    expect(fireSeconds(at('molotov', 1, 2), 4)).toBe(5);
  });

  it('a fire in the field hurts as hard as its Mk says', () => {
    const lost = (mk: Mk): number => {
      const s = at('molotov', 1, mk);
      const e = enemy(s, { hp: 1e5, maxHp: 1e5, x: 700, y: ROW4, ...{ vx: 0, vy: 0 } });
      // Thrown, landed, then a step of its burn: the factor is the one it was thrown with.
      let t = run(s, CARD.molotov.flight + 0.2);
      expect(t.fires[0]!.factor).toBe(mk === 2 ? 1.3 : mk === 1 ? 1.15 : undefined);
      t = tick({ ...t, nextThrowAt: 1e9 }, STEP);
      return 1e5 - find(t, e.id).hp;
    };
    expect(lost(2) / lost(null)).toBeCloseTo(1.3, 6);
    expect(lost(1) / lost(null)).toBeCloseTo(1.15, 6);
  });
});

describe('a card from an offer and one from the starting pick are the same card (ID-284)', () => {
  it('every Mk number is the same', () => {
    for (const id of CARDS) {
      const tech = nodes(id, 2);
      const fromOffer = held(quiet(tech), id);
      const game: GameState = {
        ...squadAt(5, 5),
        tech,
        kit: CARDS.indexOf(id) < 2 ? { ammo: id } : { throwable: id },
      };
      const fromPick = startSquadHorde(game, 1, 0);
      expect(mkOf(fromPick, id)).toBe(mkOf(fromOffer, id));
      expect(mkOf(fromPick, id)).toBe(2);
      expect(fromPick.taken).toEqual([id]);
      expect(fromPick.cardLevels[id]).toBe(1);
    }
    const a = held(quiet(nodes('incendiary-rounds', 2)), 'incendiary-rounds');
    const b = startSquadHorde(
      { ...squadAt(5, 5), tech: nodes('incendiary-rounds', 2), kit: { ammo: 'incendiary-rounds' } },
      1,
      0,
    );
    expect(burnDpsOf(b) / shamblerHp(b)).toBeCloseTo(burnDpsOf(a) / shamblerHp(a), 9);
  });
});

describe('a throw keeps the Mk it was thrown with (ID-284)', () => {
  const swapTo = (s: HordeState, id: UpgradeId): HordeState => {
    const t = held(s, id);
    t.nextThrowAt = 1e9;
    return t;
  };

  it('a Frag Grenade in the air bursts at its Mk III reach and damage after a swap', () => {
    const s = at('frag-grenades', 1, 2);
    const near = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
    const far = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + 74 });
    let t = tick(s, STEP);
    expect(t.grenades[0]).toMatchObject({ reach: 77 * 1, dmg: 1.3 });
    t = swapTo(t, 'molotov');
    t = run(t, CARD.frag.flight + 0.2);
    const burst = CARD.frag.share * 1.3 * shamblerHp(t);
    expect(1e6 - find(t, near.id).hp).toBeCloseTo(burst, 6);
    expect(find(t, far.id).hp).toBeLessThan(1e6);
  });

  it('a Flashbang in the air stuns at its Mk III reach after a swap', () => {
    const s = at('flashbang', 1, 2);
    enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
    const f = enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 + 105 });
    let t = tick(s, STEP);
    expect(t.grenades[0]!.reach).toBeCloseTo(110, 9);
    t = swapTo(t, 'frag-grenades');
    t = run(t, CARD.flashbang.flight + 0.2);
    expect(find(t, f.id).dazedUntil).toBeDefined();
    expect(t.blasts[0]!.radius).toBeCloseTo(110, 9);
  });

  it('a Molotov fire on the field burns at its Mk after a swap', () => {
    const lost = (swap: boolean): number => {
      let s = at('molotov', 1, 2);
      const e = enemy(s, { hp: 1e5, maxHp: 1e5, x: 700, y: ROW4 });
      s = run(s, CARD.molotov.flight + 0.2);
      expect(s.fires[0]!.factor).toBe(1.3);
      if (swap) s = swapTo(s, 'frag-grenades');
      s.nextThrowAt = 1e9;
      return 1e5 - find(tick(s, STEP), e.id).hp;
    };
    expect(lost(true)).toBeCloseTo(lost(false), 6);
  });

  it('without a Mk a throw carries no extra fields', () => {
    const s = at('frag-grenades', 1, null);
    enemy(s, { hp: 1e6, maxHp: 1e6, x: 900, y: ROW4 });
    expect(Object.keys(tick(s, STEP).grenades[0]!).sort()).toEqual(
      ['at', 'burst', 'by', 'fromX', 'fromY', 'lands', 'x', 'y'].sort(),
    );
  });
});

describe('a Flashbang or Molotov not thrown by the held card gets no Mk (ID-284)', () => {
  it('a fire or a stun with another card held, or none, is the plain one', () => {
    const tech = [...nodes('molotov', 2), ...nodes('flashbang', 2)];
    // Frag Grenades held: the Molotov and Flashbang Mk are not the held card's.
    const s = held(quiet(tech), 'frag-grenades');
    expect(fireDps(s)).toBe(CARD.molotov.burn * shamblerHp(s));
    expect(stunSeconds(s, 3)).toBe(3);
    expect(fireSeconds(s, 4)).toBe(4);
    expect(flashRadius(s)).toBe(CARD.flashbang.radius);
    // Nothing held: the same.
    const none = quiet(tech);
    expect(fireDps(none)).toBe(CARD.molotov.burn * shamblerHp(none));
    expect(stunSeconds(none, 3)).toBe(3);
    // Another throwable replaces the card: its Mk is gone with it.
    const swapped = held(held(quiet(tech), 'molotov'), 'flashbang');
    expect(mkOf(swapped, 'molotov')).toBe(0);
    expect(mkOf(swapped, 'flashbang')).toBe(2);
    expect(fireDps(swapped)).toBe(CARD.molotov.burn * shamblerHp(swapped));
  });
});
