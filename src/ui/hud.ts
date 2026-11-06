// HUD over the canvas: status bar, the "camp is falling" warning, the 1-of-3 card
// panel, the replacement panel, the result panel with its stat-point picker, the horde
// cash shop row with the active skills, the commander's perks and Second Look's
// reroll, and a short toast (refused moves).
// Text reaches the page only through textContent.
import { affixText, gunPower, heldLabel, heldName, isOwned, type Held } from '../core/armoury.ts';
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
import { rerollLock, synergyOf, UPGRADES } from '../core/cards.ts';
import {
  BANK_CAP,
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
  SKILLS,
  STASH_CAP,
  STAT_NAMES,
  STATS,
  type EnemyKind,
  type CampPickId,
  type HorrorAbility,
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
  perkOn,
  type Breach,
  type Card,
  type DefenderSpec,
  type FightPostKind,
  type HordeState,
  type Injury,
  type Post,
} from '../core/horde.ts';
import { squadOf, squadResult, type SquadDrop } from '../core/hordeonly.ts';
import { isGun, professionOf } from '../core/loadout.ts';
import { advanceResearch } from '../core/research.ts';
import { replacePosts } from '../core/replace.ts';
import { buffLeft, isBuff, shopLock } from '../core/shop.ts';
import { skillLeft, skillLock } from '../core/skills.ts';
import { isLocked, levelOf, spend, unspentPoints } from '../core/stats.ts';
import { horrorAbility, waveCount, xpToNext } from '../core/waves.ts';
import { SPEEDS, type Speed } from '../storage/settings.ts';
import type { ButtonVariant } from './kit.ts';
import { setVariant } from './kit.ts';
import { ART_URLS, GUNNER_ART, SHOP_ICON, SKILL_ICON, type ArtId, type GunId } from './sprites.ts';

/** The key for each fight speed (ID-062): clear of the card keys 1 2 3 and the action bar's. */
export const SPEED_KEYS: Readonly<Record<Speed, string>> = { 1: 'A', 2: 'S', 3: 'D' };

/** How long a toast stays up. */
const TOAST_MS = 2000;

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
 * A card's words (design §8): an upgrade's rarity and category ("Rare behaviour"), and
 * the synergy it turns on, if any.
 */
export function cardText(
  card: Card,
  state: HordeState,
): { title: string; body: string; kind?: string; synergy?: string } {
  if (card.kind === 'recruit')
    return { title: `Recruit ${defenderLabel(card.defender)}`, body: 'Takes a free post' };
  const u = UPGRADES[card.id];
  const synergy = synergyOf(state, card.id);
  return {
    title: u.name,
    body: u.text,
    kind: `${capital(u.rarity)} ${u.category}`,
    ...(synergy ? { synergy: `Synergy — ${synergy}` } : {}),
  };
}

/** A level as a whole number, rounded down but never to 0 while any is left. */
export const wholeLeft = (n: number): number => (n > 0 ? Math.max(1, Math.floor(n)) : 0);

/** The battery bank as "Bank 420/1,000" (design §7); `cap` grows with research (ID-035). */
export const bankText = (charge: number, cap: number = BANK_CAP): string =>
  `Bank ${wholeLeft(charge).toLocaleString('en-US')}/${cap.toLocaleString('en-US')}`;

export function statusText(s: HordeState): string {
  return [
    s.boss ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
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
    s.boss ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
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
  value: number;
  max: number;
} {
  const max = xpToNext(s.level);
  return { label: `Fight Lv ${s.level} · ${s.xp}/${max} XP`, value: Math.min(s.xp, max), max };
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
): (HudButton & { skill: SkillId; armed: boolean })[] {
  return SKILL_IDS.map((skill) => {
    const lock = skillLock(s, skill);
    const left = skillLeft(s, skill);
    const { name, cost } = SKILLS[skill];
    return {
      skill,
      label: left > 0 ? `${name} ${Math.ceil(left)}s` : name,
      cost: left > 0 ? '' : String(cost),
      variant: variantOf(
        lock,
        () => skillLock({ ...s, cash: Infinity }, skill),
        !s.skills.includes(skill),
      ),
      disabled: lock !== null,
      reason: lock ?? AIM_HINT[SKILLS[skill].aim],
      armed: lock === null && skill === armed,
    };
  });
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
/** Each Mutated Horror goes by its ability (design §9, ID-024). */
const HORROR_NAME: Readonly<Record<HorrorAbility, string>> = {
  brood: 'Broodmother',
  charge: 'Rammer',
  regen: 'Regenerator',
};
/** "Mutated Horror: Broodmother". */
const horrorName = (ability: HorrorAbility): string =>
  `${ENEMY_NAME.horror}: ${HORROR_NAME[ability]}`;

/** The start button: "Start Horde 10 · Boss horde" for a boss horde. */
export const startLabel = (hordeNumber: number): string =>
  `Start Horde ${hordeNumber}${horrorAbility(hordeNumber) ? ' · Boss horde' : ''}`;

/** The boss bar while a Mutated Horror is on the field, else null. */
export function bossBar(s: HordeState): { label: string; hp: number; maxHp: number } | null {
  const e = s.enemies.find((x) => x.horror);
  if (!e?.horror) return null;
  const hp = wholeLeft(e.hp);
  return {
    label: `${horrorName(e.horror.ability)} · ${hp.toLocaleString('en-US')}/${e.maxHp.toLocaleString('en-US')}`,
    hp,
    maxHp: e.maxHp,
  };
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
  /** The horde-only panel laid out (ID-067): chips, loot, one card per survivor; else `lines`. */
  debrief?: Debrief;
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
  const affixes = s.weapon.affixes.map(affixText);
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
  const points = g.points ? ` · +${g.points} stat points` : '';
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
  return [found, ...drop.weapon.affixes.map(affixText)];
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
        s.boss
          ? `All ${s.waveCount} waves cleared · the ${horrorName(s.boss)} is dead`
          : `All ${s.waveCount} waves cleared`,
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
  const horror = s.enemies.find((e) => e.horror)?.horror;
  return {
    title: 'The camp fell',
    lines: [
      why,
      ...(horror ? [`The ${horrorName(horror.ability)} still stood`] : []),
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

/** "Military Rifle (+7% damage) · 17.2 dmg/s": a gun's name and affixes, and how hard it hits over time. */
export const gunLabel = (h: Held): string => `${heldLabel(h)} · ${gunPower(h).toFixed(1)} dmg/s`;

/**
 * A horde-only win's drop lines (ID-067), for the stash `game` had before it: the gun and
 * where it went, and with the stash full, the weakest weapon thrown away for it.
 */
export function squadDropLines(game: Pick<GameState, 'armoury'>, drop: SquadDrop): string[] {
  const { weapon, thrown } = drop;
  const got = `Weapon drop: ${gunLabel(weapon)}`;
  if (thrown === weapon) {
    return [
      got,
      `Stash full (${STASH_CAP}/${STASH_CAP}): the new ${heldName(weapon)} was no better than any gun in it, so it was thrown away`,
    ];
  }
  const count = game.armoury.length + (thrown ? 0 : 1);
  return [
    `${got} · into the stash (${count}/${STASH_CAP})`,
    ...(thrown ? [`Stash full: the weakest, the ${heldLabel(thrown)}, was thrown away`] : []),
  ];
}

/** "30.3 dmg/s · Prototype LMG (+12% damage)": a picker option, the number first so a closed select keeps it. */
export const gunOption = (h: Held): string => `${gunPower(h).toFixed(1)} dmg/s · ${heldLabel(h)}`;

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
  /** The gun's art for the tile's icon (ID-073): its survivor sprite, cropped to the gun. */
  icon: ArtId;
  /** "+7% damage, +21% magazine"; '' with none. */
  affixes: string;
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
    icon: GUNNER_ART[weapon.base as GunId].idle,
    affixes: weapon.affixes.map(affixText).join(', '),
    power: `${power.toFixed(1)} dmg/s`,
    stash: lost ? 'Stash full: thrown away' : `Stash ${count}/${STASH_CAP}`,
    lost,
    // "No better", not "weaker": a tie throws the drop away too.
    thrown: lost ? DROP_LOST_NOTE : thrown ? `Thrown away: ${heldName(thrown)}` : null,
  };
}

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

/** The horde-only screen before a horde (ID-066): who fights it, and its start button. */
export function squadStart(game: GameState): ResultScreen {
  const squad = squadOf(game);
  return {
    title: horrorAbility(game.hordeNumber)
      ? `Horde ${game.hordeNumber} · Boss horde`
      : `Horde ${game.hordeNumber}`,
    lines: [
      `Squad ${squad.length}/${SQUAD_CAP}: ${squad
        .map((d) => `${d.name} (level ${levelOf(d.xp).level})`)
        .join(', ')}`,
      `${waveCount(game.hordeNumber)} waves. Hold the wall. ${SQUAD_LOSS_RULE}`,
    ],
    button: startLabel(game.hordeNumber),
    squad: true,
    picks: [],
    camp: noCamp(game),
    debrief: {
      kind: 'start',
      chips: [
        ...(horrorAbility(game.hordeNumber) ? [{ text: 'Boss horde', tone: 'boss' as const }] : []),
        { text: `${waveCount(game.hordeNumber)} waves`, tone: 'ok' },
        { text: `Squad ${squad.length}/${SQUAD_CAP}`, tone: 'ok' },
      ],
      callout: null,
      note: null,
      drop: null,
      recruit: null,
      cards: squad.map((d) => plainCard(d)),
      foot: SQUAD_LOSS_RULE,
    },
  };
}

/**
 * The horde-only result screen (ID-066) for horde `s`, fought from `game`: a win's XP,
 * level-ups and the survivor joining (Horde 10's is the soft ending, with play going
 * on); a loss says where they got in and that the same horde comes again in full.
 */
export function squadScreen(game: GameState, s: HordeState): ResultScreen {
  if (s.outcome === 'fighting') throw new RangeError('squadScreen: the horde is still on');
  const { gains, joined, drop } = squadResult(game, s);
  if (s.outcome === 'won') {
    const picks: RosterDefender[] = [];
    for (const g of gains) {
      const d = game.roster.find((r) => r.id === g.id);
      if (!d) continue;
      const after = { ...d, xp: d.xp + g.xp, stats: { ...d.stats } };
      if (unspentPoints(after) > 0) picks.push(after);
    }
    const ending = s.hordeNumber === ENDING_HORDE;
    return {
      title: ending ? `You held Horde ${s.hordeNumber}` : `Horde ${s.hordeNumber} held`,
      lines: [
        s.boss
          ? `All ${s.waveCount} waves cleared · the ${horrorName(s.boss)} is dead`
          : `All ${s.waveCount} waves cleared`,
        ...gains.map(squadXpLine),
        joined
          ? `New survivor: ${joined.name} joins the squad for the next horde`
          : `Squad full (${SQUAD_CAP}/${SQUAD_CAP}): nobody new joins`,
        ...(drop ? squadDropLines(game, drop) : []),
        ...(ending ? ['The end, for now. The hordes keep coming: play on from the next one.'] : []),
      ],
      button: ending ? 'Continue' : startLabel(s.hordeNumber + 1),
      squad: true,
      picks,
      camp: noCamp(game),
      debrief: {
        kind: 'won',
        chips: [
          { text: `${s.waveCount}/${s.waveCount} waves`, tone: 'ok' },
          ...(s.boss ? [{ text: `${horrorName(s.boss)} dead`, tone: 'boss' as const }] : []),
        ],
        callout: null,
        note: ending
          ? 'The end, for now. The hordes keep coming: play on from the next one.'
          : null,
        drop: drop ? dropTile(game, drop) : null,
        recruit: joined
          ? { label: 'New survivor', name: joined.name, sub: 'Joins next horde', full: false }
          : {
              label: 'Squad',
              name: `${SQUAD_CAP}/${SQUAD_CAP} full`,
              sub: 'Nobody new joins',
              full: true,
            },
        cards: [
          ...gains.map((g): SquadCard => ({
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
          })),
          ...(joined ? [plainCard(joined, true)] : []),
        ],
        foot: picks.length > 0 ? SQUAD_POINTS_NOTE : '',
      },
    };
  }
  const inner = [...s.breaches].sort((a, b) => b.column - a.column).at(-1);
  const where = inner ? `They got in during wave ${inner.wave} of ${s.waveCount}` : 'They got in';
  const horror = s.enemies.find((e) => e.horror)?.horror;
  return {
    title: 'The wall fell',
    lines: [
      `${where} · nobody left standing`,
      ...(horror ? [`The ${horrorName(horror.ability)} still stood`] : []),
      'No XP on a loss',
      SQUAD_NO_DROP,
      `Horde ${s.hordeNumber} again: the whole squad back on their feet and the wall at full HP`,
    ],
    button: `Retry Horde ${s.hordeNumber}`,
    squad: true,
    picks: [],
    camp: noCamp(game),
    debrief: {
      kind: 'lost',
      chips: [
        { text: 'No XP on a loss', tone: 'warn' },
        { text: SQUAD_NO_DROP, tone: 'warn' },
      ],
      callout: {
        head: `${where} · nobody left standing`,
        sub: horror ? `The ${horrorName(horror.ability)} still stood` : null,
      },
      note: `Horde ${s.hordeNumber} again: the whole squad back on their feet and the wall at full HP`,
      drop: null,
      recruit: null,
      cards: squadOf(game).map((d) => plainCard(d)),
      foot: '',
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
  show(visible: boolean): void;
  /** Shows `text` for `ms` (2 s unless said). */
  toast(text: string, ms?: number): void;
  bottomSpace(): number;
} {
  const hud = el('div', 'hud');
  const bar = el('div', 'hud-bar hud-fight-bar');
  // The fight XP bar (ID-066), under the top bar in the horde-only build.
  const xp = el('div', 'hud-xp');
  const xpLabel = el('span', 'hud-xp-label');
  xpLabel.id = 'hud-xp-label';
  const xpMeter = el('meter', 'hud-xp-meter');
  xpMeter.min = 0;
  xpMeter.setAttribute('aria-labelledby', xpLabel.id);
  xp.append(xpLabel, xpMeter);
  xp.hidden = !squad;
  const boss = el('div', 'hud-boss');
  const bossLabel = el('span', 'hud-boss-label');
  bossLabel.id = 'hud-boss-label';
  const bossHp = el('meter', 'hud-boss-hp');
  bossHp.min = 0;
  bossHp.setAttribute('aria-labelledby', bossLabel.id);
  boss.append(bossLabel, bossHp);
  boss.hidden = true;
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
  foot.append(footNote, back);
  result.append(resultTitle, resultList, picker, gear, campPicker, foot);
  const toast = el('div', 'hud-toast');
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const shop = el('div', 'hud-shop');
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
  const skillItems = SKILL_IDS.map((skill) =>
    iconButton('hud-button hud-shop-item hud-skill', SKILL_ICON[skill], () => onArm(skill)),
  );
  // Each button starts in its tallest look (name · cost, locked with its note), so the
  // bar's measured height (`bottomSpace`) covers any fight's before the first update,
  // which redraws every button. The HUD stays hidden until then.
  const rest = [...SHOP_ITEMS.map((i) => SHOP[i]), ...SKILL_IDS.map((k) => SKILLS[k])];
  [...shopItems, ...skillItems].forEach((item, i) => {
    item.label.textContent = `${rest[i]!.name} · `;
    item.cost.textContent = String(rest[i]!.cost);
    setVariant(item.button, 'locked', LOCKED_NOTE);
  });
  cards.hidden = true;
  result.hidden = true;
  // No cash, shop or skills in the horde-only build (ID-066).
  shop.hidden = squad;
  hud.append(bar, xp, speed, boss, warning, toast, shop, cards, replace, result);
  root.append(hud);

  let shownOffer: Card[] | null = null;
  // Each result-screen picker's way to take a survivor spent elsewhere (ID-086), by id.
  const pickSync = new Map<string, (d: RosterDefender) => void>();
  // Second Look's reroll can deal the same three cards; its button still has to grey out.
  let shownRerolled = '';
  // Hide the panel at once: a second click or key before the next frame must not
  // pick from an offer the player hasn't seen yet.
  function choose(index: number): void {
    if (cards.hidden || !shownOffer?.[index]) return;
    cards.hidden = true;
    shownOffer = null;
    onChoose(index);
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
        button.title = STAT_HINT[b.stat];
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
        block.replaceChildren(count, buttons);
        return;
      }
      block.replaceChildren(el('p', 'hud-pick-heading', row.heading), buttons);
    };
    draw();
    return block;
  }

  /** The horde-only panel's body (ID-067): header chips, loot, then one card per survivor. */
  function debriefBlock(d: Debrief, picks: readonly RosterDefender[]): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (d.chips.length > 0) {
      const chips = el('div', 'debrief-chips');
      for (const c of d.chips) {
        const chip = el('span', 'chip', c.text);
        chip.dataset.tone = c.tone;
        chips.append(chip);
      }
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
        // The gun's icon (ID-073), decoration only: its name is right beside it.
        const icon = el('div', 'tile-icon');
        const img = el('img', 'tile-icon-img');
        img.alt = '';
        img.src = ART_URLS[t.icon] ?? '';
        icon.append(img);
        const id = el('div', 'tile-drop-id');
        id.append(
          el('p', 'tile-label tile-rarity', `Weapon drop · ${t.rarityName}`),
          el('p', 'tile-name', t.name),
        );
        if (t.affixes) id.append(el('p', 'tile-sub', t.affixes));
        const head = el('div', 'tile-drop-head');
        head.append(icon, id);
        tile.append(head, power);
        if (t.thrown) tile.append(el('p', 'tile-thrown', t.thrown));
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
      if (picks.length > 0) {
        head.append(el('p', 'debrief-hint', statHints()));
      }
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
        (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? back).focus();
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
      const { title, body, kind, synergy } = cardText(card, state);
      const rarity = card.kind === 'upgrade' ? ` hud-card-${UPGRADES[card.id].rarity}` : '';
      const button = el('button', `hud-card hud-card-${card.kind}${rarity}`);
      button.type = 'button';
      button.append(el('span', 'hud-card-key', String(i + 1)), el('span', 'hud-card-title', title));
      if (kind) button.append(el('span', 'hud-card-kind', kind));
      button.append(el('span', 'hud-card-body', body));
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
        if (!cards.hidden && rerollLock(state) === null) onReroll();
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
      const box = shop.getBoundingClientRect();
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
      const status = squad ? squadStatus(state) : statusText(state);
      if (bar.textContent !== status) bar.textContent = status;
      if (squad) {
        const x = xpBar(state);
        if (xpLabel.textContent !== x.label) xpLabel.textContent = x.label;
        xpMeter.max = x.max;
        xpMeter.value = x.value;
      }
      const horror = bossBar(state);
      boss.hidden = horror === null;
      if (horror) {
        if (bossLabel.textContent !== horror.label) bossLabel.textContent = horror.label;
        bossHp.max = horror.maxHp;
        bossHp.value = horror.hp;
      }
      const falling = fallingText(state);
      if (warning.textContent !== falling) warning.textContent = falling;
      warning.hidden = falling === '';
      shopButtons(state).forEach((b, i) => showButton(shopItems[i]!, b));
      skillButtons(state, armed).forEach((b, i) => {
        showButton(skillItems[i]!, b);
        skillItems[i]!.button.setAttribute('aria-pressed', String(b.armed));
      });

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
        cards.hidden = state.offer === null;
        if (state.offer) showOffer(state.offer, state);
        else cards.replaceChildren();
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
      gear.replaceChildren();
      campBlock(screen.camp);
      result.hidden = false;
      // A new screen starts at its top, not where the last one was scrolled to.
      result.scrollTop = 0;
      // A horde-only screen with points to spend starts on the picker, so Enter doesn't skip it.
      const firstStat = screen.squad
        ? picker.querySelector<HTMLButtonElement>('.hud-pick-stat:enabled')
        : null;
      (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? firstStat ?? back).focus();
    },
    syncPicks(picks) {
      for (const p of picks) pickSync.get(p.id)?.(p);
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
        const slot = slots.get(row.id);
        if (slot) {
          // The card names them already: the label is for screen readers.
          const label = el('label', 'sr-only', `${row.name}'s gun`);
          label.htmlFor = select.id;
          slot.replaceChildren(label, select);
          return;
        }
        const line = el('div', 'hud-gear-row');
        const label = el('label', 'hud-gear-name', row.name);
        label.htmlFor = select.id;
        line.append(label, select);
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
