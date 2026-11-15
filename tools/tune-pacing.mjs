// The pacing tuner (ID-172): npm run tune:pacing -- [--apply] [from] [to] [candidates]
// Plays the balance seeds' horde-only campaigns (the horde-only balance test's), prints Hordes
// `from` to `to` (default 5–8) for the current `SQUAD_PACE`, and where a horde misses ID-171's
// targets tries nearby tables, at most `candidates` (default 16, about 40 s each), printing
// the best one found. Candidate tables are swapped into the loaded module in memory. Without
// `--apply` it writes nothing; with it, a table that meets every target (and nothing the
// balance test checks but the search can't) is written into src/core/pacing.ts with its
// numbers. Needs Node 22.6 or later (type stripping); the npm script runs it under `nice -n 19`.
import { readFileSync, writeFileSync } from 'node:fs';
import { SEEDS } from '../src/core/balance/shared.ts';
import { SQUAD_PACE } from '../src/core/pacing.ts';
import { playSquadCampaign } from '../src/core/sim.ts';
import { injuryBand, recommendedPower } from '../src/core/squadpower.ts';
import {
  applyTable,
  better,
  candidates,
  changeSize,
  formatStats,
  formatTable,
  hordeStats,
  measuredLines,
  misses,
  parseArgs,
  score,
  tableKey,
  tableProblems,
  warnings,
  withTable,
} from './pacing-search.mjs';

const PACING = new URL('../src/core/pacing.ts', import.meta.url);
/** `pacing.ts` as the run loaded it: `--apply` won't overwrite edits made during a run. */
const START = readFileSync(PACING, 'utf8');

/** Plays every seed (the horde-only test's) with `rows` as the table; each horde's stats. */
function evaluate(rows, from, to) {
  return withTable(SQUAD_PACE, rows, () => {
    const campaigns = [];
    for (let i = 1; i <= SEEDS; i++) campaigns.push(playSquadCampaign(i * 1000, to));
    const stats = [];
    for (let n = from; n <= to; n++) {
      const rec = recommendedPower(n);
      const runs = campaigns.map((c) => {
        const r = c.find((x) => x.hordeNumber === n && !x.replay);
        if (!r) throw new Error(`a campaign never reached Horde ${n}`);
        return { ...r, band: injuryBand(r.power, rec) };
      });
      stats[n] = hordeStats(runs);
    }
    return stats;
  });
}

/** A table's stats, misses and warnings printed. */
function report(rows, stats, found, from, to) {
  console.log(`${formatTable(rows)}\n`);
  console.log(formatStats(stats, from, to, found));
  for (const w of warnings(stats, from, to)) console.log(`Note: ${w}`);
}

function main() {
  const { from, to, cap, apply } = parseArgs(process.argv.slice(2));
  const base = SQUAD_PACE.map((r) => ({ ...r }));
  const t0 = Date.now();
  const seconds = () => Math.round((Date.now() - t0) / 1000);
  // Progress to stderr, so stdout holds only the report.
  const log = (s) => console.error(s);

  const baseRules = tableProblems(base);
  if (baseRules.length > 0) log(`The current table breaks its rules: ${baseRules.join('; ')}`);
  log(`Playing ${SEEDS} seeds to Horde ${to} with the current table…`);
  const baseStats = evaluate(base, from, to);
  const baseMisses = misses(baseStats, from, to);
  const each = seconds();
  console.log(`Current SQUAD_PACE (${each} s):`);
  report(base, baseStats, baseMisses, from, to);
  if (baseMisses.length === 0) {
    console.log('\nEvery horde meets the targets: no row to change.');
    // Keeps the numbers written beside the rows current.
    if (apply) write(base, baseStats, from, to);
    return;
  }
  log(`Searching: up to ${cap} candidate(s), about ${Math.ceil((cap * each) / 60)} min at most.`);

  let best = { rows: base, stats: baseStats, found: baseMisses, score: score(baseMisses, 0) };
  const tried = new Set([tableKey(base)]);
  let left = cap;
  while (left > 0 && best.found.length > 0) {
    // The earliest cliff with something left to try: a fix there moves every horde after it.
    let next = [];
    for (const h of new Set(best.found.map((m) => m.horde))) {
      next = candidates(best.rows, h, to).filter((c) => !tried.has(tableKey(c.rows)));
      if (next.length > 0) break;
    }
    if (next.length === 0) break;
    let stepBest = null;
    for (const c of next) {
      if (left === 0) break;
      left--;
      tried.add(tableKey(c.rows));
      let stats;
      try {
        stats = evaluate(c.rows, from, to);
      } catch (e) {
        // A table that stalls a campaign (ID-147's rest spiral, its fight cap) is no answer.
        log(`  ${c.move}: unplayable, skipped (${e instanceof Error ? e.message : e})`);
        continue;
      }
      const found = misses(stats, from, to);
      const s = score(found, changeSize(base, c.rows, to));
      log(`  ${c.move}: ${found.length} miss(es) (${seconds()} s, ${left} left)`);
      if (!stepBest || better(s, stepBest.score)) {
        stepBest = { rows: c.rows, stats, found, score: s };
      }
    }
    if (!stepBest || !better(stepBest.score, best.score)) break;
    best = stepBest;
  }

  const tries = cap - left;
  if (best.rows === base) {
    console.log(
      `\nNo candidate met the targets or improved on the current table (${tries} tried).`,
    );
    return;
  }
  // `candidates` drops a table that breaks a rule; a last guard before printing one.
  const rules = tableProblems(best.rows);
  if (rules.length > 0) {
    throw new Error(`a suggestion broke the table's rules: ${rules.join('; ')}`);
  }
  if (best.found.length === 0) {
    console.log(`\nSuggested SQUAD_PACE (${tries} candidate(s), ${seconds()} s):`);
  } else {
    console.log(`\nNo candidate met the targets (${tries} tried, ${seconds()} s); the closest:`);
  }
  report(best.rows, best.stats, best.found, from, to);
  if (best.found.length > 0) {
    if (apply) console.log('\nNot applied: it misses a target. pacing.ts is unchanged.');
    return;
  }
  if (apply) write(best.rows, best.stats, from, to);
  else console.log('\nRun again with --apply to write it into src/core/pacing.ts.');
}

/**
 * `--apply`: writes `rows` and their measured numbers into `pacing.ts`, unless something the
 * balance test checks can't be vouched for (`warnings`).
 */
function write(rows, stats, from, to) {
  const held = warnings(stats, from, to);
  if (held.length > 0) {
    console.log('\nNot applied: the notes above mean the balance test may not hold it.');
    return;
  }
  const before = readFileSync(PACING, 'utf8');
  if (before !== START) {
    console.log('\nNot applied: pacing.ts changed during the run. Run again on the new file.');
    return;
  }
  const after = applyTable(before, rows, measuredLines(stats, from, to));
  if (after === before) {
    console.log('\npacing.ts already holds this table and its numbers.');
    return;
  }
  writeFileSync(PACING, after);
  console.log(
    '\nApplied to src/core/pacing.ts. Check it with `git diff src/core/pacing.ts`, then run' +
      ' `npm test` and `npm run test:balance`; design.md §9 still quotes the old ramp.',
  );
}

try {
  main();
} catch (e) {
  console.error(e instanceof RangeError ? e.message : e);
  process.exitCode = 1;
}
