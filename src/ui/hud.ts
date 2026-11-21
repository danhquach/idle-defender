// HUD over the canvas: status bar, the "camp is falling" warning, the 1-of-3 card
// panel, the replacement panel, the result panel, the horde
// cash shop row with the active skills, the commander's perks and Second Look's
// reroll, and a short toast (refused moves).
// Text reaches the page only through textContent.
import {
  affixLines,
  gunLevel,
  gunPower,
  gunStep,
  heldName,
  isOwned,
  levelName,
  roleLine,
  type Held,
  type OwnedWeapon,
} from '../core/armoury.ts';
import { repairAllCost } from '../core/base.ts';
import {
  campAfterPick,
  campLevelOf,
  campXpAfter,
  campXpFor,
  hordeCampOffers,
  recoveryMs,
  repairOff,
  roomLock,
  roomOf,
  type Camp,
  type CampChoice,
  type Room,
  type Survivor,
} from '../core/camp.ts';
import {
  AMMO_CARDS,
  effectAt,
  pitch,
  rerollLock,
  synergyOf,
  UPGRADE_IDS,
  UPGRADES,
  type CardPitch,
} from '../core/cards.ts';
import {
  BANK_CAP,
  BOSS_SKILL,
  BOSSES,
  CARD,
  HORROR,
  CAMP_PICK_RANKS,
  CAMP_PICKS,
  FALL_WARNING,
  GAS_PER_WIN,
  GUN_UPGRADE,
  HORDE_ONLY,
  MATERIALS,
  PERKS,
  PROFESSIONS,
  RARITIES,
  SHOP,
  SHOP_ITEMS,
  SKILL_IDS,
  SQUAD_SKILLS,
  STASH_SLOT,
  SKILLS,
  type EnemyKind,
  type CampPickId,
  type BossSkill,
  type Rarity,
  type ShopItem,
  type SkillId,
  type Stock,
  WEAPONS,
} from '../core/data.ts';
import {
  hordeBossReward,
  hordeDrop,
  hordeFind,
  hordePayout,
  injuredUntil,
  levelGains,
  type GameState,
  type RosterDefender,
} from '../core/game.ts';
import {
  baseAfter,
  bossHorde,
  cardLevel,
  perkOn,
  repairsLeft,
  windingUp,
  type Enemy,
  type Breach,
  type Card,
  type DefenderSpec,
  type FightPostKind,
  type HordeState,
  type Injury,
  type Post,
  type UpgradeId,
} from '../core/horde.ts';
import {
  bossReward,
  campOf,
  highestBeaten,
  isEndless,
  isFit,
  isReplay,
  joiningOf,
  paramedicPoints,
  restLabel,
  nextSquadSlotCost,
  nextStashSlotCost,
  squadCap,
  squadOf,
  stashCap,
  squadResult,
  upgradeCost,
  type GunMove,
  type NoJoin,
  type SquadDrop,
} from '../core/hordeonly.ts';
import { professionOf } from '../core/loadout.ts';
import { advanceResearch } from '../core/research.ts';
import { replacePosts } from '../core/replace.ts';
import { buffLeft, isBuff, shopLock } from '../core/shop.ts';
import { skillLeft, skillLock } from '../core/skills.ts';
import {
  injuryBand,
  powerBand,
  recommendedPower,
  squadPower,
  type InjuryBand,
  type PowerBand,
} from '../core/squadpower.ts';
import { levelOf } from '../core/stats.ts';
import { horrorAbility, swarmWave, waveCount, xpToNext, type BossSpec } from '../core/waves.ts';
import { SPEEDS, type Speed } from '../storage/settings.ts';
import type { ButtonVariant } from './kit.ts';
import { setVariant } from './kit.ts';
import { askLine, joinLabel, noJoinText, REFUSE_NOTE, type JoinCard } from './joining.ts';
import {
  ART_URLS,
  avatarOf,
  CARD_ICON,
  GUN_ICON,
  SHOP_ICON,
  SKILL_ICON,
  type ArtId,
  type GunId,
} from './sprites.ts';

/** The key for each fight speed (ID-062): clear of the card keys 1 2 3 and the action bar's. */
export const SPEED_KEYS: Readonly<Record<Speed, string>> = { 1: 'A', 3: 'S', 5: 'D' };
/** The 5× button's title while the empty field fast-forwards (ID-164). */
export const SKIP_TITLE = 'Fast-forwarding the empty field';

/** How long a toast stays up. */
const TOAST_MS = 2000;
/**
 * How long a picked card's confirm effect plays before the offer closes (ID-103); the
 * fight resumes at once. Matches `hud-card-pick` in page.css.
 */
export const PICK_MS = 240;
/** Whether the player's system asks for less motion; no `matchMedia` counts as yes. */
export const reducedMotion = (): boolean =>
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export const POST_NAME: Readonly<Record<FightPostKind, string>> = {
  tower: 'Tower',
  'wall-walk': 'Wall-walk post',
  ground: 'Ground post',
  line: 'Firing line',
};
export const slotName = (column: number, row: number): string =>
  `Layer ${column + 1}, row ${row + 1}`;
/** A wall-walk spot's name on its segment, top to bottom: "spot 1", "spot 2". */
export const spotName = (spot: number): string => `spot ${spot + 1}`;
export const postName = (p: Pick<Post, 'kind' | 'column' | 'row' | 'spot'>): string =>
  `${POST_NAME[p.kind]} · ${slotName(p.column, p.row)}` +
  (p.kind === 'wall-walk' ? `, ${spotName(p.spot ?? 0)}` : '');

/**
 * A defender's name and the profession their loadout gives them: "Jack — Ripper"; a
 * plain survivor (ID-066) is their name alone.
 */
export const defenderLabel = (d: Pick<DefenderSpec, 'name' | 'loadout' | 'plain'>): string =>
  d.plain ? d.name : `${d.name} — ${PROFESSIONS[professionOf(d.loadout)].name}`;

const capital = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * A card's words (design §8): an upgrade's rarity and category ("Rare behaviour"), the
 * synergy it turns on, if any, and what the pick gives (ID-097, `pitch`): its tag ("New",
 * "Lv 1 → 2"), its effect before and after, and an ammo swap's warning. `spoken` is the
 * whole card in words for a screen reader, arrows read as "to".
 */
export function cardText(
  card: Card,
  state: HordeState,
): {
  title: string;
  body: string;
  kind?: string;
  synergy?: string;
  pitch?: CardPitch;
  spoken: string;
} {
  if (card.kind === 'recruit') {
    const title = `Recruit ${defenderLabel(card.defender)}`;
    // Its kind line says "Recruit" (ID-103), so it never reads as a rare card.
    return {
      title,
      body: 'Takes a free post',
      kind: 'Recruit',
      spoken: `${title}. Takes a free post`,
    };
  }
  const u = UPGRADES[card.id];
  const synergy = synergyOf(state, card.id);
  const p = pitch(state, card.id);
  const e = p.effect;
  const body = e ? `${e.pre}${e.from === null ? '' : `${e.from} → `}${e.to}${e.post}` : p.text;
  const kind = `${capital(u.rarity)} ${u.category}`;
  const said = (s: string): string => s.replaceAll('→', 'to').replaceAll('×', 'times ');
  const spoken = [
    u.name,
    p.tagSpoken,
    said(body),
    kind,
    ...(p.replace ? [p.replace.warning, said(p.replace.swap)] : []),
    ...(synergy ? [`Synergy: ${synergy}`] : []),
  ].join('. ');
  return {
    title: u.name,
    body,
    kind,
    ...(synergy ? { synergy: `Synergy — ${synergy}` } : {}),
    pitch: p,
    spoken,
  };
}

/**
 * An offer card's effect line (ID-097): its words, with the number that changes
 * highlighted ("Enemies <15% → 25%> slower"), all as text nodes; `body` when the card has
 * no number.
 */
export function effectLine(p: CardPitch, body: string): HTMLElement {
  const line = el('span', 'hud-card-body');
  const e = p.effect;
  if (!e) {
    line.textContent = body;
    return line;
  }
  const change = el('strong', 'hud-card-change', e.from === null ? e.to : `${e.from} → ${e.to}`);
  line.append(e.pre, change, e.post);
  return line;
}

/** An upgrade card held this horde, as the fight's card strip shows it (ID-113). */
export interface HeldCard {
  id: UpgradeId;
  /** The level on its chip: "Lv 2", "Max", "×3" for a repeatable card, "" for a unique one. */
  badge: string;
  /** Its name and level: "Ricochet · Lv 2", "Sharpshooter · ×3", "Frag Grenades · Unique". */
  title: string;
  /** What it does at the level held, with its numbers. */
  effect: string;
  /** Its rarity and category: "Rare behaviour". */
  kind: string;
  /** The whole entry in words, for a screen reader. */
  spoken: string;
  /** A timed cost still running (ID-137): "Fire rate −25%, 4 s left"; absent when none. */
  cost?: string;
}

/** Screen px kept clear under the held cards' strip (ID-113), past its chips' level badges. */
const HELD_GAP = 8;

/** The upgrade cards held this horde, in pick order (ID-113); a replaced ammo card is gone. */
export function heldCards(
  s: Pick<HordeState, 'taken' | 'cardLevels'> & Partial<Pick<HordeState, 'time' | 'repairsUntil'>>,
): HeldCard[] {
  // Field Repairs' fire-rate cost while it runs (ID-137): its seconds left on the chip.
  const left =
    s.time === undefined ? 0 : repairsLeft({ time: s.time, repairsUntil: s.repairsUntil });
  return s.taken.map((id) => {
    const u = UPGRADES[id];
    const n = cardLevel(s, id);
    const max = u.levels !== null && n >= u.levels;
    const level =
      u.levels === 1 ? 'Unique' : u.levels === null ? `×${n}` : `Lv ${n}${max ? ' · Max' : ''}`;
    const badge = u.levels === 1 ? '' : max ? 'Max' : level;
    const e = effectAt(id, n);
    const effect = e ? `${e.pre}${e.value}${e.post}` : u.text;
    const kind = `${capital(u.rarity)} ${u.category}`;
    const spokenLevel =
      u.levels === 1
        ? 'unique'
        : u.levels === null
          ? `taken ${n} times`
          : `level ${max ? 'max' : n}`;
    const secs = id === 'field-repairs' && left > 0 ? Math.ceil(left) : 0;
    const cost = secs
      ? `Fire rate −${Math.round((1 - CARD.fieldRepairs.fireRate) * 100)}%, ${secs} s left`
      : undefined;
    return {
      id,
      badge: secs ? `${secs}s` : badge,
      title: `${u.name} · ${level}`,
      effect,
      kind,
      spoken: `${u.name}, ${spokenLevel}. ${effect.replaceAll('×', 'times ')}. ${cost ? `${cost.replace('−', 'minus ')}. ` : ''}${kind}`,
      ...(cost ? { cost } : {}),
    };
  });
}

/** A level as a whole number, rounded down but never to 0 while any is left. */
export const wholeLeft = (n: number): number => (n > 0 ? Math.max(1, Math.floor(n)) : 0);

/** The battery bank as "Bank 420/1,000" (design §7); `cap` grows with research (ID-035). */
export const bankText = (charge: number, cap: number = BANK_CAP): string =>
  `Bank ${wholeLeft(charge).toLocaleString('en-US')}/${cap.toLocaleString('en-US')}`;

export function statusText(s: HordeState): string {
  return [
    bossHorde(s) ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
    `Wave ${s.wave}/${s.waveCount}`,
    `Lv ${s.level} (${s.xp}/${xpToNext(s.level)})`,
    bankText(s.energy, s.bankCap),
    // Scavenger's Eye pays fractions of cash; only whole ones are shown.
    `Cash ${Math.floor(s.cash)}`,
    ...(s.perks.length ? [`Perks: ${s.perks.map((p) => PERKS[p].name).join(', ')}`] : []),
  ].join(' · ');
}

/** Enemies still to beat in the wave under way: on the field, and still to come. */
export const enemiesLeft = (s: Pick<HordeState, 'enemies' | 'toSpawn'>): number =>
  s.enemies.filter((e) => e.hp > 0).length + s.toSpawn;

/**
 * The horde-only corner's tooltip (ID-066): "Horde 3 · Swaps left 1". Wave progress and
 * the enemies left are on the wave line only (ID-167): a tooltip keeps the text it opened
 * with, so a count here went stale beside the live one as a wave ended or began.
 */
export function squadStatus(s: HordeState): string {
  const swaps = swapsText(s);
  return [
    bossHorde(s) ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
    ...(swaps ? [swaps] : []),
  ].join(' · ');
}

/**
 * The mid-fight swaps counter (ID-148): "Swaps left 2", the swaps still to come (no more
 * than the bench has left). Null in a fight that started with nobody on the bench.
 */
export function swapsText(s: Pick<HordeState, 'subs' | 'swaps' | 'swapsLeft'>): string | null {
  if (!s.subs || !s.swaps || s.swapsLeft === undefined) return null;
  if (s.subs.length + s.swaps.length === 0) return null;
  return `Swaps left ${Math.min(s.swapsLeft, s.subs.length)}`;
}
/** The swaps counter's tooltip (ID-148). */
export const SWAPS_TIP = 'Bench survivors who can still take over from a badly hurt one this fight';

/**
 * How long "X takes over from Y" shows after a mid-fight swap (ID-148): `fight` s of fight
 * time (held while paused) and at least `realMs` of real time, so it reads at 5× too. The
 * real-time hold restarts whenever the text changes, a joined swap dropping out included.
 */
export const SWAP_NOTE = { fight: 3, realMs: 2000 } as const;

/**
 * The mid-fight swaps' note (ID-148): each swap in the last `SWAP_NOTE.fight` s, in order
 * ("Lena takes over from Eli · Owen takes over from Nora"), so a quick second swap never
 * hides the first; null for none.
 */
export function swapNote(s: Pick<HordeState, 'swaps' | 'time' | 'outcome'>): string | null {
  if (s.outcome !== 'fighting') return null;
  const recent = (s.swaps ?? []).filter((x) => s.time - x.at < SWAP_NOTE.fight);
  if (recent.length === 0) return null;
  return recent.map((x) => `${x.inName} takes over from ${x.outName}`).join(' · ');
}

/**
 * The fight XP bar (ID-066): the fight's level (not a survivor's), and XP into it out of
 * what the next one costs: "Fight Lv 2 · 7/14 XP".
 */
export function xpBar(s: Pick<HordeState, 'level' | 'xp'>): {
  label: string;
  /** The corner panel's short form (ID-098): "Lv 5 · 62/100". */
  text: string;
  value: number;
  max: number;
} {
  const max = xpToNext(s.level);
  return {
    label: `Fight Lv ${s.level} · ${s.xp}/${max} XP`,
    text: `Lv ${s.level} · ${s.xp}/${max}`,
    value: Math.min(s.xp, max),
    max,
  };
}

/**
 * A shop or skill button's look (ID-056). Locked is kept for a gate opened outside the
 * fight (a skill not yet researched), so it holds all fight; want of cash alone (the lock
 * run again with unlimited cash passes) is unaffordable; a passing refusal (cooling down,
 * already running, a pick open, nothing to patch or fix) leaves the plain button,
 * disabled, so no button changes shape mid-fight.
 */
const variantOf = (
  lock: string | null,
  withCash: () => string | null,
  gated = false,
): ButtonVariant =>
  gated ? 'locked' : lock !== null && withCash() === null ? 'unaffordable' : 'secondary';

/** A locked HUD button's visible note; the full reason stays its tooltip. */
export const LOCKED_NOTE = 'Needs research';

/** A shop or skill button: its label, its cost ('' while it shows seconds left) and look. */
export type HudButton = {
  label: string;
  cost: string;
  variant: ButtonVariant;
  disabled: boolean;
  reason: string;
};

/** The shop row: a button per item, each a dry run of `buy` (a running buff shows its seconds left). */
export function shopButtons(s: HordeState): (HudButton & { item: ShopItem })[] {
  return SHOP_ITEMS.map((item) => {
    const lock = shopLock(s, item);
    const left = isBuff(item) ? buffLeft(s, item) : 0;
    return {
      item,
      label: left > 0 ? `${SHOP[item].name} ${Math.ceil(left)}s` : SHOP[item].name,
      cost: left > 0 ? '' : String(SHOP[item].cost),
      variant: variantOf(lock, () => shopLock({ ...s, cash: Infinity }, item)),
      disabled: lock !== null,
      reason: lock ?? '',
    };
  });
}

/** What a ready skill's button says it does next (design §4, ID-041). */
const AIM_HINT = {
  area: 'Then click an area to bomb (Esc to cancel)',
} as const;

/**
 * A card or replacement offer holds the skills mid-fight (ID-159): an armed skill stays
 * armed for after the pick rather than being put away.
 */
export function offerHolds(s: Pick<HordeState, 'outcome' | 'offer' | 'replace'>): boolean {
  return s.outcome === 'fighting' && (s.offer !== null || s.replace !== null);
}

/**
 * The skill buttons: each a dry run of `useSkill` before aiming (one cooling down shows
 * its seconds left); the armed one is pressed until it is used or put away.
 */
export function skillButtons(
  s: HordeState,
  armed: SkillId | null,
): (HudButton & {
  skill: SkillId;
  armed: boolean;
  hidden: boolean;
  key: string | null;
  /** Counting down its cooldown. */
  cooling: boolean;
})[] {
  return SKILL_IDS.map((skill) => {
    const lock = skillLock(s, skill);
    const left = skillLeft(s, skill);
    const { name, cost } = SKILLS[skill];
    // The horde-only build (ID-100): only the picked skills show, free, each with its key.
    const free = s.freeSkills !== undefined;
    const slot = skillSlots(s).indexOf(skill);
    const key = free ? (SKILL_KEYS[slot] ?? null) : null;
    // A lone pick's ×2 (`skillPower`) works in the background, unlabelled (ID-174, PM).
    return {
      skill,
      label: left > 0 ? `${name} ${Math.ceil(left)}s` : name,
      cost: left > 0 || free ? '' : String(cost),
      variant: variantOf(
        lock,
        () => skillLock({ ...s, cash: Infinity }, skill),
        !s.skills.includes(skill),
      ),
      disabled: lock !== null,
      reason: lock ?? `${AIM_HINT[SKILLS[skill].aim]}${key ? ` (key ${key})` : ''}`,
      // Still pressed while a card offer holds the skills: the pick leaves it armed (ID-159).
      armed: skill === armed && (lock === null || offerHolds(s)),
      hidden: free && slot < 0,
      key,
      cooling: left > 0,
    };
  });
}

/**
 * Over the skill row while a skill is armed (ID-100, ID-107), until it is used or put
 * away: touch screens show no tooltip.
 */
export const AIM_PROMPT: Readonly<Record<SkillId, string>> = {
  airstrike: 'Tap or drag to an area · tap Airstrike again to cancel',
};

/** The aim caption while an offer holds the armed skill (ID-159): it waits for the pick. */
export const AIM_HELD_PROMPT = 'Pick a card, then tap an area';

/**
 * A fight key's name (ID-100): a letter key by its place (`KeyQ` is Q on any layout), so
 * the speed and skill keys never both fire from one press; anything else by what it types.
 */
export const fightKeyName = (e: Pick<KeyboardEvent, 'code' | 'key'>): string =>
  /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key.toUpperCase();

/** The fight's skill keys in the horde-only build (ID-100), left to right: clear of A S D, Space and the card keys. */
export const SKILL_KEYS: readonly string[] = ['Q', 'W'];

/** The Airstrike's Auto toggle key (ID-140), in both builds: clear of the skill, speed and card keys. */
export const AUTO_KEY = 'E';

/** The fight's skills as their buttons stand, left to right (ID-100): `SKILL_KEYS` follow it. */
export const skillSlots = (s: Pick<HordeState, 'skills'>): SkillId[] =>
  SKILL_IDS.filter((k) => s.skills.includes(k));

/** What each skill does, for the pick before a horde (ID-100). */
const SKILL_BLURB: Readonly<Record<SkillId, { does: string }>> = {
  airstrike: { does: `Bombs an area you pick, ${SKILLS.airstrike.count} bombs` },
};

/** One skill in the pick before a horde (ID-100). */
export interface SkillChoice {
  skill: SkillId;
  name: string;
  picked: boolean;
  /** Two are picked and this isn't one: drop one first. */
  full: boolean;
  /** "Stuns, 4 bursts": what it does, whatever is picked. */
  detail: string;
  /** "25s cooldown" */
  cooldown: string;
}

/**
 * The skill pick before a horde (ID-100): each skill, and a line on the pick. A skill picked
 * alone still works ×2 (`SQUAD_SKILLS.solo`), but no text claims it (ID-174, PM): one bomb
 * already fells most enemies, so the ×2 couldn't be seen.
 */
export interface SkillPick {
  options: SkillChoice[];
  /** How many may be picked, "No skill picked", or empty when the only skill is picked (ID-185). */
  note: string;
}

export function skillPicker(pick: readonly SkillId[]): SkillPick {
  const full = pick.length >= SQUAD_SKILLS.max;
  // With one skill to pick (Airstrike, ID-139) it is always alone: no "up to 2" or "alone".
  const only = SKILL_IDS.length === 1 ? SKILLS[SKILL_IDS[0]!].name : null;
  return {
    options: SKILL_IDS.map((skill) => {
      const picked = pick.includes(skill);
      const blurb = SKILL_BLURB[skill];
      return {
        skill,
        name: SKILLS[skill].name,
        picked,
        full: full && !picked,
        detail: blurb.does,
        cooldown: `${SKILLS[skill].cooldown}s cooldown`,
      };
    }),
    note:
      pick.length === 0
        ? only
          ? 'No skill picked'
          : `Pick up to ${SQUAD_SKILLS.max}`
        : only
          ? ''
          : `${pick.length} of ${SQUAD_SKILLS.max} picked`,
  };
}

/** The skills as the help texts tell them (ID-193): how many may be picked and their keys. */
export interface SkillHelp {
  /** "Pick the Airstrike before each horde…", or "Pick up to 2…" with more than one skill. */
  line: string;
  /** The keys in play, one per skill that can be picked: ["Q"] while there is one skill. */
  keys: readonly string[];
  /** "Key: Q.", or "Keys: Q W." */
  keyHint: string;
  /** There is one skill, so the texts say "skill", not "skills". */
  one: boolean;
}

export function skillHelp(
  ids: readonly SkillId[] = SKILL_IDS,
  max: number = SQUAD_SKILLS.max,
): SkillHelp {
  const keys = SKILL_KEYS.slice(0, Math.min(max, ids.length));
  const one = ids.length === 1;
  const line = one
    ? `Pick the ${SKILLS[ids[0]!].name} before each horde, then tap or click it when it is ready.`
    : keys.length === 1
      ? 'Pick 1 skill before each horde, then tap or click it when it is ready.'
      : `Pick up to ${keys.length} before each horde, then tap or click them when they are ready.`;
  const keyHint = `${keys.length === 1 ? 'Key' : 'Keys'}: ${keys.join(' ')}.`;
  return { line, keys, keyHint, one };
}

/** Amounts as "5 scrap, 10 wood" in material order, skipping zeros; "nothing" if all are. */
export function stockText(stock: Partial<Stock>): string {
  const parts = MATERIALS.filter((m) => (stock[m] ?? 0) > 0).map((m) => `${stock[m]} ${m}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

export function payoutText(s: HordeState): string {
  if (s.outcome === 'fighting') return '';
  const gas = s.outcome === 'won' ? `, ${GAS_PER_WIN} gas` : '';
  return `Payout: ${stockText(hordePayout(s))}${gas}`;
}

/** A wall-clock time as "14:05", in the player's locale. */
export const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const ENEMY_NAME: Readonly<Record<EnemyKind, string>> = {
  shambler: 'Shambler',
  runner: 'Runner',
  crawler: 'Crawler',
  swollen: 'Swollen',
  spewer: 'Spewer',
  brute: 'Brute',
  screamer: 'Screamer',
  horror: 'Mutated Horror',
};
/** Each boss skill's name (design §9, ID-024, ID-099). */
export const SKILL_NAME: Readonly<Record<BossSkill, string>> = {
  brood: 'Brood',
  charge: 'Charge',
  regen: 'Regen',
  roar: 'Roar',
  slab: 'Slab Throw',
  plates: 'Armour Plates',
};
/** A boss or mini-boss by its kind and skills: "Mutated Horror (Brood, Roar)", "Elite Brute (Roar)". */
export const bossName = (b: Pick<BossSpec, 'kind' | 'skills' | 'elite'>): string =>
  `${b.elite ? 'Elite ' : ''}${ENEMY_NAME[b.kind]} (${b.skills.map((k) => SKILL_NAME[k]).join(', ')})`;

/** The bosses and mini-boss that came this horde, in order, each with whether it died (ID-099). */
export function bossFates(
  s: Pick<HordeState, 'bosses' | 'enemies'>,
): { name: string; dead: boolean }[] {
  return s.bosses
    .filter((b) => b.id !== null)
    .map((b) => ({ name: bossName(b), dead: !s.enemies.some((e) => e.id === b.id) }));
}

/** A win's first line: "All 10 waves cleared · the Mutated Horror (Brood, Roar) is dead". */
const clearedLine = (s: HordeState): string =>
  [`All ${s.waveCount} waves cleared`, ...bossFates(s).map((f) => `the ${f.name} is dead`)].join(
    ' · ',
  );

/** A loss's boss lines: "The Mutated Horror (Brood, Roar) still stood", or "… died". */
const lostBossLines = (s: HordeState): string[] =>
  bossFates(s).map((f) => `${f.name}: ${f.dead ? 'dead' : 'still stood'}`);

/**
 * The base view's start button: "Start Horde 10 · Boss horde" for a boss horde. The Horde
 * panel's picker names no boss on its button.
 */
export const startLabel = (hordeNumber: number): string =>
  `Start Horde ${hordeNumber}${horrorAbility(hordeNumber) ? ' · Boss horde' : ''}`;

/**
 * A beaten horde's button (ID-098): "Replay Horde 5". The picker's buttons name no boss:
 * the select beside them says "Boss", and the start screen's pill "Boss horde".
 */
export const replayLabel = (hordeNumber: number): string => `Replay Horde ${hordeNumber}`;

/** A lost horde's button: "Retry Horde 5". */
export const retryLabel = (hordeNumber: number): string => `Retry Horde ${hordeNumber}`;

const thousands = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The word for a band, shown beside the colour so colour is never the only cue (ID-098). */
export const BAND_WORD: Readonly<Record<PowerBand, string>> = {
  ok: 'ok',
  close: 'close',
  short: 'short',
};

/**
 * The injury band in words (ID-155), beside its colour so colour is never the only cue. Since
 * ID-184 the words say the result ("Win cost: ~1 down"), not just few, some or heavy,
 * and the power band whose colour it borrows.
 */
export const INJURY_WORD: Readonly<Record<InjuryBand, string>> = {
  few: 'nobody down',
  some: '~1 down',
  heavy: '1+ down',
};
export const INJURY_TONE: Readonly<Record<InjuryBand, PowerBand>> = {
  few: 'ok',
  some: 'close',
  heavy: 'short',
};
/** What each injury band means, as measured (ID-155): the pill's tooltip. */
export const INJURY_TIP: Readonly<Record<InjuryBand, string>> = {
  few: 'If you win, usually nobody goes down',
  some: 'If you win, about 1 survivor goes down on average',
  heavy: 'If you win, 1 or more survivors go down on average',
};
/** The words before the injury band (ID-155; "Win cost:" since ID-184). */
export const INJURY_LEAD = 'Win cost:';

/** The meter's end, as a share of Recommended Power (ID-098): the tick sits at 1 / this. */
export const POWER_METER_END = 1.2;

/** Squad Power against a horde's Recommended Power (ID-098), as the screens show it. */
export interface PowerLine {
  power: number;
  rec: number;
  band: PowerBand;
  /** "Power 1,240 · rec 1,400" */
  text: string;
  /** The meter's fill, 0 to 1 of its length (Squad Power over `POWER_METER_END` × rec). */
  fill: number;
  /** Where the Recommended tick sits, 0 to 1 of the meter's length. */
  tick: number;
}

export function powerLine(power: number, rec: number): PowerLine {
  return {
    power,
    rec,
    band: powerBand(power, rec),
    text: `Power ${thousands(power)} · rec ${thousands(rec)}`,
    fill: rec > 0 ? Math.min(1, power / (POWER_METER_END * rec)) : 1,
    tick: 1 / POWER_METER_END,
  };
}

/** One entry of the horde picker (ID-098). */
export interface HordeChoice {
  horde: number;
  /** The next new horde, not yet beaten. */
  isNew: boolean;
  /** The option's text: "Horde 7 (new) · Boss", "Horde 5 · best to farm". */
  label: string;
  /** The screen's button once this is picked: "Start Horde 7", "Replay Horde 5". */
  button: string;
  power: PowerLine;
  /** How many survivors a win is likely to cost (ID-155): a band, read off the same power. */
  injury: InjuryBand;
  /** "Try Horde 8 to farm" when this horde is not at Squad Power's reach; null when it is. */
  hint: string | null;
  /** The start screen's title and chips for this horde, so they follow the pick. */
  start: { title: string; chips: Chip[] };
}

/** The horde picker (ID-098) between hordes: the next new horde first, then beaten ones, highest first. */
export interface HordePicker {
  options: HordeChoice[];
  /** The horde picked now. */
  value: number;
  /** The best horde to farm: the highest beaten one at 'ok', unless the new horde is; else null. */
  farm: number | null;
  /** Whether the title and chips follow the pick (the start screen's). */
  retitle: boolean;
}

/**
 * Hordes the picker lists (ID-098): the next new one and the highest beaten below it. A
 * replay far down pays half the XP and weaker guns, and a save's horde can be very high,
 * so the list stays short.
 */
export const PICKER_HORDES = 50;

/**
 * The picker for `game`, `picked` selected (the next new horde when it isn't listed): the
 * next new horde first, labelled new, then the beaten ones, highest first, `PICKER_HORDES`
 * in all. `retry` is the horde just lost, whose button says "Retry". Advice only: every
 * listed horde is pickable.
 */
export function hordePicker(
  game: Pick<GameState, 'roster' | 'hordeNumber' | 'slots'>,
  picked: number = game.hordeNumber,
  retry: number | null = null,
  retitle = false,
): HordePicker {
  const squad = squadPower(game);
  const goal = goalChip(game);
  const options: HordeChoice[] = [];
  const lowest = Math.max(1, game.hordeNumber - PICKER_HORDES + 1);
  // The best place to farm (ID-098): the highest beaten horde the squad already holds.
  let farm: number | null = null;
  if (powerBand(squad, recommendedPower(game.hordeNumber)) !== 'ok') {
    for (let n = game.hordeNumber - 1; n >= lowest; n--) {
      if (powerBand(squad, recommendedPower(n)) === 'ok') {
        farm = n;
        break;
      }
    }
  }
  for (let n = game.hordeNumber; n >= lowest; n--) {
    const isNew = n === game.hordeNumber;
    const power = powerLine(squad, recommendedPower(n));
    const boss = horrorAbility(n) !== null;
    options.push({
      horde: n,
      isNew,
      // Short, so the select never cuts it (ID-196): the pick's readiness is the line
      // under it (`power`), said once.
      label: [
        `Horde ${n}${isNew ? ' (new)' : ''}`,
        ...(boss ? ['Boss'] : []),
        ...(n === farm ? ['best to farm'] : []),
      ].join(' · '),
      button: n === retry ? retryLabel(n) : isNew ? `Start Horde ${n}` : replayLabel(n),
      power,
      injury: injuryBand(squad, power.rec),
      hint:
        power.band === 'ok'
          ? null
          : farm !== null
            ? `Try Horde ${farm} to farm`
            : 'No beaten horde is at your power yet',
      start: {
        // The chips say "Boss horde" and "Replay", once.
        title: `Horde ${n}`,
        // Endless (ID-127) leads, whichever horde is picked.
        chips: [
          ...(goal ? [goal.chip] : []),
          ...(boss ? [{ text: 'Boss horde', tone: 'boss' as const }] : []),
          ...(isNew ? [] : [{ text: 'Replay', tone: 'ok' as const }]),
          { text: `${waveCount(n)} waves`, tone: 'ok' as const },
          { text: `Squad ${squadOf(game).length}/${squadCap(game)}`, tone: 'ok' as const },
        ],
      },
    });
  }
  const open = Number.isInteger(picked) && picked >= lowest && picked <= game.hordeNumber;
  return { options, value: open ? picked : game.hordeNumber, farm, retitle };
}

/**
 * One boss bar per boss or mini-boss on the field, in the horde's order (ID-099): its name
 * and skills, the skill it is winding up ("Roar!"), and its HP.
 */
export function bossBars(s: HordeState): BossBar[] {
  return s.enemies
    .filter((e) => e.horror && s.bosses[e.horror.boss])
    .sort((a, b) => a.horror!.boss - b.horror!.boss)
    .map((e) => {
      const hp = wholeLeft(e.hp);
      const name = bossName(s.bosses[e.horror!.boss]!);
      const skill = bossCue(s, e);
      const cue = skill ? `${SKILL_NAME[skill]}!` : null;
      const hpText = `${hp.toLocaleString('en-US')}/${e.maxHp.toLocaleString('en-US')}`;
      return {
        name,
        cue,
        winding: skill !== null && windingUp(s, e) === skill,
        hpText,
        label: [name, ...(cue ? [cue] : []), hpText].join(' · '),
        hp,
        maxHp: e.maxHp,
      };
    });
}

/** One boss bar: its name and skills, the skill it is using (a tag), its HP; `label` says it all. */
export interface BossBar {
  name: string;
  cue: string | null;
  /** The cue is a wind-up (about to happen), not an effect under way. */
  winding: boolean;
  hpText: string;
  label: string;
  hp: number;
  maxHp: number;
}

/**
 * How long a boss bar keeps naming a skill once it went off, in fight s (ID-099): through
 * its effect, so a glance at 3× still catches it. A Roar while its enemies are fast, a
 * slab until it lands and its dust settles, a charge while it runs, a brood a moment.
 */
const CUE_HOLD: Readonly<Partial<Record<BossSkill, number>>> = {
  roar: BOSS_SKILL.roar.time,
  slab: 2 * BOSS_SKILL.slab.flight,
  charge: HORROR.charge.time,
  brood: 1,
};

/** The skill a boss bar names now: the one winding up, else the latest still in effect. */
export function bossCue(s: Pick<HordeState, 'time'>, e: Enemy): BossSkill | null {
  const wind = windingUp(s, e);
  if (wind || !e.horror) return wind;
  let best: BossSkill | null = null;
  for (const k of e.horror.skills) {
    const at = e.horror.fired[k];
    if (at === undefined || s.time - at >= (CUE_HOLD[k] ?? 0)) continue;
    if (best === null || at > e.horror.fired[best]!) best = k;
  }
  return best;
}

/** How long "Swarm!" shows once a swarm wave's enemies start coming (ID-099), in s. */
export const SWARM_CUE = 3;
export interface SwarmCue {
  /** `'incoming'` in the break before the wave, `'hit'` once its enemies start coming. */
  phase: 'incoming' | 'hit';
  title: string;
  /** The whole seconds left to the wave while it is incoming, else ''. */
  count: string;
}
/**
 * The swarm banner (ID-121): through the break before a swarm wave, "Swarm incoming" with
 * the seconds to go; then "Swarm!" for the wave's first `SWARM_CUE` s; else none.
 */
export function swarmCue(
  s: Pick<HordeState, 'swarm' | 'outcome' | 'time' | 'breakUntil'>,
): SwarmCue | null {
  if (!s.swarm || s.outcome !== 'fighting') return null;
  if (s.time < s.breakUntil) {
    const count = String(Math.max(1, Math.ceil(s.breakUntil - s.time - 1e-9)));
    return { phase: 'incoming', title: 'Swarm incoming', count };
  }
  return s.time < s.breakUntil + SWARM_CUE ? { phase: 'hit', title: 'Swarm!', count: '' } : null;
}
/** How long the red edge glow flashes once a swarm wave's enemies start coming (ID-175), in s. */
export const SWARM_EDGE = 8;
/** Whether the swarm's red edge glow shows (ID-175): its wave's first `SWARM_EDGE` s, timed apart from the banner. */
export function swarmEdge(
  s: Pick<HordeState, 'swarm' | 'outcome' | 'time' | 'breakUntil'>,
): boolean {
  return (
    s.swarm &&
    s.outcome === 'fighting' &&
    s.time >= s.breakUntil &&
    s.time < s.breakUntil + SWARM_EDGE
  );
}
/**
 * The swarm marker (ID-121): from the break before a swarm wave until it ends, that is
 * until the last of its enemies is down. Horde-only waves overlap, so the counter can move
 * on to the next wave while a swarm's enemies still stand: the marker stays for them.
 */
export function swarmMarker(
  s: Pick<HordeState, 'swarm' | 'outcome' | 'harder' | 'hordeNumber' | 'enemies'>,
): boolean {
  if (s.outcome !== 'fighting') return false;
  if (s.swarm) return true;
  if (s.harder !== true) return false;
  return s.enemies.some(
    (e) => e.hp > 0 && e.wave !== undefined && swarmWave(s.hordeNumber, e.wave),
  );
}
const THROUGH: Readonly<Record<Breach['through'], string>> = {
  wall: 'broken wall',
  gate: 'broken gate',
  gap: 'open gap',
  climbed: 'climbed over',
};

export interface ResultScreen {
  title: string;
  lines: string[];
  button: string;
  /** A horde-only screen (ID-066): plain names, and only the stats a gun survivor uses. */
  squad?: true;
  /**
   * The horde-only panel laid out (ID-067): chips, loot, one card per survivor (a win: only
   * who levelled up, ID-134); else `lines`.
   */
  debrief?: Debrief;
  /** The horde picker beside the button (ID-098); the button's label follows the pick. */
  picker?: HordePicker;
  /** The skill pick for the next horde (ID-100), horde-only. */
  skills?: SkillPick;
  /**
   * Camp-level picks and the offers to pick from before "Back to build" (design §11),
   * with the room left after the horde for a survivor to join.
   */
  camp: CampScreen;
}

export type CampScreen = Pick<Camp, 'picks' | 'offers'> & { room: Room };

/** A survivor (design §10) as "Ava · level 3 · Military Rifle (+10% damage)". */
export function survivorText(s: Survivor): string {
  const affixes = affixLines(s.weapon, true);
  return [
    s.name,
    `level ${levelOf(s.xp).level}`,
    heldName(s.weapon) + (affixes.length > 0 ? ` (${affixes.join(', ')})` : ''),
  ].join(' · ');
}

/** "Bob +25 XP · level 2 (10/50) · level up!". */
function xpLine(g: ReturnType<typeof levelGains>[number], tag: string): string {
  const up = g.levels > 0 ? ' · level up!' : '';
  return `${tag} +${g.xp} XP · level ${g.level} (${g.into}/${g.next})${up}`;
}

/** "Jack · injured by a Shambler · back at 14:05", for a horde that ended at `now`. */
function injuryLine(game: GameState, s: HordeState, i: Injury, now: number): string {
  const by = i.by ? ` by ${i.by === 'horror' ? 'the' : 'a'} ${ENEMY_NAME[i.by]}` : '';
  const back = injuredUntil(s, i, now, recoveryMs(game.camp));
  return `${i.defender.name} · injured${by} · back at ${clockTime(back)}`;
}

/** "Camp +12 XP · level 2 (5/60)" for a win, with "· level up!" when it brings one. */
function campLine(game: GameState, s: HordeState): string {
  const gain = campXpFor(s);
  const was = campLevelOf(game.camp.xp).level;
  const now = campLevelOf(campXpAfter(game, s));
  const up = now.level > was ? ' · level up!' : '';
  return `Camp +${gain} XP · level ${now.level} (${now.into}/${now.next})${up}`;
}

/** A camp-level pick as "Scavenging 2/5: +5% horde cash per kill", its rank after taking it. */
export function campPickText(camp: Pick<Camp, 'picks'>, id: CampPickId): string {
  const { name, text } = CAMP_PICKS[id];
  return `${name} ${camp.picks[id] + 1}/${CAMP_PICK_RANKS}: ${text}`;
}

/** The repair bill for the damage that carries over, against the stock after the payout. */
function repairLine(game: GameState, s: HordeState): string {
  const bill = repairAllCost(baseAfter(game.base, s), repairOff(game.camp));
  if (MATERIALS.every((m) => bill[m] === 0)) return 'No repairs needed';
  const payout = hordePayout(s);
  payout.scrap += hordeDrop(game, s)?.scrap ?? 0;
  const find = hordeFind(s);
  if (find) payout[find.material] += find.amount;
  const short: Partial<Stock> = {};
  for (const m of MATERIALS) short[m] = Math.max(0, bill[m] - game.stock[m] - payout[m]);
  const cover = MATERIALS.some((m) => short[m]! > 0) ? `short by ${stockText(short)}` : 'covered';
  return `Repair bill: ${stockText(bill)} · ${cover}`;
}

/** A win's material find (design §4), as "Found: 4 parts"; none without one. */
function findLines(s: HordeState): string[] {
  const find = hordeFind(s);
  return find ? [`Found: ${stockText({ [find.material]: find.amount })}`] : [];
}

/**
 * A boss win's reward (design §5, ID-035): the perk it unlocks, or its Genes once every
 * perk is owned; none otherwise. `game` is run to `now` first, as `finishHorde` does.
 */
function bossLines(game: GameState, s: HordeState, now: number): string[] {
  const reward = hordeBossReward(advanceResearch(game, now), s);
  if (!reward) return [];
  return 'perk' in reward
    ? [`Boss reward: ${PERKS[reward.perk].name} perk unlocked`]
    : [`Boss reward: ${reward.genes} Genes (every perk owned)`];
}

/** A win's weapon drop (design §6 Gear): its name, then one line per affix; none without a drop. */
function dropLines(game: GameState, s: HordeState): string[] {
  const drop = hordeDrop(game, s);
  if (!drop) return [];
  const found = drop.kept
    ? `Found: ${heldName(drop.weapon)}`
    : `Found: ${heldName(drop.weapon)} · armoury full, salvaged for ${drop.scrap} Scrap`;
  return [found, ...affixLines(drop.weapon)];
}

/**
 * The victory or defeat screen (design §2) for horde `s`, which ended at `now`: why
 * it was won or lost, the payout, any materials or weapon found, XP, the injured and when
 * they're back, and the repair bill. `game` is the game the horde was fought from,
 * before `finishHorde`.
 */
export function resultScreen(game: GameState, s: HordeState, now: number): ResultScreen {
  if (s.outcome === 'fighting') throw new RangeError('resultScreen: the horde is still on');
  const injured = s.injured.map((i) => injuryLine(game, s, i, now));
  // Offers left from before (normally none: each is picked on its result screen), then this win's.
  // A weapon the win drops takes armoury room before any survivor can.
  const free = roomOf(game);
  const room = hordeDrop(game, s)?.kept ? { ...free, weapons: free.weapons - 1 } : free;
  const camp: CampScreen = {
    picks: game.camp.picks,
    offers: [...game.camp.offers, ...hordeCampOffers(game, s)],
    room,
  };
  if (s.outcome === 'won') {
    const gains = levelGains(game, s);
    const lines: string[] = [];
    for (const g of gains) lines.push(xpLine(g, g.name));
    return {
      title: `Horde ${s.hordeNumber} held`,
      lines: [
        clearedLine(s),
        payoutText(s),
        ...bossLines(game, s, now),
        ...findLines(s),
        ...dropLines(game, s),
        ...lines,
        campLine(game, s),
        ...injured,
        repairLine(game, s),
      ],
      button: 'Back to build',
      camp,
    };
  }
  // Outside in: the outer layers have the higher columns. The innermost is where they got in.
  const path = [...s.breaches].sort((a, b) => b.column - a.column);
  const inner = path.at(-1);
  const where = inner
    ? `Broke in at ${slotName(inner.column, inner.row)}, in wave ${inner.wave} of ${s.waveCount}`
    : 'Broke in';
  const why = `${where} · nobody left to hold them for ${FALL_WARNING} s`;
  return {
    title: 'The camp fell',
    lines: [
      why,
      ...lostBossLines(s),
      ...path.map((b) => `Layer ${b.column + 1} · row ${b.row + 1} · ${THROUGH[b.through]}`),
      payoutText(s),
      'No XP on a loss',
      ...injured,
      repairLine(game, s),
    ],
    button: `Back to build · retry Horde ${s.hordeNumber}`,
    camp,
  };
}

/** The camp screen of a horde-only result: no camp-level offers ever come. */
const noCamp = (game: GameState): CampScreen => ({
  picks: game.camp.picks,
  offers: [],
  room: roomOf(game),
});

/** "Ava +30 XP · level 2 · 5/50 XP to level 3 · level up!". */
function squadXpLine(g: ReturnType<typeof levelGains>[number]): string {
  const up = g.levels > 0 ? ' · level up!' : '';
  return `${g.name} +${g.xp} XP · level ${g.level} · ${g.into}/${g.next} XP to level ${g.level + 1}${up}`;
}

/**
 * "Bench +12 XP each": the share bench survivors earn (ID-206), worded like the squad's chip
 * ("each" for more than one, a range when they differ); null with none benched or no XP.
 */
export const benchXpText = (bench: readonly { xp: number }[]): string | null => {
  const text = xpChipText(bench.filter((b) => b.xp > 0));
  return text === null ? null : `Bench ${text}`;
};

/** "Lv 12 Military Rifle (+7% damage)": a gun's level, name and affixes (ID-098). */
export const levelLabel = (h: Held): string =>
  isOwned(h) && h.affixes.length
    ? `${levelName(h)} (${affixLines(h, true).join(', ')})`
    : levelName(h);

/**
 * A dmg/s figure that says whose it is (ID-166): "17.2 DPS", the gun's own, or
 * "46.1 DPS with Ivan", in a survivor's hands (their level and profession counted).
 */
export const gunDpsText = (dps: number): string => `${dps.toFixed(1)} DPS`;
/** "DPS with Ivan": what a survivor's figures are, on their gun picker (ID-166). */
export const dpsCaption = (name: string): string => `DPS with ${name}`;
export const dpsWith = (dps: number, name: string): string =>
  `${dps.toFixed(1)} ${dpsCaption(name)}`;

/** "Lv 12 Military Rifle (+7% damage) · 17.2 DPS": a gun's name and affixes, and how hard it hits over time. */
export const gunLabel = (h: Held): string => `${levelLabel(h)} · ${gunDpsText(gunPower(h))}`;

/**
 * A horde-only win's drop lines (ID-067, ID-122), for the stash `game` had before it: the
 * drop, then each bonus gun, and where it went; with the stash full, the weakest weapon
 * thrown away for it.
 */
export function squadDropLines(
  game: Pick<GameState, 'armoury' | 'slots'>,
  drop: SquadDrop,
): string[] {
  const lines: string[] = [];
  const cap = stashCap(game);
  let count = game.armoury.length;
  const thrown = [...drop.thrown];
  for (const [i, w] of [drop.weapon, ...drop.bonus].entries()) {
    const got =
      i === 0
        ? `Weapon drop (${DROP_KIND[drop.kind]}): ${gunLabel(w)}`
        : `Bonus gun: ${gunLabel(w)}`;
    // As `stashWith` puts them in: under the cap it goes in, else one is thrown away.
    if (count < cap) {
      count += 1;
      lines.push(`${got} · into the stash (${count}/${cap})`);
      continue;
    }
    const out = thrown.shift()!;
    lines.push(
      ...(out === w
        ? [
            got,
            `Stash full (${cap}/${cap}): the new ${levelName(w)} was no better than any gun in it, so it was thrown away`,
          ]
        : [
            `${got} · into the stash (${count}/${cap})`,
            `Stash full: the weakest, the ${levelLabel(out)}, was thrown away`,
          ]),
    );
  }
  return [...lines, ...(drop.noUpgrades ? [farmText(drop.farmFrom)] : [])];
}

/** A small labelled pill in the debrief's header: its text and colour. */
export interface Chip {
  text: string;
  tone: 'ok' | 'boss' | 'warn';
  /** A hover hint with the chip's detail (ID-179: what the Scrap is made of). */
  title?: string;
  /** The chip is a button that opens the result's details (ID-186), where its sentence is. */
  details?: true;
}

/** A win's weapons as the panel's Weapons row (ID-067, ID-196). */
export interface DropTile {
  /** Every gun the win dropped, the drop first, then the bonus guns (ID-122). */
  guns: DropGun[];
  /**
   * "Stash 15/40" after the win's guns are in (bonus ones too), with " · thrown away"
   * when the drop itself went. The panel's one stash count, in a gun's details.
   */
  stash: string;
  /**
   * "Thrown away: Rusty Pistol" (every stash weapon thrown for this win's guns, comma
   * separated), `DROP_LOST_NOTE` when the drop itself went into a stash of better guns
   * ("Replaced by the stronger bonus gun …" when a bonus gun of the same win pushed it
   * out, ID-122), or null.
   */
  thrown: string | null;
  /** Where to go for upgrades when no gun this horde drops would be an upgrade (`squadGain`); else null. */
  farmNote: string | null;
}

/**
 * One survivor in the panel's Squad section (ID-196): their avatar and name, no guns and no
 * stats. The level is only read out with the name.
 */
export interface SquadCard {
  id: string;
  name: string;
  level: number;
  /** Their avatar, as the Roster shows it. */
  art: ArtId;
  /** Levelled up in this horde. */
  levelUp: boolean;
  /** Just accepted into the squad on this screen (ID-157): marked "New". */
  fresh?: true;
}

/** The horde-only panel laid out (ID-067), for the start, win and loss screens. */
export interface Debrief {
  kind: 'start' | 'won' | 'lost';
  chips: Chip[];
  /** A loss: where they got in, and any horror still standing. */
  callout: { head: string; sub: string | null } | null;
  /** A plain line under the header (the start screen's goal, a loss's retry). */
  note: string | null;
  /**
   * A win's sentences (ID-186: the boss reward, who was patched up, who rests, who Auto
   * moved), one each, shown only with the details open; its chips say them short.
   */
  notes?: string[];
  drop: DropTile | null;
  cards: SquadCard[];
  /** The line shown in place of no cards (a win with no level-up, ID-134), else null. */
  empty: string | null;
  /**
   * The start screen's link to the Roster to pick the squad (ID-147), and the bench's line
   * under it (`benchLine`); absent elsewhere.
   */
  roster?: { label: string; line: string | null };
  /**
   * The offer line under the squad (ID-150, ID-182, ID-196), on every win and on a start
   * screen with someone still asking: `showJoin` fills it from who is asking now, and the
   * answers given stay on it.
   */
  join?: true;
}

/** A card for `d` off a win, or with no gain. */
const plainCard = (d: RosterDefender): SquadCard => ({
  id: d.id,
  name: d.name,
  level: levelOf(d.xp).level,
  art: avatarOf(d),
  levelUp: false,
});

/** The card for survivor `id`, just accepted into the squad (ID-157); null when not in it. */
export function joinedCard(game: Pick<GameState, 'roster'>, id: string): SquadCard | null {
  const d = squadOf(game).find((r) => r.id === id);
  return d ? { ...plainCard(d), fresh: true } : null;
}

/** The "New" badge's text on a card just accepted (ID-157). */
export const NEW_BADGE = 'New';

/** The loot tile for `drop`, against the stash `game` had before it. */
export function dropTile(game: Pick<GameState, 'armoury' | 'slots'>, drop: SquadDrop): DropTile {
  const { weapon, bonus, thrown } = drop;
  const lost = thrown.includes(weapon);
  const count = game.armoury.length + 1 + bonus.length - thrown.length;
  // Stash weapons thrown for room, not this win's own guns.
  const old = thrown.filter((w) => w !== weapon && !bonus.includes(w));
  // Which gun's going in threw the drop away (as `stashWith` puts them in): the drop's own
  // (the stash already full of better guns), or a stronger bonus gun's after it.
  let by: OwnedWeapon | null = null;
  let room = stashCap(game) - game.armoury.length;
  let next = 0;
  for (const w of [weapon, ...bonus]) {
    if (room > 0) {
      room -= 1;
      continue;
    }
    if (thrown[next++] === weapon) by = w;
  }
  return {
    farmNote: drop.noUpgrades ? farmText(drop.farmFrom) : null,
    stash: `Stash ${count}/${stashCap(game)}${lost ? ' · thrown away' : ''}`,
    guns: [weapon, ...bonus].map((w, i) => ({
      rarity: w.rarity,
      short: `Lv ${gunLevel(w)} ${WEAPONS[w.base].name}`,
      power: gunDpsText(gunPower(w)),
      icon: GUN_ICON[w.base as GunId],
      lost: thrown.includes(w),
      lines: [
        `${i === 0 ? DROP_KIND[drop.kind] : 'Bonus gun'} · ${RARITIES[w.rarity].name}`,
        roleLine(w.base) ?? '',
        affixLines(w).join(', '),
      ].filter((t) => t !== ''),
    })),
    // "No better", not "weaker": a tie throws the drop away too.
    thrown:
      [
        ...(lost
          ? [
              by && by !== weapon
                ? `Replaced by the stronger bonus gun ${levelName(by)}`
                : DROP_LOST_NOTE,
            ]
          : []),
        ...(old.length > 0 ? [`Thrown away: ${old.map((w) => levelName(w)).join(', ')}`] : []),
        // What the result chip's Scrap is made of (ID-179): the salvage shows by the guns.
        ...(thrown.length > 0
          ? [
              `salvaged for ${thousands(thrown.reduce((n, w) => n + RARITIES[w.rarity].salvage, 0))} Scrap`,
            ]
          : []),
      ].join(' · ') || null,
  };
}

/** One gun a win dropped, as the panel's Weapons row shows it (ID-196). */
export interface DropGun {
  rarity: Rarity;
  /** "Lv 2 Carbine" */
  short: string;
  /** "16.5 DPS" */
  power: string;
  icon: ArtId;
  /** Thrown away: the stash full of better guns. */
  lost: boolean;
  /** Its details, shown on a click: kind and rarity, role and trait, affixes. */
  lines: string[];
}

/** What a drop tile says about its kind (ID-098). */
export const DROP_KIND: Readonly<Record<SquadDrop['kind'], string>> = {
  first: 'First clear',
  replay: 'Replay',
  guaranteed: 'Guaranteed upgrade',
};

/** A replay where nothing the horde drops could be an upgrade (ID-098, ID-152): where to go. */
export const farmText = (farmFrom: number | null): string =>
  farmFrom === null ? 'Beat a new horde for upgrades' : `Farm Horde ${farmFrom}+ for upgrades`;

/** Under a drop the full stash threw away itself (ID-073). */
export const DROP_LOST_NOTE = 'No better than any gun in the stash';

/** A loss's chip and line (ID-073): nothing drops after a loss. */
export const SQUAD_NO_DROP = 'No weapon drop on a loss';

/** How a horde-only horde is lost (ID-066, design §2), for the start screen and Help. */
export const SQUAD_LOSS_RULE = 'You lose if they break through and every survivor is down.';

/** Why the slot buttons are greyed in a fight (ID-179). */
export const BUY_WAIT = 'Buy slots between hordes';

/** Which slots a purchase gives (ID-179). */
export type SlotKind = 'squad' | 'stash';

/** A buy button (ID-179): its text, whether it is greyed, and its tooltip. */
export interface SlotOffer {
  text: string;
  disabled: boolean;
  title: string;
  cost: number;
}

/**
 * The button that buys the next squad slot or stash slots (ID-179): "+1 slot · 500 Scrap";
 * with too little Scrap it is greyed and shows progress, "+1 slot · 120/1,200 Scrap"; greyed with
 * `BUY_WAIT` in a fight (`canBuy` false). Null once every slot is bought.
 */
export function slotOffer(
  game: Pick<GameState, 'slots' | 'stock'>,
  kind: SlotKind,
  canBuy: boolean,
): SlotOffer | null {
  const cost = kind === 'squad' ? nextSquadSlotCost(game) : nextStashSlotCost(game);
  if (cost === null) return null;
  const what = kind === 'squad' ? '+1 slot' : `+${STASH_SLOT.add} slots`;
  const short = game.stock.scrap < cost;
  const price = short
    ? `${thousands(game.stock.scrap)}/${thousands(cost)} Scrap`
    : `${thousands(cost)} Scrap`;
  return {
    text: `${what} · ${price}`,
    disabled: !canBuy || short,
    title: !canBuy ? BUY_WAIT : short ? `Needs ${thousands(cost)} Scrap` : '',
    cost,
  };
}

/** A gun's Upgrade button (ID-208): its text, whether it is greyed, its tooltip and its price. */
export interface UpgradeOffer {
  /** The gun it upgrades. */
  uid: string;
  /** The label: short enough for the details' dock ("Upgrade +2 · 60 Scrap"). */
  text: string;
  /** The label in full words ("Upgrade to +2 · 60 Scrap"), for the tooltip and screen readers. */
  full: string;
  disabled: boolean;
  title: string;
  /** The Scrap the next step costs; null at the top step. */
  cost: number | null;
}

/** A non-breaking space: keeps a number and its unit on one line when a label wraps. */
const NBSP = String.fromCharCode(160);

/**
 * The button that raises gun `w` one step (ID-208): "Upgrade +2 · 60 Scrap"; with too little
 * Scrap it is greyed and shows progress, "Upgrade +2 · 20/60 Scrap", its tooltip the full
 * wording and the shortfall; at the top step "Maxed at +5", greyed. The cost's space before
 * "Scrap" doesn't break. It works in a fight too, so there is no `canBuy`.
 */
export function upgradeOffer(w: OwnedWeapon, scrap: number): UpgradeOffer {
  const cost = upgradeCost(w);
  if (cost === null) {
    return {
      uid: w.uid,
      text: `Maxed at +${GUN_UPGRADE.max}`,
      full: `Maxed at +${GUN_UPGRADE.max}`,
      disabled: true,
      title: `Already at +${GUN_UPGRADE.max}`,
      cost,
    };
  }
  const short = scrap < cost;
  const step = gunStep(w) + 1;
  const price = `${thousands(cost)} Scrap`;
  const full = `Upgrade to +${step} · ${price}`;
  // The button's cost keeps "Scrap" with its number when the label wraps (ID-208).
  const tight = `${thousands(cost)}${NBSP}Scrap`;
  return {
    uid: w.uid,
    text: short ? `Upgrade +${step} · ${thousands(scrap)}/${tight}` : `Upgrade +${step} · ${tight}`,
    full,
    disabled: short,
    title: short ? `${full}. Needs ${price} (${thousands(cost - scrap)} short)` : full,
    cost,
  };
}

/** What an upgrade says once made (ID-208): `w` is the upgraded gun. */
export const upgradeText = (w: OwnedWeapon, cost: number, left: number): string =>
  `Upgraded ${levelName(w)} · ${thousands(cost)} Scrap spent, ${thousands(left)} left.`;

/** The confirm before a purchase (ID-179). */
export const buyQuestion = (kind: SlotKind, cost: number, scrap: number): string =>
  `Buy ${kind === 'squad' ? '1 squad slot' : `${STASH_SLOT.add} stash slots`} for ${thousands(cost)} Scrap? You have ${thousands(scrap)}.`;

/** What a purchase says once made (ID-179). */
export const buyText = (kind: SlotKind, cost: number, left: number): string =>
  `Bought ${kind === 'squad' ? '1 squad slot' : `${STASH_SLOT.add} stash slots`} · ${thousands(cost)} Scrap spent, ${thousands(left)} left.`;

/** The start screen's link to the Roster, where the squad is picked (ID-147). */
export const CHANGE_SQUAD = 'Change squad';

/**
 * The bench as the start screen sums it up (ID-147): "Bench 3 · 1 resting · 2 open slots:
 * pick on the Roster", each part only when it applies; null with nobody on the bench.
 */
export function benchLine(game: Pick<GameState, 'roster' | 'reserve' | 'slots'>): string | null {
  if (game.reserve.length === 0) return null;
  const resting = game.reserve.filter((d) => !isFit(d)).length;
  const fit = game.reserve.length - resting;
  const open = Math.min(fit, squadCap(game) - squadOf(game).length);
  return [
    `Bench ${game.reserve.length}`,
    ...(resting > 0 ? [`${resting} resting`] : []),
    ...(open > 0 ? [`${open} open ${open === 1 ? 'slot' : 'slots'}: pick on the Roster`] : []),
  ].join(' · ');
}

/**
 * Who Paramedics patched up after a win (ID-155): "Patched up by Paramedics, back next
 * horde: Bob (50% HP), Ava (55% HP)."; null for none.
 */
export function patchNote(patched: readonly { name: string; startHp: number }[]): string | null {
  if (patched.length === 0) return null;
  const who = patched.map((p) => `${p.name} (${Math.round(p.startHp * 100)}% HP)`);
  return `Patched up by Paramedics, back next horde: ${who.join(', ')}.`;
}

/**
 * Who rests after a win (ID-147, ID-155): "Resting: Bob 1 horde, Ava 1 horde. Fill their slots
 * on the Roster." (the last part only with someone fit on the bench to fill them); null for
 * none. With a Paramedic in camp (`medics`) it says the patch-up roll failed: "Resting (not
 * patched up): …".
 */
export function restNote(
  rests: readonly { name: string; rest: number }[],
  benchFit: boolean,
  medics = false,
): string | null {
  if (rests.length === 0) return null;
  const who = rests.map((r) => `${r.name} ${restLabel(r.rest).slice('Resting: '.length)}`);
  const lead = medics ? 'Resting (not patched up)' : 'Resting';
  return `${lead}: ${who.join(', ')}.${benchFit ? ' Fill their slots on the Roster.' : ''}`;
}

/**
 * Who a squad pick moved (ID-154): "in Ava, Bob · out Cy"; null when nobody moved. The
 * Roster's status line and the result screen's Auto note both say it this way.
 */
export function movesText(moves: { in: readonly string[]; out: readonly string[] }): string | null {
  const parts = [
    ...(moves.in.length > 0 ? [`in ${moves.in.join(', ')}`] : []),
    ...(moves.out.length > 0 ? [`out ${moves.out.join(', ')}`] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "Best gun for everyone" (ID-108): the Roster's, the result screen's and the Inventory's button. */
export const BEST_GUNS_LEAD = 'Best gun';
export const BEST_GUNS_TAIL = ' for everyone';
export const BEST_GUNS = `${BEST_GUNS_LEAD}${BEST_GUNS_TAIL}`;
export const BEST_GUNS_NONE = 'Everyone already holds the best gun they can get.';

/** The most moves `bestGunsLine` names (ID-188): a full camp's would fill a phone's toast. */
export const BEST_GUNS_SHOWN = 4;

/**
 * What "Best gun for everyone" did: each survivor's new gun, a bench survivor's marked
 * "(bench)" (ID-188), or that nobody changed. Past `BEST_GUNS_SHOWN` moves the rest are a
 * count, with how many of them are on the bench; the Roster shows each survivor's gun.
 */
export function bestGunsLine(moves: readonly { name: string; to: Held; bench?: true }[]): string {
  if (moves.length === 0) return BEST_GUNS_NONE;
  const line = (m: (typeof moves)[number]): string =>
    `${m.name}${m.bench ? ' (bench)' : ''} → ${heldName(m.to)}`;
  const shown = moves.slice(0, BEST_GUNS_SHOWN).map(line);
  const rest = moves.slice(BEST_GUNS_SHOWN);
  if (rest.length > 0) {
    const bench = rest.filter((m) => m.bench).length;
    shown.push(`${rest.length} more${bench > 0 ? ` (${bench} on the bench)` : ''}`);
  }
  return `Equipped: ${shown.join(' · ')}`;
}

/**
 * Rounds of `bestGuns` as one (ID-154 Auto between them): each survivor's first gun to
 * their last, in the order they first changed; one who ended on the gun they started with
 * is left out.
 */
export function joinMoves(first: readonly GunMove[], then: readonly GunMove[]): GunMove[] {
  const key = (h: Held): string => (typeof h === 'object' ? `uid:${h.uid}` : h);
  const byId = new Map<string, GunMove>();
  for (const m of [...first, ...then]) {
    const had = byId.get(m.id);
    byId.set(m.id, had ? { ...had, to: m.to } : m);
  }
  return [...byId.values()].filter((m) => key(m.from) !== key(m.to));
}

/**
 * The moves marked by where each survivor ends (ID-188): "(bench)" for anyone not in
 * `squadIds`, none for the squad, the squad's first. Auto (ID-154) may move a survivor
 * between the squad and the bench between rounds, so a round's own mark can be stale.
 */
export function markBench(moves: readonly GunMove[], squadIds: ReadonlySet<string>): GunMove[] {
  const all = moves.map((m): GunMove => {
    const plain: GunMove = { id: m.id, name: m.name, from: m.from, to: m.to };
    return squadIds.has(m.id) ? plain : { ...plain, bench: true };
  });
  return [...all.filter((m) => !m.bench), ...all.filter((m) => m.bench)];
}

/**
 * In place of a win's cards when nobody levelled up in it (ID-134); it points at the Roster,
 * the only place left on this screen to equip the gun the win dropped.
 */
export const SQUAD_NO_LEVEL_UPS = 'No level-ups this horde. Change guns in the Roster.';

/**
 * Endless on the start screen (ID-127), past the finale: the best horde reached and the next
 * one to hold. Null in the campaign: the radio is off this panel (ID-196).
 */
export function goalChip(
  game: Pick<GameState, 'hordeNumber'>,
): { chip: Chip; note: string } | null {
  if (!isEndless(game)) return null;
  const best = highestBeaten(game);
  return {
    chip: { text: `Endless · best ${best}`, tone: 'warn' },
    note: `Evacuation called. Hold Horde ${best + 1} for a new best.`,
  };
}

/**
 * The horde-only screen before a horde (ID-066): who fights it, its start button, and the
 * horde picker (ID-098) with `picked` selected (the next new horde by default).
 */
export function squadStart(game: GameState, picked: number = game.hordeNumber): ResultScreen {
  const squad = squadOf(game);
  const picker = hordePicker(game, picked, null, true);
  const now = picker.options.find((o) => o.horde === picker.value)!;
  const goal = goalChip(game);
  const bench = benchLine(game);
  // Still asking after a reload on the result screen (ID-150): the offer waits here.
  const asking = joiningOf(game);
  return {
    title: now.start.title,
    lines: [
      `Squad ${squad.length}/${squadCap(game)}: ${squad
        .map((d) => `${d.name} (level ${levelOf(d.xp).level})`)
        .join(', ')}`,
      ...(bench ? [bench] : []),
      ...asking.map(askLine),
      `${waveCount(now.horde)} waves. Hold the wall. ${SQUAD_LOSS_RULE}`,
      ...(goal ? [goal.note] : []),
    ],
    button: now.button,
    squad: true,
    picker,
    skills: skillPicker(game.skillPick),
    camp: noCamp(game),
    debrief: {
      kind: 'start',
      chips: now.start.chips,
      callout: null,
      // One line under the squad: the rule, and in Endless the horde to hold.
      note: goal ? `${goal.note} ${SQUAD_LOSS_RULE}` : SQUAD_LOSS_RULE,
      drop: null,
      cards: squad.map((d) => plainCard(d)),
      empty: null,
      roster: { label: CHANGE_SQUAD, line: bench },
      ...(asking.length > 0 ? { join: true as const } : {}),
    },
  };
}

/** A loss's XP, as its chip and line say it (ID-098). */
export const lossXpText = (xp: number): string =>
  xp > 0 ? `+${xp} XP each` : 'No XP: no wave cleared';

/** The finale's result title (ID-127): the ending screen before Endless. */
export const EVACUATION_TITLE = 'The evacuation is called';

/**
 * What a boss horde's first clear says (ID-127, no word of the radio since ID-196): the card it
 * unlocked, or, for the finale, the ending and Endless after it.
 */
export function bossRewardNote(reward: NonNullable<ReturnType<typeof bossReward>>): string {
  if (reward.finale) {
    return 'You held the camp and the evacuation is called. Play on in Endless for a best horde.';
  }
  const unlock = reward.unlock ? ` New card unlocked: ${UPGRADES[reward.unlock].name}.` : '';
  return `Boss horde beaten.${unlock}`;
}

/** "+35 Scrap": what a win paid, short, for the result screen's chip (ID-179). */
export const scrapChipText = (scrap: { total: number }): string =>
  `+${thousands(scrap.total)} Scrap`;

/**
 * "+35 Scrap (20 from salvage) · now 655": what a win paid and the balance after it, for the
 * result line (ID-179).
 */
export const scrapLine = (scrap: { total: number; salvage: number; now: number }): string =>
  `${scrapChipText(scrap)}${scrap.salvage > 0 ? ` (${thousands(scrap.salvage)} from salvage)` : ''} · now ${thousands(scrap.now)}`;

const SCRAP_NOW = /· now [\d,]+/;

/** `text` (a `scrapLine`) with its "now" figure replaced by `now` (ID-208); other text as it is. */
export const scrapNowText = (text: string, now: number): string =>
  text.replace(SCRAP_NOW, `· now ${thousands(now)}`);

/**
 * A win's result screen with the Scrap balance it shows set to `now` (ID-208): only the "now"
 * figure in its Scrap lines and chip tooltips, nothing else, for a screen not yet shown.
 */
export function withScrapNow(screen: ResultScreen, now: number): ResultScreen {
  const d = screen.debrief;
  return {
    ...screen,
    lines: screen.lines.map((l) => scrapNowText(l, now)),
    ...(d
      ? {
          debrief: {
            ...d,
            chips: d.chips.map((c) => (c.title ? { ...c, title: scrapNowText(c.title, now) } : c)),
          },
        }
      : {}),
  };
}

/**
 * The Scrap balance in the top bar (ID-179), left of the Roster button: a read-only chip
 * on the page itself (not in the game's root), so it stays above the dialogs.
 */
export function createScrapChip(doc: Document): { set(n: number): void } {
  const chip = doc.createElement('div');
  chip.className = 'scrap-chip';
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  const label = doc.createElement('span');
  label.className = 'scrap-chip-label';
  const amount = doc.createElement('b');
  doc.body.append(chip);
  return {
    set(n) {
      const full = thousands(n);
      if (chip.title === `Scrap ${full}`) return;
      label.textContent = 'Scrap';
      amount.textContent = shortCount(n);
      chip.replaceChildren(label, ' ', amount);
      chip.title = `Scrap ${full}`;
      chip.setAttribute('aria-label', `Scrap balance: ${full}`);
    },
  };
}

/**
 * A count short enough for the top bar (ID-179): whole up to 99,999 ("12,345"), then
 * "123k", "4.5M", "6.7B", "8.9T", so the Scrap chip never grows into the speed buttons.
 */
export function shortCount(n: number): string {
  if (n < 100_000) return thousands(n);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = Math.floor((n / size) * 10) / 10;
      return `${v >= 100 ? Math.floor(v) : v}${unit}`;
    }
  }
  return thousands(n);
}

/**
 * A win's XP as its chip says it (ID-186): "+126 XP each", "+126 XP" for one survivor,
 * "+98–126 XP" when they differ; null with nobody.
 */
export function xpChipText(gains: readonly { xp: number }[]): string | null {
  if (gains.length === 0) return null;
  const low = Math.min(...gains.map((g) => g.xp));
  const high = Math.max(...gains.map((g) => g.xp));
  if (low !== high) return `+${thousands(low)}–${thousands(high)} XP`;
  return `+${thousands(high)} XP${gains.length > 1 ? ' each' : ''}`;
}

/** "Auto: 2 in · 1 out": how many "Auto" moved, for its chip (ID-186); `movesText` names them. */
export function autoChipText(moves: { in: readonly string[]; out: readonly string[] }): string {
  const parts = [
    ...(moves.in.length > 0 ? [`${moves.in.length} in`] : []),
    ...(moves.out.length > 0 ? [`${moves.out.length} out`] : []),
  ];
  return `Auto: ${parts.join(' · ')}`;
}

/** "Camp 6 · nobody new" (or "· full"): the camp as a chip (ID-186) when nobody asks. */
export const campChipText = (why: NoJoin, size: number): string =>
  `Camp ${size} · ${why === 'camp-full' ? 'full' : 'nobody new'}`;

/** The button that opens and closes a win's details (ID-186). */
export const DETAILS = 'Details';
/** The same button with them open (ID-186): its words say the state, not only its caret. */
export const HIDE_DETAILS = 'Hide details';

/**
 * The horde-only result screen (ID-066) for horde `s`, fought from `game`: a win's XP,
 * level-ups and any survivor asking to join (a boss horde's first clear also finds a radio
 * part and may unlock a card, and the finale's is the ending screen, ID-127); a replay's win
 * says so, and its rare newcomer (ID-170) asks to join the same way. A win's cards are only
 * who levelled up in it (ID-134); a loss keeps every card. A loss says where they got in, the
 * small XP it paid (ID-098) and that the horde comes again in full. The picker
 * (ID-098) starts on the next new horde after a first clear, else on the same horde; its
 * bands read the squad as `game` holds it, so the app redraws it once the win is saved.
 */
export function squadScreen(game: GameState, s: HordeState): ResultScreen {
  if (s.outcome === 'fighting') throw new RangeError('squadScreen: the horde is still on');
  const { gains, bench, joined, noJoin, rests, patched, next, drop, scrap, auto } = squadResult(
    game,
    s,
  );
  const benchXp = benchXpText(bench);
  // "Auto" (ID-154): who it moved once the fight was over, so a pick never changes unseen.
  const moved = auto ? movesText(auto) : null;
  const autoNote = moved ? `Auto squad: ${moved}.` : null;
  const won = s.outcome === 'won';
  const replay = isReplay(game, s.hordeNumber);
  const first = won && !replay;
  // The picker as it stands once a first clear has moved on to the next horde.
  const after = first ? { ...game, hordeNumber: game.hordeNumber + 1 } : game;
  const picker = hordePicker(
    after,
    first ? after.hordeNumber : s.hordeNumber,
    won ? null : s.hordeNumber,
  );
  const goOn = picker.options.find((o) => o.horde === picker.value)!.button;
  // A bench survivor who swapped in (ID-148) gained XP too: the whole camp is looked up.
  const camp = campOf(game);
  const xpCards = (): SquadCard[] =>
    // Bench survivors only when they levelled up (ID-206): a big bench never crowds the panel.
    [...gains, ...bench.filter((g) => g.levels > 0)].flatMap((g): SquadCard[] => {
      const d = camp.find((r) => r.id === g.id);
      return d
        ? [{ id: g.id, name: g.name, level: g.level, art: avatarOf(d), levelUp: g.levels > 0 }]
        : [];
    });
  if (won) {
    // A win shows only who levelled up in it (ID-134): the rest change guns from the Roster.
    const ups = xpCards().filter((c) => c.levelUp);
    const reward = bossReward(game, s.hordeNumber);
    const ending = reward?.finale === true;
    const rewardNote = reward ? bossRewardNote(reward) : null;
    // Slots still open once any newcomer has taken one (ID-150), with someone fit on the
    // bench to fill them.
    const room = squadCap(next) - next.roster.length - joined.length;
    const benchFit = room > 0 && next.reserve.some(isFit);
    const rested = restNote(rests, benchFit, paramedicPoints(campOf(game)) > 0);
    const patch = patchNote(patched);
    // Each sentence waits in the details (ID-186); its chip says it short and opens them.
    const size = game.roster.length + game.reserve.length;
    // Each sentence waits in the details (ID-186), why nobody asked to join among them
    // (ID-196); its chip says it short and opens them.
    const notes = [
      rewardNote,
      patch,
      rested,
      autoNote,
      noJoin ? noJoinText(noJoin, size) : null,
    ].filter((t) => t !== null);
    const xpChip = xpChipText(gains);
    return {
      title: ending
        ? EVACUATION_TITLE
        : replay
          ? `Horde ${s.hordeNumber} - You hold the line (replay)`
          : `Horde ${s.hordeNumber} - You hold the line`,
      lines: [
        clearedLine(s),
        ...gains.map(squadXpLine),
        ...(benchXp ? [benchXp] : []),
        ...(drop ? squadDropLines(game, drop) : []),
        scrapLine(scrap),
        ...(rewardNote ? [rewardNote] : []),
        ...(rested ? [rested] : []),
        ...(autoNote ? [autoNote] : []),
      ],
      button: ending ? 'Continue' : goOn,
      squad: true,
      picker,
      skills: skillPicker(game.skillPick),
      camp: noCamp(game),
      debrief: {
        kind: 'won',
        chips: [
          // The ending names the horde its title doesn't (ID-127).
          ...(ending ? [{ text: `Horde ${s.hordeNumber} held`, tone: 'ok' as const }] : []),
          { text: `${s.waveCount}/${s.waveCount} waves`, tone: 'ok' },
          { text: scrapChipText(scrap), tone: 'ok', title: scrapLine(scrap) },
          ...(xpChip ? [{ text: xpChip, tone: 'ok' as const }] : []),
          ...(benchXp ? [{ text: benchXp, tone: 'ok' as const }] : []),
          // Good news on a win (ID-196): green, not the boss chip's red.
          ...bossFates(s).map((f) => ({ text: `${f.name} dead`, tone: 'ok' as const })),
          // A boss's first clear (ID-127): the card it unlocked; its sentence is in the details.
          ...(reward?.unlock
            ? [
                {
                  text: `New card: ${UPGRADES[reward.unlock].name}`,
                  tone: 'warn' as const,
                  details: true as const,
                },
              ]
            : []),
          ...(patch
            ? [
                {
                  text: `${patched.length} patched up`,
                  tone: 'ok' as const,
                  details: true as const,
                },
              ]
            : []),
          ...(rested
            ? [{ text: `${rests.length} resting`, tone: 'warn' as const, details: true as const }]
            : []),
          ...(auto && moved
            ? [{ text: autoChipText(auto), tone: 'ok' as const, details: true as const }]
            : []),
          ...(noJoin
            ? [{ text: campChipText(noJoin, size), tone: 'ok' as const, details: true as const }]
            : []),
        ],
        callout: null,
        note: null,
        notes,
        drop: drop ? dropTile(game, drop) : null,
        cards: ups,
        empty: ups.length > 0 ? null : SQUAD_NO_LEVEL_UPS,
        // The offer line (ID-150, ID-170, ID-182), on every win: newcomers ask there
        // (`showJoin`); with nobody, the details say why.
        join: true,
      },
    };
  }
  const inner = [...s.breaches].sort((a, b) => b.column - a.column).at(-1);
  const where = inner ? `They got in during wave ${inner.wave} of ${s.waveCount}` : 'They got in';
  const bossLost = lostBossLines(s);
  const xp = gains[0]?.xp ?? 0;
  // One line (ID-196), so the panel's body shows it whole under two rows of squad.
  const again = `Retry Horde ${s.hordeNumber}, or farm an easier horde: the squad and the wall are back at full strength`;
  return {
    title: `Horde ${s.hordeNumber} - Camp has fallen`,
    lines: [
      `${where} · nobody left standing`,
      ...bossLost,
      lossXpText(xp),
      ...(xp > 0 ? gains.map(squadXpLine) : []),
      ...(xp > 0 && benchXp ? [benchXp] : []),
      SQUAD_NO_DROP,
      again,
      ...(autoNote ? [autoNote] : []),
    ],
    button: goOn,
    squad: true,
    picker,
    skills: skillPicker(game.skillPick),
    camp: noCamp(game),
    debrief: {
      kind: 'lost',
      chips: [
        { text: lossXpText(xp), tone: 'warn' },
        ...(benchXp ? [{ text: benchXp, tone: 'warn' as const }] : []),
        { text: SQUAD_NO_DROP, tone: 'warn' },
      ],
      callout: {
        head: `${where} · nobody left standing`,
        // One line per boss (pre-line in page.css).
        sub: bossLost.length > 0 ? bossLost.join('\n') : null,
      },
      note: autoNote ? `${again}. ${autoNote}` : again,
      drop: null,
      cards: xp > 0 ? xpCards() : squadOf(game).map((d) => plainCard(d)),
      empty: null,
    },
  };
}

/** The countdown while the camp is falling, else ''. */
export function fallingText(s: HordeState): string {
  if (s.fallingFor <= 0 || s.outcome !== 'fighting') return '';
  return `The camp is falling — ${Math.ceil(FALL_WARNING - s.fallingFor)} s`;
}

export function createHud(
  root: HTMLElement,
  onChoose: (index: number) => void,
  onDone: () => void,
  onReplace: (defenderId: string, postId: number) => void,
  onSkip: () => void,
  onBuy: (item: ShopItem) => void,
  onArm: (skill: SkillId) => void,
  onReroll: () => void,
  onCampPick: (choice: CampChoice) => void,
  onSpeed: (speed: Speed) => void,
  /** The horde-only build's HUD (ID-066): the minimal top bar with the XP bar, no shop row. */
  squad: boolean = HORDE_ONLY,
): {
  update(state: HordeState, armed?: SkillId | null): void;
  speed(speed: Speed, paused: boolean): void;
  /**
   * Whether the empty field is running fast (ID-164): the 5× button is outlined, and a chip
   * under the speed buttons says so where there is room for it (not on a phone).
   */
  skipping(on: boolean): void;
  /**
   * Whether a fight is on (ID-165): the pause button shows only then. The app says, as a
   * start screen's preview state reads as fighting too.
   */
  fighting(on: boolean): void;
  /** Where the pause button goes (ID-165); the app sets it once. */
  onPause(handler: () => void): void;
  showResult(screen: ResultScreen): void;
  /** Takes the result or start screen down without its button (debug mode's Start, ID-197). */
  hideResult(): void;
  /**
   * Sets the Scrap balance a shown win screen reports (ID-208) in place: only its "now"
   * figure changes, so nothing open, picked or scrolled on it moves.
   */
  resultScrap(now: number): void;
  /**
   * The squad as it stands now, by id (ID-157): a "New" card of someone benched or let go
   * since goes. Nothing with the result screen down.
   */
  showSquad(ids: ReadonlySet<string>): void;
  /** Where a horde picked from the picker goes (ID-098); the app sets it once. */
  onHordePick(handler: (horde: number) => void): void;
  /** The picker redrawn (ID-098), its bands read off the squad as it stands now. */
  showPicker(picker: HordePicker): void;
  /** Where a skill toggled in the skill pick goes (ID-100); the app sets it once. */
  onSkillPick(handler: (skill: SkillId) => void): void;
  /** The skill pick redrawn (ID-100) once the app has saved a toggle. */
  showSkills(pick: SkillPick): void;
  /** Where an Accept or Refuse on the offer tile goes (ID-150); the app sets it once. */
  onJoin(handler: (id: string, accept: boolean) => void): void;
  /**
   * Asked as the result or start screen's button is pressed (ID-150): false keeps the panel
   * up and nothing happens; the app sets it once. It may answer later (the game's confirm,
   * ID-191): the panel stays up meanwhile, and a press then is ignored.
   */
  onLeave(check: () => boolean | Promise<boolean>): void;
  /** The offer tile redrawn (ID-150): who is still asking to join; none hides it. */
  showJoin(cards: readonly JoinCard[], keep?: boolean): void;
  /**
   * An answer given on the offer line (ID-182): `text` (`answerText`) stays on it after the
   * toast is gone. Nothing with the result screen down.
   */
  noteJoin(text: string): void;
  /**
   * Survivor `card` just accepted into the squad (ID-157): their card in the Squad section
   * (added when the screen has none for them, as a win shows only level-ups), marked "New"
   * and scrolled into view. Nothing with the result screen down.
   */
  showJoined(card: SquadCard): void;
  /** Where the Airstrike's Auto toggle goes (ID-140); the app sets it once. */
  onAutoStrike(handler: () => void): void;
  /** The Auto toggle shown on or off (ID-140). */
  showAutoStrike(on: boolean): void;
  /** Squad Power against Recommended Power for the fight's corner (ID-098); null hides it. */
  fightPower(line: PowerLine | null): void;
  show(visible: boolean): void;
  /** Shows `text` for `ms` (2 s unless said). */
  toast(text: string, ms?: number): void;
  bottomSpace(): number;
  /**
   * Screen px from the page's top to the held cards' strip's bottom (ID-113), measured
   * with the most cards a horde can hold, so the field never moves as cards come; 0 where
   * the strip never shows.
   */
  topSpace(): number;
} {
  const hud = el('div', 'hud');
  const bar = el('div', squad ? 'hud-bar hud-fight-bar hud-corner-bar' : 'hud-bar hud-fight-bar');
  // The horde-only fight corner (ID-098, layout B): a square horde badge, and beside it one
  // panel with the wave, the fight's level and XP bar, and Squad Power against Recommended.
  const corner = el('div', 'hud-corner');
  const badge = el('div', 'hud-badge');
  const badgeNum = el('span', 'hud-badge-num');
  const badgeBoss = el('span', 'hud-badge-boss', '☠');
  badgeBoss.setAttribute('aria-hidden', 'true');
  badge.append(el('span', 'hud-badge-label', 'Horde'), badgeNum, badgeBoss);
  const cornerPanel = el('div', 'hud-corner-panel');
  cornerPanel.setAttribute('role', 'group');
  cornerPanel.setAttribute('aria-label', 'Horde status');
  const waveLine = el('p', 'hud-corner-wave');
  // Swaps left (ID-148) at the wave line's end; hidden with nobody on the bench.
  const swapsChip = el('span', 'hud-corner-swaps');
  swapsChip.title = SWAPS_TIP;
  swapsChip.hidden = true;
  const waveRow = el('div', 'hud-corner-top');
  waveRow.append(waveLine, swapsChip);
  // "X takes over from Y" after a mid-fight swap (ID-148), on fight time.
  const swapNoteEl = el('div', 'hud-toast hud-swap-note');
  swapNoteEl.setAttribute('role', 'status');
  swapNoteEl.hidden = true;
  // The note showing, and when (real ms) it last changed.
  let noteShown: string | null = null;
  let noteAt = 0;
  const xpRow = el('div', 'hud-corner-row hud-xp');
  const xpLabel = el('span', 'hud-xp-label');
  const xpMeter = el('meter', 'hud-xp-meter');
  xpMeter.min = 0;
  xpRow.append(xpLabel, xpMeter);
  const powerRow = el('div', 'hud-corner-row hud-power');
  const powerLabel = el('span', 'hud-power-label');
  // Squad Power's fill in its band's colour, a tick at Recommended; the number is always shown.
  const powerMeter = el('div', 'hud-power-meter');
  powerMeter.setAttribute('role', 'meter');
  powerMeter.setAttribute('aria-valuemin', '0');
  const powerFill = el('div', 'hud-power-fill');
  const powerTick = el('div', 'hud-power-tick');
  powerMeter.append(powerFill, powerTick);
  powerRow.append(powerLabel, powerMeter);
  powerRow.hidden = true;
  cornerPanel.append(waveRow, xpRow, powerRow);
  corner.append(badge, cornerPanel);
  corner.hidden = !squad;
  bar.append(...(squad ? [corner] : []));
  // Squad Power and Recommended Power for the fight under way, set by the app at its start.
  let fightLine: PowerLine | null = null;
  const showFightPower = (): void => {
    powerRow.hidden = fightLine === null;
    if (!fightLine) return;
    const l = fightLine;
    if (powerLabel.textContent !== l.text) powerLabel.textContent = l.text;
    powerRow.dataset.band = l.band;
    powerFill.style.width = `${(100 * l.fill).toFixed(1)}%`;
    powerTick.style.left = `${(100 * l.tick).toFixed(1)}%`;
    const end = Math.round(POWER_METER_END * l.rec);
    powerMeter.setAttribute('aria-valuemax', String(end));
    powerMeter.setAttribute('aria-valuenow', String(Math.min(l.power, end)));
    powerMeter.setAttribute(
      'aria-valuetext',
      `${l.text} (${BAND_WORD[l.band]}; the mark is Recommended Power)`,
    );
    powerMeter.setAttribute('aria-label', 'Squad Power against Recommended Power');
  };
  // One row per boss on the field (ID-099): never more than BOSSES.max at once.
  const boss = el('div', 'hud-boss');
  const bossRows = Array.from({ length: BOSSES.max }, (_, i) => {
    const row = el('div', 'hud-boss-row');
    // Name, skill tag and HP in their own spans, so a tag never pushes the HP out.
    const label = el('div', 'hud-boss-label');
    label.id = `hud-boss-label-${i}`;
    const name = el('span', 'hud-boss-name');
    const cue = el('span', 'hud-boss-cue');
    cue.hidden = true;
    const hpText = el('span', 'hud-boss-hptext');
    label.append(name, cue, hpText);
    const meter = el('meter', 'hud-boss-hp');
    meter.min = 0;
    meter.setAttribute('aria-labelledby', label.id);
    row.append(label, meter);
    row.hidden = true;
    boss.append(row);
    return { row, name, cue, hpText, meter };
  });
  boss.hidden = true;
  // The swarm banner (ID-121): its title, and the countdown while the wave is incoming.
  const swarm = el('div', 'hud-swarm');
  swarm.setAttribute('role', 'status');
  const swarmTitle = el('span', 'hud-swarm-title');
  const swarmCount = el('span', 'hud-swarm-count');
  // The title speaks; a number read out every second would only be noise.
  swarmCount.setAttribute('aria-hidden', 'true');
  swarm.append(swarmTitle, swarmCount);
  swarm.hidden = true;
  // A red glow at the field's edges while a swarm hits (ID-121).
  const swarmEdgeEl = el('div', 'hud-swarm-edge');
  swarmEdgeEl.hidden = true;
  // Fight speed and the Space pause (ID-062), top right beside the Menu button.
  const speed = el('div', 'hud-speed');
  speed.setAttribute('role', 'group');
  speed.setAttribute('aria-label', 'Game speed');
  // Read out when the fight is held (ID-062); the pause button shows it on screen (ID-165).
  const pausedChip = el('span', 'menu-chip sr-only', 'Paused');
  pausedChip.append(el('kbd', 'menu-key', 'Space'));
  pausedChip.setAttribute('role', 'status');
  pausedChip.hidden = true;
  const speedButtons = SPEEDS.map((sp) => {
    const button = el('button', 'hud-speed-button');
    button.type = 'button';
    button.append(`${sp}×`, el('kbd', 'menu-key', SPEED_KEYS[sp]));
    button.dataset.speed = String(sp);
    button.setAttribute('aria-keyshortcuts', SPEED_KEYS[sp]);
    button.addEventListener('click', () => onSpeed(sp));
    return button;
  });
  // The pause as a button too (ID-165), for mouse and touch: it does what Space does.
  let onPauseToggle: () => void = () => {};
  const pauseButton = el('button', 'hud-speed-button hud-pause');
  pauseButton.type = 'button';
  pauseButton.append(el('span', 'hud-pause-icon'), el('kbd', 'menu-key', 'Space'));
  pauseButton.setAttribute('aria-keyshortcuts', 'Space');
  pauseButton.setAttribute('aria-label', 'Pause');
  pauseButton.setAttribute('aria-pressed', 'false');
  pauseButton.title = 'Pause (Space)';
  pauseButton.hidden = true;
  pauseButton.addEventListener('click', () => onPauseToggle());
  // The empty field fast-forwarded (ID-164): shown under the buttons, so the row never shifts.
  const skipChip = el('span', 'hud-skip-chip', 'Fast-forward »');
  skipChip.setAttribute('aria-hidden', 'true');
  skipChip.hidden = true;
  speed.append(skipChip, pausedChip, ...speedButtons, pauseButton);
  // A held fight on screen (ID-165): the field dims under the word, clicks pass through.
  const pausedVeil = el('div', 'hud-paused-veil');
  pausedVeil.append(el('span', 'hud-paused-word', 'Paused'));
  pausedVeil.setAttribute('aria-hidden', 'true');
  pausedVeil.hidden = true;
  // Whether a fight is on (the app says; a start screen's preview isn't one) and held.
  let fightOn = false;
  let heldNow = false;
  const drawPause = (): void => {
    pauseButton.hidden = !fightOn;
    pausedVeil.hidden = !(fightOn && heldNow);
    pausedChip.hidden = !(fightOn && heldNow);
  };
  const warning = el('div', 'hud-warning');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;
  const cards = el('div', 'hud-panel hud-cards');
  const replace = el('div', 'hud-panel hud-replace');
  replace.hidden = true;
  const result = el('div', 'hud-panel hud-result');
  const resultTitle = el('h2', 'hud-result-title');
  // The horde-only panel's header (ID-196): the title, then its reward pills.
  const headChips = el('div', 'debrief-chips');
  const resultHead = el('div', 'hud-result-head');
  resultHead.append(resultTitle, headChips);
  const resultList = el('ul', 'hud-result-list');
  const picker = el('div', 'hud-picker');
  const campPicker = el('div', 'hud-picker');
  // The body between the header and the footer: on the horde-only panel, the part that scrolls.
  const resultBody = el('div', 'hud-result-scroll');
  resultBody.append(resultList, picker, campPicker);
  // Who is asking to join (ID-150): one row each with Accept and Refuse; hidden once answered.
  const joinBox = el('section', 'debrief-join');
  joinBox.setAttribute('aria-label', 'Asking to join');
  joinBox.hidden = true;
  let onAnswerJoin: (id: string, accept: boolean) => void = () => {};
  /** The answers given on the screen's offer line (`Debrief.join`), so far. */
  let joinAnswers: string[] = [];
  /** How many are asking now, for the header's pill. */
  let askers = 0;
  /**
   * A pill in the header while someone is asking (ID-196): the offer line can sit below the
   * body's fold, and a click brings it into view with the keyboard on its first answer.
   */
  function drawJoinChip(): void {
    headChips.querySelector('.chip-join')?.remove();
    if (askers === 0 || result.hidden || !joinBox.isConnected) return;
    const chip = el('button', 'chip chip-toggle chip-join', joinLabel(askers));
    chip.type = 'button';
    chip.dataset.tone = 'warn';
    chip.addEventListener('click', () => {
      reveal(joinBox);
      joinBox.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    });
    // Before "Details", which stays last.
    headChips.insertBefore(chip, headChips.querySelector('.debrief-details'));
  }
  /**
   * Draws the offer line (ID-182, ID-196) from `cards`, who is asking now: one row each with
   * Accept and Refuse, then each answer given (it stays). Hidden when it has nothing to say.
   */
  function drawJoin(cards: readonly JoinCard[], keep = false): void {
    const had = keep || joinBox.contains(document.activeElement);
    joinBox.hidden = cards.length === 0 && joinAnswers.length === 0;
    // One line each (ID-196): the name and profession, then Accept and Refuse.
    const rows = cards.map((c) => {
      const row = el('div', 'join-row');
      row.dataset.joiner = c.id;
      const answer = (accept: boolean): HTMLButtonElement => {
        const b = el('button', 'hud-button join-btn', accept ? 'Accept' : 'Refuse');
        b.type = 'button';
        setVariant(b, accept ? 'primary' : 'secondary');
        b.setAttribute('aria-label', `${accept ? 'Accept' : 'Refuse'} ${c.name}`);
        // What the profession brings, and that a refusal is for good, on hover.
        b.title = accept ? c.job : REFUSE_NOTE;
        b.addEventListener('click', () => {
          if (!result.hidden) onAnswerJoin(c.id, accept);
        });
        return b;
      };
      const who = el('p', 'join-who');
      who.append(el('strong', 'join-name', c.name), ` · ${c.profession} asks to join`);
      who.title = `${c.sub}. ${c.job}`;
      row.append(who, answer(true), answer(false));
      return row;
    });
    const answered = joinAnswers.map((t) => el('p', 'join-answer', t));
    joinBox.replaceChildren(...rows, ...answered);
    askers = cards.length;
    drawJoinChip();
    // An answer keeps the keyboard in the tile, else on the button that moves on.
    if (had) (joinBox.querySelector<HTMLButtonElement>('button') ?? back).focus();
  }
  const back = el('button', 'hud-button');
  back.type = 'button';
  back.addEventListener('click', () => {
    // Hide at once so a double click can't finish the same horde twice.
    if (result.hidden || back.disabled) return;
    if (leaving) return;
    // Asked first (ID-150: someone still asking to join); a no keeps the panel up.
    const ok = canLeave();
    if (ok === true) {
      finishLeave();
      return;
    }
    if (ok === false) return;
    leaving = true;
    void ok.then(
      (yes) => {
        leaving = false;
        // The panel may have gone, or the button been locked, while the question was up.
        if (yes && !result.hidden && !back.disabled) finishLeave();
      },
      () => {
        leaving = false;
      },
    );
  });
  function finishLeave(): void {
    result.hidden = true;
    onDone();
  }
  let leaving = false;
  let canLeave: () => boolean | Promise<boolean> = () => true;
  // The button sits in a footer: a horde-only panel pins it (ID-067), as two rows (ID-196):
  // the skills, then the horde picker with its readiness and the button.
  const foot = el('div', 'hud-result-foot');
  // The horde picker (ID-098), beside the button it labels.
  const pickBlock = el('div', 'hud-horde-pick');
  pickBlock.hidden = true;
  // The skill pick for the next horde (ID-100): a row of its own above the horde picker.
  const skillBlock = el('div', 'hud-skill-pick');
  skillBlock.setAttribute('role', 'group');
  skillBlock.hidden = true;
  let onPickSkill: (skill: SkillId) => void = () => {};
  const startRow = el('div', 'hud-start-row');
  startRow.append(pickBlock, back);
  foot.append(skillBlock, startRow);
  let onPickHorde: (horde: number) => void = () => {};
  result.append(resultHead, resultBody, foot);
  const toast = el('div', 'hud-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const shop = el('div', 'hud-shop');
  // The armed skill's caption (ID-100, ID-107), on its own line above the buttons.
  const aimCaption = el('p', 'hud-aim-caption', '');
  aimCaption.setAttribute('role', 'status');
  aimCaption.hidden = true;
  shop.append(aimCaption);
  // Each button: its icon (decoration only, so a screen reader reads the label) and its label.
  const iconButton = (className: string, icon: ArtId, onClick: () => void) => {
    const button = el('button', className);
    button.type = 'button';
    button.addEventListener('click', onClick);
    const img = el('img', 'hud-icon');
    img.src = ART_URLS[icon] ?? '';
    img.alt = '';
    const label = el('span', 'hud-shop-label');
    // Cash is the only cost here, so it is the short one whenever the button is unaffordable;
    // the class reds it only under `.btn-unaffordable`.
    const cost = el('span', 'btn-cost btn-cost-short');
    button.append(img, label, cost);
    shop.append(button);
    return { button, label, cost };
  };
  /** Shows `b` on its button: the label, the cost after a dot, and the kit look (ID-056). */
  const showButton = (
    item: { button: HTMLButtonElement; label: HTMLElement; cost: HTMLElement },
    b: HudButton,
  ): void => {
    const label = b.cost ? `${b.label} · ` : b.label;
    if (item.label.textContent !== label) item.label.textContent = label;
    if (item.cost.textContent !== b.cost) item.cost.textContent = b.cost;
    // Want of cash shows as the red cost, a missing research as a short note.
    setVariant(item.button, b.variant, b.variant === 'locked' ? LOCKED_NOTE : '');
    item.button.disabled = b.disabled;
    item.button.title = b.reason;
  };
  const shopItems = SHOP_ITEMS.map((item) =>
    iconButton('hud-button hud-shop-item', SHOP_ICON[item], () => onBuy(item)),
  );
  const skillItems = SKILL_IDS.map((skill) => {
    const item = iconButton('hud-button hud-shop-item hud-skill', SKILL_ICON[skill], () =>
      onArm(skill),
    );
    // The horde-only build's key for it (ID-100); empty, and so hidden, in the full game.
    const key = el('kbd', 'menu-key hud-skill-key');
    key.hidden = true;
    item.button.append(key);
    item.button.addEventListener('animationend', () =>
      item.button.classList.remove('hud-skill-ready'),
    );
    return { ...item, key, cooling: false };
  });
  // Airstrike auto-aim (ID-140): its own toggle just after the Airstrike button (a button
  // can't hold another), usable any time in a fight, during picks too.
  const autoButton = el('button', 'hud-button hud-auto');
  autoButton.type = 'button';
  autoButton.hidden = true;
  autoButton.setAttribute('aria-keyshortcuts', AUTO_KEY);
  // Its name is "Auto" and `aria-pressed` says on or off; the on/off word and the key are
  // for the eyes only (`aria-keyshortcuts` names the key), so a reader never hears both.
  const autoState = el('span', 'hud-auto-state');
  autoState.setAttribute('aria-hidden', 'true');
  const autoKey = el('kbd', 'menu-key hud-skill-key', AUTO_KEY);
  autoKey.setAttribute('aria-hidden', 'true');
  autoButton.append('Auto ', autoState, autoKey);
  let autoHandler: (() => void) | null = null;
  autoButton.addEventListener('click', () => autoHandler?.());
  const showAuto = (on: boolean): void => {
    autoState.textContent = on ? 'on' : 'off';
    autoButton.setAttribute('aria-pressed', String(on));
    autoButton.title = on
      ? `Airstrike fires by itself on the biggest group (key ${AUTO_KEY} to turn off)`
      : `Turn on to fire the Airstrike by itself on the biggest group (key ${AUTO_KEY})`;
  };
  showAuto(false);
  skillItems[SKILL_IDS.indexOf('airstrike')]!.button.after(autoButton);
  // In the horde-only build only the picked skills show, and no cash shop (ID-066, ID-100).
  if (squad) for (const item of shopItems) item.button.hidden = true;
  // Each button starts in its tallest look (name · cost, locked with its note), so the
  // bar's measured height (`bottomSpace`) covers any fight's before the first update,
  // which redraws every button. The HUD stays hidden until then.
  const rest = [...SHOP_ITEMS.map((i) => SHOP[i]), ...SKILL_IDS.map((k) => SKILLS[k])];
  [...shopItems, ...skillItems].forEach((item, i) => {
    item.label.textContent = `${rest[i]!.name} · `;
    item.cost.textContent = String(rest[i]!.cost);
    setVariant(item.button, 'locked', LOCKED_NOTE);
  });
  // The horde-only build's skills are never locked or paid for: their tallest look is
  // the name and a key (ID-100).
  if (squad) {
    for (const item of skillItems) {
      item.label.textContent = item.label.textContent!.replace(' · ', '');
      item.cost.textContent = '';
      item.key.textContent = SKILL_KEYS[0]!;
      item.key.hidden = false;
      setVariant(item.button, 'secondary', '');
    }
  }
  // The upgrade cards held this horde (ID-113), under the corner: one chip each, its
  // level on it; hovering, focusing or tapping one shows its name and effect below.
  const held = el('div', 'hud-held');
  held.setAttribute('role', 'group');
  held.setAttribute('aria-label', 'Upgrade cards held');
  held.hidden = true;
  const heldRow = el('div', 'hud-held-row');
  // The chip's own label reads it out; the tip is for the eyes.
  const heldTip = el('div', 'hud-held-tip');
  heldTip.setAttribute('aria-hidden', 'true');
  heldTip.hidden = true;
  held.append(heldRow, heldTip);
  let heldShown = '';
  let heldSpaceFor: boolean | null = null;
  let heldCardsNow: HeldCard[] = [];
  // The card whose tip shows, and whether a click or tap pinned it open.
  let tipFor: UpgradeId | null = null;
  let tipPinned = false;
  const chipOf = (id: UpgradeId): HTMLButtonElement | undefined =>
    [...heldRow.querySelectorAll<HTMLButtonElement>('.hud-held-card')].find(
      (b) => b.dataset.card === id,
    );
  function showTip(id: UpgradeId | null, pinned = false): void {
    const card = heldCardsNow.find((c) => c.id === id);
    tipFor = card ? card.id : null;
    tipPinned = card !== undefined && pinned;
    for (const b of heldRow.querySelectorAll<HTMLButtonElement>('.hud-held-card'))
      b.setAttribute('aria-expanded', String(b.dataset.card === tipFor));
    heldTip.hidden = !card;
    if (!card) return heldTip.replaceChildren();
    heldTip.replaceChildren(
      el('strong', 'hud-held-tip-title', card.title),
      el('span', 'hud-held-tip-effect', card.effect),
      ...(card.cost ? [el('span', 'hud-held-tip-cost', card.cost)] : []),
      el('span', 'hud-held-tip-kind', card.kind),
    );
    // Under its chip, kept inside the window.
    const chip = chipOf(card.id);
    const room = Math.max(0, window.innerWidth - held.getBoundingClientRect().left - 16);
    heldTip.style.left = `${Math.max(0, Math.min(chip?.offsetLeft ?? 0, room - heldTip.offsetWidth))}px`;
  }
  // Where the strip ends (its rows wrap with the window's width), so the boss bars,
  // warning and toast sit under it, not on it; 0 while it is hidden or not laid out.
  const heldSpace = (): void => {
    const bottom =
      held.hidden || held.offsetHeight === 0 ? 0 : held.offsetTop + held.offsetHeight + HELD_GAP;
    hud.style.setProperty('--hud-held-bottom', `${bottom}px`);
  };
  window.addEventListener('resize', () => {
    heldSpace();
    // The chips may have moved to another row: the open tip goes under its chip again.
    if (tipFor !== null) showTip(tipFor, tipPinned);
  });
  // A tap anywhere else puts a pinned tip away.
  document.addEventListener('pointerdown', (e) => {
    if (tipFor !== null && !(e.target instanceof Node && held.contains(e.target))) showTip(null);
  });
  function drawHeld(list: HeldCard[]): void {
    heldCardsNow = list;
    heldRow.replaceChildren(
      ...list.map((c) => {
        const chip = el('button', `hud-held-card hud-held-${UPGRADES[c.id].rarity}`);
        chip.type = 'button';
        chip.dataset.card = c.id;
        chip.setAttribute('aria-label', c.spoken);
        chip.setAttribute('aria-expanded', 'false');
        const img = el('img', 'hud-held-icon');
        img.src = ART_URLS[CARD_ICON[c.id]] ?? '';
        img.alt = '';
        chip.append(img);
        // A running cost's countdown (ID-137) takes the badge's place, in the warning colour.
        if (c.badge) {
          chip.append(
            el('span', c.cost ? 'hud-held-badge hud-held-badge-cost' : 'hud-held-badge', c.badge),
          );
        }
        chip.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'mouse' && !tipPinned) showTip(c.id);
        });
        chip.addEventListener('pointerleave', (e) => {
          if (e.pointerType === 'mouse' && !tipPinned && tipFor === c.id) showTip(null);
        });
        chip.addEventListener('focus', () => {
          if (!tipPinned) showTip(c.id);
        });
        // Focus leaving the strip puts even a pinned tip away, so the keyboard can close it.
        chip.addEventListener('blur', (e) => {
          const out = !(e.relatedTarget instanceof Node && held.contains(e.relatedTarget));
          if (tipFor === c.id && (!tipPinned || out)) showTip(null);
        });
        // A click or tap pins its tip open; a second one on the same chip closes it.
        chip.addEventListener('click', () => {
          if (tipPinned && tipFor === c.id) showTip(null);
          else showTip(c.id, true);
        });
        return chip;
      }),
    );
    // The open tip follows its card's new level, or closes with a replaced card.
    showTip(tipFor, tipPinned);
  }

  cards.hidden = true;
  result.hidden = true;
  hud.append(
    pausedVeil,
    swarmEdgeEl,
    bar,
    speed,
    boss,
    swarm,
    warning,
    toast,
    swapNoteEl,
    shop,
    held,
    cards,
    replace,
    result,
  );
  root.append(hud);

  let shownOffer: Card[] | null = null;
  // Second Look's reroll can deal the same three cards; its button still has to grey out.
  let shownRerolled = '';
  // While a pick's confirm effect plays (ID-103): the panel takes no input and closes after.
  let picking: ReturnType<typeof setTimeout> | undefined;
  function endPick(): void {
    clearTimeout(picking);
    picking = undefined;
    cards.classList.remove('hud-cards-picking');
  }
  // The pick goes out at once and the offer is forgotten, so a second click or key can't
  // pick from it, or from one the player hasn't seen yet. With motion, the picked card
  // flashes and the others fade before the panel closes; without, it closes at once.
  function choose(index: number): void {
    if (cards.hidden || picking !== undefined || !shownOffer?.[index]) return;
    shownOffer = null;
    if (reducedMotion()) {
      cards.hidden = true;
    } else {
      cards.classList.add('hud-cards-picking');
      cards.querySelectorAll('.hud-card')[index]?.classList.add('hud-card-picked');
      picking = setTimeout(() => {
        endPick();
        if (shownOffer === null) {
          cards.hidden = true;
          cards.replaceChildren();
        }
      }, PICK_MS);
    }
    try {
      onChoose(index);
    } catch (e) {
      // A failed pick must not leave the panel locked behind its effect.
      endPick();
      cards.hidden = true;
      throw e;
    }
  }
  document.addEventListener('keydown', (e) => {
    // Not while the field is inert behind the open menu.
    if (e.repeat || root.closest('[inert]')) return;
    const index = ['1', '2', '3'].indexOf(e.key);
    if (index >= 0) choose(index);
  });

  // Like the cards: hide at once so a second click can't answer the same offer twice.
  let shownReplace = '';
  function answer(act: () => void): void {
    if (replace.hidden) return;
    replace.hidden = true;
    shownReplace = '';
    act();
  }
  function showReplace(state: HordeState): void {
    const offer = state.replace!;
    const name = state.injured.find((i) => i.defender.id === offer.injuredId)?.defender.name ?? '';
    const posts = replacePosts(state);
    const heading = el('h2', 'hud-cards-title', `${name} is injured: send someone in?`);
    const parts: HTMLElement[] = [heading];
    const pick = el('select', 'build-select');
    // One post pick for every bench button.
    for (const p of posts) {
      const o = el('option', '', postName(p));
      o.value = String(p.id);
      pick.append(o);
    }
    if (offer.postId === null) {
      const label = el('label', 'build-field', 'Post');
      label.append(pick);
      parts.push(label);
    } else {
      parts.push(el('p', 'hud-result-body', `Takes ${postName(posts[0]!)}`));
    }
    const row = el('div', 'hud-card-row');
    for (const d of state.bench) {
      const button = el('button', 'hud-card hud-card-recruit');
      button.type = 'button';
      button.append(el('span', 'hud-card-title', `Send in ${defenderLabel(d)}`));
      button.addEventListener('click', () => answer(() => onReplace(d.id, Number(pick.value))));
      row.append(button);
    }
    const skip = el('button', 'hud-button hud-skip', 'Skip');
    skip.type = 'button';
    skip.addEventListener('click', () => answer(onSkip));
    replace.replaceChildren(...parts, row, skip);
  }

  /**
   * Opens or closes a win's details (ID-186): its sentences, the drop's role and affixes,
   * and the camp's line. They open inside the panel's body, which scrolls: the panel keeps
   * its size (ID-196). Every button that toggles them (the chips with a sentence there, and
   * "Details") says which way they are.
   */
  function setDetails(open: boolean): void {
    if (open) result.dataset.details = '';
    else delete result.dataset.details;
    const notes = picker.querySelector<HTMLElement>('.debrief-notes');
    if (notes) notes.hidden = !open;
    for (const b of result.querySelectorAll('[data-details-toggle]')) {
      b.setAttribute('aria-expanded', String(open));
    }
    const main = headChips.querySelector('.debrief-details');
    if (main) main.textContent = open ? HIDE_DETAILS : DETAILS;
  }

  /** A button that opens and closes the details: a chip with a sentence there, or "Details". */
  function detailsButton(cls: string, text: string): HTMLButtonElement {
    const b = el('button', cls, text);
    b.type = 'button';
    b.dataset.detailsToggle = '';
    b.setAttribute('aria-controls', 'hud-debrief-notes');
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => setDetails(result.dataset.details === undefined));
    return b;
  }

  const chipNodes = (list: readonly Chip[]): HTMLElement[] =>
    list.map((c) => {
      if (c.details) {
        const chip = detailsButton('chip chip-toggle chip-details', c.text);
        chip.dataset.tone = c.tone;
        return chip;
      }
      const chip = el('span', 'chip', c.text);
      chip.dataset.tone = c.tone;
      if (c.title) chip.title = c.title;
      return chip;
    });

  /**
   * The skill pick (ID-100), the footer's Skills row (ID-196): a toggle per skill, pressed
   * when picked, and a line on the pick's power. A third skill can't be added while two are
   * picked. A toggle goes to `onPickSkill`; the app redraws it with the pick it saved.
   */
  function drawSkills(p: SkillPick | undefined): void {
    const had = document.activeElement?.closest('.hud-skill-pick')
      ? (document.activeElement as HTMLElement).dataset.skill
      : undefined;
    skillBlock.hidden = p === undefined;
    if (!p) {
      skillBlock.replaceChildren();
      return;
    }
    // "Up to 2" asks for a second skill only while there is one (ID-139: Airstrike alone).
    const most = Math.min(SQUAD_SKILLS.max, p.options.length);
    const label = el('span', 'hud-horde-label', most > 1 ? `Skills (up to ${most})` : 'Skills');
    label.id = 'hud-skill-label';
    skillBlock.setAttribute('aria-labelledby', label.id);
    const row = el('div', 'hud-skill-options');
    for (const o of p.options) {
      const button = el('button', 'hud-skill-option');
      button.type = 'button';
      button.dataset.skill = o.skill;
      button.setAttribute('aria-pressed', String(o.picked));
      button.disabled = o.full;
      button.title = o.full
        ? `Pick up to ${SQUAD_SKILLS.max}: drop one first`
        : [o.detail, o.cooldown].join(' · ');
      const img = el('img', 'hud-icon');
      img.src = ART_URLS[SKILL_ICON[o.skill]] ?? '';
      img.alt = '';
      const head = el('span', 'hud-skill-option-head');
      head.append(img, el('span', 'hud-skill-option-name', o.name));
      button.append(
        head,
        el('span', 'hud-skill-option-detail', o.detail),
        el('span', 'hud-skill-option-detail', o.cooldown),
      );
      button.addEventListener('click', () => {
        if (result.hidden) return;
        onPickSkill(o.skill);
      });
      row.append(button);
    }
    const note = el('p', 'hud-skill-note', p.note);
    note.setAttribute('role', 'status');
    note.hidden = p.note === '';
    skillBlock.replaceChildren(label, row, note);
    if (had) [...row.querySelectorAll('button')].find((b) => b.dataset.skill === had)?.focus();
  }

  /**
   * The horde picker (ID-098) beside the button: a select, then Squad Power against that
   * horde's Recommended Power. A pick relabels the button (and, on the start screen, the
   * title and chips) and goes to `onPickHorde`; it never blocks a start.
   */
  function drawPicker(p: HordePicker | undefined): void {
    const had = document.activeElement?.id === 'hud-horde-select';
    pickBlock.hidden = p === undefined;
    if (!p) {
      pickBlock.replaceChildren();
      return;
    }
    const select = el('select', 'build-select hud-horde-select');
    select.id = 'hud-horde-select';
    for (const o of p.options) {
      const option = el('option', '', o.label);
      option.value = String(o.horde);
      select.append(option);
    }
    select.value = String(p.value);
    const label = el('label', 'hud-horde-label', 'Horde to fight');
    label.htmlFor = select.id;
    const line = el('p', 'hud-horde-power');
    const lineText = el('span', 'hud-horde-power-text');
    const band = el('span', 'hud-horde-band');
    line.append(lineText, ' ', band);
    // The injury band (ID-155) under it, in the same shape: words, then the band's pill.
    const hurt = el('p', 'hud-horde-power hud-horde-injury');
    const hurtBand = el('span', 'hud-horde-band');
    hurt.append(`${INJURY_LEAD} `, hurtBand);
    const hint = el('p', 'hud-horde-hint');
    const choice = (): HordeChoice => p.options.find((o) => String(o.horde) === select.value)!;
    const sync = (): void => {
      const o = choice();
      lineText.textContent = o.power.text;
      band.textContent = BAND_WORD[o.power.band];
      line.dataset.band = o.power.band;
      hurtBand.textContent = INJURY_WORD[o.injury];
      hurtBand.title = INJURY_TIP[o.injury];
      hurt.dataset.band = INJURY_TONE[o.injury];
      hint.textContent = o.hint ?? '';
      hint.hidden = o.hint === null;
      select.title = select.selectedOptions[0]?.textContent ?? '';
    };
    sync();
    select.addEventListener('change', () => {
      if (result.hidden) return;
      const o = choice();
      sync();
      back.textContent = o.button;
      if (p.retitle) {
        resultTitle.textContent = o.start.title;
        headChips.replaceChildren(...chipNodes(o.start.chips));
        drawJoinChip();
      }
      onPickHorde(o.horde);
    });
    // Two columns: the select with its power line and farm hint under it, then the win cost.
    const pick = el('div', 'hud-horde-choice');
    pick.append(select, line, hint);
    const ready = el('div', 'hud-horde-ready');
    ready.append(hurt);
    pickBlock.replaceChildren(label, pick, ready);
    if (had) select.focus();
  }

  /**
   * The horde-only panel's header pills (ID-196), with the "Details" button when the
   * screen has sentences to open: with none it would open nothing.
   */
  function debriefChips(d: Debrief): HTMLElement[] {
    return [
      ...chipNodes(d.chips),
      ...((d.notes ?? []).length > 0 ? [detailsButton('debrief-details', DETAILS)] : []),
    ];
  }

  /**
   * The horde-only panel's body (ID-067, ID-196): a loss's callout, a win's sentences and
   * loot, the squad (a win's only who levelled up, or one line with none, ID-134), then the
   * screen's line.
   */
  function debriefBlock(d: Debrief): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if ((d.notes ?? []).length > 0) {
      // A win's sentences (ID-186), closed until asked for by the buttons that name it.
      const notes = el('ul', 'debrief-notes');
      notes.id = 'hud-debrief-notes';
      notes.setAttribute('aria-label', 'Result details');
      notes.hidden = true;
      notes.append(...(d.notes ?? []).map((t) => el('li', '', t)));
      parts.push(notes);
    }
    if (d.callout) {
      const callout = el('div', 'debrief-callout');
      callout.append(el('p', 'debrief-callout-head', d.callout.head));
      if (d.callout.sub) callout.append(el('p', 'debrief-callout-sub', d.callout.sub));
      parts.push(callout);
    }
    if (d.drop) parts.push(gunSection(d.drop));
    if (d.cards.length > 0) {
      parts.push(squadSection(d.cards, d.roster));
    } else if (d.empty) {
      parts.push(emptySection(d.empty));
    }
    // The offer line (ID-150, ID-196) under the squad, kept across redraws: `showJoin` fills it.
    if (d.join) parts.push(joinBox);
    if (d.note) parts.push(el('p', 'debrief-note', d.note));
    return parts;
  }

  /**
   * A win's weapons (ID-196): each dropped gun as its icon, level and name, and DPS. A click
   * on one shows its details under the row (its kind and rarity, role and affixes, then the
   * stash count and anything thrown away); a second click closes them.
   */
  function gunSection(t: DropTile): HTMLElement {
    const section = el('section', 'debrief-guns');
    section.setAttribute('aria-label', 'Weapons dropped');
    const row = el('div', 'gun-row');
    const details = el('div', 'gun-details');
    details.id = 'hud-gun-details';
    details.hidden = true;
    const buttons = t.guns.map((g) => {
      const b = el('button', 'tile gun-chip');
      b.type = 'button';
      b.dataset.rarity = g.rarity;
      b.classList.toggle('gun-chip-lost', g.lost);
      b.setAttribute('aria-controls', details.id);
      b.setAttribute('aria-expanded', 'false');
      // The whole name on hover, as one line can end it in "…".
      b.title = g.short;
      // The gun's icon (ID-092), decoration only: its name is right beside it.
      const icon = el('span', 'tile-icon');
      const img = el('img', 'tile-icon-img gun-icon');
      img.alt = '';
      img.dataset.gun = g.icon.slice('weapon-'.length);
      img.src = ART_URLS[g.icon] ?? '';
      icon.append(img);
      // Two columns: the icon, then the level and gun over its DPS.
      const text = el('span', 'gun-chip-text');
      text.append(
        el('span', 'gun-chip-name', g.short),
        el('span', 'gun-chip-power', g.lost ? 'Thrown away' : g.power),
      );
      b.append(icon, text);
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') !== 'true';
        for (const other of buttons) other.setAttribute('aria-expanded', 'false');
        details.hidden = !open;
        if (!open) return;
        b.setAttribute('aria-expanded', 'true');
        details.replaceChildren(
          el('p', 'gun-details-name', g.short),
          ...g.lines.map((line) => el('p', '', line)),
          el('p', 'tile-stash', t.stash),
          ...(t.thrown ? [el('p', 'tile-thrown', t.thrown)] : []),
          ...(t.farmNote ? [el('p', 'tile-farm', t.farmNote)] : []),
        );
      });
      return b;
    });
    row.append(...buttons);
    section.append(row, details);
    return section;
  }

  /** The Squad section with no cards: `text` in their place. */
  function emptySection(text: string): HTMLElement {
    const section = el('section', 'debrief-squad');
    const head = el('div', 'debrief-squad-head');
    head.append(el('h3', 'debrief-squad-title', 'Squad'), bestGunsButton());
    section.append(head, el('p', 'debrief-empty', text));
    return section;
  }

  /** "Best gun for everyone" beside the Squad heading: the app listens for it. */
  function bestGunsButton(): HTMLButtonElement {
    const b = el('button', 'hud-button debrief-best-guns', BEST_GUNS);
    b.type = 'button';
    b.dataset.bestGuns = '';
    return b;
  }

  /** The debrief's Squad section with `cards`, and the start screen's Roster link (`roster`). */
  function squadSection(cards: readonly SquadCard[], roster?: Debrief['roster']): HTMLElement {
    const section = el('section', 'debrief-squad');
    const head = el('div', 'debrief-squad-head');
    head.append(el('h3', 'debrief-squad-title', 'Squad'), bestGunsButton());
    if (roster) {
      // Opens the Roster, where the squad is picked (ID-147): the app listens for it.
      const change = el('button', 'hud-button debrief-change-squad', roster.label);
      change.type = 'button';
      change.dataset.openRoster = '';
      head.append(change);
    }
    const grid = el('div', 'squad-grid');
    grid.append(...cards.map(squadCard));
    section.append(head, grid);
    if (roster?.line) section.append(el('p', 'debrief-hint debrief-bench', roster.line));
    return section;
  }

  /** One survivor in the Squad section (ID-196): their avatar and name, nothing else. */
  function squadCard(c: SquadCard): HTMLElement {
    const card = el('div', 'squad-card');
    card.dataset.defender = c.id;
    card.classList.toggle('squad-card-up', c.levelUp);
    // Decoration only: the name is right beside it.
    const frame = el('span', 'roster-avatar squad-card-avatar');
    const img = el('img', 'roster-avatar-img');
    img.alt = '';
    // No URL, no request: an empty src would fetch the page itself.
    const url = ART_URLS[c.art];
    if (url) img.src = url;
    frame.append(img);
    // The name opens their card in the Roster (ID-086): the app listens for it.
    const name = el('button', 'squad-card-name squad-card-open', c.name);
    name.type = 'button';
    name.dataset.openSurvivor = c.id;
    // The whole name on hover, as one line can end it in "…" (ID-111).
    name.title = c.name;
    name.setAttribute('aria-label', `${c.name}, level ${c.level}: open survivor card`);
    card.append(frame, name);
    if (c.levelUp) {
      // A triangle pointing up beside the name; a reader hears "Level up".
      const up = el('span', 'squad-up', '▲');
      up.setAttribute('role', 'img');
      up.setAttribute('aria-label', 'Level up');
      up.title = 'Level up';
      card.append(up);
    }
    if (c.fresh) markNew(card);
    return card;
  }

  /** Marks `card` as just accepted into the squad (ID-157): a "New" badge and outline. */
  function markNew(card: HTMLElement): void {
    if (card.classList.contains('squad-card-new')) return;
    card.classList.add('squad-card-new');
    card.append(el('span', 'squad-badge squad-badge-new', NEW_BADGE));
  }

  /**
   * Scrolls just enough that `card` sits whole in view (ID-157); a card taller than that
   * space shows from its top. The panel's body scrolls, or in a very short window the
   * whole panel does (page.css).
   */
  function reveal(card: HTMLElement): void {
    const gap = 8;
    const scroller = resultBody.scrollHeight > resultBody.clientHeight ? resultBody : result;
    const box = card.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    const top = frame.top + gap;
    const limit = frame.bottom - gap;
    if (box.top < top) scroller.scrollTop -= top - box.top;
    else if (box.bottom > limit) {
      scroller.scrollTop += Math.min(box.bottom - limit, box.top - top);
    }
  }

  /**
   * The camp's level-up offers, oldest first, one at a time; each pick goes out through
   * `onCampPick`. "Back to build" waits until none is left.
   */
  function campBlock(camp: CampScreen): void {
    const offer = camp.offers[0];
    back.disabled = offer !== undefined;
    if (!offer) {
      campPicker.replaceChildren();
      return;
    }
    const more = camp.offers.length > 1 ? ` (${camp.offers.length} to pick)` : '';
    const row = el('div', 'hud-card-row');
    const choose = (choice: CampChoice, button: HTMLButtonElement): void => {
      button.addEventListener('click', () => {
        if (result.hidden || button.disabled) return;
        const r = campAfterPick(camp, choice);
        if (!r.ok) return;
        onCampPick(choice);
        const room =
          choice === 'join'
            ? { people: camp.room.people - 1, weapons: camp.room.weapons - 1 }
            : camp.room;
        campBlock({ ...r.camp, room });
        (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? back).focus({
          preventScroll: true,
        });
      });
      row.append(button);
    };
    for (const id of offer.picks) {
      const button = el('button', 'hud-card hud-card-camp');
      button.type = 'button';
      button.append(el('span', 'hud-card-title', campPickText(camp, id)));
      choose(id, button);
    }
    if (offer.survivor) {
      // A survivor wants to join (design §11): taking a pick instead turns them away.
      const button = el('button', 'hud-card hud-card-camp');
      button.type = 'button';
      button.append(
        el('span', 'hud-card-title', `Survivor wants to join: ${survivorText(offer.survivor)}`),
      );
      const lock = roomLock(camp.room);
      if (lock !== null) {
        button.disabled = true;
        button.append(el('span', 'hud-card-body', lock));
      }
      choose('join', button);
      // With no pick left to take instead, turning them away answers the offer.
      if (offer.picks.length === 0) {
        const away = el('button', 'hud-card hud-card-camp');
        away.type = 'button';
        away.append(el('span', 'hud-card-title', `Turn ${offer.survivor.name} away`));
        choose('away', away);
      }
    }
    campPicker.replaceChildren(el('h3', 'hud-pick-heading', `Camp level up: pick one${more}`), row);
  }

  function showOffer(offer: Card[], state: HordeState): void {
    const heading = el('h2', 'hud-cards-title', 'Level up: pick one');
    const row = el('div', 'hud-card-row');
    offer.forEach((card, i) => {
      const { title, body, kind, synergy, pitch, spoken } = cardText(card, state);
      const rarity = card.kind === 'upgrade' ? ` hud-card-${UPGRADES[card.id].rarity}` : '';
      const swap = pitch?.replace ? ' hud-card-swap' : '';
      const button = el(
        'button',
        `hud-card hud-card-${card.kind}${rarity}${swap} hud-card-has-art`,
      );
      button.type = 'button';
      button.setAttribute('aria-label', `${i + 1}. ${spoken}`);
      // The card's icon (ID-103), or a recruit's own avatar, on a plate tinted by its
      // rarity; decoration only, as the label already names the card.
      const plate = el('span', 'hud-card-art');
      const img = el('img', 'hud-card-icon');
      img.src =
        ART_URLS[card.kind === 'upgrade' ? CARD_ICON[card.id] : avatarOf(card.defender)] ?? '';
      img.alt = '';
      plate.append(img);
      // Every card is one size, its parts in the same place (ID-195): the tag is a badge
      // on the plate's corner, and an ammo swap's warning and a synergy sit at the bottom.
      if (pitch) plate.append(el('span', 'hud-card-tag', pitch.tag));
      button.append(el('span', 'hud-card-key', String(i + 1)), plate);
      button.append(el('span', 'hud-card-title', title));
      if (kind) button.append(el('span', 'hud-card-kind', kind));
      button.append(pitch ? effectLine(pitch, body) : el('span', 'hud-card-body', body));
      const foot = el('span', 'hud-card-foot');
      if (synergy) foot.append(el('span', 'hud-card-synergy', synergy));
      // An ammo swap's loss in one red box (ID-097), always the card's last line (ID-195);
      // the card's own name and tag already say what you'd hold after, so it names only what goes.
      if (pitch?.replace) foot.append(el('span', 'hud-card-warning', pitch.replace.warning));
      if (foot.childElementCount > 0) button.append(foot);
      button.addEventListener('click', () => choose(i));
      row.append(button);
    });
    cards.replaceChildren(heading, row);
    if (perkOn(state, 'second-look')) {
      const lock = rerollLock(state);
      const reroll = el('button', 'hud-button hud-reroll', 'Reroll (Second Look)');
      reroll.type = 'button';
      reroll.disabled = lock !== null;
      reroll.title = lock ?? '';
      reroll.addEventListener('click', () => {
        if (!cards.hidden && picking === undefined && rerollLock(state) === null) onReroll();
      });
      cards.append(reroll);
    }
  }

  return {
    show(visible) {
      hud.hidden = !visible;
      if (!visible) toast.hidden = true;
    },
    /**
     * Screen px from the shop bar's top to the page's bottom, laid out even while the
     * HUD is hidden (no paint happens in between), or 0 where nothing is laid out.
     */
    bottomSpace() {
      const was = hud.hidden;
      hud.hidden = false;
      // Horde-only (ID-100): measured with the most skills a pick holds showing, so the
      // fight frame is the same whatever is picked and whether or not a screen is up. The
      // cash shop's buttons stay hidden (never shown in this build), and the aim caption
      // shows only while a skill is armed; everything is put back as it was.
      const shopWas = shop.hidden;
      const skillsWere = skillItems.map((s) => s.button.hidden);
      // The Auto toggle (ID-140) counts too, as it shows beside a picked Airstrike.
      const autoWas = autoButton.hidden;
      if (squad) {
        shop.hidden = false;
        skillItems.forEach((s, i) => (s.button.hidden = i >= SQUAD_SKILLS.max));
        autoButton.hidden = false;
      }
      const box = shop.getBoundingClientRect();
      shop.hidden = shopWas;
      skillItems.forEach((s, i) => (s.button.hidden = skillsWere[i]!));
      autoButton.hidden = autoWas;
      hud.hidden = was;
      // The HUD overlays the whole window, as the canvas does.
      return box.height > 0 ? window.innerHeight - box.top : 0;
    },
    topSpace() {
      if (!squad) return 0;
      // A chip for each card one horde can hold (one ammo card), laid out but never
      // painted, then the strip is put back as it was.
      const was = hud.hidden;
      const heldWas = held.hidden;
      const chips = [...heldRow.children];
      const focused = document.activeElement;
      hud.hidden = false;
      held.hidden = false;
      heldRow.replaceChildren(
        ...UPGRADE_IDS.filter((id) => !AMMO_CARDS.slice(1).includes(id)).map(() =>
          el('span', 'hud-held-card'),
        ),
      );
      const box = held.getBoundingClientRect();
      heldRow.replaceChildren(...chips);
      // A chip taken out of the page loses the keyboard: it goes back to it.
      if (focused instanceof HTMLElement && heldRow.contains(focused)) focused.focus();
      held.hidden = heldWas;
      hud.hidden = was;
      return box.height > 0 ? box.bottom + HELD_GAP : 0;
    },
    speed(now, paused) {
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(SPEEDS[i] === now)));
      // A toggle keeps its name (Pause); pressed says it's on (ID-165).
      pauseButton.setAttribute('aria-pressed', String(paused));
      pauseButton.title = paused ? 'Resume (Space)' : 'Pause (Space)';
      // While held, the chosen speed steps back, so the lit pause button reads as the state.
      speed.classList.toggle('hud-speed-held', paused);
      heldNow = paused;
      drawPause();
    },
    skipping(on) {
      if (skipChip.hidden === !on) return;
      skipChip.hidden = !on;
      speed.classList.toggle('hud-speed-skip', on);
      // The outlined 5× says why it is outlined: the chosen speed hasn't changed.
      const top = speedButtons[speedButtons.length - 1]!;
      if (on) top.title = SKIP_TITLE;
      else top.removeAttribute('title');
    },
    fighting(on) {
      fightOn = on;
      drawPause();
    },
    onPause(handler) {
      onPauseToggle = handler;
    },
    toast(text, ms = TOAST_MS) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, ms);
    },
    update(state, armed = null) {
      if (squad) {
        const status = squadStatus(state);
        if (corner.title !== status) corner.title = status;
        const num = String(state.hordeNumber);
        if (badgeNum.textContent !== num) badgeNum.textContent = num;
        badge.classList.toggle('hud-badge-boss-on', bossHorde(state));
        badge.setAttribute(
          'aria-label',
          `Horde ${state.hordeNumber}${bossHorde(state) ? ', boss horde' : ''}`,
        );
        // A swarm wave reads "Swarm" in red, in words too so it's never colour alone (ID-121).
        const swarmOn = swarmMarker(state);
        const wave = `${swarmOn ? 'Swarm · ' : ''}Wave ${Math.min(state.wave, state.waveCount)}/${state.waveCount} · ${thousands(enemiesLeft(state))} left`;
        if (waveLine.textContent !== wave) waveLine.textContent = wave;
        waveLine.classList.toggle('hud-corner-wave-swarm', swarmOn);
        const swaps = swapsText(state);
        swapsChip.hidden = swaps === null;
        if (swaps !== null && swapsChip.textContent !== swaps) swapsChip.textContent = swaps;
        // Fight time holds it while paused; real time keeps it readable at 3× and 5×.
        const fresh = swapNote(state);
        const at = performance.now();
        if (fresh !== null) {
          if (fresh !== noteShown) noteAt = at;
          noteShown = fresh;
        } else if (state.outcome !== 'fighting' || at - noteAt >= SWAP_NOTE.realMs) {
          noteShown = null;
        }
        swapNoteEl.hidden = noteShown === null;
        if (noteShown !== null && swapNoteEl.textContent !== noteShown) {
          swapNoteEl.textContent = noteShown;
        }
        const x = xpBar(state);
        if (xpLabel.textContent !== x.text) xpLabel.textContent = x.text;
        xpMeter.max = x.max;
        xpMeter.value = x.value;
        xpMeter.setAttribute('aria-label', x.label);
      } else {
        const status = statusText(state);
        if (bar.textContent !== status) bar.textContent = status;
      }
      const bars = bossBars(state);
      boss.hidden = bars.length === 0;
      bossRows.forEach((r, i) => {
        const b = bars[i];
        r.row.hidden = !b;
        if (!b) return;
        if (r.name.textContent !== b.name) r.name.textContent = b.name;
        if (r.cue.textContent !== (b.cue ?? '')) r.cue.textContent = b.cue ?? '';
        r.cue.hidden = b.cue === null;
        r.cue.classList.toggle('hud-boss-cue-winding', b.winding);
        if (r.hpText.textContent !== b.hpText) r.hpText.textContent = b.hpText;
        r.meter.max = b.maxHp;
        r.meter.value = b.hp;
      });
      const cue = swarmCue(state);
      swarm.hidden = cue === null;
      swarmEdgeEl.hidden = !swarmEdge(state);
      if (cue) {
        swarm.classList.toggle('hud-swarm-hit', cue.phase === 'hit');
        if (swarmTitle.textContent !== cue.title) swarmTitle.textContent = cue.title;
        if (swarmCount.textContent !== cue.count) swarmCount.textContent = cue.count;
        swarmCount.hidden = cue.count === '';
      }
      const falling = fallingText(state);
      if (warning.textContent !== falling) warning.textContent = falling;
      warning.hidden = falling === '';
      shopButtons(state).forEach((b, i) => showButton(shopItems[i]!, b));
      const skills = skillButtons(state, armed);
      skills.forEach((b, i) => {
        const item = skillItems[i]!;
        showButton(item, b);
        item.button.setAttribute('aria-pressed', String(b.armed));
        item.button.hidden = b.hidden;
        if (item.key.textContent !== (b.key ?? '')) item.key.textContent = b.key ?? '';
        item.key.hidden = b.key === null;
        if (b.key) item.button.setAttribute('aria-keyshortcuts', b.key);
        else item.button.removeAttribute('aria-keyshortcuts');
        // A brief pulse the moment it is ready again (ID-100), on fight time.
        if (item.cooling && !b.cooling && !b.hidden && !reducedMotion()) {
          item.button.classList.remove('hud-skill-ready');
          void item.button.offsetWidth;
          item.button.classList.add('hud-skill-ready');
        }
        item.cooling = b.cooling;
      });
      // The Auto toggle (ID-140) shows with the Airstrike button, whatever its cooldown or a pick.
      const strike = skills[SKILL_IDS.indexOf('airstrike')];
      autoButton.hidden = !strike || strike.hidden || !state.skills.includes('airstrike');
      const aiming = skills.find((b) => b.armed);
      const prompt = !aiming ? '' : offerHolds(state) ? AIM_HELD_PROMPT : AIM_PROMPT[aiming.skill];
      if (aimCaption.textContent !== prompt) aimCaption.textContent = prompt;
      aimCaption.hidden = !aiming;
      // Horde-only (ID-100): the skill row waits under the start or result screen.
      if (squad) shop.hidden = !result.hidden;
      // The cards held (ID-113): redrawn the moment a pick or an ammo swap changes them;
      // never built in the full game, which doesn't show them.
      // A running Field Repairs cost (ID-137) redraws it each second of its countdown.
      const heldKey = squad
        ? JSON.stringify([
            state.taken.map((id) => [id, state.cardLevels[id]]),
            Math.ceil(repairsLeft(state)),
          ])
        : '';
      const heldHidden = !squad || state.taken.length === 0 || !result.hidden;
      const heldRedraw = heldKey !== heldShown;
      if (heldRedraw) {
        heldShown = heldKey;
        drawHeld(heldCards(state));
      }
      if (held.hidden !== heldHidden) {
        held.hidden = heldHidden;
        if (heldHidden) showTip(null);
      }
      // Its height changes with a redraw, showing or hiding, or the window's width.
      if (heldRedraw || heldSpaceFor !== heldHidden) {
        heldSpaceFor = heldHidden;
        heldSpace();
      }

      // Redraw only when the offer, bench or free posts change (the sim clones each tick).
      const replaceKey = state.replace
        ? JSON.stringify([state.replace, state.bench, replacePosts(state).map((p) => p.id)])
        : '';
      if (replaceKey !== shownReplace) {
        shownReplace = replaceKey;
        replace.hidden = replaceKey === '';
        if (state.replace) {
          showReplace(state);
          replace.querySelector('button')?.focus();
        } else replace.replaceChildren();
      }

      // A level-up on the horde's last kill opens an offer in a fight that is already over
      // (ID-196): its cards would change nothing, so it never shows, and the result is
      // never drawn over an open pick.
      const offer = state.outcome === 'fighting' ? state.offer : null;
      // The sim clones its state each tick, so compare the offer by content.
      if (
        JSON.stringify(offer) !== JSON.stringify(shownOffer) ||
        `${state.rerolledWave}:${state.rerolls}` !== shownRerolled
      ) {
        shownOffer = offer;
        shownRerolled = `${state.rerolledWave}:${state.rerolls}`;
        // A new offer cuts a pick's confirm effect short; a closing one waits for it.
        if (offer) {
          endPick();
          // The offer takes the eye: an open card tip goes away (ID-113).
          showTip(null);
        }
        if (picking === undefined) {
          cards.hidden = offer === null;
          if (offer) showOffer(offer, state);
          else cards.replaceChildren();
        }
      }
    },
    hideResult() {
      result.hidden = true;
    },
    resultScrap(now) {
      for (const node of result.querySelectorAll<HTMLElement>('[title]')) {
        node.title = scrapNowText(node.title, now);
      }
    },
    showResult(screen) {
      const d = screen.debrief;
      resultTitle.textContent = screen.title;
      result.classList.toggle('hud-debrief', d !== undefined);
      if (d) result.dataset.kind = d.kind;
      else delete result.dataset.kind;
      // A debrief lays its lines out itself; anything else is the plain list.
      resultList.hidden = d !== undefined;
      resultList.replaceChildren(...(d ? [] : screen.lines.map((line) => el('li', '', line))));
      joinAnswers = [];
      back.classList.toggle('btn-primary', d !== undefined);
      headChips.replaceChildren(...(d ? debriefChips(d) : []));
      picker.replaceChildren(...(d ? debriefBlock(d) : []));
      // A new screen starts scannable: its details closed (ID-186).
      setDetails(false);
      back.textContent = screen.button;
      drawPicker(screen.picker);
      drawSkills(screen.skills);
      campBlock(screen.camp);
      result.hidden = false;
      if (squad) shop.hidden = true;
      // The next fight starts with every skill ready: no pulse carried over from this one.
      for (const item of skillItems) item.cooling = false;
      // A new screen starts at its top, not where the last one was scrolled to.
      result.scrollTop = 0;
      resultBody.scrollTop = 0;
      // Without scrolling: the footer's button would pull the panel past the drop tile.
      (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? back).focus({
        preventScroll: true,
      });
    },
    onHordePick(handler) {
      onPickHorde = handler;
    },
    showPicker(next) {
      if (!result.hidden) drawPicker(next);
    },
    onSkillPick(handler) {
      onPickSkill = handler;
    },
    onJoin(handler) {
      onAnswerJoin = handler;
    },
    onLeave(check) {
      canLeave = check;
    },
    showJoin(cards, keep) {
      drawJoin(cards, keep);
    },
    noteJoin(text) {
      if (!result.hidden) joinAnswers.push(text);
    },
    showJoined(c) {
      if (result.hidden) return;
      let card = [...picker.querySelectorAll<HTMLElement>('.squad-card')].find(
        (x) => x.dataset.defender === c.id,
      );
      if (card) markNew(card);
      else {
        card = squadCard({ ...c, fresh: true });
        const grid = picker.querySelector('.squad-grid');
        if (grid) grid.append(card);
        else {
          // A win with no level-up has only its "nobody levelled up" line: the section
          // becomes one with the newcomer's card.
          const section = squadSection([]);
          section.querySelector('.squad-grid')!.append(card);
          picker.querySelector('.debrief-squad')?.replaceWith(section);
        }
      }
      reveal(card);
    },
    onAutoStrike(handler) {
      autoHandler = handler;
    },
    showAutoStrike(on) {
      showAuto(on);
    },
    showSkills(next) {
      if (!result.hidden) drawSkills(next);
    },
    fightPower(line) {
      fightLine = line;
      showFightPower();
    },
    showSquad(ids) {
      if (result.hidden) return;
      for (const card of picker.querySelectorAll<HTMLElement>('.squad-card-new')) {
        if (card.dataset.defender !== undefined && !ids.has(card.dataset.defender)) card.remove();
      }
      // A win left with no card says so again (a win's cards are only level-ups otherwise).
      const grid = picker.querySelector('.squad-grid');
      if (result.dataset.kind === 'won' && grid && grid.children.length === 0) {
        grid.closest('.debrief-squad')?.replaceWith(emptySection(SQUAD_NO_LEVEL_UPS));
      }
    },
  };
}
