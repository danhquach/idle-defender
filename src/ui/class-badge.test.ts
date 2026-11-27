// @vitest-environment jsdom
// ID-254: the gun class badge. One look (CLASS_SHAPE polygons, the class's colour, the plate) on
// every surface that shows a class; the Roster card's tile carries one badge of the held gun's
// class, and its label says the class in words. Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { GUN_CLASSES, type GunClass, type WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { equipGun } from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import type { MapPatrol } from '../core/scout.ts';
import { classOf } from '../core/traits.ts';
import { classBadge, classChip, CLASS_SHAPE } from './classicon.ts';
import { createHud, hordePicker, squadStart } from './hud.ts';
import { facts, inventoryView, slotFace } from './inventory.ts';
import { createMenu } from './menu.ts';
import { createRoster, rosterTiles, type RosterOptions } from './squadroster.ts';
import { CLASS_LINES, className, TRAIT_ROWS } from './statlines.ts';

const NOW = 1_800_000_000_000;
const noop = (): void => {};
const gun = (uid: string, base: WeaponId): OwnedWeapon => ({
  uid,
  base,
  rarity: 'military',
  affixes: [],
});

function camp(
  squad: RosterDefender[],
  armoury: OwnedWeapon[] = [],
  bench: RosterDefender[] = [],
): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 4,
    roster: squad,
    reserve: bench,
    armoury,
    camp: { ...g.camp, recruits: squad.length + bench.length },
  } as GameState;
}

function mount(game: GameState) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const opts: RosterOptions = {
    state: () => ({ game: g, fight: null, canGear: true, resumes: false }),
    onEquip: (id: string, choice: string) => {
      const r = equipGun(g, id, choice);
      if (!r.ok) return r;
      g = r.game;
      roster.refresh();
      return { ok: true as const };
    },
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => ({ ok: true, moves: [] }),
    onBestSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
  };
  const roster = createRoster(root, opts);
  roster.open();
  const scrim = document.querySelector<HTMLElement>('.camp-scrim')!;
  return {
    scrim,
    tab: (id: string) => scrim.querySelector<HTMLElement>(`.rv-tab[data-defender="${id}"]`)!,
    key: (k: string) => scrim.querySelector<HTMLElement>(`[data-key="${k}"]`)!,
    set: (next: GameState) => {
      g = next;
      roster.refresh();
    },
    game: () => g,
  };
}

const armed = (n: number, base: WeaponId): RosterDefender => {
  const d = recruit(n);
  return {
    ...d,
    loadout: { ...d.loadout, primary: rollWeapon(createRng(n), `w${n}`, base, 'military', 1) },
  };
};

/** The class a badge element says, from its class-badge-<cls> class. */
const classOfBadge = (b: Element): GunClass => {
  const found = GUN_CLASSES.filter((c) => b.classList.contains(`class-badge-${c}`));
  expect(found, b.className).toHaveLength(1);
  return found[0]!;
};

const sniperItem = () =>
  inventoryView({ ...newGame('horde'), armoury: [gun('a', 'sniper')] } as GameState).stash[0]!;

/** Every surface that shows a class: the badges it renders and the classes it should show. */
const SURFACES: [string, () => { badges: Element[]; expected: GunClass[] }][] = [
  [
    'Roster tile',
    () => {
      const m = mount(camp([armed(1, 'rifle'), recruit(2)]));
      return {
        badges: [...m.scrim.querySelectorAll('.rv-tab .class-badge')],
        expected: ['medium', 'light'],
      };
    },
  ],
  [
    'Roster gun slot chip',
    () => {
      const m = mount(camp([armed(1, 'shotgun')]));
      return {
        badges: [...m.key('slot').querySelectorAll('.class-chip .class-badge')],
        expected: ['spread'],
      };
    },
  ],
  [
    'Roster gun picker tile',
    () => {
      const m = mount(camp([recruit(1)], [gun('r', 'rifle'), gun('s', 'shotgun')]));
      m.key('slot').click();
      return {
        badges: [...m.scrim.querySelectorAll('.rv-tile .rv-dps .class-badge')],
        expected: ['medium', 'spread'],
      };
    },
  ],
  [
    'gun picker compare Class row',
    () => {
      const m = mount(camp([recruit(1)], [gun('r', 'rifle')]));
      m.key('slot').click();
      m.scrim.querySelector<HTMLElement>('.rv-tile')!.click();
      const row = [...m.scrim.querySelectorAll('.rv-ctab tbody tr')].find(
        (tr) => tr.querySelector('th')!.textContent === 'Class',
      )!;
      return { badges: [...row.querySelectorAll('.class-badge')], expected: ['light', 'medium'] };
    },
  ],
  [
    'Weapons slot, ghost and bench picker (slotFace)',
    () => ({
      badges: slotFace(sniperItem()).filter((e) => e.classList.contains('class-badge')),
      expected: ['heavy'],
    }),
  ],
  [
    'Weapons details class line',
    () => ({
      badges: facts(sniperItem()).flatMap((e) => [...e.querySelectorAll('.class-badge')]),
      expected: ['heavy'],
    }),
  ],
  [
    'Help class lines and trait table',
    () => {
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      createMenu(root, {
        state: () => ({ game: newGame(), fighting: false, held: false }),
        onLoad: noop,
        onNewCamp: noop,
        reduceMotion: false,
        onReduceMotion: noop,
        sound: { volumes: { master: 80, music: 60, effects: 80 }, muted: false },
        onVolume: noop,
        onVolumeSet: noop,
        onMute: noop,
        chatter: 'full',
        onChatter: noop,
      });
      const help = document.querySelector('#menu-panel-help')!;
      return {
        badges: [...help.querySelectorAll('.class-badge')],
        expected: [
          ...CLASS_LINES.map((l) => l.cls),
          ...TRAIT_ROWS.flatMap((r) => [r.resistsClass, r.weakClass]),
        ],
      };
    },
  ],
  [
    'horde picker trait chip',
    () => {
      const g = newGame('horde');
      const hell = {
        ...g,
        mode: 'hell',
        modes: { nightmare: 51, hell: 1 },
        hordeNumber: 51,
        roster: [recruit(1), recruit(2)],
        camp: { ...g.camp, recruits: 2 },
      } as GameState;
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
      h.showResult(squadStart(hell));
      return {
        badges: [...root.querySelectorAll('.hud-trait .class-badge')],
        expected: hordePicker(hell).options[0]!.traits!.flatMap((c) => [c.resists, c.weak]),
      };
    },
  ],
];

describe('one class badge on every surface (ID-254)', () => {
  it.each(SURFACES)('%s: the badge is the class’s shape, once per class shown', (_n, build) => {
    const { badges, expected } = build();
    expect(expected.length).toBeGreaterThan(0);
    expect(badges.map(classOfBadge).sort()).toEqual([...expected].sort());
    for (const b of badges) {
      expect(b.classList.contains('class-badge')).toBe(true);
      const cls = classOfBadge(b);
      const polys = [...b.querySelectorAll('svg.class-icon polygon')];
      expect(polys.map((p) => p.getAttribute('points'))).toEqual(CLASS_SHAPE[cls].split('|'));
    }
  });
});

describe('classBadge (ID-254)', () => {
  it('is decorative by default and a named image with a title when labelled', () => {
    for (const c of GUN_CLASSES) {
      const plain = classBadge(c);
      expect(plain.className).toBe(`class-badge class-badge-${c}`);
      expect(plain.getAttribute('aria-hidden')).toBe('true');
      expect(plain.getAttribute('role')).toBeNull();
      expect(plain.textContent).toBe('');
      const named = classBadge(c, { label: true });
      expect(named.getAttribute('role')).toBe('img');
      expect(named.getAttribute('aria-label')).toBe(className(c));
      expect(named.title).toBe(className(c));
      expect(named.hasAttribute('aria-hidden')).toBe(false);
    }
    const long = classBadge('heavy', { label: true, title: 'Heavy · Good vs Brutes' });
    expect(long.title).toBe('Heavy · Good vs Brutes');
    expect(long.getAttribute('aria-label')).toBe('Heavy');
  });

  it('classChip is the badge plus the name as text, with no icon-only mode', () => {
    for (const c of GUN_CLASSES) {
      const chip = classChip(c, 'the line');
      expect(chip.querySelectorAll('.class-badge')).toHaveLength(1);
      expect(chip.textContent).toBe(className(c));
      expect(chip.title).toBe('the line');
      expect(chip.className).not.toContain('class-chip-icon');
    }
    expect(classChip('light').hasAttribute('title')).toBe(false);
    expect(classChip.length).toBeLessThanOrEqual(2);
  });

  it('a slot with no class has no badge; one with a class has exactly one', () => {
    const it = sniperItem();
    expect(slotFace(it).filter((e) => e.classList.contains('class-badge'))).toHaveLength(1);
    const none = { ...it, cls: null, classLine: null };
    expect(slotFace(none).some((e) => e.classList.contains('class-badge'))).toBe(false);
    expect(facts(none).some((e) => e.classList.contains('inv-class'))).toBe(false);
  });
});

describe('the Roster card’s class badge (ID-254)', () => {
  it('each tab has one badge of the held gun’s class, in the gun tile, not in the DPS column', () => {
    const g = camp([armed(1, 'rifle'), armed(2, 'shotgun'), recruit(3)], [], [armed(4, 'sniper')]);
    const m = mount(g);
    const tiles = rosterTiles(g, NOW, null);
    for (const t of tiles) {
      const tab = m.tab(t.id);
      const badges = tab.querySelectorAll('.class-badge');
      expect(badges).toHaveLength(1);
      expect(classOfBadge(badges[0]!)).toBe(t.cls);
      expect(badges[0]!.parentElement!.classList.contains('rv-tab-gun')).toBe(true);
      expect(badges[0]!.closest('.rv-tab-stat')).toBeNull();
      expect(badges[0]!.getAttribute('aria-hidden')).toBe('true');
    }
    expect(tiles.map((t) => t.cls)).toEqual(['medium', 'spread', 'light', 'heavy']);
  });

  it('the label and title say the class, between the gun and the DPS, exactly', () => {
    const g = camp([armed(1, 'rifle'), recruit(2)]);
    const m = mount(g);
    const [a, b] = rosterTiles(g, NOW, null);
    expect(m.tab('recruit-1').getAttribute('aria-label')).toContain(
      `, ${a!.gunFull}, class Medium, ${a!.dps} DPS`,
    );
    // The gunless survivor holds the free pistol: Light.
    expect(m.tab('recruit-2').getAttribute('aria-label')).toContain(
      `, ${b!.gunFull}, class Light, ${b!.dps} DPS`,
    );
    expect(m.tab('recruit-2').title).toBe(m.tab('recruit-2').getAttribute('aria-label'));
  });

  it('injured, patrol and bench cards carry exactly one badge', () => {
    const hurt = { ...armed(2, 'sniper'), rest: 2 };
    const away = armed(3, 'shotgun');
    const g = camp([armed(1, 'rifle')], [], [hurt, away, armed(4, 'rifle')]);
    const patrol = {
      no: 1,
      area: 'police',
      danger: 'safe',
      members: ['recruit-3'],
      sentAt: NOW,
      backAt: NOW + 60_000,
      seed: 1,
      best: 1,
      power: 1,
    } as unknown as MapPatrol;
    const withPatrol = {
      ...g,
      map: { seed: 0, drawn: 0, areas: [], patrols: [patrol], sent: 1 },
    } as GameState;
    const m = mount(withPatrol);
    expect(m.tab('recruit-2').classList.contains('rv-tab-hurt')).toBe(true);
    expect(m.tab('recruit-3').classList.contains('rv-tab-away')).toBe(true);
    for (const id of ['recruit-1', 'recruit-2', 'recruit-3', 'recruit-4']) {
      expect(m.tab(id).querySelectorAll('.class-badge'), id).toHaveLength(1);
    }
  });

  it('after a gun swap the tile has one badge, of the new class (no stacking)', () => {
    const g = camp([recruit(1)], [gun('s', 'shotgun'), gun('k', 'sniper')]);
    const m = mount(g);
    for (const [uid, cls] of [
      ['s', 'spread'],
      ['k', 'heavy'],
    ] as const) {
      const r = equipGun(m.game(), 'recruit-1', uid);
      if (!r.ok) throw new Error(r.code);
      m.set(r.game);
      const badges = m.tab('recruit-1').querySelectorAll('.class-badge');
      expect(badges).toHaveLength(1);
      expect(classOfBadge(badges[0]!)).toBe(cls);
      expect(classOf(r.game.roster[0]!.loadout.primary)).toBe(cls);
    }
  });

  it('every class has its badge on a card', () => {
    const bases: [WeaponId, GunClass][] = [
      ['pistol', 'light'],
      ['rifle', 'medium'],
      ['sniper', 'heavy'],
      ['shotgun', 'spread'],
    ];
    const m = mount(
      camp(bases.map(([b], i) => (b === 'pistol' ? recruit(i + 1) : armed(i + 1, b)))),
    );
    bases.forEach(([, cls], i) =>
      expect(classOfBadge(m.tab(`recruit-${i + 1}`).querySelector('.class-badge')!)).toBe(cls),
    );
  });
});
