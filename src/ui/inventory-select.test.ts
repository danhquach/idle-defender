// @vitest-environment jsdom
// ID-215: Select on the stash ticks several guns, quick picks tick a rarity (the shown guns
// only), and one Salvage button names the count and the total; a Prototype or Relic asks first.
import { describe, expect, it, vi } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { MAX_COUNT } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import {
  bulkSalvageOffer,
  bulkSalvageQuestion,
  bulkSalvageText,
  salvageAsks,
  salvageGuns,
} from './hud.ts';
import {
  createInventory,
  SELECT_DONE,
  SELECT_HELD,
  SELECT_LOCK_MS,
  SELECT_NONE,
  SELECT_NOT_GUN,
  SELECT_ON,
} from './inventory.ts';

const gun = (uid: string, extra: Partial<OwnedWeapon> = {}): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...extra,
});

function camp(stash: OwnedWeapon[], scrap = 100, held?: OwnedWeapon): GameState {
  const g = newGame('horde');
  const who = [recruit(1), recruit(2)];
  if (held) who[0] = { ...who[0]!, loadout: { ...who[0]!.loadout, primary: held } };
  return {
    ...g,
    hordeNumber: 9,
    roster: who,
    camp: { ...g.camp, recruits: 2 },
    armoury: stash,
    stock: { ...g.stock, scrap },
  };
}

describe('the bulk salvage texts and amounts', () => {
  it('pays each rarity’s own amount: Rusty 5, Common 10, Military 25, Prototype 50, Relic 100', () => {
    const ws = (['rusty', 'common', 'military', 'prototype', 'relic'] as const).map((r, i) =>
      gun(`h${i}`, { rarity: r }),
    );
    const o = bulkSalvageOffer(ws);
    expect(o.amount).toBe(190);
    expect(o.text).toBe('Salvage 5 · +190 Scrap');
    expect(o.full).toBe('Salvage 5 guns for 190 Scrap');
  });

  it('adds the upgrade refund, as a single salvage does', () => {
    // Military Lv 2 +2 salvages for 55 alone (ID-207's example).
    const o = bulkSalvageOffer([gun('a', { rarity: 'military', level: 2, step: 2 }), gun('b')]);
    expect(o.amount).toBe(65);
    expect(bulkSalvageOffer([gun('a')]).full).toBe('Salvage 1 gun for 10 Scrap');
  });

  it('stops at the Scrap cap', () => {
    expect(bulkSalvageOffer([gun('a'), gun('b')], MAX_COUNT - 15).amount).toBe(15);
    expect(bulkSalvageOffer([gun('a')], MAX_COUNT).amount).toBe(0);
  });

  it('asks only when a Prototype or Relic is among them, naming how many of each', () => {
    expect(bulkSalvageQuestion([gun('a', { rarity: 'military' }), gun('b')], 35)).toBeNull();
    expect(
      bulkSalvageQuestion(
        [
          gun('a', { rarity: 'relic' }),
          gun('b', { rarity: 'prototype' }),
          gun('c', { rarity: 'prototype' }),
          gun('d'),
        ],
        1210,
      ),
    ).toBe('Salvage 4 guns (2 Prototype, 1 Relic) for 1,210 Scrap? The guns are gone for good.');
    expect(bulkSalvageText(3, 45, 1045)).toBe('Salvaged 3 guns · +45 Scrap, 1,045 now.');
  });

  it('all of one rarity names it once', () => {
    const ps = [gun('a', { rarity: 'prototype' }), gun('b', { rarity: 'prototype' })];
    expect(bulkSalvageQuestion(ps, 100)).toBe(
      'Salvage 2 Prototype guns for 100 Scrap? The guns are gone for good.',
    );
    expect(bulkSalvageQuestion([gun('a', { rarity: 'relic' })], 100)).toBe(
      'Salvage 1 Relic gun for 100 Scrap? The guns are gone for good.',
    );
  });
});

describe('salvageGuns', () => {
  it('salvages every gun, paying their sum', () => {
    const g = camp([gun('h1'), gun('h2', { rarity: 'military' }), gun('h3')]);
    const r = salvageGuns(g, ['h1', 'h2']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.armoury.map((w) => w.uid)).toEqual(['h3']);
    expect(r.scrap).toBe(35);
    expect(r.game.stock.scrap).toBe(135);
    expect(r.weapons.map((w) => w.uid)).toEqual(['h1', 'h2']);
  });

  it('is all or none: one gun refused refuses the lot, and the camp is untouched', () => {
    const held = gun('h9');
    const g = camp([gun('h1')], 100, held);
    expect(salvageGuns(g, ['h1', 'h9'])).toMatchObject({ ok: false });
    expect(salvageGuns(g, ['h1', 'nope'])).toMatchObject({ ok: false });
    expect(salvageGuns(camp([gun('b1', { base: 'knife' })]), ['b1'])).toMatchObject({ ok: false });
    expect(g.armoury).toHaveLength(1);
    expect(g.stock.scrap).toBe(100);
  });

  it('refuses an empty or repeated list', () => {
    const g = camp([gun('h1')]);
    expect(salvageGuns(g, [])).toMatchObject({ ok: false, reason: 'No guns ticked' });
    expect(salvageGuns(g, ['h1', 'h1'])).toMatchObject({
      ok: false,
      reason: 'A gun is ticked twice',
    });
  });
});

function mount(game: GameState, canCombine = true, answer = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const asked: string[] = [];
  const onSalvageMany = vi.fn(async (uids: string[]) => {
    const first = salvageGuns(g, uids);
    if (!first.ok) return first;
    const ask = bulkSalvageQuestion(first.weapons, first.scrap);
    if (ask !== null) {
      asked.push(ask);
      if (!answer) return null;
    }
    g = first.game;
    return {
      ok: true as const,
      text: bulkSalvageText(first.weapons.length, first.scrap, g.stock.scrap),
    };
  });
  const onSalvage = vi.fn(async () => null);
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine }),
    onSalvage,
    onSalvageMany,
  });
  inv.open();
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement>(sel: string) => scrim.querySelector<T>(sel);
  const slot = (key: string) => q<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!;
  const toggle = () => q<HTMLButtonElement>('.inv-select')!;
  const quick = (r: string) => q<HTMLButtonElement>(`.inv-select-pick[data-rarity="${r}"]`)!;
  const go = () => q<HTMLButtonElement>('.inv-select-salvage')!;
  const clear = () => q<HTMLButtonElement>('.inv-select-clear')!;
  const count = () => q('.inv-select-count')?.textContent;
  const status = () => q('.inv-status')?.textContent;
  const ticked = () =>
    [...scrim.querySelectorAll<HTMLElement>('.inv-slot[data-ticked="true"]')].map(
      (b) => b.dataset.key,
    );
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    inv,
    scrim,
    q,
    slot,
    toggle,
    quick,
    go,
    clear,
    count,
    status,
    ticked,
    settle,
    onSalvageMany,
    asked,
    game: () => g,
  };
}

describe('Select on the stash', () => {
  it('is a button after the filters, pressed while on; off it is the usual details', () => {
    const m = mount(camp([gun('h1'), gun('h2')]));
    expect(m.toggle().textContent).toBe(SELECT_ON);
    expect(m.toggle().getAttribute('aria-pressed')).toBe('false');
    expect(m.q('.inv-select-info')).toBeNull();
    m.toggle().click();
    expect(m.toggle().textContent).toBe(SELECT_DONE);
    expect(m.toggle().getAttribute('aria-pressed')).toBe('true');
    expect(m.count()).toBe('0 ticked');
    expect(m.go().disabled).toBe(true);
    expect(m.go().textContent).toBe(SELECT_NONE);
    expect(m.clear().disabled).toBe(true);
    m.toggle().click();
    expect(m.q('.inv-select-info')).toBeNull();
    expect(m.q('.inv-salvage-button:not(.inv-select-salvage)')).not.toBeNull();
  });

  it('is not there without a way to salvage several', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    createInventory(root, { state: () => ({ game: camp([gun('h1')]), resumes: false }) }).open();
    expect(document.querySelector('.inv-select')).toBeNull();
  });

  it('a tap ticks and unticks, and opens no gun’s details', () => {
    const m = mount(camp([gun('h1'), gun('h2', { rarity: 'military' })]));
    m.toggle().click();
    m.slot('stash:h2').click();
    expect(m.ticked()).toEqual(['stash:h2']);
    expect(m.slot('stash:h2').getAttribute('aria-pressed')).toBe('true');
    expect(m.slot('stash:h1').getAttribute('aria-pressed')).toBe('false');
    expect(m.q('.inv-details-info:not(.inv-select-info)')).toBeNull();
    expect(m.count()).toBe('1 ticked');
    expect(m.go().textContent).toBe('Salvage 1 · +25 Scrap');
    m.slot('stash:h1').click();
    expect(m.go().textContent).toBe('Salvage 2 · +35 Scrap');
    m.slot('stash:h2').click();
    expect(m.ticked()).toEqual(['stash:h1']);
    expect(m.go().textContent).toBe('Salvage 1 · +10 Scrap');
  });

  it('a gun in hand can’t be ticked, nor a blade', () => {
    const m = mount(camp([gun('b1', { base: 'knife' })], 100, gun('h3')));
    m.toggle().click();
    m.slot(`squad:${recruit(1).id}`).click();
    expect(m.ticked()).toEqual([]);
    expect(m.status()).toBe(SELECT_HELD);
    m.slot('stash:b1').click();
    expect(m.ticked()).toEqual([]);
    expect(m.status()).toBe(SELECT_NOT_GUN);
  });

  it('a quick pick ticks every shown gun of its rarity; none shown greys it; Clear unticks all', () => {
    const m = mount(
      camp([
        gun('c1'),
        gun('c2'),
        gun('r1', { rarity: 'rusty' }),
        gun('m1', { rarity: 'military' }),
      ]),
    );
    m.toggle().click();
    expect(m.quick('relic').disabled).toBe(true);
    expect(m.quick('prototype').disabled).toBe(true);
    expect(m.quick('common').getAttribute('aria-label')).toBe('Tick all 2 Common guns shown');
    expect(m.quick('common').textContent).toBe('All Common · 2');
    expect(m.quick('relic').textContent).toBe('All Relic · 0');
    expect(m.quick('common').getAttribute('aria-pressed')).toBe('false');
    m.quick('common').click();
    expect(m.ticked().sort()).toEqual(['stash:c1', 'stash:c2']);
    expect(m.quick('common').getAttribute('aria-pressed')).toBe('true');
    // A second tap unticks them; one ticked by hand then the pick ticks the rest.
    m.quick('common').click();
    expect(m.ticked()).toEqual([]);
    m.slot('stash:c1').click();
    expect(m.quick('common').getAttribute('aria-pressed')).toBe('false');
    m.quick('common').click();
    expect(m.ticked().sort()).toEqual(['stash:c1', 'stash:c2']);
    m.quick('rusty').click();
    expect(m.go().textContent).toBe('Salvage 3 · +25 Scrap');
    m.clear().click();
    expect(m.ticked()).toEqual([]);
    expect(m.count()).toBe('0 ticked');
  });

  it('follows the filters: only shown guns are ticked, and a gun the filter hides drops its tick', () => {
    const m = mount(
      camp([gun('c1'), gun('r1', { rarity: 'rusty' }), gun('r2', { rarity: 'rusty' })]),
    );
    m.toggle().click();
    m.slot('stash:c1').click();
    const filter = m.q<HTMLSelectElement>('select[data-pick="rarity"]')!;
    filter.value = 'rusty';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.quick('common').disabled).toBe(true);
    m.quick('rusty').click();
    expect(m.ticked().sort()).toEqual(['stash:r1', 'stash:r2']);
    expect(m.go().textContent).toBe('Salvage 2 · +10 Scrap');
  });

  it('salvages the ticked guns, unticks, keeps Select on and the scroll where it was', async () => {
    const m = mount(camp([gun('h1'), gun('h2'), gun('h3', { rarity: 'rusty' })]));
    const body = m.q<HTMLElement>('.inv-body')!;
    let top = 260;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => (top = v),
    });
    m.toggle().click();
    m.quick('common').click();
    m.go().click();
    await m.settle();
    expect(m.onSalvageMany).toHaveBeenCalledWith(['h1', 'h2']);
    expect(m.game().armoury.map((w) => w.uid)).toEqual(['h3']);
    expect(m.game().stock.scrap).toBe(120);
    expect(m.status()).toBe('Salvaged 2 guns · +20 Scrap, 120 now.');
    expect(m.ticked()).toEqual([]);
    expect(m.toggle().getAttribute('aria-pressed')).toBe('true');
    expect(top).toBe(260);
  });

  it('a Prototype or Relic asks first; a no keeps every gun and the ticks', async () => {
    const m = mount(camp([gun('h1', { rarity: 'relic' }), gun('h2')]), true, false);
    m.toggle().click();
    m.quick('relic').click();
    m.quick('common').click();
    m.go().click();
    await m.settle();
    expect(m.asked).toEqual([
      'Salvage 2 guns (1 Relic) for 110 Scrap? The guns are gone for good.',
    ]);
    expect(m.game().armoury).toHaveLength(2);
    expect(m.ticked()).toHaveLength(2);
    expect(salvageAsks(m.game().armoury[0]!)).toBe(true);
  });

  it('a double tap salvages once', async () => {
    vi.useFakeTimers();
    try {
      const m = mount(camp([gun('h1'), gun('h2'), gun('h3')]));
      m.toggle().click();
      m.slot('stash:h1').click();
      m.go().click();
      m.go().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(m.onSalvageMany).toHaveBeenCalledTimes(1);
      m.slot('stash:h2').click();
      m.go().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(m.onSalvageMany).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(SELECT_LOCK_MS);
      m.go().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(m.onSalvageMany).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('works in a fight too', async () => {
    const m = mount(camp([gun('h1'), gun('h2')]), false);
    m.toggle().click();
    m.quick('common').click();
    m.go().click();
    await m.settle();
    expect(m.game().armoury).toHaveLength(0);
  });

  it('Esc turns Select off; reopening the tab starts with it off', () => {
    const m = mount(camp([gun('h1'), gun('h2')]));
    m.toggle().click();
    m.slot('stash:h1').click();
    m.scrim
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(m.toggle().getAttribute('aria-pressed')).toBe('false');
    expect(m.ticked()).toEqual([]);
    m.toggle().click();
    m.inv.close();
    m.inv.open();
    expect(m.toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('ends once the stash is empty', async () => {
    const m = mount(camp([gun('h1')]));
    m.toggle().click();
    m.slot('stash:h1').click();
    m.go().click();
    await m.settle();
    expect(m.q('.inv-select')).toBeNull();
    expect(m.q('.inv-select-info')).toBeNull();
  });
});

describe('the selection panel in a short window', () => {
  it('pins the Salvage button: the count and picks scroll above it', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(__dirname, '../page.css'), 'utf8');
    const block =
      /@media \(max-height: 540px\) \{\s*\.inv-details\.inv-details-select \{([^}]*)\}\s*\.inv-details-select \.inv-select-info \{([^}]*)\}/.exec(
        css,
      );
    expect(block?.[1]).toContain('overflow-y: hidden');
    expect(block?.[2]).toContain('overflow-y: auto');
    expect(block?.[2]).toContain('min-height: 0');
    const m = mount(camp([gun('h1')]));
    const details = m.q<HTMLElement>('.inv-details')!;
    expect(details.classList.contains('inv-details-select')).toBe(false);
    m.toggle().click();
    expect(details.classList.contains('inv-details-select')).toBe(true);
    m.toggle().click();
    expect(details.classList.contains('inv-details-select')).toBe(false);
  });
});
