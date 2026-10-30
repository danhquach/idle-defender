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

/**
 * A gun shoots within `range` (× the post's multiplier), `magazine` rounds between
 * reloads of `reload` s. A sidearm goes in either slot and suits everyone; a
 * specialised gun is primary only and suits Gunners (design §6 Loadout).
 */
export interface Gun {
  readonly name: string;
  readonly kind: 'sidearm' | 'gun';
  readonly damage: number;
  readonly fireInterval: number;
  readonly range: number;
  readonly magazine: number;
  readonly reload: number;
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
    damage: 6,
    fireInterval: 0.6,
    range: 600,
    magazine: 10,
    reload: 1.5,
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
/** A pierced shot hits the nearest enemy within `width` of its line, up to `reach` past the target. */
export const PIERCE = { width: 2 * ENEMY_RADIUS, reach: 200 } as const;

export type ItemId = 'shield';
export const ITEMS: Readonly<Record<ItemId, { readonly name: string }>> = {
  shield: { name: 'Shield' },
};

/** A Gunner with any gun: fire rate and reload speed up, crit chance on top of Aim's. */
export const GUNNER = { fireRate: 0.15, reload: 0.25, crit: 0.05 } as const;
/** A non-Gunner with a specialised gun: damage down, reload time up. */
export const OFF_PROFESSION = { damage: 0.3, reload: 0.5 } as const;
/** A Gunner's sidearm fires while the primary reloads, at enemies within this many px. */
export const SIDEARM_CLOSE = 200;
/** A shield (Ripper only): damage taken down; the holder's gun fire rate and walk speed down. */
export const SHIELD = { damageTaken: 0.3, fireRate: 0.2, walk: 0.2 } as const;

/** Fire-rate bonus for defenders beside an Engineer; several Engineers don't stack. */
export const ENGINEER_BUFF = 0.15;

export type EnemyKind = 'shambler';
export const ENEMIES: Readonly<
  Record<
    EnemyKind,
    {
      readonly hp: number;
      readonly speed: number;
      readonly damage: number;
      readonly attackInterval: number;
      readonly xp: number;
      /** Horde cash its kill pays (design §4). */
      readonly cash: number;
    }
  >
> = {
  shambler: { hp: 20, speed: 30, damage: 5, attackInterval: 1, xp: 1, cash: 2 },
};

export const SPAWN_INTERVAL = 0.8;
export const WAVE_BREAK = 3;
/** How long a shot line stays on screen, in seconds. */
export const SHOT_TRAIL = 0.15;

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
/** How close an enemy inside the camp must be to hit a defender. */
export const MELEE_REACH = 2 * ENEMY_RADIUS;
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
 * The Auto-turret (design §7): its cost and gun; `draw` charge per second it has a
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
