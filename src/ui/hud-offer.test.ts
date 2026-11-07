// @vitest-environment jsdom
// ID-103: the level-up offer shows each upgrade card's icon on a plate in its rarity's
// frame; a pick plays a short confirm effect (or none when the system asks for less
// motion) and the panel takes no second pick meanwhile.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_IDS, UPGRADES } from '../core/cards.ts';
import { newHorde, type Card, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { createHud, PICK_MS } from './hud.ts';
import { ART_URLS, avatarOf, CARD_ICON } from './sprites.ts';

const noop = () => {};

function mount(onChoose: (i: number) => void = noop, onReroll: () => void = noop) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, onChoose, noop, noop, noop, noop, noop, noop, onReroll, noop, noop);
  const panel = root.querySelector<HTMLElement>('.hud-cards')!;
  const cards = () => [...panel.querySelectorAll<HTMLButtonElement>('.hud-card')];
  return { hud, panel, cards };
}

const offer = (...ids: (typeof UPGRADE_IDS)[number][]): Card[] =>
  ids.map((id) => ({ kind: 'upgrade', id }));
const withOffer = (o: Card[] | null): HordeState => ({ ...newHorde(1, setup()), offer: o });

/** The system's reduced-motion setting, as `matchMedia` reports it. */
function motion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion: reduce'),
  }));
}

const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('offer card icons and frames (ID-103)', () => {
  it('maps every upgrade card in the pool to a bundled icon', () => {
    for (const id of UPGRADE_IDS) expect(ART_URLS[CARD_ICON[id]], id).toBeTruthy();
  });

  it('shows each upgrade card’s icon, as decoration, in its rarity’s frame', () => {
    const { hud, cards } = mount();
    const ids = ['sharpshooter', 'ricochet', 'frag-grenades'] as const;
    hud.update(withOffer(offer(...ids)));
    cards().forEach((card, i) => {
      const id = ids[i]!;
      const img = card.querySelector<HTMLImageElement>('.hud-card-art > img.hud-card-icon')!;
      expect(img.getAttribute('src')).toBe(ART_URLS[CARD_ICON[id]]);
      expect(img.alt).toBe('');
      expect(card.classList.contains(`hud-card-${UPGRADES[id].rarity}`)).toBe(true);
      // The rarity is in words too, not colour alone.
      expect(card.querySelector('.hud-card-kind')!.textContent).toMatch(
        new RegExp(`^${UPGRADES[id].rarity}`, 'i'),
      );
    });
    // The sample covers every rarity.
    expect(ids.map((id) => UPGRADES[id].rarity)).toEqual(['common', 'rare', 'epic']);
  });

  it('shows a recruit card with the survivor’s own avatar and a "Recruit" kind line', () => {
    // So it never reads as a rare card beside one (designer review).
    const { hud, cards } = mount();
    const s = withOffer(null);
    const defender = s.bench[0]!;
    hud.update({ ...s, offer: [{ kind: 'recruit', defender }, ...offer('ricochet')] });
    const card = cards()[0]!;
    expect(card.classList.contains('hud-card-recruit')).toBe(true);
    const img = card.querySelector<HTMLImageElement>('.hud-card-art > img.hud-card-icon')!;
    expect(img.getAttribute('src')).toBe(ART_URLS[avatarOf(defender)]);
    expect(img.alt).toBe('');
    expect(card.querySelector('.hud-card-kind')!.textContent).toBe('Recruit');
  });
});

describe('picking a card (ID-103)', () => {
  it('with motion: picks once at once, flashes the card, takes no second pick, then closes', () => {
    vi.useFakeTimers();
    motion(false);
    const onChoose = vi.fn();
    const { hud, panel, cards } = mount(onChoose);
    hud.update(withOffer(offer('sharpshooter', 'ricochet', 'reinforce')));
    cards()[1]!.click();
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(1);
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('hud-cards-picking')).toBe(true);
    expect(cards()[1]!.classList.contains('hud-card-picked')).toBe(true);
    // The fight resumes with no offer; the panel waits for the effect.
    hud.update(withOffer(null));
    expect(panel.hidden).toBe(false);
    cards()[0]!.click();
    press('3');
    expect(onChoose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PICK_MS);
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains('hud-cards-picking')).toBe(false);
    expect(cards()).toHaveLength(0);
  });

  it('keeps the whole pick under half a second', () => {
    expect(PICK_MS).toBeLessThan(500);
  });

  it('with less motion asked for: closes at once, with nothing left to play', () => {
    motion(true);
    const onChoose = vi.fn();
    const { hud, panel } = mount(onChoose);
    hud.update(withOffer(offer('sharpshooter', 'ricochet', 'reinforce')));
    press('2');
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(1);
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains('hud-cards-picking')).toBe(false);
  });

  it('a new offer during the effect is shown at once and can be picked', () => {
    vi.useFakeTimers();
    motion(false);
    const onChoose = vi.fn();
    const { hud, panel, cards } = mount(onChoose);
    hud.update(withOffer(offer('sharpshooter', 'ricochet', 'reinforce')));
    press('1');
    const next = ['long-sight', 'rapid-fire', 'patch-up'] as const;
    hud.update(withOffer(offer(...next)));
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('hud-cards-picking')).toBe(false);
    expect(cards().map((c) => c.querySelector('.hud-card-title')!.textContent)).toEqual(
      next.map((id) => UPGRADES[id].name),
    );
    // The old effect's timer must not close the new offer.
    vi.advanceTimersByTime(PICK_MS);
    expect(panel.hidden).toBe(false);
    press('2');
    expect(onChoose.mock.calls).toEqual([[0], [1]]);
  });

  it('a new offer of the very same cards during the effect is still shown and pickable', () => {
    vi.useFakeTimers();
    motion(false);
    const onChoose = vi.fn();
    const { hud, panel } = mount(onChoose);
    const same = offer('sharpshooter', 'ricochet', 'reinforce');
    hud.update(withOffer(same));
    press('1');
    hud.update(withOffer(offer('sharpshooter', 'ricochet', 'reinforce')));
    vi.advanceTimersByTime(PICK_MS);
    expect(panel.hidden).toBe(false);
    press('3');
    expect(onChoose.mock.calls).toEqual([[0], [2]]);
  });

  it('takes no reroll while a pick’s effect plays', () => {
    vi.useFakeTimers();
    motion(false);
    const onReroll = vi.fn();
    const { hud, panel } = mount(noop, onReroll);
    // Second Look gives the offer a reroll button.
    const s = {
      ...withOffer(offer('sharpshooter', 'ricochet', 'reinforce')),
      perks: ['second-look'],
    };
    hud.update(s as HordeState);
    const reroll = panel.querySelector<HTMLButtonElement>('.hud-reroll')!;
    expect(reroll.disabled).toBe(false);
    press('1');
    reroll.click();
    expect(onReroll).not.toHaveBeenCalled();
  });

  it('keeps the cards plain buttons in the tab order, so Tab reaches them and Enter picks', () => {
    // jsdom has no real Tab or :focus-visible: the ring, the lift and Tab then Enter were
    // checked in a real browser (ID-103 PR). This pins what makes them work.
    motion(true);
    const onChoose = vi.fn();
    const { hud, cards } = mount(onChoose);
    hud.update(withOffer(offer('sharpshooter', 'ricochet', 'reinforce')));
    for (const c of cards()) {
      expect(c.tagName).toBe('BUTTON');
      expect(c.type).toBe('button');
      expect(c.tabIndex).toBe(0);
      expect(c.disabled).toBe(false);
    }
    cards()[2]!.focus();
    expect(document.activeElement).toBe(cards()[2]);
    cards()[2]!.click(); // what Enter does on a focused button
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(2);
  });
});
