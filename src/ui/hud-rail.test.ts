// @vitest-environment jsdom
// ID-275: the phone's fight rail. The Airstrike's cooldown sweep is a pure number the HUD writes
// to the button's wrapper (--cool, 0-100, only when it changes); the right rail's skill buttons
// fit under the speeds at 303 px tall; the version label is shown in Menu → Help.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SKILLS, SKILL_IDS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { coolFrac, createHud, skillButtons } from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};
const css = readFileSync(join(process.cwd(), 'src/page.css'), 'utf8');

/** A picked Airstrike with `left` seconds of cooldown to run. */
const cooling = (left: number) => {
  const s = startSquadHorde({ ...newGame(), skillPick: ['airstrike'] }, 1, NOW);
  return { ...s, cooldowns: { ...s.cooldowns, airstrike: s.time + left } };
};

describe('the Airstrike cooldown sweep (ID-275)', () => {
  it('coolFrac runs 1 just used to 0 ready, clamped', () => {
    expect(coolFrac(0, 60)).toBe(0);
    expect(coolFrac(30, 60)).toBe(0.5);
    expect(coolFrac(60, 60)).toBe(1);
    expect(coolFrac(90, 60)).toBe(1);
    expect(coolFrac(-5, 60)).toBe(0);
    expect(coolFrac(5, 0)).toBe(0);
  });

  it('skillButtons carries it for the Airstrike', () => {
    const cooldown = SKILLS.airstrike.cooldown;
    expect(skillButtons(cooling(0), null)[0]!.coolFrac).toBe(0);
    expect(skillButtons(cooling(cooldown / 2), null)[0]!.coolFrac).toBe(0.5);
    expect(skillButtons(cooling(cooldown), null)[0]!.coolFrac).toBe(1);
  });

  it('writes --cool as a plain number on the wrapper, only when the rounded value changes', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const wrap = root.querySelector<HTMLElement>('.hud-strike')!;
    const set = vi.spyOn(wrap.style, 'setProperty');
    const cooldown = SKILLS.airstrike.cooldown;
    hud.update(cooling(0));
    expect(wrap.style.getPropertyValue('--cool')).toBe('0');
    hud.update(cooling(cooldown / 2));
    expect(wrap.style.getPropertyValue('--cool')).toBe('50');
    hud.update(cooling(cooldown / 2));
    expect(set).toHaveBeenCalledTimes(2);
    hud.update(cooling(cooldown));
    expect(wrap.style.getPropertyValue('--cool')).toBe('100');
    // Auto is a separate attribute: both can show at once (the CSS keeps the two looks apart).
    hud.showAutoStrike(true);
    expect(wrap.dataset.auto).toBe('on');
    expect(wrap.style.getPropertyValue('--cool')).toBe('100');
  });
});

describe('the right rail budget at 303 px tall (ID-275)', () => {
  it('the Scrap chip, the speeds with Pause, and every skill button with its gaps fit', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const speeds = root.querySelectorAll('.hud-speed-button').length;
    const scrap = Number(
      /\.scrap-chip \{[^}]*?height: (\d+)px;/.exec(
        css.slice(css.indexOf('@media (pointer: coarse) and (max-height: 540px)')),
      )![1],
    );
    // The skills: every skill id and Field Repairs, 44 px each, 4 px apart (--space-4).
    const skills = SKILL_IDS.length + 1;
    const gap = Number(/--space-4: (\d+)px/.exec(css)![1]);
    // The column stands clear of the bottom edge by its own inset.
    const shell = css.slice(css.indexOf('@media (pointer: coarse) and (max-height: 540px)'));
    const inset = Number(/\.hud-shop \{[^}]*?bottom: (\d+)px;/.exec(shell)![1]);
    const total = scrap + speeds * 44 + skills * 44 + (skills - 1) * gap + inset;
    expect(speeds).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(303);
  });
});
