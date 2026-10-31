// @vitest-environment jsdom
// Design §10, §11, as built ID-032: survivors waiting in a patrol report on the world map,
// in a camp level-up offer on the result screen, and in an offer left for the roster.
import { describe, expect, it, vi } from 'vitest';
import {
  NO_PICKS,
  rollSurvivor,
  survivorDefender,
  type CampChoice,
  type Survivor,
} from '../core/camp.ts';
import { PATROL, stockOf } from '../core/data.ts';
import { newGame, startHorde, type GameState } from '../core/game.ts';
import type { PatrolReport } from '../core/patrol.ts';
import { createRng } from '../core/rng.ts';
import { createBuildPanel } from './build.ts';
import { createHud, resultScreen, survivorText } from './hud.ts';

const NOW = 1_800_000_000_000;

const survivor = (id: string, name = 'Ava'): Survivor => ({
  ...rollSurvivor(createRng(3), id, 3, 3),
  name,
});

const report = (survivors: Survivor[]): PatrolReport => ({
  no: 1,
  location: 'gas-station',
  buildings: ['gas-station'],
  searched: 1,
  bigHorde: null,
  order: 'balanced',
  focus: 'anything',
  lost: {
    stock: stockOf(),
    gas: 0,
    batteries: { makeshift: 0, standard: 0, 'high-capacity': 0, military: 0 },
    weapons: 0,
  },
  names: ['Bob'],
  injured: [],
  dead: [],
  wiped: false,
  returnedAt: NOW,
  stock: stockOf(),
  gas: 0,
  batteries: { makeshift: 0, standard: 0, 'high-capacity': 0, military: 0 },
  weapons: [],
  recovered: [],
  xp: 10,
  survivors,
});

/** A game at Horde 3 with patrol 1 back and `survivors` waiting in its report. */
const back = (...survivors: Survivor[]): GameState => ({
  ...newGame(),
  hordeNumber: PATROL.unlock,
  patrolsSent: 1,
  reports: [report(survivors)],
});

/** `game` with its 5 slots full. */
const full = (game: GameState): GameState => ({
  ...game,
  roster: [
    ...game.roster,
    { ...game.roster[0]!, id: 'extra-1' },
    { ...game.roster[0]!, id: 'extra-2' },
  ],
});

/** The build panel showing `game`, every game handed on kept and shown again. */
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
  const buttons = (label: string): HTMLButtonElement[] =>
    [...root.querySelectorAll('button')].filter((b) => b.textContent?.startsWith(label));
  return { root, games, buttons };
}

describe('a survivor in a patrol report', () => {
  it('shows their level, stats and weapon, with Let in and Turn away', () => {
    const s = survivor('s1-0');
    const { root, games, buttons } = panelFor(back(s, survivor('s1-1', 'Ben')));
    buttons('World map')[0]!.click();
    expect(root.querySelector('.worldmap-report')!.textContent).toContain(
      `Survivor wants to join: ${survivorText(s)}`,
    );
    expect(survivorText(s)).toMatch(/^Ava · level 3 · /);
    expect(root.textContent).toContain('Survivors wait until 20 newer reports are in');
    buttons('Let Ava join')[0]!.click();
    expect(games.at(-1)!.roster.at(-1)).toEqual(survivorDefender(s));
    expect(games.at(-1)!.reports[0]!.survivors.map((x) => x.name)).toEqual(['Ben']);
    buttons('Turn Ben away')[0]!.click();
    expect(games.at(-1)!.reports[0]!.survivors).toEqual([]);
    expect(games.at(-1)!.roster).toHaveLength(newGame().roster.length + 1);
    expect(buttons('Let ')).toEqual([]);
  });

  it('can only wait while the camp is full', () => {
    const { buttons, root } = panelFor(full(back(survivor('s1-0'))));
    buttons('World map')[0]!.click();
    const join = buttons('Let Ava join')[0]!;
    expect(join.disabled).toBe(true);
    expect(join.textContent).toContain('The camp is full');
    expect(buttons('Turn Ava away')[0]!.disabled).toBe(false);
    expect(root.textContent).toContain('Survivor wants to join');
  });

  it('renders a hostile name as plain text', () => {
    const evil = '<img src=x onerror=alert(1)>‮gnp.exe';
    const { root, buttons } = panelFor(back(survivor('s1-0', evil)));
    buttons('World map')[0]!.click();
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.textContent).toContain(evil);
  });

  it('renders a hostile name as plain text on the result screen and in the roster', () => {
    const evil = '<img src=x onerror=alert(1)>\u202egnp.exe';
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const noop = () => {};
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    const g = { ...newGame(), camp: { ...newGame().camp, xp: 25 } };
    const s = startHorde(g, 1, 'bob', 0, NOW);
    s.outcome = 'won';
    const screen = resultScreen(g, s, NOW);
    const offers = [{ picks: ['medic' as const], survivor: survivor('c2', evil) }];
    hud.showResult({ ...screen, camp: { picks: NO_PICKS, offers, room: screen.camp.room } });
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.textContent).toContain(evil);
    const roster = panelFor({ ...g, camp: { ...g.camp, xp: 30, offers } });
    roster.buttons('Roster')[0]!.click();
    expect(roster.root.querySelector('img[src="x"]')).toBeNull();
    expect(roster.root.textContent).toContain(`Let ${evil} join`);
  });
});

describe('a survivor in a camp level-up offer', () => {
  /** A won Horde 1 from a camp 5 XP short of level 2. */
  function won() {
    const g = newGame();
    const game = { ...g, camp: { ...g.camp, xp: 25 } };
    const s = startHorde(game, 1, 'bob', 0, NOW);
    s.outcome = 'won' as const;
    return { game, s };
  }
  function hudWith(room: { people: number; weapons: number }) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const picked: CampChoice[] = [];
    const done = vi.fn();
    const noop = () => {};
    const hud = createHud(root, noop, done, noop, noop, noop, noop, noop, noop, (c) =>
      picked.push(c),
    );
    const { game, s } = won();
    const screen = resultScreen(game, s, NOW);
    const offers = [{ picks: ['medic' as const, 'salvage' as const], survivor: survivor('c2') }];
    hud.showResult({ ...screen, camp: { picks: NO_PICKS, offers, room } });
    const cards = (): HTMLButtonElement[] => [
      ...root.querySelectorAll<HTMLButtonElement>('.hud-card-camp'),
    ];
    const back = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Back to build',
    )!;
    return { picked, cards, back, done };
  }

  it('takes a slot of the offer; letting them in answers it', () => {
    const { picked, cards, back } = hudWith({ people: 2, weapons: 5 });
    expect(cards()).toHaveLength(3);
    const join = cards().at(-1)!;
    expect(join.textContent).toBe(`Survivor wants to join: ${survivorText(survivor('c2'))}`);
    expect(back.disabled).toBe(true);
    join.click();
    expect(picked).toEqual(['join']);
    expect(back.disabled).toBe(false);
  });

  it('is disabled with the reason when the camp or the armoury is full; a pick turns them away', () => {
    for (const [room, why] of [
      [{ people: 0, weapons: 5 }, 'The camp is full'],
      [{ people: 1, weapons: 0 }, 'The armoury is full'],
    ] as const) {
      const { picked, cards, back } = hudWith(room);
      const join = cards().at(-1)!;
      expect(join.disabled).toBe(true);
      expect(join.textContent).toContain(why);
      join.click();
      expect(picked).toEqual([]);
      cards()[0]!.click();
      expect(picked).toEqual(['medic']);
      expect(back.disabled).toBe(false);
    }
  });

  it('a survivor alone in an offer with no room can be turned away, so the screen never locks', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const picked: CampChoice[] = [];
    const noop = () => {};
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, (c) =>
      picked.push(c),
    );
    const { game, s } = won();
    const screen = resultScreen(game, s, NOW);
    const offers = [{ picks: [], survivor: survivor('c2') }];
    hud.showResult({
      ...screen,
      camp: { picks: NO_PICKS, offers, room: { people: 0, weapons: 5 } },
    });
    const cards = [...root.querySelectorAll<HTMLButtonElement>('.hud-card-camp')];
    expect(cards.map((c) => c.disabled)).toEqual([true, false]);
    expect(cards[1]!.textContent).toBe('Turn Ava away');
    cards[1]!.click();
    expect(picked).toEqual(['away']);
    const back = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Back to build',
    )!;
    expect(back.disabled).toBe(false);
  });

  it('a result screen counts the room after the win', () => {
    const { game, s } = won();
    expect(resultScreen(game, s, NOW).camp.room.people).toBe(2);
    expect(resultScreen(full(game), s, NOW).camp.room.people).toBe(0);
  });

  it('an offer left for the roster can let them in, or not with the camp full', () => {
    const offered = (g: GameState): GameState => ({
      ...g,
      camp: {
        ...g.camp,
        xp: 30,
        offers: [{ picks: ['medic'], survivor: survivor('c2') }],
      },
    });
    const { games, buttons, root } = panelFor(offered(newGame()));
    buttons('Roster')[0]!.click();
    expect(root.textContent).toContain(`Survivor wants to join: ${survivorText(survivor('c2'))}`);
    buttons('Let Ava join')[0]!.click();
    expect(games.at(-1)!.roster.at(-1)!.id).toBe('c2');
    expect(games.at(-1)!.camp.offers).toEqual([]);

    const crowded = panelFor(offered(full(newGame())));
    crowded.buttons('Roster')[0]!.click();
    expect(crowded.buttons('Let Ava join')[0]!.disabled).toBe(true);
    expect(crowded.root.textContent).toContain('The camp is full');
    crowded.buttons('Field Medic')[0]!.click();
    expect(crowded.games.at(-1)!.camp.offers).toEqual([]);
    expect(crowded.games.at(-1)!.roster).toHaveLength(5);
    expect(crowded.buttons('Turn Ava away')).toEqual([]);

    // With no pick left, Turn away answers it.
    const alone = full(newGame());
    const lone = panelFor({
      ...alone,
      camp: { ...alone.camp, xp: 30, offers: [{ picks: [], survivor: survivor('c2') }] },
    });
    lone.buttons('Roster')[0]!.click();
    lone.buttons('Turn Ava away')[0]!.click();
    expect(lone.games.at(-1)!.camp.offers).toEqual([]);
  });
});
