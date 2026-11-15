// @vitest-environment jsdom
// ID-165: the pause button beside the speeds, shown only while a fight is on; held, it is
// pressed, the chosen speed steps back and the field shows "Paused" under a dim.
import { describe, expect, it } from 'vitest';
import { newHorde } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { createHud } from './hud.ts';

const noop = (): void => {};

function mount() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const pause = root.querySelector<HTMLButtonElement>('.hud-pause')!;
  const veil = root.querySelector<HTMLElement>('.hud-paused-veil')!;
  const group = root.querySelector<HTMLElement>('.hud-speed')!;
  return { root, hud, pause, veil, group };
}

describe('the pause button (ID-165)', () => {
  it('sits in the speed group after the speeds, hidden until the app says a fight is on', () => {
    const { hud, pause, group } = mount();
    expect(pause.parentElement).toBe(group);
    expect(group.lastElementChild).toBe(pause);
    expect(pause.hidden).toBe(true);
    // A start screen's preview state reads as fighting: that alone never shows it.
    const preview = newHorde(1, setup());
    expect(preview.outcome).toBe('fighting');
    hud.update(preview);
    expect(pause.hidden).toBe(true);
    hud.fighting(true);
    expect(pause.hidden).toBe(false);
    hud.fighting(false);
    expect(pause.hidden).toBe(true);
  });

  it('held: pressed with the same name, the speed steps back, and the field says Paused', () => {
    const { hud, pause, veil, group } = mount();
    hud.fighting(true);
    hud.speed(3, false);
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(pause.getAttribute('aria-label')).toBe('Pause');
    expect(pause.title).toBe('Pause (Space)');
    expect(veil.hidden).toBe(true);
    expect(group.classList.contains('hud-speed-held')).toBe(false);
    hud.speed(3, true);
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(pause.getAttribute('aria-label')).toBe('Pause');
    expect(pause.title).toBe('Resume (Space)');
    expect(group.classList.contains('hud-speed-held')).toBe(true);
    expect(veil.hidden).toBe(false);
    expect(veil.textContent).toBe('Paused');
    expect(veil.getAttribute('aria-hidden')).toBe('true');
    // The fight over, the veil goes with the button even if the hold stays.
    hud.fighting(false);
    expect(veil.hidden).toBe(true);
    expect(pause.hidden).toBe(true);
  });

  it('a click goes to the app’s handler', () => {
    const { hud, pause } = mount();
    let clicks = 0;
    hud.onPause(() => clicks++);
    hud.fighting(true);
    pause.click();
    expect(clicks).toBe(1);
  });
});
