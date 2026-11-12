// @vitest-environment jsdom
// ID-079, redrawn as a grid in ID-092: the Inventory — a top-bar button beside the Menu
// opens a Weapons tab of square slots (the squad's guns over the stash, up to its cap),
// each gun's icon framed in its rarity's colour, with a selected or hovered slot's
// details beside the grid. Combine (ID-091) sits in a stash gun's details. Text reaches
// the page only through textContent.
import { describe, expect, it } from 'vitest';
import { affixLines, gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { GUN_ROLES, STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, equipGun } from '../core/hordeonly.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import {
  COMBINE_HELD,
  COMBINE_NOT_GUN,
  COMBINE_NOTE,
  COMBINE_TOP,
  COMBINE_WAIT,
  combinePreview,
  createInventory,
  INVENTORY_NOTE,
  inventoryView,
  NO_AFFIXES,
  PISTOL_NOTE,
  slotLabel,
  STASH_EMPTY,
} from './inventory.ts';
import { ART_URLS, GUN_ICON } from './sprites.ts';

/** A pointer coming over `t` (it bubbles), a mouse unless `pointerType` says otherwise. */
const over = (t: Element, pointerType = 'mouse') =>
  t.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType }));
/** A pointer leaving `t` (it doesn't bubble). */
const leave = (t: Element, pointerType = 'mouse') =>
  t.dispatchEvent(new PointerEvent('pointerleave', { pointerType }));

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
      affixes: [
        { id: 'damage', value: 12 },
        { id: 'magazine', value: 30 },
      ],
    };
    const stash = [gun('b', 'smg', 'rusty'), lmg, gun('c', 'rifle', 'military')];
    const v = inventoryView(camp(1, stash));
    expect(v.stashHeading).toBe(`Stash 3/${STASH_CAP}`);
    expect(v.free).toBe(STASH_CAP - 3);
    const powers = stash.map(gunPower).sort((x, y) => y - x);
    expect(v.stash.map((i) => i.power)).toEqual(powers.map((p) => `${p.toFixed(1)} dmg/s`));
    expect(v.stash.map((i) => i.badge)).toEqual(powers.map((p) => String(Math.round(p))));
    const top = v.stash.find((i) => i.name === 'Prototype LMG')!;
    expect(top).toMatchObject({
      key: 'stash:a',
      base: 'lmg',
      rarity: 'prototype',
      // The LMG's magazine is its role affix (ID-101).
      affixes: ['+12% damage', '+30% magazine (role)'],
      role: GUN_ROLES.lmg,
      icon: 'weapon-lmg',
      owned: lmg,
    });
  });

  it('says the stash is full at the cap, and past it (an older save)', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => gun(`h${i + 1}`, 'smg', 'rusty'));
    const at = (n: number) => inventoryView(camp(1, many(n)));
    expect(at(STASH_CAP - 1).stashHeading).toBe(`Stash ${STASH_CAP - 1}/${STASH_CAP}`);
    expect(at(STASH_CAP - 1).free).toBe(1);
    expect(at(STASH_CAP).stashHeading).toBe(`Stash ${STASH_CAP}/${STASH_CAP} (full)`);
    expect(at(STASH_CAP).free).toBe(0);
    expect(at(STASH_CAP + 3).stashHeading).toBe(`Stash ${STASH_CAP + 3}/${STASH_CAP} (full)`);
    expect(at(STASH_CAP + 3).free).toBe(0);
  });

  it('keeps the stash order for equal guns, and puts what is no gun last, with no icon', () => {
    const blade: OwnedWeapon = gun('k', 'knife', 'military');
    const v = inventoryView(camp(1, [blade, gun('x', 'smg', 'common'), gun('y', 'smg', 'common')]));
    expect(v.stash.map((i) => i.key)).toEqual(['stash:x', 'stash:y', 'stash:k']);
    expect(v.stash[2]).toMatchObject({
      name: 'Military Knife',
      power: null,
      badge: null,
      icon: null,
    });
  });

  it("shows each survivor's gun in squad order, the pistol for none, and the free pistol", () => {
    let g = camp(2, [gun('r', 'rifle', 'relic')]);
    const id = g.roster[1]!.id;
    const r = equipGun(g, id, 'r');
    if (!r.ok) throw new Error(r.reason);
    g = r.game;
    const v = inventoryView(g);
    expect(v.squad.map((s) => [s.name, s.gun.name, s.gun.where])).toEqual([
      [g.roster[0]!.name, 'Pistol', `Held by ${g.roster[0]!.name}.`],
      [g.roster[1]!.name, 'Relic Rifle', `Held by ${g.roster[1]!.name}.`],
    ]);
    // A gun in hand is no stash gun: it doesn't combine from here.
    expect(v.squad[1]!.gun.owned).toBeNull();
    // The gun in hand has left the stash.
    expect(v.stashHeading).toBe(`Stash 0/${STASH_CAP}`);
    expect(v.pistol).toMatchObject({
      key: 'pistol',
      name: 'Pistol',
      rarity: 'common',
      affixes: [],
      icon: 'weapon-pistol',
      where: PISTOL_NOTE,
    });
  });

  it('gives every gun its own icon, one per base gun', () => {
    const bases = ['pistol', 'smg', 'rifle', 'shotgun', 'lmg', 'sniper'] as const;
    const v = inventoryView(
      camp(
        1,
        bases.map((b, i) => gun(`g${i}`, b, 'common')),
      ),
    );
    expect(new Set(v.stash.map((i) => i.icon)).size).toBe(bases.length);
    for (const b of bases) expect(ART_URLS[GUN_ICON[b]], b).toBeTruthy();
  });

  it('labels a slot for screen readers with its name, rarity, dmg/s and affix count', () => {
    const w: OwnedWeapon = {
      ...gun('a', 'rifle', 'military'),
      affixes: [{ id: 'damage', value: 7 }],
    };
    const v = inventoryView(camp(1, [w]));
    expect(slotLabel(v.stash[0]!)).toBe(
      `Military Rifle, Military rarity, Marksman: +10% crit chance, level 1, ${gunPower(w).toFixed(1)} dmg/s, 1 affix`,
    );
    expect(slotLabel(v.stash[0]!, true)).toMatch(/, can combine$/);
    expect(slotLabel(v.squad[0]!.gun)).toBe(
      `Pistol, Common rarity, Backup: Fastest reload of any gun, level 1, ${gunPower('pistol').toFixed(1)} dmg/s, no affixes, held by ${v.squad[0]!.name}`,
    );
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
  const slots = (list: 'Squad' | 'Stash') => [
    ...dialog.querySelectorAll<HTMLButtonElement>(`[aria-label="${list}"] .inv-slot[data-key]`),
  ];
  const details = () => dialog.querySelector<HTMLElement>('.inv-details')!;
  return { root, inv, button, scrim, dialog, key, set, slots, details };
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

  it('has a Weapons tab, selected, controlling its panel', () => {
    const { button, dialog } = setup(camp(1));
    button.click();
    const tabs = [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Weapons']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    const panel = dialog.querySelector<HTMLElement>('[role="tabpanel"]')!;
    expect(tabs[0]!.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
  });

  it('shows one slot per stash place up to the cap, the empty ones empty', () => {
    const { button, dialog, slots } = setup(
      camp(1, [gun('a', 'smg', 'rusty'), gun('b', 'sniper', 'relic')]),
    );
    button.click();
    const stash = dialog.querySelector('[aria-label="Stash"]')!;
    expect(stash.children).toHaveLength(STASH_CAP);
    expect(slots('Stash')).toHaveLength(2);
    const empty = stash.querySelectorAll('.inv-slot-empty');
    expect(empty).toHaveLength(STASH_CAP - 2);
    // Empty places are no controls, and screen readers skip them.
    expect(empty[0]!.tagName).toBe('DIV');
    expect(empty[0]!.parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.textContent).toContain(`Stash 2/${STASH_CAP}`);
    expect(dialog.textContent).toContain(INVENTORY_NOTE);
  });

  it('shows each gun as its icon, framed in its rarity, with a dmg/s badge', () => {
    const relic = gun('b', 'sniper', 'relic');
    const { button, slots } = setup(camp(1, [gun('a', 'smg', 'rusty'), relic]));
    button.click();
    const first = slots('Stash').find((s) => s.dataset.key === 'stash:b');
    const second = slots('Stash').find((s) => s.dataset.key === 'stash:a');
    expect(first!.dataset.rarity).toBe('relic');
    expect(second!.dataset.rarity).toBe('rusty');
    const img = first!.querySelector<HTMLImageElement>('img.gun-icon')!;
    expect(img.getAttribute('src')).toBe(ART_URLS['weapon-sniper']);
    expect(img.alt).toBe('');
    expect(img.dataset.gun).toBe('sniper');
    expect(first!.querySelector('.inv-slot-badge')!.textContent).toBe(
      String(Math.round(gunPower(relic))),
    );
    expect(first!.getAttribute('aria-label')).toMatch(/^Relic Sniper rifle, Relic rarity, /);
  });

  it('shows the squad with each name under their gun, then the free pistol once', () => {
    const { button, dialog, slots } = setup(camp(2));
    button.click();
    const squad = slots('Squad');
    expect(squad.map((b) => b.dataset.key)).toEqual([
      expect.stringMatching(/^squad:/),
      expect.stringMatching(/^squad:/),
      'pistol',
    ]);
    const names = [...dialog.querySelectorAll('[aria-label="Squad"] .inv-who')].map(
      (n) => n.textContent,
    );
    expect(names.at(-1)).toBe('Free pistol');
    expect(
      dialog.querySelector<HTMLElement>('[aria-label="Squad"] li:last-child .inv-who')!.title,
    ).toBe(PISTOL_NOTE);
    expect(dialog.textContent).toContain(STASH_EMPTY);
  });

  it('with an empty stash, opens on the first survivor and the stash is all empty slots', () => {
    const { button, slots, details } = setup(camp(1));
    button.click();
    expect(slots('Stash')).toHaveLength(0);
    const first = slots('Squad')[0]!;
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(first);
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Pistol');
  });

  it('opens on the strongest stash gun, its details beside the grid', () => {
    const w: OwnedWeapon = {
      ...gun('a', 'rifle', 'military'),
      affixes: [
        { id: 'damage', value: 7 },
        { id: 'magazine', value: 21 },
      ],
    };
    const { button, slots, details } = setup(camp(1, [gun('z', 'smg', 'rusty'), w]));
    button.click();
    const first = slots('Stash')[0]!;
    expect(first.dataset.key).toBe('stash:a');
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(first);
    const d = details();
    const name = d.querySelector<HTMLElement>('.inv-name')!;
    expect(name.textContent).toBe('Lv 1 Military Rifle');
    expect(name.dataset.rarity).toBe('military');
    // Colour is not the only cue: the rarity is named.
    expect(d.querySelector('.inv-rarity')!.textContent).toBe('Military rarity · Rifle');
    expect([...d.querySelectorAll('[aria-label="Affixes"] li')].map((n) => n.textContent)).toEqual([
      '+7% damage',
      '+21% magazine',
    ]);
    expect(d.querySelector('.inv-power')!.textContent).toBe(`${gunPower(w).toFixed(1)} dmg/s`);
    // View only: no way to equip from here.
    expect(d.querySelector('select')).toBeNull();
    expect(d.textContent).not.toMatch(/equip/i);
  });

  it('names every gun’s role and trait in its details and its screen-reader label; role affixes are marked (ID-101)', () => {
    const w: OwnedWeapon = {
      ...gun('a', 'rifle', 'military'),
      affixes: [{ id: 'crit', value: 5 }],
    };
    const { button, slots, details } = setup(camp(1, [w, gun('b', 'shotgun', 'rusty')]));
    button.click();
    // The Rusty Shotgun out-shoots the Rifle, so it opens first.
    const at = (k: string) => slots('Stash').find((x) => x.dataset.key === k)!;
    const rifle = at('stash:a');
    const shotgun = at('stash:b');
    rifle.click();
    const d = details();
    expect(d.querySelector('.inv-role')!.textContent).toBe('Marksman: +10% crit chance');
    expect([...d.querySelectorAll('[aria-label="Affixes"] li')].map((n) => n.textContent)).toEqual([
      '+5% crit chance (role)',
    ]);
    expect(rifle.getAttribute('aria-label')).toContain('Marksman: +10% crit chance');
    // Even a Rusty gun with no affixes has its role.
    shotgun.click();
    expect(details().querySelector('.inv-role')!.textContent).toBe(
      `${GUN_ROLES.shotgun.role}: ${GUN_ROLES.shotgun.trait}`,
    );
    expect(shotgun.getAttribute('aria-label')).toContain(GUN_ROLES.shotgun.role);
    // The free pistol too.
    const pistol = slots('Squad').at(-1)!;
    pistol.click();
    expect(details().querySelector('.inv-role')!.textContent).toBe(
      `${GUN_ROLES.pistol.role}: ${GUN_ROLES.pistol.trait}`,
    );
  });

  it('selects a slot on click; its details show; one slot is selected at a time', () => {
    const { button, slots, details } = setup(
      camp(1, [gun('a', 'lmg', 'prototype'), gun('b', 'smg', 'rusty')]),
    );
    button.click();
    const [a, b] = slots('Stash');
    b!.click();
    expect(b!.getAttribute('aria-pressed')).toBe('true');
    expect(a!.getAttribute('aria-pressed')).toBe('false');
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Rusty SMG');
    expect(details().querySelector('.inv-affixes')!.textContent).toBe(NO_AFFIXES);
  });

  it('a squad slot says who holds it; the pistol says it is free', () => {
    const { button, slots, details } = setup(camp(1));
    button.click();
    const [mine, pistol] = slots('Squad');
    mine!.click();
    expect(details().querySelector('.inv-where')!.textContent).toMatch(/^Held by /);
    pistol!.click();
    expect(details().querySelector('.inv-where')!.textContent).toBe(PISTOL_NOTE);
  });

  it('hovering a slot shows its details; leaving the grid goes back to the selected one', () => {
    const { button, dialog, slots, details } = setup(
      camp(1, [gun('a', 'lmg', 'prototype'), gun('b', 'smg', 'rusty')]),
    );
    button.click();
    const b = slots('Stash')[1]!;
    over(b.querySelector('img')!);
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Rusty SMG');
    // Hover shows, it doesn't select.
    expect(b.getAttribute('aria-pressed')).toBe('false');
    leave(dialog.querySelector('.inv-body')!);
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Prototype LMG');
  });

  it('only a mouse hovers: a touch or pen over a slot, and the mouse events a tap makes, show nothing (#272)', () => {
    const { button, dialog, slots, details } = setup(
      camp(1, [gun('a', 'lmg', 'prototype'), gun('b', 'smg', 'rusty')]),
    );
    button.click();
    const b = slots('Stash')[1]!;
    const shown = details().firstElementChild;
    over(b, 'touch');
    over(b, 'pen');
    // iOS Safari's compatibility events for a tap: a redraw on these drops the tap's click.
    b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    dialog.querySelector('.inv-body')!.dispatchEvent(new MouseEvent('mouseleave'));
    leave(dialog.querySelector('.inv-body')!, 'touch');
    expect(details().firstElementChild).toBe(shown);
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Prototype LMG');
    // A mouse on the same screen (a laptop with a touch screen) still hovers.
    over(b);
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Rusty SMG');
  });

  it('the keyboard moves through every slot with the arrows, Home and End', () => {
    const { button, key, slots, details } = setup(
      camp(1, [gun('a', 'lmg', 'prototype'), gun('b', 'smg', 'rusty')]),
    );
    button.click();
    const all = [...slots('Squad'), ...slots('Stash')];
    // One Tab stop for the grid: the selected slot.
    expect(all.filter((s) => s.tabIndex === 0)).toEqual([all[2]]);
    key(document.activeElement!, 'ArrowRight');
    expect(document.activeElement).toBe(all[3]);
    expect(all[3]!.getAttribute('aria-pressed')).toBe('true');
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Rusty SMG');
    // At the end it stays put.
    expect(key(document.activeElement!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[3]);
    key(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(all[0]);
    key(document.activeElement!, 'ArrowLeft');
    expect(document.activeElement).toBe(all[0]);
    key(document.activeElement!, 'End');
    expect(document.activeElement).toBe(all[3]);
    key(document.activeElement!, 'ArrowLeft');
    expect(document.activeElement).toBe(all[2]);
    expect(all.filter((s) => s.tabIndex === 0)).toEqual([all[2]]);
  });

  it('Up and Down move to the slot above or below', () => {
    const stash = Array.from({ length: 8 }, (_, i) => gun(`h${i}`, 'smg', 'rusty'));
    const { button, key, slots } = setup(camp(1, stash));
    button.click();
    // jsdom has no layout: lay the stash out four to a row by hand.
    const all = [...slots('Squad'), ...slots('Stash')];
    all.forEach((b, i) => {
      const rect = { top: Math.floor(i / 4) * 70, left: (i % 4) * 70 };
      b.getBoundingClientRect = () => ({ ...rect, width: 64, height: 64 }) as DOMRect;
    });
    all[1]!.click();
    all[1]!.focus();
    key(all[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(all[5]);
    key(all[5]!, 'ArrowDown');
    expect(document.activeElement).toBe(all[9]);
    key(all[9]!, 'ArrowDown');
    // No row under it: it stays.
    expect(document.activeElement).toBe(all[9]);
    key(all[9]!, 'ArrowUp');
    expect(document.activeElement).toBe(all[5]);
  });

  it('keeps the selection across a refresh, and the details follow the camp', () => {
    const { button, set, slots, details } = setup(camp(1, [gun('a', 'smg', 'rusty')]));
    button.click();
    set({ game: camp(1, [gun('b', 'sniper', 'relic'), gun('a', 'smg', 'rusty')]) });
    expect(slots('Stash').find((s) => s.getAttribute('aria-pressed') === 'true')!.dataset.key).toBe(
      'stash:a',
    );
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Rusty SMG');
    // The selected gun gone: back to the strongest.
    set({ game: camp(1, [gun('b', 'sniper', 'relic')]) });
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Relic Sniper rifle');
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
    const { button, dialog, key } = setup(camp(1, [gun('a', 'smg', 'rusty')]));
    button.click();
    const done = dialog.querySelector<HTMLButtonElement>('.menu-foot button')!;
    const closeX = dialog.querySelector<HTMLButtonElement>('.menu-close')!;
    done.focus();
    expect(key(done, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeX);
    key(closeX, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(done);
    // From a slot, Tab is left to the browser.
    const slot = dialog.querySelector<HTMLElement>('.inv-slot[tabindex="0"]')!;
    slot.focus();
    expect(key(slot, 'Tab').defaultPrevented).toBe(false);
  });

  it('shows hostile text as text', () => {
    const g = camp(1);
    const name = '<img src=x onerror=alert(1)>‮evil';
    const { button, dialog, slots, details } = setup({
      ...g,
      roster: [{ ...g.roster[0]!, name }],
    });
    button.click();
    // The only images are the gun icons.
    expect([...dialog.querySelectorAll('img')].every((i) => i.classList.contains('gun-icon'))).toBe(
      true,
    );
    expect(dialog.querySelector('.inv-who')!.textContent).toBe(name);
    // A name cut short shows whole on hover.
    expect(dialog.querySelector<HTMLElement>('.inv-who')!.title).toBe(name);
    expect(slots('Squad')[0]!.getAttribute('aria-label')).toContain(`held by ${name}`);
    expect(details().textContent).toContain(`Held by ${name}.`);
    expect(details().querySelector('[onerror]')).toBeNull();
    expect(dialog.querySelector('[aria-label="Stash"]')!.getAttribute('role')).toBe('list');
  });
});

describe('Combine in the details (ID-091)', () => {
  const rusty = (n: number, base: WeaponId = 'smg') =>
    Array.from({ length: n }, (_, i) => gun(`h${i + 1}`, base, 'rusty'));

  it('lists every stash set below Relic with its count, ready ones first', () => {
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
    expect(p.makes).toMatchObject({
      name: 'Common SMG',
      rarity: 'common',
      affixes: [NO_AFFIXES],
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
      affixes: ['1 random affix, rolled on combine'],
      power: `base ${gunPower(gun('x', 'lmg', 'military')).toFixed(1)} dmg/s`,
    });
    const proto = combinePreview([
      { ...gun('a', 'lmg', 'military'), affixes: [{ id: 'damage', value: 5 }] },
      { ...gun('b', 'lmg', 'military'), affixes: [{ id: 'damage', value: 6 }] },
      { ...gun('c', 'lmg', 'military'), affixes: [{ id: 'damage', value: 7 }] },
    ]);
    expect(proto.makes.affixes).toEqual(['2 random affixes, rolled on combine']);
    expect(proto.used.map((i) => i.affixes)).toEqual([
      ['+5% damage'],
      ['+6% damage'],
      ['+7% damage'],
    ]);
  });

  function combining(stash: OwnedWeapon[], canCombine = true, squad = 1) {
    let g = camp(squad, stash);
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
    const details = () => dialog.querySelector<HTMLElement>('.inv-details')!;
    const slot = (key: string) =>
      dialog.querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!;
    return { inv, dialog, calls, game: () => g, setCan, details, slot };
  }

  it('marks the slots of a set ready to combine', () => {
    const { dialog } = combining([...rusty(3), gun('x', 'rifle', 'common')]);
    const marked = [...dialog.querySelectorAll<HTMLElement>('.inv-slot')].filter((s) =>
      s.querySelector('.inv-slot-ready'),
    );
    expect(marked.map((s) => s.dataset.key).sort()).toEqual(['stash:h1', 'stash:h2', 'stash:h3']);
    expect(marked[0]!.getAttribute('aria-label')).toMatch(/, can combine$/);
  });

  it('asks first, then combines the weakest three and says what it made', () => {
    const strong = gun('h9', 'smg', 'rusty');
    const { details, calls, game, slot } = combining([strong, ...rusty(3)]);
    expect(details().textContent).toContain(COMBINE_NOTE);
    expect(details().querySelector('.inv-combine-count')!.textContent).toBe(
      'Rusty SMG: 4 in stash · 3 make a Common SMG',
    );
    const go = details().querySelector<HTMLButtonElement>('.inv-combine-button')!;
    expect(go.getAttribute('aria-label')).toBe('Combine 3 Rusty SMG');
    go.click();
    expect(calls).toHaveLength(0);
    const box = details().querySelector<HTMLElement>('.inv-combine-confirm')!;
    // Three identical guns, one line.
    const used = box.querySelectorAll('[aria-label="Uses up"] li');
    expect(used).toHaveLength(1);
    expect(used[0]!.querySelector('.inv-name')!.textContent).toBe('3 × Lv 1 Rusty SMG');
    expect(box.querySelector('[aria-label="Makes"] .inv-name')!.textContent).toBe(
      'Lv 1 Common SMG',
    );
    expect(box.querySelector<HTMLElement>('[aria-label="Makes"] li')!.dataset.rarity).toBe(
      'common',
    );
    // Focus lands on Cancel, the safe choice.
    expect(document.activeElement).toBe(box.querySelector('.inv-combine-no'));
    box.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(3);
    const made = game().armoury.find((w) => w.rarity === 'common')!;
    expect(details().querySelector('.inv-combine-result')!.textContent).toBe(
      `Made: Lv 1 Common SMG, ${gunPower(made).toFixed(1)} dmg/s`,
    );
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    // The new gun is selected: its details are up.
    expect(slot(`stash:${made.uid}`).getAttribute('aria-pressed')).toBe('true');
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Common SMG');
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
    const { details, calls } = combining([
      best,
      mil('h1', 'pierce', 1),
      mil('h2', 'pierce', 1),
      mil('h3', 'damage', 5),
    ]);
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    const used = [...details().querySelectorAll('[aria-label="Uses up"] .inv-combine-affixes')].map(
      (n) => n.textContent,
    );
    expect(used).not.toContain('+15% damage');
    details().querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(calls[0]).not.toContain('h9');
  });

  it('Esc and Cancel drop the confirm without combining or closing', () => {
    const { inv, details, calls } = combining(rusty(3));
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(e);
    expect(inv.isOpen()).toBe(true);
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    details().querySelector<HTMLButtonElement>('.inv-combine-no')!.click();
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    expect(calls).toHaveLength(0);
    // Focus goes back to the set's own Combine button.
    expect(document.activeElement).toBe(details().querySelector('.inv-combine-button'));
  });

  it('a confirm stays up while the pointer crosses the grid, and goes with a new selection', () => {
    const { dialog, details, slot } = combining([...rusty(3), gun('x', 'rifle', 'common')]);
    slot('stash:h1').click();
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    over(slot('stash:x'));
    expect(details().querySelector('.inv-combine-confirm')).not.toBeNull();
    leave(dialog.querySelector('.inv-body')!);
    slot('stash:x').click();
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Common Rifle');
  });

  it('on a touch screen a tap on a gun, then on Combine 3, opens the confirm first time (#272)', () => {
    const { dialog, details, slot } = combining([gun('x', 'rifle', 'common'), ...rusty(3)]);
    const grid = dialog.querySelector('.inv-body')!;
    // The events a tap sends in iOS Safari: pointer, then compatibility mouse; Safari
    // drops the click when those redrew the page (it takes the tap for a hover).
    const tap = (t: HTMLElement) => {
      const shown = details().firstElementChild;
      over(t, 'touch');
      t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      if (details().firstElementChild === shown && t.isConnected) t.click();
    };
    tap(slot('stash:h2'));
    expect(slot('stash:h2').getAttribute('aria-pressed')).toBe('true');
    const combine = details().querySelector<HTMLButtonElement>('.inv-combine-button')!;
    // The finger moves to the details: the grid's leave events must not redraw the button.
    leave(grid, 'touch');
    grid.dispatchEvent(new MouseEvent('mouseleave'));
    expect(details().querySelector('.inv-combine-button')).toBe(combine);
    tap(combine);
    const box = details().querySelector<HTMLElement>('.inv-combine-confirm')!;
    expect(box.getAttribute('aria-label')).toBe('Combine into a Common SMG');
    box.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(details().querySelector('.inv-name')!.textContent).toBe('Lv 1 Common SMG');
  });

  it('after a combine, focus is on the result line, which names the new affixes', () => {
    const mil = (uid: string): OwnedWeapon => ({
      ...gun(uid, 'smg', 'military'),
      affixes: [{ id: 'damage', value: 5 }],
    });
    const { details, game } = combining([mil('h1'), mil('h2'), mil('h3')]);
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    details().querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    const made = game().armoury[0]!;
    expect(made.rarity).toBe('prototype');
    const line = details().querySelector<HTMLElement>('.inv-combine-result')!;
    expect(document.activeElement).toBe(line);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.textContent).toBe(
      `Made: Lv 1 Prototype SMG (${affixLines(made, true).join(', ')}), ${gunPower(made).toFixed(1)} dmg/s`,
    );
    // Tab from the line goes on through the dialog, not back to the top.
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    line.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('in a fight shows the count with no button or ready marks, and drops an open confirm', () => {
    const { dialog, details, setCan } = combining(rusty(3));
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    setCan(false);
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    expect(details().querySelectorAll('button')).toHaveLength(0);
    expect(dialog.querySelector('.inv-slot-ready')).toBeNull();
    expect(details().textContent).toContain(COMBINE_WAIT);
    expect(details().textContent).toContain('3 in stash');
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
    expect(line.querySelector('b')).toBeNull();
  });

  it('a short set says how many more; Relic, a gun in hand and the pistol say why not', () => {
    const { details, slot } = combining([...rusty(2), gun('r', 'sniper', 'relic')]);
    slot('stash:h1').click();
    expect(details().querySelector('.inv-combine-count')!.textContent).toBe(
      'Rusty SMG: 2/3 · 1 more for a Common SMG',
    );
    expect(details().querySelector('.inv-combine-button')).toBeNull();
    slot('stash:r').click();
    expect(details().textContent).toContain(COMBINE_TOP);
    const squad = details().ownerDocument.querySelector<HTMLButtonElement>(
      '.inv-slot[data-key^="squad:"]',
    )!;
    squad.click();
    expect(details().textContent).toContain(COMBINE_HELD);
    slot('pistol').click();
    expect(details().querySelector('.inv-combine')!.textContent).toContain(PISTOL_NOTE);
  });

  it("an older save's blade in the stash says only guns combine", () => {
    const { details, slot } = combining([gun('k', 'knife', 'rusty'), ...rusty(3, 'knife')]);
    slot('stash:k').click();
    expect(details().querySelector('.inv-combine')!.textContent).toContain(COMBINE_NOT_GUN);
    expect(details().querySelector('.inv-combine-button')).toBeNull();
  });

  it("Combine from a hovered gun's details selects that gun and keeps its confirm up", () => {
    const rifles = rusty(3, 'rifle').map((w) => ({ ...w, uid: `p1-${w.uid.slice(1)}` }));
    const { details, slot } = combining([...rusty(3), ...rifles]);
    slot('stash:h1').click();
    // The pointer rests on a rifle while the keyboard reaches its Combine.
    over(slot('stash:p1-1'));
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    const box = details().querySelector<HTMLElement>('.inv-combine-confirm')!;
    expect(box.getAttribute('aria-label')).toBe('Combine into a Common Rifle');
    expect(slot('stash:p1-1').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(box.querySelector('.inv-combine-no'));
    // Moving the pointer over another slot leaves the confirm up.
    over(slot('stash:h1'));
    expect(details().querySelector('.inv-combine-confirm')).not.toBeNull();
  });

  it('keeps focus in the dialog when a fight starts under an open confirm', () => {
    const { dialog, details, setCan, slot } = combining(rusty(3));
    details().querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    expect(details().contains(document.activeElement)).toBe(true);
    setCan(false);
    expect(details().querySelector('.inv-combine-confirm')).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(slot('stash:h1'));
  });
});

describe('gun level and Squad Power in the Inventory (ID-098)', () => {
  const lv = (uid: string, base: WeaponId, rarity: Rarity, level: number): OwnedWeapon => ({
    ...gun(uid, base, rarity),
    level,
  });

  it('every gun carries its level: a badge, the details’ name, and the screen-reader label', () => {
    const w = lv('a', 'rifle', 'military', 12);
    const v = inventoryView(camp(1, [w]));
    expect(v.stash[0]).toMatchObject({ level: 12, levelBadge: 'Lv 12' });
    // The free pistol, and a gun from an older save with no level, are Lv 1.
    expect(v.pistol).toMatchObject({ level: 1, levelBadge: 'Lv 1' });
    expect(inventoryView(camp(1, [gun('b', 'smg', 'rusty')])).stash[0]!.level).toBe(1);
    expect(slotLabel(v.stash[0]!)).toContain('level 12');
    // What is no gun has no level badge.
    expect(inventoryView(camp(1, [gun('k', 'knife', 'military')])).stash[0]!.levelBadge).toBeNull();
  });

  it('dmg/s in the badge and sorting include the level', () => {
    const low = lv('l', 'rifle', 'military', 1);
    const high = lv('h', 'rifle', 'military', 20);
    const v = inventoryView(camp(1, [low, high]));
    expect(v.stash.map((i) => i.key)).toEqual(['stash:h', 'stash:l']);
    expect(v.stash[0]!.power).toBe(`${gunPower(high).toFixed(1)} dmg/s`);
    expect(gunPower(high)).toBeGreaterThan(gunPower(low));
  });

  it('on the page: a level badge on each slot beside the dmg/s badge, and the level in the details', () => {
    const w = lv('a', 'rifle', 'military', 12);
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    createInventory(root, { state: () => ({ game: camp(1, [w]), resumes: false }) });
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const slot = document.querySelector<HTMLElement>('.inv-slot[data-key="stash:a"]')!;
    expect(slot.querySelector('.inv-slot-level')!.textContent).toBe('Lv 12');
    expect(slot.querySelector('.inv-slot-badge')!.textContent).toBe(
      String(Math.round(gunPower(w))),
    );
    expect(document.querySelector('.inv-name')!.textContent).toBe('Lv 12 Military Rifle');
    const pistol = document.querySelector<HTMLElement>('.inv-slot[data-key="pistol"]')!;
    expect(pistol.querySelector('.inv-slot-level')!.textContent).toBe('Lv 1');
  });

  it('a combine preview takes the highest level of the three and prices it in', () => {
    const uses = [
      lv('a', 'smg', 'rusty', 3),
      lv('b', 'smg', 'rusty', 9),
      lv('c', 'smg', 'rusty', 5),
    ];
    const p = combinePreview(uses);
    expect(p.makes.level).toBe(9);
    expect(p.makes.levelBadge).toBe('Lv 9');
    expect(p.used.map((u) => u.level)).toEqual([3, 9, 5]);
  });

  it('shows Squad Power against the next fight’s Recommended Power, in its band, with the word', () => {
    const g = camp(1);
    expect(inventoryView(g).power).toBeNull();
    const v = inventoryView(g, 3);
    expect(v.power).toMatchObject({ power: squadPower(g), rec: recommendedPower(3) });
    expect(v.power!.text).toBe(
      `Power ${squadPower(g).toLocaleString('en-US')} · rec ${recommendedPower(3).toLocaleString('en-US')}`,
    );
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    let horde: number | undefined = 3;
    const inv = createInventory(root, {
      state: () => ({ game: g, resumes: false, ...(horde ? { horde } : {}) }),
    });
    root.querySelector<HTMLButtonElement>('.inv-button')!.click();
    const line = document.querySelector<HTMLElement>('.inv-power-line')!;
    expect(line.textContent).toBe(`${v.power!.text} (Horde 3) ${v.power!.band}`);
    expect(line.dataset.band).toBe(v.power!.band);
    // Following the pick: another horde, another Recommended Power.
    horde = 30;
    inv.refresh();
    expect(document.querySelector('.inv-power-line')!.textContent).toContain(
      `rec ${recommendedPower(30).toLocaleString('en-US')}`,
    );
    // With no horde (the full game), no line.
    horde = undefined;
    inv.refresh();
    expect(document.querySelector('.inv-power-line')).toBeNull();
  });
});
