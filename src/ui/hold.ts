// ID-232: press and hold, shared by the Airstrike's button (pointer) and its key (Q).
// A press that lasts `ms` fires `onHold` once; a press let go sooner is a tap. Pure: the
// timer is injected, so it is unit-tested with fake timers and touches no DOM.

/** How a press ended, or null while there is none since the last `down`. */
export type HoldOutcome = 'tap' | 'hold' | 'cancel' | null;

export interface Hold {
  /** A press begins. Ignored while one is already down (a key's auto-repeat). */
  down(): void;
  /** The press is let go: 'hold' if the time ran out first, else 'tap'; null if none was down. */
  up(): 'tap' | 'hold' | null;
  /** The press is abandoned (pointer left or cancelled, window blurred); a no-op once let go. */
  cancel(): void;
  /** Whether a press is down and its time has not run out. */
  readonly pending: boolean;
  /**
   * How the last press ended, kept until the next `down`: a click that follows asks this,
   * so there is no separate flag that could go stale.
   */
  readonly outcome: HoldOutcome;
}

/** A timer: runs `fn` after `ms`; the returned function stops it. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

const realTimer: SetTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createHold(ms: number, onHold: () => void, setTimer: SetTimer = realTimer): Hold {
  let down = false;
  let stop: (() => void) | null = null;
  let outcome: HoldOutcome = null;
  const clear = (): void => {
    stop?.();
    stop = null;
  };
  return {
    down() {
      if (down) return;
      down = true;
      outcome = null;
      stop = setTimer(() => {
        stop = null;
        outcome = 'hold';
        onHold();
      }, ms);
    },
    up() {
      if (!down) return null;
      down = false;
      clear();
      // A press whose time ran out is 'hold' already; otherwise it was let go early.
      if (outcome === null) outcome = 'tap';
      return outcome === 'hold' ? 'hold' : 'tap';
    },
    cancel() {
      // Once let go, a later leave or cancel (touch fires one after the up) changes nothing.
      if (!down) return;
      down = false;
      clear();
      if (outcome === null) outcome = 'cancel';
    },
    get pending() {
      return down && outcome === null;
    },
    get outcome() {
      return outcome;
    },
  };
}
