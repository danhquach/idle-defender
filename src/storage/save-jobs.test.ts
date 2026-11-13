// Design §12, ID-149: save version 18. Every roster and reserve survivor has a profession,
// allow-listed on load; a v17 or older save's survivors each roll one from the save.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { JOB_IDS } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { jobFor, textSeed } from '../core/jobs.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preJobs } from './testing.ts';

// Hostile saves are built loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** A horde-only game with 3 survivors (one a Hunter) and one in the reserve. */
function squad(): GameState {
  const g = newGame('horde', 5);
  return {
    ...g,
    roster: [{ ...recruit(1), job: 'hunter' }, recruit(2, 9), recruit(3, 11)],
    reserve: [{ ...recruit(4), job: 'chef' }],
    camp: { ...g.camp, recruits: 4 },
  };
}

/** `game` saved, its JSON changed by `change`, and read back (null when refused). */
function reread(game: GameState, change: (json: Loose) => void, v = SAVE_VERSION) {
  const json = JSON.parse(encodeSave(game, NOW));
  json.v = v;
  change(json.game);
  return decodeSave(JSON.stringify(json));
}

describe('save: professions (ID-149)', () => {
  it('is version 18, and round-trips every profession on the roster and in the reserve', () => {
    expect(SAVE_VERSION).toBe(18);
    for (const job of JOB_IDS) {
      const g = squad();
      g.roster[1] = { ...g.roster[1]!, job };
      g.reserve[0] = { ...g.reserve[0]!, job };
      expect(decodeSave(encodeSave(g, NOW))?.game, job).toEqual(g);
    }
  });

  it('a v17 save rolls a profession for everyone, the same each time it loads', () => {
    const g = squad();
    const old = JSON.stringify({ v: 17, savedAt: NOW, game: preJobs(g) });
    const a = decodeSave(old)!.game;
    const b = decodeSave(old)!.game;
    expect(a).toEqual(b);
    const seed = textSeed(String(NOW));
    for (const d of [...a.roster, ...a.reserve]) {
      expect(d.job, d.id).toBe(jobFor(d.id, seed));
      expect(JOB_IDS).toContain(d.job);
    }
    // Saved again, it is a v18 save that keeps them.
    expect(decodeSave(encodeSave(a, NOW))?.game).toEqual(a);
  });

  it('another save time rolls other professions (the save’s own seed)', () => {
    const g = squad();
    const many = {
      ...g,
      roster: Array.from({ length: 6 }, (_, i) => recruit(i + 1)),
      reserve: [],
      camp: { ...g.camp, recruits: 6 },
    };
    const at = (t: number) =>
      decodeSave(JSON.stringify({ v: 17, savedAt: t, game: preJobs(many) }))!.game.roster.map(
        (d) => d.job,
      );
    expect(at(NOW)).not.toEqual(at(NOW + 1));
  });

  it('a v17 save that already names a profession is refused', () => {
    expect(reread(squad(), () => {}, 17)).toBeNull();
  });

  it('a v18 survivor without a profession, or with any other value, is refused', () => {
    const bad: unknown[] = [
      undefined,
      null,
      '',
      'Hunter',
      'hunter ',
      'gunner',
      'wizard',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'hunter​',
      '‮hunter',
      'һunter', // a Cyrillic look-alike
      'x'.repeat(100_000),
      0,
      1,
      true,
      [],
      ['hunter'],
      {},
      { hunter: 1 },
    ];
    for (const v of bad) {
      const label = JSON.stringify(v)?.slice(0, 30) ?? 'undefined';
      expect(
        reread(squad(), (x) => {
          if (v === undefined) delete x.roster[0].job;
          else x.roster[0].job = v;
        }),
        `roster ${label}`,
      ).toBeNull();
      expect(
        reread(squad(), (x) => {
          if (v === undefined) delete x.reserve[0].job;
          else x.reserve[0].job = v;
        }),
        `reserve ${label}`,
      ).toBeNull();
    }
  });

  it('a prototype key next to a profession is refused, and pollutes nothing', () => {
    const raw = encodeSave(squad(), NOW).replace(
      '"job":"hunter"',
      '"__proto__":{"job":"chef"},"job":"hunter"',
    );
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Loose).job).toBeUndefined();
  });

  it('a profession never reaches anything but the survivor it belongs to', () => {
    const loaded = decodeSave(encodeSave(squad(), NOW))!.game;
    expect(Object.keys(loaded.roster[0]!).sort()).toEqual(
      ['id', 'injuredUntil', 'job', 'loadout', 'name', 'xp'].sort(),
    );
  });
});
