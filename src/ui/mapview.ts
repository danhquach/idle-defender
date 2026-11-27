// The World map tab (ID-219): the camp window's fourth tab, opened by the start screen's World
// map button. It shows the map's areas as cards (name, danger, trip time, what each can drop
// and how likely); an area with a patrol out shows the team and a live countdown, then "report
// ready". "Send a patrol" opens the team picker: bench survivors, the team's rating against the
// area's danger and each member's injury chance, live as members are added or removed; each
// survivor's power, the team's Safe line and an ⓘ explanation (ID-246). A team out shows its
// own rating and odds from the power it left with (ID-246). A
// patrol back opens its report; OK takes the loot and XP. Sending and taking reports work
// between hordes only. Text reaches the page only through textContent.
import { MAP_PATROL, type AreaId, type Danger } from '../core/data.ts';
import type { GameState, RosterDefender } from '../core/game.ts';
import { restOf, survivorPower } from '../core/hordeonly.ts';
import {
  areaDrops,
  backPatrols,
  bestHorde,
  teamPower,
  teamRatio,
  isBack,
  patrolAt,
  patrolOf,
  patrolPool,
  patrolRatio,
  rerollCost,
  rerollRefusal,
  safePower,
  sendRefusal,
  teamRating,
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
import {
  lockText,
  refusedText,
  type Refused,
  heldName,
  levelName,
  restLabel,
  AREA_NAME,
  DANGER_NAME,
  WEAPON_NAME,
} from './text/index.ts';

export const MAP_WAIT = 'Send patrols and take reports between hordes.';
/** A number and its unit that never split across lines when a label wraps. */
const NBSP = String.fromCharCode(160);
const num = (n: number): string => n.toLocaleString('en-US');
/** The Reroll button's label (ID-252): "Reroll · 30 Scrap", the space before Scrap not breaking. */
export const rerollLabel = (cost: number): string => `Reroll · ${num(cost)}${NBSP}Scrap`;
/** What the Reroll button is read out as. */
export const rerollAria = (cost: number): string => `Reroll areas, ${num(cost)} Scrap`;
/** What a reroll says once made: the new areas, the Scrap spent and what is left. */
export const rerollText = (cost: number, left: number): string =>
  `New areas · ${num(cost)} Scrap spent, ${num(left)} left.`;
export const MAP_NOTE =
  'Bench survivors scavenge in real time, even with the game closed. Each member rolls once: drop chances are per member.';
export const MAP_EMPTY_BENCH =
  'Nobody on the bench to send. Survivors outside the squad can patrol: bench one on the Roster.';
export const MAP_ALL_OUT = 'Everyone on the bench is out on patrol.';
export const MAP_NOBODY_FREE = 'Nobody on the bench can go';
export const MAP_BEST_FIT =
  'Picks the fewest bench survivors that rate Safe, strongest first; the strongest team when none can.';
export const MAP_HELP_LABEL = 'How patrols are rated';
/** The picker's explanation behind its ⓘ button (ID-246), one line each. */
export const MAP_HELP: readonly string[] = [
  "Power: each survivor's share of Squad Power, from their main gun, level and max HP.",
  "Team rating: the team's power against what the area's danger asks.",
  'A stronger team: lower injury chance and better drop odds.',
  'Best fit: the fewest survivors that rate Safe, strongest first; the strongest team when none can.',
];

/** A power as shown (ID-246): whole, rounded down. */
export const powerText = (n: number): string => Math.floor(n).toLocaleString('en-US');

/**
 * The team's power against the Safe line (ID-246): "Power 120 / 150 for Safe" short of it,
 * "Power 160 · Safe from 150" once it rates Safe (`reached`, the rating's own test). The line
 * is rounded up when short and down when over, so the two numbers never contradict the rating.
 */
export function safeLine(power: number, need: number, reached: boolean): string {
  if (reached) return `Power ${powerText(power)} · Safe from ${powerText(need)}`;
  return `Power ${powerText(power)} / ${Math.ceil(need).toLocaleString('en-US')} for Safe`;
}

/**
 * The team "Best fit" picks against `danger` (ID-244): the fewest free bench survivors that
 * rate Safe, strongest first (ties in bench order); with none Safe, the strongest team
 * allowed. Team power is a plain sum of non-negative shares, so the strongest-first prefix is
 * the smallest team that reaches Safe, and the longest one is the strongest team.
 */
export function bestFit(game: GameState, danger: Danger): string[] {
  const ranked = patrolPool(game)
    .map((d, i) => ({ d, i, power: survivorPower(d) }))
    .sort((a, b) => b.power - a.power || a.i - b.i)
    .slice(0, MAP_PATROL.max)
    .map(({ d }) => d);
  // The full team needs no check: it is the answer either way.
  for (let n = 1; n < ranked.length; n++) {
    const team = ranked.slice(0, n);
    if (teamRisk(game, team, danger).rating === 'safe') return team.map((d) => d.id);
  }
  return ranked.map((d) => d.id);
}

export interface MapOptions {
  /** The camp now, the time, whether closing resumes a fight, and whether sending works now. */
  state: () => { game: GameState; now: number; resumes: boolean; canSend: boolean };
  /** Sends `ids` to `area`, saved at once. */
  onSend: (area: AreaId, ids: string[]) => { ok: true } | Refused;
  /** Takes the report of the patrol at `area` (OK), saved at once. */
  onTake: (area: AreaId) => { ok: true } | Refused;
  /** Rerolls the areas without a patrol for Scrap (between hordes), saved at once. */
  onReroll: () => { ok: true } | Refused;
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
  /** Whether the picker's explanation (ID-246) is open: kept while the tab is. */
  let helpOpen = false;
  let drawn: { game: GameState; can: boolean; back: number } | null = null;

  const pane = el('div', 'map-dialog');
  const body = el('div', 'map-body');
  pane.append(body);
  const count = el('span', 'map-count');
  const reroll = el('button', 'hud-button map-reroll');
  reroll.type = 'button';
  reroll.addEventListener('click', () => {
    const before = opts.state().game;
    const cost = rerollCost(before);
    const r = opts.onReroll();
    if (!r.ok) {
      say(refusedText(r), true);
      return;
    }
    say(rerollText(cost, opts.state().game.stock.scrap));
  });
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
    real?: Danger,
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
    const corner = el('span', 'map-danger', tag ?? DANGER_NAME[danger]);
    // A team out (ID-246): its own rating, from the power it left with, after the area's.
    if (real) {
      const r = el('span', 'map-real');
      r.dataset.rating = real;
      r.title = `Team rating: ${DANGER_NAME[real]}`;
      r.append(' (', el('span', 'sr-only', 'team rating '), DANGER_NAME[real], ')');
      corner.append(r);
    }
    if (!tag) corner.append(el('span', 'map-trip', ` · ${tripText(danger)}`));
    art.append(img, corner, name);
    return art;
  }

  function areaCard(game: GameState, area: MapArea, now: number, can: boolean): HTMLElement {
    const card = el('article', 'map-area');
    card.dataset.area = area.kind;
    card.dataset.danger = area.danger;
    const p = patrolAt(game, area.kind);
    // A team out: its rating and drop odds at the power it left with (ID-246).
    const ratio = p ? patrolRatio(p) : 0;
    const art = banner(
      area.kind,
      area.danger,
      AREA_NAME[area.kind],
      undefined,
      p ? teamRating(ratio) : undefined,
    );
    const drops = el('ul', 'map-drops');
    drops.setAttribute('aria-label', 'Drops, chance per member');
    for (const d of areaDrops(area, ratio)) {
      const li = el('li', 'map-drop');
      li.append(
        el('span', 'map-drop-name', LOOT_NAME[d.loot]),
        el('b', 'map-drop-pct', pct(d.chance)),
      );
      drops.append(li);
    }
    card.append(art);
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

  /** Why bench survivor `d` can't be picked, or null (those out on patrol aren't listed). */
  const lockOf = (d: RosterDefender): string | null =>
    restOf(d) > 0 ? restLabel(restOf(d)) : null;

  function picker(game: GameState, area: AreaId, picked: string[], can: boolean): HTMLElement[] {
    const spot = game.map?.areas.find((a) => a.kind === area);
    if (!spot) return list(game, opts.state().now, can);
    const box = el('section', 'map-pick');
    box.setAttribute('aria-label', `Send a patrol to ${AREA_NAME[area]}`);
    box.append(banner(area, spot.danger, `Send to ${AREA_NAME[area]}`));
    // Two columns: who can go, then the team's risk and the buttons beside it.
    const main = el('div', 'map-pick-main');
    const side = el('div', 'map-pick-side');
    const cols = el('div', 'map-cols');
    cols.append(main, side);
    box.append(cols);
    // Survivors out on another patrol aren't listed (ID-244), nor kept in the pick.
    const bench = game.reserve.filter((d) => !patrolOf(game, d.id));
    const ids = picked.filter((id) => bench.some((d) => d.id === id));
    if (game.reserve.length === 0) {
      main.append(el('p', 'map-empty', MAP_EMPTY_BENCH));
    } else if (bench.length === 0) {
      main.append(el('p', 'map-empty', MAP_ALL_OUT));
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
        const lock = lockOf(d);
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
          el('span', 'map-member-power', `Power ${powerText(survivorPower(d))}`),
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
      line.append(el('span', '', 'Team rating'), el('b', 'map-rating', DANGER_NAME[risk.rating]));
      // The card's own drops, at this team's odds: each member rolls once.
      const ratio = teamRatio(teamPower(team), spot.danger, bestHorde(game));
      const odds = el('p', 'map-risk-odds');
      // Each drop kept whole, so a wrap falls between them.
      odds.append(`${team.length} of ${MAP_PATROL.max} going · each finds `);
      areaDrops(spot, ratio).forEach((d, i) => {
        if (i > 0) odds.append(' · ');
        odds.append(el('span', 'map-odd', `${LOOT_NAME[d.loot]} ${pct(d.chance)}`));
      });
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
      const power = el(
        'p',
        'map-risk-power',
        safeLine(teamPower(team), safePower(spot.danger, bestHorde(game)), risk.rating === 'safe'),
      );
      rating.append(line, power, odds, chosen);
    }
    const why = can ? lockText(sendRefusal(game, area, ids)) : MAP_WAIT;
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
        say(refusedText(r), true);
        return;
      }
      say(`Patrol sent to ${AREA_NAME[area]}`);
      go({ kind: 'list' }, true);
      pane.querySelector<HTMLElement>(`.map-area[data-area="${area}"] .map-time`)?.focus?.();
    });
    const back = el('button', 'map-back', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => go({ kind: 'list' }));
    // Best fit (ID-244): ticks the fewest free survivors that rate Safe, in place of the pick.
    const fit = bestFit(game, spot.danger);
    const fitWhy = !can
      ? MAP_WAIT
      : fit.length === 0
        ? MAP_NOBODY_FREE
        : lockText(sendRefusal(game, area, fit));
    const best = el('button', 'map-back map-best', 'Best fit');
    best.type = 'button';
    best.disabled = fitWhy !== null;
    best.title = fitWhy ?? MAP_BEST_FIT;
    best.addEventListener('click', () => {
      go({ kind: 'pick', area, ids: fit }, true);
      pane.querySelector<HTMLElement>('.map-best')?.focus();
    });
    // How it works (ID-246): opens the explanation under the bench.
    const info = el('button', 'map-back map-info', 'ⓘ');
    info.type = 'button';
    info.title = MAP_HELP_LABEL;
    info.setAttribute('aria-label', MAP_HELP_LABEL);
    info.setAttribute('aria-controls', 'map-help');
    info.setAttribute('aria-expanded', String(helpOpen));
    info.addEventListener('click', () => {
      helpOpen = !helpOpen;
      draw();
      pane.querySelector<HTMLElement>('.map-info')?.focus();
    });
    const help = el('ul', 'map-help');
    help.id = 'map-help';
    help.setAttribute('aria-label', MAP_HELP_LABEL);
    help.hidden = !helpOpen;
    for (const line of MAP_HELP) help.append(el('li', '', line));
    main.append(help);
    // The buttons head the column and the rating follows (ID-251): picking a team, by hand or
    // with Best fit, grows the rating under them, so no button moves.
    const buttons = el('div', 'map-buttons');
    buttons.append(back, best, info, send);
    side.append(buttons, rating);
    return [box];
  }

  function reportView(game: GameState, area: AreaId, can: boolean): HTMLElement[] {
    const r = opts.report(area);
    if (!r) return list(game, opts.state().now, can);
    const box = el('section', 'map-report');
    box.setAttribute('aria-label', 'Patrol report');
    box.append(banner(r.area, r.danger, `Back from ${AREA_NAME[r.area]}`, DANGER_NAME[r.danger]));
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
      item(`${WEAPON_NAME[b.base]} blueprint${b.kept ? '' : ' (at the cap: lost)'}`);
    }
    if (r.scrap > 0) item(`Scrap +${r.scrap.toLocaleString('en-US')}`);
    if (r.medicine > 0) item(`Medicine +${r.medicine}`);
    if (found.childElementCount === 0) item('Nothing found this time', 'map-found-none');
    else if (r.finds < r.members.length) {
      const none = r.members.length - r.finds;
      item(`${none} found nothing`, 'map-found-none');
    }
    // One fixed box for the finds and the stash note (ID-260): a long list scrolls inside it,
    // so every report is one size and OK never moves. Both boxes take the keyboard, so it can
    // scroll them; the stash note leads, as it says guns were lost.
    const finds = el('div', 'map-found-box');
    finds.tabIndex = 0;
    finds.setAttribute('role', 'group');
    finds.setAttribute('aria-label', 'What the patrol found');
    people.tabIndex = 0;
    side.append(el('h4', 'map-found-head', 'Found'), finds);
    if (r.thrown.length > 0) {
      finds.append(
        el(
          'p',
          'map-sub',
          `Stash full: ${r.thrown.map((w) => levelName(w)).join(', ')} thrown away for ${r.salvage} Scrap.`,
        ),
      );
    }
    finds.append(found);
    const ok = el('button', 'hud-button btn-primary map-go', 'OK');
    ok.type = 'button';
    ok.disabled = !can;
    ok.title = can ? '' : MAP_WAIT;
    ok.addEventListener('click', () => {
      const t = opts.onTake(area);
      if (!t.ok) {
        say(refusedText(t), true);
        return;
      }
      say(`Report taken: ${AREA_NAME[area]}`);
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
    // Reroll shows on the map only, between hordes; greyed (with its reason) when it can't be bought.
    reroll.hidden = view.kind !== 'list' || !canSend;
    const cost = rerollCost(game);
    const why = lockText(rerollRefusal(game));
    reroll.textContent = rerollLabel(cost);
    reroll.setAttribute('aria-label', rerollAria(cost));
    reroll.disabled = why !== null;
    reroll.title = why ?? '';
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
    tools: [count, reroll],
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
      helpOpen = false;
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
