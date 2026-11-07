// Fixtures shared by the core tests; never imported by game code.
import { newBase } from './base.ts';
import { STEP, TIMED_SKILLS, type BossSkill } from './data.ts';
import { tick, type Enemy, type HordeSetup, type HordeState, type HorrorClock } from './horde.ts';
import type { GameState } from './game.ts';
import type { Loadout } from './loadout.ts';
import { advanceResearch, queueResearch, type GameResult, type QueueId } from './research.ts';

/** A pistol and nothing else: a Gunner. */
export const pistol = (): Loadout => ({ primary: 'pistol', secondary: null, item: null });

/** Horde 1 on the starting base, three pistol defenders a, b, c, starting with a on post 0, a bank of 600. */
export function setup(): HordeSetup {
  return {
    hordeNumber: 1,
    roster: [
      { id: 'a', name: 'A', loadout: pistol() },
      { id: 'b', name: 'B', loadout: pistol() },
      { id: 'c', name: 'C', loadout: pistol() },
    ],
    startDefenderId: 'a',
    base: newBase(),
    startPostId: 0,
    bank: 600,
    startedAt: 0,
    skills: [],
    perks: [],
  };
}

/** `s` ticked a step at a time until every bullet in flight has landed or fallen (at most 2 s). */
export function landed(s: HordeState): HordeState {
  let t = s;
  for (let i = 0; i < 60 && t.bullets.length > 0; i++) t = tick(t, STEP);
  return t;
}

/** Adds a shambler to `s` (x 600, y 360 — level with post 0 — and 20 HP unless overridden). */
export function enemy(s: HordeState, e: Partial<Enemy>): Enemy {
  const made: Enemy = {
    id: s.nextEnemyId++,
    kind: 'shambler',
    x: 600,
    y: 360,
    hp: 20,
    maxHp: 20,
    nextAttackAt: 0,
    inCamp: false,
    stunnedUntil: 0,
    vx: 0,
    vy: 0,
    climbUntil: 0,
    climbed: false,
    ...e,
  };
  s.enemies.push(made);
  return made;
}

/**
 * Researches `id` at once, a test shortcut past real time: queued with the Genes it needs
 * granted, then the queue run out. The stock's Genes are left as they were.
 */
export function researchNow(game: GameState, id: QueueId): GameResult {
  const r = queueResearch({ ...game, stock: { ...game.stock, genes: 1e9 } }, id, 0);
  if (!r.ok) return r;
  const done = advanceResearch(r.game, 1e13);
  return { ok: true, game: { ...done, stock: { ...done.stock, genes: game.stock.genes } } };
}

/** A full-game boss horde's one Broodmother (ID-024), as `HordeState.bosses` holds it once it came. */
export const BROOD_BOSS: HordeState['bosses'] = [
  { kind: 'horror', skills: ['brood'], wave: 10, hp: 1, elite: false, id: 0 },
];

/**
 * Adds a 1000 HP Mutated Horror far out in the field with `skills`, its clock as given:
 * `nextAt` is when each timed skill first goes off.
 */
export function horror(
  s: HordeState,
  skills: BossSkill | BossSkill[],
  e: Partial<Enemy> = {},
  clock: Partial<HorrorClock> & { nextAt?: number } = {},
): Enemy {
  const list = Array.isArray(skills) ? skills : [skills];
  const { nextAt = 1, ...rest } = clock;
  const made = enemy(s, { kind: 'horror', x: 1400, y: 400, hp: 1000, maxHp: 1000, ...e });
  made.horror = {
    boss: 0,
    skills: list,
    next: Object.fromEntries(list.filter((k) => TIMED_SKILLS.includes(k)).map((k) => [k, nextAt])),
    fired: {},
    chargeUntil: 0,
    charged: false,
    hitAt: 0,
    seenHp: made.hp,
    broods: 0,
    platesOff: false,
    ...rest,
  };
  return made;
}
