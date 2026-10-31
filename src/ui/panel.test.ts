// @vitest-environment jsdom
// Design §5, as built ID-021: the build panel opens the perk loadout and the roster in
// its place; Equip and Unequip hand the new game on; Back returns focus to the opener.
// ID-059: Build and Camp tabs, the start pick in a fixed footer, locked research collapsed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSegment, type Base } from '../core/base.ts';
import { RESEARCH_IDS, stockOf } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { sendPatrol } from '../core/patrol.ts';
import { createBuildPanel, PANEL_SPACE } from './build.ts';

/** A panel showing `game`; every game handed on is kept in `games` and shown again. */
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
  // Roster and Perks open from the Camp tab (ID-059).
  root.querySelector<HTMLButtonElement>('#build-tab-camp')!.click();
  const button = (label: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith(label),
    );
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };
  // A view's title, or the selected tab's name when the tabs show.
  const title = (): string | null | undefined =>
    (root.querySelector('.build-title') ?? root.querySelector('[aria-selected="true"]'))
      ?.textContent;
  return { panel, games, button, title };
}

describe('the research queue in the build panel (ID-035)', () => {
  afterEach(() => vi.useRealTimers());

  it('queues at the click time, and a Cancel the clock has overtaken says why and hands on nothing', () => {
    const T = Date.UTC(2026, 9, 31, 12, 0);
    vi.useFakeTimers();
    vi.setSystemTime(T);
    const g: GameState = { ...newGame(), lab: 1, stock: stockOf({ genes: 50 }) };
    const { button, games } = panelFor(g);
    // Research is on the Build tab (ID-059).
    document.querySelector<HTMLButtonElement>('#build-tab-build')!.click();
    vi.setSystemTime(T + 60_000);
    button('Queue Metal walls').click();
    expect(games).toHaveLength(1);
    expect(games[0]!.queue).toEqual({ ids: ['metal-walls'], endsAt: T + 16 * 60_000 });
    // The node finishes before Cancel is clicked: refused in place, not refunded.
    vi.setSystemTime(T + 60 * 60_000);
    const cancel = button('Cancel Metal walls');
    cancel.click();
    expect(games).toHaveLength(1);
    expect(cancel.textContent).toContain('Not in the queue');
    expect(cancel.title).toBe('Not in the queue');
  });
});

describe('perk loadout in the build panel', () => {
  it('Perks opens the loadout with Back focused; Back returns focus to Perks', () => {
    const { button, title } = panelFor(newGame());
    button('Perks').click();
    expect(title()).toBe('Perks');
    expect(document.activeElement?.textContent).toBe('Back');
    button('Back').click();
    expect(title()).toBe('Camp');
    expect(document.activeElement?.textContent).toBe('Perks');
  });

  it('Back from the roster still returns focus to Roster', () => {
    const { button, title } = panelFor(newGame());
    button('Roster').click();
    expect(title()).toBe('Roster');
    button('Back').click();
    expect(document.activeElement?.textContent).toBe('Roster');
  });

  it('Unequip, then Equip, hand on each new game and redraw the loadout', () => {
    const { button, games, title } = panelFor(newGame());
    button('Perks').click();
    button('Unequip Steady Fire').click();
    expect(games.at(-1)!.perks).toEqual([]);
    expect(title()).toBe('Perks');
    button('Equip Steady Fire').click();
    expect(games.at(-1)!.perks).toEqual(['steady-fire']);
    expect(games).toHaveLength(2);
  });

  it('a refused Equip is disabled with the reason and hands on nothing', () => {
    const g = { ...newGame(), research: ['fortify' as const] };
    g.perkLevels.fortify = 1; // researched perks are owned
    const { button, games } = panelFor(g);
    button('Perks').click();
    const equip = button('Equip Fortify');
    expect(equip.disabled).toBe(true);
    expect(equip.textContent).toContain('All perk slots are full');
    equip.click();
    expect(games).toEqual([]);
  });

  it('hiding the panel (a horde starts) closes the loadout', () => {
    const { panel, button, title } = panelFor(newGame());
    button('Perks').click();
    panel.hide();
    panel.show(newGame(), null);
    expect(title()).toBe('Build');
  });
});

describe('gates in the build menu (ID-026)', () => {
  /** The panel on `game` with slot `column`, `row` picked; each build is kept in `built`. */
  function slotPanel(game: GameState, column: number, row: number) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const built: Base[] = [];
    const panel = createBuildPanel(
      root,
      (base) => built.push(base),
      () => {},
      () => {},
    );
    panel.show(game, { column, row, what: 'segment' });
    const button = (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
    return { built, button };
  }

  it('builds a gate on an empty slot of a new layer', () => {
    const { built, button } = slotPanel(newGame(), 1, 2);
    const gate = button('Wood gate')!;
    expect(gate.disabled).toBe(false);
    gate.click();
    expect(built[0]!.layers.find((l) => l.column === 1)!.slots[2]!.kind).toBe('gate');
    // Locked tiers say so, as walls do, with the kit's lock badge (ID-056).
    expect(button('Metal gate')!.disabled).toBe(true);
    expect(button('Metal gate')!.classList.contains('btn-locked')).toBe(true);
    expect(button('Metal gate')!.querySelector('.btn-lock')).not.toBeNull();
  });

  it('shows an option the stock can’t pay for as unaffordable, its cost in red (ID-056)', () => {
    const { button } = slotPanel({ ...newGame(), stock: stockOf() }, 1, 2);
    const gate = button('Wood gate')!;
    expect(gate.disabled).toBe(true);
    expect(gate.classList.contains('btn-unaffordable')).toBe(true);
    expect(gate.querySelector('.btn-lock')).toBeNull();
    // Only what the stock can't pay turns red; the reason moves to the tooltip.
    const cost = gate.querySelector('.btn-cost')!;
    expect([...cost.querySelectorAll('.btn-cost-short')].map((n) => n.textContent)).toEqual(
      [...cost.querySelectorAll('span')].map((n) => n.textContent),
    );
    expect(gate.querySelector('.btn-reason')).toBeNull();
    expect(gate.title).toMatch(/^Not enough /);
  });

  it('offers no gate on a layer that has one', () => {
    const g = newGame();
    const r = buildSegment(g.base, g.stock, g.tiers, 1, 0, 'gate', 'wood');
    if (!r.ok) throw new Error(r.reason);
    const { button } = slotPanel({ ...g, base: r.base, stock: r.stock }, 1, 1);
    expect(button('Wood gate')).toBeUndefined();
    expect(button('Wood wall')!.disabled).toBe(false);
  });
});

describe('Build and Camp tabs, the start footer (ID-059)', () => {
  /** A panel on its Build tab; `starts` keeps each Start Horde pick. */
  function tabbed(game: GameState) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const starts: [string, number][] = [];
    const panel = createBuildPanel(
      root,
      () => {},
      (d, p) => starts.push([d, p]),
      (next) => panel.show(next, null),
    );
    panel.show(game, null);
    const tab = (id: 'build' | 'camp') =>
      root.querySelector<HTMLButtonElement>(`#build-tab-${id}`)!;
    const body = () => root.querySelector<HTMLElement>('.build-body')!;
    const foot = () => root.querySelector<HTMLElement>('.build-foot')!;
    const labels = (node: HTMLElement) =>
      [...node.querySelectorAll('button')].map((b) => b.textContent);
    return { root, panel, starts, tab, body, foot, labels };
  }

  it('keeps the pickers and Start Horde in the footer on both tabs, Start Horde primary', () => {
    const { tab, body, foot, starts } = tabbed(newGame());
    for (const id of ['build', 'camp'] as const) {
      tab(id).click();
      const fields = [...foot().querySelectorAll('label')].map((l) => l.firstChild?.textContent);
      expect(fields).toEqual(['Start defender', 'Start post']);
      // Start Horde is the footer's last control, so a note never pushes it.
      expect(foot().lastElementChild!.classList.contains('build-start')).toBe(true);
      expect(body().querySelector('select')).toBeNull();
      const go = foot().querySelector<HTMLButtonElement>('.build-start')!;
      expect(go.textContent).toBe('Start Horde 1');
      expect(go.classList.contains('btn-primary')).toBe(true);
    }
    foot().querySelector<HTMLButtonElement>('.build-start')!.click();
    expect(starts).toHaveLength(1);
  });

  it('puts repair, the Lab and power on Build; Roster, Perks and the map on Camp', () => {
    const { tab, body, labels } = tabbed(newGame());
    expect(tab('build').getAttribute('aria-selected')).toBe('true');
    expect(body().getAttribute('role')).toBe('tabpanel');
    expect(body().getAttribute('aria-labelledby')).toBe('build-tab-build');
    expect(labels(body()).some((l) => l?.startsWith('Repair all'))).toBe(true);
    expect(labels(body()).some((l) => l?.startsWith('Build Research Lab'))).toBe(true);
    expect(labels(body()).some((l) => l?.startsWith('Build generator'))).toBe(true);
    expect(labels(body()).some((l) => l?.startsWith('Roster'))).toBe(false);
    tab('camp').click();
    expect(tab('camp').getAttribute('aria-selected')).toBe('true');
    expect(tab('build').tabIndex).toBe(-1);
    expect(document.activeElement).toBe(tab('camp'));
    expect(labels(body()).map((l) => l?.split('Patrols')[0])).toEqual([
      'Roster',
      'Perks',
      'World map',
    ]);
    // No Workbench entry until the camp has one (ID-034).
    expect(body().textContent).not.toContain('Workbench');
    expect(body().textContent).toContain('Everyone is in camp.');
  });

  it('moves between the tabs with the arrow keys, Home and End', () => {
    const { tab } = tabbed(newGame());
    const key = (k: string) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }),
      );
    tab('build').focus();
    key('ArrowRight');
    expect(document.activeElement).toBe(tab('camp'));
    key('ArrowRight');
    expect(document.activeElement).toBe(tab('build'));
    key('End');
    expect(tab('camp').getAttribute('aria-selected')).toBe('true');
    key('Home');
    expect(tab('build').getAttribute('aria-selected')).toBe('true');
  });

  it('lists who is injured on the Camp tab; the footer says when nobody can go', () => {
    const g = newGame();
    const later = Date.now() + 3_600_000;
    const roster = g.roster.map((d) => ({ ...d, injuredUntil: later }));
    const { tab, body, foot } = tabbed({ ...g, roster });
    expect(foot().textContent).toContain('Nobody can defend until someone is back.');
    expect(foot().querySelector<HTMLButtonElement>('.build-start')!.disabled).toBe(true);
    tab('camp').click();
    const away = [...body().querySelectorAll('.build-slot-note')].map((n) => n.textContent);
    expect(away).toHaveLength(roster.length);
    expect(away.every((t) => t?.includes('injured, back at'))).toBe(true);
  });

  it('a slot clicked on the field opens its menu on the Build tab', () => {
    const { panel, tab, body } = tabbed(newGame());
    tab('camp').click();
    panel.show(newGame(), { column: 1, row: 2, what: 'segment' });
    expect(tab('build').getAttribute('aria-selected')).toBe('true');
    expect(body().textContent).toContain('Wood wall');
    // Redraws with the same slot (a build) leave the tab the player picked.
    const same = { column: 1, row: 2, what: 'segment' as const };
    panel.show(newGame(), same);
    tab('camp').click();
    panel.show(newGame(), same);
    expect(tab('camp').getAttribute('aria-selected')).toBe('true');
  });

  it('collapses the locked research into one row that expands, and keeps it across redraws', () => {
    const { root, panel, body } = tabbed(newGame());
    const more = () => root.querySelector<HTMLButtonElement>('.build-more')!;
    // No count before the Lab: nothing can be researched yet.
    expect([...body().querySelectorAll('h3')].map((h) => h.textContent)).toContain('Research');
    expect(more().textContent).toBe(`${RESEARCH_IDS.length} more after the Research Lab`);
    expect(more().getAttribute('aria-expanded')).toBe('false');
    expect(body().textContent).not.toContain('Research Metal walls');
    more().focus();
    more().click();
    expect(more().getAttribute('aria-expanded')).toBe('true');
    expect(more().textContent).toBe(`Hide ${RESEARCH_IDS.length} locked`);
    expect(body().querySelectorAll('.build-lab .btn-locked')).toHaveLength(RESEARCH_IDS.length);
    expect(document.activeElement).toBe(more());
    panel.show(newGame(), null);
    expect(body().querySelectorAll('.build-lab .btn-locked')).toHaveLength(RESEARCH_IDS.length);
    more().click();
    expect(body().querySelectorAll('.build-lab .btn-locked')).toHaveLength(0);
    // A new visit (after a horde) starts collapsed again, on the Build tab.
    more().click();
    panel.hide();
    panel.show(newGame(), null);
    expect(more().getAttribute('aria-expanded')).toBe('false');
  });

  it('counts who is away on the Camp tab and puts footer notes above the pickers', () => {
    const g = newGame();
    const later = Date.now() + 3_600_000;
    const roster = g.roster.map((d, i) => (i === 0 ? { ...d, injuredUntil: later } : d));
    const { tab, foot, panel } = tabbed({ ...g, roster });
    expect(tab('camp').textContent).toBe('Camp · 1 away');
    panel.notice('A recruit is back');
    panel.show({ ...g, roster }, null);
    expect(foot().firstElementChild!.textContent).toBe('A recruit is back');
    panel.show(g, null);
    expect(tab('camp').textContent).toBe('Camp');
  });

  it('keeps the body scrolled across a redraw of the same tab, and starts a new tab at the top', () => {
    const { panel, tab, body } = tabbed(newGame());
    body().scrollTop = 120;
    panel.show(newGame(), null);
    expect(body().scrollTop).toBe(120);
    tab('camp').click();
    expect(body().scrollTop).toBe(0);
  });

  it('scrolls back to the top when a new slot is clicked, where its menu is', () => {
    const { panel, body } = tabbed(newGame());
    const slot = { column: 1, row: 2, what: 'segment' as const };
    body().scrollTop = 300;
    panel.show(newGame(), slot);
    expect(body().scrollTop).toBe(0);
    // A redraw of the same slot (a build) keeps where the player scrolled.
    body().scrollTop = 80;
    panel.show(newGame(), slot);
    expect(body().scrollTop).toBe(80);
  });

  it('keeps focus on a footer control when the body above it changes size', () => {
    const { root, panel, foot } = tabbed(newGame());
    const select = () => foot().querySelector('select')!;
    select().focus();
    // Expanding the locked research adds a control per node above the footer.
    root.querySelector<HTMLButtonElement>('.build-more')!.click();
    expect(document.activeElement).toBe(select());
    panel.show(newGame(), null);
    expect(document.activeElement).toBe(select());
  });

  it('starts a horde from the footer while a Camp view is open', () => {
    const { root, foot, starts } = tabbed(newGame());
    root.querySelector<HTMLButtonElement>('#build-tab-camp')!.click();
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Perks')!.click();
    expect(root.querySelector('.build-title')!.textContent).toBe('Perks');
    foot().querySelector<HTMLButtonElement>('.build-start')!.click();
    expect(starts).toHaveLength(1);
  });

  it('leaves modified arrow keys (Alt+Left is Back) to the browser', () => {
    const { tab } = tabbed(newGame());
    tab('build').focus();
    const e = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    tab('build').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(tab('build').getAttribute('aria-selected')).toBe('true');
  });

  it('renders every text as text, never as HTML', () => {
    const g = newGame();
    const roster = g.roster.map((d, i) =>
      i === 0
        ? { ...d, name: '<img src=x onerror=alert(1)>', injuredUntil: Date.now() + 60_000 }
        : d,
    );
    const { root, tab } = tabbed({ ...g, roster });
    tab('camp').click();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)> · injured');
  });

  it('renders a hostile name in the footer picker as text', () => {
    const g = newGame();
    const hostile = '<img src=x onerror=alert(1)>';
    const roster = g.roster.map((d, i) => (i === 0 ? { ...d, name: hostile } : d));
    const { root, foot } = tabbed({ ...g, roster });
    expect(root.querySelector('img')).toBeNull();
    expect(foot().querySelector('option')!.textContent).toContain(hostile);
  });

  it('renders a hostile name on patrol as text on the Camp tab', () => {
    const g = { ...newGame(), hordeNumber: 3 };
    const hostile = '<img src=x onerror=alert(1)>';
    const named = { ...g, roster: g.roster.map((d, i) => (i === 0 ? { ...d, name: hostile } : d)) };
    const out = sendPatrol(named, 'gas-station', [named.roster[0]!.id], 1, Date.now());
    if (!out.ok) throw new Error(out.reason);
    const { root, tab } = tabbed(out.game);
    tab('camp').click();
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(`${hostile} · on patrol, back at`);
  });
});

describe('a building’s plot opens its part of the panel (ID-065)', () => {
  it('the Lab and the Generator open the Build tab at their section; a hut opens the roster', () => {
    const { panel, title, button } = panelFor(newGame());
    expect(title()).toBe('Camp');
    panel.reveal(newGame(), 'lab');
    expect(title()).toBe('Build');
    expect(document.querySelector('.build-lab')?.textContent).toContain('Research Lab');
    panel.reveal(newGame(), 'power');
    expect(title()).toBe('Build');
    expect(document.querySelector('.build-power')?.textContent).toContain('Generator');
    panel.reveal(newGame(), 'camp');
    expect(title()).toBe('Roster');
    expect(document.body.textContent).toContain('Expand the camp');
    // Back from the roster goes to the Camp tab, as from its own button.
    button('Back').click();
    expect(title()).toBe('Camp');
  });

  it('measures the room left of the panel, or counts its CSS width where nothing is laid out', () => {
    const { panel } = panelFor(newGame());
    expect(panel.room({ w: 1280 })).toBe(1280 - PANEL_SPACE);
    panel.hide();
    expect(panel.room({ w: 1440 })).toBe(1440 - PANEL_SPACE);
  });
});
