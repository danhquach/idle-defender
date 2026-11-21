// @vitest-environment jsdom
// ID-207: the Salvage button in a stash gun's details (Weapons tab): its label names what it
// pays ("Salvage · +25 Scrap", the rarity's Scrap and half the upgrade steps' cost), a gun in
// hand says to put it back first, the gun leaves the stash, and a double tap salvages one gun.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { salvageGun } from '../core/hordeonly.ts';
import { salvageAsks, salvageOffer, salvageQuestion, salvageText } from './hud.ts';
import {
  createInventory,
  inventoryView,
  SALVAGE_HELD_TEXT,
  SALVAGE_LOCK_MS,
  SALVAGE_NOT_GUN_TEXT,
  SALVAGE_PISTOL_TEXT,
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

describe('salvageOffer', () => {
  it('names what it pays for every rarity', () => {
    const want = { rusty: 5, common: 10, military: 25, prototype: 50, relic: 100 } as const;
    for (const [rarity, n] of Object.entries(want)) {
      const o = salvageOffer(gun('a', { rarity: rarity as OwnedWeapon['rarity'] }));
      expect(o.amount).toBe(n);
      expect(o.text).toBe(`Salvage · +${n}\u00a0Scrap`);
    }
  });

  it('includes half the upgrade Scrap: the ticket’s +55', () => {
    const o = salvageOffer(gun('a', { rarity: 'military', level: 2, step: 2 }));
    expect(o.text).toBe('Salvage · +55\u00a0Scrap');
    expect(o.full).toBe('Salvage Lv 2 Military SMG +2 for 55 Scrap');
    expect(o.uid).toBe('a');
  });

  it('uses thousands separators', () => {
    expect(salvageOffer(gun('a', { rarity: 'relic', level: 40, step: 5 })).text).toBe(
      'Salvage · +3,100\u00a0Scrap',
    );
  });

  it('asks first for a Prototype or Relic only', () => {
    expect(
      ['rusty', 'common', 'military', 'prototype', 'relic'].map((r) =>
        salvageAsks(gun('a', { rarity: r as OwnedWeapon['rarity'] })),
      ),
    ).toEqual([false, false, false, true, true]);
  });

  it('says what it pays and that the gun is gone, and what it did once made', () => {
    const w = gun('a', { rarity: 'prototype', level: 3, step: 1 });
    expect(salvageQuestion(w, 65)).toBe(
      'Salvage Lv 3 Prototype SMG +1 for 65 Scrap? The gun is gone for good.',
    );
    expect(salvageText(w, 65, 1165)).toBe('Salvaged Lv 3 Prototype SMG +1 · +65 Scrap, 1,165 now.');
  });
});

describe('the label at the Scrap cap', () => {
  it('shows what the player will actually get', () => {
    const w = gun('a', { rarity: 'relic' });
    expect(salvageOffer(w, 1e12 - 30).text).toBe('Salvage · +30\u00a0Scrap');
    expect(salvageOffer(w, 1e12).text).toBe('Salvage · +0\u00a0Scrap');
    expect(salvageOffer(w, 500).amount).toBe(100);
    const g = camp([w], 1e12 - 30);
    expect(inventoryView(g).stash[0]!.salvage?.amount).toBe(30);
  });
});

describe('the view', () => {
  it('gives a stash gun an offer; a gun in hand, the pistol and a blade none', () => {
    const g = camp([gun('h1'), gun('b1', { base: 'knife' })], 0, gun('h3'));
    const v = inventoryView(g);
    expect(v.stash.find((i) => i.key === 'stash:h1')!.salvage).toMatchObject({ uid: 'h1' });
    expect(v.stash.find((i) => i.key === 'stash:b1')!.salvage).toBeNull();
    expect(v.squad[0]!.gun.salvage).toBeNull();
    const onPistol = v.squad.find((s) => s.gun.free);
    expect(onPistol).toBeDefined();
    expect(onPistol!.gun.salvage).toBeNull();
  });
});

type Salvaged = ReturnType<typeof salvageGun>;

function mount(game: GameState, canCombine = true, answer: boolean | 'later' = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const asked: string[] = [];
  const onSalvage = vi.fn(async (uid: string) => {
    const first: Salvaged = salvageGun(g, uid);
    if (!first.ok) return first;
    if (salvageAsks(first.weapon)) {
      asked.push(salvageQuestion(first.weapon, first.scrap));
      if (!answer) return null;
    }
    g = first.game;
    return { ok: true as const, text: salvageText(first.weapon, first.scrap, g.stock.scrap) };
  });
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine }),
    onSalvage,
  });
  inv.open();
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const slot = (key: string) =>
    scrim.querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!;
  const button = () => scrim.querySelector<HTMLButtonElement>('.inv-salvage-button')!;
  const status = () => scrim.querySelector('.inv-status')?.textContent;
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { slot, button, status, onSalvage, asked, settle, game: () => g, scrim };
}

describe('the Salvage button in the details', () => {
  it('names the amount, salvages the selected stash gun on a click, and updates the camp', async () => {
    const m = mount(camp([gun('h1', { rarity: 'military' }), gun('h2')], 100));
    m.slot('stash:h1').click();
    expect(m.button().textContent).toBe('Salvage · +25\u00a0Scrap');
    expect(m.button().disabled).toBe(false);
    m.button().click();
    await m.settle();
    expect(m.onSalvage).toHaveBeenCalledWith('h1');
    expect(m.game().stock.scrap).toBe(125);
    expect(m.game().armoury.map((w) => w.uid)).toEqual(['h2']);
    expect(m.slot('stash:h1')).toBeNull();
    expect(m.status()).toBe('Salvaged Lv 1 Military SMG · +25 Scrap, 125 now.');
    // The next gun is selected and its own amount shows.
    expect(m.button().textContent).toBe('Salvage · +10\u00a0Scrap');
  });

  it('a lower rarity is one tap: nothing asked', async () => {
    const m = mount(camp([gun('h1', { rarity: 'rusty' })]));
    m.slot('stash:h1').click();
    m.button().click();
    await m.settle();
    expect(m.asked).toEqual([]);
    expect(m.game().armoury).toHaveLength(0);
  });

  it('works between hordes and in a fight', async () => {
    for (const canCombine of [true, false]) {
      const m = mount(camp([gun('h1')]), canCombine);
      m.slot('stash:h1').click();
      expect(m.button().disabled).toBe(false);
      m.button().click();
      await m.settle();
      expect(m.game().armoury).toHaveLength(0);
    }
  });

  it('is greyed for a gun in hand, saying in its visible text to put it back in the stash first', () => {
    const m = mount(camp([], 100, gun('h3')));
    m.slot(`squad:${recruit(1).id}`).click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe(SALVAGE_HELD_TEXT);
    expect(m.button().textContent).toBe('Put it back in the stash first');
    m.button().click();
    expect(m.onSalvage).not.toHaveBeenCalled();
  });

  it('a survivor holding the free pistol is told it can’t be salvaged, not to put it back', () => {
    const m = mount(camp([gun('h1')], 100));
    m.slot(`squad:${recruit(2).id}`).click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe(SALVAGE_PISTOL_TEXT);
  });

  it('is there, greyed, for a blade or tool, saying why', () => {
    const m = mount(camp([gun('b1', { base: 'knife' })]));
    m.slot('stash:b1').click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe(SALVAGE_NOT_GUN_TEXT);
  });

  it('says why in the status line when the app refuses', async () => {
    const m = mount(camp([gun('h1')]));
    m.slot('stash:h1').click();
    m.onSalvage.mockResolvedValueOnce({
      ok: false,
      reason: 'That gun is not in the stash',
    } as never);
    m.button().click();
    await m.settle();
    expect(m.status()).toBe('That gun is not in the stash');
    expect(m.game().armoury).toHaveLength(1);
  });

  it('a no to the app’s confirm changes nothing', async () => {
    const m = mount(camp([gun('h1', { rarity: 'prototype' })]), true, false);
    m.slot('stash:h1').click();
    m.button().click();
    await m.settle();
    expect(m.asked).toEqual(['Salvage Lv 1 Prototype SMG for 50 Scrap? The gun is gone for good.']);
    expect(m.game().armoury).toHaveLength(1);
    expect(m.game().stock.scrap).toBe(100);
  });

  it('asks first for a Prototype and a Relic, then salvages on a yes', async () => {
    for (const rarity of ['prototype', 'relic'] as const) {
      const m = mount(camp([gun('h1', { rarity })]));
      m.slot('stash:h1').click();
      m.button().click();
      await m.settle();
      expect(m.asked).toHaveLength(1);
      expect(m.game().armoury).toHaveLength(0);
    }
  });
});

describe('a double tap', () => {
  it('salvages one gun: the next gun’s button ignores a second press for a moment', async () => {
    vi.useFakeTimers();
    try {
      const m = mount(camp([gun('h1'), gun('h2'), gun('h3')]));
      m.slot('stash:h1').click();
      m.button().click();
      await vi.advanceTimersByTimeAsync(0);
      m.button().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(m.onSalvage).toHaveBeenCalledTimes(1);
      expect(m.game().armoury).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(SALVAGE_LOCK_MS);
      m.button().click();
      await vi.advanceTimersByTimeAsync(0);
      expect(m.onSalvage).toHaveBeenCalledTimes(2);
      expect(m.game().armoury).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the label fits the dock', () => {
  it('has the full words in the tooltip and the screen-reader name', () => {
    const m = mount(camp([gun('a', { rarity: 'military', level: 2, step: 2 })]));
    m.slot('stash:a').click();
    expect(m.button().title).toBe('Salvage Lv 2 Military SMG +2 for 55 Scrap');
    expect(m.button().getAttribute('aria-label')).toBe('Salvage Lv 2 Military SMG +2 for 55 Scrap');
  });

  it('the CSS lets the button wrap inside its block instead of clipping or widening the dock', () => {
    const css = readFileSync(resolve(__dirname, '../page.css'), 'utf8');
    const rule = (sel: string) =>
      new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const button = rule('.inv-salvage-button');
    for (const decl of [
      'box-sizing: border-box',
      'width: 100%',
      'min-width: 0',
      'max-width: 100%',
      'white-space: normal',
    ]) {
      expect(button, decl).toContain(decl);
    }
    expect(button).not.toContain('text-overflow');
    expect(rule('.inv-salvage')).toContain('min-width: 0');
  });

  it('a short window scrolls the details as one box, so the dock’s buttons are never hidden or sideways', () => {
    const css = readFileSync(resolve(__dirname, '../page.css'), 'utf8');
    const block =
      /@media \(max-height: 540px\) \{\s*\.inv-details \{([^}]*)\}\s*\.inv-details-info \{([^}]*)\}/.exec(
        css,
      );
    expect(block?.[1]).toContain('overflow-y: auto');
    expect(block?.[1]).toContain('overflow-x: hidden');
    expect(block?.[2]).toContain('flex: none');
  });

  it('the details of another gun start at the top', () => {
    const m = mount(camp([gun('h1'), gun('h2')]));
    m.slot('stash:h1').click();
    const d = m.scrim.querySelector<HTMLElement>('.inv-details')!;
    // jsdom has no layout, so scrollTop always reads 0: keep the value so the reset is seen.
    let top = 0;
    Object.defineProperty(d, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => (top = v),
    });
    d.scrollTop = 80;
    m.slot('stash:h2').click();
    expect(top).toBe(0);
  });

  it('the enabled button has the danger border, the disabled one stays dashed', () => {
    const css = readFileSync(resolve(__dirname, '../page.css'), 'utf8');
    expect(css).toMatch(
      /\.inv-salvage-button:not\(:disabled\) \{\s*border-color: var\(--color-danger\)/,
    );
    expect(css).toMatch(/\.inv-salvage-button:disabled \{\s*border-style: dashed/);
  });

  it('is not in the details when the app gives no way to salvage', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const inv = createInventory(root, {
      state: () => ({ game: camp([gun('h1')]), resumes: false, canCombine: true }),
    });
    inv.open();
    expect(document.querySelector('.inv-salvage-button')).toBeNull();
  });
});
