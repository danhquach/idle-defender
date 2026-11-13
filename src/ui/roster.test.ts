// Design §6: the roster screen's lines and loadout options.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { patrolOutcome, sendPatrol, settlePatrols } from '../core/patrol.ts';
import { levelOf } from '../core/stats.ts';
import {
  choiceFor,
  ITEM_CHOICES,
  ITEM_OPTIONS,
  PRIMARY_OPTIONS,
  restLeft,
  rosterEntry,
  SECONDARY_OPTIONS,
  weaponChoices,
} from './roster.ts';
import { LEVEL_ONE_TEXT, levelText } from './statlines.ts';

const NOW = 1_700_000_000_000;
const jack = (d: Partial<RosterDefender> = {}): RosterDefender => ({
  ...newGame().roster[1]!,
  ...d,
});

/** Jack back injured, John dead. */
const isHurt = (o: { wiped: boolean; dead: string[]; injured: string[] }): boolean =>
  !o.wiped && o.dead.join() === 'john' && o.injured.join() === 'jack';

describe('roster entry', () => {
  it('a new defender: level 1, no level bonus yet, fit', () => {
    expect(rosterEntry(jack(), NOW)).toEqual({
      label: 'Jack — Ripper',
      level: 'level 1 · 0/25 XP',
      bonus: LEVEL_ONE_TEXT,
      status: 'Fit',
    });
  });

  it('shows level progress and what the level gives (ID-146)', () => {
    // Level 3 needs 75 XP; 95 is 20 into the 75 that level 4 costs.
    const e = rosterEntry(jack({ xp: 95 }), NOW);
    expect(e.level).toBe('level 3 · 20/75 XP');
    expect(e.bonus).toBe(levelText(3));
    expect(e.bonus).toMatch(/^\+\d+\u00a0HP\u00a0· /);
    expect(rosterEntry(jack({ xp: 1e6 }), NOW).bonus).toBe(levelText(levelOf(1e6).level));
  });

  it('a defender on patrol says where and how long is left', () => {
    const r = sendPatrol(
      { ...newGame(), hordeNumber: 3 },
      'electronics',
      ['jack'],
      1,
      NOW - 5 * 60_000,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(rosterEntry(jack(), NOW, r.game.patrols[0]).status).toBe(
      'On patrol · Electronics store · 40m left',
    );
  });

  it('a defender back injured from patrol is resting; one who died is gone (ID-027)', () => {
    const r = sendPatrol({ ...newGame(), hordeNumber: 3 }, 'electronics', ['jack', 'john'], 1, NOW);
    if (!r.ok) throw new Error(r.reason);
    const p = r.game.patrols[0]!;
    let seed = 1;
    while (!isHurt(patrolOutcome({ ...p, seed }))) seed++;
    const back = settlePatrols({ ...r.game, patrols: [{ ...p, seed }] }, NOW + 45 * 60_000);
    expect(back.roster.map((d) => d.id)).toEqual(['bob', 'jack']);
    expect(rosterEntry(back.roster[1]!, NOW + 45 * 60_000).status).toBe('Resting · 2h 0m left');
  });

  it('a resting defender says how long is left, rounded up to the minute', () => {
    const resting = jack({ injuredUntil: NOW + 72 * 60_000 });
    expect(rosterEntry(resting, NOW).status).toBe('Resting · 1h 12m left');
    expect(rosterEntry(jack({ injuredUntil: NOW }), NOW).status).toBe('Fit');
    expect(restLeft(NOW + 1, NOW)).toBe('1m');
    expect(restLeft(NOW + 59 * 60_000 + 1, NOW)).toBe('1h 0m');
    expect(restLeft(NOW + 2 * 3_600_000, NOW)).toBe('2h 0m');
  });
});

describe('loadout options', () => {
  it('guns as primary; none, a sidearm, blade or tool as secondary; none or a shield as item', () => {
    expect(PRIMARY_OPTIONS).toEqual(['pistol']);
    expect(SECONDARY_OPTIONS).toEqual([null, 'pistol', 'knife', 'toolkit']);
    expect(ITEM_OPTIONS).toEqual([null, 'shield']);
  });

  it('a picker value maps back to one of our options, or to nothing', () => {
    const game = newGame();
    const bob = game.roster[0]!;
    const primary = weaponChoices(game, bob, 'primary');
    const secondary = weaponChoices(game, bob, 'secondary');
    expect(choiceFor(primary, 'pistol')?.pick).toBe('pistol');
    expect(choiceFor(secondary, '')?.pick).toBeNull();
    expect(choiceFor(ITEM_CHOICES, '')?.pick).toBeNull();
    expect(choiceFor(ITEM_CHOICES, 'shield')?.pick).toBe('shield');
    // A primary is never none; edited values never match.
    for (const raw of [
      '',
      '__proto__',
      'constructor',
      'toString',
      'Pistol',
      ' pistol',
      'pist\u043el', // Cyrillic о
      'pis\u200btol', // zero-width space
      'shield',
      'h1',
      'a'.repeat(100_000),
    ]) {
      expect(choiceFor(primary, raw), raw.slice(0, 20)).toBeUndefined();
    }
    expect(choiceFor(secondary, 'kn\u0456fe')).toBeUndefined(); // Cyrillic і
    expect(choiceFor(ITEM_CHOICES, '__proto__')).toBeUndefined();
  });
});

describe('owned weapons in the pickers (design §6 Gear)', () => {
  const pistol: OwnedWeapon = {
    uid: 'h3',
    base: 'pistol',
    rarity: 'military',
    affixes: [{ id: 'damage', value: 12 }],
  };
  const knife: OwnedWeapon = { uid: 'h4', base: 'knife', rarity: 'rusty', affixes: [] };
  const withArmoury = (): GameState => ({ ...newGame(), hordeNumber: 5, armoury: [pistol, knife] });

  it('the free weapons first, then owned ones that fit the slot, named with rarity and affixes', () => {
    const game = withArmoury();
    const bob = game.roster[0]!;
    expect(weaponChoices(game, bob, 'primary').map((c) => [c.value, c.label])).toEqual([
      ['pistol', 'Pistol'],
      ['h3', 'Military Pistol (+12% damage)'],
    ]);
    expect(weaponChoices(game, bob, 'secondary').map((c) => c.value)).toEqual([
      '',
      'pistol',
      'knife',
      'toolkit',
      'h3',
      'h4',
    ]);
  });

  it('lists owned weapons rarest first, then by name', () => {
    const game = {
      ...withArmoury(),
      hordeNumber: 9,
      armoury: [
        knife,
        { uid: 'h5', base: 'toolkit' as const, rarity: 'common' as const, affixes: [] },
        pistol,
        { uid: 'h6', base: 'knife' as const, rarity: 'common' as const, affixes: [] },
      ],
    };
    expect(
      weaponChoices(game, game.roster[0]!, 'secondary')
        .slice(4)
        .map((c) => c.label),
    ).toEqual(['Military Pistol (+12% damage)', 'Common Knife', 'Common Toolkit', 'Rusty Knife']);
  });

  it("names who carries an owned weapon, except on the carrier's own picker", () => {
    let game = withArmoury();
    game = { ...game, armoury: [knife] };
    game.roster = game.roster.map((d, i) =>
      i === 1 ? { ...d, loadout: { ...d.loadout, primary: pistol } } : d,
    );
    const [bob, jack] = game.roster;
    expect(choiceFor(weaponChoices(game, bob!, 'primary'), 'h3')?.label).toBe(
      'Military Pistol (+12% damage) · carried by Jack',
    );
    expect(choiceFor(weaponChoices(game, jack!, 'primary'), 'h3')?.label).toBe(
      'Military Pistol (+12% damage)',
    );
  });
});
