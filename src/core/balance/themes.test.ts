// Balance: themed hordes (ID-238, design §9). Every mode's Horde 15, 25, 35, ... is built around
// one enemy kind at the plain horde's total HP and XP, so the squad that holds the plain horde
// should hold a themed one too: only the lopsided squads (one gun type) pay for it.
// Lower bounds only ("OP ok, stuck not"): nothing here asserts a squad does not win.
//
// Seed 0 (a save with no theme seed, which is what every fixture's `newGame('horde')` and the
// older saves have) meets, on Normal: Horde 15 Crawl, Horde 25 Iron Wall, Horde 35 Stampede,
// Horde 45 Crawl (Nightmare 15 Crawl, Hell 15 Bloat Tide). So these balance tests now meet a
// themed Horde 15 where they once played the plain one, and are re-measured, never loosened:
//   squad-power   (Hordes 9, 12, 15, 20; 70% and 130% at 15)  -> Crawl at 15
//   cards-under-power ([10, 15])                               -> Crawl at 15
//   wire          ([5, 10, 15])                                -> Crawl at 15
//   late-hordes   (to Horde 18)                                -> Crawl at 15
//   farming       (the wall at 16, the campaigns before it)    -> Crawl at 15
// and every campaign test (horde-only, lead, farming) passes Horde 15 on its way. The
// campaign sims (playSquadCampaign) take `themeSeed`, so they can meet other orders too.
// The measurements here force each theme through a theme seed that rolls it (`withTheme`).
import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../game.ts';
import { playSquadCampaign, playSquadHorde } from '../sim.ts';
import { THEME_IDS, THEMES, type ThemeId } from '../data.ts';
import { effHorde, type HigherMode } from '../modes.ts';
import { recommendedPower, squadPower } from '../squadpower.ts';
import { themeAt } from '../themes.ts';
import { cacheFor } from './cache.ts';
import { gunSquad, inMode, mixedSquad, SEEDS, squad, watchFight, withTheme } from './shared.ts';

const keep = cacheFor(import.meta.url);

/** Survivors in the expected squad (`shared.ts`'s SIZE). */
const SIZE = 8;

/** The first squad of `make`'s family (level 1 up) whose Squad Power is at least `share` of `rec`. */
function squadAt(make: (level: number) => GameState, rec: number, share: number): GameState {
  for (let level = 1; level <= 400; level++) {
    const g = make(level);
    if (squadPower(g) >= rec * share) return g;
  }
  throw new Error('no squad reaches that power');
}

/** Hell opens after Nightmare's last horde: `g` in `mode` at its horde `n`. */
const inHorde = (g: GameState, mode: HigherMode, n: number): GameState => {
  const out = inMode(g, mode, n);
  return mode === 'hell' ? { ...out, modes: { nightmare: 51, hell: n } } : out;
};

/** Fights won out of SEEDS at horde `n`, the horde its theme's (`plain` false) or the plain one of its number. */
function winsOf(game: GameState, n: number, plain: boolean): number {
  let won = 0;
  for (let s = 1; s <= SEEDS; s++) {
    if (playSquadHorde(game, s * 101, undefined, undefined, n, false, plain).outcome === 'won') {
      won++;
    }
  }
  return won;
}

describe('themed hordes (ID-238)', () => {
  it('seed 0 meets these themes on Normal 15, 25, 35 and 45 (the older balance tests’ hordes)', () => {
    expect([15, 25, 35, 45].map((n) => themeAt(0, 'normal', n))).toEqual([
      'crawl',
      'ironwall',
      'stampede',
      'crawl',
    ]);
    expect(themeAt(0, 'nightmare', 15)).toBe('crawl');
    expect(themeAt(0, 'hell', 15)).toBe('bloat');
  });

  describe('B1: a sensible mix holds every theme at Normal Horde 25', () => {
    const rec = recommendedPower(25, 'normal', SIZE);
    const cells = new Map<ThemeId | 'plain', { one: number; high: number }>();
    beforeAll(() => {
      const one = squadAt((l) => mixedSquad(25, l), rec, 1);
      const high = squadAt((l) => mixedSquad(25, l), rec, 1.3);
      cells.set(
        'plain',
        keep('b1 plain', () => ({ one: winsOf(one, 25, true), high: winsOf(high, 25, true) })),
      );
      for (const id of THEME_IDS) {
        cells.set(
          id,
          keep(`b1 ${id}`, () => ({
            one: winsOf(withTheme(one, 'normal', 25, id), 25, false),
            high: winsOf(withTheme(high, 'normal', 25, id), 25, false),
          })),
        );
      }
      console.log(`themes B1 (of ${SEEDS}): ${JSON.stringify([...cells])}`);
    }, 3_600_000);

    it('at 1.0x Recommended Power each theme wins at least the plain horde’s wins less 4', () => {
      const plain = cells.get('plain')!.one;
      for (const id of THEME_IDS) {
        expect(cells.get(id)!.one, `${id}: ${JSON.stringify([...cells])}`).toBeGreaterThanOrEqual(
          plain - 4,
        );
      }
    });

    it('at 1.3x Recommended Power each theme wins at least the plain horde’s wins less 4, and 10 of 20', () => {
      const plain = cells.get('plain')!.high;
      for (const id of THEME_IDS) {
        const high = cells.get(id)!.high;
        const label = `${id}: ${JSON.stringify([...cells])}`;
        expect(high, label).toBeGreaterThanOrEqual(plain - 4);
        expect(high, label).toBeGreaterThanOrEqual(10);
      }
    });
  });

  it('B2: the Carbine wall at 1.0x Recommended Power wins, per theme, at least the plain horde’s wins less 4', () => {
    const rec = recommendedPower(25, 'normal', SIZE);
    const wall = squadAt((l) => squad(25, l), rec, 1);
    const out = keep('b2', () => {
      const r: Record<string, number> = { plain: winsOf(wall, 25, true) };
      for (const id of THEME_IDS) r[id] = winsOf(withTheme(wall, 'normal', 25, id), 25, false);
      return r;
    });
    console.log(`themes B2 Carbine wall (of ${SEEDS}): ${JSON.stringify(out)}`);
    for (const id of THEME_IDS)
      expect(out[id], JSON.stringify(out)).toBeGreaterThanOrEqual(out.plain! - 4);
  }, 3_600_000);

  it('B3: Nightmare Iron Wall at 1.3x: an all-LMG squad wins at least 3 fewer than the mix', () => {
    const rec = recommendedPower(effHorde('nightmare', 15), 'nightmare', SIZE);
    const themed = (g: GameState): GameState =>
      withTheme(inHorde(g, 'nightmare', 15), 'nightmare', 15, 'ironwall');
    const mix = themed(squadAt((l) => mixedSquad(51, l), rec, 1.3));
    const lmg = themed(squadAt((l) => gunSquad(51, l, ['lmg']), rec, 1.3));
    const r = keep('b3', () => ({ mix: winsOf(mix, 15, false), lmg: winsOf(lmg, 15, false) }));
    console.log(`themes B3 Nightmare 15 Iron Wall (of ${SEEDS}): ${JSON.stringify(r)}`);
    expect(r.lmg, JSON.stringify(r)).toBeLessThanOrEqual(r.mix - 3);
  }, 3_600_000);

  it('B4: Hell Horde 15, each theme: the mix at 1.3x wins at least the plain horde’s wins less 4, and 10 of 20', () => {
    const rec = recommendedPower(effHorde('hell', 15), 'hell', SIZE);
    const mix = squadAt((l) => mixedSquad(51, l), rec, 1.3);
    const r = keep('b4 with plain', () => {
      const out: Record<string, number> = { plain: winsOf(inHorde(mix, 'hell', 15), 15, true) };
      for (const id of THEME_IDS) {
        out[id] = winsOf(withTheme(inHorde(mix, 'hell', 15), 'hell', 15, id), 15, false);
      }
      return out;
    });
    console.log(`themes B4 Hell 15 mix at 1.3x (of ${SEEDS}): ${JSON.stringify(r)}`);
    for (const id of THEME_IDS) {
      expect(r[id], JSON.stringify(r)).toBeGreaterThanOrEqual(r.plain! - 4);
      expect(r[id], JSON.stringify(r)).toBeGreaterThanOrEqual(10);
    }
  }, 3_600_000);

  it('B5: the drop pool answers in time: 20 campaigns own a gun for their Horde 15 theme in 18+', () => {
    const r = keep('b5', () => {
      const per: Record<string, [number, number]> = {};
      let owned = 0;
      for (let i = 0; i < 20; i++) {
        const themeSeed = 1000 + i;
        const theme = themeAt(themeSeed, 'normal', 15)!;
        let has: boolean | null = null;
        playSquadCampaign(500 + i * 37, 15, {
          themeSeed,
          onFight: (game, n) => {
            if (n !== 15 || has !== null) return;
            const guns = [
              ...game.armoury,
              ...game.roster.flatMap((d) => [d.loadout.primary, d.loadout.secondary]),
              ...game.reserve.flatMap((d) => [d.loadout.primary, d.loadout.secondary]),
            ];
            has = guns.some(
              (g) =>
                typeof g === 'object' &&
                g !== null &&
                THEMES[theme].answers.includes(g.base as never),
            );
          },
        });
        const row = (per[theme] ??= [0, 0]);
        row[1]++;
        if (has === true) {
          row[0]++;
          owned++;
        }
      }
      return { owned, per };
    });
    console.log(`themes B5 campaigns that own an answer at Horde 15: ${JSON.stringify(r)}`);
    expect(r.owned, JSON.stringify(r)).toBeGreaterThanOrEqual(18);
  }, 3_600_000);

  it('B6: a Stampede Horde 45 puts at most 1.75x the plain horde’s enemies on the field at once', () => {
    const rec = recommendedPower(45, 'normal', SIZE);
    const game = withTheme(
      squadAt((l) => squad(45, l), rec, 1),
      'normal',
      45,
      'stampede',
    );
    const r = keep('b6', () => {
      const rows: [number, number, number, number][] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const themed = watchFight(game, seed * 101, 45);
        const plain = watchFight(game, seed * 101, 45, true);
        rows.push([themed.peak, plain.peak, themed.level, plain.level]);
      }
      return rows;
    });
    console.log(`themes B6 peak enemies and fight levels, themed vs plain: ${JSON.stringify(r)}`);
    for (const [themed, plain] of r)
      expect(themed, JSON.stringify(r)).toBeLessThanOrEqual(1.75 * plain);
  }, 3_600_000);

  it('logs the card offers a fight of each theme brings against the plain horde’s (about 1 with XP matched)', () => {
    const rec = recommendedPower(25, 'normal', SIZE);
    const strong = squadAt((l) => mixedSquad(25, l), rec, 1.3);
    const out = keep('levels', () => {
      const r: Record<string, number> = {};
      const mean = (id: ThemeId | null): number => {
        let total = 0;
        for (let seed = 1; seed <= 6; seed++) {
          const g = id ? withTheme(strong, 'normal', 25, id) : strong;
          total += watchFight(g, seed * 101, 25, id === null).level;
        }
        return total / 6;
      };
      const plain = mean(null);
      for (const id of THEME_IDS) r[id] = mean(id) / plain;
      return r;
    });
    console.log(`themes fight levels, theme over plain: ${JSON.stringify(out)}`);
    expect(Object.keys(out)).toHaveLength(THEME_IDS.length);
  }, 3_600_000);
});
