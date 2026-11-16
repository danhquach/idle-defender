// @vitest-environment jsdom
// The radio chip's explanation (ID-190): its text comes from the data, it starts open on the
// first visit only, the chip toggles it by mouse and keyboard, and Endless has none.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { BOSS_UNLOCKS, FINALE_HORDE, RADIO_HORDES } from '../core/data.ts';
import { UPGRADES } from '../core/cards.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createHud, goalChip, radioHelp, squadStart } from './hud.ts';
import { RADIO_SEEN_KEY, readRadioSeen, writeRadioSeen } from '../storage/settings.ts';

const noop = (): void => {};

const gameAt = (horde: number): GameState => {
  const g = newGame('horde');
  return { ...g, hordeNumber: horde, roster: [recruit(1)], camp: { ...g.camp, recruits: 1 } };
};

function page(game: GameState, open: boolean) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
  h.showResult(squadStart(game, game.hordeNumber, open));
  const chip = () => root.querySelector<HTMLButtonElement>('button.chip-toggle');
  const help = () => root.querySelector<HTMLElement>('.radio-help');
  return { root, h, chip, help };
}

const text = (g: GameState): string =>
  radioHelp(g)!
    .lines.map((l) => l.lead + l.text)
    .join('\n');

describe('the explanation text (ID-190)', () => {
  it('names the boss hordes and the cards they unlock from the data', () => {
    const t = text(gameAt(1));
    expect(t).toContain('Hordes 10, 20 and 30');
    for (const [h, card] of Object.entries(BOSS_UNLOCKS)) {
      expect(t).toContain(`${UPGRADES[card].name} (Horde ${h})`);
    }
    expect(t).toContain('finale: evacuation and Endless.');
    expect(t).not.toContain('Next:');
    expect(radioHelp(gameAt(1))!.lines.map((l) => l.lead)).toEqual([
      'The radio',
      'Parts:',
      'You gain:',
    ]);
  });

  it('the goal note above it names the next boss horde after 0, 1 and 2 parts', () => {
    RADIO_HORDES.forEach((next, parts) => {
      const g = gameAt(parts === 0 ? 1 : RADIO_HORDES[parts - 1]! + 1);
      expect(goalChip(g).note).toContain(`Horde ${next}`);
      expect(squadStart(g).debrief!.note).toContain(`Horde ${next}`);
    });
  });

  it('is absent in Endless', () => {
    expect(radioHelp(gameAt(FINALE_HORDE + 1))).toBeNull();
  });
});

describe('the chip and its panel (ID-190)', () => {
  it('first visit: the panel starts open; the chip says so', () => {
    const { chip, help } = page(gameAt(1), true);
    expect(help()!.hidden).toBe(false);
    expect(chip()!.getAttribute('aria-expanded')).toBe('true');
    expect(chip()!.getAttribute('aria-controls')).toBe(help()!.id);
    expect(chip()!.textContent).toBe('Radio 0/3');
    expect(help()!.querySelectorAll('strong')).toHaveLength(3);
    expect(help()!.children).toHaveLength(3);
  });

  it('later visits: closed, and a click opens then closes it', () => {
    const { chip, help } = page(gameAt(1), false);
    expect(help()!.hidden).toBe(true);
    expect(chip()!.getAttribute('aria-expanded')).toBe('false');
    chip()!.click();
    expect(help()!.hidden).toBe(false);
    expect(chip()!.getAttribute('aria-expanded')).toBe('true');
    chip()!.click();
    expect(help()!.hidden).toBe(true);
    expect(chip()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('is a real button, so Enter and Space reach it as a click', () => {
    const { chip } = page(gameAt(1), false);
    expect(chip()!.tagName).toBe('BUTTON');
    expect(chip()!.type).toBe('button');
    expect(chip()!.tabIndex).toBe(0);
  });

  it('picking another horde keeps the chip working and in step with the panel', () => {
    const { root, chip, help } = page(gameAt(4), false);
    chip()!.click();
    const select = root.querySelector<HTMLSelectElement>('#hud-horde-select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelectorAll('button.chip-toggle')).toHaveLength(1);
    expect(chip()!.getAttribute('aria-expanded')).toBe('true');
    chip()!.click();
    expect(help()!.hidden).toBe(true);
  });

  it('Endless: a plain chip, no panel, no toggle', () => {
    const { root, chip, help } = page(gameAt(FINALE_HORDE + 1), false);
    expect(chip()).toBeNull();
    expect(help()).toBeNull();
    expect(root.querySelector('.debrief-chips')!.firstElementChild!.tagName).toBe('SPAN');
  });
});

describe('the seen flag (ID-190)', () => {
  const memory = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  };
  const throwing = {
    getItem: (): string | null => {
      throw new Error('blocked');
    },
    setItem: (): void => {
      throw new Error('full');
    },
  };

  it('starts unseen; written as "1"; then seen', () => {
    const s = memory();
    expect(readRadioSeen(s)).toBe(false);
    writeRadioSeen(s);
    expect(s.data.get(RADIO_SEEN_KEY)).toBe('1');
    expect(readRadioSeen(s)).toBe(true);
  });

  it('only the exact "1" counts as seen', () => {
    const hostile = [
      'true',
      ' 1',
      '1 ',
      '1\u200b',
      '\u202e1',
      '<script>alert(1)</script>',
      'x'.repeat(10_000),
      '__proto__',
    ];
    for (const raw of hostile) {
      expect(readRadioSeen(memory({ [RADIO_SEEN_KEY]: raw }))).toBe(false);
    }
  });

  it('blocked or missing storage means unseen and never throws', () => {
    expect(readRadioSeen(throwing)).toBe(false);
    expect(readRadioSeen(null)).toBe(false);
    expect(() => writeRadioSeen(throwing)).not.toThrow();
    expect(() => writeRadioSeen(null)).not.toThrow();
  });
});
