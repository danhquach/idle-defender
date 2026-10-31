// @vitest-environment jsdom
// Design §10, as built ID-028: the world map screen, its location panel, party picker,
// risk screen, Send, patrols out and reports.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCATION_IDS,
  LOCATIONS,
  MAP_CAMP,
  MAP_SPOTS,
  MATERIALS,
  PLACE_IDS,
  PLAZA_IDS,
  PLAZAS,
  stockOf,
} from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
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
  focusName,
  focusRows,
  locationLines,
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
  buildings: ['gas-station'],
  searched: 1,
  bigHorde: null,
  order: 'balanced',
  focus: 'anything',
  lost: {
    stock: Object.fromEntries(MATERIALS.map((m) => [m, 0])) as PatrolReport['stock'],
    gas: 0,
    batteries: { makeshift: 0, standard: 0, 'high-capacity': 0, military: 0 },
    weapons: 0,
  },
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
      'strip-mall',
    ]);
    expect(root.querySelectorAll('line')).toHaveLength(4);
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
    const { panel, root, button } = panelAt(g);
    button('World map').click();
    button('Gas station').click();
    [...root.querySelectorAll('label.worldmap-member')][0]!.querySelector('input')!.click();
    button('Back').click();
    panel.forget();
    panel.show(g, null);
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

describe('plazas on the world map (ID-029)', () => {
  const horde6 = (): GameState => ({ ...newGame(), hordeNumber: 6 });
  const party = (g: GameState) => g.roster.slice(0, 2);

  it('places every place inside the map, apart from the rest, farther for a longer trip', () => {
    const away = (id: (typeof PLACE_IDS)[number]) =>
      Math.hypot(MAP_SPOTS[id].x - MAP_CAMP.x, MAP_SPOTS[id].y - MAP_CAMP.y);
    for (const id of PLACE_IDS) {
      expect(MAP_SPOTS[id].x).toBeGreaterThan(0);
      expect(MAP_SPOTS[id].x).toBeLessThan(1);
      expect(MAP_SPOTS[id].y).toBeGreaterThan(0);
      expect(MAP_SPOTS[id].y).toBeLessThan(1);
      for (const other of PLACE_IDS) {
        if (other === id) continue;
        if (tripMinutes(other) > tripMinutes(id))
          expect(away(other), `${other} vs ${id}`).toBeGreaterThan(away(id));
        const apart = Math.hypot(
          MAP_SPOTS[id].x - MAP_SPOTS[other].x,
          MAP_SPOTS[id].y - MAP_SPOTS[other].y,
        );
        expect(apart, `${id} ${other}`).toBeGreaterThan(0.1);
        // Labels sit under the icons: two on the same row need room side by side.
        if (Math.abs(MAP_SPOTS[id].y - MAP_SPOTS[other].y) < 0.08)
          expect(
            Math.abs(MAP_SPOTS[id].x - MAP_SPOTS[other].x),
            `${id} ${other}`,
          ).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  it("draws plazas as buttons with their buildings' icons together, rated like any place", () => {
    const g = horde6();
    const root = document.createElement('div');
    root.append(...mapContents(g, biggestParty(g, NOW), 'riverside', NOW, () => {}));
    const spot = (id: string) => root.querySelector<HTMLButtonElement>(`[data-location="${id}"]`)!;
    expect(spot('riverside').querySelectorAll('img.worldmap-icon-art')).toHaveLength(3);
    expect(spot('strip-mall').querySelectorAll('img.worldmap-icon-art')).toHaveLength(2);
    expect(spot('gas-station').querySelectorAll('img.worldmap-icon-art')).toHaveLength(1);
    expect(spot('riverside').textContent).toContain('Riverside Plaza · T2');
    expect(spot('riverside').getAttribute('aria-pressed')).toBe('true');
    for (const id of PLAZA_IDS) {
      expect(spot(id).querySelector('.worldmap-risk')!.textContent).toMatch(
        /^(Safe|Risky|Dangerous|Deadly)$/,
      );
    }
    expect(root.querySelectorAll('line')).toHaveLength(7); // the five hidden ones wait
  });

  it('shows the big-horde chance and the odds on the risk screen, live as buildings and orders change', () => {
    const g = horde6();
    const all = riskLines(party(g), 'riverside');
    expect(all).toContain('Big horde: 25% chance, strength 18');
    expect(all.some((l) => l.startsWith('Beaten ') && l.includes('Mutated Genes'))).toBe(true);
    expect(all.some((l) => l.startsWith('Fenced off '))).toBe(true);
    expect(all.some((l) => l.startsWith('Overrun '))).toBe(true);
    // Fewer buildings: a lower chance, a lower tier, a weaker horde.
    expect(riskLines(party(g), 'riverside', { buildings: ['gas-station'] })).toContain(
      'Big horde: 10% chance, strength 9',
    );
    expect(riskLines(party(g), 'riverside', { buildings: ['gas-station', 'pharmacy'] })).toContain(
      'Big horde: 20% chance, strength 18',
    );
    // The odds come from the party against the horde (two starters: strength 3.6).
    const odds = hordeOddsText(riskLines(party(g), 'riverside'));
    expect(odds).toEqual(['0%', '25%', '75%']);
    // The order shows its share and factor, and moves the odds of the result lines.
    expect(all).toContain(
      'When things go wrong: Balanced keeps 40% of the loot, deaths and wipe x1',
    );
    const loot = riskLines(party(g), 'riverside', { order: 'loot' });
    expect(loot).toContain(
      'When things go wrong: Save the loot keeps 80% of the loot, deaths and wipe x1.25',
    );
    expect(loot.find((l) => l.startsWith('Overrun'))).toContain('25% killed, whole party lost 25%');
    expect(
      riskLines(party(g), 'riverside', { order: 'people' }).find((l) => l.startsWith('Overrun')),
    ).toContain('10% killed, whole party lost 10%');
    expect(riskLines(party(g), 'riverside', { buildings: [] })).toEqual([
      'Tick a building to see the risk.',
    ]);
    expect(riskLines([], 'riverside')).toEqual(['Pick who goes to see the risk.']);
  });

  it('shows a single building no big horde, and the order only where it applies', () => {
    const g = open();
    const lines = riskLines(party(g), 'gas-station');
    expect(lines.some((l) => l.startsWith('Big horde'))).toBe(false);
    expect(lines).toContain(
      'When things go wrong: Balanced keeps 40% of the loot, deaths and wipe x1 (only on a Dangerous or Deadly trip)',
    );
    // The heavy-casualty rule applies to single buildings too.
    expect(lines.at(-1)).toBe('Half the party lost or more, or all of it: no loot.');
    const hard = riskLines(party(g), 'hardware', { order: 'people' });
    expect(hard.at(-2)).toBe(
      'When things go wrong: Save the people keeps 0% of the loot, deaths and wipe x0.5',
    );
    // Each member's death and the wipe are those of the order on a Dangerous trip.
    expect(hard[2]).toBe('Each member: 30% injured, 5% killed');
    expect(hard[3]).toBe('Whole party lost: 2.5%'.replace('2.5', String(Math.round(0.025 * 100))));
  });

  it('greys out a loot focus the ticked buildings cannot drop', () => {
    const rows = (b: Parameters<typeof focusRows>[0]) =>
      Object.fromEntries(focusRows(b).map((r) => [r.id, r.free]));
    expect(rows(PLAZAS.riverside.buildings)).toMatchObject({
      anything: true,
      gas: true,
      weapons: true,
      genes: false,
      food: true,
    });
    expect(rows(['pharmacy'])).toMatchObject({
      anything: true,
      medicine: true,
      gas: false,
      weapons: false,
    });
    expect(rows(PLAZAS['strip-mall'].buildings).weapons).toBe(false);
    expect(focusName('anything')).toBe('Anything');
    expect(focusName('batteries')).toBe('Batteries');
    expect(focusName('food')).toBe('Food');
  });

  it("writes the plaza panel: tier and trip of the ticked buildings, each one's loot", () => {
    const g = horde6();
    const lines = locationLines(g, 'riverside', ['gas-station', 'hardware']);
    expect(lines[0]).toBe('Tier 2 · round trip 1h 5m');
    expect(lines[1]).toBe('Gas station: mostly Gas, Makeshift batteries, Food; sometimes Scrap');
    expect(lines[2]).toMatch(/^Hardware store: mostly /);
    expect(locationLines(g, 'riverside', [])).toEqual(['Tick a building to search.']);
    // A single location reads as before.
    expect(locationLines(g, 'gas-station')[0]).toBe('Tier 1 · round trip 15m');
  });

  it('writes a plaza report: buildings searched, the big horde, the order and what the retreat lost', () => {
    const lost = {
      stock: stockOf({ scrap: 2, wood: 3 }),
      gas: 1,
      batteries: { makeshift: 1, standard: 0, 'high-capacity': 0, military: 0 },
      weapons: 1,
    };
    const r = reportLines(
      report({
        location: 'riverside',
        buildings: ['gas-station', 'pharmacy', 'hardware'],
        searched: 2,
        bigHorde: 'fence',
        order: 'loot',
        focus: 'gas',
        lost,
      }),
    );
    expect(r.title).toBe(`Riverside Plaza · back at ${clockTime(NOW)}`);
    expect(r.lines).toEqual([
      'Sent: Bob, Jack',
      'Searched: Gas station, Pharmacy',
      'Big horde: fenced off (it ends early with the loot found before it, cut by the order)',
      'Orders: Save the loot, favouring Gas',
      'Found: 4 scrap, 2 food, 1 gas, 1 makeshift battery',
      'Lost to the retreat: 2 scrap, 3 wood, 1 gas, 1 makeshift battery, 1 weapon',
      '30 XP each',
    ]);
    expect(
      reportLines(
        report({
          location: 'riverside',
          buildings: ['hardware'],
          searched: 0,
          bigHorde: 'overrun',
        }),
      ).lines[1],
    ).toBe('Searched: nothing');
    expect(reportLines(report({ location: 'riverside', bigHorde: 'defeat' })).lines).toContain(
      'Big horde: beaten (the patrol goes on, +50% XP and 1-2 Mutated Genes)',
    );
    // A wipe at a plaza still says where it went and what it ordered.
    expect(
      reportLines(report({ location: 'riverside', wiped: true, bigHorde: 'overrun' })).lines.at(-1),
    ).toBe('The whole party was lost. Nothing came back.');
    // A single building's report with a non-default order says so; its plain one does not.
    expect(reportLines(report({ order: 'people' })).lines).toContain('Orders: Save the people');
    expect(reportLines(report()).lines.some((l) => l.startsWith('Orders'))).toBe(false);
  });

  it('writes a plaza patrol out and routes it by its trip', () => {
    const g = horde6();
    const r = sendPatrol(g, 'riverside', ['bob'], 1, NOW, {
      buildings: ['gas-station', 'hardware'],
    });
    if (!r.ok) throw new Error(r.reason);
    const p = r.game.patrols[0]!;
    expect(patrolLine(r.game, p, NOW + 5 * 60_000)).toBe('Riverside Plaza · Bob · 1h 0m left');
    // Out 20 minutes, search 25, back 20.
    expect(routeShare(p, NOW + 10 * 60_000)).toBeCloseTo(0.5);
    expect(routeShare(p, NOW + 30 * 60_000)).toBe(1);
    expect(routeShare(p, NOW + 55 * 60_000)).toBeCloseTo(0.5);
  });
});

/** The beaten, fenced off and overrun odds a risk screen writes. */
function hordeOddsText(lines: string[]): string[] {
  return ['Beaten ', 'Fenced off ', 'Overrun '].map(
    (name) =>
      lines
        .find((l) => l.startsWith(name))!
        .slice(name.length)
        .split(':')[0]!,
  );
}

describe('plazas in the build panel (ID-029)', () => {
  const horde6 = (): GameState => ({ ...newGame(), hordeNumber: 6 });
  function panelFor(game: GameState) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const games: GameState[] = [];
    const panel = createBuildPanel(
      root,
      () => {},
      () => {},
      (next) => {
        games.push(next);
        panel.show(next, null);
      },
    );
    panel.show(game, null);
    const button = (label: string): HTMLButtonElement =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label))!;
    const person = (name: string): HTMLInputElement =>
      [...root.querySelectorAll('label.worldmap-member')]
        .find((l) => l.textContent?.startsWith(name))!
        .querySelector('input')!;
    const building = (id: string): HTMLInputElement =>
      root.querySelector<HTMLInputElement>(`input[data-building="${id}"]`)!;
    const select = (cls: string): HTMLSelectElement =>
      root.querySelector<HTMLSelectElement>(`select.${cls}`)!;
    const choose = (sel: HTMLSelectElement, value: string) => {
      sel.value = value;
      sel.dispatchEvent(new Event('change'));
    };
    return { games, button, person, building, select, choose, root };
  }

  it('ticks buildings, favours a loot type, sets the order and sends them all', () => {
    const { button, person, building, select, choose, games, root } = panelFor(horde6());
    button('World map').click();
    button('Riverside Plaza').click();
    expect(root.querySelector('.build-slot-title')!.textContent).toBe('Riverside Plaza');
    for (const id of ['gas-station', 'pharmacy', 'hardware'])
      expect(building(id).checked).toBe(true);
    person('Bob').click();
    person('Jack').click();
    const text = () => root.querySelector('.worldmap-risk-screen')!.textContent!;
    expect(text()).toContain('Big horde: 25% chance');
    // Unticking a building updates the odds live.
    building('hardware').click();
    expect(building('hardware').checked).toBe(false);
    expect(text()).toContain('Big horde: 20% chance');
    building('pharmacy').click();
    expect(text()).toContain('Big horde: 10% chance, strength 9');
    // Loot types the ticked buildings cannot drop are disabled; Anything is the default.
    const options = () => [...select('worldmap-focus').options];
    expect(options().find((o) => o.value === 'weapons')!.disabled).toBe(true);
    expect(options().find((o) => o.value === 'medicine')!.disabled).toBe(true);
    expect(options().find((o) => o.value === 'gas')!.disabled).toBe(false);
    expect(select('worldmap-focus').value).toBe('anything');
    choose(select('worldmap-focus'), 'gas');
    expect(select('worldmap-focus').value).toBe('gas');
    // Balanced is the default order.
    expect(select('worldmap-order').value).toBe('balanced');
    expect([...select('worldmap-order').options].map((o) => o.textContent)).toEqual([
      'Save the loot',
      'Balanced',
      'Save the people',
    ]);
    choose(select('worldmap-order'), 'people');
    expect(text()).toContain('Save the people keeps 0% of the loot');
    building('hardware').click();
    // The focus the ticked buildings still drop stays; one they cannot falls back to Anything.
    expect(select('worldmap-focus').value).toBe('gas');
    building('pharmacy').click();
    building('gas-station').click();
    expect(select('worldmap-focus').value).toBe('anything');
    building('gas-station').click();
    choose(select('worldmap-focus'), 'gas');
    button('Send patrol').click();
    const p = games[0]!.patrols[0]!;
    expect(p).toMatchObject({
      location: 'riverside',
      buildings: ['gas-station', 'pharmacy', 'hardware'],
      focus: 'gas',
      order: 'people',
    });
  });

  it('refuses with no building ticked, and says why', () => {
    const { button, person, building, root } = panelFor(horde6());
    button('World map').click();
    button('Strip mall').click();
    person('Bob').click();
    expect(button('Send patrol').disabled).toBe(false);
    building('supermarket').click();
    building('electronics').click();
    expect(button('Send patrol').disabled).toBe(true);
    expect(button('Send patrol').textContent).toContain('Tick a building to search');
    expect(root.querySelector('.worldmap-risk-screen')!.textContent).toContain(
      'Tick a building to see the risk.',
    );
  });

  it('offers no ticks for a single building but still the focus and the order', () => {
    const { button, person, select, choose, games, root } = panelFor(open());
    button('World map').click();
    button('Gas station').click();
    expect(root.querySelector('[data-building]')).toBeNull();
    expect(select('worldmap-order')).not.toBeNull();
    expect(select('worldmap-focus')).not.toBeNull();
    person('Bob').click();
    choose(select('worldmap-order'), 'loot');
    choose(select('worldmap-focus'), 'batteries');
    button('Send patrol').click();
    expect(games[0]!.patrols[0]).toMatchObject({
      location: 'gas-station',
      buildings: ['gas-station'],
      focus: 'batteries',
      order: 'loot',
    });
  });

  it('keeps the order across places, and forgets the ticks of the place it left', () => {
    const { button, building, select, choose } = panelFor(horde6());
    button('World map').click();
    button('Riverside Plaza').click();
    building('hardware').click();
    choose(select('worldmap-order'), 'loot');
    button('Strip mall').click();
    expect(select('worldmap-order').value).toBe('loot');
    button('Riverside Plaza').click();
    expect(building('hardware').checked).toBe(true);
  });

  it('renders hostile names in a plaza report as plain text', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const g = horde6();
    const withReport = {
      ...g,
      reports: [
        report({
          location: 'riverside' as const,
          buildings: ['gas-station' as const, 'hardware' as const],
          searched: 1,
          bigHorde: 'overrun' as const,
          names: [evil],
          dead: [evil],
        }),
      ],
    };
    const { button, root } = panelFor(withReport);
    button('World map').click();
    expect(root.querySelector('[onerror], img[src="x"]')).toBeNull();
    expect(root.textContent).toContain(`Sent: ${evil}`);
    expect(root.textContent).toContain('Searched: Gas station');
    expect(root.textContent).toContain('Big horde: overrun');
  });
});

describe('loot focus survives unticking every building (ID-029)', () => {
  it('keeps the pick while nothing can drop it, and shows and sends Anything meanwhile', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const games: GameState[] = [];
    const panel = createBuildPanel(
      root,
      () => {},
      () => {},
      (next) => {
        games.push(next);
        panel.show(next, null);
      },
    );
    panel.show({ ...newGame(), hordeNumber: 6 }, null);
    const button = (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label))!;
    const building = (id: string) =>
      root.querySelector<HTMLInputElement>(`input[data-building="${id}"]`)!;
    const focus = () => root.querySelector<HTMLSelectElement>('select.worldmap-focus')!;
    button('World map').click();
    button('Riverside Plaza').click();
    focus().value = 'gas';
    focus().dispatchEvent(new Event('change'));
    for (const id of ['gas-station', 'pharmacy', 'hardware']) building(id).click();
    expect(focus().value).toBe('anything');
    building('gas-station').click();
    expect(focus().value).toBe('gas');
    // With only the pharmacy ticked it counts as Anything, and is sent so.
    building('gas-station').click();
    building('pharmacy').click();
    expect(focus().value).toBe('anything');
    [...root.querySelectorAll<HTMLInputElement>('label.worldmap-member input')]
      .find((b) => b.parentElement?.textContent?.startsWith('Bob'))!
      .click();
    button('Send patrol').click();
    expect(games[0]!.patrols[0]).toMatchObject({ buildings: ['pharmacy'], focus: 'anything' });
  });
});
