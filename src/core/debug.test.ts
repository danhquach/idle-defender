// Debug mode (ID-197): each debug move is one the game could make itself, through the same
// rules, and out-of-range or malformed input is refused with a reason, never clamped.
import { describe, expect, it } from 'vitest';
import { RARITY_ORDER, SQUAD_CAP, SQUAD_CAP_MAX, STASH_CAP } from './data.ts';
import { OFFER_SIZE, UPGRADE_IDS, UPGRADES } from './cards.ts';
import {
  campXpAt,
  cardsOpen,
  DEBUG_LIMITS,
  downSurvivor,
  fightLock,
  fillStash,
  grantCard,
  grantGun,
  loseNow,
  offerCard,
  reachHorde,
  setCampLevel,
  setScrap,
  setSkill,
  setSquadSize,
  setSurvivorLevel,
  winNow,
  type DebugFight,
  type DebugGame,
} from './debug.ts';
import { campLevelOf } from './camp.ts';
import { recruit } from './camp.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import { tick, type HordeState } from './horde.ts';
import { campOf, finishSquadHorde, isFit, squadOf, startSquadHorde } from './hordeonly.ts';
import { levelOf } from './stats.ts';
import { enemy } from './testing.ts';

const NOW = 1_700_000_000_000;
const game = (): GameState => newGame('horde', 1);
const ok = (r: DebugGame): GameState => {
  if (!r.ok) throw new Error(r.reason);
  return r.game;
};
const okFight = (r: DebugFight): HordeState => {
  if (!r.ok) throw new Error(r.reason);
  return r.state;
};
const reason = (r: DebugGame | DebugFight): string => (r.ok ? 'ok' : r.reason);
/** A horde-only fight under way, a couple of seconds in. */
const fight = (g: GameState = game(), n = g.hordeNumber): HordeState =>
  tick(startSquadHorde(g, 9, NOW, n), 2);

/** Numbers a typed field could still hand over after parsing: none of them in range. */
const HOSTILE_NUMBERS = [-1, 0.5, NaN, Infinity, -Infinity, 1e21, Number.MAX_SAFE_INTEGER + 2];

describe('camp edits (ID-197)', () => {
  it('reaches a horde forward only; a lower one leaves the camp as it is', () => {
    expect(ok(reachHorde(game(), 30)).hordeNumber).toBe(30);
    const at30 = ok(reachHorde(game(), 30));
    expect(ok(reachHorde(at30, 5))).toBe(at30);
  });

  it('sets the camp to the start of a level', () => {
    for (const level of [1, 2, 7, DEBUG_LIMITS.campLevel.max]) {
      const g = ok(setCampLevel(game(), level));
      expect(g.camp.xp).toBe(campXpAt(level));
      expect(campLevelOf(g.camp.xp)).toEqual(expect.objectContaining({ level, into: 0 }));
    }
  });

  it('sets Scrap', () => {
    expect(ok(setScrap(game(), 1234)).stock.scrap).toBe(1234);
  });

  it('refuses every out-of-range or malformed number, and changes nothing', () => {
    const g = game();
    for (const n of [...HOSTILE_NUMBERS, DEBUG_LIMITS.horde.max + 1]) {
      expect(reason(reachHorde(g, n))).toBe('No such horde');
    }
    for (const n of [...HOSTILE_NUMBERS, 0, DEBUG_LIMITS.campLevel.max + 1]) {
      expect(reason(setCampLevel(g, n))).toBe('No such camp level');
    }
    for (const n of [...HOSTILE_NUMBERS, DEBUG_LIMITS.scrap.max + 1]) {
      expect(reason(setScrap(g, n))).toBe('Scrap out of range');
    }
    for (const n of [...HOSTILE_NUMBERS, 0, SQUAD_CAP_MAX + 1]) {
      expect(reason(setSquadSize(g, n, 1))).toBe('No such squad size');
    }
    for (const n of [...HOSTILE_NUMBERS, 0, DEBUG_LIMITS.level.max + 1]) {
      expect(reason(setSurvivorLevel(g, null, n))).toBe('No such level');
    }
    expect(g).toEqual(game());
  });

  it('a squad of n: slots bought past the base cap, recruits added, the rest benched', () => {
    const big = ok(setSquadSize(game(), SQUAD_CAP_MAX, 3));
    expect(squadOf(big)).toHaveLength(SQUAD_CAP_MAX);
    expect(big.slots).toEqual({ squad: SQUAD_CAP_MAX - SQUAD_CAP, stash: 0 });
    expect(big.camp.recruits).toBe(campOf(big).length);
    const one = ok(setSquadSize(big, 1, 3));
    expect(squadOf(one)).toHaveLength(1);
    expect(one.reserve).toHaveLength(SQUAD_CAP_MAX - 1);
    expect(one.slots).toBeUndefined();
    // A short squad is the player's own pick: "Auto" would refill it, so it is off.
    expect(ok(setSquadSize({ ...big, autoSquad: true }, 2, 3)).autoSquad).toBeUndefined();
  });

  it('a squad picks fit survivors only, and adds recruits for the resting', () => {
    const g = ok(setSquadSize(game(), 3, 3));
    const resting = { ...g, roster: g.roster.map((d) => ({ ...d, rest: 2 })) };
    const next = ok(setSquadSize(resting, 3, 3));
    expect(squadOf(next).every(isFit)).toBe(true);
    expect(campOf(next)).toHaveLength(6);
  });

  it('a squad never takes a survivor still asking to join, and a granted gun skips their gun’s uid', () => {
    const at5 = ok(reachHorde(game(), 5));
    const asking = {
      ...recruit(9),
      loadout: {
        primary: { uid: 'h1', base: 'smg', rarity: 'common', affixes: [] },
        secondary: null,
        item: null,
      },
    } as RosterDefender;
    const g: GameState = { ...at5, joining: [asking], camp: { ...at5.camp, recruits: 9 } };
    const next = ok(setSquadSize(g, 4, 3));
    expect(campOf(next).map((d) => d.id)).not.toContain(asking.id);
    expect(next.joining).toEqual([asking]);
    expect(ok(grantGun(g, 'smg', 'common', 1)).armoury.at(-1)!.uid).toBe('h1-1');
  });

  it('sets one survivor’s level, or everyone’s; refuses one not in the camp', () => {
    const g = ok(setSquadSize(game(), 3, 3));
    const id = g.roster[1]!.id;
    const one = ok(setSurvivorLevel(g, id, 12));
    expect(campOf(one).map((d) => levelOf(d.xp).level)).toEqual([1, 12, 1]);
    const all = ok(setSurvivorLevel(g, null, 20));
    expect(campOf(all).every((d) => levelOf(d.xp).level === 20)).toBe(true);
    expect(reason(setSurvivorLevel(g, '__proto__', 5))).toBe('No such survivor');
  });

  it('sets the skill pick, or none; refuses an unknown skill', () => {
    expect(ok(setSkill(game(), null)).skillPick).toEqual([]);
    expect(ok(setSkill(game(), 'airstrike')).skillPick).toEqual(['airstrike']);
    expect(reason(setSkill(game(), 'nuke' as never))).toBe('No such skill');
    expect(reason(setSkill(game(), '__proto__' as never))).toBe('No such skill');
  });
});

describe('guns (ID-197)', () => {
  const at10 = ok(reachHorde(game(), 10));

  it('grants a gun at a rarity as a beaten horde’s drop: its uid and level', () => {
    const g = ok(grantGun(at10, 'smg', 'relic', 4));
    const gun = g.armoury.at(-1)!;
    expect(gun).toEqual(
      expect.objectContaining({ uid: 'h1', base: 'smg', rarity: 'relic', level: 1 }),
    );
    expect(ok(grantGun(g, 'smg', 'relic', 4)).armoury.at(-1)!.uid).toBe('h1-1');
  });

  it('refuses a gun that never drops, at a rarity it never has, or no rarity', () => {
    expect(reason(grantGun(at10, 'knife', 'relic', 1))).toBe('That gun never drops');
    expect(reason(grantGun(at10, '__proto__' as never, 'relic', 1))).toBe('That gun never drops');
    expect(reason(grantGun(at10, 'pistol', 'rusty', 1))).toBe(
      'That gun never drops at that rarity',
    );
    expect(reason(grantGun(at10, 'smg', 'golden' as never, 1))).toBe('No such rarity');
    expect(reason(grantGun(at10, 'smg', '__proto__' as never, 1))).toBe('No such rarity');
  });

  it('refuses a gun with no horde beaten, or a full stash', () => {
    expect(reason(grantGun(game(), 'smg', 'common', 1))).toMatch(/^No horde beaten/);
    const full = ok(fillStash(ok(reachHorde(game(), 40)), STASH_CAP, 2));
    expect(full.armoury).toHaveLength(STASH_CAP);
    expect(reason(grantGun(full, 'smg', 'common', 1))).toBe('The stash is full');
  });

  it('fills the stash to n with unique drops; refuses past the cap, below what it holds, or too few hordes', () => {
    const g = ok(fillStash(at10, 20, 7));
    expect(new Set(g.armoury.map((w) => w.uid)).size).toBe(20);
    expect(g.armoury.every((w) => RARITY_ORDER.includes(w.rarity))).toBe(true);
    expect(reason(fillStash(g, 5, 7))).toBe('The stash holds 20 already');
    expect(reason(fillStash(g, STASH_CAP + 1, 7))).toBe(`The stash holds 0 to ${STASH_CAP}`);
    expect(reason(fillStash(g, NaN, 7))).toBe(`The stash holds 0 to ${STASH_CAP}`);
    // Horde 10 has 9 beaten, three drop uids each.
    expect(reason(fillStash(at10, 28, 7))).toMatch(/^No horde beaten/);
  });
});

describe('fight edits (ID-197)', () => {
  it('lists the cards the fight could offer: in its pool, unlocked, not maxed', () => {
    const s = fight();
    const open = cardsOpen(s);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((id) => s.cardPool!.includes(id))).toBe(true);
    const capped = UPGRADE_IDS.find((id) => open.includes(id) && UPGRADES[id].levels !== null)!;
    const maxed = {
      ...s,
      taken: [...s.taken, capped],
      cardLevels: { ...s.cardLevels, [capped]: UPGRADES[capped].levels! },
    };
    expect(cardsOpen(maxed)).not.toContain(capped);
  });

  it('offers a chosen card first in a full offer, and grants one as a pick', () => {
    const s = fight();
    const id = cardsOpen(s).at(-1)!;
    const offered = okFight(offerCard(s, id));
    expect(offered.offer).toHaveLength(OFFER_SIZE);
    expect(offered.offer![0]).toEqual({ kind: 'upgrade', id });
    expect(new Set(offered.offer!.map((c) => (c.kind === 'upgrade' ? c.id : ''))).size).toBe(
      OFFER_SIZE,
    );
    const granted = okFight(grantCard(s, id));
    expect(granted.taken).toContain(id);
    expect(s.taken).not.toContain(id);
  });

  it('refuses a card it can’t offer, and any move while an offer is open', () => {
    const s = fight();
    expect(reason(offerCard(s, 'no-card' as never))).toBe("That card can't come in this fight");
    for (const id of ['__proto__', 'constructor', 'toString']) {
      expect(reason(offerCard(s, id as never))).toBe("That card can't come in this fight");
      expect(reason(grantCard(s, id as never))).toBe("That card can't come in this fight");
    }
    const offered = okFight(offerCard(s, cardsOpen(s)[0]!));
    expect(fightLock(offered)).toBe('Pick first');
    expect(reason(grantCard(offered, cardsOpen(s)[0]!))).toBe('Pick first');
    expect(reason(winNow(offered))).toBe('Pick first');
  });

  it('downs a survivor: the next step injures them; refuses one not on the line', () => {
    const s = fight(ok(setSquadSize(game(), 3, 3)));
    const id = s.defenders[1]!.id;
    const downed = tick(okFight(downSurvivor(s, id)), 0.1);
    expect(downed.defenders.map((d) => d.id)).not.toContain(id);
    expect(downed.injured.map((i) => i.defender.id)).toContain(id);
    expect(reason(downSurvivor(s, 'nobody'))).toBe('Not on the line');
    expect(reason(downSurvivor(s, '__proto__'))).toBe('Not on the line');
  });

  it('wins by the fight’s own rule, paying no kill XP it did not earn', () => {
    const s = fight();
    enemy(s, {});
    const won = okFight(winNow(s));
    expect(won.outcome).toBe('won');
    expect(won.enemies).toEqual([]);
    expect(won.xp).toBe(s.xp);
    expect(won.bullets).toEqual([]);
    // It finishes as a first clear: the next horde opens.
    expect(finishSquadHorde(game(), won).hordeNumber).toBe(2);
  });

  it('wins a boss horde with its bosses gone', () => {
    const at10 = ok(reachHorde(game(), 10));
    const s = fight(at10);
    expect(s.bosses.length).toBeGreaterThan(0);
    expect(okFight(winNow(s)).outcome).toBe('won');
  });

  it('loses with the whole line injured', () => {
    const s = fight(ok(setSquadSize(game(), 3, 3)));
    const lost = okFight(loseNow(s));
    expect(lost.outcome).toBe('lost');
    expect(lost.defenders).toEqual([]);
    expect(lost.injured).toHaveLength(3);
    expect(lost.offer).toBeNull();
  });

  it('refuses every fight move once the fight is over', () => {
    const lost = okFight(loseNow(fight()));
    expect(reason(winNow(lost))).toBe('The fight is over');
    expect(reason(loseNow(lost))).toBe('The fight is over');
    expect(reason(downSurvivor(lost, 'x'))).toBe('The fight is over');
  });

  it('never changes the state it was given', () => {
    const s = fight();
    const before = structuredClone(s);
    winNow(s);
    loseNow(s);
    offerCard(s, cardsOpen(s)[0]!);
    grantCard(s, cardsOpen(s)[0]!);
    downSurvivor(s, s.defenders[0]!.id);
    expect(s).toEqual(before);
  });
});
