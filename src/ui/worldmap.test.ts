// @vitest-environment jsdom
// Design §10, as built ID-028: the world map screen, its location panel, party picker,
// risk screen, Send, patrols out and reports.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_IDS, LOCATIONS, MAP_CAMP, MAP_SPOTS } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import {
  patrolRisk,
  sendPatrol,
  tripMinutes,
  type Patrol,
  type PatrolReport,
} from '../core/patrol.ts';
import { createBuildPanel } from './build.ts';
import { clockTime } from './hud.ts';
import {
  biggestParty,
  lootLines,
  mapContents,
  mapRefusal,
  partyRows,
  patrolLine,
  ratedParty,
  reportLines,
  riskLines,
  routeShare,
  RISK_NAME,
  tickMap,
  tripText,
} from './worldmap.ts';

const NOW = 1_700_000_000_000;
const open = (): GameState => ({ ...newGame(), hordeNumber: 3 });

function sent(game: GameState, ids: string[], at = NOW, location = 'gas-station' as const) {
  const r = sendPatrol(game, location, ids, 1, at);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

const report = (r: Partial<PatrolReport> = {}): PatrolReport => ({
  no: 1,
  location: 'gas-station',
  names: ['Bob', 'Jack'],
  injured: [],
  dead: [],
  wiped: false,
  returnedAt: NOW,
  stock: {
    scrap: 4,
    wood: 0,
    metal: 0,
    concrete: 0,
    food: 2,
    medicine: 0,
    parts: 0,
    chemicals: 0,
    genes: 0,
  } as PatrolReport['stock'],
  gas: 1,
  batteries: { makeshift: 1, standard: 0, 'high-capacity': 0, military: 0 },
  weapons: [],
  recovered: [],
  xp: 30,
  survivors: [],
  ...r,
});

describe('world map rules (ID-028)', () => {
  it('opens after Horde 2', () => {
    expect(mapRefusal({ ...newGame(), hordeNumber: 2 })).toBe('Patrols open after Horde 2');
    expect(mapRefusal(open())).toBeNull();
  });

  it('places every location inside the map, farther for a longer trip', () => {
    const away = (id: (typeof LOCATION_IDS)[number]) =>
      Math.hypot(MAP_SPOTS[id].x - MAP_CAMP.x, MAP_SPOTS[id].y - MAP_CAMP.y);
    for (const id of LOCATION_IDS) {
      expect(MAP_SPOTS[id].x).toBeGreaterThan(0);
      expect(MAP_SPOTS[id].x).toBeLessThan(1);
      expect(MAP_SPOTS[id].y).toBeGreaterThan(0);
      expect(MAP_SPOTS[id].y).toBeLessThan(1);
      for (const other of LOCATION_IDS) {
        if (tripMinutes(other) > tripMinutes(id)) expect(away(other)).toBeGreaterThan(away(id));
      }
    }
  });

  it('splits loot into mostly and sometimes by weight', () => {
    expect(lootLines('gas-station')).toEqual({
      mostly: 'Gas, Makeshift batteries, Food',
      sometimes: 'Scrap',
    });
    expect(lootLines('police')).toEqual({
      mostly: 'Pistol or Shotgun or SMG',
      sometimes: 'nothing else',
    });
  });

  it('writes trip times', () => {
    expect(tripText(15)).toBe('15m');
    expect(tripText(60)).toBe('1h');
    expect(tripText(90)).toBe('1h 30m');
  });

  it('rates the biggest party allowed when nobody is picked: one stays at camp', () => {
    const g = open();
    expect(biggestParty(g, NOW)).toHaveLength(2);
    const out = sent(g, ['bob']);
    expect(biggestParty(out, NOW)).toHaveLength(1);
    // With someone already out, everyone idle may go.
    const injured = {
      ...out,
      roster: out.roster.map((d) => (d.id === 'jack' ? { ...d, injuredUntil: NOW + 1 } : d)),
    };
    expect(biggestParty(injured, NOW).map((d) => d.id)).toEqual(['john']);
  });

  it('rates the picked party, skipping picks that are not idle', () => {
    const out = sent(open(), ['bob']);
    expect(ratedParty(out, new Set(['bob', 'jack']), NOW).map((d) => d.id)).toEqual(['jack']);
    expect(ratedParty(out, new Set(['bob']), NOW)).toHaveLength(1); // falls back to the biggest
  });

  it('shows the risk screen from patrolRisk', () => {
    const party = open().roster.slice(0, 1);
    const risk = patrolRisk(party, 'hardware');
    const lines = riskLines(party, 'hardware');
    expect(lines[0]).toBe(`Risk: ${RISK_NAME[risk.rating]}`);
    expect(lines[1]).toMatch(/^Party strength [\d.]+ vs danger 12$/);
    expect(lines[2]).toBe(
      `Each member: ${Math.round(risk.injured * 100)}% injured, ${Math.round(risk.dead * 100)}% killed`,
    );
    expect(lines[3]).toBe(`Whole party lost: ${Math.round(risk.wipe * 100)}%`);
    expect(lines[4]).toMatch(/^Loot rolls: 3 \+ \d$/);
    expect(riskLines([], 'hardware')).toEqual(['Pick who goes to see the risk.']);
  });

  it('lists who is free, and why the rest are not', () => {
    const out = sent(open(), ['bob']);
    out.roster[1]!.injuredUntil = NOW + 60_000;
    const rows = partyRows(out, NOW);
    expect(rows.map((r) => r.free)).toEqual([false, false, true]);
    expect(rows[0]!.label).toContain(`on patrol, back at ${clockTime(NOW + 15 * 60_000)}`);
    expect(rows[1]!.label).toContain(`injured until ${clockTime(NOW + 60_000)}`);
  });

  it('moves a patrol out, holds it while searching, and brings it back', () => {
    const p = sent(open(), ['bob']).patrols[0]!;
    const at = (min: number) => routeShare(p, NOW + min * 60_000);
    expect(at(0)).toBe(0);
    expect(at(2.5)).toBeCloseTo(0.5);
    expect(at(7)).toBe(1);
    expect(at(12.5)).toBeCloseTo(0.5);
    expect(at(15)).toBe(0);
    expect(at(-1)).toBe(0);
  });

  it('writes a patrol out with its time left', () => {
    const g = sent(open(), ['bob', 'jack']);
    expect(patrolLine(g, g.patrols[0]!, NOW + 3 * 60_000)).toBe(
      'Gas station · Bob, Jack · 12m left',
    );
  });

  it('writes a report: loot, XP and casualties; a wipe says nothing came back', () => {
    const r = reportLines(
      report({
        injured: ['Jack'],
        dead: ['Bob'],
        weapons: [{ base: 'pistol', rarity: 'common', kept: false }],
        recovered: [{ base: 'smg', rarity: 'military', kept: true }],
      }),
    );
    expect(r.title).toBe(`Gas station · back at ${clockTime(NOW)}`);
    expect(r.lines).toEqual([
      'Sent: Bob, Jack',
      'Found: 4 scrap, 2 food, 1 gas, 1 makeshift battery',
      'Weapons: Common Pistol (salvaged)',
      'Recovered: Military SMG',
      '30 XP each',
      'Injured: Jack',
      "Didn't come back: Bob",
    ]);
    expect(reportLines(report({ wiped: true })).lines).toEqual([
      'Sent: Bob, Jack',
      'The whole party was lost. Nothing came back.',
    ]);
  });
});

describe('world map on the page (ID-028)', () => {
  it('draws only revealed places, each with its rating as text and a route', () => {
    const g = open();
    const root = document.createElement('div');
    root.append(...mapContents(g, biggestParty(g, NOW), 'supermarket', NOW, () => {}));
    const spots = [...root.querySelectorAll<HTMLButtonElement>('.worldmap-spot')];
    expect(spots.map((s) => s.dataset.location)).toEqual([
      'gas-station',
      'supermarket',
      'electronics',
    ]);
    expect(root.querySelectorAll('line')).toHaveLength(3);
    for (const s of spots) {
      expect(s.querySelector('.worldmap-risk')!.textContent).toMatch(
        /^(Safe|Risky|Dangerous|Deadly)$/,
      );
      expect(s.style.getPropertyValue('--risk')).not.toBe('');
    }
    expect(spots[1]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('moves markers and timers with tickMap', () => {
    const g = sent(open(), ['bob']);
    const root = document.createElement('div');
    root.append(...mapContents(g, [], null, NOW, () => {}));
    const line = document.createElement('p');
    line.dataset.patrol = '1';
    root.append(line);
    tickMap(root, g, NOW + 2.5 * 60_000);
    const marker = root.querySelector<HTMLElement>('.worldmap-patrol')!;
    const x = MAP_CAMP.x + (MAP_SPOTS['gas-station'].x - MAP_CAMP.x) * 0.5;
    expect(parseFloat(marker.style.left)).toBeCloseTo(x * 100);
    expect(line.textContent).toBe('Gas station · Bob · 13m left');
    expect(marker.textContent).toBe('Gas station · Bob · 13m left');
  });

  it('says nobody can go when the one defender free must stay', () => {
    const g = sent(open(), ['bob', 'jack']);
    const root = document.createElement('div');
    root.append(...mapContents(g, biggestParty(g, NOW), null, NOW, () => {}));
    expect(root.querySelector('.worldmap-risk')!.textContent).toBe('Nobody can go');
  });
});

describe('world map in the build panel (ID-028)', () => {
  function panelFor(game: GameState) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const games: GameState[] = [];
    const panel = createBuildPanel(
      root,
      () => {},
      () => {},
      () => {},
      (next) => {
        games.push(next);
        panel.show(next, null);
      },
    );
    panel.show(game, null);
    const button = (label: string): HTMLButtonElement => {
      const found = [...root.querySelectorAll('button')].find((b) =>
        b.textContent?.startsWith(label),
      );
      if (!found) throw new Error(`no button ${label}`);
      return found;
    };
    const box = (name: string): HTMLInputElement =>
      [...root.querySelectorAll('label.worldmap-member')]
        .find((l) => l.textContent?.startsWith(name))!
        .querySelector('input')!;
    const map = (): HTMLElement => root.querySelector('.worldmap-backdrop')!;
    return { panel, games, button, box, map, root };
  }

  it('is disabled before Horde 3 with the reason', () => {
    const { button } = panelFor(newGame());
    expect(button('World map').disabled).toBe(true);
    expect(button('World map').textContent).toContain('Patrols open after Horde 2');
  });

  it('opens the map, picks a place, picks a party and sends it', () => {
    const { button, box, games, map, root } = panelFor(open());
    expect(map().hidden).toBe(true);
    button('World map').click();
    expect(map().hidden).toBe(false);
    expect(root.querySelector('.build-title')!.textContent).toBe('World map');
    button('Supermarket').focus();
    button('Supermarket').click();
    expect(root.querySelector('.build-slot-title')!.textContent).toBe('Supermarket');
    expect(document.activeElement?.textContent).toContain('Supermarket');
    const send = button('Send patrol');
    expect(send.disabled).toBe(true);
    expect(send.textContent).toContain('Pick someone to send');
    box('Bob').click();
    box('Jack').click();
    expect(root.textContent).toContain('Risk: ');
    box('John').click();
    expect(button('Send patrol').textContent).toContain('Keep one defender at the camp');
    box('John').click();
    button('Send patrol').click();
    expect(games).toHaveLength(1);
    const p: Patrol = games[0]!.patrols[0]!;
    expect(p.location).toBe('supermarket');
    expect(p.members).toEqual(['bob', 'jack']);
    // The party is gone from the picker and marked on the map.
    expect(box('Bob').disabled).toBe(true);
    expect(map().querySelectorAll('.worldmap-patrol')).toHaveLength(1);
    expect(root.textContent).toContain(
      `Supermarket · Bob, Jack · ${tripText(tripMinutes('supermarket'))} left`,
    );
  });

  it('refuses with no gate standing', () => {
    const g = open();
    const base = {
      ...g.base,
      layers: g.base.layers.map((l) => ({
        ...l,
        slots: l.slots.map((s) => (s?.kind === 'gate' ? { ...s, hp: 0 } : s)),
      })),
    };
    const { button, box } = panelFor({ ...g, base });
    button('World map').click();
    button('Gas station').click();
    box('Bob').click();
    expect(button('Send patrol').textContent).toContain('Patrols leave by a gate');
  });

  it('lists reports newest first; Back and a horde close the map', () => {
    const g = {
      ...open(),
      reports: [report({ no: 1 }), report({ no: 2, location: 'supermarket' })],
    };
    const { button, map, panel, root } = panelFor(g);
    button('World map').click();
    const titles = [...root.querySelectorAll('.worldmap-report h4')].map((h) => h.textContent);
    expect(titles[0]).toMatch(/^Supermarket/);
    expect(titles[1]).toMatch(/^Gas station/);
    button('Back').click();
    expect(map().hidden).toBe(true);
    button('World map').click();
    panel.hide();
    expect(map().hidden).toBe(true);
  });

  it('renders hostile names as plain text', () => {
    const evil = '<img src=x onerror=alert(1)>‮gnp.exe';
    const g = open();
    g.roster[0]!.name = evil;
    const out = sent(g, ['bob']);
    const withReport = {
      ...out,
      reports: [
        report({ names: [evil, 'Jack'], injured: ['Jack'], dead: [evil] }),
        report({ names: [evil], injured: [evil] }),
      ],
    };
    const { button, root } = panelFor(withReport);
    button('World map').click();
    button('Gas station').click();
    // Every path: picker, patrol line, marker label, Sent, Injured, Didn't come back; then the ticker's rewrite.
    tickMap(root, withReport, NOW + 60_000);
    // Only the map's own art: the payload never became an element.
    expect(root.querySelector('[onerror], img[src="x"]')).toBeNull();
    expect(root.querySelector('.worldmap-patrol-label')!.textContent).toContain(evil);
    expect(root.querySelector('[data-patrol]:not(.worldmap-patrol)')!.textContent).toContain(evil);
    expect(root.textContent).toContain(`Injured: ${evil}`);
    expect(root.textContent).toContain(`Didn't come back: ${evil}`);
    expect(root.textContent).toContain(`Sent: ${evil}, Jack`);
    expect(
      [...root.querySelectorAll('label.worldmap-member')].some((l) =>
        l.textContent?.startsWith(evil),
      ),
    ).toBe(true);
    for (const n of root.querySelectorAll<HTMLElement>('[data-patrol]'))
      expect(n.dataset.patrol).toMatch(/^\d+$/);
  });

  it('shows weapons waiting and the trip for the picked place', () => {
    const g = open();
    const withLeft = {
      ...g,
      leftBehind: [
        {
          location: 'gas-station' as const,
          weapon: { uid: 'p1-1', base: 'smg' as const, rarity: 'common' as const, affixes: [] },
        },
      ],
    } as GameState;
    const { button, root } = panelFor(withLeft);
    button('World map').click();
    button('Gas station').click();
    expect(root.textContent).toContain(`Tier ${LOCATIONS['gas-station'].tier} · round trip 15m`);
    expect(root.textContent).toContain('1 weapon left here by the fallen');
  });
});

describe('world map timers and picks (ID-028)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function panelAt(game: GameState) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const panel = createBuildPanel(
      root,
      () => {},
      () => {},
      (g) => panel.show(g, null),
      () => {},
    );
    panel.show(game, null);
    const button = (label: string): HTMLButtonElement =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label))!;
    return { panel, root, button };
  }

  it('ticks every second while the map is open, and stops on Back and when hidden', () => {
    // Focus moves queue jsdom's own 0 ms selection event: flush it, then count the ticker.
    const timers = (): number => {
      vi.advanceTimersByTime(0);
      return vi.getTimerCount();
    };
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const g = sent(open(), ['bob']);
    const { panel, root, button } = panelAt(g);
    expect(timers()).toBe(0);
    button('World map').click();
    expect(timers()).toBe(1);
    const label = () => root.querySelector('.worldmap-patrol-label')!.textContent;
    expect(label()).toBe('Gas station · Bob · 15m left');
    vi.advanceTimersByTime(5 * 60_000);
    expect(label()).toBe('Gas station · Bob · 10m left');
    expect(root.querySelector('[data-patrol]:not(.worldmap-patrol)')!.textContent).toBe(
      'Gas station · Bob · 10m left',
    );
    button('Back').click();
    expect(timers()).toBe(0);
    button('World map').click();
    expect(timers()).toBe(1);
    panel.hide();
    expect(timers()).toBe(0);
  });

  it('forgets the map picks when another camp is loaded', () => {
    const g = open();
    const { root, button } = panelAt(g);
    button('World map').click();
    button('Gas station').click();
    [...root.querySelectorAll('label.worldmap-member')][0]!.querySelector('input')!.click();
    button('Back').click();
    const paste = root.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Backup code to load"]',
    )!;
    paste.value = exportCode(encodeSave(g, NOW));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    button('Load code').click();
    button('World map').click();
    expect(root.querySelector('.build-slot-note')!.textContent).toBe(
      'Pick a place on the map to send a patrol there.',
    );
    button('Gas station').click();
    expect(
      [...root.querySelectorAll<HTMLInputElement>('label.worldmap-member input')].some(
        (b) => b.checked,
      ),
    ).toBe(false);
  });
});
