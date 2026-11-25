// ID-222 mode reward cards: what unlocks them (derived from a mode's saved horde), where they
// show (a higher mode's pool; Suppressing Fire, Cauterise, Momentum and Adrenaline in every
// fight, ID-235, ID-245, the others only when the fight has what they answer), and what each does.
import { describe, expect, it } from 'vitest';
import { eligible, isModeCard, rollOffer, UPGRADE_IDS, UPGRADES } from './cards.ts';
import {
  BOSS_SKILL,
  CARD,
  ENEMIES,
  MAX_CONDITION,
  MODE_CARDS,
  MODE_UNLOCKS,
  SEGMENT_HEIGHT,
  STEP,
  TRAP_STRIP,
  WEAPONS,
  type BossSkill,
} from './data.ts';
import type { GameState } from './game.ts';
import {
  hitDamage,
  cardFireRate,
  magazineOf,
  newHorde,
  rushFactor,
  scorched,
  tick,
  underFire,
  windingUp,
  type Enemy,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { bossReward, modeCards, SQUAD_CARDS, startSquadHorde } from './hordeonly.ts';
import { createRng } from './rng.ts';
import { squadPick } from './sim.ts';
import { squadAt } from './balance/shared.ts';
import { xpForLevel } from './stats.ts';
import { enemy, horror, pistol, setup } from './testing.ts';

type Prog = Pick<GameState, 'hordeNumber' | 'mode' | 'modes'>;
const at = (mode: Prog['mode'], modes: Prog['modes']): Prog => ({ hordeNumber: 60, mode, modes });

describe('which cards a game has (derived from saved progress)', () => {
  it('unlocks one card per boss horde 10, 20 and 30 of each higher mode', () => {
    expect(MODE_CARDS).toEqual([
      ...Object.values(MODE_UNLOCKS.nightmare),
      ...Object.values(MODE_UNLOCKS.hell),
    ]);
    expect(new Set(MODE_CARDS).size).toBe(6);
    expect(modeCards(at('nightmare', { nightmare: 1 }))).toEqual([]);
    expect(modeCards(at('nightmare', { nightmare: 10 }))).toEqual([]);
    expect(modeCards(at('nightmare', { nightmare: 11 }))).toEqual(['suppressing-fire']);
    expect(modeCards(at('nightmare', { nightmare: 21 }))).toEqual([
      'suppressing-fire',
      'cauterise',
    ]);
    expect(modeCards(at('nightmare', { nightmare: 31 }))).toEqual([
      'suppressing-fire',
      'cauterise',
      'momentum',
    ]);
  });

  it('a Nightmare card works in Nightmare and above, a Hell card only in Hell; Normal has none', () => {
    const modes = { nightmare: 51, hell: 21 };
    expect(modeCards(at(undefined, modes))).toEqual([]);
    expect(modeCards(at('nightmare', modes))).toEqual([
      'suppressing-fire',
      'cauterise',
      'momentum',
    ]);
    expect(modeCards(at('hell', modes))).toEqual([
      'suppressing-fire',
      'cauterise',
      'momentum',
      'gas-masks',
      'breaching-rounds',
    ]);
    expect(modeCards({ hordeNumber: 99, modes })).toEqual([]);
  });

  it('is only ever ids from MODE_UNLOCKS, whatever the progress', () => {
    const ids = new Set<UpgradeId>(MODE_CARDS);
    for (const nightmare of [0, 1, 10, 11, 30, 31, 51, 1000]) {
      for (const hell of [0, 1, 10, 11, 30, 31, 1000]) {
        for (const mode of [undefined, 'nightmare', 'hell'] as const) {
          for (const c of modeCards(at(mode, { nightmare, hell }))) expect(ids.has(c)).toBe(true);
        }
      }
    }
  });

  it('a card unlocks on the first clear only', () => {
    const g = (n: number): Prog => at('nightmare', { nightmare: n });
    expect(bossReward(g(10), 10)).toEqual({ part: 0, unlock: 'suppressing-fire', finale: false });
    expect(bossReward(g(11), 10)).toBeNull();
    expect(bossReward(g(20), 20)).toEqual({ part: 0, unlock: 'cauterise', finale: false });
    expect(bossReward(g(30), 30)).toEqual({ part: 0, unlock: 'momentum', finale: false });
    expect(bossReward(g(15), 15)).toBeNull();
    const hell = (n: number): Prog => at('hell', { nightmare: 51, hell: n });
    expect(bossReward(hell(10), 10)).toEqual({ part: 0, unlock: 'gas-masks', finale: false });
    expect(bossReward(hell(30), 30)).toEqual({ part: 0, unlock: 'adrenaline-rush', finale: false });
    expect(bossReward(hell(31), 30)).toBeNull();
  });
});

describe('where they show', () => {
  const game = (mode: Prog['mode'], modes: Prog['modes']): GameState => ({
    ...squadAt(51, 40),
    mode,
    modes,
  });

  it('are never in Normal’s pool, and Normal’s pool is the squad cards as ever', () => {
    expect(SQUAD_CARDS.some(isModeCard)).toBe(false);
    const normal = startSquadHorde(squadAt(51, 40), 1, 0);
    expect(normal.cardPool).toEqual([...SQUAD_CARDS]);
    // Mode progress with Normal being played changes nothing.
    const withProgress = startSquadHorde(game(undefined, { nightmare: 51, hell: 31 }), 1, 0);
    expect(withProgress.cardPool).toEqual([...SQUAD_CARDS]);
  });

  it('are in the pool of their mode and above, once unlocked', () => {
    const nm = startSquadHorde(game('nightmare', { nightmare: 11 }), 1, 0);
    expect(nm.cardPool).toEqual([...SQUAD_CARDS, 'suppressing-fire']);
    const hell = startSquadHorde(game('hell', { nightmare: 51, hell: 11 }), 1, 0);
    expect(hell.cardPool).toEqual([
      ...SQUAD_CARDS,
      'suppressing-fire',
      'cauterise',
      'momentum',
      'gas-masks',
    ]);
    // A Hell card in Nightmare: never, even with the progress saved.
    const hellProgressInNightmare = startSquadHorde(
      game('nightmare', { nightmare: 51, hell: 31 }),
      1,
      0,
    );
    expect(hellProgressInNightmare.cardPool).not.toContain('gas-masks');
  });

  it('do not crowd the offers: Hell, all six unlocked, none taken (seeded, ID-245)', () => {
    // Measured over 2000 offers (6000 slots; the bench empty): 7.6% of wave 1's upgrade slots
    // are a mode card, 14.2% at wave 9 where the rare odds cap (45%). Rolled rarity first, so
    // only the rare tier is diluted.
    const share = (wave: number): number => {
      const s = startSquadHorde(game('hell', { nightmare: 51, hell: 31 }), 1, 0);
      s.bench = [];
      s.wave = wave;
      expect(s.cardPool).toEqual(expect.arrayContaining([...MODE_CARDS]));
      let n = 0;
      let total = 0;
      for (let seed = 0; seed < 2000; seed++) {
        for (const c of rollOffer(createRng(seed), s)) {
          if (c.kind !== 'upgrade') continue;
          total += 1;
          if (isModeCard(c.id)) n += 1;
        }
      }
      return n / total;
    };
    expect(share(1)).toBeLessThanOrEqual(0.12);
    expect(share(9)).toBeLessThanOrEqual(0.15);
  });

  it('a state with no card pool (the full game) never offers one', () => {
    const s = newHorde(1, setup());
    s.bosses = [{ kind: 'horror', skills: [...BOTH], wave: 1, hp: 1, elite: false, id: null }];
    expect(s.cardPool).toBeUndefined();
    for (const id of MODE_CARDS) expect(eligible(s, id), id).toBe(false);
    for (let seed = 1; seed <= 200; seed++) {
      for (const c of rollOffer(createRng(seed), s)) {
        if (c.kind === 'upgrade') expect(isModeCard(c.id)).toBe(false);
      }
    }
  });

  it('is utility or conditional: a behaviour card, never flat damage or HP', () => {
    for (const id of MODE_CARDS) {
      expect(UPGRADES[id].category, id).toBe('behaviour');
      expect(UPGRADES[id].levels, id).toBe(1);
    }
    expect(UPGRADE_IDS.filter(isModeCard)).toEqual([...MODE_CARDS]);
  });
});

const BOTH: BossSkill[] = ['brood', 'roar', 'regen', 'poison', 'shield', 'plates', 'enrage'];
const NONE: BossSkill[] = ['plates'];

/** A fight with the mode cards in its pool and a boss with `skills` (and `elite`). */
function pooled(skills: BossSkill[], elite = false): HordeState {
  const s = newHorde(1, { ...setup(), cards: [...SQUAD_CARDS, ...MODE_CARDS] });
  s.bosses = [{ kind: 'horror', skills, wave: 1, hp: 1, elite, id: null }];
  return s;
}

describe('only when the fight has what they answer', () => {
  const cases: [UpgradeId, BossSkill[], BossSkill[], boolean?][] = [
    ['gas-masks', ['poison'], ['roar']],
    ['breaching-rounds', ['shield'], ['roar']],
    ['breaching-rounds', ['plates'], ['roar']],
  ];
  for (const [id, yes, no] of cases) {
    it(`${id} with ${yes.join()}, not with ${no.join()}`, () => {
      expect(eligible(pooled(yes), id)).toBe(true);
      expect(eligible(pooled(no), id)).toBe(false);
      const taken = pooled(yes);
      taken.taken = [id];
      taken.cardLevels = { [id]: 1 };
      expect(eligible(taken, id), 'once only').toBe(false);
    });
  }

  it('Suppressing Fire, Cauterise, Momentum and Adrenaline in every fight, once only (ID-235, ID-245)', () => {
    const bare = newHorde(1, { ...setup(), cards: [...SQUAD_CARDS, ...MODE_CARDS] });
    for (const id of ['suppressing-fire', 'cauterise', 'momentum', 'adrenaline-rush'] as const) {
      expect(eligible(pooled(NONE), id), id).toBe(true);
      expect(eligible(pooled(['roar'], true), id), `${id} with a mini-boss`).toBe(true);
      expect(eligible(bare, id), `${id} with no boss`).toBe(true);
      const held = pooled(NONE);
      held.taken = [id];
      held.cardLevels = { [id]: 1 };
      expect(eligible(held, id), `${id} once only`).toBe(false);
    }
    // Gas Masks and Breaching Rounds still need what they answer.
    expect(eligible(bare, 'gas-masks')).toBe(false);
    expect(eligible(bare, 'breaching-rounds')).toBe(false);
  });
});

/** Horde 1, nobody but defender a firing, a boss within its range. */
function shooting(
  skills: BossSkill | BossSkill[],
  clock = {},
  taken: UpgradeId[] = [],
): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.taken = taken;
  horror(s, skills, { x: 700, y: 360 }, clock);
  return s;
}
const boss = (s: HordeState): Enemy => s.enemies.find((e) => e.horror)!;
/** `s` ticked until the boss has lost HP (a squad bullet landed). */
function untilHit(s: HordeState): HordeState {
  let t = s;
  for (let i = 0; i < 200 && boss(t).hp >= boss(s).maxHp; i++) t = tick(t, STEP);
  expect(boss(t).hp).toBeLessThan(boss(s).maxHp);
  return t;
}

describe('Suppressing Fire (ID-235)', () => {
  /** Horde 1 with no one firing, `taken` held, and `e` added: a far shambler unless overridden. */
  function quiet(taken: UpgradeId[], e: Partial<Enemy> = {}): { s: HordeState; e: Enemy } {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    for (const d of s.defenders) d.nextShotAt = 1e9;
    return { s, e: enemy(s, { x: 1200, y: 360, ...e }) };
  }
  const moved = (s: HordeState, id: number): number => {
    const x = s.enemies.find((o) => o.id === id)!.x;
    return x - tick(s, STEP).enemies.find((o) => o.id === id)!.x;
  };

  it(`puts any enemy a squad bullet hits under fire for ${CARD.suppress.seconds} s, then not again for ${CARD.suppress.cooldown} s`, () => {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = ['suppressing-fire'];
    const id = enemy(s, { x: 700, hp: 1e6, maxHp: 1e6 }).id;
    const of = (t: HordeState): Enemy => t.enemies.find((o) => o.id === id)!;
    let t = s;
    for (let i = 0; i < 200 && of(t).hp >= 1e6; i++) t = tick(t, STEP);
    expect(of(t).hp).toBeLessThan(1e6);
    expect(underFire(t, of(t))).toBe(true);
    // Set in the step the bullet landed: within one step of now plus its seconds.
    expect(of(t).fireUntil! - t.time).toBeGreaterThan(CARD.suppress.seconds - STEP - 1e-9);
    expect(of(t).fireUntil! - t.time).toBeLessThanOrEqual(CARD.suppress.seconds + 1e-9);
    // The cap: the squad keeps hitting it, but no hit extends it or puts it back under fire
    // until its cooldown has run out after the fire ended.
    const until = of(t).fireUntil!;
    const ready = until + CARD.suppress.cooldown;
    let hits = 0;
    while (t.time < ready - STEP) {
      const hp = of(t).hp;
      t = tick(t, STEP);
      if (of(t).hp < hp) hits++;
      expect(of(t).fireUntil, `t=${t.time}`).toBe(until);
      if (t.time > until + 1e-9) expect(underFire(t, of(t)), `t=${t.time}`).toBe(false);
    }
    expect(hits, 'kept hitting it through the window').toBeGreaterThanOrEqual(3);
    // Past the cooldown, the next hit puts it under fire again.
    for (let i = 0; i < 60 && of(t).fireUntil === until; i++) t = tick(t, STEP);
    expect(of(t).fireUntil).toBeGreaterThan(ready);
    expect(underFire(t, of(t))).toBe(true);
  });

  it('never without the card', () => {
    const plain = untilHit(shooting('roar', { nextAt: 50 }));
    expect(boss(plain).fireUntil).toBeUndefined();
    expect(boss(plain).horror!.next.roar).toBe(50);
  });

  it(`slows an enemy under fire ${CARD.suppress.slow * 100}%, a boss or mini-boss ${CARD.suppress.bossSlow * 100}%`, () => {
    for (const [kind, slow] of [
      ['shambler', CARD.suppress.slow],
      ['boss', CARD.suppress.bossSlow],
      ['mini-boss', CARD.suppress.bossSlow],
    ] as const) {
      const free = quiet([]);
      const held = quiet([], { fireUntil: 100 });
      if (kind !== 'shambler') {
        const elite = kind === 'mini-boss' ? { elite: true as const } : {};
        horror(free.s, 'roar', { x: 1200, y: 600, ...elite }, { nextAt: 50 });
        horror(held.s, 'roar', { x: 1200, y: 600, fireUntil: 100, ...elite }, { nextAt: 50 });
      }
      const pick = (s: HordeState): number =>
        kind === 'shambler' ? s.enemies.find((o) => !o.horror)!.id : boss(s).id;
      const step = moved(free.s, pick(free.s));
      expect(step).toBeGreaterThan(0);
      expect(moved(held.s, pick(held.s)) / step, kind).toBeCloseTo(1 - slow, 6);
    }
  });

  it(`runs a boss's skill clocks ${CARD.suppress.recharge * 100}% slower while under fire`, () => {
    const { s } = quiet([]);
    const b = horror(s, 'roar', { fireUntil: 100 }, { nextAt: 10 });
    let t = s;
    for (let i = 0; i < Math.round(1 / STEP); i++) t = tick(t, STEP);
    expect(boss(t).horror!.next.roar).toBeCloseTo(10 + CARD.suppress.recharge, 6);
    expect(b.horror!.next.roar).toBe(10);
  });

  it(`runs a wind-up ${CARD.suppress.windUp * 100}% slower, its tell lit the whole way`, () => {
    const { s } = quiet([]);
    horror(s, 'roar', { fireUntil: 100 }, { nextAt: 0.5 });
    expect(windingUp(s, boss(s))).toBe('roar');
    let t = s;
    // 0.5 s of wind-up left at half speed: it goes off near 1 s, not 0.5 s.
    const due = 0.5 / (1 - CARD.suppress.windUp);
    while (t.time < due - 2 * STEP) {
      t = tick(t, STEP);
      expect(windingUp(t, boss(t)), `t=${t.time}`).toBe('roar');
      expect(boss(t).horror!.fired.roar, `t=${t.time}`).toBeUndefined();
    }
    expect(boss(t).horror!.longer!.roar).toBeGreaterThan(0.4);
    for (let i = 0; i < 4; i++) t = tick(t, STEP);
    const h = boss(t).horror!;
    expect(h.fired.roar).toBeCloseTo(due, 1);
    expect(h.longer).toBeUndefined();
  });

  it('a stunned boss under fire: its clocks only wait, as any stun', () => {
    const { s } = quiet([]);
    horror(s, 'roar', { fireUntil: 100, stunnedUntil: 100 }, { nextAt: 10 });
    let t = s;
    for (let i = 0; i < Math.round(1 / STEP); i++) t = tick(t, STEP);
    expect(boss(t).horror!.next.roar).toBeCloseTo(10 + t.time, 6);
    expect(boss(t).horror!.longer).toBeUndefined();
  });
});

describe('Cauterise (ID-245)', () => {
  /** Horde 1, a far-from-dead enemy in range, `taken` held, ticked until a squad bullet hit it. */
  function scorchedBy(taken: UpgradeId[], skills?: BossSkill[]): { t: HordeState; e: Enemy } {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    const e = skills
      ? horror(s, skills, { x: 700, y: 360 }, { nextAt: 100 })
      : enemy(s, { x: 700, y: 360, hp: 1e6, maxHp: 1e6 });
    let t = s;
    const of = (u: HordeState): Enemy => u.enemies.find((o) => o.id === e.id)!;
    for (let i = 0; i < 200 && of(t).hp >= of(t).maxHp; i++) t = tick(t, STEP);
    expect(of(t).hp).toBeLessThan(of(t).maxHp);
    return { t, e: of(t) };
  }

  it(`scorches any enemy a squad bullet hits for ${CARD.cauterise.seconds} s`, () => {
    const { t, e } = scorchedBy(['cauterise']);
    expect(scorched(t, e)).toBe(true);
    expect(e.scorchUntil! - t.time).toBeGreaterThan(CARD.cauterise.seconds - STEP - 1e-9);
    expect(e.scorchUntil! - t.time).toBeLessThanOrEqual(CARD.cauterise.seconds + 1e-9);
  });

  it(`a Regen boss for ${CARD.cauterise.bossSeconds} s, any other boss for ${CARD.cauterise.seconds} s`, () => {
    for (const [skills, seconds] of [
      [['regen'], CARD.cauterise.bossSeconds],
      [['enrage'], CARD.cauterise.seconds],
      [['roar'], CARD.cauterise.seconds],
    ] as const) {
      const { t, e } = scorchedBy(['cauterise'], [...skills]);
      expect(e.scorchUntil! - t.time, skills.join()).toBeGreaterThan(seconds - STEP - 1e-9);
      expect(e.scorchUntil! - t.time, skills.join()).toBeLessThanOrEqual(seconds + 1e-9);
    }
  });

  it('does nothing without the card', () => {
    const { e } = scorchedBy([]);
    expect(e.scorchUntil).toBeUndefined();
    expect(scorchedBy([], ['regen']).e.scorchUntil).toBeUndefined();
  });

  it('a hit on a scorched enemy refreshes it: no stack, no cooldown', () => {
    const { t, e } = scorchedBy(['cauterise']);
    const first = e.scorchUntil!;
    let u = t;
    for (const d of u.defenders) d.nextShotAt = 1e9;
    for (let i = 0; i < 40; i++) u = tick(u, STEP);
    for (const d of u.defenders) d.nextShotAt = u.time;
    const hp = u.enemies[0]!.hp;
    for (let i = 0; i < 200 && u.enemies[0]!.hp >= hp; i++) u = tick(u, STEP);
    expect(u.enemies[0]!.scorchUntil! - u.time).toBeLessThanOrEqual(CARD.cauterise.seconds + 1e-9);
    expect(u.enemies[0]!.scorchUntil!).toBeGreaterThan(first);
  });

  it('a Regen boss never heals while scorched, and does once it ends', () => {
    const { t, e } = scorchedBy(['cauterise'], ['regen']);
    let u = t;
    for (const d of u.defenders) d.nextShotAt = 1e9;
    for (let i = 0; i < 60 && u.bullets.length > 0; i++) u = tick(u, STEP);
    const hp = u.enemies.find((o) => o.id === e.id)!.hp;
    while (u.time < e.scorchUntil! - 2 * STEP) {
      u = tick(u, STEP);
      expect(u.enemies.find((o) => o.id === e.id)!.hp, `t=${u.time}`).toBe(hp);
    }
    for (let i = 0; i < 4 / STEP; i++) u = tick(u, STEP);
    expect(u.enemies.find((o) => o.id === e.id)!.hp).toBeGreaterThan(hp);
  });

  describe("takes 'more damage from every source'", () => {
    const quiet = (scorch: boolean): { s: HordeState; e: Enemy } => {
      const s = newHorde(1, setup());
      s.toSpawn = 0;
      for (const d of s.defenders) d.nextShotAt = 1e9;
      const e = enemy(s, { x: 1200, y: 360, hp: 1e6, maxHp: 1e6 });
      if (scorch) e.scorchUntil = 100;
      return { s, e };
    };
    const lost = (u: HordeState, e: Enemy): number =>
      e.maxHp - u.enemies.find((o) => o.id === e.id)!.hp;
    const bonus = 1 + CARD.cauterise.taken;

    it('a squad bullet', () => {
      const dmg = (scorch: boolean): number => {
        const { s, e } = quiet(scorch);
        s.defenders[0]!.nextShotAt = 0;
        e.x = 700;
        let u = s;
        for (let i = 0; i < 200 && lost(u, e) === 0; i++) u = tick(u, STEP);
        return lost(u, e);
      };
      expect(dmg(true)).toBeCloseTo(dmg(false) * bonus, 6);
    });

    it('burn: the burnt total grows by exactly the HP lost', () => {
      const run = (scorch: boolean): { loss: number; burnt: number } => {
        const { s, e } = quiet(scorch);
        e.burnUntil = 100;
        e.burnDps = 10;
        const u = tick(s, STEP);
        return { loss: lost(u, e), burnt: u.enemies[0]!.burnt ?? 0 };
      };
      const plain = run(false);
      const hot = run(true);
      expect(hot.loss).toBeCloseTo(plain.loss * bonus, 9);
      expect(hot.burnt).toBeCloseTo(hot.loss, 9);
      expect(plain.burnt).toBeCloseTo(plain.loss, 9);
    });

    it('a molotov fire: the burnt total grows by exactly the HP lost', () => {
      const run = (scorch: boolean): { loss: number; burnt: number } => {
        const { s, e } = quiet(scorch);
        s.fires.push({ x: e.x, y: e.y, at: 0, until: 100 });
        const u = tick(s, STEP);
        return { loss: lost(u, e), burnt: u.enemies[0]!.burnt ?? 0 };
      };
      const plain = run(false);
      const hot = run(true);
      expect(plain.loss).toBeGreaterThan(0);
      expect(hot.loss).toBeCloseTo(plain.loss * bonus, 9);
      expect(hot.burnt).toBeCloseTo(hot.loss, 9);
    });

    it('an airstrike', () => {
      const run = (scorch: boolean): number => {
        const { s, e } = quiet(scorch);
        s.incoming.push({ skill: 'airstrike', x: e.x, y: e.y, at: 0 });
        return lost(tick(s, STEP), e);
      };
      expect(run(false)).toBeGreaterThan(0);
      expect(run(true)).toBeCloseTo(run(false) * bonus, 9);
    });

    it('a dazed, scorched enemy takes both from a squad bullet: 1.3 × 1.1 against a plain hit', () => {
      const first = (taken: UpgradeId[], dazed: boolean, scorch: boolean): number => {
        const { s, e } = quiet(scorch);
        s.taken = taken;
        if (dazed) e.pushedAt = s.time;
        s.defenders[0]!.nextShotAt = 0;
        e.x = 700;
        let u = s;
        for (let i = 0; i < 200 && lost(u, e) === 0; i++) u = tick(u, STEP);
        return lost(u, e);
      };
      const plain = first([], false, false);
      const both = first(['concussion-rounds'], true, true);
      expect(both / plain).toBeCloseTo((1 + CARD.concussion.daze) * bonus, 6);
      // Neither replaces the other.
      expect(first(['concussion-rounds'], true, false) / plain).toBeCloseTo(
        1 + CARD.concussion.daze,
        6,
      );
      expect(first([], false, true) / plain).toBeCloseTo(bonus, 6);
    });

    it('a frag grenade', () => {
      const run = (scorch: boolean): number => {
        const { s, e } = quiet(scorch);
        s.grenades.push({
          by: 'a',
          fromX: 0,
          fromY: 0,
          x: e.x,
          y: e.y,
          at: 0,
          lands: 0,
          burst: false,
        });
        return lost(tick(s, STEP), e);
      };
      expect(run(false)).toBeGreaterThan(0);
      expect(run(true)).toBeCloseTo(run(false) * bonus, 9);
    });

    it('a trap', () => {
      const run = (scorch: boolean): number => {
        const { s, e } = quiet(scorch);
        e.x = TRAP_STRIP.x + 10;
        e.y = 4.5 * SEGMENT_HEIGHT;
        e.stunnedUntil = 1e9;
        s.traps.push({ id: 0, kind: 'spikes', row: 4, durability: 5, hit: [] });
        return lost(tick(s, STEP), e);
      };
      expect(run(false)).toBeGreaterThan(0);
      expect(run(true)).toBeCloseTo(run(false) * bonus, 9);
    });

    it('barbed wire’s bleed: the burnt total grows by exactly the HP lost', () => {
      const run = (scorch: boolean): { loss: number; burnt: number } => {
        const { s, e } = quiet(scorch);
        s.taken = ['barbed-wire'];
        e.x = 900;
        e.y = 4.5 * SEGMENT_HEIGHT;
        e.stunnedUntil = 1e9;
        const u = tick(s, STEP);
        return { loss: lost(u, e), burnt: u.enemies[0]!.burnt ?? 0 };
      };
      const plain = run(false);
      const hot = run(true);
      expect(plain.loss).toBeGreaterThan(0);
      expect(hot.loss).toBeCloseTo(plain.loss * bonus, 9);
      expect(hot.burnt).toBeCloseTo(hot.loss, 9);
    });

    it('a lit oil slick: the burnt total grows by exactly the HP lost', () => {
      const run = (scorch: boolean): { loss: number; burnt: number } => {
        const { s, e } = quiet(scorch);
        s.slicks.push({ x: e.x, y: e.y, at: 0, until: 100, litAt: 0 });
        const u = tick(s, STEP);
        return { loss: lost(u, e), burnt: u.enemies[0]!.burnt ?? 0 };
      };
      const plain = run(false);
      const hot = run(true);
      expect(plain.loss).toBeGreaterThan(0);
      expect(hot.loss).toBeCloseTo(plain.loss * bonus, 9);
      expect(hot.burnt).toBeCloseTo(hot.loss, 9);
    });

    it('a turret bullet takes the +10% but never applies a scorch', () => {
      const run = (scorch: boolean): { loss: number; scorchUntil: number | undefined } => {
        const { s, e } = quiet(scorch);
        s.taken = ['cauterise'];
        e.x = 700;
        e.stunnedUntil = 1e9;
        s.bullets.push({
          dx: 1,
          dy: 0,
          speed: 1800,
          damage: 10,
          owner: 'turret:0',
          fromX: 600,
          fromY: e.y,
          x: 600,
          y: e.y,
          aim: 100,
          left: 1000,
          pierce: 0,
          hit: [],
          tracer: WEAPONS.pistol.tracer,
        });
        let u = s;
        for (let i = 0; i < 10 && lost(u, e) === 0; i++) u = tick(u, STEP);
        return { loss: lost(u, e), scorchUntil: u.enemies[0]!.scorchUntil };
      };
      const plain = run(false);
      const hot = run(true);
      expect(plain.loss).toBeCloseTo(10, 9);
      expect(hot.loss).toBeCloseTo(10 * bonus, 9);
      expect(plain.scorchUntil).toBeUndefined();
      expect(hot.scorchUntil).toBe(100);
    });

    it('an enemy that is not scorched takes the damage untouched', () => {
      const run = (): number => {
        const { s, e } = quiet(false);
        e.burnUntil = 100;
        e.burnDps = 10;
        return lost(tick(s, STEP), e);
      };
      expect(run()).toBeCloseTo(10 * STEP, 6);
    });
  });
});

describe('Momentum (ID-245)', () => {
  /**
   * Horde 1 with every gun empty, one throw each, and `dead` enemies at 0 HP (the first a
   * `first` boss or mini-boss when given) for `removeDead` to pay for in the next tick.
   */
  function fallen(
    taken: UpgradeId[],
    dead: number,
    first?: 'boss' | 'mini-boss',
    streak?: number,
  ): HordeState {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    if (streak !== undefined) s.streak = streak;
    for (const d of s.defenders) {
      d.nextShotAt = 1e9;
      d.ammo.primary = 0;
      d.reloadedAt.primary = 1e9;
      d.throws = 1;
    }
    for (let i = 0; i < dead; i++) {
      if (i === 0 && first) {
        horror(
          s,
          'roar',
          { x: 1400, y: 100, hp: 0, ...(first === 'mini-boss' ? { elite: true } : {}) },
          { nextAt: 100 },
        );
      } else enemy(s, { x: 1400, y: 100 + i, hp: 0 });
    }
    return s;
  }
  const full = (t: HordeState): boolean =>
    t.defenders.every((d) => d.ammo.primary === magazineOf(t, d.loadout.primary!, d));

  it(`${CARD.momentum.kills} kills reload every gun at once, the counter carrying the rest`, () => {
    const k = CARD.momentum.kills;
    const t = tick(fallen(['momentum'], k + 5), STEP);
    expect(full(t)).toBe(true);
    expect(t.streak).toBe(5);
    expect(t.reloadedAllAt).toBe(0);
    // 50 kills in one step count two reloads: the guns end full either way, the streak at 0.
    const two = tick(fallen(['momentum'], 2 * k), STEP);
    expect(full(two)).toBe(true);
    expect(two.streak).toBe(0);
  });

  it('one kill short reloads nothing; the next kill does', () => {
    const k = CARD.momentum.kills;
    const t = tick(fallen(['momentum'], k - 1), STEP);
    expect(full(t)).toBe(false);
    expect(t.streak).toBe(k - 1);
    expect(t.reloadedAllAt).toBeUndefined();
    const u = tick(fallen(['momentum'], 1, undefined, k - 1), STEP);
    expect(full(u)).toBe(true);
    expect(u.streak).toBe(0);
  });

  it('the streak is absent in a fresh fight and without the card', () => {
    expect(newHorde(1, setup()).streak).toBeUndefined();
    const t = tick(fallen([], 30), STEP);
    expect(t.streak).toBeUndefined();
    expect(full(t)).toBe(false);
  });

  it('a boss or mini-boss kill gives each survivor a throw back; a shambler does not', () => {
    for (const first of ['boss', 'mini-boss'] as const) {
      const t = tick(fallen(['momentum'], 1, first), STEP);
      for (const d of t.defenders) expect(d.throws, first).toBe(2);
      expect(t.streak, first).toBe(1);
    }
    const t = tick(fallen(['momentum'], 1), STEP);
    for (const d of t.defenders) expect(d.throws).toBe(1);
  });

  it('a full load of throws stays full', () => {
    const s = fallen(['momentum'], 1, 'boss');
    s.defenders[0]!.throws = CARD.throws.carry;
    const d = tick(s, STEP).defenders[0]!;
    expect(d.throws === undefined || d.throws === CARD.throws.carry).toBe(true);
  });

  it('does nothing for a boss without the card', () => {
    const t = tick(fallen([], 1, 'boss'), STEP);
    expect(t.defenders[0]!.ammo.primary).toBe(0);
    expect(t.defenders[0]!.throws).toBe(1);
  });

  it('a frag, a wire bleed and a trap kill each count 1; a Swollen’s own blast counts 0', () => {
    const one = (setupFn: (s: HordeState) => void, extra: UpgradeId[] = []): HordeState => {
      const s = newHorde(1, setup());
      s.toSpawn = 0;
      s.taken = ['momentum', ...extra];
      for (const d of s.defenders) d.nextShotAt = 1e9;
      setupFn(s);
      return tick(s, STEP);
    };
    const frag = one((s) => {
      const e = enemy(s, { x: 1200, y: 360, hp: 1, maxHp: 1 });
      s.grenades.push({
        by: 'a',
        fromX: 0,
        fromY: 0,
        x: e.x,
        y: e.y,
        at: 0,
        lands: 0,
        burst: false,
      });
    });
    expect(frag.enemies).toEqual([]);
    expect(frag.streak).toBe(1);
    const wire = one(
      (s) => {
        enemy(s, { x: 900, y: 4.5 * SEGMENT_HEIGHT, hp: 0.001, maxHp: 1, stunnedUntil: 1e9 });
      },
      ['barbed-wire'],
    );
    expect(wire.enemies).toEqual([]);
    expect(wire.streak).toBe(1);
    const trap = one((s) => {
      enemy(s, {
        x: TRAP_STRIP.x + 10,
        y: 4.5 * SEGMENT_HEIGHT,
        hp: 1,
        maxHp: 1,
        stunnedUntil: 1e9,
      });
      s.traps.push({ id: 0, kind: 'spikes', row: 4, durability: 5, hit: [] });
    });
    expect(trap.enemies).toEqual([]);
    expect(trap.streak).toBe(1);
    // A Swollen blowing itself up on the wall is not paid for: it counts nothing.
    const swollen = newHorde(1, setup());
    swollen.toSpawn = 0;
    swollen.taken = ['momentum'];
    for (const d of swollen.defenders) d.nextShotAt = 1e9;
    enemy(swollen, { kind: 'swollen', x: 521, y: 4.5 * SEGMENT_HEIGHT, hp: 60, maxHp: 60 });
    let blast = swollen;
    for (let i = 0; i < 6; i++) blast = tick(blast, STEP);
    expect(blast.enemies).toEqual([]);
    expect(blast.bursts).toHaveLength(1);
    expect(blast.streak).toBeUndefined();
  });

  it('counts a burn kill, and the streak carries across a wave', () => {
    const s = fallen(['momentum'], 0);
    const e = enemy(s, { x: 1200, y: 360, hp: 0.01, maxHp: 20 });
    e.burnUntil = 100;
    e.burnDps = 10;
    const t = tick(s, STEP);
    expect(t.enemies.some((o) => o.id === e.id)).toBe(false);
    expect(t.streak).toBe(1);
  });
});
describe('Breaching Rounds', () => {
  const plated = (extra: Partial<Enemy> = {}): Enemy =>
    ({
      kind: 'shambler',
      horror: { skills: ['plates'], platesOff: false },
      ...extra,
    }) as unknown as Enemy;

  it('takes back half of Armour plates’ cut and half of Shield’s', () => {
    expect(hitDamage(plated(), 10)).toBeCloseTo(10 * BOSS_SKILL.plates.factor, 9);
    expect(hitDamage(plated(), 10, false, true)).toBeCloseTo(
      10 * (1 - (1 - BOSS_SKILL.plates.factor) * (1 - CARD.breach.share)),
      9,
    );
    const shield = { kind: 'shambler', shielded: true } as unknown as Enemy;
    expect(hitDamage(shield, 10, false, true)).toBeCloseTo(
      10 * (1 - (1 - BOSS_SKILL.shield.factor) * (1 - CARD.breach.share)),
      9,
    );
    // Not a cut it was never making, and flat armour stays.
    expect(hitDamage({ kind: 'shambler' } as Enemy, 10, false, true)).toBe(10);
    expect(hitDamage({ kind: 'horror' } as Enemy, 10, false, true)).toBe(8);
  });

  it('works on the squad’s bullets in a fight', () => {
    const loss = (taken: UpgradeId[]): number => {
      const s = shooting('plates', {}, taken);
      return boss(s).maxHp - boss(untilHit(s)).hp;
    };
    expect(loss(['breaching-rounds'])).toBeGreaterThan(loss([]));
  });
});

describe('Adrenaline (ID-245)', () => {
  /** Horde 1, survivor a alone in the camp beside a brute that hits it once a step cycle. */
  function mauled(taken: UpgradeId[], maxHp: number, hp = maxHp): HordeState {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    s.defenders = s.defenders.slice(0, 1);
    const a = s.defenders[0]!;
    a.maxHp = maxHp;
    a.hp = hp;
    a.nextShotAt = 1e9;
    enemy(s, { kind: 'brute', x: a.x, y: a.y, hp: 1e9, maxHp: 1e9, inCamp: true, nextAttackAt: 0 });
    return s;
  }
  const brute = ENEMIES.brute.damage;
  const light = brute * 50;
  const heavy = brute * 5;
  const ON = ['adrenaline-rush'] as UpgradeId[];

  it(`a hit gives the squad +${CARD.rush.rate * 100}% fire rate for ${CARD.rush.seconds} s`, () => {
    const t = tick(mauled(ON, light), STEP);
    expect(t.defenders[0]!.hp).toBeLessThan(light);
    expect(t.rush).toMatchObject({ at: 0, by: 'a' });
    expect(t.rush!.heavy).toBeUndefined();
    expect(t.rush!.until - t.rush!.at).toBeCloseTo(CARD.rush.seconds, 9);
    expect(rushFactor(t)).toBeCloseTo(1 + CARD.rush.rate, 9);
    expect(rushFactor({ time: t.rush!.until, rush: t.rush })).toBe(1);
    expect(rushFactor({ time: 0 })).toBe(1);
  });

  it(`a hit of ${CARD.rush.heavy * 100}% of max HP or more gives +${CARD.rush.heavyRate * 100}%`, () => {
    const t = tick(mauled(ON, heavy), STEP);
    expect(t.rush!.heavy).toBe(true);
    expect(rushFactor(t)).toBeCloseTo(1 + CARD.rush.heavyRate, 9);
  });

  it('heavy is the hit, not the HP left: 1 HP survivor, a hit that more than empties it', () => {
    const t = tick(mauled(ON, heavy, 1), STEP);
    expect(t.defenders).toHaveLength(0);
    expect(t.rush!.heavy).toBe(true);
  });

  it('a hit that downs a survivor still starts the boost, and the boost outlasts them', () => {
    const t = tick(mauled(ON, light, 1), STEP);
    expect(t.defenders).toHaveLength(0);
    expect(t.rush).toBeDefined();
    expect(rushFactor(t)).toBeCloseTo(1 + CARD.rush.rate, 9);
  });

  it('nothing without the card', () => {
    const t = tick(mauled([], heavy), STEP);
    expect(t.defenders[0]!.hp).toBeLessThan(heavy);
    expect(t.rush).toBeUndefined();
    expect(cardFireRate(t)).toBe(1);
  });

  it('a call that leaves HP unchanged starts nothing', () => {
    const s = mauled(ON, light, 0);
    const t = tick(s, STEP);
    expect(t.rush).toBeUndefined();
  });

  it("lowering max HP (a Chef's food ending) starts nothing", () => {
    const s = mauled(ON, light);
    s.enemies = [];
    s.defenders[0]!.maxHp = 10;
    s.defenders[0]!.hp = 10;
    expect(tick(s, STEP).rush).toBeUndefined();
  });

  it('a Poison pool gives the light boost, never 35%, however long they stand in it', () => {
    const s = mauled(ON, 100);
    s.enemies = [];
    const a = s.defenders[0]!;
    s.pools = [{ x: a.x, y: a.y, at: 0, until: 1e6 }];
    let t = s;
    for (let i = 0; i < 20 / STEP; i++) {
      t = tick(t, STEP);
      expect(t.rush?.heavy, `t=${t.time}`).toBeUndefined();
      expect(t.rush?.heavyUntil, `t=${t.time}`).toBeUndefined();
    }
    expect(t.rush).toBeDefined();
    expect(t.rush!.at).toBeLessThan(1);
    expect(rushFactor(t)).toBeCloseTo(1 + CARD.rush.rate, 9);
  });

  it('a refresh moves the end only: the start, speaker and size stay', () => {
    const s = mauled(ON, heavy * 10, heavy * 10);
    s.defenders[0]!.maxHp = heavy;
    let t = tick(s, STEP);
    const at = t.rush!.at;
    expect(t.rush!.heavy).toBe(true);
    const until = t.rush!.until;
    for (let i = 0; i < 1 / STEP; i++) t = tick(t, STEP);
    t.defenders[0]!.hp = 1e6;
    t.defenders[0]!.maxHp = 1e6 * 100;
    // A light hit during the 35% boost: the 3 s renew, the 35% window does not.
    const heavyUntil = t.rush!.heavyUntil!;
    for (const e of t.enemies) e.nextAttackAt = 0;
    t = tick(t, STEP);
    expect(t.rush!.at).toBe(at);
    expect(t.rush!.heavy).toBe(true);
    expect(t.rush!.until).toBeGreaterThan(until);
    expect(t.rush!.heavyUntil).toBe(heavyUntil);
  });

  it('ends after its seconds: a new hit after that starts a new one', () => {
    let t = tick(mauled(ON, light), STEP);
    const first = t.rush!.at;
    t.enemies = [];
    for (let i = 0; i < (CARD.rush.seconds + 1) / STEP; i++) t = tick(t, STEP);
    expect(rushFactor(t)).toBe(1);
    expect(t.rush!.at).toBe(first);
    const a = t.defenders[0]!;
    enemy(t, { kind: 'brute', x: a.x, y: a.y, hp: 1e9, maxHp: 1e9, inCamp: true, nextAttackAt: 0 });
    t = tick(t, STEP);
    expect(t.rush!.at).toBeGreaterThan(first);
    expect(rushFactor(t)).toBeGreaterThan(1);
  });

  it('multiplies with the other fire-rate factors', () => {
    const base = { taken: ['concussion-rounds', ...ON] as UpgradeId[], time: 0 };
    const rush = { at: 0, by: 'a', until: 10 };
    expect(cardFireRate({ ...base, rush })).toBeCloseTo(
      CARD.concussion.fireRate * (1 + CARD.rush.rate),
      9,
    );
    expect(cardFireRate(base)).toBe(CARD.concussion.fireRate);
  });

  it('a turret’s fire rate is unchanged while a boost runs', () => {
    const shots = (rush: boolean): number => {
      const s = newHorde(1, setup());
      s.toSpawn = 0;
      s.taken = ON;
      s.energy = 1e6;
      for (const d of s.defenders) d.nextShotAt = 1e9;
      if (rush) s.rush = { at: 0, by: 'a', until: 1e6 };
      s.turrets.push({
        id: 0,
        mount: 'tower',
        column: 0,
        row: 4,
        x: 420,
        y: 4.5 * SEGMENT_HEIGHT,
        condition: MAX_CONDITION,
        nextShotAt: 0,
      });
      enemy(s, { x: 700, y: 4.5 * SEGMENT_HEIGHT, hp: 1e9, maxHp: 1e9, stunnedUntil: 1e9 });
      let t = s;
      let n = 0;
      for (let i = 0; i < 10 / STEP; i++) {
        const before = t.turrets[0]!.nextShotAt;
        t = tick(t, STEP);
        if (t.turrets[0]!.nextShotAt !== before) n++;
      }
      return n;
    };
    expect(shots(false)).toBeGreaterThan(3);
    expect(shots(true)).toBe(shots(false));
  });

  it('a Paramedic’s dodge to 1 HP on a heavy hit still gives the 35% boost', () => {
    let dodged = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = newHorde(seed, {
        ...setup(),
        roster: [{ id: 'a', name: 'A', loadout: pistol(), xp: xpForLevel(21), job: 'paramedic' }],
      });
      s.toSpawn = 0;
      s.taken = ON;
      const d = s.defenders[0]!;
      d.nextShotAt = 1e9;
      d.maxHp = brute * 5;
      d.hp = 5;
      enemy(s, {
        kind: 'brute',
        x: d.x,
        y: d.y,
        hp: 1e9,
        maxHp: 1e9,
        inCamp: true,
        nextAttackAt: 0,
      });
      let t: HordeState = s;
      for (let i = 0; i < 3 / STEP && t.outcome === 'fighting'; i++) {
        t = tick(t, STEP);
        const now = t.defenders.find((x) => x.id === 'a');
        if (!now) break;
        if (now.hp < 2) {
          dodged++;
          expect(t.rush?.heavy, `seed ${seed}`).toBe(true);
          expect(rushFactor(t)).toBeCloseTo(1 + CARD.rush.heavyRate, 9);
          break;
        }
      }
    }
    expect(dodged).toBeGreaterThan(0);
  });

  it('the squad shoots faster while it runs', () => {
    const gap = (rush: boolean): number => {
      const s = newHorde(1, setup());
      s.toSpawn = 0;
      s.taken = ON;
      if (rush) s.rush = { at: 0, by: 'a', until: 1e6 };
      enemy(s, { x: 700, y: 360, hp: 1e9, maxHp: 1e9 });
      const a = s.defenders[0]!;
      let t = s;
      const shots: number[] = [];
      for (let i = 0; i < 600 && shots.length < 7; i++) {
        const before = t.defenders[0]!.nextShotAt;
        t = tick(t, STEP);
        if (t.defenders[0]!.nextShotAt !== before) shots.push(t.time);
      }
      expect(shots.length, a.id).toBe(7);
      return (shots[6]! - shots[0]!) / 6;
    };
    expect(gap(false) / gap(true)).toBeCloseTo(1 + CARD.rush.rate, 1);
  });
});
describe('the scripted player (ID-222)', () => {
  const offer = (...ids: UpgradeId[]) => ({
    offer: ids.map((id) => ({ kind: 'upgrade' as const, id })),
    taken: [] as UpgradeId[],
  });

  it('takes a mode card over a utility card, but not over the damage core', () => {
    for (const id of MODE_CARDS) {
      expect(squadPick(offer('sandbags', id)), id).toBe(1);
      expect(squadPick(offer(id, 'sharpshooter')), id).toBe(1);
      expect(squadPick(offer(id, 'long-sight')), id).toBe(0);
    }
  });
});
