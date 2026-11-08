// ID-108: the Roster's gun picker as data: the tiles (strongest first, a change against the
// held gun) and the Now / New / Change comparison wording.
import { describe, expect, it } from 'vitest';
import { gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import type { Rarity, WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { equipGun } from '../core/hordeonly.ts';
import { bestUpgrade, deltaOf, gunCompare, gunName, gunTiles } from './gunpick.ts';

const gun = (
  uid: string,
  base: WeaponId,
  rarity: Rarity,
  affixes: OwnedWeapon['affixes'] = [],
): OwnedWeapon => ({ uid, base, rarity, affixes });

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
      type: 'Rifle',
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
    const held = gun('h', 'rifle', 'common');
    const stronger = gun('a', 'rifle', 'relic');
    const weaker = gun('b', 'smg', 'rusty');
    const up = deltaOf(held, stronger);
    expect(up.kind).toBe('up');
    expect(up.text).toBe(`▲ +${(gunPower(stronger) - gunPower(held)).toFixed(1)}`);
    expect(up.words).toMatch(/^\d+\.\d more dmg\/s$/);
    const down = deltaOf(held, weaker);
    expect(down.kind).toBe('down');
    expect(down.text).toBe(`▼ ${(gunPower(held) - gunPower(weaker)).toFixed(1)}`);
    expect(down.words).toMatch(/^\d+\.\d less dmg\/s$/);
    expect(deltaOf(held, { ...held, uid: 'twin' })).toEqual({
      kind: 'same',
      text: '= same',
      words: 'same dmg/s',
    });
  });

  it('every tile names the gun, rarity, dmg/s and the change for a screen reader', () => {
    const [t] = gunTiles(camp([rifle]), 'recruit-1').filter((x) => x.choice === 'r1');
    expect(t!.label).toBe(
      `Lv 1 Military Rifle, Military rarity, ${t!.dps} dmg/s, ${t!.delta.words} than Pistol`,
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

describe('the comparison (ID-108)', () => {
  it('says stronger or weaker in words, with the dmg/s and the percent', () => {
    const rifle = gun('r', 'rifle', 'common');
    const relic = gun('x', 'rifle', 'relic');
    const up = gunCompare(rifle, relic);
    const d = gunPower(relic) - gunPower(rifle);
    const pct = Math.round((d / gunPower(rifle)) * 100);
    expect(up.verdict).toBe(`▲ Stronger: +${d.toFixed(1)} dmg/s (+${pct}%)`);
    const down = gunCompare(relic, rifle);
    expect(down.verdict).toMatch(/^▼ Weaker: −\d+\.\d dmg\/s \(−\d+%\)$/);
    expect(gunCompare(rifle, { ...rifle, uid: 'twin' }).verdict).toBe('= Same dmg/s');
    expect(up.newName).toBe('Lv 1 Relic Rifle');
    expect(up.kind).toBe('up');
  });

  it('writes the changes out: slower, shorter, new role', () => {
    const rows = Object.fromEntries(
      gunCompare('pistol', gun('s', 'smg', 'common')).rows.map((r) => [r.label, r]),
    );
    // SMG against the pistol: faster fire, 200 px shorter range, a new role, a reload 0.5 s slower.
    expect(rows['Fire rate']).toMatchObject({ now: '1.7/s', next: '5.0/s', tone: 'better' });
    expect(rows['Fire rate']!.change).toBe('3.3/s faster');
    expect(rows['Reload']).toMatchObject({ now: '1.50 s', next: '2.00 s', tone: 'worse' });
    expect(rows['Reload']!.change).toBe('0.50 s slower');
    expect(rows['Range']).toMatchObject({ now: '600 px', next: '400 px', tone: 'worse' });
    expect(rows['Range']!.change).toBe('200 px shorter');
    expect(rows['Role']).toMatchObject({
      now: 'Backup',
      next: 'Swarm shredder',
      change: 'new role',
    });
    // A common gun carries no affix: no row for them.
    expect(rows['Affixes']).toBeUndefined();
  });

  it('shows pellets like "4.0 × 6", and affixes written out', () => {
    const rifle = gun('r', 'rifle', 'prototype', [{ id: 'damage', value: 10 }]);
    const shotgun = gun('g', 'shotgun', 'common');
    const rows = Object.fromEntries(gunCompare(rifle, shotgun).rows.map((r) => [r.label, r]));
    expect(rows['Damage']!.next).toBe('4.0 × 6');
    expect(rows['Affixes']).toMatchObject({
      now: '1',
      next: 'none',
      change: 'loses +10% damage',
      tone: 'worse',
    });
    expect(rows['Role']!.change).toBe('new role');
    const back = Object.fromEntries(gunCompare(shotgun, rifle).rows.map((r) => [r.label, r]));
    expect(back['Affixes']).toMatchObject({
      now: 'none',
      next: '1',
      change: '+10% damage',
      tone: 'better',
    });
    // The same gun twice: every change is "same".
    const same = gunCompare(rifle, { ...rifle, uid: 'twin' });
    expect(same.rows.every((r) => r.change === 'same')).toBe(true);
  });

  it('a gun’s name carries its level; the free pistol has none', () => {
    expect(gunName('pistol')).toBe('Pistol');
    expect(gunName({ ...gun('r', 'rifle', 'common'), level: 12 })).toBe('Lv 12 Common Rifle');
  });
});
