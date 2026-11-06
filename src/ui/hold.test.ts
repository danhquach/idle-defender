// @vitest-environment jsdom
// ID-096: holding a + stat button keeps adding points. A short press adds exactly 1; held
// past HOLD.delay it adds 1 every HOLD.every until release, sliding off, a scroll
// (pointercancel), no points left, or the button leaving the page. Enter and Space too.
// The buttons re-render on each spend, so a hold follows a button by its key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD, HOLD_ATTR, holdable, holdRepeat } from './hold.ts';

/** A pointer event (jsdom has no PointerEvent): a MouseEvent with the pointer fields. */
function pointer(target: EventTarget, type: string, pointerId = 1, pointerType = 'mouse'): Event {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperties(e, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  target.dispatchEvent(e);
  return e;
}
const key = (target: EventTarget, type: string, k: string, repeat = false): KeyboardEvent => {
  const e = new KeyboardEvent(type, { key: k, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

/** What `elementFromPoint` finds (jsdom has none). */
let under: Element | null = null;

/**
 * A panel of + buttons that, like the game's, redraws on every spend. `left` points to
 * spend; each spend redraws, and the + buttons go disabled at 0.
 */
function panel(left: number) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const spent: string[] = [];
  const stop = holdRepeat(root);
  const draw = (): void => {
    const buttons = ['instinct', 'tinker'].map((stat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `+ ${stat}`;
      b.disabled = stat === 'tinker' || left <= 0;
      holdable(b, `bob:${stat}`);
      b.addEventListener('click', () => {
        if (b.disabled || left <= 0) return;
        left -= 1;
        spent.push(stat);
        draw();
      });
      return b;
    });
    root.replaceChildren(...buttons);
  };
  draw();
  const plus = (stat = 'instinct') =>
    root.querySelector<HTMLButtonElement>(`[${HOLD_ATTR}="bob:${stat}"]`)!;
  return { root, spent, plus, stop, left: () => left };
}

beforeEach(() => {
  vi.useFakeTimers();
  under = null;
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => under,
  });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.useRealTimers();
});

/** Presses the + down, holds it `ms`, and lets go with its click (as a browser does). */
function hold(p: ReturnType<typeof panel>, ms: number): void {
  const first = p.plus();
  under = first;
  pointer(first, 'pointerdown');
  vi.advanceTimersByTime(ms);
  const now = p.plus();
  pointer(now, 'pointerup');
  now.click();
}

describe('hold to add (ID-096)', () => {
  it('a short press adds exactly 1 point', () => {
    const p = panel(10);
    hold(p, HOLD.delay - 50);
    expect(p.spent).toEqual(['instinct']);
    // A click with no press at all (a screen reader's) adds 1 too.
    p.plus().click();
    expect(p.spent).toHaveLength(2);
  });

  it('held, it adds 1 at the delay and 1 every step after, and its release adds none', () => {
    const p = panel(10);
    // 400 ms: 1; then +333, +666, +999: 3 more.
    hold(p, HOLD.delay + 3 * HOLD.every + 10);
    expect(p.spent).toHaveLength(4);
    expect(HOLD.every).toBeGreaterThan(300); // about 3 a second, steady
    // The next short press is a plain 1 again.
    hold(p, 100);
    expect(p.spent).toHaveLength(5);
  });

  it('stops when points run out, never adding one the survivor does not have', () => {
    const p = panel(3);
    hold(p, HOLD.delay + 20 * HOLD.every);
    expect(p.spent).toHaveLength(3);
    expect(p.left()).toBe(0);
  });

  it('stops when the pointer slides off, or a touch turns into a scroll', () => {
    const p = panel(10);
    under = p.plus();
    pointer(p.plus(), 'pointerdown');
    vi.advanceTimersByTime(HOLD.delay + 10);
    expect(p.spent).toHaveLength(1);
    under = document.body;
    pointer(document, 'pointermove');
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(p.spent).toHaveLength(1);

    const q = panel(10);
    under = q.plus();
    pointer(q.plus(), 'pointerdown');
    pointer(q.plus(), 'pointercancel'); // the browser took the touch to scroll
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(q.spent).toEqual([]);
  });

  it('a move that stays on the same button (redrawn under it) keeps the hold', () => {
    const p = panel(10);
    under = p.plus();
    pointer(p.plus(), 'pointerdown');
    vi.advanceTimersByTime(HOLD.delay + 10);
    under = p.plus(); // the redrawn button, same key
    pointer(document, 'pointermove');
    vi.advanceTimersByTime(HOLD.every);
    expect(p.spent).toHaveLength(2);
  });

  it('stops when the screen closes or the button leaves the page', () => {
    const p = panel(10);
    under = p.plus();
    pointer(p.plus(), 'pointerdown');
    vi.advanceTimersByTime(HOLD.delay + 10);
    p.root.hidden = true;
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(p.spent).toHaveLength(1);

    const q = panel(10);
    pointer(q.plus(), 'pointerdown');
    q.root.remove();
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(q.spent).toEqual([]);
  });

  it('the locked button ignores holds', () => {
    const p = panel(10);
    pointer(p.plus('tinker'), 'pointerdown');
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(p.spent).toEqual([]);
  });

  it('Enter or Space: a tap adds 1, held it repeats, and the key repeat adds nothing more', () => {
    for (const k of ['Enter', ' ']) {
      const p = panel(10);
      const down = key(p.plus(), 'keydown', k);
      // The browser's own activation is replaced by the hold's.
      expect(down.defaultPrevented).toBe(true);
      key(window, 'keyup', k);
      expect(p.spent, `tap ${k}`).toHaveLength(1);

      p.plus().focus();
      key(p.plus(), 'keydown', k);
      for (let i = 0; i < 10; i++) key(p.plus(), 'keydown', k, true); // OS key repeat
      vi.advanceTimersByTime(HOLD.delay + 2 * HOLD.every + 10);
      key(window, 'keyup', k);
      expect(p.spent, `hold ${k}`).toHaveLength(1 + 3);
    }
  });

  it('a keyboard hold survives the redraw moving focus to the new button, and ends if focus leaves', () => {
    const p = panel(10);
    // Like the game's pickers: after each spend, focus goes to the redrawn + with the same key.
    p.root.addEventListener('click', () => p.plus().focus());
    p.plus().focus();
    key(p.plus(), 'keydown', ' ');
    vi.advanceTimersByTime(HOLD.delay + 2 * HOLD.every + 10);
    expect(p.spent).toHaveLength(3);
    // Focus moved away (a Tab): the hold ends, though the key is still down.
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(p.spent).toHaveLength(3);
    key(window, 'keyup', ' ');
    expect(p.spent).toHaveLength(3);
  });

  it('a touch long press opens no menu; a mouse right-click menu is left alone', () => {
    const p = panel(10);
    const menu = () => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      p.plus().dispatchEvent(e);
      return e.defaultPrevented;
    };
    pointer(p.plus(), 'pointerdown', 1, 'mouse');
    expect(menu()).toBe(false);
    pointer(p.plus(), 'pointerup', 1, 'mouse');
    pointer(p.plus(), 'pointerdown', 2, 'touch');
    expect(menu()).toBe(true);
  });

  it('a key tapped during a mouse press adds nothing; a cancelled press leaves the next tap alone', () => {
    const p = panel(10);
    under = p.plus();
    pointer(p.plus(), 'pointerdown');
    key(window, 'keydown', 'Enter');
    key(window, 'keyup', 'Enter');
    expect(p.spent).toEqual([]);
    pointer(p.plus(), 'pointerup');
    p.plus().click();
    expect(p.spent).toEqual(['instinct']);
    // A hold that a scroll cancelled sends no click; a tap right after still counts.
    pointer(p.plus(), 'pointerdown');
    vi.advanceTimersByTime(HOLD.delay + 10);
    pointer(p.plus(), 'pointercancel');
    expect(p.spent).toHaveLength(2);
    p.plus().click();
    expect(p.spent).toHaveLength(3);
  });

  it('stopping the listener ends a hold', () => {
    const p = panel(10);
    pointer(p.plus(), 'pointerdown');
    p.stop();
    vi.advanceTimersByTime(5 * HOLD.every);
    expect(p.spent).toEqual([]);
  });
});
