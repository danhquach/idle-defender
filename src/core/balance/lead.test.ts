// Balance: aiming lead against Runners and lane drift (see shared.ts).
import { describe, expect, it } from 'vitest';
import { STEP, type EnemyKind } from '../data.ts';
import { newHorde, tick } from '../horde.ts';
import { createRng } from '../rng.ts';
import { answerOffer } from '../sim.ts';
import { enemy, setup } from '../testing.ts';
import { cacheFor } from './cache.ts';

const keep = cacheFor(import.meta.url);

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
    const shambler = keep('shambler', () => missRate('shambler'));
    const runner = keep('runner', () => missRate('runner'));
    expect(shambler).toBeGreaterThan(0);
    expect(runner).toBeGreaterThan(shambler);
  });
});
