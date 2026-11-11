// @vitest-environment jsdom
// The horde-only HUD (ID-066): the minimal top bar (horde, waves cleared, enemies left)
// with the fight XP bar, no shop row, and the start, result and ending screens. Text
// reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { STATS_REFUNDED } from './build.ts';
import { ENDING_HORDE, SQUAD_CAP } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { xpForLevel } from '../core/stats.ts';
import { waveCount, xpToNext } from '../core/waves.ts';
import {
  createHud,
  defenderLabel,
  enemiesLeft,
  lossXpText,
  pickerRow,
  powerLine,
  SQUAD_LOSS_RULE,
  SQUAD_POINTS_NOTE,
  squadScreen,
  squadStart,
  squadStatus,
  startLabel,
  xpBar,
} from './hud.ts';
import { ART_URLS } from './sprites.ts';

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
    // No wave cleared: no XP (ID-098).
    expect(screen.lines).toContain(lossXpText(0));
    expect(screen.button).toBe('Retry Horde 6');
    expect(screen.picks).toEqual([]);
    expect(screen.lines.join(' ')).not.toMatch(/Food|Medicine|back at|Repair/);
  });

  it('the stat picker (ID-084): a plain name, every stat, Tinker greyed out', () => {
    const d: RosterDefender = {
      ...recruit(1),
      xp: 10_000,
      stats: { instinct: 2, agility: 0, mind: 1, tinker: 0 },
    };
    const row = pickerRow(d, true);
    expect(row.heading).toMatch(new RegExp(`^${d.name} · `));
    expect(row.buttons).toEqual([
      { stat: 'instinct', label: '+ Instinct (2)', disabled: false },
      { stat: 'agility', label: '+ Agility (0)', disabled: false },
      { stat: 'mind', label: '+ Sharp Mind (1)', disabled: false },
      { stat: 'tinker', label: 'Tinker (locked)', disabled: true },
    ]);
    // With no points left, every button is off.
    const none = pickerRow(
      { ...d, xp: 0, stats: { instinct: 0, agility: 0, mind: 0, tinker: 0 } },
      true,
    );
    expect(none.buttons.every((b) => b.disabled)).toBe(true);
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

  it('a toast stays 2 s, or as long as asked (the stat refund note, ID-084)', () => {
    vi.useFakeTimers();
    try {
      const { root, h } = hud(true);
      const toast = root.querySelector<HTMLElement>('.hud-toast')!;
      h.toast('short');
      vi.advanceTimersByTime(2000);
      expect(toast.hidden).toBe(true);
      h.toast(STATS_REFUNDED, 8000);
      expect(toast.textContent).toBe(STATS_REFUNDED);
      vi.advanceTimersByTime(7999);
      expect(toast.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(toast.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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
    const s = startSquadHorde(squadGame(1, ENDING_HORDE), 1, NOW);
    h.update({ ...s, wave: s.waveCount, toSpawn: 3, enemies: [] });
    expect(root.querySelector('.hud-badge')!.classList.contains('hud-badge-boss-on')).toBe(true);
    expect(root.querySelector('.hud-badge')!.getAttribute('aria-label')).toBe(
      `Horde ${ENDING_HORDE}, boss horde`,
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
    // The debrief (ID-067): their card, and their points row's button names them too.
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    // The name is the button that opens their card (ID-086): text, label and id stay plain.
    const open = root.querySelector<HTMLButtonElement>('.squad-card-open')!;
    expect(open.textContent).toBe(evil);
    expect(open.getAttribute('aria-label')).toBe(`${evil}: open survivor card`);
    // Its hover title (ID-111) is the plain name too.
    expect(open.title).toBe(evil);
    expect(open.dataset.openSurvivor).toBe(g.roster[0]!.id);
    expect(root.querySelector('.hud-pick-stat')!.getAttribute('aria-label')).toBe(
      `Add Instinct to ${evil}, now 0`,
    );
    // The card's Undo (ID-108) names them as plain text too.
    h.onUnspend(noop);
    root.querySelector<HTMLButtonElement>('.hud-pick-stat')!.click();
    const undo = root.querySelector<HTMLButtonElement>('.squad-undo')!;
    expect(undo.hidden).toBe(false);
    expect(undo.getAttribute('aria-label')).toBe(`Undo the points spent on ${evil} here`);
    // ID-126: the "+N" badge and the spend read-out name them as plain text.
    const badge = root.querySelector<HTMLButtonElement>('.squad-plus')!;
    // Spent out with an Undo pending, it reopens the stats.
    expect(badge.getAttribute('aria-label')).toBe(`Open ${evil}'s stats`);
    expect(badge.title).toBe(`Open ${evil}'s stats`);
    const said = root.querySelector<HTMLElement>('.hud-result [role="status"].sr-only')!;
    expect(said.textContent).toBe(`Instinct 1 for ${evil}. No points left.`);
    expect(said.children).toHaveLength(0);
    expect(root.querySelectorAll('.hud-result img:not(.hud-skill-option img)')).toHaveLength(1);
    // The start screen's card (ID-126) too, with a point to spend.
    g.roster[0] = { ...g.roster[0]!, xp: xpForLevel(2) };
    h.showResult(squadStart(g));
    expect(root.querySelector('.hud-result img:not(.hud-skill-option img)')).toBeNull();
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    const start = root.querySelector<HTMLButtonElement>('.squad-plus:not([hidden])')!;
    expect(start.getAttribute('aria-label')).toBe(`+1: spend 1 point on ${evil}`);
    start.click();
    root.querySelector<HTMLButtonElement>('.squad-pick:not([hidden]) .hud-pick-stat')!.click();
    expect(said.textContent).toBe(`Instinct 1 for ${evil}. No points left.`);
    expect(root.querySelector('.hud-result img:not(.hud-skill-option img)')).toBeNull();
  });

  it('a spend the app refuses puts the card back and leaves nothing for its Undo (ID-126)', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const undone: string[][] = [];
    const h = createHud(
      root,
      noop,
      noop,
      noop,
      noop,
      () => false,
      noop,
      noop,
      noop,
      noop,
      noop,
      true,
    );
    h.onUnspend((_, stats) => {
      undone.push(stats);
      return stats.length;
    });
    const g = squadGame(1, 3);
    h.showResult(squadStart(g));
    root.querySelector<HTMLButtonElement>('.squad-plus')!.click();
    const card = root.querySelector<HTMLElement>('.squad-card')!;
    const before = card.querySelector('.squad-points')!.textContent;
    card.querySelector<HTMLButtonElement>('.hud-pick-stat')!.click();
    expect(card.querySelector('.squad-points')!.textContent).toBe(before);
    expect(card.querySelector<HTMLButtonElement>('.squad-undo')!.hidden).toBe(true);
    expect(root.querySelector('.hud-result [role="status"].sr-only')!.textContent).toBe('');
    expect(undone).toEqual([]);
  });

  it('the result screen’s picker offers every stat, Tinker greyed out and unnamed for adding (ID-084)', () => {
    const { root, h } = hud(true);
    const g = squadGame(1, 5);
    h.showResult(squadScreen(g, ended(g, 'won')));
    // The first card's "+N" has the keyboard; it opens the stat block in place (ID-126).
    const badge = root.querySelector<HTMLButtonElement>('.squad-card:first-child .squad-plus')!;
    expect(document.activeElement).toBe(badge);
    badge.click();
    // Their card's buttons: the new survivor's card has its own (ID-111).
    const buttons = [
      ...root.querySelectorAll<HTMLButtonElement>('.squad-card:first-child .hud-pick-stat'),
    ];
    const label = (b: Element | null) => b!.querySelector('.hud-pick-label')!.textContent;
    expect(buttons.map(label)).toEqual([
      '+ Instinct (0)',
      '+ Agility (0)',
      '+ Sharp Mind (0)',
      'Tinker (locked)',
    ]);
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, false, true]);
    expect(buttons[3]!.hasAttribute('aria-label')).toBe(false);
    expect(buttons[3]!.title).toMatch(/^Unlocks later/);
    expect(label(document.activeElement)).toBe('+ Instinct (0)');
    expect(root.querySelector('.hud-result-foot-note')!.textContent).toBe(SQUAD_POINTS_NOTE);
    // No stat summary line (ID-096): each card lists what the next point adds instead.
    expect([...root.querySelectorAll('.debrief-hint')].map((p) => p.textContent)).not.toContain(
      'Instinct: HP, armour, wall damage · Agility: reloads and fire rate · ' +
        'Sharp Mind: accuracy and crits · Tinker: unlocks later',
    );
    // ID-111: on the button itself, in short; no list under the buttons.
    const next = buttons.map((b) => b.querySelector('.hud-pick-next')!.textContent);
    expect(next[0]).toMatch(/^\+\d+ HP · \+\d\.\d\d arm · \+\d\.\d% surv · \+\d\.\d% wall dmg$/);
    expect(next[1]).toMatch(/^−\d\.\d\d s reload · \+\d\.\d% rate$/);
    expect(next[2]).toMatch(/^\+\d\.\d% crit · \+\d\.\d\d× crit dmg · −\d\.\d\d° spread$/);
    expect(next[3]).toBe('');
    expect(root.querySelector('.squad-card .hud-pick-gains')).toBeNull();
    expect(root.querySelector('.hud-result-foot > .hud-button')!.textContent).toBe(startLabel(6));
  });
});

describe('the result cards keep one size (ID-111)', () => {
  function hud() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    h.onUnspend(noop);
    return { root, h };
  }
  /** Each card's parts in order (tag and base class, no screen-reader text): its shape. */
  const shapes = (root: HTMLElement): string[] =>
    [...root.querySelectorAll('.squad-card')].map((c) =>
      [...c.querySelectorAll('*')]
        .filter((e) => !e.closest('.squad-card-who') && !e.matches('.sr-only'))
        .map((e) => `${e.tagName}.${e.classList[0] ?? ''}`)
        .join(' '),
    );
  /** A squad of `n` at level 2, its point spent; those in `up` level on a win. */
  function levelling(n: number, up: number[]): GameState {
    const g = squadGame(n);
    return {
      ...g,
      roster: g.roster.map((d, i) => ({
        ...d,
        stats: { ...d.stats, instinct: 1 },
        xp: up.includes(i) ? xpForLevel(3) - 1 : xpForLevel(2),
      })),
    };
  }

  it('a level-up adds no part to any card: every result card has its stat block', () => {
    const { root, h } = hud();
    for (const outcome of ['won', 'lost'] as const) {
      const none = levelling(3, []);
      h.showResult(squadScreen(none, ended(none, outcome)));
      const plain = shapes(root);
      expect(root.querySelectorAll('.squad-card .squad-pick')).toHaveLength(plain.length);
      expect(root.querySelector('.squad-card .hud-pick-stat:enabled')).toBeNull();
      // A win's new survivor is a fresh recruit: their block has nothing to spend.
      if (outcome === 'won') {
        const joining = root.querySelector('.squad-badge-new')!.closest('.squad-card')!;
        expect(joining.querySelectorAll('.hud-pick-stat')).toHaveLength(4);
        expect(joining.querySelector('.squad-points')!.textContent).toBe('0 points');
      }
      if (outcome === 'lost') continue;
      const one = levelling(3, [1]);
      h.showResult(squadScreen(one, ended(one, 'won')));
      expect(root.querySelector('.squad-card-up')).not.toBeNull();
      expect(shapes(root)).toEqual(plain);
    }
  });

  it('spending out, and Undo, keep every part in place: Undo only hides', () => {
    const { root, h } = hud();
    const g = levelling(2, [0]);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const before = shapes(root);
    const card = root.querySelector<HTMLElement>('.squad-card')!;
    const undo = card.querySelector<HTMLButtonElement>('.squad-undo')!;
    expect(undo.hidden).toBe(true);
    let plus: HTMLButtonElement | null;
    while ((plus = card.querySelector('.hud-pick-stat:enabled'))) plus.click();
    expect(card.querySelector('.squad-points')!.textContent).toBe('0 points');
    expect(card.querySelector('.squad-undo')!.hasAttribute('hidden')).toBe(false);
    expect(shapes(root)).toEqual(before);
    // Spent out, the button shows the stat as it stands, its gains still there.
    const first = card.querySelector<HTMLButtonElement>('.hud-pick-stat')!;
    expect(first.querySelector('.hud-pick-label')!.textContent).toBe('Instinct (2)');
    expect(first.querySelector('.hud-pick-next')!.textContent).toMatch(/^\+\d+ HP/);
    // Its name, with no aria-label, reads the two apart.
    expect(first.hasAttribute('aria-label')).toBe(false);
    expect(first.textContent).toMatch(/^Instinct \(2\) \+\d+ HP/);
  });

  it('Undo shares the count’s row; the start screen’s block is closed with no badge when spent out', () => {
    const { root, h } = hud();
    const g = levelling(2, [0]);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const row = root.querySelector('.squad-points-row')!;
    const part = (e: Element) =>
      ['squad-points', 'squad-undo'].find((c) => e.classList.contains(c));
    expect([...row.children].map(part)).toEqual(['squad-points', 'squad-undo']);
    h.showResult(squadStart(g));
    expect(root.querySelector('.squad-card')).not.toBeNull();
    // ID-126: the start screen has the block too, closed; nobody here has a point, so no badge.
    expect(root.querySelector<HTMLElement>('.squad-card .squad-pick')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.squad-card .squad-plus')!.hidden).toBe(true);
  });

  it('keeps the keyboard on the stat just pressed, not on the row’s Undo', () => {
    const { root, h } = hud();
    const g = { ...levelling(1, []), roster: [{ ...recruit(1), xp: xpForLevel(5) }] };
    h.showResult(squadScreen(g, ended(g, 'won')));
    root.querySelector<HTMLButtonElement>('.squad-card .squad-plus')!.click();
    const agility = root.querySelectorAll<HTMLButtonElement>('.squad-card .hud-pick-stat')[1]!;
    agility.click();
    expect(document.activeElement).toBe(root.querySelectorAll('.squad-card .hud-pick-stat')[1]);
  });
});
