// @vitest-environment jsdom
// ID-079: the Inventory — a top-bar button beside the Menu opens a view-only list of the
// stash (against its cap, strongest first), each survivor's gun and the free pistol.
// Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { affixText, gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, equipGun } from '../core/hordeonly.ts';
import {
  COMBINE_EMPTY,
  COMBINE_NOTE,
  COMBINE_WAIT,
  combinePreview,
  createInventory,
  INVENTORY_NOTE,
  inventoryView,
  PISTOL_NOTE,
  STASH_EMPTY,
} from './inventory.ts';

const gun = (uid: string, base: WeaponId, rarity: Rarity, affixes = []): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes,
});

function camp(n: number, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}

describe('inventoryView', () => {
  it('lists the stash strongest first against its cap, with name, rarity, affixes and dmg/s', () => {
    const lmg: OwnedWeapon = {
      ...gun('a', 'lmg', 'prototype'),
      affixes: [{ id: 'damage', value: 12 }],
    };
    const stash = [gun('b', 'smg', 'rusty'), lmg, gun('c', 'rifle', 'military')];
    const v = inventoryView(camp(1, stash));
    expect(v.stashHeading).toBe(`Stash 3/${STASH_CAP}`);
    const powers = stash.map(gunPower).sort((x, y) => y - x);
    expect(v.stash.map((i) => i.power)).toEqual(powers.map((p) => `${p.toFixed(1)} dmg/s`));
    const top = v.stash.find((i) => i.name === 'Prototype LMG')!;
    expect(top).toEqual({
      name: 'Prototype LMG',
      rarity: 'prototype',
      affixes: '+12% damage',
      power: `${gunPower(lmg).toFixed(1)} dmg/s`,
    });
  });

  it('says the stash is full at the cap, and past it (an older save)', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => gun(`h${i + 1}`, 'smg', 'rusty'));
    expect(inventoryView(camp(1, many(STASH_CAP - 1))).stashHeading).toBe(
      `Stash ${STASH_CAP - 1}/${STASH_CAP}`,
    );
    expect(inventoryView(camp(1, many(STASH_CAP))).stashHeading).toBe(
      `Stash ${STASH_CAP}/${STASH_CAP} (full)`,
    );
    expect(inventoryView(camp(1, many(STASH_CAP + 3))).stashHeading).toBe(
      `Stash ${STASH_CAP + 3}/${STASH_CAP} (full)`,
    );
  });

  it('keeps the stash order for equal guns, and puts what is no gun last', () => {
    const blade: OwnedWeapon = gun('k', 'knife', 'military');
    const v = inventoryView(camp(1, [blade, gun('x', 'smg', 'common'), gun('y', 'smg', 'common')]));
    expect(v.stash.map((i) => i.power === null)).toEqual([false, false, true]);
    expect(v.stash[2]!.name).toBe('Military Knife');
  });

  it("shows each survivor's gun in squad order, the pistol for none, and the free pistol", () => {
    let g = camp(2, [gun('r', 'rifle', 'relic')]);
    const id = g.roster[1]!.id;
    const r = equipGun(g, id, 'r');
    if (!r.ok) throw new Error(r.reason);
    g = r.game;
    const v = inventoryView(g);
    expect(v.squad.map((s) => [s.name, s.gun.name])).toEqual([
      [g.roster[0]!.name, 'Pistol'],
      [g.roster[1]!.name, 'Relic Rifle'],
    ]);
    // The gun in hand has left the stash.
    expect(v.stashHeading).toBe(`Stash 0/${STASH_CAP}`);
    expect(v.pistol).toMatchObject({ name: 'Pistol', rarity: 'common', affixes: '' });
  });
});

function setup(game: GameState, resumes = false) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let state = { game, resumes };
  const inv = createInventory(root, { state: () => state });
  const button = root.querySelector<HTMLButtonElement>('.inv-button')!;
  const scrim = document.querySelector<HTMLElement>('.inv-scrim')!;
  const dialog = scrim.querySelector<HTMLElement>('[role="dialog"]')!;
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const set = (next: Partial<typeof state>) => {
    state = { ...state, ...next };
    inv.refresh();
  };
  return { root, inv, button, scrim, dialog, key, set };
}

describe('the Inventory dialog', () => {
  it('opens from its button as a modal; the field goes inert; Esc closes back to the button', () => {
    const { root, inv, button, scrim, dialog, key } = setup(camp(1));
    expect(button.textContent).toBe('Inventory');
    expect(scrim.hidden).toBe(true);
    button.click();
    expect(inv.isOpen()).toBe(true);
    expect(scrim.hidden).toBe(false);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Keys stay in the dialog.
    let leaked = false;
    document.addEventListener('keydown', () => (leaked = true), { once: true });
    key(document.activeElement!, 'Escape');
    expect(leaked).toBe(false);
    expect(inv.isOpen()).toBe(false);
    expect(root.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('a held-down Esc does not close it', () => {
    const { inv, button, key } = setup(camp(1));
    button.click();
    key(document.activeElement!, 'Escape', { repeat: true });
    expect(inv.isOpen()).toBe(true);
  });

  it('lists the stash, the squad and the free pistol, with an empty stash said plainly', () => {
    const { button, dialog } = setup(camp(2));
    button.click();
    const text = dialog.textContent!;
    expect(text).toContain(`Stash 0/${STASH_CAP}`);
    expect(text).toContain(STASH_EMPTY);
    expect(text).toContain(INVENTORY_NOTE);
    expect(text).toContain(PISTOL_NOTE);
    expect(dialog.querySelectorAll('[aria-label="Squad"] .inv-row')).toHaveLength(2);
    expect(dialog.querySelectorAll('[aria-label="Free pistol"] .inv-row')).toHaveLength(1);
    // View only: nothing in the list can be picked.
    expect(
      dialog.querySelectorAll('.menu-body button, .menu-body select, .menu-body input'),
    ).toHaveLength(0);
  });

  it('colours each row by rarity and follows the camp while open', () => {
    const { button, dialog, set } = setup(camp(1));
    button.click();
    set({ game: camp(1, [gun('a', 'sniper', 'relic')]) });
    const row = dialog.querySelector<HTMLElement>('[aria-label="Stash"] .inv-row')!;
    expect(row.dataset.rarity).toBe('relic');
    expect(row.querySelector('.inv-name')!.textContent).toBe('Relic Sniper rifle');
  });

  it('says Resume in a fight it holds, and Close otherwise', () => {
    const { button, dialog, set } = setup(camp(1), true);
    button.click();
    const done = dialog.querySelector<HTMLButtonElement>('.menu-foot button')!;
    expect(done.textContent).toBe('Resume');
    set({ resumes: false });
    expect(done.textContent).toBe('Close');
    done.click();
    expect(document.activeElement).toBe(button);
  });

  it('Tab cycles inside the dialog', () => {
    const { button, dialog, key } = setup(camp(1));
    button.click();
    const done = dialog.querySelector<HTMLButtonElement>('.menu-foot button')!;
    const closeX = dialog.querySelector<HTMLButtonElement>('.menu-close')!;
    done.focus();
    expect(key(done, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeX);
    key(closeX, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(done);
  });

  it('shows hostile text as text', () => {
    const g = camp(1);
    const name = '<img src=x onerror=alert(1)>‮evil';
    const { button, dialog } = setup({ ...g, roster: [{ ...g.roster[0]!, name }] });
    button.click();
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.querySelector('.inv-who')!.textContent).toBe(name);
    // A name cut short shows whole on hover.
    expect(dialog.querySelector<HTMLElement>('.inv-who')!.title).toBe(name);
    expect(dialog.querySelector('.inv-list')!.getAttribute('role')).toBe('list');
  });
});

describe('the Combine list (ID-091)', () => {
  const rusty = (n: number, base: WeaponId = 'smg') =>
    Array.from({ length: n }, (_, i) => gun(`h${i + 1}`, base, 'rusty'));

  it('shows every set below Relic with its count, ready ones first', () => {
    const stash = [
      gun('a', 'rifle', 'common'),
      gun('b', 'rifle', 'common'),
      ...rusty(4),
      gun('r', 'sniper', 'relic'),
    ];
    const v = inventoryView(camp(1, stash));
    expect(v.combine.map((r) => [r.name, r.rarity, r.count, r.note, r.uses?.length ?? 0])).toEqual([
      ['Rusty SMG', 'rusty', '4 in stash', '3 make a Common SMG', 3],
      ['Common Rifle', 'common', '2/3', '1 more for a Military Rifle', 0],
    ]);
  });

  it('previews the guns used up and what comes out, with base dmg/s', () => {
    const uses = rusty(3);
    const p = combinePreview(uses);
    expect(p.used.map((i) => i.name)).toEqual(['Rusty SMG', 'Rusty SMG', 'Rusty SMG']);
    const bare = gunPower(gun('x', 'smg', 'common'));
    expect(p.makes).toEqual({
      name: 'Common SMG',
      rarity: 'common',
      affixes: 'No affixes',
      power: `${bare.toFixed(1)} dmg/s`,
    });
    const mil = combinePreview([
      gun('a', 'lmg', 'common'),
      gun('b', 'lmg', 'common'),
      gun('c', 'lmg', 'common'),
    ]);
    expect(mil.makes).toMatchObject({
      name: 'Military LMG',
      rarity: 'military',
      affixes: '1 random affix, rolled on combine',
      power: `base ${gunPower(gun('x', 'lmg', 'military')).toFixed(1)} dmg/s`,
    });
    const proto = combinePreview([
      { ...gun('a', 'lmg', 'military'), affixes: [{ id: 'damage', value: 5 }] },
      { ...gun('b', 'lmg', 'military'), affixes: [{ id: 'damage', value: 6 }] },
      { ...gun('c', 'lmg', 'military'), affixes: [{ id: 'damage', value: 7 }] },
    ]);
    expect(proto.makes.affixes).toBe('2 random affixes, rolled on combine');
    expect(proto.used.map((i) => i.affixes)).toEqual(['+5% damage', '+6% damage', '+7% damage']);
  });

  function combining(stash: OwnedWeapon[], canCombine = true) {
    let g = camp(1, stash);
    const calls: string[][] = [];
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let can = canCombine;
    const inv = createInventory(root, {
      state: () => ({ game: g, resumes: false, canCombine: can }),
      onCombine: (uids) => {
        calls.push(uids);
        const r = combineGuns(g, uids);
        if (!r.ok) return r;
        g = r.game;
        inv.refresh();
        return { ok: true, weapon: r.weapon };
      },
    });
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const dialog = document.querySelector<HTMLElement>('.inv-scrim [role="dialog"]')!;
    const setCan = (on: boolean) => {
      can = on;
      inv.refresh();
    };
    return { inv, dialog, calls, game: () => g, setCan };
  }

  it('asks first, then combines the weakest three and says what it made', () => {
    const strong = gun('h9', 'smg', 'rusty');
    const { dialog, calls, game } = combining([strong, ...rusty(3)]);
    expect(dialog.textContent).toContain(COMBINE_NOTE);
    const go = dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!;
    expect(go.getAttribute('aria-label')).toBe('Combine 3 Rusty SMG');
    go.click();
    expect(calls).toHaveLength(0);
    const box = dialog.querySelector<HTMLElement>('.inv-combine-confirm')!;
    expect(box.querySelectorAll('[aria-label="Uses up"] .inv-row')).toHaveLength(3);
    expect(box.querySelector('[aria-label="Makes"] .inv-name')!.textContent).toBe('Common SMG');
    expect(box.querySelector<HTMLElement>('[aria-label="Makes"] .inv-row')!.dataset.rarity).toBe(
      'common',
    );
    // Focus lands on Cancel, the safe choice.
    expect(document.activeElement).toBe(box.querySelector('.inv-combine-no'));
    box.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(3);
    const made = game().armoury.find((w) => w.rarity === 'common')!;
    expect(dialog.querySelector('.inv-combine-result')!.textContent).toBe(
      `Made: Common SMG, ${gunPower(made).toFixed(1)} dmg/s`,
    );
    expect(dialog.querySelector('.inv-combine-confirm')).toBeNull();
    // Equal guns: the stash's first three go, in stash order; the new gun takes h1's uid.
    expect(
      game()
        .armoury.map((w) => w.uid)
        .sort(),
    ).toEqual(['h1', 'h3']);
  });

  it('keeps the strongest gun of a set out of the combine', () => {
    const mil = (uid: string, id: 'damage' | 'pierce', value: number): OwnedWeapon => ({
      ...gun(uid, 'rifle', 'military'),
      affixes: [{ id, value }],
    });
    const best = mil('h9', 'damage', 15);
    const { dialog, calls } = combining([
      best,
      mil('h1', 'pierce', 1),
      mil('h2', 'pierce', 1),
      mil('h3', 'damage', 5),
    ]);
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    const used = [...dialog.querySelectorAll('[aria-label="Uses up"] .inv-affixes')].map(
      (n) => n.textContent,
    );
    expect(used).not.toContain('+15% damage');
    dialog.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(calls[0]).not.toContain('h9');
  });

  it('Esc and Cancel drop the confirm without combining or closing', () => {
    const { inv, dialog, calls } = combining(rusty(3));
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(e);
    expect(inv.isOpen()).toBe(true);
    expect(dialog.querySelector('.inv-combine-confirm')).toBeNull();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-no')!.click();
    expect(dialog.querySelector('.inv-combine-confirm')).toBeNull();
    expect(calls).toHaveLength(0);
    // Focus goes back to the set's own Combine button.
    expect(document.activeElement).toBe(dialog.querySelector('.inv-combine-button'));
  });

  it('after a combine, focus is on the result line, which names the new affixes', () => {
    const mil = (uid: string): OwnedWeapon => ({
      ...gun(uid, 'smg', 'military'),
      affixes: [{ id: 'damage', value: 5 }],
    });
    const { dialog, game } = combining([mil('h1'), mil('h2'), mil('h3')]);
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    const made = game().armoury[0]!;
    expect(made.rarity).toBe('prototype');
    const line = dialog.querySelector<HTMLElement>('.inv-combine-result')!;
    expect(document.activeElement).toBe(line);
    expect(line.textContent).toBe(
      `Made: Prototype SMG (${made.affixes.map(affixText).join(', ')}), ${gunPower(made).toFixed(1)} dmg/s`,
    );
    // Tab from the line goes on through the dialog, not back to the top.
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    line.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('in a fight shows the counts with no buttons, and drops an open confirm', () => {
    const { dialog, setCan } = combining(rusty(3));
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    setCan(false);
    expect(dialog.querySelector('.inv-combine-confirm')).toBeNull();
    expect(dialog.querySelectorAll('.menu-body button')).toHaveLength(0);
    expect(dialog.textContent).toContain(COMBINE_WAIT);
    expect(dialog.textContent).toContain('3 in stash');
  });

  it('says why a combine was refused, as text', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const reason = '<b>no</b>';
    createInventory(root, {
      state: () => ({ game: camp(1, rusty(3)), resumes: false, canCombine: true }),
      onCombine: () => ({ ok: false, reason }),
    }).open();
    const dialog = document.querySelector<HTMLElement>('.inv-scrim [role="dialog"]')!;
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    const line = dialog.querySelector<HTMLElement>('.inv-combine-result')!;
    expect(line.textContent).toBe(reason);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.querySelector('b')).toBeNull();
  });

  it('says so when nothing can combine, and Tab walks through its buttons', () => {
    expect(combining([]).dialog.textContent).toContain(COMBINE_EMPTY);
    const { dialog } = combining([
      ...rusty(3),
      ...rusty(3, 'rifle').map((w) => ({ ...w, uid: `p1-${w.uid.slice(1)}` })),
    ]);
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('.inv-combine-button')];
    expect(buttons).toHaveLength(2);
    buttons[0]!.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    buttons[0]!.dispatchEvent(e);
    // Inside the list Tab is left to the browser, not sent back to the top.
    expect(e.defaultPrevented).toBe(false);
  });
});
