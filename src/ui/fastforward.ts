import { CARD, SPEWER, TURRET, TURRET_RANGE } from '../core/data.ts';
import {
  gunRange,
  heldThrowable,
  mortars,
  took,
  wallFront,
  windingUp,
  type HordeState,
} from '../core/horde.ts';
import { isGun } from '../core/loadout.ts';

/**
 * The empty field's speed (ID-164): while nothing is in reach, the fight runs at least
 * this fast, so the walk-in and the gaps between waves pass in a couple of seconds. Only
 * the app's frame runs more of the core's fixed steps: the fight takes the same steps.
 */
export const SKIP_SPEED = 5;
/** Px in front of the wall that count as in reach, so nothing walks into it fast-forwarded. */
const WALL_REACH = 60;

/**
 * How far along `x` anything can act (ID-164): the squad's guns and throwables, the oil
 * mortars, the turrets, a Spewer's spit at anyone standing, and `WALL_REACH` past the wall.
 */
function reachOf(s: HordeState): number {
  let reach = wallFront(s) + WALL_REACH;
  const item = heldThrowable(s);
  for (const d of s.defenders) {
    // A Spewer spits from its own range at a survivor, whatever the survivor holds.
    reach = Math.max(reach, d.x + SPEWER.range);
    if (item !== null) reach = Math.max(reach, d.x + CARD[item].range);
    const post = s.posts[d.postId];
    if (!post) continue;
    for (const id of [d.loadout.primary, d.loadout.secondary]) {
      if (id !== null && isGun(id)) reach = Math.max(reach, d.x + gunRange(s, post, id));
    }
  }
  if (took(s, 'oil-bomb')) {
    for (const m of mortars(s)) reach = Math.max(reach, m.x + CARD.oil.range);
  }
  // The Wall Machine Gun fires at the whole field, and Shock Net's pulse reaches the wire band (ID-264).
  if (took(s, 'wall-machine-gun')) reach = Math.max(reach, wallFront(s) + CARD.wallGun.range);
  if (took(s, 'shock-net')) reach = Math.max(reach, wallFront(s) + CARD.wire.to);
  for (const t of s.turrets) {
    reach = Math.max(reach, t.x + Math.max(TURRET.range * TURRET_RANGE[t.mount], SPEWER.range));
  }
  return reach;
}

/**
 * Whether nothing can happen yet (ID-164): a fight under way, nothing in the air, no boss
 * winding up, and every enemy beyond `reachOf`. Reach is measured along `x` only, which
 * is never more than the true distance, so the field turns busy before the first enemy is
 * in range, not after.
 */
export function quietField(s: HordeState): boolean {
  if (s.outcome !== 'fighting' || s.offer !== null || s.replace !== null) return false;
  if (
    s.bullets.length > 0 ||
    s.grenades.length > 0 ||
    s.tarBombs.length > 0 ||
    s.incoming.length > 0 ||
    s.spits.length > 0 ||
    s.slabs.length > 0
  ) {
    return false;
  }
  const reach = reachOf(s);
  return s.enemies.every((e) => e.hp <= 0 || (e.x > reach && windingUp(s, e) === null));
}

/** The speed this frame runs at: the chosen one, or `SKIP_SPEED` while the field is quiet. */
export function fightSpeed(chosen: number, s: HordeState): number {
  return quietField(s) ? Math.max(chosen, SKIP_SPEED) : chosen;
}
