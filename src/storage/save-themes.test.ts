// ID-238: save version 26. Themed hordes: `themes` ({ seed, cleared }, written only when set) and a
// first-clear gun's uid `t<k>`. Everything in it is untrusted: an allow-listed shape, a 32-bit
// seed, known theme ids once each, and no more cleared than themed hordes beaten; a theme gun needs its theme cleared, an answering base and Military or better.
import { describe, expect, it } from 'vitest';
import { rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { THEME_IDS, type ThemeId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { themeAt } from '../core/themes.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW } from './testing.ts';

const ZW = '\u{200b}';
const BIDI = '\u{202e}';
const CYR_E = '\u{435}';
const CYR_A = '\u{430}';
const FULL_C = '\u{ff43}';
const ARABIC_1 = '\u{661}';

// Hostile saves are built loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** The lowest seed under which Normal Horde 15 is theme id. */
function seedFor(id: ThemeId): number {
  for (let seed = 1; ; seed++) if (themeAt(seed, 'normal', 15) === id) return seed;
}

/** A horde-only camp on Normal Horde next under theme seed, with extra on top. */
function camp(next: number, seed: number, extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: next,
    roster: [recruit(1)],
    camp: { ...g.camp, recruits: 1 },
    themes: { seed },
    ...extra,
  };
}

/** A camp that has beaten Horde 15 (so it has met id), with cleared and armoury on top. */
const beaten = (id: ThemeId, cleared: ThemeId[] | undefined, armoury: OwnedWeapon[] = []) =>
  camp(16, seedFor(id), {
    themes: { seed: seedFor(id), ...(cleared ? { cleared } : {}) },
    armoury,
  });

const themeGun = (k: number, base: OwnedWeapon['base'], rarity: OwnedWeapon['rarity']) =>
  rollWeapon(createRng(k), 't' + k, base, rarity, 15);

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: themed hordes (ID-238)', () => {
  it('is version 26, and a game with no theme seed writes no key', () => {
    expect(SAVE_VERSION).toBe(28);
    const g = newGame('horde');
    expect('themes' in JSON.parse(encodeSave(g, NOW)).game).toBe(false);
    expect(reread(g)!.game).toEqual(g);
  });

  it('round-trips the seed and the cleared themes (in THEME_IDS order)', () => {
    const g = beaten('crawl', ['crawl']);
    expect(reread(g)!.game).toEqual(g);
    expect(reread(g)!.game.themes).toEqual({ seed: seedFor('crawl'), cleared: ['crawl'] });
    const seedOnly = camp(1, 77);
    expect(reread(seedOnly)!.game).toEqual(seedOnly);
    for (const seed of [0, 0xffffffff]) expect(reread(camp(1, seed))!.game.themes?.seed).toBe(seed);
    // Several themes met on a long run, written in any order, read back in THEME_IDS order.
    const seed = 5;
    const met = [15, 25, 35, 45, 55, 65].map((n) => themeAt(seed, 'normal', n)!);
    const want = THEME_IDS.filter((t) => met.includes(t));
    const all = camp(70, seed, { themes: { seed, cleared: want } });
    const shuffled = reread(all, (g) => g.themes.cleared.reverse())!;
    expect(shuffled.game.themes?.cleared).toEqual(want);
  });

  it('a campaign save (the full game, no mode) with a cleared theme round-trips too', () => {
    const seed = seedFor('bloat');
    const g: GameState = {
      ...newGame('full', seed),
      hordeNumber: 16,
      themes: { seed, cleared: ['bloat'] },
    };
    const back = reread(g)!.game;
    expect(back.themes).toEqual({ seed, cleared: ['bloat'] });
    expect(back).toEqual(g);
  });

  it('cleared may list any known themes, as many as themed hordes beaten and no more', () => {
    // Horde 16 on Normal: one themed horde (15) beaten.
    const seed = 9;
    const one = (cleared: ThemeId[]) => camp(16, seed, { themes: { seed, cleared } });
    for (const id of THEME_IDS) expect(reread(one([id])), id).not.toBeNull();
    expect(reread(one(['crawl', 'bloat']))).toBeNull();
    // Horde 15: none beaten, so nothing can be cleared. Horde 26: two.
    expect(reread(camp(15, seed, { themes: { seed, cleared: ['crawl'] } }))).toBeNull();
    const two = (cleared: ThemeId[]) => camp(26, seed, { themes: { seed, cleared } });
    expect(reread(two(['stampede', 'bloat']))).not.toBeNull();
    expect(reread(two(['stampede', 'bloat', 'crawl']))).toBeNull();
    // Saved as the player's own theme order is, whatever the picks rolled (no re-derivation).
    expect(reread(one(['ironwall']))!.game.themes?.cleared).toEqual(['ironwall']);
  });

  it('the themed hordes beaten on Nightmare and Hell count towards the bound', () => {
    const seed = 3;
    // Normal 16 (one beaten); Nightmare opens at Normal 51 (four beaten) so use that, plus Nightmare 16.
    const g = camp(51, seed, {
      mode: 'nightmare',
      modes: { nightmare: 16 },
      themes: { seed, cleared: [...THEME_IDS] },
    });
    expect(reread(g)!.game.themes?.cleared).toEqual([...THEME_IDS]);
  });

  it('a campaign save (no mode) is bounded by its own horde number too', () => {
    const seed = 4;
    const full = (next: number, cleared: ThemeId[]): GameState => ({
      ...newGame('full', seed),
      hordeNumber: next,
      themes: { seed, cleared },
    });
    expect(reread(full(16, ['crawl']))).not.toBeNull();
    expect(reread(full(16, ['crawl', 'bloat']))).toBeNull();
  });

  it('THEME_IDS fits the uid pattern’s single digit (t[1-N] breaks at 10)', () => {
    expect(THEME_IDS.length).toBeLessThanOrEqual(9);
  });

  it('a v25 or older save has no themes: the key is refused, and it loads with seed 0', () => {
    const g = beaten('crawl', ['crawl']);
    expect(reread(g, () => {}, 25)).toBeNull();
    expect(reread(g, () => {}, 24)).toBeNull();
    const plain = camp(16, 0);
    delete plain.themes;
    expect(reread(plain, () => {}, 25)!.game.themes).toBeUndefined();
  });

  it('refuses a themes object that is not a plain object with only seed and cleared', () => {
    const g = beaten('crawl', ['crawl']);
    for (const bad of [
      {},
      { cleared: [] },
      { seed: 1, extra: 1 },
      { seed: 1, ['seed' + ZW]: 2 },
      { seed: 1, [BIDI + 'seed']: 2 },
      { ['s' + CYR_E + 'ed']: 1 },
      [],
      [1],
      null,
      'themes',
      5,
      true,
    ]) {
      expect(
        reread(g, (x) => (x.themes = bad)),
        JSON.stringify(bad),
      ).toBeNull();
    }
    for (const key of ['__proto__', 'constructor']) {
      const text = encodeSave(g, NOW).replace('"themes":{', '"themes":{"' + key + '":{"x":1},');
      expect(decodeSave(text), key).toBeNull();
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('refuses a seed that is not a whole number from 0 to 2^32 - 1', () => {
    for (const seed of [
      0xffffffff + 1,
      -1,
      1.5,
      1e99,
      -1e99,
      Infinity,
      NaN,
      '5',
      '',
      null,
      true,
      [],
      {},
    ]) {
      expect(
        reread(camp(1, 5), (g) => (g.themes.seed = seed)),
        String(seed),
      ).toBeNull();
    }
    expect(reread(camp(1, 5), (g) => (g.themes.seed = 0xffffffff))).not.toBeNull();
  });

  it('refuses cleared lists that are too long, twice over, unknown, look-alikes or not a list', () => {
    const g = beaten('crawl', ['crawl']);
    const set = (v: unknown) => reread(g, (x) => (x.themes.cleared = v));
    expect(set(['crawl', 'crawl'])).toBeNull();
    expect(set([...THEME_IDS, 'crawl'])).toBeNull();
    expect(set(['crawl', 'bloat', 'stampede', 'ironwall', 'x'])).toBeNull();
    expect(set([])).toBeNull();
    for (const id of [
      'Crawl',
      ' crawl',
      'crawl ',
      'cra' + ZW + 'wl',
      'crawl' + BIDI,
      BIDI + 'crawl',
      'cr' + CYR_A + 'wl',
      FULL_C + 'rawl',
      '__proto__',
      'constructor',
      'toString',
      '',
      'x'.repeat(1_000_000),
      0,
      1,
      null,
      true,
      ['crawl'],
      { id: 'crawl' },
    ]) {
      expect(set([id]), JSON.stringify(id)?.slice(0, 30)).toBeNull();
    }
    for (const v of ['crawl', { 0: 'crawl' }, null, 5, true]) expect(set(v), String(v)).toBeNull();
  });

  it('a theme gun (uid t<k>) needs its theme cleared, an answering base and Military or better', () => {
    // t1 is Stampede's: smg or lmg.
    const ok = themeGun(1, 'smg', 'military');
    const withGun = (cleared: ThemeId[] | undefined, gun: OwnedWeapon) =>
      reread(beaten('stampede', cleared, [gun]));
    expect(withGun(['stampede'], ok)).not.toBeNull();
    expect(withGun(['stampede'], themeGun(1, 'lmg', 'prototype'))).not.toBeNull();
    // Nothing cleared.
    expect(withGun(undefined, ok)).toBeNull();
    // Only another theme cleared: a game that met two, t1 with only the second listed.
    const seed = seedFor('stampede');
    const next = themeAt(seed, 'normal', 25)!;
    expect(next).not.toBe('stampede');
    const two = camp(26, seed, {
      themes: { seed, cleared: [next] },
      armoury: [themeGun(1, 'smg', 'military')],
    });
    expect(reread(two)).toBeNull();
    // A base the theme does not answer, a rarity under Military.
    expect(withGun(['stampede'], themeGun(1, 'rifle', 'military'))).toBeNull();
    expect(withGun(['stampede'], themeGun(1, 'sniper', 'prototype'))).toBeNull();
    expect(withGun(['stampede'], themeGun(1, 'smg', 'common'))).toBeNull();
    expect(withGun(['stampede'], themeGun(1, 'smg', 'rusty'))).toBeNull();
    // Held by a survivor counts as well.
    const held = beaten('stampede', ['stampede']);
    const hold = (primary: OwnedWeapon) => ({
      ...held,
      roster: [{ ...held.roster[0]!, loadout: { primary, secondary: null, item: null } }],
    });
    expect(reread(hold(ok))).not.toBeNull();
    expect(reread(hold(themeGun(1, 'rifle', 'military')))).toBeNull();
  });

  it('refuses theme gun uids outside t1 to t4', () => {
    const g = beaten('stampede', ['stampede']);
    const uid = (u: string) =>
      reread({ ...g, armoury: [{ ...themeGun(1, 'smg', 'military'), uid: u }] });
    for (const bad of [
      't0',
      't5',
      't9',
      't10',
      't01',
      't1-1',
      't1-',
      't',
      'T1',
      't1 ',
      't1' + ZW,
      't' + ARABIC_1,
    ]) {
      expect(uid(bad), bad).toBeNull();
    }
    expect(uid('t1')).not.toBeNull();
  });

  it('the uid pattern tracks THEME_IDS: t1 to t<count> load, the next one is refused', () => {
    const last = THEME_IDS.length;
    const g = beaten('stampede', ['stampede']);
    const uid = (u: string) =>
      reread({ ...g, armoury: [{ ...themeGun(1, 'smg', 'military'), uid: u }] });
    // t1 is the cleared theme's; every other uid up to the count is a known shape (refused here only for its theme).
    expect(uid('t1')).not.toBeNull();
    expect(uid(`t${last + 1}`)).toBeNull();
    for (let k = 2; k <= last; k++) expect(uid(`t${k}`), `t${k}`).toBeNull();
  });

  it('a gun of a theme the save does not list as cleared is refused', () => {
    const g = beaten('crawl', ['crawl'], [themeGun(1, 'smg', 'military')]);
    expect(reread(g)).toBeNull();
  });
});
