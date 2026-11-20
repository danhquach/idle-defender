// Debug mode (ID-197): edits a tester makes to reach a state without playing up to it. Each
// one is a move the game itself could make (a horde beaten, Scrap earned, a gun dropped, a
// card picked), refused with a reason when it could not; the UI checks the result against
// the save's own rules too. Nothing here changes a number the simulation uses.
import {
  DROP_GUNS,
  dropRarity,
  isOwned,
  rollSquadGun,
  rollWeapon,
  squadDropWeights,
} from './armoury.ts';
import { recruit } from './camp.ts';
import {
  chooseCard,
  isResearchCard,
  OFFER_SIZE,
  rollOffer,
  UPGRADE_IDS,
  UPGRADES,
} from './cards.ts';
import {
  CAMP_SIZE,
  RARITY_ORDER,
  SKILL_IDS,
  SQUAD_BONUS,
  SQUAD_CAP,
  SQUAD_CAP_MAX,
  SQUAD_JOIN,
  STASH_CAP_MAX,
  STEP,
  type Rarity,
  type SkillId,
  type WeaponId,
} from './data.ts';
import type { GameState, RosterDefender } from './game.ts';
import {
  cardLevel,
  clearFight,
  tickInPlace,
  type Card,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { campOf, isFit, stashCap } from './hordeonly.ts';
import { createRng, rngFrom } from './rng.ts';
import { xpForLevel } from './stats.ts';

/** The range each typed debug value must fall in; anything else is refused, never clamped. */
export const DEBUG_LIMITS = {
  horde: { min: 1, max: 999 },
  campLevel: { min: 1, max: 50 },
  scrap: { min: 0, max: 1_000_000 },
  squad: { min: 1, max: SQUAD_CAP_MAX },
  level: { min: 1, max: 99 },
  seed: { min: 0, max: 0xffff_ffff },
  stash: { min: 0, max: STASH_CAP_MAX },
} as const;

export type DebugGame = { ok: true; game: GameState } | { ok: false; reason: string };
export type DebugFight = { ok: true; state: HordeState } | { ok: false; reason: string };

const inRange = (n: number, r: { min: number; max: number }): boolean =>
  Number.isInteger(n) && n >= r.min && n <= r.max;

const refuse = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Hordes 1 to `n − 1` beaten: the next new horde is `n`. Only forward; a lower one is a replay. */
export function reachHorde(game: GameState, n: number): DebugGame {
  if (!inRange(n, DEBUG_LIMITS.horde)) return refuse('No such horde');
  if (n <= game.hordeNumber) return { ok: true, game };
  return { ok: true, game: { ...game, hordeNumber: n } };
}

/** Camp XP at the start of camp level `level`. */
export const campXpAt = (level: number): number => (CAMP_SIZE.levelXp * level * (level - 1)) / 2;

/** The camp at the start of `level`. */
export function setCampLevel(game: GameState, level: number): DebugGame {
  if (!inRange(level, DEBUG_LIMITS.campLevel)) return refuse('No such camp level');
  return { ok: true, game: { ...game, camp: { ...game.camp, xp: campXpAt(level) } } };
}

/** `n` Scrap in the stock. */
export function setScrap(game: GameState, n: number): DebugGame {
  if (!inRange(n, DEBUG_LIMITS.scrap)) return refuse('Scrap out of range');
  return { ok: true, game: { ...game, stock: { ...game.stock, scrap: n } } };
}

/**
 * A squad of `n`: the squad slots bought to hold them, free recruits (seeded by `seed`) when
 * too few survivors are fit, the first `n` fit ones in the squad and the rest on the bench.
 * Below the slots' cap "Auto" is switched off, as a player picking a short squad would.
 */
export function setSquadSize(game: GameState, n: number, seed: number): DebugGame {
  if (!inRange(n, DEBUG_LIMITS.squad)) return refuse('No such squad size');
  const g = structuredClone(game);
  const all = campOf(g);
  const fit = all.filter(isFit);
  const add = Math.max(0, n - fit.length);
  if (all.length + add > SQUAD_JOIN.max) return refuse('The camp is full');
  const recruits: RosterDefender[] = [];
  for (let k = 0; k < add; k++) {
    g.camp.recruits += 1;
    recruits.push(recruit(g.camp.recruits, seed));
  }
  const squad = [...fit, ...recruits].slice(0, n);
  const inSquad = new Set(squad.map((d) => d.id));
  g.roster = squad;
  g.reserve = [...all, ...recruits].filter((d) => !inSquad.has(d.id));
  const bought = Math.max(0, n - SQUAD_CAP);
  delete g.slots;
  const stash = game.slots?.stash ?? 0;
  if (bought + stash > 0) g.slots = { squad: bought, stash };
  if (n < SQUAD_CAP + bought) delete g.autoSquad;
  return { ok: true, game: g };
}

/** Survivor `id` (or everyone in the camp, for null) at the start of `level`. */
export function setSurvivorLevel(game: GameState, id: string | null, level: number): DebugGame {
  if (!inRange(level, DEBUG_LIMITS.level)) return refuse('No such level');
  if (id !== null && !campOf(game).some((d) => d.id === id)) return refuse('No such survivor');
  const xp = xpForLevel(level);
  const at = (d: RosterDefender): RosterDefender => (id === null || d.id === id ? { ...d, xp } : d);
  return {
    ok: true,
    game: { ...game, roster: game.roster.map(at), reserve: game.reserve.map(at) },
  };
}

/** Every owned gun's uid in the camp: the stash, and each survivor's hands. */
function usedUids(game: GameState): Set<string> {
  const used = new Set(game.armoury.map((w) => w.uid));
  for (const d of [...campOf(game), ...(game.joining ?? [])]) {
    for (const h of [d.loadout.primary, d.loadout.secondary]) {
      if (isOwned(h)) used.add(h.uid);
    }
  }
  return used;
}

/**
 * Up to `count` uids a beaten horde's drop could have had and no gun holds yet (`h<k>`, then
 * its bonus guns' `h<k>-<b>`), oldest horde first, with the horde each came from.
 */
function freeDrops(game: GameState, count: number): { uid: string; horde: number }[] {
  const used = usedUids(game);
  const out: { uid: string; horde: number }[] = [];
  for (let k = 1; k < game.hordeNumber && out.length < count; k++) {
    const ids = [`h${k}`, ...Array.from({ length: SQUAD_BONUS.rolls }, (_, b) => `h${k}-${b + 1}`)];
    for (const uid of ids) {
      if (out.length < count && !used.has(uid)) out.push({ uid, horde: k });
    }
  }
  return out;
}

const NO_DROPS = 'No horde beaten has a drop left: reach a later horde first';

/** Gun `base` at `rarity` into the stash, as a beaten horde could have dropped it (affixes seeded). */
export function grantGun(game: GameState, base: WeaponId, rarity: Rarity, seed: number): DebugGame {
  if (!DROP_GUNS.includes(base)) return refuse('That gun never drops');
  if (!RARITY_ORDER.includes(rarity)) return refuse('No such rarity');
  if (dropRarity(base, rarity) !== rarity) return refuse('That gun never drops at that rarity');
  if (game.armoury.length >= stashCap(game)) return refuse('The stash is full');
  const [slot] = freeDrops(game, 1);
  if (!slot) return refuse(NO_DROPS);
  const gun = rollWeapon(createRng(seed), slot.uid, base, rarity, slot.horde);
  return { ok: true, game: { ...game, armoury: [...game.armoury, gun] } };
}

/** The stash filled to `n` guns with drops rolled (from `seed`) as beaten hordes roll them. */
export function fillStash(game: GameState, n: number, seed: number): DebugGame {
  const cap = stashCap(game);
  if (!Number.isInteger(n) || n < 0 || n > cap) return refuse(`The stash holds 0 to ${cap}`);
  const need = n - game.armoury.length;
  if (need < 0) return refuse(`The stash holds ${game.armoury.length} already`);
  const slots = freeDrops(game, need);
  if (slots.length < need) return refuse(NO_DROPS);
  const rng = createRng(seed);
  const guns = slots.map((s) => rollSquadGun(rng, s.uid, squadDropWeights(s.horde), s.horde));
  return { ok: true, game: { ...game, armoury: [...game.armoury, ...guns] } };
}

/** Skill `id` alone picked for the next horde, or none for null. */
export function setSkill(game: GameState, id: SkillId | null): DebugGame {
  if (id !== null && !SKILL_IDS.includes(id)) return refuse('No such skill');
  return { ok: true, game: { ...game, skillPick: id === null ? [] : [id] } };
}

/** Why the fight can't take a debug move now, or null when it can. */
export function fightLock(s: HordeState): string | null {
  if (s.outcome !== 'fighting') return 'The fight is over';
  if (s.offer !== null || s.replace !== null) return 'Pick first';
  return null;
}

/** The cards this fight could still offer, whatever the moment: in its pool, unlocked, not maxed. */
export function cardsOpen(s: HordeState): UpgradeId[] {
  return (s.cardPool ?? UPGRADE_IDS).filter((id) => {
    const levels = UPGRADES[id].levels;
    if (levels !== null && cardLevel(s, id) >= levels) return false;
    return !isResearchCard(id) || s.research.includes(id);
  });
}

function cardCheck(s: HordeState, id: UpgradeId): string | null {
  return fightLock(s) ?? (cardsOpen(s).includes(id) ? null : "That card can't come in this fight");
}

/** A level-up offer now, card `id` first, the rest rolled as an offer rolls them. */
export function offerCard(s: HordeState, id: UpgradeId): DebugFight {
  const lock = cardCheck(s, id);
  if (lock) return refuse(lock);
  const next = structuredClone(s);
  const rolled = rollOffer(rngFrom(next.rng), next).filter(
    (c) => !(c.kind === 'upgrade' && c.id === id),
  );
  const first: Card = { kind: 'upgrade', id };
  // As many cards as an offer has: the one asked for takes a rolled one's place.
  next.offer = [first, ...rolled].slice(0, OFFER_SIZE);
  return { ok: true, state: next };
}

/** Card `id` picked now, as from an offer. */
export function grantCard(s: HordeState, id: UpgradeId): DebugFight {
  const lock = cardCheck(s, id);
  if (lock) return refuse(lock);
  return { ok: true, state: chooseCard({ ...s, offer: [{ kind: 'upgrade', id }] }, 0) };
}

/** Survivor `id` on the line at 0 HP: the fight's next step injures them. */
export function downSurvivor(s: HordeState, id: string): DebugFight {
  const lock = fightLock(s);
  if (lock) return refuse(lock);
  if (!s.defenders.some((d) => d.id === id)) return refuse('Not on the line');
  const next = structuredClone(s);
  next.defenders.find((d) => d.id === id)!.hp = 0;
  return { ok: true, state: next };
}

/**
 * Every enemy gone and none left to come, on the last wave: the fight's next step wins it by
 * its own rule. Gone, not killed, so the win pays no kill XP or cash the fight didn't earn.
 */
export function winNow(s: HordeState): DebugFight {
  const lock = fightLock(s);
  if (lock) return refuse(lock);
  const next = structuredClone(s);
  next.enemies = [];
  next.focusId = null;
  next.toSpawn = 0;
  next.wave = next.waveCount;
  for (const b of next.bosses) if (b.id === null) b.id = next.nextEnemyId++;
  tickInPlace(next, STEP);
  return { ok: true, state: next };
}

/** The whole line at 0 HP with nobody to swap in: injured by the next step, and the fight lost. */
export function loseNow(s: HordeState): DebugFight {
  const lock = fightLock(s);
  if (lock) return refuse(lock);
  const next = structuredClone(s);
  for (const d of next.defenders) d.hp = 0;
  if (next.subs) next.subs = [];
  tickInPlace(next, STEP);
  // The fall's own rule waits for an enemy inside the camp; a lost fight never has a card open.
  next.offer = null;
  next.outcome = 'lost';
  clearFight(next);
  return { ok: true, state: next };
}
