// Balance: the specialised guns against each other, and their roles (ID-101; see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import type { Held } from '../armoury.ts';
import { chooseCard, UPGRADES } from '../cards.ts';
import { STEP, type GunBase } from '../data.ts';
import { newHorde, tick, type HordeState } from '../horde.ts';
import { createRng } from '../rng.ts';
import { answerOffer, playHorde, summarise } from '../sim.ts';
import { enemy, horror, setup } from '../testing.ts';
import { cacheFor } from './cache.ts';
import { bareGame, winRate } from './shared.ts';

const keep = cacheFor(import.meta.url);

describe('the guns (ID-046, roster reworked in ID-135)', () => {
  // A lone Gunner on the upper tower (420, 360) with one Common gun, against 20-HP
  // shamblers held in place, so only the gun differs: kills in the time, mean of the seeds.
  // ID-135 reworked every gun's character and added the Hand Cannon, Machine Pistol,
  // Assault Rifle and Cartridge Shotgun.
  // Level-ups take the first stat card offered, else none: the other cards (ID-022)
  // favour some guns over others.
  type Gun = GunBase;
  const GUNS: readonly Gun[] = [
    'pistol',
    'smg',
    'rifle',
    'shotgun',
    'lmg',
    'sniper',
    'handcannon',
    'machinepistol',
    'assault',
    'cartridge',
  ];
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
    // Only the repeatable stat cards (design §8): Speed Loaders and Extended Mags favour
    // some guns over others, the more so with levels (ID-097).
    const i = t.offer!.findIndex(
      (c) =>
        c.kind === 'upgrade' &&
        UPGRADES[c.id].category === 'stat' &&
        UPGRADES[c.id].levels === null,
    );
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

  // Gun roles (ID-101): scenes where a trait counts. The lone Gunner as above, 5 seeds.
  const ROLE_SEEDS = 5;
  const lone = (g: Gun, seed: number): HordeState => {
    const s = newHorde(seed, {
      ...setup(),
      roster: [{ id: 'a', name: 'A', loadout: { primary: held(g), secondary: null, item: null } }],
    });
    s.toSpawn = 0;
    return s;
  };
  const play = (s: HordeState, seconds: number): HordeState => {
    let t = s;
    for (let i = 0; i < seconds / STEP && t.outcome === 'fighting'; i++) {
      t = t.offer ? { ...t, offer: null } : tick(t, STEP);
    }
    return t;
  };
  const BIG = 1e6;
  /** Boss: damage in 20 s to a held horde-only boss with Armour plates, 280 px out. */
  function bossDamage(g: Gun): number {
    let total = 0;
    for (let seed = 1; seed <= ROLE_SEEDS; seed++) {
      const s = lone(g, seed);
      const h = horror(s, ['plates', 'regen'], {
        x: 700,
        y: 360,
        hp: BIG,
        maxHp: BIG,
        stunnedUntil: 1e9,
      });
      total += BIG - play(s, 20).enemies.find((e) => e.id === h.id)!.hp;
    }
    return total / ROLE_SEEDS;
  }
  /** Heavies: damage in 20 s to six held Brutes 180–380 px out. */
  function heavyDamage(g: Gun): number {
    let total = 0;
    for (let seed = 1; seed <= ROLE_SEEDS; seed++) {
      const s = lone(g, seed);
      const rng = createRng(seed * 7919);
      for (let i = 0; i < 6; i++) {
        const at = { x: 600 + rng() * 200, y: 300 + rng() * 120 };
        enemy(s, { kind: 'brute', ...at, hp: BIG, maxHp: BIG, stunnedUntil: 1e9 });
      }
      total += play(s, 20).enemies.reduce((sum, e) => sum + BIG - e.hp, 0);
    }
    return total / ROLE_SEEDS;
  }
  /** Hold: twelve unkillable Shamblers walking in from 300–400 px out; their mean x after 5 s. */
  function holdLine(g: Gun): number {
    let total = 0;
    for (let seed = 1; seed <= ROLE_SEEDS; seed++) {
      const s = lone(g, seed);
      const rng = createRng(seed * 7919);
      for (let i = 0; i < 12; i++) {
        enemy(s, { x: 720 + rng() * 100, y: 300 + rng() * 120, hp: BIG, maxHp: BIG });
      }
      const end = play(s, 5).enemies;
      total += end.reduce((sum, e) => sum + e.x, 0) / end.length;
    }
    return total / ROLE_SEEDS;
  }

  const table = new Map<Gun, Record<Scene, number>>();
  const roles = new Map<Gun, { boss: number; heavy: number; hold: number }>();
  beforeAll(() => {
    for (const g of GUNS) {
      table.set(
        g,
        Object.fromEntries(
          SCENE_IDS.map((sc) => [sc, keep(`kills ${g} ${sc}`, () => kills(g, sc))]),
        ) as Record<Scene, number>,
      );
      roles.set(g, {
        boss: keep(`boss ${g}`, () => bossDamage(g)),
        heavy: keep(`heavy ${g}`, () => heavyDamage(g)),
        hold: keep(`hold ${g}`, () => holdLine(g)),
      });
    }
  }, 180_000);
  const at = (g: Gun, sc: Scene): number => table.get(g)![sc];
  const best = (sc: Scene): Gun => GUNS.reduce((a, b) => (at(b, sc) > at(a, sc) ? b : a));
  const role = (g: Gun, k: 'boss' | 'heavy' | 'hold'): number => roles.get(g)![k];

  /** Every measure: the four kill scenes, then boss, heavies and holding a walking crowd. */
  const measures = (g: Gun): number[] => [
    ...SCENE_IDS.map((sc) => at(g, sc)),
    role(g, 'boss'),
    role(g, 'heavy'),
    role(g, 'hold'),
  ];

  it('each beats the pistol in its role: twice over, the all-rounders 1.5× everywhere', () => {
    const scenes: Partial<Record<Gun, Scene[]>> = {
      smg: ['close', 'lane'],
      shotgun: ['close'],
      cartridge: ['close'],
      machinepistol: ['close'],
      lmg: ['sustained'],
      rifle: SCENE_IDS,
    };
    for (const [g, list] of Object.entries(scenes) as [Gun, Scene[]][]) {
      for (const sc of list) {
        expect(at(g, sc), `${g} ${sc}`).toBeGreaterThanOrEqual(
          (g === 'rifle' ? 1.5 : 2) * at('pistol', sc),
        );
      }
    }
    // The Assault Rifle: 1.5× wherever it reaches (its reach is the LMG's, so not far).
    for (const sc of ['close', 'lane', 'sustained'] as const) {
      expect(at('assault', sc), `assault ${sc}`).toBeGreaterThanOrEqual(1.5 * at('pistol', sc));
    }
    // The heavy hitters: twice the pistol on a boss and on heavies.
    for (const g of ['sniper', 'handcannon'] as const) {
      expect(role(g, 'boss'), `${g} boss`).toBeGreaterThanOrEqual(2 * role('pistol', 'boss'));
      expect(role(g, 'heavy'), `${g} heavy`).toBeGreaterThanOrEqual(2 * role('pistol', 'heavy'));
    }
  });

  it('each leads in its own role (ID-135)', () => {
    // The Pump Shotgun up close, the Carbine far, the SMG in a lane, the LMG in sustained fire.
    expect(best('close')).toBe('shotgun');
    expect(best('far')).toBe('rifle');
    expect(best('lane')).toBe('smg');
    expect(best('sustained')).toBe('lmg');
    // The Sniper rifle has the highest single-target damage: on a boss by a fifth or more,
    // on heavies above every other gun.
    for (const o of GUNS.filter((g) => g !== 'sniper')) {
      expect(role('sniper', 'boss'), `sniper > ${o} boss`).toBeGreaterThan(1.2 * role(o, 'boss'));
      expect(role('sniper', 'heavy'), `sniper > ${o} heavy`).toBeGreaterThan(role(o, 'heavy'));
    }
    // The knockback guns (both shotguns, the Hand Cannon) hold a walking crowd farther out
    // than any other gun.
    const stoppers: Gun[] = ['shotgun', 'cartridge', 'handcannon'];
    for (const g of stoppers) {
      for (const o of GUNS.filter((x) => !stoppers.includes(x))) {
        expect(role(g, 'hold'), `${g} holds > ${o}`).toBeGreaterThan(role(o, 'hold') + 2);
      }
    }
  });

  it('none dominates: no gun is strictly worse than another, none leads more than two scenes', () => {
    for (const g of GUNS.filter((x) => x !== 'pistol')) {
      expect(
        SCENE_IDS.filter((sc) => best(sc) === g).length,
        `${g} leads too much`,
      ).toBeLessThanOrEqual(2);
      for (const o of GUNS.filter((x) => x !== g)) {
        const mine = measures(g);
        const theirs = measures(o);
        expect(
          mine.some((v, k) => v > theirs[k]!),
          `${g} beats ${o} somewhere`,
        ).toBe(true);
      }
    }
    // The short guns are useless far.
    for (const g of ['shotgun', 'cartridge', 'machinepistol'] as const) {
      expect(at(g, 'far'), `${g} far`).toBeLessThan(at('pistol', 'far'));
    }
  });

  it('in a real horde, a Gunner with any of them does at least as well as with the pistol, without trivialising the curve', () => {
    const winRateWith = (g: Gun, n: number): number =>
      keep(`win rate ${g} ${n}`, () => playedWinRate(g, n));
    const playedWinRate = (g: Gun, n: number): number => {
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
