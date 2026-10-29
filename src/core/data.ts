// Every M1 number lives here. Each is a design starting point (docs/design.md),
// tuned in play, never scattered through the simulation.

/** Fixed simulation step in seconds: results never depend on frame rate. */
export const STEP = 1 / 30;

export const LANES = 5;
export const LANE_SPACING = 80;
export const FIELD_RIGHT = 1600;

export const CAMP = { x: 120, maxHp: 500 } as const;
export const WALL = { x: 500, depth: 20, segmentHp: 200 } as const;

export const POSTS: readonly { x: number; lane: number; kind: 'tower' }[] = [
  { x: 420, lane: 1, kind: 'tower' },
  { x: 420, lane: 3, kind: 'tower' },
];

/** Range multiplier for a defender on a tower post. */
export const TOWER_RANGE_BONUS = 1.25;

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

/** Chance per card slot of a recruit; a squad of `largeFrom` or more uses `large`. */
export const RECRUIT_CHANCE = { small: 0.3, large: 0.15, largeFrom: 3 } as const;
