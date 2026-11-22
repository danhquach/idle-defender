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

/** The recorded digests (main, before ID-218). */
const GOLDEN: Record<string, string> = {
  'h1-L1-won': '7716a413:11633',
  'h10-L9-won': 'a90bffdb:19849',
  'h20-L18-lost': 'aa6aedb6:38599',
  'h20-L40-won': 'cc8318e8:19641',
  'h30-L27-lost': '20e96baf:46540',
  'h30-L70-won': '6781a7b4:19697',
  'h4-L4-won': '5ea6a95c:16565',
  'h45-L40-lost': 'a0929863:43760',
  'h5-L5-won': 'c085e57e:18143',
  'h50-L150-won': 'fe553611:19642',
  'h50-L45-lost': 'ed683d3a:44706',
  'replay-won': '28bdfc6c:13530',
};

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
    expect(out).toEqual(GOLDEN);
  }, 600_000);
});
