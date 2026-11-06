// Sound cues (ID-080): what a fight did between two frames, read from the two states, for
// the audio engine (audio.ts) to play. Cosmetic only: it reads the fight and never
// changes it, and holds no clock of its own.
import { baseOf } from '../core/armoury.ts';
import { WEAPONS, type WeaponId } from '../core/data.ts';
import type { Defender, HordeState, Slot } from '../core/horde.ts';

/** A gun's shot sound: one per gun kind, and the turrets'. */
export type ShotSound = `shot-${WeaponId | 'turret'}`;
export type Cue =
  | ShotSound
  | 'reload'
  | 'enemy-hit'
  | 'enemy-die'
  | 'wall-hit'
  | 'wall-break'
  | 'card-offer'
  | 'card-pick'
  | 'level-up'
  | 'won'
  | 'lost'
  | 'click';

const SLOTS: readonly Slot[] = ['primary', 'secondary'];

/** Whether `next` is a later frame of the same fight as `prev`. */
export function sameFight(prev: HordeState, next: HordeState): boolean {
  return prev.startedAt === next.startedAt && prev.seed === next.seed && next.time >= prev.time;
}

/** The weapon a defender's shot came from: the slot whose magazine went down, else the primary. */
function firedWith(before: Defender | undefined, after: Defender): WeaponId {
  const slot =
    SLOTS.find((s) => before !== undefined && after.ammo[s] < before.ammo[s]) ?? 'primary';
  const held = after.loadout[slot] ?? after.loadout.primary;
  return baseOf(held);
}

/** The open offer's cards, by value (a step may copy the array), or null. */
function offerKey(s: HordeState): string | null {
  return s.offer?.map((c) => (c.kind === 'upgrade' ? c.id : `+${c.defender.id}`)).join() ?? null;
}

/**
 * The cues from `prev` to `next`, each named once however often it happened (the engine
 * caps overlap on top of that). A different fight, or none before, gives none.
 */
export function cuesBetween(prev: HordeState | null, next: HordeState): Cue[] {
  if (!prev || !sameFight(prev, next)) return [];
  const cues = new Set<Cue>();
  const before = new Map(prev.defenders.map((d) => [d.id, d]));

  // Shots. The muzzle-flash list keeps a shot only 0.08 s, so a long frame at 3× can add
  // and drop one unseen: a magazine going down, or a turret's next shot moving later, is
  // read too.
  const gun = (id: WeaponId): void => {
    if (WEAPONS[id].kind === 'sidearm' || WEAPONS[id].kind === 'gun') cues.add(`shot-${id}`);
  };
  const heard = new Set(prev.shots.map((k) => `${k.owner}@${k.at}`));
  for (const k of next.shots) {
    if (heard.has(`${k.owner}@${k.at}`)) continue;
    if (k.owner.startsWith('turret:')) {
      cues.add('shot-turret');
      continue;
    }
    const d = next.defenders.find((x) => x.id === k.owner);
    if (d) gun(firedWith(before.get(d.id), d));
  }
  for (const d of next.defenders) {
    const b = before.get(d.id);
    for (const s of SLOTS) {
      const held = d.loadout[s];
      const had = b?.loadout[s];
      // The same gun as before: a swap to one with a smaller magazine is no shot.
      if (b && held && had && baseOf(held) === baseOf(had) && d.ammo[s] < b.ammo[s]) {
        gun(baseOf(held));
      }
    }
  }
  if (next.turrets.some((t, i) => t.nextShotAt > (prev.turrets[i]?.nextShotAt ?? Infinity))) {
    cues.add('shot-turret');
  }

  // A reload starting: an empty gun's reload end moved later.
  for (const d of next.defenders) {
    const b = before.get(d.id);
    if (b && SLOTS.some((s) => d.reloadedAt[s] > b.reloadedAt[s])) cues.add('reload');
  }

  // Hits on enemies: a bullet ending on one, or a blade or tool strike. Not any HP lost:
  // fire and traps drain HP every step, which would thud non-stop. An impact stays listed
  // 0.25 s, so a long frame can miss a few, but a fight with hits keeps one in view.
  const impacts = new Set(prev.impacts.map((i) => `${i.x},${i.y}@${i.at}`));
  if (next.impacts.some((i) => i.hit && !impacts.has(`${i.x},${i.y}@${i.at}`))) {
    cues.add('enemy-hit');
  }
  const strikes = new Set(prev.strikes.map((k) => `${k.owner}@${k.at}`));
  if (next.strikes.some((k) => !strikes.has(`${k.owner}@${k.at}`))) cues.add('enemy-hit');

  // An enemy gone: killed (a Swollen bursting goes the same way).
  const alive = new Set(next.enemies.map((e) => e.id));
  if (prev.enemies.some((e) => !alive.has(e.id))) cues.add('enemy-die');

  // The wall: a blow's hit mark (at most one per segment per `HIT_MARK_GAP`), or a break.
  prev.layers.forEach((layer, li) => {
    layer.segments.forEach((seg, si) => {
      const now = next.layers[li]?.segments[si];
      if (!now) return;
      if (seg.hp > 0 && now.hp <= 0) cues.add('wall-break');
      else if (now.hitAt !== undefined && now.hitAt !== seg.hitAt) cues.add('wall-hit');
    });
  });

  // Cards: a level-up brings its offer; a reroll (even to the same cards) is a new offer;
  // a pick shuts it.
  const rerolled = next.rerolls !== prev.rerolls || next.rerolledWave !== prev.rerolledWave;
  if (next.level > prev.level) cues.add('level-up');
  else if (next.offer !== null && (rerolled || offerKey(next) !== offerKey(prev))) {
    cues.add('card-offer');
  }
  if (prev.offer !== null && next.offer === null) cues.add('card-pick');

  if (prev.outcome === 'fighting' && next.outcome !== 'fighting') {
    cues.add(next.outcome === 'won' ? 'won' : 'lost');
  }
  return [...cues];
}
