// Fixtures shared by the core tests; never imported by game code.
import type { Enemy, HordeSetup, HordeState } from './horde.ts';

/** Horde 1, three pistol defenders a, b, c, starting with a. */
export function setup(): HordeSetup {
  return {
    hordeNumber: 1,
    roster: [
      { id: 'a', name: 'A', weapon: 'pistol' },
      { id: 'b', name: 'B', weapon: 'pistol' },
      { id: 'c', name: 'C', weapon: 'pistol' },
    ],
    startDefenderId: 'a',
  };
}

/** Adds a shambler to `s` (x 600, y 120 — level with post 0 — and 20 HP unless overridden). */
export function enemy(s: HordeState, e: Partial<Enemy>): Enemy {
  const made: Enemy = {
    id: s.nextEnemyId++,
    kind: 'shambler',
    x: 600,
    y: 120,
    hp: 20,
    maxHp: 20,
    nextAttackAt: 0,
    ...e,
  };
  s.enemies.push(made);
  return made;
}
