// The horde-only build (ID-066): the new game, the squad on the wall, survivors joining up
// to the cap, loss and retry, no professions, and the fight's limits (cards, cash, perks).
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from './armoury.ts';
import { squadBase } from './base.ts';
import { recruit } from './camp.ts';
import { masterGunner, rollOffer, UPGRADE_IDS, UPGRADES } from './cards.ts';
import {
  ENDING_HORDE,
  HORDE_ONLY,
  SQUAD_CAP,
  SQUAD_HP_GROWTH,
  SQUAD_TOWERS,
  SQUAD_WALL,
  SQUAD_XP_RATE,
  START_PERK,
  TITLES,
} from './data.ts';
import { hordeXp, newGame, type GameState, type RosterDefender } from './game.ts';
import { tick } from './horde.ts';
import {
  capSquad,
  finishSquadHorde,
  joiner,
  SQUAD_CARDS,
  squadHpScale,
  squadOf,
  squadResult,
  squadSpec,
  startSquadHorde,
} from './hordeonly.ts';
import type { Loadout } from './loadout.ts';
import { createRng } from './rng.ts';
import { playSquadHorde } from './sim.ts';
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

  it('the horde-only base: one wall of the squad tier and a tower for each squad slot', () => {
    const b = squadBase();
    expect(b.layers).toHaveLength(1);
    expect(b.layers[0]!.slots.every((s) => s !== null && s.tier === SQUAD_WALL)).toBe(true);
    expect(b.layers[0]!.slots.every((s) => s!.hp === s!.maxHp)).toBe(true);
    expect(b.posts.map((p) => [p.kind, p.row])).toEqual(
      [...SQUAD_TOWERS].sort((a, b) => a - b).map((r) => ['tower', r]),
    );
    expect(SQUAD_TOWERS).toHaveLength(SQUAD_CAP);
    expect(b.turrets).toEqual([]);
    expect(b.traps).toEqual([]);
  });
});

describe('the squad in a horde (ID-066)', () => {
  it('every survivor starts on the wall, on their tower from the middle out; nobody on the bench', () => {
    const g = squadGame(SQUAD_CAP);
    const s = startSquadHorde(g, 7, NOW);
    expect(s.defenders.map((d) => d.id)).toEqual(g.roster.map((d) => d.id));
    expect(s.defenders.map((d) => s.posts[d.postId]!.row)).toEqual([...SQUAD_TOWERS]);
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

  it('no cash, shop, skills or research, and Steady Fire always on at level 1', () => {
    const s = startSquadHorde(squadGame(1), 7, NOW);
    expect(s.cash).toBe(0);
    expect(s.cashRate).toBe(0);
    expect(s.skills).toEqual([]);
    expect(s.research).toEqual([]);
    expect(s.perks).toEqual([START_PERK]);
    expect(s.perkLevels).toEqual({ [START_PERK]: 1 });
    expect(s.turrets).toEqual([]);
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

  it('offers only stat, behaviour and barrier cards: no power, Cleave or recruit cards', () => {
    const allowed = ['stat', 'behaviour', 'barrier'];
    expect(SQUAD_CARDS.every((id) => allowed.includes(UPGRADES[id].category))).toBe(true);
    expect(SQUAD_CARDS).not.toContain('cleave');
    // Every allowed card but Cleave is in: the list is the categories, not a hand pick.
    expect([...SQUAD_CARDS].sort()).toEqual(
      UPGRADE_IDS.filter((id) => allowed.includes(UPGRADES[id].category) && id !== 'cleave').sort(),
    );
    const s = startSquadHorde(squadGame(SQUAD_CAP), 3, NOW);
    for (let seed = 1; seed <= 300; seed++) {
      for (const card of rollOffer(createRng(seed), s)) {
        expect(card.kind).toBe('upgrade');
        if (card.kind === 'upgrade') expect(SQUAD_CARDS).toContain(card.id);
      }
    }
  });

  it('enemy HP climbs SQUAD_HP_GROWTH.early per horde to the cap, then late', () => {
    expect(squadHpScale(1)).toBe(1);
    expect(squadHpScale(SQUAD_CAP)).toBeCloseTo(SQUAD_HP_GROWTH.early ** (SQUAD_CAP - 1), 9);
    expect(squadHpScale(SQUAD_CAP + 4)).toBeCloseTo(
      SQUAD_HP_GROWTH.early ** (SQUAD_CAP - 1) * SQUAD_HP_GROWTH.late ** 4,
      9,
    );
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

  it('a plain survivor keeps Aim but gets no title bonus, and no off-profession penalty', () => {
    const top = TITLES.at(-1)!.at;
    const stats = { aim: top, might: 0, tech: 0, grit: 0 };
    const titled = damageFactor({ ...gunner, stats }, 'pistol');
    const bare = damageFactor({ ...plain, stats }, 'pistol');
    expect(bare).toBeGreaterThan(1);
    expect(bare).toBeLessThan(titled);
    // A Ripper's loadout with a specialised gun: the penalty is a profession's, so none.
    const sniper: OwnedWeapon = { uid: 'h1', base: 'sniper', rarity: 'common', affixes: [] };
    const ripper: Loadout = { primary: sniper, secondary: 'knife', item: null };
    expect(damageFactor({ loadout: ripper }, sniper)).toBeLessThan(1);
    expect(damageFactor({ loadout: ripper, plain: true }, sniper)).toBe(1);
    expect(reloadTime({ loadout: ripper, plain: true }, sniper)).toBeLessThan(
      reloadTime({ loadout: ripper }, sniper),
    );
  });

  it('a plain survivor is never a Master Gunner', () => {
    const top = TITLES.at(-1)!.at;
    const d = { ...survivor(1), stats: { aim: top, might: 0, tech: 0, grit: 0 } };
    const s = startSquadHorde({ ...squadGame(1), roster: [d] }, 1, NOW);
    expect(masterGunner(s)).toBe(false);
    const titled = s.defenders.map((x) => {
      const copy = { ...x };
      delete copy.plain;
      return copy;
    });
    expect(masterGunner({ defenders: titled })).toBe(true);
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

  it('a loss gives nothing and changes nothing: the same horde again', () => {
    const g = squadGame(3, 6);
    const lost = ended(g, 'lost');
    expect(finishSquadHorde(g, lost)).toBe(g);
    expect(squadResult(g, lost)).toEqual({ gains: [], joined: null });
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
    expect(() => finishSquadHorde({ ...g, hordeNumber: 4 }, ended(g, 'won'))).toThrow(RangeError);
    expect(() => squadResult(g, startSquadHorde(g, 1, NOW))).toThrow(RangeError);
  });

  it('the ending horde is a win like any other: play goes on', () => {
    const g = squadGame(SQUAD_CAP, ENDING_HORDE);
    expect(finishSquadHorde(g, ended(g, 'won')).hordeNumber).toBe(ENDING_HORDE + 1);
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
