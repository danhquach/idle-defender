// @vitest-environment jsdom
// ID-208: the Upgrade button in a gun's details (Weapons tab): its label names the next step
// and its cost ("Upgrade to +2 · 60 Scrap"), it is greyed with the Scrap progress when short,
// at +5 and for the free pistol, and works between hordes and in a fight. The step shows after
// the gun's name.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Refused } from './text/index.ts';
import { type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, upgradeGun } from '../core/hordeonly.ts';
import { upgradeOffer, upgradeText } from './hud.ts';
import {
  combinePreview,
  createInventory,
  inventoryView,
  slotLabel,
  UPGRADE_LOCK_MS,
  UPGRADE_NOT_GUN_TEXT,
  UPGRADE_PISTOL_TEXT,
} from './inventory.ts';
import { levelName } from './text/index.ts';

const gun = (uid: string, extra: Partial<OwnedWeapon> = {}): OwnedWeapon => ({
  uid,
  base: 'smg',
  rarity: 'common',
  affixes: [],
  ...extra,
});

function camp(stash: OwnedWeapon[], scrap: number, held?: OwnedWeapon): GameState {
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

describe('upgradeOffer', () => {
  it('names the next step and its cost: 10 × step × gun level', () => {
    expect(upgradeOffer(gun('a', { level: 3, step: 1 }), 100)).toMatchObject({
      text: 'Upgrade +2 · 60\u00a0Scrap',
      disabled: false,
      full: 'Upgrade to +2 · 60 Scrap',
      title: 'Upgrade to +2 · 60 Scrap',
      cost: 60,
      uid: 'a',
    });
    expect(upgradeOffer(gun('a'), 10)?.text).toBe('Upgrade +1 · 10\u00a0Scrap');
    expect(upgradeOffer(gun('a', { level: 20, step: 4 }), 5000)?.text).toBe(
      'Upgrade +5 · 1,000\u00a0Scrap',
    );
  });

  it('is greyed with the progress and the shortfall when Scrap is short', () => {
    expect(upgradeOffer(gun('a', { level: 3, step: 1 }), 20)).toMatchObject({
      text: 'Upgrade +2 · 20/60\u00a0Scrap',
      disabled: true,
      full: 'Upgrade to +2 · 60 Scrap',
      title: 'Upgrade to +2 · 60 Scrap. Needs 60 Scrap (40 short)',
    });
    expect(upgradeOffer(gun('a', { level: 3, step: 1 }), 59)?.disabled).toBe(true);
    expect(upgradeOffer(gun('a', { level: 3, step: 1 }), 60)?.disabled).toBe(false);
  });

  it('is greyed at the top step', () => {
    expect(upgradeOffer(gun('a', { step: 5 }), 99_999)).toMatchObject({
      text: 'Maxed at +5',
      disabled: true,
      title: 'Already at +5',
      cost: null,
    });
  });

  it('what an upgrade says once made', () => {
    expect(upgradeText(gun('a', { level: 3, step: 2 }), 60, 1240)).toBe(
      'Upgraded Lv 3 Common SMG +2 · 60 Scrap spent, 1,240 left.',
    );
  });
});

describe('the name', () => {
  it('shows +N after the gun everywhere the view names it', () => {
    const g = camp([gun('h1', { level: 3, step: 2 }), gun('h2')], 0, gun('h3', { step: 1 }));
    const v = inventoryView(g);
    expect(v.stash.find((i) => i.key === 'stash:h1')?.name).toBe('Common SMG +2');
    expect(v.stash.find((i) => i.key === 'stash:h2')?.name).toBe('Common SMG');
    expect(v.squad[0]!.gun.name).toBe('Common SMG +1');
    expect(levelName(gun('h1', { level: 3, step: 2 }))).toBe('Lv 3 Common SMG +2');
    expect(slotLabel(v.stash.find((i) => i.key === 'stash:h1')!)).toMatch(/^Common SMG \+2,/);
  });

  it('gives each gun its offer: stash and held guns have one, the pistol in hand none', () => {
    const g = camp([gun('h1', { level: 3 })], 25, gun('h3'));
    const v = inventoryView(g);
    expect(v.stash[0]!.upgrade).toMatchObject({ uid: 'h1', text: 'Upgrade +1 · 25/30\u00a0Scrap' });
    expect(v.squad[0]!.gun.upgrade).toMatchObject({
      uid: 'h3',
      text: 'Upgrade +1 · 10\u00a0Scrap',
    });
    expect(v.squad[1]!.gun.upgrade).toBeNull();
  });
});

function mount(game: GameState, canCombine = true) {
  return mountWith(game, canCombine, false);
}

/** As `mount`, with Combine wired (the real app does it from `combineGuns`). */
function mountWithCombine(game: GameState) {
  return mountWith(game, true, true);
}

function mountWith(game: GameState, canCombine: boolean, withCombine: boolean) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const onUpgrade = vi.fn((uid: string): { ok: true; text: string } | Refused => {
    const r = upgradeGun(g, uid);
    if (!r.ok) return r;
    g = r.game;
    return { ok: true as const, text: upgradeText(r.weapon, r.cost, g.stock.scrap) };
  });
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine }),
    onUpgrade,
    ...(withCombine
      ? {
          onCombine: (uids: string[]) => {
            const r = combineGuns(g, uids);
            if (r.ok) g = r.game;
            return r;
          },
        }
      : {}),
  });
  inv.open();
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const slot = (key: string) =>
    scrim.querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!;
  const button = () => scrim.querySelector<HTMLButtonElement>('.inv-upgrade-button')!;
  const status = () => scrim.querySelector('.inv-status')?.textContent;
  return { slot, button, status, onUpgrade, game: () => g, scrim };
}

describe('the Upgrade button in the details', () => {
  it('upgrades the selected stash gun on a click, then shows the next step', () => {
    const m = mount(camp([gun('h1', { level: 3 })], 200));
    m.slot('stash:h1').click();
    expect(m.button().textContent).toBe('Upgrade +1 · 30\u00a0Scrap');
    expect(m.button().disabled).toBe(false);
    m.button().click();
    expect(m.onUpgrade).toHaveBeenCalledWith('h1');
    expect(m.game().armoury[0]).toMatchObject({ step: 1 });
    expect(m.game().stock.scrap).toBe(170);
    expect(m.button().textContent).toBe('Upgrade +2 · 60\u00a0Scrap');
    expect(m.status()).toBe('Upgraded Lv 3 Common SMG +1 · 30 Scrap spent, 170 left.');
    // The details name the gun with its step.
    expect(m.scrim.querySelector('.inv-details')?.textContent).toContain('Common SMG +1');
  });

  it('keeps the stash where it was scrolled (ID-214)', () => {
    const m = mount(camp([gun('h1', { level: 3 }), gun('h2', { level: 3 })], 200));
    const body = m.scrim.querySelector<HTMLElement>('.inv-body')!;
    // jsdom lays nothing out: the scroll is kept by hand.
    let top = 240;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => (top = v),
    });
    m.slot('stash:h2').click();
    m.button().click();
    expect(m.game().armoury.find((w) => w.uid === 'h2')).toMatchObject({ step: 1 });
    expect(top).toBe(240);
  });

  it('upgrades a held gun from the squad row', () => {
    const m = mount(camp([], 100, gun('h3')));
    const key = `squad:${recruit(1).id}`;
    m.slot(key).click();
    expect(m.button().textContent).toBe('Upgrade +1 · 10\u00a0Scrap');
    m.button().click();
    expect(m.onUpgrade).toHaveBeenCalledWith('h3');
    expect(m.game().roster[0]!.loadout.primary).toMatchObject({ uid: 'h3', step: 1 });
  });

  it('is greyed with the shortfall when Scrap is short, and a click does nothing', () => {
    const m = mount(camp([gun('h1', { level: 3 })], 20));
    m.slot('stash:h1').click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe('Upgrade +1 · 20/30\u00a0Scrap');
    expect(m.button().title).toBe('Upgrade to +1 · 30 Scrap. Needs 30 Scrap (10 short)');
    expect(m.button().getAttribute('aria-label')).toBe(
      'Upgrade to +1 · 30 Scrap. Needs 30 Scrap (10 short)',
    );
    m.button().click();
    expect(m.onUpgrade).not.toHaveBeenCalled();
  });

  it('is greyed at +5', () => {
    const m = mount(camp([gun('h1', { step: 5 })], 99_999));
    m.slot('stash:h1').click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe('Maxed at +5');
  });

  it('is there, greyed, for the pistol in hand, saying why in its visible text', () => {
    const m = mount(camp([gun('h1')], 500));
    m.slot(`squad:${recruit(2).id}`).click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe(UPGRADE_PISTOL_TEXT);
    expect(m.button().textContent).toBe('Can’t upgrade the pistol');
    expect(m.button().getAttribute('aria-label')).toMatch(/free pistol/);
  });

  it('says why in its text for a blade or tool an older save left in the stash', () => {
    const m = mount(camp([gun('b1', { base: 'knife' })], 500));
    m.slot('stash:b1').click();
    expect(m.button().disabled).toBe(true);
    expect(m.button().textContent).toBe(UPGRADE_NOT_GUN_TEXT);
  });

  it('works in a fight, held or in the stash', () => {
    const m = mount(camp([gun('h1')], 500), false);
    m.slot('stash:h1').click();
    expect(m.button().disabled).toBe(false);
    m.button().click();
    expect(m.game().armoury[0]).toMatchObject({ step: 1 });
  });

  it('says why in the status line when the app refuses', () => {
    const m = mount(camp([gun('h1')], 500));
    m.slot('stash:h1').click();
    m.onUpgrade.mockReturnValueOnce({ ok: false, reason: 'No such gun' });
    m.button().click();
    expect(m.status()).toBe('No such gun');
  });
});

describe('Combine with upgraded guns', () => {
  const rusty = (uid: string, extra: Partial<OwnedWeapon> = {}) =>
    gun(uid, { rarity: 'rusty', ...extra });

  it('the confirm shows what comes out with the step of the gun that brings the level', () => {
    const p = combinePreview([
      rusty('a', { level: 2, step: 5 }),
      rusty('b', { level: 9, step: 1 }),
      rusty('c'),
    ]);
    expect(p.makes.name).toBe('Common SMG +1');
    expect(p.makes.level).toBe(9);
    expect(p.used.map((u) => u.name)).toEqual(['Rusty SMG +5', 'Rusty SMG +1', 'Rusty SMG']);
    expect(combinePreview([rusty('a'), rusty('b'), rusty('c')]).makes.name).toBe('Common SMG');
    expect(
      combinePreview([rusty('a', { step: 2 }), rusty('b', { step: 4 }), rusty('c')]).makes.name,
    ).toBe('Common SMG +4');
  });

  it('upgrading an input of an open confirm drops the confirm and shows the upgrade', () => {
    const g = camp([rusty('h1'), rusty('h2'), rusty('h3')], 500);
    const m = mountWithCombine(g);
    m.slot('stash:h1').click();
    m.scrim.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    expect(m.scrim.querySelector('.inv-combine-confirm')).not.toBeNull();
    m.button().click();
    expect(m.scrim.querySelector('.inv-combine-confirm')).toBeNull();
    expect(m.scrim.querySelector('.inv-combine-yes')).toBeNull();
    expect(m.scrim.querySelector('.inv-status')?.textContent).toBe(
      'Upgraded Lv 1 Rusty SMG +1 · 10 Scrap spent, 490 left.',
    );
    // The combine button is back, and the gun's details name the step.
    expect(m.scrim.querySelector('.inv-combine-button')).not.toBeNull();
    expect(m.scrim.querySelector('.inv-details')?.textContent).toContain('Rusty SMG +1');
  });
});

describe('a double tap', () => {
  it('buys one step: the button ignores a second press for a moment', () => {
    vi.useFakeTimers();
    try {
      const m = mount(camp([gun('h1')], 500));
      m.slot('stash:h1').click();
      m.button().click();
      m.button().click();
      expect(m.onUpgrade).toHaveBeenCalledTimes(1);
      expect(m.game().armoury[0]).toMatchObject({ step: 1 });
      vi.advanceTimersByTime(UPGRADE_LOCK_MS - 1);
      m.button().click();
      expect(m.onUpgrade).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      m.button().click();
      expect(m.onUpgrade).toHaveBeenCalledTimes(2);
      expect(m.game().armoury[0]).toMatchObject({ step: 2 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the label fits the dock', () => {
  it('is short, with the full words in the tooltip and the screen-reader name', () => {
    const w = gun('a', { level: 25, step: 4 });
    const short = upgradeOffer(w, 1000);
    expect(short.text).toBe('Upgrade +5 · 1,000/1,250\u00a0Scrap');
    expect(short.full).toBe('Upgrade to +5 · 1,250 Scrap');
    expect(short.title).toBe('Upgrade to +5 · 1,250 Scrap. Needs 1,250 Scrap (250 short)');
    const m = mount(camp([w], 1000));
    m.slot('stash:a').click();
    expect(m.button().textContent).toBe('Upgrade +5 · 1,000/1,250\u00a0Scrap');
    expect(m.button().getAttribute('aria-label')).toBe(short.title);
    const ok = mount(camp([gun('a', { level: 3, step: 2 })], 500));
    ok.slot('stash:a').click();
    expect(ok.button().textContent).toBe('Upgrade +3 · 90\u00a0Scrap');
    expect(ok.button().title).toBe('Upgrade to +3 · 90 Scrap');
    expect(ok.button().getAttribute('aria-label')).toBe('Upgrade to +3 · 90 Scrap');
  });

  it('the CSS lets the button wrap inside its block instead of clipping or widening the dock', () => {
    const css = readFileSync(resolve(__dirname, '../page.css'), 'utf8');
    const rule = (sel: string) =>
      new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const button = rule('.inv-upgrade-button');
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
    expect(rule('.inv-upgrade')).toContain('min-width: 0');
  });

  it('the Upgrade heading has its own class', () => {
    const m = mount(camp([gun('h1')], 500));
    m.slot('stash:h1').click();
    expect(m.scrim.querySelector('.inv-upgrade .inv-upgrade-label')?.textContent).toBe('Upgrade');
  });
});

describe('the +N badge on a tile', () => {
  it('shows on an upgraded gun, next to the level, and not at +0', () => {
    const m = mount(camp([gun('h1', { level: 3, step: 2 }), gun('h2')], 0, gun('h3', { step: 5 })));
    const badge = (key: string) => m.slot(key).querySelector('.inv-slot-step')?.textContent ?? null;
    expect(badge('stash:h1')).toBe('+2');
    expect(badge('stash:h2')).toBeNull();
    expect(badge(`squad:${recruit(1).id}`)).toBe('+5');
    expect(badge(`squad:${recruit(2).id}`)).toBeNull();
    expect(m.slot('stash:h1').querySelector('.inv-slot-level')?.textContent).toBe('Lv 3');
    const v = inventoryView(camp([gun('h1', { step: 2 }), gun('h2')], 0));
    expect(v.stash.map((i) => i.stepBadge).sort()).toEqual(['+2', null]);
  });
});
