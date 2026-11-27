// @vitest-environment jsdom
// ID-238 Themed hordes on the screens: the picker's label, chip and banner (every mode), the
// result screen's warning about the game's pending horde, the theme's gun in the loot, and the
// stock bar's "Horde 15 next · Crawl". Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { FARM, THEMES, type ThemeId } from '../core/data.ts';
import { newGame, startHorde, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { themeAt } from '../core/themes.ts';
import { withTheme } from '../core/balance/shared.ts';
import { stockBarText } from './build.ts';
import {
  createHud,
  hordePicker,
  squadScreen,
  squadStart,
  themeBeatenText,
  themeWarning,
  resultScreen,
} from './hud.ts';
import { THEME } from '../core/data.ts';

const noop = (): void => {};

/** A horde-only camp of 2 on Normal Horde `next` that meets `theme` at 15. */
function camp(next: number, theme: ThemeId, extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  const base: GameState = {
    ...g,
    hordeNumber: next,
    roster: Array.from({ length: 2 }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: 2 },
    ...extra,
  };
  return withTheme(base, 'normal', 15, theme);
}

function hud() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  return { root, h };
}

const won = (g: GameState, horde: number) => ({
  ...startSquadHorde(g, 1, 0, horde),
  outcome: 'won' as const,
});

describe('the picker (ID-238)', () => {
  it('labels a themed horde with its theme, adds a chip and the theme’s details', () => {
    const g = camp(15, 'crawl');
    const p = hordePicker(g);
    const o = p.options.find((x) => x.horde === 15)!;
    expect(o.label).toBe('Normal 15 (new) · Crawl');
    expect(o.theme).toEqual({
      id: 'crawl',
      name: 'Crawl',
      tip: THEMES.crawl.tip,
      kind: 'crawler',
    });
    expect(o.start.chips.map((c) => c.text)).toContain('Crawl');
    const plain = p.options.find((x) => x.horde === 14)!;
    expect(plain.label).toBe('Normal 14');
    expect(plain.theme).toBeUndefined();
    expect(plain.start.chips.map((c) => c.text)).not.toContain('Crawl');
  });

  it('a beaten themed horde keeps its theme in the list', () => {
    const g = camp(30, 'ironwall');
    const o = hordePicker(g).options.find((x) => x.horde === 15)!;
    expect(o.label).toBe('Normal 15 · Iron Wall');
    expect(o.theme?.id).toBe('ironwall');
    expect(hordePicker(g).options.find((x) => x.horde === 25)!.theme?.id).toBe(
      themeAt(g.themes!.seed!, 'normal', 25),
    );
  });

  it('each mode’s picker shows its own theme', () => {
    const base = camp(51, 'crawl');
    const seed = base.themes!.seed!;
    for (const mode of ['normal', 'nightmare', 'hell'] as const) {
      const g: GameState =
        mode === 'normal'
          ? { ...base, hordeNumber: 16 }
          : { ...base, mode, modes: { nightmare: mode === 'hell' ? 51 : 16, hell: 16 } };
      const o = hordePicker(g).options.find((x) => x.horde === 15)!;
      expect(o.theme?.id, mode).toBe(themeAt(seed, mode, 15));
    }
  });

  it('the banner sits under the select, names the theme, follows the pick and is text only', () => {
    const g = camp(15, 'bloat');
    const { root, h } = hud();
    h.showResult(squadStart(g));
    const banner = root.querySelector<HTMLElement>('.hud-horde-theme')!;
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector('.hud-horde-theme-name')!.textContent).toBe('Bloat Tide');
    expect(banner.querySelector('.hud-horde-theme-tip')!.textContent).toBe(THEMES.bloat.tip);
    const icon = banner.querySelector('img')!;
    expect(icon.alt).toBe('');
    expect([...banner.querySelectorAll('*')].map((e) => e.tagName)).toEqual([
      'IMG',
      'P',
      'B',
      'SPAN',
    ]);
    const select = root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
    expect(select.nextElementSibling).toBe(banner);
    select.value = '14';
    select.dispatchEvent(new Event('change'));
    expect(banner.hidden).toBe(true);
    select.value = '15';
    select.dispatchEvent(new Event('change'));
    expect(banner.hidden).toBe(false);
  });

  it('the banner is there in every mode, and not drawn at all with no themed horde listed', () => {
    const base = camp(51, 'stampede');
    for (const mode of ['nightmare', 'hell'] as const) {
      const g: GameState = {
        ...base,
        mode,
        modes: { nightmare: mode === 'hell' ? 51 : 15, hell: 15 },
      };
      const { root, h } = hud();
      h.showResult(squadStart(g));
      expect(root.querySelector('.hud-horde-theme'), mode).not.toBeNull();
    }
    const { root, h } = hud();
    h.showResult(squadStart({ ...camp(10, 'crawl') }));
    expect(root.querySelector('.hud-horde-theme')).toBeNull();
  });

  it('the Nightmare picker’s trait chips are the themed horde’s kinds, and the plain horde keeps all of its own', () => {
    const base = camp(51, 'ironwall');
    const g: GameState = { ...base, mode: 'nightmare', modes: { nightmare: 15 } };
    const options = hordePicker(g).options;
    const themed = options.find((x) => x.horde === 15)!;
    expect(themed.theme?.id).toBe(themeAt(g.themes!.seed!, 'nightmare', 15));
    // The theme's kind and Shamblers, plus the horde's elites (Brutes and Swollen).
    const allowed = ['shambler', THEMES[themed.theme!.id].kind, 'brute', 'swollen'];
    for (const t of themed.traits!) expect(allowed).toContain(t.kind);
    expect(themed.fit).toBeDefined();
    const plain = options.find((x) => x.horde === 14)!;
    expect(plain.traits!.map((t) => t.kind)).toEqual(
      expect.arrayContaining(['runner', 'crawler', 'swollen', 'spewer', 'brute', 'screamer']),
    );
  });
});

describe('the result warning (ID-238)', () => {
  it('a win of the horde before warns of the pending themed horde', () => {
    const g = camp(14, 'stampede');
    // Beating Normal 14 first-clears it: the game's pending horde is 15.
    const s = squadScreen(g, won(g, 14));
    const warn = s.debrief!.warn!;
    expect(warn).toBe('Normal 15 next: Stampede — a themed horde');
    const { root, h } = hud();
    h.showResult(s);
    expect(root.querySelector('.debrief-warn')!.textContent).toBe(warn);
  });

  it('a replay win of Horde 9 with Horde 15 pending warns; a replay of 14 with 30 pending does not', () => {
    const g = camp(15, 'crawl');
    expect(squadScreen(g, won(g, 9)).debrief!.warn).toBe('Normal 15 next: Crawl — a themed horde');
    const far = camp(30, 'crawl');
    expect(squadScreen(far, won(far, 14)).debrief!.warn).toBeUndefined();
    // A first clear of 15 moves the pending horde to 16: plain.
    expect(squadScreen(g, won(g, 15)).debrief!.warn).toBeUndefined();
  });

  it('a lost themed horde warns again', () => {
    const g = camp(15, 'ironwall');
    const lost = { ...startSquadHorde(g, 1, 0), outcome: 'lost' as const, wave: 2 };
    const s = squadScreen(g, lost);
    expect(s.debrief!.warn).toBe(`Normal 15 again: Iron Wall — a themed horde`);
    expect(themeWarning(g, { local: 15, mode: 'normal' })).toBe(s.debrief!.warn);
    // The lost horde's own mode names it (ID-267), whatever mode the game is on.
    const seed = g.themes!.seed!;
    const k = Array.from({ length: 60 }, (_, i) => i + 1).find((i) =>
      themeAt(seed, 'nightmare', i),
    )!;
    expect(themeWarning(g, { local: k, mode: 'nightmare' })).toBe(
      `Nightmare ${k} again: ${THEMES[themeAt(seed, 'nightmare', k)!].name} — a themed horde`,
    );
  });

  it('is absent before a plain horde, on the start screen, and reads each mode’s own pending horde', () => {
    const g = camp(12, 'crawl');
    expect(squadScreen(g, won(g, 12)).debrief!.warn).toBeUndefined();
    expect(squadStart(camp(15, 'crawl')).debrief!.warn).toBeUndefined();
    const seed = camp(51, 'crawl').themes!.seed!;
    const nm: GameState = { ...camp(51, 'crawl'), mode: 'nightmare', modes: { nightmare: 15 } };
    expect(themeWarning(nm)).toBe(
      `Nightmare 15 next: ${THEMES[themeAt(seed, 'nightmare', 15)!].name} — a themed horde`,
    );
  });
});

describe('the theme’s gun in the loot (ID-238)', () => {
  it('a first clear shows the gun as a theme reward, last among the win’s guns', () => {
    const g = camp(15, 'crawl');
    const s = squadScreen(g, won(g, 15));
    const guns = s.debrief!.drop!.guns;
    expect(guns[0]!.lines[0]).toMatch(/^Theme reward · /);
    expect(guns[0]!.tag).toBe('Theme reward');
    expect(guns.slice(1).every((g) => g.tag === undefined)).toBe(true);
    expect(s.lines.some((l) => l.startsWith('Theme reward: '))).toBe(true);
  });

  it('a capped replay still shows its theme gun', () => {
    const g = { ...camp(40, 'ironwall'), farm: { replays: FARM.maxReplays, badLuck: 0 } };
    const s = squadScreen(g, won(g, 15));
    expect(s.debrief!.drop!.guns).toHaveLength(1);
    expect(s.debrief!.drop!.guns[0]!.lines[0]).toMatch(/^Theme reward · /);
  });
});

describe('the stock bar (ID-238)', () => {
  it('names the theme of the next horde in the full game', () => {
    const g = { ...newGame('full', 1), hordeNumber: 15 };
    const t = withTheme(g, 'normal', 15, 'bloat');
    expect(stockBarText(t).startsWith('Horde 15 next · Bloat Tide')).toBe(true);
    expect(stockBarText({ ...t, hordeNumber: 14 }).startsWith('Horde 14 next ·')).toBe(true);
    expect(stockBarText({ ...t, hordeNumber: 14 })).not.toContain('Bloat');
  });
});

describe('the first-clear announcement and the other designer fixes (ID-238)', () => {
  it('a first clear puts "Iron Wall beaten · reward gun" with the theme icon in the header tags', () => {
    const g = camp(15, 'ironwall');
    const s = squadScreen(g, won(g, 15));
    const chip = s.debrief!.chips.find((c) => c.text === 'Iron Wall beaten · reward gun')!;
    expect(chip).toBeDefined();
    expect(chip.icon).toBe('brute');
    expect(chip.event).toBe(true);
    const { root, h } = hud();
    h.showResult(s);
    const node = [...root.querySelectorAll('.chip')].find(
      (n) => n.textContent === 'Iron Wall beaten · reward gun',
    )!;
    expect(node.querySelector('img.chip-icon')!.getAttribute('alt')).toBe('');
    // A replay of a theme already beaten says nothing.
    const done = { ...g, themes: { ...g.themes, cleared: ['ironwall' as const] } };
    expect(
      squadScreen(done, won(done, 15)).debrief!.chips.some((c) => c.text.includes('beaten')),
    ).toBe(false);
    expect(themeBeatenText('crawl', 'genes')).toBe(`Crawl beaten · +${THEME.genes} Genes`);
  });

  it('the theme reward tile carries a tag, shown first, on the page', () => {
    const g = camp(15, 'crawl');
    const { root, h } = hud();
    h.showResult(squadScreen(g, won(g, 15)));
    const tiles = [...root.querySelectorAll('.gun-chip')];
    expect(tiles[0]!.querySelector('.gun-chip-tag')!.textContent).toBe('Theme reward');
    expect(root.querySelectorAll('.gun-chip-tag')).toHaveLength(1);
  });

  it('the stash order still has the theme gun last', () => {
    const g = camp(15, 'crawl');
    const d = squadScreen(g, won(g, 15)).lines.filter((l) =>
      /^(Weapon drop|Bonus gun|Theme reward)/.test(l),
    );
    expect(d.at(-1)).toMatch(/^Theme reward: /);
  });

  it('a loss draws the warning after its callout and retry note, in the "again" words', () => {
    const base = camp(25, 'ironwall');
    const seeded = withTheme({ ...base, themes: undefined }, 'normal', 25, 'ironwall');
    const lost = { ...startSquadHorde(seeded, 1, 0), outcome: 'lost' as const, wave: 2 };
    const s = squadScreen(seeded, lost);
    expect(s.debrief!.warn).toBe('Normal 25 again: Iron Wall — a themed horde');
    const { root, h } = hud();
    h.showResult(s);
    const body = [...root.querySelectorAll('.debrief-callout, .debrief-note, .debrief-warn')].map(
      (n) => n.className,
    );
    expect(body).toEqual(['debrief-callout', 'debrief-note', 'debrief-warn']);
  });

  it('a loss warns about the horde lost, not the pending one', () => {
    const lostOf = (g: GameState, horde: number) => ({
      ...startSquadHorde(g, 1, 0, horde),
      outcome: 'lost' as const,
      wave: 2,
    });
    // Losing a replay of plain Normal 9 while 15 is pending: no warning about 15.
    const pending = camp(15, 'crawl');
    expect(squadScreen(pending, lostOf(pending, 9)).debrief!.warn).toBeUndefined();
    // Losing a replay of themed 15 while 18 is pending: "Normal 15 again".
    const later = camp(18, 'crawl');
    expect(squadScreen(later, lostOf(later, 15)).debrief!.warn).toBe(
      'Normal 15 again: Crawl — a themed horde',
    );
  });

  it('a win’s warning is the headline only, with no tip', () => {
    const g = camp(14, 'stampede');
    const warn = squadScreen(g, won(g, 14)).debrief!.warn!;
    expect(warn).toBe('Normal 15 next: Stampede — a themed horde');
    expect(warn).not.toContain(THEMES.stampede.tip);
  });

  it('the fight corner’s wave line names the theme', () => {
    const g = camp(15, 'stampede');
    const { root, h } = hud();
    const s = startSquadHorde(g, 1, 0);
    h.update(s);
    expect(root.querySelector('.hud-corner-wave')!.textContent).toMatch(
      /^Stampede · (Swarm · )?Wave 1\//,
    );
    const plain = startSquadHorde(camp(14, 'stampede'), 1, 0);
    h.update(plain);
    expect(root.querySelector('.hud-corner-wave')!.textContent).toMatch(/^Wave 1\//);
  });

  it('the full game’s win names the Genes once per theme', () => {
    const full = withTheme({ ...newGame('full', 1), hordeNumber: 15 }, 'normal', 15, 'bloat');
    const fought = startHorde(full, 1, full.roster[0]!.id, 0, 0);
    fought.outcome = 'won';
    expect(resultScreen(full, fought, 0).lines).toContain(
      `Bloat Tide beaten: ${THEME.genes} Genes`,
    );
    const done = { ...full, themes: { ...full.themes, cleared: ['bloat' as const] } };
    expect(resultScreen(done, fought, 0).lines.some((l) => l.includes('beaten:'))).toBe(false);
  });

  it('the Crawl tip names light guns too', () => {
    expect(THEMES.crawl.tip).toBe(
      'Low and hard to hit; they climb the wall. Bring spread or light guns.',
    );
  });
});
