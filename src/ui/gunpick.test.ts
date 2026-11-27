// ID-108: the Roster's gun picker as data: the tiles (strongest first, a change against the
// held gun) and the Now / New / Change comparison wording.
import { describe, expect, it } from 'vitest';
import { gunPower, type Held, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import type { JobId, Rarity, WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { bestGuns, equipGun, handWorth, powerOf, squadSpec } from '../core/hordeonly.ts';
import { survivorDps, xpForLevel } from '../core/stats.ts';
import { bestUpgrade, deltaOf, gunCompare, gunName, gunTiles, heldGunOf } from './gunpick.ts';
import { powerText } from './mapview.ts';

const gun = (
  uid: string,
  base: WeaponId,
  rarity: Rarity,
  affixes: OwnedWeapon['affixes'] = [],
): OwnedWeapon => ({ uid, base, rarity, affixes });

/** A level-1 survivor: no level or profession bonus yet, so DPS in their hands is the gun's own. */
const rookie = squadSpec(recruit(1));

/** Plain Power in `who`'s hands: the worth a picker uses on Normal (ID-248). */
const plain = (who: ReturnType<typeof squadSpec>) => (h: Held) => powerOf(who, h);

/** A gun's Power in a survivor's hands as the picker prints it (ID-248): whole, grouped. */
const shown = (who: ReturnType<typeof squadSpec>, h: OwnedWeapon | 'pistol'): number =>
  Math.floor(powerOf(who, h));

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
  if (!r.ok) throw new Error(r.code);
  return r.game;
}

describe('the gun tiles (ID-108)', () => {
  const smg = gun('s1', 'smg', 'rusty');
  const rifle = gun('r1', 'rifle', 'military');
  const shotgun = gun('g1', 'shotgun', 'common');

  it('every stash gun, strongest first by Power (ID-248)', () => {
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
    // The change is in whole Power (ID-248): the difference of the two Powers as printed.
    const held = gun('h', 'lmg', 'common');
    const stronger = gun('a', 'lmg', 'relic');
    const weaker = gun('b', 'smg', 'rusty');
    const gain = shown(rookie, stronger) - shown(rookie, held);
    const up = deltaOf(held, stronger, plain(rookie));
    expect(up.kind).toBe('up');
    expect(up.text).toBe(`▲ +${powerText(gain)}`);
    expect(up.words).toBe(`${powerText(gain)} more Power`);
    const loss = shown(rookie, held) - shown(rookie, weaker);
    const down = deltaOf(held, weaker, plain(rookie));
    expect(down.kind).toBe('down');
    expect(down.text).toBe(`▼ ${powerText(loss)}`);
    expect(down.words).toBe(`${powerText(loss)} less Power`);
    expect(deltaOf(held, { ...held, uid: 'twin' }, plain(rookie))).toEqual({
      kind: 'same',
      text: '= same',
      words: 'same Power',
    });
  });

  it('a survivor’s name reaches a tile’s label as plain text (ID-166)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const g = camp([rifle]);
    g.roster = [{ ...g.roster[0]!, name: evil }];
    const [t] = gunTiles(g, 'recruit-1');
    expect(t!.label).toContain(`${t!.dps} DPS with ${evil}, `);
  });

  it('every tile names the gun, rarity, Power, DPS and the change for a screen reader', () => {
    const [t] = gunTiles(camp([rifle]), 'recruit-1').filter((x) => x.choice === 'r1');
    expect(t!.powerText).toBe(powerText(powerOf(squadSpec(recruit(1)), rifle)));
    expect(t!.label).toBe(
      `Lv 1 Military Carbine, Military rarity, ${t!.powerText} Power, ${t!.dps} DPS with Ivan, ${t!.delta.words} than Pistol`,
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
  // ID-248: out-hits the Sniper rifle on paper, but a Hunter's Power is higher with the Sniper.
  const assault = gun('a', 'assault', 'military');
  /** `camp` with recruit-1 a Lv 21 `job`. */
  const as = (game: GameState, job: JobId): GameState => ({
    ...game,
    roster: game.roster.map((d) => ({ ...d, job, xp: xpForLevel(21) })),
  });

  it('ranks, shows and opens on Power in their hands', () => {
    const g = as(camp([assault, sniper]), 'hunter');
    const who = squadSpec(g.roster[0]!);
    // The Assault Rifle hits harder on paper; the Sniper rifle is worth more in a Hunter's hands.
    expect(gunPower(assault)).toBeGreaterThan(gunPower(sniper));
    const tiles = gunTiles(g, 'recruit-1');
    expect(tiles.map((t) => t.choice)).toEqual(['s', 'a']);
    expect(tiles[0]!.power).toBeCloseTo(powerOf(who, sniper), 9);
    expect(tiles[0]!.powerText).toBe(powerText(powerOf(who, sniper)));
    // The tile's DPS stays paper dmg/s in their hands.
    expect(tiles[0]!.dps).toBe(survivorDps(who, sniper).toFixed(1));
    const d = shown(who, sniper) - shown(who, 'pistol');
    expect(tiles[0]!.delta.text).toBe(`▲ +${powerText(d)}`);
    expect(bestUpgrade(tiles)).toBe('s');
  });

  it('the same stash ranks by the gun for a job those guns don’t suit', () => {
    const g = as(camp([assault, sniper]), 'mechanic');
    expect(gunTiles(g, 'recruit-1').map((t) => t.choice)).toEqual(['a', 's']);
  });

  it('the comparison’s verdict, Power row and DPS row are in their hands; the gun stats stay the gun’s', () => {
    const g = as(camp([assault, sniper]), 'hunter');
    const who = squadSpec(g.roster[0]!);
    const cmp = gunCompare(assault, sniper, who, plain(who));
    expect(cmp.kind).toBe('up');
    expect(cmp.verdict).toMatch(/^▲ Stronger: \+[\d,]+ Power \(\+\d+%\)$/);
    const row = Object.fromEntries(cmp.rows.map((r) => [r.label, r]));
    expect(cmp.rows[0]!.label).toBe('Power');
    expect(row['Power']!.now).toBe(powerText(powerOf(who, assault)));
    expect(row['Power']!.next).toBe(powerText(powerOf(who, sniper)));
    expect(row['Power']!.change).toBe(`+${powerText(shown(who, sniper) - shown(who, assault))}`);
    expect(row['DPS']!.next).toBe(survivorDps(who, sniper).toFixed(1));
    expect(row['DPS']!.now).toBe(survivorDps(who, assault).toFixed(1));
    // The DPS row has its own signed change, and no percent: the verdict carries that.
    expect(row['DPS']!.change).toMatch(/^[+−]\d+\.\d$/);
    expect(row['DPS']!.change).not.toContain('%');
    // For a level-1 survivor it reads as the gun alone: the Sniper rifle is weaker.
    expect(gunCompare(assault, sniper, rookie, plain(rookie)).kind).toBe('down');
    expect(row['Reload']).toEqual(
      Object.fromEntries(
        gunCompare(assault, sniper, rookie, plain(rookie)).rows.map((r) => [r.label, r]),
      )['Reload'],
    );
  });
});

/**
 * ID-248: the picker and Best gun count a gun the same way (Squad Power's rating), so the picker
 * never marks the gun Best gun would hand out as weaker, and its top tile is that gun.
 */
describe('the picker agrees with Best gun (ID-248)', () => {
  const carbine = gun('c', 'rifle', 'relic');
  const pump = gun('p', 'shotgun', 'common');
  const stashes: [string, OwnedWeapon[]][] = [
    ['Pump Shotgun beats the Carbine on paper, not in Power', [pump, carbine]],
    ['a mixed stash', [gun('m', 'smg', 'rusty'), pump, carbine, gun('s', 'sniper', 'common')]],
    [
      'paper-strong guns that rate low',
      [gun('l', 'lmg', 'military'), gun('a', 'assault', 'military'), pump],
    ],
  ];

  it('a Pump Shotgun that beats the Carbine on paper but not in Power is marked ▼', () => {
    const who = rookie;
    expect(gunPower(pump)).toBeGreaterThan(gunPower(carbine));
    expect(shown(who, pump)).toBeLessThan(shown(who, carbine));
    const t = gunTiles(camp([pump, carbine], 'c'), 'recruit-1').find((x) => x.choice === 'p')!;
    expect(t.delta.kind).toBe('down');
    expect(t.delta.text.startsWith('▼ ')).toBe(true);
    expect(gunCompare(carbine, pump, who, plain(who)).kind).toBe('down');
    expect(gunCompare(carbine, pump, who, plain(who)).verdict).toMatch(/^▼ Weaker: −[\d,]+ Power/);
    // The tile still shows the paper figure, which is the higher one.
    expect(Number(t.dps)).toBeGreaterThan(
      Number(gunTiles(camp([pump, carbine], 'p'), 'recruit-1').find((x) => x.choice === 'c')!.dps),
    );
  });

  for (const job of ['hunter', 'mechanic', 'police'] as JobId[]) {
    for (const [name, stash] of stashes) {
      for (const holds of [undefined, 'm', 'p', 'c']) {
        if (holds && !stash.some((w) => w.uid === holds)) continue;
        it(`never ▼ for the gun Best gun hands out; top tile is its pick: ${job}, ${name}, holding ${holds ?? 'the pistol'}`, () => {
          const base = camp(stash, holds);
          const g: GameState = {
            ...base,
            roster: base.roster.map((d) => ({ ...d, job, xp: xpForLevel(21) })),
          };
          const tiles = gunTiles(g, 'recruit-1');
          const move = bestGuns(g).moves.find((m) => m.id === 'recruit-1');
          if (move) {
            const to = typeof move.to === 'string' ? 'pistol' : move.to.uid;
            expect(tiles[0]!.choice).toBe(to);
            expect(tiles.find((t) => t.choice === to)!.delta.kind).toBe('up');
            expect(bestUpgrade(tiles)).toBe(to);
          } else {
            // Best gun keeps what they hold: no tile is a Power upgrade.
            expect(tiles.every((t) => t.delta.kind !== 'up')).toBe(true);
          }
        });
      }
    }
  }
});

// A higher mode (ID-237): Best gun scores a gun by what it adds to the squad's effective power
// against the horde's traits, so the picker must rank and mark by the same number.
describe('the picker agrees with Best gun in Nightmare and Hell (ID-248)', () => {
  const stash = [
    gun('a', 'smg', 'common'),
    gun('b', 'rifle', 'common'),
    gun('c', 'sniper', 'common'),
    gun('d', 'shotgun', 'common'),
    gun('e', 'assault', 'common'),
  ];
  const inMode = (mode: 'nightmare' | 'hell', squad: number): GameState => {
    const base = camp(stash);
    return {
      ...base,
      mode,
      modes: { [mode]: 1 },
      roster: Array.from({ length: squad }, (_, i) => recruit(i + 1)),
    };
  };

  for (const mode of ['nightmare', 'hell'] as const) {
    for (const squad of [1, 3]) {
      it(`top tile is Best gun's pick, never ▼: ${mode}, squad of ${squad}`, () => {
        const g = inMode(mode, squad);
        const tiles = gunTiles(g, 'recruit-1');
        const move = bestGuns(g).moves.find((m) => m.id === 'recruit-1')!;
        const to = typeof move.to === 'string' ? 'pistol' : move.to.uid;
        expect(tiles[0]!.choice).toBe(to);
        expect(bestUpgrade(tiles)).toBe(to);
        expect(tiles.find((t) => t.choice === to)!.delta.kind).toBe('up');
      });
    }

    it(`${mode}: a lone survivor's pick differs from plain Power's, and the picker follows Best gun`, () => {
      const g = inMode(mode, 1);
      const who = squadSpec(g.roster[0]!);
      const plainTop = [...stash].sort((x, y) => powerOf(who, y) - powerOf(who, x))[0]!.uid;
      const move = bestGuns(g).moves.find((m) => m.id === 'recruit-1')!;
      const to = typeof move.to === 'string' ? 'pistol' : move.to.uid;
      expect(plainTop).not.toBe(to);
      const tiles = gunTiles(g, 'recruit-1');
      expect(tiles[0]!.choice).toBe(to);
      // The comparison's verdict is the same change in the same Power.
      const held = heldGunOf(g.roster[0]!);
      const cmp = gunCompare(held, tiles[0]!.held, who, handWorth(g, g.roster[0]!));
      expect(cmp.kind).toBe('up');
      expect(tiles[0]!.delta.kind).toBe('up');
    });
  }

  it('on Normal the tiles are plain Power, as before', () => {
    const g = camp(stash);
    const who = squadSpec(g.roster[0]!);
    expect(gunTiles(g, 'recruit-1').map((t) => t.power)).toEqual(
      stash.map((w) => powerOf(who, w)).sort((x, y) => y - x),
    );
  });
});

describe('the comparison (ID-108)', () => {
  it('says stronger or weaker in words, with the Power and the percent (ID-248)', () => {
    const rifle = gun('r', 'rifle', 'common');
    const relic = gun('x', 'rifle', 'relic');
    const up = gunCompare(rifle, relic, rookie, plain(rookie));
    const d = shown(rookie, relic) - shown(rookie, rifle);
    const pct = Math.round(
      ((powerOf(rookie, relic) - powerOf(rookie, rifle)) / powerOf(rookie, rifle)) * 100,
    );
    expect(up.verdict).toBe(`▲ Stronger: +${powerText(d)} Power (+${pct}%)`);
    const down = gunCompare(relic, rifle, rookie, plain(rookie));
    expect(down.verdict).toMatch(/^▼ Weaker: −[\d,]+ Power \(−\d+%\)$/);
    // Same Power: no arrow.
    expect(gunCompare(rifle, { ...rifle, uid: 'twin' }, rookie, plain(rookie)).verdict).toBe(
      '= Same Power',
    );
    expect(up.newName).toBe('Lv 1 Relic Carbine');
    expect(up.kind).toBe('up');
  });

  it('writes the changes out: slower, shorter, new role', () => {
    const rows = Object.fromEntries(
      gunCompare('pistol', gun('s', 'smg', 'common'), rookie, plain(rookie)).rows.map((r) => [
        r.label,
        r,
      ]),
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

  it('shows pellets like "10.0 × 4", and affixes written out', () => {
    const rifle = gun('r', 'rifle', 'prototype', [{ id: 'damage', value: 10 }]);
    const shotgun = gun('g', 'shotgun', 'common');
    const rows = Object.fromEntries(
      gunCompare(rifle, shotgun, rookie, plain(rookie)).rows.map((r) => [r.label, r]),
    );
    expect(rows['Damage']!.next).toBe('10.0 × 4');
    expect(rows['Affixes']).toMatchObject({
      now: '1',
      next: 'none',
      change: 'loses +10% damage',
      tone: 'worse',
    });
    expect(rows['Role']!.change).toBe('new role');
    const back = Object.fromEntries(
      gunCompare(shotgun, rifle, rookie, plain(rookie)).rows.map((r) => [r.label, r]),
    );
    expect(back['Affixes']).toMatchObject({
      now: 'none',
      next: '1',
      change: '+10% damage',
      tone: 'better',
    });
    // The same gun twice: every change is "same".
    const same = gunCompare(rifle, { ...rifle, uid: 'twin' }, rookie, plain(rookie));
    expect(same.rows.every((r) => r.change === 'same')).toBe(true);
  });

  it('a gun’s name carries its level; the free pistol has none', () => {
    expect(gunName('pistol')).toBe('Pistol');
    expect(gunName({ ...gun('r', 'rifle', 'common'), level: 12 })).toBe('Lv 12 Common Carbine');
  });
});
