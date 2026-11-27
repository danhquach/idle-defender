// Names the screens build from ids and numbers (ID-269): a mode's horde, a mode's unlock, a
// rest, a patrol place, a research queue entry; and every id-keyed name table (each typed by
// its core table, so a new id without a name fails tsc).
import { MODE_UNLOCK_HORDE, modeBefore, type Mode } from '../../core/modes.ts';
import {
  CARD,
  AREAS,
  DANGERS,
  ENEMY_TRAITS,
  ITEMS,
  JOBS,
  LOCATIONS,
  PLAZAS,
  ORDERS,
  PERKS,
  CAMP_PICKS,
  BATTERIES,
  SHOP,
  SKILLS,
  THEMES,
  TIERS,
  TRAPS,
  isPlaza,
  type PlaceId,
  type Profession,
  type ResearchId,
  type TechBranch,
  type TechId,
} from '../../core/data.ts';
import { perkOfEntry, type QueueId } from '../../core/research.ts';

/** Horde `local` of `mode` as the screens name it (ID-267): "Normal 12", "Nightmare 30", "Hell 15". */
export const hordeName = (mode: Mode, local: number): string => `${MODE_NAME[mode]} ${local}`;

/** What a locked `mode` asks, as the start screen says it. */
export const unlockHint = (mode: Mode): string => {
  const before = modeBefore(mode);
  return before === null
    ? ''
    : `Hold ${hordeName(before, MODE_UNLOCK_HORDE)} to unlock ${MODE_NAME[mode]}`;
};

/** "Resting: 2 hordes" / "Resting: 1 horde" (ID-147). */
export const restLabel = (rest: number): string =>
  `Resting: ${rest} ${rest === 1 ? 'horde' : 'hordes'}`;

/** A patrol place's name: a plaza's or a location's. */
export const placeName = (id: PlaceId): string =>
  isPlaza(id) ? PLAZA_NAME[id] : LOCATION_NAME[id];

/**
 * A research queue entry's name: a node's, or "Fortify level 3" for a perk's next level
 * (`level` from `entryOf` / `entryLevel`).
 */
export function entryName(id: QueueId, level: number | null): string {
  const perk = perkOfEntry(id);
  return perk === null || level === null
    ? RESEARCH_NAME[id as ResearchId]
    : `${PERK_NAME[perk]} level ${level}`;
}

/** Each World map area's name. */
export const AREA_NAME: Readonly<Record<keyof typeof AREAS, string>> = {
  police: 'Police station',
  military: 'Military depot',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  hardware: 'Hardware store',
  electronics: 'Electronics store',
};

/** Each danger level's name. */
export const DANGER_NAME: Readonly<Record<keyof typeof DANGERS, string>> = {
  safe: 'Safe',
  risky: 'Risky',
  dangerous: 'Dangerous',
};

/** Each enemy trait's name (Nightmare and Hell). */
export const ENEMY_TRAIT_NAME: Readonly<Partial<Record<keyof typeof ENEMY_TRAITS, string>>> = {
  runner: 'Swift',
  crawler: 'Skittering',
  spewer: 'Slick',
  swollen: 'Bloated',
  screamer: 'Darting',
  brute: 'Plated',
  horror: 'Hulking',
};

/** Each carried item's name. */
export const ITEM_NAME: Readonly<Record<keyof typeof ITEMS, string>> = {
  shield: 'Shield',
};

/** Each profession's name. */
export const JOB_NAME: Readonly<Record<keyof typeof JOBS, string>> = {
  police: 'Police officer',
  soldier: 'Soldier',
  hunter: 'Hunter',
  guard: 'Security guard',
  builder: 'Construction worker',
  paramedic: 'Paramedic',
  mechanic: 'Mechanic',
  chef: 'Chef',
  teacher: 'Teacher',
  scavenger: 'Scavenger',
  student: 'Student',
};

/** Each patrol location's name (full game). */
export const LOCATION_NAME: Readonly<Record<keyof typeof LOCATIONS, string>> = {
  'gas-station': 'Gas station',
  supermarket: 'Supermarket',
  electronics: 'Electronics store',
  hardware: 'Hardware store',
  pharmacy: 'Pharmacy',
  construction: 'Construction site',
  police: 'Police station',
  hospital: 'Hospital',
  military: 'Military depot',
  crater: 'The crater',
};

/** Each plaza's name (full game). */
export const PLAZA_NAME: Readonly<Record<keyof typeof PLAZAS, string>> = {
  riverside: 'Riverside Plaza',
  'strip-mall': 'Strip mall',
};

/** Each patrol order's name (full game). */
export const ORDER_NAME: Readonly<Record<keyof typeof ORDERS, string>> = {
  loot: 'Save the loot',
  balanced: 'Balanced',
  people: 'Save the people',
};

/** Each commander perk's name. */
export const PERK_NAME: Readonly<Record<keyof typeof PERKS, string>> = {
  'steady-fire': 'Steady Fire',
  'scavengers-eye': "Scavenger's Eye",
  fortify: 'Fortify',
  'butchers-hunger': "Butcher's Hunger",
  'rally-call': 'Rally Call',
  'second-look': 'Second Look',
  overclock: 'Overclock',
  'power-saver': 'Power Saver',
};

/** Each commander perk's effect. */
export const PERK_TEXT: Readonly<Record<keyof typeof PERKS, string>> = {
  'steady-fire': 'Guns fire 12.5% faster',
  'scavengers-eye': '+25% horde cash',
  fortify: 'Barrier segments +30% max HP',
  'butchers-hunger': 'Blade and tool kills heal the nearest damaged wall 3 HP',
  'rally-call': 'Recruit cards appear twice as often',
  'second-look': 'Extra card rerolls: 1 a wave',
  overclock: 'Turrets +20% damage, +10% energy use',
  'power-saver': 'Turrets use 25% less energy',
};

/** Each camp pick's name (full game). */
export const CAMP_PICK_NAME: Readonly<Record<keyof typeof CAMP_PICKS, string>> = {
  scavenging: 'Scavenging',
  stockpile: 'Stockpile',
  salvage: 'Salvage Crew',
  medic: 'Field Medic',
  foraging: 'Foraging',
};

/** Each camp pick's effect (full game). */
export const CAMP_PICK_TEXT: Readonly<Record<keyof typeof CAMP_PICKS, string>> = {
  scavenging: '+5% horde cash per kill',
  stockpile: 'Start each horde with +10 cash',
  salvage: 'Repairs cost 10% less',
  medic: 'Injuries heal 10% faster',
  foraging: '+5% patrol materials and Gas',
};

/** Each battery's name (full game). */
export const BATTERY_NAME: Readonly<Record<keyof typeof BATTERIES, string>> = {
  makeshift: 'Makeshift',
  standard: 'Standard',
  'high-capacity': 'High-capacity',
  military: 'Military',
};

/** Each shop item's name. */
export const SHOP_NAME: Readonly<Record<keyof typeof SHOP, string>> = {
  adrenaline: 'Adrenaline',
  overdrive: 'Overdrive',
  patch: 'Patch wall',
  fix: 'Fix turret',
};

/** Each active skill's name (the boss skills' are `SKILL_NAME` in hud.ts). */
export const ACTIVE_SKILL_NAME: Readonly<Record<keyof typeof SKILLS, string>> = {
  airstrike: 'Airstrike',
};

/** Each horde theme's name. */
export const THEME_NAME: Readonly<Record<keyof typeof THEMES, string>> = {
  stampede: 'Stampede',
  ironwall: 'Iron Wall',
  crawl: 'Crawl',
  bloat: 'Bloat Tide',
};

/** Each horde theme's tip. */
export const THEME_TIP: Readonly<Record<keyof typeof THEMES, string>> = {
  stampede: 'Fast and many. Bring fast-firing guns, slows and knockback.',
  ironwall: 'Few, armoured, very tough. Bring heavy guns and armour piercing.',
  crawl: 'Low and hard to hit; they climb the wall. Bring spread or light guns.',
  bloat: 'Their blasts break the wall. Long-range guns kill them far out; take Sandbags.',
};

/** Each wall tier's name. */
export const TIER_NAME: Readonly<Record<keyof typeof TIERS, string>> = {
  wood: 'Wood',
  metal: 'Metal',
  concrete: 'Concrete',
  reinforced: 'Reinforced',
};

/** Each trap's name. */
export const TRAP_NAME: Readonly<Record<keyof typeof TRAPS, string>> = {
  spikes: 'Spikes',
  wire: 'Barbed wire',
};

/** Each research node's name (full game). */
export const RESEARCH_NAME: Readonly<Record<ResearchId, string>> = {
  'metal-walls': 'Metal walls',
  'auto-turret': 'Auto-turret',
  airstrike: 'Airstrike',
  'scavengers-eye': "Scavenger's Eye",
  fortify: 'Fortify',
  'butchers-hunger': "Butcher's Hunger",
  'rally-call': 'Rally Call',
  'second-look': 'Second Look',
  overclock: 'Overclock',
  'power-saver': 'Power Saver',
  'perk-slot-2': 'Perk slot 2',
  'perk-slot-3': 'Perk slot 3',
  'perk-slot-4': 'Perk slot 4',
  'high-capacity-batteries': 'High-capacity batteries',
  'military-batteries': 'Military batteries',
  'sharpened-spikes': 'Sharpened spikes',
  'razor-wire': 'Razor wire',
  'glue-traps': 'Glue traps',
  'incendiary-traps': 'Incendiary traps',
  'corrosive-traps': 'Corrosive traps',
  'paralyzing-traps': 'Paralyzing traps',
  'hollow-points': 'Heavy Rounds card',
  'field-repairs': 'Field Repairs card',
  'more-cars': 'More cars',
};

/** A loadout's profession, as the full game names it. */
export const PROFESSION_NAME: Readonly<Record<Profession, string>> = {
  gunner: 'Gunner',
  ripper: 'Ripper',
  engineer: 'Engineer',
};

/** Each difficulty mode's name. */
export const MODE_NAME: Readonly<Record<Mode, string>> = {
  normal: 'Normal',
  nightmare: 'Nightmare',
  hell: 'Hell',
};

/** An enemy kind's trait name (Nightmare and Hell); '' for a kind with none. */
export const traitName = (kind: keyof typeof ENEMY_TRAITS): string => ENEMY_TRAIT_NAME[kind] ?? '';

/** Each Research Center node's name (ID-263). */
export const TECH_NAME: Readonly<Record<TechId, string>> = {
  'reinforced-wall': 'Reinforced Wall',
  'steel-plating': 'Steel Plating',
  'spiked-wall': 'Spiked Wall',
  'razor-wire': 'Razor Wire',
  'thick-coils': 'Thick Coils',
  'electric-wire': 'Electric Wire',
  'hand-loads': 'Hand-loads',
  'armour-piercing': 'Armour-piercing',
  'quick-mortars': 'Quick Mortars',
  'wide-slick': 'Wide Slick',
  'napalm-mortar': 'Napalm Mortar',
  'wall-machine-gun': 'Wall Machine Gun',
  'shock-net': 'Shock Net',
  'tar-moat': 'Tar Moat',
};

/** Each node in one word, for a Tier 4 combo's locked face ("Needs Armour + Spiked"; ID-264). */
export const TECH_SHORT: Readonly<Record<TechId, string>> = {
  'reinforced-wall': 'Reinforced',
  'steel-plating': 'Steel',
  'spiked-wall': 'Spiked',
  'razor-wire': 'Razor',
  'thick-coils': 'Coils',
  'electric-wire': 'Electric',
  'hand-loads': 'Hand-loads',
  'armour-piercing': 'Armour',
  'quick-mortars': 'Quick',
  'wide-slick': 'Wide',
  'napalm-mortar': 'Napalm',
  'wall-machine-gun': 'Gun',
  'shock-net': 'Net',
  'tar-moat': 'Moat',
};

/** What each Research Center node does, in the detail panel and a Tier 3 confirm (ID-263). */
export const TECH_EFFECT: Readonly<Record<TechId, string>> = {
  'reinforced-wall': 'Wall HP +15% in every fight.',
  'steel-plating': 'Wall HP +30% in every fight, in place of the +15%.',
  'spiked-wall': "Crawlers climbing the wall lose 20% of a Shambler's HP a second.",
  'razor-wire': "Barbed Wire's bleed +25%.",
  'thick-coils': 'Barbed Wire rows have +50% HP.',
  'electric-wire':
    "An enemy entering Barbed Wire is stunned for 1 s (then can't be stunned again for 3 s).",
  'hand-loads':
    'When you pick one of these cards, it is 10% stronger: Heavy Rounds, Incendiary Rounds, Shock Rounds, Piercing Rounds, Scavenged Ammo.',
  'armour-piercing':
    'While the squad holds one of those five ammo cards, its bullets ignore 20% of armour.',
  'quick-mortars': 'Oil Bomb fires every 16 s instead of 20 (the first throw is as soon as ever).',
  'wide-slick': 'Oil Bomb slicks are 25% wider.',
  'napalm-mortar': 'Oil Bomb slicks land already burning, and stay for their full 10 s.',
  // The Tier 4 words read the card's numbers from CARD, so they can't drift (ID-264).
  'wall-machine-gun': `A wall-mounted gun fires a ${CARD.wallGun.burst}-round burst every ${CARD.wallGun.every} s at the nearest enemy, anywhere on the field. Ignores part of its armour and keeps pace with bigger hordes.`,
  'shock-net': `Every ${CARD.net.every} s, stuns enemies near the wire for ${CARD.net.seconds} s.`,
  'tar-moat': `A tar strip along the wall slows enemies by ${Math.round(CARD.moat.slow * 100)}%. It catches fire after ${CARD.moat.fuse} s, or at once if something lights it.`,
};

/** Each Research Center branch's name, the chart's rows (ID-263). */
export const TECH_BRANCH_NAME: Readonly<Record<TechBranch, string>> = {
  wall: 'Wall',
  wire: 'Barbed Wire',
  ammo: 'Ammo',
  mortars: 'Mortars',
};
