// Balance: the Mutated Horror boss fight (see shared.ts).
import { describe, expect, it } from 'vitest';
import { lineWall, segmentMaxHp } from '../base.ts';
import { postUsable } from '../cards.ts';
import { HORROR, type HorrorAbility, stockOf } from '../data.ts';
import { hordeXp, startHorde, type GameState } from '../game.ts';
import { standing, tick, type HordeState } from '../horde.ts';
import { answerOffer, opening, spendAll } from '../sim.ts';
import { bareGame, SEEDS } from './shared.ts';

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
    s.bosses = [
      { kind: 'horror', skills: [ability], wave: s.waveCount, hp: 1, elite: false, id: null },
    ];
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
