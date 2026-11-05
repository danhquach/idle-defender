// Balance: the specialised guns against each other (see shared.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import type { Held } from '../armoury.ts';
import { chooseCard, UPGRADES } from '../cards.ts';
import { STEP } from '../data.ts';
import { newHorde, tick, type HordeState } from '../horde.ts';
import { createRng } from '../rng.ts';
import { answerOffer, playHorde, summarise } from '../sim.ts';
import { enemy, setup } from '../testing.ts';
import { bareGame, winRate } from './shared.ts';

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
