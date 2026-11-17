// @vitest-environment jsdom
// A win's result at a glance (ID-186): chips for the numbers and what happened, the
// sentences and the long lines behind "Details", and nothing the old screen said lost.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { RADIO_HORDES } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { squadResult, startSquadHorde } from '../core/hordeonly.ts';
import {
  autoChipText,
  campChipText,
  createHud,
  DETAILS,
  HIDE_DETAILS,
  squadScreen,
  squadStart,
  xpChipText,
  type ResultScreen,
} from './hud.ts';
import { REFUSE_NOTE, type JoinCard } from './joining.ts';
import { avatarOf } from './sprites.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function squadGame(n: number, horde = 1, xp = 0): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i): RosterDefender => ({ ...recruit(i + 1), xp })),
    camp: { ...g.camp, recruits: n },
  };
}
const ended = (g: GameState, outcome: 'won' | 'lost', seed = 1) => ({
  ...startSquadHorde(g, seed, NOW),
  outcome,
});

function hud() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  return { root, h };
}

/** A boss horde's first clear with a drop: its card unlock's chip and sentence, and a tile. */
function bossWin(): { g: GameState; screen: ResultScreen } {
  const g = squadGame(3, RADIO_HORDES[0]!);
  for (let seed = 1; seed < 200; seed++) {
    const screen = squadScreen(g, ended(g, 'won', seed));
    if (screen.debrief!.drop) return { g, screen };
  }
  throw new Error('no seed with a drop');
}

const ava = (): JoinCard => ({
  id: 'j1',
  name: 'Ava',
  profession: 'Hunter',
  sub: 'Lv 1 · Hunter · Pistol',
  job: 'Hunter: crit',
});

const toggles = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>('[data-details-toggle]'),
];

describe("a win's chips (ID-186)", () => {
  it('the XP chip: each, one survivor alone, a range when they differ, none with nobody', () => {
    expect(xpChipText([{ xp: 126 }, { xp: 126 }])).toBe('+126 XP each');
    expect(xpChipText([{ xp: 126 }])).toBe('+126 XP');
    expect(xpChipText([{ xp: 126 }, { xp: 98 }, { xp: 1500 }])).toBe('+98–1,500 XP');
    expect(xpChipText([])).toBeNull();
  });

  it('the Auto chip counts who moved; the camp chip says full or nobody new', () => {
    expect(autoChipText({ in: ['Ava', 'Bob'], out: ['Cy'] })).toBe('Auto: 2 in · 1 out');
    expect(autoChipText({ in: ['Ava'], out: [] })).toBe('Auto: 1 in');
    expect(campChipText('camp-full', 12)).toBe('Camp 12 · full');
    expect(campChipText('nobody-first', 6)).toBe('Camp 6 · nobody new');
    expect(campChipText('nobody-replay', 7)).toBe('Camp 7 · nobody new');
  });

  it('a win has the XP as a chip, no paragraph, and a details chip for each sentence', () => {
    const { g, screen } = bossWin();
    const d = screen.debrief!;
    const gains = squadResult(g, ended(g, 'won')).gains;
    expect(d.chips.map((c) => c.text)).toContain(xpChipText(gains));
    expect(d.note).toBeNull();
    // The boss reward: its sentence waits in the details, its chip opens them. The chip
    // names the card it unlocked and says nothing of the radio (ID-196).
    expect(d.notes![0]).toMatch(/^Boss horde beaten\. New card unlocked: /);
    const card = d.chips.find((c) => c.text.startsWith('New card: '))!;
    expect(card.details).toBe(true);
    expect(d.chips.map((c) => c.text).join(' ')).not.toMatch(/radio/i);
    // The plain numbers are not buttons: they have nothing more to say.
    for (const c of d.chips.filter((x) => /waves|Scrap|XP/.test(x.text))) {
      expect(c.details).toBeUndefined();
    }
    // Every sentence is still in the screen's lines, as before.
    for (const n of d.notes!) expect(screen.lines).toContain(n);
  });

  it('nobody asking: the camp chip says so, and opens the details where the last sentence says why', () => {
    const g = squadGame(6, 5);
    const h = ended(g, 'won');
    const { noJoin } = squadResult(g, h);
    const d = squadScreen(g, h).debrief!;
    const camp = d.chips.find((c) => c.text.startsWith('Camp '));
    if (noJoin === null) expect(camp).toBeUndefined();
    else {
      expect(camp).toEqual({ text: campChipText(noJoin, 6), tone: 'ok', details: true });
      expect(d.join).toBe(true);
      expect(d.notes!.at(-1)).toMatch(/^Nobody new|^Camp is full|[Nn]obody/);
    }
  });

  it('a loss and the start screen keep their line and have no details', () => {
    const g = squadGame(3, 4);
    for (const s of [squadScreen(g, ended(g, 'lost')), squadStart(g)]) {
      expect(s.debrief!.note).not.toBeNull();
      expect(s.debrief!.notes).toBeUndefined();
      expect(s.debrief!.chips.some((c) => c.details)).toBe(false);
    }
  });
});

describe("a win's details on the page (ID-186)", () => {
  it('closed at first: the sentences hidden, every toggle says so', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    h.showResult(screen);
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    const notes = root.querySelector<HTMLElement>('.debrief-notes')!;
    expect(panel.dataset.details).toBeUndefined();
    expect(notes.hidden).toBe(true);
    expect([...notes.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      screen.debrief!.notes,
    );
    // The "Details" button and the new card's chip, both real buttons naming the region.
    const all = toggles(root);
    expect(all.map((b) => b.textContent)).toEqual(
      expect.arrayContaining([DETAILS, expect.stringContaining('New card: ')]),
    );
    for (const b of all) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(b.getAttribute('aria-controls')).toBe(notes.id);
    }
  });

  it('"Details" opens them, a chip closes them again, and each button follows', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    const notes = root.querySelector<HTMLElement>('.debrief-notes')!;
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    expect(panel.dataset.details).toBe('');
    expect(notes.hidden).toBe(false);
    for (const b of toggles(root)) expect(b.getAttribute('aria-expanded')).toBe('true');
    // Its words say the state too, not only its caret and colour.
    expect(root.querySelector('.debrief-details')!.textContent).toBe(HIDE_DETAILS);
    root.querySelector<HTMLButtonElement>('.chip-details')!.click();
    expect(panel.dataset.details).toBeUndefined();
    expect(notes.hidden).toBe(true);
    expect(root.querySelector('.debrief-details')!.textContent).toBe(DETAILS);
    for (const b of toggles(root)) expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('open, they stay open while the screen redraws its camp tile and cards', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    h.showResult(screen);
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    const open = (): void => {
      expect(panel.dataset.details).toBe('');
      expect(root.querySelector<HTMLElement>('.debrief-notes')!.hidden).toBe(false);
      for (const b of toggles(root)) expect(b.getAttribute('aria-expanded')).toBe('true');
    };
    // Someone asks, is answered, and joins the squad: only a new screen closes them.
    h.showJoin([ava()]);
    open();
    h.noteJoin('Ava joined the squad');
    h.showJoin([], true);
    open();
    h.showJoined({ id: 'j1', name: 'Ava', level: 1, art: avatarOf(recruit(1)), levelUp: false });
    open();
    h.showSquad(new Set(['j1']));
    open();
  });

  it('the next screen starts closed, and one with no details has no toggle', () => {
    const { root, h } = hud();
    const { g, screen } = bossWin();
    h.showResult(screen);
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    h.showResult(screen);
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    expect(panel.dataset.details).toBeUndefined();
    expect(root.querySelector<HTMLElement>('.debrief-notes')!.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    for (const s of [squadScreen(g, ended(g, 'lost')), squadStart(g)]) {
      h.showResult(s);
      expect(panel.dataset.details).toBeUndefined();
      expect(toggles(root)).toEqual([]);
      expect(root.querySelector('.debrief-notes')).toBeNull();
    }
  });

  it('a sentence is text, never markup', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    const hostile = '<img src=x onerror=alert(1)>';
    h.showResult({ ...screen, debrief: { ...screen.debrief!, notes: [hostile] } });
    const notes = root.querySelector<HTMLElement>('.debrief-notes')!;
    expect(notes.querySelector('li')!.textContent).toBe(hostile);
    expect(notes.querySelector('img')).toBeNull();
  });
});

describe("a win's weapons, cards and offer, short (ID-186, ID-196)", () => {
  it('the drop: a chip per gun with level, name and DPS; the sentences wait in its details', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    const t = screen.debrief!.drop!;
    h.showResult(screen);
    const chips = [...root.querySelectorAll<HTMLElement>('.gun-chip')];
    expect(chips).toHaveLength(t.guns.length);
    const g = t.guns[0]!;
    expect(chips[0]!.querySelector('.gun-chip-name')!.textContent).toBe(g.short);
    expect(chips[0]!.querySelector('.gun-chip-power')!.textContent).toBe(
      g.lost ? 'Thrown away' : g.power,
    );
    // The role, affixes and stash count are not in sight until a chip is opened.
    const details = root.querySelector<HTMLElement>('#hud-gun-details')!;
    expect(details.hidden).toBe(true);
    chips[0]!.click();
    expect(details.hidden).toBe(false);
    expect([...details.querySelectorAll('p')].map((p) => p.textContent)).toEqual(
      expect.arrayContaining([g.short, ...g.lines, t.stash]),
    );
  });

  it('a boss first clear says nothing of the radio anywhere, details open or not (ID-196)', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    expect(panel.textContent).not.toMatch(/radio/i);
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    root.querySelector<HTMLButtonElement>('.gun-chip')!.click();
    expect(root.querySelector<HTMLElement>('.debrief-notes')!.hidden).toBe(false);
    expect(panel.textContent).not.toMatch(/radio/i);
    expect(panel.textContent).toContain('Boss horde beaten.');
  });

  it('a level-up card is an avatar, a name and a triangle, and nothing else (ID-196)', () => {
    const { root, h } = hud();
    const g = squadGame(2, 3, 0);
    const screen = squadScreen(g, ended(g, 'won'));
    const c = screen.debrief!.cards[0]!;
    expect(c.levelUp).toBe(true);
    h.showResult(screen);
    const card = root.querySelector<HTMLElement>('.squad-card')!;
    const up = card.querySelector<HTMLElement>('.squad-up')!;
    expect(up.textContent).toBe('▲');
    expect(up.getAttribute('role')).toBe('img');
    expect(up.getAttribute('aria-label')).toBe('Level up');
    expect(up.title).toBe('Level up');
    expect(card.querySelector('.squad-badge-up')).toBeNull();
    expect(
      card.querySelector<HTMLImageElement>('.squad-card-avatar > .roster-avatar-img')!.alt,
    ).toBe('');
    const name = card.querySelector<HTMLButtonElement>('button.squad-card-name')!;
    expect(name.textContent).toBe(c.name);
    expect(name.getAttribute('aria-label')).toBe(`${c.name}, level ${c.level}: open survivor card`);
    expect(card.querySelector('select, .xp-track, .xp-fill')).toBeNull();
    expect(card.textContent).toBe(`${c.name}▲`);
  });

  it('asking to join: one line per asker, the name and profession, then both answers', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    h.showJoin([
      {
        id: 'j1',
        name: 'Ava',
        profession: 'Paramedic',
        sub: 'Lv 3 · Paramedic · Pistol',
        job: 'Paramedic: patches up',
      },
      {
        id: 'j2',
        name: 'Bo',
        profession: 'Hunter',
        sub: 'Lv 1 · Hunter · Pistol',
        job: 'Hunter: +10% crit chance',
      },
    ]);
    const box = root.querySelector<HTMLElement>('.debrief-join')!;
    expect(box.hidden).toBe(false);
    const rows = [...box.querySelectorAll<HTMLElement>('.join-row')];
    expect(rows.map((r) => r.dataset.joiner)).toEqual(['j1', 'j2']);
    expect(rows.map((r) => r.querySelector('.join-who')!.textContent)).toEqual([
      'Ava · Paramedic asks to join',
      'Bo · Hunter asks to join',
    ]);
    expect(rows.map((r) => r.querySelector<HTMLElement>('.join-who')!.title)).toEqual([
      'Lv 3 · Paramedic · Pistol. Paramedic: patches up',
      'Lv 1 · Hunter · Pistol. Hunter: +10% crit chance',
    ]);
    for (const r of rows) {
      expect([...r.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        'Accept',
        'Refuse',
      ]);
    }
    const buttons = [...rows[0]!.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.title)).toEqual(['Paramedic: patches up', REFUSE_NOTE]);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Accept Ava', 'Refuse Ava']);
  });

  it('a hostile survivor name stays plain text in the line, its title and the buttons (ID-196)', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    const evil = '<img src=x onerror=alert(1)>';
    h.showJoin([{ ...ava(), name: evil, sub: evil }]);
    const row = root.querySelector<HTMLElement>('.join-row')!;
    const who = row.querySelector<HTMLElement>('.join-who')!;
    expect(who.querySelector('.join-name')!.textContent).toBe(evil);
    expect(who.textContent).toBe(`${evil} · Hunter asks to join`);
    expect(who.title).toBe(`${evil}. Hunter: crit`);
    expect(row.querySelector('img')).toBeNull();
    // The line, the name in it and the two buttons: no element comes from the name.
    expect(row.querySelectorAll('*')).toHaveLength(4);
    expect([...row.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      `Accept ${evil}`,
      `Refuse ${evil}`,
    ]);
  });

  it('an answer given stays as a line; with nobody asking and no answer the box is hidden', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    const box = root.querySelector<HTMLElement>('.debrief-join')!;
    h.showJoin([]);
    expect(box.hidden).toBe(true);
    h.showJoin([ava()]);
    expect(box.hidden).toBe(false);
    h.noteJoin('Ava joined the squad');
    h.showJoin([], true);
    expect(box.hidden).toBe(false);
    expect(box.querySelector('.join-row')).toBeNull();
    expect([...box.querySelectorAll('.join-answer')].map((p) => p.textContent)).toEqual([
      'Ava joined the squad',
    ]);
    // A new screen forgets the answers and hides the box again.
    h.showResult(bossWin().screen);
    h.showJoin([]);
    expect(root.querySelector<HTMLElement>('.debrief-join')!.hidden).toBe(true);
  });
});

describe('the join pill in the header (ID-196)', () => {
  const pill = (root: HTMLElement): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>('.debrief-chips .chip-join');

  it('shows while someone asks: warn tone, before Details, and the count in its words', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    expect(pill(root)).toBeNull();
    h.showJoin([ava()]);
    const chip = pill(root)!;
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.type).toBe('button');
    expect(chip.classList.contains('chip')).toBe(true);
    expect(chip.classList.contains('chip-toggle')).toBe(true);
    expect(chip.dataset.tone).toBe('warn');
    expect(chip.textContent).toBe('Asks to join');
    // "Details" stays last.
    expect(chip.nextElementSibling).toBe(root.querySelector('.debrief-details'));
    expect(root.querySelector('.debrief-chips')!.lastElementChild).toBe(
      root.querySelector('.debrief-details'),
    );
    h.showJoin([ava(), { ...ava(), id: 'j2', name: 'Bo' }]);
    expect(root.querySelectorAll('.chip-join')).toHaveLength(1);
    expect(pill(root)!.textContent).toBe('2 ask to join');
  });

  it('goes once nobody asks, and a new screen starts without it', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    h.showResult(screen);
    h.showJoin([ava()]);
    expect(pill(root)).not.toBeNull();
    h.showJoin([], true);
    expect(pill(root)).toBeNull();
    h.showJoin([ava()]);
    h.showResult(screen);
    expect(pill(root)).toBeNull();
  });

  it('is absent when the join box is not in the panel (a loss)', () => {
    const { root, h } = hud();
    const g = squadGame(3, 4);
    h.showResult(squadScreen(g, ended(g, 'lost')));
    expect(root.querySelector('.debrief-join')).toBeNull();
    h.showJoin([ava()]);
    expect(pill(root)).toBeNull();
  });

  it('a click brings the offer line into view and puts the keyboard on its first answer', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    h.showJoin([ava()]);
    const body = root.querySelector<HTMLElement>('.hud-result-scroll')!;
    const box = root.querySelector<HTMLElement>('.debrief-join')!;
    // jsdom has no layout: the body overflows, and the line sits below its bottom.
    Object.defineProperty(body, 'scrollHeight', { value: 900 });
    Object.defineProperty(body, 'clientHeight', { value: 300 });
    let top = 0;
    Object.defineProperty(body, 'scrollTop', {
      get: () => top,
      set: (v: number) => (top = v),
      configurable: true,
    });
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400 } as DOMRect);
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ top: 450, bottom: 500 } as DOMRect);
    pill(root)!.click();
    // Its bottom to 8 px above the body's: 500 - (400 - 8).
    expect(top).toBe(108);
    expect(document.activeElement).toBe(box.querySelector('button'));
  });

  it('survives a start-screen retitle by the horde picker', () => {
    const { root, h } = hud();
    // Someone still asking on the start screen: the offer line is in the panel.
    const g = { ...squadGame(2, 12), joining: [recruit(3)] };
    h.showResult(squadStart(g));
    h.showJoin([ava()]);
    expect(pill(root)).not.toBeNull();
    const select = root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    expect(root.querySelector('.hud-result-title')!.textContent).toBe(squadStart(g, 3).title);
    expect(root.querySelectorAll('.chip-join')).toHaveLength(1);
    expect(pill(root)!.textContent).toBe('Asks to join');
  });
});
