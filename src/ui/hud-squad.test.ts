// @vitest-environment jsdom
// The horde-only HUD (ID-066): the minimal top bar (horde, waves cleared, enemies left)
// with the fight XP bar, no shop row, and the start, result and ending screens. Text
// reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { LEVELS_REWORKED } from './build.ts';
import { BENCH_XP_SHARE, RADIO_HORDES, SQUAD_CAP, SQUAD_XP_RATE } from '../core/data.ts';
import { hordeXp, newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { squadResult, startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import { horrorAbility, waveCount, xpToNext } from '../core/waves.ts';
import {
  benchXpText,
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
import { noJoinText } from './joining.ts';
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

describe('bench XP on the result panel (ID-206)', () => {
  const benched = (xp = 0): GameState => ({
    ...squadGame(2, 4),
    reserve: [{ ...recruit(3), xp }],
    camp: { ...squadGame(2, 4).camp, recruits: 3 },
  });
  const share = Math.floor(hordeXp(4) * SQUAD_XP_RATE * BENCH_XP_SHARE);

  it('formats the line, none when nobody is benched or nothing was earned', () => {
    expect(benchXpText([{ xp: 12 }])).toBe('Bench +12 XP');
    expect(benchXpText([{ xp: 12 }, { xp: 12 }])).toBe('Bench +12 XP each');
    expect(benchXpText([{ xp: 10 }, { xp: 12 }])).toBe('Bench +10–12 XP');
    expect(benchXpText([{ xp: 0 }, { xp: 12 }])).toBe('Bench +12 XP');
    expect(benchXpText([])).toBeNull();
    expect(benchXpText([{ xp: 0 }])).toBeNull();
  });

  it('a win shows "Bench +N XP" in the lines and as a chip', () => {
    const g = benched();
    const s = squadScreen(g, ended(g, 'won'));
    expect(s.lines).toContain(`Bench +${share} XP`);
    expect(s.debrief!.chips.map((c) => c.text)).toContain(`Bench +${share} XP`);
  });

  it('a bench level-up is shown like a fighter who levelled', () => {
    const g = benched(xpForLevel(2) - 1);
    const s = squadScreen(g, ended(g, 'won'));
    expect(s.debrief!.cards!.map((c) => [c.name, c.levelUp])).toContainEqual([
      recruit(3).name,
      true,
    ]);
  });

  it('a loss that paid XP shows the bench line too; with none earned, no line', () => {
    const g = benched();
    const h = { ...ended(g, 'lost'), wave: 6 };
    const lost = squadScreen(g, h);
    expect(lost.lines.some((l) => /^Bench \+\d+ XP$/.test(l))).toBe(true);
    expect(squadScreen(g, ended(g, 'lost')).lines.join(' ')).not.toMatch(/Bench/);
  });

  it('a loss with a large bench shows cards for fighters and levelled bench only', () => {
    const g: GameState = {
      ...squadGame(2, 4),
      reserve: Array.from({ length: 30 }, (_, i) => ({
        ...recruit(i + 3),
        xp: i === 0 ? xpForLevel(2) - 1 : 0,
      })),
    };
    const h = { ...ended(g, 'lost'), wave: 6 };
    const s = squadScreen(g, h);
    expect(s.debrief!.cards!.map((c) => c.name)).toEqual([
      recruit(1).name,
      recruit(2).name,
      recruit(3).name,
    ]);
    const xp = squadResult(g, h).bench[0]!.xp;
    expect(xp).toBeGreaterThan(0);
    expect(s.debrief!.chips.map((c) => c.text)).toContain(`Bench +${xp} XP each`);
  });

  it('no bench, no line', () => {
    const g = squadGame(2, 4);
    expect(squadScreen(g, ended(g, 'won')).lines.join(' ')).not.toMatch(/Bench/);
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
    expect(squadStart(squadGame(1, 10)).title).toBe('Horde 10');
  });

  it('a win: XP and level-ups by name, the new survivor, and the next horde', () => {
    const g = squadGame(2, 5, 0);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe('Horde 5 - You hold the line');
    expect(screen.lines.some((l) => l.startsWith(`${recruit(1).name} +`))).toBe(true);
    expect(screen.lines.some((l) => l.endsWith(' · level up!'))).toBe(true);
    expect(screen.lines.join(' ')).not.toMatch(/stat point/);
    expect(screen.lines.some((l) => /level 2 · \d+\/50 XP to level 3/.test(l))).toBe(true);
    // The newcomer asks on the camp tile, not in the (unrendered) lines (ID-182).
    expect(screen.lines.join(' ')).not.toMatch(/asks to join/);
    expect(screen.debrief!.join).toBe(true);
    // A newcomer is asking, so no reason why nobody came is in the details.
    expect(screen.debrief!.notes!.join(' ')).not.toMatch(/Nobody new/);
    expect(screen.lines.join(' ')).not.toMatch(/Camp|Genes|Payout|Repair|injured/);
    expect(screen.button).toBe(startLabel(6));
    expect(screen.squad).toBe(true);
  });

  it('a win past 6 whose roll misses says why nobody joins on the camp tile (seed 1, ID-182)', () => {
    const g = squadGame(SQUAD_CAP, 2);
    const s = squadScreen(g, ended(g, 'won'));
    expect(s.debrief!.join).toBe(true);
    // The reason is the last sentence of the details (ID-196), not a camp tile or a line.
    expect(s.debrief!.notes!.at(-1)).toBe(noJoinText('nobody-first', SQUAD_CAP));
    expect(s.lines.join(' ')).not.toMatch(/Nobody new/);
  });

  it('a boss horde’s first clear names its card unlock, and radio only in the goal line (ID-127, ID-196, ID-217)', () => {
    const at10 = squadGame(SQUAD_CAP, 10);
    const a = squadScreen(at10, ended(at10, 'won'));
    expect(a.title).toBe('Horde 10 - You hold the line');
    expect(a.button).toBe(startLabel(11));
    // The last line is the next goal (ID-217); the boss sentence comes before it.
    expect(a.lines.at(-1)).toBe(a.debrief!.goal);
    expect(a.lines.at(-2)).toBe('Boss horde beaten. New card unlocked: Heavy Rounds.');
    expect(a.debrief!.notes![0]).toBe(a.lines.at(-2));
    // The chip names the card (its sentence is in the details); no radio pill (ID-196).
    const unlock = a.debrief!.chips.find((c) => c.text === 'New card: Heavy Rounds');
    expect(unlock).toMatchObject({ details: true });
    expect(a.debrief!.chips.map((c) => c.text).join(' ')).not.toMatch(/Radio/);
    const at20 = squadGame(SQUAD_CAP, 20);
    const b = squadScreen(at20, ended(at20, 'won'));
    expect(b.debrief!.notes![0]).toBe('Boss horde beaten. New card unlocked: Field Repairs.');
    // No other horde finds a part.
    const at11 = squadGame(SQUAD_CAP, 11);
    const c = squadScreen(at11, ended(at11, 'won'));
    expect(c.lines.join(' ')).not.toMatch(/Boss horde beaten/);
    expect(c.debrief!.chips.map((x) => x.text).join(' ')).not.toMatch(/Radio/);
  });

  it('the finale’s first clear is the ending screen: Continue into Endless (ID-127)', () => {
    const g = squadGame(SQUAD_CAP, 30);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe(EVACUATION_TITLE);
    expect(screen.button).toBe('Continue');
    expect(screen.debrief!.notes![0]).toBe(
      'You held the camp and the evacuation is called. Play on in Endless for a best horde.',
    );
    expect(screen.debrief!.chips[0]!.text).toBe('Horde 30 held');
    expect(screen.debrief!.chips.map((c) => c.text).join(' ')).not.toMatch(/Radio/);
    // Continue starts the first Endless horde.
    expect(screen.picker!.value).toBe(31);
  });

  it('the start screen has no radio pill, then Endless and the best horde (ID-127, ID-196)', () => {
    const chips = (horde: number, picked?: number): string[] =>
      squadStart(squadGame(1, horde), picked).debrief!.chips.map((c) => c.text);
    // The campaign: waves and squad only, from the first horde to the finale.
    for (const horde of [1, 10, 11, 21, 30]) {
      expect(chips(horde)).toEqual([
        ...(horrorAbility(horde) ? ['Boss horde'] : []),
        `${waveCount(horde)} waves`,
        `Squad 1/${SQUAD_CAP}`,
      ]);
    }
    expect(chips(31)[0]).toBe('Endless · best 30');
    expect(chips(45)[0]).toBe('Endless · best 44');
    // The goal says the same whichever horde the picker is on.
    expect(chips(45, 5)[0]).toBe('Endless · best 44');
    // The rule sits after the squad; in Endless the horde to hold leads it.
    expect(squadStart(squadGame(1, 11)).debrief!.note).toBe(SQUAD_LOSS_RULE);
    expect(squadStart(squadGame(1, 45)).debrief!.note).toBe(
      `Evacuation called. Hold Horde 45 for a new best. ${SQUAD_LOSS_RULE}`,
    );
    // Its lines keep the goal after the rule (ID-066).
    expect(squadStart(squadGame(1, 45)).lines).toContain(
      'Evacuation called. Hold Horde 45 for a new best.',
    );
  });

  it('the campaign start screen says radio only in its goal line: no pill, no explainer, no note (ID-196, ID-217)', () => {
    for (const horde of [1, 5, 10, 11, 20, 21, 30]) {
      const g = squadGame(2, horde);
      const { goal, ...d } = squadStart(g).debrief!;
      expect(goal).toMatch(/^Next: Horde /);
      expect(d.chips.map((c) => c.text).join(' ')).not.toMatch(/radio/i);
      expect(d.note).toBe(SQUAD_LOSS_RULE);
      expect(JSON.stringify(d)).not.toMatch(/radio/i);
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
      h.showResult(squadStart(g));
      const panel = root.querySelector('.hud-result')!.cloneNode(true) as HTMLElement;
      panel.querySelectorAll('.debrief-goal').forEach((e) => e.remove());
      expect(panel.textContent).not.toMatch(/radio/i);
      expect(root.querySelector('.radio-help, [data-radio-toggle], .chip-toggle')).toBeNull();
    }
  });

  it('a loss: no XP, the same horde again with everyone back and a full wall', () => {
    const g = squadGame(3, 6);
    const screen = squadScreen(g, ended(g, 'lost'));
    expect(screen.title).toBe('Horde 6 - Camp has fallen');
    // No wave cleared: no XP (ID-098).
    expect(screen.lines).toContain(lossXpText(0));
    expect(screen.button).toBe('Retry Horde 6');
    expect(screen.lines.join(' ')).not.toMatch(/Food|Medicine|Repair/);
    expect(screen.debrief!.note).toBe(
      'Retry Horde 6, or farm an easier horde: the squad and the wall are back at full strength',
    );
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

  it('an answer on the camp tile is text, never markup (ID-182)', () => {
    const { root, h } = hud(true);
    const g = squadGame(2, 5, 0);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const hostile = '<img src=x onerror=alert(1)>';
    h.noteJoin(hostile);
    h.showJoin([]);
    h.showJoin([], true);
    const tile = root.querySelector<HTMLElement>('.debrief-join')!;
    expect(tile.hidden).toBe(false);
    expect(tile.querySelector('.join-answer')!.textContent).toBe(hostile);
    expect(tile.querySelector('img')).toBeNull();
    expect(tile.children.length).toBeGreaterThan(0);
  });

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
    // The banner goes after 3 s; the edge glow keeps flashing to 8 s (ID-175).
    h.update({ ...swarm, time: 16 });
    expect([banner.hidden, edge.hidden]).toEqual([true, false]);
    h.update({ ...swarm, time: 20.4 });
    expect(edge.hidden).toBe(false);
    // Past its first 8 s: only the marker stays.
    h.update({ ...swarm, time: 20.5 });
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
    // The only pictures: each gun chip's icon (ID-073), each card's avatar (ID-196) and the
    // skill pick's (ID-100); a name never makes one.
    const imgs = [
      ...root.querySelectorAll<HTMLImageElement>('.hud-result img:not(.hud-skill-option img)'),
    ];
    const guns = screen.debrief!.drop!.guns;
    expect(imgs.map((i) => i.parentElement!.className).sort()).toEqual(
      [
        'roster-avatar squad-card-avatar',
        'roster-avatar squad-card-avatar',
        ...guns.map(() => 'tile-icon'),
      ].sort(),
    );
    expect(imgs.every((i) => i.alt === '')).toBe(true);
    expect(imgs.find((i) => i.closest('.tile-icon'))!.getAttribute('src')).toBe(
      ART_URLS[guns[0]!.icon],
    );
    // The debrief (ID-067): their card names them.
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    // The name is the button that opens their card (ID-086): text, label and id stay plain.
    const open = root.querySelector<HTMLButtonElement>('.squad-card-open')!;
    expect(open.textContent).toBe(evil);
    expect(open.getAttribute('aria-label')).toBe(
      `${evil}, level ${screen.debrief!.cards[0]!.level}: open survivor card`,
    );
    // Its hover title (ID-111) is the plain name too.
    expect(open.title).toBe(evil);
    expect(open.dataset.openSurvivor).toBe(g.roster[0]!.id);
    // The start screen's card names them as text too.
    h.showResult(squadStart(g));
    expect(
      [...root.querySelectorAll('.hud-result img:not(.hud-skill-option img)')].map(
        (i) => i.parentElement!.className,
      ),
    ).toEqual(['roster-avatar squad-card-avatar', 'roster-avatar squad-card-avatar']);
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    expect(root.querySelector('.squad-card-name')!.children).toHaveLength(0);
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
      expect(document.activeElement).toBe(root.querySelector('.hud-start-row > .hud-button'));
    }
  });

  it('each card names its survivor and reads its level aloud, with no level line (ID-146, ID-196)', () => {
    const { root, h } = hud();
    const g = levelling(2, [0, 1]);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    const open = () =>
      [...root.querySelectorAll<HTMLElement>('.squad-card .squad-card-open')].map((b) =>
        b.getAttribute('aria-label'),
      );
    expect(open()).toEqual(
      screen.debrief!.cards.map((c) => `${c.name}, level ${c.level}: open survivor card`),
    );
    expect(root.querySelector('.squad-card-bonus, .squad-card-level, .squad-card-xp')).toBeNull();
    h.showResult(squadStart(g));
    expect(open()).toEqual(g.roster.map((d) => `${d.name}, level 2: open survivor card`));
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
  function hud(overflows = true) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    // The body is the part that scrolls (ID-196), when it overflows; else the panel does.
    const body = root.querySelector<HTMLElement>('.hud-result-scroll')!;
    // jsdom has no layout: say whether the body's content is taller than the body.
    Object.defineProperty(body, 'scrollHeight', { value: overflows ? 900 : 300 });
    Object.defineProperty(body, 'clientHeight', { value: 300 });
    const result = overflows ? body : root.querySelector<HTMLElement>('.hud-result')!;
    // jsdom has no layout: the scroller's offset is kept here.
    let top = 0;
    Object.defineProperty(result, 'scrollTop', {
      get: () => top,
      set: (v: number) => (top = v),
      configurable: true,
    });
    const rect = (el: Element, t: number, b: number): void => {
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: t, bottom: b } as DOMRect);
    };
    return { root, h, result, rect, scroll: () => top };
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
    expect(root.querySelector('.debrief-squad .squad-grid')).not.toBeNull();
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

  it('scrolls a card below the body’s bottom up just clear of it', () => {
    const { root, h, result, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    rect(result, 0, 400);
    rect(card(root, 'recruit-2')!, 500, 600);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    // Its bottom to 8 px above the body's: 600 - (400 - 8).
    expect(scroll()).toBe(208);
  });

  it('scrolls a card above the body’s top down to it, and leaves one in view alone', () => {
    const { root, h, result, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    result.scrollTop = 300;
    rect(result, 0, 400);
    const c = card(root, 'recruit-2')!;
    rect(c, -100, 0);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(192);
    rect(c, 100, 300);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(192);
  });

  it('a card taller than the space shows from its top', () => {
    const { root, h, result, rect, scroll } = hud();
    const { won } = joined(false);
    h.showResult(squadStart(won));
    rect(result, 0, 400);
    rect(card(root, 'recruit-2')!, 100, 900);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(92);
  });

  it('a body that does not overflow leaves the scrolling to the panel (ID-196)', () => {
    const { root, h, result, rect, scroll } = hud(false);
    expect(result.classList.contains('hud-result')).toBe(true);
    const { won } = joined(false);
    h.showResult(squadStart(won));
    rect(result, 0, 400);
    rect(card(root, 'recruit-2')!, 500, 600);
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(scroll()).toBe(208);
    // The body's own offset never moved.
    expect(root.querySelector<HTMLElement>('.hud-result-scroll')!.scrollTop).toBe(0);
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

  it('benched or let go from the Roster since: their New card goes, and the empty line comes back (ID-196)', () => {
    const { root, h } = hud();
    const { g, won } = joined(false);
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined(joinedCard(won, 'recruit-2')!);
    expect(card(root, 'recruit-2')!.querySelector('select')).toBeNull();
    // Recruit 2 benched: the squad is recruit 1 alone again.
    h.showSquad(new Set(g.roster.map((d) => d.id)));
    expect(card(root, 'recruit-2')).toBeUndefined();
    expect(root.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
    expect(root.querySelector('.squad-card')).toBeNull();
  });

  it('a level-up card stays when the newcomer is benched', () => {
    const { root, h } = hud();
    const { g, won } = joined(true);
    h.showResult(squadScreen(g, ended(g, 'won')));
    h.showJoined(joinedCard(won, 'recruit-2')!);
    h.showSquad(new Set(g.roster.map((d) => d.id)));
    const ids = [...root.querySelectorAll<HTMLElement>('.squad-card')].map(
      (x) => x.dataset.defender,
    );
    expect(ids).toEqual(['recruit-1']);
    expect(root.querySelector('.debrief-empty')).toBeNull();
  });
});
