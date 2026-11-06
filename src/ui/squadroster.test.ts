// @vitest-environment jsdom
// ID-086: the Roster — a top-bar button opens every survivor as a tile (avatar, name,
// level, HP or an injured mark, gun, a badge with points to spend); a tile opens their
// card (large avatar, level and XP bar, each stat with its points, a + and what the next
// point adds, Tinker locked; points left, "0" when none). Keyboard and touch alike.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { DEFENDER_HP, type Stat, type Stats } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import { maxHpOf, reloadTime, xpForLevel } from '../core/stats.ts';
import { ART_URLS, GUNNER_LOOKS, lookOf } from './sprites.ts';
import {
  avatarOf,
  cardBlock,
  createRoster,
  rosterTiles,
  SPEND_LATER_NOTE,
  statEffects,
  survivorCard,
  type RosterOptions,
} from './squadroster.ts';

const NOW = 1_800_000_000_000;
const stats = (s: Partial<Stats> = {}): Stats => ({
  instinct: 0,
  agility: 0,
  mind: 0,
  tinker: 0,
  ...s,
});
/** Survivor `n` at `level`, with `s` spent. */
const at = (n: number, level: number, s: Partial<Stats> = {}): RosterDefender => ({
  ...recruit(n),
  xp: xpForLevel(level),
  stats: stats(s),
});

function camp(roster: RosterDefender[]): GameState {
  const g = newGame('horde');
  return { ...g, hordeNumber: 3, roster, camp: { ...g.camp, recruits: roster.length } };
}

describe('the Roster tiles (ID-086)', () => {
  it('lists every survivor with avatar, name, level, full HP, gun and unspent points', () => {
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const ivan = {
      ...at(1, 7, { instinct: 2 }),
      loadout: { ...recruit(1).loadout, primary: relic },
    };
    const tiles = rosterTiles(camp([ivan, at(2, 1)]), NOW, null);
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({
      id: 'recruit-1',
      name: ivan.name,
      level: 7,
      health: `HP ${maxHpOf(ivan)}/${maxHpOf(ivan)}`,
      down: false,
      gun: 'Relic Rifle',
      rarity: 'relic',
      points: 4,
    });
    expect(tiles[1]).toMatchObject({ level: 1, gun: 'Pistol', rarity: 'common', points: 0 });
    expect(tiles[1]!.health).toBe(`HP ${DEFENDER_HP}/${DEFENDER_HP}`);
  });

  it('the avatar is the survivor’s own look holding their gun, as in the fight (ID-074)', () => {
    for (let n = 1; n <= 4; n++) {
      const d = at(n, 1);
      expect(avatarOf(d)).toBe(GUNNER_LOOKS[lookOf(d.id)]!.pistol.idle);
      expect(ART_URLS[avatarOf(d)]).toBeTruthy();
    }
    // Four survivors in a row: four different looks.
    expect(new Set([1, 2, 3, 4].map((n) => avatarOf(at(n, 1)))).size).toBe(4);
  });

  it('in a fight: the fight’s HP, and "Down" for one injured in it', () => {
    const game = camp([at(1, 2), at(2, 2)]);
    const s = startSquadHorde(game, 7, NOW);
    const [a, b] = s.defenders;
    const fight = {
      ...s,
      defenders: [{ ...a!, hp: 41.2 }],
      injured: [{ defender: b!, postId: b!.postId, at: 3, offered: true, by: null }],
    };
    const tiles = rosterTiles(game, NOW, fight);
    expect(tiles[0]).toMatchObject({ health: `HP 42/${a!.maxHp}`, down: false });
    expect(tiles[1]).toMatchObject({ health: 'Down', down: true });
  });

  it('between hordes, one still resting (an older camp save) is "Injured"', () => {
    const d = { ...at(1, 1), injuredUntil: NOW + 60_000 };
    expect(rosterTiles(camp([d]), NOW, null)[0]).toMatchObject({ health: 'Injured', down: true });
    expect(rosterTiles(camp([d]), NOW + 60_000, null)[0]!.down).toBe(false);
  });
});

describe('the survivor card (ID-086)', () => {
  it('level, XP bar and points left; a bare "0" when none are left (ID-083)', () => {
    const d = { ...at(1, 2), xp: xpForLevel(2) + 10 };
    const c = survivorCard(d);
    expect(c).toMatchObject({ level: 2, points: 1, pointsText: '1 point' });
    expect(c.xp).toEqual({ pct: 20, text: '10/50 XP to Lv 3' });
    expect(survivorCard(at(1, 2, { agility: 1 })).pointsText).toBe('0');
    expect(survivorCard(at(1, 4, { agility: 1 })).pointsText).toBe('2 points');
  });

  it('each stat with its points; Tinker locked', () => {
    const c = survivorCard(at(1, 4, { instinct: 2, mind: 1 }));
    expect(c.stats.map((s) => [s.name, s.points, s.locked])).toEqual([
      ['Instinct', 2, false],
      ['Agility', 0, false],
      ['Sharp Mind', 1, false],
      ['Tinker', 0, true],
    ]);
  });

  it('real numbers now and with the next point, from the same formulas as the fight', () => {
    const d = at(1, 5, { agility: 2 });
    const next = { ...d, stats: { ...d.stats, agility: 3 } };
    const [reload] = statEffects(d, 'agility');
    expect(reload).toBe(
      `Reload ${reloadTime(d, 'pistol').toFixed(2)} s → ${reloadTime(next, 'pistol').toFixed(2)} s`,
    );
    expect(reloadTime(next, 'pistol')).toBeLessThan(reloadTime(d, 'pistol'));
    const instinct = statEffects(at(1, 1), 'instinct');
    // A point in Instinct is split 3 ways (ID-096): 100 × 1/31 HP, 4/31 armour, 30%/31.
    expect(instinct).toEqual([
      'Max HP 100 → 103',
      'Armour per hit 0.00 → 0.13',
      'Survive a downing hit 0.0% → 1.0%',
    ]);
    expect(statEffects(at(1, 1), 'mind')).toEqual([
      'Crit chance 5.0% → 6.6%',
      'Crit damage ×2.00 → ×2.06',
      expect.stringMatching(/^Spread \d+\.\d\d° → \d+\.\d\d°$/),
    ]);
    // Two decimals, so one point's change in spread shows (one rounded it away).
    const [was, then] = statEffects(at(1, 1), 'mind')[2]!.slice(7).split(' → ');
    expect(was).not.toBe(then);
    expect(statEffects(at(1, 1), 'tinker')).toEqual(['Unlocks later']);
  });

  it('every + reads its stat and survivor; locked, spent out or mid-fight it is disabled', () => {
    const onSpend = vi.fn();
    const card = cardBlock(survivorCard(at(1, 2)), true, onSpend);
    const adds = [...card.querySelectorAll<HTMLButtonElement>('.roster-stat-add')];
    expect(adds.map((b) => b.disabled)).toEqual([false, false, false, true]);
    expect(adds[1]!.getAttribute('aria-label')).toBe(
      `Add a point to Agility for ${recruit(1).name}, now 0`,
    );
    adds[1]!.click();
    adds[3]!.click();
    expect(onSpend.mock.calls).toEqual([['recruit-1', 'agility']]);
    expect(card.textContent).not.toContain(SPEND_LATER_NOTE);

    const fighting = cardBlock(survivorCard(at(1, 2)), false, onSpend);
    expect([...fighting.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    expect(fighting.textContent).toContain(SPEND_LATER_NOTE);
    const spent = cardBlock(survivorCard(at(1, 2, { mind: 1 })), true, onSpend);
    expect([...spent.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
    expect(spent.querySelector('.roster-card-points')!.textContent).toBe('0 points');
  });
});

describe('the Roster dialog (ID-086)', () => {
  function mount(game: GameState, canSpend = true) {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let g = game;
    const onSpend = vi.fn((id: string, stat: Stat) => {
      g = {
        ...g,
        roster: g.roster.map((d) =>
          d.id === id ? { ...d, stats: { ...d.stats, [stat]: d.stats[stat] + 1 } } : d,
        ),
      };
      roster.refresh();
    });
    const opts: RosterOptions = {
      state: () => ({ game: g, fight: null, canSpend, resumes: false }),
      onSpend,
    };
    const roster = createRoster(root, opts);
    const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
    const press = (key: string, shiftKey = false) =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }),
      );
    return {
      root,
      roster,
      scrim,
      onSpend,
      press,
      button: root.querySelector<HTMLButtonElement>('.roster-button')!,
    };
  }

  it('the button opens the list on the first tile; a tile opens that card on its first +', () => {
    const { root, scrim, button } = mount(camp([at(1, 4), at(2, 1)]));
    expect(scrim.hidden).toBe(true);
    button.click();
    expect(scrim.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    const tiles = [...scrim.querySelectorAll<HTMLButtonElement>('.roster-tile')];
    expect(tiles).toHaveLength(2);
    expect(document.activeElement).toBe(tiles[0]);
    const badge = tiles[0]!.querySelector<HTMLElement>('.roster-badge')!;
    // "3 pts" on screen, the whole phrase for screen readers and on hover.
    expect(badge.querySelector('[aria-hidden="true"]')!.textContent).toBe('3 pts');
    expect(badge.querySelector('.sr-only')!.textContent).toBe('3 points to spend');
    expect(badge.title).toBe('3 points to spend');
    expect(tiles[1]!.querySelector('.roster-badge')).toBeNull();
    expect(tiles[0]!.querySelector('img')!.alt).toBe('');
    tiles[1]!.click();
    expect(scrim.querySelector('.roster-card-name')!.textContent).toBe(recruit(2).name);
    // Survivor 2 has no points: the keyboard goes to the way back.
    expect(document.activeElement!.textContent).toBe('All survivors');
    (document.activeElement as HTMLButtonElement).click();
    // Back on the list, on the tile it came from.
    expect(document.activeElement).toBe(scrim.querySelectorAll('.roster-tile')[1]);
  });

  it('a + spends through onSpend and the card redraws with the keyboard kept on it', () => {
    const { roster, scrim, onSpend } = mount(camp([at(1, 4)]));
    roster.open('recruit-1');
    const plus = () => scrim.querySelectorAll<HTMLButtonElement>('.roster-stat-add')[0]!;
    expect(document.activeElement).toBe(plus());
    plus().click();
    expect(onSpend).toHaveBeenCalledWith('recruit-1', 'instinct');
    expect(scrim.querySelector('.roster-stat-points')!.textContent).toBe('1');
    expect(scrim.querySelector('.roster-card-points')!.textContent).toBe('2 points to spend');
    expect(document.activeElement).toBe(plus());
    plus().click();
    plus().click();
    // Spent out: every + greys out and the keyboard moves to the way back.
    expect(scrim.querySelector('.roster-card-points')!.textContent).toBe('0 points');
    expect(document.activeElement!.textContent).toBe('All survivors');
  });

  it('Esc closes and gives the keyboard back to what opened it; Tab stays inside', () => {
    const { root, scrim, button, press } = mount(camp([at(1, 4)]));
    button.focus();
    button.click();
    press('Tab', true);
    expect(scrim.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) press('Tab');
    expect(scrim.contains(document.activeElement)).toBe(true);
    // On a card too: Shift+Tab from the first button wraps to the last.
    scrim.querySelector<HTMLButtonElement>('.roster-tile')!.click();
    const buttons = [...scrim.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) => !b.disabled && !b.hidden,
    );
    buttons[0]!.focus();
    press('Tab', true);
    expect(document.activeElement).toBe(buttons.at(-1));
    press('Tab');
    expect(document.activeElement).toBe(buttons[0]);
    press('Escape');
    expect(scrim.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('mid-fight every + is disabled and says to spend between hordes', () => {
    const { roster, scrim, onSpend } = mount(camp([at(1, 4)]), false);
    roster.open('recruit-1');
    const adds = [...scrim.querySelectorAll<HTMLButtonElement>('.roster-stat-add')];
    expect(adds.every((b) => b.disabled)).toBe(true);
    adds[0]!.click();
    expect(onSpend).not.toHaveBeenCalled();
    expect(scrim.textContent).toContain(SPEND_LATER_NOTE);
  });

  it('an unknown id opens the list', () => {
    const { roster, scrim } = mount(camp([at(1, 4)]));
    roster.open('nobody');
    expect(scrim.querySelectorAll('.roster-tile')).toHaveLength(1);
  });

  it('a hostile name from a save stays text everywhere (no HTML sink)', () => {
    const name = '<img src=x onerror=alert(1)>‮evil';
    const { roster, scrim } = mount(camp([{ ...at(1, 4), name }]));
    roster.open();
    expect(scrim.querySelector('.roster-tile-name')!.textContent).toBe(name);
    expect(scrim.querySelectorAll('img')).toHaveLength(1);
    roster.open('recruit-1');
    expect(scrim.querySelector('.roster-card-name')!.textContent).toBe(name);
    expect(scrim.querySelector('.roster-stat-add')!.getAttribute('aria-label')).toContain(name);
    expect(scrim.querySelectorAll('img')).toHaveLength(1);
  });
});
