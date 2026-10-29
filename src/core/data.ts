// Every M1 number lives here. Each is a design starting point (docs/design.md),
// tuned in play, never scattered through the simulation.

/** Fixed simulation step in seconds: results never depend on frame rate. */
export const STEP = 1 / 30;

/** The open field: `x` runs 0…right (camp left, horde from the right), `y` 0…height. */
export const FIELD = { right: 1600, height: 400 } as const;

export const CAMP = { x: 120, maxHp: 500 } as const;
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

export type WeaponId = 'pistol';
export const WEAPONS: Readonly<
  Record<
    WeaponId,
    { readonly damage: number; readonly fireInterval: number; readonly range: number }
  >
> = {
  pistol: { damage: 6, fireInterval: 0.6, range: 600 },
};

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
/** Range multiplier by post kind. */
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

export const START_STOCK: Readonly<Stock> = { scrap: 60, wood: 60, metal: 0, concrete: 0 };
export const START_TIERS: readonly Tier[] = ['wood'];

/** Chance per card slot of a recruit; a squad of `largeFrom` or more uses `large`. */
export const RECRUIT_CHANCE = { small: 0.3, large: 0.15, largeFrom: 3 } as const;
