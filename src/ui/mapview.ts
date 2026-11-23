// The World map tab (ID-219): the camp window's fourth tab, opened by the start screen's World
// map button. It shows the map's areas as cards (name, danger, trip time, what each can drop
// and how likely); an area with a patrol out shows the team and a live countdown, then "report
// ready". "Send a patrol" opens the team picker: bench survivors, the team's rating against the
// area's danger and each member's injury chance, live as members are added or removed. A
// patrol back opens its report; OK takes the loot and XP. Sending and taking reports work
// between hordes only. Text reaches the page only through textContent.
import { heldName, levelName } from '../core/armoury.ts';
import { AREAS, DANGERS, MAP_PATROL, WEAPONS, type AreaId } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { restLabel, restOf } from '../core/hordeonly.ts';
import {
  areaDrops,
  backPatrols,
  bestHorde,
  teamPower,
  teamRatio,
  isBack,
  patrolAt,
  patrolOf,
  sendRefusal,
  teamRisk,
  type MapArea,
  type MapPatrol,
  type MapReport,
} from '../core/scout.ts';
import { levelOf } from '../core/stats.ts';
import type { CampWindow } from './campwindow.ts';
import { el } from './hud.ts';
import { AREA_ART, ART_URLS } from './sprites.ts';
import { LOOT_NAME, patrolsOut, patrolTime, pct, tripText } from './maptext.ts';

export const MAP_WAIT = 'Send patrols and take reports between hordes.';
export const MAP_NOTE =
  'Bench survivors scavenge in real time, even with the game closed. Each member rolls once: drop chances are per member.';
export const MAP_EMPTY_BENCH =
  'Nobody on the bench to send. Survivors outside the squad can patrol: bench one on the Roster.';

export interface MapOptions {
  /** The camp now, the time, whether closing resumes a fight, and whether sending works now. */
  state: () => { game: GameState; now: number; resumes: boolean; canSend: boolean };
  /** Sends `ids` to `area`, saved at once. */
  onSend: (area: AreaId, ids: string[]) => { ok: true } | { ok: false; reason: string };
  /** Takes the report of the patrol at `area` (OK), saved at once. */
  onTake: (area: AreaId) => { ok: true } | { ok: false; reason: string };
  /** The report the patrol at `area` brings, before it is taken. */
  report: (area: AreaId) => MapReport | null;
}

export interface MapTab {
  isOpen(): boolean;
  /** Opens the tab (on a waiting report, if any); the keyboard goes back to `from` on a close. */
  open(from?: HTMLElement | null): void;
  /** Re-reads the camp: call when it changes. */
  refresh(): void;
  /** Once a second: the countdowns, and a redraw when a patrol comes back. */
  tick(now: number): void;
}

type View =
  | { kind: 'list' }
  | { kind: 'pick'; area: AreaId; ids: string[] }
  | { kind: 'report'; area: AreaId };

const levelText = (d: RosterDefender): string => `Lv ${levelOf(d.xp).level}`;

/** Adds the World map tab to `win`; `button` is where the keyboard goes back by default. */
export function createMapView(opts: MapOptions, win: CampWindow, button: HTMLElement): MapTab {
  let opened = false;
  let view: View = { kind: 'list' };
  let drawn: { game: GameState; can: boolean; back: number } | null = null;

  const pane = el('div', 'map-dialog');
  const body = el('div', 'map-body');
  pane.append(body);
  const count = el('span', 'map-count');
  const status = el('p', 'menu-note inv-status map-status');
  status.setAttribute('role', 'status');
  const say = (text: string, refused = false): void => {
    if (refused) status.dataset.tone = 'refused';
    else delete status.dataset.tone;
    status.textContent = text;
  };

  /**
   * An area's picture with its name over the foot and its danger in the corner (`tag`, or
   * the danger and trip time): the card's top, and the head of the picker and the report.
   */
  function banner(
    kind: AreaId,
    danger: MapArea['danger'],
    title: string,
    tag?: string,
  ): HTMLElement {
    const art = el('div', 'map-art');
    art.dataset.danger = danger;
    const img = el('img', 'map-art-img');
    img.alt = '';
    img.loading = 'lazy';
    // No URL, no request: an empty src would fetch the page itself.
    const url = ART_URLS[AREA_ART[kind]];
    if (url) img.src = url;
    const name = el('h3', 'map-area-name', title);
    name.tabIndex = -1;
    art.append(
      img,
      el('span', 'map-danger', tag ?? `${DANGERS[danger].name} · ${tripText(danger)}`),
      name,
    );
    return art;
  }

  function areaCard(game: GameState, area: MapArea, now: number, can: boolean): HTMLElement {
    const card = el('article', 'map-area');
    card.dataset.area = area.kind;
    card.dataset.danger = area.danger;
    const art = banner(area.kind, area.danger, AREAS[area.kind].name);
    const drops = el('ul', 'map-drops');
    drops.setAttribute('aria-label', 'Drops, chance per member');
    for (const d of areaDrops(area)) {
      const li = el('li', 'map-drop');
      li.append(
        el('span', 'map-drop-name', LOOT_NAME[d.loot]),
        el('b', 'map-drop-pct', pct(d.chance)),
      );
      drops.append(li);
    }
    card.append(art);
    const p = patrolAt(game, area.kind);
    if (p) {
      card.dataset.out = 'true';
      // Over the picture: where they are, as the first thing seen.
      const time = el('p', 'map-time', patrolTime(p, now));
      time.dataset.live = area.kind;
      art.append(time);
      // In the button's place, so every card keeps one shape: the team, then once it is
      // back, the report to open.
      let slot: HTMLElement;
      if (isBack(p, now)) {
        card.dataset.ready = 'true';
        const open = el('button', 'hud-button btn-primary map-open-report', 'Open report');
        open.type = 'button';
        open.disabled = !can;
        open.title = can ? '' : MAP_WAIT;
        open.addEventListener('click', () => go({ kind: 'report', area: area.kind }));
        slot = open;
      } else {
        slot = el('ul', 'map-team');
        slot.setAttribute('aria-label', 'Team');
        for (const id of p.members) {
          const d = game.reserve.find((r) => r.id === id);
          if (!d) continue;
          const li = el('li', 'map-member');
          li.title = d.name;
          li.append(el('span', 'map-member-name', d.name), el('b', 'map-member-lv', levelText(d)));
          slot.append(li);
        }
      }
      const foot = el('div', 'map-area-foot');
      foot.append(drops, slot);
      card.append(foot);
    } else {
      const send = el('button', 'hud-button map-send', 'Send a patrol');
      send.type = 'button';
      send.disabled = !can;
      send.title = can ? '' : MAP_WAIT;
      send.addEventListener('click', () => go({ kind: 'pick', area: area.kind, ids: [] }));
      const foot = el('div', 'map-area-foot');
      foot.append(drops, send);
      card.append(foot);
    }
    return card;
  }

  function list(game: GameState, now: number, can: boolean): HTMLElement[] {
    const grid = el('div', 'map-areas');
    for (const a of game.map?.areas ?? []) grid.append(areaCard(game, a, now, can));
    return [grid, el('p', 'menu-note map-note', can ? MAP_NOTE : MAP_WAIT)];
  }

  /** Why bench survivor `d` can't be picked, or null. */
  function lockOf(game: GameState, d: RosterDefender): string | null {
    const out = patrolOf(game, d.id);
    if (out) return `On patrol · ${AREAS[out.area].name}`;
    return restOf(d) > 0 ? restLabel(restOf(d)) : null;
  }

  function picker(game: GameState, area: AreaId, ids: string[], can: boolean): HTMLElement[] {
    const spot = game.map?.areas.find((a) => a.kind === area);
    if (!spot) return list(game, opts.state().now, can);
    const box = el('section', 'map-pick');
    box.setAttribute('aria-label', `Send a patrol to ${AREAS[area].name}`);
    box.append(banner(area, spot.danger, `Send to ${AREAS[area].name}`));
    // Two columns: who can go, then the team's risk and the buttons beside it.
    const main = el('div', 'map-pick-main');
    const side = el('div', 'map-pick-side');
    const cols = el('div', 'map-cols');
    cols.append(main, side);
    box.append(cols);
    const bench = game.reserve;
    if (bench.length === 0) {
      main.append(el('p', 'map-empty', MAP_EMPTY_BENCH));
    } else {
      main.append(
        el(
          'p',
          'map-sub',
          `Pick ${MAP_PATROL.min} to ${MAP_PATROL.max} from the bench. The squad stays to defend.`,
        ),
      );
      const rows = el('div', 'map-pick-list');
      rows.setAttribute('role', 'group');
      rows.setAttribute('aria-label', 'Bench survivors');
      for (const d of bench) {
        const lock = lockOf(game, d);
        const on = ids.includes(d.id);
        const b = el('button', 'map-pick-member');
        b.type = 'button';
        b.dataset.id = d.id;
        b.setAttribute('aria-pressed', String(on));
        const full = !on && ids.length >= MAP_PATROL.max;
        b.disabled = lock !== null || full;
        b.title = lock ?? (full ? `At most ${MAP_PATROL.max} can go` : d.name);
        const gun = heldName(d.loadout.primary ?? 'pistol');
        b.append(
          el('span', 'map-member-name', d.name),
          el('b', 'map-member-lv', levelText(d)),
          el('span', 'map-member-gun', lock ?? gun),
        );
        b.addEventListener('click', () => {
          const next = on ? ids.filter((x) => x !== d.id) : [...ids, d.id];
          go({ kind: 'pick', area, ids: next }, true);
          pane.querySelector<HTMLElement>(`.map-pick-member[data-id="${d.id}"]`)?.focus();
        });
        rows.append(b);
      }
      main.append(rows);
    }
    // The team against the area's danger, live as members are picked.
    const team = ids.flatMap((id) => bench.filter((d) => d.id === id));
    const risk = teamRisk(game, team, spot.danger);
    const rating = el('div', 'map-risk');
    rating.dataset.rating = team.length > 0 ? risk.rating : 'none';
    rating.setAttribute('aria-live', 'polite');
    if (team.length === 0) {
      rating.append(el('span', 'map-risk-line', 'Pick a team to see its risk.'));
    } else {
      const line = el('p', 'map-risk-line');
      line.append(el('span', '', 'Team rating'), el('b', 'map-rating', DANGERS[risk.rating].name));
      // The card's own drops, at this team's odds: each member rolls once.
      const ratio = teamRatio(teamPower(team), spot.danger, bestHorde(game));
      const odds = el('p', 'map-risk-odds');
      odds.textContent = `${team.length} of ${MAP_PATROL.max} going · each finds ${areaDrops(
        spot,
        ratio,
      )
        .map((d) => `${LOOT_NAME[d.loot]} ${pct(d.chance)}`)
        .join(' · ')}`;
      const chosen = el('ul', 'map-chosen');
      chosen.setAttribute('aria-label', 'Injury chance');
      for (const d of team) {
        const li = el('li', 'map-chosen-row');
        li.append(
          el('span', 'map-member-name', d.name),
          el('span', 'map-injury', `injury ${pct(risk.injury)}`),
        );
        chosen.append(li);
      }
      rating.append(line, odds, chosen);
    }
    side.append(rating);
    const why = can ? sendRefusal(game, area, ids) : MAP_WAIT;
    const send = el(
      'button',
      'hud-button btn-primary map-go',
      team.length > 0 ? `Send ${team.length}` : 'Send',
    );
    send.type = 'button';
    send.disabled = why !== null;
    send.title = why ?? '';
    send.addEventListener('click', () => {
      const r = opts.onSend(area, ids);
      if (!r.ok) {
        say(r.reason, true);
        return;
      }
      say(`Patrol sent to ${AREAS[area].name}`);
      go({ kind: 'list' }, true);
      pane.querySelector<HTMLElement>(`.map-area[data-area="${area}"] .map-time`)?.focus?.();
    });
    const back = el('button', 'map-back', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => go({ kind: 'list' }));
    const buttons = el('div', 'map-buttons');
    buttons.append(back, send);
    side.append(buttons);
    return [box];
  }

  function reportView(game: GameState, area: AreaId, can: boolean): HTMLElement[] {
    const r = opts.report(area);
    if (!r) return list(game, opts.state().now, can);
    const box = el('section', 'map-report');
    box.setAttribute('aria-label', 'Patrol report');
    box.append(banner(r.area, r.danger, `Back from ${AREAS[r.area].name}`, DANGERS[r.danger].name));
    // Two columns: who went and how they came back, then what they found.
    const main = el('div', 'map-pick-main');
    const side = el('div', 'map-pick-side');
    const cols = el('div', 'map-cols');
    cols.append(main, side);
    box.append(cols);
    const people = el('ul', 'map-report-team');
    people.setAttribute('aria-label', 'Team');
    for (const m of r.members) {
      const li = el('li', 'map-report-member');
      if (m.injured) li.dataset.injured = 'true';
      // One status per row, in its own column: hurt, levelled up, or fine.
      const note = m.injured
        ? el('span', 'map-report-hurt', 'Injured · rests 1 horde')
        : m.levels > 0
          ? el('span', 'map-report-up', m.levels > 1 ? `+${m.levels} levels` : 'Level up')
          : el('span', 'map-report-ok', 'Back safe');
      li.append(
        el('span', 'map-member-name', m.name),
        el('b', 'map-member-lv', `Lv ${m.level}`),
        el('span', 'map-report-xp', `+${m.xp.toLocaleString('en-US')} XP`),
        note,
      );
      people.append(li);
    }
    main.append(el('h4', 'map-found-head', 'Team'), people);
    const found = el('ul', 'map-found');
    found.setAttribute('aria-label', 'Found');
    const item = (text: string, cls = ''): void => {
      found.append(el('li', `map-found-item ${cls}`.trim(), text));
    };
    for (const w of r.weapons) {
      const li = el('li', 'map-found-item map-found-gun', levelName(w));
      li.dataset.rarity = w.rarity;
      found.append(li);
    }
    for (const b of r.blueprints) {
      item(`${WEAPONS[b.base].name} blueprint${b.kept ? '' : ' (at the cap: lost)'}`);
    }
    if (r.scrap > 0) item(`Scrap +${r.scrap.toLocaleString('en-US')}`);
    if (r.medicine > 0) item(`Medicine +${r.medicine}`);
    if (found.childElementCount === 0) item('Nothing found this time', 'map-found-none');
    else if (r.finds < r.members.length) {
      const none = r.members.length - r.finds;
      item(`${none} found nothing`, 'map-found-none');
    }
    side.append(el('h4', 'map-found-head', 'Found'), found);
    if (r.thrown.length > 0) {
      side.append(
        el(
          'p',
          'map-sub',
          `Stash full: ${r.thrown.map((w) => levelName(w)).join(', ')} thrown away for ${r.salvage} Scrap.`,
        ),
      );
    }
    const ok = el('button', 'hud-button btn-primary map-go', 'OK');
    ok.type = 'button';
    ok.disabled = !can;
    ok.title = can ? '' : MAP_WAIT;
    ok.addEventListener('click', () => {
      const t = opts.onTake(area);
      if (!t.ok) {
        say(t.reason, true);
        return;
      }
      say(`Report taken: ${AREAS[area].name}`);
      // Another report waiting comes next.
      const { game: g, now } = opts.state();
      const next = backPatrols(g, now)[0];
      go(next && can ? { kind: 'report', area: next.area } : { kind: 'list' }, true);
    });
    const buttons = el('div', 'map-buttons');
    buttons.append(ok);
    side.append(buttons);
    return [box];
  }

  function draw(): void {
    const { game, now, canSend } = opts.state();
    drawn = { game, can: canSend, back: backPatrols(game, now).length };
    const parts =
      view.kind === 'pick'
        ? picker(game, view.area, view.ids, canSend)
        : view.kind === 'report'
          ? reportView(game, view.area, canSend)
          : list(game, now, canSend);
    body.replaceChildren(...parts);
    pane.dataset.view = view.kind;
    count.textContent = patrolsOut(game.map?.patrols.length ?? 0) ?? '';
  }

  /** Shows `next`; the footer's line is cleared unless it was just set for this move (`keep`). */
  function go(next: View, keep = false): void {
    if (!keep) say('');
    view = next;
    draw();
    if (next.kind === 'report') pane.querySelector<HTMLElement>('.map-area-name')?.focus();
  }

  win.add({
    id: 'map',
    label: 'World map',
    panel: pane,
    tools: [count],
    status,
    button,
    show() {
      opened = true;
      say('');
      const { game, now, canSend } = opts.state();
      const ready = canSend ? backPatrols(game, now)[0] : undefined;
      view = ready ? { kind: 'report', area: ready.area } : { kind: 'list' };
      draw();
      win.setResumes(opts.state().resumes);
      if (ready) pane.querySelector<HTMLElement>('.map-area-name')?.focus({ preventScroll: true });
    },
    hide() {
      opened = false;
      view = { kind: 'list' };
    },
    escape() {
      if (view.kind !== 'pick') return false;
      go({ kind: 'list' });
      return true;
    },
  });

  const api: MapTab = {
    isOpen: () => opened,
    open(from) {
      win.open('map', from);
    },
    refresh() {
      const { game, resumes, canSend } = opts.state();
      count.textContent = patrolsOut(game.map?.patrols.length ?? 0) ?? '';
      if (!opened) return;
      win.setResumes(resumes);
      if (drawn && game === drawn.game && canSend === drawn.can) return;
      // A report taken, or a patrol gone, while it was on show: back to the map.
      if (view.kind === 'report' && !patrolAt(game, view.area)) view = { kind: 'list' };
      if (view.kind === 'pick' && patrolAt(game, view.area)) view = { kind: 'list' };
      draw();
    },
    tick(now) {
      if (!opened || !drawn) return;
      if (backPatrols(drawn.game, now).length !== drawn.back) {
        draw();
        return;
      }
      for (const node of pane.querySelectorAll<HTMLElement>('[data-live]')) {
        const p: MapPatrol | null = patrolAt(drawn.game, node.dataset.live as AreaId);
        if (!p) continue;
        const text = patrolTime(p, now);
        if (node.textContent !== text) node.textContent = text;
      }
    },
  };
  return api;
}
