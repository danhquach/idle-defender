// Design §12, as built ID-035: the research queue and perk levels in the save, read back
// through the allow-list. Hostile values are refused; a clock set back is cut as rests are.
import { describe, expect, it } from 'vitest';
import { BANK_CAP, CAR, PERK_IDS, RESEARCH, stockOf } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { queueResearch } from '../core/research.ts';
import { researchNow } from '../core/testing.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW, preQueue } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const MIN = 60_000;

function ok(r: ReturnType<typeof queueResearch>): GameState {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** Lab 2, plenty of Genes, Metal walls and Flashbang queued at NOW. */
function queued(): GameState {
  let g: GameState = { ...newGame(), lab: 2, stock: stockOf({ genes: 999 }) };
  g = ok(queueResearch(g, 'metal-walls', NOW));
  return ok(queueResearch(g, 'flashbang', NOW));
}

/** `game` saved at NOW, changed by `change` as JSON, then read back. */
function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: research queue (ID-035)', () => {
  it('round-trips the queue and the running end', () => {
    const g = queued();
    expect(reread(g)?.game).toEqual(g);
    expect(reread(g)?.game.queue).toEqual({
      ids: ['metal-walls', 'flashbang'],
      endsAt: NOW + 15 * MIN,
    });
  });

  it('round-trips perk levels, a perk level in the queue, and an empty queue', () => {
    const g = ok(
      queueResearch(
        { ...queued(), perkLevels: { ...queued().perkLevels, 'steady-fire': 2 } },
        'level-steady-fire',
        NOW,
      ),
    );
    expect(reread(g)?.game).toEqual(g);
    expect(reread(newGame())?.game.queue).toEqual({ ids: [], endsAt: null });
  });

  it('refuses more than 4 entries, a node twice, and unknown or look-alike ids', () => {
    const g = queued();
    const bad: unknown[][] = [
      ['metal-walls', 'flashbang', 'molotov', 'fortify', 'rally-call'],
      ['metal-walls', 'metal-walls'],
      ['death-ray'],
      ['__proto__'],
      ['constructor'],
      ['level-__proto__'],
      ['level-'],
      [' metal-walls'],
      ['metal-walls '],
      ['METAL-WALLS'],
      ['metal‐walls'], // a Unicode hyphen
      ['metal-walls​'], // zero-width space
      ['‮metal-walls'], // bidi override
      [1],
      [null],
      [{}],
      [['metal-walls']],
      ['x'.repeat(100_000)],
    ];
    for (const ids of bad) {
      expect(
        reread(g, (x) => (x.queue.ids = ids)),
        JSON.stringify(ids).slice(0, 60),
      ).toBeNull();
    }
  });

  it('refuses a queue the game could not have built', () => {
    const g = queued();
    const cases: [string, Loose][] = [
      ['a node before the one it needs', ['molotov', 'flashbang']],
      ['a node above the Lab', ['second-look']],
      ['a perk level for a perk not owned', ['level-fortify']],
      ['a perk level before its own node', ['level-fortify', 'fortify']],
      ['a perk level twice', ['level-steady-fire', 'level-steady-fire']],
    ];
    for (const [why, ids] of cases) {
      expect(
        reread({ ...g, lab: 1 }, (x) => (x.queue.ids = ids)),
        why,
      ).toBeNull();
    }
    const done = researchNow({ ...newGame(), lab: 1 }, 'flashbang');
    if (!done.ok) throw new Error(done.reason);
    const d = { ...done.game, queue: { ids: [], endsAt: null } };
    expect(reread(d, (x) => (x.queue = { ids: ['flashbang'], endsAt: NOW }))).toBeNull();
    const top = { ...newGame(), lab: 1, perkLevels: { ...newGame().perkLevels, 'steady-fire': 3 } };
    expect(reread(top, (x) => (x.queue = { ids: ['level-steady-fire'], endsAt: NOW }))).toBeNull();
    // A perk owned (from a boss) is not researched again.
    const gift = {
      ...newGame(),
      hordeNumber: 11,
      lab: 1,
      perkLevels: { ...newGame().perkLevels, fortify: 1 },
    };
    expect(reread(gift)).not.toBeNull();
    expect(reread(gift, (x) => (x.queue = { ids: ['fortify'], endsAt: NOW }))).toBeNull();
  });

  it('refuses a bad end: missing with entries, set with none, or not a whole time', () => {
    const g = queued();
    for (const endsAt of [null, -1, 1.5, NaN, '1', 1e14, {}, []]) {
      expect(
        reread(g, (x) => (x.queue.endsAt = endsAt)),
        String(endsAt),
      ).toBeNull();
    }
    expect(reread(newGame(), (x) => (x.queue.endsAt = NOW))).toBeNull();
    expect(reread(g, (x) => (x.queue.extra = 1))).toBeNull();
    expect(reread(g, (x) => delete x.queue.endsAt)).toBeNull();
    expect(reread(g, (x) => (x.queue = null))).toBeNull();
    expect(
      reread(g, (x) => (x.queue = JSON.parse('{"__proto__":{"ids":[]},"ids":[],"endsAt":null}'))),
    ).toBeNull();
  });

  it('a clock set back: the running end is cut to its full time after the save, as rests are', () => {
    const g = queued();
    const far = reread(g, (x) => (x.queue.endsAt = NOW + 1e9));
    expect(far?.game.queue.endsAt).toBe(NOW + RESEARCH['metal-walls'].minutes * MIN);
    // A running perk level is cut to its own full time.
    const lv = ok(
      queueResearch(
        { ...newGame(), lab: 1, stock: stockOf({ genes: 999 }) },
        'level-steady-fire',
        NOW,
      ),
    );
    expect(reread(lv, (x) => (x.queue.endsAt = NOW + 1e9))?.game.queue.endsAt).toBe(NOW + 60 * MIN);
    // An end in the past is fine: the queue catches up when the game runs.
    expect(reread(g, (x) => (x.queue.endsAt = 0))?.game.queue.endsAt).toBe(0);
  });
});

describe('save: perk levels (ID-035)', () => {
  it('refuses a level out of range, a wrong type, or unknown or missing perks', () => {
    for (const level of [-1, 4, 1.5, '1', null, NaN, 1e9]) {
      expect(
        reread(newGame(), (x) => (x.perkLevels.fortify = level)),
        String(level),
      ).toBeNull();
    }
    expect(reread(newGame(), (x) => (x.perkLevels['death-ray'] = 1))).toBeNull();
    expect(reread(newGame(), (x) => delete x.perkLevels.fortify)).toBeNull();
    expect(
      reread(
        newGame(),
        (x) =>
          (x.perkLevels = JSON.parse(
            `{"__proto__":{"fortify":3},${JSON.stringify(x.perkLevels).slice(1)}`,
          )),
      ),
    ).toBeNull();
  });

  it('the starting perk and every perk researched are owned', () => {
    expect(reread(newGame(), (x) => (x.perkLevels['steady-fire'] = 0))).toBeNull();
    const r = researchNow({ ...newGame(), lab: 1 }, 'fortify');
    if (!r.ok) throw new Error(r.reason);
    expect(reread(r.game)?.game.perkLevels.fortify).toBe(1);
    expect(reread(r.game, (x) => (x.perkLevels.fortify = 0))).toBeNull();
  });

  it('owns no more perks without research than the boss hordes won could give', () => {
    const gifts = (hordeNumber: number, n: number) => {
      const g = { ...newGame(), hordeNumber };
      for (const id of PERK_IDS.slice(1, 1 + n)) g.perkLevels[id] = 1;
      return reread(g);
    };
    expect(gifts(10, 1)).toBeNull(); // Horde 10 not won yet
    expect(gifts(11, 1)).not.toBeNull();
    expect(gifts(11, 2)).toBeNull();
    expect(gifts(31, 3)).not.toBeNull();
  });

  it('an equipped perk must be owned', () => {
    expect(reread(newGame(), (x) => (x.perks = ['fortify']))).toBeNull();
  });

  it('a v10 save loads with no queue, owning the starting perk and each one researched at level 1', () => {
    const r = researchNow({ ...newGame(), lab: 1 }, 'rally-call');
    if (!r.ok) throw new Error(r.reason);
    const save = { v: 10, savedAt: NOW, game: preQueue(r.game) };
    const back = decodeSave(JSON.stringify(save));
    expect(back?.game.queue).toEqual({ ids: [], endsAt: null });
    expect(back?.game.perkLevels).toEqual(r.game.perkLevels);
    expect(back?.game.perkLevels['rally-call']).toBe(1);
    // A v11 save must carry both; a v10 one neither.
    const v11 = { v: 11, savedAt: NOW, game: preQueue(r.game) };
    expect(decodeSave(JSON.stringify(v11))).toBeNull();
    expect(decodeSave(JSON.stringify({ ...save, game: r.game }))).toBeNull();
  });
});

describe('save: research limits elsewhere (ID-035)', () => {
  it('the bank may hold more only with the battery research', () => {
    expect(reread(newGame(), (x) => (x.power.bank = BANK_CAP + 1))).toBeNull();
    let g: GameState = { ...newGame(), lab: 2 };
    for (const id of ['metal-walls', 'auto-turret', 'high-capacity-batteries'] as const) {
      const r = researchNow(g, id);
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    }
    expect(reread(g, (x) => (x.power.bank = BANK_CAP + 500))?.game.power.bank).toBe(BANK_CAP + 500);
    expect(reread(g, (x) => (x.power.bank = BANK_CAP + 501))).toBeNull();
  });

  it('a second car only with More cars', () => {
    expect(reread(newGame(), (x) => (x.camp.cars = CAR.limit + 1))).toBeNull();
    const r = researchNow({ ...newGame(), lab: 2 }, 'more-cars');
    if (!r.ok) throw new Error(r.reason);
    expect(reread(r.game, (x) => (x.camp.cars = 2))?.game.camp.cars).toBe(2);
    expect(reread(r.game, (x) => (x.camp.cars = 3))).toBeNull();
  });
});
