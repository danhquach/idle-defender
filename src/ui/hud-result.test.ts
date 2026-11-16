// @vitest-environment jsdom
// A win's result at a glance (ID-186): chips for the numbers and what happened, the
// sentences and the long lines behind "Details", and nothing the old screen said lost.
import { describe, expect, it } from 'vitest';
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
  squadGear,
  squadScreen,
  squadStart,
  xpChipText,
  type ResultScreen,
} from './hud.ts';

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

/** A boss horde's first clear with a drop: the radio part's chip and sentence, and a tile. */
function bossWin(): { g: GameState; screen: ResultScreen } {
  const g = squadGame(3, RADIO_HORDES[0]!);
  for (let seed = 1; seed < 200; seed++) {
    const screen = squadScreen(g, ended(g, 'won', seed));
    if (screen.debrief!.drop) return { g, screen };
  }
  throw new Error('no seed with a drop');
}

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
    // The boss reward: its sentence waits in the details, its chip opens them.
    expect(d.notes).toEqual([expect.stringContaining('Radio part found')]);
    const radio = d.chips.find((c) => c.text.startsWith('Radio part'))!;
    expect(radio.details).toBe(true);
    // The plain numbers are not buttons: they have nothing more to say.
    for (const c of d.chips.filter((x) => /waves|Scrap|XP/.test(x.text))) {
      expect(c.details).toBeUndefined();
    }
    // Every sentence is still in the screen's lines, as before.
    for (const n of d.notes!) expect(screen.lines).toContain(n);
  });

  it('nobody asking: the camp chip says so, and opens the details where the tile says why', () => {
    const g = squadGame(6, 5);
    const h = ended(g, 'won');
    const { noJoin } = squadResult(g, h);
    const d = squadScreen(g, h).debrief!;
    const camp = d.chips.find((c) => c.text.startsWith('Camp '));
    if (noJoin === null) expect(camp).toBeUndefined();
    else {
      expect(camp).toEqual({ text: campChipText(noJoin, 6), tone: 'ok', details: true });
      expect(d.join!.none).not.toBeNull();
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
    // The "Details" button and the radio part's chip, both real buttons naming the region.
    const all = toggles(root);
    expect(all.map((b) => b.textContent)).toEqual(
      expect.arrayContaining([DETAILS, expect.stringContaining('Radio part')]),
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

  it('open, they stay open while the screen redraws its tiles, cards and guns', () => {
    const { root, h } = hud();
    const { g, screen } = bossWin();
    h.showResult(screen);
    h.showGear(squadGear(g), noop);
    root.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    const open = (): void => {
      expect(panel.dataset.details).toBe('');
      expect(root.querySelector<HTMLElement>('.debrief-notes')!.hidden).toBe(false);
      for (const b of toggles(root)) expect(b.getAttribute('aria-expanded')).toBe('true');
    };
    // Someone asks, is answered, joins the squad, and a gun changes: only a new screen closes them.
    h.showJoin([{ id: 'j1', name: 'Ava', sub: 'Lv 1 · Hunter · Pistol', job: 'Hunter: crit' }]);
    open();
    h.noteJoin('Ava joined the squad');
    h.showJoin([], true);
    open();
    h.showJoined({
      id: 'j1',
      name: 'Ava',
      level: 1,
      job: 'Hunter',
      xp: null,
      levelUp: false,
      bar: null,
      bonus: '',
      fresh: true,
    });
    open();
    h.showGear(squadGear(g), noop);
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

describe("a win's tiles and cards, short (ID-186)", () => {
  it('the drop: its role by name on the short line, the sentences marked for the details', () => {
    const { root, h } = hud();
    const { screen } = bossWin();
    const t = screen.debrief!.drop!;
    h.showResult(screen);
    const tile = root.querySelector<HTMLElement>('.tile-drop')!;
    expect(t.role.startsWith(`${t.roleName}: `)).toBe(true);
    // Read aloud it is still a weapon drop; the eye gets "Relic · Wall stopper".
    expect(tile.querySelector('.tile-rarity')!.textContent).toBe(
      `Weapon drop · ${t.rarityName} · ${t.roleName}`,
    );
    expect(tile.querySelector('.tile-what')!.textContent).toBe('Weapon drop · ');
    expect(tile.querySelector('.tile-role')!.textContent).toBe(t.role);
    expect(tile.querySelector('.tile-role')!.classList.contains('tile-more')).toBe(true);
    if (t.affixes) {
      expect(tile.querySelector('.tile-affixes.tile-more')!.textContent).toBe(t.affixes);
    }
    // What stays in sight: the name, the DPS and the stash count.
    expect(tile.querySelector('.tile-name')!.textContent).toBe(`${t.level} ${t.name}`);
    expect(tile.querySelector('.tile-power')!.textContent).toBe(t.power);
    expect(tile.querySelector('.tile-stash')!.textContent).toBe(t.stash);
  });

  it('a level-up card keeps everything it had: the picker, XP count and bonus are still in it', () => {
    const { root, h } = hud();
    const g = squadGame(2, 3, 0);
    const screen = squadScreen(g, ended(g, 'won'));
    const c = screen.debrief!.cards[0]!;
    expect(c.levelUp).toBe(true);
    h.showResult(screen);
    h.showGear(squadGear(g), noop);
    const card = root.querySelector<HTMLElement>('.squad-card')!;
    expect(card.querySelector('.squad-card-level')!.textContent).toBe(`Lv ${c.level} · ${c.job}`);
    expect(card.querySelector('.squad-card-lv')!.textContent).toBe(`Lv ${c.level}`);
    expect(card.querySelector('.squad-card-job')!.textContent).toBe(c.job);
    expect(card.querySelector('.squad-badge-up')).not.toBeNull();
    expect(card.querySelector('.squad-card-xp')!.textContent).toBe(`+${c.xp} XP`);
    expect(card.querySelector('.squad-card-xptext')!.textContent).toBe(c.bar!.text);
    expect(card.querySelector('.squad-card-gear select')).not.toBeNull();
    expect(card.querySelector('.squad-card-bonus')!.textContent).toBe(c.bonus);
  });

  it('asking to join: the label and the warning share a head, each asker a row with both answers', () => {
    const { root, h } = hud();
    h.showResult(bossWin().screen);
    h.showJoin([
      { id: 'j1', name: 'Ava', sub: 'Lv 3 · Paramedic · Pistol', job: 'Paramedic: patches up' },
      { id: 'j2', name: 'Bo', sub: 'Lv 1 · Hunter · Pistol', job: 'Hunter: +10% crit chance' },
    ]);
    const tile = root.querySelector<HTMLElement>('.tile-join')!;
    const head = tile.querySelector('.join-head')!;
    expect(head.querySelector('.tile-label')!.textContent).toBe('2 ask to join');
    expect(head.querySelector('.join-note')!.textContent).toBe(
      'Refused survivors are gone for good.',
    );
    const rows = [...tile.querySelectorAll<HTMLElement>('.join-row')];
    expect(rows.map((r) => r.querySelector('.join-job')!.textContent)).toEqual([
      'Paramedic: patches up',
      'Hunter: +10% crit chance',
    ]);
    for (const r of rows) {
      expect([...r.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
        'Accept',
        'Refuse',
      ]);
    }
  });
});
