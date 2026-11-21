// @vitest-environment jsdom
// ID-205: a phone plays in landscape. A tap to play goes full screen and locks the screen
// sideways where the browser allows it; an upright phone gets the turn prompt, and the
// fight holds under it.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canLock, createTurnPrompt, goLandscape, isPhone, PORTRAIT_PHONE } from './landscape.ts';

interface Fake {
  coarse?: boolean;
  upright?: boolean;
  short?: number;
  lock?: ((o: string) => Promise<void>) | null;
  full?: (() => Promise<void> | undefined) | null;
  fullscreen?: boolean;
}

/** A window as the module reads it: media queries, the screen and full screen. */
function fakeWin(f: Fake = {}): Window {
  const { coarse = true, upright = false, short = 390, fullscreen = false } = f;
  const lock = f.lock === undefined ? vi.fn(() => Promise.resolve()) : f.lock;
  const full = f.full === undefined ? vi.fn(() => Promise.resolve()) : f.full;
  const queries: Record<string, boolean> = {
    '(pointer: coarse)': coarse,
    [PORTRAIT_PHONE]: upright,
  };
  return {
    matchMedia: (q: string) => ({ matches: queries[q] ?? false }),
    screen: { width: short, height: 844, orientation: lock ? { lock } : {} },
    document: {
      fullscreenElement: fullscreen ? {} : null,
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

  it('on its side, a phone’s top buttons take 44 px of a finger; an iPad is never that short', () => {
    const at = css.indexOf('@media (pointer: coarse) and (max-height: 540px) {');
    expect(at).toBeGreaterThan(0);
    const touch = css.slice(at, css.indexOf('\n}\n', at));
    // 26 px buttons, 9 px more above and below; the fight's 36 px column, 4 px more.
    expect(touch).toMatch(/\.roster-button::after,[\s\S]*?inset: -9px -3px;/);
    expect(touch).toMatch(/\.hud-speed > button::after \{\s*inset: -4px -3px;/);
    // The row closes up from the right without the key hints.
    expect(touch).toMatch(
      /\.menu-button \.menu-key,\s*\.hud-speed \.menu-key,\s*\.hud-skill-key \{\s*display: none;/,
    );
  });

  it('in a fight on its side, the speed group stands clear of the held cards and boss bars', () => {
    expect(css).toMatch(
      /body:not\(:has\(\.hud-debrief:not\(\[hidden\]\)\)\) \.hud-speed \{\s*top: 40px;\s*right: var\(--space-12\);\s*left: auto;\s*flex-direction: column;/,
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
  });
});
