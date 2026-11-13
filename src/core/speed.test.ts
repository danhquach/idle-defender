// ID-062, ID-145: game speed runs more of the core's fixed steps per frame, never longer
// ones, so a seed plays out the same at 1×, 3× and 5×, picks and replacements included.
import { describe, expect, it } from 'vitest';
import { MUZZLE_FLASH, STEP } from './data.ts';
import { newGame, startHorde } from './game.ts';
import { tick, type HordeState } from './horde.ts';
import { answerOffer, opening } from './sim.ts';

/** A 20 fps frame: 1.5 fixed steps at 1×, so the core's carry-over is exercised. */
const FRAME = 1 / 20;

/** Horde 1 played to the end as the game loop does at `speed`, with the scripted player. */
function play(speed: number): { end: HordeState; frames: number; picks: number[] } {
  const game = newGame();
  const { defenderId, postId } = opening(game, 0);
  let s = startHorde(game, 7, defenderId, postId, 0);
  let frames = 0;
  const picks: number[] = [];
  while (s.outcome === 'fighting') {
    if (s.offer || s.replace) {
      picks.push(s.time);
      s = answerOffer(s);
    } else {
      s = tick(s, FRAME * speed);
      frames++;
    }
    if (frames > 100_000) throw new Error('never ended');
  }
  return { end: s, frames, picks };
}

/** The finished fight without the core's carry-over, which is the only part frame size touches. */
const settled = (s: HordeState) => ({ ...s, acc: 0 });

describe('game speed (ID-062)', () => {
  it('the same seed gives the same fight at 1×, 3× and 5×', () => {
    const [one, three, five] = [1, 3, 5].map(play);
    expect(one!.picks.length).toBeGreaterThan(0);
    for (const run of [three!, five!]) {
      expect(settled(run.end)).toEqual(settled(one!.end));
      // Every pick came at the same fight time: none skipped or run past at speed.
      expect(run.picks).toEqual(one!.picks);
    }
    // And it took about a third and a fifth of the frames.
    expect(three!.frames / one!.frames).toBeCloseTo(1 / 3, 1);
    expect(five!.frames / one!.frames).toBeCloseTo(1 / 5, 1);
  });

  it('at 5× every muzzle flash is still on screen for a frame at 50 fps and up (ID-145)', () => {
    /** Each shot of Horde 1 still flashing at the end of some frame of `frame` s, at `speed`×. */
    const seen = (speed: number, frame: number): Set<string> => {
      const game = newGame();
      const { defenderId, postId } = opening(game, 0);
      let s = startHorde(game, 7, defenderId, postId, 0);
      const shots = new Set<string>();
      while (s.outcome === 'fighting') {
        s = s.offer || s.replace ? answerOffer(s) : tick(s, frame * speed);
        for (const k of s.shots) if (s.time - k.at < MUZZLE_FLASH) shots.add(`${k.owner}@${k.at}`);
      }
      return shots;
    };
    // Every shot of the fight: one step a frame sees them all.
    const all = seen(1, STEP);
    expect(all.size).toBeGreaterThan(50);
    expect(seen(5, 1 / 60)).toEqual(all);
    expect(seen(5, 1 / 50)).toEqual(all);
    // Slower than that, a frame can run 4 steps and drop a flash unseen.
    expect(seen(5, 1 / 40).size).toBeLessThan(all.size);
  });

  it('a frame at 5× runs five times the fixed steps, each one STEP long', () => {
    const game = newGame();
    const { defenderId, postId } = opening(game, 0);
    const s = startHorde(game, 7, defenderId, postId, 0);
    const after = tick(s, 5 * 3 * STEP);
    expect(after.time).toBeCloseTo(15 * STEP, 9);
  });
});
