// @vitest-environment jsdom
// ID-067: the horde-only result screen names a win's weapon drop next to the XP and
// new-survivor lines, and each survivor gets a one-click gun picker between hordes.
// Text reaches the page only through textContent.
import { describe, expect, it, vi } from 'vitest';
import { DROP_GUNS, gunPower, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import {
  GUN_ROLES,
  SQUAD_CAP,
  STASH_CAP,
  WEAPONS,
  type Rarity,
  type WeaponId,
} from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { xpForLevel } from '../core/stats.ts';
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
  SQUAD_NO_LEVEL_UPS,
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
  bonus: [],
  thrown: thrown ? [thrown] : [],
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
    while (squadDrop(g, ended(g, 'won', seed))!.thrown[0]?.uid !== 'p1') seed++;
    const lines = squadScreen(g, ended(g, 'won', seed)).lines;
    expect(lines).toContain('Stash full: the weakest, the Lv 1 Rusty Pistol, was thrown away');
  });

  it('a drop weaker than the whole full stash is the one thrown away, and says so', () => {
    // Relic Pump Shotguns, the most dmg/s of any gun (ID-135), so the drop is the weakest.
    const stash = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'shotgun', 'relic'));
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
    expect(gunOption('pistol')).toBe('8.3 dmg/s · Lv 1 Pistol · All-rounder');
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

  it('a win: waves chip, the drop as a loot tile, the recruit tile, a card per level-up', () => {
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
    // Both fresh survivors level up; the new one is on the recruit tile, not a card (ID-134).
    expect(d.cards.map((c) => [c.id, c.levelUp])).toEqual([
      ['recruit-1', true],
      ['recruit-2', true],
    ]);
    expect(d.empty).toBeNull();
    const card = d.cards[0]!;
    expect(card.xp).toBeGreaterThan(0);
    expect(card.bar!.pct).toBeGreaterThanOrEqual(0);
    expect(card.bar!.pct).toBeLessThanOrEqual(100);
    expect(card.bar!.text).toMatch(/^\d+\/\d+ XP to Lv \d+$/);
  });

  describe('a win shows only who levelled up in it (ID-134)', () => {
    // Just into level 30: 29 points from earlier hordes, and a level needs 750 more XP.
    const veteran = (n: number) => ({ ...recruit(n), xp: xpForLevel(30) });

    it('a survivor whose only news is points from earlier hordes gets no card', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const screen = squadScreen(g, ended(g, 'won'));
      expect(screen.debrief!.cards.map((c) => c.id)).toEqual(['recruit-1']);
      expect(screen.picks.map((p) => p.id)).toEqual(['recruit-1']);
    });

    it('nobody levelled up: one line in place of the cards, no points note', () => {
      const g = { ...squadGame(2, 3), roster: [veteran(1), veteran(2)] };
      const screen = squadScreen(g, ended(g, 'won'));
      expect(screen.debrief!.cards).toEqual([]);
      expect(screen.debrief!.empty).toBe(SQUAD_NO_LEVEL_UPS);
      expect(screen.picks).toEqual([]);
      expect(screen.debrief!.foot).toBe('');
      const { root, h } = page();
      h.showResult(screen);
      h.showGear(squadGear(g), noop);
      expect(root.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
      expect(root.querySelectorAll('.squad-card')).toHaveLength(0);
      // No loose gun rows either: guns change in the Roster; the stash count stays.
      expect(root.querySelectorAll('.hud-gear-select')).toHaveLength(0);
      expect(root.querySelector('.debrief-stash')!.textContent).toBe(`Stash 0/${STASH_CAP}`);
    });

    it('only the cards shown get a gun picker on a win', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const { root, h } = page();
      h.showResult(squadScreen(g, ended(g, 'won')));
      h.showGear(squadGear(g), noop);
      expect(
        [...root.querySelectorAll<HTMLSelectElement>('.hud-gear-select')].map(
          (s) => s.dataset.defender,
        ),
      ).toEqual(['recruit-1']);
      expect(root.querySelectorAll('.hud-gear-name')).toHaveLength(0);
    });

    it('a loss keeps every card, with or without a level-up', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const d = squadScreen(g, ended(g, 'lost')).debrief!;
      expect(d.cards.map((c) => c.id)).toEqual(['recruit-1', 'recruit-2']);
      expect(d.empty).toBeNull();
    });
  });

  it('the loot tile names what a full stash threw away, or that the drop itself went', () => {
    const relics = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const weak = gun('h1', 'smg', 'rusty');
    expect(dropTile({ armoury: relics }, dropOf(weak, weak))).toMatchObject({
      stash: `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
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

  it('the loot tile and the gun pickers name the gun’s role and trait, read with the picker (ID-101)', () => {
    for (const base of DROP_GUNS) {
      const t = dropTile({ armoury: [] }, dropOf(gun('h1', base, 'rusty')));
      expect(t.role).toBe(`${GUN_ROLES[base as 'smg'].role}: ${GUN_ROLES[base as 'smg'].trait}`);
    }
    const rifle: OwnedWeapon = {
      ...gun('h1', 'rifle', 'military'),
      affixes: [{ id: 'critDamage', value: 30 }],
    };
    expect(dropTile({ armoury: [] }, dropOf(rifle)).affixes).toBe('+30% crit damage (role)');
    expect(gunOption(rifle)).toMatch(
      / · Lv 1 Military Carbine · Marksman \(role \+30% crit damage\)$/,
    );

    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const g = squadGame(1, 3, [rifle]);
    const r = equipGun(g, 'recruit-1', 'h1');
    if (!r.ok) throw new Error(r.reason);
    expect(squadGear(r.game).rows[0]!.role).toBe(`Marksman: ${GUN_ROLES.rifle.trait}`);
    h.showResult(squadStart(r.game));
    h.showGear(squadGear(r.game), noop);
    const select = root.querySelector<HTMLSelectElement>('.hud-gear-select')!;
    const role = document.getElementById(select.getAttribute('aria-describedby')!)!;
    expect(role.classList.contains('hud-gear-role')).toBe(true);
    expect(role.textContent).toBe(`Marksman: ${GUN_ROLES.rifle.trait}`);

    const won = ended(squadGame(1, 5), 'won');
    h.showResult(squadScreen(squadGame(1, 5), won));
    const tile = root.querySelector<HTMLElement>('.tile-drop')!;
    const dropped = squadDrop(squadGame(1, 5), won)!.weapon;
    expect(tile.querySelector('.tile-role')!.textContent).toBe(
      `${GUN_ROLES[dropped.base as 'smg'].role}: ${GUN_ROLES[dropped.base as 'smg'].trait}`,
    );
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

    const relics = Array.from({ length: STASH_CAP }, (_, i) =>
      gun(`c${i + 1}`, 'shotgun', 'relic'),
    );
    const full = squadGame(1, 1, relics);
    // Horde 1 drops Rusty or Common (a Pistol at Military, ID-135): always weaker than a stash
    // of Relic Pump Shotguns, the most dmg/s of any gun.
    const drop = squadDrop(full, ended(full, 'won'))!;
    expect(drop.thrown[0]).toBe(drop.weapon);
    h.showResult(squadScreen(full, ended(full, 'won')));
    const lost = root.querySelector<HTMLElement>('.tile-drop')!;
    expect(lost.classList.contains('tile-drop-lost')).toBe(true);
    expect(lost.querySelector('.tile-thrown')!.textContent).toBe(DROP_LOST_NOTE);
    expect(lost.querySelector('.tile-stash-lost')!.textContent).toBe(
      `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
    );
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

  it('the start screen: goal, wave and squad chips, plain cards, the loss rule by the button', () => {
    const g = squadGame(2, 4);
    const d = squadStart(g).debrief!;
    expect(d.chips.map((c) => c.text)).toEqual([
      'Radio 0/3',
      `${waveCount(4)} waves`,
      `Squad 2/${SQUAD_CAP}`,
    ]);
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

describe('bonus guns on the result screen (ID-122)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    return { root, h };
  }

  /** A seed whose win at Horde `horde` of `g` drops `n` bonus guns. */
  const seedWith = (g: GameState, n: number): number => {
    let seed = 1;
    while (squadDrop(g, ended(g, 'won', seed))!.bonus.length !== n) seed++;
    return seed;
  };

  it('lists each bonus gun after the drop, with the stash count as each goes in', () => {
    const g = squadGame(2, 6);
    const won = ended(g, 'won', seedWith(g, 2));
    const { weapon, bonus } = squadDrop(g, won)!;
    const lines = squadScreen(g, won).lines;
    const at = lines.indexOf(
      `Weapon drop (First clear): ${gunLabel(weapon)} · into the stash (1/${STASH_CAP})`,
    );
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 3)).toEqual([
      `Bonus gun: ${gunLabel(bonus[0]!)} · into the stash (2/${STASH_CAP})`,
      `Bonus gun: ${gunLabel(bonus[1]!)} · into the stash (3/${STASH_CAP})`,
    ]);
    const t = dropTile(g, squadDrop(g, won)!);
    expect(t.stash).toBe(`Stash 3/${STASH_CAP}`);
    expect(t.bonus.map((b) => b.lost)).toEqual([false, false]);
  });

  it('a win with no bonus gun shows no bonus list', () => {
    const { root, h } = page();
    const g = squadGame(1, 6);
    h.showResult(squadScreen(g, ended(g, 'won', seedWith(g, 0))));
    expect(root.querySelector('.tile-drop')).not.toBeNull();
    expect(root.querySelector('.tile-bonus')).toBeNull();
  });

  it('on the page: a compact row per bonus gun, icon decorative, a thrown one greyed', () => {
    const { root, h } = page();
    const stash = Array.from({ length: STASH_CAP - 1 }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const g = squadGame(1, 6, stash);
    const won = ended(g, 'won', seedWith(g, 2));
    const drop = squadDrop(g, won)!;
    h.showResult(squadScreen(g, won));
    const list = root.querySelector<HTMLElement>('.tile-drop .tile-bonus')!;
    expect(list.getAttribute('aria-label')).toBe('Bonus guns');
    const rows = [...list.querySelectorAll<HTMLElement>('.tile-bonus-row')];
    expect(rows).toHaveLength(2);
    for (const [i, row] of rows.entries()) {
      const b = drop.bonus[i]!;
      expect(row.dataset.rarity).toBe(b.rarity);
      expect(row.querySelector('img')!.alt).toBe('');
      expect(row.querySelector('.tile-bonus-name')!.textContent).toBe(
        `Lv 6 ${b.rarity[0]!.toUpperCase()}${b.rarity.slice(1)} ${WEAPONS[b.base].name}`,
      );
    }
    // One slot left: the drop takes it, then each bonus gun throws away the weaker of the
    // win's own guns (all weaker than a Relic LMG), so two of the three go.
    expect(drop.thrown).toHaveLength(2);
    expect(drop.thrown.every((w) => w.uid.startsWith('h6'))).toBe(true);
    for (const [i, row] of rows.entries()) {
      const lost = drop.thrown.includes(drop.bonus[i]!);
      expect(row.classList.contains('tile-bonus-lost')).toBe(lost);
      expect(row.querySelector('.tile-bonus-power')!.textContent).toBe(
        lost ? 'Thrown away' : `${gunPower(drop.bonus[i]!).toFixed(1)} dmg/s`,
      );
    }
    expect(rows.some((r) => r.classList.contains('tile-bonus-lost'))).toBe(true);
    expect(root.querySelector('.tile-drop .tile-stash')!.textContent).toBe(
      drop.thrown.includes(drop.weapon)
        ? `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`
        : `Stash ${STASH_CAP}/${STASH_CAP}`,
    );
    // Text only: a gun's name never reaches the page as markup.
    expect(list.querySelector('b, script')).toBeNull();
  });

  it('names the stronger bonus gun that pushed the drop out, apart from a drop no better than the stash', () => {
    const lmg = (uid: string, rarity: Rarity): OwnedWeapon => ({
      ...gun(uid, 'lmg', rarity),
      level: 9,
    });
    const relics = Array.from({ length: STASH_CAP - 1 }, (_, i) =>
      gun(`c${i + 1}`, 'lmg', 'relic'),
    );
    const weak = gun('h9', 'smg', 'rusty');
    const strong = lmg('h9-1', 'common');
    // One slot left: the drop takes it, then the stronger bonus gun throws the drop out.
    const pushed = dropOf(weak, null, { bonus: [strong], thrown: [weak] });
    expect(dropTile({ armoury: relics }, pushed)).toMatchObject({
      lost: true,
      stash: `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
      thrown: 'Replaced by the stronger bonus gun Lv 9 Common LMG',
    });
    // Already full: the drop itself was no better than the stash.
    const full = [...relics, gun('c99', 'lmg', 'relic')];
    const own = dropOf(weak, null, { bonus: [strong], thrown: [weak, relics.at(-1)!] });
    expect(dropTile({ armoury: full }, own)).toMatchObject({
      lost: true,
      thrown: `${DROP_LOST_NOTE} · Thrown away: Lv 1 Relic LMG`,
    });
  });
});
