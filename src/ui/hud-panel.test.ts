// @vitest-environment jsdom
// ID-196: the horde panel has one structure on every screen (a header, a body that scrolls,
// a footer with the Skills row above the start row), a Squad of avatars and names, one
// stash count, a readiness line said once, and no radio. Text reaches the page only through
// textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { FINALE_HORDE, STASH_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import {
  createHud,
  EVACUATION_TITLE,
  hordePicker,
  SQUAD_NO_LEVEL_UPS,
  squadScreen,
  squadStart,
  type ResultScreen,
} from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function squadGame(n: number, horde = 3, xp = 0): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => ({ ...recruit(i + 1), xp })),
    camp: { ...g.camp, recruits: n },
  };
}
const ended = (g: GameState, outcome: 'won' | 'lost') => ({
  ...startSquadHorde(g, 1, NOW),
  outcome,
});

function page() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const panel = root.querySelector<HTMLElement>('.hud-result')!;
  return { root, h, panel };
}

const classes = (nodes: Iterable<Element>): string[] => [...nodes].map((n) => n.className);

/** The three screens of one game: start, won, lost. */
function screens(g: GameState): Record<string, ResultScreen> {
  return {
    start: squadStart(g),
    won: squadScreen(g, ended(g, 'won')),
    lost: squadScreen(g, ended(g, 'lost')),
  };
}

describe('one structure on every screen (ID-196)', () => {
  it('start, won and lost: a head, a scrolling body and a foot, in that order', () => {
    const { h, panel } = page();
    for (const [name, screen] of Object.entries(screens(squadGame(2)))) {
      h.showResult(screen);
      expect(classes(panel.children), name).toEqual([
        'hud-result-head',
        'hud-result-scroll',
        'hud-result-foot',
      ]);
      const head = panel.querySelector('.hud-result-head')!;
      expect(head.children[0]!.tagName, name).toBe('H2');
      expect(head.children[0]!.className, name).toBe('hud-result-title');
      expect(head.children[1]!.className, name).toBe('debrief-chips');
      // The pills are in the head, never in the body.
      expect(panel.querySelector('.hud-result-scroll .debrief-chips'), name).toBeNull();
      expect(head.querySelectorAll('.chip').length, name).toBeGreaterThan(0);
    }
  });

  it('the foot is two rows: the Skills row, then the horde select and Start in a row of their own', () => {
    const { h, panel } = page();
    for (const [name, screen] of Object.entries(screens(squadGame(2)))) {
      h.showResult(screen);
      const foot = panel.querySelector('.hud-result-foot')!;
      expect(classes(foot.children), name).toEqual(['hud-skill-pick', 'hud-start-row']);
      const skills = foot.querySelector<HTMLElement>('.hud-skill-pick')!;
      const row = foot.querySelector<HTMLElement>('.hud-start-row')!;
      expect(skills.hidden, name).toBe(false);
      expect(skills.querySelector('.hud-horde-label')!.textContent, name).toMatch(/^Skills/);
      expect(skills.querySelectorAll('.hud-skill-option').length, name).toBeGreaterThan(0);
      // The horde select and Start share the second row, and neither is in the Skills row.
      expect(classes(row.children), name).toEqual(['hud-horde-pick', 'hud-button btn-primary']);
      expect(row.querySelector('#hud-horde-select'), name).not.toBeNull();
      expect(skills.querySelector('select, .hud-start-row'), name).toBeNull();
      expect(skills.contains(row.querySelector('.hud-button')), name).toBe(false);
    }
  });

  it('the Skills row is labelled as a group, and it is Skills, not "Skill" or "Skill pick"', () => {
    const { h, panel } = page();
    h.showResult(squadStart(squadGame(1)));
    const skills = panel.querySelector<HTMLElement>('.hud-skill-pick')!;
    const label = skills.querySelector('.hud-horde-label')!;
    expect(skills.getAttribute('role')).toBe('group');
    expect(skills.getAttribute('aria-labelledby')).toBe(label.id);
    expect(label.textContent).toMatch(/^Skills( \(up to \d+\))?$/);
  });

  it('a screen with no skills hides the Skills row but keeps the start row', () => {
    const { h, panel } = page();
    h.showResult({ ...squadStart(squadGame(1)), skills: undefined });
    expect(panel.querySelector<HTMLElement>('.hud-skill-pick')!.hidden).toBe(true);
    expect(panel.querySelector('.hud-start-row > .hud-button')).not.toBeNull();
  });

  it('the panel is one box: its kind and details never change what it is made of', () => {
    const { h, panel } = page();
    const g = squadGame(2);
    const shape = (): string[] =>
      classes(panel.querySelectorAll('.hud-result > *, .hud-result-foot > *'));
    h.showResult(screens(g).start!);
    const start = shape();
    h.showResult(screens(g).won!);
    expect(shape()).toEqual(start);
    // With sentences to open, "Details" is there, and opening them changes nothing either.
    const won = screens(g).won!;
    h.showResult({ ...won, debrief: { ...won.debrief!, notes: ['Auto squad: in Ava.'] } });
    panel.querySelector<HTMLButtonElement>('.debrief-details')!.click();
    expect(panel.querySelector<HTMLElement>('.debrief-notes')!.hidden).toBe(false);
    expect(shape()).toEqual(start);
    h.showResult(screens(g).lost!);
    expect(shape()).toEqual(start);
  });

  it('a win with no sentence has no "Details" button: it would open nothing', () => {
    const { h, panel } = page();
    const won = screens(squadGame(2)).won!;
    h.showResult({ ...won, debrief: { ...won.debrief!, notes: [] } });
    expect(panel.querySelector('.debrief-details')).toBeNull();
    expect(panel.querySelector('.debrief-notes')).toBeNull();
    h.showResult({ ...won, debrief: { ...won.debrief!, notes: ['Auto squad: in Ava.'] } });
    const details = panel.querySelector<HTMLButtonElement>('.debrief-details')!;
    expect(details.getAttribute('aria-controls')).toBe(panel.querySelector('.debrief-notes')!.id);
  });
});

describe('the start row has three parts (ID-196)', () => {
  it('the choice with its power line and hint, then the win cost, then the button', () => {
    const { h, panel } = page();
    for (const [name, screen] of Object.entries(screens(squadGame(2, 12)))) {
      h.showResult(screen);
      const row = panel.querySelector<HTMLElement>('.hud-start-row')!;
      const pick = row.querySelector<HTMLElement>('.hud-horde-pick')!;
      // The label is visually hidden by the page; the select and its hint are one part.
      expect(classes(pick.children), name).toEqual([
        'hud-horde-label',
        'hud-horde-choice',
        'hud-horde-ready',
      ]);
      const choice = pick.querySelector('.hud-horde-choice')!;
      // The power line sits under the select, over the farm hint.
      expect(classes(choice.children), name).toEqual([
        'build-select hud-horde-select',
        'hud-horde-power',
        'hud-horde-hint',
      ]);
      const ready = pick.querySelector('.hud-horde-ready')!;
      expect(classes(ready.children), name).toEqual(['hud-horde-power hud-horde-injury']);
      expect(choice.children[1]!.textContent, name).toMatch(/^Power [\d,]+ · rec [\d,]+ /);
      expect(ready.children[0]!.textContent, name).toMatch(/^Win cost: /);
      expect(row.lastElementChild!.tagName, name).toBe('BUTTON');
    }
  });
});

describe('the weapon chips open one details area (ID-196)', () => {
  /** A won panel whose drop has `n` guns, the first of them the drop. */
  function winWithGuns(n: number) {
    for (let seed = 1; seed < 300; seed++) {
      const g = squadGame(2, 6);
      const screen = squadScreen(g, { ...startSquadHorde(g, seed, NOW), outcome: 'won' as const });
      if (screen.debrief!.drop?.guns.length === n) {
        const { h, panel } = page();
        h.showResult(screen);
        return { screen, panel };
      }
    }
    throw new Error('no seed');
  }
  const chips = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>('.gun-chip')];
  const open = (panel: HTMLElement) => chips(panel).map((c) => c.getAttribute('aria-expanded'));

  it('one chip per dropped gun, the drop first, with no kind or bonus text on a chip', () => {
    const { screen, panel } = winWithGuns(3);
    const d = screen.debrief!.drop!;
    expect(chips(panel)).toHaveLength(3);
    for (const [i, chip] of chips(panel).entries()) {
      const g = d.guns[i]!;
      expect(chip.dataset.rarity).toBe(g.rarity);
      expect(chip.getAttribute('aria-controls')).toBe('hud-gun-details');
      expect(chip.querySelector('.gun-chip-name')!.textContent).toBe(g.short);
      expect(chip.querySelector('.gun-chip-power')!.textContent).toBe(
        g.lost ? 'Thrown away' : g.power,
      );
      expect(chip.classList.contains('gun-chip-lost')).toBe(g.lost);
      expect(chip.textContent).not.toMatch(/First clear|Replay|Guaranteed|bonus/i);
    }
    expect(panel.querySelector('.tile-kind, .tile-bonus, .tile-more, .debrief-spoils')).toBeNull();
  });

  it('a click opens its details, a second closes them, another chip switches', () => {
    const { screen, panel } = winWithGuns(3);
    const d = screen.debrief!.drop!;
    const details = panel.querySelector<HTMLElement>('#hud-gun-details')!;
    expect(details.hidden).toBe(true);
    expect(open(panel)).toEqual(['false', 'false', 'false']);
    chips(panel)[0]!.click();
    expect(details.hidden).toBe(false);
    expect(open(panel)).toEqual(['true', 'false', 'false']);
    expect(details.querySelector('.gun-details-name')!.textContent).toBe(d.guns[0]!.short);
    chips(panel)[2]!.click();
    expect(details.hidden).toBe(false);
    expect(open(panel)).toEqual(['false', 'false', 'true']);
    expect(details.querySelector('.gun-details-name')!.textContent).toBe(d.guns[2]!.short);
    expect(details.textContent).toContain(d.guns[2]!.lines[0]!);
    chips(panel)[2]!.click();
    expect(details.hidden).toBe(true);
    expect(open(panel)).toEqual(['false', 'false', 'false']);
  });

  it('exactly one stash count, only inside the open details', () => {
    const { panel } = winWithGuns(3);
    expect(panel.querySelectorAll('.tile-stash')).toHaveLength(0);
    chips(panel)[1]!.click();
    expect(panel.querySelectorAll('.tile-stash')).toHaveLength(1);
    expect(panel.querySelector('#hud-gun-details .tile-stash')).not.toBeNull();
    chips(panel)[0]!.click();
    expect(panel.querySelectorAll('.tile-stash')).toHaveLength(1);
    expect(panel.textContent!.match(/Stash \d+\//g)).toHaveLength(1);
  });
});

describe('titles say the result (ID-196)', () => {
  it('a win holds the line, a replay says so, the finale keeps its own title, a loss says the camp fell', () => {
    const g = squadGame(2, 6);
    expect(squadScreen(g, ended(g, 'won')).title).toBe('Horde 6 - You hold the line');
    const replay = squadScreen(g, { ...startSquadHorde(g, 1, NOW, 3), outcome: 'won' as const });
    expect(replay.title).toBe('Horde 3 - You hold the line (replay)');
    expect(squadScreen(g, ended(g, 'lost')).title).toBe('Horde 6 - Camp has fallen');
    const finale = squadGame(2, FINALE_HORDE);
    expect(
      squadScreen(finale, { ...startSquadHorde(finale, 1, NOW), outcome: 'won' as const }).title,
    ).toBe(EVACUATION_TITLE);
    // The page shows the same words.
    const { h, panel } = page();
    h.showResult(squadScreen(g, ended(g, 'lost')));
    expect(panel.querySelector('.hud-result-title')!.textContent).toBe('Horde 6 - Camp has fallen');
  });
});

describe('no radio on the panel (ID-196)', () => {
  it('the campaign start screen has no radio pill, explainer, toggle or word', () => {
    const { h, panel } = page();
    for (const horde of [1, 10, 11, 20, 21, 30]) {
      h.showResult(squadStart(squadGame(2, horde)));
      expect(panel.textContent, `horde ${horde}`).not.toMatch(/radio/i);
      expect(panel.querySelector('.radio-help, button.chip-toggle'), `horde ${horde}`).toBeNull();
      expect(panel.querySelector('.debrief-chips')!.firstElementChild!.textContent).not.toMatch(
        /^Radio/,
      );
      for (const chip of panel.querySelectorAll('.debrief-chips .chip')) {
        expect(chip.tagName).toBe('SPAN');
      }
    }
  });

  it('Endless keeps its goal chip, as a plain pill, and its note before the loss rule', () => {
    const { h, panel } = page();
    h.showResult(squadStart(squadGame(2, 45)));
    const first = panel.querySelector('.debrief-chips')!.firstElementChild!;
    expect(first.textContent).toBe('Endless · best 44');
    expect(first.tagName).toBe('SPAN');
    expect(panel.querySelector('.debrief-note')!.textContent).toMatch(
      /^Evacuation called\. Hold Horde 45 for a new best\. You lose if /,
    );
  });

  it('the start screen’s loss rule is a note after the Squad, and nothing else is under it', () => {
    const { h, panel } = page();
    h.showResult(squadStart(squadGame(2)));
    const body = panel.querySelector('.hud-result-scroll .hud-picker')!;
    expect(classes(body.children)).toEqual(['debrief-squad', 'debrief-note']);
    expect(panel.querySelector('.hud-result-foot-note')).toBeNull();
  });
});

describe('the Squad on a won screen: level-ups only, as avatars and names (ID-196)', () => {
  it('each card is an avatar picture and a name, with no select, XP, bar, job or gun text', () => {
    const { h, panel } = page();
    const g = squadGame(2);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    const cards = [...panel.querySelectorAll<HTMLElement>('.squad-card')];
    expect(cards.map((c) => c.dataset.defender)).toEqual(screen.debrief!.cards.map((c) => c.id));
    expect(cards.length).toBeGreaterThan(0);
    for (const [i, card] of cards.entries()) {
      const c = screen.debrief!.cards[i]!;
      const img = card.querySelector<HTMLImageElement>(
        '.roster-avatar.squad-card-avatar > img.roster-avatar-img',
      )!;
      expect(img).not.toBeNull();
      expect(img.alt).toBe('');
      const name = card.querySelector<HTMLButtonElement>('button.squad-card-name')!;
      expect(name.textContent).toBe(c.name);
      expect(name.dataset.openSurvivor).toBe(c.id);
      expect(name.getAttribute('aria-label')).toBe(
        `${c.name}, level ${c.level}: open survivor card`,
      );
      expect(card.querySelector('.squad-badge-up')).toBeNull();
      expect(card.querySelector('select, option, meter, progress, .xp-track, .xp-fill')).toBeNull();
      // Nothing but the name and the triangle is read as text.
      expect(card.textContent).toBe(`${c.name}▲`);
    }
    expect(panel.textContent).not.toMatch(/\bXP to\b|\bDPS with\b/);
  });

  it('a survivor who did not level up has no card, and nobody levelling up says so once', () => {
    const { h, panel } = page();
    const veteran = (n: number) => ({ ...recruit(n), xp: xpForLevel(30) });
    const mixed = { ...squadGame(2), roster: [recruit(1), veteran(2)] };
    h.showResult(squadScreen(mixed, ended(mixed, 'won')));
    expect(
      [...panel.querySelectorAll<HTMLElement>('.squad-card')].map((c) => c.dataset.defender),
    ).toEqual(['recruit-1']);
    const none = { ...squadGame(2), roster: [veteran(1), veteran(2)] };
    h.showResult(squadScreen(none, ended(none, 'won')));
    expect(panel.querySelectorAll('.squad-card')).toHaveLength(0);
    expect(panel.querySelectorAll('.debrief-empty')).toHaveLength(1);
    expect(panel.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
  });

  it('the start and lost screens list the whole squad the same way', () => {
    const { h, panel } = page();
    const g = squadGame(3);
    for (const screen of [squadStart(g), squadScreen(g, ended(g, 'lost'))]) {
      h.showResult(screen);
      const cards = [...panel.querySelectorAll<HTMLElement>('.squad-card')];
      expect(cards.map((c) => c.dataset.defender)).toEqual(g.roster.map((d) => d.id));
      for (const card of cards) {
        expect(card.querySelectorAll('img')).toHaveLength(1);
        expect(card.querySelector('select, .xp-fill')).toBeNull();
      }
    }
  });
});

describe('one stash count on a won panel (ID-196)', () => {
  it('only a gun’s details say the stash, once', () => {
    const { h, panel } = page();
    const g = squadGame(2, 5);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    // Closed: nowhere on the panel.
    expect(panel.textContent).not.toMatch(/Stash/);
    const chips = panel.querySelectorAll<HTMLButtonElement>('.gun-chip');
    chips[0]!.click();
    const said = panel.textContent!.match(new RegExp(`Stash \\d+/${STASH_CAP}`, 'g'));
    expect(said).toHaveLength(1);
    expect(panel.querySelectorAll('.tile-stash')).toHaveLength(1);
    expect(panel.querySelector('.tile-stash')!.textContent).toBe(screen.debrief!.drop!.stash);
    expect(screen.debrief!.drop!.stash).toMatch(new RegExp(`^Stash \\d+/${STASH_CAP}`));
    expect(panel.querySelector('.debrief-stash')).toBeNull();
    expect(panel.querySelector('.squad-card')!.closest('.debrief-squad')!.textContent).not.toMatch(
      /Stash/,
    );
  });

  it('a loss and the start screen have no stash count at all', () => {
    const { h, panel } = page();
    const g = squadGame(2, 5);
    for (const screen of [squadStart(g), squadScreen(g, ended(g, 'lost'))]) {
      h.showResult(screen);
      expect(panel.textContent).not.toMatch(/Stash/);
    }
  });
});

describe('the horde picker says readiness once (ID-196)', () => {
  it('no option label carries "rec" or a band word, in the data or on the page', () => {
    const { h, panel } = page();
    const g = squadGame(2, 12);
    for (const o of hordePicker(g).options) expect(o.label).not.toMatch(/rec/i);
    for (const screen of Object.values(screens(g))) {
      h.showResult(screen);
      const options = [...panel.querySelectorAll<HTMLOptionElement>('#hud-horde-select option')];
      expect(options.length).toBeGreaterThan(1);
      for (const o of options) {
        expect(o.textContent).not.toMatch(/rec/i);
        expect(o.textContent).toMatch(/^Horde \d+( \(new\))?( · Boss)?( · best to farm)?$/);
      }
    }
  });

  it('the power line is on the page once, for the horde picked', () => {
    const { h, panel } = page();
    const g = squadGame(2, 12);
    h.showResult(squadStart(g));
    const power = panel.querySelectorAll('.hud-horde-power:not(.hud-horde-injury)');
    expect(power).toHaveLength(1);
    const text = power[0]!.querySelector('.hud-horde-power-text')!.textContent!;
    expect(text).toMatch(/^Power [\d,]+ · rec [\d,]+$/);
    // Said once: the same figures are nowhere else on the panel.
    expect(panel.textContent!.split(text)).toHaveLength(2);
    expect(panel.querySelector('#hud-horde-select')!.textContent).not.toMatch(/\d,\d{3}/);
  });
});

describe('showSquad (ID-196)', () => {
  /** Survivor 1 levels up in the win; survivor 2 and 3 are newcomers accepted on the screen. */
  function won() {
    const g = { ...squadGame(1, 1, xpForLevel(2) - 1) };
    const next = { ...g, roster: [...g.roster, recruit(2), recruit(3)] };
    const { h, panel } = page();
    h.showResult(squadScreen(g, ended(g, 'won')));
    const fresh = (id: string) => ({
      id,
      name: id,
      level: 1,
      art: squadStart(next).debrief!.cards.find((c) => c.id === id)!.art,
      levelUp: false,
    });
    h.showJoined(fresh('recruit-2'));
    h.showJoined(fresh('recruit-3'));
    const ids = () =>
      [...panel.querySelectorAll<HTMLElement>('.squad-card')].map((c) => c.dataset.defender);
    return { h, panel, ids };
  }

  it('removes a New card whose survivor has left the squad, and keeps the rest', () => {
    const { h, ids } = won();
    expect(ids()).toEqual(['recruit-1', 'recruit-2', 'recruit-3']);
    h.showSquad(new Set(['recruit-1', 'recruit-3']));
    expect(ids()).toEqual(['recruit-1', 'recruit-3']);
  });

  it('never removes a level-up card, even for a survivor no longer in the squad', () => {
    const { h, ids } = won();
    h.showSquad(new Set());
    expect(ids()).toEqual(['recruit-1']);
  });

  it('a win left with no card says "no level-ups" again, with its Squad heading', () => {
    const g = { ...squadGame(1), roster: [{ ...recruit(1), xp: xpForLevel(30) }] };
    const { h, panel } = page();
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined({
      id: 'recruit-2',
      name: 'Ava',
      level: 1,
      art: squadStart(g).debrief!.cards[0]!.art,
      levelUp: false,
    });
    expect(panel.querySelectorAll('.squad-card')).toHaveLength(1);
    expect(panel.querySelector('.debrief-empty')).toBeNull();
    h.showSquad(new Set(['recruit-1']));
    expect(panel.querySelectorAll('.squad-card')).toHaveLength(0);
    expect(panel.querySelectorAll('.debrief-squad')).toHaveLength(1);
    expect(panel.querySelector('.debrief-squad-title')!.textContent).toBe('Squad');
    expect(panel.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
  });

  it('on the start screen it removes a New card but never shows the "no level-ups" line', () => {
    const g = squadGame(1);
    const { h, panel } = page();
    h.showResult(squadStart({ ...g, roster: [...g.roster, recruit(2)] }));
    h.showJoined({
      id: 'recruit-2',
      name: 'Ava',
      level: 1,
      art: squadStart(g).debrief!.cards[0]!.art,
      levelUp: false,
    });
    h.showSquad(new Set(['recruit-1']));
    expect(panel.querySelector('.debrief-empty')).toBeNull();
    // A plain card of the start screen (not New) stays even for an id outside the set.
    h.showSquad(new Set());
    expect(
      [...panel.querySelectorAll<HTMLElement>('.squad-card')].map((c) => c.dataset.defender),
    ).toEqual(['recruit-1']);
  });

  it('does nothing while the panel is hidden', () => {
    const { h, panel, ids } = won();
    panel.hidden = true;
    h.showSquad(new Set());
    expect(ids()).toEqual(['recruit-1', 'recruit-2', 'recruit-3']);
  });
});
