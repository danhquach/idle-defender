// The pacing tuner's pure parts (ID-172): the targets, the table's rules and the candidate
// rows to try. `tools/tune-pacing.mjs` plays the seeds; this file never touches the game.

/** ID-171's targets, horde against the horde before, first tries. */
export const TARGETS = {
  /** At most this many more seeds lost. */
  lost: 4,
  /** At most this many more injured per try. */
  injured: 1.5,
};

/** Overlap and interval steps a candidate is rounded to. */
const STEP = 0.05;
const round = (x) => Number((Math.round(x / STEP) * STEP).toFixed(2));
const same = (a, b) => Math.abs(a - b) < 1e-9;

/**
 * One horde's first tries summed up. Each run: `outcome`, `injured`, `wallLeft` and its
 * injury-forecast `band` ('few' | 'some' | 'heavy').
 */
export function hordeStats(runs) {
  const tries = runs.length;
  const bands = { few: 0, some: 0, heavy: 0 };
  let won = 0;
  let injured = 0;
  let wall = 0;
  let someLost = 0;
  for (const r of runs) {
    const win = r.outcome === 'won';
    if (win) won++;
    injured += r.injured;
    wall += 1 - r.wallLeft;
    bands[r.band]++;
    if (r.band === 'some' && !win) someLost++;
  }
  return {
    tries,
    won,
    lost: tries - won,
    injured: injured / tries,
    wallLoss: wall / tries,
    bands,
    someLost,
  };
}

/**
 * Where hordes `from`+1 to `to` miss the targets (`stats[n]` from `hordeStats`): each miss
 * names its horde, its kind and how far past the target it is (in targets, so kinds compare).
 */
export function misses(stats, from, to) {
  const out = [];
  let some = 0;
  let someLost = 0;
  let worstSome = null;
  for (let n = from + 1; n <= to; n++) {
    const [a, b] = [stats[n - 1], stats[n]];
    const lost = b.lost - a.lost - TARGETS.lost;
    if (lost > 0) out.push({ horde: n, kind: 'lost', excess: lost / TARGETS.lost });
    const injured = b.injured - a.injured - TARGETS.injured;
    if (injured > 1e-9) out.push({ horde: n, kind: 'injured', excess: injured / TARGETS.injured });
    some += b.bands.some;
    someLost += b.someLost;
    if (b.someLost > 0 && (worstSome === null || b.someLost > stats[worstSome].someLost)) {
      worstSome = n;
    }
  }
  // "Some" squads mostly win: fewer than half of them lose.
  if (some > 0 && someLost >= some / 2) {
    out.push({ horde: worstSome, kind: 'some', excess: (someLost - some / 2 + 0.5) / some });
  }
  return out.sort((x, y) => x.horde - y.horde);
}

/**
 * What the balance test checks that the search can't fix, as lines to print: the horde-only
 * test also wants some squad in "some" (Hordes 6–8), and holds its targets on Hordes 6–8
 * only, so another range's pass is not the test's.
 */
export function warnings(stats, from, to) {
  const out = [];
  let some = 0;
  for (let n = from + 1; n <= to; n++) some += stats[n].bands.some;
  if (some === 0) out.push('No squad landed in "some": the horde-only balance test wants one.');
  if (from !== 5 || to !== 8) {
    out.push('The horde-only balance test checks Hordes 5–8; this range is not the test’s.');
  }
  return out;
}

/**
 * The tuner's arguments, `[--apply] [from] [to] [candidates]` (default 5 8 16); a RangeError
 * with the usage when one is not a whole number in range, or an option is unknown.
 */
export function parseArgs(argv) {
  const usage =
    'usage: npm run tune:pacing -- [--apply] [from 1–29] [to, above from, up to 30] [candidates 0–100]';
  const options = argv.filter((a) => a.startsWith('--'));
  if (options.some((o) => o !== '--apply')) throw new RangeError(usage);
  const [from = 5, to = 8, cap = 16] = argv.filter((a) => !a.startsWith('--')).map(Number);
  const whole = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  if (!whole(from, 1, 29) || !whole(to, from + 1, 30) || !whole(cap, 0, 100)) {
    throw new RangeError(usage);
  }
  return { from, to, cap, apply: options.includes('--apply') };
}

/** The measured numbers `--apply` writes above the rows, as comment lines. */
export function measuredLines(stats, from, to) {
  const hordes = [];
  for (let n = from; n <= to; n++) hordes.push(stats[n]);
  const tries = hordes[0].tries;
  const won = hordes.map((s) => s.won).join(', ');
  const injured = hordes.map((s) => String(Number(s.injured.toFixed(2)))).join(', ');
  return [
    `// tune:pacing (${tries} seeds, first try): Hordes ${from}–${to} won ${won} of ${tries};`,
    `// injured a try ${injured}.`,
  ];
}

/**
 * `pacing.ts`'s source with `SQUAD_PACE`'s rows (and any comment lines inside its brackets)
 * replaced by `rows`, `comments` above them. Throws when the table isn't found exactly once,
 * so a reshaped file is never half-written.
 */
export function applyTable(source, rows, comments) {
  const at = /^(export const SQUAD_PACE\b[^\n]*= \[\n)([\s\S]*?)(^\];)/gm;
  const found = [...source.matchAll(at)];
  if (found.length !== 1) {
    throw new Error(`expected one SQUAD_PACE table in pacing.ts, found ${found.length}`);
  }
  const lines = formatTable(rows).split('\n').slice(1, -1);
  const body = [...comments.map((c) => `  ${c}`), ...lines].join('\n');
  const m = found[0];
  return source.slice(0, m.index) + m[1] + body + '\n' + m[3] + source.slice(m.index + m[0].length);
}

/**
 * Runs `fn` with `table`'s rows (the game's `SQUAD_PACE`, in memory) swapped for `rows`,
 * putting the table's own rows back after, even when `fn` throws.
 */
export function withTable(table, rows, fn) {
  const saved = [...table];
  table.splice(0, table.length, ...rows);
  try {
    return fn();
  } finally {
    table.splice(0, table.length, ...saved);
  }
}

/** How a table's misses rank: fewer first, then smaller, then the smaller change. */
export function score(found, change) {
  return [found.length, found.reduce((t, m) => t + m.excess, 0), change];
}

/** Whether score `a` beats score `b`. */
export function better(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i];
  }
  return false;
}

/** Each horde's pace, Hordes 1 to `last` (index 0 unused). */
export function perHorde(rows, last) {
  const out = [null];
  for (let n = 1; n <= last; n++) {
    let row = rows[0];
    for (const r of rows) if (n >= r.from) row = r;
    out.push({ interval: row.interval, break: row.break, overlap: row.overlap });
  }
  return out;
}

/** Back to rows: a row where a horde's pace differs from the one before. */
export function toRows(paces) {
  const rows = [];
  for (let n = 1; n < paces.length; n++) {
    const p = paces[n];
    const prev = rows.at(-1);
    if (
      prev &&
      same(prev.interval, p.interval) &&
      same(prev.break, p.break) &&
      same(prev.overlap, p.overlap)
    ) {
      continue;
    }
    rows.push({ from: n, interval: p.interval, break: p.break, overlap: p.overlap });
  }
  return rows;
}

/** The table's rules (`pacing.test.ts`): what a table breaks, empty if none. */
export function tableProblems(rows) {
  const out = [];
  if (rows[0]?.from !== 1) out.push('the first row must start at Horde 1');
  for (const [i, r] of rows.entries()) {
    if (!Number.isInteger(r.from)) out.push(`row ${i}: from must be a whole horde`);
    if (i > 0 && r.from <= rows[i - 1].from) out.push(`row ${i} is out of order`);
    if (!(r.break >= 0)) out.push(`row ${i}: break must be 0 or more`);
    if (!(r.interval > 0)) out.push(`row ${i}: interval must be above 0`);
    if (!(r.overlap >= 0 && r.overlap <= 1)) out.push(`row ${i}: overlap must be 0 to 1`);
    if (i > 0 && r.interval > rows[i - 1].interval + 1e-9) out.push(`row ${i} spawns slower`);
    if (i > 0 && r.overlap < rows[i - 1].overlap - 1e-9) out.push(`row ${i} overlaps less`);
  }
  const first = rows.find((r) => r.overlap > 0);
  if (first && first.overlap >= 1) out.push('the first overlap must be a partial one');
  return out;
}

/** How far a table moved from `base`: summed overlap and interval change, Hordes 1 to `last`. */
export function changeSize(base, rows, last) {
  const [a, b] = [perHorde(base, last), perHorde(rows, last)];
  let t = 0;
  for (let n = 1; n <= last; n++) {
    t += Math.abs(a[n].overlap - b[n].overlap) + Math.abs(a[n].interval - b[n].interval);
  }
  return t;
}

/**
 * Tables to try when Horde `h` is a cliff after Horde `h`-1: each moves one knob halfway
 * across the gap between the two hordes, so the step is smaller. Horde `h` slower (less
 * overlap, a longer interval) or Horde `h`-1 faster (more overlap, a shorter interval).
 * Staying inside the gap keeps rows only getting faster; tables that break a rule are
 * dropped. Empty when the two hordes already pace the same.
 */
export function candidates(rows, h, last) {
  // One horde past the last measured and the last row, so the rows after a move stay.
  const paces = perHorde(rows, Math.max(last, rows.at(-1).from) + 1);
  const [a, b] = [paces[h - 1], paces[h]];
  const moves = [
    [h, 'overlap', round((a.overlap + b.overlap) / 2)],
    [h - 1, 'overlap', round((a.overlap + b.overlap) / 2)],
    [h, 'interval', round((a.interval + b.interval) / 2)],
    [h - 1, 'interval', round((a.interval + b.interval) / 2)],
  ];
  const out = [];
  const seen = new Set();
  for (const [n, knob, value] of moves) {
    if (same(paces[n][knob], value)) continue;
    const next = paces.map((p, i) => (i === n ? { ...p, [knob]: value } : p));
    const cand = toRows(next);
    const key = tableKey(cand);
    if (seen.has(key) || tableProblems(cand).length > 0) continue;
    seen.add(key);
    out.push({ rows: cand, move: `Horde ${n} ${knob} ${paces[n][knob]} → ${value}` });
  }
  return out;
}

/** A table as one string, to spot one already tried. */
export function tableKey(rows) {
  return rows.map((r) => `${r.from}:${r.interval}:${r.break}:${r.overlap}`).join('|');
}

/** A table as `SQUAD_PACE`'s source, ready to paste into `src/core/pacing.ts`. */
export function formatTable(rows) {
  const n = (x) => String(Math.round(x * 1000) / 1000);
  const lines = rows.map(
    (r) =>
      `  { from: ${r.from}, interval: ${n(r.interval)}, break: ${n(r.break)}, overlap: ${n(r.overlap)} },`,
  );
  return ['export const SQUAD_PACE = [', ...lines, '];'].join('\n');
}

/** Per-horde numbers as a table, a miss marked on its line. */
export function formatStats(stats, from, to, found) {
  // Each column's width; a cell is padded to it (numbers right, Δ columns left).
  const cols = [
    ['Horde', 5],
    ['won', 5],
    ['lost (Δ)', 10],
    ['injured/try (Δ)', 15],
    ['wall loss', 9],
    ['few/some/heavy', 14],
    ['some lost', 9],
  ];
  const lines = [cols.map(([h, w]) => h.padEnd(w)).join('  ')];
  for (let n = from; n <= to; n++) {
    const s = stats[n];
    const p = n > from ? stats[n - 1] : null;
    const d = (x) => (x >= 0 ? `+${x}` : `${x}`);
    const lost = p ? `${s.lost} (${d(s.lost - p.lost)})` : `${s.lost}`;
    const inj = p
      ? `${s.injured.toFixed(2)} (${d(Number((s.injured - p.injured).toFixed(2)))})`
      : s.injured.toFixed(2);
    const mark = found
      .filter((m) => m.horde === n)
      .map((m) => `✗ ${m.kind}`)
      .join(', ');
    const cells = [
      String(n),
      `${s.won}/${s.tries}`,
      lost,
      inj,
      `${(s.wallLoss * 100).toFixed(0)}%`,
      `${s.bands.few}/${s.bands.some}/${s.bands.heavy}`,
      String(s.someLost),
    ].map((c, i) => c.padEnd(cols[i][1]));
    lines.push(`${cells.join('  ')}${mark ? `  ${mark}` : ''}`.trimEnd());
  }
  return lines.join('\n');
}
