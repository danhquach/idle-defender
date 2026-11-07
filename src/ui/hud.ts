// HUD over the canvas: status bar, the "camp is falling" warning, the 1-of-3 card
// panel, the replacement panel, the result panel with its stat-point picker, the horde
// cash shop row with the active skills, the commander's perks and Second Look's
// reroll, and a short toast (refused moves).
// Text reaches the page only through textContent.
import {
  affixLines,
  baseOf,
  gunLevel,
  gunPower,
  heldName,
  isOwned,
  levelName,
  roleLine,
  roleOf,
  type Held,
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
import { pitch, rerollLock, synergyOf, UPGRADES, type CardPitch } from '../core/cards.ts';
import {
  BANK_CAP,
  BOSS_SKILL,
  BOSSES,
  HORROR,
  CAMP_PICK_RANKS,
  CAMP_PICKS,
  ENDING_HORDE,
  FALL_WARNING,
  GAS_PER_WIN,
  HORDE_ONLY,
  MATERIALS,
  PERKS,
  PROFESSIONS,
  RARITIES,
  SHOP,
  SHOP_ITEMS,
  SKILL_IDS,
  SQUAD_CAP,
  SQUAD_SKILLS,
  SKILLS,
  STASH_CAP,
  OPEN_STATS,
  STAT_NAMES,
  STATS,
  type EnemyKind,
  type CampPickId,
  type BossSkill,
  type Rarity,
  type ShopItem,
  type SkillId,
  type Stat,
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
  perkOn,
  skillPower,
  windingUp,
  type Enemy,
  type Breach,
  type Card,
  type DefenderSpec,
  type FightPostKind,
  type HordeState,
  type Injury,
  type Post,
} from '../core/horde.ts';
import { isReplay, squadOf, squadResult, type SquadDrop } from '../core/hordeonly.ts';
import { isGun, professionOf } from '../core/loadout.ts';
import { advanceResearch } from '../core/research.ts';
import { replacePosts } from '../core/replace.ts';
import { buffLeft, isBuff, shopLock } from '../core/shop.ts';
import { skillLeft, skillLock } from '../core/skills.ts';
import { powerBand, recommendedPower, squadPower, type PowerBand } from '../core/squadpower.ts';
import { isLocked, levelOf, spend, unspentPoints } from '../core/stats.ts';
import { horrorAbility, waveCount, xpToNext, type BossSpec } from '../core/waves.ts';
import { SPEEDS, type Speed } from '../storage/settings.ts';
import type { ButtonVariant } from './kit.ts';
import { setVariant } from './kit.ts';
import { holdable, holdRepeat } from './hold.ts';
import { nextGains, nextPointText } from './statlines.ts';
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
export const SPEED_KEYS: Readonly<Record<Speed, string>> = { 1: 'A', 2: 'S', 3: 'D' };

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

/** The horde-only top bar (ID-066): "Horde 3 · Waves cleared 1/5 · 12 left in this wave". */
export function squadStatus(s: HordeState): string {
  const cleared = s.outcome === 'won' ? s.waveCount : s.wave - 1;
  const left = enemiesLeft(s);
  return [
    bossHorde(s) ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
    `Waves cleared ${cleared}/${s.waveCount}`,
    `${left} left in this wave`,
  ].join(' · ');
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
  row: 'Then click a row to carpet bomb (Esc to cancel)',
  none: 'Thrown across the field at once',
} as const;

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
    const power = skillPower(s) > 1 ? ` ×${skillPower(s)}` : '';
    return {
      skill,
      label: left > 0 ? `${name}${power} ${Math.ceil(left)}s` : `${name}${power}`,
      cost: left > 0 || free ? '' : String(cost),
      variant: variantOf(
        lock,
        () => skillLock({ ...s, cash: Infinity }, skill),
        !s.skills.includes(skill),
      ),
      disabled: lock !== null,
      reason: lock ?? `${AIM_HINT[SKILLS[skill].aim]}${key ? ` (key ${key})` : ''}`,
      armed: lock === null && skill === armed,
      hidden: free && slot < 0,
      key,
      cooling: left > 0,
    };
  });
}

/**
 * Over the skill row while a row skill is armed (ID-100), until it is used or put away:
 * touch screens show no tooltip.
 */
export const AIM_PROMPT = 'Tap a row to bomb it · tap Airstrike again to cancel';

/**
 * A fight key's name (ID-100): a letter key by its place (`KeyQ` is Q on any layout), so
 * the speed and skill keys never both fire from one press; anything else by what it types.
 */
export const fightKeyName = (e: Pick<KeyboardEvent, 'code' | 'key'>): string =>
  /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key.toUpperCase();

/** The fight's skill keys in the horde-only build (ID-100), left to right: clear of A S D, Space and the card keys. */
export const SKILL_KEYS: readonly string[] = ['Q', 'W'];

/** The fight's skills as their buttons stand, left to right (ID-100): `SKILL_KEYS` follow it. */
export const skillSlots = (s: Pick<HordeState, 'skills'>): SkillId[] =>
  SKILL_IDS.filter((k) => s.skills.includes(k));

/** What each skill does, for the pick before a horde (ID-100); `boost` is its ×2 line, picked alone. */
const SKILL_BLURB: Readonly<Record<SkillId, { does: string; boost: string }>> = {
  flashbang: {
    does: `Stuns, ${SKILLS.flashbang.count} bursts`,
    boost: `×${SQUAD_SKILLS.solo}: ${SKILLS.flashbang.count * SQUAD_SKILLS.solo} bursts`,
  },
  molotov: { does: 'Fire on the ground', boost: `×${SQUAD_SKILLS.solo}: burns twice as hard` },
  airstrike: { does: 'Bombs a row you pick', boost: `×${SQUAD_SKILLS.solo}: hits twice as hard` },
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
  /** "×2: 8 bursts" on the one skill picked alone; null otherwise. */
  boost: string | null;
  /** "25s cooldown" */
  cooldown: string;
}

/** The skill pick before a horde (ID-100): each skill, and a line on the pick's power. */
export interface SkillPick {
  options: SkillChoice[];
  /** "×2 power: Molotov alone works twice as hard", or how many more may be picked. */
  note: string;
  /** Exactly one is picked: it works ×2. */
  solo: boolean;
}

export function skillPicker(pick: readonly SkillId[]): SkillPick {
  const solo = pick.length === 1;
  const full = pick.length >= SQUAD_SKILLS.max;
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
        boost: picked && solo ? blurb.boost : null,
        cooldown: `${SKILLS[skill].cooldown}s cooldown`,
      };
    }),
    note: solo
      ? `×${SQUAD_SKILLS.solo} power: ${SKILLS[pick[0]!].name} alone works twice as hard`
      : pick.length === 0
        ? `Pick up to ${SQUAD_SKILLS.max}. Just 1 works twice as hard`
        : `${SQUAD_SKILLS.max} picked. Drop one for ×${SQUAD_SKILLS.solo} power`,
    solo,
  };
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

/** The start button: "Start Horde 10 · Boss horde" for a boss horde. */
export const startLabel = (hordeNumber: number): string =>
  `Start Horde ${hordeNumber}${horrorAbility(hordeNumber) ? ' · Boss horde' : ''}`;

/** A beaten horde's button (ID-098): "Replay Horde 5", with the boss suffix as `startLabel`. */
export const replayLabel = (hordeNumber: number): string =>
  `Replay Horde ${hordeNumber}${horrorAbility(hordeNumber) ? ' · Boss horde' : ''}`;

/** A lost horde's button: "Retry Horde 5", with the boss suffix as `startLabel`. */
export const retryLabel = (hordeNumber: number): string =>
  `Retry Horde ${hordeNumber}${horrorAbility(hordeNumber) ? ' · Boss horde' : ''}`;

const thousands = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The word for a band, shown beside the colour so colour is never the only cue (ID-098). */
export const BAND_WORD: Readonly<Record<PowerBand, string>> = {
  ok: 'ok',
  close: 'close',
  short: 'short',
};

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
  /** The option's text: "Horde 7 (new) · Boss · rec 1,400 · short". */
  label: string;
  /** The screen's button once this is picked: "Start Horde 7", "Replay Horde 5". */
  button: string;
  power: PowerLine;
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
  game: Pick<GameState, 'roster' | 'hordeNumber'>,
  picked: number = game.hordeNumber,
  retry: number | null = null,
  retitle = false,
): HordePicker {
  const squad = squadPower(game);
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
      label: [
        `Horde ${n}${isNew ? ' (new)' : ''}`,
        ...(boss ? ['Boss'] : []),
        `rec ${thousands(power.rec)}`,
        BAND_WORD[power.band],
        ...(n === farm ? ['best to farm'] : []),
      ].join(' · '),
      button: n === retry ? retryLabel(n) : isNew ? startLabel(n) : replayLabel(n),
      power,
      hint:
        power.band === 'ok'
          ? null
          : farm !== null
            ? `Try Horde ${farm} to farm`
            : 'No beaten horde is at your power yet',
      start: {
        title: `Horde ${n}${boss ? ' · Boss horde' : ''}${isNew ? '' : ' · Replay'}`,
        chips: [
          ...(boss ? [{ text: 'Boss horde', tone: 'boss' as const }] : []),
          ...(isNew ? [] : [{ text: 'Replay', tone: 'ok' as const }]),
          { text: `${waveCount(n)} waves`, tone: 'ok' as const },
          { text: `Squad ${squadOf(game).length}/${SQUAD_CAP}`, tone: 'ok' as const },
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
/** Whether the "Swarm!" cue shows: a swarm wave's first `SWARM_CUE` s of spawning. */
export const swarmCue = (
  s: Pick<HordeState, 'swarm' | 'outcome' | 'time' | 'breakUntil'>,
): boolean =>
  s.swarm &&
  s.outcome === 'fighting' &&
  s.time >= s.breakUntil &&
  s.time < s.breakUntil + SWARM_CUE;
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
  /** The horde-only panel laid out (ID-067): chips, loot, one card per survivor; else `lines`. */
  debrief?: Debrief;
  /** The horde picker beside the button (ID-098); the button's label follows the pick. */
  picker?: HordePicker;
  /** The skill pick for the next horde (ID-100), horde-only. */
  skills?: SkillPick;
  /** Defenders from a win with stat points to spend, XP added. */
  picks: RosterDefender[];
  /**
   * Camp-level picks and the offers to pick from before "Back to build" (design §11),
   * with the room left after the horde for a survivor to join.
   */
  camp: CampScreen;
}

export type CampScreen = Pick<Camp, 'picks' | 'offers'> & { room: Room };

/** A survivor (design §10) as "Ava · level 3 · Instinct 2, Agility 4 · Military Rifle (+10% damage)". */
export function survivorText(s: Survivor): string {
  const stats = STATS.filter((st) => s.stats[st] > 0).map((st) => statText(st, s.stats[st]));
  const affixes = affixLines(s.weapon, true);
  return [
    s.name,
    `level ${levelOf(s.xp).level}`,
    ...(stats.length > 0 ? [stats.join(', ')] : []),
    heldName(s.weapon) + (affixes.length > 0 ? ` (${affixes.join(', ')})` : ''),
  ].join(' · ');
}

/** What each stat does in full, for a stat button's tooltip (design §6, ID-084). */
export const STAT_HINT: Readonly<Record<Stat, string>> = {
  instinct: 'More HP and armour on every hit, and a chance to survive a downing hit at 1 HP',
  agility: 'Faster reloads',
  mind: 'Better gun accuracy, and more and harder crits with any weapon',
  tinker: 'Unlocks later: repair, turrets, batteries and crafting',
};

/** A stat button's tooltip for `d` (ID-096): what the stat does, then what the next point adds. */
export const statHint = (d: RosterDefender, stat: Stat): string =>
  isLocked(stat) ? STAT_HINT[stat] : `${STAT_HINT[stat]}. ${nextPointText(d, stat)}`;

/**
 * What the next point in each open stat adds for `d` (ID-096), one line per stat, shown
 * under a picker's buttons while points are left: "Instinct: +3 max HP · +0.13 armour ·
 * +1.0% survive". None once spent out.
 */
export function gainLines(d: RosterDefender): string[] {
  if (unspentPoints(d) <= 0) return [];
  return OPEN_STATS.map((s) => `${STAT_NAMES[s]}: ${nextGains(d, s).join(' · ')}`);
}

/** `gainLines` as a list, or nothing. */
function gainList(d: RosterDefender): HTMLElement[] {
  const lines = gainLines(d);
  if (lines.length === 0) return [];
  const list = el('ul', 'hud-pick-gains');
  list.setAttribute('aria-label', 'Next point adds');
  for (const line of lines) {
    // Lines wrap only between gains, never inside one ("+1.0% survive" stays whole).
    const li = el('li', '');
    line.split(' · ').forEach((part, i) => {
      if (i > 0) li.append(' · ');
      li.append(el('span', 'hud-pick-gain', part));
    });
    list.append(li);
  }
  return [list];
}

/** What each stat does in a few words, for the picker's one-line hint. */
export const STAT_SHORT: Readonly<Record<Stat, string>> = {
  instinct: 'more HP and armour',
  agility: 'faster reloads',
  mind: 'accuracy and crits',
  tinker: 'unlocks later',
};

/** What a locked stat (ID-084: Tinker) says in place of its points. */
export const STAT_LOCKED_NOTE = 'Unlocks later';

/** A locked stat's button: short, so it fits its cell like the others. */
export const lockedLabel = (stat: Stat): string => `${STAT_NAMES[stat]} (locked)`;

/** "Instinct 2"; a locked stat is "Tinker (unlocks later)". */
export const statText = (stat: Stat, points: number): string =>
  isLocked(stat)
    ? `${STAT_NAMES[stat]} (${STAT_LOCKED_NOTE.toLowerCase()})`
    : `${STAT_NAMES[stat]} ${points}`;

/** The picker's line on what each stat does: "Instinct: more HP and armour · …". */
export const statHints = (): string =>
  STATS.map((st) => `${STAT_NAMES[st]}: ${STAT_SHORT[st]}`).join(' · ');

/** One defender's row in the stat picker. */
export interface PickerRow {
  heading: string;
  buttons: { stat: Stat; label: string; disabled: boolean }[];
}

/**
 * The picker row for `d`: name, points left, a button per stat. A horde-only survivor's
 * (`squad`) buttons say they add a point. A locked stat (ID-084: Tinker) shows greyed out.
 */
export function pickerRow(d: RosterDefender, squad = false): PickerRow {
  const left = unspentPoints(d);
  return {
    heading: `${d.name} · ${left} stat point${left === 1 ? '' : 's'} to spend`,
    buttons: STATS.map((stat) => ({
      stat,
      // A horde-only button says it adds a point: "+ Instinct (2)".
      label: isLocked(stat)
        ? lockedLabel(stat)
        : squad
          ? `+ ${STAT_NAMES[stat]} (${d.stats[stat]})`
          : `${STAT_NAMES[stat]} ${d.stats[stat]}`,
      disabled: left <= 0 || isLocked(stat),
    })),
  };
}

/** "Bob +25 XP · level 2 (10/50) · +3 stat points". */
function xpLine(g: ReturnType<typeof levelGains>[number], tag: string): string {
  const points = g.points ? ` · +${g.points} stat point${g.points === 1 ? '' : 's'}` : '';
  return `${tag} +${g.xp} XP · level ${g.level} (${g.into}/${g.next})${points}`;
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
    const picks: RosterDefender[] = [];
    for (const g of gains) {
      const d = game.roster.find((r) => r.id === g.id);
      lines.push(xpLine(g, g.name));
      if (!d) continue;
      const after = { ...d, xp: d.xp + g.xp, stats: { ...d.stats } };
      if (unspentPoints(after) > 0) picks.push(after);
    }
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
      picks,
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
    picks: [],
    camp,
  };
}

/** The camp screen of a horde-only result: no camp-level offers ever come. */
const noCamp = (game: GameState): CampScreen => ({
  picks: game.camp.picks,
  offers: [],
  room: roomOf(game),
});

/** "Ava +30 XP · level 2 · 5/50 XP to level 3 · level up! +3 stat points". */
function squadXpLine(g: ReturnType<typeof levelGains>[number]): string {
  const up = g.levels > 0 ? ` · level up! +${g.points} stat point${g.points === 1 ? '' : 's'}` : '';
  return `${g.name} +${g.xp} XP · level ${g.level} · ${g.into}/${g.next} XP to level ${g.level + 1}${up}`;
}

/** "Lv 12 Military Rifle (+7% damage)": a gun's level, name and affixes (ID-098). */
export const levelLabel = (h: Held): string =>
  isOwned(h) && h.affixes.length
    ? `${levelName(h)} (${affixLines(h, true).join(', ')})`
    : levelName(h);

/** "Lv 12 Military Rifle (+7% damage) · 17.2 dmg/s": a gun's name and affixes, and how hard it hits over time. */
export const gunLabel = (h: Held): string => `${levelLabel(h)} · ${gunPower(h).toFixed(1)} dmg/s`;

/**
 * A horde-only win's drop lines (ID-067), for the stash `game` had before it: the gun and
 * where it went, and with the stash full, the weakest weapon thrown away for it.
 */
export function squadDropLines(game: Pick<GameState, 'armoury'>, drop: SquadDrop): string[] {
  const { weapon, thrown } = drop;
  const got = `Weapon drop (${DROP_KIND[drop.kind]}): ${gunLabel(weapon)}`;
  const farm = drop.noUpgrades ? [farmText(drop.farmFrom)] : [];
  if (thrown === weapon) {
    return [
      got,
      `Stash full (${STASH_CAP}/${STASH_CAP}): the new ${levelName(weapon)} was no better than any gun in it, so it was thrown away`,
      ...farm,
    ];
  }
  const count = game.armoury.length + (thrown ? 0 : 1);
  return [
    `${got} · into the stash (${count}/${STASH_CAP})`,
    ...(thrown ? [`Stash full: the weakest, the ${levelLabel(thrown)}, was thrown away`] : []),
    ...farm,
  ];
}

/**
 * "30.3 dmg/s · Lv 4 Prototype LMG · Suppression (+12% damage)": a picker option, the number
 * first so a closed select keeps it, then the gun and its role (ID-101), then its affixes.
 */
export const gunOption = (h: Held): string => {
  const role = roleOf(baseOf(h));
  const affixes = affixLines(h, true);
  return `${gunPower(h).toFixed(1)} dmg/s · ${levelName(h)}${role ? ` · ${role.role}` : ''}${
    affixes.length > 0 ? ` (${affixes.join(', ')})` : ''
  }`;
};

/** One survivor's gun picker (ID-067): who, what they can hold, and what they hold now. */
export interface GearRow {
  id: string;
  name: string;
  /** The free pistol and every gun in the stash or their hands, strongest first. */
  options: { value: string; label: string }[];
  /** The option they hold now: `pistol` or a weapon's uid. */
  value: string;
  /** The rarity of the gun they hold (the free pistol is Common). */
  rarity: Rarity;
  /** "Marksman: +10% crit chance": the held gun's role and trait (ID-101). */
  role: string;
}

export interface GearScreen {
  heading: string;
  rows: GearRow[];
}

/**
 * The horde-only gun pickers between hordes (ID-067), one per survivor in the squad: the
 * pistol, the stash's guns and the gun they hold, strongest first by `gunPower`.
 */
export function squadGear(game: GameState): GearScreen {
  const stash = game.armoury.filter(isGun);
  return {
    heading: `Stash ${game.armoury.length}/${STASH_CAP}`,
    rows: squadOf(game).map((d) => {
      // What they fight with: a primary that is no gun fights as the pistol (squadSpec).
      const held = isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';
      const choices: Held[] = ['pistol', ...(isOwned(held) ? [held] : []), ...stash];
      return {
        id: d.id,
        name: d.name,
        options: choices
          .map((h) => ({ h, power: gunPower(h) }))
          .sort((a, b) => b.power - a.power)
          .map(({ h }) => ({ value: isOwned(h) ? h.uid : 'pistol', label: gunOption(h) })),
        value: isOwned(held) ? held.uid : 'pistol',
        rarity: isOwned(held) ? held.rarity : 'common',
        role: roleLine(baseOf(held)) ?? '',
      };
    }),
  };
}

/** A small labelled pill in the debrief's header: its text and colour. */
export interface Chip {
  text: string;
  tone: 'ok' | 'boss' | 'warn';
}

/** A win's weapon drop as the debrief's loot tile (ID-067). */
export interface DropTile {
  rarity: Rarity;
  /** "Military" */
  rarityName: string;
  /** "Rifle" */
  name: string;
  /** "Lv 12" (ID-098) */
  level: string;
  /** Which kind of drop it was (ID-098): "First clear", "Replay" or "Guaranteed upgrade". */
  kind: string;
  /** The kind chip's tone: a guaranteed upgrade stands out, a first clear is milder. */
  kindTone: 'ok' | 'warn' | 'plain';
  /** Where to go for upgrades when no gun this horde drops would beat the weakest held; else null. */
  farmNote: string | null;
  /** The gun's icon (ID-092), as the Inventory shows it. */
  icon: ArtId;
  /** "+7% damage, +21% magazine"; '' with none. A role affix is marked "(role)" (ID-101). */
  affixes: string;
  /** "Marksman: +10% crit chance": the gun's role and built-in trait (ID-101). */
  role: string;
  /** "17.2 dmg/s" */
  power: string;
  /** "Stash 15/20", or "Stash full: thrown away" when the drop itself went. */
  stash: string;
  /** The drop was thrown away (the stash full of better guns). */
  lost: boolean;
  /** "Thrown away: Rusty Pistol", `DROP_LOST_NOTE` when the drop itself went, or null. */
  thrown: string | null;
}

/** The survivor joining, or the squad full, as the debrief's second tile. */
export interface RecruitTile {
  label: string;
  name: string;
  sub: string;
  /** The squad is full: nobody joins. */
  full: boolean;
}

/** One survivor's card: who, their level, and on a win what it gave. */
export interface SquadCard {
  id: string;
  name: string;
  level: number;
  /** XP this win gave; null off a win. */
  xp: number | null;
  levelUp: boolean;
  /** XP into the level, as a share and as text; null off a win. */
  bar: { pct: number; text: string } | null;
  /** Joins for the next horde (a win's new survivor). */
  joining: boolean;
}

/** The horde-only panel laid out (ID-067), for the start, win and loss screens. */
export interface Debrief {
  kind: 'start' | 'won' | 'lost';
  chips: Chip[];
  /** A loss: where they got in, and any horror still standing. */
  callout: { head: string; sub: string | null } | null;
  /** A plain line under the header (the ending, a loss's retry). */
  note: string | null;
  drop: DropTile | null;
  recruit: RecruitTile | null;
  cards: SquadCard[];
  /** The footer's line beside the button ('' for none). */
  foot: string;
}

/** A card for `d` off a win, or with no gain. */
const plainCard = (d: RosterDefender, joining = false): SquadCard => ({
  id: d.id,
  name: d.name,
  level: levelOf(d.xp).level,
  xp: null,
  levelUp: false,
  bar: null,
  joining,
});

/** The loot tile for `drop`, against the stash `game` had before it. */
export function dropTile(game: Pick<GameState, 'armoury'>, drop: SquadDrop): DropTile {
  const { weapon, thrown } = drop;
  const lost = thrown === weapon;
  const count = game.armoury.length + (thrown ? 0 : 1);
  // First, so anything but a gun is refused with its own error.
  const power = gunPower(weapon);
  return {
    rarity: weapon.rarity,
    rarityName: RARITIES[weapon.rarity].name,
    name: WEAPONS[weapon.base].name,
    level: `Lv ${gunLevel(weapon)}`,
    kind: DROP_KIND[drop.kind],
    kindTone: KIND_TONE[drop.kind],
    farmNote: drop.noUpgrades ? farmText(drop.farmFrom) : null,
    icon: GUN_ICON[weapon.base as GunId],
    affixes: affixLines(weapon).join(', '),
    role: roleLine(weapon.base) ?? '',
    power: `${power.toFixed(1)} dmg/s`,
    stash: lost ? 'Stash full: thrown away' : `Stash ${count}/${STASH_CAP}`,
    lost,
    // "No better", not "weaker": a tie throws the drop away too.
    thrown: lost ? DROP_LOST_NOTE : thrown ? `Thrown away: ${levelName(thrown)}` : null,
  };
}

/** What a drop tile says about its kind (ID-098). */
export const DROP_KIND: Readonly<Record<SquadDrop['kind'], string>> = {
  first: 'First clear',
  replay: 'Replay',
  guaranteed: 'Guaranteed upgrade',
};

const KIND_TONE: Readonly<Record<SquadDrop['kind'], 'ok' | 'warn' | 'plain'>> = {
  first: 'ok',
  replay: 'plain',
  guaranteed: 'warn',
};

/** A replay where nothing the horde drops could beat the weakest held gun: where to go (ID-098). */
export const farmText = (farmFrom: number | null): string =>
  farmFrom === null ? 'Beat a new horde for upgrades' : `Farm Horde ${farmFrom}+ for upgrades`;

/** Under a drop the full stash threw away itself (ID-073). */
export const DROP_LOST_NOTE = 'No better than any gun in the stash';

/** A loss's chip and line (ID-073): nothing drops after a loss. */
export const SQUAD_NO_DROP = 'No weapon drop on a loss';

/** How a horde-only horde is lost (ID-066, design §2), for the start screen and Help. */
export const SQUAD_LOSS_RULE = 'You lose if they break through and every survivor is down.';

/** Over the squad's cards (ID-086): a name opens that survivor's card in the Roster. */
export const SQUAD_CARD_HINT = 'Tap a name to see their card and what each point adds.';

/** Under the horde-only stat picker: points not spent now aren't lost. */
export const SQUAD_POINTS_NOTE = 'Unspent points are kept for later.';

/**
 * The horde-only screen before a horde (ID-066): who fights it, its start button, and the
 * horde picker (ID-098) with `picked` selected (the next new horde by default).
 */
export function squadStart(game: GameState, picked: number = game.hordeNumber): ResultScreen {
  const squad = squadOf(game);
  const picker = hordePicker(game, picked, null, true);
  const now = picker.options.find((o) => o.horde === picker.value)!;
  return {
    title: now.start.title,
    lines: [
      `Squad ${squad.length}/${SQUAD_CAP}: ${squad
        .map((d) => `${d.name} (level ${levelOf(d.xp).level})`)
        .join(', ')}`,
      `${waveCount(now.horde)} waves. Hold the wall. ${SQUAD_LOSS_RULE}`,
    ],
    button: now.button,
    squad: true,
    picker,
    skills: skillPicker(game.skillPick),
    picks: [],
    camp: noCamp(game),
    debrief: {
      kind: 'start',
      chips: now.start.chips,
      callout: null,
      note: null,
      drop: null,
      recruit: null,
      cards: squad.map((d) => plainCard(d)),
      foot: SQUAD_LOSS_RULE,
    },
  };
}

/** A loss's XP, as its chip and line say it (ID-098). */
export const lossXpText = (xp: number): string =>
  xp > 0 ? `+${xp} XP each` : 'No XP: no wave cleared';

/**
 * The horde-only result screen (ID-066) for horde `s`, fought from `game`: a win's XP,
 * level-ups and the survivor joining (a first clear only; Horde 10's is the soft ending,
 * with play going on); a replay's win says so and adds nobody. A loss says where they got
 * in, the small XP it paid (ID-098) and that the horde comes again in full. The picker
 * (ID-098) starts on the next new horde after a first clear, else on the same horde; its
 * bands read the squad as `game` holds it, so the app redraws it once the win is saved.
 */
export function squadScreen(game: GameState, s: HordeState): ResultScreen {
  if (s.outcome === 'fighting') throw new RangeError('squadScreen: the horde is still on');
  const { gains, joined, drop } = squadResult(game, s);
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
  const picks: RosterDefender[] = [];
  for (const g of gains) {
    const d = game.roster.find((r) => r.id === g.id);
    if (!d) continue;
    const next = { ...d, xp: d.xp + g.xp, stats: { ...d.stats } };
    if (unspentPoints(next) > 0) picks.push(next);
  }
  const xpCards = (): SquadCard[] =>
    gains.map((g): SquadCard => ({
      id: g.id,
      name: g.name,
      level: g.level,
      xp: g.xp,
      levelUp: g.levels > 0,
      bar: {
        pct: g.next > 0 ? Math.min(100, (100 * g.into) / g.next) : 100,
        text: `${g.into}/${g.next} XP to Lv ${g.level + 1}`,
      },
      joining: false,
    }));
  if (won) {
    const ending = first && s.hordeNumber === ENDING_HORDE;
    return {
      title: ending
        ? `You held Horde ${s.hordeNumber}`
        : replay
          ? `Horde ${s.hordeNumber} held (replay)`
          : `Horde ${s.hordeNumber} held`,
      lines: [
        clearedLine(s),
        ...gains.map(squadXpLine),
        ...(replay
          ? []
          : [
              joined
                ? `New survivor: ${joined.name} joins the squad for the next horde`
                : `Squad full (${SQUAD_CAP}/${SQUAD_CAP}): nobody new joins`,
            ]),
        ...(drop ? squadDropLines(game, drop) : []),
        ...(ending ? ['The end, for now. The hordes keep coming: play on from the next one.'] : []),
      ],
      button: ending ? 'Continue' : goOn,
      squad: true,
      picker,
      skills: skillPicker(game.skillPick),
      picks,
      camp: noCamp(game),
      debrief: {
        kind: 'won',
        chips: [
          { text: `${s.waveCount}/${s.waveCount} waves`, tone: 'ok' },
          ...bossFates(s).map((f) => ({ text: `${f.name} dead`, tone: 'boss' as const })),
        ],
        callout: null,
        note: ending
          ? 'The end, for now. The hordes keep coming: play on from the next one.'
          : null,
        drop: drop ? dropTile(game, drop) : null,
        // A replay brings nobody: only a first clear's tile says who joins.
        recruit: replay
          ? null
          : joined
            ? { label: 'New survivor', name: joined.name, sub: 'Joins next horde', full: false }
            : {
                label: 'Squad',
                name: `${SQUAD_CAP}/${SQUAD_CAP} full`,
                sub: 'Nobody new joins',
                full: true,
              },
        cards: [...xpCards(), ...(joined && !replay ? [plainCard(joined, true)] : [])],
        foot: picks.length > 0 ? SQUAD_POINTS_NOTE : '',
      },
    };
  }
  const inner = [...s.breaches].sort((a, b) => b.column - a.column).at(-1);
  const where = inner ? `They got in during wave ${inner.wave} of ${s.waveCount}` : 'They got in';
  const bossLost = lostBossLines(s);
  const xp = gains[0]?.xp ?? 0;
  const again = `Horde ${s.hordeNumber} again, or an easier horde to farm XP and guns: the squad is back on their feet and the wall at full HP`;
  return {
    title: 'The wall fell',
    lines: [
      `${where} · nobody left standing`,
      ...bossLost,
      lossXpText(xp),
      ...(xp > 0 ? gains.map(squadXpLine) : []),
      SQUAD_NO_DROP,
      again,
    ],
    button: goOn,
    squad: true,
    picker,
    skills: skillPicker(game.skillPick),
    picks,
    camp: noCamp(game),
    debrief: {
      kind: 'lost',
      chips: [
        { text: lossXpText(xp), tone: 'warn' },
        { text: SQUAD_NO_DROP, tone: 'warn' },
      ],
      callout: {
        head: `${where} · nobody left standing`,
        // One line per boss (pre-line in page.css).
        sub: bossLost.length > 0 ? bossLost.join('\n') : null,
      },
      note: again,
      drop: null,
      recruit: null,
      cards: xp > 0 ? xpCards() : squadOf(game).map((d) => plainCard(d)),
      foot: picks.length > 0 ? SQUAD_POINTS_NOTE : '',
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
  onSpend: (defenderId: string, stat: Stat) => void,
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
  showResult(screen: ResultScreen): void;
  /** The horde-only gun pickers (ID-067) on the result or start screen; each pick goes to `onEquip`. */
  showGear(gear: GearScreen, onEquip: (defenderId: string, choice: string) => void): void;
  /**
   * The result screen's pickers redrawn for `picks` (ID-086): points spent on a survivor's
   * card in the Roster count here too.
   */
  syncPicks(picks: readonly RosterDefender[]): void;
  /** Where a horde picked from the picker goes (ID-098); the app sets it once. */
  onHordePick(handler: (horde: number) => void): void;
  /** The picker redrawn (ID-098), its bands read off the squad as it stands now. */
  showPicker(picker: HordePicker): void;
  /** Where a skill toggled in the skill pick goes (ID-100); the app sets it once. */
  onSkillPick(handler: (skill: SkillId) => void): void;
  /** The skill pick redrawn (ID-100) once the app has saved a toggle. */
  showSkills(pick: SkillPick): void;
  /** Squad Power against Recommended Power for the fight's corner (ID-098); null hides it. */
  fightPower(line: PowerLine | null): void;
  show(visible: boolean): void;
  /** Shows `text` for `ms` (2 s unless said). */
  toast(text: string, ms?: number): void;
  bottomSpace(): number;
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
  cornerPanel.append(waveLine, xpRow, powerRow);
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
  const swarm = el('div', 'hud-swarm', 'Swarm!');
  swarm.setAttribute('role', 'status');
  swarm.hidden = true;
  // Fight speed and the Space pause (ID-062), top right beside the Menu button.
  const speed = el('div', 'hud-speed');
  speed.setAttribute('role', 'group');
  speed.setAttribute('aria-label', 'Game speed');
  // Its key tag says how to resume.
  const pausedChip = el('span', 'menu-chip', 'Paused');
  pausedChip.append(el('kbd', 'menu-key', 'Space'));
  pausedChip.setAttribute('role', 'status');
  pausedChip.hidden = true;
  const speedButtons = SPEEDS.map((sp) => {
    const button = el('button', 'hud-speed-button');
    button.type = 'button';
    button.append(`${sp}×`, el('kbd', 'menu-key', SPEED_KEYS[sp]));
    button.setAttribute('aria-keyshortcuts', SPEED_KEYS[sp]);
    button.addEventListener('click', () => onSpeed(sp));
    return button;
  });
  speed.append(pausedChip, ...speedButtons);
  const warning = el('div', 'hud-warning');
  warning.setAttribute('role', 'alert');
  warning.hidden = true;
  const cards = el('div', 'hud-panel hud-cards');
  const replace = el('div', 'hud-panel hud-replace');
  replace.hidden = true;
  const result = el('div', 'hud-panel hud-result');
  const resultTitle = el('h2', 'hud-result-title');
  const resultList = el('ul', 'hud-result-list');
  const picker = el('div', 'hud-picker');
  // Holding a + stat button keeps adding points (ID-096).
  holdRepeat(picker);
  const campPicker = el('div', 'hud-picker');
  const gear = el('div', 'hud-picker hud-gear');
  const back = el('button', 'hud-button');
  back.type = 'button';
  back.addEventListener('click', () => {
    // Hide at once so a double click can't finish the same horde twice.
    if (result.hidden || back.disabled) return;
    result.hidden = true;
    onDone();
  });
  // The button sits in a footer: a horde-only panel pins it, with a line beside it (ID-067).
  const foot = el('div', 'hud-result-foot');
  const footNote = el('p', 'hud-result-foot-note');
  // The horde picker (ID-098), above the button it labels.
  const pickBlock = el('div', 'hud-horde-pick');
  pickBlock.hidden = true;
  // The skill pick for the next horde (ID-100), above the horde picker.
  const skillBlock = el('div', 'hud-skill-pick');
  skillBlock.setAttribute('role', 'group');
  skillBlock.hidden = true;
  let onPickSkill: (skill: SkillId) => void = () => {};
  foot.append(skillBlock, pickBlock, footNote, back);
  let onPickHorde: (horde: number) => void = () => {};
  result.append(resultTitle, resultList, picker, gear, campPicker, foot);
  const toast = el('div', 'hud-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const shop = el('div', 'hud-shop');
  // The armed row skill's caption (ID-100), on its own line above the buttons.
  const aimCaption = el('p', 'hud-aim-caption', AIM_PROMPT);
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
  // the name with ×2 and a key (ID-100).
  if (squad) {
    for (const item of skillItems) {
      item.label.textContent = `${item.label.textContent!.replace(' · ', '')} ×${SQUAD_SKILLS.solo}`;
      item.cost.textContent = '';
      item.key.textContent = SKILL_KEYS[0]!;
      item.key.hidden = false;
      setVariant(item.button, 'secondary', '');
    }
  }
  cards.hidden = true;
  result.hidden = true;
  hud.append(bar, speed, boss, swarm, warning, toast, shop, cards, replace, result);
  root.append(hud);

  let shownOffer: Card[] | null = null;
  // Each result-screen picker's way to take a survivor spent elsewhere (ID-086), by id.
  const pickSync = new Map<string, (d: RosterDefender) => void>();
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

  /** One defender's picker; each click spends a point here and through `onSpend`. */
  function pickerBlock(start: RosterDefender, squadPicks = false): HTMLElement {
    const block = el('div', squadPicks ? 'hud-pick squad-pick' : 'hud-pick');
    let d = start;
    pickSync.set(start.id, (next) => {
      d = next;
      draw();
    });
    const draw = (): void => {
      const row = pickerRow(d, squadPicks);
      const buttons = el('div', 'hud-pick-row');
      row.buttons.forEach((b, i) => {
        const button = el('button', 'hud-button hud-pick-stat', b.label);
        button.type = 'button';
        button.disabled = b.disabled;
        // A locked stat's label already says it unlocks later.
        if (squadPicks && !isLocked(b.stat)) {
          const now = d.stats[b.stat];
          button.setAttribute('aria-label', `Add ${STAT_NAMES[b.stat]} to ${d.name}, now ${now}`);
        }
        button.title = statHint(d, b.stat);
        holdable(button, `${d.id}:${b.stat}`);
        button.addEventListener('click', () => {
          if (result.hidden) return;
          const r = spend(d, b.stat);
          if (!r.ok) return;
          d = r.defender;
          onSpend(d.id, b.stat);
          draw();
          // Keep the keyboard where it was; a spent-out row moves on to the next picker
          // with points left (wrapping round), then to the screen's button.
          const again = block.querySelectorAll('button')[i];
          const open = [...picker.querySelectorAll<HTMLButtonElement>('.hud-pick-stat')].filter(
            (x) => !x.disabled,
          );
          const after = open.find(
            (x) => block.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
          (again && !again.disabled ? again : (after ?? open[0] ?? back)).focus();
        });
        buttons.append(button);
      });
      if (squadPicks) {
        // A survivor card's points row (ID-067): the count, then the buttons.
        const left = unspentPoints(d);
        // Spent out reads a bare "0" (ID-083): the card has no room for a sentence.
        // A hidden " points" keeps the unit for screen readers.
        const count = el(
          'p',
          'squad-points',
          left > 0 ? `${left} point${left === 1 ? '' : 's'}` : '0',
        );
        if (left <= 0) count.append(el('span', 'sr-only', ' points'));
        count.classList.toggle('squad-points-none', left === 0);
        block.replaceChildren(count, buttons, ...gainList(d));
        return;
      }
      block.replaceChildren(el('p', 'hud-pick-heading', row.heading), buttons, ...gainList(d));
    };
    draw();
    return block;
  }

  const chipNodes = (list: readonly Chip[]): HTMLElement[] =>
    list.map((c) => {
      const chip = el('span', 'chip', c.text);
      chip.dataset.tone = c.tone;
      return chip;
    });

  /**
   * The skill pick (ID-100): a toggle per skill, pressed when picked, and a line on the
   * pick's power. A third skill can't be added while two are picked. A toggle goes to
   * `onPickSkill`; the app redraws it with the pick it saved.
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
    const label = el('span', 'hud-horde-label', `Skills (up to ${SQUAD_SKILLS.max})`);
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
        : [o.detail, o.cooldown, ...(o.boost ? [o.boost] : [])].join(' · ');
      const img = el('img', 'hud-icon');
      img.src = ART_URLS[SKILL_ICON[o.skill]] ?? '';
      img.alt = '';
      const head = el('span', 'hud-skill-option-head');
      head.append(img, el('span', 'hud-skill-option-name', o.name));
      button.append(
        head,
        el('span', 'hud-skill-option-detail', o.detail),
        el('span', 'hud-skill-option-detail', o.cooldown),
        ...(o.boost ? [el('span', 'hud-skill-option-boost', o.boost)] : []),
      );
      button.addEventListener('click', () => {
        if (result.hidden) return;
        onPickSkill(o.skill);
      });
      row.append(button);
    }
    const note = el('p', 'hud-skill-note', p.note);
    note.classList.toggle('hud-skill-note-solo', p.solo);
    note.setAttribute('role', 'status');
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
    const hint = el('p', 'hud-horde-hint');
    const choice = (): HordeChoice => p.options.find((o) => String(o.horde) === select.value)!;
    const sync = (): void => {
      const o = choice();
      lineText.textContent = o.power.text;
      band.textContent = BAND_WORD[o.power.band];
      line.dataset.band = o.power.band;
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
        picker.querySelector('.debrief-chips')?.replaceChildren(...chipNodes(o.start.chips));
      }
      onPickHorde(o.horde);
    });
    pickBlock.replaceChildren(label, select, line, hint);
    if (had) select.focus();
  }

  /** The horde-only panel's body (ID-067): header chips, loot, then one card per survivor. */
  function debriefBlock(d: Debrief, picks: readonly RosterDefender[]): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (d.chips.length > 0) {
      const chips = el('div', 'debrief-chips');
      chips.append(...chipNodes(d.chips));
      parts.push(chips);
    }
    if (d.callout) {
      const callout = el('div', 'debrief-callout');
      callout.append(el('p', 'debrief-callout-head', d.callout.head));
      if (d.callout.sub) callout.append(el('p', 'debrief-callout-sub', d.callout.sub));
      parts.push(callout);
    }
    if (d.note) parts.push(el('p', 'debrief-note', d.note));
    if (d.drop || d.recruit) {
      const spoils = el('div', 'debrief-spoils');
      if (d.drop) {
        const t = d.drop;
        const tile = el('div', 'tile tile-drop');
        tile.dataset.rarity = t.rarity;
        tile.classList.toggle('tile-drop-lost', t.lost);
        const power = el('div', 'tile-row');
        const stash = el('span', 'tile-stash', t.stash);
        stash.classList.toggle('tile-stash-lost', t.lost);
        power.append(el('span', 'tile-power', t.power), stash);
        // The gun's icon (ID-092), decoration only: its name is right beside it.
        const icon = el('div', 'tile-icon');
        const img = el('img', 'tile-icon-img gun-icon');
        img.alt = '';
        img.dataset.gun = t.icon.slice('weapon-'.length);
        img.src = ART_URLS[t.icon] ?? '';
        icon.append(img);
        const id = el('div', 'tile-drop-id');
        const name = el('p', 'tile-name');
        name.append(el('span', 'tile-level', t.level), ` ${t.name}`);
        const kind = el('span', 'chip tile-kind', t.kind);
        kind.dataset.tone = t.kindTone;
        id.append(kind, el('p', 'tile-label tile-rarity', `Weapon drop · ${t.rarityName}`), name);
        if (t.role) id.append(el('p', 'tile-sub tile-role', t.role));
        if (t.affixes) id.append(el('p', 'tile-sub', t.affixes));
        const head = el('div', 'tile-drop-head');
        head.append(icon, id);
        tile.append(head, power);
        if (t.thrown) tile.append(el('p', 'tile-thrown', t.thrown));
        if (t.farmNote) tile.append(el('p', 'tile-farm', t.farmNote));
        spoils.append(tile);
      }
      if (d.recruit) {
        const tile = el('div', 'tile tile-recruit');
        tile.classList.toggle('tile-recruit-full', d.recruit.full);
        tile.append(
          el('p', 'tile-label', d.recruit.label),
          el('p', 'tile-name', d.recruit.name),
          el('p', 'tile-sub', d.recruit.sub),
        );
        spoils.append(tile);
      }
      parts.push(spoils);
    }
    if (d.cards.length > 0) {
      const section = el('section', 'debrief-squad');
      const head = el('div', 'debrief-squad-head');
      const heading = el('h3', 'debrief-squad-title', 'Squad');
      heading.append(el('span', 'debrief-stash'));
      head.append(heading);
      head.append(el('p', 'debrief-hint', SQUAD_CARD_HINT));
      const grid = el('div', 'squad-grid');
      for (const c of d.cards) {
        const card = el('div', 'squad-card');
        card.dataset.defender = c.id;
        card.classList.toggle('squad-card-up', c.levelUp);
        const top = el('div', 'squad-card-head');
        const who = el('span', 'squad-card-who');
        // The name opens their card in the Roster (ID-086): the app listens for it.
        const name = el('button', 'squad-card-name squad-card-open', c.name);
        name.type = 'button';
        name.dataset.openSurvivor = c.id;
        name.setAttribute('aria-label', `${c.name}: open survivor card`);
        who.append(name, el('span', 'squad-card-level', `Lv ${c.level}`));
        if (c.levelUp) who.append(el('span', 'squad-badge squad-badge-up', 'Level up'));
        if (c.joining) who.append(el('span', 'squad-badge squad-badge-new', 'New'));
        top.append(who);
        if (c.xp !== null) top.append(el('span', 'squad-card-xp', `+${c.xp} XP`));
        card.append(top);
        if (c.bar) {
          const track = el('div', 'xp-track');
          track.setAttribute('aria-hidden', 'true');
          const fill = el('div', 'xp-fill');
          fill.style.width = `${c.bar.pct}%`;
          track.append(fill);
          card.append(track, el('p', 'squad-card-xptext', c.bar.text));
        }
        card.append(el('div', 'squad-card-gear'));
        const pick = picks.find((p) => p.id === c.id);
        if (pick) card.append(pickerBlock(pick, true));
        grid.append(card);
      }
      section.append(head, grid);
      parts.push(section);
    }
    return parts;
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
      button.append(el('span', 'hud-card-key', String(i + 1)), plate);
      button.append(el('span', 'hud-card-title', title));
      if (pitch) button.append(el('span', 'hud-card-tag', pitch.tag));
      // An ammo swap's loss, read right after the tag, in one red box (ID-097).
      if (pitch?.replace) {
        const warning = el('span', 'hud-card-warning', pitch.replace.warning);
        warning.append(el('span', 'hud-card-swap-line', pitch.replace.swap));
        button.append(warning);
      }
      if (kind) button.append(el('span', 'hud-card-kind', kind));
      button.append(pitch ? effectLine(pitch, body) : el('span', 'hud-card-body', body));
      if (synergy) button.append(el('span', 'hud-card-synergy', synergy));
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
      if (squad) {
        shop.hidden = false;
        skillItems.forEach((s, i) => (s.button.hidden = i >= SQUAD_SKILLS.max));
      }
      const box = shop.getBoundingClientRect();
      shop.hidden = shopWas;
      skillItems.forEach((s, i) => (s.button.hidden = skillsWere[i]!));
      hud.hidden = was;
      // The HUD overlays the whole window, as the canvas does.
      return box.height > 0 ? window.innerHeight - box.top : 0;
    },
    speed(now, paused) {
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(SPEEDS[i] === now)));
      pausedChip.hidden = !paused;
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
        const wave = `Wave ${Math.min(state.wave, state.waveCount)}/${state.waveCount} · ${thousands(enemiesLeft(state))} left`;
        if (waveLine.textContent !== wave) waveLine.textContent = wave;
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
      swarm.hidden = !swarmCue(state);
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
      const aiming = skills.some((b) => b.armed && SKILLS[b.skill].aim === 'row');
      aimCaption.hidden = !aiming;
      // Horde-only (ID-100): the skill row waits under the start or result screen.
      if (squad) shop.hidden = !result.hidden;

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

      // The sim clones its state each tick, so compare the offer by content.
      if (
        JSON.stringify(state.offer) !== JSON.stringify(shownOffer) ||
        `${state.rerolledWave}:${state.rerolls}` !== shownRerolled
      ) {
        shownOffer = state.offer;
        shownRerolled = `${state.rerolledWave}:${state.rerolls}`;
        // A new offer cuts a pick's confirm effect short; a closing one waits for it.
        if (state.offer) endPick();
        if (picking === undefined) {
          cards.hidden = state.offer === null;
          if (state.offer) showOffer(state.offer, state);
          else cards.replaceChildren();
        }
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
      footNote.textContent = d?.foot ?? '';
      back.classList.toggle('btn-primary', d !== undefined);
      pickSync.clear();
      picker.replaceChildren(
        ...(d
          ? debriefBlock(d, screen.picks)
          : screen.picks.length
            ? [
                el('p', 'hud-result-body', statHints()),
                ...screen.picks.map((d) => pickerBlock(d, screen.squad === true)),
                ...(screen.squad ? [el('p', 'hud-pick-note', SQUAD_POINTS_NOTE)] : []),
              ]
            : []),
      );
      back.textContent = screen.button;
      drawPicker(screen.picker);
      drawSkills(screen.skills);
      gear.replaceChildren();
      campBlock(screen.camp);
      result.hidden = false;
      if (squad) shop.hidden = true;
      // The next fight starts with every skill ready: no pulse carried over from this one.
      for (const item of skillItems) item.cooling = false;
      // A new screen starts at its top, not where the last one was scrolled to.
      result.scrollTop = 0;
      // A horde-only screen with points to spend starts on the picker, so Enter doesn't skip it.
      const firstStat = screen.squad
        ? picker.querySelector<HTMLButtonElement>('.hud-pick-stat:enabled')
        : null;
      // Without scrolling: the sticky footer's button would pull the panel past the drop tile.
      (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? firstStat ?? back).focus({
        preventScroll: true,
      });
    },
    syncPicks(picks) {
      for (const p of picks) pickSync.get(p.id)?.(p);
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
    showSkills(next) {
      if (!result.hidden) drawSkills(next);
    },
    fightPower(line) {
      fightLine = line;
      showFightPower();
    },
    showGear(screen, onEquip) {
      // A redraw after a pick keeps the keyboard on the same survivor's picker.
      const active = document.activeElement;
      const focused =
        active instanceof HTMLSelectElement && result.contains(active)
          ? active.dataset.defender
          : undefined;
      // Each survivor's card has a slot for their gun; one without a card goes in a list.
      const slots = new Map<string, HTMLElement>();
      for (const card of picker.querySelectorAll<HTMLElement>('.squad-card')) {
        const slot = card.querySelector<HTMLElement>('.squad-card-gear');
        if (card.dataset.defender !== undefined && slot) slots.set(card.dataset.defender, slot);
      }
      const loose: HTMLElement[] = [];
      screen.rows.forEach((row, i) => {
        const select = el('select', 'build-select hud-gear-select');
        select.id = `hud-gear-${i}`;
        select.dataset.defender = row.id;
        select.dataset.rarity = row.rarity;
        for (const o of row.options) {
          const option = el('option', '', o.label);
          option.value = o.value;
          select.append(option);
        }
        select.value = row.value;
        // The full label on hover, for one a narrow select cuts short.
        select.title = select.selectedOptions[0]?.textContent ?? '';
        select.addEventListener('change', () => {
          if (result.hidden) return;
          onEquip(row.id, select.value);
        });
        // The held gun's role and trait (ID-101), under the picker and read with it.
        const role = el('p', 'hud-gear-role', row.role);
        role.id = `hud-gear-role-${i}`;
        if (row.role) select.setAttribute('aria-describedby', role.id);
        const slot = slots.get(row.id);
        if (slot) {
          // The card names them already: the label is for screen readers.
          const label = el('label', 'sr-only', `${row.name}'s gun`);
          label.htmlFor = select.id;
          slot.replaceChildren(label, select, role);
          return;
        }
        const line = el('div', 'hud-gear-row');
        const label = el('label', 'hud-gear-name', row.name);
        label.htmlFor = select.id;
        line.append(label, select, role);
        loose.push(line);
      });
      const stash = picker.querySelector<HTMLElement>('.debrief-stash');
      if (stash) stash.textContent = screen.heading;
      gear.replaceChildren(
        ...(loose.length > 0 || !stash ? [el('h3', 'hud-pick-heading', screen.heading)] : []),
        ...loose,
      );
      if (focused !== undefined) {
        [...result.querySelectorAll<HTMLSelectElement>('select')]
          .find((x) => x.dataset.defender === focused)
          ?.focus();
      }
    },
  };
}
