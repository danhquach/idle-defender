// Mid-fight swaps (ID-148): a fit bench survivor takes over the slot of one about to fall,
// at most `MID_SWAP.max` times a fight; the one who pulled back is still standing, so on a
// win they do not rest (ID-155).
import { describe, expect, it } from 'vitest';
import { recruit } from './camp.ts';
import { CHAT_LINES, chatter, newChat, personalityOf } from './chatter.ts';
import { BENCH_XP_SHARE, MID_SWAP, STEP, WALK_SPEED } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import { tick, tickInPlace, type HordeState } from './horde.ts';
import { campOf, finishSquadHorde, squadResult, startSquadHorde, swapBench } from './hordeonly.ts';
import { xpForLevel } from './stats.ts';

const NOW = 1_700_000_000_000;

/** Recruit `no` as a Police officer (no healing or HP profession to move the numbers). */
const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  job: 'police',
  ...extra,
});

const people = (n: number, from = 1): RosterDefender[] =>
  Array.from({ length: n }, (_, i) => person(from + i));

function campGame(squad: RosterDefender[], bench: RosterDefender[] = [], horde = 3): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** `h` with survivor `id` set to `share` of their max HP. */
function hurt(h: HordeState, id: string, share: number): HordeState {
  const d = h.defenders.find((x) => x.id === id)!;
  d.hp = d.maxHp * share;
  return h;
}

const slotOf = (h: HordeState, id: string): number => h.defenders.find((d) => d.id === id)!.postId;

describe('the swap bench (ID-148)', () => {
  it('is the fit bench, highest level first, ties in camp order, at most MID_SWAP.max', () => {
    const lv3 = xpForLevel(3);
    const bench = [
      person(7, { xp: 0 }),
      person(8, { xp: lv3 }),
      person(9, { xp: xpForLevel(5), rest: 1 }),
      person(10, { xp: lv3 + 1 }), // Same level as recruit-8: camp order breaks the tie.
      person(11, { xp: xpForLevel(2) }),
    ];
    expect(swapBench(campGame(people(6), bench)).map((d) => d.id)).toEqual([
      'recruit-8',
      'recruit-10',
      'recruit-11',
    ]);
  });

  it('comes into the fight with MID_SWAP.max swaps; none with an empty bench', () => {
    const h = startSquadHorde(campGame(people(6), people(2, 7)), 1, NOW);
    expect(h.subs!.map((d) => d.id)).toEqual(['recruit-7', 'recruit-8']);
    expect(h.swapsLeft).toBe(MID_SWAP.max);
    expect(h.swaps).toEqual([]);
    // No recruit cards or replacement offers from the bench.
    expect(h.bench).toEqual([]);
    expect(startSquadHorde(campGame(people(6)), 1, NOW).subs).toEqual([]);
  });
});

describe('a swap mid-fight (ID-148)', () => {
  const game = campGame(people(6), people(4, 7));

  it('under the threshold, the next bench survivor takes the same slot at full HP', () => {
    const h0 = startSquadHorde(game, 1, NOW);
    const slot = slotOf(h0, 'recruit-2');
    const h = tick(hurt(h0, 'recruit-2', MID_SWAP.below - 0.01), STEP);
    expect(h.defenders.some((d) => d.id === 'recruit-2')).toBe(false);
    const sub = h.defenders.find((d) => d.id === 'recruit-7')!;
    expect(sub.postId).toBe(slot);
    expect(h.posts[slot]!.defenderId).toBe('recruit-7');
    expect(sub.hp).toBe(sub.maxHp);
    // They bring their own gun.
    expect(sub.loadout.primary).toBe(game.reserve[0]!.loadout.primary);
    expect(h.tookPart).toContain('recruit-7');
    expect(h.swapsLeft).toBe(MID_SWAP.max - 1);
    expect(h.swaps).toHaveLength(1);
    expect(h.swaps![0]).toMatchObject({ inId: 'recruit-7', outId: 'recruit-2' });
    expect(h.swaps![0]!.hp / h.swaps![0]!.maxHp).toBeCloseTo(MID_SWAP.below - 0.01);
    // Pulled back, not downed.
    expect(h.injured).toEqual([]);
  });

  it('the newcomer runs in from behind the line; the hurt one limps back and is gone', () => {
    const h0 = startSquadHorde(game, 1, NOW);
    const post = h0.posts[slotOf(h0, 'recruit-2')]!;
    let h = tick(hurt(h0, 'recruit-2', 0.1), STEP);
    const sub = h.defenders.find((d) => d.id === 'recruit-7')!;
    expect(sub.walking).toBe(true);
    expect(sub.running).toBe(true);
    expect(sub.x).toBeLessThan(post.x - MID_SWAP.from / 2);
    expect(sub.y).toBe(post.y);
    // The hurt one is still on screen, backing off, with the HP they had.
    const out = h.leaving!.find((d) => d.id === 'recruit-2')!;
    expect(out.hp / out.maxHp).toBeCloseTo(0.1);
    // At MID_SWAP.run× the walk the newcomer is in the slot within a second.
    h = tick(h, 1);
    const there = h.defenders.find((d) => d.id === 'recruit-7')!;
    expect([there.x, there.y, there.walking, there.running]).toEqual([
      post.x,
      post.y,
      false,
      undefined,
    ]);
    const back = h.leaving!.find((d) => d.id === 'recruit-2')!;
    expect(post.x - back.x).toBeCloseTo(WALK_SPEED * MID_SWAP.limp, 0);
    // Limping, gone once MID_SWAP.away behind the slot (well out of the frame).
    h = tick(h, 3.5);
    expect(h.leaving).toEqual([]);
  });

  it('the newcomer shouts as they run in, even with chatter on Low', () => {
    const h0 = startSquadHorde(game, 1, NOW);
    const h1 = tick(hurt(structuredClone(h0), 'recruit-2', 0.1), STEP);
    const c = chatter(chatter(newChat(), null, h0, 0, 'low'), h0, h1, STEP, 'low');
    const b = c.bubbles.find((x) => x.by === 'recruit-7')!;
    expect(b.event).toBe('swapIn');
    expect(CHAT_LINES[personalityOf('recruit-7')].swapIn).toContain(b.line);
  });

  it('at the threshold or above, nobody swaps', () => {
    const h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', MID_SWAP.below), STEP);
    expect(h.swaps).toEqual([]);
    expect(h.defenders.some((d) => d.id === 'recruit-2')).toBe(true);
  });

  it('a survivor already at 0 HP is downed, not swapped', () => {
    const h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0), STEP);
    expect(h.swaps).toEqual([]);
    expect(h.injured.map((i) => i.defender.id)).toEqual(['recruit-2']);
  });

  it('caps at MID_SWAP.max a fight: the fourth fights on and falls at 0 HP', () => {
    let h = startSquadHorde(game, 1, NOW);
    for (const id of ['recruit-1', 'recruit-2', 'recruit-3', 'recruit-4']) hurt(h, id, 0.1);
    h = tick(h, STEP);
    expect(h.swaps!.map((x) => x.outId)).toEqual(['recruit-1', 'recruit-2', 'recruit-3']);
    expect(h.swaps!.map((x) => x.inId)).toEqual(['recruit-7', 'recruit-8', 'recruit-9']);
    expect(h.swapsLeft).toBe(0);
    expect(h.defenders.some((d) => d.id === 'recruit-4')).toBe(true);
    // recruit-10 is fit on the bench, but only MID_SWAP.max ever come in.
    expect(h.subs).toEqual([]);
    h = tick(hurt(h, 'recruit-4', 0), STEP);
    expect(h.injured.map((i) => i.defender.id)).toEqual(['recruit-4']);
    expect(h.swaps).toHaveLength(MID_SWAP.max);
  });

  it('with an empty bench, the hurt survivor fights on (the old rule)', () => {
    const h = tick(hurt(startSquadHorde(campGame(people(6)), 1, NOW), 'recruit-2', 0.1), STEP);
    expect(h.swaps).toEqual([]);
    expect(h.defenders.some((d) => d.id === 'recruit-2')).toBe(true);
  });

  it('takes the highest-level bench survivor first', () => {
    const bench = [person(7), person(8, { xp: xpForLevel(4) }), person(9, { xp: xpForLevel(2) })];
    let h = startSquadHorde(campGame(people(6), bench), 1, NOW);
    h = tick(hurt(h, 'recruit-5', 0.1), STEP);
    expect(h.swaps!.map((x) => x.inId)).toEqual(['recruit-8']);
    h = tick(hurt(h, 'recruit-3', 0.1), STEP);
    expect(h.swaps!.map((x) => x.inId)).toEqual(['recruit-8', 'recruit-9']);
  });

  it('is deterministic: the same seed gives the same swaps', () => {
    // A late horde with one survivor already hurt, so at least one swap whatever the balance.
    const late = campGame(people(6), people(4, 7), 25);
    const run = (): HordeState => {
      const h = hurt(startSquadHorde(late, 7, NOW), 'recruit-2', 0.1);
      for (let t = 0; t < 120 && h.outcome === 'fighting'; t++) tickInPlace(h, 1);
      return h;
    };
    const a = run();
    expect(a.swaps!.length).toBeGreaterThan(0);
    expect(run().swaps).toEqual(a.swaps);
  });

  it('chains: a newcomer can be swapped out in turn, and never comes back', () => {
    let h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0.1), STEP);
    h = tick(hurt(h, 'recruit-7', 0.1), STEP);
    expect(h.swaps!.map((x) => [x.outId, x.inId])).toEqual([
      ['recruit-2', 'recruit-7'],
      ['recruit-7', 'recruit-8'],
    ]);
    expect(h.defenders.find((d) => d.id === 'recruit-8')!.postId).toBe(slotOf(h, 'recruit-8'));
    expect(h.defenders.some((d) => ['recruit-2', 'recruit-7'].includes(d.id))).toBe(false);
  });

  it('a Chef swapping in feeds the line, and a Chef pulling back takes the extra away', () => {
    const chefIn = campGame(people(6), [person(7, { job: 'chef', xp: xpForLevel(5) })]);
    const h0 = startSquadHorde(chefIn, 1, NOW);
    const before = h0.defenders.find((d) => d.id === 'recruit-1')!.maxHp;
    const h = tick(tick(hurt(h0, 'recruit-2', 0.1), STEP), STEP);
    expect(h.defenders.find((d) => d.id === 'recruit-1')!.maxHp).toBeGreaterThan(before);
    const chefOut = campGame(
      [person(1, { job: 'chef', xp: xpForLevel(5) }), ...people(5, 2)],
      people(1, 7),
    );
    const c0 = startSquadHorde(chefOut, 1, NOW);
    const fed = c0.defenders.find((d) => d.id === 'recruit-2')!.maxHp;
    const c = tick(tick(hurt(c0, 'recruit-1', 0.1), STEP), STEP);
    expect(c.defenders.find((d) => d.id === 'recruit-2')!.maxHp).toBeLessThan(fed);
  });

  it('when the fight ends, nobody is left limping on screen', () => {
    const h = hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0.1);
    const s = tick(h, STEP);
    expect(s.leaving).toHaveLength(1);
    s.enemies = [];
    s.toSpawn = 0;
    s.wave = s.waveCount;
    s.bosses = [];
    const done = tick(s, 1);
    expect(done.outcome).toBe('won');
    expect(done.leaving).toEqual([]);
  });
});

describe('after a fight with swaps (ID-148)', () => {
  const game = campGame(people(6), people(2, 7));

  /** Horde 3 where recruit-2 pulled back at 10% and recruit-7 came in, ended as `outcome`. */
  function swapped(outcome: 'won' | 'lost'): HordeState {
    const h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0.1), STEP);
    h.outcome = outcome;
    return h;
  }

  it('on a win, the one who pulled back is still standing: no rest, full HP next horde (ID-155)', () => {
    const h = swapped('won');
    const r = squadResult(game, h);
    expect(r.rests.some((x) => x.id === 'recruit-2')).toBe(false);
    const next = finishSquadHorde(game, h);
    const two = campOf(next).find((d) => d.id === 'recruit-2')!;
    expect([two.rest, two.startHp]).toEqual([undefined, undefined]);
  });

  it('the bench survivor who came in gets horde XP and their level-up line', () => {
    const h = swapped('won');
    const r = squadResult(game, h);
    const gain = r.gains.find((g) => g.id === 'recruit-7');
    expect(gain?.xp).toBeGreaterThan(0);
    const next = finishSquadHorde(game, h);
    expect(campOf(next).find((d) => d.id === 'recruit-7')!.xp).toBe(gain!.xp);
    // The bench survivor who never came in is no fighter: only the bench share (ID-206).
    expect(r.gains.some((g) => g.id === 'recruit-8')).toBe(false);
    const share = r.bench.find((g) => g.id === 'recruit-8');
    expect(share!.xp).toBe(Math.floor(gain!.xp * BENCH_XP_SHARE));
    expect(campOf(next).find((d) => d.id === 'recruit-8')!.xp).toBe(share!.xp);
  });

  it('levels a bench survivor from their own XP', () => {
    const vet = campGame(people(6), [person(7, { xp: xpForLevel(5) })]);
    const h = tick(hurt(startSquadHorde(vet, 1, NOW), 'recruit-2', 0.1), STEP);
    h.outcome = 'won';
    expect(
      squadResult(vet, h).gains.find((g) => g.id === 'recruit-7')!.level,
    ).toBeGreaterThanOrEqual(5);
  });

  it('a newcomer who ends downed rests like anyone who fought; hurt, they do not (ID-155)', () => {
    const hurtIn = swapped('won');
    hurtIn.defenders.find((d) => d.id === 'recruit-7')!.hp *= 0.2;
    expect(squadResult(game, hurtIn).rests.some((x) => x.id === 'recruit-7')).toBe(false);
    const downIn = swapped('won');
    const i = downIn.defenders.findIndex((d) => d.id === 'recruit-7');
    const [d] = downIn.defenders.splice(i, 1);
    downIn.injured.push({ defender: d!, postId: d!.postId, at: 1, offered: false, by: null });
    // Downed rests 1 (no Paramedic in this camp to patch them up).
    expect(squadResult(game, downIn).rests.find((x) => x.id === 'recruit-7')?.rest).toBe(1);
  });

  it('a chain pays everyone who fought; neither who pulled back rests (ID-155)', () => {
    let h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0.1), STEP);
    h = tick(hurt(h, 'recruit-7', 0.15), STEP);
    h.outcome = 'won';
    const r = squadResult(game, h);
    for (const id of ['recruit-2', 'recruit-7', 'recruit-8'])
      expect(r.gains.find((g) => g.id === id)?.xp, id).toBeGreaterThan(0);
    expect(r.rests).toEqual([]);
  });

  it('a loss rests nobody, the one who pulled back included', () => {
    const r = squadResult(game, swapped('lost'));
    expect(r.rests).toEqual([]);
  });
});

describe('a patched-up survivor (ID-155)', () => {
  it('swapping in mid-fight, comes in at their reduced HP, not full', () => {
    const game = campGame(people(6), [person(7, { startHp: 0.5 })]);
    const h = tick(hurt(startSquadHorde(game, 1, NOW), 'recruit-2', 0.1), STEP);
    const sub = h.defenders.find((d) => d.id === 'recruit-7')!;
    expect(sub.hp).toBeGreaterThan(0);
    expect(sub.hp).toBeLessThanOrEqual(Math.round(sub.maxHp * 0.5));
    // Above the swap line, so they are not pulled straight back.
    expect(sub.hp).toBeGreaterThan(sub.maxHp * MID_SWAP.below);
    expect(Object.hasOwn(sub, 'startHp')).toBe(false);
  });

  it('sitting the next horde out on the bench, is at full HP after it', () => {
    const game = campGame(people(6), [person(7, { startHp: 0.5 })]);
    const h = startSquadHorde(game, 1, NOW);
    h.outcome = 'won';
    const next = finishSquadHorde(game, h);
    expect(campOf(next).find((d) => d.id === 'recruit-7')!.startHp).toBeUndefined();
  });
});
