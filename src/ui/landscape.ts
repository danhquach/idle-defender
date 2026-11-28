// A phone plays in landscape (ID-205). No browser lets a page turn the phone, so: where
// the browser allows it (Android Chrome) a tap to play goes full screen and locks the
// screen sideways; everywhere else a portrait phone gets a "turn your phone sideways"
// prompt over the game, and the fight holds until the phone is turned.

/** A phone held upright. Kept in step with the `.turn-prompt` rule in page.css. */
export const PORTRAIT_PHONE =
  '(orientation: portrait) and (pointer: coarse) and (max-width: 599px)';

/**
 * A touch screen 540 px tall or less (a phone on its side): the phone shell (ID-273) with side
 * rails and a one-line info strip. Kept in step with the coarse short block in page.css.
 */
export const SHORT_TOUCH = '(pointer: coarse) and (max-height: 540px)';

/** Whether a media query matches; false where the browser cannot say. */
function matches(win: Window, query: string): boolean {
  return typeof win.matchMedia === 'function' && win.matchMedia(query).matches;
}

/**
 * A phone: a touch screen whose short side is under 600 px (an iPad's is 744 or more). By
 * the screen, not the window as the prompt's query is: it decides whether to lock, which
 * is about the device.
 */
export function isPhone(win: Window): boolean {
  return matches(win, '(pointer: coarse)') && Math.min(win.screen.width, win.screen.height) < 600;
}

/** Whether the phone shell is on now. */
export function isShortTouch(win: Window): boolean {
  return matches(win, SHORT_TOUCH);
}

/**
 * Calls `cb` whenever the phone shell turns on or off (a phone turned, a window resized);
 * returns what stops it. A browser without media queries never calls it.
 */
export function watchShortTouch(win: Window, cb: () => void): () => void {
  if (typeof win.matchMedia !== 'function') return () => undefined;
  const list = win.matchMedia(SHORT_TOUCH);
  if (typeof list.addEventListener !== 'function') return () => undefined;
  list.addEventListener('change', cb);
  return () => list.removeEventListener?.('change', cb);
}

type Lockable = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/** Whether this browser can go full screen and lock the screen sideways. */
export function canLock(win: Window): boolean {
  const orientation = win.screen.orientation as Lockable | undefined;
  return (
    typeof win.document.documentElement.requestFullscreen === 'function' &&
    typeof orientation?.lock === 'function'
  );
}

/**
 * The player turned Full screen off with the Menu's switch: the tap to play leaves it off until
 * the switch is turned on again (ID-279). Kept for the session only, never stored. Leaving by the
 * back gesture is not a choice: it does not set this, so the next tap goes back in.
 */
let declined = false;

/**
 * On a phone, full screen and sideways. Call it from a tap: browsers only grant full
 * screen to a user's gesture. A refusal (or no support) is fine: the prompt covers it.
 */
export function goLandscape(win: Window): void {
  if (declined || !isPhone(win) || !canLock(win)) return;
  void enterFullscreen(win, true);
}

/**
 * Full screen (when not already), then the sideways lock if asked. Never rejects: a refusal (or
 * an older browser that returns nothing instead of a promise, or throws) leaves the screen as it
 * was, and the turn prompt covers a phone.
 */
function enterFullscreen(win: Window, lock: boolean): Promise<void> {
  const doc = win.document;
  try {
    const full = doc.fullscreenElement
      ? undefined
      : doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return Promise.resolve(full)
      .then(() => (lock ? (win.screen.orientation as Lockable).lock?.('landscape') : undefined))
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    return Promise.resolve();
  }
}

/**
 * Whether the Menu offers a Full screen switch (ID-279): a touch screen whose browser has the
 * Fullscreen API. iPhone Safari does not (it has no element full screen), so it has no switch.
 */
export function canToggleFullscreen(win: Window): boolean {
  const doc = win.document;
  return (
    matches(win, '(pointer: coarse)') &&
    doc.fullscreenEnabled === true &&
    typeof doc.documentElement.requestFullscreen === 'function'
  );
}

/** Whether the page is full screen now. */
export function isFullscreen(win: Window): boolean {
  return Boolean(win.document.fullscreenElement);
}

/**
 * The Menu's Full screen switch: on enters full screen (and, on a phone that can, locks sideways
 * as the first tap does); off leaves it. Call it from a tap. Resolves when the browser has
 * answered, never rejects: the caller re-reads `isFullscreen` to show what happened.
 */
export function setFullscreen(win: Window, on: boolean): Promise<void> {
  declined = !on;
  if (on) return enterFullscreen(win, isPhone(win) && canLock(win));
  try {
    const left = win.document.fullscreenElement ? win.document.exitFullscreen() : undefined;
    return Promise.resolve(left).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

export interface TurnPrompt {
  /** True while the prompt shows: the fight does not advance. */
  showing(): boolean;
}

/** The "turn your phone sideways" prompt, shown by CSS while a phone is upright. */
export function createTurnPrompt(win: Window): TurnPrompt {
  const doc = win.document;
  const box = doc.createElement('div');
  box.className = 'turn-prompt';
  box.setAttribute('role', 'alert');

  const icon = doc.createElement('div');
  icon.className = 'turn-prompt-icon';
  icon.setAttribute('aria-hidden', 'true');

  const title = doc.createElement('p');
  title.className = 'turn-prompt-title';
  title.textContent = 'Turn your phone sideways';

  const text = doc.createElement('p');
  text.className = 'turn-prompt-text';
  text.textContent = 'The Long Hold plays in landscape. The fight waits until you turn.';

  box.append(icon, title, text);
  // Where the browser can lock the screen, one tap does it for the player.
  if (isPhone(win) && canLock(win)) {
    const go = doc.createElement('button');
    go.type = 'button';
    go.className = 'btn btn-primary turn-prompt-button';
    go.textContent = 'Play full screen';
    // An explicit tap: it also lifts a "Full screen off" choice.
    go.addEventListener('click', () => void setFullscreen(win, true));
    box.append(go);
  }
  // On the body, last, like the intro: over the title screen and every window.
  doc.body.append(box);

  // One live query, read every frame (it follows the phone as it turns).
  const upright = typeof win.matchMedia === 'function' ? win.matchMedia(PORTRAIT_PHONE) : null;
  return { showing: () => upright?.matches ?? false };
}
