// ID-222 mode reward cards: what unlocks them (derived from a mode's saved horde), where they
// show (a higher mode's pool, only when the fight has what they answer; Suppressing Fire always,
// ID-235), and what each does.
import { describe, expect, it } from 'vitest';
import { eligible, isModeCard, rollOffer, UPGRADE_IDS, UPGRADES } from './cards.ts';
import { BOSS_SKILL, CARD, MODE_CARDS, MODE_UNLOCKS, STEP, type BossSkill } from './data.ts';
import type { GameState } from './game.ts';
import {
  enrageFast,
  hitDamage,
  magazineOf,
  newHorde,
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
import { enemy, horror, setup } from './testing.ts';

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
    expect(bossReward(hell(30), 30)).toEqual({ part: 0, unlock: 'tranq-darts', finale: false });
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
    ['cauterise', ['regen'], ['roar']],
    ['gas-masks', ['poison'], ['roar']],
    ['breaching-rounds', ['shield'], ['roar']],
    ['breaching-rounds', ['plates'], ['roar']],
    ['tranq-darts', ['enrage'], ['roar']],
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

  it('Momentum needs a boss, not just a mini-boss; Suppressing Fire any fight (ID-235)', () => {
    expect(eligible(pooled(['roar']), 'momentum')).toBe(true);
    expect(eligible(pooled(['roar'], true), 'momentum')).toBe(false);
    expect(eligible(pooled(NONE), 'suppressing-fire')).toBe(true);
    expect(
      eligible(
        newHorde(1, { ...setup(), cards: [...SQUAD_CARDS, ...MODE_CARDS] }),
        'suppressing-fire',
      ),
    ).toBe(true);
    expect(
      eligible(newHorde(1, { ...setup(), cards: [...SQUAD_CARDS, ...MODE_CARDS] }), 'momentum'),
    ).toBe(false);
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

describe('Cauterise', () => {
  it(`stops Regen for ${CARD.cauterise.seconds} s after a squad hit`, () => {
    const hurt = (taken: UpgradeId[]): { t: HordeState; hp: number } => {
      const t = untilHit(shooting('regen', {}, taken));
      for (const d of t.defenders) d.nextShotAt = 1e9;
      let u = t;
      for (let i = 0; i < 60 && u.bullets.length > 0; i++) u = tick(u, STEP);
      return { t: u, hp: boss(u).hp };
    };
    const control = hurt([]);
    let c = control.t;
    for (let i = 0; i < 20; i++) c = tick(c, STEP);
    expect(boss(c).hp).toBeGreaterThan(control.hp);

    const burnt = hurt(['cauterise']);
    let t = burnt.t;
    expect(scorched(t, boss(t))).toBe(true);
    for (let i = 0; i < 2.5 / STEP; i++) t = tick(t, STEP);
    expect(boss(t).hp).toBe(burnt.hp);
    expect(scorched(t, boss(t))).toBe(true);
    for (let i = 0; i < 2 / STEP; i++) t = tick(t, STEP);
    expect(scorched(t, boss(t))).toBe(false);
    expect(boss(t).hp).toBeGreaterThan(burnt.hp);
  });
});

describe('Momentum', () => {
  function emptied(taken: UpgradeId[], elite = false): HordeState {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.taken = taken;
    for (const d of s.defenders) {
      d.nextShotAt = 1e9;
      d.ammo.primary = 0;
      d.reloadedAt.primary = 1e9;
      d.throws = 1;
    }
    const b = horror(
      s,
      'roar',
      { x: 1400, y: 100, hp: 0, ...(elite ? { elite: true } : {}) },
      { nextAt: 100 },
    );
    expect(b.hp).toBe(0);
    return s;
  }

  it('reloads every gun at once and gives each survivor a throw back when a boss dies', () => {
    const t = tick(emptied(['momentum']), STEP);
    for (const d of t.defenders) {
      expect(d.ammo.primary).toBe(magazineOf(t, d.loadout.primary!, d));
      expect(d.throws).toBe(2);
    }
  });

  it('a full load of throws stays full', () => {
    const s = emptied(['momentum']);
    s.defenders[0]!.throws = CARD.throws.carry;
    const d = tick(s, STEP).defenders[0]!;
    expect(d.throws === undefined || d.throws === CARD.throws.carry).toBe(true);
  });

  it('does nothing without the card, or for a mini-boss', () => {
    for (const s of [emptied([]), emptied(['momentum'], true)]) {
      const d = tick(s, STEP).defenders[0]!;
      expect(d.ammo.primary).toBe(0);
      expect(d.throws).toBe(1);
    }
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

describe('Tranq Darts', () => {
  it(`takes Enrage’s speed off an enraged boss for ${CARD.tranq.seconds} s, not the card’s absence`, () => {
    const hit = (taken: UpgradeId[]): HordeState =>
      untilHit(shooting('enrage', { nextAt: 100, enraged: true }, taken));
    const t = hit(['tranq-darts']);
    expect(boss(t).horror!.tranqUntil).toBeGreaterThan(t.time);
    expect(enrageFast(t, boss(t))).toBe(false);
    expect(enrageFast({ time: boss(t).horror!.tranqUntil! }, boss(t))).toBe(true);
    // Its harder hits stay: still enraged.
    expect(boss(t).horror!.enraged).toBe(true);
    expect(enrageFast(hit([]), boss(hit([])))).toBe(true);
    // A boss not yet enraged takes nothing from it.
    const calm = untilHit(shooting('enrage', { nextAt: 100 }, ['tranq-darts']));
    expect(boss(calm).horror!.tranqUntil).toBeUndefined();
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
