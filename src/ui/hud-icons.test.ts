// @vitest-environment jsdom
// Design §15, ID-041: every horde cash shop item and skill button shows its icon beside
// its label; the icon is decoration, so a screen reader reads only the label.
import { describe, expect, it } from 'vitest';
import { SHOP_ITEMS, SKILL_IDS } from '../core/data.ts';
import { newHorde } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { createHud, shopButtons, skillButtons } from './hud.ts';
import { ART_URLS, SHOP_ICON, SKILL_ICON } from './sprites.ts';

describe('shop and skill icons (ID-041)', () => {
  it('puts each button’s bundled icon, with empty alt text, beside its label', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const noop = () => {};
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    const s = newHorde(1, setup());
    hud.update(s);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.hud-shop-item')];
    const icons = [...SHOP_ITEMS.map((i) => SHOP_ICON[i]), ...SKILL_IDS.map((k) => SKILL_ICON[k])];
    const labels = [...shopButtons(s), ...skillButtons(s, null)].map(
      (b) => `${b.label} · ${b.cost}`,
    );
    expect(buttons).toHaveLength(icons.length);
    buttons.forEach((button, i) => {
      const img = button.querySelector('img')!;
      expect(img.getAttribute('src')).toBe(ART_URLS[icons[i]!]);
      expect(img.getAttribute('src')).toBeTruthy();
      expect(img.alt).toBe('');
      const shown = button.querySelector('.hud-shop-label')!.textContent;
      expect(`${shown}${button.querySelector('.btn-cost')!.textContent}`).toBe(labels[i]);
    });
  });
});
