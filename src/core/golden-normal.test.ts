// ID-218: Normal must stay a no-op. Digests of a fresh horde, a played horde, its finish and
// result and the recommended power, recorded on main before difficulty modes landed, for a
// spread of Normal hordes plus a replay. Any change to Normal's numbers fails here.
import { describe, expect, it } from 'vitest';
import { finishSquadHorde, squadResult, startSquadHorde } from './hordeonly.ts';
import { playSquadHorde } from './sim.ts';
import { hordeHp, recommendedPower, squadPower } from './squadpower.ts';
import { squadAt } from './balance/shared.ts';

/** FNV-1a over the JSON text: enough to tell any change in the numbers. */
function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

/** Horde and the gun level of its squad: weak ones lose, strong ones win. */
const CASES: [number, number][] = [
  [1, 1],
  [4, 4],
  [5, 5],
  [10, 9],
  [20, 18],
  [30, 27],
  [45, 40],
  [50, 45],
  [20, 40],
  [30, 70],
  [50, 150],
];

/**
 * The recorded digests (main, before ID-218, Node 25 on arm64; re-recorded in ID-236, whose
 * wire rows carry a `broken` flag and heal and cut, a deliberate change to Normal; h45 and h50 re-recorded in
 * ID-265, whose research HP ramp (`SQUAD_RESEARCH_HP`, from Horde 30, so h30 and below are untouched) makes
 * Horde 31 on harder, on Node 25 only: NODE_22 below has no entry for them yet, so CI's Node 22 may differ
 * and its values are to be taken from CI). A few long fights end a tick or
 * two apart on another Node (its Math functions round their last bit differently, which is why
 * the balance cache is keyed on Node's version too), so CI's Node 22 has its own entries below.
 */
const GOLDEN: Record<string, string> = {
  'h1-L1-won': '4ee18ea1:11963',
  'h10-L9-won': 'ef1621d1:19861',
  'h20-L18-lost': 'a0b25325:40770',
  'h20-L40-won': 'dc332c3b:19974',
  'h30-L27-lost': 'b3a5ad9a:52048',
  'h30-L70-won': 'a3ae8f65:20098',
  'h4-L4-won': '5d28da43:17014',
  'h45-L40-lost': '78f81250:73246',
  'h5-L5-won': '1cfda751:18606',
  'h50-L150-won': 'd8b5f0b9:20162',
  'h50-L45-lost': 'c25f1204:41775',
  // ID-285: every entry re-recorded locally (Node 25): Toxin Rounds joins every fight's offer pool, so the
  // offers (and the RNG) shift; with it left out of the pool the ID-287 values below reproduce exactly
  // (e0c6024f:11933 for h1, a0092725:13581 for the replay).
  // ID-287: every entry but h1 re-recorded locally (Node 25): non-fighting jobs reload slower.
  // CI (Node 22) confirms them; where it differs there, its value goes in NODE_22.
  'replay-won': '4ce48d19:13596',
};

/**
 * CI's runtime (Node 22 on x64): the digests that differ there. Taken from the branch on CI
 * (re-taken in ID-236), the same code path that matches main above byte for byte on Node 25.
 */
const NODE_22: Record<string, string> = {
  // ID-285: the two ID-287 entries (6a4c509b:43605, 7bdc1b5e:19899) are stale after the offer reshuffle;
  // to be taken from the branch on CI.
};

/** Node's major version: picks the digests recorded on that runtime. */
const nodeMajor = Number(process.versions.node.split('.')[0]);
const EXPECTED = nodeMajor === 22 ? { ...GOLDEN, ...NODE_22 } : GOLDEN;

describe('Normal is unchanged by difficulty modes (ID-218)', () => {
  it('matches the digests recorded before modes', () => {
    const out: Record<string, string> = {};
    for (const [n, level] of CASES) {
      const game = squadAt(n, level);
      const fresh = startSquadHorde(game, 11, 0);
      const horde = playSquadHorde(game, 11, undefined, undefined, n);
      out[`h${n}-L${level}-${horde.outcome}`] = digest({
        fresh,
        horde,
        next: finishSquadHorde(game, horde),
        result: squadResult(game, horde),
        power: squadPower(game),
        rec: recommendedPower(n),
        hp: hordeHp(n),
      });
    }
    // A replay of Horde 10 from a game at Horde 30.
    const far = squadAt(30, 20);
    const replay = playSquadHorde(far, 5, undefined, undefined, 10);
    out[`replay-${replay.outcome}`] = digest({
      replay,
      next: finishSquadHorde(far, replay),
      result: squadResult(far, replay),
    });
    expect(out).toEqual(EXPECTED);
  }, 600_000);
});
