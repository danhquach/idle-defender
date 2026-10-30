// Every M1 number lives here. Each is a design starting point (docs/design.md),
// tuned in play, never scattered through the simulation.

/** Fixed simulation step in seconds: results never depend on frame rate. */
export const STEP = 1 / 30;

/** The open field: `x` runs 0…right (camp left, horde from the right), `y` 0…height. */
export const FIELD = { right: 1600, height: 800 } as const;

/** The camp line: an enemy inside the camp with no defender to hit waits here. */
export const CAMP = { x: 120 } as const;
/** Wall thickness along `x`; a layer's wall spans `[x, x + depth]`. */
export const WALL = { depth: 20 } as const;
/** Segments per layer, top to bottom; row `r` covers `y` in `[r, r + 1) * SEGMENT_HEIGHT`. */
export const SEGMENTS = 10;
export const SEGMENT_HEIGHT = FIELD.height / SEGMENTS;
/** The starting layer's gate row and tower rows (design §11): the gate near the middle. */
export const START_BASE = { gate: 5, towers: [4, 6] } as const;

/** A Shambler's body radius, and a defender's: the default body size. */
export const ENEMY_RADIUS = 12;
/** Most a crowded enemy is pushed aside per second. */
export const SEPARATION_SPEED = 60;
/** How close to a wall an enemy must be to slide toward a broken segment. */
export const GAP_SENSE = 200;

// --- Professions (M4). The loadout decides the profession; design §6. ---

export type Profession = 'gunner' | 'ripper' | 'engineer';
export const PROFESSIONS: Readonly<Record<Profession, { readonly name: string }>> = {
  gunner: { name: 'Gunner' },
  ripper: { name: 'Ripper' },
  engineer: { name: 'Engineer' },
};

/** How a gun's bullets look in flight (design §15): a streak `length` px behind the slug, in `colour`. */
export interface Tracer {
  readonly length: number;
  readonly colour: string;
}
/**
 * A gun shoots within `range` (× the post's multiplier), `magazine` rounds between
 * reloads of `reload` s. Each round is `pellets` bullets of `damage` each; they fly at
 * `speed` px/s, each turned off the aim by up to `spread` degrees either way (design §6
 * Ballistics), go through `pierce` enemies, and look like `tracer`. A sidearm goes in
 * either slot and suits everyone; a specialised gun is primary only and suits Gunners
 * (design §6 Loadout).
 */
export interface Gun {
  readonly name: string;
  readonly kind: 'sidearm' | 'gun';
  readonly damage: number;
  readonly fireInterval: number;
  readonly range: number;
  readonly magazine: number;
  readonly reload: number;
  readonly speed: number;
  readonly spread: number;
  readonly pellets: number;
  readonly pierce: number;
  readonly tracer: Tracer;
}
/** A blade (secondary) strikes within `reach` of its holder's post; never from a tower. */
export interface Blade {
  readonly name: string;
  readonly kind: 'blade';
  readonly damage: number;
  readonly fireInterval: number;
  readonly reach: number;
}
/**
 * A tool (secondary) strikes weakly within `reach` and mostly repairs: `repair` HP/s
 * of its holder's layer (their row ±1); it speeds up defenders within `buffRadius` by
 * `ENGINEER_BUFF`.
 */
export interface Tool {
  readonly name: string;
  readonly kind: 'tool';
  readonly damage: number;
  readonly fireInterval: number;
  readonly reach: number;
  readonly repair: number;
  readonly buffRadius: number;
}
export type Weapon = Gun | Blade | Tool;

export const WEAPONS = {
  pistol: {
    name: 'Pistol',
    kind: 'sidearm',
    damage: 6.2,
    fireInterval: 0.6,
    range: 600,
    magazine: 10,
    reload: 1.5,
    speed: 1800,
    spread: 2.5,
    pellets: 1,
    pierce: 0,
    tracer: { length: 12, colour: '#ffd36a' },
  },
  smg: {
    name: 'SMG',
    kind: 'gun',
    damage: 5,
    fireInterval: 0.2,
    range: 400,
    magazine: 30,
    reload: 2,
    speed: 1600,
    spread: 5,
    pellets: 1,
    pierce: 0,
    tracer: { length: 10, colour: '#ffd36a' },
  },
  rifle: {
    name: 'Rifle',
    kind: 'gun',
    damage: 7,
    fireInterval: 0.4,
    range: 750,
    magazine: 20,
    reload: 2,
    speed: 2200,
    spread: 1.5,
    pellets: 1,
    pierce: 0,
    tracer: { length: 16, colour: '#ffe08a' },
  },
  shotgun: {
    name: 'Shotgun',
    kind: 'gun',
    damage: 4,
    fireInterval: 0.75,
    range: 350,
    magazine: 8,
    reload: 2.5,
    speed: 1400,
    spread: 12,
    pellets: 6,
    pierce: 0,
    tracer: { length: 8, colour: '#ffc04a' },
  },
  lmg: {
    name: 'LMG',
    kind: 'gun',
    damage: 6,
    fireInterval: 0.22,
    range: 500,
    magazine: 60,
    reload: 5,
    speed: 2000,
    spread: 4,
    pellets: 1,
    pierce: 0,
    tracer: { length: 14, colour: '#ffb347' },
  },
  sniper: {
    name: 'Sniper rifle',
    kind: 'gun',
    damage: 22,
    fireInterval: 2,
    range: 1100,
    magazine: 5,
    reload: 3.5,
    speed: 3000,
    spread: 0.5,
    pellets: 1,
    pierce: 1,
    tracer: { length: 24, colour: '#fff3c4' },
  },
  knife: { name: 'Knife', kind: 'blade', damage: 10, fireInterval: 0.5, reach: 50 },
  toolkit: {
    name: 'Toolkit',
    kind: 'tool',
    damage: 4,
    fireInterval: 0.6,
    reach: 50,
    repair: 3,
    buffRadius: 100,
  },
} as const satisfies Record<string, Weapon>;
export type WeaponId = keyof typeof WEAPONS;
/** Free, unlimited Common weapons, held by id; every other weapon is an owned item (design §6 Gear). */
export const FREE_WEAPONS = ['pistol', 'knife', 'toolkit'] as const satisfies readonly WeaponId[];
export type FreeWeaponId = (typeof FREE_WEAPONS)[number];

// --- Gear (M4): owned weapons of a rarity with rolled affixes; design §6 Gear. ---

export type Rarity = 'rusty' | 'common' | 'military' | 'prototype' | 'relic';
/**
 * `power` multiplies damage (and a tool's repair), `affixes` is how many it rolls
 * (fewer when its kind fits fewer), `salvage` the Scrap it turns into when the
 * armoury is full.
 */
export const RARITIES = {
  rusty: { name: 'Rusty', power: 0.8, affixes: 0, salvage: 5 },
  common: { name: 'Common', power: 1, affixes: 0, salvage: 10 },
  military: { name: 'Military', power: 1.15, affixes: 1, salvage: 25 },
  prototype: { name: 'Prototype', power: 1.3, affixes: 2, salvage: 50 },
  relic: { name: 'Relic', power: 1.5, affixes: 3, salvage: 100 },
} as const satisfies Record<
  Rarity,
  { name: string; power: number; affixes: number; salvage: number }
>;
export const RARITY_ORDER: readonly Rarity[] = [
  'rusty',
  'common',
  'military',
  'prototype',
  'relic',
];

export type AffixId = 'damage' | 'fireRate' | 'magazine' | 'reload' | 'pierce' | 'repair';
type WeaponKind = Weapon['kind'];
const GUNS: readonly WeaponKind[] = ['sidearm', 'gun'];
/**
 * Each affix rolls a whole number in [min, max]: a percent, or for pierce the extra
 * enemies a shot hits. `kinds` are the weapons it fits.
 */
export const AFFIXES = {
  damage: { min: 5, max: 15, kinds: ['sidearm', 'gun', 'blade', 'tool'] },
  fireRate: { min: 5, max: 15, kinds: ['sidearm', 'gun', 'blade', 'tool'] },
  magazine: { min: 20, max: 50, kinds: GUNS },
  reload: { min: 10, max: 25, kinds: GUNS },
  pierce: { min: 1, max: 1, kinds: GUNS },
  repair: { min: 10, max: 25, kinds: ['tool'] },
} as const satisfies Record<AffixId, { min: number; max: number; kinds: readonly WeaponKind[] }>;
export const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

/**
 * A horde win's weapon drop (design §4): `base + perHorde × n` chance, capped; the
 * base weapon even across `WEAPONS`, the rarity by `rarity` weight (no Relic).
 */
export const WEAPON_DROP = {
  base: 0.1,
  perHorde: 0.01,
  cap: 0.3,
  rarity: { rusty: 30, common: 45, military: 20, prototype: 5, relic: 0 },
} as const satisfies {
  base: number;
  perHorde: number;
  cap: number;
  rarity: Record<Rarity, number>;
};
/** Owned weapons the camp keeps, in the armoury and in hands together. */
export const ARMOURY_CAP = 30;
/** A piercing bullet goes through an enemy and hits the next one it crosses within `reach` px. */
export const PIERCE = { reach: 200 } as const;

export type ItemId = 'shield';
export const ITEMS: Readonly<Record<ItemId, { readonly name: string }>> = {
  shield: { name: 'Shield' },
};

/** A Gunner with any gun: fire rate and reload speed up, crit chance on top of Aim's, spread cone × `spread`. */
export const GUNNER = { fireRate: 0.15, reload: 0.25, crit: 0.05, spread: 0.5 } as const;
/** A non-Gunner with a specialised gun: damage down, reload time up. */
export const OFF_PROFESSION = { damage: 0.3, reload: 0.5 } as const;
/** A Gunner's sidearm fires while the primary reloads, at enemies within this many px. */
export const SIDEARM_CLOSE = 200;
/** A shield (Ripper only): damage taken down; the holder's gun fire rate and walk speed down. */
export const SHIELD = { damageTaken: 0.3, fireRate: 0.2, walk: 0.2 } as const;

/** Fire-rate bonus for defenders beside an Engineer; several Engineers don't stack. */
export const ENGINEER_BUFF = 0.15;

export type EnemyKind =
  'shambler' | 'runner' | 'crawler' | 'swollen' | 'spewer' | 'brute' | 'screamer' | 'horror';
/** Design §9, as built ID-023 (starting points). `radius` is the body bullets hit. */
export const ENEMIES: Readonly<
  Record<
    EnemyKind,
    {
      readonly hp: number;
      readonly speed: number;
      readonly damage: number;
      readonly attackInterval: number;
      readonly radius: number;
      readonly xp: number;
      /** Horde cash its kill pays (design §4). */
      readonly cash: number;
    }
  >
> = {
  shambler: { hp: 20, speed: 30, damage: 5, attackInterval: 1, radius: 12, xp: 1, cash: 2 },
  runner: { hp: 15, speed: 75, damage: 3, attackInterval: 0.8, radius: 10, xp: 1, cash: 2 },
  crawler: { hp: 40, speed: 40, damage: 20, attackInterval: 1, radius: 9, xp: 2, cash: 3 },
  // Its hit is its blast (SWOLLEN); `damage` is what it does to a defender in the camp.
  swollen: { hp: 60, speed: 18, damage: 50, attackInterval: 1, radius: 18, xp: 3, cash: 4 },
  spewer: { hp: 25, speed: 28, damage: 8, attackInterval: 2, radius: 12, xp: 2, cash: 3 },
  brute: { hp: 150, speed: 20, damage: 25, attackInterval: 1.5, radius: 20, xp: 5, cash: 6 },
  screamer: { hp: 30, speed: 30, damage: 2, attackInterval: 1, radius: 12, xp: 3, cash: 4 },
  // The boss (ID-024): never rolled, one per boss horde (HORROR).
  horror: { hp: 150, speed: 15, damage: 60, attackInterval: 2, radius: 32, xp: 50, cash: 40 },
};
/**
 * The share of a wave each kind takes from the horde it joins (design §9); Shamblers
 * fill the rest. Horde 1, the tutorial, is Shamblers only.
 */
export const ENEMY_MIX: Readonly<Partial<Record<EnemyKind, { from: number; share: number }>>> = {
  runner: { from: 2, share: 0.15 },
  crawler: { from: 5, share: 0.1 },
  spewer: { from: 6, share: 0.1 },
  swollen: { from: 7, share: 0.1 },
  brute: { from: 8, share: 0.1 },
  screamer: { from: 9, share: 0.1 },
};
/** A Crawler climbs the first standing segment it reaches for `time` s, then drops behind it. */
export const CRAWLER = { climb: 3 } as const;
/**
 * A Swollen at a standing segment blows up: `wall` to it, `splash` to the segments above
 * and below; its burst is drawn for `burst` s.
 */
export const SWOLLEN = { wall: 150, splash: 50, burst: 0.4 } as const;
/**
 * A Spewer stops `stop` px short of its stop line (so the wall-walk is in reach) and
 * spits at anything within `range`; each glob is drawn for `splash` s (it lands at once).
 */
export const SPEWER = { stop: 150, range: 250, splash: 0.3 } as const;
/** Each bullet hitting a Brute does `armour` less damage, but at least `min`. */
export const BRUTE = { armour: 3, min: 1 } as const;
/** Other enemies within `radius` of a Screamer move `speed` faster; several don't stack. */
export const SCREAMER = { radius: 150, speed: 0.3 } as const;

/** A Mutated Horror's one ability (design §9, ID-024); boss hordes take them in this order. */
export type HorrorAbility = 'brood' | 'charge' | 'regen';
export const HORROR_ABILITIES: readonly HorrorAbility[] = ['brood', 'charge', 'regen'];
/**
 * Design §9, as built ID-024 (starting points): every `every`th horde is a boss horde,
 * whose last wave brings a Mutated Horror. Armour like a Brute's. Brood: every
 * `brood.every` s, `brood.count` Shamblers around it. Charge: every `charge.every` s,
 * `charge.speed`× speed for `charge.time` s; its first wall hit in a charge does
 * `charge.hit`×. Regen: `regen.rate` of its max HP per second, once `regen.after` s
 * have passed without a hit. Ability clocks run on fight time and wait out a stun.
 */
export const HORROR = {
  every: 10,
  armour: 2,
  min: 1,
  brood: { every: 25, count: 2 },
  charge: { every: 10, time: 2, speed: 3, hit: 2 },
  regen: { rate: 0.03, after: 0.3 },
} as const;

export const SPAWN_INTERVAL = 0.8;
export const WAVE_BREAK = 3;
/** How long a blade or tool strike stays on screen, in seconds. */
export const STRIKE_FLASH = 0.15;
/** How long a gun's muzzle flash shows, in seconds (design §15). */
export const MUZZLE_FLASH = 0.05;
/** How long a bullet's impact (a puff on a hit, dust on a miss) shows, in seconds. */
export const IMPACT_FLASH = 0.25;

// --- The base (M2). Grid, tiers and costs; design §3 and §11. ---

/** Every resource the camp stores (design §11, ID-025); Gas and batteries live in `Power`. */
export const MATERIALS = [
  'scrap',
  'wood',
  'metal',
  'concrete',
  'parts',
  'food',
  'medicine',
  'chemicals',
  'genes',
] as const;
export type Material = (typeof MATERIALS)[number];
export type Stock = Record<Material, number>;
/**
 * The building materials: always on the stock bar, and all a save from before ID-025
 * (v3 and older) holds.
 */
export const BUILDING_MATERIALS: readonly Material[] = ['scrap', 'wood', 'metal', 'concrete'];
/** A full stock: `partial`'s counts, 0 for the rest. */
export const stockOf = (partial: Partial<Stock> = {}): Stock =>
  Object.fromEntries(MATERIALS.map((m) => [m, partial[m] ?? 0])) as Stock;

/** Wall `x` of each buildable layer, inner (left) to outer (right). */
export const COLUMNS: readonly number[] = [500, 760, 1020];

export type Tier = 'wood' | 'metal' | 'concrete' | 'reinforced';
/** In upgrade order. */
export const TIER_ORDER: readonly Tier[] = ['wood', 'metal', 'concrete', 'reinforced'];
export const TIERS: Readonly<
  Record<Tier, { readonly name: string; readonly hp: number; readonly cost: Partial<Stock> }>
> = {
  wood: { name: 'Wood', hp: 200, cost: { wood: 10, scrap: 5 } },
  metal: { name: 'Metal', hp: 400, cost: { metal: 10, scrap: 10 } },
  concrete: { name: 'Concrete', hp: 800, cost: { concrete: 10, scrap: 15 } },
  reinforced: { name: 'Reinforced', hp: 1600, cost: { concrete: 10, metal: 10, scrap: 20 } },
};
/** A gate has this share of its tier's HP and costs the same. */
export const GATE_HP = 0.75;

export type PostKind = 'tower' | 'wall-walk' | 'ground';
export const POST_KINDS: readonly PostKind[] = ['tower', 'wall-walk', 'ground'];
/**
 * Wall-walk spots side by side on each wall or gate segment, top to bottom; each holds
 * a post or a turret. Spot `s` stands at `y = (row + (s + 0.5) / WALK_SPOTS) × SEGMENT_HEIGHT`.
 */
export const WALK_SPOTS = 2; // the drawn platform (PIECE.walk in ui/projection.ts) is sized to fit two
/** Post `x` relative to its column's wall `x`. */
export const POST_OFFSET: Readonly<Record<PostKind, number>> = {
  'wall-walk': 10,
  tower: -80,
  ground: -160,
};
/** Range multiplier by post kind, for every gun; a sidearm fired on the move uses `ground`. */
export const POST_RANGE: Readonly<Record<PostKind, number>> = {
  tower: 1.25,
  'wall-walk': 1,
  ground: 0.75,
};
export const POST_COST: Readonly<Record<PostKind, Partial<Stock>>> = {
  tower: { wood: 20, scrap: 10 },
  'wall-walk': { wood: 5, scrap: 5 },
  ground: { wood: 5 },
};

/** How fast a defender walks between posts, in px/s. */
export const WALK_SPEED = 80;

/** Design §11 Start: 3 Food so a first loss doesn't leave the injured with none. */
export const START_STOCK: Readonly<Stock> = stockOf({ scrap: 60, wood: 60, food: 3 });
export const START_TIERS: readonly Tier[] = ['wood'];

// --- Horde rules (M3). Design §2, §4 and §11. ---

/** Defender HP in a horde, before Grit. */
export const DEFENDER_HP = 100;
/** How close a Shambler inside the camp must be to hit a defender: body to body. */
export const MELEE_REACH = 2 * ENEMY_RADIUS;
/** How close an enemy of `kind` inside the camp must be to hit a defender. */
export const meleeReach = (kind: EnemyKind): number => ENEMIES[kind].radius + ENEMY_RADIUS;
/** Seconds the camp holds with an enemy inside and no defender left, before the horde is lost. */
export const FALL_WARNING = 10;
/**
 * Horde payout: a win pays `base + perHorde × n` of each material (n = horde number);
 * a loss pays `lossShare × wave reached / wave count` of that, rounded down (design §2).
 */
export const HORDE_PAYOUT = {
  win: { scrap: { base: 15, perHorde: 5 }, wood: { base: 20, perHorde: 10 } },
  lossShare: 0.25,
} as const;
/**
 * Mutated Genes for a win (design §4, §11, ID-025 starting points): `base + ⌊n / every⌋`,
 * plus 1 per `perMutants` mutants killed and `boss` for a boss horde. A loss pays none.
 */
export const GENES = { base: 2, every: 5, perMutants: 5, boss: 10 } as const;
/** The enemy kinds that count as mutants for Genes (design §9). */
export const MUTANTS: readonly EnemyKind[] = ['crawler', 'spewer', 'swollen', 'brute', 'screamer'];
/**
 * A win's material find (design §4 "a small chance of materials"): `chance` of
 * `base + ⌊n / every⌋` of one of `materials`, evenly.
 */
export const FIND = {
  chance: 0.2,
  base: 2,
  every: 5,
  materials: ['parts', 'metal', 'food', 'medicine', 'chemicals'],
} as const satisfies {
  chance: number;
  base: number;
  every: number;
  materials: readonly Material[];
};
/** Defender XP for a win: `base + perHorde × n`, in full to everyone who took part. */
export const DEFENDER_XP = { base: 10, perHorde: 5 } as const;
/** Real time an injured defender rests before they can defend again, in ms (design §11). */
export const RECOVERY_MS = 2 * 60 * 60 * 1000;

// --- The camp (M8). Design §11, as built ID-033 (starting points). ---

/**
 * Camp capacity, the roster floor and camp levels: `slots` people to start, `perUpgrade`
 * more per material camp upgrade; below `floor` living defenders a free recruit arrives
 * every `recruitMs`; camp XP from level L to L + 1 is `levelXp × L`.
 */
export const CAMP_SIZE = {
  slots: 5,
  perUpgrade: 2,
  floor: 3,
  recruitMs: 60 * 60 * 1000,
  levelXp: 30,
} as const;
/** What each material camp upgrade costs, the first one first. */
export const CAMP_UPGRADES: readonly Partial<Stock>[] = [
  { wood: 60, scrap: 40 },
  { wood: 80, metal: 40, scrap: 60 },
  { metal: 80, concrete: 40, scrap: 80 },
];

export type CampPickId = 'scavenging' | 'stockpile' | 'salvage' | 'medic' | 'foraging';
export const CAMP_PICK_IDS: readonly CampPickId[] = [
  'scavenging',
  'stockpile',
  'salvage',
  'medic',
  'foraging',
];
/** Ranks each camp-level pick stacks to. */
export const CAMP_PICK_RANKS = 5;
/**
 * The permanent camp-level picks (design §11 Camp level), each `per` rank: kill cash
 * (+%), cash at the start of a horde, repair cost (−%), injury rest (−%), patrol
 * materials and Gas (+%).
 */
export const CAMP_PICKS: Readonly<Record<CampPickId, { name: string; per: number; text: string }>> =
  {
    scavenging: { name: 'Scavenging', per: 5, text: '+5% horde cash per kill' },
    stockpile: { name: 'Stockpile', per: 10, text: 'Start each horde with +10 cash' },
    salvage: { name: 'Salvage Crew', per: 10, text: 'Repairs cost 10% less' },
    medic: { name: 'Field Medic', per: 10, text: 'Injuries heal 10% faster' },
    foraging: { name: 'Foraging', per: 5, text: '+5% patrol materials and Gas' },
  };
/** Names the roster floor's free recruits are given. */
export const RECRUIT_NAMES: readonly string[] = [
  'Ava',
  'Ben',
  'Cole',
  'Dana',
  'Eli',
  'Faye',
  'Gus',
  'Hana',
  'Ivan',
  'Jade',
  'Kai',
  'Lena',
  'Max',
  'Nora',
  'Owen',
  'Rosa',
];

/** Chance per card slot of a recruit; a squad of `largeFrom` or more uses `large`. */
export const RECRUIT_CHANCE = { small: 0.3, large: 0.15, largeFrom: 3 } as const;

export type CardRarity = 'common' | 'rare' | 'epic';
/**
 * Design §8, as built ID-022: each offer slot's rarity odds in wave `w` (from 1) are
 * `start + per × (w − 1)` percent, held at `limit` (common never below, the rest never above).
 */
export const RARITY: Readonly<
  Record<CardRarity, { readonly start: number; readonly per: number; readonly limit: number }>
> = {
  common: { start: 70, per: -4, limit: 40 },
  rare: { start: 25, per: 3, limit: 45 },
  epic: { start: 5, per: 1, limit: 15 },
};

/**
 * What the in-horde cards do (design §8, as built ID-022). Shares are of the bullet's
 * damage; radii and ranges in px; times in s.
 */
export const CARD = {
  ricochet: { range: 150, share: 0.25 },
  split: { angle: 10, share: 0.5 },
  burn: { dps: 3, seconds: 3, spread: 40 },
  explode: { damage: 15, radius: 40, flash: 0.3 },
  chain: { chance: 0.1, targets: 2, radius: 100, share: 0.5, flash: 0.2 },
  /** Cleave share added to blade and tool hits (still capped at `STAT_EFFECT.cleaveCap`). */
  cleave: 0.2,
  /** Damage to an enemy each time it hits a standing segment. */
  spikes: 3,
  /** The field in front of the outermost standing layer, and how much it slows. */
  slowField: { reach: 120, slow: 0.3 },
  /** Share of `BANK_CAP` a Recharge adds. */
  recharge: 0.25,
} as const;

// --- Defender levels, stats and titles (M4). Design §6. ---

export type Stat = 'aim' | 'might' | 'tech' | 'grit';
export type Stats = Record<Stat, number>;
export const STATS: readonly Stat[] = ['aim', 'might', 'tech', 'grit'];
export const STAT_NAMES: Readonly<Record<Stat, string>> = {
  aim: 'Aim',
  might: 'Might',
  tech: 'Tech',
  grit: 'Grit',
};
/** The stat that feeds each profession; Grit feeds all. */
export const PROFESSION_STAT: Readonly<Record<Profession, Stat>> = {
  gunner: 'aim',
  ripper: 'might',
  engineer: 'tech',
};
/** XP from level L to L + 1 is `LEVEL_XP × L`. */
export const LEVEL_XP = 25;
export const POINTS_PER_LEVEL = 3;
/** Per point of the matching stat; crit and cleave are capped. Grit adds `gritHp` HP per point. */
export const STAT_EFFECT = {
  damage: 0.02,
  repair: 0.02,
  crit: 0.005,
  critCap: 0.5,
  critDamage: 2,
  cleave: 0.01,
  cleaveCap: 0.5,
  cleaveRadius: 30,
  gritHp: 5,
} as const;
/** Titles by profession level (points in the stat), lowest first; `bonus` multiplies the profession's output. */
export const TITLES: readonly {
  readonly at: number;
  readonly rank: string;
  readonly bonus: number;
}[] = [
  { at: 10, rank: 'Junior', bonus: 0.05 },
  { at: 25, rank: 'Adept', bonus: 0.15 },
  { at: 50, rank: 'Master', bonus: 0.3 },
  { at: 100, rank: 'Legendary', bonus: 0.5 },
];

// --- Research Lab, turrets and energy (M5). Design §7 and §11. ---

/** What each Research Lab level costs, level 1 first (design §11, as built ID-014). */
export const LAB_LEVELS: readonly Partial<Stock>[] = [
  { wood: 30, scrap: 20 },
  { wood: 80, scrap: 60 },
];

/** Active skills and commander perks are researched under their own ids (ID-019, ID-020). */
export type ResearchId =
  | 'metal-walls'
  | 'auto-turret'
  | 'flashbang'
  | 'molotov'
  | 'airstrike'
  | Exclude<PerkId, typeof START_PERK>
  | PerkSlotId;
/**
 * A research node: the Lab level and earlier node it needs, what it costs, and the
 * barrier tier it unlocks, if any. Completes at once (design §11, as built ID-014).
 */
export const RESEARCH: Readonly<
  Record<
    ResearchId,
    {
      readonly name: string;
      readonly lab: number;
      readonly needs: ResearchId | null;
      readonly cost: Partial<Stock>;
      readonly tier: Tier | null;
    }
  >
> = {
  'metal-walls': {
    name: 'Metal walls',
    lab: 1,
    needs: null,
    cost: { scrap: 40, wood: 40 },
    tier: 'metal',
  },
  'auto-turret': {
    name: 'Auto-turret',
    lab: 2,
    needs: 'metal-walls',
    cost: { scrap: 60, wood: 40 },
    tier: null,
  },
  flashbang: { name: 'Flashbang', lab: 1, needs: null, cost: { scrap: 30, wood: 20 }, tier: null },
  molotov: {
    name: 'Molotov',
    lab: 1,
    needs: 'flashbang',
    cost: { scrap: 30, wood: 30 },
    tier: null,
  },
  airstrike: {
    name: 'Airstrike',
    lab: 2,
    needs: 'molotov',
    cost: { scrap: 60, wood: 40 },
    tier: null,
  },
  'scavengers-eye': perkNode("Scavenger's Eye", 1, null, { scrap: 30, wood: 30 }),
  fortify: perkNode('Fortify', 1, null, { scrap: 40, wood: 40 }),
  'butchers-hunger': perkNode("Butcher's Hunger", 1, null, { scrap: 30, wood: 30 }),
  'rally-call': perkNode('Rally Call', 1, null, { scrap: 30, wood: 20 }),
  'second-look': perkNode('Second Look', 2, null, { scrap: 60, wood: 40 }),
  overclock: perkNode('Overclock', 2, 'auto-turret', { scrap: 60, wood: 40 }),
  'power-saver': perkNode('Power Saver', 2, 'auto-turret', { scrap: 60, wood: 40 }),
  'perk-slot-2': perkNode('Perk slot 2', 1, null, { scrap: 50, wood: 50 }),
  'perk-slot-3': perkNode('Perk slot 3', 2, 'perk-slot-2', { scrap: 80, wood: 80 }),
  'perk-slot-4': perkNode('Perk slot 4', 2, 'perk-slot-3', { scrap: 120, wood: 120 }),
};
export const RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[];

/** A turret sits on a tower or a wall-walk spot of the grid (design §7). */
export type TurretMount = Extract<PostKind, 'tower' | 'wall-walk'>;
export const TURRET_MOUNTS: readonly TurretMount[] = ['tower', 'wall-walk'];
/** Condition runs 0 (jammed) … `MAX_CONDITION`. */
export const MAX_CONDITION = 100;
/**
 * The Auto-turret (design §7): its cost and gun (bullets at `speed` px/s, ±`spread`°, looking like `tracer`); `draw` charge per second it has a
 * target; condition lost per shot (`shotWear`) and per point of damage its wall
 * segment takes (`hitWear`); below `slowBelow` it fires slower, down to half speed.
 * A full repair costs `repairScrap`; salvage refunds `salvage` × cost × condition share.
 * A standing Engineer within its tool's `buffRadius` repairs `engineerRepair` condition/s.
 */
export const TURRET = {
  cost: { scrap: 40, wood: 20 },
  damage: 5,
  fireInterval: 0.5,
  range: 500,
  speed: 2000,
  spread: 1,
  tracer: { length: 14, colour: '#ffe9a0' },
  draw: 1,
  shotWear: 0.2,
  hitWear: 0.5,
  slowBelow: 50,
  repairScrap: 20,
  salvage: 0.5,
  engineerRepair: 0.5,
} as const;
/** Turret range multiplier by mount. */
export const TURRET_RANGE: Readonly<Record<TurretMount, number>> = {
  tower: 1.25,
  'wall-walk': 1,
};

// --- Battery bank and generator (ID-015). Design §7. ---

export type Battery = 'makeshift' | 'standard' | 'high-capacity' | 'military';
/** Charge each battery quality holds, smallest first (design §7, as built ID-015). */
export const BATTERIES: Readonly<
  Record<Battery, { readonly name: string; readonly charge: number }>
> = {
  makeshift: { name: 'Makeshift', charge: 60 },
  standard: { name: 'Standard', charge: 100 },
  'high-capacity': { name: 'High-capacity', charge: 160 },
  military: { name: 'Military', charge: 250 },
};
export const BATTERY_IDS = Object.keys(BATTERIES) as Battery[];
/** The bank holds at most this much charge: 10 Standard batteries' worth. */
export const BANK_CAP = 10 * BATTERIES.standard.charge;
/**
 * The generator (design §7): built once for `cost`; burns 1 Gas every `gasMs` of real
 * time for `gasCharge` charge, while there is Gas and room in the bank.
 */
export const GENERATOR = {
  cost: { scrap: 40, wood: 20 },
  gasMs: 10 * 60 * 1000,
  gasCharge: BATTERIES.standard.charge / 2,
} as const;
/** A new game's batteries and Gas (design §11 start, PM decision D1 for ID-015). */
export const START_POWER: {
  readonly gas: number;
  readonly batteries: Partial<Record<Battery, number>>;
} = { gas: 4, batteries: { makeshift: 2 } };
/** Far past anything a game reaches; keeps every count a safe integer, and a save refuses more. */
export const MAX_COUNT = 1e12;
/** Gas each won horde pays, a stand-in until patrols bring it (PM decision D1). */
export const GAS_PER_WIN = 1;

// --- Basic traps (ID-017). Design §7. ---

export type TrapKind = 'spikes' | 'wire';
/** The outer layer's trap strip: one cell per row, `x` in `[x, x + width]` (PM decision D1). */
export const TRAP_STRIP = { x: 1100, width: 120 } as const;
/**
 * A basic trap (design §7): its cost, the damage it deals an enemy that triggers it,
 * and the speed factor it holds that enemy to while inside its cell.
 */
export const TRAPS: Readonly<
  Record<
    TrapKind,
    {
      readonly name: string;
      readonly cost: Partial<Stock>;
      readonly damage: number;
      readonly slow: number;
    }
  >
> = {
  spikes: { name: 'Spikes', cost: { wood: 15, scrap: 10 }, damage: 8, slow: 1 },
  wire: { name: 'Barbed wire', cost: { wood: 10, scrap: 15 }, damage: 0, slow: 0.5 },
};
export const TRAP_KINDS = Object.keys(TRAPS) as TrapKind[];
/** Durability a trap is built with; each trigger costs 1, and at 0 it is broken (PM decision D2). */
export const TRAP_DURABILITY = 30;
/** Removing a trap refunds this share of its cost × its durability share, rounded down. */
export const TRAP_REFUND = 0.5;

// --- Horde cash shop (ID-018). Design §4. ---

export type BuffId = 'adrenaline' | 'overdrive';
export type ShopItem = BuffId | 'patch' | 'fix';
/**
 * What horde cash buys mid-fight: two timed buffs for defenders and turrets
 * (`damage` / `fireRate` factors, `seconds` of fight time), a wall patch (`hp` to the
 * most damaged standing segment) and a turret fix (`condition` to the most worn turret).
 */
export const SHOP = {
  adrenaline: { name: 'Adrenaline', cost: 30, damage: 1.25, fireRate: 1, seconds: 30 },
  overdrive: { name: 'Overdrive', cost: 30, damage: 1, fireRate: 1.25, seconds: 30 },
  patch: { name: 'Patch wall', cost: 20, hp: 100 },
  fix: { name: 'Fix turret', cost: 20, condition: 30 },
} as const;
export const SHOP_ITEMS = Object.keys(SHOP) as ShopItem[];
export const BUFF_IDS: readonly BuffId[] = ['adrenaline', 'overdrive'];

// --- Active skills (ID-019). Design §4. ---

export type SkillId = 'flashbang' | 'molotov' | 'airstrike';
/**
 * Skills bought with horde cash, each researched at the Lab first and hitting enemies
 * only, within `radius` of where each lands. `aim` is what the player picks: an airstrike
 * a row, carpet bombed from the outer wall's front to the field's end, a bomb dealing
 * `damage` every `every` s, `2 × radius` apart; a flashbang or a molotov nothing: `count`
 * land at random on the field past the outer wall, one every `every` s, a flashbang
 * stunning (no moving, no attacking) for `seconds`, a molotov's fire dealing `dps` for
 * `seconds` (ID-041). `cooldown` is fight seconds after a use.
 */
export const SKILLS = {
  flashbang: {
    name: 'Flashbang',
    aim: 'none',
    cost: 20,
    cooldown: 25,
    radius: 100,
    seconds: 3,
    count: 4,
    every: 0.15,
  },
  molotov: {
    name: 'Molotov',
    aim: 'none',
    cost: 25,
    cooldown: 20,
    radius: 50,
    dps: 5,
    seconds: 6,
    count: 5,
    every: 0.15,
  },
  airstrike: {
    name: 'Airstrike',
    aim: 'row',
    cost: 40,
    cooldown: 40,
    radius: 60,
    damage: 40,
    every: 0.1,
  },
} as const;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
/** How long a skill's flash stays on screen, in seconds. */
export const SKILL_FLASH = 0.4;

// --- Commander perks (ID-020). Design §5. ---

export type PerkId =
  | 'steady-fire'
  | 'scavengers-eye'
  | 'fortify'
  | 'butchers-hunger'
  | 'rally-call'
  | 'second-look'
  | 'overclock'
  | 'power-saver';
/** Battlefield-wide effects the commander equips between hordes, one per perk slot. */
export const PERKS: Readonly<Record<PerkId, { readonly name: string; readonly text: string }>> = {
  'steady-fire': { name: 'Steady Fire', text: 'Guns fire 15% faster' },
  'scavengers-eye': { name: "Scavenger's Eye", text: '+25% horde cash' },
  fortify: { name: 'Fortify', text: 'Barrier segments +30% max HP' },
  'butchers-hunger': {
    name: "Butcher's Hunger",
    text: 'Blade and tool kills heal the nearest damaged wall 3 HP',
  },
  'rally-call': { name: 'Rally Call', text: 'Recruit cards appear twice as often' },
  'second-look': { name: 'Second Look', text: 'Reroll the card offer once per wave' },
  overclock: { name: 'Overclock', text: 'Turrets +20% damage, +10% energy use' },
  'power-saver': { name: 'Power Saver', text: 'Turrets use 25% less energy' },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];
/** The perk a new game has unlocked and equipped; every other one is researched. */
export const START_PERK = 'steady-fire';
export type PerkSlotId = 'perk-slot-2' | 'perk-slot-3' | 'perk-slot-4';
/** Research nodes that each add a perk slot to the 1 a new game has. */
export const PERK_SLOT_IDS: readonly PerkSlotId[] = ['perk-slot-2', 'perk-slot-3', 'perk-slot-4'];
/** Perk effect sizes (design §5, starting points; as built ID-020). */
export const PERK = {
  /** Steady Fire: gun fire-rate factor. */
  steadyFire: 1.15,
  /** Scavenger's Eye: kill-cash factor. */
  cash: 1.25,
  /** Fortify: segment max-HP factor for the fight. */
  fortify: 1.3,
  /** Butcher's Hunger: HP a blade or tool kill heals. */
  butcherHeal: 3,
  /** Rally Call: recruit-chance factor. */
  rally: 2,
  /** Overclock: turret damage and charge-draw factors. */
  overclock: { damage: 1.2, draw: 1.1 },
  /** Power Saver: turret charge-draw factor. */
  powerSaver: 0.75,
} as const;

function perkNode(
  name: string,
  lab: number,
  needs: ResearchId | null,
  cost: Partial<Stock>,
): (typeof RESEARCH)[ResearchId] {
  return { name, lab, needs, cost, tier: null };
}

// --- World map and patrols (M7). Design §10, as built ID-026 (starting points). ---

export type LocationId =
  | 'gas-station'
  | 'supermarket'
  | 'electronics'
  | 'hardware'
  | 'pharmacy'
  | 'construction'
  | 'police'
  | 'hospital'
  | 'military'
  | 'crater';

/**
 * One loot-table line, picked by `weight`: some of a material, some Gas, one battery,
 * a weapon of one of `bases`, or (the crater) a roll on another location's table.
 */
export type LootEntry =
  | { kind: 'material'; id: Material; min: number; max: number; weight: number }
  | { kind: 'gas'; min: number; max: number; weight: number }
  | { kind: 'battery'; id: Battery; weight: number }
  | { kind: 'weapon'; bases: readonly WeaponId[]; weight: number }
  | { kind: 'anything'; weight: number };

export interface Location {
  readonly name: string;
  /** Danger tier, 1 (Safe) … 5. */
  readonly tier: number;
  /** Minutes each way, and minutes searching. */
  readonly travel: number;
  readonly search: number;
  /** The horde number from which it shows on the map; null until research reveals it (ID-035). */
  readonly reveal: number | null;
  readonly loot: readonly LootEntry[];
}

const mat = (id: Material, min: number, max: number, weight: number): LootEntry => ({
  kind: 'material',
  id,
  min,
  max,
  weight,
});

/**
 * The single-building locations (design §10). "Mostly" lines weigh about 3× the
 * "sometimes" ones. Stand-ins until the items exist: the toolkit for Tools, the knife
 * for a machete or chainsaw; ammo-type affixes are left out.
 */
export const LOCATIONS: Readonly<Record<LocationId, Location>> = {
  'gas-station': {
    name: 'Gas station',
    tier: 1,
    travel: 5,
    search: 5,
    reveal: 1,
    loot: [
      { kind: 'gas', min: 1, max: 2, weight: 30 },
      { kind: 'battery', id: 'makeshift', weight: 20 },
      mat('food', 1, 2, 30),
      mat('scrap', 3, 6, 10),
    ],
  },
  supermarket: {
    name: 'Supermarket',
    tier: 1,
    travel: 7,
    search: 6,
    reveal: 1,
    loot: [mat('food', 2, 3, 60), { kind: 'battery', id: 'makeshift', weight: 15 }],
  },
  electronics: {
    name: 'Electronics store',
    tier: 2,
    travel: 15,
    search: 15,
    reveal: 1,
    loot: [
      mat('parts', 2, 4, 40),
      { kind: 'battery', id: 'standard', weight: 20 },
      mat('scrap', 4, 8, 15),
    ],
  },
  hardware: {
    name: 'Hardware store',
    tier: 2,
    travel: 20,
    search: 20,
    reveal: 4,
    loot: [
      mat('wood', 8, 15, 25),
      mat('metal', 3, 6, 20),
      mat('scrap', 5, 10, 15),
      { kind: 'weapon', bases: ['toolkit'], weight: 5 },
    ],
  },
  pharmacy: {
    name: 'Pharmacy',
    tier: 2,
    travel: 20,
    search: 20,
    reveal: 6,
    loot: [mat('medicine', 1, 3, 60), mat('chemicals', 1, 2, 20)],
  },
  construction: {
    name: 'Construction site',
    tier: 3,
    travel: 40,
    search: 40,
    reveal: null,
    loot: [
      mat('concrete', 5, 10, 30),
      mat('metal', 4, 8, 30),
      { kind: 'weapon', bases: ['knife'], weight: 10 },
    ],
  },
  police: {
    name: 'Police station',
    tier: 3,
    travel: 40,
    search: 40,
    reveal: null,
    loot: [{ kind: 'weapon', bases: ['pistol', 'shotgun', 'smg'], weight: 60 }],
  },
  hospital: {
    name: 'Hospital',
    tier: 4,
    travel: 60,
    search: 60,
    reveal: null,
    loot: [mat('medicine', 3, 6, 60), mat('chemicals', 2, 4, 15), mat('genes', 1, 3, 5)],
  },
  military: {
    name: 'Military depot',
    tier: 4,
    travel: 80,
    search: 80,
    reveal: null,
    loot: [
      { kind: 'weapon', bases: ['rifle', 'lmg', 'sniper'], weight: 30 },
      { kind: 'battery', id: 'high-capacity', weight: 30 },
      mat('parts', 3, 6, 20),
    ],
  },
  crater: {
    name: 'The crater',
    tier: 5,
    travel: 160,
    search: 160,
    reveal: null,
    loot: [
      mat('genes', 3, 6, 30),
      { kind: 'weapon', bases: ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper'], weight: 30 },
      { kind: 'anything', weight: 20 },
    ],
  },
};
export const LOCATION_IDS = Object.keys(LOCATIONS) as LocationId[];

/**
 * Patrol rules (design §10, ID-026 starting points):
 * - `unlock`: the horde number from which patrols can be sent (after Horde 2).
 * - `rolls`: loot rolls per search; `bonusRolls` more at most, one per `need × tier` of party strength.
 * - `bump`: chance per bonus roll that a weapon comes one rarity up.
 * - `rarity`: a found weapon's rarity weights by tier (index 0 = tier 1).
 * - `xpDanger`: patrol XP multiplier per tier above 1 (tier 5 = 3×).
 * - `reports`: patrol reports kept, newest last.
 * - `max`: patrols a game can send, so every patrol number fits in a weapon uid.
 * - `danger`: a location's danger is `danger × need × tier` of party strength (ID-027).
 * - `risk`: each rating, safest first, from the lowest strength-to-danger ratio it
 *   covers, with the chance each member is injured or killed and the party wiped out.
 * - `left`: weapons the dead may leave across the map; past that the oldest is lost,
 *   so a save stays small.
 */
export const PATROL = {
  unlock: 3,
  rolls: 3,
  bonusRolls: 2,
  need: 3,
  bump: 0.25,
  rarity: [
    { rusty: 50, common: 40, military: 10, prototype: 0, relic: 0 },
    { rusty: 35, common: 45, military: 18, prototype: 2, relic: 0 },
    { rusty: 20, common: 45, military: 28, prototype: 7, relic: 0 },
    { rusty: 5, common: 35, military: 40, prototype: 18, relic: 2 },
    { rusty: 0, common: 15, military: 40, prototype: 30, relic: 15 },
  ],
  xpDanger: 0.5,
  reports: 20,
  max: 999_999,
  danger: 2,
  risk: [
    { rating: 'safe', from: 1, injured: 0.05, dead: 0, wipe: 0 },
    { rating: 'risky', from: 0.6, injured: 0.15, dead: 0.03, wipe: 0 },
    { rating: 'dangerous', from: 0.3, injured: 0.3, dead: 0.1, wipe: 0.05 },
    { rating: 'deadly', from: 0, injured: 0.4, dead: 0.2, wipe: 0.2 },
  ],
  left: 40,
} as const satisfies {
  unlock: number;
  rolls: number;
  bonusRolls: number;
  need: number;
  bump: number;
  rarity: readonly Record<Rarity, number>[];
  xpDanger: number;
  reports: number;
  max: number;
  danger: number;
  risk: readonly {
    rating: string;
    from: number;
    injured: number;
    dead: number;
    wipe: number;
  }[];
  left: number;
};
/** How a patrol's odds read before it leaves (design §10 Risk and reward). */
export type RiskRating = (typeof PATROL.risk)[number]['rating'];
