import {
  postXY,
  spotOf,
  type Base,
  type PostKind,
  type SegmentKind,
  type Tier,
  type TrapKind,
  type TurretMount,
} from './base.ts';
import { levelUp, postUsable } from './cards.ts';
import { levelScale } from './perks.ts';
import {
  BANK_CAP,
  CAMP,
  CARD,
  CARD_MAX_LEVEL,
  COLUMNS,
  ENEMIES,
  ENGINEER_BUFF,
  ENEMY_RADIUS,
  PERK,
  PIERCE,
  FALL_WARNING,
  FIELD,
  GAP_SENSE,
  HEAVY_KINDS,
  MAX_CONDITION,
  POST_RANGE,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SEPARATION_SPEED,
  SHIELD,
  SIDEARM_CLOSE,
  SQUAD_LINE,
  STEP,
  STRIKE_FLASH,
  MUZZLE_FLASH,
  MUTANTS,
  IMPACT_FLASH,
  DAMAGE_POP,
  TRAP_RESEARCH,
  TRAP_STRIP,
  TRAPS,
  TURRET,
  TURRET_RANGE,
  WALK_SPEED,
  WALL,
  WAVE_BREAK,
  SHOP,
  SKILL_FLASH,
  SKILLS,
  SWOLLEN,
  BRUTE,
  CRAWLER,
  HORROR,
  BOSS_SKILL,
  ELITE,
  SCREAMER,
  SPEWER,
  SWARM,
  TIMED_SKILLS,
  TRAIT,
  type BossSkill,
  type BuffId,
  type EnemyKind,
  type PerkId,
  type ResearchId,
  type SkillId,
  type Stats,
  type Tracer,
} from './data.ts';
import { affixShare, baseOf, gunCrit, gunCritDamage, pierceOf, type Held } from './armoury.ts';
import {
  gunOf,
  isGun,
  isSidearm,
  meleeOf,
  professionOf,
  toolOf,
  weaponOf,
  type Loadout,
} from './loadout.ts';
import { openReplace } from './replace.ts';
import { chance, int, rngFrom, type Rng, type RngState } from './rng.ts';
import {
  critChance,
  critDamage,
  damageFactor,
  damageTaken,
  dodgeChance,
  fireRateFactor,
  maxHpOf,
  reloadTime,
  spreadOf,
  wallDamage,
} from './stats.ts';
import {
  enemyHp,
  fastWaves,
  hordeBosses,
  kindFor,
  spawnInterval,
  swarmWave,
  waveCount,
  waveMix,
  waveSize,
  type BossSpec,
} from './waves.ts';

export type UpgradeId =
  | 'sharpshooter'
  | 'rapid-fire'
  | 'long-sight'
  | 'patch-up'
  | 'reinforce'
  | 'piercing-rounds'
  | 'ricochet'
  | 'speed-loaders'
  | 'extended-mags'
  | 'incendiary-rounds'
  | 'concussion-rounds'
  | 'frag-grenades'
  | 'shock-rounds'
  | 'barbed-wire'
  | 'recharge'
  | 'power-surge'
  | 'hollow-points'
  | 'field-repairs';

export interface DefenderSpec {
  id: string;
  name: string;
  loadout: Loadout;
  /** Permanent stats from the roster (design §6); none means all 0. */
  stats?: Readonly<Stats>;
  /** A horde-only survivor (ID-066): no profession, its bonuses, title or badge. */
  plain?: true;
}

/** The spec a fight defender came from, stats and all. */
export function specOf(d: DefenderSpec): DefenderSpec {
  const { id, name, stats } = d;
  const loadout = { ...d.loadout };
  const spec: DefenderSpec = stats
    ? { id, name, loadout, stats: { ...stats } }
    : { id, name, loadout };
  if (d.plain) spec.plain = true;
  return spec;
}
export interface HordeSetup {
  hordeNumber: number;
  roster: DefenderSpec[];
  startDefenderId: string;
  base: Base;
  /** Index into `base.posts`; valid only for this `base` (building a post re-sorts them). */
  startPostId: number;
  /** The battery bank's charge at the start (design §7). */
  bank: number;
  /** When the fight started (ms since the epoch), so the generator skips it. */
  startedAt: number;
  /** Active skills researched at the Lab (design §4). */
  skills: readonly SkillId[];
  /** The commander's equipped perks (design §5). */
  perks: readonly PerkId[];
  /** Each perk's level (design §5, ID-035); an equipped perk missing here is level 1. */
  perkLevels?: Readonly<Partial<Record<PerkId, number>>>;
  /** Research done (ID-035): trap upgrades and research cards act in the fight. */
  research?: readonly ResearchId[];
  /** The battery bank's cap (design §7); `BANK_CAP` by default. */
  bankCap?: number;
  /** Kill-cash factor and starting cash from camp-level picks (design §11); 1 and 0 by default. */
  cashRate?: number;
  startCash?: number;
  /** The only upgrade cards this fight may offer (ID-066); every card when absent. */
  cards?: readonly UpgradeId[];
  /** Enemy HP's factor for this horde (ID-066); `HP_GROWTH` per horde when absent. */
  hpScale?: number;
  /** Multiplies the defender XP a win gives (ID-066); 1 when absent. */
  xpRate?: number;
  /**
   * The horde-only firing line's slots (ID-068), after `base.posts` as `'line'` posts in
   * this order: slot `i` is post `base.posts.length + i`, which `startPostId` may name.
   */
  line?: readonly { x: number; y: number }[];
  /** Where enemies spawn along `x` (ID-068); `FIELD.right` when absent. */
  spawnX?: number;
  /**
   * The horde-only build's harder hordes (ID-099): swarm waves, several bosses with two
   * skills each, mini-bosses and a growing brood. The full game's rules when absent.
   */
  harder?: boolean;
  /**
   * The horde-only build's skills (ID-100): no cash, so they run on cooldown only, and
   * each use works `power` times as hard (`SQUAD_SKILLS.solo` for one picked alone). The
   * full game's paid skills, at 1×, when absent.
   */
  freeSkills?: { power: number };
}
export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** The wave it came with (ID-128: horde-only waves overlap); none for a test's own. */
  wave?: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  nextAttackAt: number;
  /** Past every layer: it hunts defenders and walls no longer stop it (sticky). */
  inCamp: boolean;
  /** Fight time a flashbang stuns it until (no moving, no attacking); 0 = never. */
  stunnedUntil: number;
  /** Velocity over the last step in px/s, which shooters lead (design §6 Ballistics). */
  vx: number;
  vy: number;
  /** A Crawler on a wall: fight time it drops behind it; 0 = not climbing. */
  climbUntil: number;
  /** A Crawler that has climbed a wall: it climbs only once (design §9). */
  climbed: boolean;
  /** A boss's or mini-boss's skill clocks (design §9, ID-024, ID-099); no one else has one. */
  horror?: HorrorClock;
  /** A mini-boss (ID-099): drawn `ELITE.size` times as big, its body too. */
  elite?: true;
  /** A boss's Roar (ID-099): fight time it moves faster until; absent = never roared at. */
  roarUntil?: number;
  /** Incendiary Rounds (design §8): fight time it burns until; absent or 0 = not burning. */
  burnUntil?: number;
  /** Incendiary Rounds: what its burn deals a second, set by the hit that lit it (ID-097). */
  burnDps?: number;
  /** A flashbang (ID-107): fight time its daze ends, for the view's stars; absent = never. */
  dazedUntil?: number;
  /** Shock Rounds (ID-097): fight time its latest paralysis ends; absent = never shocked. */
  shockUntil?: number;
  /** Concussion Rounds (ID-097): fight time it was last knocked back; absent = never. */
  pushedAt?: number;
  /** Concussion Rounds (ID-124): px it has been knocked back in all; absent = 0. */
  pushed?: number;
  /** A Shotgun's stagger (ID-101): fight time the latest one began, and ends; absent = never. */
  staggerAt?: number;
  staggerUntil?: number;
  /** An LMG's slow (ID-101): fight time it ends, and its share off speed; absent = never. */
  slowUntil?: number;
  slowBy?: number;
  /**
   * All the HP fire has taken from it so far (Incendiary Rounds and molotov fires); absent = 0.
   * Cosmetic: the view (ID-089) flashes a hit only for HP lost beyond it, so a burning
   * enemy doesn't strobe white every step.
   */
  burnt?: number;
}
/** Fight times are when, so they stop during picks; a stun pushes them back. */
export interface HorrorClock {
  /** Which of the horde's `bosses` it is. */
  boss: number;
  /** Its skills, in the boss bar's order. */
  skills: BossSkill[];
  /** When each of its timed skills (`TIMED_SKILLS`) goes off next; it winds up before. */
  next: Partial<Record<BossSkill, number>>;
  /** When each timed skill last went off (the boss bar keeps naming it a while). */
  fired: Partial<Record<BossSkill, number>>;
  /** A charge runs until then; 0 = not charging. */
  chargeUntil: number;
  /** Its first wall hit in this charge is done. */
  charged: boolean;
  /** When it last lost HP, and its HP after the last step, to tell a hit. */
  hitAt: number;
  seenHp: number;
  /** Broods it has spawned: a horde-only brood grows with each (ID-099). */
  broods: number;
  /** Armour plates: broken once `BOSS_SKILL.plates.share` of its HP is gone, for good. */
  platesOff: boolean;
}
/**
 * A boss's thrown slab (ID-099), from `(fromX, fromY)` at `at` to `(x, y)`, landing at
 * `lands`: on Barbed Wire's row `row` (`column` null) or on that row of layer `column`'s
 * wall (the nearest standing segment when it lands). Drawn until `BOSS_SKILL.slab.flight`
 * after it lands; it hits once.
 */
export interface Slab {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
  lands: number;
  row: number;
  column: number | null;
  landed: boolean;
}
/** An unbuilt slot is `{ kind: null, tier: null, hp: 0, maxHp: 0 }`: an open gap. */
export interface Segment {
  index: number;
  kind: SegmentKind | null;
  tier: Tier | null;
  hp: number;
  maxHp: number;
  /** When its latest hit flash began (ID-072): a blow that took HP, at most one per `HIT_MARK_GAP` s; absent = none this fight. */
  hitAt?: number;
  /** When a repair card last healed it (ID-075); absent = none this fight. A segment already whole gets none. */
  repairAt?: number;
}
/** One wall layer: `SEGMENTS` segments, top to bottom. */
export interface Layer {
  column: number;
  x: number;
  segments: Segment[];
}
/**
 * A fight post's kind: a base post's, or a slot on the horde-only firing line (ID-068),
 * on the ground behind the wall. A line slot exists only in a fight, never in a base.
 */
export type FightPostKind = PostKind | 'line';
export interface Post {
  id: number;
  kind: FightPostKind;
  column: number;
  row: number;
  /** A wall-walk's spot on its segment; absent = 0. */
  spot?: number;
  x: number;
  y: number;
  /** Occupied by, or reserved for a defender walking to it. */
  defenderId: string | null;
}
/** A turret in the fight; ids = `base.turrets` index. */
export interface Turret {
  id: number;
  mount: TurretMount;
  column: number;
  row: number;
  /** A wall mount's spot on its segment; absent = 0. */
  spot?: number;
  x: number;
  y: number;
  condition: number;
  nextShotAt: number;
}
/** A trap in the fight; ids = `base.traps` index. Its cell spans `TRAP_STRIP` along `x` and row `row`. */
export interface Trap {
  id: number;
  kind: TrapKind;
  row: number;
  durability: number;
  /** Ids of the enemies that triggered it: each one only once (design §7). */
  hit: number[];
}
/**
 * One row of Barbed Wire's band (ID-090): `durability` left, 0 when broken; it slows no one
 * once broken. `max`: its full durability this wave at the card's level (ID-123). `hit`: the
 * enemies that wore it, each only once.
 */
export interface WireRow {
  durability: number;
  max: number;
  hit: number[];
}
/** How a turret looks and whether it fires: lit, dark (no charge), jammed (0 condition), or offline (its wall broke). */
export type TurretState = 'lit' | 'dark' | 'jammed' | 'offline';
export type Slot = 'primary' | 'secondary';
/** A defender in the fight always holds a post: it stands on it, or walks to it. */
export interface Defender extends DefenderSpec {
  nextShotAt: number;
  /** Rounds left in each gun's magazine (0 for a blade, a tool or none). */
  ammo: Record<Slot, number>;
  /** When an empty gun's reload ends. */
  reloadedAt: Record<Slot, number>;
  x: number;
  y: number;
  postId: number;
  walking: boolean;
  hp: number;
  maxHp: number;
  /** The kind of enemy that hit them last; null before any hit. */
  hitBy: EnemyKind | null;
}
/** A defender injured in this fight, and the post they held (stood on or walked to). */
export interface Injury {
  defender: DefenderSpec;
  postId: number;
  /** Fight time of the injury, in s: rest is timed from here (design §11). */
  at: number;
  /** A replacement was offered (taken or skipped); each injury gets one offer. */
  offered: boolean;
  /** The kind of enemy that landed the last hit; null if none did. */
  by: EnemyKind | null;
}
/** The first crossing of a layer by an enemy from outside, for the defeat screen (design §2). */
export interface Breach {
  column: number;
  row: number;
  /** The wave under way at the crossing. */
  wave: number;
  /**
   * What the enemy went through: a broken wall or gate, a slot never built, or over a
   * standing segment (a Crawler, `climbed`).
   */
  through: SegmentKind | 'gap' | 'climbed';
}
/** The open replacement offer: post `postId` is the injured one's, or null for the player's pick. */
export interface ReplaceOffer {
  injuredId: string;
  postId: number | null;
}
export type MoveResult = { ok: true; state: HordeState } | { ok: false; reason: string };
/** A blade or tool strike by defender `owner` landing on `(x, y)`, drawn for `STRIKE_FLASH` s. */
export interface Strike {
  x: number;
  y: number;
  at: number;
  owner: string;
}
/**
 * A gun's bullet in flight (design §6 Ballistics): it moves `speed` px/s along the unit
 * heading `(dx, dy)` and hits the first living enemy whose body it crosses.
 */
export interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  /** Dealt on a hit; the crit was rolled at the trigger. */
  damage: number;
  /** The shooter: a defender's id, or `turret:<id>`. */
  owner: string;
  /** The muzzle, and how far from it the shot was aimed (the renderer drops it to body height over that). */
  fromX: number;
  fromY: number;
  aim: number;
  /** Px it can still fly; at 0 it falls with no damage. */
  left: number;
  /** Enemies it can still go through; after each it flies at most `PIERCE.reach` on. */
  pierce: number;
  /** Ids of the enemies it hit: never the same one twice. */
  hit: number[];
  /** How it looks in flight: its gun's. */
  tracer: Tracer;
  /** A Ricochet's bounce (design §8): it never bounces again. */
  ricochet?: true;
  /** Its damage is a crit's (ID-082: its damage number stands out). */
  crit?: true;
  /** A Sniper rifle's round: it ignores armour, a boss's plates too (ID-099, ID-101). */
  ap?: true;
  /**
   * Gun traits and role affixes (ID-101), as shares: extra damage near the wall (an SMG's,
   * plus the shooter's Instinct, ID-125),
   */
  close?: number;
  /** a Sniper rifle's extra damage to bosses and heavies, */
  heavy?: number;
  /** an LMG's slow on hit, */
  slow?: number;
  /** and a Shotgun pellet's stagger. */
  stagger?: true;
}
/**
 * A gun going off: `owner` (as on its bullet) fired in the step ending at `at`, when it
 * is first drawn; drawn for `MUZZLE_FLASH` s.
 */
export interface Shot {
  owner: string;
  at: number;
}
/**
 * Where a bullet ended in the step ending at `at`, drawn for `IMPACT_FLASH` s: on an
 * enemy it hit (`hit`), or where it fell past its range with no damage.
 */
export interface Impact {
  x: number;
  y: number;
  hit: boolean;
  at: number;
}
/** A Spewer's glob flying from `(fromX, fromY)` to `(x, y)`, from `at` for `SPEWER.splash` s. */
export interface Spit {
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
}
/** Swollen `id` blowing up at `(x, y)` in the step ending at `at` (not a kill), drawn for `SWOLLEN.burst` s. */
export interface Burst {
  id: number;
  x: number;
  y: number;
  at: number;
}
/**
 * A damage number (ID-082) at `(x, y)` from `at`: what an enemy (`on` its kind) or a wall
 * segment (`on` 'wall') took, hits merged per `DAMAGE_POP`; `key` names the target.
 */
export interface Pop {
  x: number;
  y: number;
  amount: number;
  crit: boolean;
  on: EnemyKind | 'wall';
  key: string;
  at: number;
}
/**
 * Something a survivor did (ID-085), for their chatter: `by` killed an enemy with a bullet
 * or a strike, landed a crit round, or threw a Frag Grenade, in the step starting at `at`.
 */
export interface Feat {
  kind: 'kill' | 'crit' | 'throw';
  by: string;
  at: number;
}
/** How long a feat stays listed, fight s: longer than the most one frame runs at 3×. */
export const FEAT_KEEP = 1;
/** A molotov's fire on the ground, lit at `at`, burning enemies inside until `until` (fight time). */
export interface Fire {
  x: number;
  y: number;
  at: number;
  until: number;
}
/** A bomb, bottle or flashbang still in the air, landing at `(x, y)` at `at` (ID-041). */
export interface Incoming {
  skill: SkillId;
  x: number;
  y: number;
  at: number;
}
/**
 * A Frag Grenade (design §8): thrown by defender `by` from `(fromX, fromY)` at `at`, landing
 * at `(x, y)` at `lands`, when it bursts (`burst`); its blast is drawn until
 * `lands + CARD.frag.flash`.
 */
export interface Grenade {
  by: string;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  at: number;
  lands: number;
  burst: boolean;
}
/** A bomb or flashbang going off at `(x, y)`, drawn for `SKILL_FLASH` seconds. */
export interface Blast {
  skill: 'airstrike' | 'flashbang';
  x: number;
  y: number;
  at: number;
}
/** Multipliers from upgrade cards; all start at 1. */
export interface Mods {
  damage: number;
  fireRate: number;
  range: number;
}
export type Card = { kind: 'upgrade'; id: UpgradeId } | { kind: 'recruit'; defender: DefenderSpec };
export type Outcome = 'fighting' | 'won' | 'lost';
export interface HordeState {
  time: number;
  acc: number;
  rng: RngState;
  /** The seed the fight started from (uint32): what a horde-only drop rolls from (ID-067). */
  seed: number;
  hordeNumber: number;
  wave: number;
  waveCount: number;
  toSpawn: number;
  nextSpawnAt: number;
  breakUntil: number;
  enemies: Enemy[];
  nextEnemyId: number;
  layers: Layer[];
  posts: Post[];
  turrets: Turret[];
  traps: Trap[];
  /** Barbed Wire's band, row by row (one per segment, top to bottom), worn down as enemies cross it (ID-090). */
  wire: WireRow[];
  /** Battery bank charge left (design §7). */
  energy: number;
  /** The bank's cap, which the Recharge card fills up to (ID-035). */
  bankCap: number;
  /** When the fight started (ms since the epoch). */
  startedAt: number;
  defenders: Defender[];
  bench: DefenderSpec[];
  /** In injury order; never on the bench, so never back in this fight. */
  injured: Injury[];
  /** At most one per layer, in crossing order. */
  breaches: Breach[];
  /** Ids of everyone who took part (starter, recruits, replacements), in join order. */
  tookPart: string[];
  /** Seconds the camp has been falling (an enemy inside, no defender left); 0 when not. */
  fallingFor: number;
  replace: ReplaceOffer | null;
  xp: number;
  level: number;
  offer: Card[] | null;
  mods: Mods;
  /** Upgrade cards held this horde, in pick order, each once (design §8). */
  taken: UpgradeId[];
  /**
   * Each held card's level (ID-097): 1 to its max for a levelled card, 1 for a unique one,
   * and how often it was picked for a repeatable one. Gone with the card when the other
   * ammo card replaces it.
   */
  cardLevels: Partial<Record<UpgradeId, number>>;
  /** When the latest barrier card was picked (ID-075), so the wall can pulse; absent = none this horde. */
  barrierAt?: number;
  /** The only upgrade cards offered (ID-066); every card when absent. */
  cardPool?: UpgradeId[];
  /** Enemy HP's factor for this horde (ID-066); `HP_GROWTH` per horde when absent. */
  hpScale?: number;
  /** Multiplies the defender XP a win gives (ID-066); 1 when absent. */
  xpRate?: number;
  /** Where enemies spawn along `x` (ID-068); `FIELD.right` when absent. */
  spawnX?: number;
  /** Power Surge: turrets draw no charge while `wave` is this one; 0 = none. */
  freeWave: number;
  /** Horde cash from kills (design §4); spent in the shop, never kept after the horde. */
  cash: number;
  /** Kill-cash factor from camp-level picks (design §11). */
  cashRate: number;
  /** Mutants killed this horde; a win pays Mutated Genes for them (design §11). */
  mutantKills: number;
  /** Fight time each bought buff runs until; 0 = never bought. */
  buffs: Record<BuffId, number>;
  /** Active skills researched at the Lab; only these can be used. */
  skills: SkillId[];
  /** Fight time each skill is ready again at; 0 = never used. */
  cooldowns: Record<SkillId, number>;
  /** The commander's perks, fixed for the fight (design §5). */
  perks: PerkId[];
  /** Each equipped perk's level, fixed for the fight (ID-035). */
  perkLevels: Partial<Record<PerkId, number>>;
  /** Research done when the fight started (ID-035). */
  research: ResearchId[];
  /** The wave Second Look's reroll was last used in; 0 = not yet. */
  rerolledWave: number;
  /** Rerolls used in `rerolledWave`. */
  rerolls: number;
  fires: Fire[];
  blasts: Blast[];
  incoming: Incoming[];
  /** Player-picked target; null = each defender shoots the enemy closest to it. */
  focusId: number | null;
  strikes: Strike[];
  /** In flight; cleared when the horde ends and never saved. */
  bullets: Bullet[];
  /** Recent muzzle flashes and bullet ends, for the renderer; cleared when the horde ends. */
  shots: Shot[];
  impacts: Impact[];
  /** Damage numbers (ID-082); cleared when the horde ends and never saved. */
  pops: Pop[];
  /** Survivors' kills, crits and throws (ID-085); cleared when the horde ends and never saved. */
  feats: Feat[];
  spits: Spit[];
  bursts: Burst[];
  /** Frag Grenades in the air or bursting (design §8); cleared when the horde ends. */
  grenades: Grenade[];
  /** When the next Frag Grenade may be thrown; absent until the card is picked. */
  nextFragAt?: number;
  /**
   * This horde's bosses and mini-boss (design §9, ID-099), fixed by its number; `id` is the
   * enemy's once it has come (with the first spawn of its wave), null before.
   */
  bosses: (BossSpec & { id: number | null })[];
  /** The harder hordes' rules (ID-099, `HordeSetup.harder`). */
  harder?: true;
  /** Skills on cooldown only, at `power`× (ID-100, `HordeSetup.freeSkills`). */
  freeSkills?: { power: number };
  /** The wave under way is a swarm wave (ID-099). */
  swarm: boolean;
  /** Boss slabs in flight or just landed (ID-099); cleared when the horde ends. */
  slabs: Slab[];
  outcome: Outcome;
}

// Accumulated float time can land a hair before a due time; count it as due.
const EPS = 1e-9;
const due = (time: number, at: number): boolean => time >= at - EPS;
/**
 * When the shot after one that fell due `at` and went off at `now` is due: `interval` after
 * `at` if it went off in the tick it fell due, so a fire rate is not rounded up to whole
 * ticks (ID-125); else (it waited on a target or a reload) `interval` after `now`. At most
 * one shot a tick, so a rate faster than the tick can't build up a backlog.
 */
const nextShot = (now: number, at: number, interval: number): number =>
  (now - at < STEP ? at : now) + interval;
/** Waiting on the player: a card pick or a replacement. */
const paused = (s: HordeState): boolean =>
  s.offer !== null || s.replace !== null || s.outcome !== 'fighting';

export function newHorde(seed: number, setup: HordeSetup): HordeState {
  const {
    hordeNumber,
    roster,
    startDefenderId,
    base,
    startPostId,
    bank,
    startedAt,
    skills,
    perks,
    perkLevels = {},
    research = [],
    bankCap = BANK_CAP,
    cashRate = 1,
    startCash = 0,
    cards,
    hpScale,
    xpRate,
    line = [],
    spawnX,
    harder = false,
    freeSkills,
  } = setup;
  if (freeSkills && !(Number.isInteger(freeSkills.power) && freeSkills.power >= 1)) {
    throw new RangeError(`newHorde: bad skill power ${freeSkills.power}`);
  }
  const levels: Partial<Record<PerkId, number>> = {};
  for (const id of perks) levels[id] = perkLevels[id] ?? 1;
  const start = roster.find((d) => d.id === startDefenderId);
  if (!start) throw new RangeError(`newHorde: unknown start defender ${startDefenderId}`);
  const { layers, posts, turrets, traps } = layoutOf(base);
  for (const at of line) {
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || at.y < 0 || at.y >= FIELD.height) {
      throw new RangeError(`newHorde: bad line slot (${at.x}, ${at.y})`);
    }
    const row = Math.floor(at.y / SEGMENT_HEIGHT);
    posts.push({
      id: posts.length,
      kind: 'line',
      column: 0,
      row,
      x: at.x,
      y: at.y,
      defenderId: null,
    });
  }
  if (spawnX !== undefined && !(Number.isFinite(spawnX) && spawnX > 0 && spawnX <= FIELD.right)) {
    throw new RangeError(`newHorde: bad spawn x ${spawnX}`);
  }
  const fortify = perkFactor({ perks: [...perks], perkLevels: levels }, 'fortify', PERK.fortify);
  if (fortify !== 1) {
    for (const seg of layers.flatMap((l) => l.segments)) {
      seg.hp *= fortify;
      seg.maxHp *= fortify;
    }
  }
  const startPost = posts[startPostId];
  if (!Number.isInteger(startPostId) || !startPost || !postUsable(layers, startPost)) {
    throw new RangeError(`newHorde: start post ${startPostId} is not usable`);
  }
  startPost.defenderId = start.id;
  const toSpawn = waveEnemies({
    hordeNumber,
    wave: 1,
    harder,
    swarm: harder && swarmWave(hordeNumber, 1),
  });
  return {
    time: 0,
    acc: 0,
    rng: { s: seed >>> 0 },
    seed: seed >>> 0,
    hordeNumber,
    wave: 1,
    waveCount: waveCount(hordeNumber),
    toSpawn,
    nextSpawnAt: 0,
    breakUntil: 0,
    enemies: [],
    nextEnemyId: 0,
    layers,
    posts,
    turrets,
    traps,
    // At level 1's full durability for the first wave: the card's first pick (ID-104, ID-123).
    wire: Array.from({ length: SEGMENTS }, () => {
      const max = wireMax(1, toSpawn);
      return { durability: max, max, hit: [] };
    }),
    energy: bank,
    bankCap,
    startedAt,
    defenders: [standing(start, startPost, 0)],
    bench: roster.filter((d) => d !== start).map((d) => ({ ...d })),
    injured: [],
    breaches: [],
    tookPart: [start.id],
    fallingFor: 0,
    replace: null,
    xp: 0,
    level: 1,
    offer: null,
    mods: { damage: 1, fireRate: 1, range: 1 },
    taken: [],
    cardLevels: {},
    ...(cards ? { cardPool: [...cards] } : {}),
    ...(hpScale === undefined ? {} : { hpScale }),
    ...(xpRate === undefined ? {} : { xpRate }),
    ...(spawnX === undefined ? {} : { spawnX }),
    freeWave: 0,
    cash: startCash,
    cashRate,
    mutantKills: 0,
    buffs: { adrenaline: 0, overdrive: 0 },
    skills: [...skills],
    cooldowns: { flashbang: 0, molotov: 0, airstrike: 0 },
    perks: [...perks],
    perkLevels: levels,
    research: [...research],
    rerolledWave: 0,
    rerolls: 0,
    fires: [],
    blasts: [],
    incoming: [],
    focusId: null,
    strikes: [],
    bullets: [],
    shots: [],
    impacts: [],
    pops: [],
    feats: [],
    spits: [],
    bursts: [],
    grenades: [],
    bosses: hordeBosses(hordeNumber, harder).map((b) => ({ ...b, id: null })),
    ...(harder ? { harder: true as const } : {}),
    ...(freeSkills ? { freeSkills: { power: freeSkills.power } } : {}),
    swarm: harder && swarmWave(hordeNumber, 1),
    slabs: [],
    outcome: 'fighting',
  };
}

/** `spec` at full HP standing on `post`, ready to fire at `nextShotAt`. Does not touch the post. */
export function standing(spec: DefenderSpec, post: Post, nextShotAt: number): Defender {
  const hp = maxHpOf(spec);
  const full = (id: Held | null): number => (id !== null && isGun(id) ? gunOf(id).magazine : 0);
  return {
    ...specOf(spec),
    nextShotAt,
    ammo: { primary: full(spec.loadout.primary), secondary: full(spec.loadout.secondary) },
    reloadedAt: { primary: 0, secondary: 0 },
    x: post.x,
    y: post.y,
    postId: post.id,
    walking: false,
    hp,
    maxHp: hp,
    hitBy: null,
  };
}

/** The base laid out on the field: layers at their wall `x`, posts unmanned, ids = `base.posts` / `base.turrets` / `base.traps` index. */
export function layoutOf(base: Base): {
  layers: Layer[];
  posts: Post[];
  turrets: Turret[];
  traps: Trap[];
} {
  const layers: Layer[] = base.layers.map((l) => ({
    column: l.column,
    x: COLUMNS[l.column]!,
    segments: l.slots.map((slot, index) =>
      slot
        ? { index, kind: slot.kind, tier: slot.tier, hp: slot.hp, maxHp: slot.maxHp }
        : { index, kind: null, tier: null, hp: 0, maxHp: 0 },
    ),
  }));
  const posts: Post[] = base.posts.map((p, id) => ({
    id,
    ...p,
    ...postXY(p),
    defenderId: null,
  }));
  const turrets: Turret[] = base.turrets.map((t, id) => ({
    id,
    ...t,
    ...postXY({ kind: t.mount, column: t.column, row: t.row, spot: spotOf(t) }),
    nextShotAt: 0,
  }));
  const traps: Trap[] = base.traps.map((t, id) => ({ id, ...t, hit: [] }));
  return { layers, posts, turrets, traps };
}

/** Advances the fight by `dt` seconds in fixed steps; returns a new state. */
export function tick(state: HordeState, dt: number): HordeState {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError(`tick: bad dt ${dt}`);
  return tickInPlace(structuredClone(state), dt);
}

/**
 * `tick` without the copy (ID-105): advances `s` itself and returns it. Only for a state
 * nothing else holds, such as one `tick` just returned; the scripted player's fights look
 * at the state every second, and copying it each time was a fifth of their cost.
 */
export function tickInPlace(s: HordeState, dt: number): HordeState {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError(`tick: bad dt ${dt}`);
  if (paused(s)) {
    s.acc = 0;
    return s;
  }
  const rng = rngFrom(s.rng);
  s.acc += dt;
  while (s.acc >= STEP - EPS) {
    s.acc = Math.max(0, s.acc - STEP);
    step(s, rng);
    if (paused(s)) {
      s.acc = 0;
      break;
    }
  }
  return s;
}

/** How far `weapon` (a gun) reaches from `post`: its range × the post's × the cards'. */
export function gunRange(state: HordeState, post: Pick<Post, 'kind'>, weapon: Held): number {
  const factor = post.kind === 'line' ? SQUAD_LINE.range : POST_RANGE[post.kind];
  return gunOf(weapon).range * factor * state.mods.range;
}

/** Whether the bought buff `id` is still running (fight time stops during picks, so it does too). */
export function buffOn(state: Pick<HordeState, 'time' | 'buffs'>, id: BuffId): boolean {
  return !due(state.time, state.buffs[id]);
}

/** The `damage` or `fireRate` factor the running shop buffs give defenders and turrets. */
export function boost(
  state: Pick<HordeState, 'time' | 'buffs'>,
  stat: 'damage' | 'fireRate',
): number {
  let f = 1;
  if (buffOn(state, 'adrenaline')) f *= SHOP.adrenaline[stat];
  if (buffOn(state, 'overdrive')) f *= SHOP.overdrive[stat];
  return f;
}

/** Fire-rate factor for `defender` from a standing Engineer within reach (never stacked, never self). */
export function engineerBuff(state: HordeState, defender: Defender): number {
  if (defender.walking) return 1;
  const near = state.defenders.some(
    (e) =>
      e !== defender &&
      !e.walking &&
      professionOf(e.loadout) === 'engineer' &&
      Math.hypot(e.x - defender.x, e.y - defender.y) <=
        toolOf(e.loadout.secondary!).buffRadius + EPS,
  );
  return near ? 1 + ENGINEER_BUFF : 1;
}

/** Whether `t` can fire, and how it shows: a broken wall under a wall mount, then jammed, then the bank. */
export function turretState(
  state: Pick<HordeState, 'layers' | 'energy'> & Partial<Pick<HordeState, 'wave' | 'freeWave'>>,
  t: Turret,
): TurretState {
  if (t.mount === 'wall-walk') {
    const seg = state.layers.find((l) => l.column === t.column)?.segments[t.row];
    if (!seg || seg.hp <= 0) return 'offline';
  }
  if (t.condition <= 0) return 'jammed';
  return state.energy > 0 || freePower(state) ? 'lit' : 'dark';
}

/** Whether a Power Surge runs turrets free this wave (design §8). */
const freePower = (state: Partial<Pick<HordeState, 'wave' | 'freeWave'>>): boolean =>
  state.freeWave !== undefined && state.freeWave > 0 && state.freeWave === state.wave;

/** Whether upgrade card `id` is held this horde. */
export const took = (state: Pick<HordeState, 'taken'>, id: UpgradeId): boolean =>
  state.taken.includes(id);

/**
 * Card `id`'s level this horde (ID-097): 0 when not held. A card held with no level
 * recorded (a scene built by hand) counts at `CARD_MAX_LEVEL`.
 */
export const cardLevel = (
  state: Pick<HordeState, 'taken'> & { readonly cardLevels?: HordeState['cardLevels'] },
  id: UpgradeId,
): number => (took(state, id) ? (state.cardLevels?.[id] ?? CARD_MAX_LEVEL) : 0);

/** A per-level number of `levels` at card `id`'s level (held, so at least 1). */
export const atLevel = (
  state: Parameters<typeof cardLevel>[0],
  id: UpgradeId,
  levels: readonly number[],
): number => levels[Math.min(levels.length, cardLevel(state, id)) - 1]!;

/** Whether the commander has perk `id` equipped in this fight. */
export const perkOn = (state: Pick<HordeState, 'perks'>, id: PerkId): boolean =>
  state.perks.includes(id);

type PerkView = Pick<HordeState, 'perks' | 'perkLevels'>;

/** How much of its level-1 bonus perk `id` gives in this fight: 0 unequipped, else 1, 1.5, 2 by level. */
export const perkScale = (state: PerkView, id: PerkId): number =>
  perkOn(state, id) ? levelScale(state.perkLevels[id] ?? 1) : 0;

/** Perk `id`'s factor, from its level-1 factor `base` (design §5, ID-035): 1 + (base − 1) × scale. */
export const perkFactor = (state: PerkView, id: PerkId, base: number): number =>
  1 + (base - 1) * perkScale(state, id);

/**
 * Damage and fire-rate factor a turret gets from the best standing Engineer within
 * their tool's reach (never stacked): `ENGINEER_BUFF`.
 */
export function turretBuff(state: HordeState, t: Turret): number {
  return engineersNear(state, t).length > 0 ? 1 + ENGINEER_BUFF : 1;
}

/** Standing Engineers whose tool reaches `t`. */
function engineersNear(state: HordeState, t: Turret): Defender[] {
  return state.defenders.filter(
    (e) =>
      !e.walking &&
      professionOf(e.loadout) === 'engineer' &&
      Math.hypot(e.x - t.x, e.y - t.y) <= toolOf(e.loadout.secondary!).buffRadius + EPS,
  );
}

/**
 * The base after a fight: each built segment keeps the fight's HP, rounded up (a
 * sliver left standing stays standing) and capped at the base's max HP (so an
 * in-fight Reinforce never sticks); under Fortify, scaled back by its factor first.
 * Returns a new base.
 */
export function baseAfter(base: Base, horde: HordeState): Base {
  const b = structuredClone(base);
  const match =
    b.layers.length === horde.layers.length &&
    b.layers.every(
      (l, i) =>
        l.column === horde.layers[i]!.column &&
        l.slots.every((slot, row) => {
          const seg = horde.layers[i]!.segments[row];
          return (
            seg !== undefined &&
            seg.kind === (slot?.kind ?? null) &&
            seg.tier === (slot?.tier ?? null)
          );
        }),
    );
  const sameTurrets =
    b.turrets.length === horde.turrets.length &&
    b.turrets.every((t, i) => {
      const h = horde.turrets[i]!;
      return (
        h.mount === t.mount && h.column === t.column && h.row === t.row && spotOf(h) === spotOf(t)
      );
    });
  const sameTraps =
    b.traps.length === horde.traps.length &&
    b.traps.every((t, i) => horde.traps[i]!.kind === t.kind && horde.traps[i]!.row === t.row);
  if (!match || !sameTurrets || !sameTraps) {
    throw new RangeError('baseAfter: the horde was not fought on this base');
  }
  // Turrets keep their exact wear, so a few shots per horde still add up (a whole-point
  // round-up would erase every shot's 0.2).
  b.turrets.forEach((t, i) => {
    t.condition = Math.min(MAX_CONDITION, Math.max(0, horde.turrets[i]!.condition));
  });
  b.traps.forEach((t, i) => {
    t.durability = Math.min(t.durability, Math.max(0, horde.traps[i]!.durability));
  });
  b.layers.forEach((l, i) => {
    l.slots.forEach((slot, row) => {
      // EPS: float noise from card maths (150 + 1e-12) must not round up a whole point.
      // Fortify's extra HP lasts the fight: the base keeps the same share of its own max.
      if (slot) {
        const fortify = perkFactor(horde, 'fortify', PERK.fortify);
        const hp = Math.ceil(horde.layers[i]!.segments[row]!.hp / fortify - EPS);
        slot.hp = Math.min(slot.maxHp, Math.max(0, hp));
      }
    });
  });
  return b;
}

/** Focuses every defender on enemy `enemyId` (null clears); returns a new state. */
export function setFocus(state: HordeState, enemyId: number | null): HordeState {
  if (
    enemyId !== null &&
    !(Number.isSafeInteger(enemyId) && state.enemies.some((e) => e.id === enemyId && e.hp > 0))
  ) {
    throw new RangeError(`setFocus: no living enemy ${String(enemyId)}`);
  }
  const s = structuredClone(state);
  s.focusId = enemyId;
  return s;
}

/**
 * Sends a defender walking to post `postId`: its old post is free at once and the new
 * one is reserved. Refuses with a player-facing reason; throws on an unknown id.
 */
export function moveDefender(state: HordeState, defenderId: string, postId: number): MoveResult {
  const defender = state.defenders.find((d) => d.id === defenderId);
  if (!defender) throw new RangeError(`moveDefender: no defender ${String(defenderId)}`);
  const target = Number.isInteger(postId) ? state.posts[postId] : undefined;
  if (!target) throw new RangeError(`moveDefender: no post ${postId}`);
  const refuse = (reason: string): MoveResult => ({ ok: false, reason });
  if (state.outcome !== 'fighting') return refuse('The fight is over');
  if (state.offer !== null) return refuse('Pick a card first');
  if (state.replace !== null) return refuse('Pick a replacement first');
  // The firing line's slots are fixed (ID-068): nobody moves onto or off them.
  if (target.kind === 'line' || state.posts[defender.postId]?.kind === 'line') {
    return refuse('Survivors hold their slots');
  }
  if (defender.postId === postId) {
    return refuse(defender.walking ? 'Already on the way' : 'Already there');
  }
  if (target.defenderId !== null) {
    const holder = state.defenders.find((d) => d.id === target.defenderId);
    return refuse(holder?.walking ? 'Post reserved' : 'Post taken');
  }
  if (!postUsable(state.layers, target)) return refuse('No wall to stand on');
  const s = structuredClone(state);
  const d = s.defenders.find((x) => x.id === defenderId)!;
  s.posts[d.postId]!.defenderId = null;
  s.posts[postId]!.defenderId = d.id;
  d.postId = postId;
  d.walking = true;
  return { ok: true, state: s };
}

/** The living enemy nearest `(x, y)` within reach of a click (ties → lowest id), else null. */
export function enemyAt(state: HordeState, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (e.hp <= 0 || d > radiusOf(e) + ENEMY_RADIUS) continue;
    if (d > bestD || (d === bestD && best && e.id > best.id)) continue;
    best = e;
    bestD = d;
  }
  return best?.id ?? null;
}

function step(s: HordeState, rng: Rng): void {
  spawn(s, rng);
  walk(s);
  fire(s, rng);
  throwFrag(s);
  fireTurrets(s, rng);
  fly(s);
  land(s);
  landSlabs(s);
  blowFrags(s);
  burn(s);
  repair(s);
  repairTurrets(s);
  springTraps(s);
  removeDead(s);
  mutate(s, rng);
  // Moving and separating keep the enemies' order, so their old places line up by index.
  const wasX = s.enemies.map((e) => e.x);
  const wasY = s.enemies.map((e) => e.y);
  const moved = move(s);
  separate(s);
  s.enemies.forEach((e, i) => {
    e.vx = (e.x - wasX[i]!) / STEP;
    e.vy = (e.y - wasY[i]!) / STEP;
  });
  attack(s, moved, rng);
  injure(s);
  drop(s);
  advanceWave(s);
  fall(s);
  if (s.outcome !== 'fighting') {
    s.bullets = [];
    s.shots = [];
    s.impacts = [];
    s.pops = [];
    s.feats = [];
    s.spits = [];
    s.bursts = [];
    s.grenades = [];
    s.incoming = [];
    s.slabs = [];
  }
  // A finished fight has no card to pick, so its XP stays banked.
  if (s.outcome === 'fighting') levelUp(s, rng);
  s.time += STEP;
}

/** How often each timed boss skill goes off, in s. */
const SKILL_EVERY: Readonly<Partial<Record<BossSkill, number>>> = {
  brood: HORROR.brood.every,
  charge: HORROR.charge.every,
  roar: BOSS_SKILL.roar.every,
  slab: BOSS_SKILL.slab.every,
};

function spawn(s: HordeState, rng: Rng): void {
  if (due(s.time, s.breakUntil)) {
    s.bosses.forEach((b, i) => {
      if (b.id !== null || b.wave !== s.wave) return;
      const e = place(s, b.kind, s.spawnX ?? FIELD.right, 0);
      if (b.elite) e.elite = true;
      const r = radiusOf(e);
      e.y = int(rng, Math.ceil(r), Math.floor(FIELD.height - r));
      e.hp = e.maxHp = Math.round(e.hp * b.hp);
      b.id = e.id;
      const next: Partial<Record<BossSkill, number>> = {};
      for (const k of b.skills) if (TIMED_SKILLS.includes(k)) next[k] = s.time + SKILL_EVERY[k]!;
      e.horror = {
        boss: i,
        skills: [...b.skills],
        next,
        fired: {},
        chargeUntil: 0,
        charged: false,
        hitAt: s.time,
        seenHp: e.hp,
        broods: 0,
        platesOff: false,
      };
    });
  }
  const interval = spawnInterval(s.hordeNumber, s.harder === true);
  const gap = s.swarm ? interval / SWARM.size : interval;
  while (s.toSpawn > 0 && due(s.time, s.nextSpawnAt) && due(s.time, s.breakUntil)) {
    // Shamblers only (the tutorial) roll nothing, so its seeds play as before.
    const kind =
      waveMix(s.hordeNumber).length > 1 ? kindFor(s.hordeNumber, rng(), s.swarm) : 'shambler';
    const r = ENEMIES[kind].radius;
    place(s, kind, s.spawnX ?? FIELD.right, int(rng, r, FIELD.height - r));
    s.toSpawn -= 1;
    s.nextSpawnAt = s.time + gap;
  }
}

/** Whether the horde is a boss horde: a Mutated Horror comes, not just a mini-boss (ID-099). */
export const bossHorde = (s: Pick<HordeState, 'bosses'>): boolean => s.bosses.some((b) => !b.elite);

/** An enemy's body radius: its kind's, `ELITE.size` times that for a mini-boss (ID-099). */
export const radiusOf = (e: Pick<Enemy, 'kind' | 'elite'>): number =>
  ENEMIES[e.kind].radius * (e.elite ? ELITE.size : 1);

/** A new enemy of `kind` at `(x, y)` with this wave's HP. */
function place(s: HordeState, kind: EnemyKind, x: number, y: number): Enemy {
  const hp = enemyHp(kind, s.hordeNumber, s.wave, s.hpScale);
  const e: Enemy = {
    id: s.nextEnemyId++,
    kind,
    wave: s.wave,
    x,
    y,
    hp,
    maxHp: hp,
    nextAttackAt: 0,
    inCamp: false,
    stunnedUntil: 0,
    vx: 0,
    vy: 0,
    climbUntil: 0,
    climbed: false,
  };
  s.enemies.push(e);
  return e;
}

/**
 * Design §9, as built ID-024 and ID-099: each boss's and mini-boss's skills. Brood spawns
 * Shamblers beside it, on its side of every wall; Charge starts a charge; Roar speeds up
 * the enemies around it; Slab throw lobs a slab at the Barbed Wire or the wall; Regen heals
 * once it has gone `HORROR.regen.after` s without losing HP; Armour plates break once
 * `BOSS_SKILL.plates.share` of its HP is gone. Stunned, its clocks wait.
 */
function mutate(s: HordeState, rng: Rng): void {
  // Up to today's length: a brood joins the end and has no clock.
  for (let i = 0, n = s.enemies.length; i < n; i++) {
    const e = s.enemies[i]!;
    const h = e.horror;
    if (!h) continue;
    if (e.hp < h.seenHp) h.hitAt = s.time;
    if (h.skills.includes('plates') && e.hp <= e.maxHp * (1 - BOSS_SKILL.plates.share) + EPS) {
      h.platesOff = true;
    }
    if (stunned(s, e)) {
      for (const k of Object.keys(h.next) as BossSkill[]) h.next[k]! += STEP;
      if (h.chargeUntil > 0) h.chargeUntil += STEP;
      h.hitAt += STEP;
      h.seenHp = e.hp;
      continue;
    }
    if (h.skills.includes('regen') && due(s.time, h.hitAt + HORROR.regen.after)) {
      e.hp = Math.min(e.maxHp, e.hp + HORROR.regen.rate * e.maxHp * STEP);
    }
    // A charge's end takes its step: no skill goes off in it.
    if (h.chargeUntil > 0 && due(s.time, h.chargeUntil)) h.chargeUntil = 0;
    else {
      for (const k of h.skills) {
        const at = h.next[k];
        if (at === undefined || !due(s.time, at)) continue;
        h.next[k] = s.time + SKILL_EVERY[k]!;
        h.fired[k] = s.time;
        if (k === 'charge') {
          h.chargeUntil = s.time + HORROR.charge.time;
          h.charged = false;
        } else if (k === 'brood') brood(s, e, rng);
        else if (k === 'roar') roar(s, e);
        else throwSlab(s, e);
      }
    }
    h.seenHp = e.hp;
  }
}

/**
 * The timed skill `e` is winding up (ID-099): the one due within `BOSS_SKILL.windUp` s,
 * soonest first; null when none is, or it is stunned. The view's glow, pose and sound.
 */
export function windingUp(s: Pick<HordeState, 'time'>, e: Enemy): BossSkill | null {
  const h = e.horror;
  if (!h || stunned(s, e)) return null;
  let best: BossSkill | null = null;
  for (const k of h.skills) {
    const at = h.next[k];
    if (at === undefined || at - s.time > BOSS_SKILL.windUp + EPS) continue;
    if (best === null || at < h.next[best]!) best = k;
  }
  return best;
}

/** Whether `e`'s armour plates still hold (ID-099). */
export const plated = (e: Pick<Enemy, 'horror'>): boolean =>
  e.horror !== undefined && e.horror.skills.includes('plates') && !e.horror.platesOff;

/** Whether a boss's Roar still speeds `e` up (ID-099). */
export const roared = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.roarUntil !== undefined && !due(s.time, e.roarUntil);

/** Roar (ID-099): the other living enemies within `BOSS_SKILL.roar.radius` speed up. */
function roar(s: HordeState, e: Enemy): void {
  for (const o of around(s, e, BOSS_SKILL.roar.radius)) {
    o.roarUntil = s.time + BOSS_SKILL.roar.time;
  }
}

/**
 * Slab throw (ID-099): from at least `BOSS_SKILL.slab.range` px out, a slab at the working
 * Barbed Wire row nearest `e`'s row (with the card), else at the outermost wall's standing
 * segment nearest it (ties → the upper one). Nothing to aim at, or too close: no throw.
 */
function throwSlab(s: HordeState, e: Enemy): void {
  if (e.inCamp) return;
  const row = segmentAt(e.y);
  const nearest = (rows: number[]): number | undefined =>
    rows.sort((a, b) => Math.abs(a - row) - Math.abs(b - row) || a - b)[0];
  let target: { x: number; row: number; column: number | null } | null = null;
  const wire = barbedWire(s);
  if (wire) {
    const r = nearest(s.wire.flatMap((w, i) => (w.durability > 0 ? [i] : [])));
    if (r !== undefined) target = { x: (wire.from + wire.to) / 2, row: r, column: null };
  }
  if (!target) {
    const layer = [...s.layers]
      .sort((a, b) => b.x - a.x)
      .find((l) => l.segments.some((seg) => seg.hp > 0));
    const r = layer && nearest(layer.segments.flatMap((seg) => (seg.hp > 0 ? [seg.index] : [])));
    if (layer && r !== undefined)
      target = { x: layer.x + WALL.depth, row: r, column: layer.column };
  }
  if (!target || e.x - target.x < BOSS_SKILL.slab.range - EPS) return;
  s.slabs.push({
    fromX: e.x,
    fromY: e.y,
    x: target.x,
    y: (target.row + 0.5) * SEGMENT_HEIGHT,
    at: s.time,
    lands: s.time + BOSS_SKILL.slab.flight,
    row: target.row,
    column: target.column,
    landed: false,
  });
}

/**
 * Slabs that land this step (ID-099): a wire row breaks; a wall slab hits its row's
 * segment, or the nearest standing one of that layer if it fell meanwhile. Landed slabs
 * are drawn for `BOSS_SKILL.slab.flight` s more, then gone.
 */
function landSlabs(s: HordeState): void {
  for (const slab of s.slabs) {
    if (slab.landed || !due(s.time, slab.lands)) continue;
    slab.landed = true;
    if (slab.column === null) {
      // One thrown before this wave's break lands on wire the break rebuilt: it holds (ID-123).
      if (slab.at >= s.breakUntil - WAVE_BREAK) s.wire[slab.row]!.durability = 0;
      continue;
    }
    const layer = s.layers.find((l) => l.column === slab.column);
    const seg = layer?.segments
      .filter((g) => g.hp > 0)
      .sort(
        (a, b) => Math.abs(a.index - slab.row) - Math.abs(b.index - slab.row) || a.index - b.index,
      )[0];
    if (layer && seg) hitSegment(s, layer, seg, BOSS_SKILL.slab.damage);
  }
  s.slabs = s.slabs.filter((slab) => !due(s.time, slab.lands + BOSS_SKILL.slab.flight));
}

/**
 * Brood: `HORROR.brood.count` Shamblers in a column through the boss, spread by the RNG;
 * in the harder hordes `BOSS_SKILL.broodGrow` more for each brood before (ID-099).
 */
function brood(s: HordeState, e: Enemy, rng: Rng): void {
  const r = ENEMIES.shambler.radius;
  const reach = radiusOf(e) + r;
  const count = HORROR.brood.count + (s.harder ? BOSS_SKILL.broodGrow * e.horror!.broods : 0);
  e.horror!.broods += 1;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = e.y + side * (reach + Math.floor(i / 2) * 2 * r) + int(rng, -4, 4);
    const child = place(s, 'shambler', e.x, Math.min(FIELD.height - r, Math.max(r, y)));
    child.inCamp = e.inCamp;
  }
}

/** Whether a Rammer's charge is on. */
const charging = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.horror !== undefined && e.horror.chargeUntil > 0 && !due(s.time, e.horror.chargeUntil);

/** Walkers step straight toward their post at `WALK_SPEED` (slower with a shield) and take it on arrival. */
function walk(s: HordeState): void {
  for (const d of s.defenders) {
    if (!d.walking) continue;
    const stride = WALK_SPEED * (d.loadout.item === 'shield' ? 1 - SHIELD.walk : 1) * STEP;
    const post = s.posts[d.postId]!;
    const dist = Math.hypot(post.x - d.x, post.y - d.y);
    if (dist <= stride + EPS) {
      d.x = post.x;
      d.y = post.y;
      d.walking = false;
    } else {
      d.x += ((post.x - d.x) / dist) * stride;
      d.y += ((post.y - d.y) / dist) * stride;
    }
  }
}

/** The focused enemy if within `range` of `(x, y)`, else the nearest within it (ties → lowest id). */
function targetFrom(s: HordeState, x: number, y: number, range: number): Enemy | undefined {
  const dist = (e: Enemy): number => Math.hypot(e.x - x, e.y - y);
  const focus = s.enemies.find((e) => e.id === s.focusId && e.hp > 0);
  if (focus && dist(focus) <= range) return focus;
  let target: Enemy | undefined;
  let best = Infinity;
  for (const e of s.enemies) {
    const d = dist(e);
    if (e.hp <= 0 || d > range) continue;
    if (d < best || (d === best && target && e.id < target.id)) {
      target = e;
      best = d;
    }
  }
  return target;
}

/** Refills every empty gun whose reload has ended; Extended Mags (design §8) holds more. */
function reload(s: HordeState, d: Defender): void {
  for (const slot of ['primary', 'secondary'] as const) {
    const id = d.loadout[slot];
    if (id !== null && isGun(id) && d.ammo[slot] === 0 && due(s.time, d.reloadedAt[slot])) {
      d.ammo[slot] = magazineOf(s, id);
    }
  }
}

/** Rounds a full magazine of gun `id` holds in this fight: Extended Mags (design §8) adds to it. */
export const magazineOf = (s: Parameters<typeof cardLevel>[0], id: Held): number =>
  Math.round(
    gunOf(id).magazine * (took(s, 'extended-mags') ? atLevel(s, 'extended-mags', CARD.mags) : 1),
  );

/** Seconds `d` takes to reload gun `id` in this fight: Speed Loaders (design §8) cut it. */
export const reloadIn = (
  s: Parameters<typeof cardLevel>[0],
  d: Parameters<typeof reloadTime>[0],
  id: Held,
): number =>
  reloadTime(d, id) * (took(s, 'speed-loaders') ? atLevel(s, 'speed-loaders', CARD.loaders) : 1);

/**
 * Piercing Rounds (design §8, ID-097): the extra pierce of one squad shot, a chance at
 * every level (ID-124: max is 75%, no longer always), rolled on the fight's RNG for the
 * whole shot.
 */
export function extraPierce(s: Parameters<typeof cardLevel>[0], rng: Rng): number {
  if (!took(s, 'piercing-rounds')) return 0;
  return chance(rng, atLevel(s, 'piercing-rounds', CARD.pierce)) ? 1 : 0;
}

/** A gun in `slot` with a round in it. */
function loaded(d: Defender, slot: Slot): boolean {
  const id = d.loadout[slot];
  return id !== null && isGun(id) && d.ammo[slot] > 0;
}

/**
 * What `d` uses this step and at whom (design §6 Loadout), or null: a blade or tool
 * on an enemy in reach (standing, not on a tower); else the primary; else, for a
 * Gunner whose primary reloads, a sidearm secondary at an enemy within
 * `SIDEARM_CLOSE`. On the move only a sidearm fires, at ground-post range.
 */
function choose(
  s: HordeState,
  d: Defender,
  post: Post,
): { slot: Slot; target: Enemy; x: number; y: number } | null {
  const { primary, secondary } = d.loadout;
  if (d.walking) {
    const slot: Slot | null =
      isSidearm(primary) && loaded(d, 'primary')
        ? 'primary'
        : isSidearm(secondary) && loaded(d, 'secondary')
          ? 'secondary'
          : null;
    if (slot === null) return null;
    const target = targetFrom(s, d.x, d.y, gunRange(s, { kind: 'ground' }, d.loadout[slot]!));
    return target ? { slot, target, x: d.x, y: d.y } : null;
  }
  // No melee from a tower or over the wall from the firing line.
  if (secondary !== null && !isGun(secondary) && post.kind !== 'tower' && post.kind !== 'line') {
    const target = targetFrom(s, post.x, post.y, meleeOf(secondary).reach);
    if (target) return { slot: 'secondary', target, x: post.x, y: post.y };
  }
  if (loaded(d, 'primary')) {
    const target = targetFrom(s, post.x, post.y, gunRange(s, post, primary));
    return target ? { slot: 'primary', target, x: post.x, y: post.y } : null;
  }
  if (professionOf(d.loadout) === 'gunner' && isSidearm(secondary) && loaded(d, 'secondary')) {
    const range = Math.min(SIDEARM_CLOSE, gunRange(s, post, secondary!));
    const target = targetFrom(s, post.x, post.y, range);
    if (target) return { slot: 'secondary', target, x: post.x, y: post.y };
  }
  return null;
}

/**
 * Where to aim from `(x, y)` at `e` with a bullet at `speed` px/s: where `e` will be when
 * the bullet gets there, if it keeps its current velocity (design §6 Ballistics).
 */
export function leadPoint(x: number, y: number, e: Enemy, speed: number): { x: number; y: number } {
  const ox = e.x - x;
  const oy = e.y - y;
  // |o + v t| = speed × t. Bullets outrun enemies (a < 0), so one root is ≥ 0.
  const a = e.vx * e.vx + e.vy * e.vy - speed * speed;
  const b = 2 * (ox * e.vx + oy * e.vy);
  const c = ox * ox + oy * oy;
  const t = a < 0 ? (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a) : 0;
  return { x: e.x + e.vx * t, y: e.y + e.vy * t };
}

/**
 * Fires `pellets` bullets from `(x, y)` at where `target` will be, each turned off by up
 * to `spread`° on its own roll (seeded); one muzzle flash for the lot.
 */
function launch(
  s: HordeState,
  rng: Rng,
  shot: Pick<Bullet, 'owner' | 'speed' | 'damage' | 'pierce' | 'tracer'> & {
    x: number;
    y: number;
    target: Enemy;
    spread: number;
    range: number;
    pellets: number;
  },
): void {
  const { x, y, target, spread, range, pellets, ...rest } = shot;
  const aim = leadPoint(x, y, target, rest.speed);
  const heading = Math.atan2(aim.y - y, aim.x - x);
  const distance = Math.hypot(aim.x - x, aim.y - y);
  const bullet = (angle: number): Bullet => ({
    ...rest,
    x,
    y,
    dx: Math.cos(angle),
    dy: Math.sin(angle),
    fromX: x,
    fromY: y,
    aim: distance,
    left: range,
    hit: [],
  });
  for (let i = 0; i < pellets; i++) {
    s.bullets.push(bullet(heading + ((rng() * 2 - 1) * spread * Math.PI) / 180));
  }
  s.shots.push({ owner: rest.owner, at: s.time + STEP });
}

/**
 * The first living enemy `b` has not hit whose body (its kind's radius) its next
 * `travel` px cross, and how far along; ties → lowest id. One already overlapping the
 * bullet is crossed at 0, even behind its heading: point-blank, a shot at an enemy
 * against the post always lands.
 */
function crossed(s: HordeState, b: Bullet, travel: number): { enemy: Enemy; at: number } | null {
  let best: { enemy: Enemy; at: number } | null = null;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const wx = b.x - e.x;
    const wy = b.y - e.y;
    const along = b.dx * wx + b.dy * wy;
    const r = radiusOf(e);
    const gap = wx * wx + wy * wy - r * r;
    let at: number;
    if (gap <= 0) at = 0;
    else {
      const disc = along * along - gap;
      if (disc < 0) continue;
      at = -along - Math.sqrt(disc);
      if (at < 0 || at > travel + EPS) continue;
    }
    if (b.hit.includes(e.id)) continue;
    if (!best || at < best.at || (at === best.at && e.id < best.enemy.id)) best = { enemy: e, at };
  }
  return best;
}

/**
 * What a bullet of `damage` does to `e`: a boss's armour plates halve it, then a Brute's or
 * Horror's armour takes some off (design §9); an armour-piercing round, `ap` (a Sniper
 * rifle's, ID-099, ID-101), ignores both.
 */
export function hitDamage(e: Enemy, damage: number, ap = false): number {
  if (ap) return damage;
  const d = plated(e) ? damage * BOSS_SKILL.plates.factor : damage;
  return e.kind === 'brute'
    ? Math.max(BRUTE.min, d - BRUTE.armour)
    : e.kind === 'horror'
      ? Math.max(HORROR.min, d - HORROR.armour)
      : d;
}

/**
 * Design §6 Ballistics: each bullet flies one step along its swept path (so a fast one
 * never tunnels) and hits the first enemy it crosses, once; a piercing one goes on to
 * the next within `PIERCE.reach`. Spent, or past its range, it is gone. A squad
 * bullet's hit also sets off the behaviour cards taken (design §8, `cardHit`).
 */
function fly(s: HordeState): void {
  const bounces: Bullet[] = [];
  // Worked out once a step: an SMG's trait asks for it on every hit (ID-101).
  const front = wallFront(s);
  s.bullets = s.bullets.filter((b) => {
    let travel = Math.min(b.speed * STEP, b.left);
    for (let hit = crossed(s, b, travel); hit; hit = crossed(s, b, travel)) {
      const first = b.hit.length === 0;
      const dealt = hitDamage(
        hit.enemy,
        b.damage * traitFactor(front, b, hit.enemy),
        b.ap === true,
      );
      popOn(s, hit.enemy, dealt, b.crit === true);
      const alive = hit.enemy.hp > 0;
      hit.enemy.hp -= dealt;
      if (alive && !b.owner.startsWith('turret:')) {
        if (b.crit) s.feats.push({ kind: 'crit', by: b.owner, at: s.time });
        if (hit.enemy.hp <= 0) s.feats.push({ kind: 'kill', by: b.owner, at: s.time });
      }
      b.hit.push(hit.enemy.id);
      b.x += b.dx * hit.at;
      b.y += b.dy * hit.at;
      b.left -= hit.at;
      travel -= hit.at;
      s.impacts.push({ x: b.x, y: b.y, hit: true, at: s.time + STEP });
      traitHit(s, b, hit.enemy);
      if (!b.owner.startsWith('turret:')) cardHit(s, b, hit.enemy, first, dealt, bounces);
      if (b.pierce <= 0) return false;
      b.pierce -= 1;
      b.left = Math.min(b.left, PIERCE.reach);
      travel = Math.min(travel, b.left);
    }
    b.x += b.dx * travel;
    b.y += b.dy * travel;
    b.left -= travel;
    if (b.left > EPS) return true;
    s.impacts.push({ x: b.x, y: b.y, hit: false, at: s.time + STEP });
    return false;
  });
  // Bounces fly from the next step, so one never hits twice in the step it was born.
  s.bullets.push(...bounces);
}

/** The x of the wall's front (ID-101): the outermost built layer's face; with none built, the outermost layer's. */
export function wallFront(s: Pick<HordeState, 'layers'>): number {
  const built = s.layers.filter((l) => l.segments.some((seg) => seg.kind !== null));
  const ls = built.length > 0 ? built : s.layers;
  return ls.length > 0 ? Math.max(...ls.map((l) => l.x)) + WALL.depth : 0;
}

/** Whether `e` is a boss, a mini-boss or a heavy kind: a Sniper rifle's boss-damage affix counts (ID-101). */
const bossOrHeavy = (e: Enemy): boolean => e.horror !== undefined || HEAVY_KINDS.includes(e.kind);

/**
 * Gun traits' and role affixes' damage factor for bullet `b` hitting `e`, the wall's front at `front` (ID-101): an SMG's
 * `close` share more within `TRAIT.close.range` px of it, a Sniper rifle's
 * `heavy` share more on a boss, mini-boss or heavy kind.
 */
function traitFactor(front: number, b: Bullet, e: Enemy): number {
  const close = b.close !== undefined && e.x <= front + TRAIT.close.range + EPS;
  return (close ? 1 + b.close! : 1) * (b.heavy !== undefined && bossOrHeavy(e) ? 1 + b.heavy : 1);
}

/**
 * Gun traits on a hit (ID-101), on `e` still standing: a Shotgun pellet staggers it (no
 * moving) for `TRAIT.stagger.seconds`, never while it is held already nor within
 * `TRAIT.stagger.gap` s of its last stagger's start; an LMG hit slows it for
 * `TRAIT.slow.seconds`, a new hit renewing the time with the larger slow, never stacking.
 */
function traitHit(s: HordeState, b: Bullet, e: Enemy): void {
  if (e.hp <= 0) return;
  if (b.stagger && !stunned(s, e) && !staggered(s, e)) {
    if (e.staggerAt === undefined || s.time - e.staggerAt >= TRAIT.stagger.gap - EPS) {
      e.staggerAt = s.time;
      e.staggerUntil = s.time + TRAIT.stagger.seconds;
    }
  }
  if (b.slow !== undefined) {
    e.slowBy = Math.max(slowedBy(s, e), b.slow);
    e.slowUntil = s.time + TRAIT.slow.seconds;
  }
}

/** Whether a Shotgun's stagger stops `e` now (ID-101). */
export const staggered = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.staggerUntil !== undefined && !due(s.time, e.staggerUntil);

/** The share an LMG's slow takes off `e`'s speed now (ID-101); 0 when none holds. */
export const slowedBy = (s: Pick<HordeState, 'time'>, e: Enemy): number =>
  e.slowUntil !== undefined && !due(s.time, e.slowUntil) ? (e.slowBy ?? 0) : 0;

/** The living enemies other than `e` within `radius` of it, nearest first (ties → lowest id). */
function around(s: HordeState, e: Enemy, radius: number): Enemy[] {
  const near: { enemy: Enemy; d: number }[] = [];
  for (const o of s.enemies) {
    if (o === e || o.hp <= 0) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y);
    if (d <= radius + EPS) near.push({ enemy: o, d });
  }
  near.sort((a, b) => a.d - b.d || a.enemy.id - b.enemy.id);
  return near.map((n) => n.enemy);
}

/**
 * Design §8: what the behaviour cards held do when squad bullet `b` hits `e` for
 * `dealt` damage. Incendiary Rounds sets it alight at its level's rate; Shock Rounds
 * paralyses it; Concussion Rounds knocks it back if it still stands; on the bullet's
 * `first` hit, a Ricochet bounce heads for the nearest other enemy (into `bounces`).
 */
function cardHit(
  s: HordeState,
  b: Bullet,
  e: Enemy,
  first: boolean,
  dealt: number,
  bounces: Bullet[],
): void {
  if (took(s, 'incendiary-rounds')) {
    e.burnUntil = s.time + CARD.burn.seconds;
    e.burnDps = burnDpsOf(s);
  }
  if (took(s, 'shock-rounds')) shock(s, e);
  if (took(s, 'concussion-rounds')) knockBack(s, e, dealt);
  if (!first || b.ricochet || !took(s, 'ricochet')) return;
  const next = around(s, e, CARD.ricochet.range).find((o) => !b.hit.includes(o.id));
  if (!next) return;
  const aim = leadPoint(b.x, b.y, next, b.speed);
  const d = Math.hypot(aim.x - b.x, aim.y - b.y) || 1;
  bounces.push({
    // The same gun's bullet: it keeps its trait marks (ID-101), applied at its own hit.
    ...b,
    dx: (aim.x - b.x) / d,
    dy: (aim.y - b.y) / d,
    damage: b.damage * atLevel(s, 'ricochet', CARD.ricochet.share),
    fromX: b.x,
    fromY: b.y,
    aim: d,
    left: CARD.ricochet.range,
    // Ricochet + Piercing Rounds: the bounce keeps the pierce the bullet had before this hit.
    pierce: took(s, 'piercing-rounds') ? b.pierce : 0,
    hit: [e.id],
    ricochet: true,
  });
}

/**
 * Concussion Rounds (design §8, was Stopping Power): `e`, still standing after a hit that
 * dealt `dealt`, is knocked back `CARD.concussion.perDamage` px a point (a heavy kind
 * `CARD.concussion.heavy` of that); never a Crawler on the wall, one inside the camp, or
 * past the spawn edge, and never within `CARD.concussion.gap` s of its last push (ID-097).
 * Each enemy is pushed at most `CARD.concussion.cap` px in all (ID-124), so steady fire
 * can't hold it in place.
 */
function knockBack(s: HordeState, e: Enemy, dealt: number): void {
  if (e.hp <= 0 || e.inCamp || e.climbUntil !== 0) return;
  if (e.pushedAt !== undefined && s.time - e.pushedAt < CARD.concussion.gap - EPS) return;
  const left = CARD.concussion.cap - (e.pushed ?? 0);
  if (left <= EPS) return;
  const heavy = CARD.concussion.heavyKinds.includes(e.kind);
  const push = Math.min(
    left,
    CARD.concussion.perDamage * dealt * (heavy ? CARD.concussion.heavy : 1),
  );
  const x = Math.max(e.x, Math.min(s.spawnX ?? FIELD.right, e.x + push));
  e.pushed = (e.pushed ?? 0) + (x - e.x);
  e.x = x;
  e.pushedAt = s.time;
}

/**
 * Shock Rounds (design §8, ID-097): `e`, still standing, is paralysed for its level's
 * time (a heavy kind `CARD.shock.heavy` of it): no moving, no attacking. Not while it is
 * already held (a hit never extends one), nor within `CARD.shock.immune` s after its last
 * paralysis ended.
 */
function shock(s: HordeState, e: Enemy): void {
  if (e.hp <= 0 || stunned(s, e)) return;
  if (e.shockUntil !== undefined && s.time < e.shockUntil + CARD.shock.immune - EPS) return;
  const heavy = CARD.shock.heavyKinds.includes(e.kind);
  const secs = atLevel(s, 'shock-rounds', CARD.shock.seconds) * (heavy ? CARD.shock.heavy : 1);
  e.shockUntil = s.time + secs;
  e.stunnedUntil = Math.max(e.stunnedUntil, e.shockUntil);
}

/** Whether Shock Rounds holds `e` paralysed now (ID-097). */
export const shocked = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.shockUntil !== undefined && !due(s.time, e.shockUntil);

/**
 * Frag Grenades (design §8): when due, the survivor on the line nearest the target throws
 * at the enemy outside the camp, within `CARD.frag.range` of a survivor, with the most
 * others within `CARD.frag.radius` (ties → nearest the wall, then lowest id), aimed where it
 * will be in `CARD.frag.flight` s; the next one comes `CARD.frag.every` ÷ the survivors on the
 * line later. With nobody in reach it waits for the next step.
 */
function throwFrag(s: HordeState): void {
  if (s.nextFragAt === undefined || !took(s, 'frag-grenades') || !due(s.time, s.nextFragAt)) {
    return;
  }
  const throwers = s.posts.flatMap((p) => {
    const d = s.defenders.find((x) => x.id === p.defenderId);
    return d ? [d] : [];
  });
  let best: { e: Enemy; by: Defender; near: number } | undefined;
  for (const e of s.enemies) {
    if (e.hp <= 0 || e.inCamp) continue;
    let by: Defender | undefined;
    let byD = Infinity;
    for (const d of throwers) {
      const dist = Math.hypot(e.x - d.x, e.y - d.y);
      if (dist <= CARD.frag.range + EPS && dist < byD) [by, byD] = [d, dist];
    }
    if (!by) continue;
    const near = around(s, e, CARD.frag.radius).length;
    const better =
      !best ||
      near > best.near ||
      (near === best.near && (e.x < best.e.x || (e.x === best.e.x && e.id < best.e.id)));
    if (better) best = { e, by, near };
  }
  if (!best) return;
  const { e, by } = best;
  const t = CARD.frag.flight;
  s.grenades.push({
    by: by.id,
    fromX: by.x,
    fromY: by.y,
    x: e.x + e.vx * t,
    y: Math.min(FIELD.height, Math.max(0, e.y + e.vy * t)),
    at: s.time,
    lands: s.time + t,
    burst: false,
  });
  s.feats.push({ kind: 'throw', by: by.id, at: s.time });
  // Every survivor on the line carries grenades: the squad throws one every `every` s each.
  s.nextFragAt = s.time + CARD.frag.every / throwers.length;
}

/**
 * Each Frag Grenade landing bursts for `fragDamage` (a share of this wave's Shambler HP,
 * ID-124; armour doesn't reduce it) on every enemy within its reach.
 */
function blowFrags(s: HordeState): void {
  s.grenades = s.grenades.filter((g) => s.time - g.lands < CARD.frag.flash);
  const damage = fragDamage(s);
  for (const g of s.grenades) {
    if (g.burst || !due(s.time, g.lands)) continue;
    g.burst = true;
    for (const e of s.enemies) {
      if (e.hp > 0 && Math.hypot(e.x - g.x, e.y - g.y) <= CARD.frag.radius + EPS) {
        popOn(s, e, damage);
        e.hp = Math.max(0, e.hp - damage);
      }
    }
  }
}

/** The trait and role-affix marks a bullet from gun `h` carries (ID-101; `TRAIT`, `GUN_ROLES`). */
function traitsOf(h: Held): Pick<Bullet, 'ap' | 'close' | 'heavy' | 'slow' | 'stagger'> {
  switch (baseOf(h)) {
    case 'smg':
      return { close: TRAIT.close.bonus + affixShare(h, 'closeDamage') };
    case 'shotgun':
      return { stagger: true };
    case 'lmg':
      return { slow: Math.min(TRAIT.slow.max, TRAIT.slow.by + affixShare(h, 'slow')) };
    case 'sniper': {
      const heavy = affixShare(h, 'bossDamage');
      return heavy > 0 ? { ap: true, heavy } : { ap: true };
    }
    default:
      return {};
  }
}

function fire(s: HordeState, rng: Rng): void {
  s.strikes = s.strikes.filter((k) => s.time - k.at < STRIKE_FLASH);
  s.shots = s.shots.filter((k) => s.time - k.at < MUZZLE_FLASH);
  s.impacts = s.impacts.filter((k) => s.time - k.at < IMPACT_FLASH);
  s.spits = s.spits.filter((k) => s.time - k.at < SPEWER.splash);
  s.bursts = s.bursts.filter((k) => s.time - k.at < SWOLLEN.burst);
  s.pops = s.pops.filter((k) => s.time - k.at < DAMAGE_POP.keep);
  s.feats = s.feats.filter((k) => s.time - k.at < FEAT_KEEP);
  for (const post of s.posts) {
    const defender = s.defenders.find((d) => d.id === post.defenderId);
    if (!defender) continue;
    reload(s, defender);
    if (!due(s.time, defender.nextShotAt)) continue;
    const use = choose(s, defender, post);
    if (!use) continue;
    const { slot, target } = use;
    const id = defender.loadout[slot]!;
    const weapon = weaponOf(id);
    const gun = isGun(id);
    // Any weapon can crit with Sharp Mind (ID-084). Crits roll only when the chance is
    // above 0, so a defender without it (or a Gunner's handling) leaves the RNG alone.
    // A gun adds its own crit (ID-101): the Rifle's trait, a crit or crit damage affix.
    const crit = critChance(defender, gun) + (gun ? gunCrit(id) : 0);
    const critHit = crit > 0 && chance(rng, crit);
    const hit =
      weapon.damage *
      s.mods.damage *
      boost(s, 'damage') *
      damageFactor(defender, id) *
      (critHit ? critDamage(defender) + gunCritDamage(id) : 1);
    // Instinct's last-line damage (ID-125): on a bullet it adds to the SMG's near-wall share.
    const wall = wallDamage(defender);
    if (gun) {
      const traits = traitsOf(id);
      const close = (traits.close ?? 0) + wall;
      launch(s, rng, {
        owner: defender.id,
        x: use.x,
        y: use.y,
        target,
        speed: gunOf(id).speed,
        spread: spreadOf(defender, id),
        range: gunRange(s, defender.walking ? { kind: 'ground' } : post, id),
        damage: hit,
        pierce: pierceOf(id) + extraPierce(s, rng),
        pellets: gunOf(id).pellets,
        tracer: gunOf(id).tracer,
        ...(critHit ? { crit: true as const } : {}),
        ...traits,
        ...(close > 0 ? { close } : {}),
      });
    } else {
      const near = wall > 0 && target.x <= wallFront(s) + TRAIT.close.range + EPS;
      const dealt = near ? hit * (1 + wall) : hit;
      popOn(s, target, dealt, critHit);
      target.hp -= dealt;
      s.strikes.push({ x: target.x, y: target.y, at: s.time, owner: defender.id });
    }
    // Butcher's Hunger counts the blade or tool kill of this strike.
    const kills = !gun && target.hp <= 0 ? 1 : 0;
    for (let k = 0; k < kills; k++) s.feats.push({ kind: 'kill', by: defender.id, at: s.time });
    if (kills > 0 && perkOn(s, 'butchers-hunger')) hunger(s, defender, kills);
    defender.nextShotAt = nextShot(
      s.time,
      defender.nextShotAt,
      weapon.fireInterval /
        (s.mods.fireRate *
          boost(s, 'fireRate') *
          engineerBuff(s, defender) *
          fireRateFactor(defender, id) *
          (gun ? perkFactor(s, 'steady-fire', PERK.steadyFire) : 1)),
    );
    if (gun) {
      defender.ammo[slot] -= 1;
      if (defender.ammo[slot] === 0) defender.reloadedAt[slot] = s.time + reloadIn(s, defender, id);
    }
  }
}

/**
 * Design §7: each turret that can fire and has a target draws `TURRET.draw` charge per
 * second, and shoots a bullet when due; each shot wears it. Below `slowBelow` condition it fires
 * slower, down to half speed. The bank never goes below 0.
 */
function fireTurrets(s: HordeState, rng: Rng): void {
  // In id order, so when the bank runs dry the lower ids get the last charge.
  for (const t of s.turrets) {
    if (turretState(s, t) !== 'lit') continue;
    const range = TURRET.range * TURRET_RANGE[t.mount];
    const target = targetFrom(s, t.x, t.y, range);
    if (!target) continue;
    if (!freePower(s)) s.energy = Math.max(0, s.energy - TURRET.draw * drawFactor(s) * STEP);
    if (!due(s.time, t.nextShotAt)) continue;
    const buff = turretBuff(s, t);
    launch(s, rng, {
      owner: `turret:${t.id}`,
      x: t.x,
      y: t.y,
      target,
      speed: TURRET.speed,
      spread: TURRET.spread,
      range,
      damage:
        TURRET.damage *
        buff *
        boost(s, 'damage') *
        perkFactor(s, 'overclock', PERK.overclock.damage),
      pierce: 0,
      pellets: 1,
      tracer: TURRET.tracer,
    });
    const slow = Math.min(1, 0.5 + (0.5 * t.condition) / TURRET.slowBelow);
    t.nextShotAt = nextShot(
      s.time,
      t.nextShotAt,
      TURRET.fireInterval / (buff * slow * boost(s, 'fireRate')),
    );
    wear(t, TURRET.shotWear);
  }
}

/**
 * Turret charge-draw factor from Overclock and Power Saver (design §5); they multiply.
 * Overclock's extra draw is its cost and stays at its level-1 size.
 */
export function drawFactor(s: PerkView): number {
  return (
    (perkOn(s, 'overclock') ? PERK.overclock.draw : 1) *
    perkFactor(s, 'power-saver', PERK.powerSaver)
  );
}

/**
 * Butcher's Hunger (design §5): `kills` × `PERK.butcherHeal` HP to the damaged standing
 * segment nearest `d` (ties → the earlier layer, then the lower row), up to its max.
 */
function hunger(s: HordeState, d: Defender, kills: number): void {
  let best: Segment | undefined;
  let bestDist = Infinity;
  for (const l of s.layers) {
    for (const seg of l.segments) {
      if (seg.hp <= 0 || seg.hp >= seg.maxHp) continue;
      const dist = Math.hypot(l.x - d.x, (seg.index + 0.5) * SEGMENT_HEIGHT - d.y);
      if (dist < bestDist - EPS) {
        best = seg;
        bestDist = dist;
      }
    }
  }
  const heal = PERK.butcherHeal * perkScale(s, 'butchers-hunger') * kills;
  if (best) best.hp = Math.min(best.maxHp, best.hp + heal);
}

/**
 * Design §7: each standing Engineer restores `TURRET.engineerRepair` condition/s (Tech
 * and title scale it) to the most worn turret within their tool's reach (ties → lower
 * id). A jammed turret waits for build mode.
 */
function repairTurrets(s: HordeState): void {
  for (const d of s.defenders) {
    if (d.walking || professionOf(d.loadout) !== 'engineer') continue;
    let worst: Turret | undefined;
    for (const t of s.turrets) {
      if (t.condition <= 0 || t.condition >= MAX_CONDITION) continue;
      if (!engineersNear(s, t).includes(d)) continue;
      if (!worst || t.condition < worst.condition) worst = t;
    }
    if (worst) {
      const gain = TURRET.engineerRepair * STEP;
      worst.condition = Math.min(MAX_CONDITION, worst.condition + gain);
    }
  }
}

/**
 * Design §6: each standing Engineer restores HP to the most damaged standing segment
 * (lowest HP share; ties → lower row) of its post's layer, within one row of the post.
 * Broken segments wait for build mode.
 */
function repair(s: HordeState): void {
  for (const d of s.defenders) {
    if (d.walking || professionOf(d.loadout) !== 'engineer') continue;
    const w = toolOf(d.loadout.secondary!);
    const post = s.posts[d.postId]!;
    const layer = s.layers.find((l) => l.column === post.column);
    let worst: Segment | undefined;
    for (const seg of layer?.segments ?? []) {
      if (Math.abs(seg.index - post.row) > 1 || seg.hp <= 0 || seg.hp >= seg.maxHp) continue;
      if (!worst || seg.hp / seg.maxHp < worst.hp / worst.maxHp) worst = seg;
    }
    if (worst) worst.hp = Math.min(worst.maxHp, worst.hp + w.repair * STEP);
  }
}

/** Whether Incendiary Rounds still has `e` alight. */
export const burning = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.burnUntil !== undefined && e.burnUntil > 0 && !due(s.time, e.burnUntil);

/**
 * Pays XP and cash for every enemy at 0 HP, counts the mutants among them (ID-025), and
 * takes it off the field.
 */
export function removeDead(s: HordeState): void {
  for (const e of s.enemies) {
    if (e.hp > 0) continue;
    s.xp += ENEMIES[e.kind].xp;
    s.cash += ENEMIES[e.kind].cash * perkFactor(s, 'scavengers-eye', PERK.cash) * s.cashRate;
    if (MUTANTS.includes(e.kind)) s.mutantKills += 1;
    if (e.id === s.focusId) s.focusId = null;
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}

/** How many times as hard each skill use works this fight (ID-100): 1 unless picked alone. */
export const skillPower = (s: Pick<HordeState, 'freeSkills'>): number => s.freeSkills?.power ?? 1;

/**
 * This wave's Shambler HP, on the fight's HP curve: what the skills and cards that keep up
 * with the hordes deal a share of (ID-114, ID-124).
 */
export const shamblerHp = (s: Pick<HordeState, 'hordeNumber' | 'wave' | 'hpScale'>): number =>
  enemyHp('shambler', s.hordeNumber, s.wave, s.hpScale);

/**
 * A molotov fire's damage a second (ID-114): `SKILLS.molotov.burn` of this wave's Shambler
 * HP, so it keeps up with enemy HP as hordes go up, at the skill's power.
 */
export const fireDps = (
  s: Pick<HordeState, 'hordeNumber' | 'wave' | 'hpScale' | 'freeSkills'>,
): number => SKILLS.molotov.burn * shamblerHp(s) * skillPower(s);

/** An Incendiary Rounds burn's damage a second at the card's level (ID-124): its share of this wave's Shambler HP. */
export const burnDpsOf = (
  s: Parameters<typeof cardLevel>[0] & Pick<HordeState, 'hordeNumber' | 'wave' | 'hpScale'>,
): number => atLevel(s, 'incendiary-rounds', CARD.burn.share) * shamblerHp(s);

/** A Frag Grenade's burst (ID-124): `CARD.frag.share` of this wave's Shambler HP. */
export const fragDamage = (s: Pick<HordeState, 'hordeNumber' | 'wave' | 'hpScale'>): number =>
  CARD.frag.share * shamblerHp(s);

/** Whether a flashbang still holds `e` (fight time, so it waits out picks too). */
export const stunned = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  !due(s.time, e.stunnedUntil);

/** Whether a flashbang's daze still holds `e` (ID-107): the view's ring of stars. */
export const dazed = (s: Pick<HordeState, 'time'>, e: Enemy): boolean =>
  e.dazedUntil !== undefined && !due(s.time, e.dazedUntil);

/**
 * Design §4, ID-041: each airstrike bomb that lands hits every enemy within its radius
 * at once, and each flashbang stuns them, both flashing; each molotov bottle lights a fire.
 */
function land(s: HordeState): void {
  const landed = s.incoming.filter((i) => due(s.time, i.at));
  if (landed.length === 0) return;
  s.incoming = s.incoming.filter((i) => !due(s.time, i.at));
  for (const i of landed) {
    if (i.skill === 'molotov') {
      s.fires.push({ x: i.x, y: i.y, at: s.time, until: s.time + SKILLS.molotov.seconds });
      continue;
    }
    const skill = i.skill;
    s.blasts.push({ skill, x: i.x, y: i.y, at: s.time });
    for (const e of s.enemies) {
      if (e.hp <= 0 || Math.hypot(e.x - i.x, e.y - i.y) > SKILLS[skill].radius + EPS) continue;
      if (skill === 'airstrike') {
        const damage = SKILLS.airstrike.damage * skillPower(s);
        popOn(s, e, damage);
        e.hp = Math.max(0, e.hp - damage);
      } else {
        e.dazedUntil = Math.max(e.dazedUntil ?? 0, s.time + SKILLS.flashbang.seconds);
        e.stunnedUntil = Math.max(e.stunnedUntil, e.dazedUntil);
      }
    }
  }
}

/**
 * Design §4, as built ID-019: each molotov fire burns every enemy inside it at `fireDps`
 * (ID-114) until it goes out; the flash of a skill fades after `SKILL_FLASH`. Design §8: an enemy set
 * alight by Incendiary Rounds burns at the rate the hit that lit it gave (`burnDps`).
 */
function burn(s: HordeState): void {
  for (const e of s.enemies) {
    if (!burning(s, e)) continue;
    const dps = e.burnDps ?? CARD.burn.share[CARD_MAX_LEVEL - 1]! * shamblerHp(s);
    popOn(s, e, dps * STEP);
    e.hp = Math.max(0, e.hp - dps * STEP);
    e.burnt = (e.burnt ?? 0) + dps * STEP;
  }
  s.fires = s.fires.filter((f) => !due(s.time, f.until));
  s.blasts = s.blasts.filter((b) => s.time - b.at < SKILL_FLASH);
  const fireHit = fireDps(s) * STEP;
  for (const f of s.fires) {
    for (const e of s.enemies) {
      if (Math.hypot(e.x - f.x, e.y - f.y) <= SKILLS.molotov.radius + EPS) {
        popOn(s, e, fireHit);
        e.hp = Math.max(0, e.hp - fireHit);
        e.burnt = (e.burnt ?? 0) + fireHit;
      }
    }
  }
}

const segmentAt = (y: number): number =>
  Math.min(SEGMENTS - 1, Math.max(0, Math.floor(y / SEGMENT_HEIGHT)));

/**
 * Where an enemy stops: the standing segment in front of it on the nearest layer
 * not yet crossed, else (through gaps) the camp. Walls ignore the enemy's radius.
 */
function stopLine(
  s: HordeState,
  e: Enemy,
): { x: number; segment: Segment | null; layer: Layer | null } {
  // Only layers not yet crossed: a segment patched up behind an enemy never pulls it back.
  const ahead = s.layers.filter((l) => l.x + WALL.depth <= e.x).sort((a, b) => b.x - a.x);
  for (const layer of ahead) {
    const segment = layer.segments[segmentAt(e.y)];
    if (segment && segment.hp > 0) return { x: layer.x + WALL.depth, segment, layer };
  }
  return { x: CAMP.x, segment: null, layer: null };
}

/** The broken segment of `layer` whose centre is nearest `y` (ties → lower index). */
function nearestGap(layer: Layer, y: number): Segment | null {
  let best: Segment | null = null;
  let bestD = Infinity;
  for (const seg of layer.segments) {
    const d = Math.abs((seg.index + 0.5) * SEGMENT_HEIGHT - y);
    if (seg.hp <= 0 && d < bestD) {
      best = seg;
      bestD = d;
    }
  }
  return best;
}

/** An enemy sliding toward a gap: where it started this step and the gap centre it heads for. */
type Slide = { fromY: number; toY: number };
/** This step's moves, by enemy id: slides toward a gap, and enemies in the camp within reach of a defender. */
type Moves = { sliding: Map<number, Slide>; reached: Map<number, Defender> };

/** The defender in the fight nearest `e` (ties → lower index), standing or walking. */
function nearestDefender(s: HordeState, e: Enemy): Defender | undefined {
  let best: Defender | undefined;
  let bestD = Infinity;
  for (const d of s.defenders) {
    const dist = Math.hypot(d.x - e.x, d.y - e.y);
    if (dist < bestD) {
      best = d;
      bestD = dist;
    }
  }
  return best;
}

/**
 * Design §4: an enemy inside the camp walks straight to the nearest defender (walls
 * don't stop it from the camp side) and stops within reach; with no defender left it
 * walks to the camp line and waits.
 */
function hunt(s: HordeState, e: Enemy, speed: number, reached: Map<number, Defender>): void {
  const target = nearestDefender(s, e);
  if (!target) {
    if (e.x > CAMP.x) e.x = Math.max(CAMP.x, e.x - speed);
    return;
  }
  const dist = Math.hypot(target.x - e.x, target.y - e.y);
  const reach = radiusOf(e) + ENEMY_RADIUS;
  const stride = Math.min(speed, dist - reach);
  if (stride > 0) {
    e.x += ((target.x - e.x) / dist) * stride;
    e.y += ((target.y - e.y) / dist) * stride;
  }
  if (dist - Math.max(0, stride) <= reach + EPS) reached.set(e.id, target);
}

/** How far short of its stop line `e` halts: a Spewer at `SPEWER.stop`, the rest at it. */
const standOff = (e: Enemy): number => (e.kind === 'spewer' ? SPEWER.stop : 0);

/** Design §9: a Screamer speeds up the other enemies near it; several don't stack. */
function screamed(screamers: readonly Enemy[], e: Enemy): number {
  const near = screamers.some(
    (o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= SCREAMER.radius + EPS,
  );
  return near ? 1 + SCREAMER.speed : 1;
}

/**
 * Design §9: a Crawler that reaches a standing segment for the first time climbs it
 * for `CRAWLER.climb` s, then drops behind that layer. If the segment breaks under it,
 * it stops climbing and walks on. Returns whether it is (still) on the wall.
 */
function climb(s: HordeState, e: Enemy, stop: ReturnType<typeof stopLine>, speed: number): boolean {
  if (e.kind !== 'crawler' || e.climbed) return false;
  const onWall = stop.segment !== null && e.x <= stop.x + speed + EPS;
  if (e.climbUntil === 0) {
    if (!onWall) return false;
    e.x = stop.x;
    e.climbUntil = s.time + CRAWLER.climb;
    return true;
  }
  if (!onWall) {
    e.climbUntil = 0;
    return false;
  }
  if (!due(s.time, e.climbUntil)) return true;
  const fromX = e.x;
  e.x = stop.layer!.x;
  e.climbUntil = 0;
  e.climbed = true;
  breach(s, e, fromX, true);
  return true;
}

/** Moves every enemy; returns this step's slides and the enemies in the camp within reach. */
function move(s: HordeState): Moves {
  const sliding = new Map<number, Slide>();
  const reached = new Map<number, Defender>();
  const screamers = s.enemies.filter((e) => e.kind === 'screamer' && e.hp > 0);
  const wire = barbedWire(s);
  const wireSlow = wire === null ? 0 : atLevel(s, 'barbed-wire', CARD.wire.slow);
  for (const e of s.enemies) {
    if (stunned(s, e) || staggered(s, e)) continue;
    const slowed =
      wire !== null &&
      !e.inCamp &&
      e.x >= wire.from - EPS &&
      e.x <= wire.to + EPS &&
      wearWire(s, e);
    const speed =
      ENEMIES[e.kind].speed *
      STEP *
      (slowed ? 1 - wireSlow : 1) *
      (1 - slowedBy(s, e)) *
      trapSlow(s, e) *
      screamed(screamers, e) *
      (roared(s, e) ? 1 + BOSS_SKILL.roar.speed : 1) *
      (charging(s, e) ? HORROR.charge.speed : 1);
    if (e.inCamp) {
      hunt(s, e, speed, reached);
      continue;
    }
    let stop = stopLine(s, e);
    const sense = stop.layer && stop.x + standOff(e) >= e.x - GAP_SENSE;
    const gap = sense && e.climbUntil === 0 ? nearestGap(stop.layer!, e.y) : null;
    if (gap) {
      const toY = (gap.index + 0.5) * SEGMENT_HEIGHT;
      const dy = toY - e.y;
      sliding.set(e.id, { fromY: e.y, toY });
      e.y += Math.sign(dy) * Math.min(Math.abs(dy), speed);
      stop = stopLine(s, e);
    }
    if (climb(s, e, stop, speed)) {
      e.inCamp = s.layers.every((l) => e.x < l.x + WALL.depth);
      continue;
    }
    const fromX = e.x;
    // Never backwards: a Spewer pushed into a walled row inside its range stays put.
    e.x = Math.min(e.x, Math.max(stop.x + (stop.layer ? standOff(e) : 0), e.x - speed));
    breach(s, e, fromX);
    // Only through a gap in every layer; from now on it hunts defenders.
    e.inCamp = s.layers.every((l) => e.x < l.x + WALL.depth);
  }
  return { sliding, reached };
}

/**
 * Barbed Wire (design §8): the band `CARD.wire.from`–`CARD.wire.to` px in front of the
 * outermost layer with a segment built, standing or not (the coils are out in the field,
 * so they stay put as it falls); null without the card or a built layer.
 */
export function barbedWire(
  s: Pick<HordeState, 'taken' | 'layers'>,
): { from: number; to: number } | null {
  if (!took(s, 'barbed-wire')) return null;
  const built = s.layers.filter((l) => l.segments.some((seg) => seg.kind !== null));
  if (built.length === 0) return null;
  const front = Math.max(...built.map((l) => l.x)) + WALL.depth;
  return { from: front + CARD.wire.from, to: front + CARD.wire.to };
}

/**
 * Barbed Wire's row under `e`, which stands in the band (ID-090): the first time `e` is in
 * a working row, the row loses its kind's wear (ID-104), never below 0. Whether that row
 * still slows: a row the crossing broke slows no one, `e` included.
 */
function wearWire(s: HordeState, e: Enemy): boolean {
  const row = s.wire[segmentAt(e.y)]!;
  if (row.durability > 0 && !row.hit.includes(e.id)) {
    row.hit.push(e.id);
    row.durability = Math.max(0, row.durability - CARD.wire.wear[e.kind]);
  }
  return row.durability > 0;
}

/** The trap whose cell `e` stands in, if any. */
function trapUnder(s: HordeState, e: Enemy): Trap | undefined {
  if (e.inCamp || e.x < TRAP_STRIP.x || e.x > TRAP_STRIP.x + TRAP_STRIP.width) return undefined;
  const row = segmentAt(e.y);
  return s.traps.find((t) => t.row === row);
}

/**
 * Design §7: an enemy in a working trap's cell that has not triggered it yet does
 * so: the trap loses 1 durability and deals its damage. A broken trap (0) does nothing.
 */
function springTraps(s: HordeState): void {
  for (const e of s.enemies) {
    const t = trapUnder(s, e);
    if (!t || t.durability <= 0 || t.hit.includes(e.id)) continue;
    t.hit.push(e.id);
    t.durability -= 1;
    popOn(s, e, trapStats(s, t.kind).damage);
    e.hp = Math.max(0, e.hp - trapStats(s, t.kind).damage);
  }
}

/**
 * Speed factor for `e`: the slow of the trap it stands in, if it triggered that trap.
 * An enemy that triggered barbed wire stays caught until it leaves the cell, even if
 * that trigger (or a later one) broke the wire; a broken trap catches no one new.
 */
function trapSlow(s: HordeState, e: Enemy): number {
  const t = trapUnder(s, e);
  return t?.hit.includes(e.id) ? trapStats(s, t.kind).slow : 1;
}

/** A basic trap's damage and slow in this fight, with its research upgrade (ID-035). */
export function trapStats(
  s: Pick<HordeState, 'research'>,
  kind: TrapKind,
): { damage: number; slow: number } {
  const { damage, slow } = TRAPS[kind];
  const spikes = TRAP_RESEARCH['sharpened-spikes'];
  const wire = TRAP_RESEARCH['razor-wire'];
  return {
    damage:
      kind === spikes.kind && s.research.includes('sharpened-spikes')
        ? damage * spikes.damage
        : damage,
    slow: kind === wire.kind && s.research.includes('razor-wire') ? wire.slow : slow,
  };
}

/**
 * Records each layer `e` (from outside) crossed this step, the first time any enemy
 * does; a Crawler dropping over a standing segment went over it, not through.
 */
function breach(s: HordeState, e: Enemy, fromX: number, over = false): void {
  for (const l of s.layers) {
    const line = l.x + WALL.depth;
    if (fromX < line || e.x >= line || s.breaches.some((b) => b.column === l.column)) continue;
    const row = segmentAt(e.y);
    s.breaches.push({
      column: l.column,
      row,
      // The wave it came with: horde-only waves overlap (ID-128).
      wave: e.wave ?? s.wave,
      through: over ? 'climbed' : (l.segments[row]?.kind ?? 'gap'),
    });
  }
}

/**
 * Pushes overlapping enemies (bodies of their kind's radius) apart along `y` only
 * (never `x`, so never through a wall): the upper one up, the lower one down (equal
 * `y` → lower id up), each by half the overlap capped per step. Computed from
 * pre-push positions, then clamped to the field by each body's radius. An enemy in
 * the camp and one still outside never push each other: a wall stands between them,
 * so one pressed against it can't hold a hunter off for good.
 */
export function separate(s: Pick<HordeState, 'enemies'>): void {
  const cap = SEPARATION_SPEED * STEP;
  const es = s.enemies;
  const n = es.length;
  const radius = es.map(radiusOf);
  const widest = radius.reduce((a, r) => Math.max(a, r), 0);
  // Sweep along x (ID-105): only bodies within `radius + widest` in x can overlap, so a
  // swarm costs about n log n, not every pair. Pairs that overlap are then applied in
  // index order (i, then j), as the all-pairs loop did, so each body's pushes add up in
  // the same order and every fight plays the same.
  const byX = es.map((_, i) => i).sort((p, q) => es[p]!.x - es[q]!.x);
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let p = 0; p < n; p++) {
    const k = byX[p]!;
    const far = radius[k]! + widest;
    for (let q = p + 1; q < n; q++) {
      const m = byX[q]!;
      if (es[m]!.x - es[k]!.x >= far) break;
      const i = Math.min(k, m);
      const j = Math.max(k, m);
      const a = es[i]!;
      const b = es[j]!;
      if (a.inCamp !== b.inCamp) continue;
      const reach = radius[i]! + radius[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      // Most pairs are far apart: skip them before the square root.
      if (dx >= reach || -dx >= reach || dy >= reach || -dy >= reach) continue;
      const overlap = reach - Math.hypot(dx, dy);
      if (overlap <= 0) continue;
      const aUp = a.y < b.y || (a.y === b.y && a.id < b.id);
      const d = Math.min(overlap / 2, cap);
      pairs.push({ i, j, d: aUp ? -d : d });
    }
  }
  pairs.sort((u, v) => u.i - v.i || u.j - v.j);
  const push = new Float64Array(n);
  const pushed = new Uint8Array(n);
  for (const { i, j, d } of pairs) {
    push[i] = push[i]! + d;
    push[j] = push[j]! - d;
    pushed[i] = pushed[j] = 1;
  }
  es.forEach((e, i) => {
    if (!pushed[i]) return;
    const r = radius[i]!;
    e.y = Math.min(FIELD.height - r, Math.max(r, e.y + push[i]!));
  });
}

/**
 * Enemies at their stop line hit the segment in front. One still getting closer to a
 * gap this step (after separation) holds off; one the crowd pushed back attacks, so a
 * packed crowd can't keep it from ever hitting the wall. An enemy in the camp hits the
 * defender it reached this step (before separation, so a crowd can't hold it off).
 * Design §9: a climbing Crawler doesn't attack; a Spewer spits from its stand-off; a
 * Swollen's hit is its blast, which takes it off the field with no kill paid.
 */
function attack(s: HordeState, moves: Moves, rng: Rng): void {
  const blown = new Set<number>();
  for (const e of s.enemies) {
    if (stunned(s, e) || e.climbUntil > 0 || !due(s.time, e.nextAttackAt)) continue;
    const enemy = ENEMIES[e.kind];
    if (e.inCamp) {
      const defender = moves.reached.get(e.id);
      if (!defender) continue;
      defender.hitBy = e.kind;
      hurt(defender, enemy.damage, rng);
      if (e.kind === 'swollen') blown.add(e.id);
      e.nextAttackAt = s.time + enemy.attackInterval;
      continue;
    }
    const slide = moves.sliding.get(e.id);
    if (slide && Math.abs(slide.toY - e.y) < Math.abs(slide.toY - slide.fromY)) continue;
    if (e.kind === 'spewer' && spit(s, e, rng)) {
      e.nextAttackAt = s.time + enemy.attackInterval;
      continue;
    }
    const stop = stopLine(s, e);
    if (!stop.segment || !stop.layer || e.x > stop.x + standOff(e) + EPS) continue;
    if (e.kind === 'swollen') {
      blast(s, stop.layer, stop.segment.index, e.elite ? ELITE.blast : 1);
      blown.add(e.id);
      continue;
    }
    let damage = enemy.damage;
    if (e.horror && charging(s, e) && !e.horror.charged) {
      e.horror.charged = true;
      damage *= HORROR.charge.hit;
    }
    hitSegment(s, stop.layer, stop.segment, damage);
    if (e.kind === 'spewer') {
      s.spits.push({ fromX: e.x, fromY: e.y, x: stop.x, y: e.y, at: s.time + STEP });
    }
    e.nextAttackAt = s.time + enemy.attackInterval;
  }
  if (blown.size === 0) return;
  for (const e of s.enemies) {
    if (blown.has(e.id)) s.bursts.push({ id: e.id, x: e.x, y: e.y, at: s.time + STEP });
  }
  for (const id of blown) if (s.focusId === id) s.focusId = null;
  s.enemies = s.enemies.filter((e) => !blown.has(e.id));
}

/** A damage number (ID-082) for `amount` taken by `e`, while it is alive. */
function popOn(s: HordeState, e: Enemy, amount: number, crit = false): void {
  if (e.hp > 0) addPop(s, e.x, e.y, amount, crit, e.kind, `e${e.id}`);
}

/**
 * Adds `amount` to the newest number on `key` with the same `crit` younger than
 * `DAMAGE_POP.merge`, or starts one; past `DAMAGE_POP.cap` the oldest goes.
 */
function addPop(
  s: HordeState,
  x: number,
  y: number,
  amount: number,
  crit: boolean,
  on: Pop['on'],
  key: string,
): void {
  if (!(amount > 0)) return;
  // Newest last: none older than the merge window can take it.
  for (let i = s.pops.length - 1; i >= 0; i--) {
    const p = s.pops[i]!;
    if (s.time - p.at >= DAMAGE_POP.merge) break;
    if (p.key === key && p.crit === crit) {
      p.amount += amount;
      return;
    }
  }
  s.pops.push({ x, y, amount, crit, on, key, at: s.time });
  if (s.pops.length > DAMAGE_POP.cap) s.pops.shift();
}

/** The least time between two hit marks on one segment (ID-072); its flash lasts 0.25 s. */
export const HIT_MARK_GAP = 0.4;

/** Takes `damage` off a standing segment; only the damage it actually takes wears its turret. */
function hitSegment(s: HordeState, layer: Layer, segment: Segment, damage: number): void {
  if (segment.hp <= 0) return;
  // What it lost (ID-082), on its camp-side face, away from the enemies striking it.
  const y = (segment.index + 0.5) * SEGMENT_HEIGHT;
  const lost = Math.min(damage, segment.hp);
  addPop(s, layer.x, y, lost, false, 'wall', `w${layer.column}:${segment.index}`);
  wearMounted(s, layer.column, segment.index, Math.min(damage, segment.hp));
  segment.hp = Math.max(0, segment.hp - damage);
  // A crowd hitting one segment starts a new flash at most every HIT_MARK_GAP s, so it
  // never stays washed out over the damage it shows (ID-072).
  if (damage > 0 && !(s.time - (segment.hitAt ?? -Infinity) < HIT_MARK_GAP)) segment.hitAt = s.time;
}

/** Design §9: a Swollen's blast on segment `row` of `layer`, and on its standing neighbours. */
function blast(s: HordeState, layer: Layer, row: number, scale = 1): void {
  const centre = layer.segments[row]!;
  hitSegment(s, layer, centre, SWOLLEN.wall * scale);
  for (const n of [row - 1, row + 1]) {
    const seg = layer.segments[n];
    if (seg) hitSegment(s, layer, seg, SWOLLEN.splash * scale);
  }
}

/**
 * Design §9: a Spewer spits at the nearest defender or working turret (not jammed,
 * its wall standing) within `SPEWER.range` (ties → defenders first, then lower
 * index): HP off a defender (as any hit, `hurt`), condition off a turret.
 * Returns false when there is none.
 */
function spit(s: HordeState, e: Enemy, rng: Rng): boolean {
  let best: { x: number; y: number; hit: () => void } | null = null;
  let bestD = Infinity;
  const damage = ENEMIES.spewer.damage;
  for (const d of s.defenders) {
    const dist = Math.hypot(d.x - e.x, d.y - e.y);
    if (dist > SPEWER.range + EPS || dist >= bestD) continue;
    bestD = dist;
    best = {
      x: d.x,
      y: d.y,
      hit: () => {
        d.hitBy = 'spewer';
        hurt(d, damage, rng);
      },
    };
  }
  for (const t of s.turrets) {
    const state = turretState(s, t);
    if (state === 'jammed' || state === 'offline') continue;
    const dist = Math.hypot(t.x - e.x, t.y - e.y);
    if (dist > SPEWER.range + EPS || dist >= bestD) continue;
    bestD = dist;
    best = { x: t.x, y: t.y, hit: () => wear(t, damage) };
  }
  if (!best) return false;
  best.hit();
  s.spits.push({ fromX: e.x, fromY: e.y, x: best.x, y: best.y, at: s.time + STEP });
  return true;
}

/**
 * A hit of `damage` on defender `d` (design §6): a shield's share and Instinct's armour
 * off. One that would drop them to 0 HP leaves them at 1 instead on an Instinct roll,
 * rolled only for a survivor with Instinct so the RNG is left alone otherwise.
 */
function hurt(d: Defender, damage: number, rng: Rng): void {
  const hp = d.hp - damageTaken(d, damage);
  if (hp > 0) {
    d.hp = hp;
    return;
  }
  const dodge = dodgeChance(d);
  d.hp = dodge > 0 && d.hp > 1 && chance(rng, dodge) ? 1 : 0;
}

/** Takes `amount` off `t`'s condition; float noise near 0 (1 − 5 × 0.2) jams it rather than leaving a sliver. */
function wear(t: Turret, amount: number): void {
  const c = t.condition - amount;
  t.condition = c <= EPS ? 0 : c;
}

/** Design §7: a hit on a segment wears the turret on its wall mount by `hitWear` per point. */
function wearMounted(s: HordeState, column: number, row: number, damage: number): void {
  for (const t of s.turrets) {
    if (t.mount !== 'wall-walk' || t.column !== column || t.row !== row) continue;
    wear(t, TURRET.hitWear * damage);
  }
}

/** Design §4: a defender at 0 HP is injured and leaves the fight; their post is free at once. */
function injure(s: HordeState): void {
  const kept: Defender[] = [];
  for (const d of s.defenders) {
    if (d.hp > 0) {
      kept.push(d);
      continue;
    }
    s.posts[d.postId]!.defenderId = null;
    s.injured.push({
      defender: specOf(d),
      postId: d.postId,
      at: s.time,
      offered: false,
      by: d.hitBy,
    });
  }
  s.defenders = kept;
}

/** Design §2: an enemy in the camp and no defender left for `FALL_WARNING` s loses the horde. */
function fall(s: HordeState): void {
  if (s.outcome !== 'fighting') return;
  if (s.defenders.length > 0 || !s.enemies.some((e) => e.inCamp)) {
    s.fallingFor = 0;
    return;
  }
  s.fallingFor += STEP;
  if (due(s.fallingFor, FALL_WARNING)) s.outcome = 'lost';
}

/**
 * Design §3: a defender holding (standing on or walking to) a wall-walk post whose
 * segment has broken falls back, in `defenders` order, to the nearest free ground post
 * behind that layer (ties → lowest id), or to the bench when none is free.
 */
function drop(s: HordeState): void {
  const kept: Defender[] = [];
  for (const d of s.defenders) {
    const post = s.posts[d.postId]!;
    if (postUsable(s.layers, post)) {
      kept.push(d);
      continue;
    }
    post.defenderId = null;
    let best: Post | undefined;
    let bestD = Infinity;
    for (const p of s.posts) {
      if (p.kind !== 'ground' || p.defenderId !== null || p.x >= COLUMNS[post.column]!) continue;
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < bestD) {
        best = p;
        bestD = dist;
      }
    }
    if (best) {
      best.defenderId = d.id;
      d.postId = best.id;
      d.walking = true;
      kept.push(d);
    } else {
      s.bench.push(specOf(d));
    }
  }
  s.defenders = kept;
}

/**
 * Waves cleared (ID-128): every wave up to it has all come, and none of their enemies
 * stand. Horde-only waves overlap, so this can be behind the wave reached; the full
 * game's, which wait for a clear, it is the wave before the current one until it is won.
 */
export function wavesCleared(
  s: Pick<HordeState, 'outcome' | 'wave' | 'waveCount' | 'toSpawn' | 'enemies' | 'bosses'>,
): number {
  if (s.outcome === 'won') return s.waveCount;
  const pending = s.toSpawn > 0 || s.bosses.some((b) => b.id === null && b.wave <= s.wave);
  let cleared = pending ? s.wave - 1 : s.wave;
  for (const e of s.enemies) if (e.hp > 0) cleared = Math.min(cleared, (e.wave ?? s.wave) - 1);
  return Math.max(0, cleared);
}

function advanceWave(s: HordeState): void {
  if (s.toSpawn > 0) return;
  // Horde-only waves overlap (ID-128): the next comes once this one has all spawned.
  const overlap = fastWaves(s.hordeNumber, s.harder === true) && s.wave < s.waveCount;
  if (s.enemies.length > 0 && !overlap) return;
  if (s.wave >= s.waveCount) {
    // A boss horde is won once its bosses have come and gone (design §2).
    if (s.bosses.some((b) => b.id === null)) return;
    s.outcome = 'won';
    return;
  }
  // A mini-boss's wave waits for it (ID-099).
  if (s.bosses.some((b) => b.id === null && b.wave <= s.wave)) return;
  s.wave += 1;
  s.swarm = s.harder === true && swarmWave(s.hordeNumber, s.wave);
  s.toSpawn = waveEnemies(s);
  s.breakUntil = s.time + WAVE_BREAK;
  // The break rebuilds every wire row for the new wave (ID-123), even under enemies still
  // standing from the last one in the horde-only build (ID-128).
  rebuildWire(s);
  for (const row of s.wire) row.hit = [];
  openReplace(s);
}

/** Enemies the current wave sends: twice as many in a swarm wave (ID-102). */
function waveEnemies(
  s: Pick<HordeState, 'hordeNumber' | 'wave' | 'swarm'> & { harder?: boolean },
): number {
  return waveSize(s.hordeNumber, s.wave, s.harder === true) * (s.swarm ? SWARM.size : 1);
}

/**
 * A Barbed Wire row's full durability (ID-123): its `level`'s `CARD.wire.durability` (level 1
 * when the card isn't held), × the wave's `enemies` over `CARD.wire.perWave` but never less
 * than ×1, rounded. So a row lasts about the same share of a big wave as of a small one.
 */
export function wireMax(level: number, enemies: number): number {
  const { durability, perWave } = CARD.wire;
  const base = durability[Math.min(durability.length, Math.max(1, level)) - 1]!;
  return Math.round(base * Math.max(1, enemies / perWave));
}

/**
 * Puts every Barbed Wire row, broken or worn, at its full durability for the current wave
 * and the card's level (ID-123): at each wave break and each pick of the card. Sized for the
 * wave, or for every enemy still to face when more: horde-only waves overlap (ID-128), so a
 * new wave's wire also meets the last one's still standing.
 */
export function rebuildWire(s: HordeState): void {
  const overlap = fastWaves(s.hordeNumber, s.harder === true);
  const facing = overlap ? s.toSpawn + s.enemies.filter((e) => e.hp > 0).length : 0;
  const max = wireMax(cardLevel(s, 'barbed-wire'), Math.max(waveEnemies(s), facing));
  for (const row of s.wire) {
    row.durability = max;
    row.max = max;
  }
}
