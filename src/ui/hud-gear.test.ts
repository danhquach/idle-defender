// @vitest-environment jsdom
// ID-067: the horde-only result screen names a win's weapon drop next to the XP and
// new-survivor lines, and lays the panel out (ID-196: a loot tile, a Squad of avatars and
// names, the start screen's chips and rule). Guns change in the Roster, not on the panel.
// Text reaches the page only through textContent.
import { describe, expect, it } from 'vitest';
import { DROP_GUNS, gunPower, rollWeapon, type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP, STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { xpForLevel } from '../core/stats.ts';
import {
  finishSquadHorde,
  squadDrop,
  startSquadHorde,
  type SquadDrop,
  type GunMove,
} from '../core/hordeonly.ts';
import { waveCount } from '../core/waves.ts';
import {
  createHud,
  DROP_LOST_NOTE,
  dropTile,
  gunLabel,
  JOIN_NO,
  JOIN_YES,
  joinMoves,
  lossXpText,
  SQUAD_LOSS_RULE,
  SQUAD_NO_LEVEL_UPS,
  squadScreen,
  SQUAD_NO_DROP,
  squadStart,
} from './hud.ts';
import { joinCards } from './joining.ts';
import { ART_URLS, GUN_ICON, type GunId } from './sprites.ts';
import { WEAPON_NAME, GUN_ROLE } from './text/index.ts';

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
    // Relic Pump Shotguns, the most DPS of any gun (ID-135), so the drop is the weakest.
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

describe('the debrief layout (ID-067)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    return { root, h };
  }

  it('every DPS figure on the panel is the gun’s own: no survivor’s, no picker (ID-166, ID-196)', () => {
    const { root, h } = page();
    const g = squadGame(2, 3, [gun('h1', 'rifle', 'military')]);
    h.showResult(squadScreen(g, ended(g, 'won')));
    expect(root.querySelector('select:not(#hud-horde-select)')).toBeNull();
    const said = [
      ...[...root.querySelectorAll('*')]
        .filter((e) => e.children.length === 0)
        .map((e) => e.textContent ?? ''),
      ...[...root.querySelectorAll('[title], [aria-label]')].flatMap((e) => [
        e.getAttribute('title') ?? '',
        e.getAttribute('aria-label') ?? '',
      ]),
    ].join(' | ');
    // A bare "17.2 DPS" is the gun's own (ID-176); nothing on the panel is "… DPS with <name>".
    expect([...said.matchAll(/\d+\.\d DPS/g)].length).toBeGreaterThan(0);
    expect(said).not.toMatch(/DPS with/);
  });

  it('a win: waves chip, the drop as a Weapons row, the offer line, a card per level-up', () => {
    const g = squadGame(2, 3);
    const won = ended(g, 'won');
    const { weapon } = squadDrop(g, won)!;
    const d = squadScreen(g, won).debrief!;
    expect(d.kind).toBe('won');
    expect(d.chips[0]).toEqual({ text: `${won.waveCount}/${won.waveCount} waves`, tone: 'ok' });
    expect(d.drop).toEqual(dropTile(g, dropOf(weapon)));
    expect(d.drop!.stash).toBe(`Stash 1/${STASH_CAP}`);
    // The offer line is on every win (ID-150, ID-196); with nobody asking the details say why.
    expect(d.join).toBe(true);
    const full = squadGame(SQUAD_CAP, 3);
    const none = squadScreen(full, ended(full, 'won')).debrief!;
    expect(none.join).toBe(true);
    expect(none.notes!.at(-1)).toMatch(/^Nobody new/);
    // Both fresh survivors level up (ID-134).
    expect(d.cards.map((c) => [c.id, c.levelUp])).toEqual([
      ['recruit-1', true],
      ['recruit-2', true],
    ]);
    expect(d.empty).toBeNull();
    // A card is who they are and nothing else (ID-196): no XP, bar, job or bonus line.
    expect(Object.keys(d.cards[0]!).sort()).toEqual(['art', 'id', 'level', 'levelUp', 'name']);
  });

  describe('a win shows only who levelled up in it (ID-134)', () => {
    // Just into level 30: a level needs 750 more XP.
    const veteran = (n: number) => ({ ...recruit(n), xp: xpForLevel(30) });

    it('a survivor who did not level up gets no card', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const screen = squadScreen(g, ended(g, 'won'));
      expect(screen.debrief!.cards.map((c) => c.id)).toEqual(['recruit-1']);
    });

    it('nobody levelled up: one line in place of the cards', () => {
      const g = { ...squadGame(2, 3), roster: [veteran(1), veteran(2)] };
      const screen = squadScreen(g, ended(g, 'won'));
      expect(screen.debrief!.cards).toEqual([]);
      expect(screen.debrief!.empty).toBe(SQUAD_NO_LEVEL_UPS);
      expect(screen.debrief!.note).toBeNull();
      const { root, h } = page();
      h.showResult(screen);
      expect(root.querySelector('.debrief-empty')!.textContent).toBe(SQUAD_NO_LEVEL_UPS);
      expect(root.querySelectorAll('.squad-card')).toHaveLength(0);
      // No gun rows, no select: guns change in the Roster (ID-196).
      expect(root.querySelector('select:not(#hud-horde-select)')).toBeNull();
      // Best gun for everyone still sits beside the heading: guns change with no card too.
      expect(root.querySelector('.debrief-squad-head .debrief-best-guns')!.textContent).toBe(
        'Best gun for everyone',
      );
    });

    it('only the cards shown are drawn on a win, each an avatar and a name', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const { root, h } = page();
      h.showResult(squadScreen(g, ended(g, 'won')));
      expect(
        [...root.querySelectorAll<HTMLElement>('.squad-card')].map((c) => c.dataset.defender),
      ).toEqual(['recruit-1']);
      expect(root.querySelector('.squad-card select')).toBeNull();
    });

    it('a loss keeps every card, with or without a level-up', () => {
      const g = { ...squadGame(2, 3), roster: [recruit(1), veteran(2)] };
      const d = squadScreen(g, ended(g, 'lost')).debrief!;
      expect(d.cards.map((c) => c.id)).toEqual(['recruit-1', 'recruit-2']);
      expect(d.empty).toBeNull();
    });
  });

  it('the weapons row names what a full stash threw away, or that the drop itself went', () => {
    const relics = Array.from({ length: STASH_CAP }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const weak = gun('h1', 'smg', 'rusty');
    const lost = dropTile({ armoury: relics }, dropOf(weak, weak));
    expect(lost).toMatchObject({
      stash: `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
      thrown: `${DROP_LOST_NOTE} · salvaged for 5 Scrap`,
    });
    expect(lost.guns.map((g) => g.lost)).toEqual([true]);
    expect(dropTile({ armoury: [] }, dropOf(weak, null)).thrown).toBeNull();
    const strong = gun('h2', 'lmg', 'relic');
    const kept = dropTile({ armoury: relics }, dropOf(strong, weak));
    expect(kept).toMatchObject({
      stash: `Stash ${STASH_CAP}/${STASH_CAP}`,
      thrown: 'Thrown away: Lv 1 Rusty SMG · salvaged for 5 Scrap',
    });
    expect(kept.guns[0]).toMatchObject({ rarity: 'relic', short: 'Lv 1 LMG', lost: false });
  });

  it('a gun’s details name its role and trait (ID-101)', () => {
    for (const base of DROP_GUNS) {
      const t = dropTile({ armoury: [] }, dropOf(gun('h1', base, 'rusty')));
      expect(t.guns[0]!.lines).toContain(
        `${GUN_ROLE[base as 'smg'].role}: ${GUN_ROLE[base as 'smg'].trait}`,
      );
    }
    const rifle: OwnedWeapon = {
      ...gun('h1', 'rifle', 'military'),
      affixes: [{ id: 'critDamage', value: 30 }],
    };
    expect(dropTile({ armoury: [] }, dropOf(rifle)).guns[0]!.lines.at(-1)).toBe(
      '+30% crit damage (role)',
    );

    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const won = ended(squadGame(1, 5), 'won');
    h.showResult(squadScreen(squadGame(1, 5), won));
    const dropped = squadDrop(squadGame(1, 5), won)!.weapon;
    const role = `${GUN_ROLE[dropped.base as 'smg'].role}: ${GUN_ROLE[dropped.base as 'smg'].trait}`;
    // Only in the details, so closed it is nowhere on the panel.
    expect(root.querySelector('.debrief-guns')!.textContent).not.toContain(role);
    root.querySelector<HTMLButtonElement>('.gun-chip')!.click();
    expect(root.querySelector('#hud-gun-details')!.textContent).toContain(role);
  });

  it('a gun’s chip icon is the dropped gun’s own icon, for every gun a horde drops (ID-092)', () => {
    for (const base of DROP_GUNS) {
      const t = dropTile({ armoury: [] }, dropOf(gun('h1', base, 'common')));
      expect(t.guns[0]!.icon).toBe(GUN_ICON[base as GunId]);
      expect(ART_URLS[t.guns[0]!.icon]).toBeTruthy();
    }
  });

  it('on the page: the chip’s icon is decorative, beside the level and name; a lost drop greys out (ID-073)', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const won = ended(g, 'won');
    h.showResult(squadScreen(g, won));
    const chip = root.querySelector<HTMLElement>('.debrief-guns .gun-row > .gun-chip')!;
    const img = chip.querySelector<HTMLImageElement>(':scope > .tile-icon > img.gun-icon')!;
    expect(img.alt).toBe('');
    expect(img.getAttribute('src')).toBe(
      ART_URLS[squadScreen(g, won).debrief!.drop!.guns[0]!.icon],
    );
    const dropped = squadDrop(g, won)!.weapon;
    // The level sits in front of the name (ID-098); its DPS is under it.
    expect(chip.querySelector('.gun-chip-text > .gun-chip-name')!.textContent).toBe(
      `Lv ${dropped.level} ${WEAPON_NAME[dropped.base]}`,
    );
    expect(chip.querySelector('.gun-chip-text > .gun-chip-power')!.textContent).toBe(
      `${gunPower(dropped).toFixed(1)} DPS`,
    );
    expect(chip.classList.contains('gun-chip-lost')).toBe(false);
    expect(root.querySelector('.tile-farm')).toBeNull();

    const relics = Array.from({ length: STASH_CAP }, (_, i) =>
      gun(`c${i + 1}`, 'shotgun', 'relic'),
    );
    const full = squadGame(1, 1, relics);
    // Horde 1 drops Rusty or Common (a Pistol at Military, ID-135): always weaker than a stash
    // of Relic Pump Shotguns, the most DPS of any gun.
    const drop = squadDrop(full, ended(full, 'won'))!;
    expect(drop.thrown[0]).toBe(drop.weapon);
    h.showResult(squadScreen(full, ended(full, 'won')));
    const lost = root.querySelector<HTMLElement>('.gun-chip')!;
    expect(lost.classList.contains('gun-chip-lost')).toBe(true);
    expect(lost.querySelector('.gun-chip-power')!.textContent).toBe('Thrown away');
    lost.click();
    expect(root.querySelector('.tile-thrown')!.textContent).toBe(
      `${DROP_LOST_NOTE} · salvaged for 25 Scrap`,
    );
    expect(root.querySelector('.tile-stash')!.textContent).toBe(
      `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
    );
  });

  it('a loss on the page: the no-drop chip, and no Weapons row (ID-073)', () => {
    const { root, h } = page();
    const g = squadGame(2, 3);
    h.showResult(squadScreen(g, ended(g, 'lost')));
    const chips = [...root.querySelectorAll('.debrief-stat')].map((c) => c.textContent);
    expect(chips).toEqual([lossXpText(0), SQUAD_NO_DROP]);
    expect(root.querySelector('.debrief-guns')).toBeNull();
  });

  it('a loss: a callout, the no-XP chip, and the whole squad’s cards before the retry', () => {
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
  });

  it('the start screen: wave and squad chips, plain cards, the loss rule after the squad (ID-196)', () => {
    const g = squadGame(2, 4);
    const d = squadStart(g).debrief!;
    expect(d.chips.map((c) => c.text)).toEqual([`${waveCount(4)} waves`, `Squad 2/${SQUAD_CAP}`]);
    expect(d.note).toBe(SQUAD_LOSS_RULE);
    expect(d.cards.map((c) => c.name)).toEqual(g.roster.map((x) => x.name));
  });

  it('on the page: chips, the chip coloured by rarity, the offer line first (ID-200) and the start button', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const won = ended(g, 'won');
    h.showResult(squadScreen(g, won));
    const panel = root.querySelector<HTMLElement>('.hud-result')!;
    expect(panel.classList.contains('hud-debrief')).toBe(true);
    expect(panel.dataset.kind).toBe('won');
    expect(root.querySelector<HTMLElement>('.hud-result-list')!.hidden).toBe(true);
    expect(root.querySelector('.debrief-stat')!.textContent).toBe(
      `${won.waveCount}/${won.waveCount} waves`,
    );
    const chip = root.querySelector<HTMLElement>('.gun-chip')!;
    expect(chip.dataset.rarity).toBe(squadDrop(g, won)!.weapon.rarity);
    // The offer line (ID-150) comes once the app fills it, first in the body (ID-200).
    const joinBox = root.querySelector<HTMLElement>('.debrief-join')!;
    expect(joinBox.hidden).toBe(true);
    h.showJoin(joinCards(finishSquadHorde(g, won)));
    expect(joinBox.hidden).toBe(false);
    expect(joinBox.parentElement!.firstElementChild).toBe(joinBox);
    expect(joinBox.querySelector('.join-name')!.textContent).toBe(recruit(2).name);
    expect([...joinBox.querySelectorAll('.join-btn')].map((b) => b.textContent)).toEqual([
      JOIN_YES,
      JOIN_NO,
    ]);
    const button = root.querySelector('.hud-start-row > .hud-button')!;
    expect(button.classList.contains('btn-primary')).toBe(true);
  });

  it('a level-up card is an avatar, a name and a triangle, with no stat button, points badge or Undo (ID-146, ID-196)', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult(screen);
    const card = root.querySelector<HTMLElement>('.squad-card')!;
    const c = screen.debrief!.cards[0]!;
    const up = card.querySelector<HTMLElement>('.squad-up')!;
    expect(up.textContent).toBe('▲');
    expect(up.getAttribute('role')).toBe('img');
    expect(up.getAttribute('aria-label')).toBe('Level up');
    expect(up.title).toBe('Level up');
    expect(card.querySelector('.squad-badge-up')).toBeNull();
    expect(card.querySelector('.squad-card-name')!.textContent).toBe(c.name);
    expect(root.querySelector('.squad-card-bonus, .squad-card-xp, .squad-card-level')).toBeNull();
    expect(root.querySelector('.hud-pick-stat')).toBeNull();
    expect(root.querySelector('.squad-plus, .squad-points, .squad-undo')).toBeNull();
    expect(root.textContent).not.toMatch(/stat point|points? left|Undo|Instinct|Sharp Mind/);
  });

  it('the full game’s result screen keeps its plain list and button', () => {
    const { root, h } = page();
    const g = squadGame(1, 5);
    const screen = squadScreen(g, ended(g, 'won'));
    h.showResult({ ...screen, debrief: undefined });
    expect(root.querySelector('.hud-result')!.classList.contains('hud-debrief')).toBe(false);
    expect(root.querySelector('.hud-result-list')!.textContent).toContain('All');
    expect(
      root.querySelector('.hud-start-row > .hud-button')!.classList.contains('btn-primary'),
    ).toBe(false);
  });
});

describe('the debrief panel scrolls (ID-067, ID-196)', () => {
  it('a new screen starts at the top of the body, the part that scrolls', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const g = squadGame(2, 3);
    h.showResult(squadScreen(g, ended(g, 'won')));
    const body = root.querySelector<HTMLElement>('.hud-result-scroll')!;
    body.scrollTop = 300;
    h.showResult(squadStart(g));
    expect(body.scrollTop).toBe(0);
  });
});

describe('bonus guns on the result screen (ID-122)', () => {
  function page() {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const h = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
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
    // The drop first, then the bonus guns; each says what it is in its details.
    expect(t.guns.map((x) => x.lost)).toEqual([false, false, false]);
    expect(t.guns.map((x) => x.lines[0]!.split(' · ')[0])).toEqual([
      'First clear',
      'Bonus gun',
      'Bonus gun',
    ]);
  });

  it('a win with no bonus gun has one chip', () => {
    const { root, h } = page();
    const g = squadGame(1, 6);
    h.showResult(squadScreen(g, ended(g, 'won', seedWith(g, 0))));
    expect(root.querySelectorAll('.debrief-guns .gun-chip')).toHaveLength(1);
  });

  it('on the page: a chip per gun, the icon decorative, a thrown one greyed, no bonus text on a chip', () => {
    const { root, h } = page();
    const stash = Array.from({ length: STASH_CAP - 1 }, (_, i) => gun(`c${i + 1}`, 'lmg', 'relic'));
    const g = squadGame(1, 6, stash);
    const won = ended(g, 'won', seedWith(g, 2));
    const drop = squadDrop(g, won)!;
    h.showResult(squadScreen(g, won));
    const all = [drop.weapon, ...drop.bonus];
    const chips = [...root.querySelectorAll<HTMLElement>('.debrief-guns .gun-row > .gun-chip')];
    expect(chips).toHaveLength(3);
    for (const [i, chip] of chips.entries()) {
      const b = all[i]!;
      expect(chip.dataset.rarity).toBe(b.rarity);
      expect(chip.querySelector('img')!.alt).toBe('');
      expect(chip.querySelector('.gun-chip-name')!.textContent).toBe(`Lv 6 ${WEAPON_NAME[b.base]}`);
      expect(chip.textContent).not.toMatch(/bonus|First clear/i);
    }
    // One slot left: the drop takes it, then each bonus gun throws away the weaker of the
    // win's own guns (all weaker than a Relic LMG), so two of the three go.
    expect(drop.thrown).toHaveLength(2);
    expect(drop.thrown.every((w) => w.uid.startsWith('h6'))).toBe(true);
    for (const [i, chip] of chips.entries()) {
      const lost = drop.thrown.includes(all[i]!);
      expect(chip.classList.contains('gun-chip-lost')).toBe(lost);
      expect(chip.querySelector('.gun-chip-power')!.textContent).toBe(
        lost ? 'Thrown away' : `${gunPower(all[i]!).toFixed(1)} DPS`,
      );
    }
    expect(chips.some((c) => c.classList.contains('gun-chip-lost'))).toBe(true);
    // The stash count and the bonus gun's kind are in the details only.
    chips[1]!.click();
    expect(root.querySelector('.tile-stash')!.textContent).toBe(
      drop.thrown.includes(drop.weapon)
        ? `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`
        : `Stash ${STASH_CAP}/${STASH_CAP}`,
    );
    expect(root.querySelector('#hud-gun-details')!.textContent).toContain('Bonus gun · ');
    // Text only: a gun's name never reaches the page as markup.
    expect(root.querySelector('.debrief-guns')!.querySelector('b, script')).toBeNull();
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
    const a = dropTile({ armoury: relics }, pushed);
    expect(a).toMatchObject({
      stash: `Stash ${STASH_CAP}/${STASH_CAP} · thrown away`,
      thrown: 'Replaced by the stronger bonus gun Lv 9 Common LMG · salvaged for 5 Scrap',
    });
    expect(a.guns.map((x) => x.lost)).toEqual([true, false]);
    // Already full: the drop itself was no better than the stash.
    const full = [...relics, gun('c99', 'lmg', 'relic')];
    const own = dropOf(weak, null, { bonus: [strong], thrown: [weak, relics.at(-1)!] });
    const b = dropTile({ armoury: full }, own);
    expect(b).toMatchObject({
      thrown: `${DROP_LOST_NOTE} · Thrown away: Lv 1 Relic LMG · salvaged for 105 Scrap`,
    });
    expect(b.guns[0]!.lost).toBe(true);
  });
});

describe('joinMoves (ID-181): rounds of Best gun as one', () => {
  const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic');
  const smg = rollWeapon(createRng(2), 'c1', 'smg', 'military');
  // The same gun read back as another object: still the same gun (by uid).
  const relicAgain = { ...relic };
  const move = (id: string, from: GunMove['from'], to: GunMove['to']): GunMove => ({
    id,
    name: id.toUpperCase(),
    from,
    to,
  });

  it('keeps each survivor’s first gun and last gun, in the order they first changed', () => {
    const joined = joinMoves(
      [move('a', 'pistol', relic), move('b', 'pistol', smg)],
      [move('c', 'pistol', relic), move('a', relic, smg)],
    );
    expect(joined).toEqual([
      move('a', 'pistol', smg),
      move('b', 'pistol', smg),
      move('c', 'pistol', relic),
    ]);
  });

  it('leaves out a survivor back on the gun they started with, owned guns by uid', () => {
    expect(joinMoves([move('a', relic, 'pistol')], [move('a', 'pistol', relicAgain)])).toEqual([]);
    expect(joinMoves([move('a', 'pistol', smg)], [move('a', smg, 'pistol')])).toEqual([]);
  });

  it('one round alone comes back as it was', () => {
    const one = [move('a', 'pistol', relic)];
    expect(joinMoves(one, [])).toEqual(one);
    expect(joinMoves([], one)).toEqual(one);
  });
});
