// ID-218 Difficulty modes: the model (mode horde + offset), the unlocks, the bosses and their
// skills, the rarity shift, Scrap, drops, and a fight on a mode. Normal's numbers are held by
// golden-normal.test.ts.
import { describe, expect, it } from 'vitest';
import { firstClearWeights, shiftUp } from './armoury.ts';
import { rollWeapon } from './armoury.ts';
import { BOSSES, HELL_SKILLS, HORROR, RARITY_ORDER, SQUAD_SCRAP, type BossSkill } from './data.ts';
import { newGame, type GameState } from './game.ts';
import {
  finishSquadHorde,
  isEndless,
  isReplay,
  squadDrop,
  squadResult,
  squadScrap,
  startSquadHorde,
  winScrap,
  highestBeaten,
  bossReward,
} from './hordeonly.ts';
import {
  advance,
  beatenIn,
  bossTrios,
  effHorde,
  localHorde,
  localOf,
  modeBosses,
  modeOf,
  modeUnlocked,
  MODES,
  openModes,
  setMode,
  topBeaten,
  unlockHint,
} from './modes.ts';
import { createRng } from './rng.ts';
import { playSquadHorde } from './sim.ts';
import { hordeHp, recommendedPower } from './squadpower.ts';
import { squadAt } from './balance/shared.ts';

/** A squad of 8 with Military rifles at `level`, on Normal horde `n`, nightmare horde `nm`, hell `h`. */
function game(n: number, level: number, nm?: number, h?: number): GameState {
  const g = squadAt(n, level);
  return {
    ...g,
    ...(nm || h ? { modes: { ...(nm ? { nightmare: nm } : {}), ...(h ? { hell: h } : {}) } } : {}),
  };
}

describe('the model (ID-218)', () => {
  it('Normal is the default and its horde is the game’s', () => {
    const g = newGame('horde');
    expect(modeOf(g)).toBe('normal');
    expect(localHorde(g)).toBe(1);
    expect(effHorde('normal', 7)).toBe(7);
  });

  it('a mode keeps its own horde, and the fight is as strong as the horde plus the offset', () => {
    const g = { ...game(60, 30, 5), mode: 'nightmare' as const };
    expect(localHorde(g)).toBe(5);
    expect(localHorde(g, 'normal')).toBe(60);
    expect(localHorde(g, 'hell')).toBe(1);
    expect(effHorde('nightmare', 5)).toBe(55);
    expect(effHorde('hell', 5)).toBe(105);
    expect(beatenIn(g)).toBe(4);
    expect(topBeaten(g)).toBe(59);
    expect(topBeaten({ ...g, modes: { nightmare: 30 } })).toBe(29 + 50);
    expect(topBeaten(newGame('horde'))).toBe(0);
  });

  it('unlocks come from holding Horde 50 on the mode before, and read off the hordes', () => {
    expect(modeUnlocked(game(50, 1), 'nightmare')).toBe(false);
    expect(modeUnlocked(game(51, 1), 'nightmare')).toBe(true);
    expect(modeUnlocked(game(51, 1), 'hell')).toBe(false);
    expect(modeUnlocked(game(51, 1, 50), 'hell')).toBe(false);
    expect(modeUnlocked(game(51, 1, 51), 'hell')).toBe(true);
    // Hell needs Nightmare, not Normal alone.
    expect(modeUnlocked(game(200, 1), 'hell')).toBe(false);
    expect(openModes(game(51, 1, 51))).toEqual(['normal', 'nightmare', 'hell']);
    expect(unlockHint('nightmare')).toBe('Hold Horde 50 on Normal');
    expect(unlockHint('hell')).toBe('Hold Horde 50 on Nightmare');
  });

  it('switching never loses progress, and a locked mode is refused', () => {
    const g = game(51, 1, 7);
    const n = setMode(g, 'nightmare');
    expect(n.mode).toBe('nightmare');
    const back = setMode(n, 'normal');
    expect('mode' in back).toBe(false);
    expect(back.hordeNumber).toBe(51);
    expect(back.modes).toEqual({ nightmare: 7 });
    expect(() => setMode(game(10, 1), 'nightmare')).toThrow(RangeError);
    expect(() => setMode(g, 'hell')).toThrow(RangeError);
  });

  it('a first clear advances only the mode’s horde', () => {
    const g = advance({ ...game(51, 1, 7), mode: 'nightmare' });
    expect(g.modes).toEqual({ nightmare: 8 });
    expect(g.hordeNumber).toBe(51);
    expect(advance(game(51, 1)).hordeNumber).toBe(52);
    expect(advance(game(51, 1), 'hell').modes).toEqual({ hell: 2 });
  });
});

describe('boss counts and skills (ID-218)', () => {
  const skillsOf = (mode: 'nightmare' | 'hell', local: number): BossSkill[][] =>
    modeBosses(mode, local).map((b) => b.skills);

  it('the boss count follows the mode’s own horde; Hell brings one more, up to BOSSES.max + 1', () => {
    const counts = (mode: 'nightmare' | 'hell') =>
      [10, 20, 30, 40, 50, 100].map((n) => modeBosses(mode, n).length);
    expect(counts('nightmare')).toEqual([1, 2, 3, 3, 3, 3]);
    expect(counts('hell')).toEqual([2, 3, 4, 4, 4, 4]);
    expect(Math.max(...counts('hell'))).toBe(BOSSES.max + 1);
    // Normal is untouched.
    expect(modeBosses('normal', 10).length).toBe(1);
  });

  it('their strength follows the effective horde', () => {
    const b = modeBosses('nightmare', 10)[0]!;
    expect(b.hp).toBe(BOSSES.hp);
    expect(b.wave).toBe(modeBosses('normal', 50)[0]!.wave);
    expect(b.elite).toBe(false);
  });

  it('every boss has 3 skills; 1 or 2 bosses never repeat a skill in the horde', () => {
    for (const [mode, n] of [
      ['nightmare', 10],
      ['nightmare', 20],
      ['hell', 10],
    ] as const) {
      const all = skillsOf(mode, n);
      for (const s of all) expect(s).toHaveLength(MODES[mode].skills + MODES[mode].newSkills);
      const flat = all.flat();
      expect(new Set(flat).size, `${mode} ${n}`).toBe(flat.length);
    }
  });

  it('3 or more bosses use every skill, none more than twice, no two with the same trio', () => {
    for (const set of BOSSES.sets) {
      for (const count of [3, 4]) {
        const trios = bossTrios(set, count);
        expect(trios).toHaveLength(count);
        const used = new Map<BossSkill, number>();
        for (const t of trios) {
          expect(new Set(t).size).toBe(3);
          for (const s of t) used.set(s, (used.get(s) ?? 0) + 1);
        }
        for (const s of set.flat()) expect(used.get(s) ?? 0, `${s} ${count}`).toBeGreaterThan(0);
        expect(Math.max(...used.values()), `${count}`).toBeLessThanOrEqual(2);
        const keys = trios.map((t) => [...t].sort().join());
        expect(new Set(keys).size).toBe(count);
      }
    }
  });

  it('is deterministic, and every boss horde of both modes holds the rules', () => {
    for (const mode of ['nightmare', 'hell'] as const) {
      for (let n = HORROR.every; n <= 200; n += HORROR.every) {
        expect(skillsOf(mode, n)).toEqual(skillsOf(mode, n));
        const trios = skillsOf(mode, n);
        const used = new Map<BossSkill, number>();
        for (const t of trios) for (const s of t) used.set(s, (used.get(s) ?? 0) + 1);
        expect(Math.max(...used.values())).toBeLessThanOrEqual(trios.length >= 3 ? 2 : 1);
      }
    }
  });

  it('every Hell boss has exactly one Hell skill next to its 3 others; Normal and Nightmare have none', () => {
    const isHell = (k: BossSkill): boolean => (HELL_SKILLS as readonly BossSkill[]).includes(k);
    for (let n = HORROR.every; n <= 200; n += HORROR.every) {
      for (const b of modeBosses('hell', n)) {
        expect(b.skills, `hell ${n}`).toHaveLength(4);
        expect(b.skills.filter(isHell), `hell ${n}`).toHaveLength(1);
        expect(new Set(b.skills).size).toBe(4);
      }
      for (const mode of ['normal', 'nightmare'] as const) {
        for (const b of modeBosses(mode, n)) expect(b.skills.some(isHell)).toBe(false);
      }
    }
  });

  it('with 3 Hell bosses or fewer no two share a new skill; with 4 exactly one does', () => {
    const newOf = (n: number): BossSkill[] =>
      modeBosses('hell', n).map((b) =>
        b.skills.find((k) => (HELL_SKILLS as readonly BossSkill[]).includes(k))!,
      );
    for (let n = HORROR.every; n <= 200; n += HORROR.every) {
      const skills = newOf(n);
      const distinct = new Set(skills).size;
      if (skills.length <= 3) expect(distinct, `hell ${n}`).toBe(skills.length);
      else {
        expect(skills).toHaveLength(4);
        expect(distinct, `hell ${n}`).toBe(3);
        expect(skills[0]).toBe(skills[3]);
      }
    }
    // Hell 10, 20 and 30 are the 2, 3 and 4 boss hordes.
    expect([10, 20, 30].map((n) => newOf(n).length)).toEqual([2, 3, 4]);
    // The new skill rotates by horde, so a horde does not always meet the same one first.
    expect(new Set([10, 20, 30].map((n) => newOf(n)[0])).size).toBeGreaterThan(1);
  });

  it('a horde that is no boss horde keeps its effective number’s mini-bosses', () => {
    expect(modeBosses('nightmare', 7).every((b) => b.elite)).toBe(true);
    expect(modeBosses('hell', 7).length).toBeGreaterThan(0);
  });
});

describe('rarity shift (ID-218)', () => {
  it('moves half of each rarity up one, Relic keeps its own, and 0 steps is the band itself', () => {
    const band = { rusty: 0, common: 25, military: 40, prototype: 25, relic: 10 };
    expect(shiftUp(band, 0)).toBe(band);
    const one = shiftUp(band, 1);
    expect(one).toEqual({ rusty: 0, common: 12.5, military: 32.5, prototype: 32.5, relic: 22.5 });
    const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
    expect(total(shiftUp(band, 2))).toBeCloseTo(100);
    for (const r of RARITY_ORDER) expect(shiftUp(band, 2)[r]).toBeGreaterThanOrEqual(0);
  });

  it('a first clear’s Relic odds are about 35%, 55% and 71% on Normal, Nightmare and Hell', () => {
    const relic = (steps: number): number => firstClearWeights(50, steps).relic;
    expect(relic(0)).toBeCloseTo(35, 5);
    expect(relic(1)).toBeCloseTo(55, 5);
    expect(relic(2)).toBeCloseTo(71.25, 5);
  });
});

describe('Scrap (ID-218)', () => {
  it('a win pays the effective horde’s Scrap times the mode’s multiple; Normal is as before', () => {
    expect(winScrap(10)).toBe(SQUAD_SCRAP.base + SQUAD_SCRAP.perHorde * 10);
    const pay = (n: number): number => SQUAD_SCRAP.base + SQUAD_SCRAP.perHorde * n;
    expect(winScrap(51, 'nightmare')).toBe(Math.round(pay(51) * 1.5));
    expect(winScrap(101, 'hell')).toBe(pay(101) * 2);
  });
});

describe('a fight on a mode (ID-218)', () => {
  const nm = (local = 1): GameState => ({
    ...squadAt(51, 60),
    mode: 'nightmare',
    modes: { nightmare: local },
  });

  it('starts at the mode’s Horde 1 as strong as Normal’s Horde 51', () => {
    const g = nm();
    const s = startSquadHorde(g, 3, 0);
    expect(s.mode).toBe('nightmare');
    expect(s.hordeNumber).toBe(51);
    expect(localOf(s)).toBe(1);
    const normal = startSquadHorde(squadAt(51, 60), 3, 0, 51);
    // The mode's own HP factor (the tuning knob) sits on top of the effective horde's.
    expect(s.hpScale).toBeCloseTo(normal.hpScale! * MODES.nightmare.hpScale, 9);
    expect(s.waveCount).toBe(normal.waveCount);
    expect('mode' in normal).toBe(false);
  });

  it('only the mode’s own hordes are open', () => {
    expect(() => startSquadHorde(nm(), 3, 0, 2)).toThrow(RangeError);
    expect(startSquadHorde(nm(5), 3, 0, 3).hordeNumber).toBe(53);
  });

  it('a boss horde brings the mode’s bosses with 3 skills', () => {
    const s = startSquadHorde(nm(10), 3, 0);
    expect(s.bosses.length).toBe(1);
    expect(s.bosses[0]!.skills).toHaveLength(3);
    const hell = startSquadHorde(
      { ...squadAt(51, 60), mode: 'hell', modes: { nightmare: 51, hell: 30 } },
      3,
      0,
    );
    expect(hell.bosses.length).toBe(4);
    expect(hell.hordeNumber).toBe(130);
  });

  it('a win moves only the mode’s horde on, pays its Scrap, and drops the mode’s uid at the effective level', () => {
    const strong = { ...squadAt(51, 150), mode: 'nightmare' as const, modes: { nightmare: 3 } };
    const won = playSquadHorde(strong, 5);
    expect(won.outcome).toBe('won');
    const next = finishSquadHorde(strong, won);
    expect(next.modes).toEqual({ nightmare: 4 });
    expect(next.hordeNumber).toBe(51);
    expect(next.mode).toBe('nightmare');
    const drop = squadDrop(strong, won)!;
    expect(drop.kind).toBe('first');
    expect(drop.weapon.uid).toBe('n3');
    expect(drop.weapon.level).toBe(53);
    const scrap = squadScrap(strong, won);
    expect(scrap.total - scrap.salvage).toBe(winScrap(53, 'nightmare'));
    expect(next.stock.scrap).toBe(strong.stock.scrap + scrap.total);
  });

  it('a replay is a replay of the mode’s horde, not a first clear', () => {
    const g = nm(6);
    const h = { ...startSquadHorde(g, 5, 0, 2), outcome: 'won' as const };
    expect(isReplay(g, 2)).toBe(true);
    expect(isReplay(g, 6)).toBe(false);
    const drop = squadDrop(g, h)!;
    expect(drop.kind).not.toBe('first');
    expect(drop.weapon.uid).toBe('r1');
    expect(finishSquadHorde(g, h).modes).toEqual({ nightmare: 6 });
  });

  it('highest beaten and Endless are the mode’s own; radio parts and rewards are Normal’s', () => {
    const g = nm(31);
    expect(highestBeaten(g)).toBe(30);
    expect(isEndless(g)).toBe(true);
    expect(isEndless({ ...g, modes: { nightmare: 30 } })).toBe(false);
    expect(bossReward(g, 10)).toBeNull();
    expect(bossReward(squadAt(51, 1), 60)).toBeNull();
    // A higher mode pays no radio part: its unlock is a mode card (ID-222), on a first clear.
    const first = { ...g, modes: { nightmare: 10 } };
    expect(bossReward(first, 10)).toEqual({ part: 0, unlock: 'suppressing-fire', finale: false });
    expect(bossReward({ ...first, modes: { nightmare: 30 } }, 30)).toEqual({
      part: 0,
      unlock: 'momentum',
      finale: false,
    });
    expect(bossReward({ ...first, modes: { nightmare: 11 } }, 10)).toBeNull();
    expect(bossReward({ ...first, modes: { nightmare: 5 } }, 5)).toBeNull();
  });

  it('the result screen reads the same mode: first clear unlocks nothing it should not', () => {
    const strong = { ...squadAt(51, 150), mode: 'nightmare' as const, modes: { nightmare: 1 } };
    const won = playSquadHorde(strong, 9);
    const r = squadResult(strong, won);
    expect(r.next.modes).toEqual({ nightmare: 2 });
    expect(r.scrap.total).toBeGreaterThanOrEqual(winScrap(effHorde('nightmare', 1), 'nightmare'));
  });

  it('Recommended Power follows the mode’s bosses and strength; Normal is as before', () => {
    expect(recommendedPower(51, 'nightmare')).toBeGreaterThan(0);
    // Nightmare 50 is Normal 100 with the same three bosses, at the mode's HP factor; Hell's Horde 10 has two, not three.
    expect(hordeHp(100, 'nightmare') / hordeHp(100)).toBeCloseTo(MODES.nightmare.hpScale, 4);
    expect(recommendedPower(100, 'nightmare')).toBeGreaterThan(recommendedPower(100));
    expect(modeBosses('hell', 10)).toHaveLength(2);
    expect(modeBosses('normal', effHorde('hell', 10)).filter((b) => !b.elite)).toHaveLength(3);
    expect(recommendedPower(40)).toBe(recommendedPower(40, 'normal'));
  });

  it('Hell starts where Nightmare ends (ID-225): Hell 1 asks about what Nightmare 50 asks', () => {
    expect(effHorde('hell', 1)).toBe(effHorde('nightmare', 50) + 1);
    for (const size of [1, 4, 8]) {
      const ratio =
        recommendedPower(effHorde('hell', 1), 'hell', size) /
        recommendedPower(effHorde('nightmare', 50), 'nightmare', size);
      expect(ratio, `squad of ${size}`).toBeGreaterThan(0.9);
      expect(ratio, `squad of ${size}`).toBeLessThan(1.2);
    }
  });

  it('a gun dropped on a mode is a real gun: level 51 and up', () => {
    const w = rollWeapon(createRng(1), 'n1', 'rifle', 'relic', 51);
    expect(w.level).toBe(51);
  });
});

describe('the squad is shared across modes (ID-218)', () => {
  it('the roster, stash and Scrap carry over a mode switch', () => {
    const g = squadAt(51, 10);
    g.stock = { ...g.stock, scrap: 777 };
    const n = setMode(g, 'nightmare');
    expect(n.roster).toBe(g.roster);
    expect(n.stock.scrap).toBe(777);
    expect(n.armoury).toBe(g.armoury);
  });
});
