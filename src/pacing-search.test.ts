// ID-172: the pacing tuner's pure parts (tools/pacing-search.mjs).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SQUAD_PACE } from './core/pacing.ts';
import {
  better,
  candidates,
  changeSize,
  formatStats,
  applyTable,
  formatTable,
  hordeStats,
  measuredLines,
  misses,
  parseArgs,
  perHorde,
  score,
  tableProblems,
  toRows,
  warnings,
  withTable,
  type PaceRow,
  type Run,
  type Stats,
} from '../tools/pacing-search.mjs';

const row = (from: number, interval: number, overlap: number): PaceRow => ({
  from,
  interval,
  break: 3,
  overlap,
});
/** ID-171's ramp, and the Horde 6 cliff before it. */
const RAMP = [row(1, 0.8, 0), row(6, 0.6, 0.5), row(7, 0.6, 0.75), row(8, 0.6, 1)];
const CLIFF = [row(1, 0.8, 0), row(6, 0.6, 0.5), row(8, 0.6, 1)];

/** A horde's stats with `lost` of 20 lost, `injured` a try, and a forecast split. */
function stats(lost: number, injured: number, some = 0, someLost = 0): Stats {
  return {
    tries: 20,
    won: 20 - lost,
    lost,
    injured,
    wallLoss: 0,
    bands: { few: 20 - some, some, heavy: 0 },
    someLost,
  };
}

describe('hordeStats', () => {
  it('sums a horde’s first tries: wins, injured and wall a try, the forecast split', () => {
    const runs: Run[] = [
      { outcome: 'won', injured: 0, wallLeft: 1, band: 'few' },
      { outcome: 'lost', injured: 4, wallLeft: 0, band: 'some' },
      { outcome: 'won', injured: 2, wallLeft: 0.5, band: 'some' },
      { outcome: 'lost', injured: 6, wallLeft: 0.5, band: 'heavy' },
    ];
    expect(hordeStats(runs)).toEqual({
      tries: 4,
      won: 2,
      lost: 2,
      injured: 3,
      wallLoss: 0.5,
      bands: { few: 1, some: 2, heavy: 1 },
      someLost: 1,
    });
  });
});

describe('misses (ID-171’s targets)', () => {
  it('passes steps within 4 more lost and 1.5 more injured', () => {
    const s = [];
    s[5] = stats(0, 0);
    s[6] = stats(4, 1.5);
    s[7] = stats(8, 3);
    expect(misses(s, 5, 7)).toEqual([]);
  });

  it('names a horde that loses 5 more, or injures more than 1.5 more, than the one before', () => {
    const s = [];
    s[5] = stats(0, 0);
    s[6] = stats(5, 1.6);
    s[7] = stats(5, 1.6);
    const found = misses(s, 5, 7);
    expect(found.map((m) => [m.horde, m.kind])).toEqual([
      [6, 'lost'],
      [6, 'injured'],
    ]);
    expect(found.every((m) => m.excess > 0)).toBe(true);
  });

  it('a horde easier than the one before is no miss', () => {
    const s = [];
    s[5] = stats(10, 4);
    s[6] = stats(0, 0);
    expect(misses(s, 5, 6)).toEqual([]);
  });

  it('flags "some" squads losing half or more, at the horde with the most such losses', () => {
    const s = [];
    s[5] = stats(0, 0, 4, 4);
    s[6] = stats(1, 0, 4, 1);
    s[7] = stats(3, 0, 4, 3);
    // Horde 5 starts the range, so only 6–7 count: 4 of 8 "some" lost.
    expect(misses(s, 5, 7)).toEqual([{ horde: 7, kind: 'some', excess: expect.any(Number) }]);
    s[7] = stats(2, 0, 4, 2);
    expect(misses(s, 5, 7)).toEqual([]);
  });
});

describe('warnings', () => {
  it('says when no squad landed in "some", or the range is not the balance test’s', () => {
    const s = [];
    s[5] = stats(0, 0, 4);
    s[6] = stats(0, 0);
    s[7] = stats(0, 0);
    s[8] = stats(0, 0, 1);
    expect(warnings(s, 5, 8)).toEqual([]);
    s[8] = stats(0, 0);
    expect(warnings(s, 5, 8)).toHaveLength(1);
    expect(warnings(s, 6, 8)).toHaveLength(2);
  });
});

describe('parseArgs', () => {
  it('defaults to Hordes 5–8 and 16 candidates, not applied', () => {
    expect(parseArgs([])).toEqual({ from: 5, to: 8, cap: 16, apply: false });
    expect(parseArgs(['3', '10', '0'])).toEqual({ from: 3, to: 10, cap: 0, apply: false });
    expect(parseArgs(['--apply'])).toEqual({ from: 5, to: 8, cap: 16, apply: true });
    expect(parseArgs(['5', '8', '4', '--apply'])).toMatchObject({ cap: 4, apply: true });
  });

  it('refuses an unknown option', () => {
    expect(() => parseArgs(['--write'])).toThrow(RangeError);
    expect(() => parseArgs(['--apply=1'])).toThrow(RangeError);
  });

  it('refuses anything but whole numbers in range, `to` above `from`', () => {
    for (const bad of [['x'], ['5', '5'], ['8', '5'], ['0'], ['5', '31'], ['5', '8', '101']]) {
      expect(() => parseArgs(bad), bad.join(' ')).toThrow(RangeError);
    }
    expect(() => parseArgs(['5.5'])).toThrow(RangeError);
    expect(() => parseArgs(['5', '8', '-1'])).toThrow(RangeError);
  });
});

describe('--apply (applyTable, measuredLines)', () => {
  const source = readFileSync(new URL('./core/pacing.ts', import.meta.url), 'utf8');

  it('writes the rows and their numbers into pacing.ts, nothing else changed', () => {
    const s = [];
    s[5] = stats(0, 0);
    s[6] = stats(2, 1.25);
    const comments = measuredLines(s, 5, 6);
    expect(comments).toEqual([
      '// tune:pacing (20 seeds, first try): Hordes 5–6 won 20, 18 of 20;',
      '// injured a try 0, 1.25.',
    ]);
    const after = applyTable(source, CLIFF, comments);
    const table = after.slice(after.indexOf('export const SQUAD_PACE'));
    expect(
      table
        .slice(0, table.indexOf('];') + 2)
        .split('\n')
        .slice(1),
    ).toEqual([
      '  // tune:pacing (20 seeds, first try): Hordes 5–6 won 20, 18 of 20;',
      '  // injured a try 0, 1.25.',
      '  { from: 1, interval: 0.8, break: 3, overlap: 0 },',
      '  { from: 6, interval: 0.6, break: 3, overlap: 0.5 },',
      '  { from: 8, interval: 0.6, break: 3, overlap: 1 },',
      '];',
    ]);
    // Outside the brackets, the file is as it was.
    const outside = (src: string) => src.replace(/SQUAD_PACE\b[^\n]*= \[\n[\s\S]*?^\];/m, '');
    expect(outside(after)).toBe(outside(source));
  });

  it('applying the game’s own table and numbers changes nothing', () => {
    const own = source.match(/^ {2}\/\/ tune:pacing[^\n]*\n {2}\/\/ [^\n]*$/m)![0];
    const comments = own.split('\n').map((l) => l.trim());
    expect(
      applyTable(
        source,
        SQUAD_PACE.map((r) => ({ ...r })),
        comments,
      ),
    ).toBe(source);
  });

  it('refuses a file with no table, or two, so it never half-writes', () => {
    expect(() => applyTable('const x = 1;\n', RAMP, [])).toThrow('found 0');
    const block = source.slice(source.indexOf('export const SQUAD_PACE'));
    const twice = source + '\n' + block.slice(0, block.indexOf('];') + 2) + '\n';
    expect(() => applyTable(twice, RAMP, [])).toThrow('found 2');
  });
});

describe('withTable', () => {
  it('swaps the rows in for the call, then puts the table’s own back', () => {
    const table = RAMP.map((r) => ({ ...r }));
    const own = [...table];
    expect(withTable(table, CLIFF, () => table.map((r) => r.overlap))).toEqual([0, 0.5, 1]);
    expect(table).toEqual(own);
    expect(table[0]).toBe(own[0]);
  });

  it('puts them back when the call throws', () => {
    const table = RAMP.map((r) => ({ ...r }));
    expect(() =>
      withTable(table, CLIFF, () => {
        throw new Error('stalled');
      }),
    ).toThrow('stalled');
    expect(table).toEqual(RAMP);
  });
});

describe('ranking tables', () => {
  it('fewer misses first, then smaller misses, then the smaller change', () => {
    const m = (excess: number) => ({ horde: 6, kind: 'lost' as const, excess });
    expect(better(score([], 9), score([m(0.1)], 0))).toBe(true);
    expect(better(score([m(0.1)], 9), score([m(0.5)], 0))).toBe(true);
    expect(better(score([m(0.1)], 0.1), score([m(0.1)], 0.2))).toBe(true);
    expect(better(score([], 0), score([], 0))).toBe(false);
  });

  it('measures a change across every horde a row covers', () => {
    expect(changeSize(RAMP, RAMP, 8)).toBe(0);
    // Horde 7 went 0.75 → 0.5.
    expect(changeSize(RAMP, CLIFF, 8)).toBeCloseTo(0.25);
  });
});

describe('rows and per-horde paces', () => {
  it('round-trips, merging hordes that pace the same', () => {
    expect(toRows(perHorde(RAMP, 10))).toEqual(RAMP);
    const paces = perHorde(RAMP, 8);
    paces[7] = { ...paces[6]! };
    expect(toRows(paces)).toEqual(CLIFF);
  });

  it('the game’s own table round-trips and keeps its rules', () => {
    const rows = SQUAD_PACE.map((r) => ({ ...r }));
    expect(toRows(perHorde(rows, 12))).toEqual(rows);
    expect(tableProblems(rows)).toEqual([]);
  });
});

describe('tableProblems (pacing.test.ts’s rules)', () => {
  it('accepts the ramp', () => expect(tableProblems(RAMP)).toEqual([]));

  it('refuses a row that gets slower or overlaps less, or a first overlap in full', () => {
    expect(tableProblems([row(1, 0.6, 0), row(6, 0.8, 0.5)])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0.5), row(6, 0.6, 0.25)])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0), row(6, 0.6, 1)])).toEqual([
      'the first overlap must be a partial one',
    ]);
    expect(tableProblems([row(2, 0.8, 0)])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0), row(6, 0.6, 1.2)]).length).toBeGreaterThan(0);
    expect(tableProblems([row(1, 0.8, 0), row(6, 0, 0.5)])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0), row(6, 0.6, 0.5), row(6, 0.6, 0.5)])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0), { ...row(6, 0.6, 0.5), break: -1 }])).toHaveLength(1);
    expect(tableProblems([row(1, 0.8, 0), row(6.5, 0.6, 0.5)])).toHaveLength(1);
  });
});

describe('candidates', () => {
  it('moves one knob halfway across the cliff, each table within the rules', () => {
    // Horde 8 a cliff after Horde 7 (0.5 → 1).
    const found = candidates(CLIFF, 8, 8);
    expect(found.map((c) => c.move)).toEqual([
      'Horde 8 overlap 1 → 0.75',
      'Horde 7 overlap 0.5 → 0.75',
    ]);
    for (const c of found) expect(tableProblems(c.rows)).toEqual([]);
    // Horde 8 gets its own row; Horde 9 on keeps full overlap.
    expect(found[0]!.rows).toEqual([
      row(1, 0.8, 0),
      row(6, 0.6, 0.5),
      row(8, 0.6, 0.75),
      row(9, 0.6, 1),
    ]);
    expect(found[1]!.rows).toEqual(RAMP);
  });

  it('tries the interval too where it steps', () => {
    const moves = candidates(RAMP, 6, 8).map((c) => c.move);
    expect(moves).toEqual([
      'Horde 6 overlap 0.5 → 0.25',
      'Horde 5 overlap 0 → 0.25',
      'Horde 6 interval 0.6 → 0.7',
      'Horde 5 interval 0.8 → 0.7',
    ]);
  });

  it('fixes a first overlap that comes in full, never making one', () => {
    const jump = [row(1, 0.8, 0), row(6, 0.6, 1)];
    for (const c of candidates(jump, 6, 8)) expect(tableProblems(c.rows)).toEqual([]);
    expect(candidates(jump, 6, 8).length).toBeGreaterThan(0);
  });

  it('has nothing to try where two hordes already pace the same', () => {
    expect(candidates(RAMP, 9, 10)).toEqual([]);
  });
});

describe('output', () => {
  it('prints a table ready to paste', () => {
    expect(formatTable(RAMP)).toBe(
      [
        'export const SQUAD_PACE = [',
        '  { from: 1, interval: 0.8, break: 3, overlap: 0 },',
        '  { from: 6, interval: 0.6, break: 3, overlap: 0.5 },',
        '  { from: 7, interval: 0.6, break: 3, overlap: 0.75 },',
        '  { from: 8, interval: 0.6, break: 3, overlap: 1 },',
        '];',
      ].join('\n'),
    );
  });

  it('prints one line a horde, a miss marked on it', () => {
    const s = [];
    s[5] = stats(0, 0);
    s[6] = stats(6, 2);
    const out = formatStats(s, 5, 6, misses(s, 5, 6)).split('\n');
    expect(out).toHaveLength(3);
    expect(out[2]).toContain('6 (+6)');
    expect(out[2]).toContain('✗ lost, ✗ injured');
    expect(out[1]).not.toContain('✗');
  });
});
