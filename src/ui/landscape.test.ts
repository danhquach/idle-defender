// @vitest-environment jsdom
// ID-205: a phone plays in landscape. A tap to play goes full screen and locks the screen
// sideways where the browser allows it; an upright phone gets the turn prompt, and the
// fight holds under it.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canLock,
  canToggleFullscreen,
  createTurnPrompt,
  goLandscape,
  isFullscreen,
  isPhone,
  isShortTouch,
  PORTRAIT_PHONE,
  setFullscreen,
  SHORT_TOUCH,
} from './landscape.ts';

interface Fake {
  coarse?: boolean;
  upright?: boolean;
  short?: number;
  lock?: ((o: string) => Promise<void>) | null;
  full?: (() => Promise<void> | undefined) | null;
  fullscreen?: boolean;
  shortTouch?: boolean;
  /** document.fullscreenEnabled (left out: the browser has no such flag). */
  enabled?: boolean;
  exit?: (() => Promise<void> | undefined) | null;
}

/** A window as the module reads it: media queries, the screen and full screen. */
function fakeWin(f: Fake = {}): Window {
  const { coarse = true, upright = false, short = 390, fullscreen = false } = f;
  const lock = f.lock === undefined ? vi.fn(() => Promise.resolve()) : f.lock;
  const full = f.full === undefined ? vi.fn(() => Promise.resolve()) : f.full;
  const queries: Record<string, boolean> = {
    '(pointer: coarse)': coarse,
    [PORTRAIT_PHONE]: upright,
    [SHORT_TOUCH]: f.shortTouch ?? false,
  };
  return {
    matchMedia: (q: string) => ({ matches: queries[q] ?? false }),
    screen: { width: short, height: 844, orientation: lock ? { lock } : {} },
    document: {
      fullscreenElement: fullscreen ? {} : null,
      fullscreenEnabled: f.enabled,
      exitFullscreen: f.exit === null ? undefined : (f.exit ?? (() => Promise.resolve())),
      documentElement: full ? { requestFullscreen: full } : {},
      body: document.body,
      createElement: (t: string) => document.createElement(t),
    },
  } as unknown as Window;
}

afterEach(() => document.body.replaceChildren());

describe('a phone, by its screen', () => {
  it('a touch screen with a short side under 600 px is a phone', () => {
    expect(isPhone(fakeWin({ short: 390 }))).toBe(true);
    expect(isPhone(fakeWin({ short: 599 }))).toBe(true);
  });

  it('an iPad (744 px or more) or a mouse is not', () => {
    expect(isPhone(fakeWin({ short: 744 }))).toBe(false);
    expect(isPhone(fakeWin({ coarse: false }))).toBe(false);
  });

  it('a browser without matchMedia is no phone, and shows no prompt', () => {
    const win = { ...fakeWin(), matchMedia: undefined } as unknown as Window;
    expect(isPhone(win)).toBe(false);
    expect(createTurnPrompt(win).showing()).toBe(false);
  });
});

describe('the phone shell flag (ID-273)', () => {
  it('follows the short touch query, and is off where the browser cannot say', () => {
    expect(isShortTouch(fakeWin({ shortTouch: true }))).toBe(true);
    expect(isShortTouch(fakeWin({ shortTouch: false }))).toBe(false);
    expect(isShortTouch({ ...fakeWin(), matchMedia: undefined } as unknown as Window)).toBe(false);
  });
});

describe('a tap to play goes full screen and sideways', () => {
  it('asks for full screen, then locks the screen to landscape', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const full = vi.fn(() => Promise.resolve());
    goLandscape(fakeWin({ lock, full }));
    expect(full).toHaveBeenCalledWith({ navigationUI: 'hide' });
    await vi.waitFor(() => expect(lock).toHaveBeenCalledWith('landscape'));
  });

  it('already full screen: only the lock', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const full = vi.fn(() => Promise.resolve());
    goLandscape(fakeWin({ lock, full, fullscreen: true }));
    expect(full).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(lock).toHaveBeenCalledWith('landscape'));
  });

  it('does nothing on a desktop or an iPad', () => {
    for (const win of [fakeWin({ coarse: false }), fakeWin({ short: 768 })]) {
      const full = (win.document.documentElement as unknown as { requestFullscreen: () => void })
        .requestFullscreen;
      goLandscape(win);
      expect(full).not.toHaveBeenCalled();
    }
  });

  it('does nothing where the screen cannot be locked (iPhone Safari)', () => {
    const full = vi.fn(() => Promise.resolve());
    const win = fakeWin({ lock: null, full });
    expect(canLock(win)).toBe(false);
    goLandscape(win);
    expect(full).not.toHaveBeenCalled();
  });

  it('a refusal, a thrown error or an old browser’s undefined is swallowed', async () => {
    const lock = vi.fn(() => Promise.reject(new Error('lock refused')));
    expect(() =>
      goLandscape(fakeWin({ full: () => Promise.reject(new Error('no')) })),
    ).not.toThrow();
    expect(() => goLandscape(fakeWin({ lock, full: () => undefined }))).not.toThrow();
    const throws = () => {
      throw new Error('not allowed');
    };
    expect(() => goLandscape(fakeWin({ full: throws }))).not.toThrow();
    await vi.waitFor(() => expect(lock).toHaveBeenCalled());
  });
});

describe('the Menu’s Full screen switch (ID-279)', () => {
  // A "off" choice is module state: lift it so no test leaks into the next.
  afterEach(() => void setFullscreen(fakeWin({ fullscreen: true }), true));

  it('is offered on a touch screen whose browser has the Fullscreen API', () => {
    expect(canToggleFullscreen(fakeWin({ enabled: true }))).toBe(true);
  });

  it('is not offered by a mouse, a missing API or a browser that disables it (iPhone Safari)', () => {
    expect(canToggleFullscreen(fakeWin({ enabled: true, coarse: false }))).toBe(false);
    expect(canToggleFullscreen(fakeWin({ enabled: false }))).toBe(false);
    // iPhone Safari: no fullscreenEnabled flag, no element requestFullscreen.
    expect(canToggleFullscreen(fakeWin({ full: null }))).toBe(false);
    expect(canToggleFullscreen(fakeWin({ enabled: true, full: null }))).toBe(false);
    expect(
      canToggleFullscreen({ ...fakeWin({ enabled: true }), matchMedia: undefined } as never),
    ).toBe(false);
  });

  it('reads whether the page is full screen now', () => {
    expect(isFullscreen(fakeWin({ fullscreen: true }))).toBe(true);
    expect(isFullscreen(fakeWin({ fullscreen: false }))).toBe(false);
  });

  it('on asks for full screen (from the tap) and locks sideways on a phone that can', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const full = vi.fn(() => Promise.resolve());
    await setFullscreen(fakeWin({ enabled: true, lock, full }), true);
    expect(full).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('on a tablet asks for full screen and does not lock', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const full = vi.fn(() => Promise.resolve());
    await setFullscreen(fakeWin({ enabled: true, short: 768, lock, full }), true);
    expect(full).toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  it('on while already full screen asks for nothing', async () => {
    const full = vi.fn(() => Promise.resolve());
    await setFullscreen(fakeWin({ enabled: true, full, fullscreen: true }), true);
    expect(full).not.toHaveBeenCalled();
  });

  it('off leaves full screen, and does nothing when it is not on', async () => {
    const exit = vi.fn(() => Promise.resolve());
    await setFullscreen(fakeWin({ enabled: true, exit, fullscreen: true }), false);
    expect(exit).toHaveBeenCalledTimes(1);
    await setFullscreen(fakeWin({ enabled: true, exit }), false);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('a refusal, a thrown error or a missing method never rejects', async () => {
    const no = () => Promise.reject(new Error('refused'));
    const boom = () => {
      throw new Error('not allowed');
    };
    await expect(
      setFullscreen(fakeWin({ enabled: true, full: no }), true),
    ).resolves.toBeUndefined();
    await expect(
      setFullscreen(fakeWin({ enabled: true, full: boom }), true),
    ).resolves.toBeUndefined();
    await expect(
      setFullscreen(fakeWin({ enabled: true, lock: no }), true),
    ).resolves.toBeUndefined();
    await expect(
      setFullscreen(fakeWin({ enabled: true, exit: no, fullscreen: true }), false),
    ).resolves.toBeUndefined();
    await expect(
      setFullscreen(fakeWin({ enabled: true, exit: boom, fullscreen: true }), false),
    ).resolves.toBeUndefined();
  });

  it('a deliberate off keeps the tap to play from forcing it back, until it is turned on again', async () => {
    const full = vi.fn(() => Promise.resolve());
    const win = fakeWin({ enabled: true, full, fullscreen: true });
    await setFullscreen(win, false);
    goLandscape(fakeWin({ full }));
    goLandscape(fakeWin({ full }));
    expect(full).not.toHaveBeenCalled();
    await setFullscreen(fakeWin({ enabled: true, full, fullscreen: true }), true);
    goLandscape(fakeWin({ full }));
    expect(full).toHaveBeenCalledTimes(1);
  });

  it('a back-gesture exit is not a choice: the next tap goes back in', () => {
    const full = vi.fn(() => Promise.resolve());
    // The browser left full screen on its own: nothing went through the switch.
    goLandscape(fakeWin({ full, fullscreen: false }));
    expect(full).toHaveBeenCalledTimes(1);
  });

  it('the turn prompt’s own button is an explicit tap and lifts the choice', async () => {
    await setFullscreen(fakeWin({ enabled: true, fullscreen: true }), false);
    const full = vi.fn(() => Promise.resolve());
    createTurnPrompt(fakeWin({ full }));
    document.querySelector<HTMLButtonElement>('.turn-prompt-button')!.click();
    expect(full).toHaveBeenCalledTimes(1);
  });

  it('a phone that left full screen goes back on the next tap, as the first tap did', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const full = vi.fn(() => Promise.resolve());
    const win = fakeWin({ lock, full, fullscreen: false });
    goLandscape(win);
    goLandscape(win);
    expect(full).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(lock).toHaveBeenCalledTimes(2));
  });
});

describe('the turn prompt', () => {
  it('shows only while the phone is upright', () => {
    expect(createTurnPrompt(fakeWin({ upright: true })).showing()).toBe(true);
    expect(createTurnPrompt(fakeWin({ upright: false })).showing()).toBe(false);
  });

  it('says to turn the phone, as text, on the body over everything', () => {
    createTurnPrompt(fakeWin());
    const box = document.body.lastElementChild as HTMLElement;
    expect(box.className).toBe('turn-prompt');
    expect(box.getAttribute('role')).toBe('alert');
    expect(box.querySelector('.turn-prompt-title')!.textContent).toBe('Turn your phone sideways');
    expect(box.querySelector('.turn-prompt-icon')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('offers "Play full screen" only where the screen can be locked', () => {
    createTurnPrompt(fakeWin({ lock: null }));
    expect(document.querySelector('.turn-prompt-button')).toBeNull();
    document.body.replaceChildren();
    const full = vi.fn(() => Promise.resolve());
    createTurnPrompt(fakeWin({ full }));
    const go = document.querySelector<HTMLButtonElement>('.turn-prompt-button')!;
    expect(go.textContent).toBe('Play full screen');
    go.click();
    expect(full).toHaveBeenCalled();
  });
});

describe('page.css and the page keep step with the module', () => {
  const css = readFileSync('src/page.css', 'utf8');

  it('the prompt shows under the very query the fight holds by', () => {
    expect(css).toContain(`@media ${PORTRAIT_PHONE} {\n  .turn-prompt {`);
    expect(css).toMatch(/\n\.turn-prompt \{\n {2}display: none;\n\}/);
  });

  it('the phone shell reads the query the CSS block is under (ID-273)', () => {
    expect(css).toContain(`@media ${SHORT_TOUCH} {`);
  });

  it('on its side the key hints are gone: a phone has no keyboard', () => {
    const at = css.indexOf(`@media ${SHORT_TOUCH} {`);
    const touch = css.slice(at, css.indexOf('\n}\n', at));
    expect(touch).toMatch(
      /\.menu-button \.menu-key,\s*\.hud-speed \.menu-key,\s*\.hud-skill-key \{\s*display: none;/,
    );
  });

  it('the prompt sits over the intro and every window', () => {
    const z = (sel: string) =>
      [...css.matchAll(new RegExp(`\\n\\s*${sel} \\{[^}]*z-index: (\\d+);`, 'g'))].map((m) =>
        Number(m[1]),
      );
    const all = [...css.matchAll(/z-index: (\d+);/g)].map((m) => Number(m[1]));
    expect(z('\\.turn-prompt')).toEqual([Math.max(...all)]);
  });

  it('the app holds the fight while the prompt shows and goes sideways on the tap to play', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toMatch(/const paused = [^;]*turnPrompt\.showing\(\)/);
    expect(app).toMatch(/onDone: \(\) => \{\s*(?:\/\/[^\n]*\n\s*)*goLandscape\(window\);/);
    // The Start tap does it too (ID-279): a player who left full screen is put back.
    expect(app).toMatch(
      /\(\) => \{\s*(?:\/\/[^\n]*\n\s*)*goLandscape\(window\);\s*if \(HORDE_ONLY\) \{\s*squadNext\(\);/,
    );
  });
});
