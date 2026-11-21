// @vitest-environment jsdom
// ID-210: the card pick's Reroll, Skip and Ban buttons under the cards, their counts and
// greyed states, Ban's two-step flow, and the R S B keys beside 1 2 3.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAN, REROLL } from '../core/data.ts';
import { newHorde, type Card, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { createHud, OFFER_KEY_GUARD_MS, type OfferAct } from './hud.ts';

const noop = () => {};

function mount(onOffer: (act: OfferAct) => void = noop, onChoose: (i: number) => void = noop) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, onChoose, noop, noop, noop, noop, noop, onOffer, noop, noop);
  const panel = root.querySelector<HTMLElement>('.hud-cards')!;
  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  return {
    hud,
    panel,
    reroll: () => q<HTMLButtonElement>('.hud-offer-reroll'),
    skip: () => q<HTMLButtonElement>('.hud-offer-skip'),
    ban: () => q<HTMLButtonElement>('.hud-offer-ban'),
    cards: () => [...panel.querySelectorAll<HTMLButtonElement>('.hud-card')],
    title: () => q('.hud-cards-title').textContent,
  };
}

const offer = (): Card[] => [
  { kind: 'upgrade', id: 'sharpshooter' },
  { kind: 'upgrade', id: 'ricochet' },
  { kind: 'upgrade', id: 'reinforce' },
];
const withOffer = (extra: Partial<HordeState> = {}, o: Card[] | null = offer()): HordeState => ({
  ...newHorde(1, setup()),
  offer: o,
  ...extra,
});
const raw = (key: string, code = `Key${key.toUpperCase()}`) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
/** A key a moment after the pick opened: past the guard that keeps S from skipping an unseen card. */
const press = (key: string, code?: string) => {
  vi.advanceTimersByTime(OFFER_KEY_GUARD_MS);
  raw(key, code);
};
/** A button's words, without its key hint. */
const words = (b: HTMLElement) => b.firstChild!.textContent;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the buttons under the cards', () => {
  it('show on every pick, after the cards, with the counts', () => {
    const { hud, panel, reroll, skip, ban } = mount();
    hud.update(withOffer());
    expect(words(reroll())).toBe(`Reroll · ${REROLL.perHorde}`);
    expect(words(skip())).toBe('Skip · +1 reroll');
    expect(words(ban())).toBe(`Ban · ${BAN.perHorde}`);
    const row = panel.querySelector('.hud-card-row')!;
    const actions = panel.querySelector('.hud-offer-actions')!;
    expect(row.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.contains(reroll()) && actions.contains(skip()) && actions.contains(ban())).toBe(
      true,
    );
    for (const b of [reroll(), skip(), ban()]) {
      expect(b.type).toBe('button');
      expect(b.tabIndex).toBe(0);
    }
  });

  it('count what is left, and a skip’s reroll shows', () => {
    const { hud, reroll, ban } = mount();
    hud.update(withOffer({ rerolls: 2, skips: 1, bans: 1 }));
    expect(words(reroll())).toBe('Reroll · 2');
    expect(words(ban())).toBe('Ban · 0');
  });

  it('grey out at 0, and take no click then', () => {
    const onOffer = vi.fn();
    const { hud, reroll, ban, skip } = mount(onOffer);
    hud.update(withOffer({ rerolls: 3, bans: 1 }));
    expect(reroll().disabled).toBe(true);
    expect(ban().disabled).toBe(true);
    expect(skip().disabled).toBe(false);
    reroll().click();
    ban().click();
    press('r');
    press('b');
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('Second Look’s rerolls add to the count', () => {
    const { hud, reroll } = mount();
    hud.update(withOffer({ perks: ['second-look'], perkLevels: { 'second-look': 1 } }));
    expect(words(reroll())).toBe(`Reroll · ${REROLL.perHorde + 1}`);
  });

  it('redraw when a reroll deals the very same cards', () => {
    const { hud, reroll } = mount();
    hud.update(withOffer());
    hud.update(withOffer({ rerolls: 1 }));
    expect(words(reroll())).toBe('Reroll · 2');
  });

  it('are plain text, built with textContent only', () => {
    const { hud, panel } = mount();
    hud.update(withOffer());
    expect(
      panel.querySelector('.hud-offer-actions')!.querySelectorAll('*:not(button):not(kbd)'),
    ).toHaveLength(0);
  });
});

describe('Reroll and Skip', () => {
  it('by click and by R and S', () => {
    const onOffer = vi.fn();
    const { hud, reroll, skip } = mount(onOffer);
    hud.update(withOffer());
    reroll().click();
    skip().click();
    expect(onOffer.mock.calls).toEqual([[{ act: 'reroll' }], [{ act: 'skip' }]]);
    onOffer.mockClear();
    hud.update(withOffer({ rerolls: 1 }));
    press('r');
    hud.update(withOffer({ rerolls: 1, skips: 0 }, offer().reverse()));
    press('s');
    expect(onOffer.mock.calls).toEqual([[{ act: 'reroll' }], [{ act: 'skip' }]]);
  });

  it('keys work by their place on any layout, and not with a modifier', () => {
    const onOffer = vi.fn();
    const { hud } = mount(onOffer);
    hud.update(withOffer());
    press('к', 'KeyR'); // a Cyrillic layout's key in R's place
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'reroll' });
    onOffer.mockClear();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true }));
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('do nothing with no pick open', () => {
    const onOffer = vi.fn();
    const { hud } = mount(onOffer);
    hud.update(withOffer({}, null));
    press('r');
    press('s');
    press('b');
    expect(onOffer).not.toHaveBeenCalled();
  });
});

describe('Ban', () => {
  it('is two steps: Ban, then a card; the pick stays open', () => {
    const onOffer = vi.fn();
    const onChoose = vi.fn();
    const { hud, ban, cards, title, panel } = mount(onOffer, onChoose);
    hud.update(withOffer());
    expect(ban().getAttribute('aria-pressed')).toBe('false');
    ban().click();
    expect(onOffer).not.toHaveBeenCalled();
    expect(ban().getAttribute('aria-pressed')).toBe('true');
    expect(title()).toMatch(/ban/i);
    expect(panel.classList.contains('hud-cards-banning')).toBe(true);
    cards()[1]!.click();
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'ban', index: 1 });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('leaves ban mode after the ban, redrawn with the new card', () => {
    const onOffer = vi.fn();
    const { hud, ban, cards, title, panel } = mount(onOffer);
    hud.update(withOffer());
    ban().click();
    cards()[0]!.click();
    const next: Card[] = [{ kind: 'upgrade', id: 'long-sight' }, offer()[1]!, offer()[2]!];
    hud.update(withOffer({ bans: 1, banned: ['sharpshooter'] }, next));
    expect(panel.classList.contains('hud-cards-banning')).toBe(false);
    expect(title()).toBe('Level up: pick one');
    expect(ban().disabled).toBe(true);
    expect(cards()).toHaveLength(3);
  });

  it('B again cancels, and a card then picks as usual', () => {
    const onOffer = vi.fn();
    const onChoose = vi.fn();
    const { hud, cards, ban, title } = mount(onOffer, onChoose);
    hud.update(withOffer());
    press('b');
    expect(ban().getAttribute('aria-pressed')).toBe('true');
    press('b');
    expect(ban().getAttribute('aria-pressed')).toBe('false');
    expect(title()).toBe('Level up: pick one');
    cards()[2]!.click();
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(2);
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('in ban mode 1 2 3 ban the card; out of it they pick', () => {
    const onOffer = vi.fn();
    const onChoose = vi.fn();
    const { hud } = mount(onOffer, onChoose);
    hud.update(withOffer());
    press('b');
    press('3', 'Digit3');
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'ban', index: 2 });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('Reroll and Skip in ban mode drop the mode first', () => {
    const onOffer = vi.fn();
    const { hud, ban } = mount(onOffer);
    hud.update(withOffer());
    ban().click();
    press('r');
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'reroll' });
    hud.update(withOffer({ rerolls: 1 }));
    expect(ban().getAttribute('aria-pressed')).toBe('false');
  });

  it('a recruit card cannot be banned: it greys out in ban mode', () => {
    const onOffer = vi.fn();
    const s = withOffer();
    const defender = s.bench[0]!;
    const { hud, ban, cards } = mount(onOffer);
    hud.update({ ...s, offer: [{ kind: 'recruit', defender }, offer()[1]!, offer()[2]!] });
    ban().click();
    expect(cards()[0]!.disabled).toBe(true);
    expect(cards()[1]!.disabled).toBe(false);
    cards()[0]!.click();
    press('1', 'Digit1');
    expect(onOffer).not.toHaveBeenCalled();
    ban().click();
    expect(cards()[0]!.disabled).toBe(false);
  });

  it('an empty pick shows only the buttons, and Skip closes it', () => {
    const onOffer = vi.fn();
    const { hud, cards, skip, reroll } = mount(onOffer);
    hud.update(withOffer({}, []));
    expect(cards()).toHaveLength(0);
    expect(skip().disabled).toBe(false);
    expect(reroll().disabled).toBe(false);
    skip().click();
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'skip' });
  });

  it('is off again when a new pick opens', () => {
    const { hud, ban, panel } = mount();
    hud.update(withOffer());
    ban().click();
    hud.update(withOffer({}, null));
    hud.update(withOffer({}, [offer()[0]!, offer()[2]!, offer()[1]!]));
    expect(panel.classList.contains('hud-cards-banning')).toBe(false);
    expect(ban().getAttribute('aria-pressed')).toBe('false');
  });
});

describe('while a pick’s effect plays', () => {
  it('the buttons take no input', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const onOffer = vi.fn();
    const { hud, reroll, skip, ban } = mount(onOffer);
    hud.update(withOffer());
    raw('1', 'Digit1');
    reroll().click();
    skip().click();
    ban().click();
    raw('r');
    raw('s');
    raw('b');
    expect(onOffer).not.toHaveBeenCalled();
  });
});

describe('double clicks and typing fields', () => {
  it('a second Skip in the same frame skips nothing: the pick closed at once', () => {
    const onOffer = vi.fn();
    const { hud, skip, panel } = mount(onOffer);
    hud.update(withOffer());
    const button = skip();
    button.click();
    button.click();
    press('s');
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'skip' });
    expect(panel.hidden).toBe(true);
    // The next offer (banked XP) draws and works as any.
    hud.update(withOffer({ skips: 1 }, offer().reverse()));
    expect(panel.hidden).toBe(false);
    skip().click();
    expect(onOffer).toHaveBeenCalledTimes(2);
  });

  it('R S B in a typing field stay in the field', () => {
    const onOffer = vi.fn();
    const { hud } = mount(onOffer);
    hud.update(withOffer());
    const input = document.createElement('input');
    document.body.append(input);
    for (const key of ['r', 's', 'b']) {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true }),
      );
    }
    expect(onOffer).not.toHaveBeenCalled();
  });
});

describe('the pick’s labels, key hints and empty line', () => {
  it('Skip says what it gives; the tooltip too', () => {
    const { hud, skip } = mount();
    hud.update(withOffer());
    expect(words(skip())).toBe('Skip · +1 reroll');
    expect(skip().title).toBe('Take no card, get +1 reroll (S)');
  });

  it('each button carries a hidden-from-readers key hint', () => {
    const { hud, reroll, skip, ban } = mount();
    hud.update(withOffer());
    for (const [b, k] of [
      [reroll(), 'R'],
      [skip(), 'S'],
      [ban(), 'B'],
    ] as const) {
      const hint = b.querySelector('.menu-key')!;
      expect(hint.textContent).toBe(k);
      expect(hint.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('R S B are ignored for a moment after a pick opens, then work', () => {
    const onOffer = vi.fn();
    const { hud } = mount(onOffer);
    hud.update(withOffer());
    raw('s');
    raw('r');
    raw('b');
    vi.advanceTimersByTime(OFFER_KEY_GUARD_MS - 10);
    raw('s');
    expect(onOffer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    raw('s');
    expect(onOffer).toHaveBeenCalledExactlyOnceWith({ act: 'skip' });
  });

  it('the guard runs again for the next pick, not for a reroll’s redraw', () => {
    const onOffer = vi.fn();
    const { hud } = mount(onOffer);
    hud.update(withOffer());
    vi.advanceTimersByTime(OFFER_KEY_GUARD_MS);
    hud.update(withOffer({ rerolls: 1 }, offer().reverse()));
    raw('r');
    expect(onOffer).toHaveBeenCalledTimes(1);
    hud.update(withOffer({}, null));
    hud.update(withOffer());
    raw('r');
    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('an empty pick says why, under the heading and above the buttons', () => {
    const { hud, panel, title, skip } = mount();
    hud.update(withOffer({}, []));
    const line = panel.querySelector('.hud-offer-empty')!;
    expect(line.textContent).toBe('No cards left to offer');
    expect(title()).toBe('Level up: pick one');
    const actions = panel.querySelector('.hud-offer-actions')!;
    expect(line.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(skip().disabled).toBe(false);
  });

  it('a pick with cards has no such line', () => {
    const { hud, panel } = mount();
    hud.update(withOffer());
    expect(panel.querySelector('.hud-offer-empty')).toBeNull();
  });
});
