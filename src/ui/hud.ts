// HUD over the canvas: status bar, the "camp is falling" warning, the 1-of-3 card
// panel, the replacement panel, the result panel with its stat-point picker, the horde
// cash shop row with the active skills, the commander's perks and Second Look's
// reroll, and a short toast (refused moves).
// Text reaches the page only through textContent.
import { affixText, heldName } from '../core/armoury.ts';
import { repairAllCost, type PostKind } from '../core/base.ts';
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
  FALL_WARNING,
  GAS_PER_WIN,
  MATERIALS,
  PERKS,
  PROFESSIONS,
  SHOP,
  SHOP_ITEMS,
  SKILL_IDS,
  SKILLS,
  STAT_NAMES,
  STATS,
  type EnemyKind,
  type CampPickId,
  type HorrorAbility,
  type Profession,
  type ShopItem,
  type SkillId,
  type Stat,
  type Stock,
} from '../core/data.ts';
import {
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
  type HordeState,
  type Injury,
  type Post,
} from '../core/horde.ts';
import { professionOf } from '../core/loadout.ts';
import { replacePosts } from '../core/replace.ts';
import { buffLeft, isBuff, shopLock } from '../core/shop.ts';
import { skillLeft, skillLock } from '../core/skills.ts';
import {
  levelOf,
  nameTag,
  spend,
  titleIn,
  titleName,
  unspentPoints,
  type Title,
} from '../core/stats.ts';
import { horrorAbility, xpToNext } from '../core/waves.ts';
import type { ButtonVariant } from './kit.ts';
import { setVariant } from './kit.ts';
import { ART_URLS, SHOP_ICON, SKILL_ICON, type ArtId } from './sprites.ts';

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

export const POST_NAME: Readonly<Record<PostKind, string>> = {
  tower: 'Tower',
  'wall-walk': 'Wall-walk post',
  ground: 'Ground post',
};
export const slotName = (column: number, row: number): string =>
  `Layer ${column + 1}, row ${row + 1}`;
/** A wall-walk spot's name on its segment, top to bottom: "spot 1", "spot 2". */
export const spotName = (spot: number): string => `spot ${spot + 1}`;
export const postName = (p: Pick<Post, 'kind' | 'column' | 'row' | 'spot'>): string =>
  `${POST_NAME[p.kind]} · ${slotName(p.column, p.row)}` +
  (p.kind === 'wall-walk' ? `, ${spotName(p.spot ?? 0)}` : '');

/** A defender's name tag and the profession their loadout gives them: "Jack the Gunner — Ripper". */
export const defenderLabel = (d: Pick<DefenderSpec, 'name' | 'loadout' | 'stats'>): string =>
  `${nameTag(d)} — ${PROFESSIONS[professionOf(d.loadout)].name}`;

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

/** The battery bank as "Bank 420/1,000" (design §7). */
export const bankText = (charge: number): string =>
  `Bank ${wholeLeft(charge).toLocaleString('en-US')}/${BANK_CAP.toLocaleString('en-US')}`;

export function statusText(s: HordeState): string {
  return [
    s.boss ? `Horde ${s.hordeNumber} (boss)` : `Horde ${s.hordeNumber}`,
    `Wave ${s.wave}/${s.waveCount}`,
    `Lv ${s.level} (${s.xp}/${xpToNext(s.level)})`,
    bankText(s.energy),
    // Scavenger's Eye pays fractions of cash; only whole ones are shown.
    `Cash ${Math.floor(s.cash)}`,
    ...(s.perks.length ? [`Perks: ${s.perks.map((p) => PERKS[p].name).join(', ')}`] : []),
  ].join(' · ');
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
  /** Defenders from a win with stat points to spend, XP added. */
  picks: RosterDefender[];
  /**
   * Camp-level picks and the offers to pick from before "Back to build" (design §11),
   * with the room left after the horde for a survivor to join.
   */
  camp: CampScreen;
}

export type CampScreen = Pick<Camp, 'picks' | 'offers'> & { room: Room };

/** A survivor (design §10) as "Ava · level 3 · Aim 2, Grit 4 · Military Rifle (+10% damage)". */
export function survivorText(s: Survivor): string {
  const stats = STATS.filter((st) => s.stats[st] > 0).map(
    (st) => `${STAT_NAMES[st]} ${s.stats[st]}`,
  );
  const affixes = s.weapon.affixes.map(affixText);
  return [
    s.name,
    `level ${levelOf(s.xp).level}`,
    ...(stats.length > 0 ? [stats.join(', ')] : []),
    heldName(s.weapon) + (affixes.length > 0 ? ` (${affixes.join(', ')})` : ''),
  ].join(' · ');
}

/** What each stat does, for the picker. */
export const STAT_HINT: Readonly<Record<Stat, string>> = {
  aim: 'Gun damage and crits, any gun',
  might: 'Blade damage and cleave',
  tech: 'Engineer repair',
  grit: 'HP in hordes, any loadout',
};

/** One defender's row in the stat picker. */
export interface PickerRow {
  heading: string;
  /** Titles earned since `was`, e.g. "New title: Junior Gunner"; '' for none. */
  note: string;
  buttons: { stat: Stat; label: string; disabled: boolean }[];
}

/** The picker row for `d` (with `was` its stats before this screen): name tag, points left, a button per stat. */
export function pickerRow(d: RosterDefender, was: RosterDefender['stats']): PickerRow {
  const left = unspentPoints(d);
  const earned = (Object.keys(PROFESSIONS) as Profession[])
    .map((p) => titleIn(d.stats, p))
    .filter((t): t is Title => t !== null && titleIn(was, t.profession)?.at !== t.at)
    .map(titleName);
  return {
    heading: `${nameTag(d)} · ${left} stat point${left === 1 ? '' : 's'} to spend`,
    note: earned.length ? `New title: ${earned.join(', ')}` : '',
    buttons: STATS.map((stat) => ({
      stat,
      label: `${STAT_NAMES[stat]} ${d.stats[stat]}`,
      disabled: left <= 0,
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
      lines.push(xpLine(g, d ? nameTag(d) : g.name));
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
): {
  update(state: HordeState, armed?: SkillId | null): void;
  showResult(screen: ResultScreen): void;
  show(visible: boolean): void;
  toast(text: string): void;
} {
  const hud = el('div', 'hud');
  const bar = el('div', 'hud-bar');
  const boss = el('div', 'hud-boss');
  const bossLabel = el('span', 'hud-boss-label');
  bossLabel.id = 'hud-boss-label';
  const bossHp = el('meter', 'hud-boss-hp');
  bossHp.min = 0;
  bossHp.setAttribute('aria-labelledby', bossLabel.id);
  boss.append(bossLabel, bossHp);
  boss.hidden = true;
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
  const back = el('button', 'hud-button');
  back.type = 'button';
  back.addEventListener('click', () => {
    // Hide at once so a double click can't finish the same horde twice.
    if (result.hidden || back.disabled) return;
    result.hidden = true;
    onDone();
  });
  result.append(resultTitle, resultList, picker, campPicker, back);
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
  cards.hidden = true;
  result.hidden = true;
  hud.append(bar, boss, warning, toast, shop, cards, replace, result);
  root.append(hud);

  let shownOffer: Card[] | null = null;
  // Second Look's reroll can deal the same three cards; its button still has to grey out.
  let shownRerolled = 0;
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
  function pickerBlock(start: RosterDefender): HTMLElement {
    const block = el('div', 'hud-pick');
    let d = start;
    const draw = (): void => {
      const row = pickerRow(d, start.stats);
      const buttons = el('div', 'hud-pick-row');
      row.buttons.forEach((b, i) => {
        const button = el('button', 'hud-button hud-pick-stat', b.label);
        button.type = 'button';
        button.disabled = b.disabled;
        button.title = STAT_HINT[b.stat];
        button.addEventListener('click', () => {
          if (result.hidden) return;
          const r = spend(d, b.stat);
          if (!r.ok) return;
          d = r.defender;
          onSpend(d.id, b.stat);
          draw();
          // Keep the keyboard where it was; a spent-out row moves on to the next picker
          // with points left (wrapping round), then to "Back to build".
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
      const parts: HTMLElement[] = [el('p', 'hud-pick-heading', row.heading), buttons];
      if (row.note) parts.push(el('p', 'hud-pick-note', row.note));
      block.replaceChildren(...parts);
    };
    draw();
    return block;
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
    toast(text) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, TOAST_MS);
    },
    update(state, armed = null) {
      const status = statusText(state);
      if (bar.textContent !== status) bar.textContent = status;
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
        state.rerolledWave !== shownRerolled
      ) {
        shownOffer = state.offer;
        shownRerolled = state.rerolledWave;
        cards.hidden = state.offer === null;
        if (state.offer) showOffer(state.offer, state);
        else cards.replaceChildren();
      }
    },
    showResult(screen) {
      resultTitle.textContent = screen.title;
      resultList.replaceChildren(...screen.lines.map((line) => el('li', '', line)));
      picker.replaceChildren(
        ...(screen.picks.length
          ? [
              el(
                'p',
                'hud-result-body',
                STATS.map((st) => `${STAT_NAMES[st]}: ${STAT_HINT[st]}`).join(' · '),
              ),
              ...screen.picks.map(pickerBlock),
            ]
          : []),
      );
      back.textContent = screen.button;
      campBlock(screen.camp);
      result.hidden = false;
      (campPicker.querySelector<HTMLButtonElement>('button:enabled') ?? back).focus();
    },
  };
}
