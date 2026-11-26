// ID-238 (design §9, "Themed hordes"): which hordes are themed, which theme a horde brings
// (a pure pick from the save's seed), that a themed horde keeps the plain horde's total HP and
// XP, the first-clear reward, and the campaign's Genes.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RARITY_ORDER,
  ENEMY_MIX,
  ENEMIES,
  FARM,
  SQUAD_CAP,
  STASH_CAP,
  SWARM,
  THEME,
  THEME_IDS,
  THEMES,
  type ThemeId,
} from './data.ts';
import {
  dropGuns,
  finishSquadHorde,
  fitFor,
  hordeKindHp,
  squadDrop,
  squadSize,
  squadResult,
  squadScrap,
  startSquadHorde,
  themeReward,
  winStash,
} from './hordeonly.ts';
import { recruit } from './camp.ts';
import { finishHorde, newGame, startHorde, type GameState } from './game.ts';
import { effHorde, localHorde, MODE_IDS, type Mode } from './modes.ts';
import {
  THEME_GUN_STREAM,
  THEME_PICK_STREAM,
  themeAt,
  themeCleared,
  themeOf,
  themeSequence,
  themedSlotsBeaten,
} from './themes.ts';
import { unlucky } from './sim.ts';
import { fitContext } from './traits.ts';
import { hordeHp, recommendedPower } from './squadpower.ts';
import { isThemed, swarmWave, themeKind, themeMix, themeScale, waveSize } from './waves.ts';
import { inMode, squad, watchFight, withTheme } from './balance/shared.ts';
import type { OwnedWeapon } from './armoury.ts';

const NOW = 1_700_000_000_000;
const MODES: readonly Mode[] = MODE_IDS;

/** A horde-only game with `n` survivors at Normal Horde `next`, theme seed `seed`. */
function squadGame(n: number, next: number, seed = 0, armoury: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: next,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury,
    ...(seed === 0 ? {} : { themes: { seed } }),
  };
}

/** A game on Normal Horde 15 that meets `theme` there. */
const meeting = (theme: ThemeId, armoury: OwnedWeapon[] = [], next = 15): GameState => {
  const g = withTheme(squadGame(6, next), 'normal', 15, theme);
  return { ...g, armoury };
};

/** Horde `horde` of `game` from `seed`, won. */
const won = (game: GameState, horde: number, seed = 1) => ({
  ...startSquadHorde(game, seed, NOW, horde),
  outcome: 'won' as const,
});

const filler = (i: number): OwnedWeapon => ({
  uid: `h${i + 1}`,
  base: 'pistol',
  rarity: 'rusty',
  affixes: [],
  level: 1,
});

describe('which hordes are themed', () => {
  it('15, 25, 35, ... of a mode; never 5, 10, 14, 20 or a bad number', () => {
    for (const n of [15, 25, 35, 45, 95, 1005]) expect(isThemed(n), String(n)).toBe(true);
    for (const n of [0, 1, 5, 10, 14, 16, 20, 30, 50, 100, -5, 15.5, NaN, Infinity]) {
      expect(isThemed(n), String(n)).toBe(false);
    }
    for (const mode of MODES) {
      expect(themeAt(1, mode, 5)).toBeNull();
      expect(themeAt(1, mode, 20)).toBeNull();
      expect(themeAt(1, mode, 15)).not.toBeNull();
    }
  });

  it('the offsets keep the parity: a mode horde is themed when its effective horde would be', () => {
    for (const mode of MODES) {
      for (let n = 15; n <= 120; n++)
        expect(isThemed(effHorde(mode, n)), String(n)).toBe(isThemed(n));
    }
  });
});

describe('which theme (a pure pick from the seed)', () => {
  it('is the same for the same inputs, never the one before, and every theme comes', () => {
    const seen = new Set<ThemeId>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const mode of MODES) {
        const seq = themeSequence(seed, mode, 505);
        expect(seq).toHaveLength(50);
        expect(themeSequence(seed, mode, 505)).toEqual(seq);
        seq.forEach((t, i) => {
          expect(t, `${seed} ${mode} ${i}`).not.toBeNull();
          if (i > 0) expect(t).not.toBe(seq[i - 1]);
          seen.add(t!);
          expect(themeAt(seed, mode, 15 + 10 * i)).toBe(t);
        });
      }
    }
    expect([...seen].sort()).toEqual([...THEME_IDS].sort());
  });

  it('a horde keeps its theme whatever horde the game stands at (a pick of the seed alone)', () => {
    const a = themeAt(7, 'normal', 35);
    const g = { ...squadGame(1, 35, 7) };
    expect(themeOf(g)).toBe(a);
    expect(themeOf({ ...g, hordeNumber: 36 }, 35)).toBe(a);
  });

  it('the modes roll their own sequences, and the seed changes them', () => {
    const seq = (seed: number, mode: Mode) => themeSequence(seed, mode, 155).join();
    let modesDiffer = false;
    let seedsDiffer = false;
    for (let seed = 1; seed <= 20; seed++) {
      if (seq(seed, 'normal') !== seq(seed, 'nightmare')) modesDiffer = true;
      if (seq(seed, 'hell') !== seq(seed, 'nightmare')) modesDiffer = true;
      if (seq(seed, 'normal') !== seq(seed + 1, 'normal')) seedsDiffer = true;
    }
    expect(modesDiffer).toBe(true);
    expect(seedsDiffer).toBe(true);
  });

  it('an older save (no seed) shares sequence 0', () => {
    const g = squadGame(1, 25);
    expect(g.themes).toBeUndefined();
    expect(themeOf(g)).toBe(themeAt(0, 'normal', 25));
  });

  it('leaves out a theme whose kind has not appeared by the horde', () => {
    const was = ENEMY_MIX.runner!.from;
    try {
      (ENEMY_MIX as Record<string, { from: number; share: number }>).runner = {
        from: 9999,
        share: 0.15,
      };
      for (let seed = 1; seed <= 100; seed++) {
        for (const t of themeSequence(seed, 'normal', 205)) expect(t).not.toBe('stampede');
      }
    } finally {
      (ENEMY_MIX as Record<string, { from: number; share: number }>).runner = {
        from: was,
        share: 0.15,
      };
    }
    expect(themeSequence(1, 'normal', 205).length).toBe(20);
  });

  it('seed 0 meets these themes at Normal 15, 25, 35 and 45 (named in the balance test)', () => {
    expect([15, 25, 35, 45].map((n) => themeAt(0, 'normal', n))).toEqual([
      'crawl',
      'ironwall',
      'stampede',
      'crawl',
    ]);
  });

  it('the two new RNG streams differ from each other and from every stream in the source', () => {
    const streams = new Map<number, string>();
    for (const dir of ['.', '../storage', '../ui']) {
      const path = new URL(dir + '/', import.meta.url);
      for (const f of readdirSync(path)) {
        if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f.startsWith('themes.')) continue;
        const text = readFileSync(new URL(f, path), 'utf8');
        for (const m of text.matchAll(/const (\w+_STREAM) = (0x[0-9a-f]+)/g)) {
          streams.set(Number(m[2]), `${f} ${m[1]}`);
        }
      }
    }
    expect(streams.size).toBeGreaterThanOrEqual(8);
    expect(THEME_PICK_STREAM).not.toBe(THEME_GUN_STREAM);
    expect(streams.has(THEME_PICK_STREAM)).toBe(false);
    expect(streams.has(THEME_GUN_STREAM)).toBe(false);
  });
});

describe('a themed horde at equal total HP', () => {
  it('the kinds come in the theme’s mix, Shamblers for the rest', () => {
    for (const id of THEME_IDS) {
      const mix = themeMix(id);
      expect(mix.reduce((t, [, s]) => t + s, 0)).toBeCloseTo(1, 12);
      expect(mix.find(([k]) => k === THEMES[id].kind)![1]).toBe(THEMES[id].share);
      expect(themeKind(id, 0)).toBe('shambler');
      expect(themeKind(id, 0.9999)).toBe(THEMES[id].kind);
    }
  });

  it('Stampede is capped at THEME.maxCount enemies and the rest goes into their HP', () => {
    const s = themeScale('stampede', 45, false);
    expect(s.count).toBe(THEME.maxCount);
    expect(s.hp).toBeGreaterThan(1);
    expect(s.count * s.hp).toBeCloseTo(themeScale('stampede', 45, false).count * s.hp, 12);
    for (const id of ['ironwall', 'crawl', 'bloat'] as const) {
      expect(themeScale(id, 45, false).hp).toBe(1);
      expect(themeScale(id, 45, true).hp).toBe(1);
    }
    expect(themeScale('ironwall', 45, false).count).toBeLessThan(1);
  });

  it('every theme in every mode at local Hordes 15 and 45 sums to the plain horde’s HP within 2%', () => {
    for (const mode of MODES) {
      for (const local of [15, 45]) {
        const n = effHorde(mode, local);
        for (const size of [SQUAD_CAP, 8]) {
          const plain = hordeHp(n, mode, size);
          for (const id of THEME_IDS) {
            const sum = hordeKindHp(n, mode, size, id).reduce((t, [, hp]) => t + hp, 0);
            expect(sum / plain, `${mode} ${local} ${id} ${size}`).toBeGreaterThan(0.98);
            expect(sum / plain, `${mode} ${local} ${id} ${size}`).toBeLessThan(1.02);
          }
        }
      }
    }
  });

  it('a themed horde asks the plain horde’s Recommended Power (nothing in it reads the theme)', () => {
    expect(recommendedPower(15)).toBe(recommendedPower(15, 'normal'));
  });

  it('only the theme’s kind and Shamblers come in the HP split, plus the elites’ and bosses’', () => {
    for (const id of THEME_IDS) {
      const kinds = hordeKindHp(15, 'normal', SQUAD_CAP, id).map(([k]) => k);
      for (const k of kinds) expect(['shambler', THEMES[id].kind, 'brute', 'swollen']).toContain(k);
    }
  });

  it('played fights: a themed horde spawns the plain horde’s HP and XP (within 5% over 12 seeds), in the theme’s mix', () => {
    const cases: [Mode, number, number][] = [
      ['normal', 15, 400],
      ['hell', 45, 400],
    ];
    const SEEDS = 12;
    for (const [mode, local, level] of cases) {
      const eff = effHorde(mode, local);
      for (const id of THEME_IDS) {
        const base =
          mode === 'normal' ? squad(local, level) : inMode(squad(200, level), mode, local);
        const game = withTheme(
          mode === 'hell' ? { ...base, modes: { nightmare: 51, hell: local } } : base,
          mode,
          local,
          id,
        );
        const label = `${mode} ${local} ${id}`;
        const sum = { themed: { hp: 0, xp: 0 }, plain: { hp: 0, xp: 0 } };
        // The kind's count and the whole, over every wave and over the swarm waves alone.
        const share = { all: [0, 0], swarm: [0, 0] };
        for (let seed = 1; seed <= SEEDS; seed++) {
          const themed = watchFight(game, seed, local);
          const plain = watchFight(game, seed, local, true);
          expect(themed.outcome, label).toBe('won');
          expect(plain.outcome, label).toBe('won');
          sum.themed.hp += themed.hp;
          sum.themed.xp += themed.xp;
          sum.plain.hp += plain.hp;
          sum.plain.xp += plain.xp;
          for (const [w, kinds] of themed.kinds) {
            for (const [k, c] of Object.entries(kinds)) {
              for (const part of swarmWave(eff, w) ? [share.all, share.swarm] : [share.all]) {
                part[1]! += c;
                if (k === THEMES[id].kind) part[0]! += c;
              }
            }
          }
        }
        for (const key of ['hp', 'xp'] as const) {
          const ratio = sum.themed[key] / sum.plain[key];
          expect(ratio, `${label} ${key}`).toBeGreaterThan(0.95);
          expect(ratio, `${label} ${key}`).toBeLessThan(1.05);
        }
        // Within 5 points of the theme's share, swarm waves (no doubled Runners) included.
        for (const [name, [kind, all]] of Object.entries(share)) {
          if (all === 0) continue;
          expect(Math.abs(kind! / all! - THEMES[id].share), `${label} mix ${name}`).toBeLessThan(
            0.05,
          );
        }
      }
    }
  }, 600_000);

  it('wave 1 of a themed horde has the themed count (newHorde and the later waves agree)', () => {
    for (const id of ['stampede', 'ironwall'] as const) {
      const game = withTheme(squad(15, 5), 'normal', 15, id);
      const themed = startSquadHorde(game, 3, 0);
      const plain = startSquadHorde(game, 3, 0, 15, true);
      expect(themed.theme).toBe(id);
      expect('theme' in plain).toBe(false);
      const swarm = themed.swarm ? SWARM.size : 1;
      const want = Math.round(
        waveSize(15, 1, true) * swarm * themeScale(id, 15, themed.swarm).count,
      );
      expect(themed.toSpawn).toBe(want);
      expect(themed.toSpawn).not.toBe(plain.toSpawn);
      // The wire's first row is sized for it (as for a plain horde of that many).
      expect(themed.wire[0]!.max).toBeGreaterThan(0);
    }
  });

  it('a plain horde’s state has no theme key at all', () => {
    const s = startSquadHorde(squadGame(2, 14), 1, 0);
    expect('theme' in s).toBe(false);
    expect('xpCarry' in s).toBe(false);
    const t = startSquadHorde(meeting('crawl'), 1, 0);
    expect(t.theme).toBe('crawl');
  });

  it('XP per kill is whole: a themed kill pays the theme’s share with the fraction carried', () => {
    for (const id of THEME_IDS) {
      const x = themeScale(id, 15, false).xp;
      expect(x).toBeGreaterThan(0.5);
      expect(x).toBeLessThan(1.6);
    }
    expect(ENEMIES.brute.xp).toBe(5);
  });
});

describe('the theme stays until it is beaten', () => {
  it('a lost themed horde is still that theme; a win moves on to a plain horde', () => {
    const game = meeting('stampede');
    expect(themeOf(game)).toBe('stampede');
    const lost = finishSquadHorde(game, {
      ...startSquadHorde(game, 1, NOW),
      outcome: 'lost' as const,
    });
    expect(localHorde(lost)).toBe(15);
    expect(themeOf(lost)).toBe('stampede');
    expect(themeCleared(lost, 'stampede')).toBe(false);
    const win = finishSquadHorde(game, won(game, 15));
    expect(localHorde(win)).toBe(16);
    expect(themeOf(win)).toBeNull();
    expect(themeCleared(win, 'stampede')).toBe(true);
  });

  it('a start and a campaign start carry the theme, and a plain horde none', () => {
    const game = meeting('bloat');
    expect(startSquadHorde(game, 1, NOW).theme).toBe('bloat');
    expect(startSquadHorde({ ...game, hordeNumber: 16 }, 1, NOW, 16).theme).toBeUndefined();
    expect(startSquadHorde({ ...game, hordeNumber: 16 }, 1, NOW, 15).theme).toBe('bloat');
    const full = { ...newGame('full', 1), hordeNumber: 15 };
    const withSeed = withTheme(full, 'normal', 15, 'ironwall');
    const h = startHorde(withSeed, 1, withSeed.roster[0]!.id, 0, NOW);
    expect(h.theme).toBe('ironwall');
  });

  it('each mode’s own horde has its own theme, on the same save', () => {
    const base = withTheme(squadGame(6, 15), 'nightmare', 15, 'ironwall');
    const g = { ...base, mode: 'nightmare' as const, modes: { nightmare: 15, hell: 15 } };
    expect(themeOf(g)).toBe('ironwall');
    expect(themeOf(g, 15, 'normal')).toBe(themeAt(g.themes!.seed!, 'normal', 15));
    expect(themeOf(g, 15, 'hell')).toBe(themeAt(g.themes!.seed!, 'hell', 15));
  });
});

describe('the first-clear reward', () => {
  const tGuns = (g: GameState) => g.armoury.filter((w) => w.uid.startsWith('t'));

  it('the first win over a theme gives one gun that answers it, at Military or better, at the fight’s level', () => {
    for (const id of THEME_IDS) {
      const game = meeting(id);
      const next = finishSquadHorde(game, won(game, 15));
      const guns = tGuns(next);
      expect(guns, id).toHaveLength(1);
      const g = guns[0]!;
      expect(g.uid).toBe(`t${THEME_IDS.indexOf(id) + 1}`);
      expect(THEMES[id].answers).toContain(g.base);
      expect(RARITY_ORDER.indexOf(g.rarity)).toBeGreaterThanOrEqual(
        RARITY_ORDER.indexOf('military'),
      );
      expect(g.level).toBe(15);
      expect(next.themes?.cleared).toEqual([id]);
      expect(themeReward(game, won(game, 15))?.gun).toEqual(g);
      const r = squadResult(game, won(game, 15));
      expect(r.theme?.id).toBe(id);
      expect(dropGuns(r.drop!).map((w) => w.uid)).toContain(g.uid);
    }
  });

  it('a second win over the same theme gives nothing more, a replay of the horde included', () => {
    const game = meeting('crawl');
    const first = finishSquadHorde(game, won(game, 15));
    expect(tGuns(first)).toHaveLength(1);
    const replay = finishSquadHorde(first, won(first, 15, 2));
    expect(tGuns(replay)).toHaveLength(1);
    expect(replay.themes?.cleared).toEqual(['crawl']);
    expect(themeReward(first, won(first, 15, 2))).toBeNull();
    expect(squadResult(first, won(first, 15, 2)).theme).toBeUndefined();
  });

  it('a replay win counts: a save already past the horde earns the theme’s gun', () => {
    const game = meeting('ironwall', [], 40);
    const next = finishSquadHorde(game, won(game, 15));
    expect(tGuns(next)).toHaveLength(1);
    expect(next.themes?.cleared).toEqual(['ironwall']);
    expect(localHorde(next)).toBe(40);
  });

  it('a loss and a plain horde give none', () => {
    const game = meeting('bloat');
    expect(themeReward(game, { ...won(game, 15), outcome: 'lost' })).toBeNull();
    const plain = squadGame(6, 14);
    expect(tGuns(finishSquadHorde(plain, won(plain, 14)))).toHaveLength(0);
    expect(finishSquadHorde(plain, won(plain, 14)).themes).toBeUndefined();
  });

  it('the reward is its own stream: the drop, the bonus guns and the joiners are the ones they were', () => {
    const game = meeting('stampede');
    const h = won(game, 15);
    const drop = squadDrop(game, h)!;
    expect(drop.theme?.uid).toBe('t1');
    const after = finishSquadHorde(
      { ...game, themes: { ...game.themes, cleared: ['stampede'] } },
      h,
    );
    const withTheme = finishSquadHorde(game, h);
    expect(withTheme.armoury.filter((w) => !w.uid.startsWith('t'))).toEqual(after.armoury);
    expect(withTheme.camp.recruits).toBe(after.camp.recruits);
  });

  it('a full stash throws away for the reward too, and every site agrees on what', () => {
    const full = Array.from({ length: STASH_CAP }, (_, i) => filler(i));
    const game = meeting('crawl', full);
    const h = won(game, 15);
    const plan = winStash(game, h);
    expect(plan.guns.map((w) => w.uid)).toContain('t3');
    expect(plan.thrown).toHaveLength(plan.guns.length);
    expect(plan.thrown).toEqual(plan.drop!.thrown);
    const next = finishSquadHorde(game, h);
    expect(next.armoury).toHaveLength(STASH_CAP);
    expect(next.armoury.map((w) => w.uid)).toContain('t3');
    const r = squadResult(game, h);
    expect(r.drop!.thrown).toEqual(plan.thrown);
    expect(squadScrap(game, h).total).toBe(next.stock.scrap - game.stock.scrap);
    expect(r.scrap.salvage).toBeGreaterThan(0);
  });

  it('a capped replay still gives the theme’s gun, as a drop of its own, and counts no replay', () => {
    const game = { ...meeting('ironwall', [], 40), farm: { replays: FARM.maxReplays, badLuck: 0 } };
    const h = won(game, 15);
    expect(squadDrop(game, h)).toBeNull();
    const plan = winStash(game, h);
    expect(plan.guns.map((w) => w.uid)).toEqual(['t2']);
    expect(plan.shown?.kind).toBe('theme');
    const next = finishSquadHorde(game, h);
    expect(tGuns(next)).toHaveLength(1);
    expect(next.farm.replays).toBe(FARM.maxReplays);
    expect(next.themes?.cleared).toEqual(['ironwall']);
    expect(squadResult(game, h).drop?.weapon.uid).toBe('t2');
    // Beaten already: nothing at all, as before.
    const done = { ...game, themes: { ...game.themes, cleared: ['ironwall' as const] } };
    expect(winStash(done, won(done, 15)).guns).toEqual([]);
    expect(finishSquadHorde(done, won(done, 15)).armoury).toEqual(done.armoury);
  });

  it('a capped replay into a full stash throws away for the reward', () => {
    const full = Array.from({ length: STASH_CAP }, (_, i) => filler(i));
    const game = {
      ...meeting('ironwall', full, 40),
      farm: { replays: FARM.maxReplays, badLuck: 0 },
    };
    const h = won(game, 15);
    const plan = winStash(game, h);
    expect(plan.thrown).toHaveLength(1);
    const next = finishSquadHorde(game, h);
    expect(next.armoury).toHaveLength(STASH_CAP);
    expect(next.armoury.map((w) => w.uid)).toContain('t2');
    expect(squadScrap(game, h).salvage).toBeGreaterThan(0);
  });

  it('the worst-luck sim keeps the theme’s gun', () => {
    const game = meeting('bloat', [], 40);
    const h = won(game, 15);
    const drop = squadDrop(game, h)!;
    const next = finishSquadHorde(game, h);
    const kept = unlucky(game, next, drop, 15);
    expect(tGuns(kept)).toHaveLength(1);
    expect(kept.themes?.cleared).toEqual(['bloat']);
  });

  it('Nightmare and Hell clear the same themes, with their own rarity shift', () => {
    const base = withTheme(squadGame(6, 15), 'nightmare', 15, 'crawl');
    const g = { ...base, mode: 'nightmare' as const, modes: { nightmare: 15 } };
    const next = finishSquadHorde(g, won(g, 15));
    expect(tGuns(next)).toHaveLength(1);
    expect(next.themes?.cleared).toEqual(['crawl']);
  });
});

describe('the full game’s Genes', () => {
  it('the first win over a theme pays THEME.genes once', () => {
    const full = withTheme({ ...newGame('full', 1), hordeNumber: 15 }, 'normal', 15, 'crawl');
    const fought = (g: GameState) => {
      const h = startHorde(g, 1, g.roster[0]!.id, 0, NOW);
      h.outcome = 'won';
      return h;
    };
    const first = finishHorde(full, fought(full), NOW);
    const plain = fought(full);
    const base = first.stock.genes - full.stock.genes - THEME.genes;
    expect(base).toBeGreaterThanOrEqual(0);
    expect(first.themes?.cleared).toEqual(['crawl']);
    // The same theme again (a later save at 15 with it cleared) pays no Genes for it.
    const again = finishHorde({ ...full, themes: first.themes! }, plain, NOW);
    expect(again.stock.genes - full.stock.genes).toBe(base);
    expect(plain.theme).toBe('crawl');
  });
});

describe('themed hordes beaten (the bound on a save’s cleared list)', () => {
  it('counts the themed slots beaten on every mode', () => {
    const g = (next: number, modes?: { nightmare?: number; hell?: number }): GameState => ({
      ...squadGame(1, next),
      ...(modes ? { modes } : {}),
    });
    expect(themedSlotsBeaten(g(15))).toBe(0);
    expect(themedSlotsBeaten(g(16))).toBe(1);
    expect(themedSlotsBeaten(g(26))).toBe(2);
    expect(themedSlotsBeaten(g(51))).toBe(4);
    expect(themedSlotsBeaten(g(51, { nightmare: 26 }))).toBe(6);
    expect(themedSlotsBeaten(g(51, { nightmare: 26, hell: 16 }))).toBe(7);
  });
});

describe('the squad tools (ID-237) weigh the themed mix', () => {
  it('Nightmare’s fit is measured against the themed horde, Normal has none', () => {
    const base = withTheme(squadGame(6, 15), 'nightmare', 15, 'ironwall');
    const g: GameState = { ...base, mode: 'nightmare', modes: { nightmare: 15 } };
    const themed = fitFor(g, 15)!;
    const plain = fitContext(
      'nightmare',
      hordeKindHp(effHorde('nightmare', 15), 'nightmare', squadSize(g)),
    );
    expect(themed).not.toEqual(plain);
    expect(fitFor({ ...g, mode: undefined }, 15)).toBeNull();
  });
});

describe('the Q-no-theme override', () => {
  it('only a test passes it: no app source gives startSquadHorde a fifth argument', () => {
    const dir = new URL('../ui/', import.meta.url);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const text = readFileSync(new URL(f, dir), 'utf8');
      for (const m of text.matchAll(/startSquadHorde\(([^;]*?)\);/g)) {
        expect(m[1]!.split(',').length, `${f}: ${m[0]}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('a state started plain is never saved: a theme is not in a game', () => {
    const game = meeting('crawl');
    expect(JSON.stringify(game)).not.toContain('"theme"');
  });
});
