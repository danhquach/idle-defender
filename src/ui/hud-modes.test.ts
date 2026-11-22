// @vitest-environment jsdom
// ID-218 The mode switch on the start and result screens: shown once Nightmare is unlocked,
// locked modes say what unlocks them, the goal chip names the mode's best, and the picker
// lists the mode's own hordes. Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { effHorde } from '../core/modes.ts';
import { recommendedPower } from '../core/squadpower.ts';
import { createHud, goalChip, hordePicker, modeChoices, squadScreen, squadStart } from './hud.ts';

const noop = (): void => {};

function camp(extra: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 51,
    roster: Array.from({ length: 2 }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: 2 },
    ...extra,
  };
}

function hud() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  return { root, h };
}

describe('the mode switch (ID-218)', () => {
  it('is absent until Nightmare is unlocked', () => {
    expect(modeChoices(camp({ hordeNumber: 50 }))).toBeNull();
    expect(hordePicker(camp({ hordeNumber: 50 })).modes).toBeUndefined();
    const { root, h } = hud();
    h.showResult(squadStart(camp({ hordeNumber: 50 })));
    expect(root.querySelector('.hud-modes')).toBeNull();
  });

  it('lists Normal, Nightmare and Hell, Hell locked with what unlocks it', () => {
    const choices = modeChoices(camp())!;
    expect(choices.map((c) => [c.mode, c.open, c.current])).toEqual([
      ['normal', true, true],
      ['nightmare', true, false],
      ['hell', false, false],
    ]);
    expect(choices[2]!.hint).toBe('Hold Horde 50 on Nightmare');
    expect(
      modeChoices(camp({ mode: 'nightmare', modes: { nightmare: 51 } }))!.map((c) => c.open),
    ).toEqual([true, true, true]);
  });

  it('draws one button per mode: the mode in play pressed, a locked one disabled and explained', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp()));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.hud-mode')];
    const names = buttons.map((b) => b.querySelector('.hud-mode-name')!.textContent);
    expect(names).toEqual(['Normal', 'Nightmare', 'Hell']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, true]);
    expect(buttons[2]!.title).toBe('Hold Horde 50 on Nightmare');
    // Only a locked mode names what opens it, under its name, in the same button.
    const hints = [...root.querySelectorAll('.hud-mode-hint')];
    expect(hints.map((e) => e.textContent)).toEqual(['Hold Horde 50 on Nightmare']);
    expect(buttons[2]!.contains(hints[0]!)).toBe(true);
    expect(root.querySelector('.hud-mode-row')!.getAttribute('role')).toBe('group');
    for (const e of root.querySelectorAll('.hud-mode-name, .hud-mode-hint')) {
      expect(e.children).toHaveLength(0);
    }
  });

  it('a press goes to the handler; the mode in play and a locked one do not', () => {
    const { root, h } = hud();
    const pick = vi.fn();
    h.onModePick(pick);
    h.showResult(squadStart(camp()));
    const [normal, nightmare, hell] = [...root.querySelectorAll<HTMLButtonElement>('.hud-mode')];
    normal!.click();
    hell!.click();
    expect(pick).not.toHaveBeenCalled();
    nightmare!.click();
    expect(pick).toHaveBeenCalledWith('nightmare');
  });

  it('also on a result screen', () => {
    const g = camp();
    const s = { ...startSquadHorde(g, 1, 0), outcome: 'lost' as const, wave: 2 };
    const { root, h } = hud();
    h.showResult(squadScreen(g, s));
    expect(root.querySelectorAll('.hud-mode')).toHaveLength(3);
  });
});

describe('a mode’s screens (ID-218)', () => {
  const nm = (n: number): GameState => camp({ mode: 'nightmare', modes: { nightmare: n } });

  it('the goal chip names the mode and its best horde', () => {
    // No best before the mode's first win: the mode alone, and no "new best" note.
    expect(goalChip(nm(1))).toEqual({ chip: { text: 'Nightmare', tone: 'warn' }, note: null });
    expect(goalChip(nm(13))!.chip.text).toBe('Nightmare · best 12');
    expect(goalChip(camp({ mode: 'hell', modes: { nightmare: 60, hell: 4 } }))!.chip.text).toBe(
      'Hell · best 3',
    );
    // Normal keeps its own Endless chip, and none before it.
    expect(goalChip(camp())!.chip.text).toBe('Endless · best 50');
    expect(goalChip(camp({ hordeNumber: 12 }))).toBeNull();
  });

  it('the start screen reads the mode’s horde, with the chip first', () => {
    const s = squadStart(nm(7));
    expect(s.title).toBe('Horde 7');
    expect(s.debrief!.chips[0]!.text).toBe('Nightmare · best 6');
    expect(s.picker!.value).toBe(7);
    expect(s.button).toBe('Start Horde 7');
  });

  it('the picker lists the mode’s own hordes, with the power of their strength', () => {
    const p = hordePicker(nm(4));
    expect(p.options.map((o) => o.horde)).toEqual([4, 3, 2, 1]);
    const first = p.options.at(-1)!;
    expect(first.power.rec).toBe(recommendedPower(effHorde('nightmare', 1), 'nightmare'));
    expect(first.power.rec).toBeGreaterThan(recommendedPower(1));
    // The boss horde of the mode is its own 10th.
    expect(hordePicker(nm(10)).options[0]!.label).toContain('Boss');
    expect(hordePicker(nm(9)).options[0]!.label).not.toContain('Boss');
  });

  it('a first clear’s result moves on to the mode’s next horde', () => {
    const g = nm(3);
    const s = { ...startSquadHorde(g, 1, 0), outcome: 'won' as const, wave: 5 };
    const screen = squadScreen(g, s);
    expect(screen.title).toBe('Horde 3 - You hold the line');
    expect(screen.picker!.value).toBe(4);
    expect(screen.button).toBe('Start Horde 4');
  });
});
