// ID-062: game speed runs more of the core's fixed steps per frame, never longer ones, so
// a seed plays out the same at 1×, 2× and 3×, picks and replacements included.
import { describe, expect, it } from 'vitest';
import { STEP } from './data.ts';
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
  it('the same seed gives the same fight at 1×, 2× and 3×', () => {
    const [one, two, three] = [1, 2, 3].map(play);
    expect(one!.picks.length).toBeGreaterThan(0);
    for (const run of [two!, three!]) {
      expect(settled(run.end)).toEqual(settled(one!.end));
      // Every pick came at the same fight time: none skipped or run past at speed.
      expect(run.picks).toEqual(one!.picks);
    }
    // And it took about a half and a third of the frames.
    expect(two!.frames / one!.frames).toBeCloseTo(1 / 2, 1);
    expect(three!.frames / one!.frames).toBeCloseTo(1 / 3, 1);
  });

  it('a frame at 3× runs three times the fixed steps, each one STEP long', () => {
    const game = newGame();
    const { defenderId, postId } = opening(game, 0);
    const s = startHorde(game, 7, defenderId, postId, 0);
    const after = tick(s, 3 * 3 * STEP);
    expect(after.time).toBeCloseTo(9 * STEP, 9);
  });
});
