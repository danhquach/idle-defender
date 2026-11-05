// @vitest-environment jsdom
// The horde-only HUD (ID-066): the minimal top bar (horde, waves cleared, enemies left)
// with the fight XP bar, no shop row, and the start, result and ending screens. Text
// reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { ENDING_HORDE, SQUAD_CAP, TITLES } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { waveCount, xpToNext } from '../core/waves.ts';
import {
  createHud,
  defenderLabel,
  enemiesLeft,
  pickerRow,
  SQUAD_LOSS_RULE,
  SQUAD_POINTS_NOTE,
  squadScreen,
  squadStart,
  squadStatus,
  startLabel,
  xpBar,
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
const ended = (g: GameState, outcome: 'won' | 'lost') => ({
  ...startSquadHorde(g, 1, NOW),
  outcome,
});

describe('the horde-only top bar (ID-066)', () => {
  it('shows the horde, waves cleared and enemies left, and nothing of cash, bank or perks', () => {
    const s = startSquadHorde(squadGame(1, 3), 1, NOW);
    expect(squadStatus(s)).toBe(
      `Horde 3 · Waves cleared 0/${s.waveCount} · ${s.toSpawn} left in this wave`,
    );
    expect(squadStatus(s)).not.toMatch(/Cash|Bank|Perks/);
    expect(squadStatus({ ...s, wave: 3 })).toContain(`Waves cleared 2/${s.waveCount}`);
    expect(squadStatus({ ...s, outcome: 'won' })).toContain(
      `Waves cleared ${s.waveCount}/${s.waveCount}`,
    );
    expect(squadStatus({ ...s, toSpawn: 1 })).toContain('1 left in this wave');
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
    expect(screen.picks).toEqual([]);
    expect(screen.camp.offers).toEqual([]);
    expect(squadStart(squadGame(1, 10)).title).toBe('Horde 10 · Boss horde');
  });

  it('a win: XP and level-ups by name, the new survivor, stat points, and the next horde', () => {
    const g = squadGame(2, 5, 0);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe('Horde 5 held');
    expect(screen.lines.some((l) => l.startsWith(`${recruit(1).name} +`))).toBe(true);
    expect(screen.lines.some((l) => l.includes('level up! +'))).toBe(true);
    expect(screen.lines.some((l) => /level 2 · \d+\/50 XP to level 3/.test(l))).toBe(true);
    expect(screen.lines).toContain(
      `New survivor: ${recruit(3).name} joins the squad for the next horde`,
    );
    expect(screen.lines.join(' ')).not.toMatch(/Camp|Genes|Payout|Repair|injured/);
    expect(screen.picks.map((d) => d.id)).toEqual(['recruit-1', 'recruit-2']);
    expect(screen.button).toBe(startLabel(6));
    expect(screen.squad).toBe(true);
  });

  it('a win with the squad full says nobody joins', () => {
    const g = squadGame(SQUAD_CAP, 2);
    expect(squadScreen(g, ended(g, 'won')).lines).toContain(
      `Squad full (${SQUAD_CAP}/${SQUAD_CAP}): nobody new joins`,
    );
  });

  it('Horde 10’s win is the soft ending: Continue, and play goes on', () => {
    const g = squadGame(SQUAD_CAP, ENDING_HORDE);
    const screen = squadScreen(g, ended(g, 'won'));
    expect(screen.title).toBe(`You held Horde ${ENDING_HORDE}`);
    expect(screen.button).toBe('Continue');
    expect(screen.lines.at(-1)).toMatch(/^The end, for now/);
  });

  it('a loss: no XP, the same horde again with everyone back and a full wall', () => {
    const g = squadGame(3, 6);
    const screen = squadScreen(g, ended(g, 'lost'));
    expect(screen.title).toBe('The wall fell');
    expect(screen.lines).toContain('No XP on a loss');
    expect(screen.button).toBe('Retry Horde 6');
    expect(screen.picks).toEqual([]);
    expect(screen.lines.join(' ')).not.toMatch(/Food|Medicine|back at|Repair/);
  });

  it('the stat picker: a plain name, Aim and Grit only, no titles', () => {
    const top = TITLES[0]!.at;
    const d: RosterDefender = {
      ...recruit(1),
      xp: 10_000,
      stats: { aim: top, might: 0, tech: 0, grit: 0 },
    };
    const row = pickerRow(d, { aim: 0, might: 0, tech: 0, grit: 0 }, true);
    expect(row.heading).toMatch(new RegExp(`^${d.name} · `));
    expect(row.buttons.map((b) => b.stat)).toEqual(['aim', 'grit']);
    expect(row.note).toBe('');
    expect(pickerRow(d, { aim: 0, might: 0, tech: 0, grit: 0 }).note).not.toBe('');
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
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, squad);
    return { root, h };
  }

  it('has no shop row, and shows the top bar and the XP bar', () => {
    const { root, h } = hud(true);
    const s = startSquadHorde(squadGame(2, 2), 1, NOW);
    h.update(s);
    expect(root.querySelector<HTMLElement>('.hud-shop')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.hud-xp')!.hidden).toBe(false);
    expect(root.querySelector('.hud-fight-bar')!.textContent).toBe(squadStatus(s));
    expect(root.querySelector('.hud-xp-label')!.textContent).toBe(xpBar(s).label);
    const meter = root.querySelector<HTMLMeterElement>('.hud-xp-meter')!;
    expect(meter.max).toBe(xpBar(s).max);
    expect(root.querySelector('#hud-xp-label')).not.toBeNull();
    expect(meter.getAttribute('aria-labelledby')).toBe('hud-xp-label');
  });

  it('the full game’s HUD keeps its shop row and has no XP bar', () => {
    const { root } = hud(false);
    expect(root.querySelector<HTMLElement>('.hud-shop')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.hud-xp')!.hidden).toBe(true);
  });

  it('puts every line and name on the page as text, never as markup', () => {
    const { root, h } = hud(true);
    const g = squadGame(2, 3);
    const evil = '<img src=x onerror=alert(1)>';
    g.roster[0] = { ...g.roster[0]!, name: evil, xp: 0 };
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    expect(root.querySelector('.hud-result img')).toBeNull();
    expect(root.querySelector('.hud-result-list')!.textContent).toContain(evil);
    expect(root.querySelector('.hud-picker')!.textContent).toContain(evil);
    h.showResult(squadStart(g));
    expect(root.querySelector('.hud-result img')).toBeNull();
    expect(root.querySelector('.hud-result-list')!.textContent).toContain(evil);
  });

  it('the result screen’s picker offers Aim and Grit only', () => {
    const { root, h } = hud(true);
    const g = squadGame(1, 5);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const stats = [...root.querySelectorAll('.hud-pick-stat')].map((b) => b.textContent);
    expect(stats).toEqual(['+ Aim (0)', '+ Grit (0)']);
    expect(document.activeElement?.textContent).toBe('+ Aim (0)');
    expect(root.querySelector('.hud-picker')!.textContent).toContain(SQUAD_POINTS_NOTE);
    expect(root.querySelector('.hud-picker .hud-result-body')!.textContent).toBe(
      'Aim: Gun damage and crits · Grit: HP in hordes',
    );
    expect(root.querySelector('.hud-result > .hud-button')!.textContent).toBe(startLabel(6));
  });
});
