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
 * On a phone, full screen and sideways. Call it from a tap: browsers only grant full
 * screen to a user's gesture. A refusal (or no support) is fine: the prompt covers it.
 */
export function goLandscape(win: Window): void {
  if (!isPhone(win) || !canLock(win)) return;
  const doc = win.document;
  const lock = (): Promise<void> | undefined =>
    (win.screen.orientation as Lockable).lock?.('landscape');
  try {
    // An older browser returns nothing instead of a promise, or throws.
    const full = doc.fullscreenElement
      ? undefined
      : doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    Promise.resolve(full)
      .then(lock)
      .catch(() => undefined);
  } catch {
    // Refused: the prompt covers it.
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
    go.addEventListener('click', () => goLandscape(win));
    box.append(go);
  }
  // On the body, last, like the intro: over the title screen and every window.
  doc.body.append(box);

  // One live query, read every frame (it follows the phone as it turns).
  const upright = typeof win.matchMedia === 'function' ? win.matchMedia(PORTRAIT_PHONE) : null;
  return { showing: () => upright?.matches ?? false };
}
