// @vitest-environment jsdom
// ID-079: the Inventory — a top-bar button beside the Menu opens a view-only list of the
// stash (against its cap, strongest first), each survivor's gun and the free pistol.
// Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { equipGun } from '../core/hordeonly.ts';
import {
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
