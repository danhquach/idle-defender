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
  lossXpText,
  powerLine,
  SQUAD_LOSS_RULE,
  squadScreen,
  squadStart,
  squadStatus,
  startLabel,
  xpBar,
} from './hud.ts';
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
  it('shows the horde, waves cleared and enemies left, and nothing of cash, bank or perks', () => {
    const s = startSquadHorde(squadGame(1, 3), 1, NOW);
    expect(squadStatus(s)).toBe(`Horde 3 · Waves cleared 0/${s.waveCount} · ${s.toSpawn} left`);
    expect(squadStatus(s)).not.toMatch(/Cash|Bank|Perks/);
    expect(squadStatus({ ...s, wave: 3 })).toContain(`Waves cleared 2/${s.waveCount}`);
    expect(squadStatus({ ...s, outcome: 'won' })).toContain(
      `Waves cleared ${s.waveCount}/${s.waveCount}`,
    );
    expect(squadStatus({ ...s, toSpawn: 1 })).toMatch(/ · 1 left$/);
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
      `New survivor: ${recruit(3).name} (${JOBS[recruit(3, 1).job].name}) joins the squad for the next horde`,
    );
    expect(screen.lines.join(' ')).not.toMatch(/Camp|Genes|Payout|Repair|injured/);
    expect(screen.button).toBe(startLabel(6));
    expect(screen.squad).toBe(true);
  });

  it('a win with the squad full says nobody joins', () => {
    const g = squadGame(SQUAD_CAP, 2);
    expect(squadScreen(g, ended(g, 'won')).lines).toContain(
      `Squad full (${SQUAD_CAP}/${SQUAD_CAP}): nobody new joins`,
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
