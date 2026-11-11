// The Roster (ID-086, reworked by ID-108): a top-bar button, with a badge counting the
// survivors who have stat points to spend, opens one compact dialog: a header (the title,
// "Best gun for everyone", close), one row of squad tabs (portrait, name, level, a badge
// with their unspent points), the selected survivor beside their gun slot, and one panel
// that is either their Stats or "Choose a gun". A tap on a stat's + spends the point at
// once (ID-126); Undo takes back what was spent since the dialog opened, between hordes
// only (no respec otherwise: design §6), and each spend is read out. A gun is compared with
// the one held before it is equipped. Like the Inventory, the field goes inert behind it
// and an open Roster holds a fight. Text reaches the page only through textContent.
import { baseOf, gunPower, heldName, isOwned, roleOf, type Held } from '../core/armoury.ts';
import { STAT_NAMES, STASH_CAP, STATS, WEAPONS, type Rarity, type Stat } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import type { GunMove } from '../core/hordeonly.ts';
import type { HordeState } from '../core/horde.ts';
import { isLocked, levelOf, maxHpOf, unspentPoints } from '../core/stats.ts';
import { bestUpgrade, gunCompare, gunName, gunTiles, heldGunOf, rarityOf } from './gunpick.ts';
import { holdable, holdRepeat } from './hold.ts';
import { el, STAT_LOCKED_NOTE } from './hud.ts';
import { GUNS_WAIT } from './inventory.ts';
import { effectChange } from './statlines.ts';
import { ART_URLS, avatarOf, GUN_ICON, type ArtId, type GunId } from './sprites.ts';

/** "3 points", "1 point". */
const pointsText = (n: number): string => `${n} point${n === 1 ? '' : 's'}`;

/** One survivor's tab on the Roster. */
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
  /** Stat points left to spend: the tab's badge when above 0. */
  points: number;
  art: ArtId;
}

/**
 * The Roster's tabs for `game` at `now`: every survivor in roster order. In a fight
 * (`fight`), HP is the fight's and a survivor down in it is marked "Down"; between hordes
 * HP is full, and one still resting (an older camp save) is "Injured".
 */
export function rosterTiles(
  game: Pick<GameState, 'roster'>,
  now: number,
  fight: HordeState | null,
): RosterTile[] {
  return game.roster.map((d) => {
    const held = heldGunOf(d);
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
      rarity: rarityOf(held),
      points: unspentPoints(d),
      art: avatarOf(d),
    };
  });
}

/** How many survivors have points to spend: the Roster button's badge. */
export const pointsBadge = (game: Pick<GameState, 'roster'>): number =>
  game.roster.filter((d) => unspentPoints(d) > 0).length;

/** Under a survivor's stats while points can't be spent (`canSpend` off): they wait for the screen between hordes. */
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

export interface RosterOptions {
  /**
   * The camp now (with any points spent on the result screen), the fight under way if
   * any, whether points can be spent, whether guns can be changed, and whether closing
   * resumes a fight (Close label).
   */
  state: () => {
    game: Pick<GameState, 'roster' | 'armoury'>;
    fight: HordeState | null;
    canSpend: boolean;
    canGear: boolean;
    resumes: boolean;
  };
  /** A + tap: spend one point of `stat` on survivor `id` now. */
  onSpend: (id: string, stat: Stat) => void;
  /** Undo, between hordes only: take back one point of `stat` that this dialog spent on `id`. */
  onUnspend: (id: string, stat: Stat) => void;
  /** Equip: give survivor `id` the free pistol ('pistol') or the stash gun with uid `choice`. */
  onEquip: (id: string, choice: string) => { ok: true } | { ok: false; reason: string };
  /** "Best gun for everyone": the guns handed out, or why not. */
  onBestGuns: () => { ok: true; moves: GunMove[] } | { ok: false; reason: string };
}

export interface Roster {
  isOpen(): boolean;
  /**
   * Opens on survivor `id`'s Stats (the first with points to spend, or the first, without
   * one); closing gives the keyboard back to `from` (what was clicked), else to what had it.
   */
  open(id?: string, from?: HTMLElement): void;
  /** Closes at once. */
  close(): void;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
}

/** The Roster button, top-right left of the Inventory, and its dialog. */
export function createRoster(root: HTMLElement, opts: RosterOptions): Roster {
  const doc = root.ownerDocument;
  let opened = false;
  // The survivor shown, and whether the panel is the gun picker (with the gun looked at).
  let current: string | null = null;
  let picking = false;
  let picked: string | null = null;
  // The points spent between hordes since it opened, oldest first: what Undo can take back.
  let spentHere: [string, Stat][] = [];
  let status = { text: '', tone: 'ok' as 'ok' | 'danger' };
  // What had the keyboard before it opened (the button, or a name on the squad screen).
  let opener: HTMLElement | null = null;

  const button = el('button', 'roster-button', 'Roster');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  const badge = el('span', 'roster-dot');
  badge.setAttribute('aria-hidden', 'true');
  badge.hidden = true;
  const badgeText = el('span', 'sr-only');
  button.append(badge, badgeText);
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
  // Holding a + keeps spending (ID-096).
  holdRepeat(dialog);
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });

  const grab = el('div', 'roster-grab');
  grab.setAttribute('aria-hidden', 'true');
  const title = el('h2', 'menu-title', 'Roster');
  title.id = 'roster-title';
  const bestButton = el('button', 'hud-button rv-btn rv-best', 'Best gun for everyone');
  bestButton.type = 'button';
  bestButton.dataset.key = 'best';
  const closeX = el('button', 'hud-button rv-btn rv-close', '×');
  closeX.type = 'button';
  closeX.dataset.key = 'close';
  const head = el('div', 'rv-head');
  head.append(title, bestButton, closeX);
  const tabs = el('ul', 'rv-tabs');
  tabs.setAttribute('aria-label', 'Squad');
  const top = el('div', 'rv-top');
  const panel = el('div', 'rv-panel');
  const statusLine = el('p', 'rv-status');
  statusLine.setAttribute('role', 'status');
  dialog.append(grab, head, tabs, top, panel, statusLine);

  bestButton.addEventListener('click', () => {
    const r = opts.onBestGuns();
    picking = false;
    picked = null;
    if (!r.ok) setStatus(r.reason, 'danger');
    else if (r.moves.length === 0) {
      setStatus('Everyone already holds the best gun they can get.');
    } else {
      setStatus(`Equipped: ${r.moves.map((m) => `${m.name} → ${heldName(m.to)}`).join(' · ')}`);
    }
    draw('best');
  });
  closeX.addEventListener('click', () => api.close());

  // Keys stay in the dialog (the field's keys never see them); Esc steps back, then closes;
  // Tab cycles.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      // Esc steps back one layer: the gun picker, then the dialog.
      if (picking) {
        picking = false;
        picked = null;
        draw('slot');
      } else api.close();
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

  function setStatus(text: string, tone: 'ok' | 'danger' = 'ok'): void {
    status = { text, tone };
  }

  /** Points survivor `id` has left in the camp now. */
  const leftNow = (id: string): number => {
    const d = opts.state().game.roster.find((r) => r.id === id);
    return d ? unspentPoints(d) : 0;
  };

  /** Stat `stat` of survivor `id` in the camp now. */
  const statNow = (id: string, stat: Stat): number =>
    opts.state().game.roster.find((r) => r.id === id)?.stats[stat] ?? 0;

  /** Spends one point of `stat` on `d` now; reads out what it did, or that the camp refused. */
  function spendOne(d: RosterDefender, stat: Stat): void {
    const { canGear } = opts.state();
    const before = leftNow(d.id);
    opts.onSpend(d.id, stat);
    const left = leftNow(d.id);
    // Counted off the camp, so a spend the app refused is not reported or undone.
    if (left >= before) return;
    // In a fight a point stays spent: only one spent between hordes can be undone.
    if (canGear) spentHere.push([d.id, stat]);
    setStatus(
      `${STAT_NAMES[stat]} ${statNow(d.id, stat)} for ${d.name}. ${left > 0 ? `${pointsText(left)} left` : 'No points left'}.`,
    );
  }

  /** Takes back every point spent on `d` since the dialog opened, newest first. */
  function undoSpends(d: RosterDefender): void {
    const mine = spentHere.filter(([id]) => id === d.id);
    spentHere = spentHere.filter(([id]) => id !== d.id);
    const before = leftNow(d.id);
    for (const [, stat] of mine.reverse()) opts.onUnspend(d.id, stat);
    const left = leftNow(d.id);
    const n = left - before;
    // The points left keep two Undos in a row from reading the same (and going unread).
    setStatus(n > 0 ? `Took back ${pointsText(n)} from ${d.name}. ${pointsText(left)} left.` : '');
  }

  const keyOf = (): string | undefined =>
    (doc.activeElement as HTMLElement | null)?.dataset?.key ?? undefined;

  function updateBadge(game: Pick<GameState, 'roster'>): void {
    const n = pointsBadge(game);
    badge.hidden = n === 0;
    badge.textContent = n === 0 ? '' : String(n);
    badgeText.textContent = n === 0 ? '' : `, ${n} with points to spend`;
  }

  /** Draws everything; keeps the keyboard on `key` (default: where it is) when it is still there. */
  function draw(focus?: string): void {
    const { game, fight, canSpend, canGear, resumes } = opts.state();
    updateBadge(game);
    if (!opened) return;
    const want = focus ?? keyOf();
    let d = game.roster.find((r) => r.id === current);
    if (!d) {
      d = game.roster.find((r) => unspentPoints(r) > 0) ?? game.roster[0];
      current = d?.id ?? null;
      picking = false;
      picked = null;
    }
    if (!canGear) {
      picking = false;
      picked = null;
    }
    closeX.setAttribute('aria-label', resumes ? 'Close roster and resume' : 'Close roster');
    bestButton.disabled = !canGear;
    bestButton.title = canGear ? '' : GUNS_WAIT;

    const marks = rosterTiles(game, Date.now(), fight);
    tabs.replaceChildren(...marks.map((t) => tabItem(t, t.id === current)));
    if (d) {
      top.replaceChildren(
        ...survivorRow(
          d,
          marks.find((t) => t.id === d.id)!,
          canGear,
        ),
      );
      panel.replaceChildren(
        ...(picking ? pickerPanel(d, game, canGear) : statsPanel(d, canSpend, canGear)),
      );
    } else {
      top.replaceChildren();
      panel.replaceChildren();
    }
    statusLine.textContent = status.text;
    statusLine.dataset.tone = status.tone;
    focusKey(want);
  }

  /** Puts the keyboard on the control named `key`, else the nearest thing that is left. */
  function focusKey(key: string | undefined): void {
    if (key === undefined) return;
    const find = (k: string): HTMLButtonElement | undefined =>
      [...dialog.querySelectorAll<HTMLButtonElement>('[data-key]')].find(
        (b) => b.dataset.key === k && !b.disabled && !b.hidden,
      );
    // A spent-out + moves to Undo, then the tab, then the close.
    const target = find(key) ?? find('undo') ?? find(`tab:${current}`) ?? find('close');
    target?.focus();
  }

  function tabItem(t: RosterTile, selected: boolean): HTMLElement {
    const li = el('li', 'rv-cell');
    const tab = el('button', 'rv-tab');
    tab.type = 'button';
    tab.dataset.key = `tab:${t.id}`;
    tab.dataset.defender = t.id;
    // One state, announced once: the survivor shown is the current one.
    if (selected) tab.setAttribute('aria-current', 'true');
    const left = t.points;
    tab.title = `${t.name}, level ${t.level}, ${t.health}`;
    tab.setAttribute(
      'aria-label',
      `${t.name}, level ${t.level}, ${t.health}${left > 0 ? `, ${pointsText(left)} to spend` : ''}`,
    );
    tab.classList.toggle('rv-tab-down', t.down);
    const text = el('span', 'rv-tab-text');
    text.append(el('span', 'rv-tab-name', t.name), el('span', 'rv-tab-level', `Lv ${t.level}`));
    tab.append(avatar(t.art, 'roster-avatar roster-avatar-xs'), text);
    if (left > 0) {
      const dot = el('span', 'roster-badge rv-badge', String(left));
      dot.setAttribute('aria-hidden', 'true');
      tab.append(dot);
    }
    tab.addEventListener('click', () => {
      if (t.id === current) return;
      current = t.id;
      picking = false;
      picked = null;
      draw(`tab:${t.id}`);
    });
    li.append(tab);
    return li;
  }

  function survivorRow(d: RosterDefender, mark: RosterTile, canGear: boolean): HTMLElement[] {
    const { level, into, next } = levelOf(d.xp);
    const pct = next > 0 ? Math.min(100, (100 * into) / next) : 100;
    const who = el('div', 'rv-who');
    const text = el('div', 'rv-who-text');
    const track = el('div', 'xp-track rv-xp');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${into}/${next} XP to Lv ${level + 1}`);
    const fill = el('div', 'xp-fill');
    fill.style.width = `${pct}%`;
    track.append(fill);
    const sub = el('p', 'rv-who-level');
    sub.append(`Level ${level} · `, el('span', mark.down ? 'roster-tile-down' : '', mark.health));
    text.append(el('h3', 'rv-who-name', d.name), sub, track);
    who.append(avatar(mark.art, 'roster-avatar roster-avatar-md'), text);

    const held = heldGunOf(d);
    const slot = el('button', 'rv-slot');
    slot.type = 'button';
    slot.dataset.key = 'slot';
    slot.dataset.rarity = rarityOf(held);
    slot.setAttribute('aria-expanded', String(picking));
    slot.setAttribute('aria-disabled', String(!canGear));
    const dps = heldDps(held);
    slot.setAttribute(
      'aria-label',
      `Gun: ${gunName(held)}, ${dps} dmg/s. ${canGear ? (picking ? 'Back to stats' : 'Change gun') : GUNS_WAIT}`,
    );
    const icon = el('span', 'rv-gico');
    // The inventory slot's tint, so the dark gun art reads (ID-092).
    icon.dataset.rarity = rarityOf(held);
    const url = ART_URLS[GUN_ICON[(isOwned(held) ? held.base : held) as GunId]];
    if (url) {
      const img = el('img', 'rv-gico-img');
      img.alt = '';
      img.src = url;
      icon.append(img);
    }
    const gtext = el('span', 'rv-slot-text');
    const name = el('span', 'rv-slot-name', gunName(held));
    name.dataset.rarity = rarityOf(held);
    const line = el('span', 'rv-slot-line');
    // The role drops out on a phone, where it would be cut off; the comparison names it.
    line.append(el('b', '', dps), ' dmg/s', el('span', 'rv-slot-role', ` · ${roleName(held)}`));
    gtext.append(name, line);
    if (!canGear) gtext.append(el('span', 'rv-slot-note', GUNS_WAIT));
    slot.append(icon, gtext);
    if (canGear) {
      // On a phone only the arrow shows: the cue that the slot opens the picker stays.
      const chev = el('span', 'rv-slot-chev');
      chev.append(
        el('span', 'rv-slot-chev-word', picking ? 'Close ' : 'Change '),
        picking ? '▴' : '▾',
      );
      slot.append(chev);
    }
    slot.addEventListener('click', () => {
      if (!canGear) {
        setStatus(GUNS_WAIT);
        draw('slot');
        return;
      }
      if (picking) {
        picking = false;
        picked = null;
      } else {
        picking = true;
        const { game } = opts.state();
        picked = bestUpgrade(gunTiles(game, d.id)) ?? null;
      }
      draw('slot');
    });
    return [who, slot];
  }

  function statsPanel(d: RosterDefender, canSpend: boolean, canGear: boolean): HTMLElement[] {
    const left = unspentPoints(d);
    const undone = spentHere.filter(([id]) => id === d.id).length;
    const headRow = el('div', 'rv-phead');
    const lefts = el('span', 'rv-left');
    lefts.append(el('b', '', String(left)), ' to spend');
    headRow.append(el('span', 'rv-ttl', 'Stats'), lefts);
    // Between hordes only: a point spent in a fight stays spent.
    if (canGear) {
      const undo = el('button', 'hud-button rv-btn', undone > 0 ? `Undo ${undone}` : 'Undo');
      undo.type = 'button';
      undo.dataset.key = 'undo';
      undo.disabled = undone === 0;
      undo.setAttribute(
        'aria-label',
        undone > 0
          ? `Undo ${pointsText(undone)} spent on ${d.name}`
          : 'Undo: nothing spent here yet',
      );
      undo.addEventListener('click', () => {
        if (undo.disabled) return;
        undoSpends(d);
        draw();
      });
      headRow.append(undo);
    }
    const out: HTMLElement[] = [headRow];
    if (!canSpend && left > 0) out.push(el('p', 'menu-note', SPEND_LATER_NOTE));
    const list = el('ul', 'rv-stats');
    for (const stat of STATS) list.append(statRow(d, stat, left, canSpend));
    out.push(list);
    out.push(
      el(
        'p',
        'rv-hint',
        canGear
          ? 'Tap + to spend a point now. → shows the next point. Undo takes back what you spent here.'
          : 'Tap + to spend a point now. → shows the next point. In a fight it stays spent.',
      ),
    );
    return out;
  }

  function statRow(d: RosterDefender, stat: Stat, left: number, canSpend: boolean): HTMLElement {
    const label = STAT_NAMES[stat];
    const li = el('li', 'rv-stat');
    if (isLocked(stat)) {
      li.classList.add('rv-stat-locked');
      li.append(el('span', 'rv-stat-name', label), el('span', 'rv-fx', STAT_LOCKED_NOTE));
      return li;
    }
    const name = el('span', 'rv-stat-name', label);
    name.append(el('span', 'rv-stat-ct', String(d.stats[stat])));
    const fx = el('span', 'rv-fx');
    // With no point to spend, only what the stat gives now: no "→ next" a survivor can't buy.
    for (const c of effectChange(d, stat, 1)) {
      const item = el('span', 'rv-fx-item');
      item.append(el('span', 'rv-fx-k', `${c.label} `), c.from);
      if (left > 0) item.append(el('span', 'rv-fx-to', ` → ${c.to}`));
      fx.append(item);
    }
    const plus = el('button', 'hud-button rv-sb rv-sb-plus', '+');
    plus.type = 'button';
    plus.dataset.key = `add:${d.id}:${stat}`;
    holdable(plus, `add:${d.id}:${stat}`);
    plus.disabled = left <= 0 || !canSpend;
    plus.setAttribute(
      'aria-label',
      `Spend a point on ${label} for ${d.name}, now ${d.stats[stat]}`,
    );
    plus.addEventListener('click', () => {
      if (plus.disabled) return;
      // The camp's redraw during the spend can't move the keyboard on before Undo is live.
      const at = keyOf();
      spendOne(d, stat);
      draw(at);
    });
    const pm = el('span', 'rv-pm');
    pm.append(plus);
    li.append(name, fx, pm);
    return li;
  }

  function pickerPanel(
    d: RosterDefender,
    game: Pick<GameState, 'roster' | 'armoury'>,
    canGear: boolean,
  ): HTMLElement[] {
    const held = heldGunOf(d);
    const tiles = gunTiles(game, d.id);
    if (picked !== null && !tiles.some((t) => t.choice === picked)) picked = null;
    const headRow = el('div', 'rv-phead');
    const back = el('button', 'hud-button rv-btn', 'Stats');
    back.type = 'button';
    back.dataset.key = 'stats';
    back.addEventListener('click', () => {
      picking = false;
      picked = null;
      draw('slot');
    });
    headRow.append(
      el('span', 'rv-ttl', 'Choose a gun'),
      el('span', 'rv-left', `By dmg/s · stash ${game.armoury.length}/${STASH_CAP}`),
      back,
    );
    const out: HTMLElement[] = [headRow];
    const choice = tiles.find((t) => t.choice === picked);
    if (choice) {
      const cmp = gunCompare(held, choice.held);
      const box = el('div', 'rv-cmp');
      const verdict = el('div', 'rv-verdict');
      const v = el('div', 'rv-v');
      const gname = el('b', 'rv-v-name', cmp.newName);
      gname.dataset.rarity = choice.rarity;
      v.append(gname, cmp.verdict);
      v.dataset.kind = cmp.kind;
      // A tile tap changes the comparison: read the new verdict out.
      v.setAttribute('aria-live', 'polite');
      const equipButton = el('button', 'hud-button rv-btn primary', 'Equip');
      equipButton.type = 'button';
      equipButton.dataset.key = 'equip';
      equipButton.disabled = !canGear;
      equipButton.setAttribute('aria-label', `Equip ${cmp.newName}`);
      equipButton.addEventListener('click', () => equipPicked(d, held, choice.choice, cmp.newName));
      verdict.append(v, equipButton);
      const table = el('table', 'rv-ctab');
      const head = el('tr', '');
      // On a phone the gun types drop out of the heads ("Now", "New"): the verdict names it.
      const nowHead = el('th', '', 'Now');
      nowHead.append(el('span', 'rv-th-type', `: ${heldType(held)}`));
      const newHead = el('th', '', 'New');
      newHead.append(el('span', 'rv-th-type', `: ${choice.type}`));
      head.append(el('th', '', ''), nowHead, newHead, el('th', '', 'Change'));
      const thead = el('thead', '');
      thead.append(head);
      const body = el('tbody', '');
      for (const r of cmp.rows) {
        const tr = el('tr', '');
        const change = el('td', 'rv-chg', r.change);
        if (r.tone) change.dataset.tone = r.tone;
        tr.append(el('th', '', r.label), el('td', '', r.now), el('td', '', r.next), change);
        for (const th of tr.querySelectorAll('th')) th.scope = 'row';
        body.append(tr);
      }
      table.append(thead, body);
      box.append(verdict, table);
      out.push(box);
    } else {
      out.push(
        el(
          'p',
          'rv-empty',
          tiles.length === 0
            ? `No other gun to choose: every horde won drops one.`
            : `No upgrade in the stash. Tap a gun to compare it with ${gunName(held)}.`,
        ),
      );
    }
    const grid = el('ul', 'rv-grid');
    grid.setAttribute('aria-label', 'Guns that fit');
    for (const t of tiles) {
      const li = el('li', 'rv-cell');
      const tile = el('button', 'rv-tile');
      tile.type = 'button';
      tile.dataset.key = `tile:${t.choice}`;
      tile.dataset.choice = t.choice;
      tile.dataset.rarity = t.rarity;
      tile.setAttribute('aria-pressed', String(t.choice === picked));
      tile.setAttribute('aria-label', t.label);
      tile.title = t.label;
      const delta = el('span', 'rv-d', t.delta.text);
      delta.dataset.kind = t.delta.kind;
      tile.append(
        delta,
        // The first word fits a tile ("Sniper", not "Sniper r…"); the label has it in full.
        el('span', 'rv-ty', `${t.type.split(' ')[0]}${t.free ? ' ∞' : ''}`),
        el('span', 'rv-dps', t.dps),
      );
      tile.addEventListener('click', () => {
        picked = t.choice;
        draw(`tile:${t.choice}`);
        // On a short phone a bottom-row tile sits below the fold: bring the comparison and
        // its Equip into view (jsdom has no scrollIntoView).
        dialog.querySelector<HTMLElement>('.rv-cmp')?.scrollIntoView?.({ block: 'nearest' });
      });
      li.append(tile);
      grid.append(li);
    }
    out.push(grid);
    out.push(el('p', 'rv-hint', 'Frame colour = rarity. ▲ ▼ compare dmg/s with the gun held now.'));
    return out;
  }

  /** Equips `choice` on `d`; says who holds what, or why not. */
  function equipPicked(d: RosterDefender, held: Held, choice: string, newName: string): void {
    const r = opts.onEquip(d.id, choice);
    if (!r.ok) {
      setStatus(r.reason, 'danger');
      draw('equip');
      return;
    }
    const back = isOwned(held) ? `; ${gunName(held)} is back in the stash` : '';
    setStatus(
      choice === 'pistol'
        ? `${d.name} now holds the free pistol${back}.`
        : `${d.name} now holds ${newName}${back}.`,
    );
    picking = false;
    picked = null;
    draw('slot');
  }

  const api: Roster = {
    isOpen: () => opened,
    open(id, from) {
      if (!opened) {
        opened = true;
        const at = from ?? doc.activeElement;
        opener = at instanceof HTMLElement && root.contains(at) ? at : null;
        spentHere = [];
        status = { text: '', tone: 'ok' };
        scrim.hidden = false;
        root.setAttribute('inert', '');
      }
      const { game } = opts.state();
      const asked = game.roster.find((r) => r.id === id);
      current =
        (asked ?? game.roster.find((r) => unspentPoints(r) > 0) ?? game.roster[0])?.id ?? null;
      picking = false;
      picked = null;
      (doc.activeElement as HTMLElement | null)?.blur?.();
      draw(`tab:${current}`);
      dialog.scrollTop = 0;
      if (!dialog.contains(doc.activeElement)) closeX.focus();
    },
    close() {
      if (!opened) return;
      opened = false;
      spentHere = [];
      scrim.hidden = true;
      root.removeAttribute('inert');
      (opener?.isConnected ? opener : button).focus();
      opener = null;
    },
    refresh() {
      draw();
    },
  };

  updateBadge(opts.state().game);
  return api;
}

/** A held gun's dmg/s as printed. */
const heldDps = (h: Held): string => gunPower(h).toFixed(1);
/** The base gun's name: "SMG". */
const heldType = (h: Held): string => WEAPONS[baseOf(h)].name;
/** The gun's role: "Marksman". */
const roleName = (h: Held): string => roleOf(baseOf(h))?.role ?? '';
