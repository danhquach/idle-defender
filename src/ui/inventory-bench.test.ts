// @vitest-environment jsdom
// ID-242: the Inventory's Weapons tab has a Stash / Bench strip under the squad row. The Bench
// tab lists the survivors at camp and, below them, those out on a patrol, each with the gun
// they hold; a bench survivor's gun changes there (Change gun, To stash), a patrol's is out
// with them. Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { AREAS, DANGERS, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun, type GunChoice } from '../core/hordeonly.ts';
import type { MapPatrol } from '../core/scout.ts';
import { gunTiles } from './gunpick.ts';
import { MAP_GUN_AWAY } from './maptext.ts';
import { canDrag, createInventory, dropAction, inventoryView } from './inventory.ts';

const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});

const named = (no: number, name: string, held?: OwnedWeapon): RosterDefender => {
  const d = recruit(no);
  return { ...d, name, loadout: { ...d.loadout, primary: held ?? 'pistol' } };
};

const patrol = (no: number, members: string[], backAt: number): MapPatrol => ({
  no,
  area: Object.keys(AREAS)[0] as MapPatrol['area'],
  danger: Object.keys(DANGERS)[0] as MapPatrol['danger'],
  members,
  sentAt: 0,
  backAt,
  seed: 1,
  best: 1,
  power: 1,
});

const STASH = [
  gun('s1', 'smg', 'military'),
  gun('s2', 'rifle', 'rusty'),
  gun('s3', 'lmg', 'prototype'),
];

/**
 * A camp: one squad survivor (Zed); Ana (a Carbine) and Bo (the pistol) on the bench; Cy and Di
 * out on patrol 1 (back last); Ed on patrol 2 (back first), holding a gun.
 */
function camp(over: Partial<GameState> = {}): GameState {
  const g = newGame('horde');
  const reserve = [
    named(2, 'Ana', gun('h1', 'rifle', 'military')),
    named(3, 'Bo'),
    named(4, 'Cy', gun('h2', 'smg', 'common')),
    named(5, 'Di'),
    named(6, 'Ed', gun('h3', 'smg', 'rusty')),
  ];
  return {
    ...g,
    roster: [named(1, 'Zed')],
    reserve,
    armoury: [...STASH],
    map: {
      seed: 1,
      drawn: 0,
      areas: [],
      patrols: [patrol(1, ['recruit-4', 'recruit-5'], 200), patrol(2, ['recruit-6'], 100)],
      sent: 2,
    },
    ...over,
  };
}

function mount(game: GameState, canCombine = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  let can = canCombine;
  const onEquip = vi.fn((id: string, choice: GunChoice) => {
    const r = equipGun(g, id, choice);
    if (r.ok) g = r.game;
    return r.ok ? { ok: true as const } : r;
  });
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine: can }),
    onEquip,
    onCombine: () => ({ ok: false, reason: 'no' }),
    onSalvageMany: () => null,
    onUpgrade: () => ({ ok: false, reason: 'no' }),
    onSalvage: () => ({ ok: false, reason: 'no' }),
  });
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement = HTMLElement>(s: string): T => scrim.querySelector<T>(s)!;
  const slot = (key: string): HTMLButtonElement =>
    q<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`);
  const tab = (t: 'stash' | 'bench'): HTMLButtonElement =>
    q<HTMLButtonElement>(`.inv-tab[data-tab="${t}"]`);
  const key = (target: Element, k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const set = (next: Partial<{ g: GameState; can: boolean }>) => {
    g = next.g ?? g;
    can = next.can ?? can;
    inv.refresh();
  };
  inv.open();
  return {
    inv,
    scrim,
    q,
    slot,
    tab,
    key,
    set,
    onEquip,
    game: () => g,
    status: () => q('.inv-status'),
    details: () => q('.inv-details'),
    buttons: () => [...q('.inv-details').querySelectorAll('button')].map((b) => b.textContent),
  };
}

describe('inventoryView: bench and patrols', () => {
  it('lists survivors at camp as the bench and the patrols with their members, soonest back first', () => {
    const v = inventoryView(camp());
    expect(v.bench.map((s) => s.name)).toEqual(['Ana', 'Bo']);
    expect(v.bench.map((s) => s.gun.key)).toEqual(['bench:recruit-2', 'bench:recruit-3']);
    // The multi-member patrol's members are in the reserve too: not on the bench.
    expect(v.patrols.map((p) => p.members.map((s) => s.name))).toEqual([['Ed'], ['Cy', 'Di']]);
    expect(v.patrols.map((p) => p.no)).toEqual([2, 1]);
    expect(v.patrols[1]!.members.map((s) => s.gun.key)).toEqual([
      'patrol:recruit-4',
      'patrol:recruit-5',
    ]);
    expect(v.bench[0]!.gun.where).toBe('On the bench with Ana.');
    expect(v.bench[0]!.uid).toBe('h1');
    expect(v.bench[1]!.uid).toBeNull();
    expect(v.patrols[0]!.members[0]!.gun.where).toBe(MAP_GUN_AWAY);
    expect(v.patrols[0]!.members[0]!.gun.upgrade).toBeNull();
  });

  it('is empty with no reserve or map, and leaves a patrol with nobody of it in camp out', () => {
    const g = camp({ reserve: [], map: undefined });
    expect(inventoryView(g).bench).toEqual([]);
    expect(inventoryView(g).patrols).toEqual([]);
    const gone = camp({ reserve: [named(2, 'Ana')] });
    expect(inventoryView(gone).patrols).toEqual([]);
  });

  it('keeps the squad entries as they were', () => {
    const a = inventoryView(camp()).squad;
    const b = inventoryView(camp({ reserve: [], map: undefined })).squad;
    expect(a).toEqual(b);
    expect(a[0]!.gun.key).toBe('squad:recruit-1');
    expect(a[0]!.gun.where).toBe('Held by Zed.');
  });

  it('gives no drag to a bench or patrol slot', () => {
    const v = inventoryView(camp());
    expect(canDrag(v, 'bench:recruit-2')).toBe(false);
    expect(canDrag(v, 'patrol:recruit-4')).toBe(false);
    expect(dropAction(v, 'stash:s1', 'bench:recruit-2')).toEqual({ kind: 'none' });
    expect(dropAction(v, 'squad:recruit-1', 'bench:recruit-2')).toEqual({ kind: 'none' });
  });
});

describe('the Stash / Bench tabs', () => {
  it('is a tablist with two tabs wired to two tabpanels; Stash is shown first', () => {
    const m = mount(camp());
    const list = m.q('[role="tablist"].inv-tabs');
    expect(list.getAttribute('aria-label')).toBe('Stash and bench');
    expect(m.scrim.querySelectorAll('.inv-tab')).toHaveLength(2);
    for (const t of ['stash', 'bench'] as const) {
      const panel = m.q(`#${m.tab(t).getAttribute('aria-controls')}`);
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(m.tab(t).id);
    }
    expect(m.tab('stash').getAttribute('aria-selected')).toBe('true');
    expect(m.tab('stash').tabIndex).toBe(0);
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('false');
    expect(m.tab('bench').tabIndex).toBe(-1);
    expect(m.q('#inv-panel-stash').hidden).toBe(false);
    expect(m.q('#inv-panel-bench').hidden).toBe(true);
    // The squad row is above the strip; the stash keeps its heading, tools and Select.
    expect(m.q('[aria-label="Squad"]').closest('section')!.nextElementSibling).toBe(list);
    expect(m.q('.inv-stash-heading').textContent).toMatch(/^Stash 3\//);
    expect(m.q('.inv-stash-tools')).toBeTruthy();
    expect(m.q('.inv-select')).toBeTruthy();
  });

  it('shows the other panel on a click, and Stash again on reopening', () => {
    const m = mount(camp());
    m.tab('bench').click();
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(m.q('#inv-panel-stash').hidden).toBe(true);
    expect(m.q('#inv-panel-bench').hidden).toBe(false);
    m.inv.close();
    m.inv.open();
    expect(m.tab('stash').getAttribute('aria-selected')).toBe('true');
    expect(m.q('#inv-panel-bench').hidden).toBe(true);
  });

  it('moves with Left, Right, Home and End, and the grid never sees those keys', () => {
    const m = mount(camp());
    const seen = vi.fn();
    m.q('.inv-body').addEventListener('keydown', seen);
    m.tab('stash').focus();
    const e = m.key(m.tab('stash'), 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(m.tab('bench'));
    m.key(m.tab('bench'), 'ArrowRight');
    expect(m.tab('stash').getAttribute('aria-selected')).toBe('true');
    m.key(m.tab('stash'), 'End');
    expect(document.activeElement).toBe(m.tab('bench'));
    m.key(m.tab('bench'), 'Home');
    expect(document.activeElement).toBe(m.tab('stash'));
    m.key(m.tab('stash'), 'ArrowLeft');
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(seen).not.toHaveBeenCalled();
    // Other keys pass on (Esc closes the window).
    m.key(m.tab('bench'), 'Escape');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('is left out with no bench and no patrol, and the stash is as it was', () => {
    const m = mount(camp({ reserve: [], map: undefined }));
    expect(m.scrim.querySelector('.inv-tabs')).toBeNull();
    expect(m.scrim.querySelector('.inv-body [role="tabpanel"]')).toBeNull();
    expect(m.q('.inv-stash-zone').hidden).toBe(false);
  });

  it('leaves out an empty section: only a bench, or only a patrol', () => {
    const only = mount(camp({ map: undefined, reserve: [named(2, 'Ana')] }));
    only.tab('bench').click();
    const heads = [...only.scrim.querySelectorAll('#inv-panel-bench h3')].map((h) => h.textContent);
    expect(heads).toEqual(['Bench 1']);
    const out = mount(camp({ reserve: [named(4, 'Cy'), named(5, 'Di')] }));
    out.tab('bench').click();
    expect(
      [...out.scrim.querySelectorAll('#inv-panel-bench h3')].map((h) => h.textContent),
    ).toEqual(['On patrol 2']);
    expect(out.scrim.querySelector('.inv-bench')).toBeNull();
  });

  it('lists Bench then On patrol, one labelled group per patrol, with the squad slot markup', () => {
    const m = mount(camp());
    m.tab('bench').click();
    const heads = [...m.scrim.querySelectorAll('#inv-panel-bench h3')].map((h) => h.textContent);
    expect(heads).toEqual(['Bench 2', 'On patrol 3']);
    const groups = [...m.scrim.querySelectorAll('.inv-patrol')];
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Patrol 2 · /),
      expect.stringMatching(/^Patrol 1 · /),
    ]);
    const names = (sel: string) => [...m.scrim.querySelectorAll(sel)].map((n) => n.textContent);
    expect(names('.inv-bench .inv-who')).toEqual(['Ana', 'Bo']);
    expect(names('.inv-patrol-list .inv-who')).toEqual(['Ed', 'Cy', 'Di']);
    const squad = m.slot('squad:recruit-1');
    const benched = m.slot('bench:recruit-2');
    expect(benched.className).toBe(squad.className);
    expect(benched.dataset.rarity).toBe('military');
  });

  it('leaves the squad row exactly as it is without a bench', () => {
    const withBench = mount(camp());
    const html = withBench.q('[aria-label="Squad"]').outerHTML;
    const without = mount(camp({ reserve: [], map: undefined }));
    expect(without.q('[aria-label="Squad"]').outerHTML).toBe(html);
  });

  it("selects the bench's first slot on switching, and the arrows stay on the open tab", () => {
    const m = mount(camp());
    m.tab('bench').click();
    expect(m.slot('bench:recruit-2').getAttribute('aria-pressed')).toBe('true');
    m.slot('bench:recruit-2').focus();
    m.key(m.slot('bench:recruit-2'), 'ArrowRight');
    expect(document.activeElement).toBe(m.slot('bench:recruit-3'));
    // The stash's slots are hidden: End stops at the last patrol slot, not a stash gun.
    m.key(document.activeElement!, 'End');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('patrol:recruit-5');
    m.tab('stash').click();
    expect(m.slot('stash:s3').getAttribute('aria-pressed')).toBe('true');
  });

  it('ends Select on switching to Bench; the stash keeps Select, Combine and drag marks', () => {
    const m = mount(camp());
    expect(m.slot('stash:s1').dataset.drag).toBe('true');
    m.q('.inv-select').click();
    expect(m.q('.inv-select').getAttribute('aria-pressed')).toBe('true');
    m.tab('bench').click();
    m.tab('stash').click();
    expect(m.q('.inv-select').getAttribute('aria-pressed')).toBe('false');
    expect(m.q('.inv-details').classList.contains('inv-details-select')).toBe(false);
  });
});

describe("a bench survivor's details and gun picker", () => {
  it('offers Change gun and To stash for a stash gun; only Change gun on the pistol', () => {
    const m = mount(camp());
    m.tab('bench').click();
    expect(m.details().textContent).toContain('On the bench with Ana.');
    expect(m.buttons()).toEqual(expect.arrayContaining(['Change gun', 'To stash']));
    // A bench gun upgrades and shows Salvage (why not: it is held), as a squad gun does.
    expect(m.details().querySelector('.inv-upgrade-button')).not.toBeNull();
    expect(m.details().querySelector('.inv-salvage-button')).not.toBeNull();
    // Only stash guns combine: no Combine block on a bench gun (Salvage says why instead).
    expect(m.details().querySelector('.inv-combine-actions')).toBeNull();
    expect(m.q('.inv-bench-change').classList.contains('btn-primary')).toBe(true);
    m.slot('bench:recruit-3').click();
    expect(m.buttons()).toContain('Change gun');
    expect(m.buttons()).not.toContain('To stash');
  });

  it('shows no equip buttons in a fight, and none for a patrol survivor at any time', () => {
    const m = mount(camp(), false);
    m.tab('bench').click();
    expect(m.buttons()).not.toContain('Change gun');
    expect(m.buttons()).not.toContain('To stash');
    const open = mount(camp());
    open.tab('bench').click();
    open.slot('patrol:recruit-4').click();
    expect(open.details().querySelectorAll('button')).toHaveLength(0);
    expect(open.details().textContent).toContain(MAP_GUN_AWAY);
    expect(open.q('.inv-bench-picker').hidden).toBe(true);
  });

  it('lists the pistol and the stash guns strongest first, each with its change', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-change').click();
    const tiles = [...m.scrim.querySelectorAll<HTMLElement>('.inv-pick-tile')];
    const want = gunTiles(m.game(), 'recruit-2');
    expect(tiles.map((t) => t.dataset.choice)).toEqual(want.map((t) => t.choice));
    expect(want.map((t) => t.choice)).toContain('pistol');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(want.map((t) => t.label));
    const captions = [...m.scrim.querySelectorAll('.inv-pick-grid .inv-who')].map(
      (c) => c.textContent,
    );
    expect(captions).toEqual(want.map((t) => t.delta.text));
    expect(m.q('.inv-pick-head h3').textContent).toBe('Choose a gun for Ana');
    // Tiles are not slots: arrows leave them alone, and they have no key.
    expect(tiles.every((t) => t.dataset.key === undefined)).toBe(true);
    expect(document.activeElement).toBe(tiles[0]);
    const seen = m.key(tiles[0]!, 'ArrowRight');
    expect(seen.defaultPrevented).toBe(false);
  });

  it('offers only the pistol with an empty stash, and says so when it already holds it', () => {
    const m = mount(camp({ armoury: [] }));
    m.tab('bench').click();
    m.slot('bench:recruit-3').click();
    m.q('.inv-bench-change').click();
    expect(m.scrim.querySelectorAll('.inv-pick-tile')).toHaveLength(0);
    expect(m.q('.inv-bench-picker').textContent).toContain('No other gun to choose');
    const holds = mount(camp({ armoury: [] }));
    holds.tab('bench').click();
    holds.q('.inv-bench-change').click();
    expect(
      [...holds.scrim.querySelectorAll<HTMLElement>('.inv-pick-tile')].map((t) => t.dataset.choice),
    ).toEqual(['pistol']);
  });

  it('compares a tapped tile in the details, and Equip gives the gun and says so', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.slot('bench:recruit-3').click();
    m.q('.inv-bench-change').click();
    expect(m.q<HTMLButtonElement>('.inv-pick-equip').disabled).toBe(true);
    expect(m.q<HTMLButtonElement>('.inv-pick-equip').hidden).toBe(true);
    m.scrim.querySelector<HTMLElement>('.inv-pick-tile[data-choice="s3"]')!.click();
    expect(m.details().querySelector('.inv-verdict')!.textContent).toMatch(/Stronger/);
    expect(m.q<HTMLButtonElement>('.inv-pick-equip').disabled).toBe(false);
    expect(m.q<HTMLButtonElement>('.inv-pick-equip').hidden).toBe(false);
    m.q('.inv-pick-equip').click();
    expect(m.onEquip).toHaveBeenCalledWith('recruit-3', 's3');
    expect(m.game().reserve[1]!.loadout.primary).toMatchObject({ uid: 's3' });
    expect(m.status().textContent).toBe('Bo now holds Prototype LMG');
    // Back on the survivor's slot: picker closed, tab and selection kept.
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(m.slot('bench:recruit-3'));
    expect(m.slot('bench:recruit-3').getAttribute('aria-pressed')).toBe('true');
    expect(m.buttons()).toContain('To stash');
  });

  it('puts a gun back in the stash with To stash', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-stash').click();
    expect(m.onEquip).toHaveBeenCalledWith('recruit-2', 'pistol');
    expect(m.status().textContent).toMatch(
      /^Ana now holds the free pistol; .* is back in the stash$/,
    );
    expect(m.game().armoury.some((w) => w.uid === 'h1')).toBe(true);
    expect(m.buttons()).not.toContain('To stash');
    expect(document.activeElement).toBe(m.slot('bench:recruit-2'));
  });

  it('To stash on a full stash: the core refuses and the status line says why', () => {
    const full = Array.from({ length: 40 }, (_, i) => gun(`h${i + 10}`, 'smg', 'common'));
    const g = camp({ armoury: full });
    const refused = equipGun(g, 'recruit-2', 'pistol');
    expect(refused.ok).toBe(false);
    const m = mount(g);
    m.tab('bench').click();
    m.q('.inv-bench-stash').click();
    expect(m.status().textContent).toBe(refused.ok ? '' : refused.reason);
    expect(m.status().dataset.tone).toBe('refused');
    expect(m.game().armoury).toHaveLength(40);
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
  });

  it('the patrol is named once to a screen reader: the group, not its line or list', () => {
    const m = mount(camp());
    m.tab('bench').click();
    const group = m.q('.inv-patrol-name').closest<HTMLElement>('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe(m.q('.inv-patrol-name').textContent);
    expect(m.q('.inv-patrol-name').getAttribute('aria-hidden')).toBe('true');
    expect(group.querySelector('[aria-label]')!.getAttribute('aria-label')).toBe('Survivors');
  });

  it("shows the core's refusal (a full stash) and keeps the tab, picker and selection", () => {
    const m = mount(camp());
    m.onEquip.mockReturnValueOnce({ ok: false, reason: 'The stash is full (40/40)' });
    m.tab('bench').click();
    m.q('.inv-bench-stash').click();
    expect(m.status().textContent).toBe('The stash is full (40/40)');
    expect(m.status().dataset.tone).toBe('refused');
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(m.slot('bench:recruit-2').getAttribute('aria-pressed')).toBe('true');
    m.q('.inv-bench-change').click();
    m.scrim.querySelector<HTMLElement>('.inv-pick-tile[data-choice="pistol"]')!.click();
    m.onEquip.mockReturnValueOnce({ ok: false, reason: 'No good' });
    m.q('.inv-pick-equip').click();
    expect(m.status().textContent).toBe('No good');
    expect(m.q('.inv-bench-picker').hidden).toBe(false);
  });

  it("closes the picker with Back and Esc, focus back on the survivor's slot", () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-change').click();
    m.q('.inv-pick-back').click();
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(document.activeElement).toBe(m.slot('bench:recruit-2'));
    m.q('.inv-bench-change').click();
    m.key(document.activeElement!, 'Escape');
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(m.inv.isOpen()).toBe(true);
    expect(document.activeElement).toBe(m.slot('bench:recruit-2'));
  });

  it('closes the picker when another slot is picked or the tab changes', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-change').click();
    m.slot('bench:recruit-3').click();
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    m.q('.inv-bench-change').click();
    m.tab('stash').click();
    m.tab('bench').click();
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
  });
});

describe('the Bench tab across refreshes', () => {
  it('keeps the tab and selection through a refresh, and recomputes the picker tiles', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.slot('bench:recruit-3').click();
    m.q('.inv-bench-change').click();
    const before = m.scrim.querySelectorAll('.inv-pick-tile').length;
    m.set({ g: { ...m.game(), armoury: [...m.game().armoury, gun('s4', 'sniper', 'relic')] } });
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
    expect(m.slot('bench:recruit-3').getAttribute('aria-pressed')).toBe('true');
    expect(m.scrim.querySelectorAll('.inv-pick-tile')).toHaveLength(before + 1);
  });

  it('keeps focus on a tab and on a picker tile through a refresh', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.tab('bench').focus();
    m.set({ g: { ...m.game() } });
    expect(document.activeElement).toBe(m.tab('bench'));
    m.q('.inv-bench-change').click();
    const tile = m.scrim.querySelectorAll<HTMLElement>('.inv-pick-tile')[1]!;
    tile.focus();
    const choice = tile.dataset.choice;
    m.set({ g: { ...m.game() } });
    expect((document.activeElement as HTMLElement).dataset.choice).toBe(choice);
  });

  it('falls back to the first bench slot when the selected survivor leaves, dropping the picker', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.slot('bench:recruit-3').click();
    m.q('.inv-bench-change').click();
    // Bo goes on patrol 3.
    const g = m.game();
    m.set({
      g: {
        ...g,
        map: { ...g.map!, patrols: [...g.map!.patrols, patrol(3, ['recruit-3'], 50)] },
      },
    });
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(m.status().textContent).toBe('Bo is no longer on the bench.');
    expect(m.slot('bench:recruit-2').getAttribute('aria-pressed')).toBe('true');
    expect(m.slot('squad:recruit-1').getAttribute('aria-pressed')).toBe('false');
    expect(m.tab('bench').getAttribute('aria-selected')).toBe('true');
  });

  it('drops the picker when a fight starts', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-change').click();
    m.set({ can: false });
    expect(m.q('.inv-bench-picker').hidden).toBe(true);
    expect(m.buttons()).not.toContain('Change gun');
    expect(m.status().textContent).toMatch(/between hordes/);
  });

  it('goes back to the Stash when the bench and the patrols empty', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.set({ g: { ...m.game(), reserve: [], map: undefined } });
    expect(m.scrim.querySelector('.inv-tabs')).toBeNull();
    expect(m.q('.inv-stash-zone').hidden).toBe(false);
    expect(m.slot('stash:s3').getAttribute('aria-pressed')).toBe('true');
  });

  it("keeps each tab's scroll", () => {
    const m = mount(camp());
    const body = m.q('.inv-body');
    let top = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => (top = v),
    });
    top = 120;
    m.tab('bench').click();
    expect(top).toBe(0);
    top = 40;
    m.tab('stash').click();
    expect(top).toBe(120);
    m.tab('bench').click();
    expect(top).toBe(40);
  });
});

describe('hostile names', () => {
  // A right-to-left override, a zero-width space and markup.
  const evil = '\u{202E}evil\u{200B}<img src=x onerror=alert(1)>';
  it('renders bench and patrol names as plain text', () => {
    const g = camp({
      reserve: [named(2, evil, gun('h1', 'rifle', 'military')), named(4, `${evil}2`)],
      map: { seed: 1, drawn: 0, areas: [], patrols: [patrol(1, ['recruit-4'], 5)], sent: 1 },
    });
    const m = mount(g);
    m.tab('bench').click();
    expect(m.scrim.querySelector('img[src="x"]')).toBeNull();
    expect(m.scrim.querySelector('.inv-bench .inv-who')!.textContent).toBe(evil);
    expect(m.scrim.querySelector('.inv-patrol-list .inv-who')!.textContent).toBe(`${evil}2`);
    expect(m.slot('bench:recruit-2').getAttribute('aria-label')).toContain(`held by ${evil}`);
    expect(m.details().textContent).toContain(`On the bench with ${evil}.`);
    m.q('.inv-bench-change').click();
    expect(m.q('.inv-pick-head h3').textContent).toBe(`Choose a gun for ${evil}`);
    m.q('.inv-pick-back').click();
    m.slot('patrol:recruit-4').click();
    expect(m.details().textContent).toContain(MAP_GUN_AWAY);
    expect(m.scrim.querySelector('img[src="x"]')).toBeNull();
  });
});
