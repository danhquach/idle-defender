// @vitest-environment jsdom
// Design §11, as built ID-033: the camp in the roster view (slots, the camp upgrade,
// level and picks, the next recruit, Dismiss) and the camp-level pick on the result screen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_PICKS, type CampChoice, type CampOffer } from '../core/camp.ts';
import { MAX_COUNT, stockOf, type CampPickId } from '../core/data.ts';
import { newGame, startHorde, type GameState } from '../core/game.ts';
import { createBuildPanel } from './build.ts';
import { campPickText, createHud, resultScreen } from './hud.ts';
import { campLines, dismissQuestion, recruitNotice, treatText } from './roster.ts';

const NOW = 1_800_000_000_000;

/** The roster view showing `game`; every game handed on is kept in `games` and shown again. */
function rosterFor(game: GameState) {
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
  buttons('Roster')[0]!.click();
  return { root, games, buttons };
}

const four = (): GameState => {
  const g = newGame();
  return { ...g, roster: [...g.roster, { ...g.roster[0]!, id: 'recruit-1', name: 'Ava' }] };
};

afterEach(() => vi.restoreAllMocks());

describe('the camp in the roster view', () => {
  it('lists people and slots, the level, picks taken and the next recruit', () => {
    const g = newGame();
    expect(campLines(g, NOW)).toEqual([
      'Camp 3/5 people',
      'Camp level 1 · 0/30 XP',
      'No camp picks yet',
    ]);
    const later: GameState = {
      ...g,
      camp: { ...g.camp, xp: 40, picks: { ...NO_PICKS, medic: 2 }, recruitAt: NOW + 42 * 60_000 },
    };
    expect(campLines(later, NOW)).toEqual([
      'Camp 3/5 people',
      'Camp level 2 · 10/60 XP',
      'Camp picks: Field Medic 2/5',
      'A free recruit arrives in 42m',
    ]);
  });

  it('names free recruits who arrived, one or several', () => {
    expect(recruitNotice(['Ava'])).toBe('Ava joined the camp as a free recruit.');
    expect(recruitNotice(['Ava', 'Ben', 'Cole'])).toBe(
      'Ava, Ben and Cole joined the camp as free recruits.',
    );
  });

  it('Expand the camp pays and hands on the bigger camp; refused with the reason', () => {
    const { games, buttons } = rosterFor({ ...newGame(), stock: stockOf({ wood: 60, scrap: 40 }) });
    buttons('Expand the camp')[0]!.click();
    expect(games.at(-1)!.camp.upgrades).toBe(1);
    const again = buttons('Expand the camp')[0]!;
    expect(again.disabled).toBe(true);
    // The red cost says why; the reason is the tooltip (ID-056).
    expect(again.title).toBe('Not enough materials');
    expect(again.classList.contains('btn-unaffordable')).toBe(true);
    expect(again.querySelector('.btn-cost-short')).not.toBeNull();
  });

  it('Dismiss is disabled at 3 alive; with 4 it asks first and a no changes nothing', () => {
    expect(
      rosterFor(newGame())
        .buttons('Dismiss')
        .every((b) => b.disabled),
    ).toBe(true);
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { games, buttons } = rosterFor(four());
    buttons('Dismiss')[3]!.click();
    expect(ask).toHaveBeenCalledWith(dismissQuestion({ name: 'Ava' }));
    expect(games).toEqual([]);
    ask.mockReturnValue(true);
    buttons('Dismiss')[3]!.click();
    expect(games.at(-1)!.roster.map((d) => d.id)).toEqual(['bob', 'jack', 'john']);
  });

  it('a camp-level offer still waiting can be picked here', () => {
    const g = newGame();
    const waiting = {
      ...g,
      camp: {
        ...g.camp,
        xp: 30,
        offers: [{ picks: ['medic', 'salvage'] as CampPickId[], survivor: null }],
      },
    };
    const { games, buttons } = rosterFor(waiting);
    buttons('Field Medic 1/5')[0]!.click();
    expect(games.at(-1)!.camp.picks.medic).toBe(1);
    expect(games.at(-1)!.camp.offers).toEqual([]);
  });
});

describe('recovery in the roster view (ID-031)', () => {
  const HOUR = 60 * 60 * 1000;
  /** Bob resting `rest` more (an hour), with `food` Food and no Medicine. */
  const resting = (food: number, rest = HOUR): GameState => {
    const g = newGame();
    return {
      ...g,
      stock: stockOf({ food }),
      roster: g.roster.map((d) => (d.id === 'bob' ? { ...d, injuredUntil: Date.now() + rest } : d)),
    };
  };

  it('names the item, the cut and what is left', () => {
    expect(treatText(resting(3), 'food')).toBe('Use Food · 30m less rest · 3 left');
    expect(treatText(resting(3), 'medicine')).toBe('Use Medicine · 60m less rest · 0 left');
  });

  it('only a resting defender gets the buttons; Food cuts the rest and is used up', () => {
    const g = resting(3);
    const { games, buttons } = rosterFor(g);
    expect(buttons('Use Food')).toHaveLength(1);
    const until = g.roster[0]!.injuredUntil!;
    buttons('Use Food')[0]!.click();
    expect(games.at(-1)!.stock.food).toBe(2);
    expect(games.at(-1)!.roster[0]!.injuredUntil).toBe(until - HOUR / 2);
  });

  it('with none left the button is disabled and says why', () => {
    const { games, buttons } = rosterFor(resting(0));
    const medicine = buttons('Use Medicine')[0]!;
    expect(medicine.disabled).toBe(true);
    expect(medicine.textContent).toContain('No medicine left');
    medicine.click();
    expect(games).toEqual([]);
  });

  it('Medicine cuts an hour and is used up', () => {
    const g = { ...resting(0, 2 * HOUR), stock: stockOf({ medicine: 1 }) };
    const { games, buttons } = rosterFor(g);
    buttons('Use Medicine')[0]!.click();
    expect(games.at(-1)!.stock.medicine).toBe(0);
    expect(games.at(-1)!.roster[0]!.injuredUntil).toBe(g.roster[0]!.injuredUntil! - HOUR);
  });

  it('a defender out on patrol gets no recovery buttons', () => {
    const g = resting(3);
    const out: GameState = {
      ...g,
      patrols: [
        {
          no: 1,
          location: 'gas-station',
          buildings: ['gas-station'],
          focus: 'anything',
          order: 'balanced',
          members: ['bob'],
          sentAt: Date.now(),
          sentHorde: 3,
          strength: 1,
          seed: 1,
          car: null,
        },
      ],
    };
    expect(rosterFor(out).buttons('Use ')).toEqual([]);
  });

  it('a fit roster shows no recovery buttons', () => {
    expect(rosterFor(newGame()).buttons('Use ')).toEqual([]);
  });
});

describe('the camp-level pick on the result screen', () => {
  /** A won Horde 1 from a camp 23 XP short of level 2, so it levels up. */
  function won() {
    const g = newGame();
    const game = { ...g, camp: { ...g.camp, xp: 25 } };
    const s = startHorde(game, 1, 'bob', 0, NOW);
    s.outcome = 'won' as const;
    return { game, s };
  }

  it('shows camp XP and the offer the win brings', () => {
    const { game, s } = won();
    const screen = resultScreen(game, s, NOW);
    expect(screen.lines).toContain('Camp +7 XP · level 2 (2/60) · level up!');
    expect(screen.camp.offers).toHaveLength(1);
    expect(screen.camp.offers[0]!.picks).toHaveLength(3);
  });

  it('a camp at the XP cap still shows its win', () => {
    const { game, s } = won();
    const capped = { ...game, camp: { ...game.camp, xp: MAX_COUNT } };
    expect(() => resultScreen(capped, s, NOW)).not.toThrow();
  });

  it('holds "Back to build" until every offer is picked, each going out once', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const picked: CampChoice[] = [];
    const done = vi.fn();
    const noop = () => {};
    const hud = createHud(root, noop, done, noop, noop, noop, noop, noop, noop, (id) =>
      picked.push(id),
    );
    const { game, s } = won();
    const screen = resultScreen(game, s, NOW);
    const offers: CampOffer[] = [screen.camp.offers[0]!, { picks: ['stockpile'], survivor: null }];
    hud.showResult({ ...screen, camp: { picks: NO_PICKS, offers, room: screen.camp.room } });
    const back = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Back to build',
    )!;
    expect(back.disabled).toBe(true);
    back.click();
    expect(done).not.toHaveBeenCalled();
    const first = offers[0]!.picks[1]!;
    const card = (text: string) =>
      [...root.querySelectorAll<HTMLButtonElement>('.hud-card-camp')].find(
        (b) => b.textContent === text,
      )!;
    card(campPickText({ picks: NO_PICKS }, first)).click();
    expect(back.disabled).toBe(true);
    card(campPickText({ picks: NO_PICKS }, 'stockpile')).click();
    expect(picked).toEqual([first, 'stockpile']);
    expect(back.disabled).toBe(false);
    expect(document.activeElement).toBe(back);
    back.click();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
