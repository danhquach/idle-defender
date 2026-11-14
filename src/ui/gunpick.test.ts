// ID-108: the Roster's gun picker as data: the tiles (strongest first, a change against the
// held gun) and the Now / New / Change comparison wording.
import { describe, expect, it } from 'vitest';
import { gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import type { JobId, Rarity, WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { equipGun, squadSpec } from '../core/hordeonly.ts';
import { survivorDps, xpForLevel } from '../core/stats.ts';
import { bestUpgrade, deltaOf, gunCompare, gunName, gunTiles } from './gunpick.ts';

const gun = (
  uid: string,
  base: WeaponId,
  rarity: Rarity,
  affixes: OwnedWeapon['affixes'] = [],
): OwnedWeapon => ({ uid, base, rarity, affixes });

/** A level-1 survivor: no level or profession bonus yet, so dmg/s in their hands is the gun's own. */
const rookie = squadSpec(recruit(1));

function camp(stash: OwnedWeapon[], holds?: string): GameState {
  const g = newGame('horde');
  const game = {
    ...g,
    hordeNumber: 3,
    roster: [recruit(1)],
    camp: { ...g.camp, recruits: 1 },
    armoury: stash,
  };
  if (!holds) return game;
  const r = equipGun(game, 'recruit-1', holds);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

describe('the gun tiles (ID-108)', () => {
  const smg = gun('s1', 'smg', 'rusty');
  const rifle = gun('r1', 'rifle', 'military');
  const shotgun = gun('g1', 'shotgun', 'common');

  it('every stash gun, strongest first by dmg/s', () => {
    const tiles = gunTiles(camp([smg, rifle, shotgun]), 'recruit-1');
    expect(tiles.map((t) => t.choice)).toHaveLength(3);
    expect(tiles.map((t) => t.power)).toEqual([...tiles.map((t) => t.power)].sort((a, b) => b - a));
    expect(tiles.some((t) => t.free)).toBe(false);
    expect(tiles.find((t) => t.choice === 'r1')).toMatchObject({
      type: 'Carbine',
      rarity: 'military',
      free: false,
    });
  });

  it('leaves out the gun held; holding a gun puts the pistol among the tiles', () => {
    const tiles = gunTiles(camp([smg, rifle, shotgun], 'r1'), 'recruit-1');
    expect(tiles.map((t) => t.choice)).not.toContain('r1');
    // The Rifle went out of the stash; the pistol is the free way back.
    expect(tiles.map((t) => t.choice).sort()).toEqual(['g1', 'pistol', 's1']);
    // Holding the pistol: no pistol tile.
    expect(gunTiles(camp([smg]), 'recruit-1').map((t) => t.choice)).toEqual(['s1']);
  });

  it('an unknown survivor has no tiles', () => {
    expect(gunTiles(camp([smg]), 'nobody')).toEqual([]);
  });

  it('each change reads as a symbol and a number, ▲ stronger, ▼ weaker, = same', () => {
    // An LMG held: the Carbine's dmg/s is below a Rusty SMG's now, so it can't be the "weaker" one.
    const held = gun('h', 'lmg', 'common');
    const stronger = gun('a', 'lmg', 'relic');
    const weaker = gun('b', 'smg', 'rusty');
    const up = deltaOf(held, stronger, rookie);
    expect(up.kind).toBe('up');
    expect(up.text).toBe(`▲ +${(gunPower(stronger) - gunPower(held)).toFixed(1)}`);
    expect(up.words).toMatch(/^\d+\.\d more dmg\/s$/);
    const down = deltaOf(held, weaker, rookie);
    expect(down.kind).toBe('down');
    expect(down.text).toBe(`▼ ${(gunPower(held) - gunPower(weaker)).toFixed(1)}`);
    expect(down.words).toMatch(/^\d+\.\d less dmg\/s$/);
    expect(deltaOf(held, { ...held, uid: 'twin' }, rookie)).toEqual({
      kind: 'same',
      text: '= same',
      words: 'same dmg/s',
    });
  });

  it('every tile names the gun, rarity, dmg/s and the change for a screen reader', () => {
    const [t] = gunTiles(camp([rifle]), 'recruit-1').filter((x) => x.choice === 'r1');
    expect(t!.label).toBe(
      `Lv 1 Military Carbine, Military rarity, ${t!.dps} dmg/s, ${t!.delta.words} than Pistol`,
    );
    const pistol = gunTiles(camp([rifle], 'r1'), 'recruit-1').find((x) => x.free)!;
    expect(pistol.label.endsWith(', free')).toBe(true);
  });

  it('opens on the best upgrade, or on nothing when no gun beats the one held', () => {
    expect(bestUpgrade(gunTiles(camp([smg, rifle]), 'recruit-1'))).toBe('r1');
    // Holding the best gun: the pistol and the rest are all weaker.
    expect(bestUpgrade(gunTiles(camp([smg, rifle], 'r1'), 'recruit-1'))).toBeNull();
    expect(bestUpgrade([])).toBeNull();
  });
});

describe('the picker counts the survivor’s level and profession (ID-152)', () => {
  const sniper = gun('s', 'sniper', 'common');
  const assault = gun('a', 'assault', 'common');
  /** `camp` with recruit-1 a Lv 21 `job`. */
  const as = (game: GameState, job: JobId): GameState => ({
    ...game,
    roster: game.roster.map((d) => ({ ...d, job, xp: xpForLevel(21) })),
  });

  it('ranks, shows and opens on dmg/s in their hands', () => {
    const g = as(camp([assault, sniper]), 'hunter');
    const who = squadSpec(g.roster[0]!);
    // The Assault Rifle hits harder on its own; the Sniper rifle in a Hunter's hands.
    expect(gunPower(assault)).toBeGreaterThan(gunPower(sniper));
    const tiles = gunTiles(g, 'recruit-1');
    expect(tiles.map((t) => t.choice)).toEqual(['s', 'a']);
    expect(tiles[0]!.power).toBeCloseTo(survivorDps(who, sniper), 9);
    expect(tiles[0]!.dps).toBe(survivorDps(who, sniper).toFixed(1));
    const d = survivorDps(who, sniper) - survivorDps(who, 'pistol');
    expect(tiles[0]!.delta.text).toBe(`▲ +${d.toFixed(1)}`);
    expect(bestUpgrade(tiles)).toBe('s');
  });

  it('the same stash ranks by the gun for a job those guns don’t suit', () => {
    const g = as(camp([assault, sniper]), 'mechanic');
    expect(gunTiles(g, 'recruit-1').map((t) => t.choice)).toEqual(['a', 's']);
  });

  it('the comparison’s verdict and dmg/s row are in their hands; the gun stats stay the gun’s', () => {
    const g = as(camp([assault, sniper]), 'hunter');
    const who = squadSpec(g.roster[0]!);
    const cmp = gunCompare(assault, sniper, who);
    expect(cmp.kind).toBe('up');
    const row = Object.fromEntries(cmp.rows.map((r) => [r.label, r]));
    expect(row['dmg/s']!.next).toBe(survivorDps(who, sniper).toFixed(1));
    expect(row['dmg/s']!.now).toBe(survivorDps(who, assault).toFixed(1));
    // For a level-1 survivor it reads as the gun alone: the Sniper rifle is weaker.
    expect(gunCompare(assault, sniper, rookie).kind).toBe('down');
    expect(row['Reload']).toEqual(
      Object.fromEntries(gunCompare(assault, sniper, rookie).rows.map((r) => [r.label, r]))[
        'Reload'
      ],
    );
  });
});

describe('the comparison (ID-108)', () => {
  it('says stronger or weaker in words, with the dmg/s and the percent', () => {
    const rifle = gun('r', 'rifle', 'common');
    const relic = gun('x', 'rifle', 'relic');
    const up = gunCompare(rifle, relic, rookie);
    const d = gunPower(relic) - gunPower(rifle);
    const pct = Math.round((d / gunPower(rifle)) * 100);
    expect(up.verdict).toBe(`▲ Stronger: +${d.toFixed(1)} dmg/s (+${pct}%)`);
    const down = gunCompare(relic, rifle, rookie);
    expect(down.verdict).toMatch(/^▼ Weaker: −\d+\.\d dmg\/s \(−\d+%\)$/);
    expect(gunCompare(rifle, { ...rifle, uid: 'twin' }, rookie).verdict).toBe('= Same dmg/s');
    expect(up.newName).toBe('Lv 1 Relic Carbine');
    expect(up.kind).toBe('up');
  });

  it('writes the changes out: slower, shorter, new role', () => {
    const rows = Object.fromEntries(
      gunCompare('pistol', gun('s', 'smg', 'common'), rookie).rows.map((r) => [r.label, r]),
    );
    // SMG against the pistol: faster fire, 120 px shorter range, a new role, a reload 0.1 s slower.
    expect(rows['Fire rate']).toMatchObject({ now: '1.7/s', next: '5.9/s', tone: 'better' });
    expect(rows['Fire rate']!.change).toBe('4.2/s faster');
    expect(rows['Reload']).toMatchObject({ now: '1.50 s', next: '1.60 s', tone: 'worse' });
    expect(rows['Reload']!.change).toBe('0.10 s slower');
    expect(rows['Range']).toMatchObject({ now: '600 px', next: '480 px', tone: 'worse' });
    expect(rows['Range']!.change).toBe('120 px shorter');
    expect(rows['Role']).toMatchObject({
      now: 'All-rounder',
      next: 'Swarm shredder',
      change: 'new role',
    });
    // A common gun carries no affix: no row for them.
    expect(rows['Affixes']).toBeUndefined();
  });

  it('shows pellets like "7.0 × 6", and affixes written out', () => {
    const rifle = gun('r', 'rifle', 'prototype', [{ id: 'damage', value: 10 }]);
    const shotgun = gun('g', 'shotgun', 'common');
    const rows = Object.fromEntries(
      gunCompare(rifle, shotgun, rookie).rows.map((r) => [r.label, r]),
    );
    expect(rows['Damage']!.next).toBe('7.0 × 6');
    expect(rows['Affixes']).toMatchObject({
      now: '1',
      next: 'none',
      change: 'loses +10% damage',
      tone: 'worse',
    });
    expect(rows['Role']!.change).toBe('new role');
    const back = Object.fromEntries(
      gunCompare(shotgun, rifle, rookie).rows.map((r) => [r.label, r]),
    );
    expect(back['Affixes']).toMatchObject({
      now: 'none',
      next: '1',
      change: '+10% damage',
      tone: 'better',
    });
    // The same gun twice: every change is "same".
    const same = gunCompare(rifle, { ...rifle, uid: 'twin' }, rookie);
    expect(same.rows.every((r) => r.change === 'same')).toBe(true);
  });

  it('a gun’s name carries its level; the free pistol has none', () => {
    expect(gunName('pistol')).toBe('Pistol');
    expect(gunName({ ...gun('r', 'rifle', 'common'), level: 12 })).toBe('Lv 12 Common Carbine');
  });
});
