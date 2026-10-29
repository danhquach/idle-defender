import { RECRUIT_CHANCE } from './data.ts';
import {
  standing,
  type Card,
  type HordeState,
  type Layer,
  type Post,
  type UpgradeId,
} from './horde.ts';
import { chance, pick, rngFrom, type Rng } from './rng.ts';
import { xpToNext } from './waves.ts';

/** A wall-walk post over a broken or unbuilt segment can't be stood on. */
export function postUsable(layers: readonly Layer[], post: Post): boolean {
  if (post.kind !== 'wall-walk') return true;
  const seg = layers.find((l) => l.column === post.column)?.segments[post.row];
  return seg !== undefined && seg.hp > 0;
}

/** Where a recruit goes: the free usable post furthest forward (ties → lowest id). */
export function recruitPost(state: HordeState): Post | undefined {
  let best: Post | undefined;
  for (const p of state.posts) {
    if (p.defenderId !== null || !postUsable(state.layers, p)) continue;
    if (!best || p.x > best.x) best = p;
  }
  return best;
}

export const UPGRADES: Readonly<
  Record<UpgradeId, { readonly name: string; readonly text: string }>
> = {
  sharpshooter: { name: 'Sharpshooter', text: '+20% damage' },
  'rapid-fire': { name: 'Rapid Fire', text: '+15% fire rate' },
  'long-sight': { name: 'Long Sight', text: '+15% range' },
  'patch-up': { name: 'Patch Up', text: 'Repair every wall segment by 30% of its max HP' },
  reinforce: { name: 'Reinforce', text: '+25% wall max HP' },
};

const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
const OFFER_SIZE = 3;

/** Three cards: distinct upgrades, and at most one recruit when a post is free and the bench has someone. */
export function rollOffer(rng: Rng, state: HordeState): Card[] {
  const canRecruit = state.bench.length > 0 && recruitPost(state) !== undefined;
  const p =
    state.defenders.length < RECRUIT_CHANCE.largeFrom ? RECRUIT_CHANCE.small : RECRUIT_CHANCE.large;
  const cards: Card[] = [];
  let recruited = false;
  while (cards.length < OFFER_SIZE) {
    if (canRecruit && !recruited && chance(rng, p)) {
      cards.push({ kind: 'recruit', defender: { ...pick(rng, state.bench) } });
      recruited = true;
      continue;
    }
    const taken = new Set(cards.flatMap((c) => (c.kind === 'upgrade' ? [c.id] : [])));
    cards.push({
      kind: 'upgrade',
      id: pick(
        rng,
        UPGRADE_IDS.filter((id) => !taken.has(id)),
      ),
    });
  }
  return cards;
}

/** Opens an offer when enough XP is banked and none is open. Mutates `s`. */
export function levelUp(s: HordeState, rng: Rng): void {
  if (s.offer !== null || s.xp < xpToNext(s.level)) return;
  s.xp -= xpToNext(s.level);
  s.level += 1;
  s.offer = rollOffer(rng, s);
}

/** Applies card `index` of the open offer; returns a new state. */
export function chooseCard(state: HordeState, index: number): HordeState {
  const card = state.offer?.[index];
  if (!Number.isInteger(index) || !card) throw new RangeError(`chooseCard: no card ${index}`);
  const s = structuredClone(state);
  if (card.kind === 'recruit') {
    const post = recruitPost(s);
    const benchIndex = s.bench.findIndex((d) => d.id === card.defender.id);
    if (!post || benchIndex < 0) throw new RangeError('chooseCard: recruit has nowhere to go');
    const [spec] = s.bench.splice(benchIndex, 1);
    s.defenders.push(standing(spec!, post, s.time));
    post.defenderId = spec!.id;
  } else {
    applyUpgrade(s, card.id);
  }
  s.offer = null;
  levelUp(s, rngFrom(s.rng));
  return s;
}

function applyUpgrade(s: HordeState, id: UpgradeId): void {
  const segments = s.layers.flatMap((l) => l.segments);
  switch (id) {
    case 'sharpshooter':
      s.mods.damage *= 1.2;
      break;
    case 'rapid-fire':
      s.mods.fireRate *= 1.15;
      break;
    case 'long-sight':
      s.mods.range *= 1.15;
      break;
    case 'patch-up':
      for (const seg of segments) seg.hp = Math.min(seg.maxHp, seg.hp + 0.3 * seg.maxHp);
      break;
    case 'reinforce':
      for (const seg of segments) {
        const gain = seg.maxHp * 0.25;
        seg.maxHp += gain;
        seg.hp += gain;
      }
      break;
  }
}
