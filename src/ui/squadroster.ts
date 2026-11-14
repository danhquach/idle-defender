// The Roster (ID-086, reworked by ID-108): a top-bar button that opens one compact dialog:
// a header (the title, "Best gun for everyone", close), one row of squad tabs (portrait,
// name, level, profession), the selected survivor beside their gun slot, and one panel that
// is either their details (ID-146, ID-149: what the level and the profession give, and every
// stat split into the two) or "Choose a gun". A gun is compared with the one
// held before it is equipped. The bench (ID-147) has its own row of tabs under the squad's:
// between hordes a survivor moves between the two, unless they are resting. Like the
// Inventory, the field goes inert behind it and an open Roster holds a fight. Text reaches
// the page only through textContent.
import { baseOf, heldName, isOwned, roleOf, type Held } from '../core/armoury.ts';
import { JOBS, SQUAD_CAP, STASH_CAP, WEAPONS, type Rarity } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { isFit, restLabel, restOf, squadOf, squadSpec, type GunMove } from '../core/hordeonly.ts';
import type { HordeState } from '../core/horde.ts';
import { jobFits, levelOf, maxHpOf, survivorDps } from '../core/stats.ts';
import { bestUpgrade, gunCompare, gunName, gunTiles, heldGunOf, rarityOf } from './gunpick.ts';
import { el } from './hud.ts';
import { GUNS_WAIT } from './inventory.ts';
import { JOB_SHORT, jobInfo, NO_BONUS, statRows } from './jobtext.ts';
import { levelText } from './statlines.ts';
import { ART_URLS, avatarOf, GUN_ICON, type ArtId, type GunId } from './sprites.ts';

/** One survivor's tab on the Roster. */
export interface RosterTile {
  id: string;
  name: string;
  level: number;
  /** Their profession (ID-149): "Hunter"; `jobShort` where room is short. */
  job: string;
  jobShort: string;
  /**
   * "HP 105/105"; "Injured", "Down" or "Resting: 2 hordes" (ID-147) in place of it when they
   * can't fight.
   */
  health: string;
  down: boolean;
  /** On the bench (ID-147), not in the squad. */
  bench: boolean;
  /** Hordes left to rest (ID-147); 0 when fit. */
  rest: number;
  /** "Military Rifle"; the free pistol is "Pistol". */
  gun: string;
  rarity: Rarity;
  art: ArtId;
}

/** A camp as the Roster reads it: the squad, and the bench if there is one (ID-147). */
type Camp = Pick<GameState, 'roster'> & { reserve?: readonly RosterDefender[] };

/**
 * The Roster's tabs for `game` at `now`: the squad in roster order, then the bench (ID-147),
 * the fit first so the ones to pick come before the resting (each part in bench order).
 * In a fight (`fight`), HP is the fight's and a survivor down in it is marked "Down";
 * between hordes HP is full, one resting for hordes is "Resting: N hordes", and one still
 * resting by the clock (an older camp save) is "Injured".
 */
export function rosterTiles(game: Camp, now: number, fight: HordeState | null): RosterTile[] {
  const bench = new Set((game.reserve ?? []).map((d) => d.id));
  const reserve = game.reserve ?? [];
  const ordered = [...reserve.filter(isFit), ...reserve.filter((d) => !isFit(d))];
  return [...game.roster, ...ordered].map((d) => {
    const held = heldGunOf(d);
    const inFight = fight?.defenders.find((f) => f.id === d.id);
    const downInFight = fight?.injured.some((i) => i.defender.id === d.id) ?? false;
    const resting = d.injuredUntil !== null && d.injuredUntil > now;
    let health: string;
    if (inFight) health = `HP ${Math.max(0, Math.ceil(inFight.hp))}/${inFight.maxHp}`;
    else if (downInFight) health = 'Down';
    else if (!isFit(d)) health = restLabel(restOf(d));
    else if (resting) health = 'Injured';
    else health = `HP ${maxHpOf(d)}/${maxHpOf(d)}`;
    return {
      id: d.id,
      name: d.name,
      level: levelOf(d.xp).level,
      job: JOBS[d.job].name,
      jobShort: JOB_SHORT[d.job],
      health,
      down: !inFight && (downInFight || resting || !isFit(d)),
      bench: bench.has(d.id),
      rest: restOf(d),
      gun: heldName(held),
      rarity: rarityOf(held),
      art: avatarOf(d),
    };
  });
}

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
   * The camp now, the fight under way if any, whether guns can be changed, and whether
   * closing resumes a fight (Close label).
   */
  state: () => {
    game: Pick<GameState, 'roster' | 'armoury'> & { reserve?: readonly RosterDefender[] };
    fight: HordeState | null;
    canGear: boolean;
    resumes: boolean;
  };
  /** Equip: give survivor `id` the free pistol ('pistol') or the stash gun with uid `choice`. */
  onEquip: (id: string, choice: string) => { ok: true } | { ok: false; reason: string };
  /** Move survivor `id` between the squad and the bench (ID-147), or why not. */
  onToggleSquad: (id: string) => { ok: true } | { ok: false; reason: string };
  /** "Best gun for everyone": the guns handed out, or why not. */
  onBestGuns: () => { ok: true; moves: GunMove[] } | { ok: false; reason: string };
}

export interface Roster {
  isOpen(): boolean;
  /**
   * Opens on survivor `id`'s level (the first survivor without one); closing gives the keyboard back to `from` (what was clicked), else to what had it.
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
  let status = { text: '', tone: 'ok' as 'ok' | 'danger' };
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
  // The bench (ID-147): its own row under the squad's, with a label over each row.
  const squadLabel = el('p', 'rv-tabs-label');
  const benchLabel = el('p', 'rv-tabs-label');
  const benchTabs = el('ul', 'rv-tabs rv-bench');
  benchTabs.setAttribute('aria-label', 'Bench');
  const top = el('div', 'rv-top');
  const panel = el('div', 'rv-panel');
  const statusLine = el('p', 'rv-status');
  statusLine.setAttribute('role', 'status');
  dialog.append(grab, head, squadLabel, tabs, benchLabel, benchTabs, top, panel, statusLine);

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

  const keyOf = (): string | undefined =>
    (doc.activeElement as HTMLElement | null)?.dataset?.key ?? undefined;

  /** Draws everything; keeps the keyboard on `key` (default: where it is) when it is still there. */
  function draw(focus?: string): void {
    const { game, fight, canGear, resumes } = opts.state();
    if (!opened) return;
    const want = focus ?? keyOf();
    const camp = [...game.roster, ...(game.reserve ?? [])];
    let d = camp.find((r) => r.id === current);
    if (!d) {
      d = game.roster[0];
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
    const benched = marks.filter((t) => t.bench);
    const squadText = `Squad ${marks.length - benched.length}/${SQUAD_CAP}`;
    tabs.setAttribute('aria-label', squadText);
    tabs.replaceChildren(...marks.filter((t) => !t.bench).map((t) => tabItem(t, t.id === current)));
    // With nobody on the bench the rows need no labels: the Roster looks as it did.
    squadLabel.hidden = benchLabel.hidden = benchTabs.hidden = benched.length === 0;
    squadLabel.textContent = squadText;
    benchLabel.textContent = `Bench ${benched.length}`;
    benchTabs.replaceChildren(...benched.map((t) => tabItem(t, t.id === current)));
    if (d) {
      top.replaceChildren(
        ...survivorRow(
          d,
          marks.find((t) => t.id === d.id)!,
          canGear,
        ),
      );
      panel.replaceChildren(
        ...(picking ? pickerPanel(d, game, canGear) : levelPanel(d, squadOf(game))),
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
    const target = find(key) ?? find(`tab:${current}`) ?? find('close');
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
    tab.title = `${t.name}, level ${t.level}, ${t.job}, ${t.health}`;
    tab.setAttribute('aria-label', `${t.name}, level ${t.level}, ${t.job}, ${t.health}`);
    tab.classList.toggle('rv-tab-down', t.down);
    const text = el('span', 'rv-tab-text');
    // Name, level, then the profession on a line of its own (ID-149), so a narrow tab never
    // cuts it; on a phone the level drops out and the short profession name stays.
    text.append(
      el('span', 'rv-tab-name', t.name),
      el('span', 'rv-tab-level', `Lv ${t.level}`),
      // Resting (ID-147): how long, in words, where the profession was; not colour alone.
      el('span', 'rv-tab-job', t.rest > 0 ? `Rest ${t.rest}` : t.jobShort),
    );
    tab.append(avatar(t.art, 'roster-avatar roster-avatar-xs'), text);
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
    sub.append(
      `Level ${level} · ${mark.job} · `,
      el('span', mark.down ? 'roster-tile-down' : '', mark.health),
    );
    text.append(el('h3', 'rv-who-name', d.name), sub, track);
    const { game } = opts.state();
    // Only with a bench to swap with (ID-147): a camp of six or fewer has no choice to make.
    // Someone resting gets none: "Resting: N hordes" on the line above says why.
    if ((game.reserve ?? []).length > 0 && isFit(d)) text.append(squadButton(d, mark, canGear));
    who.append(avatar(mark.art, 'roster-avatar roster-avatar-md'), text);

    const held = heldGunOf(d);
    const slot = el('button', 'rv-slot');
    slot.type = 'button';
    slot.dataset.key = 'slot';
    slot.dataset.rarity = rarityOf(held);
    slot.setAttribute('aria-expanded', String(picking));
    slot.setAttribute('aria-disabled', String(!canGear));
    const dps = heldDps(held, d);
    slot.setAttribute(
      'aria-label',
      `Gun: ${gunName(held)}, ${dps} dmg/s. ${canGear ? (picking ? 'Back to level' : 'Change gun') : GUNS_WAIT}`,
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

  /**
   * Moves fit survivor `d` between the squad and the bench (ID-147): "Move to bench" in the
   * squad, "Add to squad" on the bench, greyed with `SQUAD_WAIT` in a fight. A refusal (the
   * last in the squad, a full squad) shows on the status line.
   */
  function squadButton(d: RosterDefender, mark: RosterTile, canGear: boolean): HTMLElement {
    const label = mark.bench ? 'Add to squad' : 'Move to bench';
    const b = el('button', 'hud-button rv-btn rv-squad', label);
    b.type = 'button';
    b.dataset.key = 'squad';
    b.disabled = !canGear;
    b.title = canGear ? '' : SQUAD_WAIT;
    b.setAttribute('aria-label', `${label}: ${d.name}${canGear ? '' : `. ${SQUAD_WAIT}`}`);
    b.addEventListener('click', () => {
      const r = opts.onToggleSquad(d.id);
      if (!r.ok) setStatus(r.reason, 'danger');
      else setStatus(mark.bench ? `${d.name} joins the squad.` : `${d.name} waits on the bench.`);
      draw('squad');
    });
    return b;
  }

  /**
   * The details panel (ID-146, ID-149): "Level N" and its XP, the profession's benefit
   * highlighted (greyed with "No bonus with this gun" for a fighting job off its guns; the
   * no-stack note for a shared job another of `squad` has), what the level gives, and every
   * stat split into the level's part and the profession's.
   */
  function levelPanel(d: RosterDefender, squad: readonly RosterDefender[]): HTMLElement[] {
    const { level, into, next } = levelOf(d.xp);
    const held = heldGunOf(d);
    const headRow = el('div', 'rv-phead');
    headRow.append(
      el('span', 'rv-ttl', `Level ${level}`),
      el('span', 'rv-left', `${into}/${next} XP`),
    );
    const info = jobInfo(d, held, squad);
    const job = el('div', 'rv-job');
    job.toggleAttribute('data-off', info.off);
    job.append(el('p', 'rv-job-line', info.line));
    if (info.off) job.append(el('p', 'rv-job-note', NO_BONUS));
    if (info.note) job.append(el('p', 'rv-job-note', info.note));
    const table = el('table', 'rv-stats');
    const head = el('tr', '');
    for (const h of ['', 'Total', 'Level', 'Profession']) head.append(el('th', '', h));
    const thead = el('thead', '');
    thead.append(head);
    const body = el('tbody', '');
    for (const r of statRows(d, held)) {
      const tr = el('tr', '');
      const th = el('th', '', r.label);
      th.scope = 'row';
      const jobCell = el('td', 'rv-stat-job', r.job);
      jobCell.toggleAttribute('data-off', r.off);
      if (r.off) jobCell.title = NO_BONUS;
      tr.append(th, el('td', 'rv-stat-total', r.total), el('td', '', r.level), jobCell);
      body.append(tr);
    }
    table.append(thead, body);
    return [headRow, job, el('p', 'rv-level', levelText(level)), table];
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
    const back = el('button', 'hud-button rv-btn', 'Level');
    back.type = 'button';
    back.dataset.key = 'level';
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
      const cmp = gunCompare(held, choice.held, squadSpec(d));
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
        // The dmg/s row is theirs (ID-152); the gun's own numbers follow.
        const label = r.label === 'dmg/s' ? `${d.name}'s dmg/s` : r.label;
        tr.append(el('th', '', label), el('td', '', r.now), el('td', '', r.next), change);
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
    // A fighting job's guns are marked (ID-149): only they give the profession's bonus.
    const fighter = JOBS[d.job].kind === 'fight';
    const suits = (h: Held): boolean => fighter && jobFits(d.job, h);
    for (const t of tiles) {
      const li = el('li', 'rv-cell');
      const tile = el('button', 'rv-tile');
      tile.type = 'button';
      tile.dataset.key = `tile:${t.choice}`;
      tile.dataset.choice = t.choice;
      tile.dataset.rarity = t.rarity;
      tile.setAttribute('aria-pressed', String(t.choice === picked));
      const label = suits(t.held) ? `${t.label}, suits a ${JOBS[d.job].name}` : t.label;
      tile.setAttribute('aria-label', label);
      tile.title = label;
      const delta = el('span', 'rv-d', t.delta.text);
      delta.dataset.kind = t.delta.kind;
      tile.append(
        delta,
        // The first word fits a tile ("Sniper", not "Sniper r…"); the label has it in full.
        el('span', 'rv-ty', `${t.type.split(' ')[0]}${t.free ? ' ∞' : ''}`),
        el('span', 'rv-dps', t.dps),
      );
      if (suits(t.held)) {
        const mark = el('span', 'rv-fit', '★');
        mark.setAttribute('aria-hidden', 'true');
        tile.append(mark);
      }
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
    out.push(
      el(
        'p',
        'rv-hint',
        `Frame colour = rarity. dmg/s is ${d.name}'s, level and profession counted; ▲ ▼ compare it with the gun held now.${
          fighter
            ? ` ★ suits a ${JOBS[d.job].name}: the profession's bonus works only with these.`
            : ''
        }`,
      ),
    );
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
        status = { text: '', tone: 'ok' };
        scrim.hidden = false;
        root.setAttribute('inert', '');
      }
      const { game } = opts.state();
      const asked = [...game.roster, ...(game.reserve ?? [])].find((r) => r.id === id);
      current = (asked ?? game.roster[0])?.id ?? null;
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
      scrim.hidden = true;
      root.removeAttribute('inert');
      (opener?.isConnected ? opener : button).focus();
      opener = null;
    },
    refresh() {
      draw();
    },
  };

  return api;
}

/** Why the squad can't change now (ID-147): it is picked between hordes. */
export const SQUAD_WAIT = 'Pick the squad between hordes';

/** A held gun's dmg/s in survivor `d`'s hands, as printed (level and profession, ID-152): the picker's figure. */
const heldDps = (h: Held, d: RosterDefender): string => survivorDps(squadSpec(d), h).toFixed(1);
/** The base gun's name: "SMG". */
const heldType = (h: Held): string => WEAPONS[baseOf(h)].name;
/** The gun's role: "Marksman". */
const roleName = (h: Held): string => roleOf(baseOf(h))?.role ?? '';
