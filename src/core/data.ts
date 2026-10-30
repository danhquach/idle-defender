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
  'shambler' | 'runner' | 'crawler' | 'bloater' | 'spitter' | 'brute' | 'screamer' | 'horror';
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
  // Its hit is its blast (BLOATER); `damage` is what it does to a defender in the camp.
  bloater: { hp: 60, speed: 18, damage: 50, attackInterval: 1, radius: 18, xp: 3, cash: 4 },
  spitter: { hp: 25, speed: 28, damage: 8, attackInterval: 2, radius: 12, xp: 2, cash: 3 },
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
  spitter: { from: 6, share: 0.1 },
  bloater: { from: 7, share: 0.1 },
  brute: { from: 8, share: 0.1 },
  screamer: { from: 9, share: 0.1 },
};
/** A Crawler climbs the first standing segment it reaches for `time` s, then drops behind it. */
export const CRAWLER = { climb: 3 } as const;
/**
 * A Bloater at a standing segment blows up: `wall` to it, `splash` to the segments above
 * and below; its burst is drawn for `burst` s.
 */
export const BLOATER = { wall: 150, splash: 50, burst: 0.4 } as const;
/**
 * A Spitter stops `stop` px short of its stop line (so the wall-walk is in reach) and
 * spits at anything within `range`; each glob is drawn for `splash` s (it lands at once).
 */
export const SPITTER = { stop: 150, range: 250, splash: 0.3 } as const;
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

export type Material = 'scrap' | 'wood' | 'metal' | 'concrete';
export type Stock = Record<Material, number>;
export const MATERIALS: readonly Material[] = ['scrap', 'wood', 'metal', 'concrete'];

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

export const START_STOCK: Readonly<Stock> = { scrap: 60, wood: 60, metal: 0, concrete: 0 };
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
/** Defender XP for a win: `base + perHorde × n`, in full to everyone who took part. */
export const DEFENDER_XP = { base: 10, perHorde: 5 } as const;
/** Real time an injured defender rests before they can defend again, in ms (design §11). */
export const RECOVERY_MS = 2 * 60 * 60 * 1000;

/** Chance per card slot of a recruit; a squad of `largeFrom` or more uses `large`. */
export const RECRUIT_CHANCE = { small: 0.3, large: 0.15, largeFrom: 3 } as const;

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

/** Active skills are researched under their own ids (ID-019). */
export type ResearchId = 'metal-walls' | 'auto-turret' | 'flashbang' | 'molotov' | 'airstrike';
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
 * Click-to-target skills bought with horde cash, each researched at the Lab first and
 * hitting enemies only, within `radius` of the aim point: an airstrike deals `damage`
 * at once, a molotov leaves a fire dealing `dps` for `seconds`, a flashbang stuns
 * (no moving, no attacking) for `seconds`. `cooldown` is fight seconds after a use.
 */
export const SKILLS = {
  flashbang: { name: 'Flashbang', cost: 20, cooldown: 25, radius: 150, seconds: 3 },
  molotov: { name: 'Molotov', cost: 25, cooldown: 20, radius: 80, dps: 5, seconds: 6 },
  airstrike: { name: 'Airstrike', cost: 40, cooldown: 40, radius: 120, damage: 40 },
} as const;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
/** How long a skill's flash stays on screen, in seconds. */
export const SKILL_FLASH = 0.4;
