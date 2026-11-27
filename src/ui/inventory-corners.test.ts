// @vitest-environment jsdom
// ID-253: every gun slot has four fixed corners (level top left, Upgrade step top right, the
// gun's own dmg/s bottom left, class badge bottom right), a ready set gets a corner wedge on its
// cell, and a key (ⓘ) says what the icons mean. Text reaches the page only through textContent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import {
  AREAS,
  COMBINE_COUNT,
  DANGERS,
  GUN_UPGRADE,
  type Rarity,
  type WeaponId,
} from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun, type GunChoice } from '../core/hordeonly.ts';
import type { MapPatrol } from '../core/scout.ts';
import { CLASS_SHAPE } from './classicon.ts';
import {
  createInventory,
  DRAG_SLOP,
  ICON_KEY,
  ICON_KEY_LABEL,
  inventoryView,
  slotFace,
} from './inventory.ts';

const gun = (
  uid: string,
  base: WeaponId,
  rarity: Rarity,
  extra: Partial<OwnedWeapon> = {},
): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
  ...extra,
});

const named = (no: number, name: string, held?: OwnedWeapon): RosterDefender => {
  const d = recruit(no);
  return { ...d, name, loadout: { ...d.loadout, primary: held ?? 'pistol' } };
};

const patrol = (): MapPatrol => ({
  no: 1,
  area: Object.keys(AREAS)[0] as MapPatrol['area'],
  danger: Object.keys(DANGERS)[0] as MapPatrol['danger'],
  members: ['recruit-4'],
  sentAt: 0,
  backAt: 200,
  seed: 1,
  best: 1,
  power: 1,
});

/** A squad survivor, a bench survivor (a rifle) and a patrol survivor (an SMG); a set of three. */
function camp(): GameState {
  const g = newGame('horde');
  return {
    ...g,
    roster: [named(1, 'Zed', gun('z', 'rifle', 'military', { level: 120, step: 5 }))],
    reserve: [
      named(2, 'Ana', gun('h1', 'rifle', 'military', { level: 7, step: 2 })),
      named(4, 'Cy', gun('h2', 'smg', 'common')),
    ],
    armoury: [
      gun('a', 'smg', 'rusty'),
      gun('b', 'smg', 'rusty'),
      gun('c', 'smg', 'rusty'),
      gun('k', 'knife', 'military'),
      gun('p', 'lmg', 'prototype', { level: 3 }),
    ],
    map: { seed: 1, drawn: 0, areas: [], patrols: [patrol()], sent: 1 },
  };
}

let under: Element | null = null;
beforeEach(() => {
  under = null;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
});

function mount(game: GameState, canCombine = true) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const inv = createInventory(root, {
    state: () => ({ game: g, resumes: false, canCombine }),
    onEquip: vi.fn((id: string, choice: GunChoice) => {
      const r = equipGun(g, id, choice);
      if (r.ok) g = r.game;
      return r.ok ? { ok: true as const } : r;
    }),
    onCombine: () => ({ ok: false, reason: 'no' }),
    onSalvageMany: () => null,
    onUpgrade: () => ({ ok: false, reason: 'no' }),
    onSalvage: () => ({ ok: false, reason: 'no' }),
  });
  inv.open();
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  const q = <T extends HTMLElement = HTMLElement>(s: string): T => scrim.querySelector<T>(s)!;
  const slot = (key: string) => q<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`);
  const tab = (t: 'stash' | 'bench') => q<HTMLButtonElement>(`.inv-tab[data-tab="${t}"]`);
  return { inv, scrim, q, slot, tab, refresh: () => inv.refresh() };
}

const classes = (e: Element): string[] => [...e.children].map((c) => c.className);
const FOUR = ['gun-icon', 'inv-slot-level', 'inv-slot-step', 'inv-slot-badge'];

describe('the four corners (ID-253)', () => {
  it('a gun slot: icon, level, step, dmg/s, class badge, on every surface', () => {
    const m = mount(camp());
    const want = [...FOUR, 'class-badge class-badge-medium'];
    expect(classes(m.slot('squad:recruit-1'))).toEqual(want);
    expect(classes(m.slot('stash:p'))).toEqual([
      'gun-icon',
      'inv-slot-level',
      'inv-slot-badge',
      expect.stringMatching(/^class-badge /),
    ]);
    m.tab('bench').click();
    expect(classes(m.slot('bench:recruit-2'))).toEqual(want);
    // A patrol survivor's slot has the same corners.
    expect(m.slot('patrol:recruit-4').querySelector('.inv-slot-level')).not.toBeNull();
    expect(m.slot('patrol:recruit-4').querySelector('.class-badge')).not.toBeNull();
    // The old wrapper is gone everywhere.
    expect(m.scrim.querySelector('.inv-slot-corner, .inv-slot-ready')).toBeNull();
  });

  it('the level reads "Lv N" up to 99 and the bare number from 100, with the words as title', () => {
    const m = mount(camp());
    const level = (k: string) => m.slot(k).querySelector<HTMLElement>('.inv-slot-level')!;
    expect(level('stash:p').textContent).toBe('Lv 3');
    expect(level('stash:p').title).toBe('Level 3');
    expect(level('squad:recruit-1').textContent).toBe('120');
    expect(level('squad:recruit-1').title).toBe('Level 120');
    const v = inventoryView(camp());
    for (const n of [99, 999]) {
      const it = { ...v.stash[0]!, level: n, levelBadge: `Lv ${n}` };
      const lvl = slotFace(it).find((e) => e.classList.contains('inv-slot-level'))!;
      expect(lvl.textContent).toBe(n >= 100 ? String(n) : `Lv ${n}`);
    }
  });

  it('no step plate at +0; the step plate says +N otherwise', () => {
    const m = mount(camp());
    expect(m.slot('stash:p').querySelector('.inv-slot-step')).toBeNull();
    expect(m.slot('squad:recruit-1').querySelector('.inv-slot-step')!.textContent).toBe('+5');
  });

  it('a non-gun has its name and no plates, no badge', () => {
    const m = mount(camp());
    const k = m.slot('stash:k');
    expect(classes(k)).toEqual(['inv-slot-text']);
  });

  it('the static tiles of the combine confirm carry the four corners too', () => {
    const m = mount(camp());
    m.slot('stash:a').click();
    m.q('.inv-combine-button').click();
    const tile = m.scrim.querySelector('[aria-label="Uses up"] .inv-slot')!;
    expect(classes(tile).slice(0, 1)).toEqual(['gun-icon']);
    expect(tile.querySelector('.inv-slot-badge')).not.toBeNull();
    expect(tile.querySelector('.class-badge')).not.toBeNull();
  });

  it('the drag ghost has the same face', () => {
    const m = mount(camp());
    const from = m.slot('stash:p');
    under = from;
    const ev = (t: string, x: number, y: number, buttons: number) => {
      const e = new MouseEvent(t, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        buttons,
      });
      Object.defineProperties(e, {
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
        isPrimary: { value: true },
      });
      return e;
    };
    from.dispatchEvent(ev('pointerdown', 10, 10, 0));
    under = m.slot('squad:recruit-1');
    from.dispatchEvent(ev('pointermove', 10 + DRAG_SLOP + 4, 10, 1));
    from.dispatchEvent(ev('pointermove', 200, 200, 1));
    const ghost = m.scrim.querySelector('.inv-ghost')!;
    expect(classes(ghost)).toEqual(classes(m.slot('stash:p')));
  });

  it('the bench gun picker tiles have the face', () => {
    const m = mount(camp());
    m.tab('bench').click();
    m.q('.inv-bench-change').click();
    const tile = m.scrim.querySelector('.inv-pick-tile[data-choice="p"]')!;
    expect(classes(tile)).toEqual(classes(m.slot('stash:p')));
  });
});

describe('the ready wedge (ID-253)', () => {
  const cells = (m: ReturnType<typeof mount>) =>
    [...m.scrim.querySelectorAll<HTMLElement>('.inv-cell')].filter((c) =>
      c.querySelector(':scope > .inv-ready'),
    );

  it('is on the cell of each gun in a ready set, hidden, and never in a slot', () => {
    const m = mount(camp());
    const keys = cells(m).map((c) => c.querySelector<HTMLElement>('.inv-slot')!.dataset.key);
    expect(keys.sort()).toEqual(['stash:a', 'stash:b', 'stash:c']);
    for (const c of cells(m)) {
      expect(c.querySelector(':scope > .inv-ready')!.getAttribute('aria-hidden')).toBe('true');
      expect(c.querySelector('.inv-slot')!.getAttribute('aria-label')).toMatch(/can combine$/);
    }
    expect(m.scrim.querySelector('.inv-slot .inv-ready')).toBeNull();
  });

  it('rings the slot and draws three chevrons in a column, pointing up (ID-261)', () => {
    const m = mount(camp());
    for (const c of cells(m)) {
      expect(c.querySelector<HTMLElement>('.inv-slot')!.dataset.ready).toBe('true');
      const lines = [...c.querySelectorAll('.inv-ready polyline.inv-ready-line')];
      expect(lines).toHaveLength(3);
      expect(c.querySelectorAll('.inv-ready polyline.inv-ready-edge')).toHaveLength(3);
      // The same x for each, one under the other, the tip on top.
      const pts = lines.map((l) =>
        l
          .getAttribute('points')!
          .split(' ')
          .map((p) => p.split(',').map(Number)),
      );
      for (const p of pts) {
        expect(p.map(([x]) => x)).toEqual([1.5, 5, 8.5]);
        expect(p[1]![1]).toBeLessThan(p[0]![1]!);
        expect(p[2]![1]).toBe(p[0]![1]);
      }
      expect(pts.map((p) => p[1]![1])).toEqual([3, 10, 17]);
    }
    const plain = m.slot('squad:recruit-1');
    expect(plain.dataset.ready).toBeUndefined();
  });

  it('is on no held, bench or patrol slot', () => {
    const m = mount(camp());
    m.tab('bench').click();
    for (const k of ['squad:recruit-1', 'bench:recruit-2', 'patrol:recruit-4']) {
      expect(m.slot(k).closest('.inv-cell')!.querySelector('.inv-ready')).toBeNull();
    }
  });

  it('is not shown in a fight', () => {
    expect(cells(mount(camp(), false))).toHaveLength(0);
  });

  it('a set below the combine count has none', () => {
    const g = camp();
    const m = mount({ ...g, armoury: g.armoury.slice(0, COMBINE_COUNT - 1) });
    expect(cells(m)).toHaveLength(0);
  });
});

describe('the icon key (ID-253)', () => {
  const toggle = (m: ReturnType<typeof mount>) => m.q<HTMLButtonElement>('.inv-key-toggle');
  const key = (m: ReturnType<typeof mount>) => m.q('#inv-key');

  it('a button after the Squad heading: text label, closed by default, controls the key', () => {
    const m = mount(camp());
    const b = toggle(m);
    expect(b.closest('.inv-squad-head')!.querySelector('h3')!.textContent).toBe('Squad');
    expect(b.textContent).toBe('ⓘ');
    expect(b.getAttribute('aria-label')).toBe(ICON_KEY_LABEL);
    expect(b.title).toBe(ICON_KEY_LABEL);
    expect(b.getAttribute('aria-controls')).toBe('inv-key');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(key(m).hidden).toBe(true);
  });

  it('click toggles it, puts focus back, and the open state survives a redraw and a tab switch', () => {
    const m = mount(camp());
    toggle(m).click();
    expect(key(m).hidden).toBe(false);
    expect(toggle(m).getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle(m));
    m.refresh();
    expect(key(m).hidden).toBe(false);
    m.tab('bench').click();
    expect(key(m).hidden).toBe(false);
    m.tab('stash').click();
    toggle(m).click();
    expect(key(m).hidden).toBe(true);
    expect(toggle(m).getAttribute('aria-expanded')).toBe('false');
  });

  it('is there with the Stash alone (no Bench tab)', () => {
    const g = newGame('horde');
    const m = mount({ ...g, roster: [recruit(1)], armoury: [gun('a', 'rifle', 'common')] });
    expect(m.scrim.querySelector('.inv-tab')).toBeNull();
    expect(toggle(m)).not.toBeNull();
  });

  it('its lines are ICON_KEY; each sample is hidden, so a line reads once, with decorative badges', () => {
    const m = mount(camp());
    const lines = [...key(m).querySelectorAll('.inv-key-line')];
    expect(lines.map((l) => l.querySelector('.inv-key-text')!.textContent)).toEqual([...ICON_KEY]);
    for (const l of lines) {
      expect(l.querySelector('.inv-key-sample')!.getAttribute('aria-hidden')).toBe('true');
    }
    const badges = [...key(m).querySelectorAll('.class-badge')];
    expect(badges).toHaveLength(4);
    for (const b of badges) {
      expect(b.hasAttribute('role')).toBe(false);
      expect(b.getAttribute('aria-hidden')).toBe('true');
    }
    const shapes = badges.map((b) => b.querySelector('polygon')!.getAttribute('points'));
    expect(shapes).toEqual(
      ['light', 'medium', 'heavy', 'spread'].map((c) => CLASS_SHAPE[c as 'light'].split('|')[0]),
    );
    expect(key(m).querySelector('.inv-ready')).not.toBeNull();
  });

  it('says the numbers from the data', () => {
    expect(ICON_KEY.join('\n')).toContain(`+${GUN_UPGRADE.max}`);
    expect(ICON_KEY.join('\n')).toContain(`${COMBINE_COUNT} alike`);
  });
});
