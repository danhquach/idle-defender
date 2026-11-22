// The horde-only build (ID-066, design §2, §11): one loop, fight a horde → result screen
// → next horde. The squad (up to 6 picked from the camp, ID-147) all start on the wall, a
// win adds XP and maybe a survivor, a loss replays the same horde with the wall full. A
// survivor who ends a fight badly hurt rests for a few hordes on the bench. The rest of
// the game's state rides along untouched, so the full game can come back later.
import {
  dropCanBeat,
  bonusWeights,
  firstClearWeights,
  gunLevel,
  gunPower,
  gunSalvage,
  gunStep,
  isOwned,
  replayWeights,
  rollSquadGun,
  rollUpgrade,
  rollWeapon,
  type GunScore,
  type Held,
  type OwnedWeapon,
} from './armoury.ts';
import { squadBase } from './base.ts';
import { recruit } from './camp.ts';
import {
  craftRng,
  isCraftAmount,
  rollBlueprint,
  rollCraftRarity,
  withBlueprint,
  withoutBlueprint,
  blueprintCount,
} from './craft.ts';
import { isModeCard, UPGRADE_IDS, UPGRADES, type CardCategory } from './cards.ts';
import {
  COLUMNS,
  COMBINE_COUNT,
  DEFENDER_HP,
  FARM,
  FIELD,
  GUN_UPGRADE,
  MAX_COUNT,
  POWER,
  RARITY_ORDER,
  SQUAD_BONUS,
  SQUAD_CAP,
  SQUAD_EARLY_HP,
  SQUAD_HP_GROWTH,
  SKILL_IDS,
  SQUAD_LINE,
  SQUAD_LINE_WIDE,
  SQUAD_SCRAP,
  SQUAD_SKILLS,
  SQUAD_SLOT_COSTS,
  SQUAD_SPAWN_X,
  BENCH_XP_SHARE,
  BLUEPRINT,
  CRAFT,
  CRAFT_MADE_MAX,
  SQUAD_XP_RATE,
  STASH_CAP,
  STASH_SLOT,
  START_PERK,
  WEAPONS,
  BOSS_UNLOCKS,
  MODE_UNLOCKS,
  FINALE_HORDE,
  INJURY_REST,
  MID_SWAP,
  PATCH_UP,
  RADIO_HORDES,
  SQUAD_JOIN,
  SURVIVOR_COMBINE,
  type ModeCard,
  type ResearchCard,
  type Rarity,
  type SkillId,
  type WeaponId,
} from './data.ts';
import {
  equip,
  hordeXp,
  levelGains,
  xpGains,
  type GameState,
  type LevelGain,
  type RosterDefender,
} from './game.ts';
import {
  feed,
  fortify,
  newHorde,
  standing,
  wavesCleared,
  type DefenderSpec,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { isGun } from './loadout.ts';
import {
  advance,
  beatenIn,
  effHorde,
  FIRST_UID,
  HIGHER_MODES,
  localHorde,
  localOf,
  MODES,
  modeBosses,
  modeOf,
  topBeaten,
  type HigherMode,
  type Mode,
  type ModeProgress,
} from './modes.ts';
import { chance, createRng } from './rng.ts';
import {
  fieldBonus,
  jobBonus,
  jobPart,
  levelOf,
  maxHpOf,
  survivorDps,
  xpForLevel,
} from './stats.ts';

/** The card categories a horde-only fight offers (ID-066); anything else stays out. */
export const SQUAD_CARD_CATEGORIES: readonly CardCategory[] = ['stat', 'behaviour', 'barrier'];

/**
 * The cards a horde-only fight offers: stat, behaviour and barrier cards. Power cards (no
 * turrets) are out; recruit cards never come, as the whole squad starts on the field.
 */
export const SQUAD_CARDS: readonly UpgradeId[] = UPGRADE_IDS.filter(
  // The mode cards (ID-222) join a fight's pool only through `modeCards`.
  (id) => SQUAD_CARD_CATEGORIES.includes(UPGRADES[id].category) && !isModeCard(id),
);

/**
 * Enemy HP's factor in horde-only Horde `n` (ID-066): `SQUAD_HP_GROWTH.early` per horde
 * until the squad reaches its cap, `late` after; × `SQUAD_EARLY_HP`'s factor for the horde,
 * its last one from there on (ID-097, ID-102, ID-128).
 */
export function squadHpScale(n: number): number {
  const early = Math.min(n, SQUAD_CAP) - 1;
  const late = Math.max(0, n - SQUAD_CAP);
  const ease = SQUAD_EARLY_HP[Math.min(n, SQUAD_EARLY_HP.length) - 1]!;
  return ease * SQUAD_HP_GROWTH.early ** early * SQUAD_HP_GROWTH.late ** late;
}

/** The one perk a horde-only fight runs, always on at level 1 (no perk screen). */
export const SQUAD_PERKS = [START_PERK] as const;

/**
 * A roster defender as the squad fights: plain (no loadout profession), their primary gun
 * only (the pistol if they somehow have none), no secondary or item, and their profession
 * from before the outbreak (ID-149). The roster keeps its loadout.
 */
export function squadSpec(d: RosterDefender): DefenderSpec {
  const primary = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
  return {
    id: d.id,
    name: d.name,
    loadout: { primary, secondary: null, item: null },
    xp: d.xp,
    plain: true,
    job: d.job,
    ...(d.startHp !== undefined ? { startHp: d.startHp } : {}),
  };
}

/**
 * One survivor's share of Squad Power (ID-098): their gun's sustained dmg/s in their hands
 * (`survivorDps`: level and profession counted), times a toughness factor from the level's
 * extra HP. Cards and skills don't count.
 */
export function survivorPower(d: RosterDefender): number {
  const spec = squadSpec(d);
  const tough = 1 + POWER.tough * (maxHpOf(spec) / DEFENDER_HP - 1);
  return survivorDps(spec, spec.loadout.primary) * tough * POWER.scale;
}

/** How hard each picked skill works (ID-100): `SQUAD_SKILLS.solo`× when only 1 is picked. */
export const skillPickPower = (pick: readonly SkillId[]): number =>
  pick.length === 1 ? SQUAD_SKILLS.solo : 1;

/**
 * Picks or drops skill `id` for the next horde (ID-100): a picked one is dropped; else it
 * is added, unless `SQUAD_SKILLS.max` are picked already (refused). Between hordes only.
 */
export function toggleSkill(
  game: GameState,
  id: SkillId,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  if (!SKILL_IDS.includes(id)) throw new RangeError(`toggleSkill: unknown skill ${String(id)}`);
  const pick = game.skillPick.includes(id)
    ? game.skillPick.filter((k) => k !== id)
    : [...game.skillPick, id];
  if (pick.length > SQUAD_SKILLS.max) {
    return { ok: false, reason: `Pick up to ${SQUAD_SKILLS.max}: drop one first` };
  }
  return { ok: true, game: { ...game, skillPick: pick } };
}

/** Slots bought so far (ID-179): none when the game holds no `slots`. */
const boughtOf = (game: Pick<GameState, 'slots'>): { squad: number; stash: number } =>
  game.slots ?? { squad: 0, stash: 0 };

/** The most survivors the squad holds (ID-179): `SQUAD_CAP` and a slot for each one bought. */
export const squadCap = (game: Pick<GameState, 'slots'>): number =>
  SQUAD_CAP + boughtOf(game).squad;

/** The most guns the stash holds (ID-179): `STASH_CAP` and `STASH_SLOT.add` for each purchase. */
export const stashCap = (game: Pick<GameState, 'slots'>): number =>
  STASH_CAP + STASH_SLOT.add * boughtOf(game).stash;

/** The Scrap the next squad slot costs (ID-179), or null with every slot bought. */
export const nextSquadSlotCost = (game: Pick<GameState, 'slots'>): number | null =>
  SQUAD_SLOT_COSTS[boughtOf(game).squad] ?? null;

/** The Scrap the next `STASH_SLOT.add` stash slots cost (ID-179), or null with every one bought. */
export const nextStashSlotCost = (game: Pick<GameState, 'slots'>): number | null =>
  STASH_SLOT.costs[boughtOf(game).stash] ?? null;

/** `game` with `slots` as given; no field with none bought (as a save writes it). */
function withSlots(game: GameState, slots: { squad: number; stash: number }): GameState {
  const g = { ...game };
  delete g.slots;
  return slots.squad + slots.stash > 0 ? { ...g, slots } : g;
}

/** What a purchase of slots gives (ID-179): the game after it, or why not. */
export type SlotBuy = { ok: true; game: GameState } | { ok: false; reason: string };

function buySlot(game: GameState, kind: 'squad' | 'stash'): SlotBuy {
  const cost = kind === 'squad' ? nextSquadSlotCost(game) : nextStashSlotCost(game);
  if (cost === null) {
    return { ok: false, reason: `Every ${kind} slot is bought` };
  }
  if (game.stock.scrap < cost) return { ok: false, reason: `Needs ${cost} Scrap` };
  const bought = boughtOf(game);
  const next = withSlots(
    { ...game, stock: { ...game.stock, scrap: game.stock.scrap - cost } },
    { ...bought, [kind]: bought[kind] + 1 },
  );
  return { ok: true, game: kind === 'squad' ? autoSquad(fillSquad(next)) : next };
}

/**
 * Buys the next squad slot (ID-179, between hordes) for `nextSquadSlotCost` Scrap. The new
 * slot is filled from the bench like any open one (`fillSquad`, then "Auto"). Refused with a
 * player-facing reason when Scrap is short or every slot is bought.
 */
export const buySquadSlot = (game: GameState): SlotBuy => buySlot(game, 'squad');

/** Buys the next `STASH_SLOT.add` stash slots (ID-179, between hordes); as `buySquadSlot`. */
export const buyStashSlots = (game: GameState): SlotBuy => buySlot(game, 'stash');

/** The Scrap raising gun `w` one more step costs (ID-208), or null at `GUN_UPGRADE.max`. */
export const upgradeCost = (w: OwnedWeapon): number | null =>
  gunStep(w) >= GUN_UPGRADE.max ? null : GUN_UPGRADE.cost * (gunStep(w) + 1) * gunLevel(w);

/** What an upgrade gives (ID-208): the game after it, the gun, and the Scrap it took; or why not. */
export type GunUpgrade =
  { ok: true; game: GameState; weapon: OwnedWeapon; cost: number } | { ok: false; reason: string };

/**
 * Raises gun `uid` one upgrade step (ID-208) for `upgradeCost` Scrap: a gun in the stash, in a
 * survivor's hands (squad or bench), any time, in a fight too. Refused with a player-facing
 * reason when there is no such gun, it is no gun, it is at the top step, or Scrap is short.
 * The gun is a new object in the same place, so what worked out its numbers is not reused.
 */
export function upgradeGun(game: GameState, uid: string): GunUpgrade {
  const camp = [...game.roster, ...game.reserve];
  const found: OwnedWeapon | undefined =
    game.armoury.find((w) => w.uid === uid) ??
    camp
      .flatMap((d) => [d.loadout.primary, d.loadout.secondary])
      .find((h): h is OwnedWeapon => isOwned(h) && h.uid === uid);
  if (!found) return { ok: false, reason: 'No such gun' };
  if (!isGun(found)) return { ok: false, reason: 'Only guns can be upgraded' };
  const cost = upgradeCost(found);
  if (cost === null) return { ok: false, reason: `Already at +${GUN_UPGRADE.max}` };
  if (game.stock.scrap < cost) return { ok: false, reason: `Needs ${cost} Scrap` };
  const weapon: OwnedWeapon = { ...found, step: gunStep(found) + 1 };
  const swap = (h: Held | null): Held | null => (isOwned(h) && h.uid === uid ? weapon : h);
  const arm = (d: RosterDefender): RosterDefender => ({
    ...d,
    loadout: {
      ...d.loadout,
      primary: swap(d.loadout.primary)!,
      secondary: swap(d.loadout.secondary),
    },
  });
  return {
    ok: true,
    cost,
    weapon,
    game: {
      ...game,
      stock: { ...game.stock, scrap: game.stock.scrap - cost },
      armoury: game.armoury.map((w) => (w.uid === uid ? weapon : w)),
      roster: game.roster.map(arm),
      reserve: game.reserve.map(arm),
    },
  };
}

/**
 * `horde` with every defender who holds the gun `weapon.uid` holding `weapon` instead (ID-208):
 * a gun upgraded in a fight under way hits harder from the next shot. `horde` itself when
 * nobody holds it. Nothing else changes: the magazine and the reload carry on.
 */
export function withUpgradedGun(horde: HordeState, weapon: OwnedWeapon): HordeState {
  const mine = (h: Held | null): boolean => isOwned(h) && h.uid === weapon.uid;
  if (!horde.defenders.some((d) => mine(d.loadout.primary) || mine(d.loadout.secondary))) {
    return horde;
  }
  const swap = (h: Held | null): Held | null => (mine(h) ? weapon : h);
  return {
    ...horde,
    defenders: horde.defenders.map((d) =>
      mine(d.loadout.primary) || mine(d.loadout.secondary)
        ? {
            ...d,
            loadout: {
              ...d.loadout,
              primary: swap(d.loadout.primary)!,
              secondary: swap(d.loadout.secondary),
            },
          }
        : d,
    ),
  };
}

/** `game` with `craft` as its blueprints, or with none (no key) when null. */
function withCraft(game: GameState, craft: GameState['craft'] | null): GameState {
  const next = { ...game };
  delete next.craft;
  return craft ? { ...next, craft } : next;
}

/** What a craft gives (ID-209): the game after it, the gun, and the Scrap it took; or why not. */
export type Crafted =
  { ok: true; game: GameState; weapon: OwnedWeapon; cost: number } | { ok: false; reason: string };

/** The shown reason when a gun type's blueprints are none (ID-209). */
export const NO_BLUEPRINT = 'No blueprint for that gun';

/**
 * Why a craft of `base` with `amount` Scrap is refused (ID-209), as the player is told, or null
 * when it can go ahead: no such blueprint, an amount a craft does not take, a full stash
 * (the stash holds at most `stashCap`: a crafted gun is never thrown away for room), short
 * Scrap. Reads only; the Craft tab greys its button off it.
 */
export function craftRefusal(game: GameState, base: WeaponId, amount: number): string | null {
  if (blueprintCount(game, base) < 1) return NO_BLUEPRINT;
  if (!isCraftAmount(amount)) {
    return `Put in ${CRAFT.min} to ${CRAFT.min + CRAFT.step * CRAFT.steps} Scrap`;
  }
  if ((game.craft?.made ?? 0) >= CRAFT_MADE_MAX) return 'No more guns can be crafted';
  if (game.armoury.length >= stashCap(game)) return 'Stash full';
  if (game.stock.scrap < amount) return `Needs ${amount - game.stock.scrap} more Scrap`;
  return null;
}

/**
 * Crafts one `base` gun (ID-209) from a blueprint and `amount` Scrap (one of `craftAmounts`): at
 * once, at the level of the highest horde beaten (at least 1) like a drop, its rarity rolled
 * by `craftOdds(amount)` and affixes for it, uid `f<n>`, into the stash. The blueprint and
 * the Scrap are used up. Refused (`craftRefusal`) with nothing changed.
 */
export function craftGun(game: GameState, base: WeaponId, amount: number): Crafted {
  const why = craftRefusal(game, base, amount);
  if (why !== null) return { ok: false, reason: why };
  const rng = craftRng(game);
  const uid = `f${(game.craft?.made ?? 0) + 1}`;
  const level = Math.max(1, topBeaten(game));
  const weapon = rollWeapon(rng, uid, base, rollCraftRarity(rng, amount), level);
  return {
    ok: true,
    cost: amount,
    weapon,
    game: withCraft(
      {
        ...game,
        armoury: [...game.armoury, weapon],
        stock: { ...game.stock, scrap: game.stock.scrap - amount },
      },
      withoutBlueprint(game.craft!, base, 1),
    ),
  };
}

/**
 * Turns one `base` blueprint into `BLUEPRINT.salvage` Scrap (ID-209), any time; refused with
 * none of that gun.
 */
export function salvageBlueprint(
  game: GameState,
  base: WeaponId,
): { ok: true; game: GameState; scrap: number } | { ok: false; reason: string } {
  if (blueprintCount(game, base) < 1) return { ok: false, reason: NO_BLUEPRINT };
  return {
    ok: true,
    scrap: BLUEPRINT.salvage,
    game: withCraft(
      { ...game, stock: scrapAfter(game.stock, BLUEPRINT.salvage) },
      withoutBlueprint(game.craft!, base),
    ),
  };
}

/**
 * The squad that fights the next horde: the roster, at most `squadCap`, in the order they
 * were picked. Never anyone resting (`settleSquad` benches them).
 */
export const squadOf = (game: Pick<GameState, 'roster' | 'slots'>): RosterDefender[] =>
  game.roster.slice(0, squadCap(game));

/** Everyone in the camp (ID-147): the squad, then the bench. */
export const campOf = (game: Pick<GameState, 'roster' | 'reserve'>): RosterDefender[] => [
  ...game.roster,
  ...game.reserve,
];

/** Hordes `d` still rests (ID-147); 0 when fit. */
export const restOf = (d: Pick<RosterDefender, 'rest'>): number => d.rest ?? 0;

/** Whether `d` can fight the next horde (ID-147): not resting. */
export const isFit = (d: Pick<RosterDefender, 'rest'>): boolean => restOf(d) === 0;

/** `d` with `rest` hordes to rest; fit (no field) at 0. */
function withRest(d: RosterDefender, rest: number): RosterDefender {
  const fit = { ...d };
  delete fit.rest;
  return rest > 0 ? { ...fit, rest } : fit;
}

/**
 * Fills the squad's open slots from the bench (ID-147): fit survivors, highest XP first
 * (ties in bench order), each onto the squad's end in that order, until the squad has
 * `squadCap`. Returns `game` itself when nobody moves.
 */
export function fillSquad(game: GameState): GameState {
  const room = squadCap(game) - game.roster.length;
  if (room <= 0) return game;
  const picked = game.reserve
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => isFit(d))
    .sort((a, b) => b.d.xp - a.d.xp || a.i - b.i)
    .slice(0, room)
    .map(({ d }) => d);
  if (picked.length === 0) return game;
  return {
    ...game,
    roster: [...game.roster, ...picked],
    reserve: game.reserve.filter((d) => !picked.includes(d)),
  };
}

/**
 * Who swaps in mid-fight, in order (ID-148): the fit bench, highest level first (ties to
 * camp order), at most `MID_SWAP.max`. Each brings their own gun.
 */
export function swapBench(game: Pick<GameState, 'reserve'>): RosterDefender[] {
  return game.reserve
    .map((d, i) => ({ d, i, level: levelOf(d.xp).level }))
    .filter(({ d }) => isFit(d))
    .sort((a, b) => b.level - a.level || a.i - b.i)
    .slice(0, MID_SWAP.max)
    .map(({ d }) => d);
}

/** `game` with anyone resting moved from the squad to the bench's end; `game` itself if none. */
function benchResting(game: GameState): GameState {
  if (game.roster.every(isFit)) return game;
  return {
    ...game,
    roster: game.roster.filter(isFit),
    reserve: [...game.reserve, ...game.roster.filter((d) => !isFit(d))],
  };
}

/**
 * `game` made ready for the next horde (ID-147): anyone resting leaves the squad for the
 * bench (their slot stays open for the player to fill); if nobody in the camp is fit, the
 * shortest rest ends at once (ties to camp order), so the game never locks up; and an empty
 * squad takes the fit bench (`fillSquad`), so there is always someone to start with. Returns
 * `game` itself when nothing changes.
 */
export function settleSquad(game: GameState): GameState {
  let g = benchResting(game);
  const camp = campOf(g);
  if (camp.length > 0 && !camp.some(isFit)) {
    const first = camp.reduce((a, b) => (restOf(b) < restOf(a) ? b : a));
    const wake = (d: RosterDefender): RosterDefender => (d === first ? withRest(d, 0) : d);
    g = { ...g, roster: g.roster.map(wake), reserve: g.reserve.map(wake) };
  }
  return g.roster.length === 0 ? fillSquad(g) : g;
}

/**
 * Marks or unmarks survivor `id` for the squad (ID-147, between hordes): a squad survivor
 * goes to the bench, unless they are the last one; a bench survivor joins the squad's end,
 * unless they are resting or the squad is full. Refused with a player-facing reason.
 */
export function toggleSquad(
  game: GameState,
  id: string,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  const inSquad = game.roster.find((d) => d.id === id);
  if (inSquad) {
    if (game.roster.length === 1) return { ok: false, reason: 'The squad needs someone to fight' };
    return {
      ok: true,
      game: {
        ...game,
        roster: game.roster.filter((d) => d !== inSquad),
        reserve: [...game.reserve, inSquad],
      },
    };
  }
  const benched = game.reserve.find((d) => d.id === id);
  if (!benched) return { ok: false, reason: 'No such survivor' };
  if (!isFit(benched)) return { ok: false, reason: restLabel(restOf(benched)) };
  const cap = squadCap(game);
  if (game.roster.length >= cap) {
    return { ok: false, reason: `The squad is full (${cap}/${cap}): unmark one first` };
  }
  return {
    ok: true,
    game: {
      ...game,
      roster: [...game.roster, benched],
      reserve: game.reserve.filter((d) => d !== benched),
    },
  };
}

/** Who "Best squad" (ID-154) moved: into the squad and onto the bench, by name. */
export interface SquadMoves {
  in: string[];
  out: string[];
}

/**
 * "Best squad" (ID-154, between hordes): the squad becomes the `squadCap` fit survivors
 * with the most `survivorPower`, ties to camp order (the squad first, so a tie never
 * swaps). Who stays keeps their slot; a newcomer takes the slot of one benched, in rank
 * order, and the rest go on the end; the benched go on the bench's end. Guns don't move.
 * With nobody fit, or nothing to change, returns `game` itself; a second call moves nobody.
 */
export function bestSquad(game: GameState): { game: GameState; moves: SquadMoves } {
  const ranked = campOf(game)
    .map((d, i) => ({ d, i, power: survivorPower(d) }))
    .filter(({ d }) => isFit(d))
    .sort((a, b) => b.power - a.power || a.i - b.i)
    .slice(0, squadCap(game))
    .map(({ d }) => d);
  const none = { game, moves: { in: [], out: [] } };
  if (ranked.length === 0) return none;
  const pick = new Set(ranked);
  const comers = ranked.filter((d) => !game.roster.includes(d));
  const out = game.roster.filter((d) => !pick.has(d));
  if (comers.length === 0 && out.length === 0) return none;
  const queue = [...comers];
  const roster = game.roster.flatMap((d) => {
    if (pick.has(d)) return [d];
    const next = queue.shift();
    return next ? [next] : [];
  });
  return {
    game: {
      ...game,
      roster: [...roster, ...queue],
      reserve: [...game.reserve.filter((d) => !pick.has(d)), ...out],
    },
    moves: { in: comers.map((d) => d.name), out: out.map((d) => d.name) },
  };
}

/** `bestSquad` when "Auto" is ticked (ID-154), else `game` itself. */
export const autoSquad = (game: GameState): GameState =>
  game.autoSquad === true ? bestSquad(game).game : game;

/**
 * Ticks or unticks "Auto" (ID-154, between hordes): saved only while on. Ticking runs
 * `bestSquad` once at once.
 */
export function setAutoSquad(game: GameState, on: boolean): { game: GameState; moves: SquadMoves } {
  if (!on) {
    const g = { ...game };
    delete g.autoSquad;
    return { game: g, moves: { in: [], out: [] } };
  }
  return bestSquad({ ...game, autoSquad: true });
}

/** "Resting: 2 hordes" / "Resting: 1 horde" (ID-147). */
export const restLabel = (rest: number): string =>
  `Resting: ${rest} ${rest === 1 ? 'horde' : 'hordes'}`;

/**
 * A firing line of `n` slots (ID-068, ID-179), top to bottom: on the ground
 * `SQUAD_LINE.offset` behind the wall, each in the middle of its even share of the wall.
 */
const lineOf = (n: number): { x: number; y: number }[] =>
  Array.from({ length: n }, (_, i) => ({
    x: COLUMNS[0]! + SQUAD_LINE.offset,
    y: ((i + 0.5) * FIELD.height) / n,
  }));

/** The firing line of a squad of `SQUAD_CAP` or fewer (ID-068): `SQUAD_CAP` slots. */
export const SQUAD_SLOTS: readonly { x: number; y: number }[] = lineOf(SQUAD_CAP);

/**
 * The firing line a squad of `size` stands on (ID-179) and the slot each takes, in squad
 * order: `SQUAD_SLOTS` and `SQUAD_LINE.order` up to `SQUAD_CAP` (as before bought slots),
 * else a line of `size` slots filled by `SQUAD_LINE_WIDE`.
 */
export function squadLine(size: number): {
  slots: readonly { x: number; y: number }[];
  order: readonly number[];
} {
  const wide = size > SQUAD_CAP ? SQUAD_LINE_WIDE[size as 7 | 8] : undefined;
  return wide
    ? { slots: lineOf(size), order: wide }
    : { slots: SQUAD_SLOTS, order: SQUAD_LINE.order };
}

/**
 * The mode's horde `hordeNumber` (the game's next, ID-218: as strong as that plus the mode's
 * offset, with its bosses and HP factor) for the whole squad on the firing line behind a fresh
 * horde-only wall (full HP), each survivor in their slot in squad order
 * (`SQUAD_LINE.order`), with enemies spawning at `SQUAD_SPAWN_X`, at `now`. No towers,
 * turrets or traps; the bench waits to swap in mid-fight (`swapBench`, ID-148), and no cash
 * or bank come in.
 * The only research is the cards beaten boss hordes unlocked (ID-127). The skills picked
 * (ID-100) come in on cooldown only.
 */
export function startSquadHorde(
  game: GameState,
  seed: number,
  now: number,
  /** The horde of the mode being played to fight (ID-098): the next new one, or any already beaten. */
  hordeNumber: number = localHorde(game),
): HordeState {
  if (!Number.isFinite(now)) throw new RangeError(`startSquadHorde: bad time ${now}`);
  if (!Number.isInteger(hordeNumber) || hordeNumber < 1 || hordeNumber > localHorde(game)) {
    throw new RangeError(`startSquadHorde: horde ${hordeNumber} is not open`);
  }
  // ID-218: a difficulty mode's horde is as strong as its mode horde plus the mode's offset.
  const mode = modeOf(game);
  const eff = effHorde(mode, hordeNumber);
  const squad = squadOf(game).map(squadSpec);
  const first = squad[0];
  if (!first) throw new RangeError('startSquadHorde: nobody in the squad');
  const base = squadBase();
  const line = squadLine(squad.length);
  const postOf = (i: number): number => base.posts.length + line.order[i]!;
  const s = newHorde(seed, {
    hordeNumber: eff,
    ...(mode === 'normal' ? {} : { bosses: modeBosses(mode, hordeNumber) }),
    roster: squad,
    startDefenderId: first.id,
    base,
    startPostId: postOf(0),
    bank: 0,
    startedAt: now,
    perks: SQUAD_PERKS,
    perkLevels: { [START_PERK]: 1 },
    research: squadUnlocks(game),
    cashRate: 0,
    startCash: 0,
    cards: [...SQUAD_CARDS, ...modeCards(game)],
    hpScale: squadHpScale(eff) * MODES[mode].hpScale,
    xpRate: SQUAD_XP_RATE,
    line: line.slots,
    spawnX: SQUAD_SPAWN_X,
    harder: true,
    skills: [...game.skillPick],
    freeSkills: { power: skillPickPower(game.skillPick) },
  });
  if (mode !== 'normal') s.mode = mode;
  // The rest of the squad take their slots too.
  squad.slice(1).forEach((spec, k) => {
    const post = s.posts[postOf(k + 1)]!;
    post.defenderId = spec.id;
    s.defenders.push(standing(spec, post, 0));
    s.tookPart.push(spec.id);
  });
  // No recruit cards or replacement offers: the bench comes in only by mid-fight swaps.
  s.bench = [];
  s.subs = swapBench(game).map(squadSpec);
  s.swapsLeft = MID_SWAP.max;
  s.swaps = [];
  s.leaving = [];
  // A Chef's HP and a Construction worker's wall are there from the start (ID-149).
  feed(s);
  fortify(s);
  return s;
}

/** The stream a horde's joiners roll from (ID-147): its seed's own, apart from the drop's. */
const JOIN_STREAM = 0x27d4eb2f;

/**
 * The survivors a first clear adds (ID-066, ID-147), the next free recruits, each with their
 * profession rolled with the horde's `seed` (ID-149): one while the camp has fewer than
 * `SQUAD_CAP`; after that one at `SQUAD_JOIN.chance`, then a second at `SQUAD_JOIN.second`,
 * rolled from the seed alone. A replay win (`replay`, ID-170) has one at `SQUAD_JOIN.replay`
 * whatever the camp's size, never a second. None once the camp has `SQUAD_JOIN.max` or the
 * recruit count is at its cap.
 */
export function joiners(
  game: Pick<GameState, 'roster' | 'reserve' | 'camp'>,
  seed: number,
  replay = false,
): RosterDefender[] {
  const size = game.roster.length + game.reserve.length;
  let count = 1;
  if (replay) {
    count = chance(createRng(seed ^ JOIN_STREAM), SQUAD_JOIN.replay) ? 1 : 0;
  } else if (size >= SQUAD_CAP) {
    const rng = createRng(seed ^ JOIN_STREAM);
    count = chance(rng, SQUAD_JOIN.chance) ? (chance(rng, SQUAD_JOIN.second) ? 2 : 1) : 0;
  }
  count = Math.min(count, SQUAD_JOIN.max - size, MAX_COUNT - game.camp.recruits);
  return Array.from({ length: Math.max(0, count) }, (_, k) =>
    recruit(game.camp.recruits + k + 1, seed),
  );
}

/** Who is asking to join (ID-150), oldest first; none when nobody is. */
export const joiningOf = (game: Pick<GameState, 'joining'>): RosterDefender[] => game.joining ?? [];

/** `game` with `list` asking to join; no field with nobody (as a save writes it). */
function withJoining(game: GameState, list: RosterDefender[]): GameState {
  const g = { ...game };
  delete g.joining;
  return list.length > 0 ? { ...g, joining: list } : g;
}

/**
 * Answers survivor `id`'s ask to join (ID-150, between hordes): Accept puts them on the
 * squad's end while it has room, else on the bench; Refuse sends them away for good (their
 * recruit number is spent). Returns where they went (null for Refuse), or why not.
 */
export function answerJoin(
  game: GameState,
  id: string,
  accept: boolean,
): { ok: true; game: GameState; where: 'squad' | 'bench' | null } | { ok: false; reason: string } {
  const all = joiningOf(game);
  const d = all.find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'Nobody by that name is asking to join' };
  const g = withJoining(
    game,
    all.filter((x) => x !== d),
  );
  if (!accept) return { ok: true, game: g, where: null };
  const joined =
    g.roster.length < squadCap(g)
      ? { ...g, roster: [...g.roster, d] }
      : { ...g, reserve: [...g.reserve, d] };
  // "Auto" (ID-154) may move them, or someone else, at once.
  const next = autoSquad(joined);
  return { ok: true, game: next, where: next.roster.includes(d) ? 'squad' : 'bench' };
}

/** Everyone asking to join turned away (ID-150): leaving the screen without answering. */
export const refuseJoins = (game: GameState): GameState =>
  joiningOf(game).length > 0 ? withJoining(game, []) : game;

/** Everyone asking to join taken in, oldest first (ID-150): the scripted player's answer. */
export function acceptJoins(game: GameState): GameState {
  let g = game;
  for (const d of joiningOf(game)) {
    const r = answerJoin(g, d.id, true);
    if (r.ok) g = r.game;
  }
  return g;
}

/**
 * Why nobody can be let go (ID-150), or null when they can: the camp must keep more than
 * `squadCap`, so the squad can always be filled. `act` names what is refused: Combine
 * (ID-170) is locked by the same rule, in its own words.
 */
export function letGoLock(
  game: {
    roster: readonly RosterDefender[];
    reserve: readonly RosterDefender[];
    slots?: GameState['slots'];
  },
  act = 'let one go',
): string | null {
  const n = game.roster.length + game.reserve.length;
  const cap = squadCap(game);
  return n > cap ? null : `Needs ${cap + 1}+ survivors to ${act} (camp ${n})`;
}

/**
 * Lets survivor `id` go for good (ID-150, between hordes, from the squad or the bench):
 * their gun goes back to the stash (`stashWith`: the weakest thrown away when full; the
 * free pistol just goes), then `settleSquad`. Refused while `letGoLock` says so. Returns
 * what the stash threw away for room.
 */
export function letGo(
  game: GameState,
  id: string,
): { ok: true; game: GameState; thrown: OwnedWeapon[] } | { ok: false; reason: string } {
  const d = campOf(game).find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'No such survivor' };
  const lock = letGoLock(game);
  if (lock) return { ok: false, reason: lock };
  const guns = [d.loadout.primary, d.loadout.secondary].filter(
    (h): h is OwnedWeapon => h !== null && isOwned(h),
  );
  const { armoury, thrown } = stashWith(game.armoury, guns, stashCap(game));
  // "Auto" (ID-154) fills the slot they leave with the best there is.
  const out = autoSquad(
    settleSquad({
      ...game,
      stock: salvaged(game.stock, thrown),
      armoury,
      roster: game.roster.filter((x) => x !== d),
      reserve: game.reserve.filter((x) => x !== d),
    }),
  );
  return { ok: true, game: out, thrown };
}

/**
 * The XP a keeper gains for taking in a survivor with lifetime `xp` (ID-170):
 * `SURVIVOR_COMBINE.share` of it, at least `minLevels` levels' worth from level 1, whole.
 */
export const combineXp = (xp: number): number =>
  Math.max(Math.floor(SURVIVOR_COMBINE.share * xp), xpForLevel(1 + SURVIVOR_COMBINE.minLevels));

/**
 * The camp survivors `keeperId` can take in (ID-170), in camp order: the others of the same
 * profession. None for an unknown keeper.
 */
export function combinePartners(
  game: { roster: readonly RosterDefender[]; reserve: readonly RosterDefender[] },
  keeperId: string,
): RosterDefender[] {
  const camp = [...game.roster, ...game.reserve];
  const k = camp.find((d) => d.id === keeperId);
  return k ? camp.filter((d) => d !== k && d.job === k.job) : [];
}

/**
 * Survivor `keeperId` takes in `fedId` of the same profession (ID-170, between hordes): the
 * keeper gains `combineXp` of their XP (capped at `MAX_COUNT`) and keeps their own gun, rest
 * and slot; `fedId` leaves as with `letGo` (their gun back to the stash). Refused as
 * `letGo` is, and for the same survivor or another profession.
 */
export function combineSurvivors(
  game: GameState,
  keeperId: string,
  fedId: string,
):
  { ok: true; game: GameState; thrown: OwnedWeapon[]; xp: number } | { ok: false; reason: string } {
  const camp = campOf(game);
  const k = camp.find((d) => d.id === keeperId);
  const f = camp.find((d) => d.id === fedId);
  if (!k || !f) return { ok: false, reason: 'No such survivor' };
  if (k === f) return { ok: false, reason: 'A survivor cannot combine with themselves' };
  if (k.job !== f.job)
    return { ok: false, reason: 'Only survivors of the same profession combine' };
  const lock = letGoLock(game, 'combine');
  if (lock) return { ok: false, reason: lock };
  const xp = combineXp(f.xp);
  const fed = (d: RosterDefender): RosterDefender =>
    d === k ? { ...d, xp: Math.min(MAX_COUNT, d.xp + xp) } : d;
  const r = letGo({ ...game, roster: game.roster.map(fed), reserve: game.reserve.map(fed) }, fedId);
  return r.ok ? { ...r, xp } : r;
}

/** The stream a horde's rest rolls come from (ID-147). */
const REST_STREAM = 0x165667b1;

/**
 * The camp's Paramedic points (ID-155): each Paramedic in `camp`, squad or bench, resting or
 * not, adds `PATCH_UP.base` plus their level's part (`PATCH_UP.level` × P / (P + 20)).
 */
export const paramedicPoints = (camp: readonly Pick<RosterDefender, 'job' | 'xp'>[]): number =>
  camp
    .filter((d) => d.job === 'paramedic')
    .reduce((t, d) => t + PATCH_UP.base + jobBonus(levelOf(d.xp).level, 'paramedic', 'patchUp'), 0);

/** The chance a downed survivor skips rest with `points` Paramedic points (ID-155): at most `PATCH_UP.chance`. */
export const patchUpChance = (points: number): number =>
  Math.min(PATCH_UP.chance, Math.max(0, points) / 100);

/** The share of max HP a patched-up survivor starts the next horde at, with `points` (ID-155). */
export const patchUpHp = (points: number): number =>
  Math.min(
    PATCH_UP.hpCap,
    PATCH_UP.hp + (PATCH_UP.over * Math.max(0, points - PATCH_UP.from)) / 100,
  );

/** One survivor downed in a won horde (ID-155): resting `rest` hordes, or patched up to `startHp`. */
export interface Downed {
  id: string;
  name: string;
  /** Hordes to rest: `INJURY_REST.downed`, or 0 when patched up. */
  rest: number;
  /** Patched up (rest 0): the share of max HP they start the next horde at. */
  startHp?: number;
}

/**
 * Who was downed in horde `horde` and how they come out of it (ID-147, ID-155): on a win, each
 * survivor who fought and dropped to 0 HP, in roster order. Each rolls the camp's Paramedic
 * chance (`patchUpChance`, from the seed alone): patched up, they skip rest and start the
 * next horde at `patchUpHp`; else they rest `INJURY_REST.downed`. Anyone who ended standing,
 * at any HP (one who pulled back in a swap, ID-148, too), is fit. A loss rests nobody.
 */
export function squadRests(
  game: Pick<GameState, 'roster' | 'reserve'>,
  horde: HordeState,
): Downed[] {
  // A lost fight downs everyone: resting them all would leave nobody to try again with.
  if (horde.outcome !== 'won') return [];
  const rng = createRng(horde.seed ^ REST_STREAM);
  const points = paramedicPoints(campOf(game));
  const odds = patchUpChance(points);
  return fieldOf(game, horde)
    .filter((d) => horde.injured.some((i) => i.defender.id === d.id))
    .map((d) =>
      chance(rng, odds)
        ? { id: d.id, name: d.name, rest: 0, startHp: patchUpHp(points) }
        : { id: d.id, name: d.name, rest: INJURY_REST.downed },
    );
}

/**
 * The highest horde beaten on the mode being played (ID-098, ID-218): every horde up to it
 * counts as beaten, 0 for none.
 */
export const highestBeaten = (game: ModeProgress): number => beatenIn(game);

/** Whether horde `n` of the mode being played is a replay of one beaten (ID-098), not the next new one. */
export const isReplay = (game: ModeProgress, n: number): boolean => n < localHorde(game);

/**
 * The radio parts found (ID-127): one per boss horde in `RADIO_HORDES` beaten. Read from the
 * horde number, so an older save gets its parts and the save stores nothing new.
 */
export const radioParts = (game: Pick<GameState, 'hordeNumber'>): number =>
  RADIO_HORDES.filter((n) => n <= game.hordeNumber - 1).length;

/** Whether the finale is beaten on the mode being played (ID-127, ID-218): play goes on as Endless. */
export const isEndless = (game: ModeProgress): boolean => highestBeaten(game) >= FINALE_HORDE;

/** The cards the beaten boss hordes have added to the card pool for good (ID-127). */
export const squadUnlocks = (game: Pick<GameState, 'hordeNumber'>): ResearchCard[] =>
  Object.entries(BOSS_UNLOCKS)
    .filter(([n]) => Number(n) <= game.hordeNumber - 1)
    .map(([, card]) => card);

/** The horde numbers of a mode's boss hordes that unlock a mode card (ID-222). */
const MODE_UNLOCK_HORDES = [10, 20, 30] as const;

/**
 * The mode cards the fight being played starts with in its card pool (ID-222): every card of
 * a higher mode at or below the one being played whose boss horde that mode has beaten, so a
 * Nightmare card works in Nightmare and Hell and a Hell card only in Hell; none on Normal.
 * Derived from the saved mode progress, so nothing new is stored, and a second clear changes
 * nothing.
 */
export function modeCards(game: ModeProgress): ModeCard[] {
  const played = HIGHER_MODES.indexOf(modeOf(game) as HigherMode);
  if (played < 0) return [];
  return HIGHER_MODES.slice(0, played + 1).flatMap((m) =>
    MODE_UNLOCK_HORDES.filter((n) => beatenIn(game, m) >= n).map((n) => MODE_UNLOCKS[m][n]),
  );
}

/**
 * What a win of horde `n` brings toward the goal (ID-127), with `game` as it stood before
 * the win: the radio part (1-based) and any card unlocked on a boss horde's first clear, and
 * whether it was the finale; null for any other win, a replay included.
 */
export function bossReward(
  game: ModeProgress,
  n: number,
): { part: number; unlock: ResearchCard | ModeCard | null; finale: boolean } | null {
  const mode = modeOf(game);
  // A higher mode (ID-222): no radio part (`part` 0), a mode card on the first clear of 10, 20, 30.
  if (mode !== 'normal') {
    const unlock = isReplay(game, n) ? undefined : MODE_UNLOCKS[mode][n as 10 | 20 | 30];
    return unlock ? { part: 0, unlock, finale: false } : null;
  }
  const i = RADIO_HORDES.indexOf(n);
  if (i < 0 || isReplay(game, n)) return null;
  return { part: i + 1, unlock: BOSS_UNLOCKS[n] ?? null, finale: n === FINALE_HORDE };
}

function checkFinished(name: string, game: GameState, horde: HordeState): void {
  if (horde.outcome === 'fighting') throw new RangeError(`${name}: the horde is still on`);
  const local = localOf(horde);
  if (local < 1 || local > localHorde(game, horde.mode ?? 'normal')) {
    throw new RangeError(`${name}: horde ${horde.hordeNumber} is not this game's`);
  }
}

/**
 * Each survivor's XP from horde `horde` (ID-066, ID-098): a win's full, half for a replay
 * more than `FARM.farOff` hordes below the highest beaten; a loss `FARM.lossXp` of a win's
 * for each share of the waves cleared (0 cleared → 0). A Teacher who fought adds their share
 * for everyone who fought (the highest level's; two never stack), and a Student their own
 * share on top (ID-149). Rounded down.
 */
export function squadXpGains(game: GameState, horde: HordeState): ReturnType<typeof xpGains> {
  const full = xpGains({ ...horde, outcome: 'won' });
  const far = beatenIn(game, horde.mode ?? 'normal') - localOf(horde) > FARM.farOff;
  // A loss pays its share of what a win of this horde would (halved far down too).
  const win = far ? FARM.farXp : 1;
  const share =
    horde.outcome === 'won' ? win : (win * FARM.lossXp * wavesCleared(horde)) / horde.waveCount;
  const fought = fieldOf(game, horde);
  const taught = 1 + fieldBonus(fought, 'squadXp');
  // From the unrounded XP, so a share never rounds twice.
  const each = hordeXp(horde.hordeNumber) * (horde.xpRate ?? 1) * share * taught;
  return full.map((g) => {
    const d = fought.find((r) => r.id === g.id);
    const own = d ? 1 + jobPart(d, 'xp') : 1;
    return { ...g, xp: Math.floor(each * own) };
  });
}

/**
 * What each bench survivor (in the camp, not in `tookPart`) gets from horde `horde` (ID-206):
 * `BENCH_XP_SHARE` of the fighters' average XP in `fighters`, rounded down, win or loss,
 * resting or not. A survivor who swapped in fought, so they are not here. Nobody fought → none.
 */
export function benchXpGains(
  game: Pick<GameState, 'roster' | 'reserve'>,
  horde: Pick<HordeState, 'tookPart'>,
  fighters: readonly { xp: number }[],
): { id: string; name: string; xp: number; injured: boolean }[] {
  if (fighters.length === 0) return [];
  const mean = fighters.reduce((t, g) => t + g.xp, 0) / fighters.length;
  const xp = Math.floor(mean * BENCH_XP_SHARE);
  return campOf(game)
    .filter((d) => !horde.tookPart.includes(d.id))
    .map((d) => ({ id: d.id, name: d.name, xp, injured: false }));
}

/**
 * The Scrap a horde-only win of horde `n` pays (ID-179); `n` is the horde's strength, and a
 * higher mode's win pays its multiple (ID-218), rounded.
 */
export const winScrap = (n: number, mode: Mode = 'normal'): number => {
  const pay = SQUAD_SCRAP.base + SQUAD_SCRAP.perHorde * n;
  return MODES[mode].scrap === 1 ? pay : Math.round(pay * MODES[mode].scrap);
};

/**
 * The Scrap guns thrown away from a full stash are salvaged for (ID-179): by rarity, and
 * half the Scrap their upgrade steps cost (`gunSalvage`, ID-207).
 */
export const salvageOf = (thrown: readonly OwnedWeapon[]): number =>
  thrown.reduce((t, w) => t + gunSalvage(w), 0);

/** The Scrap `n` adds to `stock` once capped where a save reads it (ID-179). */
export const scrapGain = (stock: GameState['stock'], n: number): number =>
  Math.min(MAX_COUNT, stock.scrap + n) - stock.scrap;

/** `stock` with `n` more Scrap, capped where a save reads it (ID-179). */
export const scrapAfter = (stock: GameState['stock'], n: number): GameState['stock'] => ({
  ...stock,
  scrap: Math.min(MAX_COUNT, stock.scrap + n),
});

/** `stock` with the Scrap `thrown` guns salvage for (ID-179). */
const salvaged = (stock: GameState['stock'], thrown: readonly OwnedWeapon[]): GameState['stock'] =>
  scrapAfter(stock, salvageOf(thrown));

/**
 * Back from horde `horde` (ID-066, ID-098): every survivor who fought gets its XP
 * (`squadXpGains`, a loss's too). Rest counts down one for everyone resting, won or lost,
 * and on a win whoever ended the fight hurt rests (`squadRests`) on the bench (ID-147). A win puts
 * its drop in the stash (the weakest thrown away when full). A first clear also has its
 * joiners (`joiners`) ask to join (`joining`, ID-150: the player accepts or refuses each,
 * `answerJoin`; any left unanswered from before are turned away) and moves on to the next
 * horde; a replay counts toward the bad-luck guarantee, and its rare joiner (ID-170) asks
 * to join the same way. Every fight's wall starts full. A win pays Scrap (`winScrap`) and
 * each gun thrown away is salvaged for more (ID-179).
 * Then `settleSquad`. No base damage or camp XP.
 */
export function finishSquadHorde(game: GameState, horde: HordeState): GameState {
  return finishHorde(game, horde).next;
}

/** Why nobody asked to join after a horde (ID-182); see `SquadResult.noJoin`. */
export type NoJoin = 'lost' | 'no-drop' | 'camp-full' | 'nobody-first' | 'nobody-replay';

/**
 * `finishSquadHorde`'s whole answer (ID-182): the camp it leaves, and who asks to join with,
 * for nobody, the reason. The one place that rolls the joiners, so the result screen reads
 * what the finish decided and the two never disagree.
 */
function finishHorde(
  game: GameState,
  horde: HordeState,
): { next: GameState; joined: RosterDefender[]; noJoin: NoJoin | null } {
  checkFinished('finishSquadHorde', game, horde);
  const gains = squadXpGains(game, horde);
  // A loss that paid nothing, with nobody resting to count down, changes nothing.
  const still = horde.outcome !== 'won' && gains.every((x) => x.xp === 0);
  // ("Auto", ID-154, still re-picks: the player's own moves stand only until a fight.)
  const fresh = (d: RosterDefender): boolean => isFit(d) && d.startHp === undefined;
  if (still && campOf(game).every(fresh)) {
    return { next: autoSquad(game), joined: [], noJoin: 'lost' };
  }
  const downed = new Map(squadRests(game, horde).map((r) => [r.id, r]));
  const g = structuredClone(game);
  for (const gain of gains) {
    // A bench survivor who swapped in (ID-148) earns theirs too.
    const d = campOf(g).find((r) => r.id === gain.id);
    // Capped where a save reads it, so a win never leaves a save that won't load.
    if (d) d.xp = Math.min(MAX_COUNT, d.xp + gain.xp);
  }
  // The bench gets its share (ID-206), as the camp stood before the fight.
  for (const gain of benchXpGains(game, horde, gains)) {
    const d = campOf(g).find((r) => r.id === gain.id);
    if (d) d.xp = Math.min(MAX_COUNT, d.xp + gain.xp);
  }
  // A patched-up survivor's low HP lasts one horde played (ID-155), as a rest counts down.
  const rested = (d: RosterDefender): RosterDefender => {
    const r = downed.get(d.id);
    const out = withRest(d, r ? r.rest : Math.max(0, restOf(d) - 1));
    delete out.startHp;
    return r?.startHp !== undefined ? { ...out, startHp: r.startHp } : out;
  };
  g.roster = g.roster.map(rested);
  g.reserve = g.reserve.map(rested);
  // "Auto" (ID-154): the best squad for the camp the fight left.
  const settle = (x: GameState): GameState => autoSquad(settleSquad(x));
  if (horde.outcome !== 'won') return { next: settle(g), joined: [], noJoin: 'lost' };
  const drop = squadDrop(game, horde);
  // A win pays Scrap, and so does each gun thrown away (ID-179); no RNG, no fight changes.
  g.stock = scrapAfter(
    game.stock,
    winScrap(horde.hordeNumber, horde.mode) + salvageOf(drop?.thrown ?? []),
  );
  // Past `FARM.maxReplays` a replay drops nothing and the count stays (its XP is paid).
  if (!drop) return { next: settle(g), joined: [], noJoin: 'no-drop' };
  g.armoury = stashWith(game.armoury, [drop.weapon, ...drop.bonus], stashCap(game)).armoury;
  if (drop.blueprint) g.craft = withBlueprint(game.craft, drop.blueprint);
  if (drop.kind === 'first') {
    // Counted now, so a refused survivor's number is never offered again. Anyone still
    // asking from before was never answered: that counts as Refuse (ID-150).
    const joined = joiners(game, horde.seed);
    g.camp.recruits += joined.length;
    const grown = advance(g, horde.mode ?? 'normal');
    return {
      next: settle(withJoining(grown, joined)),
      joined,
      noJoin: joined.length > 0 ? null : noJoinWhy(game, false),
    };
  }
  // A replay's newcomer (ID-170) turns away an offer left unanswered, as a first clear's
  // does; with none, any offer stands.
  const joined = joiners(game, horde.seed, true);
  g.camp.recruits += joined.length;
  if (joined.length > 0) g.joining = joined;
  g.farm = {
    replays: game.farm.replays + 1,
    badLuck: drop.upgrade
      ? 0
      : drop.noUpgrades
        ? game.farm.badLuck
        : Math.min(FARM.guarantee, game.farm.badLuck + 1),
  };
  return {
    next: settle(g),
    joined,
    noJoin: joined.length > 0 ? null : noJoinWhy(game, true),
  };
}

/** Why a win that rolled nobody brought nobody (ID-182): a full camp, else the roll. */
function noJoinWhy(game: Pick<GameState, 'roster' | 'reserve' | 'camp'>, replay: boolean): NoJoin {
  const size = game.roster.length + game.reserve.length;
  if (size >= SQUAD_JOIN.max || game.camp.recruits >= MAX_COUNT) return 'camp-full';
  return replay ? 'nobody-replay' : 'nobody-first';
}

/** What a horde-only result screen reads off a finished horde. */
export interface SquadResult {
  /** Each survivor's XP and levels; a loss's small share too (ID-098). */
  gains: LevelGain[];
  /** Each bench survivor's share of that XP and their levels (ID-206); empty with nobody benched. */
  bench: LevelGain[];
  /**
   * The survivors asking to join (ID-147, ID-150): none on a loss, often none past 6, and
   * rarely one on a replay (ID-170).
   */
  joined: RosterDefender[];
  /**
   * Why nobody is asking to join (ID-182), null when someone is: a `lost` fight, a replay past
   * `FARM.maxReplays` (`no-drop`), a `camp-full` camp, or a roll that brought nobody
   * (`nobody-first`, `nobody-replay`). Read off `finishSquadHorde`'s own decision.
   */
  noJoin: NoJoin | null;
  /**
   * Who rests after this fight and for how many hordes (ID-147), in roster order, as
   * `finishSquadHorde` leaves them: one woken at once (nobody fit) is left out.
   */
  rests: { id: string; name: string; rest: number }[];
  /**
   * Who was downed but patched up by Paramedics (ID-155), in roster order: fit for the next
   * horde at `startHp` of max HP.
   */
  patched: { id: string; name: string; startHp: number }[];
  /** The camp as `finishSquadHorde` leaves it (ID-147): who is in the squad and the bench. */
  next: GameState;
  /** The weapon the win drops, and what the stash throws away for it; null on a loss. */
  drop: SquadDrop | null;
  /** The Scrap the win paid (ID-179), and how much of it came from guns thrown away; 0 on a loss. */
  scrap: { total: number; salvage: number; now: number };
  /**
   * Who "Auto" (ID-154) moved after this fight, against the squad the fight would leave
   * without it; null when it is off or moved nobody.
   */
  auto: SquadMoves | null;
}

export function squadResult(game: GameState, horde: HordeState): SquadResult {
  checkFinished('squadResult', game, horde);
  const { next, joined, noJoin } = finishHorde(game, horde);
  const after = new Map(campOf(next).map((d) => [d.id, restOf(d)]));
  const downed = squadRests(game, horde);
  const camp = { ...game, roster: campOf(game) };
  const fought = squadXpGains(game, horde);
  return {
    // Off the whole camp, so a bench survivor who swapped in (ID-148) levels from their XP.
    gains: levelGains(camp, horde, fought),
    bench: levelGains(camp, horde, benchXpGains(game, horde, fought)),
    joined,
    noJoin,
    rests: downed
      .map((r) => ({ id: r.id, name: r.name, rest: after.get(r.id) ?? 0 }))
      .filter((r) => r.rest > 0),
    patched: downed.flatMap((r) =>
      r.startHp !== undefined ? [{ id: r.id, name: r.name, startHp: r.startHp }] : [],
    ),
    next,
    drop: squadDrop(game, horde),
    scrap: squadScrap(game, horde),
    auto: autoMoves(game, horde, next),
  };
}

/**
 * The Scrap horde `horde` pays `game` (ID-179), as added once capped at `MAX_COUNT`: the
 * `total`, the `salvage` in it, and the balance `now` after it.
 */
export function squadScrap(
  game: Pick<
    GameState,
    'armoury' | 'roster' | 'reserve' | 'hordeNumber' | 'mode' | 'modes' | 'farm' | 'slots' | 'stock'
  >,
  horde: Pick<HordeState, 'outcome' | 'seed' | 'hordeNumber' | 'mode' | 'tookPart'>,
): { total: number; salvage: number; now: number } {
  if (horde.outcome !== 'won') return { total: 0, salvage: 0, now: game.stock.scrap };
  const win = winScrap(horde.hordeNumber, horde.mode);
  const total = scrapGain(game.stock, win + salvageOf(squadDrop(game, horde)?.thrown ?? []));
  return { total, salvage: Math.max(0, total - win), now: game.stock.scrap + total };
}

/** Who "Auto" moved (ID-154): `next` against the same fight finished with it off. */
function autoMoves(game: GameState, horde: HordeState, next: GameState): SquadMoves | null {
  if (game.autoSquad !== true) return null;
  const off = { ...game };
  delete off.autoSquad;
  const plain = finishSquadHorde(off, horde).roster;
  const has = (list: readonly RosterDefender[], d: RosterDefender): boolean =>
    list.some((x) => x.id === d.id);
  const moves = {
    in: next.roster.filter((d) => !has(plain, d)).map((d) => d.name),
    out: plain.filter((d) => !has(next.roster, d)).map((d) => d.name),
  };
  return moves.in.length + moves.out.length > 0 ? moves : null;
}

/**
 * The survivors who fought horde `horde` (ID-149), as the camp has them, squad then bench
 * (a bench survivor who swapped in, ID-148): the ones a squad or camp profession counts from.
 */
export const fieldOf = (
  game: Pick<GameState, 'roster' | 'reserve'>,
  horde: Pick<HordeState, 'tookPart'>,
): RosterDefender[] => campOf(game).filter((d) => horde.tookPart.includes(d.id));

/** The bonus-gun chance a Scavenger who fought horde `horde` adds (ID-149), 0 with none. */
export const scavenged = (
  game: Pick<GameState, 'roster' | 'reserve'>,
  horde: Pick<HordeState, 'tookPart'>,
): number => fieldBonus(fieldOf(game, horde), 'dropChance');

/** Which kind of drop a win gave (ID-098), as its tile says. */
export type DropKind = 'first' | 'replay' | 'guaranteed';

/**
 * A horde-only win's weapons (ID-067, ID-098, ID-122): its drop, any bonus guns, and the
 * weakest each pushed out of a full stash.
 */
export interface SquadDrop {
  weapon: OwnedWeapon;
  /** Bonus guns (ID-122), lower grades most (`SQUAD_BONUS`), in the order they go in. */
  bonus: OwnedWeapon[];
  /** The blueprint the win drops (ID-209), a gun type; absent with none. At most one, from its own stream. */
  blueprint?: WeaponId;
  /**
   * Thrown away for room, in order: each time a gun goes into the full stash, the weakest
   * of the stash and that gun (maybe one of this win's own).
   */
  thrown: OwnedWeapon[];
  kind: DropKind;
  /** One of the win's guns would do more for a squad survivor than their own (`squadGain`, ID-152). */
  upgrade: boolean;
  /** A replay where no gun this horde can drop is an upgrade (`squadGain`): farm a higher horde. */
  noUpgrades: boolean;
  /**
   * With `noUpgrades`: the lowest horde above this one whose drop could be an upgrade
   * (a replay's band, or the next new horde's first clear) within `FARM.search`
   * hordes, or null if none can.
   */
  farmFrom: number | null;
}

/**
 * The weakest gun a squad survivor holds (ID-098): the one that does the least in its
 * holder's hands (`survivorDps`, their level and profession, ID-152), the free pistol
 * included (a survivor with no gun fights with the pistol).
 */
export function weakestHeld(game: Pick<GameState, 'roster'>): Held {
  const held = squadOf(game).map((d) => {
    const spec = squadSpec(d);
    return { gun: spec.loadout.primary, dps: survivorDps(spec, spec.loadout.primary) };
  });
  return (
    held.reduce<(typeof held)[number] | null>((a, b) => (a === null || b.dps < a.dps ? b : a), null)
      ?.gun ?? 'pistol'
  );
}

/**
 * How much more dmg/s gun `w` would do for the squad (ID-152): the most any squad survivor
 * gains holding it instead of their own gun, in their hands (`survivorDps`: level and
 * profession). Over 0 is an upgrade, a gun "Best gun for everyone" would hand out. At level
 * 1 with no bonus it is `w`'s `gunPower` over the weakest held gun's, the rule before.
 */
export function squadGain(game: Pick<GameState, 'roster'>): GunScore {
  const squad = squadOf(game).map((d) => {
    const spec = squadSpec(d);
    return { spec, now: survivorDps(spec, spec.loadout.primary) };
  });
  if (squad.length === 0) return (w) => gunPower(w) - gunPower('pistol');
  return (w) => Math.max(...squad.map((s) => survivorDps(s.spec, w) - s.now));
}

/**
 * The lowest horde from `from` up to the next new one whose drop could be an upgrade
 * (`gain` over 0, ID-098, ID-152): a beaten horde's replay band with the bad-luck count,
 * the new one's first clear. Null when none can.
 */
function upgradeFrom(
  game: Pick<GameState, 'hordeNumber' | 'mode' | 'modes' | 'farm'>,
  from: number,
  gain: GunScore,
  mode: Mode,
): number | null {
  const open = localHorde(game, mode);
  const steps = MODES[mode].rarity;
  for (let n = from; n <= Math.min(open, from + FARM.search - 1); n++) {
    // The mode horde `n` drops by its strength (ID-218).
    const eff = effHorde(mode, n);
    const weights =
      n < open ? replayWeights(eff, game.farm.badLuck, steps) : firstClearWeights(eff, steps);
    if (dropCanBeat(weights, eff, gain)) return n;
  }
  return null;
}

/** The stream a horde's drop rolls from: its seed's own, so the fight never moves it. */
const DROP_STREAM = 0x5bd1e995;

/**
 * The weapon horde `horde` drops into `game`'s stash (ID-067, ID-098), or null on a loss.
 * Rolled from the horde's seed alone, so the same seed drops the same weapon at any game
 * speed and however the fight went. Its gun level is the horde number.
 *
 * A first clear (uid `h<n>`) rolls `firstClearWeights`. A replay (uid `r<k>`, the k-th
 * replay win) rolls `replayWeights` with the bad-luck count, or, with the count at
 * `FARM.guarantee`, a sure upgrade (`rollUpgrade`) unless no gun here could be one.
 * Then up to `SQUAD_BONUS.rolls` bonus guns (ID-122, uids `<drop uid>-1`, `-2`), each
 * by `bonusWeights`, each at `SQUAD_BONUS.chance` plus a Scavenger's who fought (ID-149; the
 * highest level's, two never stack).
 *
 * The drop, then each bonus gun, goes into the stash as `stashWith` says.
 */
export function squadDrop(
  game: Pick<
    GameState,
    'armoury' | 'roster' | 'reserve' | 'hordeNumber' | 'mode' | 'modes' | 'farm' | 'slots' | 'craft'
  >,
  horde: Pick<HordeState, 'outcome' | 'seed' | 'hordeNumber' | 'mode' | 'tookPart'>,
): SquadDrop | null {
  if (horde.outcome !== 'won') return null;
  // ID-218: a mode's drop is for its strength (gun level, band), its rarity shifted up.
  const mode = horde.mode ?? 'normal';
  const steps = MODES[mode].rarity;
  const local = localOf(horde);
  const replay = local < localHorde(game, mode);
  if (replay && game.farm.replays >= FARM.maxReplays) return null;
  const n = horde.hordeNumber;
  const rng = createRng(horde.seed ^ DROP_STREAM);
  const weakest = weakestHeld(game);
  const gain = squadGain(game);
  let weapon: OwnedWeapon;
  let kind: DropKind = 'first';
  let noUpgrades = false;
  const uid = replay ? `r${game.farm.replays + 1}` : `${FIRST_UID[mode]}${local}`;
  if (!replay) {
    weapon = rollSquadGun(rng, uid, firstClearWeights(n, steps), n);
  } else {
    const weights = replayWeights(n, game.farm.badLuck, steps);
    noUpgrades = !dropCanBeat(weights, n, gain);
    // The rarity floor is the weakest held gun's: a preference only, so the survivor the
    // rolled gun suits best may hold another (the gun is still an upgrade for someone).
    const sure =
      game.farm.badLuck >= FARM.guarantee && !noUpgrades
        ? rollUpgrade(rng, uid, weights, n, 0, isOwned(weakest) ? weakest.rarity : 'common', gain)
        : null;
    kind = sure ? 'guaranteed' : 'replay';
    weapon = sure ?? rollSquadGun(rng, uid, weights, n);
  }
  // Rolled after the drop, so the drop itself is the same gun it was before ID-122.
  const bonus: OwnedWeapon[] = [];
  const odds = Math.min(1, SQUAD_BONUS.chance + scavenged(game, horde));
  for (let k = 0; k < SQUAD_BONUS.rolls; k++) {
    if (chance(rng, odds)) {
      bonus.push(rollSquadGun(rng, `${uid}-${bonus.length + 1}`, bonusWeights(n, steps), n));
    }
  }
  // Only a blueprint that is added counts (ID-209): over `BLUEPRINT.cap` of a type it is lost,
  // so it is neither kept nor shown.
  const rolled = rollBlueprint(horde.seed);
  const blueprint = rolled !== null && blueprintCount(game, rolled) < BLUEPRINT.cap ? rolled : null;
  return {
    weapon,
    bonus,
    ...(blueprint ? { blueprint } : {}),
    thrown: stashWith(game.armoury, [weapon, ...bonus], stashCap(game)).thrown,
    kind,
    upgrade: [weapon, ...bonus].some((w) => gain(w) > 0),
    noUpgrades,
    farmFrom: noUpgrades ? upgradeFrom(game, local + 1, gain, mode) : null,
  };
}

/**
 * `armoury` with `guns` put in one by one (ID-067, ID-122), and what was thrown away for
 * room. With the stash at `cap` (`stashCap`, ID-179; or past it, from an older save) each gun put in
 * throws away the weakest of the stash and that gun by `gunPower` (a blade or tool an
 * older save left there first); a tie throws the later one, so a duplicate goes rather
 * than the one kept.
 */
export function stashWith(
  armoury: readonly OwnedWeapon[],
  guns: readonly OwnedWeapon[],
  cap: number = STASH_CAP,
): { armoury: OwnedWeapon[]; thrown: OwnedWeapon[] } {
  // A blade or tool from an older save is no use to a survivor: it counts as the weakest.
  const power = (w: OwnedWeapon): number => (isGun(w) ? gunPower(w) : 0);
  let stash = [...armoury];
  const thrown: OwnedWeapon[] = [];
  for (const gun of guns) {
    if (stash.length < cap) {
      stash.push(gun);
      continue;
    }
    let out = gun;
    for (const w of [...stash, gun]) if (power(w) <= power(out)) out = w;
    stash = [...stash, gun].filter((w) => w !== out);
    thrown.push(out);
  }
  return { armoury: stash, thrown };
}

/** What a survivor's gun picker can choose: the free pistol, or a stash weapon's uid. */
export type GunChoice = 'pistol' | string;

/**
 * Gives survivor `defenderId` gun `choice` as their primary (ID-067, between hordes): the
 * free pistol or a stash weapon, by uid. The gun they had goes to the stash (a pistol,
 * free and unlimited, just goes). Their secondary and item stay as they were. Refused when
 * the stash has no such weapon, or when a gun would go into a full stash for the pistol.
 * A bench survivor's gun changes the same way (ID-147), so no gun is stuck on the bench.
 */
export function equipGun(
  game: GameState,
  defenderId: string,
  choice: GunChoice,
): { ok: true; game: GameState } | { ok: false; reason: string } {
  const benched = game.reserve.find((d) => d.id === defenderId);
  if (benched) {
    // As if they were the whole squad: the stash is the same, then they go back.
    const r = equipGun({ ...game, roster: [benched], reserve: [] }, defenderId, choice);
    if (!r.ok) return r;
    const now = r.game.roster[0]!;
    if (now === benched) return { ok: true, game };
    return {
      ok: true,
      game: {
        ...game,
        armoury: r.game.armoury,
        reserve: game.reserve.map((d) => (d.id === defenderId ? now : d)),
      },
    };
  }
  const me = game.roster.find((d) => d.id === defenderId);
  if (!me) return { ok: false, reason: 'No such survivor' };
  const had = me.loadout.primary;
  if (choice === 'pistol') {
    if (!isOwned(had)) return { ok: true, game };
    const cap = stashCap(game);
    if (game.armoury.length >= cap) {
      return { ok: false, reason: `The stash is full (${cap}/${cap})` };
    }
    return equip(game, me.id, { ...me.loadout, primary: 'pistol' });
  }
  if (isOwned(had) && had.uid === choice) return { ok: true, game };
  const gun = game.armoury.find((w) => w.uid === choice);
  if (!gun || !isGun(gun)) return { ok: false, reason: 'That gun is not in the stash' };
  return equip(game, me.id, { ...me.loadout, primary: gun });
}

/** One survivor's change in `bestGuns` (ID-108): the gun they had and the gun they got. */
export interface GunMove {
  id: string;
  name: string;
  from: Held;
  /** A stash gun, or a squadmate's (ID-152), the free pistol included. */
  to: Held;
  /** On the bench (ID-188): armed after the squad, from what the stash had left. */
  bench?: true;
}

/** Under this much more dmg/s for the squad, a change in `bestGuns` isn't worth making. */
const BEST_GAIN = 1e-9;

/** One group's hands in `bestGuns`: who, what they hold, and the order they first changed. */
interface Hands {
  specs: DefenderSpec[];
  hands: Held[];
  /** Holding an owned weapon that is no gun (fights as the pistol). */
  odd: boolean[];
  order: number[];
}

/**
 * `bestGuns`' search for one group (the squad, or the bench) against the shared `stash`:
 * repeatedly makes the one change that raises the group's total the most, a survivor
 * taking a stash gun (theirs goes to the stash; the free pistol just goes) or two of the
 * group trading, until no single change helps (a three-way trade isn't looked for). True if
 * anything changed.
 */
function handOut(group: Hands, stash: Held[]): boolean {
  const { specs, hands, odd, order } = group;
  const score = (i: number, h: Held): number => survivorDps(specs[i]!, h);
  let moved = false;
  for (;;) {
    // The best change this round: survivor `i` takes stash gun `s`, or trades with `j`.
    let gain = BEST_GAIN;
    let pick: { i: number; s: number } | { i: number; j: number } | null = null;
    for (let i = 0; i < hands.length; i++) {
      const now = score(i, hands[i]!);
      for (let s = 0; s < stash.length; s++) {
        const g = score(i, stash[s]!) - now;
        if (g > gain) [gain, pick] = [g, { i, s }];
      }
      // An odd holder's weapon goes to the stash when they change, so they may only take a
      // stash gun (one out, one in), never trade first.
      for (let j = i + 1; j < hands.length; j++) {
        if (odd[i] || odd[j]) continue;
        const g = score(i, hands[j]!) + score(j, hands[i]!) - now - score(j, hands[j]!);
        if (g > gain) [gain, pick] = [g, { i, j }];
      }
    }
    if (!pick) return moved;
    moved = true;
    const { i } = pick;
    if ('s' in pick) {
      const had = hands[i]!;
      hands[i] = stash[pick.s]!;
      if (isOwned(had)) stash[pick.s] = had;
      else stash.splice(pick.s, 1);
      odd[i] = false;
    } else [hands[i], hands[pick.j]] = [hands[pick.j]!, hands[i]!];
    for (const k of 's' in pick ? [i] : [i, pick.j]) if (!order.includes(k)) order.push(k);
  }
}

/**
 * Hands out guns so they do the most for the squad (ID-108, ID-152, between hordes), each
 * gun scored in the hands of the survivor who would hold it (`survivorDps`: their level
 * and profession, so a fighting job's own guns count for more): `handOut` for the squad.
 * Then the bench (ID-188) does the same with what the stash has left, trading only among
 * itself, so it never takes a squad survivor's gun.
 * A gun the bench gives back may suit the squad better, so the squad looks again, and so
 * on until neither changes: each change raises its group's total and the squad's never
 * falls, so it ends, and a second call moves nothing. A gun never goes into the stash for
 * the pistol, so the stash never grows. Returns the new game and one move per survivor
 * whose gun changed (from what they held to what they hold): the squad's in the order they
 * first changed, then the bench's.
 */
export function bestGuns(game: GameState): { game: GameState; moves: GunMove[] } {
  const group = (who: RosterDefender[]): Hands => ({
    specs: who.map(squadSpec),
    hands: who.map((d) => squadSpec(d).loadout.primary),
    odd: who.map((d) => isOwned(d.loadout.primary) && !isGun(d.loadout.primary)),
    order: [],
  });
  const squadMembers = squadOf(game);
  const benchMembers = [...game.roster.slice(squadMembers.length), ...game.reserve];
  const squad = group(squadMembers);
  const bench = group(benchMembers);
  const start = [...squad.hands, ...bench.hands];
  const stash: Held[] = game.armoury.filter(isGun);
  handOut(squad, stash);
  while (handOut(bench, stash) && handOut(squad, stash));
  const same = (a: Held, b: Held): boolean =>
    isOwned(a) && isOwned(b) ? a.uid === b.uid : a === b;
  // Everyone in one list: the squad's indices first, then the bench's after them.
  const n = squad.hands.length;
  const specs = [...squad.specs, ...bench.specs];
  const hands = [...squad.hands, ...bench.hands];
  const order = [...squad.order, ...bench.order.map((i) => n + i)];
  const changed = order.filter((i) => !same(start[i]!, hands[i]!));
  if (changed.length === 0) return { game, moves: [] };
  const byId = new Map(changed.map((i) => [specs[i]!.id, hands[i]!]));
  const inHand = new Set(hands.filter(isOwned).map((h) => h.uid));
  const arm = (d: RosterDefender): RosterDefender => {
    const h = byId.get(d.id);
    return h === undefined ? d : { ...d, loadout: { ...d.loadout, primary: h } };
  };
  // What they really held: a primary that is no gun fights as the pistol, but goes back too.
  const released = campOf(game)
    .filter((d) => byId.has(d.id))
    .map((d) => d.loadout.primary)
    .filter(isOwned);
  const g: GameState = {
    ...game,
    roster: game.roster.map(arm),
    reserve: game.reserve.map(arm),
    // As `equip` does: the stash keeps its order, a gun given back goes on the end.
    armoury: [...game.armoury, ...released].filter((w) => !inHand.has(w.uid)),
  };
  const moves = changed.map((i): GunMove => ({
    id: specs[i]!.id,
    name: specs[i]!.name,
    from: start[i]!,
    to: hands[i]!,
    ...(i >= n ? { bench: true as const } : {}),
  }));
  return { game: g, moves };
}

/** The rarity a combine of `rarity` guns makes (ID-091), or null for Relic, the top. */
export const nextRarity = (rarity: Rarity): Rarity | null =>
  RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1] ?? null;

/** One base weapon at one rarity in the stash, as the Combine list shows it (ID-091). */
export interface CombineSet {
  base: WeaponId;
  rarity: Rarity;
  /** Every stash gun of this kind, weakest first: a combine uses up the first `COMBINE_COUNT`. */
  guns: OwnedWeapon[];
  /** What a combine makes; null for Relic, which combines no further. */
  next: Rarity | null;
}

/**
 * The stash's guns by base weapon and rarity (ID-091), in `WEAPONS` then rarity order. Each
 * set's guns are weakest first by `gunPower` (ties in stash order), so a combine keeps the
 * best. A blade or tool an older save left in the stash is no gun and is left out.
 */
export function combineSets(game: Pick<GameState, 'armoury'>): CombineSet[] {
  const sets: CombineSet[] = [];
  for (const base of Object.keys(WEAPONS) as WeaponId[]) {
    for (const rarity of RARITY_ORDER) {
      const guns = game.armoury
        .filter((w) => w.base === base && w.rarity === rarity && isGun(w))
        .map((w) => ({ w, power: gunPower(w) }))
        .sort((a, b) => a.power - b.power)
        .map(({ w }) => w);
      if (guns.length > 0) sets.push({ base, rarity, guns, next: nextRarity(rarity) });
    }
  }
  return sets;
}

/**
 * The level and upgrade step a combine of `guns` keeps (ID-098, ID-208): the highest level, and
 * the step of the gun that brings it, the highest step among those tied on level. A step is
 * never taken from a lower-level gun, so a cheap low-level +5 gun can't be combined into a
 * high-level one.
 */
export function combineKept(guns: readonly OwnedWeapon[]): { level: number; step: number } {
  const level = Math.max(...guns.map(gunLevel));
  const step = Math.max(...guns.filter((g) => gunLevel(g) === level).map(gunStep));
  return { level, step };
}

/** FNV-1a: a combine's seed from its inputs, so the same guns always roll the same affixes. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Combines the stash guns `uids` into one gun of the next rarity (ID-091, between hordes):
 * exactly `COMBINE_COUNT` guns, all in the stash (a survivor's must go back first, and the
 * free pistol never combines), of one base weapon and one rarity below Relic. The new gun
 * rolls its rarity's affixes as a drop does, seeded from the inputs alone, so the same save
 * and the same picks give the same gun. The inputs are used up, and the new gun takes the
 * first input's uid (in sorted order), so it stays unique and a save reads it as before.
 * Free; 3 in and 1 out, so a full stash never refuses it. Level and upgrade step: the highest of
 * the three, the step from the gun that brings that level (`combineKept`, ID-098, ID-208).
 */
export function combineGuns(
  game: GameState,
  uids: readonly string[],
): { ok: true; game: GameState; weapon: OwnedWeapon } | { ok: false; reason: string } {
  if (uids.includes('pistol')) return { ok: false, reason: 'The free pistol can’t be combined' };
  if (uids.length !== COMBINE_COUNT || new Set(uids).size !== uids.length) {
    return { ok: false, reason: `Combining takes ${COMBINE_COUNT} different guns` };
  }
  const guns: OwnedWeapon[] = [];
  for (const uid of uids) {
    const gun = game.armoury.find((w) => w.uid === uid);
    if (gun) {
      guns.push(gun);
      continue;
    }
    const holder = [...game.roster, ...game.reserve].find((d) =>
      [d.loadout.primary, d.loadout.secondary].some((h) => isOwned(h) && h.uid === uid),
    );
    return {
      ok: false,
      reason: holder
        ? `${holder.name} holds that gun: put it back in the stash first`
        : 'That gun is not in the stash',
    };
  }
  const [first] = guns as [OwnedWeapon, ...OwnedWeapon[]];
  if (!guns.every(isGun)) return { ok: false, reason: 'Only guns can be combined' };
  if (guns.some((g) => g.base !== first.base)) {
    return { ok: false, reason: 'Combining takes guns of one kind' };
  }
  if (guns.some((g) => g.rarity !== first.rarity)) {
    return { ok: false, reason: 'Combining takes guns of one rarity' };
  }
  const next = nextRarity(first.rarity);
  if (!next) return { ok: false, reason: 'A Relic gun is the best there is: it can’t be combined' };
  const sorted = [...uids].sort();
  const rng = createRng(hash(`${first.base}:${first.rarity}:${sorted.join(',')}`));
  // The new gun takes the highest level of the three (ID-098), and the step of the gun that
  // brings it (ID-208).
  const { level, step } = combineKept(guns);
  const rolled = rollWeapon(rng, sorted[0]!, first.base, next, level > 1 ? level : undefined);
  const weapon = step > 0 ? { ...rolled, step } : rolled;
  const used = new Set(uids);
  return {
    ok: true,
    game: { ...game, armoury: [...game.armoury.filter((w) => !used.has(w.uid)), weapon] },
    weapon,
  };
}

/** What a hand salvage gives (ID-207): the game after it, the gun, and the Scrap it paid; or why not. */
export type GunSalvage =
  { ok: true; game: GameState; weapon: OwnedWeapon; scrap: number } | { ok: false; reason: string };

/**
 * Salvages the stash gun `uid` by hand (ID-207), any time, in a fight too: it leaves the stash
 * and pays `gunSalvage` Scrap (its rarity's, and half of what its upgrade steps cost). Refused
 * with a player-facing reason for the free pistol, a gun a survivor holds (squad or bench: it
 * must go back to the stash first, as for Combine), a gun that is not there, or a blade or tool.
 */
export function salvageGun(game: GameState, uid: string): GunSalvage {
  if (uid === 'pistol') return { ok: false, reason: 'The free pistol can’t be salvaged' };
  const weapon = game.armoury.find((w) => w.uid === uid);
  if (!weapon) {
    const holder = [...game.roster, ...game.reserve].find((d) =>
      [d.loadout.primary, d.loadout.secondary].some((h) => isOwned(h) && h.uid === uid),
    );
    return {
      ok: false,
      reason: holder
        ? `${holder.name} holds that gun: put it back in the stash first`
        : 'That gun is not in the stash',
    };
  }
  if (!isGun(weapon)) return { ok: false, reason: 'Only guns can be salvaged' };
  const stock = scrapAfter(game.stock, gunSalvage(weapon));
  return {
    ok: true,
    weapon,
    scrap: stock.scrap - game.stock.scrap,
    game: { ...game, stock, armoury: game.armoury.filter((w) => w !== weapon) },
  };
}

/**
 * `game` with at most `squadCap` on the roster (ID-066): the rest go to the reserve. The
 * squad is the highest XP (ties to roster order), kept in roster order; the reserve keeps
 * what it had, then the rest in roster order. Returns `game` itself with nothing to move.
 */
export function capSquad(game: GameState): GameState {
  const cap = squadCap(game);
  if (game.roster.length <= cap) return game;
  const keep = new Set(
    game.roster
      .map((d, i) => ({ d, i }))
      .sort((a, b) => b.d.xp - a.d.xp || a.i - b.i)
      .slice(0, cap)
      .map(({ d }) => d.id),
  );
  return {
    ...game,
    roster: game.roster.filter((d) => keep.has(d.id)),
    reserve: [...game.reserve, ...game.roster.filter((d) => !keep.has(d.id))],
  };
}
