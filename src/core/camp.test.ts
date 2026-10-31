// Design §11, as built ID-033: capacity, camp upgrades, dismiss, the roster floor, and
// camp XP with its level-up picks and their effects.
import { describe, expect, it } from 'vitest';
import type { OwnedWeapon } from './armoury.ts';
import { repairAllCost, repairCost, segmentMaxHp } from './base.ts';
import {
  campAfterPick,
  campLevelOf,
  campSlots,
  campUpgradeCost,
  campXpFor,
  dismiss,
  dismissLock,
  hordeCampOffers,
  NO_PICKS,
  recruit,
  recruitArrivals,
  recoveryMs,
  repairOff,
  takeCampPick,
  treat,
  upgradeCamp,
} from './camp.ts';
import {
  ARMOURY_CAP,
  CAMP_PICK_IDS,
  CAMP_PICK_RANKS,
  CAMP_UPGRADES,
  ENEMIES,
  PATROL,
  RECOVERY_MS,
  RECRUIT_NAMES,
  stockOf,
  TIERS,
  TREATMENT_MS,
  type CampPickId,
} from './data.ts';
import {
  available,
  finishHorde,
  newGame,
  ownedWeapons,
  startHorde,
  type GameState,
  type RosterDefender,
} from './game.ts';
import { removeDead, type HordeState } from './horde.ts';
import { patrolDue, patrolLoot, patrolOutcome, settlePatrols, type Patrol } from './patrol.ts';
import { enemy } from './testing.ts';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const rich = (game: GameState = newGame()): GameState => ({
  ...game,
  stock: stockOf({ scrap: 1000, wood: 1000, metal: 1000, concrete: 1000 }),
});
/** `game` with `n` more defenders, `extra-1`… */
const withExtra = (game: GameState, n: number): GameState => ({
  ...game,
  roster: [
    ...game.roster,
    ...Array.from({ length: n }, (_, i) => ({
      ...game.roster[0]!,
      id: `extra-${i + 1}`,
      name: 'Extra',
    })),
  ],
});
const withPicks = (game: GameState, picks: Partial<Record<CampPickId, number>>): GameState => ({
  ...game,
  camp: { ...game.camp, picks: { ...NO_PICKS, ...picks } },
});
/** Horde `game.hordeNumber` fought to `outcome`. */
function fought(game: GameState, outcome: 'won' | 'lost', seed = 1): HordeState {
  const h = startHorde(game, seed, game.roster[0]!.id, 0, NOW);
  h.outcome = outcome;
  return h;
}

describe('camp capacity and camp upgrades', () => {
  it('starts at 5 slots; each upgrade adds 2, up to 3 upgrades', () => {
    let g = rich();
    expect(campSlots(g)).toBe(5);
    for (const [i, cost] of CAMP_UPGRADES.entries()) {
      expect(campUpgradeCost(g)).toEqual(cost);
      const before = g.stock;
      const r = upgradeCamp(g);
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
      expect(campSlots(g)).toBe(5 + 2 * (i + 1));
      for (const [m, n] of Object.entries(cost)) {
        expect(g.stock[m as keyof typeof before]).toBe(before[m as keyof typeof before] - n);
      }
    }
    expect(campSlots(g)).toBe(11);
    expect(campUpgradeCost(g)).toBeNull();
    expect(upgradeCamp(g)).toEqual({ ok: false, reason: 'The camp is as big as it gets' });
  });

  it('refuses an upgrade the stock cannot cover, and spends nothing', () => {
    const g = { ...newGame(), stock: stockOf({ wood: 59, scrap: 40 }) };
    expect(upgradeCamp(g)).toEqual({ ok: false, reason: 'Not enough materials', short: true });
    expect(g.stock).toEqual(stockOf({ wood: 59, scrap: 40 }));
  });
});

describe('dismiss', () => {
  it('is refused while 3 or fewer are alive', () => {
    const g = newGame();
    expect(dismissLock(g, 'bob')).toBe('Not while 3 or fewer are alive');
    expect(dismiss(g, 'bob')).toEqual({ ok: false, reason: 'Not while 3 or fewer are alive' });
  });

  it('removes a 4th defender for good, their owned weapons to the armoury', () => {
    const gun: OwnedWeapon = { uid: 'h1', base: 'rifle', rarity: 'common', affixes: [] };
    const g = withExtra(newGame(), 1);
    g.roster[3] = { ...g.roster[3]!, loadout: { primary: gun, secondary: 'knife', item: null } };
    const r = dismiss(g, 'extra-1');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.roster.map((d) => d.id)).toEqual(['bob', 'jack', 'john']);
    expect(r.game.armoury).toEqual([gun]);
  });

  it("a full armoury still takes a dismissed defender's weapons: they already count", () => {
    const owned = (i: number): OwnedWeapon => ({
      uid: `h${i + 1}`,
      base: 'rifle',
      rarity: 'rusty',
      affixes: [],
    });
    const g = { ...withExtra(newGame(), 1), hordeNumber: ARMOURY_CAP + 1 };
    g.armoury = Array.from({ length: ARMOURY_CAP - 1 }, (_, i) => owned(i));
    const gun = owned(ARMOURY_CAP - 1);
    g.roster[3] = { ...g.roster[3]!, loadout: { primary: gun, secondary: null, item: null } };
    expect(ownedWeapons(g)).toHaveLength(ARMOURY_CAP);
    const r = dismiss(g, 'extra-1');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.armoury).toHaveLength(ARMOURY_CAP);
    expect(r.game.armoury.at(-1)).toEqual(gun);
  });

  it('is refused for a defender out on patrol; an unknown id throws', () => {
    const g = withExtra(newGame(), 1);
    const p: Patrol = {
      no: 1,
      location: 'gas-station',
      buildings: ['gas-station'],
      focus: 'anything',
      order: 'balanced',
      members: ['extra-1'],
      sentAt: NOW,
      sentHorde: PATROL.unlock,
      strength: 1,
      seed: 1,
    };
    const out = { ...g, patrols: [p], patrolsSent: 1 };
    expect(dismissLock(out, 'extra-1')).toBe('Extra is on patrol');
    expect(dismiss(out, 'extra-1').ok).toBe(false);
    expect(() => dismiss(g, 'nobody')).toThrow(RangeError);
  });
});

describe('camp XP and levels', () => {
  it('levels cost 30 × L: level 2 at 30 XP, level 3 at 90', () => {
    expect(campLevelOf(0)).toEqual({ level: 1, into: 0, next: 30 });
    expect(campLevelOf(29)).toEqual({ level: 1, into: 29, next: 30 });
    expect(campLevelOf(30)).toEqual({ level: 2, into: 0, next: 60 });
    expect(campLevelOf(89)).toEqual({ level: 2, into: 59, next: 60 });
    expect(campLevelOf(90)).toEqual({ level: 3, into: 0, next: 90 });
    expect(() => campLevelOf(-1)).toThrow(RangeError);
    expect(() => campLevelOf(Number.NaN)).toThrow(RangeError);
  });

  it('a win gives half its defender XP, rounded down; a loss gives none', () => {
    expect(campXpFor({ hordeNumber: 1, outcome: 'won' })).toBe(7);
    expect(campXpFor({ hordeNumber: 5, outcome: 'won' })).toBe(17);
    expect(campXpFor({ hordeNumber: 5, outcome: 'lost' })).toBe(0);
  });

  it('finishHorde adds camp XP on a win and none on a loss', () => {
    const g = newGame();
    expect(finishHorde(g, fought(g, 'won'), NOW).camp.xp).toBe(7);
    expect(finishHorde(g, fought(g, 'lost'), NOW).camp.xp).toBe(0);
  });

  it('a level gained offers 3 different picks, the same on the result screen and after', () => {
    const g = { ...newGame(), camp: { ...newGame().camp, xp: 25 } };
    const h = fought(g, 'won');
    const offers = hordeCampOffers(g, h);
    expect(offers).toHaveLength(1);
    expect(new Set(offers[0]!.picks).size).toBe(3);
    expect(offers[0]!.survivor).toBeNull();
    for (const id of offers[0]!.picks) expect(CAMP_PICK_IDS).toContain(id);
    expect(finishHorde(g, h, NOW).camp.offers).toEqual(offers);
    // No level, no offer.
    expect(hordeCampOffers(newGame(), fought(newGame(), 'won'))).toEqual([]);
    expect(hordeCampOffers(g, fought(g, 'lost'))).toEqual([]);
  });

  it('two levels in one win make two offers, picked in turn as the result screen picks them', () => {
    // 29 XP, then Horde 23 pays 62: past 30 and 90, levels 2 and 3.
    const g = { ...newGame(), hordeNumber: 23, camp: { ...newGame().camp, xp: 29 } };
    const after = finishHorde(g, fought(g, 'won'), NOW);
    expect(after.camp.xp).toBe(91);
    expect(after.camp.offers).toHaveLength(2);
    // The HUD walks the offers with campAfterPick; the app replays them with takeCampPick.
    let hud = after.camp;
    let game = after;
    for (const offer of after.camp.offers) {
      const id = offer.picks.find((x) => hud.offers[0]!.picks.includes(x))!;
      const h = campAfterPick(hud, id);
      const t = takeCampPick(game, id);
      if (!h.ok || !t.ok) throw new Error('pick refused');
      hud = h.camp;
      game = t.game;
    }
    expect(game.camp).toEqual(hud);
    expect(game.camp.offers).toEqual([]);
    expect(CAMP_PICK_IDS.reduce((n, id) => n + game.camp.picks[id], 0)).toBe(2);
  });

  it('offers vary with the fight and never hold a pick at the top rank', () => {
    const g = withPicks(
      { ...newGame(), camp: { ...newGame().camp, xp: 25 } },
      {
        scavenging: CAMP_PICK_RANKS,
        stockpile: CAMP_PICK_RANKS,
        salvage: CAMP_PICK_RANKS,
      },
    );
    const seen = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const [offer] = hordeCampOffers(g, fought(g, 'won', seed));
      expect([...offer!.picks].sort()).toEqual(['foraging', 'medic']);
    }
    const plain = { ...newGame(), camp: { ...newGame().camp, xp: 25 } };
    for (let seed = 1; seed < 30; seed++) {
      seen.add(JSON.stringify(hordeCampOffers(plain, fought(plain, 'won', seed))));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('camp-level picks', () => {
  const offered = (offers: CampPickId[][]): GameState => ({
    ...newGame(),
    camp: { ...newGame().camp, offers: offers.map((picks) => ({ picks, survivor: null })) },
  });

  it('takes a pick from the oldest offer: a rank up, the offer gone', () => {
    const r = takeCampPick(offered([['medic', 'salvage', 'foraging'], ['medic']]), 'salvage');
    if (!r.ok) throw new Error(r.reason);
    expect(r.game.camp.picks.salvage).toBe(1);
    expect(r.game.camp.offers).toEqual([{ picks: ['medic'], survivor: null }]);
  });

  it('refuses a pick not on the oldest offer, or with none waiting', () => {
    expect(takeCampPick(offered([['medic']]), 'salvage').ok).toBe(false);
    expect(takeCampPick(newGame(), 'medic')).toEqual({
      ok: false,
      reason: 'No camp pick waiting',
    });
  });

  it('a pick reaching the top rank leaves later offers; one left empty is dropped', () => {
    const g = withPicks(offered([['medic'], ['medic', 'salvage'], ['medic']]), {
      medic: CAMP_PICK_RANKS - 1,
    });
    const r = campAfterPick(g.camp, 'medic');
    if (!r.ok) throw new Error(r.reason);
    expect(r.camp.picks.medic).toBe(CAMP_PICK_RANKS);
    expect(r.camp.offers).toEqual([{ picks: ['salvage'], survivor: null }]);
  });
});

describe('camp-level pick effects', () => {
  it('Scavenging raises kill cash 5% a rank; Stockpile starts each horde with 10 cash a rank', () => {
    const g = withPicks(newGame(), { scavenging: 2, stockpile: 3 });
    const h = startHorde(g, 1, 'bob', 0, NOW);
    expect(h.cash).toBe(30);
    expect(h.cashRate).toBeCloseTo(1.1);
    enemy(h, { hp: 0 });
    removeDead(h);
    expect(h.cash).toBeCloseTo(30 + ENEMIES.shambler.cash * 1.1);
    const plain = startHorde(newGame(), 1, 'bob', 0, NOW);
    expect([plain.cash, plain.cashRate]).toEqual([0, 1]);
  });

  it('Salvage Crew takes 10% a rank off repairs, rounded up', () => {
    const g = withPicks(newGame(), { salvage: 2 });
    const seg = { ...g.base.layers[0]!.slots[0]!, hp: 0 };
    expect(repairOff(g.camp)).toBe(20);
    const full = repairCost(seg);
    const off = repairCost(seg, repairOff(g.camp));
    expect(off.wood).toBe(Math.ceil(full.wood * 0.8));
    expect(off.wood).toBeLessThan(full.wood);
    const base = structuredClone(g.base);
    base.layers[0]!.slots[0]!.hp = 0;
    expect(repairAllCost(base, 20).wood).toBe(off.wood);
  });

  it('rounds a discounted repair up from the exact share, never a whole over', () => {
    // ceil(cost × lost × (100 − off) / (maxHp × 100)) in whole numbers.
    const exact = (cost: number, lost: number, whole: number, off: number) =>
      Math.floor((cost * lost * (100 - off) + whole * 100 - 1) / (whole * 100));
    for (const tier of ['wood', 'metal', 'concrete', 'reinforced'] as const) {
      for (const kind of ['wall', 'gate'] as const) {
        const maxHp = segmentMaxHp(kind, tier);
        for (let hp = 0; hp <= maxHp; hp++) {
          for (const off of [10, 20, 30, 40, 50]) {
            const cost = repairCost({ kind, tier, hp, maxHp }, off);
            for (const [m, n] of Object.entries(TIERS[tier].cost)) {
              expect(cost[m as keyof typeof cost]).toBe(exact(n, maxHp - hp, maxHp, off));
            }
          }
        }
      }
    }
  });

  it('Field Medic cuts the rest 10% a rank, for a horde injury and a patrol one', () => {
    const g = withPicks(newGame(), { medic: 3 });
    expect(recoveryMs(g.camp)).toBe(RECOVERY_MS * 0.7);
    const h = fought(g, 'lost');
    const [bob] = h.defenders.splice(0, 1);
    h.injured.push({ defender: bob!, postId: 0, at: h.time, offered: true, by: 'shambler' });
    expect(finishHorde(g, h, NOW).roster[0]!.injuredUntil).toBe(NOW + RECOVERY_MS * 0.7);
  });

  it('Foraging adds 5% a rank to patrol materials and Gas, to the nearest whole', () => {
    const p: Patrol = {
      no: 1,
      location: 'supermarket',
      buildings: ['supermarket'],
      focus: 'anything',
      order: 'balanced',
      members: ['bob'],
      sentAt: NOW,
      sentHorde: PATROL.unlock,
      strength: 1e6,
      seed: 3,
    };
    const base: GameState = {
      ...newGame(),
      hordeNumber: PATROL.unlock,
      patrols: [p],
      patrolsSent: 1,
    };
    const haul = patrolLoot(p);
    const plain = settlePatrols(base, patrolDue(p));
    const more = settlePatrols(withPicks(base, { foraging: 5 }), patrolDue(p));
    expect(more.reports[0]!.stock.food).toBe(Math.round(haul.stock.food * 1.25));
    expect(plain.reports[0]!.stock.food).toBe(haul.stock.food);
    expect(more.reports[0]!.gas).toBe(Math.round(haul.gas * 1.25));
  });
});

describe('the roster floor', () => {
  const two = (): GameState => ({ ...newGame(), roster: newGame().roster.slice(0, 2) });

  it('starts its clock when fewer than 3 are alive; a recruit arrives an hour later', () => {
    const started = recruitArrivals(two(), NOW);
    expect(started.camp.recruitAt).toBe(NOW + HOUR);
    expect(started.roster).toHaveLength(2);
    expect(recruitArrivals(started, NOW + HOUR - 1)).toBe(started);
    const after = recruitArrivals(started, NOW + HOUR);
    expect(after.roster).toHaveLength(3);
    expect(after.roster[2]).toEqual(recruit(1));
    expect(after.camp).toMatchObject({ recruitAt: null, recruits: 1 });
  });

  it('catches up while closed, up to the floor, then stops', () => {
    const one: GameState = { ...newGame(), roster: newGame().roster.slice(0, 1) };
    const started = recruitArrivals(one, NOW);
    const later = recruitArrivals(started, NOW + 10 * HOUR);
    expect(later.roster.map((d) => d.id)).toEqual(['bob', 'recruit-1', 'recruit-2']);
    expect(later.camp.recruitAt).toBeNull();
    expect(recruitArrivals(later, NOW + 20 * HOUR)).toBe(later);
  });

  it('a recruit is level 1 with a Rusty pistol and a name from the list', () => {
    const r: RosterDefender = recruit(7);
    expect(r).toMatchObject({
      id: 'recruit-7',
      xp: 0,
      injuredUntil: null,
      loadout: { primary: 'pistol', secondary: null, item: null },
    });
    expect(RECRUIT_NAMES).toContain(r.name);
  });

  it('does nothing at the floor, and stops a clock left running', () => {
    const g = newGame();
    expect(recruitArrivals(g, NOW)).toBe(g);
    const stale = { ...g, camp: { ...g.camp, recruitAt: NOW } };
    expect(recruitArrivals(stale, NOW + HOUR).camp.recruitAt).toBeNull();
    expect(recruitArrivals(stale, NOW + HOUR).roster).toHaveLength(3);
  });

  it('counts the living roster, not who is home: a party out does not start it', () => {
    const p: Patrol = {
      no: 1,
      location: 'gas-station',
      buildings: ['gas-station'],
      focus: 'anything',
      order: 'balanced',
      members: ['bob', 'jack'],
      sentAt: NOW,
      sentHorde: PATROL.unlock,
      strength: 1,
      seed: 1,
    };
    const out: GameState = { ...newGame(), patrols: [p], patrolsSent: 1 };
    expect(recruitArrivals(out, NOW)).toBe(out);
  });

  it('a death on patrol starts the clock from when the party came back', () => {
    let p: Patrol | null = null;
    for (let seed = 0; seed < 500 && !p; seed++) {
      const c: Patrol = {
        no: 1,
        location: 'military',
        buildings: ['military'],
        focus: 'anything',
        order: 'balanced',
        members: ['bob'],
        sentAt: NOW,
        sentHorde: PATROL.unlock,
        strength: 0,
        seed,
      };
      if (patrolOutcome(c).dead.includes('bob')) p = c;
    }
    if (!p) throw new Error('no seed kills Bob');
    const g: GameState = { ...newGame(), hordeNumber: PATROL.unlock, patrols: [p], patrolsSent: 1 };
    const late = patrolDue(p) + 5 * HOUR;
    const back = settlePatrols(g, late);
    expect(back.roster).toHaveLength(2);
    expect(back.camp.recruitAt).toBe(patrolDue(p) + HOUR);
    // Already due: it arrives as soon as the game runs again.
    expect(recruitArrivals(back, late).roster).toHaveLength(3);
  });
});

describe('injury recovery with Food and Medicine (ID-031)', () => {
  const MIN = 60_000;
  /** A new game with Bob injured for a full rest from `NOW`, and `stock`. */
  const hurt = (stock: Parameters<typeof stockOf>[0], rest = RECOVERY_MS): GameState => {
    const g = newGame();
    return {
      ...g,
      stock: stockOf(stock),
      roster: g.roster.map((d) => (d.id === 'bob' ? { ...d, injuredUntil: NOW + rest } : d)),
    };
  };
  const bob = (g: GameState): RosterDefender => g.roster.find((d) => d.id === 'bob')!;
  const ok = (r: ReturnType<typeof treat>): GameState => {
    if (!r.ok) throw new Error(r.reason);
    return r.game;
  };

  it('each Food cuts 30 minutes and each Medicine 60, and both are used up', () => {
    expect(TREATMENT_MS).toEqual({ food: 30 * MIN, medicine: 60 * MIN });
    const g = hurt({ food: 3, medicine: 2 });
    const fed = ok(treat(g, 'bob', 'food', NOW));
    expect(bob(fed).injuredUntil).toBe(NOW + RECOVERY_MS - 30 * MIN);
    expect(fed.stock).toEqual(stockOf({ food: 2, medicine: 2 }));
    const dosed = ok(treat(fed, 'bob', 'medicine', NOW));
    expect(bob(dosed).injuredUntil).toBe(NOW + RECOVERY_MS - 90 * MIN);
    expect(dosed.stock).toEqual(stockOf({ food: 2, medicine: 1 }));
    // Nobody else is touched, and the game handed in is unchanged.
    expect(dosed.roster.filter((d) => d.id !== 'bob')).toEqual(g.roster.slice(1));
    expect(bob(g).injuredUntil).toBe(NOW + RECOVERY_MS);
    expect(g.stock).toEqual(stockOf({ food: 3, medicine: 2 }));
  });

  it('4 Food or 2 Medicine is a full recovery: fit at once, free to defend', () => {
    let fed = hurt({ food: 4 });
    for (let i = 0; i < 4; i += 1) fed = ok(treat(fed, 'bob', 'food', NOW));
    expect(bob(fed).injuredUntil).toBeNull();
    expect(fed.stock.food).toBe(0);
    let dosed = hurt({ medicine: 2 });
    for (let i = 0; i < 2; i += 1) dosed = ok(treat(dosed, 'bob', 'medicine', NOW));
    expect(bob(dosed).injuredUntil).toBeNull();
    expect(available(bob(dosed), NOW)).toBe(true);
    expect(() => startHorde(dosed, 1, 'bob', 0, NOW)).not.toThrow();
  });

  it('a cut longer than the rest left heals at once, and the item is still used up', () => {
    const g = hurt({ medicine: 1 }, 10 * MIN);
    const r = ok(treat(g, 'bob', 'medicine', NOW));
    expect(bob(r).injuredUntil).toBeNull();
    expect(r.stock.medicine).toBe(0);
  });

  it('Field Medic shortens the rest, not the cut; the cut counts from the rest left', () => {
    const medic = withPicks(newGame(), { medic: 1 });
    const g = withPicks(hurt({ food: 1 }, recoveryMs(medic.camp)), { medic: 1 });
    const later = NOW + 20 * MIN;
    expect(bob(ok(treat(g, 'bob', 'food', later))).injuredUntil).toBe(
      NOW + RECOVERY_MS * 0.9 - 30 * MIN,
    );
  });

  it('a cut that lands exactly on now heals at once', () => {
    const g = hurt({ food: 1 }, 30 * MIN);
    expect(bob(ok(treat(g, 'bob', 'food', NOW))).injuredUntil).toBeNull();
  });

  it('refuses a defender who is not injured or has healed, and with none left; spends nothing', () => {
    const g = hurt({ food: 0, medicine: 1 });
    expect(treat(g, 'jack', 'medicine', NOW)).toEqual({ ok: false, reason: "Jack isn't injured" });
    expect(treat(g, 'bob', 'medicine', NOW + RECOVERY_MS)).toEqual({
      ok: false,
      reason: "Bob isn't injured",
    });
    expect(treat(g, 'bob', 'food', NOW)).toEqual({
      ok: false,
      reason: 'No food left',
      short: true,
    });
    expect(g.stock).toEqual(stockOf({ medicine: 1 }));
  });

  it('throws on an unknown defender or a bad time', () => {
    const g = hurt({ food: 1 });
    expect(() => treat(g, 'nobody', 'food', NOW)).toThrow(RangeError);
    expect(() => treat(g, 'bob', 'food', Number.NaN)).toThrow(RangeError);
    for (const item of ['bandage', 'toString', '__proto__']) {
      expect(() => treat(g, 'bob', item as 'food', NOW)).toThrow(RangeError);
    }
  });
});
