// ID-197: every debug edit leaves a camp the save's own rules accept, so a debug state is one
// the game could have reached; and the debug slot never touches the player's save.
import { describe, expect, it } from 'vitest';
import {
  fillStash,
  grantGun,
  reachHorde,
  setCampLevel,
  setScrap,
  setSkill,
  setSquadSize,
  setSurvivorLevel,
  type DebugGame,
} from '../core/debug.ts';
import { SQUAD_CAP_MAX } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { campOf, squadOf, stashCap } from '../core/hordeonly.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

const ok = (r: DebugGame): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
};
const reread = (g: GameState): GameState | undefined => decodeSave(encodeSave(g, NOW))?.game;

describe('debug edits make saves the game accepts', () => {
  const at30 = ok(reachHorde(newGame('horde', 1), 30));

  it('a horde reached, a camp level, Scrap, a skill', () => {
    let g = at30;
    g = ok(setCampLevel(g, 50));
    g = ok(setScrap(g, 1_000_000));
    g = ok(setSkill(g, null));
    expect(reread(g)?.hordeNumber).toBe(30);
    expect(reread(g)?.stock.scrap).toBe(1_000_000);
    expect(reread(g)?.skillPick).toEqual([]);
  });

  it('a full squad at the top level, and a squad of one', () => {
    const big = ok(setSurvivorLevel(ok(setSquadSize(at30, SQUAD_CAP_MAX, 7)), null, 99));
    expect(squadOf(reread(big)!)).toHaveLength(SQUAD_CAP_MAX);
    const one = ok(setSquadSize(big, 1, 7));
    const back = reread(one)!;
    expect(squadOf(back)).toHaveLength(1);
    expect(campOf(back)).toHaveLength(SQUAD_CAP_MAX);
  });

  it('a granted gun at every rarity, and a full stash', () => {
    let g = ok(grantGun(at30, 'smg', 'relic', 3));
    g = ok(grantGun(g, 'smg', 'rusty', 3));
    g = ok(fillStash(g, stashCap(g), 5));
    expect(reread(g)?.armoury).toHaveLength(stashCap(g));
  });
});
