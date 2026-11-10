// @vitest-environment jsdom
// ID-106: the intro — title screen, Continue only with a save, New game asked first over a
// save, Mute, the first-launch card (skippable, reopened from the Menu), Enter and Esc.
import { describe, expect, it } from 'vitest';
import {
  createIntro,
  HOW_TO_CARD,
  INTRO_TAGLINE,
  INTRO_TITLE,
  NEW_GAME_CONFIRM,
  type IntroOptions,
} from './intro.ts';

function setup(over: Partial<IntroOptions> = {}) {
  const root = document.createElement('div');
  const outside = document.createElement('button');
  document.body.replaceChildren(root, outside);
  const log: string[] = [];
  const intro = createIntro(root, {
    hasSave: false,
    firstLaunch: false,
    muted: false,
    onMute: (on) => log.push(`mute:${on}`),
    onNewGame: () => log.push('new'),
    onDone: () => log.push('done'),
    onCardSeen: () => log.push('seen'),
    ...over,
  });
  const scrim = document.querySelector<HTMLElement>('.intro-scrim')!;
  const dialog = scrim.querySelector<HTMLElement>('[role="dialog"]')!;
  const shown = (label: string): HTMLButtonElement | undefined =>
    [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent === label && !b.hidden && !b.closest('[hidden]'),
    );
  const button = (label: string): HTMLButtonElement => {
    const b = shown(label);
    if (!b) throw new Error(`no button ${label}`);
    return b;
  };
  const key = (k: string, target: EventTarget = document.activeElement ?? dialog) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const mute = dialog.querySelector<HTMLInputElement>('#intro-mute')!;
  const cardOpen = () => !dialog.querySelector<HTMLElement>('.intro-card')!.hidden;
  return { root, outside, intro, scrim, dialog, shown, button, key, mute, log, cardOpen };
}

describe('the intro title screen', () => {
  it('shows the title, tagline and Mute over an inert field, focus on the main button', () => {
    const { root, dialog, intro, mute, button } = setup();
    const h1 = dialog.querySelector('h1')!;
    expect(h1.querySelector('.sr-only')!.textContent).toBe(INTRO_TITLE);
    // The drawn logo is decoration: hidden from screen readers, so the name is the span's.
    const logo = h1.querySelector('svg')!;
    expect(logo.getAttribute('aria-hidden')).toBe('true');
    // Two lines, drawn twice: the shadow, then the face.
    expect([...logo.querySelectorAll('text')].map((t) => t.textContent)).toEqual([
      'THE LONG',
      'HOLD',
      'THE LONG',
      'HOLD',
    ]);
    expect(dialog.textContent).toContain(INTRO_TAGLINE);
    expect(mute.checked).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(intro.isOpen()).toBe(true);
    expect(document.activeElement).toBe(button('New game'));
    expect(dialog.getAttribute('aria-labelledby')).toBe('intro-title');
  });

  it('without a save: no Continue; New game starts at once (no confirm)', () => {
    const { shown, button, log, root, intro, scrim } = setup();
    expect(shown('Continue')).toBeUndefined();
    button('New game').click();
    expect(log).toEqual(['new', 'done']);
    expect(intro.isOpen()).toBe(false);
    expect(scrim.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(false);
  });

  it('with a save: Continue is the main action and closes without a new game', () => {
    const { button, log, intro } = setup({ hasSave: true });
    expect(document.activeElement).toBe(button('Continue'));
    expect(button('Continue').classList.contains('btn-primary')).toBe(true);
    expect(button('New game').classList.contains('btn-primary')).toBe(false);
    button('Continue').click();
    expect(log).toEqual(['done']);
    expect(intro.isOpen()).toBe(false);
  });

  it('with a save: New game asks first; Back and Esc keep the save, Start new game replaces it', () => {
    const { button, shown, log, key, dialog } = setup({ hasSave: true });
    button('New game').click();
    expect(dialog.textContent).toContain(NEW_GAME_CONFIRM);
    expect(dialog.getAttribute('aria-labelledby')).toBe('intro-question');
    expect(shown('Continue')).toBeUndefined();
    expect(document.activeElement).toBe(button('Back'));
    button('Back').click();
    expect(document.activeElement).toBe(button('Continue'));
    button('New game').click();
    key('Escape');
    expect(shown('Start new game')).toBeUndefined();
    expect(shown('Continue')).toBeDefined();
    expect(log).toEqual([]);
    button('New game').click();
    button('Start new game').click();
    expect(log).toEqual(['new', 'done']);
  });

  it('Enter off a button is the main action: Continue with a save, New game without', () => {
    const saved = setup({ hasSave: true });
    // On the Mute switch Enter does nothing: Space toggles it.
    saved.key('Enter', saved.mute);
    expect(saved.log).toEqual([]);
    saved.key('Enter', saved.dialog);
    expect(saved.log).toEqual(['done']);
    const first = setup();
    first.key('Enter', first.dialog);
    expect(first.log).toEqual(['new', 'done']);
  });

  it('keys stay inside: Esc on the title screen does nothing and never reaches the page', () => {
    const { key, intro } = setup({ hasSave: true });
    let reached = false;
    document.addEventListener('keydown', () => (reached = true), { once: true });
    key('Escape');
    expect(reached).toBe(false);
    expect(intro.isOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  });

  it('Tab wraps inside the dialog', () => {
    const { button, mute, key } = setup();
    mute.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('New game'));
  });

  it('Mute reports the change; setMuted moves the switch without reporting', () => {
    const { mute, intro, log } = setup({ muted: true });
    expect(mute.checked).toBe(true);
    mute.click();
    expect(log).toEqual(['mute:false']);
    intro.setMuted(true);
    expect(mute.checked).toBe(true);
    expect(log).toEqual(['mute:false']);
  });
});

describe('the how-to-play card', () => {
  it('on a first launch New game opens it (marked seen); Got it ends the intro', () => {
    const { button, log, cardOpen, dialog, intro, root } = setup({ firstLaunch: true });
    button('New game').click();
    expect(cardOpen()).toBe(true);
    expect(log).toEqual(['new', 'seen']);
    expect(dialog.getAttribute('aria-labelledby')).toBe('intro-card-title');
    for (const [term] of HOW_TO_CARD) expect(dialog.textContent).toContain(term);
    // The skill keys are a keyboard hint, hidden on a touch screen (page.css).
    expect(dialog.querySelector('.intro-how .intro-keys')!.textContent).toBe(' Keys: Q W.');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(button('Got it'));
    button('Got it').click();
    expect(log).toEqual(['new', 'seen', 'done']);
    expect(intro.isOpen()).toBe(false);
  });

  it('can be skipped with × or Esc', () => {
    const a = setup({ firstLaunch: true });
    a.button('New game').click();
    a.dialog.querySelector<HTMLButtonElement>('[aria-label="Skip how to play"]')!.click();
    expect(a.log.at(-1)).toBe('done');
    const b = setup({ firstLaunch: true });
    b.button('New game').click();
    b.key('Escape');
    expect(b.log.at(-1)).toBe('done');
    expect(b.intro.isOpen()).toBe(false);
  });

  it('not on a later launch: New game goes straight to the camp', () => {
    const { button, log, cardOpen } = setup({ firstLaunch: false });
    button('New game').click();
    expect(cardOpen()).toBe(false);
    expect(log).toEqual(['new', 'done']);
  });

  it('showCard opens it alone; closing it gives focus back and does not end an intro', () => {
    const { button, outside, intro, log, root } = setup({ hasSave: true });
    button('Continue').click();
    log.length = 0;
    outside.focus();
    intro.showCard();
    expect(intro.isOpen()).toBe(true);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(log).toEqual(['seen']);
    button('Got it').click();
    expect(log).toEqual(['seen']);
    expect(intro.isOpen()).toBe(false);
    expect(document.activeElement).toBe(outside);
  });

  it('showCard does nothing while the title screen is up', () => {
    const { intro, cardOpen, log } = setup();
    intro.showCard();
    expect(cardOpen()).toBe(false);
    expect(log).toEqual([]);
  });
});

describe('the title art (backdrop)', () => {
  it('sits behind the dialog under a shade, hidden until it loads, then fades in', () => {
    const backdrop = document.createElement('img');
    const { scrim, dialog } = setup({ backdrop });
    expect(backdrop.parentElement).toBe(scrim);
    expect(backdrop.alt).toBe('');
    expect([...scrim.children].map((c) => c.className)).toEqual([
      'intro-art',
      'intro-shade',
      dialog.className,
    ]);
    expect(backdrop.classList.contains('intro-art-on')).toBe(false);
    backdrop.dispatchEvent(new Event('load'));
    expect(backdrop.classList.contains('intro-art-on')).toBe(true);
  });

  it('leaves the page with the intro; a card from the Menu goes over plain dark', () => {
    const backdrop = document.createElement('img');
    const { scrim, button, intro } = setup({ backdrop, hasSave: true });
    button('Continue').click();
    expect(backdrop.isConnected).toBe(false);
    expect(scrim.querySelector('.intro-shade')).toBeNull();
    intro.showCard();
    expect(scrim.querySelector('.intro-art')).toBeNull();
  });

  it('already loaded: shown at once; without one there is no shade', () => {
    const backdrop = document.createElement('img');
    Object.defineProperty(backdrop, 'naturalWidth', { value: 1152 });
    Object.defineProperty(backdrop, 'complete', { value: true });
    setup({ backdrop });
    expect(backdrop.classList.contains('intro-art-on')).toBe(true);
    const bare = setup();
    expect(bare.scrim.querySelector('.intro-shade')).toBeNull();
  });
});
