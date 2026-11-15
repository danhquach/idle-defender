// @vitest-environment jsdom
// The horde-only HUD (ID-066): the minimal top bar (horde, waves cleared, enemies left)
// with the fight XP bar, no shop row, and the start, result and ending screens. Text
// reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { LEVELS_REWORKED } from './build.ts';
import { JOBS, RADIO_HORDES, SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import { waveCount, xpToNext } from '../core/waves.ts';
import {
  createHud,
  defenderLabel,
  enemiesLeft,
  EVACUATION_TITLE,
  joinedCard,
  lossXpText,
  NEW_BADGE,
  powerLine,
  SQUAD_LOSS_RULE,
  SQUAD_NO_LEVEL_UPS,
  squadGear,
  squadScreen,
  squadStart,
  squadStatus,
  startLabel,
  SWAP_NOTE,
  swapNote,
  SWAPS_TIP,
  swapsText,
  xpBar,
} from './hud.ts';
import type { Swap } from '../core/horde.ts';
import { ART_URLS } from './sprites.ts';
import { levelText } from './statlines.ts';
import { enemy } from '../core/testing.ts';

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
const ended = (g: GameState, outcome: 'won' | 'lost') => ({
  ...startSquadHorde(g, 1, NOW),
  outcome,
});

describe('the horde-only top bar (ID-066)', () => {
  it('names the horde only, and nothing of cash, bank or perks', () => {
    const s = startSquadHorde(squadGame(1, 3), 1, NOW);
    expect(squadStatus(s)).toBe('Horde 3');
    expect(squadStatus(s)).not.toMatch(/Cash|Bank|Perks/);
    // No wave progress or enemy count (ID-167): a tooltip keeps its text while shown, so
    // either went stale beside the wave line's live one as a wave ended or began.
    for (const t of [
      { ...s, wave: 3 },
      { ...s, outcome: 'won' as const },
      { ...s, toSpawn: 1234 },
    ]) {
      expect(squadStatus(t)).toBe('Horde 3');
    }
    expect(squadStatus(startSquadHorde(squadGame(1, 10), 1, NOW))).toMatch(/^Horde 10 \(boss\)/);
  });

  it('counts the living enemies on the field and those still to come', () => {
    const s = startSquadHorde(squadGame(1), 1, NOW);
    const e = { ...s.enemies[0]!, hp: 5 } as (typeof s.enemies)[number];
    const dead = { ...e, hp: 0 };
    expect(enemiesLeft({ enemies: [e, dead], toSpawn: 4 })).toBe(5);
  });

  it('the XP bar: the fight level and the XP into it', () => {
    expect(xpBar({ level: 2, xp: 7 })).toEqual({
      label: `Fight Lv 2 · 7/${xpToNext(2)} XP`,
      text: `Lv 2 · 7/${xpToNext(2)}`,
      value: 7,
      max: xpToNext(2),
    });
  });
});

describe('the horde-only screens (ID-066)', () => {
  it('the start screen names the squad and starts the horde', () => {
    const screen = squadStart(squadGame(2, 4, 30));
    expect(screen.title).toBe('Horde 4');
    expect(screen.lines[0]).toBe(
      `Squad 2/${SQUAD_CAP}: ${recruit(1).name} (level 2), ${recruit(2).name} (level 2)`,
    );
    expect(screen.lines[1]).toBe(`${waveCount(4)} waves. Hold the wall. ${SQUAD_LOSS_RULE}`);
    expect(screen.button).toBe(startLabel(4));
    expect(screen.camp.offers).toEqual([]);
    expect(squadStart(squadGame(1, 10)).title).toBe('Horde 10 · Boss horde');
  });

  it('a win: XP and level-ups by name, the new survivor, and the next horde', () => {
    const g = squadGame(2, 5, 0);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe('Horde 5 held');
    expect(screen.lines.some((l) => l.startsWith(`${recruit(1).name} +`))).toBe(true);
    expect(screen.lines.some((l) => l.endsWith(' · level up!'))).toBe(true);
    expect(screen.lines.join(' ')).not.toMatch(/stat point/);
    expect(screen.lines.some((l) => /level 2 · \d+\/50 XP to level 3/.test(l))).toBe(true);
    expect(screen.lines).toContain(
      `${recruit(3).name} (${JOBS[recruit(3, 1).job].name}) asks to join the camp`,
    );
    expect(screen.lines.join(' ')).not.toMatch(/Camp|Genes|Payout|Repair|injured/);
    expect(screen.button).toBe(startLabel(6));
    expect(screen.squad).toBe(true);
  });

  it('a win past 6 whose roll misses says nobody joins (seed 1, ID-147)', () => {
    const g = squadGame(SQUAD_CAP, 2);
    expect(squadScreen(g, ended(g, 'won')).lines).toContain(
      `Nobody new joins the camp this time (${SQUAD_CAP} survivors)`,
    );
  });

  it('a boss horde’s first clear finds a radio part and names its card unlock (ID-127)', () => {
    const at10 = squadGame(SQUAD_CAP, 10);
    const a = squadScreen(at10, ended(at10, 'won'));
    expect(a.title).toBe('Horde 10 held');
    expect(a.button).toBe(startLabel(11));
    expect(a.lines.at(-1)).toBe('Radio part found. New card unlocked: Heavy Rounds.');
    expect(a.debrief!.note).toBe(a.lines.at(-1));
    expect(a.debrief!.chips.map((c) => c.text)).toContain('Radio part 1/3');
    const at20 = squadGame(SQUAD_CAP, 20);
    const b = squadScreen(at20, ended(at20, 'won'));
    expect(b.debrief!.note).toBe('Radio part found. New card unlocked: Field Repairs.');
    // No other horde finds a part.
    const at11 = squadGame(SQUAD_CAP, 11);
    const c = squadScreen(at11, ended(at11, 'won'));
    expect(c.debrief!.note).toBeNull();
    expect(c.debrief!.chips.map((x) => x.text).join(' ')).not.toMatch(/Radio/);
  });

  it('the finale’s first clear is the ending screen: Continue into Endless (ID-127)', () => {
    const g = squadGame(SQUAD_CAP, 30);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe(EVACUATION_TITLE);
    expect(screen.button).toBe('Continue');
    expect(screen.debrief!.note).toBe(
      'The radio works. You held the camp. Play on in Endless for a best horde.',
    );
    expect(screen.debrief!.chips[0]!.text).toBe('Horde 30 held');
    expect(screen.debrief!.chips.map((c) => c.text)).toContain('Radio part 3/3');
    // Continue starts the first Endless horde.
    expect(screen.picker!.value).toBe(31);
  });

  it('the start screen shows the radio’s progress, then Endless and the best horde (ID-127)', () => {
    const chip = (horde: number): string => squadStart(squadGame(1, horde)).debrief!.chips[0]!.text;
    expect(chip(1)).toBe('Radio 0/3');
    expect(chip(10)).toBe('Radio 0/3');
    expect(chip(11)).toBe('Radio 1/3');
    expect(chip(21)).toBe('Radio 2/3');
    expect(chip(30)).toBe('Radio 2/3');
    expect(chip(31)).toBe('Endless · best 30');
    expect(chip(45)).toBe('Endless · best 44');
    expect(squadStart(squadGame(1, 11)).debrief!.note).toBe(
      'Beat boss Horde 20 for radio part 2 of 3.',
    );
    expect(squadStart(squadGame(1, 45)).debrief!.note).toBe(
      'Evacuation called. Hold Horde 45 for a new best.',
    );
    // The goal says the same whichever horde the picker is on.
    expect(squadStart(squadGame(1, 21), 5).debrief!.chips[0]!.text).toBe('Radio 2/3');
    expect(squadStart(squadGame(1, 21)).lines.at(-1)).toBe(
      squadStart(squadGame(1, 21)).debrief!.note,
    );
  });

  it('a loss: no XP, the same horde again with everyone back and a full wall', () => {
    const g = squadGame(3, 6);
    const screen = squadScreen(g, ended(g, 'lost'));
    expect(screen.title).toBe('The wall fell');
    // No wave cleared: no XP (ID-098).
    expect(screen.lines).toContain(lossXpText(0));
    expect(screen.button).toBe('Retry Horde 6');
    expect(screen.lines.join(' ')).not.toMatch(/Food|Medicine|back at|Repair/);
  });

  it('a plain survivor is named alone, with no profession', () => {
    const spec = startSquadHorde(squadGame(1), 1, NOW).defenders[0]!;
    expect(defenderLabel(spec)).toBe(spec.name);
  });
});

describe('the horde-only HUD on the page (ID-066)', () => {
  function hud(squad: boolean) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, squad);
    return { root, h };
  }

  it('a toast stays 2 s, or as long as asked (the stat refund note, ID-084)', () => {
    vi.useFakeTimers();
    try {
      const { root, h } = hud(true);
      const toast = root.querySelector<HTMLElement>('.hud-toast')!;
      h.toast('short');
      vi.advanceTimersByTime(2000);
      expect(toast.hidden).toBe(true);
      h.toast(LEVELS_REWORKED, 8000);
      expect(toast.textContent).toBe(LEVELS_REWORKED);
      vi.advanceTimersByTime(7999);
      expect(toast.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns of a swarm wave: countdown, then the alarm, and the red wave line throughout (ID-121)', () => {
    const { root, h } = hud(true);
    const s = startSquadHorde({ ...squadGame(1, 5), skillPick: [] }, 1, NOW);
    const banner = root.querySelector<HTMLElement>('.hud-swarm')!;
    const count = root.querySelector<HTMLElement>('.hud-swarm-count')!;
    const edge = root.querySelector<HTMLElement>('.hud-swarm-edge')!;
    const line = root.querySelector<HTMLElement>('.hud-corner-wave')!;
    const calm = { ...s, swarm: false, wave: 6, enemies: [] };
    h.update(calm);
    expect([banner.hidden, edge.hidden]).toEqual([true, true]);
    expect(line.textContent).toMatch(/^Wave 6\//);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(false);
    // The break before wave 7, a swarm.
    const swarm = { ...calm, wave: 7, swarm: true, time: 10, breakUntil: 12.5 };
    h.update(swarm);
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toBe('Swarm incoming3');
    expect(banner.getAttribute('role')).toBe('status');
    expect(count.getAttribute('aria-hidden')).toBe('true');
    expect([count.hidden, edge.hidden]).toEqual([false, true]);
    expect(banner.classList.contains('hud-swarm-hit')).toBe(false);
    expect(line.textContent).toMatch(/^Swarm · Wave 7\//);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(true);
    // It hits: bigger banner, edge glow, no count.
    h.update({ ...swarm, time: 12.5 });
    expect(banner.textContent).toBe('Swarm!');
    expect([banner.hidden, count.hidden, edge.hidden]).toEqual([false, true, false]);
    expect(banner.classList.contains('hud-swarm-hit')).toBe(true);
    // Past its first seconds: only the marker stays.
    h.update({ ...swarm, time: 20 });
    expect([banner.hidden, edge.hidden]).toEqual([true, true]);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(true);
    // The next break, a swarm again: back to the steady warning.
    h.update({ ...swarm, time: 30, breakUntil: 31 });
    expect(banner.classList.contains('hud-swarm-hit')).toBe(false);
    expect(banner.textContent).toBe('Swarm incoming1');
    // Horde 9 (swarms on waves 4 and 9): the counter on to wave 5 with a wave-4 enemy still
    // standing, so the marker stays.
    const next = { ...calm, hordeNumber: 9, waveCount: waveCount(9), wave: 5, enemies: [] };
    const straggler = enemy(next, { wave: 4 });
    h.update(next);
    expect(line.textContent).toMatch(/^Swarm · Wave 5\//);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(true);
    // The wave over, its last enemy down: the marker clears.
    straggler.hp = 0;
    h.update(next);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(false);
    h.update(calm);
    expect([banner.hidden, edge.hidden]).toEqual([true, true]);
    expect(line.classList.contains('hud-corner-wave-swarm')).toBe(false);
    expect(line.textContent).not.toContain('Swarm');
  });

  it('has no cash shop, and shows the horde corner: badge, wave line and the fight XP bar (ID-098)', () => {
    const { root, h } = hud(true);
    const s = startSquadHorde({ ...squadGame(2, 2), skillPick: [] }, 1, NOW);
    h.update(s);
    // Nothing picked (ID-100): the bottom row shows no button at all.
    const shown = root.querySelectorAll('.hud-shop-item:not([hidden])');
    expect(shown).toHaveLength(0);
    const corner = root.querySelector<HTMLElement>('.hud-corner')!;
    expect(corner.hidden).toBe(false);
    expect(corner.title).toBe(squadStatus(s));
    // One enemy count and one wave figure on screen, tooltips included (ID-167): nothing
    // can disagree with them, or go stale beside them.
    const said = () =>
      [
        root.textContent ?? '',
        ...[...root.querySelectorAll('[title], [aria-label]')].flatMap((e) => [
          e.getAttribute('title') ?? '',
          e.getAttribute('aria-label') ?? '',
        ]),
      ].join(' | ');
    expect(said().match(/\d[\d,]* left(?![a-z])/g)).toEqual([
      `${enemiesLeft(s).toLocaleString('en-US')} left`,
    ]);
    expect(said().match(/Waves?(?: cleared)? \d+\//g)).toEqual(['Wave 1/']);
    // A big wave: still one count, in one format.
    h.update({ ...s, toSpawn: 1234 });
    const big = enemiesLeft({ ...s, toSpawn: 1234 }).toLocaleString('en-US');
    expect(big).toContain(',');
    expect(said().match(/\d[\d,]* left(?![a-z])/g)).toEqual([`${big} left`]);
    h.update(s);
    expect(root.querySelector('.hud-badge-label')!.textContent).toBe('Horde');
    expect(root.querySelector('.hud-badge-num')!.textContent).toBe('2');
    expect(root.querySelector('.hud-badge')!.classList.contains('hud-badge-boss-on')).toBe(false);
    expect(root.querySelector('.hud-corner-wave')!.textContent).toBe(
      `Wave 1/${s.waveCount} · ${enemiesLeft(s).toLocaleString('en-US')} left`,
    );
    expect(root.querySelector('.hud-xp-label')!.textContent).toBe(xpBar(s).text);
    const meter = root.querySelector<HTMLMeterElement>('.hud-xp-meter')!;
    expect(meter.max).toBe(xpBar(s).max);
    expect(meter.getAttribute('aria-label')).toBe(xpBar(s).label);
  });

  it('a boss horde marks its badge; the wave line caps at the last wave and follows the fight', () => {
    const { root, h } = hud(true);
    const s = startSquadHorde(squadGame(1, RADIO_HORDES[0]), 1, NOW);
    h.update({ ...s, wave: s.waveCount, toSpawn: 3, enemies: [] });
    expect(root.querySelector('.hud-badge')!.classList.contains('hud-badge-boss-on')).toBe(true);
    expect(root.querySelector('.hud-badge')!.getAttribute('aria-label')).toBe(
      `Horde ${RADIO_HORDES[0]}, boss horde`,
    );
    expect(root.querySelector('.hud-corner-wave')!.textContent).toBe(
      `Wave ${s.waveCount}/${s.waveCount} · 3 left`,
    );
    h.update({ ...s, wave: s.waveCount, toSpawn: 674248, enemies: [] });
    expect(root.querySelector('.hud-corner-wave')!.textContent).toMatch(/ · 674,248 left$/);
    h.update({ ...s, wave: s.waveCount, outcome: 'won', toSpawn: 0, enemies: [] });
    expect(root.querySelector('.hud-corner-wave')!.textContent).toMatch(/ · 0 left$/);
  });

  it('the power row: Squad Power against Recommended, a meter in its band and a tick at Recommended', () => {
    const { root, h } = hud(true);
    h.update(startSquadHorde(squadGame(2, 2), 1, NOW));
    const row = root.querySelector<HTMLElement>('.hud-power')!;
    // Hidden until the app says what the fight's numbers are.
    expect(row.hidden).toBe(true);
    h.fightPower(powerLine(1240, 1400));
    expect(row.hidden).toBe(false);
    expect(root.querySelector('.hud-power-label')!.textContent).toBe('Power 1,240 · rec 1,400');
    expect(row.dataset.band).toBe('close');
    const meter = root.querySelector<HTMLElement>('.hud-power-meter')!;
    expect(meter.getAttribute('role')).toBe('meter');
    expect(meter.getAttribute('aria-label')).toBe('Squad Power against Recommended Power');
    expect(meter.getAttribute('aria-valuemax')).toBe('1680');
    expect(meter.getAttribute('aria-valuenow')).toBe('1240');
    expect(meter.getAttribute('aria-valuetext')).toContain('close');
    // Filled to 1,240 of 1,680 (1.2 × rec); the tick at Recommended, 1,400 of 1,680.
    expect(root.querySelector<HTMLElement>('.hud-power-fill')!.style.width).toBe('73.8%');
    expect(root.querySelector<HTMLElement>('.hud-power-tick')!.style.left).toBe('83.3%');
    h.fightPower(powerLine(2000, 1400));
    expect(row.dataset.band).toBe('ok');
    expect(root.querySelector<HTMLElement>('.hud-power-fill')!.style.width).toBe('100%');
    expect(meter.getAttribute('aria-valuenow')).toBe('1680');
    h.fightPower(powerLine(500, 1400));
    expect(row.dataset.band).toBe('short');
    h.fightPower(null);
    expect(row.hidden).toBe(true);
  });

  it('the full game’s HUD keeps its shop row and its plain status line, with no corner', () => {
    const { root, h } = hud(false);
    expect(root.querySelector<HTMLElement>('.hud-shop')!.hidden).toBe(false);
    expect(root.querySelector('.hud-corner')).toBeNull();
    expect(root.querySelector('.hud-corner-bar')).toBeNull();
    h.update(startSquadHorde(squadGame(2, 2), 1, NOW));
    expect(root.querySelector('.hud-fight-bar')!.textContent).toMatch(/^Horde 2 · Wave 1\//);
  });

  it('puts every line and name on the page as text, never as markup', () => {
    const { root, h } = hud(true);
    const g = squadGame(2, 3);
    const evil = '<img src=x onerror=alert(1)>';
    g.roster[0] = { ...g.roster[0]!, name: evil, xp: 0 };
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    // The only pictures are the drop tile's own icon (ID-073) and the skill pick's (ID-100).
    const imgs = [
      ...root.querySelectorAll<HTMLImageElement>('.hud-result img:not(.hud-skill-option img)'),
    ];
    expect(imgs.map((i) => i.parentElement!.className)).toEqual(['tile-icon']);
    expect(imgs[0]!.getAttribute('src')).toBe(ART_URLS[screen.debrief!.drop!.icon]);
    // The debrief (ID-067): their card names them.
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    // The name is the button that opens their card (ID-086): text, label and id stay plain.
    const open = root.querySelector<HTMLButtonElement>('.squad-card-open')!;
    expect(open.textContent).toBe(evil);
    expect(open.getAttribute('aria-label')).toBe(`${evil}: open survivor card`);
    // Its hover title (ID-111) is the plain name too.
    expect(open.title).toBe(evil);
    expect(open.dataset.openSurvivor).toBe(g.roster[0]!.id);
    // The level line is plain text too (ID-146).
    expect(root.querySelector('.squad-card-bonus')!.children).toHaveLength(0);
    expect(root.querySelectorAll('.hud-result img:not(.hud-skill-option img)')).toHaveLength(1);
    // The start screen's card names them as text too.
    h.showResult(squadStart(g));
    expect(root.querySelector('.hud-result img:not(.hud-skill-option img)')).toBeNull();
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
  });
});

describe('no stat-point UI on the result and start screens (ID-146)', () => {
  function hud() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    return { root, h };
  }
  const GONE = '.hud-pick-stat, .squad-plus, .squad-points, .squad-undo, .squad-pick';

  /** A squad of `n` at level 2; those in `up` level on a win. */
  function levelling(n: number, up: number[]): GameState {
    const g = squadGame(n);
    return {
      ...g,
      roster: g.roster.map((d, i) => ({
        ...d,
        xp: up.includes(i) ? xpForLevel(3) - 1 : xpForLevel(2),
      })),
    };
  }

  it('a win, a loss and the start screen have no stat button, badge, count or Undo', () => {
    const { root, h } = hud();
    const g = levelling(3, [0, 1, 2]);
    for (const screen of [
      squadScreen(g, ended(g, 'won')),
      squadScreen(g, ended(g, 'lost')),
      squadStart(g),
    ]) {
      h.showResult(screen);
      expect(root.querySelector(GONE)).toBeNull();
      expect(root.textContent).not.toMatch(
        /stat point|points? left|Undo|Instinct|Agility|Sharp Mind|Tinker/,
      );
      // The keyboard starts on the footer's button, not on a card.
      expect(document.activeElement).toBe(root.querySelector('.hud-result-foot > .hud-button'));
    }
  });

  it('each card shows the level line for its level (ID-146)', () => {
    const { root, h } = hud();
    const g = levelling(2, [0, 1]);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    const lines = [...root.querySelectorAll('.squad-card .squad-card-bonus')].map(
      (p) => p.textContent,
    );
    expect(lines).toEqual(screen.debrief!.cards.map((c) => levelText(c.level, true)));
    expect(lines[0]).toMatch(/^\+\d+\u00a0HP\u00a0· /);
    h.showResult(squadStart(g));
    expect(
      [...root.querySelectorAll('.squad-card .squad-card-bonus')].map((p) => p.textContent),
    ).toEqual(g.roster.map(() => levelText(2, true)));
  });

  it('a level-up adds no part to a card: every card has the same parts', () => {
    const { root, h } = hud();
    const shapes = (): string[] =>
      [...root.querySelectorAll('.squad-card')].map((c) =>
        [...c.querySelectorAll('*')]
          .filter((e) => !e.closest('.squad-card-who'))
          .map((e) => `${e.tagName}.${e.classList[0] ?? ''}`)
          .join(' '),
      );
    const none = levelling(3, []);
    h.showResult(squadScreen(none, ended(none, 'lost')));
    expect(shapes()).toHaveLength(3);
    expect(new Set(shapes()).size).toBe(1);
    const all = levelling(3, [0, 1, 2]);
    h.showResult(squadScreen(all, ended(all, 'won')));
    expect(shapes()).toHaveLength(3);
    expect(new Set(shapes()).size).toBe(1);
  });
});

const SWAP: Swap = { inId: 'b', inName: 'Bo', outId: 'a', outName: 'Al', hp: 5, maxHp: 50, at: 10 };

describe('mid-fight swaps on the HUD (ID-148)', () => {
  function benchGame(bench: number): GameState {
    const g = squadGame(SQUAD_CAP, 3);
    const reserve = Array.from({ length: bench }, (_, i) => recruit(SQUAD_CAP + i + 1));
    return { ...g, reserve, camp: { ...g.camp, recruits: SQUAD_CAP + bench } };
  }

  it('counts the swaps still to come; none shown with an empty bench', () => {
    const s = startSquadHorde(benchGame(4), 1, NOW);
    expect(swapsText(s)).toBe('Swaps left 3');
    expect(squadStatus(s)).toMatch(/ · Swaps left 3$/);
    // Only as many as the bench has.
    expect(swapsText(startSquadHorde(benchGame(2), 1, NOW))).toBe('Swaps left 2');
    // All used up: still shown, at 0.
    expect(swapsText({ ...s, subs: [], swapsLeft: 0, swaps: [SWAP, SWAP, SWAP] })).toBe(
      'Swaps left 0',
    );
    const none = startSquadHorde(benchGame(0), 1, NOW);
    expect(swapsText(none)).toBeNull();
    expect(squadStatus(none)).not.toMatch(/Swaps/);
  });

  it('says who takes over from whom for SWAP_NOTE.fight s of fight time', () => {
    const s = { ...startSquadHorde(benchGame(1), 1, NOW), swaps: [SWAP], time: 10 };
    const fight = SWAP_NOTE.fight;
    expect(swapNote(s)).toBe('Bo takes over from Al');
    expect(swapNote({ ...s, time: 10 + fight - 0.01 })).toBe('Bo takes over from Al');
    expect(swapNote({ ...s, time: 10 + fight })).toBeNull();
    expect(swapNote({ ...s, outcome: 'won' })).toBeNull();
    expect(swapNote({ ...s, swaps: [] })).toBeNull();
  });

  it('a second swap close behind joins the note, never hides the first', () => {
    const next: Swap = { ...SWAP, inName: 'Cy', outName: 'Di', at: 11 };
    const s = { ...startSquadHorde(benchGame(2), 1, NOW), swaps: [SWAP, next], time: 11.5 };
    expect(swapNote(s)).toBe('Bo takes over from Al · Cy takes over from Di');
    // The first drops out on its own time.
    expect(swapNote({ ...s, time: 10 + SWAP_NOTE.fight })).toBe('Cy takes over from Di');
  });

  it('holds the note SWAP_NOTE.realMs of real time too, so it reads at 5×', () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
      const note = root.querySelector<HTMLElement>('.hud-swap-note')!;
      const s = { ...startSquadHorde(benchGame(1), 1, NOW), swaps: [SWAP], time: 10 };
      h.update(s);
      expect(note.hidden).toBe(false);
      // At 5× its fight time is gone in 0.6 s of real time: it stays up.
      vi.advanceTimersByTime(600);
      h.update({ ...s, time: 10 + SWAP_NOTE.fight });
      expect(note.hidden).toBe(false);
      vi.advanceTimersByTime(SWAP_NOTE.realMs - 600);
      h.update({ ...s, time: 13.5 });
      expect(note.hidden).toBe(true);
      // The fight ending takes it down at once.
      h.update(s);
      expect(note.hidden).toBe(false);
      h.update({ ...s, time: 14, outcome: 'won' });
      expect(note.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the counter in the corner and the note, as text', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const chip = root.querySelector<HTMLElement>('.hud-corner-swaps')!;
    const note = root.querySelector<HTMLElement>('.hud-swap-note')!;
    const s = startSquadHorde(benchGame(3), 1, NOW);
    h.update(s);
    expect([chip.hidden, chip.textContent, note.hidden]).toEqual([false, 'Swaps left 3', true]);
    expect(chip.title).toBe(SWAPS_TIP);
    // Names pass the save's allow-list first; even so the note only ever copies text.
    const evil = { ...SWAP, inName: '<img src=x onerror=alert(1)>', outName: '<b>Al</b>\u202e' };
    h.update({ ...s, subs: s.subs!.slice(1), swapsLeft: 2, swaps: [evil], time: 10 });
    expect([chip.textContent, note.hidden]).toEqual(['Swaps left 2', false]);
    expect(note.textContent).toBe('<img src=x onerror=alert(1)> takes over from <b>Al</b>\u202e');
    expect(note.querySelector('img, b')).toBeNull();
    expect(note.getAttribute('role')).toBe('status');
    // Off once the fight ends (the timed hold has its own test).
    h.update({ ...s, swaps: [evil], time: 10 + SWAP_NOTE.fight, outcome: 'lost' });
    expect(note.hidden).toBe(true);
    h.update(startSquadHorde(benchGame(0), 1, NOW));
    expect(chip.hidden).toBe(true);
  });
});

describe('a survivor just accepted into the squad (ID-157)', () => {
  function hud() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const result = root.querySelector<HTMLElement>('.hud-result')!;
    const foot = root.querySelector<HTMLElement>('.hud-result-foot')!;
    // jsdom has no layout: the panel's scroll offset is kept here.
    let top = 0;
    Object.defineProperty(result, 'scrollTop', {
      get: () => top,
      set: (v: number) => (top = v),
      configurable: true,
    });
    const rect = (el: Element, t: number, b: number): void => {
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: t, bottom: b } as DOMRect);
    };
    return { root, h, result, foot, rect, scroll: () => top };
  }
  /** Survivor 2 of `g` as just accepted; `g`'s first levels up on a win when `up`. */
  function joined(up: boolean): { g: GameState; won: GameState } {
    // Just into Lv 2: a win's XP doesn't reach Lv 3. One short of it levels.
    const g = squadGame(1, 1, up ? xpForLevel(2) - 1 : xpForLevel(2));
    return { g, won: { ...g, roster: [...g.roster, recruit(2)] } };
  }
  const card = (root: ParentNode, id: string) =>
    [...root.querySelectorAll<HTMLElement>('.squad-card')].find((c) => c.dataset.defender === id);

  it('joinedCard: their plain card marked fresh; null for anyone not in the squad', () => {
    const { won } = joined(false);
    const c = joinedCard(won, 'recruit-2')!;
    expect(c).toMatchObject({ id: 'recruit-2', name: recruit(2).name, level: 1, fresh: true });
    expect(c.levelUp).toBe(false);
    expect(c.xp).toBeNull();
    expect(joinedCard(won, 'recruit-9')).toBeNull();
    // Benched (past the squad's cap) is not in the squad.
    const seven = squadGame(7);
    expect(joinedCard(seven, 'recruit-7')).toBeNull();
  });

  it('a win with a level-up: their card goes after it, marked New once however often shown', () => {
    const { root, h } = hud();
    const { g, won } = joined(true);
    h.showResult(squadScreen(g, ended(g, 'won')));
    expect(card(root, 'recruit-1')).toBeDefined();
    const c = joinedCard(won, 'recruit-2')!;
    h.showJoined(c);
    h.showJoined(c);
    const ids = [...root.querySelectorAll<HTMLElement>('.squad-card')].map(
      (x) => x.dataset.defender,
    );
    expect(ids).toEqual(['recruit-1', 'recruit-2']);
    const fresh = card(root, 'recruit-2')!;
    expect(fresh.classList.contains('squad-card-new')).toBe(true);
    expect([...fresh.querySelectorAll('.squad-badge-new')].map((b) => b.textContent)).toEqual([
      NEW_BADGE,
    ]);
    // The level-up keeps its own badge and is not marked New.
    expect(card(root, 'recruit-1')!.classList.contains('squad-card-new')).toBe(false);
  });

  it('a win with no level-up: the "nobody levelled up" line gives way to the Squad with their card', () => {
    const { root, h } = hud();
    const { g, won } = joined(false);
    h.showResult(squadScreen(g, ended(g, 'won')));
    expect(root.querySelector('.debrief-empty')).not.toBeNull();
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(root.querySelector('.debrief-empty')).toBeNull();
    expect(root.querySelectorAll('.debrief-squad')).toHaveLength(1);
    expect(root.querySelector('.debrief-squad .debrief-stash')).not.toBeNull();
    expect(card(root, 'recruit-2')!.classList.contains('squad-card-new')).toBe(true);
  });

  it('the start screen: their card already there is marked, not added again', () => {
    const { root, h } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(root.querySelectorAll('.squad-card')).toHaveLength(2);
    expect(
      [...root.querySelectorAll<HTMLElement>('.squad-card-new')].map((c) => c.dataset.defender),
    ).toEqual(['recruit-2']);
  });

  it('scrolls a card under the pinned footer up just clear of it', () => {
    const { root, h, result, foot, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    rect(result, 0, 600);
    rect(foot, 400, 600);
    rect(card(root, 'recruit-2')!, 500, 600);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    // Its bottom to 8 px above the footer: 600 - (400 - 8).
    expect(scroll()).toBe(208);
  });

  it('scrolls a card above the panel’s top down to it, and leaves one in view alone', () => {
    const { root, h, result, foot, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    result.scrollTop = 300;
    rect(result, 0, 600);
    rect(foot, 400, 600);
    const c = card(root, 'recruit-2')!;
    rect(c, -100, 0);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(192);
    rect(c, 100, 300);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(192);
  });

  it('a card taller than the space shows from its top', () => {
    const { root, h, result, foot, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    rect(result, 0, 600);
    rect(foot, 400, 600);
    rect(card(root, 'recruit-2')!, 100, 900);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(92);
  });

  it('does nothing with the result screen down', () => {
    const { root, h } = hud();
    const { won } = joined(false);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(root.querySelector('.squad-card')).toBeNull();
  });

  it('two accepted in a row: both cards are marked New', () => {
    const { root, h } = hud();
    const { g, won } = joined(false);
    const both = { ...won, roster: [...won.roster, recruit(3)] };
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined(joinedCard(both, 'recruit-2')!);
    h.showJoined(joinedCard(both, 'recruit-3')!);
    const marked = [...root.querySelectorAll<HTMLElement>('.squad-card-new')];
    expect(marked.map((c) => c.dataset.defender)).toEqual(['recruit-2', 'recruit-3']);
  });

  it('benched or let go from the Roster since: their New card goes, and the empty line comes back', () => {
    const { root, h } = hud();
    const { g, won } = joined(false);
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined(joinedCard(won, 'recruit-2')!);
    h.showGear(squadGear(won), noop);
    expect(card(root, 'recruit-2')!.querySelector('select')).not.toBeNull();
    // Recruit 2 benched: the squad is recruit 1 alone again.
    h.showGear(squadGear({ ...won, roster: g.roster, reserve: [recruit(2)] }), noop);
    expect(card(root, 'recruit-2')).toBeUndefined();
    expect(root.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
    expect(root.querySelector('.debrief-stash')!.textContent).not.toBe('');
  });

  it('a level-up card stays when the newcomer is benched', () => {
    const { root, h } = hud();
    const { g, won } = joined(true);
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined(joinedCard(won, 'recruit-2')!);
    h.showGear(squadGear({ ...won, roster: g.roster, reserve: [recruit(2)] }), noop);
    const ids = [...root.querySelectorAll<HTMLElement>('.squad-card')].map(
      (x) => x.dataset.defender,
    );
    expect(ids).toEqual(['recruit-1']);
    expect(root.querySelector('.debrief-empty')).toBeNull();
  });
});
