// @vitest-environment jsdom
// ID-086, ID-108: the Roster — a top-bar button (badge = survivors with points to spend)
// opens one dialog: squad tabs, the selected survivor with their gun slot, and one panel,
// Stats (points drafted with + and −, spent on Confirm) or Choose a gun (tiles, a comparison
// with the gun held, one Equip). Keyboard and touch alike.
import { describe, expect, it, vi } from 'vitest';
import { rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import {
  DEFENDER_HP,
  STASH_CAP,
  type Rarity,
  type Stat,
  type Stats,
  type WeaponId,
} from '../core/data.ts';
import { newGame, spendPoint, type GameState, type RosterDefender } from '../core/game.ts';
import { bestGuns, equipGun, startSquadHorde } from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import { maxHpOf, xpForLevel } from '../core/stats.ts';
import { GUNS_WAIT } from './inventory.ts';
import { ART_URLS, avatarOf, GUNNER_LOOKS, lookOf } from './sprites.ts';
import {
  createRoster,
  pointsBadge,
  rosterTiles,
  SPEND_LATER_NOTE,
  type RosterOptions,
} from './squadroster.ts';

const NOW = 1_800_000_000_000;
const stats = (s: Partial<Stats> = {}): Stats => ({
  instinct: 0,
  agility: 0,
  mind: 0,
  tinker: 0,
  ...s,
});
/** Survivor `n` at `level`, with `s` spent. */
const at = (n: number, level: number, s: Partial<Stats> = {}): RosterDefender => ({
  ...recruit(n),
  xp: xpForLevel(level),
  stats: stats(s),
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
  it('lists every survivor with avatar, name, level, full HP, gun and unspent points', () => {
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
    const ivan = {
      ...at(1, 7, { instinct: 2 }),
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
      gun: 'Relic Rifle',
      rarity: 'relic',
      points: 4,
    });
    expect(tiles[1]).toMatchObject({ level: 1, gun: 'Pistol', rarity: 'common', points: 0 });
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

  it('the badge counts survivors with points to spend, not the points', () => {
    expect(pointsBadge(camp([at(1, 4), at(2, 1), at(3, 2)]))).toBe(2);
    expect(pointsBadge(camp([at(1, 1)]))).toBe(0);
    expect(pointsBadge(camp([at(1, 2, { mind: 1 })]))).toBe(0);
  });
});

/** The Roster mounted over `game`; spending, equipping and the best-guns call work on it as the app does. */
function mount(game: GameState, over: { canSpend?: boolean; canGear?: boolean } = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let g = game;
  const canSpend = over.canSpend ?? true;
  const canGear = over.canGear ?? true;
  const onSpend = vi.fn((id: string, stat: Stat) => {
    const r = spendPoint(g, id, stat);
    if (r.ok) g = r.game;
    roster.refresh();
  });
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
    state: () => ({ game: g, fight: null, canSpend, canGear, resumes: false }),
    onSpend,
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
  const plus = (stat: Stat, id = 'recruit-1') => key(`add:${id}:${stat}`);
  const minus = (stat: Stat, id = 'recruit-1') => key(`sub:${id}:${stat}`);
  return {
    root,
    roster,
    scrim,
    onSpend,
    onEquip,
    onBestGuns,
    press,
    q,
    key,
    plus,
    minus,
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
  it('the button’s badge counts survivors with points and follows the camp while shut', () => {
    const m = mount(camp([at(1, 4), at(2, 3), at(3, 1)]));
    const dot = m.button.querySelector<HTMLElement>('.roster-dot')!;
    expect(dot.hidden).toBe(false);
    expect(dot.textContent).toBe('2');
    // Read out too, so the badge isn't a bare number.
    expect(m.button.textContent).toContain('2 with points to spend');
    m.set(camp([at(1, 4, { mind: 3 }), at(2, 3, { agility: 2 }), at(3, 1)]));
    expect(dot.hidden).toBe(true);
    expect(m.button.textContent).toBe('Roster');
  });

  it('opens on the first survivor with points; every survivor is a tab with a points badge', () => {
    const m = mount(camp([at(1, 1), at(2, 4), at(3, 2)]));
    m.button.click();
    expect(m.scrim.hidden).toBe(false);
    expect(m.root.hasAttribute('inert')).toBe(true);
    const tabs = [...m.scrim.querySelectorAll<HTMLButtonElement>('.rv-tab')];
    expect(tabs).toHaveLength(3);
    expect(tabs.some((t) => t.hasAttribute('aria-pressed'))).toBe(false);
    expect(tabs[1]!.getAttribute('aria-current')).toBe('true');
    expect(tabs[0]!.hasAttribute('aria-current')).toBe(false);
    expect(tabs[1]!.querySelector('.rv-badge')!.textContent).toBe('3');
    expect(tabs[0]!.querySelector('.rv-badge')).toBeNull();
    expect(tabs[1]!.getAttribute('aria-label')).toContain('3 points to spend');
    // The fight info stays compact: HP in the tab’s label and on the survivor row.
    expect(tabs[1]!.getAttribute('aria-label')).toContain('HP ');
    expect(m.q('.rv-who-name').textContent).toBe(recruit(2).name);
    expect(tabs[0]!.querySelector('img')!.alt).toBe('');
    expect(document.activeElement).toBe(tabs[1]);
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
    expect(m.plus('instinct').getAttribute('aria-label')).toContain(name);
    // The status line after Best gun and after a Confirm: the name as text, nothing parsed.
    m.q('.rv-best').click();
    expect(m.status()).toBe(`Equipped: ${name} → Military Rifle`);
    m.plus('instinct').click();
    m.key('confirm').click();
    expect(m.status()).toContain(name);
    expect(m.scrim.querySelector('.rv-status')!.children).toHaveLength(0);
    // The avatar and the gun icon: nothing the name made.
    expect(m.scrim.querySelectorAll('img').length).toBeLessThanOrEqual(3);
    expect(
      [...m.scrim.querySelectorAll('img')].every((i) => i.getAttribute('onerror') === null),
    ).toBe(true);
  });
});

describe('Stats: points drafted, spent on Confirm (ID-108)', () => {
  it('+ and − only change a draft: nothing is spent until Confirm', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    expect(m.q('.rv-left').textContent).toBe('3 to spend');
    m.plus('agility').click();
    m.plus('agility').click();
    m.plus('mind').focus();
    m.plus('mind').click();
    expect(m.onSpend).not.toHaveBeenCalled();
    expect(m.game().roster[0]!.stats.agility).toBe(0);
    // "0 +2": the points held, then the pending ones.
    const row = m.plus('agility').closest('.rv-stat')!;
    expect(row.querySelector('.rv-stat-ct')!.textContent).toBe('0 +2');
    expect(m.q('.rv-left').textContent).toBe('0 to spend');
    // Spent out: every + greys out, and the keyboard follows to a button still live.
    for (const s of ['instinct', 'agility', 'mind'] as const) expect(m.plus(s).disabled).toBe(true);
    expect(document.activeElement!.getAttribute('data-key')).toMatch(/^sub:/);
    // The tab's badge counts what is left: none, so none shown.
    expect(m.scrim.querySelector('.rv-tab .rv-badge')).toBeNull();
    m.minus('agility').click();
    expect(m.plus('agility').closest('.rv-stat')!.querySelector('.rv-stat-ct')!.textContent).toBe(
      '0 +1',
    );
    expect(m.q('.rv-left').textContent).toBe('1 to spend');
  });

  it('the effects read now → with the drafted points (green), or one more (grey)', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    const fx = () => m.plus('agility').closest('.rv-stat')!.querySelector('.rv-fx')!;
    expect(fx().textContent).toMatch(
      /^Reload \d\.\d\d s → \d\.\d\d sFire rate \+\d+\.\d% → \+\d+\.\d%$/,
    );
    expect(fx().querySelector('.rv-fx-up')).toBeNull();
    const one = fx().textContent;
    m.plus('agility').click();
    m.plus('agility').click();
    expect(fx().querySelector('.rv-fx-up')).not.toBeNull();
    expect(fx().textContent).not.toBe(one);
    // Tinker stays a locked row, with no buttons.
    const locked = m.q('.rv-stat-locked');
    expect(locked.textContent).toContain('Tinker');
    expect(locked.querySelector('button')).toBeNull();
  });

  it('with no point to spend, the effects show only what the stat gives now', () => {
    const m = mount(camp([at(1, 2, { agility: 1 })]));
    m.roster.open('recruit-1');
    const fx = m.plus('agility').closest('.rv-stat')!.querySelector('.rv-fx')!;
    expect(fx.textContent).toMatch(/^Reload \d\.\d\d sFire rate \+\d+\.\d%$/);
    expect(fx.querySelector('.rv-fx-to')).toBeNull();
  });

  it('Undo clears the survivor’s draft', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    const undo = () => m.key('undo');
    expect(undo().disabled).toBe(true);
    expect(m.key('confirm').disabled).toBe(true);
    m.plus('instinct').click();
    m.plus('mind').click();
    expect(m.key('confirm').textContent).toBe('Confirm 2');
    undo().click();
    expect(m.q('.rv-left').textContent).toBe('3 to spend');
    expect(m.key('confirm').disabled).toBe(true);
    expect(m.onSpend).not.toHaveBeenCalled();
  });

  it('Confirm sends each drafted point through onSpend, and says so', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    m.plus('mind').click();
    m.plus('instinct').click();
    m.plus('mind').click();
    m.key('confirm').click();
    expect(m.onSpend.mock.calls).toEqual([
      ['recruit-1', 'instinct'],
      ['recruit-1', 'mind'],
      ['recruit-1', 'mind'],
    ]);
    expect(m.game().roster[0]!.stats).toMatchObject({ instinct: 1, mind: 2 });
    expect(m.status()).toBe(`Spent 3 points on ${recruit(1).name}.`);
    // The draft is gone and the count is the camp's.
    expect(m.q('.rv-left').textContent).toBe('0 to spend');
    expect(m.scrim.querySelector('.rv-pend')).toBeNull();
  });

  it('drafts stay with each survivor while you switch tabs', () => {
    const m = mount(camp([at(1, 4), at(2, 3)]));
    m.roster.open('recruit-1');
    m.plus('agility').click();
    m.q('.rv-tab[data-defender="recruit-2"]').click();
    expect(m.scrim.querySelector('.rv-pend')).toBeNull();
    m.plus('mind', 'recruit-2').click();
    m.q('.rv-tab[data-defender="recruit-1"]').click();
    expect(m.plus('agility').closest('.rv-stat')!.querySelector('.rv-pend')!.textContent).toBe(
      '+1',
    );
    // The other tab's badge shows what is left after its draft.
    expect(m.q('.rv-tab[data-defender="recruit-2"] .rv-badge').textContent).toBe('1');
    expect(m.onSpend).not.toHaveBeenCalled();
  });

  it('a draft the camp no longer covers is trimmed (points spent elsewhere)', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    m.plus('mind').click();
    m.plus('mind').click();
    m.plus('mind').click();
    // Two points went into the result screen's own picker meanwhile.
    m.set(camp([at(1, 4, { agility: 2 })]));
    expect(m.q('.rv-left').textContent).toBe('0 to spend');
    expect(m.plus('mind').closest('.rv-stat')!.querySelector('.rv-pend')!.textContent).toBe('+1');
  });

  it('every + and − reads its stat and survivor', () => {
    const m = mount(camp([at(1, 4)]));
    m.roster.open('recruit-1');
    expect(m.plus('agility').getAttribute('aria-label')).toBe(
      `Add a point to Agility for ${recruit(1).name}, now 0`,
    );
    expect(m.minus('agility').getAttribute('aria-label')).toBe(
      `Take back a point from Agility for ${recruit(1).name}`,
    );
  });

  it('mid-fight every + and − is disabled and says to spend between hordes', () => {
    const m = mount(camp([at(1, 4)]), { canSpend: false });
    m.roster.open('recruit-1');
    for (const s of ['instinct', 'agility', 'mind'] as const) {
      expect(m.plus(s).disabled).toBe(true);
      expect(m.minus(s).disabled).toBe(true);
    }
    m.plus('agility').click();
    expect(m.onSpend).not.toHaveBeenCalled();
    expect(m.scrim.textContent).toContain(SPEND_LATER_NOTE);
    expect(m.key('confirm').disabled).toBe(true);
  });

  it('spent out: no note, and 0 to spend', () => {
    const m = mount(camp([at(1, 2, { mind: 1 })]), { canSpend: false });
    m.roster.open('recruit-1');
    expect(m.scrim.textContent).not.toContain(SPEND_LATER_NOTE);
    expect(m.q('.rv-left').textContent).toBe('0 to spend');
  });
});

describe('closing with drafted points (ID-108)', () => {
  function drafted() {
    const m = mount(camp([at(1, 4), at(2, 3)]));
    m.button.focus();
    m.button.click();
    m.roster.open('recruit-1');
    m.plus('mind').click();
    m.plus('mind').click();
    return m;
  }

  it('Esc or × with a draft asks "Spend 2 points?" and does not close', () => {
    const m = drafted();
    m.press('Escape');
    expect(m.scrim.hidden).toBe(false);
    const prompt = m.q<HTMLElement>('.rv-prompt');
    expect(prompt.hidden).toBe(false);
    expect(prompt.textContent).toContain('Spend 2 points?');
    expect([...prompt.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Confirm',
      'Discard',
      'Keep editing',
    ]);
    // The keyboard starts on the safe choice: Esc then Enter keeps editing, spends nothing.
    expect(document.activeElement!.textContent).toBe('Keep editing');
    (document.activeElement as HTMLButtonElement).click();
    expect(m.onSpend).not.toHaveBeenCalled();
    expect(m.q<HTMLElement>('.rv-prompt').hidden).toBe(true);
    m.press('Escape');
    // Esc again steps back out of the question.
    m.press('Escape');
    expect(m.q<HTMLElement>('.rv-prompt').hidden).toBe(true);
    expect(m.scrim.hidden).toBe(false);
    m.q('.rv-close').click();
    expect(m.q<HTMLElement>('.rv-prompt').hidden).toBe(false);
    expect(m.onSpend).not.toHaveBeenCalled();
  });

  it('Confirm spends the draft and closes; Discard drops it and closes', () => {
    const a = drafted();
    a.q('.rv-close').click();
    a.q('.rv-prompt button').click();
    expect(a.onSpend.mock.calls).toEqual([
      ['recruit-1', 'mind'],
      ['recruit-1', 'mind'],
    ]);
    expect(a.scrim.hidden).toBe(true);
    expect(a.root.hasAttribute('inert')).toBe(false);

    const b = drafted();
    b.q('.rv-close').click();
    b.q<HTMLButtonElement>('.rv-prompt button:nth-of-type(2)').click();
    expect(b.onSpend).not.toHaveBeenCalled();
    expect(b.scrim.hidden).toBe(true);
    // Reopened: no draft is kept.
    b.roster.open('recruit-1');
    expect(b.scrim.querySelector('.rv-pend')).toBeNull();
    expect(b.q('.rv-left').textContent).toBe('3 to spend');
  });

  it('"Keep editing" goes back to the dialog; undoing the draft takes the question away', () => {
    const m = drafted();
    m.q('.rv-close').click();
    m.q<HTMLButtonElement>('.rv-prompt button:nth-of-type(3)').click();
    expect(m.q<HTMLElement>('.rv-prompt').hidden).toBe(true);
    expect(m.scrim.hidden).toBe(false);
    m.q('.rv-close').click();
    m.key('undo').click();
    expect(m.q<HTMLElement>('.rv-prompt').hidden).toBe(true);
    // No draft left: closing is plain.
    m.q('.rv-close').click();
    expect(m.scrim.hidden).toBe(true);
  });

  it('closes plainly with no draft and gives the keyboard back to what opened it', () => {
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
    m.key('stats').click();
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
    expect(document.activeElement).toBe(m.key('slot'));
  });

  it('tapping another tile swaps the comparison; Equip equips it and the picker closes', () => {
    const m = picker();
    m.key('slot').click();
    const other = tiles(m).find((x) => x.dataset.choice === 'g1')!;
    other.click();
    expect(m.q('.rv-v-name').textContent).toBe('Lv 1 Common Shotgun');
    // The table: Now / New / Change, pellets shown.
    const heads = [...m.scrim.querySelectorAll('.rv-ctab thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['', 'Now: Pistol', 'New: Shotgun', 'Change']);
    const rows = [...m.scrim.querySelectorAll('.rv-ctab tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows.map((r) => r[0])).toEqual([
      'dmg/s',
      'Damage',
      'Fire rate',
      'Reload',
      'Range',
      'Role',
    ]);
    expect(rows.find((r) => r[0] === 'Damage')![2]).toBe('4.0 × 6');
    expect(rows.find((r) => r[0] === 'Role')![3]).toBe('new role');
    m.key('equip').click();
    expect(m.onEquip).toHaveBeenCalledWith('recruit-1', 'g1');
    expect(m.game().roster[0]!.loadout.primary).toMatchObject({ uid: 'g1' });
    expect(m.status()).toBe(`${recruit(1).name} now holds Lv 1 Common Shotgun.`);
    // Back on Stats with the new gun in the slot, the keyboard on it.
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
    expect(m.key('slot').textContent).toContain('Common Shotgun');
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
      `${recruit(1).name} now holds the free pistol; Lv 1 Military Rifle is back in the stash.`,
    );
    expect(m.game().armoury.map((w) => w.uid)).toContain('r1');
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

  it('Esc on an open picker goes back to Stats first, then closes', () => {
    const m = picker();
    m.key('slot').click();
    m.press('Escape');
    expect(m.scrim.hidden).toBe(false);
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
    m.press('Escape');
    expect(m.scrim.hidden).toBe(true);
  });

  it('the stash empty and the pistol held: nothing to choose, said plainly', () => {
    const m = picker([at(1, 2)], []);
    m.key('slot').click();
    expect(tiles(m)).toHaveLength(0);
    expect(m.scrim.textContent).toContain('No other gun to choose');
  });

  it('a different survivor’s tab closes the picker back to Stats', () => {
    const m = picker([at(1, 2), at(2, 2)]);
    m.key('slot').click();
    m.q('.rv-tab[data-defender="recruit-2"]').click();
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
  });

  it('in a fight the slot says to change guns between hordes, and nothing opens', () => {
    const m = picker([at(1, 2)], [rifle], { canGear: false });
    const slot = m.key('slot');
    expect(slot.textContent).toContain(GUNS_WAIT);
    expect(slot.getAttribute('aria-disabled')).toBe('true');
    slot.click();
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
    expect(tiles(m)).toHaveLength(0);
    expect(m.key('best').disabled).toBe(true);
    expect(m.key('best').title).toBe(GUNS_WAIT);
  });
});

describe('Best gun for everyone (ID-108)', () => {
  it('acts at once and says what moved', () => {
    const rifle = gun('r1', 'rifle', 'relic');
    const smg = gun('s1', 'smg', 'military');
    const m = mount(camp([at(1, 1), at(2, 1)], [smg, rifle]));
    m.roster.open('recruit-1');
    m.key('best').click();
    expect(m.onBestGuns).toHaveBeenCalledTimes(1);
    expect(m.status()).toBe(
      `Equipped: ${recruit(1).name} → Relic Rifle · ${recruit(2).name} → Military SMG`,
    );
    expect(m.game().armoury).toEqual([]);
    expect(m.key('slot').textContent).toContain('Relic Rifle');
    // A second press: nothing left to hand out.
    m.key('best').click();
    expect(m.status()).toBe('Everyone already holds the best gun they can get.');
  });

  it('closes an open picker and shows a refusal in danger colour', () => {
    const m = mount(camp([at(1, 1)], [gun('r1', 'rifle', 'common')]));
    m.roster.open('recruit-1');
    m.key('slot').click();
    m.key('best').click();
    expect(m.q('.rv-ttl').textContent).toBe('Stats');
    // The app refuses (a fight): its reason is shown.
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const refusing = createRoster(root, {
      state: () => ({
        game: camp([at(1, 1)]),
        fight: null,
        canSpend: true,
        canGear: true,
        resumes: false,
      }),
      onSpend: () => {},
      onEquip: () => ({ ok: true }),
      onBestGuns: () => ({ ok: false, reason: GUNS_WAIT }),
    });
    refusing.open('recruit-1');
    document.querySelector<HTMLButtonElement>('.rv-best')!.click();
    expect(document.querySelector('.rv-status')!.textContent).toBe(GUNS_WAIT);
    expect(document.querySelector<HTMLElement>('.rv-status')!.dataset.tone).toBe('danger');
  });
});
