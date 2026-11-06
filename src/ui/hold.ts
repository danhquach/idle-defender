// Hold to repeat (ID-096): a + stat button keeps adding points while held. A short press
// is the button's own click (1 point). Held past `HOLD.delay`, it clicks once, then once
// every `HOLD.every`, until the press ends: release, the pointer or finger sliding off,
// a touch turning into a scroll (pointercancel), the button going disabled (no points
// left) or leaving the page (the screen closed). Holding Enter or Space does the same.
//
// Spending re-renders the buttons, so a hold follows a button by its `data-hold` key on
// a container that stays put (`root`), and each repeat clicks whichever button carries
// that key now. The press's own click, which the browser sends on release, is dropped
// once the hold has repeated.

/** Hold timing: the first repeat after `delay` ms, then one every `every` ms (about 3 a second). */
export const HOLD = { delay: 400, every: 333 } as const;

/** How long after a hold ends its release click may still arrive (and is dropped), in ms. */
const SWALLOW_MS = 300;

/** The attribute that marks a button as holdable; its value is the button's stable key. */
export const HOLD_ATTR = 'data-hold';

/** CSS that keeps a long press from opening the touch menu or selecting text. */
export const HOLD_CLASS = 'hold-repeat';

/** Marks `button` holdable under key `key`. */
export function holdable(button: HTMLButtonElement, key: string): void {
  button.setAttribute(HOLD_ATTR, key);
  button.classList.add(HOLD_CLASS);
}

/** Starts listening for holds on `root`'s holdable buttons. Returns a function that stops it. */
export function holdRepeat(root: HTMLElement): () => void {
  const win = root.ownerDocument.defaultView!;
  let key: string | null = null;
  let pointer: number | null = null;
  let timer: number | null = null;
  /** Whether the hold came from Enter or Space, and whether the last press was a touch. */
  let byKey = false;
  let touch = false;
  /** Whether the current press has repeated, so its own click is dropped. */
  let repeated = false;
  /** Until when (ms) the browser's click is dropped: the release of a press that repeated. */
  let swallowUntil = 0;
  /** Set while this hold clicks a button itself, so that click always goes through. */
  let ours = false;
  const fire = (b: HTMLButtonElement): void => {
    ours = true;
    try {
      b.click();
    } finally {
      ours = false;
    }
  };

  const current = (): HTMLButtonElement | null => {
    if (key === null) return null;
    for (const b of root.querySelectorAll<HTMLButtonElement>(`[${HOLD_ATTR}]`)) {
      if (b.getAttribute(HOLD_ATTR) === key) return b;
    }
    return null;
  };
  /** A button that can take a point now: on the page, shown and enabled. */
  const live = (b: HTMLButtonElement | null): b is HTMLButtonElement =>
    b !== null && b.isConnected && !b.disabled && b.closest('[hidden]') === null;

  const stop = (): void => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    if (repeated) swallowUntil = win.performance.now() + SWALLOW_MS;
    key = null;
    pointer = null;
    byKey = false;
    repeated = false;
  };
  const tick = (): void => {
    const b = current();
    if (!live(b)) return stop();
    repeated = true;
    fire(b);
    timer = live(current()) ? win.setTimeout(tick, HOLD.every) : null;
    if (timer === null) stop();
  };
  const start = (b: HTMLButtonElement, viaKey: boolean): void => {
    stop();
    swallowUntil = 0;
    byKey = viaKey;
    key = b.getAttribute(HOLD_ATTR);
    timer = win.setTimeout(tick, HOLD.delay);
  };
  const holdButton = (t: EventTarget | null): HTMLButtonElement | null => {
    const b =
      t instanceof win.Element ? t.closest<HTMLButtonElement>(`button[${HOLD_ATTR}]`) : null;
    return b && root.contains(b) && !b.disabled ? b : null;
  };

  const down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const b = holdButton(e.target);
    touch = e.pointerType === 'touch';
    if (!b) return;
    start(b, false);
    pointer = e.pointerId;
  };
  const end = (e: PointerEvent): void => {
    if (pointer !== null && e.pointerId === pointer) stop();
  };
  /** A cancelled press (a scroll took it) sends no click, so none is waited for. */
  const cancel = (e: PointerEvent): void => {
    if (pointer === null || e.pointerId !== pointer) return;
    stop();
    swallowUntil = 0;
  };
  /** The pointer slid off the held button (a re-render keeps the same key under it). */
  const move = (e: PointerEvent): void => {
    if (pointer === null || e.pointerId !== pointer) return;
    const under = root.ownerDocument.elementFromPoint(e.clientX, e.clientY);
    const b = holdButton(under);
    if (!b || b.getAttribute(HOLD_ATTR) !== key) {
      // Released off the button, the press sends no click: none is waited for.
      stop();
      swallowUntil = 0;
    }
  };
  const click = (e: MouseEvent): void => {
    // Only the browser's own click; each of ours goes through.
    if (ours || !holdButton(e.target)) return;
    if (repeated || win.performance.now() < swallowUntil) {
      swallowUntil = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const isPress = (e: KeyboardEvent): boolean => e.key === 'Enter' || e.key === ' ';
  const keydown = (e: KeyboardEvent): void => {
    const b = holdButton(e.target);
    if (!b || !isPress(e)) return;
    // The keyboard's own click (Enter on down, Space on up) is replaced by ours.
    e.preventDefault();
    if (e.repeat || key !== null) return;
    start(b, true);
  };
  const keyup = (e: KeyboardEvent): void => {
    // Only the key that started the hold ends it (a key tapped mid mouse-press does not).
    if (!isPress(e) || key === null || !byKey) return;
    e.preventDefault();
    const b = current();
    const short = !repeated;
    stop();
    swallowUntil = 0;
    if (short && live(b)) fire(b);
  };
  /** A touch long press opens no menu; a mouse's right-click menu is left alone. */
  const menu = (e: Event): void => {
    if (touch && holdButton(e.target)) e.preventDefault();
  };

  root.addEventListener('pointerdown', down);
  win.addEventListener('pointerup', end);
  win.addEventListener('pointercancel', cancel);
  win.addEventListener('pointermove', move);
  root.addEventListener('click', click, true);
  root.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  root.addEventListener('contextmenu', menu);
  // Focus or the window going away mid-hold (a tab switch) ends it too.
  root.addEventListener('focusout', stopOnBlur);
  win.addEventListener('blur', stop);
  function stopOnBlur(): void {
    if (pointer !== null || key === null) return;
    // A re-render removes the focused button and focuses its redrawn twin with the same
    // key: that is still the hold. Looked at once focus has settled.
    win.setTimeout(() => {
      if (pointer !== null || key === null) return;
      const now = holdButton(root.ownerDocument.activeElement);
      if (now?.getAttribute(HOLD_ATTR) !== key) stop();
    }, 0);
  }
  return () => {
    stop();
    root.removeEventListener('pointerdown', down);
    win.removeEventListener('pointerup', end);
    win.removeEventListener('pointercancel', cancel);
    win.removeEventListener('pointermove', move);
    root.removeEventListener('click', click, true);
    root.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    root.removeEventListener('contextmenu', menu);
    root.removeEventListener('focusout', stopOnBlur);
    win.removeEventListener('blur', stop);
  };
}
