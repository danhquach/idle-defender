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

/** Adds a shambler to `s` (lane 1, x 600, 20 HP unless overridden). */
export function enemy(s: HordeState, e: Partial<Enemy>): Enemy {
  const made: Enemy = {
    id: s.nextEnemyId++,
    kind: 'shambler',
    lane: 1,
    x: 600,
    hp: 20,
    maxHp: 20,
    nextAttackAt: 0,
    ...e,
  };
  s.enemies.push(made);
  return made;
}
