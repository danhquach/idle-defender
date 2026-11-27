// @vitest-environment jsdom
// ID-231: Field Repairs' skill button in the fight HUD: hidden until the card is held, ready,
// counting its cost, used, or refused on a full wall; its key is F; it sits after Airstrike.
import { describe, expect, it } from 'vitest';
import { SKILL_IDS } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { newHorde, type HordeState } from '../core/horde.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { useRepairs } from '../core/skills.ts';
import { setup } from '../core/testing.ts';
import {
  AUTO_KEY,
  createHud,
  fightKeyName,
  REPAIRS_KEY,
  repairsButton,
  SKILL_KEYS,
  SPEED_KEYS,
} from './hud.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function mount(squad: boolean) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, squad);
  const button = root.querySelector<HTMLButtonElement>('.hud-repairs')!;
  const strike = root.querySelectorAll<HTMLButtonElement>('.hud-skill')[0]!;
  return { root, hud, button, strike };
}

/** A fight with Field Repairs held and the wall hurt. */
function hurt(): HordeState {
  const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS] });
  s.toSpawn = 0;
  s.taken = ['field-repairs'];
  const seg = s.layers[0]!.segments.find((g) => g.kind !== null)!;
  seg.hp = seg.maxHp / 2;
  return s;
}

/** The text a screen reader names it by: everything not hidden from it. */
const spoken = (b: HTMLElement): string =>
  [...b.childNodes]
    .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent)
    .join('')
    .trim();

describe('the Field Repairs button (ID-231)', () => {
  it('view model: hidden, ready, counting, used and full-wall states', () => {
    const none = newHorde(1, setup());
    expect(repairsButton(none).hidden).toBe(true);
    const ready = repairsButton(hurt());
    expect(ready).toMatchObject({ hidden: false, label: 'Field Repairs', disabled: false });
    expect(ready.reason).toContain('key F');
    const s = hurt();
    s.time = 10;
    const r = useRepairs(s);
    if (!r.ok) throw new Error(r.code);
    const counting = repairsButton(r.state);
    expect(counting).toMatchObject({
      label: 'Field Repairs 5s',
      disabled: true,
      reason: 'Already used',
    });
    expect(repairsButton({ ...r.state, time: 12.5 }).label).toBe('Field Repairs 3s');
    const over = repairsButton({ ...r.state, time: 20 });
    expect(over).toMatchObject({
      label: 'Field Repairs · used',
      disabled: true,
      reason: 'Already used',
      spent: true,
    });
    // Held but the wall is whole: disabled with its own reason, not "used".
    const full = hurt();
    for (const g of full.layers.flatMap((l) => l.segments)) g.hp = g.maxHp;
    expect(repairsButton(full)).toMatchObject({
      label: 'Field Repairs',
      disabled: true,
      reason: 'The wall is full',
      spent: false,
    });
  });

  it('is last in the skill bar, after the Airstrike button, keyed F and named by its label', () => {
    for (const squad of [false, true]) {
      const { root, button, strike } = mount(squad);
      // The Airstrike sits in its wrapper with the Auto pill (ID-232).
      const wrap = strike.closest('.hud-strike')!;
      const bar = [...wrap.parentElement!.children].filter(
        (c) => c === wrap || c.tagName === 'BUTTON',
      );
      expect(bar.indexOf(button)).toBeGreaterThan(bar.indexOf(wrap));
      expect(bar.at(-1)).toBe(button);
      expect(button.type).toBe('button');
      expect(REPAIRS_KEY).toBe('F');
      expect(button.getAttribute('aria-keyshortcuts')).toBe('F');
      expect(button.querySelector('img')).not.toBeNull();
      expect(root.contains(button)).toBe(true);
    }
  });

  it('shows once the card is held (both builds), with the icon, a key and its spoken name', () => {
    for (const squad of [false, true]) {
      const { hud, button } = mount(squad);
      expect(button.hidden).toBe(true);
      hud.update(squad ? startSquadHorde(newGame(), 1, NOW) : newHorde(1, setup()));
      expect(button.hidden).toBe(true);
      const s = squad
        ? { ...startSquadHorde(newGame(), 1, NOW), taken: ['field-repairs' as const] }
        : hurt();
      if (squad) {
        const seg = s.layers.flatMap((l) => l.segments).find((g) => g.kind !== null)!;
        seg.hp = seg.maxHp / 2;
      }
      hud.update(s);
      expect(button.hidden).toBe(false);
      expect(button.disabled).toBe(false);
      expect(spoken(button)).toBe('Field Repairs');
      expect(button.querySelector('kbd')!.textContent).toBe('F');
    }
  });

  it('shows the cost counting down, then used; a full wall shows disabled with its reason', () => {
    const { hud, button } = mount(true);
    const s = hurt();
    s.time = 10;
    const r = useRepairs(s);
    if (!r.ok) throw new Error(r.code);
    hud.update(r.state);
    expect(spoken(button)).toBe('Field Repairs 5s');
    expect(button.disabled).toBe(true);
    hud.update({ ...r.state, time: 30 });
    expect(spoken(button)).toBe('Field Repairs · used');
    expect(button.classList.contains('hud-repairs-spent')).toBe(true);
    const full = hurt();
    for (const g of full.layers.flatMap((l) => l.segments)) g.hp = g.maxHp;
    hud.update(full);
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('The wall is full');
    expect(button.classList.contains('hud-repairs-spent')).toBe(false);
  });

  it('is usable during a card pick, and a click goes to the app', () => {
    const { hud, button } = mount(false);
    let clicks = 0;
    hud.onRepairs(() => clicks++);
    hud.update({ ...hurt(), offer: [] });
    expect(button.disabled).toBe(false);
    button.click();
    expect(clicks).toBe(1);
  });

  it('F is read by its place and clashes with no fight key', () => {
    expect(fightKeyName({ code: 'KeyF', key: 'f' })).toBe(REPAIRS_KEY);
    expect(fightKeyName({ code: 'KeyF', key: 'ф' })).toBe(REPAIRS_KEY);
    expect([
      ...SKILL_KEYS,
      ...Object.values(SPEED_KEYS),
      AUTO_KEY,
      'R',
      'S',
      'B',
      '1',
      '2',
      '3',
      ' ',
    ]).not.toContain(REPAIRS_KEY);
  });
});
