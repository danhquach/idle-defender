// @vitest-environment jsdom
// ID-219, UI half: the World map tab (fourth in the camp window): the area cards (picture,
// name, danger, trip time, drops), a patrol's card (team, live countdown, report ready), the
// team picker (bench only, rating and injury chance live), the report and its OK; the start
// screen's World map button, the Roster's "On patrol" line and Medicine beside the Scrap.
// Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { AREAS, DANGERS, MAP_PATROL } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import {
  areaDrops,
  patrolAt,
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
import { createMapView, MAP_EMPTY_BENCH, MAP_WAIT } from './mapview.ts';
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

  it('greys survivors out on patrol or resting, and a fifth pick', () => {
    const g0 = send(camp(6), ['recruit-2']);
    const g = {
      ...g0,
      reserve: g0.reserve.map((d) => (d.id === 'recruit-3' ? { ...d, rest: 1 } : d)),
    };
    const { all } = mount({ game: g, now: NOW });
    all('.map-send')[0]!.click();
    const by = (id: string) => all('.map-pick-member').find((r) => r.dataset.id === id)!;
    expect((by('recruit-2') as HTMLButtonElement).disabled).toBe(true);
    expect(by('recruit-2').textContent).toContain('On patrol');
    expect((by('recruit-3') as HTMLButtonElement).disabled).toBe(true);
    for (const id of ['recruit-4', 'recruit-5', 'recruit-6', 'recruit-7']) by(id).click();
    expect(all('.map-pick-member[aria-pressed="true"]')).toHaveLength(4);
    expect((by('recruit-2') as HTMLButtonElement).disabled).toBe(true);
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
