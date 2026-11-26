// @vitest-environment jsdom
// ID-219, UI half: the World map tab (fourth in the camp window): the area cards (picture,
// name, danger, trip time, drops), a patrol's card (team, live countdown, report ready), the
// team picker (bench only, rating and injury chance live), the report and its OK; the start
// screen's World map button, the Roster's "On patrol" line and Medicine beside the Scrap.
// Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { AREAS, DANGERS, MAP_PATROL, type Danger } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import {
  areaDrops,
  bestHorde,
  patrolAt,
  patrolRatio,
  rerollCost,
  rerollMap,
  safePower,
  teamPower,
  teamRating,
  patrolReport,
  sendMapPatrol,
  takeReport,
  teamRisk,
  tripMs,
  withMap,
} from '../core/scout.ts';
import { createCampWindow } from './campwindow.ts';
import { benchLine, createMapButton, createScrapChip, setMapButton, squadStart } from './hud.ts';
import {
  countdown,
  countdownWords,
  LOOT_NAME,
  mapButton,
  patrolGroupLabel,
  patrolMission,
  patrolName,
  patrolTime,
  patrolsOut,
  pct,
  tripText,
} from './maptext.ts';
import { survivorPower } from '../core/hordeonly.ts';
import {
  bestFit,
  createMapView,
  MAP_ALL_OUT,
  MAP_BEST_FIT,
  MAP_EMPTY_BENCH,
  MAP_HELP,
  MAP_HELP_LABEL,
  powerText,
  safeLine,
  MAP_NOBODY_FREE,
  MAP_WAIT,
  rerollAria,
  rerollLabel,
  rerollText,
} from './mapview.ts';
import { rosterTiles } from './squadroster.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

function camp(bench = 5): GameState {
  const g = newGame('horde');
  return withMap(
    {
      ...g,
      hordeNumber: 9,
      roster: [person(1)],
      reserve: Array.from({ length: bench }, (_, i) => person(2 + i)),
      camp: { ...g.camp, recruits: 1 + bench },
    },
    5,
  );
}

function send(g: GameState, ids: string[], at = 0, now = NOW): GameState {
  const r = sendMapPatrol(g, g.map!.areas[at]!.kind, ids, 3, now);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** The World map tab over `state`, opened; `state` may change between calls. */
function mount(state: { game: GameState; now: number; canSend?: boolean }) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  const win = createCampWindow(root);
  const opener = document.createElement('button');
  root.append(opener);
  const sent: string[][] = [];
  const tab = createMapView(
    {
      state: () => ({
        game: state.game,
        now: state.now,
        resumes: false,
        canSend: state.canSend ?? true,
      }),
      onSend: (area, ids) => {
        sent.push(ids);
        const r = sendMapPatrol(state.game, area, ids, 3, state.now);
        if (!r.ok) return r;
        state.game = r.game;
        tab.refresh();
        return { ok: true };
      },
      onTake: (area) => {
        const r = takeReport(state.game, area, state.now);
        if (!r.ok) return r;
        state.game = r.game;
        tab.refresh();
        return { ok: true };
      },
      onReroll: () => {
        const r = rerollMap(state.game);
        if (!r.ok) return r;
        state.game = r.game;
        tab.refresh();
        return { ok: true };
      },
      report: (area) => {
        const p = patrolAt(state.game, area);
        return p ? patrolReport(state.game, p) : null;
      },
    },
    win,
    opener,
  );
  tab.open(opener);
  const q = <T extends Element = HTMLElement>(s: string): T | null =>
    win.dialog.querySelector<T & Element>(s);
  const all = (s: string): HTMLElement[] => [...win.dialog.querySelectorAll<HTMLElement>(s)];
  return { tab, win, q, all, sent };
}

describe('the World map tab: area cards (ID-219)', () => {
  it('shows 4 areas with picture, name, danger, trip time and drop chances', () => {
    const state = { game: camp(), now: NOW };
    const { all, q } = mount(state);
    const cards = all('.map-area');
    expect(cards).toHaveLength(MAP_PATROL.areas);
    state.game.map!.areas.forEach((a, i) => {
      const c = cards[i]!;
      expect(c.querySelector('.map-area-name')!.textContent).toBe(AREAS[a.kind].name);
      expect(c.querySelector('.map-danger')!.textContent).toBe(
        `${DANGERS[a.danger].name} · ${tripText(a.danger)}`,
      );
      expect(c.querySelector<HTMLImageElement>('.map-art-img')!.alt).toBe('');
      expect(c.querySelectorAll('.map-drop')).toHaveLength(2);
      expect(c.querySelector('.map-send')!.textContent).toBe('Send a patrol');
    });
    expect(q('.map-count')!.textContent).toBe('');
  });

  it('a card with a patrol out shows every member, a live countdown, then report ready', () => {
    const team = ['recruit-2', 'recruit-3', 'recruit-4', 'recruit-5'];
    const state = { game: send(camp(), team), now: NOW + 18 * MIN };
    const { all, q, tab } = mount(state);
    const card = all('.map-area')[0]!;
    expect(card.dataset.out).toBe('true');
    expect([...card.querySelectorAll('.map-member-name')].map((n) => n.textContent)).toEqual(
      team.map((id) => state.game.reserve.find((d) => d.id === id)!.name),
    );
    expect(card.querySelector('.map-send')).toBeNull();
    const p = state.game.map!.patrols[0]!;
    expect(card.querySelector('.map-time')!.textContent).toBe(patrolTime(p, NOW + 18 * MIN));
    expect(q('.map-count')!.textContent).toBe('1 patrol out');
    tab.tick(p.backAt - 42_000);
    expect(card.querySelector('.map-time')!.textContent).toBe('Back in 42 s');
    state.now = p.backAt;
    tab.tick(p.backAt);
    const fresh = all('.map-area')[0]!;
    expect(fresh.dataset.ready).toBe('true');
    expect(fresh.querySelector('.map-time')!.textContent).toBe('Back · report ready');
    expect(fresh.querySelector('.map-open-report')).not.toBeNull();
  });

  it('greys Send between fights only', () => {
    const { all } = mount({ game: camp(), now: NOW, canSend: false });
    for (const b of all('.map-send')) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.title).toBe(MAP_WAIT);
    }
  });
});

describe('the World map tab: the team picker (ID-219)', () => {
  it('lists the bench only, rates the team live and sends it', () => {
    const state = { game: camp(3), now: NOW };
    const { all, q, sent } = mount(state);
    all('.map-send')[0]!.click();
    const rows = all('.map-pick-member');
    expect(rows.map((r) => r.dataset.id)).toEqual(['recruit-2', 'recruit-3', 'recruit-4']);
    expect(q('.map-risk')!.dataset.rating).toBe('none');
    expect(q<HTMLButtonElement>('.map-go')!.disabled).toBe(true);
    rows[0]!.click();
    all('.map-pick-member')[1]!.click();
    const danger = state.game.map!.areas[0]!.danger;
    const team = state.game.reserve.slice(0, 2);
    const risk = teamRisk(state.game, team, danger);
    expect(q('.map-rating')!.textContent).toBe(DANGERS[risk.rating].name);
    expect(all('.map-injury').map((n) => n.textContent)).toEqual([
      `injury ${pct(risk.injury)}`,
      `injury ${pct(risk.injury)}`,
    ]);
    q<HTMLButtonElement>('.map-go')!.click();
    expect(sent).toEqual([['recruit-2', 'recruit-3']]);
    expect(state.game.map!.patrols).toHaveLength(1);
  });

  it('hides survivors out on another patrol, greys the resting, and a fifth pick (ID-244)', () => {
    const g0 = send(camp(6), ['recruit-2']);
    const g = {
      ...g0,
      reserve: g0.reserve.map((d) => (d.id === 'recruit-3' ? { ...d, rest: 1 } : d)),
    };
    const { all, q } = mount({ game: g, now: NOW });
    all('.map-send')[1]!.click();
    const ids = all('.map-pick-member').map((r) => r.dataset.id);
    expect(ids).toEqual(['recruit-3', 'recruit-4', 'recruit-5', 'recruit-6', 'recruit-7']);
    expect(q('.map-pick')!.textContent).not.toContain('On patrol');
    expect(q('.map-empty')).toBeNull();
    const by = (id: string) => all('.map-pick-member').find((r) => r.dataset.id === id)!;
    expect((by('recruit-3') as HTMLButtonElement).disabled).toBe(true);
    for (const id of ['recruit-4', 'recruit-5', 'recruit-6', 'recruit-7']) by(id).click();
    expect(all('.map-pick-member[aria-pressed="true"]')).toHaveLength(4);
  });

  it('says so when everyone on the bench is out, and Best fit is greyed', () => {
    const g = send(camp(2), ['recruit-2', 'recruit-3']);
    const { all, q } = mount({ game: g, now: NOW });
    all('.map-send')[1]!.click();
    expect(q('.map-empty')!.textContent).toBe(MAP_ALL_OUT);
    expect(all('.map-pick-member')).toHaveLength(0);
    expect(q('.map-sub')).toBeNull();
    const best = q<HTMLButtonElement>('.map-best')!;
    expect(best.disabled).toBe(true);
    expect(best.title).toBe(MAP_NOBODY_FREE);
  });

  it('says so with nobody on the bench, and Esc steps back to the map', () => {
    const { all, q, win } = mount({ game: camp(0), now: NOW });
    all('.map-send')[0]!.click();
    expect(q('.map-empty')!.textContent).toBe(MAP_EMPTY_BENCH);
    win.dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(win.isOpen()).toBe(true);
    expect(q('.map-areas')).not.toBeNull();
  });
});

describe('the World map tab: Best fit (ID-244)', () => {
  /** A bench of levels `levels` (by XP), in that order. */
  function benchOf(levels: readonly number[]): GameState {
    const g = camp(levels.length);
    return {
      ...g,
      reserve: g.reserve.map((d, i) => ({ ...d, xp: levels[i]! * 5_000 })),
    };
  }

  /** The smallest team size that rates Safe at `danger`, by trying every team; null if none. */
  function smallestSafe(g: GameState, danger: Danger): number | null {
    const pool = g.reserve;
    let best: number | null = null;
    for (let mask = 1; mask < 1 << pool.length; mask++) {
      const team = pool.filter((_, i) => mask & (1 << i));
      if (team.length > MAP_PATROL.max) continue;
      if (teamRisk(g, team, danger).rating !== 'safe') continue;
      if (best === null || team.length < best) best = team.length;
    }
    return best;
  }

  it('picks the fewest that rate Safe, strongest first, or the strongest 4', () => {
    const g = benchOf([1, 30, 4, 12, 60, 2]);
    const order = [...g.reserve].sort((a, b) => survivorPower(b) - survivorPower(a));
    for (const danger of Object.keys(DANGERS) as Danger[]) {
      const fit = bestFit(g, danger);
      const size = smallestSafe(g, danger);
      if (size === null) {
        expect(fit).toEqual(order.slice(0, MAP_PATROL.max).map((d) => d.id));
      } else {
        expect(fit).toEqual(order.slice(0, size).map((d) => d.id));
        const team = g.reserve.filter((d) => fit.includes(d.id));
        expect(teamRisk(g, team, danger).rating).toBe('safe');
      }
    }
    // Both branches for sure: a weak pair can't make Safe, an equal strong bench can.
    const weak = benchOf([1, 1]);
    expect(smallestSafe(weak, 'dangerous')).toBeNull();
    expect(bestFit(weak, 'dangerous')).toEqual(['recruit-2', 'recruit-3']);
    const strong = benchOf([90, 90, 90, 90, 90]);
    const k = smallestSafe(strong, 'safe');
    expect(k).not.toBeNull();
    // A tie keeps bench order.
    expect(bestFit(strong, 'safe')).toEqual(strong.reserve.slice(0, k!).map((d) => d.id));
  });

  it('never takes the resting, those out, or the squad; nobody free picks nobody', () => {
    const g0 = send(benchOf([90, 90, 1, 1]), ['recruit-2']);
    const g = {
      ...g0,
      reserve: g0.reserve.map((d) => (d.id === 'recruit-3' ? { ...d, rest: 1 } : d)),
    };
    const fit = bestFit(g, 'dangerous');
    expect(fit).not.toContain('recruit-2');
    expect(fit).not.toContain('recruit-3');
    expect(fit).not.toContain(g.roster[0]!.id);
    expect(fit.length).toBeGreaterThan(0);
    expect(bestFit(camp(0), 'safe')).toEqual([]);
  });

  it("the buttons head the picker's side column, over the rating, whoever is picked (ID-251)", () => {
    const state = { game: benchOf([1, 30, 4, 12, 60]), now: NOW };
    const { all, q } = mount(state);
    all('.map-send')[0]!.click();
    const order = () => [...q('.map-pick-side')!.children].map((c) => (c as HTMLElement).className);
    const first = order();
    expect(first).toEqual(['map-buttons', 'map-risk']);
    all('.map-pick-member')[0]!.click();
    expect(order()).toEqual(first);
    q<HTMLButtonElement>('.map-best')!.click();
    expect(all('.map-pick-member[aria-pressed="true"]').length).toBeGreaterThan(0);
    expect(order()).toEqual(first);
  });

  it('replaces the pick, updates the risk and Send, and can be changed by hand', () => {
    const state = { game: benchOf([1, 30, 4, 12, 60]), now: NOW };
    const { all, q, sent } = mount(state);
    all('.map-send')[0]!.click();
    all('.map-pick-member')[0]!.click(); // the weakest, by hand
    const best = q<HTMLButtonElement>('.map-best')!;
    expect(best.disabled).toBe(false);
    expect(best.title).toBe(MAP_BEST_FIT);
    best.click();
    const danger = state.game.map!.areas[0]!.danger;
    const fit = bestFit(state.game, danger);
    const pressed = () => all('.map-pick-member[aria-pressed="true"]').map((r) => r.dataset.id);
    expect(pressed().sort()).toEqual([...fit].sort());
    const team = state.game.reserve.filter((d) => fit.includes(d.id));
    expect(q('.map-rating')!.textContent).toBe(
      DANGERS[teamRisk(state.game, team, danger).rating].name,
    );
    expect(q('.map-go')!.textContent).toBe(`Send ${fit.length}`);
    expect(document.activeElement).toBe(q('.map-best'));
    const other = all('.map-pick-member').find((r) => !fit.includes(r.dataset.id!))!;
    other.click();
    expect(pressed()).toContain(other.dataset.id);
    q<HTMLButtonElement>('.map-go')!.click();
    expect(sent[0]!.sort()).toEqual([...fit, other.dataset.id!].sort());
  });

  it('is greyed when sending closes (a fight starts)', () => {
    const state = { game: camp(3), now: NOW, canSend: true };
    const { all, q, tab } = mount(state);
    all('.map-send')[0]!.click();
    expect(q<HTMLButtonElement>('.map-best')!.disabled).toBe(false);
    state.canSend = false;
    tab.refresh();
    expect(q<HTMLButtonElement>('.map-best')!.disabled).toBe(true);
    expect(q<HTMLButtonElement>('.map-best')!.title).toBe(MAP_WAIT);
  });

  it('is never offered for an area with a patrol out: its picker closes', () => {
    const state = { game: camp(3), now: NOW, canSend: true };
    const { all, q, tab } = mount(state);
    all('.map-send')[1]!.click();
    state.game = send(state.game, ['recruit-2'], 1);
    tab.refresh();
    expect(q('.map-pick')).toBeNull();
    expect(q('.map-best')).toBeNull();
  });
});

describe('the World map tab: the report (ID-219)', () => {
  it('opens on a waiting report, lists the team and finds, and OK takes it once', () => {
    const g = send(camp(), ['recruit-2', 'recruit-3'], 0);
    const p = g.map!.patrols[0]!;
    const state = { game: g, now: p.backAt };
    const r = patrolReport(g, p);
    const { all, q } = mount(state);
    expect(q('.map-report')).not.toBeNull();
    expect(q('.map-area-name')!.textContent).toBe(`Back from ${AREAS[p.area].name}`);
    expect(all('.map-report-member')).toHaveLength(2);
    expect(all('.map-report-xp').map((n) => n.textContent)).toEqual(
      r.members.map((m) => `+${m.xp.toLocaleString('en-US')} XP`),
    );
    expect(all('.map-report-hurt')).toHaveLength(r.members.filter((m) => m.injured).length);
    expect(all('.map-found-item').length).toBeGreaterThan(0);
    q<HTMLButtonElement>('.map-report .map-go')!.click();
    expect(state.game.map!.patrols).toEqual([]);
    expect(q('.map-areas')).not.toBeNull();
  });

  it('keeps the report shut during a fight', () => {
    const g = send(camp(), ['recruit-2']);
    const { q } = mount({ game: g, now: g.map!.patrols[0]!.backAt, canSend: false });
    expect(q('.map-report')).toBeNull();
    expect(q<HTMLButtonElement>('.map-open-report')!.disabled).toBe(true);
  });

  it('renders hostile-looking names as text, never as markup', () => {
    const g = camp(1);
    const odd = { ...g, reserve: [{ ...g.reserve[0]!, name: 'Bob <img src=x onerror=1>' }] };
    const out = send(odd, ['recruit-2']);
    const { q } = mount({ game: out, now: NOW });
    expect(q('.map-member-name')!.textContent).toBe('Bob <img src=x onerror=1>');
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('World map words (ID-219)', () => {
  it('counts down in h and m, then s under a minute', () => {
    expect(countdown(72 * MIN)).toBe('1 h 12 m');
    expect(countdown(60 * MIN)).toBe('1 h');
    expect(countdown(42 * MIN)).toBe('42 m');
    expect(countdown(42_000)).toBe('42 s');
    expect(countdown(-5)).toBe('0 s');
  });

  it('says how many patrols are out, on the header and the button', () => {
    expect(patrolsOut(0)).toBeNull();
    expect(patrolsOut(1)).toBe('1 patrol out');
    expect(patrolsOut(2)).toBe('2 patrols out');
    const g = send(send(camp(), ['recruit-2'], 0), ['recruit-3'], 1);
    expect(mapButton(g, NOW)).toEqual({ label: 'World map · 2 out', out: 2, ready: false });
    expect(mapButton(g, NOW + tripMs('dangerous')).ready).toBe(true);
    expect(mapButton(camp(), NOW)).toEqual({ label: 'World map', out: 0, ready: false });
  });

  it('leaves the start screen: the button is in the top bar', () => {
    const g = send(camp(), ['recruit-2']);
    expect(squadStart(g).debrief).not.toHaveProperty('map');
  });

  it('draws the top bar button as a globe, with a badge for patrols out or a report', () => {
    const root = document.createElement('div');
    const b = createMapButton(root);
    expect(root.contains(b)).toBe(true);
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    setMapButton(b, { label: 'World map', out: 0, ready: false });
    expect(b.getAttribute('aria-label')).toBe('World map');
    expect(b.title).toBe('World map');
    expect(b.querySelector('svg.map-globe')).not.toBeNull();
    expect(b.querySelector('.map-badge')).toBeNull();
    setMapButton(b, { label: 'World map · 2 out', out: 2, ready: false });
    expect(b.querySelector('.map-badge')!.textContent).toBe('2');
    expect(b.querySelector('.map-badge')!.getAttribute('aria-hidden')).toBe('true');
    setMapButton(b, { label: 'World map · 2 out', out: 2, ready: true });
    expect(b.getAttribute('aria-label')).toBe('World map · 2 out, report ready');
    expect(b.dataset.ready).toBe('true');
    expect(b.querySelector('.map-badge-ready')!.textContent).toBe('!');
    expect(b.querySelectorAll('svg')).toHaveLength(1);
  });

  it('the bench line and the Roster say who is on patrol', () => {
    const g = send(camp(3), ['recruit-2']);
    expect(benchLine(g)).toContain('1 on patrol');
    const tile = rosterTiles(g, NOW + MIN, null).find((t) => t.id === 'recruit-2')!;
    // Where and when are on the patrol's block (ID-234), not on each card.
    expect(tile.health).toBe('On patrol');
    expect(tile.away).toBe(true);
    expect(tile.down).toBe(false);
  });

  it("names a patrol's block in the World map card's words (ID-234)", () => {
    const g = send(camp(3), ['recruit-2']);
    const p = g.map!.patrols[0]!;
    const area = g.map!.areas.find((a) => a.kind === p.area)!;
    expect(patrolName(p)).toBe(`Patrol ${p.no} · ${AREAS[p.area].name}`);
    const drops = areaDrops(area).map((d) => LOOT_NAME[d.loot]);
    expect(patrolMission(p)).toBe(
      `${DANGERS[p.danger].name} · ${tripText(p.danger)} · Finds ${drops.join(', ')}`,
    );
    expect(patrolGroupLabel(p, p.backAt - MIN)).toBe(
      `Patrol ${p.no}, ${AREAS[p.area].name}, back in 1 minute`,
    );
    expect(patrolGroupLabel(p, p.backAt)).toBe(
      `Patrol ${p.no}, ${AREAS[p.area].name}, back, report ready`,
    );
  });

  it('says a countdown in words, singular and plural', () => {
    expect(countdownWords(1000)).toBe('1 second');
    expect(countdownWords(42_000)).toBe('42 seconds');
    expect(countdownWords(MIN)).toBe('1 minute');
    expect(countdownWords(42 * MIN)).toBe('42 minutes');
    expect(countdownWords(60 * MIN)).toBe('1 hour');
    expect(countdownWords(65 * MIN)).toBe('1 hour 5 minutes');
    expect(countdownWords(121 * MIN)).toBe('2 hours 1 minute');
  });

  it('shows Medicine beside the Scrap once there is some', () => {
    document.body.replaceChildren();
    const chip = createScrapChip(document);
    chip.set(60);
    const el = document.querySelector('.scrap-chip')!;
    expect(el.textContent).toBe('Scrap 60');
    chip.set(60, 3);
    expect(el.textContent).toBe('Scrap 60 Med 3');
    expect(el.getAttribute('aria-label')).toBe('Scrap balance: 60. Medicine: 3');
  });
});

describe('the World map tab: power, the Safe line and how it works (ID-246)', () => {
  it('words power whole and the Safe line so it never contradicts the rating', () => {
    expect(powerText(1234.9)).toBe('1,234');
    expect(powerText(0)).toBe('0');
    expect(safeLine(489.7, 701.2, false)).toBe('Power 489 / 702 for Safe');
    expect(safeLine(701.1, 701.2, false)).toBe('Power 701 / 702 for Safe');
    expect(safeLine(701.2, 701.2, true)).toBe('Power 701 · Safe from 701');
    expect(safeLine(1500.4, 701.9, true)).toBe('Power 1,500 · Safe from 701');
  });

  it('each survivor shows the power Best fit ranks by; the team its Safe line, live', () => {
    const state = { game: camp(4), now: NOW };
    state.game = {
      ...state.game,
      reserve: state.game.reserve.map((d, i) => ({ ...d, xp: i * 40_000 })),
    };
    const { all, q } = mount(state);
    all('.map-send')[0]!.click();
    const rows = all('.map-pick-member');
    rows.forEach((r, i) => {
      const d = state.game.reserve[i]!;
      expect(r.querySelector('.map-member-power')!.textContent).toBe(
        `Power ${powerText(survivorPower(d))}`,
      );
    });
    expect(q('.map-risk-power')).toBeNull();
    const danger = state.game.map!.areas[0]!.danger;
    const need = safePower(danger, bestHorde(state.game));
    const line = (team: RosterDefender[]) =>
      safeLine(teamPower(team), need, teamRisk(state.game, team, danger).rating === 'safe');
    const [a, , , d] = state.game.reserve;
    rows[0]!.click();
    expect(q('.map-risk-power')!.textContent).toBe(line([a!]));
    all('.map-pick-member')[3]!.click();
    expect(q('.map-risk-power')!.textContent).toBe(line([a!, d!]));
    // Unticked: the line follows, and goes with the last one.
    all('.map-pick-member')[0]!.click();
    expect(q('.map-risk-power')!.textContent).toBe(line([d!]));
    all('.map-pick-member')[3]!.click();
    expect(q('.map-risk-power')).toBeNull();
  });

  it('the ⓘ beside Best fit opens and closes the explanation, kept while the tab is open', () => {
    const state = { game: camp(3), now: NOW };
    const { all, q, win, tab } = mount(state);
    all('.map-send')[0]!.click();
    const info = () => q<HTMLButtonElement>('.map-info')!;
    const help = () => q('#map-help')!;
    expect(info().getAttribute('aria-label')).toBe(MAP_HELP_LABEL);
    expect(info().getAttribute('aria-controls')).toBe(help().id);
    expect(info().getAttribute('aria-expanded')).toBe('false');
    expect(help().hidden).toBe(true);
    info().click();
    expect(info().getAttribute('aria-expanded')).toBe('true');
    expect(help().hidden).toBe(false);
    expect([...help().querySelectorAll('li')].map((li) => li.textContent)).toEqual([...MAP_HELP]);
    expect(document.activeElement).toBe(info());
    // Best fit redraws the picker: the explanation stays open.
    q<HTMLButtonElement>('.map-best')!.click();
    expect(help().hidden).toBe(false);
    info().click();
    expect(help().hidden).toBe(true);
    // Closing the tab closes it.
    info().click();
    win.close();
    tab.open();
    all('.map-send')[0]!.click();
    expect(help().hidden).toBe(true);
    expect(info().getAttribute('aria-expanded')).toBe('false');
  });

  it("a card with a team out shows the team's own rating and odds, from the power it left with", () => {
    const area = camp().map!.areas[0]!;
    const base = areaDrops(area).map((d) => pct(d.chance));
    // A weak team (below Safe) and a strong one (Safe): the power each left with decides.
    for (const [power, want] of [
      [0.01, 'dangerous'],
      [1e9, 'safe'],
    ] as const) {
      const g0 = send(camp(), ['recruit-2', 'recruit-3']);
      const p0 = g0.map!.patrols[0]!;
      const g = { ...g0, map: { ...g0.map!, patrols: [{ ...p0, power }] } };
      const state = { game: g, now: NOW + MIN };
      const { all, tab } = mount(state);
      const p = state.game.map!.patrols[0]!;
      expect(teamRating(patrolRatio(p))).toBe(want);
      const card = () => all('.map-area')[0]!;
      const tag = `${DANGERS[area.danger].name} (team rating ${DANGERS[want].name}) · ${tripText(area.danger)}`;
      expect(card().querySelector('.map-danger')!.textContent).toBe(tag);
      const real = card().querySelector<HTMLElement>('.map-real')!;
      expect(real.dataset.rating).toBe(want);
      expect(real.title).toBe(`Team rating: ${DANGERS[want].name}`);
      expect(real.querySelector('.sr-only')!.textContent).toBe('team rating ');
      const odds = () => [...card().querySelectorAll('.map-drop-pct')].map((n) => n.textContent);
      const shown = areaDrops(area, patrolRatio(p)).map((d) => pct(d.chance));
      expect(odds()).toEqual(shown);
      if (want === 'safe') expect(odds()).not.toEqual(base);
      // Levels gained after it left move neither.
      state.game = {
        ...state.game,
        reserve: state.game.reserve.map((d) => ({ ...d, xp: d.xp + 500_000 })),
      };
      tab.refresh();
      expect(card().querySelector('.map-danger')!.textContent).toBe(tag);
      expect(odds()).toEqual(shown);
      // Back with the report waiting: still the team's own.
      state.now = p.backAt;
      tab.tick(p.backAt);
      expect(card().dataset.ready).toBe('true');
      expect(card().querySelector('.map-danger')!.textContent).toBe(tag);
      expect(odds()).toEqual(shown);
      // Cards with no team out keep the plain tag.
      expect(all('.map-area')[1]!.querySelector('.map-real')).toBeNull();
    }
  });
});

describe('the World map tab: Reroll (ID-252)', () => {
  const rich = (g: GameState, scrap = 500): GameState => ({ ...g, stock: { ...g.stock, scrap } });
  const NBSP = String.fromCharCode(160);

  it('shows its cost on the button and in the read-out', () => {
    const g = rich(camp());
    const cost = rerollCost(g);
    const { q } = mount({ game: g, now: NOW });
    const b = q<HTMLButtonElement>('.map-reroll')!;
    expect(b.textContent).toBe(`Reroll · ${cost}${NBSP}Scrap`);
    expect(b.textContent).toBe(rerollLabel(cost));
    expect(b.getAttribute('aria-label')).toBe(rerollAria(cost));
    expect(rerollAria(30)).toBe('Reroll areas, 30 Scrap');
    expect(b.hidden).toBe(false);
    expect(b.disabled).toBe(false);
    expect(b.title).toBe('');
  });

  it('is greyed with the price when Scrap is short', () => {
    const g = rich(camp(), 0);
    const cost = rerollCost(g);
    const { q } = mount({ game: g, now: NOW });
    const b = q<HTMLButtonElement>('.map-reroll')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(`Needs ${cost} Scrap`);
    expect(b.textContent).toBe(rerollLabel(cost));
  });

  it('is greyed when every area has a patrol out', () => {
    let g = rich(camp());
    for (let i = 0; i < 4; i++) g = send(g, [`recruit-${i + 2}`], i);
    const { q } = mount({ game: g, now: NOW });
    const b = q<HTMLButtonElement>('.map-reroll')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('Every area has a patrol out');
  });

  it('is hidden mid-fight, in the picker and in the report', () => {
    const g = rich(camp());
    expect(mount({ game: g, now: NOW, canSend: false }).q('.map-reroll')!.hidden).toBe(true);
    const picked = mount({ game: g, now: NOW });
    picked.all('.map-send')[0]!.click();
    expect(picked.q('.map-reroll')!.hidden).toBe(true);
    const sent = send(g, ['recruit-2']);
    const p = sent.map!.patrols[0]!;
    const report = mount({ game: sent, now: p.backAt });
    expect(report.q('.map-report')).not.toBeNull();
    expect(report.q('.map-reroll')!.hidden).toBe(true);
  });

  it('comes back when the picker closes', () => {
    const { q, all } = mount({ game: rich(camp()), now: NOW });
    all('.map-send')[0]!.click();
    expect(q('.map-reroll')!.hidden).toBe(true);
    q<HTMLButtonElement>('.map-back')!.click();
    expect(q('.map-reroll')!.hidden).toBe(false);
  });

  it('a click replaces the unsent areas, says the Scrap spent, and keeps the focus', () => {
    const g = send(rich(camp()), ['recruit-2'], 1);
    const state = { game: g, now: NOW };
    const { q, all } = mount(state);
    const cost = rerollCost(g);
    const b = q<HTMLButtonElement>('.map-reroll')!;
    b.focus();
    b.click();
    expect(state.game.stock.scrap).toBe(500 - cost);
    expect(q('.map-status')!.textContent).toBe(rerollText(cost, 500 - cost));
    expect(q('.map-status')!.textContent).toBe(
      `New areas · ${cost} Scrap spent, ${500 - cost} left.`,
    );
    expect(q('.map-status')!.dataset.tone).toBeUndefined();
    expect(all('.map-area-name').map((n) => n.textContent)).toEqual(
      state.game.map!.areas.map((a) => AREAS[a.kind].name),
    );
    expect(state.game.map!.areas[1]).toBe(g.map!.areas[1]);
    expect(document.activeElement).toBe(b);
  });

  it('the label follows the Scrap: affordable, then greyed after the buy', () => {
    const g = rich(camp(), rerollCost(camp()));
    const state = { game: g, now: NOW };
    const { q, tab } = mount(state);
    const b = q<HTMLButtonElement>('.map-reroll')!;
    expect(b.disabled).toBe(false);
    b.click();
    expect(state.game.stock.scrap).toBe(0);
    expect(b.disabled).toBe(true);
    state.game = rich(state.game, 1000);
    tab.refresh();
    expect(b.disabled).toBe(false);
  });

  it('shows the refusal in the status when the buy is refused', () => {
    const state = { game: rich(camp()), now: NOW, canSend: true };
    const { q } = mount(state);
    state.game = rich(state.game, 0);
    const b = q<HTMLButtonElement>('.map-reroll')!;
    b.disabled = false;
    b.click();
    expect(q('.map-status')!.dataset.tone).toBe('refused');
    expect(q('.map-status')!.textContent).toBe(`Needs ${rerollCost(state.game)} Scrap`);
  });
});
