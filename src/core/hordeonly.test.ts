// The horde-only build (ID-066): the new game, the squad on the wall, survivors joining up
// to the cap, loss and retry, no professions, and the fight's limits (cards, cash, perks).
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from './armoury.ts';
import { squadBase } from './base.ts';
import { recruit } from './camp.ts';
import { eligible, rollOffer, UPGRADE_IDS, UPGRADES } from './cards.ts';
import {
  BOSS_UNLOCKS,
  COLUMNS,
  FINALE_HORDE,
  RADIO_HORDES,
  ENEMY_RADIUS,
  FIELD,
  SQUAD_SPAWN_X,
  STEP,
  WALL,
  WEAPONS,
  HORDE_ONLY,
  SQUAD_CAP,
  SQUAD_HP_GROWTH,
  SQUAD_LINE,
  SQUAD_WALL,
  SQUAD_XP_RATE,
  START_PERK,
  START_SKILLS,
} from './data.ts';
import { hordeXp, newGame, type GameState, type RosterDefender } from './game.ts';
import { gunRange, moveDefender, tick } from './horde.ts';
import {
  bossReward,
  capSquad,
  finishSquadHorde,
  isEndless,
  radioParts,
  squadUnlocks,
  joiner,
  SQUAD_CARDS,
  squadHpScale,
  squadOf,
  squadResult,
  spendInFight,
  squadSpec,
  SQUAD_SLOTS,
  startSquadHorde,
} from './hordeonly.ts';
import { gunOf, type Loadout } from './loadout.ts';
import { createRng } from './rng.ts';
import { enemy } from './testing.ts';
import { playSquadHorde } from './sim.ts';
import { horrorAbility } from './waves.ts';
import { critChance, damageFactor, fireRateFactor, reloadTime, spreadOf } from './stats.ts';

const NOW = 1_700_000_000_000;

/** A survivor with `xp`, as the roster holds one. */
const survivor = (no: number, xp = 0): RosterDefender => ({ ...recruit(no), xp });

/** A horde-only game with `n` survivors (recruits 1…n) at Horde `horde`. */
function squadGame(n: number, horde = 1): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: horde,
    roster: Array.from({ length: n }, (_, i) => survivor(i + 1)),
    camp: { ...g.camp, recruits: n },
  };
}

/** Horde `game.hordeNumber` forced to `outcome` on its first step (for finish tests). */
const ended = (game: GameState, outcome: 'won' | 'lost') => ({
  ...startSquadHorde(game, 1, NOW),
  outcome,
});

describe('the horde-only flag and new game (ID-066)', () => {
  it('the build is horde-only', () => {
    expect(HORDE_ONLY).toBe(true);
  });

  it('starts at Horde 1 with one survivor carrying a pistol, no named starters', () => {
    const g = newGame('horde');
    expect(g.hordeNumber).toBe(1);
    expect(g.roster).toHaveLength(1);
    expect(g.roster[0]).toEqual(recruit(1));
    expect(g.roster[0]!.loadout).toEqual({ primary: 'pistol', secondary: null, item: null });
    expect(g.roster.map((d) => d.id)).not.toContain('bob');
    expect(g.camp.recruits).toBe(1);
    expect(g.reserve).toEqual([]);
    // The rest is the full game's, kept as it is: each fight brings its own base.
    expect({ ...g, roster: [], camp: { ...g.camp, recruits: 0 } }).toEqual({
      ...newGame(),
      roster: [],
    });
  });

  it('keeps the full state shape: the same fields as the full game, from the same factory', () => {
    expect(Object.keys(newGame('horde')).sort()).toEqual(Object.keys(newGame()).sort());
    expect(newGame()).toEqual(newGame('full'));
  });

  it('the horde-only base: one wall of the squad tier and nothing else (ID-068)', () => {
    const b = squadBase();
    expect(b.layers).toHaveLength(1);
    expect(b.layers[0]!.slots.every((s) => s !== null && s.tier === SQUAD_WALL)).toBe(true);
    expect(b.layers[0]!.slots.every((s) => s!.hp === s!.maxHp)).toBe(true);
    expect(b.posts).toEqual([]);
    expect(b.turrets).toEqual([]);
    expect(b.traps).toEqual([]);
  });
});

describe('the squad in a horde (ID-066)', () => {
  it('every survivor starts on the firing line, in their slot from the middle out; nobody on the bench', () => {
    const g = squadGame(SQUAD_CAP);
    const s = startSquadHorde(g, 7, NOW);
    expect(s.defenders.map((d) => d.id)).toEqual(g.roster.map((d) => d.id));
    expect(s.defenders.map((d) => s.posts[d.postId]!.kind)).toEqual(Array(SQUAD_CAP).fill('line'));
    expect(s.defenders.map((d) => d.postId)).toEqual([...SQUAD_LINE.order]);
    for (const d of s.defenders) expect(s.posts[d.postId]!.defenderId).toBe(d.id);
    expect(s.bench).toEqual([]);
    expect(s.tookPart).toEqual(g.roster.map((d) => d.id));
  });

  it('fights on a full wall whatever the saved base holds', () => {
    const g = squadGame(2);
    for (const seg of g.base.layers[0]!.slots) if (seg) seg.hp = 1;
    const s = startSquadHorde(g, 7, NOW);
    for (const seg of s.layers[0]!.segments) expect(seg.hp).toBe(seg.maxHp);
  });

  it('only the squad cap fights: the rest of an over-full roster sits out', () => {
    const g = squadGame(SQUAD_CAP + 2);
    expect(startSquadHorde(g, 7, NOW).defenders).toHaveLength(SQUAD_CAP);
    expect(squadOf(g)).toEqual(g.roster.slice(0, SQUAD_CAP));
  });

  it('ignores injuries and patrols: everyone fights', () => {
    const g = squadGame(3);
    g.roster[1]!.injuredUntil = NOW + 1e9;
    expect(startSquadHorde(g, 7, NOW).defenders).toHaveLength(3);
  });

  it('no cash, shop or research; the new game’s skills, free (ID-100); Steady Fire always on at level 1', () => {
    const s = startSquadHorde(squadGame(1), 7, NOW);
    expect(s.cash).toBe(0);
    expect(s.cashRate).toBe(0);
    expect(s.skills).toEqual([...START_SKILLS]);
    expect(s.freeSkills).toEqual({ power: 1 });
    expect(s.research).toEqual([]);
    expect(s.perks).toEqual([START_PERK]);
    expect(s.perkLevels).toEqual({ [START_PERK]: 1 });
    expect(s.turrets).toEqual([]);
  });

  it('beaten boss hordes add their cards to the pool for good, replays included (ID-127)', () => {
    const at = (horde: number, fight = horde) =>
      startSquadHorde(squadGame(1, horde), 7, NOW, fight).research;
    expect(at(10)).toEqual([]);
    expect(at(11)).toEqual(['hollow-points']);
    expect(at(11, 3)).toEqual(['hollow-points']);
    expect(at(20)).toEqual(['hollow-points']);
    expect(at(21)).toEqual(['hollow-points', 'field-repairs']);
    expect(at(40)).toEqual(['hollow-points', 'field-repairs']);
    // Both are cards the squad's pool can offer, once unlocked.
    const s = startSquadHorde(squadGame(1, 21), 7, NOW);
    expect(eligible(s, 'hollow-points')).toBe(true);
    expect(eligible({ ...s, research: [] }, 'hollow-points')).toBe(false);
    expect(eligible(s, 'field-repairs')).toBe(true);
  });

  it('a survivor carries only their primary, with no profession; a non-gun primary becomes the pistol', () => {
    const d: RosterDefender = {
      ...survivor(1),
      loadout: { primary: 'pistol', secondary: 'knife', item: 'shield' },
    };
    expect(squadSpec(d)).toEqual({
      id: d.id,
      name: d.name,
      loadout: { primary: 'pistol', secondary: null, item: null },
      stats: d.stats,
      plain: true,
    });
    const odd = { ...d, loadout: { ...d.loadout, primary: 'knife' as const } };
    expect(squadSpec(odd).loadout.primary).toBe('pistol');
    expect(startSquadHorde({ ...squadGame(1), roster: [d] }, 1, NOW).defenders[0]!.plain).toBe(
      true,
    );
  });

  it('offers only stat, behaviour and barrier cards: no power or recruit cards', () => {
    const allowed = ['stat', 'behaviour', 'barrier'];
    expect(SQUAD_CARDS.every((id) => allowed.includes(UPGRADES[id].category))).toBe(true);
    // Every allowed card is in: the list is the categories, not a hand pick.
    expect([...SQUAD_CARDS].sort()).toEqual(
      UPGRADE_IDS.filter((id) => allowed.includes(UPGRADES[id].category)).sort(),
    );
    // The ID-077 set, and none of the cards it replaced.
    for (const id of [
      'speed-loaders',
      'extended-mags',
      'concussion-rounds',
      'shock-rounds',
      'incendiary-rounds',
      'frag-grenades',
      'barbed-wire',
    ] as const) {
      expect(SQUAD_CARDS).toContain(id);
    }
    for (const gone of [
      'split-shot',
      'explode-on-kill',
      'chain-lightning',
      'cleave',
      'slow-field',
      'spiked-walls',
      'burning-rounds',
      'stopping-power',
    ]) {
      expect(UPGRADE_IDS as readonly string[]).not.toContain(gone);
    }
    const s = startSquadHorde(squadGame(SQUAD_CAP), 3, NOW);
    for (let seed = 1; seed <= 300; seed++) {
      for (const card of rollOffer(createRng(seed), s)) {
        expect(card.kind).toBe('upgrade');
        if (card.kind === 'upgrade') expect(SQUAD_CARDS).toContain(card.id);
      }
    }
  });

  it('enemy HP climbs SQUAD_HP_GROWTH.early per horde to the cap, then late', () => {
    // Hordes 1–3 eased so they're sure wins (ID-097); full growth from Horde 4.
    expect(squadHpScale(1)).toBe(0.8);
    expect(squadHpScale(2)).toBeCloseTo(0.9 * SQUAD_HP_GROWTH.early, 9);
    expect(squadHpScale(3)).toBeCloseTo(0.95 * SQUAD_HP_GROWTH.early ** 2, 9);
    expect(squadHpScale(4)).toBeCloseTo(SQUAD_HP_GROWTH.early ** 3, 9);
    expect(squadHpScale(SQUAD_CAP)).toBeCloseTo(SQUAD_HP_GROWTH.early ** (SQUAD_CAP - 1), 9);
    // Hordes 8–10 eased (ID-102): Brutes join at 8, the first boss at 10. Full growth from 11.
    for (const [n, ease] of [
      [8, 0.85],
      [9, 0.75],
      [10, 0.75],
    ] as const) {
      expect(squadHpScale(n)).toBeCloseTo(
        ease * SQUAD_HP_GROWTH.early ** (SQUAD_CAP - 1) * SQUAD_HP_GROWTH.late ** (n - SQUAD_CAP),
        9,
      );
    }
    // From Horde 11 the last factor holds (ID-128: the size held waves no longer bring).
    for (const n of [SQUAD_CAP + 5, 20, 40]) {
      expect(squadHpScale(n)).toBeCloseTo(
        1.15 * SQUAD_HP_GROWTH.early ** (SQUAD_CAP - 1) * SQUAD_HP_GROWTH.late ** (n - SQUAD_CAP),
        9,
      );
    }
    let s = startSquadHorde(squadGame(1, 3), 2, NOW);
    while (s.enemies.length === 0) s = tick(s, 1);
    expect(s.hpScale).toBeCloseTo(squadHpScale(3), 9);
    expect(s.enemies[0]!.maxHp).toBe(Math.round(s.enemies[0]!.maxHp));
  });
});

describe('no professions (ID-066)', () => {
  const gunner = { loadout: { primary: 'pistol', secondary: null, item: null } } as const;
  const plain = { ...gunner, plain: true } as const;

  it('a plain survivor gets no Gunner fire rate, reload, crit or spread', () => {
    expect(fireRateFactor(plain, 'pistol')).toBe(1);
    expect(fireRateFactor(gunner, 'pistol')).toBeGreaterThan(1);
    expect(reloadTime(plain, 'pistol')).toBeGreaterThan(reloadTime(gunner, 'pistol'));
    expect(critChance(plain)).toBe(0);
    expect(spreadOf(plain, 'pistol')).toBeGreaterThan(spreadOf(gunner, 'pistol'));
  });

  it('a plain survivor keeps their stats (ID-084), and gets no off-profession penalty', () => {
    const stats = { instinct: 10, agility: 10, mind: 10, tinker: 0 };
    expect(critChance({ ...plain, stats })).toBeGreaterThan(0);
    expect(reloadTime({ ...plain, stats }, 'pistol')).toBeLessThan(reloadTime(plain, 'pistol'));
    expect(spreadOf({ ...plain, stats }, 'pistol')).toBeLessThan(spreadOf(plain, 'pistol'));
    // A Ripper's loadout with a specialised gun: the penalty is a profession's, so none.
    const sniper: OwnedWeapon = { uid: 'h1', base: 'sniper', rarity: 'common', affixes: [] };
    const ripper: Loadout = { primary: sniper, secondary: 'knife', item: null };
    expect(damageFactor({ loadout: ripper }, sniper)).toBeLessThan(1);
    expect(damageFactor({ loadout: ripper, plain: true }, sniper)).toBe(1);
    expect(reloadTime({ loadout: ripper, plain: true }, sniper)).toBeLessThan(
      reloadTime({ loadout: ripper }, sniper),
    );
  });
});

describe('after a horde (ID-066)', () => {
  it('a win gives each survivor XP at the squad rate and moves on', () => {
    const g = squadGame(2, 4);
    const next = finishSquadHorde(g, ended(g, 'won'));
    expect(next.hordeNumber).toBe(5);
    const xp = Math.floor(hordeXp(4) * SQUAD_XP_RATE);
    expect(next.roster.slice(0, 2).map((d) => d.xp)).toEqual([xp, xp]);
  });

  it('a win adds one survivor, in the squad for the next horde, with no accept step', () => {
    const g = squadGame(2);
    const next = finishSquadHorde(g, ended(g, 'won'));
    expect(next.roster.map((d) => d.id)).toEqual(['recruit-1', 'recruit-2', 'recruit-3']);
    expect(next.roster[2]).toEqual(recruit(3));
    expect(next.camp.recruits).toBe(3);
    expect(next.camp.offers).toEqual([]);
    expect(startSquadHorde(next, 1, NOW).defenders.map((d) => d.id)).toContain('recruit-3');
    expect(squadResult(g, ended(g, 'won')).joined).toEqual(recruit(3));
  });

  it('at the cap of 6 nobody new joins', () => {
    const g = squadGame(SQUAD_CAP);
    expect(joiner(g)).toBeNull();
    const next = finishSquadHorde(g, ended(g, 'won'));
    expect(next.roster).toHaveLength(SQUAD_CAP);
    expect(next.camp.recruits).toBe(SQUAD_CAP);
    expect(squadResult(g, ended(g, 'won')).joined).toBeNull();
  });

  it('a loss with no wave cleared gives nothing and changes nothing: the same horde again', () => {
    const g = squadGame(3, 6);
    const lost = ended(g, 'lost');
    expect(finishSquadHorde(g, lost)).toBe(g);
    const r = squadResult(g, lost);
    expect(r.gains.map((x) => x.xp)).toEqual([0, 0, 0]);
    expect(r).toMatchObject({ joined: null, drop: null });
  });

  it('a real loss, then the retry: every survivor back at full HP and the wall full', () => {
    const g = squadGame(1, 8);
    const lost = playSquadHorde(g, 1);
    expect(lost.outcome).toBe('lost');
    expect(lost.defenders.length + lost.injured.length).toBe(1);
    expect(lost.layers[0]!.segments.some((seg) => seg.hp < seg.maxHp)).toBe(true);
    const back = finishSquadHorde(g, lost);
    expect(back.hordeNumber).toBe(8);
    expect(back.roster).toEqual(g.roster);
    const again = startSquadHorde(back, 2, NOW);
    expect(again.hordeNumber).toBe(8);
    expect(again.defenders.map((d) => d.hp)).toEqual(again.defenders.map((d) => d.maxHp));
    expect(again.injured).toEqual([]);
    for (const seg of again.layers[0]!.segments) expect(seg.hp).toBe(seg.maxHp);
  });

  it('refuses a horde still on, or another game’s', () => {
    const g = squadGame(1, 3);
    expect(() => finishSquadHorde(g, startSquadHorde(g, 1, NOW))).toThrow(RangeError);
    expect(() => finishSquadHorde({ ...g, hordeNumber: 2 }, ended(g, 'won'))).toThrow(RangeError);
    expect(() => squadResult(g, startSquadHorde(g, 1, NOW))).toThrow(RangeError);
  });

  it('the finale is a win like any other: play goes on as Endless', () => {
    const g = squadGame(SQUAD_CAP, FINALE_HORDE);
    const next = finishSquadHorde(g, ended(g, 'won'));
    expect(next.hordeNumber).toBe(FINALE_HORDE + 1);
    expect(isEndless(g)).toBe(false);
    expect(isEndless(next)).toBe(true);
  });
});

describe('the evacuation goal (ID-127)', () => {
  it('the radio parts are the boss hordes 10, 20 and 30, the last the finale', () => {
    expect(RADIO_HORDES).toEqual([10, 20, 30]);
    expect(FINALE_HORDE).toBe(30);
    for (const n of RADIO_HORDES) expect(horrorAbility(n)).not.toBeNull();
    for (const n of Object.keys(BOSS_UNLOCKS)) expect(RADIO_HORDES).toContain(Number(n));
  });

  it('counts parts from the hordes beaten, so a save needs nothing new', () => {
    const parts = (horde: number): number => radioParts({ hordeNumber: horde });
    expect([1, 10, 11, 20, 21, 30, 31, 99].map(parts)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(isEndless({ hordeNumber: 30 })).toBe(false);
    expect(isEndless({ hordeNumber: 31 })).toBe(true);
    expect(squadUnlocks({ hordeNumber: 1 })).toEqual([]);
  });

  it('a boss horde’s first clear gives its part and unlock; replays and other hordes nothing', () => {
    expect(bossReward({ hordeNumber: 10 }, 10)).toEqual({
      part: 1,
      unlock: 'hollow-points',
      finale: false,
    });
    expect(bossReward({ hordeNumber: 20 }, 20)).toEqual({
      part: 2,
      unlock: 'field-repairs',
      finale: false,
    });
    expect(bossReward({ hordeNumber: 30 }, 30)).toEqual({ part: 3, unlock: null, finale: true });
    expect(bossReward({ hordeNumber: 11 }, 10)).toBeNull();
    expect(bossReward({ hordeNumber: 31 }, 30)).toBeNull();
    expect(bossReward({ hordeNumber: 40 }, 40)).toBeNull();
    expect(bossReward({ hordeNumber: 5 }, 5)).toBeNull();
  });
});

describe('the squad cap on an older roster (ID-066)', () => {
  it('keeps the 6 with the most XP, in roster order; the rest go to the reserve', () => {
    const roster = [10, 50, 0, 40, 30, 20, 60, 5].map((xp, i) => survivor(i + 1, xp));
    const g = { ...newGame('horde'), roster, reserve: [survivor(20)] };
    const capped = capSquad(g);
    expect(capped.roster.map((d) => d.xp)).toEqual([10, 50, 40, 30, 20, 60]);
    expect(capped.reserve.map((d) => d.id)).toEqual(['recruit-20', 'recruit-3', 'recruit-8']);
  });

  it('a tie keeps the earlier one; a roster at the cap or under is left as it is', () => {
    const roster = Array.from({ length: SQUAD_CAP + 1 }, (_, i) => survivor(i + 1, 5));
    expect(capSquad({ ...newGame('horde'), roster }).reserve.map((d) => d.id)).toEqual([
      `recruit-${SQUAD_CAP + 1}`,
    ]);
    const g = squadGame(SQUAD_CAP);
    expect(capSquad(g)).toBe(g);
  });
});

describe('the firing line (ID-068)', () => {
  const front = COLUMNS[0]! + WALL.depth;

  it('six fixed slots in one row behind the wall, spaced evenly top to bottom', () => {
    expect(SQUAD_SLOTS).toHaveLength(SQUAD_CAP);
    for (const p of SQUAD_SLOTS) {
      expect(p.x).toBe(COLUMNS[0]! + SQUAD_LINE.offset);
      expect(p.x).toBeLessThan(COLUMNS[0]!);
    }
    const ys = SQUAD_SLOTS.map((p) => p.y);
    const gap = FIELD.height / SQUAD_CAP;
    expect(ys[0]).toBeCloseTo(gap / 2, 9);
    ys.slice(1).forEach((y, i) => expect(y - ys[i]!).toBeCloseTo(gap, 9));
    expect(FIELD.height - ys.at(-1)!).toBeCloseTo(gap / 2, 9);
  });

  it('every slot is a line post in the fight, in slot order, after the base’s (none)', () => {
    const s = startSquadHorde(squadGame(1), 7, NOW);
    expect(s.posts.map((p) => p.kind)).toEqual(Array(SQUAD_CAP).fill('line'));
    expect(s.posts.map((p) => ({ x: p.x, y: p.y }))).toEqual(SQUAD_SLOTS);
    expect(s.posts.map((p) => p.id)).toEqual(SQUAD_SLOTS.map((_, i) => i));
  });

  it('fills the slots in join order, from the middle out, each slot once', () => {
    expect([...SQUAD_LINE.order].sort((a, b) => a - b)).toEqual(SQUAD_SLOTS.map((_, i) => i));
    for (let n = 1; n <= SQUAD_CAP; n++) {
      const g = squadGame(n);
      const s = startSquadHorde(g, 7, NOW);
      const byId = new Map(s.defenders.map((d) => [d.id, d.postId]));
      expect(g.roster.map((d) => byId.get(d.id))).toEqual(SQUAD_LINE.order.slice(0, n));
      // The rest of the line stays empty.
      expect(s.posts.filter((p) => p.defenderId === null)).toHaveLength(SQUAD_CAP - n);
    }
    // The first two flank the middle; the last two are the ends.
    const mid = FIELD.height / 2;
    const at = (k: number) => SQUAD_SLOTS[SQUAD_LINE.order[k]!]!.y;
    expect(Math.abs(at(0) - mid)).toBeCloseTo(Math.abs(at(1) - mid), 9);
    expect(SQUAD_LINE.order.slice(-2).sort((a, b) => a - b)).toEqual([0, SQUAD_CAP - 1]);
  });

  it('no towers, turrets, ground or wall-walk posts or traps in the fight state', () => {
    for (let n = 1; n <= SQUAD_CAP; n++) {
      const s = startSquadHorde(squadGame(n), 7, NOW);
      expect(s.turrets).toEqual([]);
      expect(s.traps).toEqual([]);
      expect(s.posts.every((p) => p.kind === 'line')).toBe(true);
    }
    // A full game base with towers in the save doesn't leak into the fight.
    const g = squadGame(2);
    expect(g.base.posts.some((p) => p.kind === 'tower')).toBe(true);
    expect(startSquadHorde(g, 7, NOW).posts.some((p) => p.kind !== 'line')).toBe(false);
  });

  it('a slot shoots at a tower’s range: the starting pistol reaches the whole wall from the first slot', () => {
    const s = startSquadHorde(squadGame(1), 7, NOW);
    const first = s.posts[SQUAD_LINE.order[0]!]!;
    expect(gunRange(s, first, 'pistol')).toBe(gunOf('pistol').range * SQUAD_LINE.range);
    const r = ENEMY_RADIUS;
    for (const y of [r, FIELD.height / 2, FIELD.height - r]) {
      expect(Math.hypot(front + r - first.x, y - first.y)).toBeLessThanOrEqual(
        gunRange(s, first, 'pistol'),
      );
    }
  });

  it('with the line full, every gun reaches the wall’s front from some slot', () => {
    const s = startSquadHorde(squadGame(SQUAD_CAP), 7, NOW);
    // The shortest-ranged gun there is, at the line's factor (no range cards yet).
    const shortest = Math.min(
      ...Object.values(WEAPONS)
        .filter((w) => w.kind === 'gun' || w.kind === 'sidearm')
        .map((w) => (w as { range: number }).range),
    );
    expect(gunRange(s, s.posts[0]!, 'pistol')).toBe(
      (WEAPONS.pistol as { range: number }).range * SQUAD_LINE.range,
    );
    for (let y = ENEMY_RADIUS; y <= FIELD.height - ENEMY_RADIUS; y += 4) {
      const near = Math.min(...s.posts.map((p) => Math.hypot(front + ENEMY_RADIUS - p.x, y - p.y)));
      expect(near).toBeLessThanOrEqual(shortest * SQUAD_LINE.range);
    }
  });

  it.each([
    ['in front of the survivor', 0.5],
    ['at the wall’s top end', 0],
    ['at the wall’s bottom end', 1],
  ])('an enemy pressed against the wall %s is shot over the wall', (_, share) => {
    let s = startSquadHorde(squadGame(1), 7, NOW);
    s.toSpawn = 0;
    const y =
      share === 0.5 ? s.defenders[0]!.y : ENEMY_RADIUS + share * (FIELD.height - 2 * ENEMY_RADIUS);
    const e = enemy(s, { x: front + ENEMY_RADIUS, y, hp: 1e6, maxHp: 1e6 });
    s = tick(s, 3);
    const after = s.enemies.find((x) => x.id === e.id)!;
    // Still held at the wall, and hit from behind it.
    expect(after.x).toBeGreaterThanOrEqual(front);
    expect(after.hp).toBeLessThan(1e6);
    expect(s.layers[0]!.segments.every((seg) => seg.hp > 0)).toBe(true);
  });

  it('enemies spawn at the nearer squad spawn edge, inside the field', () => {
    expect(SQUAD_SPAWN_X).toBeLessThan(FIELD.right);
    expect(SQUAD_SPAWN_X).toBeGreaterThan(front);
    let s = startSquadHorde(squadGame(1), 7, NOW);
    expect(s.spawnX).toBe(SQUAD_SPAWN_X);
    s = tick(s, STEP);
    expect(s.enemies.length).toBeGreaterThan(0);
    for (const e of s.enemies) expect(e.x).toBeLessThanOrEqual(SQUAD_SPAWN_X);
    expect(s.enemies[0]!.x).toBeGreaterThan(SQUAD_SPAWN_X - 10);
  });
});

describe('fixed slots (ID-068)', () => {
  it('a survivor can’t move onto an empty slot or off their own', () => {
    const s = startSquadHorde(squadGame(2), 7, NOW);
    const free = s.posts.find((p) => p.defenderId === null)!;
    const moved = moveDefender(s, s.defenders[0]!.id, free.id);
    expect(moved).toEqual({ ok: false, reason: 'Survivors hold their slots' });
  });
});

describe('stat points spent mid-fight (ID-116)', () => {
  /** Two survivors, the first at level 4 (3 points), in a fight with the first down to 40 HP. */
  function fight() {
    const g = squadGame(2);
    const game = { ...g, roster: [survivor(1, 150), g.roster[1]!] };
    const s = startSquadHorde(game, 1, NOW);
    s.defenders[0]!.hp = 40;
    return { game, s };
  }

  it('spends in the camp and on the survivor in the fight at once; nothing it was given changes', () => {
    const { game, s } = fight();
    const before = structuredClone({ game, s });
    const r = spendInFight(game, s, 'recruit-1', 'instinct');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster[0]!.stats.instinct).toBe(1);
    const d = r.horde.defenders[0]!;
    expect(d.stats!.instinct).toBe(1);
    // The extra max HP is added to the HP they have, not a full heal.
    const gain = d.maxHp - s.defenders[0]!.maxHp;
    expect(gain).toBeGreaterThan(0);
    expect(d.hp).toBe(40 + gain);
    expect(r.horde.defenders[1]).toBe(s.defenders[1]);
    expect({ game, s }).toEqual(before);
  });

  it('a Sharp Mind point raises crit in the fight at once', () => {
    const { game, s } = fight();
    const r = spendInFight(game, s, 'recruit-1', 'mind');
    if (!r.ok) throw new Error(r.reason);
    expect(critChance(r.horde.defenders[0]!)).toBeGreaterThan(critChance(s.defenders[0]!));
  });

  it('a survivor down in the fight keeps the point for later; the fight is untouched', () => {
    const { game, s } = fight();
    const [down] = s.defenders.splice(0, 1);
    s.injured.push({
      defender: squadSpec(game.roster[0]!),
      postId: down!.postId,
      at: 1,
      offered: false,
      by: null,
    });
    const r = spendInFight(game, s, 'recruit-1', 'agility');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster[0]!.stats.agility).toBe(1);
    expect(r.horde.defenders).toEqual(s.defenders);
    expect(r.horde.injured).toHaveLength(1);
    expect(r.horde.injured[0]!.defender.stats!.agility).toBe(1);
    expect(s.injured[0]!.defender.stats!.agility).toBe(0);
  });

  it('no point left, or a locked stat, is refused and changes nothing', () => {
    const { game, s } = fight();
    expect(spendInFight(game, s, 'recruit-2', 'mind')).toEqual({
      ok: false,
      reason: 'No stat points left',
    });
    expect(spendInFight(game, s, 'recruit-1', 'tinker')).toEqual({
      ok: false,
      reason: 'Unlocks later',
    });
    // The same point can't be spent twice: 3 points, then refused.
    let g = game;
    let h = s;
    for (let i = 0; i < 3; i++) {
      const r = spendInFight(g, h, 'recruit-1', 'mind');
      if (!r.ok) throw new Error(r.reason);
      ({ game: g, horde: h } = r);
    }
    expect(spendInFight(g, h, 'recruit-1', 'mind').ok).toBe(false);
    expect(h.defenders[0]!.stats!.mind).toBe(3);
  });

  it('a finished horde is refused', () => {
    const { game, s } = fight();
    expect(() => spendInFight(game, { ...s, outcome: 'won' }, 'recruit-1', 'mind')).toThrow(
      RangeError,
    );
  });

  it('the XP a horde pays adds to the spend; the next fight has the stats', () => {
    const { game, s } = fight();
    const r = spendInFight(game, s, 'recruit-1', 'instinct');
    if (!r.ok) throw new Error(r.reason);
    const after = finishSquadHorde(r.game, { ...r.horde, outcome: 'won' });
    expect(after.roster[0]!.stats.instinct).toBe(1);
    expect(after.roster[0]!.xp).toBeGreaterThan(150);
    expect(startSquadHorde(after, 2, NOW, 1).defenders[0]!.stats!.instinct).toBe(1);
  });
});
