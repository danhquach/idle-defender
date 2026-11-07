// @vitest-environment jsdom
// ID-067: the horde-only result screen names a win's weapon drop next to the XP and
// new-survivor lines, and each survivor gets a one-click gun picker between hordes.
// Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { DROP_GUNS, gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP, STASH_CAP, WEAPONS, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { equipGun, squadDrop, startSquadHorde, type SquadDrop } from '../core/hordeonly.ts';
import { waveCount } from '../core/waves.ts';
import {
  createHud,
  DROP_LOST_NOTE,
  dropTile,
  gunLabel,
  gunOption,
  lossXpText,
  SQUAD_LOSS_RULE,
  SQUAD_POINTS_NOTE,
  squadGear,
  squadScreen,
  SQUAD_NO_DROP,
  squadStart,
} from './hud.ts';
import { ART_URLS, GUN_ICON, type GunId } from './sprites.ts';

const NOW = 1_700_000_000_000;
const noop = (): void => {};

function squadGame(n: number, horde = 1, stash: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => recruit(i + 1)),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}
const ended = (g: GameState, outcome: 'won' | 'lost', seed = 1) => ({
  ...startSquadHorde(g, seed, NOW),
  outcome,
});
/** A first-clear drop of `weapon`, `thrown` pushed out of a full stash (ID-098's fields filled). */
const dropOf = (
  weapon: OwnedWeapon,
  thrown: OwnedWeapon | null = null,
  extra: Partial<SquadDrop> = {},
): SquadDrop => ({
  weapon,
  thrown,
  kind: 'first',
  upgrade: true,
  noUpgrades: false,
  farmFrom: null,
  ...extra,
});
const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});

describe('the drop on the result screen (ID-067)', () => {
  it('a win names the drop and the stash count, after the XP and new-survivor lines', () => {
    const g = squadGame(2, 3);
    const won = ended(g, 'won');
    const { weapon } = squadDrop(g, won)!;
    const lines = squadScreen(g, won).lines;
    const at = lines.indexOf(
      `Weapon drop (First clear): ${gunLabel(weapon)} · into the stash (1/${STASH_CAP})`,
    );
    expect(at).toBeGreaterThan(lines.findIndex((l) => l.startsWith('New survivor')));
  });

  it('with the stash full it says which weapon was thrown away', () => {
    const stash = [
      ...Array.from({ length: STASH_CAP - 1 }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic')),
      gun('p1', 'pistol', 'rusty'),
    ];
    const g = squadGame(1, 9, stash);
    let seed = 1;
    while (squadDrop(g, ended(g, 'won', seed))!.thrown!.uid !== 'p1') seed++;
    const lines = squadScreen(g, ended(g, 'won', seed)).lines;
    expect(lines).toContain('Stash full: the weakest, the Lv 1 Rusty Pistol, was thrown away');
  });

  it('a drop weaker than the whole full stash is the one thrown away, and says so', () => {
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const g = squadGame(1, 2, stash);
    const won = ended(g, 'won');
    const { weapon } = squadDrop(g, won)!;
    const lines = squadScreen(g, won).lines;
    expect(lines).toContain(`Weapon drop (First clear): ${gunLabel(weapon)}`);
    expect(
      lines.some((l) => l.includes('was no better than any gun in it, so it was thrown away')),
    ).toBe(true);
  });

  it('a loss names no drop, and says plainly that nothing dropped (ID-073)', () => {
    const g = squadGame(2, 3);
    const lines = squadScreen(g, ended(g, 'lost')).lines;
    expect(lines).toContain(SQUAD_NO_DROP);
    expect(lines.filter((l) => l !== SQUAD_NO_DROP).some((l) => /drop|stash/i.test(l))).toBe(false);
  });
});

describe('the gun pickers (ID-067)', () => {
  const rifle = gun('h1', 'rifle', 'military');
  const smg = gun('h2', 'smg', 'rusty');

  it('one row per survivor: the pistol, the stash and their own gun, strongest first', () => {
    const g0 = squadGame(2, 3, [smg, rifle]);
    const r = equipGun(g0, 'recruit-2', 'h1');
    if (!r.ok) throw new Error(r.reason);
    const gear = squadGear(r.game);
    expect(gear.heading).toBe(`Stash 1/${STASH_CAP}`);
    expect(gear.rows.map((row) => [row.id, row.value, row.rarity])).toEqual([
      ['recruit-1', 'pistol', 'common'],
      ['recruit-2', 'h1', 'military'],
    ]);
    // Another survivor's gun is theirs: only the stash, the pistol and your own.
    expect(gear.rows.map((row) => row.options.map((o) => o.value).sort())).toEqual([
      ['h2', 'pistol'],
      ['h1', 'h2', 'pistol'],
    ]);
    for (const row of gear.rows) {
      const powers = row.options.map((o) =>
        gunPower(o.value === 'pistol' ? 'pistol' : o.value === 'h1' ? rifle : smg),
      );
      expect(powers).toEqual([...powers].sort((a, b) => b - a));
    }
    expect(gear.rows[1]!.options.find((o) => o.value === 'h1')!.label).toBe(gunOption(rifle));
    // The number first in a picker, so a closed select never cuts it off; last on the drop line.
    expect(gunOption('pistol')).toBe('8.3 dmg/s · Lv 1 Pistol');
    expect(gunLabel('pistol')).toBe('Lv 1 Pistol · 8.3 dmg/s');
  });

  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    return { root, h };
  }

  it('a pick goes out at once, one click; the redraw keeps focus on that survivor', () => {
    const { root, h } = page();
    let g = squadGame(2, 3, [rifle]);
    h.showResult(squadStart(g));
    const onEquip = vi.fn((id: string, choice: string) => {
      const r = equipGun(g, id, choice);
      if (r.ok) g = r.game;
      h.showGear(squadGear(g), onEquip);
    });
    h.showGear(squadGear(g), onEquip);
    const selects = root.querySelectorAll<HTMLSelectElement>('.hud-gear-select');
    expect(selects).toHaveLength(2);
    // Each sits in its survivor's card (the debrief), not in a list of its own.
    expect(
      [...selects].map((x) => x.closest<HTMLElement>('.squad-card')?.dataset.defender),
    ).toEqual(g.roster.map((d) => d.id));
    expect(root.querySelector('.hud-gear')!.children).toHaveLength(0);
    const second = selects[1]!;
    second.focus();
    second.value = 'h1';
    second.dispatchEvent(new Event('change'));
    expect(onEquip).toHaveBeenCalledWith('recruit-2', 'h1');
    expect(g.roster[1]!.loadout.primary).toEqual(rifle);
    const now = root.querySelectorAll<HTMLSelectElement>('.hud-gear-select')[1]!;
    expect(now.value).toBe('h1');
    expect(document.activeElement).toBe(now);
    expect(now.title).toBe(gunOption(rifle));
    expect(now.dataset.rarity).toBe('military');
    expect(root.querySelector('.debrief-stash')!.textContent).toBe(`Stash 0/${STASH_CAP}`);
  });

  it('a survivor with no card (none on this screen) gets a named row in a list', () => {
    const { root, h } = page();
    const g = squadGame(2, 3);
    h.showResult({ ...squadStart(g), debrief: { ...squadStart(g).debrief!, cards: [] } });
    h.showGear(squadGear(g), noop);
    expect([...root.querySelectorAll('.hud-gear-name')].map((l) => l.textContent)).toEqual(
      g.roster.map((d) => d.name),
    );
    expect(root.querySelector('.hud-gear .hud-pick-heading')!.textContent).toBe(
      `Stash 0/${STASH_CAP}`,
    );
  });

  it('each select is labelled by its survivor’s name', () => {
    const { root, h } = page();
    const g = squadGame(1, 3);
    h.showResult(squadStart(g));
    h.showGear(squadGear(g), noop);
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    expect(root.querySelector<HTMLLabelElement>(`label[for="${select.id}"]`)!.textContent).toBe(
      `${g.roster[0]!.name}'s gun`,
    );
  });

  it('a new result screen clears the pickers until they are drawn again', () => {
    const { root, h } = page();
    const g = squadGame(1, 3);
    h.showResult(squadStart(g));
    h.showGear(squadGear(g), noop);
    h.showResult(squadStart(g));
    expect(root.querySelector('.hud-gear-select')).toBeNull();
  });

  it('puts names and gun labels on the page as text, never as markup', () => {
    const { root, h } = page();
    const g = squadGame(1, 3, [rifle]);
    const evil = '<img src=x onerror=alert(1)>';
    g.roster[0] = { ...g.roster[0]!, name: evil };
    const gear = squadGear(g);
    gear.rows[0]!.options[0]!.label = evil;
    h.showResult(squadStart(g));
    h.showGear(gear, noop);
    // The only pictures are the skill pick's own icons (ID-100), never one from a name.
    const imgs = [...root.querySelectorAll('.hud-result img')];
    expect(imgs.every((i) => i.closest('.hud-skill-option'))).toBe(true);
    expect(root.querySelector('.squad-card-name')!.textContent).toBe(evil);
    expect(root.querySelector('.squad-card-gear label')!.textContent).toBe(`${evil}'s gun`);
    expect(root.querySelector('.squad-card-gear option')!.textContent).toBe(evil);
  });

  it('no pick while the result panel is hidden', () => {
    const { root, h } = page();
    const g = squadGame(1, 3, [rifle]);
    const onEquip = vi.fn();
    h.showResult(squadStart(g));
    h.showGear(squadGear(g), onEquip);
    root.querySelector<HTMLElement>('.hud-result')!.hidden = true;
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    select.value = 'h1';
    select.dispatchEvent(new Event('change'));
    expect(onEquip).not.toHaveBeenCalled();
  });
});

describe('the debrief layout (ID-067)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    return { root, h };
  }

  it('a win: waves chip, the drop as a loot tile, the recruit tile, a card per survivor', () => {
    const g = squadGame(2, 3);
    const won = ended(g, 'won');
    const { weapon } = squadDrop(g, won)!;
    const d = squadScreen(g, won).debrief!;
    expect(d.kind).toBe('won');
    expect(d.chips[0]).toEqual({ text: `${won.waveCount}/${won.waveCount} waves`, tone: 'ok' });
    expect(d.drop).toEqual(dropTile(g, dropOf(weapon)));
    expect(d.drop!.stash).toBe(`Stash 1/${STASH_CAP}`);
    expect(d.recruit).toEqual({
      label: 'New survivor',
      name: recruit(3).name,
      sub: 'Joins next horde',
      full: false,
    });
    const full = squadGame(SQUAD_CAP, 3);
    expect(squadScreen(full, ended(full, 'won')).debrief!.recruit!.full).toBe(true);
    expect(d.cards.map((c) => [c.id, c.joining])).toEqual([
      ['recruit-1', false],
      ['recruit-2', false],
      ['recruit-3', true],
    ]);
    const card = d.cards[0]!;
    expect(card.xp).toBeGreaterThan(0);
    expect(card.bar!.pct).toBeGreaterThanOrEqual(0);
    expect(card.bar!.pct).toBeLessThanOrEqual(100);
    expect(card.bar!.text).toMatch(/^\d+\/\d+ XP to Lv \d+$/);
  });

  it('the loot tile names what a full stash threw away, or that the drop itself went', () => {
    const relics = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const weak = gun('h1', 'smg', 'rusty');
    expect(dropTile({ armoury: relics }, dropOf(weak, weak))).toMatchObject({
      stash: 'Stash full: thrown away',
      lost: true,
      thrown: DROP_LOST_NOTE,
    });
    expect(dropTile({ armoury: [] }, dropOf(weak, null)).thrown).toBeNull();
    const strong = gun('h2', 'lmg', 'relic');
    expect(dropTile({ armoury: relics }, dropOf(strong, weak))).toMatchObject({
      rarity: 'relic',
      rarityName: 'Relic',
      name: 'LMG',
      stash: `Stash ${STASH_CAP}/${STASH_CAP}`,
      lost: false,
      thrown: 'Thrown away: Lv 1 Rusty SMG',
    });
  });

  it('the loot tile’s icon is the dropped gun’s own icon, for every gun a horde drops (ID-092)', () => {
    for (const base of DROP_GUNS) {
      const t = dropTile({ armoury: [] }, dropOf(gun('h1', base, 'common')));
      expect(t.icon).toBe(GUN_ICON[base as GunId]);
      expect(ART_URLS[t.icon]).toBeTruthy();
    }
  });

  it('on the page: the drop tile’s icon is decorative, beside the name; a lost drop greys out (ID-073)', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const won = ended(g, 'won');
    h.showResult(squadScreen(g, won));
    const tile = root.querySelector<HTMLElement>('.tile-drop')!;
    const img = tile.querySelector<HTMLImageElement>('.tile-drop-head > .tile-icon > img')!;
    expect(img.alt).toBe('');
    expect(img.getAttribute('src')).toBe(ART_URLS[squadScreen(g, won).debrief!.drop!.icon]);
    const dropped = squadDrop(g, won)!.weapon;
    // The level sits in front of the name (ID-098), and the kind of drop above it.
    expect(tile.querySelector('.tile-drop-id .tile-name')!.textContent).toBe(
      `Lv ${dropped.level} ${WEAPONS[dropped.base].name}`,
    );
    expect(tile.querySelector('.tile-drop-id .tile-level')!.textContent).toBe(
      `Lv ${dropped.level}`,
    );
    expect(tile.querySelector('.tile-drop-id .tile-kind')!.textContent).toBe('First clear');
    expect(tile.querySelector('.tile-farm')).toBeNull();
    // The power row and thrown line stay full width under the head.
    expect(tile.querySelector(':scope > .tile-row')).not.toBeNull();
    expect(tile.classList.contains('tile-drop-lost')).toBe(false);

    const relics = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const full = squadGame(1, 1, relics);
    // Horde 1 drops only Rusty or Common: always weaker than a stash of Relic LMGs.
    const drop = squadDrop(full, ended(full, 'won'))!;
    expect(drop.thrown).toBe(drop.weapon);
    h.showResult(squadScreen(full, ended(full, 'won')));
    const lost = root.querySelector<HTMLElement>('.tile-drop')!;
    expect(lost.classList.contains('tile-drop-lost')).toBe(true);
    expect(lost.querySelector('.tile-thrown')!.textContent).toBe(DROP_LOST_NOTE);
    expect(lost.querySelector('.tile-stash-lost')!.textContent).toBe('Stash full: thrown away');
  });

  it('a loss on the page: the no-drop chip, and no loot tile (ID-073)', () => {
    const { root, h } = page();
    const g = squadGame(2, 3);
    h.showResult(squadScreen(g, ended(g, 'lost')));
    const chips = [...root.querySelectorAll('.chip')].map((c) => c.textContent);
    expect(chips).toEqual([lossXpText(0), SQUAD_NO_DROP]);
    expect(root.querySelector('.tile-drop')).toBeNull();
  });

  it('a loss: a callout, the no-XP chip, and the squad’s cards to change guns before the retry', () => {
    const g = squadGame(3, 6);
    const d = squadScreen(g, ended(g, 'lost')).debrief!;
    expect(d.kind).toBe('lost');
    expect(d.callout!.head).toMatch(/nobody left standing$/);
    expect(d.chips).toEqual([
      { text: 'No XP: no wave cleared', tone: 'warn' },
      { text: SQUAD_NO_DROP, tone: 'warn' },
    ]);
    expect(SQUAD_NO_DROP).toBe('No weapon drop on a loss');
    expect(squadScreen(g, ended(g, 'lost')).lines).toContain(SQUAD_NO_DROP);
    expect(d.drop).toBeNull();
    expect(d.cards.map((c) => c.id)).toEqual(g.roster.map((x) => x.id));
    expect(d.cards.every((c) => c.xp === null && c.bar === null)).toBe(true);
  });

  it('the start screen: wave and squad chips, plain cards, the loss rule by the button', () => {
    const g = squadGame(2, 4);
    const d = squadStart(g).debrief!;
    expect(d.chips.map((c) => c.text)).toEqual([`${waveCount(4)} waves`, `Squad 2/${SQUAD_CAP}`]);
    expect(d.foot).toBe(SQUAD_LOSS_RULE);
    expect(d.cards.map((c) => c.name)).toEqual(g.roster.map((x) => x.name));
  });

  it('on the page: chips, the tile coloured by rarity, the XP bar, the footer and its button', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const won = ended(g, 'won');
    h.showResult(squadScreen(g, won));
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    expect(panel.classList.contains('hud-debrief')).toBe(true);
    expect(panel.dataset.kind).toBe('won');
    expect(root.querySelector<HTMLElement>('.hud-result-list')!.hidden).toBe(true);
    expect(root.querySelector('.chip')!.textContent).toBe(
      `${won.waveCount}/${won.waveCount} waves`,
    );
    const tile = root.querySelector<HTMLElement>('.tile-drop')!;
    expect(tile.dataset.rarity).toBe(squadDrop(g, won)!.weapon.rarity);
    expect(root.querySelector('.tile-recruit .tile-name')!.textContent).toBe(recruit(2).name);
    const fill = root.querySelector<HTMLElement>('.squad-card .xp-fill')!;
    expect(fill.style.width).toMatch(/%$/);
    expect(fill.parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.squad-points')!.textContent).toMatch(/^\d+ points?$/);
    const button = root.querySelector('.hud-result-foot > .hud-button')!;
    expect(button.classList.contains('btn-primary')).toBe(true);
    expect(root.querySelector('.hud-result-foot-note')!.textContent).toBe(SQUAD_POINTS_NOTE);
  });

  it('a spent-out card shows 0 in the muted style, and its buttons go grey', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const aim = () => root.querySelector<HTMLButtonElement>('.hud-pick-stat')!;
    const points = () => root.querySelector('.squad-points')!;
    expect(points().classList.contains('squad-points-none')).toBe(false);
    for (let n = 0; n < 1000 && !aim().disabled; n++) aim().click();
    expect(aim().disabled).toBe(true);
    // Shows a bare 0; screen readers get "0 points" from the hidden unit.
    expect(points().firstChild!.textContent).toBe('0');
    expect(points().querySelector('.sr-only')!.textContent).toBe(' points');
    expect(points().textContent).toBe('0 points');
    expect(points().classList.contains('squad-points-none')).toBe(true);
  });

  it('the full game’s result screen keeps its plain list and button', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult({ ...screen, debrief: undefined });
    expect(root.querySelector('.hud-result')!.classList.contains('hud-debrief')).toBe(false);
    expect(root.querySelector('.hud-result-list')!.textContent).toContain('All');
    expect(
      root.querySelector('.hud-result-foot > .hud-button')!.classList.contains('btn-primary'),
    ).toBe(false);
  });
});

describe('the debrief panel scrolls (ID-067)', () => {
  it('a new screen starts at its top', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const g = squadGame(2, 3);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    panel.scrollTop = 300;
    h.showResult(squadStart(g));
    expect(panel.scrollTop).toBe(0);
  });
});
