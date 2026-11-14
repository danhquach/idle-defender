// @vitest-environment jsdom
// ID-086, ID-108, ID-146: the Roster: a top-bar button opens one dialog: squad tabs, the
// selected survivor with their gun slot, and one panel, their level and what it gives or
// Choose a gun (tiles, a comparison with the gun held, one Equip). No stat points anywhere.
// Keyboard and touch alike.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { DEFENDER_HP, STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import { bestGuns, equipGun, squadSpec, startSquadHorde } from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import { maxHpOf, survivorDps, xpForLevel } from '../core/stats.ts';
import { GUNS_WAIT } from './inventory.ts';
import { ART_URLS, avatarOf, GUNNER_LOOKS, lookOf } from './sprites.ts';
import { LEVEL_ONE_TEXT, levelText } from './statlines.ts';
import { createRoster, rosterTiles, type RosterOptions } from './squadroster.ts';

const NOW = 1_800_000_000_000;
/** Survivor `n` at `level`. */
const at = (n: number, level: number): RosterDefender => ({
  ...recruit(n),
  xp: xpForLevel(level),
});
const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});

function camp(roster: RosterDefender[], armoury: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return { ...g, hordeNumber: 3, roster, armoury, camp: { ...g.camp, recruits: roster.length } };
}

describe('the Roster tabs (ID-086)', () => {
  it('lists every survivor with avatar, name, level, full HP and gun', () => {
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const ivan = {
      ...at(1, 7),
      loadout: { ...recruit(1).loadout, primary: relic },
    };
    const tiles = rosterTiles(camp([ivan, at(2, 1)]), NOW, null);
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({
      id: 'recruit-1',
      name: ivan.name,
      level: 7,
      health: `HP ${maxHpOf(ivan)}/${maxHpOf(ivan)}`,
      down: false,
      gun: 'Relic Carbine',
      rarity: 'relic',
    });
    expect(tiles[0]).not.toHaveProperty('points');
    expect(tiles[1]).toMatchObject({ level: 1, gun: 'Pistol', rarity: 'common' });
    expect(tiles[1]!.health).toBe(`HP ${DEFENDER_HP}/${DEFENDER_HP}`);
  });

  it('the avatar is the survivor’s own look holding their gun, as in the fight (ID-074)', () => {
    for (let n = 1; n <= 4; n++) {
      const d = at(n, 1);
      expect(avatarOf(d)).toBe(GUNNER_LOOKS[lookOf(d.id)]!.pistol.idle);
      expect(ART_URLS[avatarOf(d)]).toBeTruthy();
    }
    expect(new Set([1, 2, 3, 4].map((n) => avatarOf(at(n, 1)))).size).toBe(4);
  });

  it('in a fight: the fight’s HP, and "Down" for one injured in it', () => {
    const game = camp([at(1, 2), at(2, 2)]);
    const s = startSquadHorde(game, 7, NOW);
    const [a, b] = s.defenders;
    const fight = {
      ...s,
      defenders: [{ ...a!, hp: 41.2 }],
      injured: [{ defender: b!, postId: b!.postId, at: 3, offered: true, by: null }],
    };
    const tiles = rosterTiles(game, NOW, fight);
    expect(tiles[0]).toMatchObject({ health: `HP 42/${a!.maxHp}`, down: false });
    expect(tiles[1]).toMatchObject({ health: 'Down', down: true });
  });

  it('between hordes, one still resting (an older camp save) is "Injured"', () => {
    const d = { ...at(1, 1), injuredUntil: NOW + 60_000 };
    expect(rosterTiles(camp([d]), NOW, null)[0]).toMatchObject({ health: 'Injured', down: true });
    expect(rosterTiles(camp([d]), NOW + 60_000, null)[0]!.down).toBe(false);
  });
});

/** The Roster mounted over `game`; equipping and the best-guns call work on it as the app does. */
function mount(game: GameState, over: { canGear?: boolean } = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const canGear = over.canGear ?? true;
  const onEquip = vi.fn((id: string, choice: string) => {
    const r = equipGun(g, id, choice);
    if (!r.ok) return r;
    g = r.game;
    roster.refresh();
    return { ok: true as const };
  });
  const onBestGuns = vi.fn(() => {
    const r = bestGuns(g);
    g = r.game;
    roster.refresh();
    return { ok: true as const, moves: r.moves };
  });
  const opts: RosterOptions = {
    state: () => ({ game: g, fight: null, canGear, resumes: false }),
    onEquip,
    onBestGuns,
  };
  const roster = createRoster(root, opts);
  const scrim = document.querySelector<HTMLElement>('.roster-scrim')!;
  const press = (key: string, shiftKey = false) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }),
    );
  const q = <T extends HTMLElement = HTMLButtonElement>(sel: string): T =>
    scrim.querySelector<T>(sel)!;
  const key = (k: string) => q(`[data-key="${k}"]`);
  return {
    root,
    roster,
    scrim,
    onEquip,
    onBestGuns,
    press,
    q,
    key,
    game: () => g,
    set: (next: GameState) => {
      g = next;
      roster.refresh();
    },
    button: root.querySelector<HTMLButtonElement>('.roster-button')!,
    status: () => q<HTMLElement>('.rv-status').textContent,
  };
}

describe('the Roster button and tabs (ID-108)', () => {
  it('the button has no points badge and opens on the first survivor; every survivor is a tab', () => {
    const m = mount(camp([at(1, 1), at(2, 4), at(3, 2)]));
    expect(m.button.querySelector('.roster-dot')).toBeNull();
    expect(m.button.textContent).toBe('Roster');
    m.button.click();
    expect(m.scrim.hidden).toBe(false);
    expect(m.root.hasAttribute('inert')).toBe(true);
    const tabs = [...m.scrim.querySelectorAll<HTMLButtonElement>('.rv-tab')];
    expect(tabs).toHaveLength(3);
    expect(tabs.some((t) => t.hasAttribute('aria-pressed'))).toBe(false);
    expect(tabs[0]!.getAttribute('aria-current')).toBe('true');
    expect(tabs[1]!.hasAttribute('aria-current')).toBe(false);
    expect(m.scrim.querySelector('.rv-badge')).toBeNull();
    expect(tabs[1]!.getAttribute('aria-label')).not.toContain('to spend');
    // The fight info stays compact: HP in the tab’s label and on the survivor row.
    expect(tabs[1]!.getAttribute('aria-label')).toContain('HP ');
    expect(m.q('.rv-who-name').textContent).toBe(recruit(1).name);
    expect(tabs[0]!.querySelector('img')!.alt).toBe('');
    expect(document.activeElement).toBe(tabs[0]);
  });

  it('a tab opens that survivor; a name on the squad screen opens them by id', () => {
    const m = mount(camp([at(1, 4), at(2, 1)]));
    m.roster.open('recruit-2');
    expect(m.q('.rv-who-name').textContent).toBe(recruit(2).name);
    m.q('.rv-tab[data-defender="recruit-1"]').click();
    expect(m.q('.rv-who-name').textContent).toBe(recruit(1).name);
    expect(document.activeElement).toBe(m.key('tab:recruit-1'));
  });

  it('an unknown id opens the first survivor, nothing else', () => {
    const m = mount(camp([at(1, 4)]));
    for (const id of ['nobody', '__proto__', 'constructor']) {
      m.roster.open(id);
      expect(m.scrim.querySelectorAll('.rv-tab')).toHaveLength(1);
      expect(m.q('.rv-who-name').textContent).toBe(recruit(1).name);
    }
  });

  it('a hostile name from a save stays text everywhere (no HTML sink)', () => {
    const name = '<img src=x onerror=alert(1)>‮evil';
    const m = mount(camp([{ ...at(1, 4), name }], [gun('h1', 'rifle', 'military')]));
    m.roster.open();
    expect(m.q('.rv-tab-name').textContent).toBe(name);
    expect(m.q('.rv-tab').title.startsWith(`${name}, level`)).toBe(true);
    expect(m.q('.rv-tab').getAttribute('aria-label')!.startsWith(`${name}, level`)).toBe(true);
    expect(m.q('.rv-who-name').textContent).toBe(name);
    // The status line after Best gun: the name as text, nothing parsed.
    m.q('.rv-best').click();
    expect(m.status()).toBe(`Equipped: ${name} → Military Carbine`);
    expect(m.scrim.querySelector('.rv-status')!.children).toHaveLength(0);
    // The avatar and the gun icon: nothing the name made.
    expect(m.scrim.querySelectorAll('img').length).toBeLessThanOrEqual(3);
    expect(
      [...m.scrim.querySelectorAll('img')].every((i) => i.getAttribute('onerror') === null),
    ).toBe(true);
  });
});

describe('the level panel (ID-146)', () => {
  it('shows the survivor’s level and what it gives, in one line', () => {
    const m = mount(camp([at(1, 7)]));
    m.roster.open('recruit-1');
    expect(m.q('.rv-ttl').textContent).toBe('Level 7');
    expect(m.q('.rv-level').textContent).toBe(levelText(7));
    expect(m.q('.rv-level').textContent).toMatch(/^\+\d+\u00a0HP\u00a0· /);
    expect(m.q('.rv-left').textContent).toMatch(/^\d+\/175 XP$/);
  });

  it('a level 1 survivor has no bonus yet', () => {
    const m = mount(camp([at(1, 1)]));
    m.roster.open('recruit-1');
    expect(m.q('.rv-level').textContent).toBe(LEVEL_ONE_TEXT);
  });

  it('follows the survivor shown and the camp as it changes', () => {
    const m = mount(camp([at(1, 3), at(2, 9)]));
    m.roster.open('recruit-1');
    expect(m.q('.rv-level').textContent).toBe(levelText(3));
    m.q('.rv-tab[data-defender="recruit-2"]').click();
    expect(m.q('.rv-level').textContent).toBe(levelText(9));
    m.set(camp([at(1, 3), at(2, 12)]));
    expect(m.q('.rv-level').textContent).toBe(levelText(12));
  });

  it('has no stat button, points count, badge, Undo or Tinker row', () => {
    const m = mount(camp([at(1, 4), at(2, 2)]));
    m.roster.open('recruit-1');
    expect(
      m.scrim.querySelector('[data-key^="add:"], [data-key="undo"], .rv-sb, .rv-stat'),
    ).toBeNull();
    expect(m.scrim.querySelector('.rv-badge, .roster-dot, .roster-badge')).toBeNull();
    expect(m.scrim.textContent).not.toMatch(
      /stat point|to spend|Undo|Instinct|Agility|Sharp Mind|Tinker|Spend points/,
    );
    // The same in a fight, where guns are locked.
    const fight = mount(camp([at(1, 4)]), { canGear: false });
    fight.roster.open('recruit-1');
    expect(fight.scrim.querySelector('[data-key^="add:"], [data-key="undo"]')).toBeNull();
    expect(fight.scrim.textContent).not.toMatch(/stat point|to spend|Undo/);
  });
});

describe('closing (ID-126)', () => {
  it('closes plainly and gives the keyboard back to what opened it', () => {
    const m = mount(camp([at(1, 4)]));
    m.button.focus();
    m.button.click();
    m.press('Escape');
    expect(m.scrim.hidden).toBe(true);
    expect(m.root.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(m.button);
  });

  it('Tab stays inside, wrapping both ways', () => {
    const m = mount(camp([at(1, 4)]));
    m.button.focus();
    m.button.click();
    m.press('Tab', true);
    expect(m.scrim.contains(document.activeElement)).toBe(true);
    const buttons = [...m.scrim.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) => !b.disabled && !b.hidden,
    );
    buttons[0]!.focus();
    m.press('Tab', true);
    expect(document.activeElement).toBe(buttons.at(-1));
    m.press('Tab');
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('Choose a gun (ID-108)', () => {
  const smg = gun('s1', 'smg', 'rusty');
  const rifle = gun('r1', 'rifle', 'military');
  const shotgun = gun('g1', 'shotgun', 'common');

  function picker(roster = [at(1, 2)], stash = [smg, rifle, shotgun], over = {}) {
    const m = mount(camp(roster, stash), over);
    m.roster.open('recruit-1');
    return m;
  }
  const tiles = (m: ReturnType<typeof picker>) => [
    ...m.scrim.querySelectorAll<HTMLButtonElement>('.rv-tile'),
  ];

  it('the gun slot opens the picker: strongest first, the best upgrade preselected and compared', () => {
    const m = picker();
    const slot = m.key('slot');
    expect(slot.getAttribute('aria-expanded')).toBe('false');
    expect(slot.textContent).toContain('Pistol');
    slot.click();
    expect(m.key('slot').getAttribute('aria-expanded')).toBe('true');
    expect(m.q('.rv-ttl').textContent).toBe('Choose a gun');
    expect(m.q('.rv-left').textContent).toBe(`By dmg/s · stash 3/${STASH_CAP}`);
    const t = tiles(m);
    expect(t).toHaveLength(3);
    const dps = t.map((x) => Number(x.querySelector('.rv-dps')!.textContent));
    expect(dps).toEqual([...dps].sort((a, b) => b - a));
    // The best upgrade is selected, and its comparison is on screen at once.
    const sel = t.filter((x) => x.getAttribute('aria-pressed') === 'true');
    expect(sel).toHaveLength(1);
    expect(sel[0]!.dataset.choice).toBe(t[0]!.dataset.choice);
    expect(m.q('.rv-verdict').textContent).toMatch(/▲ Stronger: \+\d+\.\d dmg\/s \(\+\d+%\)Equip$/);
    expect(m.q('.rv-v-name').textContent).toContain(t[0]!.querySelector('.rv-ty')!.textContent);
    // Rarity frames and change badges: symbol and number.
    expect(sel[0]!.dataset.rarity).toBe(t[0]!.dataset.rarity);
    expect(t[0]!.querySelector('.rv-d')!.textContent).toMatch(/^▲ \+\d+\.\d$/);
    expect(t[0]!.querySelector('.rv-d')!.getAttribute('data-kind')).toBe('up');
    expect(t[0]!.getAttribute('aria-label')).toMatch(/dmg\/s, \d+\.\d more dmg\/s than Pistol$/);
    // Slot, then the way back.
    m.key('level').click();
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
    expect(document.activeElement).toBe(m.key('slot'));
  });

  it('tapping another tile swaps the comparison; Equip equips it and the picker closes', () => {
    const m = picker();
    m.key('slot').click();
    const other = tiles(m).find((x) => x.dataset.choice === 'g1')!;
    other.click();
    expect(m.q('.rv-v-name').textContent).toBe('Lv 1 Common Pump Shotgun');
    // The table: Now / New / Change, pellets shown.
    const heads = [...m.scrim.querySelectorAll('.rv-ctab thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['', 'Now: Pistol', 'New: Pump Shotgun', 'Change']);
    const rows = [...m.scrim.querySelectorAll('.rv-ctab tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows.map((r) => r[0])).toEqual([
      `${recruit(1).name}'s dmg/s`,
      'Damage',
      'Fire rate',
      'Reload',
      'Range',
      'Role',
    ]);
    expect(rows.find((r) => r[0] === 'Damage')![2]).toBe('7.0 × 6');
    expect(rows.find((r) => r[0] === 'Role')![3]).toBe('new role');
    m.key('equip').click();
    expect(m.onEquip).toHaveBeenCalledWith('recruit-1', 'g1');
    expect(m.game().roster[0]!.loadout.primary).toMatchObject({ uid: 'g1' });
    expect(m.status()).toBe(`${recruit(1).name} now holds Lv 1 Common Pump Shotgun.`);
    // Back on Stats with the new gun in the slot, the keyboard on it.
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
    expect(m.key('slot').textContent).toContain('Common Pump Shotgun');
    expect(document.activeElement).toBe(m.key('slot'));
  });

  it('phone fit (designer review): short tile names, an arrow cue, head types apart, verdict read out', () => {
    const m = picker([at(1, 2)], [gun('n1', 'sniper', 'common')]);
    // The slot keeps an arrow when its word hides on a phone.
    const chev = m.key('slot').querySelector('.rv-slot-chev')!;
    expect(chev.querySelector('.rv-slot-chev-word')!.textContent).toBe('Change ');
    expect(chev.textContent).toBe('Change ▾');
    m.key('slot').click();
    const sniper = tiles(m).find((x) => x.dataset.choice === 'n1')!;
    expect(sniper.querySelector('.rv-ty')!.textContent).toBe('Sniper');
    expect(sniper.getAttribute('aria-label')).toContain('Sniper rifle');
    // A Lv 1 sniper is no upgrade on the pistol, so nothing is preselected: pick it.
    sniper.click();
    const types = [...m.scrim.querySelectorAll('.rv-ctab thead .rv-th-type')].map(
      (s) => s.textContent,
    );
    expect(types).toEqual([': Pistol', ': Sniper rifle']);
    expect(m.q('.rv-v').getAttribute('aria-live')).toBe('polite');
  });

  it('the old gun goes back to the stash, and the status says so', () => {
    const m = picker([at(1, 2)], [rifle, smg]);
    m.key('slot').click();
    m.key('equip').click();
    m.key('slot').click();
    // The Rifle is held now; the pistol is a tile again.
    const choices = tiles(m).map((x) => x.dataset.choice);
    expect(choices).toContain('pistol');
    expect(choices).not.toContain('r1');
    tiles(m)
      .find((x) => x.dataset.choice === 'pistol')!
      .click();
    expect(m.q('.rv-verdict').textContent).toContain('▼ Weaker');
    expect(m.q('.rv-tile[data-choice="pistol"] .rv-ty').textContent).toBe('Pistol ∞');
    m.key('equip').click();
    expect(m.status()).toBe(
      `${recruit(1).name} now holds the free pistol; Lv 1 Military Carbine is back in the stash.`,
    );
    expect(m.game().armoury.map((w) => w.uid)).toContain('r1');
  });

  it('slot, tiles and hint show dmg/s in the survivor’s hands, so a Hunter opens on the Sniper rifle (ID-152)', () => {
    const hunter: RosterDefender = { ...at(1, 21), job: 'hunter' };
    const sniper = gun('s', 'sniper', 'common');
    const assault = gun('a', 'assault', 'common');
    const m = picker([hunter], [assault, sniper]);
    const who = squadSpec(hunter);
    expect(m.key('slot').querySelector('.rv-slot-line b')!.textContent).toBe(
      survivorDps(who, 'pistol').toFixed(1),
    );
    m.key('slot').click();
    expect(tiles(m)[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(tiles(m)[0]!.textContent).toContain(survivorDps(who, sniper).toFixed(1));
    const hint = m.scrim.querySelector('.rv-hint')!.textContent!;
    expect(hint).toContain(`dmg/s is ${hunter.name}'s, level and profession counted`);
    expect(hint).not.toContain('leaves it out');
  });

  it('with no better gun nothing is preselected and Equip waits for a tap', () => {
    const m = picker([at(1, 2)], [smg]);
    m.key('slot').click();
    // The Rusty SMG still beats the pistol? Hold it, then look at the picker again.
    m.key('equip').click();
    m.key('slot').click();
    expect(tiles(m).some((x) => x.getAttribute('aria-pressed') === 'true')).toBe(false);
    expect(m.scrim.textContent).toContain(
      'No upgrade in the stash. Tap a gun to compare it with Lv 1 Rusty SMG.',
    );
    // The slot's role is its own span, so a phone can drop it.
    expect(m.key('slot').querySelector('.rv-slot-role')!.textContent).toMatch(/^ · \S/);
    expect(m.scrim.querySelector('[data-key="equip"]')).toBeNull();
  });

  it('a full stash refuses a gun for the pistol: the core’s reason in the status line, in danger colour', () => {
    const full = Array.from({ length: STASH_CAP }, (_, i) => gun(`f${i}`, 'smg', 'common'));
    const m = mount(camp([at(1, 2)], [rifle]));
    m.roster.open('recruit-1');
    // Take the rifle, then try to give it back for the pistol while the stash is full.
    m.key('slot').click();
    m.key('equip').click();
    m.set({ ...m.game(), armoury: full });
    expect(m.game().armoury).toHaveLength(STASH_CAP);
    m.key('slot').click();
    tiles(m)
      .find((x) => x.dataset.choice === 'pistol')!
      .click();
    m.key('equip').click();
    expect(m.status()).toBe(`The stash is full (${STASH_CAP}/${STASH_CAP})`);
    expect(m.q<HTMLElement>('.rv-status').dataset.tone).toBe('danger');
    // Still in the picker, the gun still held.
    expect(m.q('.rv-ttl').textContent).toBe('Choose a gun');
    expect(m.game().roster[0]!.loadout.primary).toMatchObject({ uid: 'r1' });
  });

  it('Esc on an open picker goes back to Level first, then closes', () => {
    const m = picker();
    m.key('slot').click();
    m.press('Escape');
    expect(m.scrim.hidden).toBe(false);
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
    m.press('Escape');
    expect(m.scrim.hidden).toBe(true);
  });

  it('the stash empty and the pistol held: nothing to choose, said plainly', () => {
    const m = picker([at(1, 2)], []);
    m.key('slot').click();
    expect(tiles(m)).toHaveLength(0);
    expect(m.scrim.textContent).toContain('No other gun to choose');
  });

  it('a different survivor’s tab closes the picker back to Level', () => {
    const m = picker([at(1, 2), at(2, 2)]);
    m.key('slot').click();
    m.q('.rv-tab[data-defender="recruit-2"]').click();
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
  });

  it('in a fight the slot says to change guns between hordes, and nothing opens', () => {
    const m = picker([at(1, 2)], [rifle], { canGear: false });
    const slot = m.key('slot');
    expect(slot.textContent).toContain(GUNS_WAIT);
    expect(slot.getAttribute('aria-disabled')).toBe('true');
    slot.click();
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
    expect(tiles(m)).toHaveLength(0);
    expect(m.key('best').disabled).toBe(true);
    expect(m.key('best').title).toBe(GUNS_WAIT);
  });
});

describe('Best gun for everyone (ID-108)', () => {
  it('acts at once and says what moved', () => {
    // A Relic LMG is the strongest (a Relic Carbine no longer outranks a Military SMG, ID-135).
    const rifle = gun('r1', 'lmg', 'relic');
    const smg = gun('s1', 'smg', 'military');
    const m = mount(camp([at(1, 1), at(2, 1)], [smg, rifle]));
    m.roster.open('recruit-1');
    m.key('best').click();
    expect(m.onBestGuns).toHaveBeenCalledTimes(1);
    expect(m.status()).toBe(
      `Equipped: ${recruit(1).name} → Relic LMG · ${recruit(2).name} → Military SMG`,
    );
    expect(m.game().armoury).toEqual([]);
    expect(m.key('slot').textContent).toContain('Relic LMG');
    // A second press: nothing left to hand out.
    m.key('best').click();
    expect(m.status()).toBe('Everyone already holds the best gun they can get.');
  });

  it('closes an open picker and shows a refusal in danger colour', () => {
    const m = mount(camp([at(1, 1)], [gun('r1', 'rifle', 'common')]));
    m.roster.open('recruit-1');
    m.key('slot').click();
    m.key('best').click();
    expect(m.q('.rv-ttl').textContent).toMatch(/^Level \d+$/);
    // The app refuses (a fight): its reason is shown.
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const refusing = createRoster(root, {
      state: () => ({ game: camp([at(1, 1)]), fight: null, canGear: true, resumes: false }),
      onEquip: () => ({ ok: true }),
      onBestGuns: () => ({ ok: false, reason: GUNS_WAIT }),
    });
    refusing.open('recruit-1');
    document.querySelector<HTMLButtonElement>('.rv-best')!.click();
    expect(document.querySelector('.rv-status')!.textContent).toBe(GUNS_WAIT);
    expect(document.querySelector<HTMLElement>('.rv-status')!.dataset.tone).toBe('danger');
  });
});
