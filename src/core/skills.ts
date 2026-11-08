// Active skills (design §4, as built ID-019, ID-041): abilities researched at
// the Lab, paid with horde cash and then cooling down for a while. They hit enemies
// only. Pure: `useSkill` returns a new state, or a refusal the UI shows as-is.
import { CAMP, FIELD, SKILLS, THROW_FALL, WALL, type SkillId } from './data.ts';
import { skillPower, type HordeState, type MoveResult } from './horde.ts';
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
  if (!s.freeSkills && s.cash < SKILLS[id].cost) return 'Not enough cash';
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

/** An area skill (ID-107): a flashbang or a molotov, thrown at an area. */
export type AreaSkill = Exclude<SkillId, 'airstrike'>;

/**
 * Where a flashbang or molotov aimed at `(x, y)` is thrown (ID-107): the circle of its
 * `area` round the aim, the aim moved onto the field past the outer wall first, so a
 * click behind the wall throws just past it.
 */
export function throwArea(
  s: Pick<HordeState, 'layers'>,
  id: AreaSkill,
  x: number,
  y: number,
): { x: number; y: number; r: number } {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(x, wallFront(s), FIELD.right),
    y: clamp(y, 0, FIELD.height),
    r: SKILLS[id].area,
  };
}

/**
 * Uses skill `id`: pays its cash and starts its cooldown. An airstrike carpet bombs row
 * `y`; a flashbang or a molotov is thrown at the area round `(x, y)` (`throwArea`), each
 * burst at a seeded random spot in it, kept past the walls and on the field (ID-107). Every
 * burst and bomb falls `THROW_FALL` s before it lands (ID-107).
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
  // The horde-only build's skills cost nothing (ID-100).
  if (!s.freeSkills) s.cash -= skill.cost;
  s.cooldowns[id] = s.time + skill.cooldown;
  if (id === 'airstrike') {
    carpet(s, y).forEach((p, i) => {
      s.incoming.push({ skill: id, ...p, at: s.time + THROW_FALL + i * SKILLS.airstrike.every });
    });
  } else {
    const { every } = SKILLS[id];
    // A flashbang picked alone throws more bursts (ID-100); a molotov's fires burn harder instead.
    const count = SKILLS[id].count * (id === 'flashbang' ? skillPower(s) : 1);
    const area = throwArea(s, id, x, y);
    const front = wallFront(s);
    const rng = rngFrom(s.rng);
    for (let i = 0; i < count; i++) {
      // Even over the circle; a spot off the field is moved back onto it, which (the
      // centre being on it) keeps it inside the circle.
      const d = area.r * Math.sqrt(rng());
      const a = 2 * Math.PI * rng();
      s.incoming.push({
        skill: id,
        x: Math.min(FIELD.right, Math.max(front, area.x + d * Math.cos(a))),
        y: Math.min(FIELD.height, Math.max(0, area.y + d * Math.sin(a))),
        at: s.time + THROW_FALL + i * every,
      });
    }
  }
  return { ok: true, state: s };
}
