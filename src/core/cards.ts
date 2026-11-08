import {
  CARD,
  CARD_MAX_LEVEL,
  PERK,
  RARITY,
  RECRUIT_CHANCE,
  RESEARCH_CARDS,
  type CardRarity,
  type ResearchCard,
} from './data.ts';
import {
  cardLevel,
  perkFactor,
  perkOn,
  perkScale,
  standing,
  took,
  type Card,
  type HordeState,
  type Layer,
  type Post,
  type UpgradeId,
} from './horde.ts';
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
 * card, and null for a repeatable, uncapped one. `text` is the card's effect in words; a
 * card with an `effect` (below) shows that instead, with its numbers.
 */
export const UPGRADES: Readonly<
  Record<
    UpgradeId,
    {
      readonly name: string;
      readonly text: string;
      readonly category: CardCategory;
      readonly rarity: CardRarity;
      readonly levels: number | null;
    }
  >
> = {
  sharpshooter: {
    name: 'Sharpshooter',
    text: 'More damage',
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'rapid-fire': {
    name: 'Rapid Fire',
    text: 'Faster fire',
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'long-sight': {
    name: 'Long Sight',
    text: 'More range',
    category: 'stat',
    rarity: 'common',
    levels: null,
  },
  'patch-up': {
    name: 'Patch Up',
    text: 'Repair every wall segment by 30% of its max HP',
    category: 'barrier',
    rarity: 'common',
    levels: null,
  },
  reinforce: {
    name: 'Reinforce',
    text: 'More wall max HP',
    category: 'barrier',
    rarity: 'common',
    levels: null,
  },
  'piercing-rounds': {
    name: 'Piercing Rounds',
    text: 'Squad bullets go through 1 more enemy',
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  ricochet: {
    name: 'Ricochet',
    text: 'A bullet’s first hit bounces to the nearest other enemy',
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'speed-loaders': {
    name: 'Speed Loaders',
    text: 'Guns reload faster',
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  'extended-mags': {
    name: 'Extended Mags',
    text: 'Gun magazines hold more rounds',
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'incendiary-rounds': {
    name: 'Incendiary Rounds',
    text: 'Bullets set the enemy they hit on fire for 3 s',
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'shock-rounds': {
    name: 'Shock Rounds',
    text: 'Bullet hits briefly paralyse the enemy',
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'concussion-rounds': {
    name: 'Concussion Rounds',
    text: 'Bullet hits knock enemies back, harder the more damage they do, at most twice a second',
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  'frag-grenades': {
    name: 'Frag Grenades',
    text: 'Each survivor throws a grenade every 8 s, into the thickest group',
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  'barbed-wire': {
    name: 'Barbed Wire',
    text: 'Wire strung out in the field slows enemies crossing it',
    category: 'barrier',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  recharge: {
    name: 'Recharge',
    text: 'Add 25% of the bank’s cap to the battery bank',
    category: 'power',
    rarity: 'common',
    levels: null,
  },
  'power-surge': {
    name: 'Power Surge',
    text: 'Turrets draw no charge until this wave ends',
    category: 'power',
    rarity: 'rare',
    levels: null,
  },
  // Research cards (ID-035): only in the pool once researched.
  'hollow-points': {
    name: 'Heavy Rounds',
    text: '+40% damage',
    category: 'stat',
    rarity: 'rare',
    levels: 1,
  },
  'field-repairs': {
    name: 'Field Repairs',
    text: 'Repair every wall segment to full',
    category: 'barrier',
    rarity: 'epic',
    levels: 1,
  },
};

/** The squad's one ammo slot (ID-097): it holds at most one of these. */
export const AMMO_CARDS: readonly UpgradeId[] = ['incendiary-rounds', 'shock-rounds'];

/** The other ammo card held while `id` isn't (picking `id` would replace it), or null. */
export function replaces(state: Pick<HordeState, 'taken'>, id: UpgradeId): UpgradeId | null {
  if (!AMMO_CARDS.includes(id) || took(state, id)) return null;
  return AMMO_CARDS.find((other) => other !== id && took(state, other)) ?? null;
}

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

/**
 * Whether `id` may show in an offer now: in the fight's card pool, if it has one; a card
 * with levels not yet at its max (ID-097); Patch Up only while some built segment is below
 * its max HP; power only with a turret; a research card only once researched.
 */
export function eligible(state: HordeState, id: UpgradeId): boolean {
  const u = UPGRADES[id];
  if (state.cardPool && !state.cardPool.includes(id)) return false;
  if (u.levels !== null && cardLevel(state, id) >= u.levels) return false;
  if (isResearchCard(id) && !state.research.includes(id)) return false;
  if (id === 'patch-up' && patchUpGain(state).segments === 0) return false;
  return u.category !== 'power' || state.turrets.length > 0;
}

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

const isResearchCard = (id: UpgradeId): id is ResearchCard =>
  (RESEARCH_CARDS as readonly string[]).includes(id);

/** The synergy taking `id` would turn on (or has on), as a line for its card; null if none. */
export function synergyOf(state: HordeState, id: UpgradeId): string | null {
  if (id === 'ricochet' && state.taken.includes('piercing-rounds'))
    return 'Piercing Rounds: bounces pierce';
  if (id === 'piercing-rounds' && state.taken.includes('ricochet'))
    return 'Ricochet: bounces pierce';
  return null;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
/** A factor with at most 2 decimals and no trailing zeros: 1.33, 1.67, 2. */
const factor = (x: number): string => String(Number(x.toFixed(2)));

/**
 * A card's effect with its number at level or stack `n` (ID-097): `pre`, the number, then
 * `post`. Null for a card whose words have no number that changes (its `text` stands).
 */
export function effectAt(
  id: UpgradeId,
  n: number,
): { pre: string; value: string; post: string } | null {
  const lv = (levels: readonly number[]): number => levels[Math.min(levels.length, n) - 1]!;
  switch (id) {
    case 'sharpshooter':
      return { pre: '', value: `+${pct(CARD.step.damage * n)}`, post: ' damage' };
    case 'rapid-fire':
      return { pre: '', value: `+${pct(CARD.step.fireRate * n)}`, post: ' fire rate' };
    case 'long-sight':
      return { pre: '', value: `+${pct(CARD.step.range * n)}`, post: ' range' };
    case 'reinforce':
      return { pre: '', value: `+${pct(CARD.step.reinforce * n)}`, post: ' wall max HP' };
    case 'speed-loaders':
      return { pre: 'Reload time ', value: `−${pct(1 - lv(CARD.loaders))}`, post: '' };
    case 'extended-mags':
      return { pre: 'Magazines hold ', value: `×${factor(lv(CARD.mags))}`, post: ' the rounds' };
    case 'piercing-rounds':
      return {
        pre: 'Bullets go through 1 more enemy ',
        value: pct(lv(CARD.pierce)),
        post: ' of the time',
      };
    case 'ricochet':
      return {
        pre: 'A bullet’s first hit bounces to the nearest other enemy at ',
        value: pct(lv(CARD.ricochet.share)),
        post: ' damage',
      };
    case 'incendiary-rounds':
      return {
        pre: 'Hits set enemies on fire: ',
        value: `${lv(CARD.burn.dps)} dmg/s`,
        post: ` for ${CARD.burn.seconds} s`,
      };
    case 'shock-rounds':
      return {
        pre: 'Hits paralyse enemies for ',
        value: `${lv(CARD.shock.seconds)} s`,
        post: ' (half on the big ones)',
      };
    case 'barbed-wire':
      return {
        pre: 'Enemies ',
        value: pct(lv(CARD.wire.slow)),
        post: ' slower in the wire strung across the field',
      };
    default:
      return null;
  }
}

/** What picking a card would give (ID-097), as its offer card spells it out. */
export interface CardPitch {
  /** "New", "Lv 1 → 2", "Lv 2 → Max", "Unique", "×3 → ×4" or "Repeatable". */
  tag: string;
  /** The tag in words, for a screen reader: "Level 1 to 2". */
  tagSpoken: string;
  /** The effect: `pre`, then `from` → `to` (the number that changes), then `post`. */
  effect: { pre: string; from: string | null; to: string; post: string } | null;
  /** The effect in plain words, when `effect` is null. */
  text: string;
  /** Picking it replaces the other ammo card (ID-097): the warning, and what you'd hold before and after. */
  replace?: { warning: string; swap: string };
}

/** A level as shown: "Lv 2", or "Lv Max" at the top. */
const levelName = (n: number, max: number): string => (n >= max ? 'Max' : String(n));

/** What picking upgrade `id` would give now, from what the squad holds (ID-097). */
export function pitch(state: HordeState, id: UpgradeId): CardPitch {
  const u = UPGRADES[id];
  const held = took(state, id) ? cardLevel(state, id) : 0;
  const next = held + 1;
  const at = effectAt(id, next);
  const was = held > 0 ? effectAt(id, held) : null;
  let effect: CardPitch['effect'] = at
    ? { pre: at.pre, from: was ? was.value : null, to: at.value, post: at.post }
    : null;
  let text = u.text;
  if (id === 'patch-up') {
    // What it would restore, the HP in bold like any card's number.
    const { hp, segments } = patchUpGain(state);
    const across = ` across ${segments} segment${segments === 1 ? '' : 's'}`;
    effect = { pre: 'Repairs ', from: null, to: `${Math.round(hp)} HP`, post: across };
    text = `Repairs ${Math.round(hp)} HP${across}`;
  }
  let tag: string;
  let tagSpoken: string;
  if (u.levels === 1) {
    tag = tagSpoken = 'Unique';
  } else if (u.levels === null) {
    if (at === null) tag = tagSpoken = 'Repeatable';
    else if (held === 0) tag = tagSpoken = 'New';
    else {
      tag = `×${held} → ×${next}`;
      tagSpoken = `Stack ${held} to ${next}`;
    }
  } else if (held === 0) {
    tag = tagSpoken = 'New';
  } else {
    const to = levelName(next, u.levels);
    tag = `Lv ${held} → ${to}`;
    tagSpoken = `Level ${held} to ${to === 'Max' ? 'max' : to}`;
  }
  const other = replaces(state, id);
  const out: CardPitch = { tag, tagSpoken, effect, text };
  if (other) {
    const o = UPGRADES[other];
    const lvl = `Lv ${levelName(cardLevel(state, other), o.levels ?? CARD_MAX_LEVEL)}`;
    out.replace = {
      warning: `Replaces ${o.name} ${lvl}. Its levels are lost.`,
      swap: `${o.name} ${lvl} → ${u.name} Lv 1`,
    };
  }
  return out;
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
 * a post is free. Rally Call (design §5) multiplies the recruit chance.
 */
export function rollOffer(rng: Rng, state: HordeState): Card[] {
  const recruits = recruitPost(state) === undefined ? [] : state.bench;
  const canRecruit = recruits.length > 0;
  const p =
    (state.defenders.length < RECRUIT_CHANCE.largeFrom
      ? RECRUIT_CHANCE.small
      : RECRUIT_CHANCE.large) * perkFactor(state, 'rally-call', PERK.rally);
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

/**
 * Rerolls Second Look gives in the current wave (design §5, ID-035): 1 at level 1; a
 * higher level's 1.5 or 2 per wave come as whole rerolls, the half one every other wave.
 */
export function rerollsThisWave(state: Pick<HordeState, 'perks' | 'perkLevels' | 'wave'>): number {
  const scale = perkScale(state, 'second-look');
  return Math.floor(scale * state.wave + EPS) - Math.floor(scale * (state.wave - 1) + EPS);
}

/** Rerolls of the current wave used so far. */
const rerollsUsed = (state: Pick<HordeState, 'rerolledWave' | 'rerolls' | 'wave'>): number =>
  state.rerolledWave === state.wave ? state.rerolls : 0;

/** Rerolls left in the current wave. */
export const rerollsLeft = (state: HordeState): number =>
  Math.max(0, rerollsThisWave(state) - rerollsUsed(state));

/** Why the open offer can't be rerolled, or null when it can (Second Look, design §5). */
export function rerollLock(state: HordeState): string | null {
  if (!perkOn(state, 'second-look')) return 'Needs Second Look';
  if (state.offer === null) return 'No offer to reroll';
  if (rerollsLeft(state) === 0) return 'Already rerolled this wave';
  return null;
}

/** Rolls the open offer again (seeded), as often as Second Look allows a wave; returns a new state. */
export function rerollOffer(state: HordeState): HordeState {
  const lock = rerollLock(state);
  if (lock) throw new RangeError(`rerollOffer: ${lock}`);
  const s = structuredClone(state);
  s.offer = rollOffer(rngFrom(s.rng), s);
  s.rerolls = rerollsUsed(s) + 1;
  s.rerolledWave = s.wave;
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
  // The one ammo slot (ID-097): the other ammo card and its levels are gone.
  const other = replaces(s, id);
  if (other) {
    s.taken = s.taken.filter((t) => t !== other);
    delete s.cardLevels[other];
  }
  if (!s.taken.includes(id)) s.taken.push(id);
  s.cardLevels[id] = stack(s, id) + 1;
  if (UPGRADES[id].category === 'barrier') s.barrierAt = s.time;
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
        (took(s, 'hollow-points') ? CARD.hollowPoints : 1);
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
      repair((seg) => seg.maxHp);
      break;
    case 'power-surge':
      s.freeWave = s.wave;
      break;
    case 'frag-grenades':
      s.nextFragAt = s.time;
      break;
    case 'barbed-wire': {
      // The rows start at level 1's durability; a level-up adds its step to each working
      // row, and a broken one stays broken (ID-104).
      const lv = s.cardLevels[id]!;
      if (lv < 2) break;
      const gain = CARD.wire.durability[lv - 1]! - CARD.wire.durability[lv - 2]!;
      for (const row of s.wire) if (row.durability > 0) row.durability += gain;
      break;
    }
    // The rest act in the fight while taken.
  }
}
