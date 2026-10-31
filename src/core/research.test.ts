// Design §11, as built ID-014 and ID-035: the Research Lab is levelled with materials;
// its nodes and perk levels are paid in Mutated Genes and run in a real-time queue.
import { describe, expect, it } from 'vitest';
import { buildSegment } from './base.ts';
import { buildCar, carLimit } from './camp.ts';
import { chooseCard, eligible, rerollLock, rerollOffer, rerollsThisWave } from './cards.ts';
import {
  BANK_CAP,
  BOSS_PERK_GENES,
  CAR,
  HORROR,
  LAB_LEVELS,
  MUTANTS,
  PATROL,
  PERK,
  PERK_IDS,
  PERK_LEVEL,
  RESEARCH,
  RESEARCH_IDS,
  RESEARCH_QUEUE,
  TRAPS,
  type ResearchId,
  stockOf,
} from './data.ts';
import { finishHorde, hordeBossReward, hordeGenes, newGame, type GameState } from './game.ts';
import { waveCount, waveMix, waveSize } from './waves.ts';
import { newHorde, perkFactor, trapStats, type HordeState } from './horde.ts';
import { bankCap, loadBatteries } from './power.ts';
import {
  advanceResearch,
  entryOf,
  labCost,
  queueLock,
  queueResearch,
  researched,
  researchLeft,
  unqueue,
  unqueueLock,
  upgradeLab,
  type QueueId,
} from './research.ts';
import { researchNow, setup } from './testing.ts';

const MIN = 60_000;
const T = 1_700_000_000_000;

function ok(r: ReturnType<typeof upgradeLab>): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** A game with the Lab at `lab` and `genes` Genes. */
function lab(level: number, genes = 10_000): GameState {
  return {
    ...newGame(),
    lab: level,
    stock: stockOf({ scrap: 999, wood: 999, genes }),
  };
}

const queue = (g: GameState, id: QueueId, now = T): GameState => ok(queueResearch(g, id, now));

describe('Research Lab', () => {
  it('a new game has no Lab, nothing researched or queued, and Wood only', () => {
    const g = newGame();
    expect(g.lab).toBe(0);
    expect(g.research).toEqual([]);
    expect(g.queue).toEqual({ ids: [], endsAt: null });
    expect(g.tiers).toEqual(['wood']);
  });

  it('builds and upgrades for materials, up to the top level', () => {
    let g = { ...newGame(), stock: stockOf({ scrap: 999, wood: 999 }) };
    g = ok(upgradeLab(g));
    expect(g.lab).toBe(1);
    expect(g.stock).toMatchObject({ scrap: 999 - 20, wood: 999 - 30 });
    g = ok(upgradeLab(g));
    expect(g.stock).toMatchObject({ scrap: 999 - 80, wood: 999 - 110 });
    expect(labCost(g)).toBeNull();
    expect(upgradeLab(g)).toEqual({ ok: false, reason: 'The Lab is at the top level' });
    expect(LAB_LEVELS).toHaveLength(2);
  });
});

describe('the tree (AC1, AC3)', () => {
  it('every node costs Genes only, takes 10 minutes to 2 hours, and needs a reachable Lab and an existing node', () => {
    for (const node of Object.values(RESEARCH)) {
      expect(Object.keys(node)).not.toContain('cost');
      expect(node.genes).toBeGreaterThan(0);
      expect(node.minutes).toBeGreaterThanOrEqual(10);
      expect(node.minutes).toBeLessThanOrEqual(120);
      expect(node.lab).toBeGreaterThanOrEqual(1);
      expect(node.lab).toBeLessThanOrEqual(LAB_LEVELS.length);
      if (node.needs) expect(Object.hasOwn(RESEARCH, node.needs)).toBe(true);
    }
    for (const m of PERK_LEVEL.minutes) {
      expect(m).toBeGreaterThanOrEqual(10);
      expect(m).toBeLessThanOrEqual(120);
    }
  });

  it('has the new nodes: battery tiers, trap upgrades, chemical traps, cards and more cars', () => {
    for (const id of [
      'high-capacity-batteries',
      'military-batteries',
      'sharpened-spikes',
      'razor-wire',
      'glue-traps',
      'incendiary-traps',
      'corrosive-traps',
      'paralyzing-traps',
      'hollow-points',
      'field-repairs',
      'more-cars',
    ]) {
      expect(RESEARCH_IDS).toContain(id);
    }
    // Out of v1 (AC6): no larger base area or new map locations.
    expect(RESEARCH_IDS.some((id) => /area|location|map/.test(id))).toBe(false);
  });

  it('pays in Genes, never materials', () => {
    const g = queue(lab(1, 50), 'metal-walls');
    expect(g.stock).toMatchObject({ genes: 40, scrap: 999, wood: 999 });
    expect(queueResearch(lab(1, 9), 'metal-walls', T)).toEqual({
      ok: false,
      reason: 'Not enough genes',
      short: true,
    });
  });

  it('throws on a node that does not exist, including inherited names', () => {
    for (const id of ['death-ray', '__proto__', 'constructor', 'toString', 'level-__proto__']) {
      expect(() => queueResearch(lab(2), id as ResearchId, T)).toThrow(RangeError);
    }
  });
});

describe('the queue (AC2)', () => {
  it('runs one node at a time, in order, from when it was queued', () => {
    let g = queue(lab(1), 'metal-walls');
    expect(g.queue).toEqual({ ids: ['metal-walls'], endsAt: T + 15 * MIN });
    g = queue(g, 'flashbang', T + MIN);
    expect(g.queue.endsAt).toBe(T + 15 * MIN); // waiting entries don't move the end
    expect(researchLeft(g.queue, T + 5 * MIN)).toBe(10 * MIN);
    expect(advanceResearch(g, T + 15 * MIN - 1)).toBe(g);
    const a = advanceResearch(g, T + 15 * MIN);
    expect(a.research).toEqual(['metal-walls']);
    expect(a.tiers).toEqual(['wood', 'metal']);
    expect(a.queue).toEqual({ ids: ['flashbang'], endsAt: T + 30 * MIN });
    expect(g.research).toEqual([]); // pure
  });

  it('catches up while the game is closed: each next one starts when the last ended', () => {
    let g = lab(1);
    for (const id of ['metal-walls', 'flashbang', 'molotov', 'fortify'] as const) g = queue(g, id);
    const later = advanceResearch(g, T + 45 * MIN);
    expect(later.research).toEqual(['metal-walls', 'flashbang']);
    expect(later.queue).toEqual({ ids: ['molotov', 'fortify'], endsAt: T + 60 * MIN });
    const done = advanceResearch(g, T + 10 * 60 * MIN);
    expect(done.research).toEqual(['metal-walls', 'flashbang', 'molotov', 'fortify']);
    expect(done.perkLevels.fortify).toBe(1);
    expect(done.queue).toEqual({ ids: [], endsAt: null });
  });

  it('holds the running node and 3 more', () => {
    let g = lab(1);
    for (const id of ['metal-walls', 'flashbang', 'molotov', 'fortify'] as const) g = queue(g, id);
    expect(g.queue.ids).toHaveLength(RESEARCH_QUEUE.size);
    expect(queueResearch(g, 'rally-call', T)).toEqual({
      ok: false,
      reason: 'The research queue is full',
    });
  });

  it('removing a waiting node refunds it in full and leaves the running one alone', () => {
    let g = queue(queue(lab(1, 100), 'metal-walls'), 'flashbang');
    expect(g.stock.genes).toBe(80);
    g = ok(unqueue(g, 'flashbang', T + 5 * MIN));
    expect(g.stock.genes).toBe(90);
    expect(g.queue).toEqual({ ids: ['metal-walls'], endsAt: T + 15 * MIN });
  });

  it('cancelling the running node refunds it, and the next starts now', () => {
    let g = queue(queue(lab(1, 100), 'metal-walls'), 'flashbang');
    g = ok(unqueue(g, 'metal-walls', T + 5 * MIN));
    expect(g.stock.genes).toBe(90);
    expect(g.queue).toEqual({ ids: ['flashbang'], endsAt: T + 20 * MIN });
    g = ok(unqueue(g, 'flashbang', T + 6 * MIN));
    expect(g.stock.genes).toBe(100);
    expect(g.queue).toEqual({ ids: [], endsAt: null });
  });

  it('runs the queue to now first: a finished entry is done, not refunded, and makes room', () => {
    let g = lab(1, 100);
    for (const id of ['metal-walls', 'flashbang', 'molotov', 'fortify'] as const) g = queue(g, id);
    // Metal walls ended at T + 15 min, but nothing has run the queue yet.
    expect(unqueue(g, 'metal-walls', T + 20 * MIN)).toEqual({
      ok: false,
      reason: 'Not in the queue',
    });
    const more = queue(g, 'rally-call', T + 20 * MIN);
    expect(more.research).toEqual(['metal-walls']);
    expect(more.queue.ids).toEqual(['flashbang', 'molotov', 'fortify', 'rally-call']);
  });

  it('needs its earlier node done or ahead in the queue, and that one then stays', () => {
    const g = lab(1);
    expect(queueLock(g, 'molotov')).toBe('Needs Flashbang');
    const q = queue(g, 'flashbang');
    expect(queueLock(q, 'molotov')).toBeNull();
    const both = queue(q, 'molotov');
    expect(unqueueLock(both, 'flashbang')).toBe('Molotov needs it');
    expect(unqueue(both, 'flashbang', T)).toEqual({ ok: false, reason: 'Molotov needs it' });
    expect(unqueueLock(both, 'molotov')).toBeNull();
  });

  it('refuses a node twice, one done, or one above the Lab', () => {
    const q = queue(lab(1), 'metal-walls');
    expect(queueLock(q, 'metal-walls')).toBe('Already queued');
    expect(queueLock(advanceResearch(q, T + 99 * MIN), 'metal-walls')).toBe('Already researched');
    expect(queueLock(lab(0), 'metal-walls')).toBe('Needs a Research Lab');
    expect(queueLock(lab(1), 'second-look')).toBe('Needs Lab level 2');
  });

  it('a Metal walls tier from the queue lets Metal be built', () => {
    const g = advanceResearch(queue(lab(1), 'metal-walls'), T + 15 * MIN);
    expect(researched(g, 'metal-walls')).toBe(true);
    const built = buildSegment(g.base, { ...g.stock, metal: 10 }, g.tiers, 1, 0, 'wall', 'metal');
    expect(built.ok).toBe(true);
  });

  it('refuses a time that is not a number', () => {
    expect(() => queueResearch(lab(1), 'metal-walls', NaN)).toThrow(RangeError);
    expect(() => advanceResearch(lab(1), Infinity)).toThrow(RangeError);
  });
});

describe('perk levels (AC4)', () => {
  it('an owned perk goes up to level 3 through the queue, each level costing its Genes', () => {
    let g = queue(lab(1, 1000), 'level-steady-fire');
    expect(g.stock.genes).toBe(1000 - PERK_LEVEL.genes[0]);
    expect(g.queue.endsAt).toBe(T + PERK_LEVEL.minutes[0] * MIN);
    expect(queueLock(g, 'level-steady-fire')).toBe('Already queued');
    g = advanceResearch(g, T + 999 * MIN);
    expect(g.perkLevels['steady-fire']).toBe(2);
    g = queue(g, 'level-steady-fire');
    expect(entryOf(g, 'level-steady-fire').name).toBe('Steady Fire level 3');
    expect(g.stock.genes).toBe(1000 - PERK_LEVEL.genes[0] - PERK_LEVEL.genes[1]);
    g = advanceResearch(g, T + 9999 * MIN);
    expect(g.perkLevels['steady-fire']).toBe(3);
    expect(queueLock(g, 'level-steady-fire')).toBe('Steady Fire is at the top level');
  });

  it('a perk not owned can be levelled only behind its own node', () => {
    const g = lab(1);
    expect(queueLock(g, 'level-fortify')).toBe('Needs Fortify');
    const q = queue(queue(g, 'fortify'), 'level-fortify');
    expect(entryOf(q, 'level-fortify').genes).toBe(PERK_LEVEL.genes[0]);
    expect(unqueueLock(q, 'fortify')).toBe('Fortify level 2 needs it');
    const done = advanceResearch(q, T + 999 * MIN);
    expect(done.perkLevels.fortify).toBe(2);
  });

  it('removing a perk level refunds what it cost', () => {
    const g = queue(lab(1, 500), 'level-steady-fire');
    expect(ok(unqueue(g, 'level-steady-fire', T)).stock.genes).toBe(500);
  });

  it('each level adds half the perk’s level-1 bonus', () => {
    const at = (level: number): number =>
      perkFactor(
        { perks: ['steady-fire'], perkLevels: { 'steady-fire': level } },
        'steady-fire',
        PERK.steadyFire,
      );
    expect(at(1)).toBeCloseTo(1.15, 9);
    expect(at(2)).toBeCloseTo(1.225, 9);
    expect(at(3)).toBeCloseTo(1.3, 9);
    // Power Saver's saving grows the same way: 25%, 37.5%, 50% less.
    const saver = (level: number): number =>
      perkFactor(
        { perks: ['power-saver'], perkLevels: { 'power-saver': level } },
        'power-saver',
        PERK.powerSaver,
      );
    expect([saver(1), saver(2), saver(3)]).toEqual([0.75, 0.625, 0.5]);
    expect(perkFactor({ perks: [], perkLevels: {} }, 'fortify', PERK.fortify)).toBe(1);
  });

  it('a horde gets each equipped perk at its level; Fortify’s HP grows with it', () => {
    const base = newHorde(1, { ...setup(), perks: ['fortify'] });
    const lvl3 = newHorde(1, { ...setup(), perks: ['fortify'], perkLevels: { fortify: 3 } });
    const seg = (s: HordeState) => s.layers[0]!.segments.find((x) => x.maxHp > 0)!;
    expect(lvl3.perkLevels).toEqual({ fortify: 3 });
    expect(seg(lvl3).maxHp / seg(base).maxHp).toBeCloseTo(1.6 / 1.3, 9);
  });

  it('Second Look gives 1 reroll a wave at level 1, 1.5 at level 2 (2 every other wave), 2 at level 3', () => {
    const waves = (level: number) =>
      [1, 2, 3, 4].map((wave) =>
        rerollsThisWave({ perks: ['second-look'], perkLevels: { 'second-look': level }, wave }),
      );
    expect(waves(1)).toEqual([1, 1, 1, 1]);
    expect(waves(2)).toEqual([1, 2, 1, 2]);
    expect(waves(3)).toEqual([2, 2, 2, 2]);
  });

  it('at level 3, Second Look rerolls an offer twice in a wave, then refuses', () => {
    let s = newHorde(3, {
      ...setup(),
      perks: ['second-look'],
      perkLevels: { 'second-look': 3 },
    });
    s.offer = [
      { kind: 'upgrade', id: 'sharpshooter' },
      { kind: 'upgrade', id: 'rapid-fire' },
      { kind: 'upgrade', id: 'long-sight' },
    ];
    s = rerollOffer(rerollOffer(s));
    expect(s.rerolls).toBe(2);
    expect(rerollLock(s)).toBe('Already rerolled this wave');
  });
});

describe('new nodes in play (AC3)', () => {
  it('battery tiers raise the bank cap, and batteries fill the room', () => {
    const g = researchNow(lab(2), 'metal-walls');
    let x = ok(g);
    x = ok(researchNow(x, 'auto-turret'));
    expect(bankCap(x)).toBe(BANK_CAP);
    x = ok(researchNow(x, 'high-capacity-batteries'));
    expect(bankCap(x)).toBe(BANK_CAP + 500);
    x = ok(researchNow(x, 'military-batteries'));
    expect(bankCap(x)).toBe(BANK_CAP + 1000);
    const full = loadBatteries({
      ...x,
      power: { ...x.power, bank: BANK_CAP, batteries: { ...x.power.batteries, standard: 3 } },
    });
    expect(full.power.bank).toBe(BANK_CAP + 300);
  });

  it('Sharpened spikes and Razor wire upgrade the basic traps in a fight', () => {
    expect(trapStats({ research: [] }, 'spikes')).toEqual({
      damage: TRAPS.spikes.damage,
      slow: TRAPS.spikes.slow,
    });
    expect(trapStats({ research: ['sharpened-spikes'] }, 'spikes').damage).toBe(12);
    expect(trapStats({ research: ['razor-wire'] }, 'wire').slow).toBe(0.35);
    expect(trapStats({ research: ['razor-wire'] }, 'spikes')).toEqual({ damage: 8, slow: 1 });
  });

  it('research cards join the offer pool only once researched, and work', () => {
    const plain = newHorde(1, setup());
    expect(eligible(plain, 'hollow-points')).toBe(false);
    expect(eligible(plain, 'field-repairs')).toBe(false);
    const s = newHorde(1, { ...setup(), research: ['hollow-points', 'field-repairs'] });
    expect(eligible(s, 'hollow-points')).toBe(true);
    s.offer = [
      { kind: 'upgrade', id: 'hollow-points' },
      { kind: 'upgrade', id: 'field-repairs' },
      { kind: 'upgrade', id: 'sharpshooter' },
    ];
    expect(chooseCard(s, 0).mods.damage).toBeCloseTo(1.4, 9);
    const hurt = structuredClone(s);
    for (const seg of hurt.layers.flatMap((l) => l.segments)) seg.hp = seg.maxHp / 4;
    const fixed = chooseCard(hurt, 1);
    for (const seg of fixed.layers.flatMap((l) => l.segments)) expect(seg.hp).toBe(seg.maxHp);
  });

  it('More cars lets the camp build a second car', () => {
    const rich = { ...lab(2), stock: stockOf({ metal: 999, parts: 999, scrap: 999, genes: 999 }) };
    const one = ok(buildCar(rich));
    expect(buildCar(one)).toEqual({ ok: false, reason: 'More cars come with research' });
    const more = ok(researchNow(one, 'more-cars'));
    expect(carLimit(more)).toBe(CAR.limit + CAR.more);
    const two = ok(buildCar(more));
    expect(two.camp.cars).toBe(2);
    expect(buildCar(two)).toEqual({ ok: false, reason: 'The camp has all its cars' });
  });
});

describe('boss horde unlocks (AC5)', () => {
  /** Horde 10 of `game`, won as a boss horde with seed state `s`. */
  const bossWin = (s: number): HordeState => ({
    ...newHorde(1, { ...setup(), hordeNumber: 10 }),
    outcome: 'won',
    boss: 'brood',
    rng: { s },
  });

  it('unlocks one perk not owned yet, the same for the same fight', () => {
    const g = { ...newGame(), hordeNumber: 10 };
    const r = hordeBossReward(g, bossWin(7));
    expect(r).toEqual(hordeBossReward(g, bossWin(7)));
    expect(r && 'perk' in r && r.perk !== 'steady-fire').toBe(true);
    const picked = new Set(
      Array.from({ length: 50 }, (_, i) => {
        const x = hordeBossReward(g, bossWin(i));
        return x && 'perk' in x ? x.perk : null;
      }),
    );
    expect(picked.has('steady-fire')).toBe(false);
    expect(picked.size).toBeGreaterThan(3);
  });

  it('pays Genes instead once every perk is owned; nothing without a boss win', () => {
    const all = { ...newGame(), hordeNumber: 10 };
    for (const id of PERK_IDS) all.perkLevels[id] = 1;
    expect(hordeBossReward(all, bossWin(1))).toEqual({ genes: BOSS_PERK_GENES });
    expect(hordeBossReward(newGame(), { ...bossWin(1), boss: null })).toBeNull();
    expect(hordeBossReward(newGame(), { ...bossWin(1), outcome: 'lost' })).toBeNull();
  });

  it('finishHorde owns the perk, and refunds its node if it was queued', () => {
    // A seed whose perk's node needs nothing first, so it can be queued at once.
    const seed = Array.from({ length: 50 }, (_, i) => i).find((i) => {
      const x = hordeBossReward(newGame(), bossWin(i));
      return x !== null && 'perk' in x && RESEARCH[x.perk as ResearchId].needs === null;
    })!;
    const h = bossWin(seed);
    const r = hordeBossReward(newGame(), h) as {
      perk: Exclude<(typeof PERK_IDS)[number], 'steady-fire'>;
    };
    const g: GameState = { ...lab(2, 500), hordeNumber: 10 };
    const q = ok(queueResearch(g, 'metal-walls', T));
    const qq = ok(queueResearch(q, r.perk, T));
    const done = finishHorde(qq, { ...h, startedAt: T }, T + MIN);
    expect(done.perkLevels[r.perk]).toBe(1);
    expect(done.queue.ids).toEqual(['metal-walls']);
    expect(done.stock.genes).toBeGreaterThanOrEqual(q.stock.genes);
  });

  it('all perks owned: the win pays the extra Genes', () => {
    const g: GameState = { ...newGame(), hordeNumber: 10 };
    for (const id of PERK_IDS) g.perkLevels[id] = 1;
    const h = { ...bossWin(1), startedAt: T };
    const plain = finishHorde({ ...g, perkLevels: { ...newGame().perkLevels } }, h, T);
    const all = finishHorde(g, h, T);
    // The plain one got a perk instead of Genes.
    expect(all.stock.genes - plain.stock.genes).toBe(BOSS_PERK_GENES);
  });
});

describe('Genes against the tree (AC7)', () => {
  /** Mutants a horde brings: every spawn of every wave, times the mutant share of its mix. */
  function mutants(h: number): number {
    let n = 0;
    for (let w = 1; w <= waveCount(h); w++) n += waveSize(h, w);
    const mix = waveMix(h);
    const total = mix.reduce((a, [, x]) => a + x, 0);
    const share = mix.filter(([k]) => MUTANTS.includes(k)).reduce((a, [, x]) => a + x, 0) / total;
    return n * share;
  }
  /** Genes from winning hordes 1 … `last`, with every mutant killed or none. */
  function earned(last: number, kills: boolean): number {
    let genes = 0;
    for (let h = 1; h <= last; h++) {
      genes += hordeGenes({
        hordeNumber: h,
        outcome: 'won',
        mutantKills: kills ? Math.floor(mutants(h)) : 0,
        boss: h % HORROR.every === 0 ? 'brood' : null,
      });
    }
    return genes;
  }
  const nodes = RESEARCH_IDS.map((id) => RESEARCH[id].genes);
  const levels = PERK_IDS.length * PERK_LEVEL.genes.reduce((a, b) => a + b, 0);
  const tree = nodes.reduce((a, b) => a + b, 0) + levels;
  /** How many nodes `genes` buys, cheapest first. */
  const buys = (genes: number): number => {
    let left = genes;
    return [...nodes].sort((a, b) => a - b).filter((c) => (left -= c) >= 0).length;
  };

  it('by Horde 10 a meaningful early part: Metal walls, a skill and a perk slot, even with no mutant killed', () => {
    const low = earned(10, false);
    const starter = (['metal-walls', 'flashbang', 'perk-slot-2'] as const).reduce(
      (n, id) => n + RESEARCH[id].genes,
      0,
    );
    expect(low).toBeGreaterThanOrEqual(starter);
    // Killing the mutants too, a dozen nodes or so, still well under a tenth of the tree.
    const high = earned(10, true);
    expect(buys(high)).toBeGreaterThanOrEqual(10);
    expect(high).toBeLessThan(tree / 10);
  });

  it('not the whole tree before Horde 30: every horde won, every mutant killed, and patrol Genes to spare', () => {
    // Plaza big hordes pay 1–2 Genes now and then; allow the most, every horde.
    const patrols = 29 * PATROL.horde.genes.max;
    expect(earned(29, true) + patrols).toBeLessThan(tree);
  });
});
