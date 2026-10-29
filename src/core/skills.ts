// Active skills (design §4, as built ID-019): click-to-target abilities researched at
// the Lab, paid with horde cash and then cooling down for a while. They hit enemies
// only. Pure: `useSkill` returns a new state, or a refusal the UI shows as-is.
import { FIELD, SKILLS, type SkillId } from './data.ts';
import { removeDead, type HordeState, type MoveResult } from './horde.ts';

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

/** Uses skill `id` aimed at field point `(x, y)`: pays its cash and starts its cooldown. */
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
  s.blasts.push({ skill: id, x, y, at: s.time });
  const hit = s.enemies.filter(
    (e) => e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= skill.radius + EPS,
  );
  if (id === 'airstrike') {
    for (const e of hit) e.hp = Math.max(0, e.hp - SKILLS.airstrike.damage);
    removeDead(s);
  }
  if (id === 'molotov') s.fires.push({ x, y, until: s.time + SKILLS.molotov.seconds });
  if (id === 'flashbang') {
    for (const e of hit) {
      e.stunnedUntil = Math.max(e.stunnedUntil, s.time + SKILLS.flashbang.seconds);
    }
  }
  return { ok: true, state: s };
}
