// @vitest-environment jsdom
// ID-140: the Airstrike's Auto toggle in the fight HUD: just after the Airstrike button,
// shown with it, during picks too, clearly on or off, and its click goes to the app.
import { describe, expect, it } from 'vitest';
import { SKILL_IDS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { newHorde, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { AUTO_KEY, createHud, fightKeyName, SKILL_KEYS, SPEED_KEYS } from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function mount(squad: boolean) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, squad);
  const auto = root.querySelector<HTMLButtonElement>('.hud-auto')!;
  const strike = root.querySelectorAll<HTMLButtonElement>('.hud-skill')[0]!;
  return { hud, auto, strike };
}

describe('the Auto toggle (ID-140)', () => {
  it('sits just after the Airstrike button, keyed E, off until told', () => {
    const { auto, strike } = mount(true);
    expect(strike.nextElementSibling).toBe(auto);
    expect(auto.type).toBe('button');
    expect(AUTO_KEY).toBe('E');
    expect(auto.getAttribute('aria-keyshortcuts')).toBe('E');
    expect(auto.getAttribute('aria-pressed')).toBe('false');
    expect(auto.textContent).toBe('Auto offE');
  });

  /** The text a screen reader names it by: everything not hidden from it. */
  const spoken = (b: HTMLElement): string =>
    [...b.childNodes]
      .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
      .map((n) => n.textContent)
      .join('')
      .trim();

  it('shows on or off as the app says; a reader hears "Auto" and its pressed state only', () => {
    const { hud, auto } = mount(true);
    hud.showAutoStrike(true);
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(auto.textContent).toBe('Auto onE');
    expect(spoken(auto)).toBe('Auto');
    hud.showAutoStrike(false);
    expect(auto.getAttribute('aria-pressed')).toBe('false');
    expect(auto.textContent).toBe('Auto offE');
    expect(spoken(auto)).toBe('Auto');
  });

  it('E is read by its place, so it is the same key on any layout, and clashes with no fight key', () => {
    expect(fightKeyName({ code: 'KeyE', key: 'é' })).toBe(AUTO_KEY);
    expect(fightKeyName({ code: 'KeyE', key: 'E' })).toBe(AUTO_KEY);
    expect([...SKILL_KEYS, ...Object.values(SPEED_KEYS), '1', '2', '3', ' ']).not.toContain(
      AUTO_KEY,
    );
  });

  it('a click goes to the app', () => {
    const { hud, auto } = mount(true);
    let clicks = 0;
    hud.onAutoStrike(() => clicks++);
    auto.click();
    expect(clicks).toBe(1);
  });

  it('shows with a picked Airstrike, during a pick too, and hides without it', () => {
    const { hud, auto } = mount(true);
    const s = startSquadHorde({ ...newGame(), skillPick: ['airstrike'] }, 1, NOW);
    hud.update(s);
    expect(auto.hidden).toBe(false);
    const picking: HordeState = { ...s, offer: [] };
    hud.update(picking);
    expect(auto.hidden).toBe(false);
    expect(auto.disabled).toBe(false);
    hud.update(startSquadHorde({ ...newGame(), skillPick: [] }, 1, NOW));
    expect(auto.hidden).toBe(true);
  });

  it('in the full game, shows only once the Airstrike is researched', () => {
    const { hud, auto } = mount(false);
    hud.update(newHorde(1, { ...setup(), skills: [] }));
    expect(auto.hidden).toBe(true);
    hud.update(newHorde(1, { ...setup(), skills: [...SKILL_IDS] }));
    expect(auto.hidden).toBe(false);
  });
});
