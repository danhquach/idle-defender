// Balance tests (design §16): the starting numbers in data.ts, played by the
// scripted player in sim.ts, still meet the design's targets. A retune that breaks
// one fails here; `npm run balance` shows the full table.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Held } from './armoury.ts';
import { lineWall, repairAllCost, segmentMaxHp } from './base.ts';
import { chooseCard, postUsable, UPGRADES } from './cards.ts';
import {
  ENEMY_MIX,
  HORROR,
  MATERIALS,
  STEP,
  type EnemyKind,
  type HorrorAbility,
  stockOf,
} from './data.ts';
import { finishHorde, hordePayout, hordeXp, newGame, startHorde, type GameState } from './game.ts';
import { newHorde, standing, tick, type HordeState } from './horde.ts';
import { createRng } from './rng.ts';
import {
  answerOffer,
  opening,
  playCampaign,
  playHorde,
  spendAll,
  summarise,
  type HordeRun,
} from './sim.ts';
import { enemy, setup } from './testing.ts';

const SEEDS = 20;
const HORDES = 9;

/** Horde `n` on the starting base with a fresh roster. */
const bareGame = (n: number) => ({ ...newGame(), hordeNumber: n });
const winRate = (runs: HordeRun[]): number =>
  runs.filter((r) => r.outcome === 'won').length / runs.length;

describe('balance on the starting base, no building', () => {
  /** Every horde 1…HORDES played once per seed 1…SEEDS, and its summary. */
  const played = new Map<number, HordeState[]>();
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= HORDES; n++) {
      const hordes = Array.from({ length: SEEDS }, (_, i) => playHorde(bareGame(n), i + 1, 0));
      played.set(n, hordes);
      byHorde.set(
        n,
        hordes.map((h, i) => summarise(h, i + 1)),
      );
    }
  }, 60_000);

  it('Horde 1 (the tutorial) is won on every seed with nobody injured', () => {
    const runs = byHorde.get(1)!;
    expect(runs.every((r) => r.outcome === 'won' && r.injured === 0)).toBe(true);
  });

  it('Horde 2 is won on every seed', () => {
    expect(winRate(byHorde.get(2)!)).toBe(1);
  });

  it('Hordes 1 and 2 last 3–5 minutes (design §4)', () => {
    for (const r of [...byHorde.get(1)!, ...byHorde.get(2)!]) {
      expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeGreaterThanOrEqual(180);
      expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeLessThanOrEqual(300);
    }
  });

  // Seeded, so never flaky: a failure here means a retune moved the curve.
  it('gets harder every horde: the win rate never rises', () => {
    for (let n = 2; n <= HORDES; n++) {
      expect(winRate(byHorde.get(n)!), `horde ${n}`).toBeLessThanOrEqual(
        winRate(byHorde.get(n - 1)!),
      );
    }
  });

  it('wins nothing from Horde 5 on: past that, the camp must grow (design §2)', () => {
    for (let n = 5; n <= HORDES; n++) expect(winRate(byHorde.get(n)!), `horde ${n}`).toBe(0);
  });

  it('a win pays for repairing its own damage', () => {
    let damaged = 0;
    for (const [n, hordes] of played) {
      for (const [i, horde] of hordes.entries()) {
        if (horde.outcome !== 'won') continue;
        const pay = hordePayout(horde);
        const bill = repairAllCost(finishHorde(bareGame(n), horde, 0).base);
        if (MATERIALS.some((m) => bill[m] > 0)) damaged += 1;
        for (const m of MATERIALS) {
          expect(pay[m], `horde ${n} seed ${i + 1} ${m}`).toBeGreaterThanOrEqual(bill[m]);
        }
      }
    }
    expect(damaged).toBeGreaterThan(0);
  });
});

describe('a campaign without building', () => {
  it('reaches Horde 4 on every seed and stalls before Horde 6', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const runs = playCampaign(seed * 1000, 12);
      const reached = runs.filter((r) => r.outcome === 'won').length + 1;
      expect(reached, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(reached, `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  }, 60_000);
});

describe('a full firing line on the starting wall (ID-048)', () => {
  // Every wall-walk spot of the starting layer built: 20 posts for 3 defenders. A line
  // adds no firepower past the roster; three staffed wall-walk posts play the same.
  const byHorde = new Map<number, HordeRun[]>();
  beforeAll(() => {
    for (let n = 1; n <= 7; n++) {
      const game = bareGame(n);
      const lined = lineWall(
        game.base,
        stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
        0,
      );
      if (!lined.ok) throw new Error(lined.reason);
      const g = { ...game, base: lined.base };
      byHorde.set(
        n,
        Array.from({ length: SEEDS }, (_, i) => summarise(playHorde(g, i + 1, 0), i + 1)),
      );
    }
  }, 60_000);

  it("doesn't trivialise the curve: Horde 5 at most half won, Horde 6 rarely, Horde 7 never", () => {
    expect(winRate(byHorde.get(5)!)).toBeLessThanOrEqual(0.5);
    expect(winRate(byHorde.get(6)!)).toBeLessThanOrEqual(0.25);
    expect(winRate(byHorde.get(7)!)).toBe(0);
  });

  it('mutants make it harder: from Horde 5 the line wins less than against Shamblers only (ID-023)', () => {
    const mix = ENEMY_MIX as Record<string, unknown>;
    const saved = { ...mix };
    const shamblersOnly = new Map<number, number>();
    try {
      for (const k of Object.keys(mix)) delete mix[k];
      for (let n = 5; n <= 7; n++) {
        const game = bareGame(n);
        const lined = lineWall(
          game.base,
          stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
          0,
        );
        if (!lined.ok) throw new Error(lined.reason);
        const g = { ...game, base: lined.base };
        const runs = Array.from({ length: SEEDS }, (_, i) =>
          summarise(playHorde(g, i + 1, 0), i + 1),
        );
        shamblersOnly.set(n, winRate(runs));
      }
    } finally {
      Object.assign(mix, saved);
    }
    let mixed = 0;
    let plain = 0;
    for (let n = 5; n <= 7; n++) {
      expect(winRate(byHorde.get(n)!), `horde ${n}`).toBeLessThanOrEqual(shamblersOnly.get(n)!);
      mixed += winRate(byHorde.get(n)!);
      plain += shamblersOnly.get(n)!;
    }
    expect(mixed).toBeLessThan(plain);
  }, 60_000);

  it('never stalls: an enemy in the camp reaches the wall line, so every horde ends within 12 minutes', () => {
    for (const runs of byHorde.values()) {
      for (const r of runs) {
        expect(r.seconds, `horde ${r.hordeNumber} seed ${r.seed}`).toBeLessThanOrEqual(720);
      }
    }
  });
});

describe('the specialised guns (ID-046)', () => {
  // A lone Gunner on the upper tower (420, 360) with one Common gun, against 20-HP
  // shamblers held in place, so only the gun differs: kills in the time, mean of the seeds.
  // Level-ups take the first stat card offered, else none: the other cards (ID-022)
  // favour some guns over others.
  type Gun = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'lmg' | 'sniper';
  const GUNS: readonly Gun[] = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper'];
  const held = (g: Gun): Held =>
    g === 'pistol' ? 'pistol' : { uid: 'h1', base: g, rarity: 'common', affixes: [] };
  /** Where the enemies stand, how many, for how long, over how many seeds. */
  const SCENES = {
    // A crowd within 260 px, just past the wall.
    close: { count: 40, x: [540, 140], y: [280, 160], seconds: 20, seeds: 10 },
    // Spread 530–830 px out.
    far: { count: 40, x: [950, 300], y: [280, 160], seconds: 20, seeds: 10 },
    // Single file along the post's row, 15 px apart.
    lane: { count: 40, x: [700, 0], y: [357, 6], seconds: 20, seeds: 10 },
    // A wide field at mid range, a minute of fire.
    sustained: { count: 120, x: [750, 250], y: [160, 400], seconds: 60, seeds: 5 },
  } as const;
  type Scene = keyof typeof SCENES;
  const SCENE_IDS = Object.keys(SCENES) as Scene[];

  function gunNeutral(t: HordeState): HordeState {
    const i = t.offer!.findIndex((c) => c.kind === 'upgrade' && UPGRADES[c.id].category === 'stat');
    return i < 0 ? { ...t, offer: null } : chooseCard(t, i);
  }

  function kills(g: Gun, scene: Scene): number {
    const { count, x, y, seconds, seeds } = SCENES[scene];
    let total = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = newHorde(seed, {
        ...setup(),
        roster: [
          { id: 'a', name: 'A', loadout: { primary: held(g), secondary: null, item: null } },
        ],
      });
      s.toSpawn = 0;
      const rng = createRng(seed * 7919);
      for (let i = 0; i < count; i++) {
        const ex = scene === 'lane' ? x[0] + i * 15 : x[0] + rng() * x[1];
        enemy(s, { x: ex, y: y[0] + rng() * y[1], stunnedUntil: 1e9 });
      }
      let t = s;
      for (let i = 0; i < seconds / STEP && t.outcome === 'fighting'; i++) {
        t = t.offer ? gunNeutral(t) : t.replace ? answerOffer(t) : tick(t, STEP);
      }
      total += count - t.enemies.filter((e) => e.hp > 0).length;
    }
    return total / seeds;
  }

  const table = new Map<Gun, Record<Scene, number>>();
  beforeAll(() => {
    for (const g of GUNS) {
      table.set(
        g,
        Object.fromEntries(SCENE_IDS.map((sc) => [sc, kills(g, sc)])) as Record<Scene, number>,
      );
    }
  }, 60_000);
  const at = (g: Gun, sc: Scene): number => table.get(g)![sc];
  const best = (sc: Scene): Gun => GUNS.reduce((a, b) => (at(b, sc) > at(a, sc) ? b : a));

  it('each beats the pistol in its role: twice over, the all-rounder 1.5× everywhere', () => {
    const roles: Record<Exclude<Gun, 'pistol'>, Scene[]> = {
      smg: ['close'],
      shotgun: ['close'],
      rifle: SCENE_IDS,
      lmg: ['sustained'],
      sniper: ['far', 'lane'],
    };
    for (const [g, scenes] of Object.entries(roles) as [Gun, Scene[]][]) {
      for (const sc of scenes) {
        expect(at(g, sc), `${g} ${sc}`).toBeGreaterThanOrEqual(
          (g === 'rifle' ? 1.5 : 2) * at('pistol', sc),
        );
      }
    }
  });

  it('leads in its own role: the shotgun up close, the sniper far and in a lane, the LMG sustained', () => {
    expect(best('close')).toBe('shotgun');
    expect(best('far')).toBe('sniper');
    expect(best('lane')).toBe('sniper');
    expect(best('sustained')).toBe('lmg');
  });

  it('none dominates: each is out-shot by another gun somewhere, and the short guns are useless far', () => {
    for (const g of GUNS) {
      expect(
        SCENE_IDS.filter((sc) => best(sc) === g).length,
        `${g} leads too much`,
      ).toBeLessThanOrEqual(2);
    }
    expect(at('smg', 'far')).toBeLessThan(at('pistol', 'far'));
    expect(at('shotgun', 'far')).toBeLessThan(at('pistol', 'far'));
    // The all-rounder leads nowhere.
    for (const sc of SCENE_IDS) expect(best(sc), sc).not.toBe('rifle');
  });

  it('in a real horde, a Gunner with any of them does at least as well as with the pistol, without trivialising the curve', () => {
    const winRateWith = (g: Gun, n: number): number => {
      const runs = Array.from({ length: 10 }, (_, i) => {
        const game = bareGame(n);
        game.roster[0]!.loadout = {
          primary: held(g),
          secondary: g === 'pistol' ? null : 'pistol',
          item: null,
        };
        return summarise(playHorde(game, i + 1, 0), i + 1);
      });
      return winRate(runs);
    };
    const pistolH4 = winRateWith('pistol', 4);
    for (const g of GUNS) {
      expect(winRateWith(g, 4), `${g} H4`).toBeGreaterThanOrEqual(pistolH4);
      expect(winRateWith(g, 6), `${g} H6`).toBeLessThanOrEqual(0.25);
    }
  }, 60_000);
});

describe('lead against Runners and lane drift (ID-023)', () => {
  // A lone pistol Gunner on the upper tower against 10 walking enemies of one kind,
  // 530–830 px out over 400 px of height: the share of bullets that hit nobody.
  function missRate(kind: EnemyKind): number {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = newHorde(seed, {
        ...setup(),
        roster: [
          { id: 'a', name: 'A', loadout: { primary: 'pistol', secondary: null, item: null } },
        ],
      });
      s.toSpawn = 0;
      const rng = createRng(seed * 7919);
      for (let i = 0; i < 10; i++) {
        enemy(s, { kind, hp: 1e6, maxHp: 1e6, x: 950 + rng() * 300, y: 160 + rng() * 400 });
      }
      let t = s;
      for (let i = 0; i < 15 / STEP && t.outcome === 'fighting'; i++) {
        t = t.offer || t.replace ? answerOffer(t) : tick(t, STEP);
        for (const k of t.impacts) {
          if (Math.abs(k.at - t.time) > 1e-9) continue;
          if (k.hit) hits++;
          else misses++;
        }
      }
    }
    return misses / (hits + misses);
  }

  it('misses happen, more on Runners than on Shamblers, while the balance targets above hold', () => {
    const shambler = missRate('shambler');
    const runner = missRate('runner');
    expect(shambler).toBeGreaterThan(0);
    expect(runner).toBeGreaterThan(shambler);
  });
});

describe('the Mutated Horror (ID-024)', () => {
  // A Horde 10 reference camp: the starting wall in concrete, every wall-walk spot
  // built, and the starter roster with the XP of winning Hordes 1–9, stat points spent.
  // The Horror alone (its last wave's crowd left out), with the whole squad posted from
  // the start, as recruit cards would have done by then.
  const veteranXp = Array.from({ length: 9 }, (_, i) => hordeXp(i + 1)).reduce((a, b) => a + b);
  function camp(lined: boolean, squad: number): GameState {
    let game = spendAll({
      ...bareGame(10),
      roster: bareGame(10)
        .roster.slice(0, squad)
        .map((d) => ({ ...d, xp: veteranXp })),
    });
    if (lined) {
      const l = lineWall(game.base, stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }), 0);
      if (!l.ok) throw new Error(l.reason);
      game = { ...game, base: l.base };
    }
    const base = structuredClone(game.base);
    for (const seg of base.layers[0]!.slots) {
      if (!seg) continue;
      seg.tier = 'concrete';
      seg.maxHp = seg.hp = segmentMaxHp(seg.kind, 'concrete');
    }
    return { ...game, base };
  }
  function bossFight(game: GameState, ability: HorrorAbility, seed: number): HordeState {
    const { defenderId, postId } = opening(game, 0);
    let s = startHorde(game, seed, defenderId, postId, 0);
    s.wave = s.waveCount;
    s.toSpawn = 0;
    s.boss = ability;
    for (const spec of s.bench) {
      const post = s.posts.find(
        (p) => p.defenderId === null && p.kind !== 'ground' && postUsable(s.layers, p),
      );
      if (!post) break;
      post.defenderId = spec.id;
      s.defenders.push(standing(spec, post, 0));
      s.tookPart.push(spec.id);
    }
    s.bench = [];
    while (s.outcome === 'fighting') {
      if (s.time > 900) throw new RangeError('bossFight: never ended');
      s = s.offer || s.replace ? answerOffer(s) : tick(s, 60);
    }
    return s;
  }
  /** Wins out of SEEDS, and the wall HP left over all of them. */
  function play(game: GameState, ability: HorrorAbility): { won: number; wall: number } {
    const runs = Array.from({ length: SEEDS }, (_, i) => bossFight(game, ability, i + 1));
    return {
      won: runs.filter((r) => r.outcome === 'won').length,
      wall: runs.reduce(
        (n, r) => n + r.layers[0]!.segments.reduce((m, g) => m + Math.max(0, g.hp), 0),
        0,
      ),
    };
  }
  /** `fn` run with every ability switched off. */
  function plain<T>(fn: () => T): T {
    const h = HORROR as unknown as {
      brood: { count: number };
      charge: { speed: number; hit: number };
      regen: { rate: number };
    };
    const saved = structuredClone(h);
    try {
      h.brood.count = 0;
      h.charge.speed = 1;
      h.charge.hit = 1;
      h.regen.rate = 0;
      return fn();
    } finally {
      Object.assign(h, saved);
    }
  }
  const line = camp(true, 3);
  const abilities: HorrorAbility[] = ['brood', 'charge', 'regen'];

  it('a full firing line beats each Horror on some seeds; a lone pistol Gunner never does', () => {
    for (const ability of abilities) {
      expect(play(line, ability).won, ability).toBeGreaterThan(0);
      expect(play(camp(false, 1), ability).won, ability).toBe(0);
    }
  }, 60_000);

  it('each ability makes it harder: fewer wins, or as many with more wall lost', () => {
    for (const ability of abilities) {
      const on = play(line, ability);
      const off = plain(() => play(line, ability));
      expect(on.won, ability).toBeLessThanOrEqual(off.won);
      if (on.won === off.won) expect(on.wall, ability).toBeLessThan(off.wall);
    }
  }, 60_000);
});
