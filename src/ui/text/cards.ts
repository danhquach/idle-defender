// The upgrade cards in words (ID-269): names, plain texts, each card's effect with its number
// at a level, and what a pick would give (`cardPitch`). Core holds the cards' numbers (CARD,
// UPGRADES' levels) and which synergy is on (`synergyOf`); the words live here.
import { patchUpGain, replaces, synergyOf, UPGRADES, type Synergy } from '../../core/cards.ts';
import { CARD, CARD_MAX_LEVEL, TECH_FX, type TechId } from '../../core/data.ts';
import { cardLevel, took, type HordeState, type UpgradeId } from '../../core/horde.ts';

/** Flashbang's cost in words (ID-139). */
const glareText = `−${Math.round((1 - CARD.flashbang.glare) * 100)}% squad gun range while held`;
/** How many each survivor carries and how often one comes back (ID-195: short, for the card). */
/**
 * Oil Bomb's card text (ID-263): one builder for the table's constant (nothing researched) and
 * the offer card's (`cardPitch`), so the two can't drift. Quick Mortars shortens the wait;
 * Napalm Mortar lands the slick burning, with its full life.
 */
function oilText(tech: readonly TechId[]): string {
  const every = tech.includes('quick-mortars') ? TECH_FX.oilEvery : CARD.oil.every;
  const napalm = tech.includes('napalm-mortar');
  const lit = napalm ? 'lands already burning' : 'lit by Incendiary or Molotov fire';
  const out = napalm ? '' : `, and a lit slick burns out in ${CARD.oil.burnFor} s`;
  return `Tar slick every ${every} s: ${Math.round(CARD.oil.slow * 100)}% slower for ${CARD.oil.seconds} s, ${lit} (${Math.round(CARD.oil.burn * 100)}% of a Shambler’s HP a second); but it lands ${CARD.oil.flight} s late${out}`;
}
const carryText = (every: number): string =>
  `${CARD.throws.carry} per survivor, one back every ${every} s.`;

/** Each card's name. */
export const CARD_NAME: Readonly<Record<UpgradeId, string>> = {
  sharpshooter: 'Sharpshooter',
  'rapid-fire': 'Rapid Fire',
  'long-sight': 'Long Sight',
  'patch-up': 'Patch Up',
  reinforce: 'Reinforce',
  'piercing-rounds': 'Piercing Rounds',
  ricochet: 'Ricochet',
  'speed-loaders': 'Speed Loaders',
  'extended-mags': 'Extended Mags',
  'incendiary-rounds': 'Incendiary Rounds',
  'shock-rounds': 'Shock Rounds',
  'concussion-rounds': 'Concussion Rounds',
  'frag-grenades': 'Frag Grenades',
  flashbang: 'Flashbang',
  molotov: 'Molotov',
  'barbed-wire': 'Barbed Wire',
  'aim-for-the-head': 'Aim for the Head',
  'hollow-point-rounds': 'Hollow Points',
  'kevlar-vests': 'Kevlar Vests',
  'first-aid-kits': 'First Aid Kits',
  sandbags: 'Sandbags',
  'scavenged-ammo': 'Scavenged Ammo',
  'oil-bomb': 'Oil Bomb',
  recharge: 'Recharge',
  'power-surge': 'Power Surge',
  'hollow-points': 'Heavy Rounds',
  'field-repairs': 'Field Repairs',
  'suppressing-fire': 'Suppressing Fire',
  cauterise: 'Cauterise',
  momentum: 'Momentum',
  'gas-masks': 'Gas Masks',
  'breaching-rounds': 'Breaching Rounds',
  'adrenaline-rush': 'Adrenaline',
  'wall-machine-gun': 'Wall Machine Gun',
  'shock-net': 'Shock Net',
  'tar-moat': 'Tar Moat',
};

/** Each card's effect in words; a card with an `effectAt` shows that instead, with its numbers. */
export const CARD_TEXT: Readonly<Record<UpgradeId, string>> = {
  sharpshooter: 'More damage',
  'rapid-fire': 'Faster fire',
  'long-sight': 'More range',
  'patch-up': 'Repair every wall segment by 30% of its max HP',
  reinforce: 'More wall max HP',
  'piercing-rounds': 'Squad bullets go through 1 more enemy',
  ricochet: 'A bullet’s first hit bounces to the nearest other enemy',
  'speed-loaders': 'Guns reload faster',
  'extended-mags': 'Gun magazines hold more rounds',
  'incendiary-rounds': 'Bullets set the enemy they hit on fire for 3 s',
  'shock-rounds': 'Bullet hits briefly paralyse the enemy',
  // The gain and its cost (ID-137), as every epic card names both.
  'concussion-rounds': `Hits knock enemies back up to ${CARD.concussion.cap} px and daze them: +${Math.round(CARD.concussion.daze * 100)}% damage taken for ${CARD.concussion.dazeFor} s; −${Math.round((1 - CARD.concussion.fireRate) * 100)}% fire rate`,
  'frag-grenades': `${carryText(CARD.frag.every)} Hits the thickest group for ${Math.round(CARD.frag.share * 100)}% of a Shambler’s HP; the thrower stops firing for ${CARD.frag.pause} s`,
  // The gain and its cost: "… for 3 s; −15% gun range for the whole squad while held".
  flashbang: `${carryText(CARD.flashbang.every)} Stuns enemies within ${CARD.flashbang.radius} px for ${CARD.flashbang.seconds[0]} s; ${glareText}`,
  molotov: `${carryText(CARD.molotov.every)} Burns for ${CARD.molotov.seconds[0]} s at ${Math.round(CARD.molotov.burn * 100)}% of a Shambler’s HP a second; enemies ${Math.round(CARD.molotov.panic * 100)}% faster in it`,
  'barbed-wire': 'Wire strung out in the field slows and cuts enemies crossing it; heals slowly',
  'aim-for-the-head': 'Squad hits crit more often',
  'hollow-point-rounds': 'Squad crits hit harder',
  'kevlar-vests': 'Survivors on the line take less damage from each hit',
  'first-aid-kits': 'Survivors on the line recover HP over time',
  sandbags: 'The outer wall takes less damage from each hit',
  'scavenged-ammo': 'Each gun shot has a chance not to use a round',
  // The gain and its cost (ID-137): a slow shell, a long wait, and a lit slick burns out.
  'oil-bomb': oilText([]),
  // The Tier 4 cards (ID-264): no cost, and the pick spends an epic slot (the cost is that).
  'wall-machine-gun': `Fires a ${CARD.wallGun.burst}-round burst every ${CARD.wallGun.every} s at the nearest enemy, anywhere on the field. Hits harder in bigger hordes; ignores ${Math.round(TECH_FX.pierce * 100)}% of armour`,
  'shock-net': `Every ${CARD.net.every} s, enemies near the wire are stunned for ${CARD.net.seconds} s`,
  'tar-moat': `Tar strip at the wall: enemies in it move ${Math.round(CARD.moat.slow * 100)}% slower. It lights ${CARD.moat.fuse} s after an enemy steps in, or at once from fire, burning ${Math.round(CARD.moat.burn * 100)}% of a Shambler’s HP a second for ${CARD.oil.burnFor} s. Refills after ${CARD.moat.refill} s`,
  recharge: 'Add 25% of the bank’s cap to the battery bank',
  'power-surge': 'Turrets draw no charge until this wave ends',
  // The gain and its cost (ID-136): "+38% damage, +25% reload time".
  'hollow-points': `+${Math.round((CARD.heavyRounds.damage - 1) * 100)}% damage, +${Math.round((CARD.heavyRounds.reload - 1) * 100)}% reload time`,
  'field-repairs': `Field Repairs skill: repair every wall segment to full when you choose; −${Math.round((1 - CARD.fieldRepairs.fireRate) * 100)}% fire rate for ${CARD.fieldRepairs.seconds} s`,
  'suppressing-fire': `Enemies you hit move ${Math.round(CARD.suppress.slow * 100)}% slower; bosses you hit use skills ${Math.round(CARD.suppress.recharge * 100)}% slower`,
  cauterise: `Hits scorch enemies: +${Math.round(CARD.cauterise.taken * 100)}% damage taken for ${CARD.cauterise.seconds} s; scorched bosses can’t heal`,
  momentum: `Every ${CARD.momentum.kills} kills all guns reload; a boss or mini-boss kill gives each survivor a throw back`,
  'gas-masks': `Survivors take ${Math.round(CARD.gasMasks.cut * 100)}% less from Poison pools`,
  'breaching-rounds': `Bullets take back ${Math.round(CARD.breach.share * 100)}% of what Shield and Armour plates cut`,
  'adrenaline-rush': `When a survivor is hurt the squad fires ${Math.round(CARD.rush.rate * 100)}% faster for ${CARD.rush.seconds} s (${Math.round(CARD.rush.heavyRate * 100)}% if one hit takes ${Math.round(CARD.rush.heavy * 100)}%+ of their HP)`,
};

/** Each synergy as a line for its card. */
export const SYNERGY_TEXT: Readonly<Record<Synergy, string>> = {
  'ricochet-pierce': 'Piercing Rounds: bounces pierce',
  'pierce-ricochet': 'Ricochet: bounces pierce',
  'oil-both': 'Incendiary Rounds, Molotov: they light the slick',
  'oil-incendiary': 'Incendiary Rounds: hits light the slick',
  'incendiary-oil': 'Oil Bomb: hits light the slick',
  'oil-molotov': 'Molotov: fire lights the slick',
  'molotov-oil': 'Oil Bomb: fire lights the slick',
};

/** The synergy taking `id` would turn on (or has on), as a line for its card; null if none. */
export function synergyText(state: HordeState, id: UpgradeId): string | null {
  const s = synergyOf(state, id);
  return s === null ? null : SYNERGY_TEXT[s];
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
  /** The Research Center nodes researched (ID-263): Hand-loads shows its stronger numbers. */
  tech: readonly TechId[] = [],
): { pre: string; value: string; post: string } | null {
  const lv = (levels: readonly number[]): number => levels[Math.min(levels.length, n) - 1]!;
  const boost = tech.includes('hand-loads') ? TECH_FX.ammo : 1;
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
        value: pct(Math.min(1, lv(CARD.scavenge) * boost)),
        post: ' chance not to use a round',
      };
    case 'piercing-rounds':
      return {
        pre: 'Bullets go through 1 more enemy ',
        value: pct(Math.min(1, lv(CARD.pierce) * boost)),
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
        value: pct(lv(CARD.burn.share) * boost),
        post: ` of a Shambler’s HP a second for ${CARD.burn.seconds} s`,
      };
    case 'shock-rounds':
      return {
        pre: 'Hits paralyse enemies for ',
        value: `${Number((lv(CARD.shock.seconds) * boost).toFixed(2))} s`,
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
        pre: 'Field wire slows enemies ',
        value: pct(lv(CARD.wire.slow)),
        post: ' and cuts them each second; heals slowly',
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
export function cardPitch(state: HordeState, id: UpgradeId): CardPitch {
  const u = UPGRADES[id];
  const held = took(state, id) ? cardLevel(state, id) : 0;
  const next = held + 1;
  const tech = state.tech ?? [];
  const at = effectAt(id, next, tech);
  const was = held > 0 ? effectAt(id, held, tech) : null;
  let effect: CardPitch['effect'] = at
    ? { pre: at.pre, from: was ? was.value : null, to: at.value, post: at.post }
    : null;
  let text = CARD_TEXT[id];
  if (id === 'patch-up') {
    // What it would restore, the HP in bold like any card's number.
    const { hp, segments } = patchUpGain(state);
    const across = ` across ${segments} segment${segments === 1 ? '' : 's'}`;
    effect = { pre: 'Repairs ', from: null, to: `${Math.round(hp)} HP`, post: across };
    text = `Repairs ${Math.round(hp)} HP${across}`;
  }
  // Research Center (ID-263): the constant texts are the unresearched numbers.
  if (id === 'hollow-points' && tech.includes('hand-loads')) {
    text = `+${pct((CARD.heavyRounds.damage - 1) * TECH_FX.ammo)} damage, +${Math.round((CARD.heavyRounds.reload - 1) * 100)}% reload time`;
  }
  if (id === 'oil-bomb') text = oilText(tech);
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
      warning: `Replaces ${CARD_NAME[other]}${lvl}.${lvl ? ' Its levels are lost.' : ''}`,
      swap: `${CARD_NAME[other]}${lvl} → ${CARD_NAME[id]}${to}`,
    };
  }
  return out;
}
