// @vitest-environment jsdom
// ID-192: the Inventory's stash sort and filters: a pure view of the armoury (never
// reordered), kept while the dialog is open, and fed by selects whose values are page data.
import { describe, expect, it } from 'vitest';
import { gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import type { Rarity, WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, equipGun } from '../core/hordeonly.ts';
import {
  createInventory,
  DEFAULT_PICK,
  dropAction,
  inventoryView,
  NO_MATCH,
  pickValue,
  type StashPick,
} from './inventory.ts';

const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});

function camp(stash: OwnedWeapon[]): GameState {
  const g = newGame('horde');
  return { ...g, roster: [recruit(1)], camp: { ...g.camp, recruits: 1 }, armoury: stash };
}

const pick = (p: Partial<StashPick>): StashPick => ({ ...DEFAULT_PICK, ...p });
const uids = (g: GameState, p: Partial<StashPick>): string[] =>
  inventoryView(g, null, false, pick(p)).shown.map((i) => i.key.slice('stash:'.length));

// Mixed stash, in armoury (arrival) order.
const mixed = (): OwnedWeapon[] => [
  gun('a', 'smg', 'rusty'),
  gun('b', 'rifle', 'relic'),
  gun('c', 'handcannon', 'common'),
  gun('d', 'shotgun', 'common'),
  gun('e', 'cartridge', 'military'),
  gun('f', 'assault', 'common'),
  gun('k', 'knife', 'relic'),
];

describe('the stash sort', () => {
  it('DPS is the default: the badge figure high to low, blades last, ties in armoury order', () => {
    const g = camp(mixed());
    const v = inventoryView(g);
    const power = (uid: string) => gunPower(g.armoury.find((w) => w.uid === uid)!);
    const guns = v.shown.slice(0, -1).map((i) => i.key.slice(6));
    for (let i = 1; i < guns.length; i++) {
      expect(power(guns[i - 1]!)).toBeGreaterThanOrEqual(power(guns[i]!));
    }
    expect(v.shown.at(-1)!.key).toBe('stash:k');
    expect(v.shown.map((i) => i.key)).toEqual(v.stash.map((i) => i.key));
    const ties = camp([gun('x', 'smg', 'common'), gun('y', 'smg', 'common')]);
    expect(uids(ties, {})).toEqual(['x', 'y']);
  });

  it('Rarity goes Relic down, then DPS, then armoury order; blades last', () => {
    const g = camp([
      gun('a', 'smg', 'common'),
      gun('b', 'rifle', 'relic'),
      gun('c', 'smg', 'common'),
      gun('d', 'sniper', 'common'),
      gun('k', 'knife', 'relic'),
      gun('e', 'smg', 'military'),
    ]);
    const common = uids(g, { sort: 'dps' }).filter((u) => 'acd'.includes(u));
    const r = uids(g, { sort: 'rarity' });
    expect(r.slice(0, 2)).toEqual(['b', 'e']);
    expect(r.slice(2, 5)).toEqual(common);
    expect(r.at(-1)).toBe('k');
  });

  it('Newest is the latest into the armoury first, blades last', () => {
    expect(uids(camp(mixed()), { sort: 'newest' })).toEqual(['f', 'e', 'd', 'c', 'b', 'a', 'k']);
  });

  it('never touches the armoury', () => {
    const g = camp(mixed());
    const before = g.armoury.map((w) => w.uid);
    for (const sort of ['dps', 'rarity', 'newest'] as const)
      inventoryView(g, null, false, pick({ sort }));
    expect(g.armoury.map((w) => w.uid)).toEqual(before);
  });
});

describe('the stash filters', () => {
  it('groups the types and hides blades under a type', () => {
    const g = camp(mixed());
    expect(uids(g, { type: 'pistol' })).toEqual(['c']);
    expect(uids(g, { type: 'shotgun', sort: 'newest' })).toEqual(['e', 'd']);
    expect(uids(g, { type: 'rifle', sort: 'newest' })).toEqual(['f', 'b']);
    expect(uids(g, { type: 'smg' })).toEqual(['a']);
    expect(uids(g, { type: 'all' })).toContain('k');
    expect(uids(g, { type: 'lmg' })).toEqual([]);
  });

  it('type and rarity combine with AND; the heading counts what is shown', () => {
    const g = camp(mixed());
    expect(uids(g, { type: 'shotgun', rarity: 'common' })).toEqual(['d']);
    expect(uids(g, { type: 'smg', rarity: 'relic' })).toEqual([]);
    expect(inventoryView(g, null, false, pick({ rarity: 'common' })).stashHeading).toBe(
      'Stash 7/40 · 3 shown',
    );
    expect(inventoryView(g).stashHeading).toBe('Stash 7/40');
    expect(inventoryView(g, null, false, pick({ sort: 'rarity' })).stashHeading).toBe('Stash 7/40');
  });

  it('lists only held values, rarities high to low, counts over the whole stash, plus the pick', () => {
    const g = camp(mixed());
    const v = inventoryView(g, null, false, pick({ type: 'lmg', rarity: 'common' }));
    expect(v.picks.type.map((o) => o.label)).toEqual([
      'All types',
      'Pistols (1)',
      'SMGs (1)',
      'Rifles (2)',
      'Shotguns (2)',
      'LMGs (0)',
    ]);
    expect(v.picks.rarity.map((o) => o.label)).toEqual([
      'All rarities',
      'Relic (2)',
      'Military (1)',
      'Common (3)',
      'Rusty (1)',
    ]);
  });
});

describe('hostile pick values', () => {
  it('fall back to the default', () => {
    for (const bad of [
      '__proto__',
      'constructor',
      '<img src=x>',
      'all ',
      'ALL',
      '',
      'toString',
      null,
      7,
    ]) {
      expect(pickValue('sort', bad)).toBe('dps');
      expect(pickValue('type', bad)).toBe('all');
      expect(pickValue('rarity', bad)).toBe('all');
    }
    expect(pickValue('type', 'rifle')).toBe('rifle');
    const g = camp(mixed());
    const v = inventoryView(g, null, false, {
      sort: '__proto__',
      type: '<img>',
      rarity: 'all ',
    } as unknown as StashPick);
    expect(v.pick).toEqual(DEFAULT_PICK);
    expect(v.shown).toHaveLength(7);
  });
});

function setup(stash: OwnedWeapon[], extra: { combine?: boolean; equip?: boolean } = {}) {
  let g = camp(stash);
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine: !!extra.combine }),
    ...(extra.combine && {
      onCombine: (u: string[]) => {
        const r = combineGuns(g, u);
        if (!r.ok) return r;
        g = r.game;
        return { ok: true as const, weapon: r.weapon };
      },
    }),
    ...(extra.equip && {
      onEquip: (id: string, choice: Parameters<typeof equipGun>[2]) => {
        const r = equipGun(g, id, choice);
        if (!r.ok) return r;
        g = r.game;
        return { ok: true as const };
      },
    }),
  });
  inv.open();
  const dialog = document.querySelector<HTMLElement>('.camp-scrim [role="dialog"]')!;
  const sel = (k: string) => dialog.querySelector<HTMLSelectElement>(`select[data-pick="${k}"]`)!;
  const choose = (k: string, v: string) => {
    const s = sel(k);
    // Not through the option list: a hostile value can be set on the element too.
    Object.defineProperty(s, 'value', { value: v, configurable: true });
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const keys = () =>
    [...dialog.querySelectorAll<HTMLElement>('.inv-stash .inv-slot[data-key]')].map((b) =>
      b.dataset.key!.slice(6),
    );
  const selected = () =>
    dialog.querySelector<HTMLElement>('.inv-slot[aria-pressed="true"]')?.dataset.key;
  return { inv, dialog, sel, choose, keys, selected, game: () => g };
}

describe('the sort and filter controls', () => {
  it('name themselves and sit between the heading and the grid', () => {
    const { dialog, sel } = setup(mixed());
    expect(sel('sort').getAttribute('aria-label')).toBe('Sort stash');
    expect(sel('type').getAttribute('aria-label')).toBe('Show gun type');
    expect(sel('rarity').getAttribute('aria-label')).toBe('Show rarity');
    expect(sel('sort').selectedOptions[0]!.textContent).toBe('Sort: DPS');
    expect(sel('type').selectedOptions[0]!.textContent).toBe('All types');
    expect(dialog.querySelectorAll('.inv-stash-tools select')).toHaveLength(3);
  });

  it('are hidden for an empty stash', () => {
    const { dialog } = setup([]);
    expect(dialog.querySelector('.inv-stash-tools')).toBeNull();
  });

  it('a change filters the grid and keeps focus on that select', () => {
    const { dialog, choose, keys, sel } = setup(mixed());
    choose('rarity', 'common');
    expect(keys().sort()).toEqual(['c', 'd', 'f']);
    expect(sel('rarity').value).toBe('common');
    expect(document.activeElement).toBe(sel('rarity'));
    expect(dialog.querySelector('.inv-stash')!.getAttribute('aria-label')).toBe(
      'Stash, 3 of 7 shown',
    );
    // Empty places are gone under a filter.
    expect(dialog.querySelectorAll('.inv-stash .inv-slot-empty')).toHaveLength(0);
    choose('rarity', 'all');
    expect(dialog.querySelectorAll('.inv-stash .inv-slot-empty').length).toBeGreaterThan(0);
  });

  it('hostile values fall back to the default', () => {
    const { choose, keys, sel } = setup(mixed());
    choose('type', 'rifle');
    expect(keys()).toHaveLength(2);
    for (const bad of ['__proto__', '<img>', 'all ', '']) {
      choose('type', 'rifle');
      choose('type', bad);
      expect(sel('type').value).toBe('all');
      expect(keys()).toHaveLength(7);
    }
    choose('sort', 'constructor');
    expect(sel('sort').value).toBe('dps');
  });

  it('the pick survives redraws and resets when the Inventory opens again', () => {
    const { inv, choose, keys, sel } = setup(mixed());
    choose('sort', 'newest');
    choose('type', 'rifle');
    inv.refresh();
    expect(keys()).toEqual(['f', 'b']);
    inv.close();
    inv.open();
    expect(sel('sort').value).toBe('dps');
    expect(sel('type').value).toBe('all');
    expect(keys()).toHaveLength(7);
  });

  it('says when nothing matches, and Show all clears the filters but not the sort', () => {
    const { dialog, choose, keys, sel } = setup(mixed());
    choose('sort', 'rarity');
    choose('type', 'lmg');
    expect(dialog.querySelector('.inv-stash')).toBeNull();
    expect(dialog.querySelector('.inv-no-match .menu-note')!.textContent).toBe(NO_MATCH);
    dialog.querySelector<HTMLButtonElement>('.inv-show-all')!.click();
    expect(keys()).toHaveLength(7);
    expect(sel('sort').value).toBe('rarity');
    expect(document.activeElement).toBe(sel('type'));
  });

  it('keeps a visible selection, else falls back to the first shown gun, else a survivor', () => {
    const { choose, selected, dialog, keys } = setup(mixed());
    dialog.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:d"]')!.click();
    expect(selected()).toBe('stash:d');
    choose('sort', 'newest');
    expect(selected()).toBe('stash:d');
    choose('type', 'shotgun');
    expect(selected()).toBe('stash:d');
    // Hidden by the rarity filter: the first shown gun.
    choose('rarity', 'military');
    expect(keys()).toEqual(['e']);
    expect(selected()).toBe('stash:e');
    choose('type', 'lmg');
    expect(selected()).toMatch(/^squad:/);
  });

  it('a filter that hides the selected gun drops its Combine confirm and result', () => {
    const three = ['x', 'y', 'z'].map((u) => gun(u, 'smg', 'rusty'));
    const { dialog, choose } = setup([...three, gun('r', 'rifle', 'relic')], { combine: true });
    dialog.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:x"]')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    expect(dialog.querySelector('.inv-combine-confirm')).not.toBeNull();
    choose('rarity', 'relic');
    expect(dialog.querySelector('.inv-combine-confirm')).toBeNull();
  });

  it('a hostile data-pick name on a select is ignored', () => {
    const { dialog, keys } = setup(mixed());
    const s = dialog.querySelector<HTMLSelectElement>('select[data-pick="type"]')!;
    s.dataset.pick = '__proto__';
    Object.defineProperty(s, 'value', { value: 'rifle', configurable: true });
    s.dispatchEvent(new Event('change', { bubbles: true }));
    expect(keys()).toHaveLength(7);
    expect(({} as Record<string, unknown>).rifle).toBeUndefined();
  });

  it('a redraw keeps focus on the focused select', () => {
    const { inv, sel } = setup(mixed());
    sel('rarity').focus();
    inv.refresh();
    expect(document.activeElement).toBe(sel('rarity'));
  });

  it('a filter leaves the full armoury to Combine and drag actions', () => {
    const g = camp([
      ...['x', 'y', 'z'].map((u) => gun(u, 'smg', 'rusty')),
      gun('r', 'rifle', 'relic'),
    ]);
    const v = inventoryView(g, null, false, pick({ type: 'rifle' }));
    expect(v.shown.map((i) => i.key)).toEqual(['stash:r']);
    expect(v.combine.some((c) => c.base === 'smg' && c.uses)).toBe(true);
    expect(dropAction(v, 'stash:x', 'stash:y').kind).toBe('combine');
    expect(dropAction(v, 'stash:x', `squad:${g.roster[0]!.id}`).kind).toBe('equip');
  });

  it('an emptied stash with a stale filter keeps the plain heading', () => {
    expect(inventoryView(camp([]), null, false, pick({ type: 'rifle' })).stashHeading).toBe(
      'Stash 0/40',
    );
  });

  it('Tab runs from the selects into the grid inside the dialog trap', () => {
    const { dialog, sel } = setup(mixed());
    const stops = [...dialog.querySelectorAll<HTMLElement>('button, select, [tabindex]')].filter(
      (n) => n.tabIndex >= 0,
    );
    const at = (e: HTMLElement) => stops.indexOf(e);
    expect(at(sel('sort'))).toBeGreaterThan(-1);
    expect(at(sel('type'))).toBe(at(sel('sort')) + 1);
    expect(at(sel('rarity'))).toBe(at(sel('type')) + 1);
    // Tab from a select is left to the browser (it is not the last stop).
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    sel('sort').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('a combine whose result a rarity filter hides lifts that filter', () => {
    const three = ['x', 'y', 'z'].map((u) => gun(u, 'smg', 'rusty'));
    const { dialog, choose, keys, sel, selected } = setup(three, { combine: true });
    choose('rarity', 'rusty');
    dialog.querySelector<HTMLButtonElement>('.inv-combine-button')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(sel('rarity').value).toBe('all');
    expect(keys()).toHaveLength(1);
    expect(selected()).toBe(`stash:${keys()[0]}`);
    expect(dialog.querySelector('.inv-combine-result')).not.toBeNull();
  });

  it('a gun taken off a survivor into a filtered-out stash selects their own slot', () => {
    const { dialog, choose, selected, game } = setup(
      [gun('r', 'rifle', 'relic'), gun('s', 'smg', 'common'), gun('t', 'smg', 'common')],
      { equip: true, combine: true },
    );
    const id = game().roster[0]!.id;
    // The Relic rifle goes in hand first, then only Common guns are shown.
    dialog.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:r"]')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-equip-on')!.click();
    choose('rarity', 'common');
    // Equip the SMG: the rifle (Relic) goes back to the stash, hidden by the filter.
    dialog.querySelector<HTMLButtonElement>('.inv-slot[data-key="stash:s"]')!.click();
    dialog.querySelector<HTMLButtonElement>('.inv-equip-on')!.click();
    expect(game().armoury.map((w) => w.uid)).toContain('r');
    expect(selected()).toBe(`squad:${id}`);
  });
});
