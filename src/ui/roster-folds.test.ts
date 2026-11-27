// @vitest-environment jsdom
// ID-256: the Roster's sections each in a box; Bench, each patrol and Details fold shut from
// their header. Bench and Details are kept in this browser; a patrol's fold is for this visit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { sendMapPatrol, withMap } from '../core/scout.ts';
import { ROSTER_FOLD_KEYS } from '../storage/settings.ts';
import { createRoster } from './squadroster.ts';

const NOW = 1_700_000_000_000;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});
const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(from + i));

function campGame(squad: RosterDefender[], bench: RosterDefender[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 3,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** The camp with each team in `teams` sent on a patrol (from the bench). */
function out(bench: RosterDefender[], ...teams: string[][]): GameState {
  let g = withMap(campGame(people(3), bench), 7);
  teams.forEach((ids, i) => {
    const sent = sendMapPatrol(g, g.map!.areas[i]!.kind, ids, 1, NOW);
    if (!sent.ok) throw new Error(sent.code);
    g = sent.game;
  });
  return g;
}

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const sets: [string, string][] = [];
  return {
    data,
    sets,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      sets.push([k, v]);
      data.set(k, v);
    },
  };
}

function mount(start: GameState, storage: ReturnType<typeof memory> | null = memory()) {
  let g = start;
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const roster = createRoster(root, {
    state: () => ({ game: g, fight: null, canGear: true, resumes: false }),
    storage,
    onEquip: () => ({ ok: true }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
  });
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    scrim.querySelector<T>(sel) as T;
  const key = (k: string): HTMLButtonElement =>
    scrim.querySelector<HTMLButtonElement>(`[data-key="${k}"]`)!;
  return { roster, scrim, q, key, setGame: (n: GameState) => (g = n), storage };
}
type M = ReturnType<typeof mount>;

/** Whether the fold `head` says open, and its region (found by aria-controls) is shown. */
function state(m: M, head: HTMLElement): { expanded: string | null; shown: boolean } {
  const region = m.scrim.querySelector<HTMLElement>(`#${head.getAttribute('aria-controls')}`)!;
  expect(region).not.toBeNull();
  return { expanded: head.getAttribute('aria-expanded'), shown: !region.hidden };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW + 60_000, toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a box for each section (ID-256)', () => {
  it('Squad, Bench, Patrol and Details are four boxes; Squad has no fold', () => {
    const m = mount(out([person(4), person(5)], ['recruit-5']));
    m.roster.open('recruit-1');
    const boxes = [...m.scrim.querySelectorAll('.rv-box')].map((b) => b.className);
    expect(boxes).toEqual([
      'rv-box rv-box-squad',
      'rv-box rv-box-bench',
      'rv-box rv-box-patrol',
      'rv-box rv-box-details',
    ]);
    expect(m.q('.rv-box-squad .rv-fold')).toBeNull();
    expect(m.q('.rv-box-details .rv-box-title').textContent).toBe('Details');
    expect(m.q('.rv-box-bench .rv-fold').textContent).toBe('Bench 1');
  });

  it('the Bench box hides with an empty bench, the Patrol box with no patrol; Squad shows always', () => {
    const m = mount(campGame(people(3)));
    m.roster.open('recruit-1');
    expect(m.q('.rv-box-bench').hidden).toBe(true);
    expect(m.q('.rv-box-patrol').hidden).toBe(true);
    expect(m.q('.rv-box-squad').hidden).toBe(false);
    expect(m.q('.rv-box-details').hidden).toBe(false);
    m.setGame(campGame(people(3), [person(4)]));
    m.roster.refresh();
    expect(m.q('.rv-box-bench').hidden).toBe(false);
    expect(m.q('.rv-box-patrol').hidden).toBe(true);
    m.setGame(out([person(4)], ['recruit-4']));
    m.roster.refresh();
    expect(m.q('.rv-box-bench').hidden).toBe(true);
    expect(m.q('.rv-box-patrol').hidden).toBe(false);
  });

  it('titles keep their text with the count in its own span', () => {
    const m = mount(out([person(4), person(5)], ['recruit-5']));
    m.roster.open('recruit-1');
    const titles = [...m.scrim.querySelectorAll('.rv-tabs-label')].map((t) => t.textContent);
    expect(titles).toEqual([expect.stringMatching(/^Squad 3\//), 'Bench 1', 'On patrol 1']);
    expect(m.q('.rv-box-bench .rv-count').textContent).toBe('1');
  });
});

describe('the Bench and Details folds (ID-256)', () => {
  it.each([
    ['bench', 'fold:bench'],
    ['details', 'fold:details'],
  ] as const)(
    '%s: the header flips aria-expanded and its region, focus stays on it',
    (fold, key) => {
      const m = mount(campGame(people(3), [person(4)]));
      m.roster.open('recruit-1');
      const head = m.key(key);
      expect(state(m, head)).toEqual({ expanded: 'true', shown: true });
      head.focus();
      head.click();
      const after = m.key(key);
      expect(state(m, after)).toEqual({ expanded: 'false', shown: false });
      expect(document.activeElement).toBe(after);
      expect(m.storage!.data.get(ROSTER_FOLD_KEYS[fold])).toBe('1');
      after.click();
      expect(state(m, m.key(key))).toEqual({ expanded: 'true', shown: true });
      expect(m.storage!.data.get(ROSTER_FOLD_KEYS[fold])).toBe('0');
      expect(document.activeElement).toBe(m.key(key));
    },
  );

  it('a collapsed Bench hides its region, not the list itself, and survives refresh and tick', () => {
    const m = mount(campGame(people(3), [person(4)]));
    m.roster.open('recruit-1');
    m.key('fold:bench').click();
    const list = m.q('.rv-bench:not(.rv-patrol)');
    expect(list.hidden).toBe(false);
    expect(list.closest('.rv-fold-body')!.hasAttribute('hidden')).toBe(true);
    m.roster.refresh();
    m.roster.tick(NOW + 90_000);
    expect(state(m, m.key('fold:bench'))).toEqual({ expanded: 'false', shown: false });
    expect(m.q('.rv-bench:not(.rv-patrol)').hidden).toBe(false);
  });

  it('the stored choice is kept for a new Roster; other values open', () => {
    const store = memory();
    const first = mount(campGame(people(3), [person(4)]), store);
    first.roster.open('recruit-1');
    first.key('fold:bench').click();
    first.key('fold:details').click();
    const second = mount(campGame(people(3), [person(4)]), store);
    // No survivor asked for, so the kept choice stands.
    second.roster.open();
    expect(state(second, second.key('fold:bench')).shown).toBe(false);
    expect(state(second, second.key('fold:details')).shown).toBe(false);
    const odd = mount(
      campGame(people(3), [person(4)]),
      memory({ [ROSTER_FOLD_KEYS.bench]: 'true' }),
    );
    odd.roster.open('recruit-1');
    expect(state(odd, odd.key('fold:bench')).shown).toBe(true);
  });

  it('with no storage the folds still work for this visit', () => {
    const m = mount(campGame(people(3), [person(4)]), null);
    m.roster.open('recruit-1');
    m.key('fold:details').click();
    expect(state(m, m.key('fold:details')).shown).toBe(false);
  });

  it('a card click or open(id) shows Details again without changing the kept choice', () => {
    const store = memory({ [ROSTER_FOLD_KEYS.details]: '1' });
    const m = mount(campGame(people(3), [person(4)]), store);
    // The bare Roster button keeps the kept choice.
    m.roster.open();
    expect(state(m, m.key('fold:details')).shown).toBe(false);
    m.key('tab:recruit-2').click();
    expect(state(m, m.key('fold:details')).shown).toBe(true);
    expect(store.sets).toEqual([]);
    expect(store.data.get(ROSTER_FOLD_KEYS.details)).toBe('1');
    // The header toggle is what writes it.
    m.key('fold:details').click();
    expect(store.sets).toEqual([[ROSTER_FOLD_KEYS.details, '1']]);
    // open(id) on a closed Details.
    const n = mount(campGame(people(3), [person(4)]), memory({ [ROSTER_FOLD_KEYS.details]: '1' }));
    n.roster.open('recruit-3');
    expect(state(n, n.key('fold:details')).shown).toBe(true);
    expect(n.storage!.sets).toEqual([]);
    expect(n.q('.rv-who-name').textContent).toBe(recruit(3).name);
  });

  it('folding Details drops an open gun picker, so Esc closes the dialog and a reopen shows stats', () => {
    const m = mount(campGame(people(3), [person(4)]));
    m.roster.open('recruit-1');
    m.key('slot').click();
    expect(m.scrim.querySelector('.rv-panel')!.textContent).toContain('Choose a gun');
    m.key('fold:details').click();
    m.key('fold:details').click();
    expect(m.scrim.querySelector('.rv-panel')!.textContent).not.toContain('Choose a gun');
    // Picker open again, folded, then Esc: nothing invisible to step back from.
    m.key('slot').click();
    m.key('fold:details').click();
    m.key('fold:details').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(m.roster.isOpen()).toBe(false);
  });

  it('the survivor row and the panel live in the Details region', () => {
    const m = mount(campGame(people(3)));
    m.roster.open('recruit-1');
    const body = m.q('#rv-fold-details');
    expect(body.querySelector('.rv-top')).not.toBeNull();
    expect(body.querySelector('.rv-panel')).not.toBeNull();
  });

  it('a hostile name stays text in the box', () => {
    const evil = person(4, { name: '<img src=x onerror=alert(1)>' });
    const m = mount(campGame(people(3), [evil]));
    m.roster.open('recruit-4');
    expect(m.scrim.querySelector('.rv-box img[onerror]')).toBeNull();
    expect(m.q('.rv-who-name').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('the squad keeps its raised look by what is not hidden (ID-256)', () => {
  // page.css raises the squad's tabs while a `.rv-bench` list is not [hidden]; folds never set it.
  it.each([
    ['bench only', () => out([person(4)]), true],
    ['patrol only', () => out([person(4)], ['recruit-4']), true],
    ['bench and patrol', () => out([person(4), person(5)], ['recruit-5']), true],
    ['neither', () => campGame(people(3)), false],
  ] as const)('%s: raised %s regardless of the folds', (_n, game, raised) => {
    const m = mount(game());
    m.roster.open('recruit-1');
    const lists = () => m.scrim.querySelector('.rv-bench:not([hidden])') !== null;
    expect(lists()).toBe(raised);
    for (const k of ['fold:bench', 'fold:patrol:1']) {
      m.scrim.querySelector<HTMLElement>(`[data-key="${k}"]`)?.click();
    }
    expect(lists()).toBe(raised);
  });
});

describe('the patrol folds (ID-256)', () => {
  const two = () => out(people(2, 4), ['recruit-4'], ['recruit-5']);

  it('each block folds alone; the head keeps a fixed label; focus stays', () => {
    const m = mount(two());
    m.roster.open('recruit-1');
    const heads = [...m.scrim.querySelectorAll<HTMLButtonElement>('.rv-patrol-head')];
    expect(heads).toHaveLength(2);
    const label = heads[0]!.getAttribute('aria-label');
    expect(label).toMatch(/\S/);
    const key = heads[0]!.dataset.key!;
    heads[0]!.focus();
    heads[0]!.click();
    expect(state(m, m.key(key))).toEqual({ expanded: 'false', shown: false });
    expect(document.activeElement).toBe(m.key(key));
    const other = m.scrim.querySelectorAll<HTMLButtonElement>('.rv-patrol-head')[1]!;
    expect(state(m, other)).toEqual({ expanded: 'true', shown: true });
    // Nothing kept for a patrol.
    expect(m.storage!.sets).toEqual([]);
    // Refresh and tick keep it, and the countdown never changes the accessible name.
    m.roster.refresh();
    m.roster.tick(NOW + 61_000);
    expect(state(m, m.key(key))).toEqual({ expanded: 'false', shown: false });
    expect(m.key(key).getAttribute('aria-label')).toBe(label);
  });

  it('a patrol that is gone forgets its fold', () => {
    const m = mount(two());
    m.roster.open('recruit-1');
    m.key('fold:patrol:1').click();
    const withPatrols = two();
    m.setGame(campGame(people(3), people(2, 4)));
    m.roster.refresh();
    expect(m.scrim.querySelector('.rv-patrol-head')).toBeNull();
    m.setGame(withPatrols);
    m.roster.refresh();
    expect(state(m, m.key('fold:patrol:1'))).toEqual({ expanded: 'true', shown: true });
  });

  it('the patrol label is a plain title, not a toggle', () => {
    const m = mount(two());
    m.roster.open('recruit-1');
    expect(m.q('.rv-box-patrol > .rv-tabs-label').tagName).toBe('P');
  });
});
