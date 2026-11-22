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
  TIMED_SKILLS,
  WALL,
  type BossSkill,
  type CardRarity,
  type ModeCard,
  type ResearchCard,
} from './data.ts';
import {
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

/** Flashbang's cost in words (ID-139). */
const glareText = `−${Math.round((1 - CARD.flashbang.glare) * 100)}% squad gun range while held`;
/** How many each survivor carries and how often one comes back (ID-195: short, for the card). */
const carryText = (every: number): string =>
  `${CARD.throws.carry} per survivor, one back every ${every} s.`;

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
    // The gain and its cost (ID-137), as every epic card names both.
    text: `Hits knock enemies back up to ${CARD.concussion.cap} px and daze them: +${Math.round(CARD.concussion.daze * 100)}% damage taken for ${CARD.concussion.dazeFor} s; −${Math.round((1 - CARD.concussion.fireRate) * 100)}% fire rate`,
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  'frag-grenades': {
    name: 'Frag Grenades',
    text: `${carryText(CARD.frag.every)} Hits the thickest group for ${Math.round(CARD.frag.share * 100)}% of a Shambler’s HP; the thrower stops firing for ${CARD.frag.pause} s`,
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
  },
  // Active skills until ID-139: now thrown by the squad, from the throwable slot.
  flashbang: {
    name: 'Flashbang',
    // The gain and its cost: "… for 3 s; −15% gun range for the whole squad while held".
    text: `${carryText(CARD.flashbang.every)} Stuns enemies within ${CARD.flashbang.radius} px for ${CARD.flashbang.seconds[0]} s; ${glareText}`,
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  molotov: {
    name: 'Molotov',
    text: `${carryText(CARD.molotov.every)} Burns for ${CARD.molotov.seconds[0]} s at ${Math.round(CARD.molotov.burn * 100)}% of a Shambler’s HP a second; enemies ${Math.round(CARD.molotov.panic * 100)}% faster in it`,
    category: 'behaviour',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'barbed-wire': {
    name: 'Barbed Wire',
    text: 'Wire strung out in the field slows enemies crossing it, rebuilt at each level-up',
    category: 'barrier',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'aim-for-the-head': {
    name: 'Aim for the Head',
    text: 'Squad hits crit more often',
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  // Not `hollow-points`: that id is Heavy Rounds (ID-103 renamed it), kept for saves.
  'hollow-point-rounds': {
    name: 'Hollow Points',
    text: 'Squad crits hit harder',
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'kevlar-vests': {
    name: 'Kevlar Vests',
    text: 'Survivors on the line take less damage from each hit',
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  'first-aid-kits': {
    name: 'First Aid Kits',
    text: 'Survivors on the line recover HP over time',
    category: 'stat',
    rarity: 'common',
    levels: CARD_MAX_LEVEL,
  },
  sandbags: {
    name: 'Sandbags',
    text: 'The outer wall takes less damage from each hit',
    category: 'barrier',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'scavenged-ammo': {
    name: 'Scavenged Ammo',
    text: 'Each gun shot has a chance not to use a round',
    category: 'stat',
    rarity: 'rare',
    levels: CARD_MAX_LEVEL,
  },
  'oil-bomb': {
    name: 'Oil Bomb',
    // The gain and its cost (ID-137): a slow shell, a long wait, and a lit slick burns out.
    text: `Tar slick every ${CARD.oil.every} s: ${Math.round(CARD.oil.slow * 100)}% slower for ${CARD.oil.seconds} s, lit by Incendiary or Molotov fire (${Math.round(CARD.oil.burn * 100)}% of a Shambler’s HP a second); but it lands ${CARD.oil.flight} s late, and a lit slick burns out in ${CARD.oil.burnFor} s`,
    category: 'behaviour',
    rarity: 'epic',
    levels: 1,
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
    // The gain and its cost (ID-136): "+38% damage, +25% reload time".
    text: `+${Math.round((CARD.heavyRounds.damage - 1) * 100)}% damage, +${Math.round((CARD.heavyRounds.reload - 1) * 100)}% reload time`,
    category: 'stat',
    rarity: 'epic',
    levels: 1,
  },
  'field-repairs': {
    name: 'Field Repairs',
    text: `Repair every wall segment to full; −${Math.round((1 - CARD.fieldRepairs.fireRate) * 100)}% fire rate for ${CARD.fieldRepairs.seconds} s`,
    category: 'barrier',
    rarity: 'epic',
    levels: 1,
  },
  // The mode cards (ID-222): unlocked by a mode's boss hordes, offered only in a higher mode
  // and only in a fight whose bosses have what they answer (`eligible`).
  'suppressing-fire': {
    name: 'Suppressing Fire',
    text: `A boss hit while it winds a skill up takes ${CARD.suppress.seconds} s longer to use it`,
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  cauterise: {
    name: 'Cauterise',
    text: `Regen bosses can’t heal for ${CARD.cauterise.seconds} s after a squad hit`,
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  momentum: {
    name: 'Momentum',
    text: 'When a boss dies every gun reloads at once and each survivor gets a throw back',
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'gas-masks': {
    name: 'Gas Masks',
    text: `Survivors take ${Math.round(CARD.gasMasks.cut * 100)}% less from Poison pools`,
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'breaching-rounds': {
    name: 'Breaching Rounds',
    text: `Bullets take back ${Math.round(CARD.breach.share * 100)}% of what Shield and Armour plates cut`,
    category: 'behaviour',
    rarity: 'rare',
    levels: 1,
  },
  'tranq-darts': {
    name: 'Tranq Darts',
    text: `A hit takes Enrage’s speed off an enraged boss for ${CARD.tranq.seconds} s`,
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
 * Fire a timed skill; Cauterise Regen; Momentum a boss (not a mini-boss); Gas Masks Poison pool;
 * Breaching Rounds Shield or Armour plates; Tranq Darts Enrage. Offered only then, so they never
 * crowd the offers (ID-131).
 */
const modeCardRelevant = (s: Pick<HordeState, 'bosses'>, id: ModeCard): boolean => {
  const has = (...skills: BossSkill[]) =>
    bossesHave(s, (b) => b.skills.some((k) => skills.includes(k)));
  switch (id) {
    case 'suppressing-fire':
      return has(...TIMED_SKILLS);
    case 'cauterise':
      return has('regen');
    case 'momentum':
      return bossesHave(s, (b) => !b.elite);
    case 'gas-masks':
      return has('poison');
    case 'breaching-rounds':
      return has('shield', 'plates');
    case 'tranq-darts':
      return has('enrage');
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

/** The synergy taking `id` would turn on (or has on), as a line for its card; null if none. */
export function synergyOf(state: HordeState, id: UpgradeId): string | null {
  if (id === 'ricochet' && state.taken.includes('piercing-rounds'))
    return 'Piercing Rounds: bounces pierce';
  if (id === 'piercing-rounds' && state.taken.includes('ricochet'))
    return 'Ricochet: bounces pierce';
  // Both of Oil Bomb's pairings held (ID-181): one line names both.
  if (
    id === 'oil-bomb' &&
    state.taken.includes('incendiary-rounds') &&
    state.taken.includes('molotov')
  )
    return 'Incendiary Rounds, Molotov: they light the slick';
  // Oil Bomb + Incendiary Rounds (ID-132): its text names the pairing; the line says it is on.
  if (id === 'oil-bomb' && state.taken.includes('incendiary-rounds'))
    return 'Incendiary Rounds: hits light the slick';
  if (id === 'incendiary-rounds' && state.taken.includes('oil-bomb'))
    return 'Oil Bomb: hits light the slick';
  // Oil Bomb + Molotov (ID-181): a fire overlapping the slick lights it.
  if (id === 'oil-bomb' && state.taken.includes('molotov')) return 'Molotov: fire lights the slick';
  if (id === 'molotov' && state.taken.includes('oil-bomb'))
    return 'Oil Bomb: fire lights the slick';
  return null;
}

/** A share as a percent, to one decimal when not whole: 25%, 7.5%. */
const pct = (x: number): string => `${Number((x * 100).toFixed(1))}%`;
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
    case 'aim-for-the-head':
      return { pre: 'Squad crit chance ', value: `+${pct(lv(CARD.crit))}`, post: '' };
    case 'hollow-point-rounds':
      return {
        pre: 'Squad crit damage ',
        value: `+${pct(lv(CARD.critDamage))}`,
        post: ', added to the ×2',
      };
    case 'kevlar-vests':
      return { pre: 'Each hit on a survivor ', value: `−${lv(CARD.armour)} HP`, post: '' };
    case 'first-aid-kits':
      return {
        pre: 'Survivors recover ',
        value: pct(lv(CARD.firstAid)),
        post: ' of max HP a second',
      };
    case 'sandbags':
      return { pre: 'The outer wall takes ', value: `−${pct(lv(CARD.sandbags))}`, post: ' damage' };
    case 'scavenged-ammo':
      return {
        pre: 'Each gun shot has a ',
        value: pct(lv(CARD.scavenge)),
        post: ' chance not to use a round',
      };
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
        value: pct(lv(CARD.burn.share)),
        post: ` of a Shambler’s HP a second for ${CARD.burn.seconds} s`,
      };
    case 'shock-rounds':
      return {
        pre: 'Hits paralyse enemies for ',
        value: `${lv(CARD.shock.seconds)} s`,
        post: ' (half on the big ones)',
      };
    // Thrown on their own, so each says how many and how often (design review, ID-139, ID-178).
    case 'flashbang':
      return {
        pre: `${carryText(CARD.flashbang.every)} Stuns enemies within ${CARD.flashbang.radius} px for `,
        value: `${lv(CARD.flashbang.seconds)} s`,
        post: `; ${glareText}`,
      };
    case 'molotov':
      return {
        pre: `${carryText(CARD.molotov.every)} Burns for `,
        value: `${lv(CARD.molotov.seconds)} s`,
        post: ` at ${pct(CARD.molotov.burn)} of a Shambler’s HP a second; enemies ${pct(CARD.molotov.panic)} faster in it`,
      };
    case 'barbed-wire':
      return {
        pre: 'Enemies ',
        value: pct(lv(CARD.wire.slow)),
        post: ' slower in the field wire, rebuilt at each level-up',
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
    // A unique card (Frag Grenades, ID-139) has no levels to lose.
    const lvl =
      o.levels === 1 ? '' : ` Lv ${levelName(cardLevel(state, other), o.levels ?? CARD_MAX_LEVEL)}`;
    const to = u.levels === 1 ? '' : ' Lv 1';
    out.replace = {
      warning: `Replaces ${o.name}${lvl}.${lvl ? ' Its levels are lost.' : ''}`,
      swap: `${o.name}${lvl} → ${u.name}${to}`,
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
  return left.length === 0 ? null : { kind: 'upgrade', id: rollUpgrade(rng, left, state.wave) };
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
export function rerollLock(state: HordeState): string | null {
  if (state.offer === null) return 'No offer to reroll';
  if (rerollsLeft(state) === 0) return 'No rerolls left';
  return null;
}

/** Rolls the open offer again (seeded, ID-210); returns a new state. */
export function rerollOffer(state: HordeState): HordeState {
  const lock = rerollLock(state);
  if (lock) throw new RangeError(`rerollOffer: ${lock}`);
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
export function banLock(state: HordeState, index: number): string | null {
  if (state.offer === null) return 'No offer to ban from';
  if (bansLeft(state) === 0) return 'No bans left';
  const card = state.offer[index];
  if (!Number.isInteger(index) || !card) return 'No such card';
  if (card.kind === 'recruit') return 'A survivor can’t be banned';
  return null;
}

/**
 * Bans card `index` of the open offer for the rest of the horde (ID-210): it leaves the
 * offer and every later one, and a new card (seeded) takes its slot while the pick stays
 * open. With no card left to fill it, the offer is one shorter. Returns a new state.
 */
export function banCard(state: HordeState, index: number): HordeState {
  const lock = banLock(state, index);
  if (lock) throw new RangeError(`banCard: ${lock}`);
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
        (took(s, 'hollow-points') ? CARD.heavyRounds.damage : 1);
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
      // Its cost (ID-137): the squad fires slower while the wall is repaired.
      s.repairsUntil = s.time + CARD.fieldRepairs.seconds;
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
