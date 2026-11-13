// Active skills (design §4, as built ID-019, ID-041, ID-139): abilities researched at the
// Lab, paid with horde cash and then cooling down for a while. They hit enemies only. Pure:
// `useSkill` returns a new state, or a refusal the UI shows as-is.
import { AUTO_AIM, CAMP, FIELD, SKILLS, THROW_FALL, WALL, type SkillId } from './data.ts';
import type { Enemy, HordeState, MoveResult } from './horde.ts';
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
 * Where skill `id` aimed at `(x, y)` lands (ID-107, ID-139): the circle of its `area` round
 * the aim, the aim moved onto the field past the outer wall first, so a click behind the
 * wall drops just past it.
 */
export function throwArea(
  s: Pick<HordeState, 'layers'>,
  id: SkillId,
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
 * Uses skill `id`: pays its cash and starts its cooldown. An airstrike aimed at `(x, y)`
 * drops its bombs over the area round it (`throwArea`), each at a seeded random spot spread
 * evenly over the circle, kept past the walls and on the field (ID-139, as Flashbang's
 * bursts did, ID-107). Each falls `THROW_FALL` s before it lands, one every `every` s.
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
  const area = throwArea(s, id, x, y);
  const front = wallFront(s);
  const rng = rngFrom(s.rng);
  for (let i = 0; i < skill.count; i++) {
    // Even over the circle; a spot off the field is moved back onto it, which (the centre
    // being on it) keeps it inside the circle.
    const d = area.r * Math.sqrt(rng());
    const a = 2 * Math.PI * rng();
    s.incoming.push({
      skill: id,
      x: Math.min(FIELD.right, Math.max(front, area.x + d * Math.cos(a))),
      y: Math.min(FIELD.height, Math.max(0, area.y + d * Math.sin(a))),
      at: s.time + THROW_FALL + i * skill.every,
    });
  }
  return { ok: true, state: s };
}

/**
 * Where auto-aim drops the Airstrike (ID-140): on the live enemy past the outer wall and on
 * the field whose circle (the Airstrike's `area`) covers the most such enemies, itself
 * counted; ties go to the one nearest the wall, then the lowest id. Null while no circle
 * would cover `min`. Pure and seed-free; O(n²) on those enemies, which `AUTO_AIM.look` keeps
 * to a few looks a fight second.
 */
export function strikeAim(
  s: Pick<HordeState, 'layers' | 'enemies'>,
  min: number = AUTO_AIM.min,
): { x: number; y: number } | null {
  const front = wallFront(s);
  const live = s.enemies.filter((e) => e.hp > 0 && !e.inCamp && e.x >= front && e.x <= FIELD.right);
  const r2 = SKILLS.airstrike.area ** 2;
  let best: Enemy | undefined;
  let bestCount = 0;
  for (const e of live) {
    let count = 0;
    for (const o of live) {
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      if (dx * dx + dy * dy <= r2) count++;
    }
    const better =
      count > bestCount ||
      (count === bestCount && best && (e.x < best.x || (e.x === best.x && e.id < best.id)));
    if (better) [best, bestCount] = [e, count];
  }
  if (!best || bestCount < min) return null;
  const area = throwArea(s, 'airstrike', best.x, best.y);
  return { x: area.x, y: area.y };
}

/**
 * Auto-aim's strike (ID-140): the Airstrike used at `strikeAim` the moment it can be (ready,
 * no pick open, the cash in hand), through `useSkill` as a tap is; `s` as it was otherwise.
 */
export function autoStrike(s: HordeState): HordeState {
  if (skillLock(s, 'airstrike') !== null) return s;
  const aim = strikeAim(s);
  if (!aim) return s;
  const r = useSkill(s, 'airstrike', aim.x, aim.y);
  return r.ok ? r.state : s;
}

/**
 * Whether auto-aim looks again at fight time `time` (ID-140), having last looked at
 * `lookedAt`: once `AUTO_AIM.look` s have passed, and at once when `time` is behind
 * `lookedAt`, as a new horde restarts its clock.
 */
export function autoLookDue(time: number, lookedAt: number): boolean {
  return time < lookedAt || time - lookedAt >= AUTO_AIM.look;
}
