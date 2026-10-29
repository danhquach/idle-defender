// Every M1 number lives here. Each is a design starting point (docs/design.md),
// tuned in play, never scattered through the simulation.

/** Fixed simulation step in seconds: results never depend on frame rate. */
export const STEP = 1 / 30;

/** The open field: `x` runs 0…right (camp left, horde from the right), `y` 0…height. */
export const FIELD = { right: 1600, height: 400 } as const;

/** The camp line: an enemy inside the camp with no defender to hit waits here. */
export const CAMP = { x: 120 } as const;
/** Wall thickness along `x`; a layer's wall spans `[x, x + depth]`. */
export const WALL = { depth: 20 } as const;
/** Segments per layer, top to bottom; row `r` covers `y` in `[r, r + 1) * SEGMENT_HEIGHT`. */
export const SEGMENTS = 5;
export const SEGMENT_HEIGHT = FIELD.height / SEGMENTS;

export const ENEMY_RADIUS = 12;
/** Most a crowded enemy is pushed aside per second. */
export const SEPARATION_SPEED = 60;
/** How close to a wall an enemy must be to slide toward a broken segment. */
export const GAP_SENSE = 200;

// --- Professions (M4). The equipped weapon decides the profession; design §6. ---

export type Profession = 'gunner' | 'ripper' | 'engineer';
export const PROFESSIONS: Readonly<Record<Profession, { readonly name: string }>> = {
  gunner: { name: 'Gunner' },
  ripper: { name: 'Ripper' },
  engineer: { name: 'Engineer' },
};

/** Gunners shoot within `range` (× the post's multiplier). */
interface Gun {
  readonly name: string;
  readonly profession: 'gunner';
  readonly damage: number;
  readonly fireInterval: number;
  readonly range: number;
}
/** Rippers strike within `reach` of their post; never from a tower. */
interface Blade {
  readonly name: string;
  readonly profession: 'ripper';
  readonly damage: number;
  readonly fireInterval: number;
  readonly reach: number;
}
/**
 * Engineers shoot, weaker than a Gunner, and mostly repair: `repair` HP/s of their
 * layer (their row ±1); they speed up defenders within `buffRadius` by `ENGINEER_BUFF`.
 */
interface Tool {
  readonly name: string;
  readonly profession: 'engineer';
  readonly damage: number;
  readonly fireInterval: number;
  readonly range: number;
  readonly repair: number;
  readonly buffRadius: number;
}
export type Weapon = Gun | Blade | Tool;

export const WEAPONS = {
  pistol: { name: 'Pistol', profession: 'gunner', damage: 7, fireInterval: 0.6, range: 600 },
  knife: { name: 'Knife', profession: 'ripper', damage: 10, fireInterval: 0.5, reach: 50 },
  toolkit: {
    name: 'Toolkit',
    profession: 'engineer',
    damage: 4,
    fireInterval: 0.6,
    range: 450,
    repair: 3,
    buffRadius: 100,
  },
} as const satisfies Record<string, Weapon>;
export type WeaponId = keyof typeof WEAPONS;

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
    }
  >
> = {
  shambler: { hp: 20, speed: 30, damage: 5, attackInterval: 1, xp: 1 },
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
/** Post `x` relative to its column's wall `x`. */
export const POST_OFFSET: Readonly<Record<PostKind, number>> = {
  'wall-walk': 10,
  tower: -80,
  ground: -160,
};
/** Range multiplier by post kind, for guns (Gunners and Engineers). */
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

/** Defender HP in a horde (Grit adds to it with ID-011). */
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
