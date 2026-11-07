// ID-067: the horde-only stash (the armoury) and each survivor's gun are saved and read
// back through the allow-list: known weapon ids only, the stash's length capped, and
// prototype keys, oversized and look-alike values refused.
import { describe, expect, it } from 'vitest';
import { roleOf, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { ARMOURY_CAP, STASH_CAP } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, equipGun, finishSquadHorde, startSquadHorde } from '../core/hordeonly.ts';
import { decodeSave, encodeSave, MAX_SAVE_CHARS } from './save.ts';
import { NOW } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** `weapon` made Military with the one affix `affix`. */
function military(weapon: Loose, affix: Loose): void {
  weapon.rarity = 'military';
  weapon.affixes = [affix];
}

function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

/** Horde-only after `wins` wins from Horde 1, with recruit-1 holding the first drop. */
function armed(wins: number): GameState {
  let g = newGame('horde');
  for (let i = 0; i < wins; i++) {
    g = finishSquadHorde(g, { ...startSquadHorde(g, 100 + i, NOW), outcome: 'won' });
    // In hand at once, so a full stash never throws it away.
    if (i === 0) {
      const r = equipGun(g, 'recruit-1', 'h1');
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    }
  }
  return g;
}

describe('save: the stash and equipped guns (ID-067)', () => {
  it('round-trips the stash and each survivor’s gun', () => {
    const g = armed(4);
    expect(g.armoury.map((w) => w.uid)).toEqual(['h2', 'h3', 'h4']);
    expect(g.roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
    expect(reread(g)?.game).toEqual(g);
  });

  it('round-trips a full stash with six armed survivors, well inside the save size', () => {
    const g = armed(STASH_CAP + 7);
    let next = g;
    for (const [i, d] of next.roster.slice(1).entries()) {
      const r = equipGun(next, d.id, next.armoury[i]!.uid);
      if (!r.ok) throw new Error(r.reason);
      next = r.game;
    }
    expect(next.armoury).toHaveLength(STASH_CAP - 5);
    // Five more wins fill it back up.
    for (let i = 0; i < 5; i++) {
      next = finishSquadHorde(next, { ...startSquadHorde(next, 900 + i, NOW), outcome: 'won' });
    }
    expect(next.armoury).toHaveLength(STASH_CAP);
    expect(next.roster.every((d) => typeof d.loadout.primary === 'object')).toBe(true);
    const raw = encodeSave(next, NOW);
    expect(raw.length).toBeLessThan(MAX_SAVE_CHARS / 2);
    expect(decodeSave(raw)?.game).toEqual(next);
  });

  it('gun roles (ID-101): older guns keep their affixes and gain their trait; role affixes are checked per gun', () => {
    const g = armed(4);
    const as = (base: string, affix: Loose) => (x: Loose) => {
      x.armoury[0].base = base;
      military(x.armoury[0], affix);
    };
    // An older LMG's magazine roll, below the LMG's role range, still reads, unchanged.
    const old = reread(g, as('lmg', { id: 'magazine', value: 25 }));
    expect(old?.game.armoury[0]).toMatchObject({
      base: 'lmg',
      affixes: [{ id: 'magazine', value: 25 }],
    });
    expect(roleOf('lmg')?.trait).toMatch(/slow/);
    // Role affixes read on their own gun.
    for (const [base, affix] of [
      ['lmg', { id: 'magazine', value: 80 }],
      ['sniper', { id: 'pierce', value: 2 }],
      ['rifle', { id: 'critDamage', value: 50 }],
      ['shotgun', { id: 'pellets', value: 2 }],
      ['smg', { id: 'closeDamage', value: 10 }],
      ['sniper', { id: 'bossDamage', value: 35 }],
    ] as const) {
      expect(reread(g, as(base, affix)), `${base} ${affix.id}`).not.toBeNull();
    }
    // Another gun's role affix, or a value past the gun's range, is refused.
    for (const [base, affix] of [
      ['smg', { id: 'pellets', value: 1 }],
      ['rifle', { id: 'slow', value: 10 }],
      ['shotgun', { id: 'crit', value: 5 }],
      ['smg', { id: 'magazine', value: 80 }],
      ['rifle', { id: 'pierce', value: 2 }],
      ['shotgun', { id: 'pellets', value: 3 }],
      // Pellets drive bullets per shot: no zero, fraction, text or negative count.
      ['shotgun', { id: 'pellets', value: 0 }],
      ['shotgun', { id: 'pellets', value: 1.5 }],
      ['shotgun', { id: 'pellets', value: '2' }],
      ['shotgun', { id: 'pellets', value: -1 }],
      ['lmg', { id: 'slow', value: 1e9 }],
    ] as const) {
      expect(reread(g, as(base, affix)), `${base} ${affix.id} ${affix.value}`).toBeNull();
    }
  });

  it('refuses hostile stash and gun values', () => {
    const g = armed(4);
    // The control: a Military weapon with a valid affix loads.
    expect(reread(g, (x) => military(x.armoury[0], { id: 'damage', value: 10 }))).not.toBeNull();
    const w = (x: Loose): Loose => x.armoury[0];
    const cases: [string, (x: Loose) => void][] = [
      ['an unknown weapon id', (x) => (w(x).base = 'bazooka')],
      ['a look-alike weapon id', (x) => (w(x).base = 'rіfle')],
      ['a padded weapon id', (x) => (w(x).base = ' rifle')],
      ['an unknown rarity', (x) => (w(x).rarity = 'legendary')],
      // Military, so one affix is due and the affix's own checks are what refuse it.
      ['an unknown affix', (x) => military(w(x), { id: 'nuke', value: 5 })],
      ['an affix out of range', (x) => military(w(x), { id: 'damage', value: 1e9 })],
      ['a fractional affix', (x) => military(w(x), { id: 'damage', value: 7.5 })],
      ['a uid from a horde not won yet', (x) => (w(x).uid = 'h99')],
      ['a uid with markup', (x) => (w(x).uid = 'h1<b>')],
      ['an oversized uid', (x) => (w(x).uid = 'h' + '1'.repeat(10_000))],
      ['a weapon twice', (x) => x.armoury.push(w(x))],
      ['a held weapon also in the stash', (x) => x.armoury.push(x.roster[0].loadout.primary)],
      ['an unknown key', (x) => (w(x).extra = 1)],
      ['a stash of text', (x) => (x.armoury = 'h1')],
      ['a stash not a list', (x) => (x.armoury = { 0: w(x) })],
      ['an unknown gun in hand', (x) => (x.roster[0].loadout.primary = 'bazooka')],
      ['a free gun that is no gun', (x) => (x.roster[0].loadout.primary = 'knife')],
      ['a gun in hand from a horde not won', (x) => (x.roster[0].loadout.primary.uid = 'h50')],
    ];
    for (const [name, change] of cases) expect(reread(g, change), name).toBeNull();
  });

  it('caps the stash as it is read: the camp’s 30 owned weapons load, one more is refused', () => {
    // A camp at Horde 60 with nobody holding an owned gun: every uid is a horde already won.
    const many = (n: number): OwnedWeapon[] =>
      Array.from({ length: n }, (_, i) => ({
        uid: `h${i + 1}`,
        base: 'smg',
        rarity: 'common',
        affixes: [],
      }));
    const g = { ...newGame('horde'), hordeNumber: 60 };
    const at = { ...g, armoury: many(ARMOURY_CAP) };
    expect(reread(at)?.game).toEqual(at);
    expect(reread(at, (x) => x.armoury.push({ ...x.armoury[0], uid: 'h59' }))).toBeNull();
    // Far past the size check: refused before it is parsed.
    const huge = encodeSave({ ...g, armoury: many(59) }, NOW).replace(
      /"armoury":\[[^\]]*\]/,
      `"armoury":[${Array.from({ length: 5_000 }, (_, i) => `{"uid":"h${i}","base":"smg","rarity":"common","affixes":[]}`).join(',')}]`,
    );
    expect(huge.length).toBeGreaterThan(MAX_SAVE_CHARS);
    expect(decodeSave(huge)).toBeNull();
  });

  it('refuses prototype keys in a stash weapon, an affix or a held gun', () => {
    const g = armed(4);
    const raws = [
      encodeSave(g, NOW).replace('"armoury":[{', '"armoury":[{"__proto__":{"x":1},'),
      encodeSave(g, NOW).replace('"armoury":[{', '"armoury":[{"constructor":{"x":1},'),
      encodeSave(g, NOW).replace('"primary":{', '"primary":{"__proto__":{"x":1},'),
      encodeSave(g, NOW).replace('"armoury":', '"__proto__":{"x":1},"armoury":'),
    ];
    for (const raw of raws) {
      expect(raw).toMatch(/__proto__|constructor/);
      expect(decodeSave(raw)).toBeNull();
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('round-trips a combined gun, which a survivor can take after a reload (ID-091)', () => {
    const g = armed(4);
    g.armoury = g.armoury.map((w) => ({
      ...w,
      base: 'smg',
      rarity: 'military',
      affixes: [{ id: 'damage', value: 10 }],
    }));
    const r = combineGuns(g, ['h2', 'h3', 'h4']);
    if (!r.ok) throw new Error(r.reason);
    expect(r.weapon).toMatchObject({ uid: 'h2', base: 'smg', rarity: 'prototype' });
    expect(r.weapon.affixes).toHaveLength(2);
    const back = reread(r.game)?.game;
    expect(back).toEqual(r.game);
    // The combined gun is an ordinary stash gun once loaded: a survivor can take it.
    expect(equipGun(back!, 'recruit-2', 'h2').ok).toBe(true);
  });

  it('a new survivor joins with the pistol, and loads back with it', () => {
    const g = armed(2);
    expect(g.roster.at(-1)).toEqual(recruit(3));
    expect(reread(g)?.game.roster.at(-1)?.loadout.primary).toBe('pistol');
  });
});
