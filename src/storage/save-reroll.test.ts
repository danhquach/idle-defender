// ID-252: a rerolled map is a map the save already reads. A reroll and a report at the draw cap
// still write a loadable save, and a hostile map (a kind twice, an extra key, a count past the
// cap) is still refused.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { MAP_DRAWS_MAX } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { rerollMap, sendMapPatrol, takeReport, withMap } from '../core/scout.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function camp(drawn?: number): GameState {
  const g = newGame('horde');
  const base = withMap(
    {
      ...g,
      hordeNumber: 9,
      roster: [recruit(1)],
      reserve: [2, 3, 4].map((n) => recruit(n)),
      camp: { ...g.camp, recruits: 4 },
      stock: { ...g.stock, scrap: 500 },
    },
    123,
  );
  return drawn === undefined ? base : { ...base, map: { ...base.map!, drawn } };
}

const rerolled = (g: GameState): GameState => {
  const r = rerollMap(g);
  if (!r.ok) throw new Error(r.code);
  return r.game;
};

/** The save of `game`, changed by `change`, read back. */
function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: a rerolled map (ID-252)', () => {
  it('round-trips, with a patrol kept', () => {
    const g = camp();
    const sent = sendMapPatrol(g, g.map!.areas[1]!.kind, ['recruit-2'], 9, NOW);
    if (!sent.ok) throw new Error(sent.code);
    const next = rerolled(sent.game);
    expect(reread(next)?.game).toEqual(next);
  });

  it('a reroll at the cap loads, and so does one a draw below it', () => {
    for (const drawn of [MAP_DRAWS_MAX - 1, MAP_DRAWS_MAX]) {
      const next = rerolled(camp(drawn));
      expect(next.map!.drawn).toBe(MAP_DRAWS_MAX);
      expect(reread(next)?.game).toEqual(next);
    }
  });

  it('a report taken at the cap loads', () => {
    for (const drawn of [MAP_DRAWS_MAX - 1, MAP_DRAWS_MAX]) {
      const g = camp(drawn);
      const sent = sendMapPatrol(g, g.map!.areas[0]!.kind, ['recruit-2'], 9, NOW);
      if (!sent.ok) throw new Error(sent.code);
      const p = sent.game.map!.patrols[0]!;
      const t = takeReport(sent.game, p.area, p.backAt);
      if (!t.ok) throw new Error(t.code);
      expect(reread(t.game)?.game).toEqual(t.game);
    }
  });
});

describe('save: hostile maps after a reroll (ID-252)', () => {
  const bad: [string, (s: Loose) => void][] = [
    ['a kind twice', (s) => (s.map.areas[1].kind = s.map.areas[0].kind)],
    ['an extra key on the map', (s) => (s.map.rerolls = 1)],
    ['an extra key on an area', (s) => (s.map.areas[0].was = 'police')],
    ['a draw count past the cap', (s) => (s.map.drawn = MAP_DRAWS_MAX + 1)],
    ['a draw count below the areas drawn', (s) => (s.map.drawn = 3)],
  ];
  for (const [what, change] of bad) {
    it(`refuses ${what}`, () => {
      expect(reread(rerolled(camp()), change)).toBeNull();
    });
  }

  it('the good save still loads (the checks are not vacuous)', () => {
    expect(reread(rerolled(camp()))).not.toBeNull();
  });
});
