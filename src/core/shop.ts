// The horde cash shop (design §4, as built ID-018): kills drop cash, spent mid-fight on
// timed buffs and repairs. Pure: `buy` returns a new state, or a refusal the UI shows
// as-is. Cash lives only in the fight state, so it is gone when the horde ends.
import { BUFF_IDS, MAX_CONDITION, SHOP, type BuffId, type ShopItem } from './data.ts';
import { buffOn, type HordeState, type MoveResult, type Segment, type Turret } from './horde.ts';

export const isBuff = (item: ShopItem): item is BuffId =>
  (BUFF_IDS as readonly string[]).includes(item);

/** Why `item` can't be bought now, or null when it can. */
export function shopLock(s: HordeState, item: ShopItem): string | null {
  if (!Object.hasOwn(SHOP, item)) throw new RangeError(`shop: unknown item ${String(item)}`);
  if (s.outcome !== 'fighting') return 'The horde is over';
  if (s.offer !== null || s.replace !== null) return 'Pick first';
  if (isBuff(item) && buffOn(s, item)) return 'Already active';
  if (item === 'patch' && !patchTarget(s)) return 'No wall to patch';
  if (item === 'fix' && !fixTarget(s)) return 'No turret to fix';
  if (s.cash < SHOP[item].cost) return 'Not enough cash';
  return null;
}

/** Spends cash on `item`: starts a buff, patches a wall segment or fixes a turret. */
export function buy(state: HordeState, item: ShopItem): MoveResult {
  const lock = shopLock(state, item);
  if (lock) return { ok: false, reason: lock };
  const s = structuredClone(state);
  s.cash -= SHOP[item].cost;
  if (isBuff(item)) s.buffs[item] = s.time + SHOP[item].seconds;
  if (item === 'patch') {
    const seg = patchTarget(s)!;
    seg.hp = Math.min(seg.maxHp, seg.hp + SHOP.patch.hp);
  }
  if (item === 'fix') {
    const t = fixTarget(s)!;
    t.condition = Math.min(MAX_CONDITION, t.condition + SHOP.fix.condition);
  }
  return { ok: true, state: s };
}

/** Fight seconds left on buff `id`; 0 when it isn't running. */
export function buffLeft(s: HordeState, id: BuffId): number {
  return buffOn(s, id) ? s.buffs[id] - s.time : 0;
}

/** The damaged standing segment with the lowest HP share (ties → outer layer, then lower row). */
function patchTarget(s: HordeState): Segment | undefined {
  let worst: { seg: Segment; x: number } | undefined;
  for (const l of s.layers) {
    for (const seg of l.segments) {
      if (seg.hp <= 0 || seg.hp >= seg.maxHp) continue;
      const share = seg.hp / seg.maxHp;
      const was = worst && worst.seg.hp / worst.seg.maxHp;
      if (
        !worst ||
        share < was! ||
        (share === was && (l.x > worst.x || (l.x === worst.x && seg.index < worst.seg.index)))
      ) {
        worst = { seg, x: l.x };
      }
    }
  }
  return worst?.seg;
}

/** The most worn turret below full condition, jammed ones first (ties → lower id). */
function fixTarget(s: HordeState): Turret | undefined {
  let worst: Turret | undefined;
  for (const t of s.turrets) {
    if (t.condition >= MAX_CONDITION) continue;
    if (!worst || t.condition < worst.condition) worst = t;
  }
  return worst;
}
