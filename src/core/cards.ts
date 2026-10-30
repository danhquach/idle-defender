import { BANK_CAP, CARD, RARITY, RECRUIT_CHANCE, TITLES, type CardRarity } from './data.ts';
import { professionOf } from './loadout.ts';
import { titleIn } from './stats.ts';
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

/**
 * Where a recruit goes: the free usable post furthest forward (ties → lowest id); every
 * defender carries a gun, so any post works. Undefined when there is none.
 */
export function recruitPost(state: HordeState): Post | undefined {
  let best: Post | undefined;
  for (const p of state.posts) {
    if (p.defenderId !== null || !postUsable(state.layers, p)) continue;
    if (!best || p.x > best.x) best = p;
  }
  return best;
}

export type CardCategory = 'stat' | 'behaviour' | 'barrier' | 'power';

/** Design §8: the upgrade cards. A `once` card leaves the pool for the horde once taken. */
export const UPGRADES: Readonly<
  Record<
    UpgradeId,
    {
      readonly name: string;
      readonly text: string;
      readonly category: CardCategory;
      readonly rarity: CardRarity;
      readonly once: boolean;
    }
  >
> = {
  sharpshooter: {
    name: 'Sharpshooter',
    text: '+20% damage',
    category: 'stat',
    rarity: 'common',
    once: false,
  },
  'rapid-fire': {
    name: 'Rapid Fire',
    text: '+15% fire rate',
    category: 'stat',
    rarity: 'common',
    once: false,
  },
  'long-sight': {
    name: 'Long Sight',
    text: '+15% range',
    category: 'stat',
    rarity: 'common',
    once: false,
  },
  'patch-up': {
    name: 'Patch Up',
    text: 'Repair every wall segment by 30% of its max HP',
    category: 'barrier',
    rarity: 'common',
    once: false,
  },
  reinforce: {
    name: 'Reinforce',
    text: '+25% wall max HP',
    category: 'barrier',
    rarity: 'common',
    once: false,
  },
  'piercing-rounds': {
    name: 'Piercing Rounds',
    text: 'Squad bullets go through 1 more enemy',
    category: 'behaviour',
    rarity: 'rare',
    once: true,
  },
  ricochet: {
    name: 'Ricochet',
    text: 'A bullet’s first hit bounces to the nearest other enemy at a quarter damage',
    category: 'behaviour',
    rarity: 'rare',
    once: true,
  },
  'split-shot': {
    name: 'Split Shot',
    text: 'Each shot also fires 2 bullets in a fan at half damage',
    category: 'behaviour',
    rarity: 'epic',
    once: true,
  },
  'burning-rounds': {
    name: 'Burning Rounds',
    text: 'Bullets set the enemy they hit on fire for 3 s',
    category: 'behaviour',
    rarity: 'rare',
    once: true,
  },
  'explode-on-kill': {
    name: 'Explode on Kill',
    text: 'A bullet kill bursts, hurting enemies close by',
    category: 'behaviour',
    rarity: 'rare',
    once: true,
  },
  'chain-lightning': {
    name: 'Chain Lightning',
    text: 'Bullet hits sometimes arc to 2 enemies close by at half damage',
    category: 'behaviour',
    rarity: 'epic',
    once: true,
  },
  cleave: {
    name: 'Cleave',
    text: 'Blade and tool hits cleave 20% more to enemies close by',
    category: 'behaviour',
    rarity: 'common',
    once: true,
  },
  'spiked-walls': {
    name: 'Spiked Walls',
    text: 'Enemies hitting a wall take 3 damage each blow',
    category: 'barrier',
    rarity: 'rare',
    once: true,
  },
  'slow-field': {
    name: 'Slow Field',
    text: 'Enemies close to the outer wall move 30% slower',
    category: 'barrier',
    rarity: 'rare',
    once: true,
  },
  recharge: {
    name: 'Recharge',
    text: 'Add 25% of the bank’s cap to the battery bank',
    category: 'power',
    rarity: 'common',
    once: false,
  },
  'power-surge': {
    name: 'Power Surge',
    text: 'Turrets draw no charge until this wave ends',
    category: 'power',
    rarity: 'rare',
    once: false,
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
const OFFER_SIZE = 3;
const RARITIES: readonly CardRarity[] = ['common', 'rare', 'epic'];

/** Percent odds of each rarity per offer slot in wave `wave` (design §8). */
export function rarityOdds(wave: number): Record<CardRarity, number> {
  const w = Math.max(1, wave) - 1;
  const { common, rare, epic } = RARITY;
  return {
    common: Math.max(common.limit, common.start + common.per * w),
    rare: Math.min(rare.limit, rare.start + rare.per * w),
    epic: Math.min(epic.limit, epic.start + epic.per * w),
  };
}

/** Whether `id` may show in an offer now: a `once` card not yet taken; power only with a turret. */
export function eligible(state: HordeState, id: UpgradeId): boolean {
  const u = UPGRADES[id];
  if (u.once && state.taken.includes(id)) return false;
  return u.category !== 'power' || state.turrets.length > 0;
}

/** Whether a Master (or better) Gunner is in the fight (design §8 synergy). */
export function masterGunner(state: Pick<HordeState, 'defenders'>): boolean {
  return state.defenders.some((d) => {
    if (professionOf(d.loadout) !== 'gunner' || !d.stats) return false;
    const t = titleIn(d.stats, 'gunner');
    return t !== null && t.at >= MASTER_AT;
  });
}
const MASTER_AT = TITLES.find((t) => t.rank === 'Master')!.at;

/** The synergy taking `id` would turn on (or has on), as a line for its card; null if none. */
export function synergyOf(state: HordeState, id: UpgradeId): string | null {
  if (id === 'burning-rounds' && masterGunner(state)) return 'Master Gunner: burn spreads';
  if (id === 'ricochet' && state.taken.includes('piercing-rounds'))
    return 'Piercing Rounds: bounces pierce';
  if (id === 'piercing-rounds' && state.taken.includes('ricochet'))
    return 'Ricochet: bounces pierce';
  return null;
}

/** A rarity rolled from this wave's odds, then the next one down, then up, until one has a card. */
function rollUpgrade(rng: Rng, pool: readonly UpgradeId[], wave: number): UpgradeId {
  const odds = rarityOdds(wave);
  const total = odds.common + odds.rare + odds.epic;
  let roll = rng() * total;
  let at = RARITIES.findIndex((r) => (roll -= odds[r]) < 0);
  if (at < 0) at = RARITIES.length - 1;
  const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)];
  for (const r of order) {
    const ids = pool.filter((id) => UPGRADES[id].rarity === r);
    if (ids.length > 0) return pick(rng, ids);
  }
  throw new RangeError('rollUpgrade: no card left');
}

/**
 * Three cards: distinct upgrades by rarity, and at most one recruit from the bench while
 * a post is free.
 */
export function rollOffer(rng: Rng, state: HordeState): Card[] {
  const recruits = recruitPost(state) === undefined ? [] : state.bench;
  const canRecruit = recruits.length > 0;
  const p =
    state.defenders.length < RECRUIT_CHANCE.largeFrom ? RECRUIT_CHANCE.small : RECRUIT_CHANCE.large;
  const pool = UPGRADE_IDS.filter((id) => eligible(state, id));
  const cards: Card[] = [];
  let recruited = false;
  while (cards.length < OFFER_SIZE) {
    if (canRecruit && !recruited && chance(rng, p)) {
      cards.push({ kind: 'recruit', defender: { ...pick(rng, recruits) } });
      recruited = true;
      continue;
    }
    const shown = new Set(cards.flatMap((c) => (c.kind === 'upgrade' ? [c.id] : [])));
    const left = pool.filter((id) => !shown.has(id));
    // Five repeatable cards are always eligible, so 3 slots never run the pool dry.
    cards.push({ kind: 'upgrade', id: rollUpgrade(rng, left, state.wave) });
  }
  return cards;
}

/** Opens an offer when enough XP is banked and no offer or replacement is open. Mutates `s`. */
export function levelUp(s: HordeState, rng: Rng): void {
  if (s.offer !== null || s.replace !== null || s.xp < xpToNext(s.level)) return;
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
    if (!s.tookPart.includes(spec!.id)) s.tookPart.push(spec!.id);
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
  if (!s.taken.includes(id)) s.taken.push(id);
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
    case 'recharge':
      s.energy = Math.min(BANK_CAP, s.energy + CARD.recharge * BANK_CAP);
      break;
    case 'power-surge':
      s.freeWave = s.wave;
      break;
    // The rest act in the fight while taken.
  }
}
