// @vitest-environment jsdom
// ID-140, ID-232: the Airstrike's Auto in the fight HUD. A small pill on the Airstrike
// button's corner (a sibling in a wrapper), shown with it, during picks too, clearly on or
// off; holding the button for HOLD_MS turns Auto on or off too, a tap still aims.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_IDS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { newHorde, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import {
  AUTO_KEY,
  AUTO_NOTE_MS,
  createHud,
  fightKeyName,
  HOLD_MS,
  SKILL_KEYS,
  SPEED_KEYS,
  STRIKE_HINT,
} from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function mount(squad: boolean) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let arms = 0;
  const hud = createHud(root, noop, noop, noop, noop, noop, () => arms++, noop, noop, noop, squad);
  let autos = 0;
  hud.onAutoStrike(() => autos++);
  const pill = root.querySelector<HTMLButtonElement>('.hud-auto-pill')!;
  const wrap = root.querySelector<HTMLElement>('.hud-strike')!;
  const strike = root.querySelectorAll<HTMLButtonElement>('.hud-skill')[0]!;
  const pointer = (
    target: HTMLElement,
    type: string,
    init: PointerEventInit = {},
  ): PointerEvent => {
    const e = new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, ...init });
    target.dispatchEvent(e);
    return e;
  };
  /** A mouse or finger click as a browser sends it after the press: `detail` 1. */
  const click = (target: HTMLElement): void => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  };
  return {
    root,
    hud,
    pill,
    wrap,
    strike,
    pointer,
    click,
    arms: () => arms,
    autos: () => autos,
  };
}

/** A picked Airstrike in the horde-only build, ready to use. */
const fight = (): HordeState => startSquadHorde({ ...newGame(), skillPick: ['airstrike'] }, 1, NOW);

describe('the Auto pill (ID-140, ID-232)', () => {
  it('is a sibling of the Airstrike button in a wrapper, keyed E, off until told', () => {
    const { pill, wrap, strike } = mount(true);
    expect(strike.parentElement).toBe(wrap);
    expect(pill.parentElement).toBe(wrap);
    expect(pill.contains(strike)).toBe(false);
    expect(pill.type).toBe('button');
    expect(AUTO_KEY).toBe('E');
    expect(pill.getAttribute('aria-keyshortcuts')).toBe('E');
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    expect(wrap.dataset.auto).toBe('off');
  });

  it('is named "Auto" for a reader, its words and key for the eyes only', () => {
    const { hud, pill } = mount(true);
    expect(pill.getAttribute('aria-label')).toBe('Auto');
    for (const part of pill.children) expect(part.getAttribute('aria-hidden')).toBe('true');
    hud.showAutoStrike(true);
    expect(pill.getAttribute('aria-label')).toBe('Auto');
  });

  it('shows on or off as the app says: pressed, the wrapper marked for the ring', () => {
    const { hud, pill, wrap } = mount(true);
    hud.showAutoStrike(true);
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    expect(wrap.dataset.auto).toBe('on');
    expect(pill.title).toContain(`key ${AUTO_KEY} to turn off`);
    hud.showAutoStrike(false);
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    expect(wrap.dataset.auto).toBe('off');
  });

  it('there is no separate Auto button any more', () => {
    const { root } = mount(true);
    expect(root.querySelector('.hud-auto')).toBeNull();
  });

  it('E is read by its place, so it is the same key on any layout, and clashes with no fight key', () => {
    expect(fightKeyName({ code: 'KeyE', key: 'é' })).toBe(AUTO_KEY);
    expect(fightKeyName({ code: 'KeyE', key: 'E' })).toBe(AUTO_KEY);
    expect([...SKILL_KEYS, ...Object.values(SPEED_KEYS), '1', '2', '3', ' ']).not.toContain(
      AUTO_KEY,
    );
  });

  it('a click goes to the app, and never aims', () => {
    const { pill, click, autos, arms, pointer } = mount(true);
    pointer(pill, 'pointerdown');
    pointer(pill, 'pointerup');
    click(pill);
    expect(autos()).toBe(1);
    expect(arms()).toBe(0);
  });

  it('a press on the pill starts no hold: held past the time, nothing else toggles', () => {
    const { pill, pointer, autos, wrap } = mount(true);
    pointer(pill, 'pointerdown');
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(autos()).toBe(0);
  });

  it('shows with a picked Airstrike, during a pick too, and hides without it', () => {
    const { hud, pill, wrap } = mount(true);
    const s = fight();
    hud.update(s);
    expect(pill.hidden).toBe(false);
    expect(wrap.hidden).toBe(false);
    const picking: HordeState = { ...s, offer: [] };
    hud.update(picking);
    expect(pill.hidden).toBe(false);
    expect(pill.disabled).toBe(false);
    hud.update(startSquadHorde({ ...newGame(), skillPick: [] }, 1, NOW));
    expect(pill.hidden).toBe(true);
    // The wrapper takes the Airstrike's own hiding: nothing of it shows unpicked.
    expect(wrap.hidden).toBe(true);
  });

  it('in the full game, shows only once the Airstrike is researched', () => {
    const { hud, pill, wrap } = mount(false);
    hud.update(newHorde(1, { ...setup(), skills: [] }));
    expect(pill.hidden).toBe(true);
    // Its button still shows, locked, in the full game: so does the wrapper.
    expect(wrap.hidden).toBe(false);
    hud.update(newHorde(1, { ...setup(), skills: [...SKILL_IDS] }));
    expect(pill.hidden).toBe(false);
  });

  it('a hold on a locked Airstrike (full game, not researched) changes nothing', () => {
    const { hud, wrap, pointer, autos, arms } = mount(false);
    hud.update(newHorde(1, { ...setup(), skills: [] }));
    pointer(wrap, 'pointerdown');
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
    vi.advanceTimersByTime(HOLD_MS * 2);
    pointer(wrap, 'pointerup');
    expect([autos(), arms()]).toEqual([0, 0]);
  });

  it('bottomSpace puts the wrapper and the skill buttons back as they were', () => {
    const { hud, wrap, strike } = mount(true);
    hud.update(startSquadHorde({ ...newGame(), skillPick: [] }, 1, NOW));
    expect([wrap.hidden, strike.hidden]).toEqual([true, true]);
    hud.bottomSpace();
    expect([wrap.hidden, strike.hidden]).toEqual([true, true]);
    hud.update(fight());
    hud.bottomSpace();
    expect([wrap.hidden, strike.hidden]).toEqual([false, false]);
  });
});

describe('the Airstrike tooltip (ID-232)', () => {
  it('says how to aim and how to set Auto, and a lock replaces it', () => {
    const { hud, strike, wrap } = mount(true);
    const s = fight();
    hud.update(s);
    expect(strike.title).toBe('Q: aim · Hold Q or press E: Auto');
    expect(wrap.title).toBe('');
    // Cooling: the button takes no press, so the wrapper carries the reason for the hover.
    const cooling: HordeState = { ...s, cooldowns: { ...s.cooldowns, airstrike: 12 } };
    hud.update(cooling);
    expect(strike.disabled).toBe(true);
    expect(strike.title).not.toContain('Hold Q');
    expect(wrap.title).toBe(strike.title);
    hud.update(s);
    expect(wrap.title).toBe('');
  });

  it('in the full game: a click aims', () => {
    const { hud, strike } = mount(false);
    const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS] });
    s.cash = 500;
    hud.update(s);
    expect(strike.title).toBe('Click: aim · Hold or press E: Auto');
  });
});

describe('press and hold on the Airstrike button (ID-232)', () => {
  it('a tap aims on its click, as before, and sets nothing', () => {
    const { strike, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    vi.advanceTimersByTime(100);
    pointer(strike, 'pointerup');
    click(strike);
    expect(arms()).toBe(1);
    expect(autos()).toBe(0);
  });

  it('a hold toggles Auto when the ring closes; the click after it does not aim', () => {
    const { strike, wrap, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    expect(wrap.classList.contains('hud-strike-holding')).toBe(true);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(autos()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(autos()).toBe(1);
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
    pointer(strike, 'pointerup');
    click(strike);
    expect(arms()).toBe(0);
    expect(autos()).toBe(1);
  });

  it('a hold while the skill is armed toggles Auto and leaves it armed (no aim, no put-away)', () => {
    const { strike, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer(strike, 'pointerup');
    click(strike);
    // The app's arm (which a second click would put away) was never called.
    expect(arms()).toBe(0);
    expect(autos()).toBe(1);
  });

  it('holds while cooling too: the press lands on the wrapper, and Auto changes', () => {
    const { hud, wrap, strike, pointer, arms, autos } = mount(true);
    hud.update({ ...fight(), cooldowns: { airstrike: 12 } });
    expect(strike.disabled).toBe(true);
    pointer(wrap, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer(wrap, 'pointerup');
    expect(autos()).toBe(1);
    expect(arms()).toBe(0);
  });

  it('a hold with no click after it (cooling) leaves nothing stale: a tap once ready aims', () => {
    const { hud, wrap, strike, pointer, click, arms, autos } = mount(true);
    const s = fight();
    hud.update({ ...s, cooldowns: { airstrike: 12 } });
    pointer(wrap, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer(wrap, 'pointerup');
    expect(autos()).toBe(1);
    // Ready again: a plain tap is its own press.
    hud.update(s);
    pointer(strike, 'pointerdown');
    pointer(strike, 'pointerup');
    click(strike);
    expect(arms()).toBe(1);
    expect(autos()).toBe(1);
  });

  it('a hold with no click after it, then the keyboard (Enter), still aims', () => {
    const { wrap, strike, pointer, arms } = mount(true);
    pointer(wrap, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer(wrap, 'pointerup');
    // A keyboard click carries no pointer detail.
    strike.click();
    expect(arms()).toBe(1);
  });

  it('a hold then pointercancel after it fired still sets Auto once and aims nothing', () => {
    const { strike, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer(strike, 'pointercancel');
    click(strike);
    expect(autos()).toBe(1);
    expect(arms()).toBe(0);
  });

  it('pointercancel before the time cancels: nothing toggles, nothing aims', () => {
    const { strike, wrap, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS - 100);
    pointer(strike, 'pointercancel');
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
    vi.advanceTimersByTime(1000);
    click(strike);
    expect(autos()).toBe(0);
    expect(arms()).toBe(0);
  });

  it('pointerleave before the time neither aims nor toggles', () => {
    const { strike, pointer, click, arms, autos } = mount(true);
    pointer(strike, 'pointerdown');
    vi.advanceTimersByTime(HOLD_MS - 100);
    pointer(strike, 'pointerleave');
    vi.advanceTimersByTime(1000);
    click(strike);
    expect(autos()).toBe(0);
    expect(arms()).toBe(0);
  });

  it('a touch pointerleave right after the lift does not undo a tap', () => {
    const { strike, pointer, click, arms } = mount(true);
    pointer(strike, 'pointerdown', { pointerType: 'touch' });
    pointer(strike, 'pointerup', { pointerType: 'touch' });
    pointer(strike, 'pointerleave', { pointerType: 'touch' });
    click(strike);
    expect(arms()).toBe(1);
  });

  it('a right button or a second finger starts no hold', () => {
    const { strike, wrap, pointer, autos } = mount(true);
    pointer(strike, 'pointerdown', { button: 2 });
    pointer(strike, 'pointerdown', { isPrimary: false });
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(autos()).toBe(0);
  });

  it("a second finger lifting does not end the first one's hold", () => {
    const { strike, pointer, autos } = mount(true);
    pointer(strike, 'pointerdown');
    pointer(strike, 'pointerup', { isPrimary: false });
    vi.advanceTimersByTime(HOLD_MS);
    expect(autos()).toBe(1);
  });

  it('a long press opens no browser menu', () => {
    const { wrap } = mount(true);
    const e = new Event('contextmenu', { bubbles: true, cancelable: true });
    wrap.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("never takes pointer capture (Chrome would retarget the tap's click to the wrapper)", () => {
    const { strike, pointer, wrap } = mount(true);
    const calls: unknown[] = [];
    wrap.setPointerCapture = (...a: number[]) => void calls.push(a);
    strike.setPointerCapture = (...a: number[]) => void calls.push(a);
    pointer(strike, 'pointerdown');
    pointer(strike, 'pointerup');
    expect(calls).toEqual([]);
  });

  it('the hold ring is drawn for the eyes only, beside the button', () => {
    const { wrap } = mount(true);
    const ring = wrap.querySelector('svg.hud-hold-ring')!;
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.querySelector('rect')!.style.animationDuration).toBe(`${HOLD_MS}ms`);
  });

  it('the app can show the ring for a held key', () => {
    const { hud, wrap } = mount(true);
    hud.strikeHolding(true);
    expect(wrap.classList.contains('hud-strike-holding')).toBe(true);
    hud.strikeHolding(false);
    expect(wrap.classList.contains('hud-strike-holding')).toBe(false);
  });
});

describe('the Auto note and the one-time hint (ID-232)', () => {
  it('says "Auto on" / "Auto off" for a moment, and not at startup', () => {
    const { hud, root } = mount(true);
    const note = root.querySelector<HTMLElement>('.hud-auto-note')!;
    expect(note.hidden).toBe(true);
    hud.showAutoStrike(true);
    expect(note.hidden).toBe(true);
    hud.autoNote(true);
    expect(note.textContent).toBe('Auto on');
    expect(note.hidden).toBe(false);
    expect(note.getAttribute('role')).toBe('status');
    vi.advanceTimersByTime(AUTO_NOTE_MS - 1);
    expect(note.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(note.hidden).toBe(true);
    hud.autoNote(false);
    expect(note.textContent).toBe('Auto off');
  });

  it("a second change restarts the note's time", () => {
    const { hud, root } = mount(true);
    const note = root.querySelector<HTMLElement>('.hud-auto-note')!;
    hud.autoNote(true);
    vi.advanceTimersByTime(AUTO_NOTE_MS - 100);
    hud.autoNote(false);
    vi.advanceTimersByTime(AUTO_NOTE_MS - 100);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Auto off');
  });

  it("the hint shows and hides on the app's word", () => {
    const { hud, root } = mount(true);
    const hint = root.querySelector<HTMLElement>('.hud-strike-hint')!;
    expect(hint.hidden).toBe(true);
    expect(hint.textContent).toBe(STRIKE_HINT);
    expect(STRIKE_HINT).toBe('Tap to aim · Hold for Auto');
    hud.strikeHint(true);
    expect(hint.hidden).toBe(false);
    hud.strikeHint(false);
    expect(hint.hidden).toBe(true);
  });
});
