// @vitest-environment jsdom
// ID-180: every Roster card (squad and bench) shows the gun its survivor holds: the icon on
// its rarity tint and their DPS with it (the gun slot's figure, ID-152), no tab portrait.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { bestGuns, bestSquad, equipGun, squadSpec, startSquadHorde } from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import { survivorDps } from '../core/stats.ts';
import { ART_URLS, GUN_ICON } from './sprites.ts';
import type { HordeState } from '../core/horde.ts';
import { createRoster, rosterTiles, type RosterOptions } from './squadroster.ts';

const NOW = 1_800_000_000_000;

const relic = (): OwnedWeapon => ({
  ...rollWeapon(createRng(1), 'h3', 'rifle', 'relic'),
  level: 3,
});

function camp(squad: RosterDefender[], bench: RosterDefender[] = [], armoury: OwnedWeapon[] = []) {
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

const armed = (n: number, gun: OwnedWeapon): RosterDefender => {
  const d = recruit(n);
  return { ...d, loadout: { ...d.loadout, primary: gun } };
};

function mount(game: GameState, canGear = true, fight: HordeState | null = null) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const opts: RosterOptions = {
    state: () => ({ game: g, fight, canGear, resumes: false }),
    onEquip: vi.fn((id: string, choice: string) => {
      const r = equipGun(g, id, choice);
      if (!r.ok) return r;
      g = r.game;
      roster.refresh();
      return { ok: true as const };
    }),
    onToggleSquad: () => ({ ok: true }),
    onLetGo: () => null,
    onCombine: () => null,
    onBestGuns: () => {
      const r = bestGuns(g);
      g = r.game;
      roster.refresh();
      return { ok: true as const, moves: r.moves };
    },
    onBestSquad: () => {
      const r = bestSquad(g);
      g = r.game;
      roster.refresh();
      return { ok: true as const, moves: r.moves };
    },
    onAutoSquad: () => ({ ok: true, moves: { in: [], out: [] } }),
  };
  const roster = createRoster(root, opts);
  roster.open();
  const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
  const tab = (id: string) => scrim.querySelector<HTMLElement>(`.rv-tab[data-defender="${id}"]`)!;
  return {
    scrim,
    tab,
    set: (next: GameState) => {
      g = next;
      roster.refresh();
    },
    game: () => g,
    click: (sel: string) => scrim.querySelector<HTMLButtonElement>(sel)!.click(),
  };
}

describe('rosterTiles gun fields (ID-180)', () => {
  it('a Lv 3 Relic Carbine and the free pistol', () => {
    const gun = relic();
    const g = camp([armed(1, gun), recruit(2)]);
    const [a, b] = rosterTiles(g, NOW, null);
    expect(a!.gunFull).toMatch(/^Lv 3 Relic Carbine$/);
    expect(a!.rarity).toBe('relic');
    expect(a!.gunIcon).toBe(GUN_ICON.rifle);
    expect(a!.dps).toBe(survivorDps(squadSpec(g.roster[0]!), gun).toFixed(1));
    expect(a!.gun).toBe('Relic Carbine');
    expect(b!.gunFull).toBe('Pistol');
    expect(b!.rarity).toBe('common');
    expect(b!.gunIcon).toBe(GUN_ICON.pistol);
    expect(b!.dps).toBe(survivorDps(squadSpec(g.roster[1]!), 'pistol').toFixed(1));
  });

  it('a Mechanic’s card says "Mech" and a Teacher’s "Teach"', () => {
    const g = camp([
      { ...recruit(1), job: 'mechanic' },
      { ...recruit(2), job: 'teacher' },
    ]);
    const m = mount(g);
    const job = (id: string) => m.tab(id).querySelector('.rv-tab-job')!.textContent;
    expect(job('recruit-1')).toBe('Mech');
    expect(job('recruit-2')).toBe('Teach');
  });
});

describe('the Roster cards show the held gun (ID-180)', () => {
  it('every squad and bench tab has the gun on its rarity tint, the DPS, no portrait', () => {
    const g = camp([armed(1, relic()), recruit(2)], [recruit(3), armed(4, relic())]);
    const m = mount(g);
    const tabs = [...m.scrim.querySelectorAll<HTMLElement>('.rv-tab')];
    expect(tabs).toHaveLength(4);
    for (const t of tabs) {
      const gun = t.querySelector<HTMLElement>('.rv-tab-gun[data-rarity]')!;
      expect(gun).not.toBeNull();
      expect(t.querySelector('.rv-tab-dps')?.textContent).toMatch(/^\d+\.\d$/);
      expect(t.querySelector('.roster-avatar')).toBeNull();
      expect(gun.querySelector('img')?.alt).toBe('');
    }
    expect(m.tab('recruit-1').querySelector<HTMLElement>('.rv-tab-gun')!.dataset.rarity).toBe(
      'relic',
    );
    expect(m.tab('recruit-2').querySelector<HTMLElement>('.rv-tab-gun')!.dataset.rarity).toBe(
      'common',
    );
    const pistol = m.tab('recruit-2').querySelector('.rv-tab-gun img')!;
    expect(pistol.getAttribute('src')).toBe(ART_URLS[GUN_ICON.pistol]);
    // The bench's cards are cards too.
    expect(m.tab('recruit-4').querySelector('.rv-tab-gun')).not.toBeNull();
  });

  it('the tab DPS is the figure on the survivor’s gun slot, and the label ends with it', () => {
    const g = camp([armed(1, relic()), recruit(2)]);
    const m = mount(g);
    for (const id of ['recruit-1', 'recruit-2']) {
      m.click(`.rv-tab[data-defender="${id}"]`);
      const slot = m.scrim.querySelector('[data-key="slot"]')!;
      const dps = m.tab(id).querySelector('.rv-tab-dps')!.textContent!;
      expect(slot.getAttribute('aria-label')).toContain(`${dps} `);
      const tile = rosterTiles(m.game(), NOW, null).find((t) => t.id === id)!;
      const label = m.tab(id).getAttribute('aria-label')!;
      expect(label.endsWith(`${tile.gunFull}, ${dps} DPS`)).toBe(true);
      expect(m.tab(id).title).toBe(label);
    }
  });

  it('a resting survivor keeps the rest text and the gun in the label', () => {
    const rest = { ...recruit(3), rest: 2 };
    const g = camp([recruit(1)], [rest]);
    const m = mount(g);
    const label = m.tab('recruit-3').getAttribute('aria-label')!;
    expect(label).toContain('Resting: 2 hordes, Pistol, ');
    expect(label.endsWith(' DPS')).toBe(true);
    expect(m.tab('recruit-3').querySelector('.rv-tab-job')!.textContent).toBe('Rest 2');
  });

  it('updates at once after Equip, Best gun for everyone and an outside change', () => {
    const gun = relic();
    const g = camp([recruit(1), recruit(2)], [], [gun]);
    const m = mount(g);
    const gunOf = (id: string) => m.tab(id).querySelector<HTMLElement>('.rv-tab-gun')!;
    const state = (id: string) => ({
      rarity: gunOf(id).dataset.rarity,
      src: gunOf(id).querySelector('img')!.getAttribute('src'),
      dps: m.tab(id).querySelector('.rv-tab-dps')!.textContent,
      label: m.tab(id).getAttribute('aria-label'),
    });
    const before = state('recruit-1');
    expect(before.rarity).toBe('common');

    // Equip (the app's onEquip changes the camp, then the Roster redraws).
    const equipped = equipGun(m.game(), 'recruit-1', gun.uid);
    if (!equipped.ok) throw new Error(equipped.reason);
    m.set(equipped.game);
    const after = state('recruit-1');
    expect(after.rarity).toBe('relic');
    expect(after.src).toBe(ART_URLS[GUN_ICON.rifle]);
    expect(after.dps).not.toBe(before.dps);
    expect(after.label).toContain('Lv 3 Relic Carbine');
    expect(after.label!.endsWith(`${after.dps} DPS`)).toBe(true);

    // An outside change plus refresh(): the gun goes back to the stash (pistol).
    const back = equipGun(m.game(), 'recruit-1', 'pistol');
    if (!back.ok) throw new Error(back.reason);
    m.set(back.game);
    expect(state('recruit-1')).toEqual(before);

    // Best gun for everyone: someone takes the Relic, at once.
    m.click('.rv-best');
    const holder = m.game().roster.find((d) => d.loadout.primary !== 'pistol')!;
    expect(holder).toBeDefined();
    expect(state(holder.id).rarity).toBe('relic');
    expect(state(holder.id).label).toContain('Relic Carbine');
  });

  it('after Best squad the cards show the new squad’s guns and DPS at once', () => {
    // Seven survivors: the Relic holder starts on the bench, so Best squad brings them in.
    const squad = [1, 2, 3, 4, 5, 6].map((n) => recruit(n));
    const holder = armed(7, relic());
    const g = camp(squad, [holder]);
    const m = mount(g);
    expect(m.tab('recruit-7').closest('.rv-bench')).not.toBeNull();
    m.click('.rv-best-squad');
    const now = m.game();
    expect(now.roster.some((d) => d.id === 'recruit-7')).toBe(true);
    const tab = m.tab('recruit-7');
    expect(tab.closest('.rv-bench')).toBeNull();
    expect(tab.querySelector<HTMLElement>('.rv-tab-gun')!.dataset.rarity).toBe('relic');
    const tile = rosterTiles(now, NOW, null).find((t) => t.id === 'recruit-7')!;
    expect(tab.querySelector('.rv-tab-dps')!.textContent).toBe(tile.dps);
    expect(tab.getAttribute('aria-label')!.endsWith(`${tile.gunFull}, ${tile.dps} DPS`)).toBe(true);
    // Whoever left the squad is a bench card now, still with their gun and DPS.
    const out = [...m.scrim.querySelectorAll<HTMLElement>('.rv-bench .rv-tab')];
    expect(out).toHaveLength(1);
    expect(out[0]!.querySelector('.rv-tab-gun[data-rarity]')).not.toBeNull();
    expect(out[0]!.querySelector('.rv-tab-dps')?.textContent).toMatch(/^\d+\.\d$/);
  });

  it('in a fight (read-only) a downed survivor’s card still shows gun and DPS; gear is locked', () => {
    const g = camp([armed(1, relic()), recruit(2)], [recruit(3)]);
    const s = startSquadHorde(g, 7, NOW);
    const [a, b] = s.defenders;
    const fight: HordeState = {
      ...s,
      defenders: [{ ...a!, hp: 41.2 }],
      injured: [{ defender: b!, postId: b!.postId, at: 3, offered: true, by: null }],
    };
    const m = mount(g, false, fight);
    const down = m.tab('recruit-2');
    expect(down.classList.contains('rv-tab-down')).toBe(true);
    expect(down.getAttribute('aria-label')).toContain('Down');
    for (const t of m.scrim.querySelectorAll<HTMLElement>('.rv-tab')) {
      expect(t.querySelector('.rv-tab-gun[data-rarity]')).not.toBeNull();
      expect(t.querySelector('.rv-tab-dps')?.textContent).toMatch(/^\d+\.\d$/);
    }
    expect(m.tab('recruit-1').classList.contains('rv-tab-down')).toBe(false);
    // Gear can't change in a fight.
    expect(m.scrim.querySelector<HTMLButtonElement>('.rv-best')!.disabled).toBe(true);
    expect(m.scrim.querySelector('[data-key="slot"]')!.getAttribute('aria-disabled')).toBe('true');
  });
});
