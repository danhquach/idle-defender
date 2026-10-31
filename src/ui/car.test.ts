// @vitest-environment jsdom
// Design §10 Vehicle, as built ID-030: building the car in the camp section, and the
// "Take the car" toggle on the world map's send-patrol screen.
import { describe, expect, it } from 'vitest';
import { PATROL, stockOf } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { carGas, sendPatrol, tripMinutes } from '../core/patrol.ts';
import { createBuildPanel } from './build.ts';
import { campLines } from './roster.ts';
import { carLabel, patrolLine, routeShare, tripText } from './worldmap.ts';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

/** The build panel showing `game`; every game handed on is kept in `games` and shown again. */
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
  root.querySelector<HTMLButtonElement>('#build-tab-camp')!.click(); // the views open from the Camp tab (ID-059)
  const button = (label: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
  const box = (name: string): HTMLInputElement =>
    [...root.querySelectorAll('label.worldmap-member')]
      .find((l) => l.textContent?.startsWith(name))!
      .querySelector('input')!;
  const car = (): HTMLInputElement | null => root.querySelector('input[data-car]');
  return { root, games, button, box, car, panel };
}

/** Patrols open, a fourth defender, `cars` built and `gas` in the camp. */
function camp(cars: number, gas: number): GameState {
  const g = newGame();
  return {
    ...g,
    hordeNumber: PATROL.unlock,
    roster: [...g.roster, { ...g.roster[0]!, id: 'dan', name: 'Dan' }],
    power: { ...g.power, gas },
    camp: { ...g.camp, upgrades: 1, cars },
  };
}

describe('building the car in the camp section', () => {
  it('builds once for its cost, then says whether the car is ready', () => {
    const rich = { ...newGame(), stock: stockOf({ metal: 40, parts: 20, scrap: 30 }) };
    const { games, button } = panelFor(rich);
    button('Roster')!.click();
    const build = button('Build a car')!;
    expect(build.textContent).toContain('40 metal');
    expect(build.textContent).toContain('20 parts');
    build.click();
    expect(games.at(-1)!.camp.cars).toBe(1);
    expect(games.at(-1)!.stock).toMatchObject({ metal: 0, parts: 0, scrap: 0 });
    // Built: no second car without research; the camp says it is ready.
    expect(button('Build a car')).toBeUndefined();
    expect(campLines(games.at(-1)!, NOW)).toContain('Car: ready');
  });

  it('is refused short of materials, the shortfall in red', () => {
    const { button } = panelFor(newGame());
    button('Roster')!.click();
    const build = button('Build a car')!;
    expect(build.disabled).toBe(true);
    expect(build.classList.contains('btn-unaffordable')).toBe(true);
    expect(build.querySelector('.btn-cost-short')).not.toBeNull();
  });

  it('says when the car is out', () => {
    const r = sendPatrol(camp(1, 50), 'gas-station', ['bob'], 1, NOW, { car: true });
    if (!r.ok) throw new Error(r.reason);
    expect(campLines(r.game, NOW)).toContain('Car: out on patrol');
    expect(campLines(newGame(), NOW).some((l) => l.startsWith('Car'))).toBe(false);
  });
});

describe('the "Take the car" toggle', () => {
  it('shows only with a car built, and sends by car when ticked', () => {
    const none = panelFor(camp(0, 50));
    none.button('World map')!.click();
    none.button('Electronics store')!.click();
    expect(none.car()).toBeNull();

    const { button, box, car, games, root } = panelFor(camp(1, 50));
    button('World map')!.click();
    button('Electronics store')!.click();
    expect(car()!.checked).toBe(false);
    expect(car()!.parentElement!.textContent).toBe(
      carLabel(camp(1, 50), 'electronics', ['electronics']),
    );
    expect(carLabel(camp(1, 50), 'electronics', ['electronics'])).toBe(
      'Take the car · round trip 31m (45m on foot) · burns 4 Gas (camp has 50)',
    );
    car()!.click();
    expect(root.textContent).toContain('round trip 31m by car');
    box('Bob').click();
    button('Send patrol')!.click();
    const sent = games.at(-1)!;
    expect(sent.patrols[0]!.car).toBe(0);
    expect(sent.power.gas).toBe(46);
    // The car is out: no toggle, the reason instead; the next party goes on foot.
    expect(car()).toBeNull();
    expect(root.textContent).toContain('The car is out on patrol');
    expect(root.textContent).toContain('Electronics store · by car · Bob');
  });

  it('refuses to send without enough Gas, the reason as visible text', () => {
    const { button, box, car } = panelFor(camp(1, 3));
    button('World map')!.click();
    button('Electronics store')!.click();
    box('Bob').click();
    car()!.click();
    const send = button('Send patrol')!;
    expect(send.disabled).toBe(true);
    expect(send.querySelector('.btn-reason')!.textContent).toBe(
      'Not enough Gas: the car needs 4, the camp has 3',
    );
    // On foot it can go.
    car()!.click();
    expect(button('Send patrol')!.disabled).toBe(false);
  });

  it('starts the next pick on foot after a car patrol leaves', () => {
    const { button, box, car, games, panel } = panelFor(camp(1, 50));
    button('World map')!.click();
    button('Gas station')!.click();
    car()!.click();
    box('Bob').click();
    button('Send patrol')!.click();
    // Back home: the toggle shows again, unticked.
    const home = { ...games.at(-1)!, patrols: [] };
    panel.show(home, null);
    expect(car()!.checked).toBe(false);
  });

  it('moves a car patrol along its shorter route', () => {
    const r = sendPatrol(camp(1, 50), 'electronics', ['bob'], 1, NOW, { car: true });
    if (!r.ok) throw new Error(r.reason);
    const p = r.game.patrols[0]!;
    // 8 minutes each way by car, 15 searching.
    expect(routeShare(p, NOW + 4 * MIN)).toBeCloseTo(0.5);
    expect(routeShare(p, NOW + 8 * MIN)).toBe(1);
    expect(routeShare(p, NOW + 23 * MIN)).toBe(1);
    expect(routeShare(p, NOW + 27 * MIN)).toBeCloseTo(0.5);
    expect(patrolLine(r.game, p, NOW)).toBe(
      `Electronics store · by car · Bob · ${tripText(tripMinutes('electronics', undefined, true))} left`,
    );
    expect(carGas('electronics')).toBe(4);
  });
});

describe('the car label', () => {
  it('says when the Gas the trip could find sets the price', () => {
    expect(carLabel(camp(1, 2), 'gas-station', ['gas-station'])).toBe(
      'Take the car · round trip 11m (15m on foot) · burns 13 Gas, as much as it could find (camp has 2)',
    );
  });
});

describe('the car pick across places', () => {
  it('starts each picked place on foot', () => {
    const { button, car } = panelFor(camp(1, 50));
    button('World map')!.click();
    button('Electronics store')!.click();
    car()!.click();
    expect(car()!.checked).toBe(true);
    button('Gas station')!.click();
    expect(car()!.checked).toBe(false);
  });
});
