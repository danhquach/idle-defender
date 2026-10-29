// The balance report: npm run balance -- [seeds] [hordes] (each 1–100).
// Needs Node 22.6 or later: it runs the TypeScript core through Node's type stripping.
import { balanceReport } from '../src/core/sim.ts';

const [seeds = 20, hordes = 10] = process.argv.slice(2).map(Number);
try {
  console.log(balanceReport(seeds, hordes));
} catch (e) {
  console.error(e instanceof RangeError ? e.message : e);
  process.exitCode = 1;
}
