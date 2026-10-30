// Active skills (design §4, as built ID-019, ID-041): abilities researched at
// the Lab, paid with horde cash and then cooling down for a while. They hit enemies
// only. Pure: `useSkill` returns a new state, or a refusal the UI shows as-is.
import { CAMP, FIELD, SKILLS, WALL, type SkillId } from './data.ts';
import type { HordeState, MoveResult } from './horde.ts';
import { rngFrom } from './rng.ts';

// Accumulated float time can land a hair before a due time; count it as ready.
const EPS = 1e-9;

/** Fight seconds until `id` is ready again; 0 when it is. */
export function skillLeft(s: Pick<HordeState, 'time' | 'cooldowns'>, id: SkillId): number {
  const left = s.cooldowns[id] - s.time;
  return left > EPS ? left : 0;
}

/** Why `id` can't be used now (wherever it is aimed), or null when it can. */
export function skillLock(s: HordeState, id: SkillId): string | null {
  if (!Object.hasOwn(SKILLS, id)) throw new RangeError(`skill: unknown skill ${String(id)}`);
  if (!s.skills.includes(id)) return `Research ${SKILLS[id].name} first`;
  if (s.outcome !== 'fighting') return 'The horde is over';
  if (s.offer !== null || s.replace !== null) return 'Pick first';
  if (skillLeft(s, id) > 0) return 'Not ready yet';
  if (s.cash < SKILLS[id].cost) return 'Not enough cash';
  return null;
}

/** Where the field past the walls starts: the outermost wall's front, or the camp line. */
export function wallFront(s: Pick<HordeState, 'layers'>): number {
  return Math.max(CAMP.x, ...s.layers.map((l) => l.x + WALL.depth));
}

/**
 * Where an airstrike aimed at row `y` drops its bombs, in the order they land: from the
 * outer wall's front to the field's end, `2 × radius` apart (design §4, ID-041).
 */
export function carpet(s: Pick<HordeState, 'layers'>, y: number): { x: number; y: number }[] {
  const r = SKILLS.airstrike.radius;
  const front = wallFront(s);
  const count = Math.floor((FIELD.right - front) / (2 * r));
  return Array.from({ length: count }, (_, i) => ({ x: front + r + i * 2 * r, y }));
}

/**
 * Uses skill `id`: pays its cash and starts its cooldown. An airstrike carpet bombs row
 * `y`; a flashbang or a molotov ignores the aim and is thrown at random spots past the
 * walls.
 */
export function useSkill(state: HordeState, id: SkillId, x: number, y: number): MoveResult {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(`useSkill: bad aim ${x}, ${y}`);
  }
  const lock = skillLock(state, id);
  if (lock) return { ok: false, reason: lock };
  if (x < 0 || x > FIELD.right || y < 0 || y > FIELD.height) {
    return { ok: false, reason: 'Aim at the field' };
  }
  const s = structuredClone(state);
  const skill = SKILLS[id];
  s.cash -= skill.cost;
  s.cooldowns[id] = s.time + skill.cooldown;
  if (id === 'airstrike') {
    carpet(s, y).forEach((p, i) => {
      s.incoming.push({ skill: id, ...p, at: s.time + i * SKILLS.airstrike.every });
    });
  } else {
    const { radius: r, count, every } = SKILLS[id];
    const front = wallFront(s);
    const rng = rngFrom(s.rng);
    for (let i = 0; i < count; i++) {
      s.incoming.push({
        skill: id,
        x: front + r + rng() * (FIELD.right - front - 2 * r),
        y: r + rng() * (FIELD.height - 2 * r),
        at: s.time + i * every,
      });
    }
  }
  return { ok: true, state: s };
}
