// The Roster (ID-086): a top-bar button left of the Inventory opens a dialog with every
// survivor as a tile (avatar, name, level, HP or an injured mark, the gun they hold, and
// a badge while they have stat points to spend). A tile, or a name on the squad screen,
// opens that survivor's card: a large avatar, level and XP bar, each stat with its points,
// a + button and what the next point adds in real numbers (Tinker locked, greyed out),
// and the points left ("0" when none, ID-083). The avatar is the survivor's fight sprite
// (ID-074). Like the Inventory, the field goes inert behind it and an open Roster holds a
// fight. Text reaches the page only through textContent.
import { heldName, isOwned, type Held } from '../core/armoury.ts';
import { PERSONALITY_NAMES, personalityOf } from '../core/chatter.ts';
import { STAT_NAMES, STATS, type Rarity, type Stat } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import type { HordeState } from '../core/horde.ts';
import { isGun } from '../core/loadout.ts';
import { isLocked, levelOf, maxHpOf, unspentPoints } from '../core/stats.ts';
import { el, STAT_LOCKED_NOTE, statHint } from './hud.ts';
import { holdable, holdRepeat } from './hold.ts';
import { effectSteps } from './statlines.ts';
import { ART_URLS, avatarOf, type ArtId } from './sprites.ts';

/** The gun `d` fights with: a primary that is no gun fights as the pistol (as squadGear). */
const heldGun = (d: RosterDefender): Held =>
  isGun(d.loadout.primary) ? d.loadout.primary : 'pistol';

/** "3 points", "1 point". */
const pointsText = (n: number): string => `${n} point${n === 1 ? '' : 's'}`;

/** One survivor's tile on the Roster. */
export interface RosterTile {
  id: string;
  name: string;
  level: number;
  /** "HP 105/105"; "Injured" or "Down" in place of it when they can't fight. */
  health: string;
  down: boolean;
  /** "Military Rifle"; the free pistol is "Pistol". */
  gun: string;
  rarity: Rarity;
  /** Stat points left to spend: the tile's badge when above 0. */
  points: number;
  art: ArtId;
}

/**
 * The Roster's tiles for `game` at `now`: every survivor in roster order. In a fight
 * (`fight`), HP is the fight's and a survivor down in it is marked "Down"; between hordes
 * HP is full, and one still resting (an older camp save) is "Injured".
 */
export function rosterTiles(
  game: Pick<GameState, 'roster'>,
  now: number,
  fight: HordeState | null,
): RosterTile[] {
  return game.roster.map((d) => {
    const held = heldGun(d);
    const inFight = fight?.defenders.find((f) => f.id === d.id);
    const downInFight = fight?.injured.some((i) => i.defender.id === d.id) ?? false;
    const resting = d.injuredUntil !== null && d.injuredUntil > now;
    let health: string;
    if (inFight) health = `HP ${Math.max(0, Math.ceil(inFight.hp))}/${inFight.maxHp}`;
    else if (downInFight) health = 'Down';
    else if (resting) health = 'Injured';
    else health = `HP ${maxHpOf(d)}/${maxHpOf(d)}`;
    return {
      id: d.id,
      name: d.name,
      level: levelOf(d.xp).level,
      health,
      down: !inFight && (downInFight || resting),
      gun: heldName(held),
      rarity: isOwned(held) ? held.rarity : 'common',
      points: unspentPoints(d),
      art: avatarOf(d),
    };
  });
}

/** One stat's row on a survivor card. */
export interface StatRow {
  stat: Stat;
  name: string;
  points: number;
  locked: boolean;
  /** What the stat gives now and with one more point: "Reload 2.00 s → 1.95 s". */
  effects: string[];
  /** What the stat does, in full (the + button's tooltip). */
  hint: string;
}

/**
 * What `stat` gives `d` now and with one more point, for `d`'s gun, one line per active
 * effect (design §6, ID-084, ID-096).
 */
export const statEffects = (d: RosterDefender, stat: Stat): string[] =>
  isLocked(stat) ? [STAT_LOCKED_NOTE] : effectSteps(d, stat);

/** A survivor's card, laid out. */
export interface SurvivorCard {
  id: string;
  name: string;
  /** How they talk in a fight, one word (ID-093): "Calm", "Cocky" or "Nervous". */
  personality: string;
  level: number;
  /** XP into the level: a share for the bar, and "5/50 XP to Lv 3". */
  xp: { pct: number; text: string };
  art: ArtId;
  gun: string;
  rarity: Rarity;
  /** Points left: "3 points", or a bare "0" when none are left (ID-083). */
  points: number;
  pointsText: string;
  stats: StatRow[];
}

export function survivorCard(d: RosterDefender): SurvivorCard {
  const { level, into, next } = levelOf(d.xp);
  const held = heldGun(d);
  const left = unspentPoints(d);
  return {
    id: d.id,
    name: d.name,
    personality: PERSONALITY_NAMES[personalityOf(d.id)],
    level,
    xp: {
      pct: next > 0 ? Math.min(100, (100 * into) / next) : 100,
      text: `${into}/${next} XP to Lv ${level + 1}`,
    },
    art: avatarOf(d),
    gun: heldName(held),
    rarity: isOwned(held) ? held.rarity : 'common',
    points: left,
    pointsText: left > 0 ? pointsText(left) : '0',
    stats: STATS.map((stat) => ({
      stat,
      name: STAT_NAMES[stat],
      points: d.stats[stat],
      locked: isLocked(stat),
      effects: statEffects(d, stat),
      hint: statHint(d, stat),
    })),
  };
}

/** Under a card's stats in a fight: points wait for the screen between hordes. */
export const SPEND_LATER_NOTE = 'Spend points between hordes.';

function avatar(art: ArtId, className: string): HTMLElement {
  // Decoration only: the name is right beside it.
  const frame = el('div', className);
  const img = el('img', 'roster-avatar-img');
  img.alt = '';
  // No URL, no request: an empty src would fetch the page itself.
  const url = ART_URLS[art];
  if (url) img.src = url;
  frame.append(img);
  return frame;
}

/** The Roster's list: one button per survivor. */
export function rosterGrid(
  tiles: readonly RosterTile[],
  onOpen: (id: string) => void,
): HTMLElement {
  const grid = el('ul', 'roster-grid');
  grid.setAttribute('role', 'list');
  grid.setAttribute('aria-label', 'Survivors');
  for (const t of tiles) {
    const li = el('li', 'roster-cell');
    const tile = el('button', 'roster-tile');
    tile.type = 'button';
    tile.dataset.key = `tile:${t.id}`;
    tile.dataset.defender = t.id;
    const who = el('span', 'roster-tile-who');
    who.append(
      el('span', 'roster-tile-name', t.name),
      el('span', 'roster-tile-level', `Lv ${t.level}`),
    );
    const health = el('span', 'roster-tile-health', t.health);
    health.classList.toggle('roster-tile-down', t.down);
    const gun = el('span', 'roster-tile-gun', t.gun);
    gun.dataset.rarity = t.rarity;
    const info = el('span', 'roster-tile-info');
    info.append(who, health, gun);
    tile.append(avatar(t.art, 'roster-avatar roster-avatar-sm'), info);
    if (t.points > 0) {
      // "6 pts", not "+6": beside "Lv 4" a bare number reads as levels.
      const full = `${pointsText(t.points)} to spend`;
      const badge = el('span', 'roster-badge');
      badge.title = full;
      const short = el('span', '', `${t.points} pt${t.points === 1 ? '' : 's'}`);
      short.setAttribute('aria-hidden', 'true');
      badge.append(short, el('span', 'sr-only', full));
      tile.append(badge);
    }
    tile.addEventListener('click', () => onOpen(t.id));
    li.append(tile);
    grid.append(li);
  }
  return grid;
}

/**
 * A survivor's card. Each + spends a point through `onSpend`; with `canSpend` false (a
 * fight on) they stay greyed out and a line says when points can be spent.
 */
export function cardBlock(
  c: SurvivorCard,
  canSpend: boolean,
  onSpend: (id: string, stat: Stat) => void,
): HTMLElement {
  const card = el('section', 'roster-card');
  card.dataset.defender = c.id;
  const who = el('div', 'roster-card-who');
  const title = el('h3', 'roster-card-name', c.name);
  const gun = el('p', 'roster-card-gun', c.gun);
  gun.dataset.rarity = c.rarity;
  const track = el('div', 'xp-track');
  track.setAttribute('aria-hidden', 'true');
  const fill = el('div', 'xp-fill');
  fill.style.width = `${c.xp.pct}%`;
  track.append(fill);
  who.append(
    title,
    el('p', 'roster-card-level', `Level ${c.level}`),
    el('p', 'roster-card-level roster-card-personality', c.personality),
    gun,
    track,
    el('p', 'squad-card-xptext', c.xp.text),
  );
  const head = el('div', 'roster-card-head');
  head.append(avatar(c.art, 'roster-avatar roster-avatar-lg'), who);

  const points = el('p', 'squad-points roster-card-points', c.pointsText);
  // A bare "0" keeps its unit for screen readers (ID-083).
  if (c.points <= 0) points.append(el('span', 'sr-only', ' points'));
  else points.append(el('span', 'roster-points-unit', ' to spend'));
  points.classList.toggle('squad-points-none', c.points <= 0);

  const rows = el('ul', 'roster-stats');
  rows.setAttribute('role', 'list');
  for (const s of c.stats) {
    const li = el('li', 'roster-stat');
    li.classList.toggle('roster-stat-locked', s.locked);
    const name = el('span', 'roster-stat-name', s.name);
    const count = el('span', 'roster-stat-points', s.locked ? '—' : String(s.points));
    const plus = el('button', 'hud-button roster-stat-add', '+');
    plus.type = 'button';
    plus.dataset.key = `add:${c.id}:${s.stat}`;
    plus.title = s.hint;
    holdable(plus, `add:${c.id}:${s.stat}`);
    plus.disabled = s.locked || !canSpend || c.points <= 0;
    plus.setAttribute(
      'aria-label',
      s.locked
        ? `${s.name}: ${STAT_LOCKED_NOTE.toLowerCase()}`
        : `Add a point to ${s.name} for ${c.name}, now ${s.points}`,
    );
    plus.addEventListener('click', () => {
      if (!plus.disabled) onSpend(c.id, s.stat);
    });
    const effects = el('div', 'roster-stat-effects');
    for (const line of s.effects) effects.append(el('p', 'roster-stat-effect', line));
    li.append(name, count, plus, effects);
    rows.append(li);
  }
  card.append(head, points);
  if (!canSpend && c.points > 0) card.append(el('p', 'menu-note', SPEND_LATER_NOTE));
  card.append(rows);
  return card;
}

export interface RosterOptions {
  /**
   * The camp now (with any points spent on the result screen), the fight under way if
   * any, whether points can be spent, and whether closing resumes a fight (Close label).
   */
  state: () => {
    game: Pick<GameState, 'roster'>;
    fight: HordeState | null;
    canSpend: boolean;
    resumes: boolean;
  };
  /** A + on a card: spend one point of `stat` on survivor `id`. */
  onSpend: (id: string, stat: Stat) => void;
}

export interface Roster {
  isOpen(): boolean;
  /**
   * Opens on the list, or on survivor `id`'s card; closing gives the keyboard back to
   * `from` (what was clicked), else to what had it.
   */
  open(id?: string, from?: HTMLElement): void;
  close(): void;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
}

/** The Roster button, top-right left of the Inventory, and its dialog. */
export function createRoster(root: HTMLElement, opts: RosterOptions): Roster {
  const doc = root.ownerDocument;
  let opened = false;
  // The card shown, or null for the list.
  let showing: string | null = null;
  // What had the keyboard before it opened (the button, or a name on the squad screen).
  let opener: HTMLElement | null = null;

  const button = el('button', 'roster-button', 'Roster');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener('click', () => api.open());
  root.append(button);

  // Outside `root`, like the Menu and the Inventory, so the field can go inert behind it.
  const scrim = el('div', 'roster-scrim');
  scrim.hidden = true;
  const dialog = el('div', 'menu roster-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'roster-title');
  dialog.tabIndex = -1;
  scrim.append(dialog);
  doc.body.append(scrim);
  // Holding a card's + keeps adding points (ID-096).
  holdRepeat(dialog);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });

  const title = el('h2', 'menu-title', 'Roster');
  title.id = 'roster-title';
  const closeX = el('button', 'menu-close', '×');
  closeX.type = 'button';
  closeX.setAttribute('aria-label', 'Close roster');
  closeX.addEventListener('click', () => api.close());
  const head = el('div', 'menu-head inv-head');
  head.append(title, closeX);
  const body = el('div', 'menu-body roster-body');
  const hintText = el('span', '');
  const hint = el('span', 'inv-hint');
  hint.append(el('kbd', 'menu-key', 'Esc'), hintText);
  const backButton = el('button', 'hud-button roster-back', 'All survivors');
  backButton.type = 'button';
  backButton.addEventListener('click', () => show(null));
  const done = el('button', 'hud-button', 'Close');
  done.type = 'button';
  done.addEventListener('click', () => api.close());
  const foot = el('div', 'menu-foot');
  foot.append(hint, backButton, done);
  dialog.append(head, body, foot);

  // Keys stay in the dialog (the field's keys never see them); Esc closes, Tab cycles.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!e.repeat) api.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = [...dialog.querySelectorAll<HTMLElement>('button')].filter(
      (b) => !(b as HTMLButtonElement).disabled && !b.hidden,
    );
    const i = list.indexOf(doc.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) {
      e.preventDefault();
      list.at(-1)?.focus();
    } else if (!e.shiftKey && (i < 0 || i === list.length - 1)) {
      e.preventDefault();
      list[0]?.focus();
    }
  });

  /** Draws the list or a card; keeps the keyboard where it was when that is still there. */
  function draw(): void {
    const { game, fight, canSpend, resumes } = opts.state();
    hintText.textContent = resumes ? ' closes and resumes' : ' closes';
    done.textContent = resumes ? 'Resume' : 'Close';
    const d = showing === null ? undefined : game.roster.find((r) => r.id === showing);
    if (d === undefined) showing = null;
    const key = (doc.activeElement as HTMLElement | null)?.dataset?.key;
    backButton.hidden = showing === null;
    body.replaceChildren(
      d
        ? cardBlock(survivorCard(d), canSpend, opts.onSpend)
        : rosterGrid(rosterTiles(game, Date.now(), fight), (id) => show(id)),
    );
    if (key !== undefined) {
      const again = [...body.querySelectorAll<HTMLButtonElement>('[data-key]')].find(
        (b) => b.dataset.key === key && !b.disabled,
      );
      if (again) {
        again.focus();
        return;
      }
      // A spent-out card: the keyboard goes to the way back to the list.
      if (key.startsWith('add:') && !backButton.hidden) backButton.focus();
    }
  }

  function show(id: string | null): void {
    const from = showing;
    showing = id;
    // Off the list, focus moves with the view: a card starts on its first +, the list on
    // the tile it came from.
    (doc.activeElement as HTMLElement | null)?.blur?.();
    draw();
    body.scrollTop = 0;
    const first =
      id !== null
        ? (body.querySelector<HTMLButtonElement>('.roster-stat-add:enabled') ?? backButton)
        : ([...body.querySelectorAll<HTMLButtonElement>('.roster-tile')].find(
            (t) => t.dataset.defender === from,
          ) ?? body.querySelector<HTMLButtonElement>('.roster-tile'));
    (first ?? closeX).focus();
  }

  const api: Roster = {
    isOpen: () => opened,
    open(id, from) {
      if (!opened) {
        opened = true;
        const at = from ?? doc.activeElement;
        opener = at instanceof HTMLElement && root.contains(at) ? at : null;
        scrim.hidden = false;
        root.setAttribute('inert', '');
      }
      show(id ?? null);
    },
    close() {
      if (!opened) return;
      opened = false;
      scrim.hidden = true;
      root.removeAttribute('inert');
      (opener?.isConnected ? opener : button).focus();
      opener = null;
    },
    refresh() {
      if (opened) draw();
    },
  };
  return api;
}
