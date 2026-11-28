// @vitest-environment jsdom
// ID-284: the starting pick on the squad screen. A button per slot with something unlocked (none
// unlocked: no group), showing the picked card or None; a list of None and the unlocked cards, each
// with its Lv 1 effect and Mk, under the replace rule; a choice goes to the app. Text reaches the
// page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { recruit } from '../core/camp.ts';
import type { TechId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createHud, kitPicker, squadStart } from './hud.ts';
import { KIT_LABEL, KIT_NONE, KIT_RULE } from './text/index.ts';

const noop = (): void => {};

function camp(tech: TechId[] = [], kit?: GameState['kit']): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 3,
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    ...(tech.length > 0 ? { tech } : {}),
    ...(kit ? { kit } : {}),
  };
}

function hud() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  const picks: [string, string | null][] = [];
  h.onKitPick((slot, card) => picks.push([slot, card]));
  return { root, h, picks };
}
const buttons = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>('.hud-kit-button'),
];
const options = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>('.hud-kit-option'),
];

describe('kitPicker (ID-284)', () => {
  it('is none while nothing is unlocked, a Mk alone included', () => {
    expect(kitPicker(camp())).toBeUndefined();
    expect(kitPicker(camp(['hand-loads', 'razor-wire']))).toBeUndefined();
  });

  it('one slot with something unlocked shows that slot only', () => {
    const p = kitPicker(camp(['molotov']))!;
    expect(p.slots.map((s) => s.slot)).toEqual(['throwable']);
    expect(p.slots[0]!.label).toBe('Start with: Throwable');
    expect(p.slots[0]!.picked).toBeNull();
    expect(p.slots[0]!.options.map((o) => o.card)).toEqual(['molotov']);
    expect(p.rule).toBe(KIT_RULE);
  });

  it('both slots, each listing its unlocked cards with the Mk and the Lv 1 effect', () => {
    const p = kitPicker(
      camp(['incendiary-rounds', 'incendiary-rounds-mk2', 'frag-grenades', 'flashbang'], {
        ammo: 'incendiary-rounds',
        throwable: 'flashbang',
      }),
    )!;
    expect(p.slots.map((s) => [s.slot, s.picked?.card])).toEqual([
      ['ammo', 'incendiary-rounds'],
      ['throwable', 'flashbang'],
    ]);
    const ammo = p.slots[0]!.options[0]!;
    expect(ammo.name).toBe('Incendiary Rounds · Mk II');
    expect(ammo.detail).toContain('3.45%');
    expect(p.slots[1]!.options.map((o) => [o.card, o.picked, o.name])).toEqual([
      ['frag-grenades', false, 'Frag Grenades'],
      ['flashbang', true, 'Flashbang'],
    ]);
    expect(p.slots[1]!.options[1]!.detail).toContain('3 s');
  });

  it('a pick whose unlock is gone is not shown as picked', () => {
    const p = kitPicker(camp(['shock-rounds'], { ammo: 'incendiary-rounds' }))!;
    expect(p.slots[0]!.picked).toBeNull();
  });
});

describe('the starting pick on the squad screen (ID-284)', () => {
  it('a player who has researched none sees no group', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp()));
    const group = root.querySelector<HTMLElement>('.hud-kit-pick')!;
    expect(group.hidden).toBe(true);
    expect(buttons(root)).toHaveLength(0);
  });

  it('one slot: one button, "None" until picked; both: two, in the start row beside the skills', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp(['shock-rounds'])));
    expect(buttons(root).map((b) => b.dataset.slot)).toEqual(['ammo']);
    expect(buttons(root)[0]!.querySelector('.hud-kit-label')!.textContent).toBe(KIT_LABEL.ammo);
    expect(buttons(root)[0]!.querySelector('.hud-kit-card')!.textContent).toBe(KIT_NONE);
    h.showResult(squadStart(camp(['shock-rounds', 'molotov'], { throwable: 'molotov' })));
    const bs = buttons(root);
    expect(bs.map((b) => b.dataset.slot)).toEqual(['ammo', 'throwable']);
    expect(bs[1]!.querySelector('.hud-kit-card')!.textContent).toBe('Molotov');
    expect(bs[1]!.querySelector('img.hud-kit-icon')).not.toBeNull();
    // Set or none is on the button itself, for the icon-only phone look.
    expect(bs.map((b) => b.dataset.state)).toEqual(['none', 'set']);
    expect(bs[0]!.querySelector('.hud-kit-empty')).not.toBeNull();
    const row = root.querySelector('.hud-start-row')!;
    expect([...row.children].map((c) => c.classList[0])).toEqual([
      'hud-skill-pick',
      'hud-kit-pick',
      'hud-button',
    ]);
    // A name for a screen reader on the icon-only phone button.
    expect(bs[0]!.getAttribute('aria-label')).toBe('Start with: Ammo: None');
    expect(bs[1]!.getAttribute('aria-label')).toBe('Start with: Throwable: Molotov');
  });

  it('a press opens the list: the rule, None, then each unlocked card with its effect', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp(['frag-grenades', 'flashbang', 'frag-grenades-mk2'])));
    const list = root.querySelector<HTMLElement>('.hud-kit-list')!;
    expect(list.hidden).toBe(true);
    buttons(root)[0]!.click();
    expect(list.hidden).toBe(false);
    expect(buttons(root)[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(list.querySelector('.hud-kit-rule')!.textContent).toBe(KIT_RULE);
    expect(options(root).map((o) => o.querySelector('.hud-kit-option-name')!.textContent)).toEqual([
      KIT_NONE,
      'Frag Grenades · Mk II',
      'Flashbang',
    ]);
    expect(options(root)[1]!.textContent).toContain('28.75%');
    expect(options(root).map((o) => o.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    // Another press on the button puts it away.
    buttons(root)[0]!.click();
    expect(list.hidden).toBe(true);
  });

  it('a choice goes to the app, the list closes and the keyboard returns to the button', () => {
    const { root, h, picks } = hud();
    h.showResult(squadStart(camp(['incendiary-rounds', 'shock-rounds'])));
    buttons(root)[0]!.click();
    options(root)[2]!.click();
    expect(picks).toEqual([['ammo', 'shock-rounds']]);
    expect(root.querySelector<HTMLElement>('.hud-kit-list')!.hidden).toBe(true);
    expect(document.activeElement).toBe(buttons(root)[0]);
    buttons(root)[0]!.click();
    options(root)[0]!.click();
    expect(picks.at(-1)).toEqual(['ammo', null]);
  });

  it('the app redraws the pick it saved', () => {
    const { root, h } = hud();
    const g = camp(['incendiary-rounds']);
    h.showResult(squadStart(g));
    h.showKit(kitPicker({ ...g, kit: { ammo: 'incendiary-rounds' } }));
    expect(buttons(root)[0]!.querySelector('.hud-kit-card')!.textContent).toBe('Incendiary Rounds');
    h.showKit(undefined);
    expect(root.querySelector<HTMLElement>('.hud-kit-pick')!.hidden).toBe(true);
  });

  it('Esc puts only the list away, and a press elsewhere does too', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp(['molotov'])));
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    buttons(root)[0]!.click();
    root
      .querySelector('.hud-kit-list')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector<HTMLElement>('.hud-kit-list')!.hidden).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(buttons(root)[0]);
    buttons(root)[0]!.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.querySelector<HTMLElement>('.hud-kit-list')!.hidden).toBe(true);
    document.removeEventListener('keydown', outer);
  });

  it('arrow keys walk the list', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp(['frag-grenades', 'molotov'])));
    buttons(root)[0]!.click();
    const list = root.querySelector('.hud-kit-list')!;
    const key = (k: string) =>
      list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    expect(document.activeElement).toBe(options(root)[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(options(root)[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(options(root)[2]);
  });

  it('puts words only through textContent: no HTML from a card name is parsed', () => {
    const { root, h } = hud();
    h.showResult(squadStart(camp(['molotov'], { throwable: 'molotov' })));
    buttons(root)[0]!.click();
    expect(root.querySelector('.hud-kit-pick')!.innerHTML).not.toContain('<script');
    for (const e of root.querySelectorAll('.hud-kit-card, .hud-kit-option-name')) {
      expect(e.children).toHaveLength(0);
    }
  });
});
