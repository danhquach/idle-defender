// @vitest-environment jsdom
// ID-100: a horde-only skill button pulses once the moment its cooldown ends (not under
// Reduce motion, and never carried into the next fight), and fight keys go by their
// place on the keyboard so one press is one key on any layout.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILLS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { tick, type HordeState } from '../core/horde.ts';
import { useSkill } from '../core/skills.ts';
import { createHud, fightKeyName, squadStart } from './hud.ts';

const NOW = 1_700_000_000_000;

/** The system's reduced-motion setting, as `matchMedia` reports it. */
function motion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion: reduce'),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const noop = () => {};
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const game = { ...newGame('horde'), skillPick: ['airstrike' as const] };
  const s = startSquadHorde(game, 1, NOW);
  s.toSpawn = 0;
  const r = useSkill(s, 'airstrike', 1000, 200);
  if (!r.ok) throw new Error(r.reason);
  return { h, game, cooling: r.state };
}

/** `s` with its clock moved on to just past the airstrike's cooldown. */
const ready = (s: HordeState): HordeState => ({
  ...s,
  time: s.time + SKILLS.airstrike.cooldown + 0.01,
});

describe('the ready pulse (ID-100)', () => {
  it('pulses once as the cooldown ends, and the class goes when the animation does', () => {
    motion(false);
    const { h, cooling } = setup();
    h.update(cooling);
    const button = document.querySelector<HTMLButtonElement>('.hud-skill:not([hidden])')!;
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
    h.update(tick(cooling, 0.1));
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
    h.update(ready(cooling));
    expect(button.classList.contains('hud-skill-ready')).toBe(true);
    button.dispatchEvent(new Event('animationend'));
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
    // Still ready: no second pulse.
    h.update(ready(cooling));
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
  });

  it('never pulses under Reduce motion', () => {
    motion(true);
    const { h, cooling } = setup();
    h.update(cooling);
    h.update(ready(cooling));
    const button = document.querySelector<HTMLButtonElement>('.hud-skill:not([hidden])')!;
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
  });

  it('a skill cooling when a fight ends does not pulse as the next one starts', () => {
    motion(false);
    const { h, game, cooling } = setup();
    h.update(cooling);
    h.showResult(squadStart(game));
    h.update(startSquadHorde(game, 2, NOW));
    const button = document.querySelector<HTMLButtonElement>('.hud-skill:not([hidden])')!;
    expect(button.classList.contains('hud-skill-ready')).toBe(false);
  });
});

describe('fight key names (ID-100)', () => {
  it('a letter key goes by its place; anything else by what it types', () => {
    expect(fightKeyName({ code: 'KeyQ', key: 'q' })).toBe('Q');
    // AZERTY: the key at Q's place types "a", and stays Q (never also speed 1×).
    expect(fightKeyName({ code: 'KeyQ', key: 'a' })).toBe('Q');
    expect(fightKeyName({ code: 'KeyA', key: 'q' })).toBe('A');
    // Another script.
    expect(fightKeyName({ code: 'KeyW', key: 'ц' })).toBe('W');
    // No code (a synthetic event): what it types.
    expect(fightKeyName({ code: '', key: 's' })).toBe('S');
    expect(fightKeyName({ code: 'Space', key: ' ' })).toBe(' ');
    expect(fightKeyName({ code: 'Digit1', key: '1' })).toBe('1');
  });
});
