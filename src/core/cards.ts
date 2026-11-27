import {
  BAN,
  CARD,
  CARD_MAX_LEVEL,
  MODE_CARDS,
  PERK,
  RARITY,
  RECRUIT_CHANCE,
  REROLL,
  RESEARCH_CARDS,
  TECH,
  TECH_FX,
  WALL,
  type BossSkill,
  type CardRarity,
  type ModeCard,
  type ResearchCard,
  type TechBranch,
  type TechId,
} from './data.ts';
import {
  ammoBoost,
  cardLevel,
  perkFactor,
  perkScale,
  rebuildWire,
  squadCanCrit,
  standing,
  took,
  wallFront,
  type Card,
  type HordeState,
  type Layer,
  type Post,
  type UpgradeId,
} from './horde.ts';
import type { Refusal } from './refusal.ts';
import { chance, pick, rngFrom, type Rng } from './rng.ts';

import { xpToNext } from './waves.ts';

// Float noise (scale × wave, HP sums) must not lose a whole reroll or invent a repair.
const EPS = 1e-9;

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

/**
 * Design §8: the upgrade cards. `levels` is how often a card can be picked in a horde:
 * 3 for a levelled card (levels 1, 2 and max, ID-097), 1 for a unique (epic) or once-only
 * card, and null for a repeatable, uncapped one. Names and texts are the UI's
 * (ui/text/cards.ts, ID-269).
 */
export const UPGRADES: Readonly<
  Record<
    UpgradeId,
    {
      readonly category: CardCategory;
      readonly rarity: CardRarity;
      readonly levels: number | null;
    }
  >
> = {
  sharpshooter: {
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'rapid-fire': {
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'long-sight': {
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'patch-up': {
    category: 'barrier',
    rarity: 'common',
    levels: null,
  },
  reinforce: {
    category: 'barrier',
    rarity: 'common',
    levels: null,
  },
  'piercing-rounds': {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  ricochet: {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'speed-loaders': {
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  'extended-mags': {
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'incendiary-rounds': {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'shock-rounds': {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'concussion-rounds': {
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  'frag-grenades': {
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  // Active skills until ID-139: now thrown by the squad, from the throwable slot.
  flashbang: {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  molotov: {
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'barbed-wire': {
    category: 'barrier',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'aim-for-the-head': {
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  // Not `hollow-points`: that id is Heavy Rounds (ID-103 renamed it), kept for saves.
  'hollow-point-rounds': {
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'kevlar-vests': {
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  'first-aid-kits': {
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  sandbags: {
    category: 'barrier',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'scavenged-ammo': {
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'oil-bomb': {
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  recharge: {
    category: 'power',
    rarity: 'common',
    levels: null,
  },
  'power-surge': {
    category: 'power',
    rarity: 'rare',
    levels: null,
  },
  // Research cards (ID-035): only in the pool once researched.
  'hollow-points': {
    category: 'stat',
    rarity: 'epic',
    levels: 1,
  },
  'field-repairs': {
    category: 'barrier',
    rarity: 'epic',
    levels: 1,
  },
  // The mode cards (ID-222): unlocked by a mode's boss hordes, offered only in a higher mode;
  // Suppressing Fire, Cauterise, Momentum and Adrenaline in every fight (ID-235, ID-245), the
  // others only in a fight whose bosses have what they answer (`eligible`).
  'suppressing-fire': {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  cauterise: {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  momentum: {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'gas-masks': {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'breaching-rounds': {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'adrenaline-rush': {
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
};

/** The squad's one ammo slot (ID-097): it holds at most one of these. */
export const AMMO_CARDS: readonly UpgradeId[] = ['incendiary-rounds', 'shock-rounds'];
/** The squad's one throwable slot (ID-139): it holds at most one of these. */
export const THROWABLE_CARDS: readonly UpgradeId[] = ['frag-grenades', 'flashbang', 'molotov'];
const SLOTS = [AMMO_CARDS, THROWABLE_CARDS] as const;

/** The other card of `id`'s slot held while `id` isn't (picking `id` would replace it), or null. */
export function replaces(state: Pick<HordeState, 'taken'>, id: UpgradeId): UpgradeId | null {
  const slot = SLOTS.find((cards) => cards.includes(id));
  if (!slot || took(state, id)) return null;
  return slot.find((other) => other !== id && took(state, other)) ?? null;
}

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Whether `id` is one of the cards the difficulty modes unlock (ID-222). */
export const isModeCard = (id: UpgradeId): id is ModeCard =>
  (MODE_CARDS as readonly string[]).includes(id);

/** Whether a boss of the fight (known at its start) satisfies `has` (ID-222). */
const bossesHave = (
  s: Pick<HordeState, 'bosses'>,
  has: (b: HordeState['bosses'][number]) => boolean,
): boolean => s.bosses.some(has);

/**
 * Whether the fight has what mode card `id` answers (ID-222), read off its bosses: Suppressing
 * Fire, Cauterise, Momentum and Adrenaline always (ID-235, ID-245: each works in every fight
 * of its mode); Gas Masks Poison pool; Breaching Rounds Shield or Armour plates. The others
 * are offered only then, so they never crowd the offers (ID-131).
 */
const modeCardRelevant = (s: Pick<HordeState, 'bosses'>, id: ModeCard): boolean => {
  const has = (...skills: BossSkill[]) =>
    bossesHave(s, (b) => b.skills.some((k) => skills.includes(k)));
  switch (id) {
    case 'suppressing-fire':
    case 'cauterise':
    case 'momentum':
    case 'adrenaline-rush':
      return true;
    case 'gas-masks':
      return has('poison');
    case 'breaching-rounds':
      return has('shield', 'plates');
  }
};
export const OFFER_SIZE = 3;
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

/**
 * Whether `id` may show in an offer now: not banned this horde (ID-210); in the fight's
 * card pool, if it has one; a card
 * with levels not yet at its max (ID-097); Patch Up only while some built segment is below
 * its max HP; Hollow Points only while the squad can crit (ID-130); Kevlar Vests and
 * First Aid Kits only once the line is in trouble (`survivorHurt`, ID-131); power only with
 * a turret; a research card only once researched.
 */
export function eligible(state: HordeState, id: UpgradeId): boolean {
  const u = UPGRADES[id];
  if (state.banned.includes(id)) return false;
  if (state.cardPool && !state.cardPool.includes(id)) return false;
  // A mode card (ID-222) comes only through a fight's card pool (never the full game's),
  // and only when the fight has what it answers.
  if (isModeCard(id) && (!state.cardPool || !modeCardRelevant(state, id))) return false;
  if (u.levels !== null && cardLevel(state, id) >= u.levels) return false;
  if (isResearchCard(id) && !state.research.includes(id)) return false;
  if (id === 'patch-up' && patchUpGain(state).segments === 0) return false;
  // Hollow Points does nothing for a squad that never crits (ID-130).
  if (id === 'hollow-point-rounds' && !squadCanCrit(state)) return false;
  // Survivors are hit only once enemies reach them (ID-131): until then these do nothing,
  // and as commons they would crowd the offers the squad needs.
  if ((id === 'kevlar-vests' || id === 'first-aid-kits') && !survivorHurt(state)) return false;
  // Sandbags guard the outer wall, and Oil Bomb holds enemies off it (ID-132): offered once
  // enemies have reached it; before, they would crowd the offers the squad needs.
  if ((id === 'sandbags' || id === 'oil-bomb') && !outerWallHit(state)) return false;
  // Flashbang and Molotov work on groups (ID-139): offered while one stands on the field.
  if ((id === 'flashbang' || id === 'molotov') && !crowded(state)) return false;
  return u.category !== 'power' || state.turrets.length > 0;
}

/**
 * Whether the line is in trouble this fight (ID-131): a survivor on it below half their max
 * HP, or one injured. Any scratch was tried first; it offered the cards so often that the
 * horde-only build fell under its Horde 9 target.
 */
export const survivorHurt = (s: Pick<HordeState, 'defenders' | 'injured'>): boolean =>
  s.injured.length > 0 || s.defenders.some((d) => d.hp < d.maxHp / 2);

/**
 * Whether a group stands on the field (ID-139): at least `CARD.crowd` enemies outside the
 * camp, for a thrown Flashbang or Molotov to land in.
 */
export const crowded = (s: Pick<HordeState, 'enemies'>): boolean =>
  s.enemies.filter((e) => e.hp > 0 && !e.inCamp).length >= CARD.crowd;

/**
 * Whether enemies have reached the outer wall this fight (ID-132): a built segment of the
 * outermost built layer below its max HP, or broken. Until then Sandbags does nothing.
 */
export const outerWallHit = (s: Pick<HordeState, 'layers'>): boolean =>
  s.layers.some(
    (l) =>
      l.x + WALL.depth >= wallFront(s) - EPS &&
      l.segments.some((g) => g.kind !== null && g.hp < g.maxHp - EPS),
  );

/**
 * What a Patch Up would restore now (ID-097): the HP it adds across the built segments
 * below their max HP (a broken one included), and how many segments that is.
 */
export function patchUpGain(state: Pick<HordeState, 'layers'>): { hp: number; segments: number } {
  let hp = 0;
  let segments = 0;
  for (const seg of state.layers.flatMap((l) => l.segments)) {
    const gain = Math.min(seg.maxHp, seg.hp + CARD.patchUp * seg.maxHp) - seg.hp;
    if (seg.maxHp <= 0 || gain <= EPS) continue;
    hp += gain;
    segments += 1;
  }
  return { hp, segments };
}

export const isResearchCard = (id: UpgradeId): id is ResearchCard =>
  (RESEARCH_CARDS as readonly string[]).includes(id);

/** A synergy a card turns on with another held card (ID-132, ID-181); the UI words it. */
export type Synergy =
  | 'ricochet-pierce'
  | 'pierce-ricochet'
  | 'oil-both'
  | 'oil-incendiary'
  | 'incendiary-oil'
  | 'oil-molotov'
  | 'molotov-oil';

/** The synergy taking `id` would turn on (or has on); null if none. */
export function synergyOf(state: HordeState, id: UpgradeId): Synergy | null {
  if (id === 'ricochet' && state.taken.includes('piercing-rounds')) return 'ricochet-pierce';
  if (id === 'piercing-rounds' && state.taken.includes('ricochet')) return 'pierce-ricochet';
  // Both of Oil Bomb's pairings held (ID-181): one line names both.
  if (
    id === 'oil-bomb' &&
    state.taken.includes('incendiary-rounds') &&
    state.taken.includes('molotov')
  )
    return 'oil-both';
  // Oil Bomb + Incendiary Rounds (ID-132): its text names the pairing; the line says it is on.
  if (id === 'oil-bomb' && state.taken.includes('incendiary-rounds')) return 'oil-incendiary';
  if (id === 'incendiary-rounds' && state.taken.includes('oil-bomb')) return 'incendiary-oil';
  // Oil Bomb + Molotov (ID-181): a fire overlapping the slick lights it.
  if (id === 'oil-bomb' && state.taken.includes('molotov')) return 'oil-molotov';
  if (id === 'molotov' && state.taken.includes('oil-bomb')) return 'molotov-oil';
  return null;
}

/** Heavy Rounds' damage factor, with Hand-loads' share of it added (ID-263). */
const heavyDamage = (s: Pick<HordeState, 'tech'>): number =>
  ammoBoost(s) === 1 ? CARD.heavyRounds.damage : 1 + (CARD.heavyRounds.damage - 1) * ammoBoost(s);

/**
 * The cards the Ammo branch strengthens (ID-263). Wider than `AMMO_CARDS`, the exclusive ammo
 * slot (Incendiary and Shock only): it adds Heavy Rounds, Piercing Rounds and Scavenged Ammo.
 */
export const TECH_AMMO_CARDS: readonly UpgradeId[] = TECH_FX.ammoCards;
/** The cards each branch's researched nodes raise the offer weight of (ID-263); the wall has none. */
export const TECH_CARDS: Readonly<Record<TechBranch, readonly UpgradeId[]>> = {
  wall: [],
  wire: ['barbed-wire'],
  ammo: TECH_AMMO_CARDS,
  mortars: ['oil-bomb'],
};

/**
 * Each card of `pool`'s offer weight (ID-263), in `pool` order: 1, plus `TECH_FX.weight.perNode`
 * for every researched node in a branch that lists it. All the extra weight together is capped
 * at `TECH_FX.weight.cap` of the pool's size (every extra scaled down alike), so a small pool
 * is not taken over. All 1s with nothing researched.
 */
export function offerWeights(pool: readonly UpgradeId[], tech: readonly TechId[]): number[] {
  const { perNode, cap } = TECH_FX.weight;
  const extra = pool.map(
    (id) =>
      perNode *
      tech.filter((t) => (TECH_CARDS[TECH[t].branch] as readonly UpgradeId[]).includes(id)).length,
  );
  const sum = extra.reduce((a, b) => a + b, 0);
  const limit = cap * pool.length;
  const scale = sum > limit ? limit / sum : 1;
  return extra.map((x) => 1 + x * scale);
}

/**
 * A rarity rolled from this wave's odds, then the next one down, then up, until one has a card.
 * `weights` (from `offerWeights` over the whole pool, ID-263) tilts the pick inside the rarity;
 * with every weight there 1 it is the plain `pick`, the same single draw.
 */
function rollUpgrade(
  rng: Rng,
  pool: readonly UpgradeId[],
  wave: number,
  weights?: ReadonlyMap<UpgradeId, number>,
): UpgradeId {
  const odds = rarityOdds(wave);
  const total = odds.common + odds.rare + odds.epic;
  let roll = rng() * total;
  let at = RARITIES.findIndex((r) => (roll -= odds[r]) < 0);
  if (at < 0) at = RARITIES.length - 1;
  const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)];
  for (const r of order) {
    const ids = pool.filter((id) => UPGRADES[id].rarity === r);
    if (ids.length === 0) continue;
    const w = ids.map((id) => weights?.get(id) ?? 1);
    if (w.every((x) => x === 1)) return pick(rng, ids);
    let left = rng() * w.reduce((a, b) => a + b, 0);
    const chosen = w.findIndex((x) => (left -= x) < 0);
    return ids[chosen < 0 ? ids.length - 1 : chosen]!;
  }
  throw new RangeError('rollUpgrade: no card left');
}

/**
 * One more card for an offer already showing `shown`: a recruit from the bench while a
 * post is free and none shows yet (Rally Call, design §5 multiplies the chance), else a
 * distinct upgrade by rarity; null when no card is left to offer (a banned or small pool).
 */
function rollCard(rng: Rng, state: HordeState, shown: readonly Card[]): Card | null {
  const recruits = recruitPost(state) === undefined ? [] : state.bench;
  const p =
    (state.defenders.length < RECRUIT_CHANCE.largeFrom
      ? RECRUIT_CHANCE.small
      : RECRUIT_CHANCE.large) * perkFactor(state, 'rally-call', PERK.rally);
  if (recruits.length > 0 && !shown.some((c) => c.kind === 'recruit') && chance(rng, p)) {
    return { kind: 'recruit', defender: { ...pick(rng, recruits) } };
  }
  const showing = new Set(shown.flatMap((c) => (c.kind === 'upgrade' ? [c.id] : [])));
  const left = UPGRADE_IDS.filter((id) => !showing.has(id) && eligible(state, id));
  // Five repeatable cards are always eligible, so 3 slots run dry only when bans or a
  // small card pool take them (ID-210).
  if (left.length === 0) return null;
  const tech = state.tech ?? [];
  const w = tech.length === 0 ? [] : offerWeights(left, tech);
  const weights = tech.length === 0 ? undefined : new Map(left.map((id, i) => [id, w[i]!]));
  return { kind: 'upgrade', id: rollUpgrade(rng, left, state.wave, weights) };
}

/**
 * Three cards: distinct upgrades by rarity, and at most one recruit from the bench while
 * a post is free; fewer when bans or the card pool leave too few (ID-210).
 */
export function rollOffer(rng: Rng, state: HordeState): Card[] {
  const cards: Card[] = [];
  while (cards.length < OFFER_SIZE) {
    const card = rollCard(rng, state, cards);
    if (!card) break;
    cards.push(card);
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

/**
 * Rerolls Second Look has given this horde up to the current wave (design §5, ID-210):
 * they add to the horde's `REROLL.perHorde` and are spent from the same count.
 */
export const secondLookRerolls = (
  state: Pick<HordeState, 'perks' | 'perkLevels' | 'wave'>,
): number => Math.floor(perkScale(state, 'second-look') * state.wave + EPS);

/** Rerolls left this horde: 3, plus a skip's and Second Look's, less those used (ID-210). */
export const rerollsLeft = (state: HordeState): number =>
  Math.max(
    0,
    REROLL.perHorde + REROLL.perSkip * state.skips + secondLookRerolls(state) - state.rerolls,
  );

/** Bans left this horde (ID-210). */
export const bansLeft = (state: Pick<HordeState, 'bans'>): number =>
  Math.max(0, BAN.perHorde - state.bans);

/** Why the open offer can't be rerolled, or null when it can. */
export function rerollLock(state: HordeState): Refusal | null {
  if (state.offer === null) return { ok: false, code: 'no-offer-reroll' };
  if (rerollsLeft(state) === 0) return { ok: false, code: 'no-rerolls' };
  return null;
}

/** Rolls the open offer again (seeded, ID-210); returns a new state. */
export function rerollOffer(state: HordeState): HordeState {
  const lock = rerollLock(state);
  if (lock) throw new RangeError(`rerollOffer: ${lock.code}`);
  const s = structuredClone(state);
  s.offer = rollOffer(rngFrom(s.rng), s);
  s.rerolls += 1;
  return s;
}

/**
 * Takes no card, closes the open offer and gives a reroll back (ID-210); free, any number
 * of times. Banked XP opens the next offer, as after a pick. Returns a new state.
 */
export function skipOffer(state: HordeState): HordeState {
  if (state.offer === null) throw new RangeError('skipOffer: no offer to skip');
  const s = structuredClone(state);
  s.offer = null;
  s.skips += 1;
  levelUp(s, rngFrom(s.rng));
  return s;
}

/** Why card `index` of the open offer can't be banned, or null when it can. */
export function banLock(state: HordeState, index: number): Refusal | null {
  if (state.offer === null) return { ok: false, code: 'no-offer-ban' };
  if (bansLeft(state) === 0) return { ok: false, code: 'no-bans' };
  const card = state.offer[index];
  if (!Number.isInteger(index) || !card) return { ok: false, code: 'no-card' };
  if (card.kind === 'recruit') return { ok: false, code: 'ban-survivor' };
  return null;
}

/**
 * Bans card `index` of the open offer for the rest of the horde (ID-210): it leaves the
 * offer and every later one, and a new card (seeded) takes its slot while the pick stays
 * open. With no card left to fill it, the offer is one shorter. Returns a new state.
 */
export function banCard(state: HordeState, index: number): HordeState {
  const lock = banLock(state, index);
  if (lock) throw new RangeError(`banCard: ${lock.code}`);
  const s = structuredClone(state);
  const offer = s.offer!;
  const [gone] = offer.splice(index, 1);
  if (gone?.kind === 'upgrade') s.banned.push(gone.id);
  s.bans += 1;
  const card = rollCard(rngFrom(s.rng), s, offer);
  if (card) offer.splice(index, 0, card);
  return s;
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

/** How often repeatable card `id` was picked this horde (ID-097). */
const stack = (s: Pick<HordeState, 'cardLevels'>, id: UpgradeId): number => s.cardLevels[id] ?? 0;

function applyUpgrade(s: HordeState, id: UpgradeId): void {
  const segments = s.layers.flatMap((l) => l.segments);
  // The one ammo slot (ID-097), and the throwable slot (ID-139): the other card of the
  // slot and its levels are gone. What it already threw lands as it was.
  const other = replaces(s, id);
  if (other) {
    s.taken = s.taken.filter((t) => t !== other);
    delete s.cardLevels[other];
  }
  // The throwable slot's first card throws at once; a swap or a level waits out its timer.
  if (THROWABLE_CARDS.includes(id)) s.nextThrowAt ??= s.time;
  if (!s.taken.includes(id)) s.taken.push(id);
  s.cardLevels[id] = stack(s, id) + 1;
  // Field Repairs glows when it is used (ID-231), not when it is picked.
  if (UPGRADES[id].category === 'barrier' && id !== 'field-repairs') s.barrierAt = s.time;
  // A repair card marks only the segments it actually heals (ID-075).
  const repair = (heal: (seg: (typeof segments)[number]) => number): void => {
    for (const seg of segments) {
      const hp = heal(seg);
      if (hp > seg.hp) seg.repairAt = s.time;
      seg.hp = hp;
    }
  };
  // The repeatable steps add up, then multiply once with the rest (ID-097).
  switch (id) {
    case 'sharpshooter':
    case 'hollow-points':
      s.mods.damage =
        (1 + CARD.step.damage * stack(s, 'sharpshooter')) *
        (took(s, 'hollow-points') ? heavyDamage(s) : 1);
      break;
    case 'rapid-fire':
      s.mods.fireRate = 1 + CARD.step.fireRate * stack(s, 'rapid-fire');
      break;
    case 'long-sight':
      s.mods.range = 1 + CARD.step.range * stack(s, 'long-sight');
      break;
    case 'patch-up':
      repair((seg) => Math.min(seg.maxHp, seg.hp + CARD.patchUp * seg.maxHp));
      break;
    case 'reinforce': {
      // Each pick adds a step of the max HP the segment started the horde with.
      const before = 1 + CARD.step.reinforce * (stack(s, 'reinforce') - 1);
      for (const seg of segments) {
        const gain = (seg.maxHp / before) * CARD.step.reinforce;
        seg.maxHp += gain;
        seg.hp += gain;
      }
      break;
    }
    case 'recharge':
      s.energy = Math.min(s.bankCap, s.energy + CARD.recharge * s.bankCap);
      break;
    case 'field-repairs':
      // A skill (ID-231): the pick only gives the button; `useRepairs` heals and costs.
      break;
    case 'power-surge':
      s.freeWave = s.wave;
      break;
    case 'oil-bomb':
      // The first tar bomb goes as soon as it is picked, as Frag Grenades' first throw.
      s.nextTarAt = s.time;
      break;
    case 'barbed-wire':
      // Every pick rebuilds every row, broken or worn, at the new level's full (ID-123, ID-133).
      rebuildWire(s);
      break;
    // The rest act in the fight while taken.
  }
}
