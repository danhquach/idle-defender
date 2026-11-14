// Design §12, as built ID-147: save version 19. The camp grows past the squad's cap, up to
// `SQUAD_JOIN.max` (squad in `roster`, bench in `reserve`), and a survivor may hold `rest`,
// the hordes left to rest. Loaded values go through an allow-list; hostile ones are refused.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import {
  INJURY_REST,
  OLD_REST_MAX,
  PATCH_UP,
  SQUAD_CAP,
  SQUAD_JOIN,
  STASH_CAP,
} from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { decodeSave, encodeSave, MAX_SAVE_CHARS, SAVE_VERSION } from './save.ts';
import { NOW } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const person = (no: number, extra: Partial<RosterDefender> = {}): RosterDefender => ({
  ...recruit(no),
  ...extra,
});

/** A horde-only camp at Horde 12: `squad` in the squad, `bench` on the bench. */
function campGame(squad: RosterDefender[], bench: RosterDefender[]): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 12,
    roster: squad,
    reserve: bench,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** Six in the squad and two on the bench, one of them resting a horde. */
const benched = (): GameState =>
  campGame(
    Array.from({ length: SQUAD_CAP }, (_, i) => person(i + 1)),
    [person(7, { rest: 1 }), person(8)],
  );

function reread(game: GameState | Loose, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game as GameState, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: the bench and rest (ID-147)', () => {
  it('round-trips a squad, a bench and each rest; a fit survivor writes no rest', () => {
    const g = benched();
    const json = JSON.parse(encodeSave(g, NOW));
    expect(json.game.reserve[0].rest).toBe(1);
    expect(Object.hasOwn(json.game.reserve[1], 'rest')).toBe(false);
    expect(reread(g)?.game).toEqual(g);
  });

  it('round-trips the biggest camp, every survivor and the stash holding a Relic gun, within the size cap', () => {
    const relic = (i: number) => rollWeapon(createRng(i), `h${i + 1}`, 'rifle', 'relic', 150);
    const camp = Array.from({ length: SQUAD_JOIN.max }, (_, i) =>
      person(i + 1, {
        xp: 1_000_000,
        loadout: { primary: relic(i), secondary: null, item: null },
        ...(i >= SQUAD_CAP && i % 2 === 0 ? { rest: INJURY_REST.max } : {}),
      }),
    );
    const g: GameState = {
      ...campGame(camp.slice(0, SQUAD_CAP), camp.slice(SQUAD_CAP)),
      hordeNumber: 200,
      armoury: Array.from({ length: STASH_CAP }, (_, i) => relic(SQUAD_JOIN.max + i)),
    };
    const raw = encodeSave(g, NOW);
    // With room to spare, so a later field doesn't push the biggest camp past the cap.
    expect(raw.length).toBeLessThan(0.8 * MAX_SAVE_CHARS);
    expect(decodeSave(raw)?.game).toEqual(g);
  });

  it('refuses hostile rests and an oversized camp', () => {
    const cases: [string, (x: Loose) => void][] = [
      ['a rest of 0 (never written)', (x) => (x.reserve[1].rest = 0)],
      ['a negative rest', (x) => (x.reserve[0].rest = -1)],
      ['a rest past the most', (x) => (x.reserve[0].rest = INJURY_REST.max + 1)],
      ['a huge rest', (x) => (x.reserve[0].rest = 1e300)],
      ['a fractional rest', (x) => (x.reserve[0].rest = 1.5)],
      ['a rest as text', (x) => (x.reserve[0].rest = '1')],
      ['a null rest', (x) => (x.reserve[0].rest = null)],
      ['a rest as an object', (x) => (x.reserve[0].rest = { valueOf: 1 })],
      [
        'one past the biggest camp',
        (x) => {
          for (let k = x.roster.length + x.reserve.length; k <= SQUAD_JOIN.max; k++) {
            x.reserve.push({ ...x.reserve[1], id: `extra-${k}` });
          }
        },
      ],
      [
        'a bench far past any bound',
        (x) => (x.reserve = Array.from({ length: 10_000 }, () => x.reserve[1])),
      ],
    ];
    for (const [name, change] of cases) expect(reread(benched(), change), name).toBeNull();
  });

  it('refuses a rest in a v18 save, which had none', () => {
    expect(reread(benched(), () => {}, 18)).toBeNull();
    // JSON's only way to an infinite number: a literal past the range.
    const huge = encodeSave(benched(), NOW).replace('"rest":1', '"rest":1e999');
    expect(huge).toContain('1e999');
    expect(decodeSave(huge)).toBeNull();
    const fit = campGame([person(1)], [person(2)]);
    expect(reread(fit, () => {}, 18)?.game).toEqual(fit);
  });

  it('loads the biggest camp, and refuses a prototype key on a resting survivor', () => {
    const big = campGame(
      Array.from({ length: SQUAD_CAP }, (_, i) => person(i + 1)),
      Array.from({ length: SQUAD_JOIN.max - SQUAD_CAP }, (_, i) => person(SQUAD_CAP + i + 1)),
    );
    expect(reread(big)?.game).toEqual(big);
    const raw = encodeSave(benched(), NOW).replace('"rest":1', '"rest":1,"__proto__":{"x":1}');
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('settles a hand-made camp as it loads: the resting leave the squad, and nobody fit wakes the shortest rest', () => {
    const squadResting = campGame([person(1, { rest: 1 }), person(2)], [person(3)]);
    const loaded = reread(squadResting)!.game;
    expect(loaded.roster.map((d) => d.id)).toEqual(['recruit-2']);
    expect(loaded.reserve.map((d) => [d.id, d.rest])).toEqual([
      ['recruit-3', undefined],
      ['recruit-1', 1],
    ]);
    const allResting = campGame([person(1, { rest: 1 })], [person(2, { rest: 1 })]);
    const woke = reread(allResting)!.game;
    expect(woke.roster.map((d) => [d.id, d.rest])).toEqual([['recruit-2', undefined]]);
    expect(woke.reserve.map((d) => [d.id, d.rest])).toEqual([['recruit-1', 1]]);
  });
});

describe('save: patched up and the 1-horde rest (ID-155, v22)', () => {
  /** The bench's first survivor patched up to `share` of max HP instead of resting. */
  const patched = (share: number = PATCH_UP.hp): GameState =>
    campGame(
      Array.from({ length: SQUAD_CAP }, (_, i) => person(i + 1)),
      [person(7, { startHp: share }), person(8)],
    );

  it('round-trips a patched-up survivor; one at full HP writes none', () => {
    const g = patched(0.65);
    const json = JSON.parse(encodeSave(g, NOW));
    expect(json.game.reserve[0].startHp).toBe(0.65);
    expect(Object.hasOwn(json.game.reserve[1], 'startHp')).toBe(false);
    expect(reread(g)?.game).toEqual(g);
    for (const share of [PATCH_UP.hp, PATCH_UP.hpCap]) {
      expect(reread(patched(share))?.game).toEqual(patched(share));
    }
  });

  it('refuses hostile starting HP', () => {
    const cases: [string, (x: Loose) => void][] = [
      ['under the floor', (x) => (x.reserve[0].startHp = PATCH_UP.hp - 0.01)],
      ['over the cap', (x) => (x.reserve[0].startHp = PATCH_UP.hpCap + 0.01)],
      ['over the cap in the squad', (x) => (x.roster[0].startHp = 0.9)],
      ['0', (x) => (x.reserve[0].startHp = 0)],
      ['negative', (x) => (x.reserve[0].startHp = -1)],
      ['huge', (x) => (x.reserve[0].startHp = 1e300)],
      ['text', (x) => (x.reserve[0].startHp = '0.6')],
      ['null', (x) => (x.reserve[0].startHp = null)],
      ['an object', (x) => (x.reserve[0].startHp = { valueOf: 0.6 })],
      ['an array', (x) => (x.reserve[0].startHp = [0.6])],
      ['with a rest too', (x) => (x.reserve[0].rest = 1)],
      ['a rest of 2, past today’s most', (x) => (x.reserve[1].rest = 2)],
    ];
    for (const [name, change] of cases) expect(reread(patched(), change), name).toBeNull();
    const nan = encodeSave(patched(), NOW).replace('"startHp":0.5', '"startHp":1e999');
    expect(nan).toContain('1e999');
    expect(decodeSave(nan)).toBeNull();
    const proto = encodeSave(patched(), NOW).replace(
      '"startHp":0.5',
      '"startHp":0.5,"__proto__":{"y":1}',
    );
    expect(proto).toContain('__proto__');
    expect(decodeSave(proto)).toBeNull();
    expect(({} as Record<string, unknown>).y).toBeUndefined();
  });

  it('refuses starting HP in a v21 or older save, which had none', () => {
    for (const v of [18, 19, 20, 21])
      expect(
        reread(patched(), () => {}, v),
        `v${v}`,
      ).toBeNull();
  });

  it('a v19–v21 save’s 2-horde rest loads as 1; past 2 it is refused', () => {
    for (const v of [19, 20, 21]) {
      const old = reread(benched(), (x) => (x.reserve[0].rest = OLD_REST_MAX), v);
      expect(old?.game.reserve.find((d) => d.id === 'recruit-7')?.rest, `v${v}`).toBe(1);
      expect(
        reread(benched(), (x) => (x.reserve[0].rest = OLD_REST_MAX + 1), v),
        `v${v}`,
      ).toBeNull();
    }
  });

  it('refuses someone asking to join who is patched up', () => {
    const g = { ...campGame([person(1)], []), joining: [person(9, { startHp: 0.6 })] };
    expect(reread(g)).toBeNull();
  });
});
