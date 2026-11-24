// ID-232: the press-and-hold state machine, with fake timers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHold } from './hold.ts';

afterEach(() => vi.useRealTimers());

function make() {
  vi.useFakeTimers();
  let holds = 0;
  const hold = createHold(500, () => holds++);
  return { hold, holds: () => holds };
}

describe('createHold (ID-232)', () => {
  it('fires once when the time runs out, and the release after is a hold, not a tap', () => {
    const { hold, holds } = make();
    hold.down();
    expect(hold.pending).toBe(true);
    vi.advanceTimersByTime(499);
    expect(holds()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(holds()).toBe(1);
    expect(hold.pending).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(holds()).toBe(1);
    expect(hold.up()).toBe('hold');
    expect(hold.outcome).toBe('hold');
  });

  it('a release before the time is a tap and fires nothing', () => {
    const { hold, holds } = make();
    hold.down();
    vi.advanceTimersByTime(300);
    expect(hold.up()).toBe('tap');
    vi.advanceTimersByTime(1000);
    expect(holds()).toBe(0);
    expect(hold.outcome).toBe('tap');
  });

  it('ignores a repeated down: one hold is one firing, from the first down', () => {
    const { hold, holds } = make();
    hold.down();
    vi.advanceTimersByTime(300);
    hold.down();
    vi.advanceTimersByTime(300);
    expect(holds()).toBe(1);
    hold.down();
    vi.advanceTimersByTime(2000);
    expect(holds()).toBe(1);
  });

  it('a cancel stops the firing, and is no tap', () => {
    const { hold, holds } = make();
    hold.down();
    vi.advanceTimersByTime(300);
    hold.cancel();
    vi.advanceTimersByTime(1000);
    expect(holds()).toBe(0);
    expect(hold.outcome).toBe('cancel');
    expect(hold.up()).toBeNull();
  });

  it('a cancel after the firing keeps it a hold; one after a release changes nothing', () => {
    const { hold } = make();
    hold.down();
    vi.advanceTimersByTime(600);
    hold.cancel();
    expect(hold.outcome).toBe('hold');
    hold.down();
    hold.up();
    hold.cancel();
    expect(hold.outcome).toBe('tap');
  });

  it('up with no press down is nothing', () => {
    const { hold } = make();
    expect(hold.up()).toBeNull();
    expect(hold.outcome).toBeNull();
  });

  it('each down starts clean: a hold that was never followed by a click leaves nothing behind', () => {
    const { hold, holds } = make();
    hold.down();
    vi.advanceTimersByTime(600);
    expect(hold.outcome).toBe('hold');
    // No click came (the skill was cooling); the next press is its own.
    hold.up();
    hold.down();
    expect(hold.outcome).toBeNull();
    vi.advanceTimersByTime(100);
    expect(hold.up()).toBe('tap');
    expect(holds()).toBe(1);
  });

  it('works with an injected timer', () => {
    const fns: (() => void)[] = [];
    let stopped = 0;
    let fired = 0;
    const hold = createHold(
      500,
      () => fired++,
      (fn) => {
        fns.push(fn);
        return () => void stopped++;
      },
    );
    hold.down();
    hold.up();
    expect(stopped).toBe(1);
    hold.down();
    fns[1]!();
    expect(fired).toBe(1);
  });
});
