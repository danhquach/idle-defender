// @vitest-environment jsdom
// ID-113: the fight view lists the upgrade cards held this horde, in pick order, each
// with its level; hovering, focusing or tapping one shows its name and effect. It
// updates the moment a card is picked or an ammo card replaced, and stays out of the
// way of the offer and the result screen.
import { describe, expect, it } from 'vitest';
import { chooseCard } from '../core/cards.ts';
import { CARD } from '../core/data.ts';
import { newHorde, type HordeState, type UpgradeId } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { createHud, heldCards } from './hud.ts';
import { FIGHT_FRAME, frameCamera, HUD_SPACE, project } from './projection.ts';
import { ART_URLS, CARD_ICON } from './sprites.ts';

const noop = (): void => {};

function mount(squad = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, squad);
  const strip = root.querySelector<HTMLElement>('.hud-held')!;
  const chips = () => [...strip.querySelectorAll<HTMLButtonElement>('.hud-held-card')];
  const tip = strip.querySelector<HTMLElement>('.hud-held-tip')!;
  return { root, hud, strip, chips, tip };
}

/** A fresh horde holding `levels`, picked in the order given. */
const holding = (levels: Partial<Record<UpgradeId, number>>): HordeState => ({
  ...newHorde(1, setup()),
  taken: Object.keys(levels) as UpgradeId[],
  cardLevels: levels,
});

const mouse = (type: string): PointerEvent =>
  new PointerEvent(type, { pointerType: 'mouse', bubbles: type === 'pointerdown' });

describe('heldCards (ID-113)', () => {
  it('lists the cards in pick order with each one’s level', () => {
    const list = heldCards(
      holding({
        ricochet: 2,
        sharpshooter: 3,
        'piercing-rounds': 3,
        'frag-grenades': 1,
        'speed-loaders': 1,
      }),
    );
    expect(list.map((c) => c.id)).toEqual([
      'ricochet',
      'sharpshooter',
      'piercing-rounds',
      'frag-grenades',
      'speed-loaders',
    ]);
    // A levelled card shows "Lv n" up to its top, a repeatable one how often it was taken,
    // and a unique one no badge (its tip says Unique).
    expect(list.map((c) => c.badge)).toEqual(['Lv 2', '×3', 'Max', '', 'Lv 1']);
    expect(list.map((c) => c.title)).toEqual([
      'Ricochet · Lv 2',
      'Sharpshooter · ×3',
      'Piercing Rounds · Lv 3 · Max',
      'Frag Grenades · Unique',
      'Speed Loaders · Lv 1',
    ]);
  });

  it('spells out each card’s effect at the level held, with its numbers', () => {
    const [sharp, loaders, patch] = heldCards(
      holding({ sharpshooter: 3, 'speed-loaders': 2, 'patch-up': 1 }),
    );
    expect(sharp!.effect).toBe('+30% damage');
    expect(loaders!.effect).toBe('Reload time −20%');
    // A card with no number that changes keeps its words.
    expect(patch!.effect).toBe('Repair every wall segment by 30% of its max HP');
    expect(sharp!.kind).toBe('Common stat');
  });

  it('reads each entry out in words, the × read out', () => {
    const [mags, sharp, frag] = heldCards(
      holding({ 'extended-mags': 1, sharpshooter: 2, 'frag-grenades': 1 }),
    );
    expect(mags!.spoken).toBe(
      'Extended Mags, level 1. Magazines hold times 1.33 the rounds. Rare stat',
    );
    expect(sharp!.spoken).toBe('Sharpshooter, taken 2 times. +20% damage. Common stat');
    expect(frag!.spoken).toMatch(/^Frag Grenades, unique\. /);
  });

  it('is empty before any pick', () => {
    expect(heldCards(newHorde(1, setup()))).toEqual([]);
  });
});

describe('the held cards strip (ID-113)', () => {
  it('stays hidden until a card is held', () => {
    const { hud, strip } = mount();
    hud.update(newHorde(1, setup()));
    expect(strip.hidden).toBe(true);
  });

  it('shows one chip per card in pick order: its icon, as decoration, and its level', () => {
    const { hud, strip, chips } = mount();
    hud.update(holding({ 'barbed-wire': 2, 'rapid-fire': 1, 'concussion-rounds': 1 }));
    expect(strip.hidden).toBe(false);
    expect(chips().map((c) => c.dataset.card)).toEqual([
      'barbed-wire',
      'rapid-fire',
      'concussion-rounds',
    ]);
    const [wire, rapid, concussion] = chips();
    const img = wire!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(ART_URLS[CARD_ICON['barbed-wire']]);
    expect(img.alt).toBe('');
    expect(wire!.querySelector('.hud-held-badge')!.textContent).toBe('Lv 2');
    expect(rapid!.querySelector('.hud-held-badge')!.textContent).toBe('×1');
    expect(concussion!.querySelector('.hud-held-badge')).toBeNull();
    // Its rarity's frame, and its whole entry for a screen reader.
    expect(wire!.classList.contains('hud-held-rare')).toBe(true);
    expect(concussion!.classList.contains('hud-held-epic')).toBe(true);
    expect(wire!.getAttribute('aria-label')).toMatch(/^Barbed Wire, level 2\. Enemies /);
  });

  it('updates the moment a card is picked, and an ammo swap replaces the old chip', () => {
    const { hud, chips } = mount();
    let s: HordeState = {
      ...holding({ 'incendiary-rounds': 2, sharpshooter: 1 }),
      offer: [{ kind: 'upgrade', id: 'sharpshooter' }],
    };
    hud.update(s);
    s = chooseCard(s, 0);
    hud.update(s);
    expect(chips()[1]!.querySelector('.hud-held-badge')!.textContent).toBe('×2');
    s = chooseCard({ ...s, offer: [{ kind: 'upgrade', id: 'shock-rounds' }] }, 0);
    hud.update(s);
    expect(chips().map((c) => c.dataset.card)).toEqual(['sharpshooter', 'shock-rounds']);
    expect(chips()[1]!.querySelector('.hud-held-badge')!.textContent).toBe('Lv 1');
  });

  it('keeps the same chips on a frame where nothing changed', () => {
    const { hud, chips } = mount();
    const s = holding({ ricochet: 1 });
    hud.update(s);
    const first = chips()[0];
    hud.update(structuredClone(s));
    expect(chips()[0]).toBe(first);
  });

  it('shows a card’s name and effect on a tap, and a second tap on it closes it', () => {
    const { hud, chips, tip } = mount();
    hud.update(holding({ ricochet: 2, sharpshooter: 1 }));
    expect(tip.hidden).toBe(true);
    chips()[0]!.click();
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.hud-held-tip-title')!.textContent).toBe('Ricochet · Lv 2');
    expect(tip.querySelector('.hud-held-tip-effect')!.textContent).toBe(
      `A bullet’s first hit bounces to the nearest other enemy at ${Math.round(CARD.ricochet.share[1]! * 100)}% damage`,
    );
    expect(tip.querySelector('.hud-held-tip-kind')!.textContent).toBe('Rare behaviour');
    expect(chips()[0]!.getAttribute('aria-expanded')).toBe('true');
    // Another chip's tap moves the tip to it.
    chips()[1]!.click();
    expect(tip.querySelector('.hud-held-tip-title')!.textContent).toBe('Sharpshooter · ×1');
    chips()[1]!.click();
    expect(tip.hidden).toBe(true);
    expect(chips().every((c) => c.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('shows a card’s tip while the mouse is over it, and on keyboard focus', () => {
    const { hud, chips, tip } = mount();
    hud.update(holding({ ricochet: 1 }));
    const chip = chips()[0]!;
    chip.dispatchEvent(mouse('pointerenter'));
    expect(tip.hidden).toBe(false);
    chip.dispatchEvent(mouse('pointerleave'));
    expect(tip.hidden).toBe(true);
    chip.focus();
    expect(tip.hidden).toBe(false);
    chip.blur();
    expect(tip.hidden).toBe(true);
  });

  it('ignores a touch’s hover, which a tap’s own click answers', () => {
    const { hud, chips, tip } = mount();
    hud.update(holding({ ricochet: 1 }));
    chips()[0]!.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(tip.hidden).toBe(true);
  });

  it('puts a tip pinned from the keyboard away when focus leaves the strip', () => {
    const { root, hud, chips, tip } = mount();
    hud.update(holding({ ricochet: 1, sharpshooter: 1 }));
    const [a, b] = chips();
    a!.focus();
    a!.click();
    // Within the strip the next chip's tip takes over.
    b!.focus();
    expect(tip.hidden).toBe(false);
    b!.click();
    const outside = root.querySelector<HTMLButtonElement>('.hud-speed-button')!;
    outside.focus();
    expect(tip.hidden).toBe(true);
  });

  it('keeps a tapped tip open when the mouse leaves, until a tap elsewhere', () => {
    const { hud, chips, tip } = mount();
    hud.update(holding({ ricochet: 1 }));
    const chip = chips()[0]!;
    chip.dispatchEvent(mouse('pointerenter'));
    chip.click();
    chip.dispatchEvent(mouse('pointerleave'));
    expect(tip.hidden).toBe(false);
    chip.dispatchEvent(mouse('pointerdown'));
    expect(tip.hidden).toBe(false);
    document.body.dispatchEvent(mouse('pointerdown'));
    expect(tip.hidden).toBe(true);
  });

  it('follows its card to a new level, and closes when the card is replaced', () => {
    const { hud, chips, tip } = mount();
    hud.update(holding({ 'incendiary-rounds': 1 }));
    chips()[0]!.click();
    hud.update(holding({ 'incendiary-rounds': 2 }));
    expect(tip.querySelector('.hud-held-tip-title')!.textContent).toBe('Incendiary Rounds · Lv 2');
    hud.update(holding({ 'shock-rounds': 1 }));
    expect(tip.hidden).toBe(true);
  });

  it('puts an open tip away when the level-up offer opens', () => {
    const { hud, chips, tip } = mount();
    const s = holding({ ricochet: 1 });
    hud.update(s);
    chips()[0]!.click();
    hud.update({ ...s, offer: [{ kind: 'upgrade', id: 'sharpshooter' }] });
    expect(tip.hidden).toBe(true);
  });

  it('hides under the result screen', () => {
    const { root, hud, strip } = mount();
    const s = holding({ ricochet: 1 });
    hud.update(s);
    root.querySelector<HTMLElement>('.hud-result')!.hidden = false;
    hud.update(s);
    expect(strip.hidden).toBe(true);
  });

  it('never shows in the full game, whose top bar is laid out for other things', () => {
    const { hud, strip, chips } = mount(false);
    hud.update(holding({ ricochet: 1 }));
    expect(strip.hidden).toBe(true);
    expect(chips()).toEqual([]);
    expect(hud.topSpace()).toBe(0);
  });

  it('puts its own chips back after measuring the space it needs', () => {
    const { hud, strip, chips } = mount();
    hud.update(holding({ ricochet: 1, sharpshooter: 2 }));
    const before = chips();
    hud.topSpace();
    expect(chips()).toEqual(before);
    expect(strip.hidden).toBe(false);
  });

  it('keeps the keyboard on a focused chip through the measuring', () => {
    const { hud, chips } = mount();
    hud.update(holding({ ricochet: 1, sharpshooter: 2 }));
    chips()[1]!.focus();
    hud.topSpace();
    expect(document.activeElement).toBe(chips()[1]);
  });
});

describe('the fight frame under the held cards strip (ID-113)', () => {
  it('starts the frame under the strip when it reaches past the top bar', () => {
    const view = { w: 1100, h: 520 };
    const top = 90;
    const cam = frameCamera(view, 0, undefined, top);
    const plain = frameCamera(view);
    // Height-fit: the strip's space comes out of the field's zoom, and the frame's top
    // edge lands at the strip's bottom.
    expect(cam.zoom).toBeLessThan(plain.zoom);
    expect(project({ x: FIGHT_FRAME.left, y: FIGHT_FRAME.top }, cam).sy).toBeCloseTo(top, 6);
    // A strip no taller than the bar changes nothing.
    expect(frameCamera(view, 0, undefined, HUD_SPACE.top - 10)).toEqual(plain);
  });
});

describe('Field Repairs’ fire-rate cost on the strip (ID-137)', () => {
  /** Holding Field Repairs (and Sharpshooter), its cost running until `until`, at fight time `time`. */
  const repairing = (time: number, until: number): HordeState => ({
    ...holding({ sharpshooter: 1, 'field-repairs': 1 }),
    time,
    repairsUntil: until,
  });

  it('counts down on its chip, its cost spelt out in the tip and read out, while it runs', () => {
    const [, repairs] = heldCards(repairing(10, 14.2));
    expect(repairs!.badge).toBe('5s');
    expect(repairs!.cost).toBe('Fire rate −25%, 5 s left');
    expect(repairs!.spoken).toContain('Fire rate minus 25%, 5 s left.');
    expect(heldCards(repairing(13.5, 14.2))[1]!.badge).toBe('1s');
  });

  it('goes back to a plain unique chip the moment it ends', () => {
    const [sharp, repairs] = heldCards(repairing(14.2, 14.2));
    expect(repairs!.badge).toBe('');
    expect(repairs!.cost).toBeUndefined();
    expect(sharp!.cost).toBeUndefined();
  });

  it('the chip shows the countdown in the warning style, redrawn each second, then none', () => {
    const { hud, chips, tip } = mount();
    hud.update(repairing(10, 15));
    const badge = () => chips()[1]!.querySelector('.hud-held-badge');
    expect(badge()!.textContent).toBe('5s');
    expect(badge()!.classList.contains('hud-held-badge-cost')).toBe(true);
    chips()[1]!.focus();
    expect(tip.querySelector('.hud-held-tip-cost')!.textContent).toBe('Fire rate −25%, 5 s left');
    hud.update(repairing(11.5, 15));
    expect(badge()!.textContent).toBe('4s');
    // The open tip follows the countdown.
    expect(tip.querySelector('.hud-held-tip-cost')!.textContent).toBe('Fire rate −25%, 4 s left');
    hud.update(repairing(15, 15));
    expect(badge()).toBeNull();
    expect(tip.querySelector('.hud-held-tip-cost')).toBeNull();
    // Sharpshooter's own badge never takes the warning style.
    expect(chips()[0]!.querySelector('.hud-held-badge-cost')).toBeNull();
  });
});
