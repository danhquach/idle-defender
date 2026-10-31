// @vitest-environment jsdom
// The UI kit's button variants (design §15, ID-056).
import { describe, expect, it } from 'vitest';
import { newHorde } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { stockOf } from '../core/data.ts';
import { createHud, LOCKED_NOTE } from './hud.ts';
import { BUTTON_VARIANTS, costLine, setVariant } from './kit.ts';

const button = (): HTMLButtonElement => {
  const b = document.createElement('button');
  const label = document.createElement('span');
  label.textContent = 'Build tower';
  b.append(label);
  return b;
};
const variantsOf = (b: HTMLElement) =>
  BUTTON_VARIANTS.filter((v) => b.classList.contains(`btn-${v}`));

describe('button variants (ID-056)', () => {
  it('keeps primary and secondary enabled, with no badge or reason', () => {
    for (const v of ['primary', 'secondary'] as const) {
      const b = button();
      setVariant(b, v, 'ignored');
      expect(variantsOf(b)).toEqual([v]);
      expect(b.disabled).toBe(false);
      expect(b.querySelector('.btn-lock, .btn-reason')).toBeNull();
    }
  });

  it('shows a locked button’s lock badge and its reason as visible text', () => {
    const b = button();
    setVariant(b, 'locked', 'Research Metal walls first');
    expect(variantsOf(b)).toEqual(['locked']);
    expect(b.disabled).toBe(true);
    const badge = b.firstElementChild!;
    expect(badge.className).toBe('btn-lock');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(b.querySelector('.btn-reason')!.textContent).toBe('Research Metal walls first');
    expect(b.textContent).toBe('Build towerResearch Metal walls first');
  });

  it('disables an unaffordable button, with its reason only when given', () => {
    const b = button();
    setVariant(b, 'unaffordable');
    expect(variantsOf(b)).toEqual(['unaffordable']);
    expect(b.disabled).toBe(true);
    expect(b.querySelector('.btn-lock, .btn-reason')).toBeNull();
    setVariant(b, 'unaffordable', 'Not enough metal');
    expect(b.querySelector('.btn-reason')!.textContent).toBe('Not enough metal');
  });

  it('moves one button between states without piling up badges or lines', () => {
    const b = button();
    setVariant(b, 'locked', 'A');
    setVariant(b, 'locked', 'B');
    expect(b.querySelectorAll('.btn-lock')).toHaveLength(1);
    expect([...b.querySelectorAll('.btn-reason')].map((n) => n.textContent)).toEqual(['B']);
    setVariant(b, 'secondary');
    expect(variantsOf(b)).toEqual(['secondary']);
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe('Build tower');
  });

  it('marks only the materials the stock is short of', () => {
    const line = costLine({ scrap: 60, wood: 80 }, stockOf({ scrap: 40, wood: 90 }), 'c');
    expect(line.textContent).toBe('(60 scrap, 80 wood)');
    expect([...line.querySelectorAll('.btn-cost-short')].map((n) => n.textContent)).toEqual([
      '60 scrap',
    ]);
    expect(costLine({}, null, 'c').textContent).toBe('(nothing)');
    expect(costLine({ wood: 5 }, null, 'c').querySelector('.btn-cost-short')).toBeNull();
  });

  it('keeps the horde row’s shape all fight: lock only for missing research (ID-056)', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const noop = () => {};
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    const s = newHorde(1, setup());
    s.skills = ['flashbang'];
    hud.update(s);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.hud-shop-item')];
    const [adrenaline, , patch, , flashbang, molotov] = buttons;
    // No cash: Adrenaline is only unaffordable, its cost red and no extra line.
    expect(variantsOf(adrenaline!)).toEqual(['unaffordable']);
    expect(adrenaline!.querySelector('.btn-cost-short')!.textContent).toBe('30');
    expect(adrenaline!.querySelector('.btn-reason')).toBeNull();
    expect(adrenaline!.title).toBe('Not enough cash');
    // Nothing to patch is a passing refusal: the plain button, disabled.
    expect(variantsOf(patch!)).toEqual(['secondary']);
    expect(patch!.disabled).toBe(true);
    expect(patch!.querySelector('.btn-lock, .btn-reason')).toBeNull();
    // Not researched: locked, with a short note; the full reason is the tooltip.
    expect(variantsOf(molotov!)).toEqual(['locked']);
    expect(molotov!.querySelector('.btn-reason')!.textContent).toBe(LOCKED_NOTE);
    expect(molotov!.title).toBe('Research Molotov first');
    // Using a skill (cooling down) adds no badge and no line.
    const shape = () => buttons.map((b) => b.querySelectorAll('.btn-lock, .btn-reason').length);
    const before = shape();
    hud.update({ ...s, cash: 100, cooldowns: { ...s.cooldowns, flashbang: s.time + 10 } });
    expect(flashbang!.disabled).toBe(true);
    expect(variantsOf(flashbang!)).toEqual(['secondary']);
    expect(shape()).toEqual(before);
  });
});
