import { describe, expect, it } from 'vitest';
import { BANK_CAP, BATTERIES, GAS_PER_WIN, GENERATOR, MAX_COUNT, START_POWER } from './data.ts';
import { finishHorde, newGame, startHorde, type GameState } from './game.ts';
import { buildGenerator, loadBatteries, nextGasAt, runGenerator, type Power } from './power.ts';

const T = 1_800_000_000_000;
const G = GENERATOR.gasMs;
const NONE = { makeshift: 0, standard: 0, 'high-capacity': 0, military: 0 };

/** A new game with `power` changed by `p`. */
function withPower(p: Partial<Power>): GameState {
  const g = newGame();
  return { ...g, power: { ...g.power, ...p } };
}

/** `game`'s horde started at `start` and ended `outcome` at `end`, with `energy` left. */
function fought(
  game: GameState,
  start: number,
  end: number,
  outcome: 'won' | 'lost',
  energy = game.power.bank,
): GameState {
  const h = startHorde(game, 1, game.roster[0]!.id, 0, start);
  h.energy = energy;
  h.outcome = outcome;
  return finishHorde(game, h, end);
}

describe('battery bank (ID-015)', () => {
  it('a new game loads its starting batteries into the bank and keeps its Gas', () => {
    const { power } = newGame();
    expect(power).toEqual({
      bank: 2 * BATTERIES.makeshift.charge,
      gas: START_POWER.gas,
      batteries: NONE,
      generator: null,
    });
  });

  it('loads whole batteries largest first while each fits under the cap', () => {
    const g = withPower({
      bank: 900,
      batteries: { makeshift: 3, standard: 1, 'high-capacity': 1, military: 1 },
    });
    // Military (250) and High-capacity (160) would overflow; the Standard fills it exactly.
    expect(loadBatteries(g).power).toMatchObject({
      bank: BANK_CAP,
      batteries: { makeshift: 3, standard: 0, 'high-capacity': 1, military: 1 },
    });
    const empty = withPower({ bank: 0, batteries: { ...NONE, military: 5 } });
    expect(loadBatteries(empty).power).toMatchObject({
      bank: BANK_CAP,
      batteries: { ...NONE, military: 1 },
    });
    // Smaller ones fill the gap the large ones leave: 10 + 3 × 250 leaves room for 4 × 60.
    const mixed = withPower({ bank: 10, batteries: { ...NONE, makeshift: 9, military: 3 } });
    expect(loadBatteries(mixed).power).toMatchObject({
      bank: 10 + 3 * 250 + 4 * 60,
      batteries: { ...NONE, makeshift: 5, military: 0 },
    });
  });

  it('loading with nothing to load or no room returns the same game', () => {
    const none = withPower({ bank: 0, batteries: NONE });
    expect(loadBatteries(none)).toBe(none);
    const full = withPower({ bank: BANK_CAP - 59, batteries: { ...NONE, makeshift: 4 } });
    expect(loadBatteries(full)).toBe(full);
  });

  it('carries the bank from one horde to the next', () => {
    const g = withPower({ bank: 700 });
    const h = startHorde(g, 1, g.roster[0]!.id, 0, T);
    expect(h.energy).toBe(700);
    const after = fought(g, T, T + 60_000, 'lost', 212.5);
    expect(after.power.bank).toBe(212.5);
    expect(startHorde(after, 2, after.roster[1]!.id, 0, T + 60_000).energy).toBe(212.5);
  });

  it('loads batteries after a horde, and keeps the bank between 0 and the cap', () => {
    const g = withPower({ bank: 500, batteries: { ...NONE, standard: 3 } });
    expect(fought(g, T, T + 1, 'lost', 100).power).toMatchObject({
      bank: 400,
      batteries: NONE,
    });
    expect(fought(g, T, T + 1, 'lost', -5).power.bank).toBe(300);
    expect(fought(g, T, T + 1, 'lost', BANK_CAP + 50).power.bank).toBe(BANK_CAP);
  });

  it('pays Gas for a won horde, none for a lost one', () => {
    const g = withPower({ gas: 2 });
    expect(fought(g, T, T + 1, 'won').power.gas).toBe(2 + GAS_PER_WIN);
    expect(fought(g, T, T + 1, 'lost').power.gas).toBe(2);
    expect(fought(withPower({ gas: MAX_COUNT }), T, T + 1, 'won').power.gas).toBe(MAX_COUNT);
  });
});

describe('generator (ID-015)', () => {
  it('builds once for its cost, idle until the next run starts its clock', () => {
    const g = withPower({ bank: 0, gas: 3 });
    const r = buildGenerator(g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.power.generator).toEqual({ at: null });
    expect(r.game.stock.scrap).toBe(g.stock.scrap - GENERATOR.cost.scrap);
    expect(r.game.stock.wood).toBe(g.stock.wood - GENERATOR.cost.wood);
    expect(buildGenerator(r.game)).toEqual({
      ok: false,
      reason: 'The generator is already built',
    });
    expect(buildGenerator({ ...g, stock: { ...g.stock, scrap: 39 } })).toEqual({
      ok: false,
      reason: 'Not enough scrap',
      short: true,
    });
    // Worked out long before the click (the panel's dry run): no time before the build counts.
    const clicked = T + 30 * G;
    const started = runGenerator(r.game, clicked);
    expect(started.power).toMatchObject({ bank: 0, gas: 3, generator: { at: clicked } });
    expect(runGenerator(started, clicked + G).power).toMatchObject({ bank: 50, gas: 2 });
    const dry = buildGenerator(withPower({ gas: 0 }));
    expect(dry.ok && runGenerator(dry.game, T).power.generator).toEqual({ at: null });
  });

  it('does nothing until it is built', () => {
    const g = withPower({ bank: 0, gas: 5 });
    expect(runGenerator(g, T + 100 * G)).toBe(g);
  });

  it('burns 1 Gas per gasMs for gasCharge, also while closed, and keeps partial progress', () => {
    const g = withPower({ bank: 0, gas: 4, generator: { at: T } });
    const a = runGenerator(g, T + 2.5 * G);
    expect(a.power).toMatchObject({
      bank: 2 * GENERATOR.gasCharge,
      gas: 2,
      generator: { at: T + 2 * G },
    });
    expect(nextGasAt(a.power)).toBe(T + 3 * G);
    expect(runGenerator(a, T + 2.9 * G)).toBe(a); // no Gas done yet: nothing changes
    const b = runGenerator(a, T + 3 * G);
    expect(b.power).toMatchObject({
      bank: 3 * GENERATOR.gasCharge,
      gas: 1,
      generator: { at: T + 3 * G },
    });
  });

  it('stops at the cap and when the Gas runs out; idle time earns nothing', () => {
    const near = withPower({ bank: BANK_CAP - 20, gas: 5, generator: { at: T } });
    const full = runGenerator(near, T + 50 * G);
    expect(full.power).toMatchObject({ bank: BANK_CAP, gas: 4, generator: { at: null } });
    expect(nextGasAt(full.power)).toBeNull();
    expect(runGenerator(full, T + 500 * G)).toBe(full);

    const last = withPower({ bank: 0, gas: 1, generator: { at: T } });
    const dry = runGenerator(last, T + 50 * G);
    expect(dry.power).toMatchObject({ bank: GENERATOR.gasCharge, gas: 0, generator: { at: null } });
    expect(runGenerator(dry, T + 500 * G)).toBe(dry);
  });

  it('starts its clock when room comes back, not from when it went idle', () => {
    const full = withPower({ bank: BANK_CAP, gas: 5, generator: { at: null } });
    // A week idle at the cap, then a fight draws the bank down.
    const end = T + 1000 * G;
    const after = fought(full, end - 60_000, end, 'lost', 500);
    expect(after.power).toMatchObject({ bank: 500, gas: 5, generator: { at: end } });
    expect(runGenerator(after, end + G - 1)).toBe(after);
    expect(runGenerator(after, end + G).power.bank).toBe(500 + GENERATOR.gasCharge);
  });

  it('never runs during a fight: its clock skips the fight, progress before it carries over', () => {
    const g = withPower({ bank: 0, gas: 5, generator: { at: T } });
    const start = T + 0.5 * G;
    const end = start + 3 * G;
    const after = fought(g, start, end, 'won', 0);
    // Only the half Gas before the fight counts.
    expect(after.power).toMatchObject({
      bank: 0,
      gas: 5 + GAS_PER_WIN,
      generator: { at: end - 0.5 * G },
    });
    expect(runGenerator(after, end + 0.5 * G).power).toMatchObject({
      bank: GENERATOR.gasCharge,
      gas: 5,
    });
  });

  it('a clock set back makes no progress and never throws', () => {
    const g = withPower({ bank: 0, gas: 5, generator: { at: T } });
    const back = runGenerator(g, T - 5 * G);
    expect(back.power).toMatchObject({ bank: 0, gas: 5, generator: { at: T - 5 * G } });
    expect(runGenerator(back, T - 5 * G)).toBe(back);
    // A fight that "ends" before it started: no skip, the clock is cut to the end.
    const odd = fought(g, T + 2 * G, T - G, 'lost', 0);
    expect(odd.power).toMatchObject({ bank: 0, gas: 5, generator: { at: T - G } });
    expect(() => runGenerator(g, Number.NaN)).toThrow(RangeError);
    expect(() => runGenerator(g, Infinity)).toThrow(RangeError);
  });

  it('a huge Gas stock or a long absence fills the bank in one step', () => {
    const g = withPower({ bank: 0, gas: 1e12, generator: { at: 0 } });
    const t0 = performance.now();
    const r = runGenerator(g, T);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.power).toMatchObject({
      bank: BANK_CAP,
      gas: 1e12 - BANK_CAP / GENERATOR.gasCharge,
      generator: { at: null },
    });
  });
});
