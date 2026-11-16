// ID-179: Scrap from wins and thrown-away guns, bought squad and stash slots, and the firing
// line for a squad of 7 or 8.
import { describe, expect, it } from 'vitest';
import {
  MAX_COUNT,
  RARITIES,
  SQUAD_CAP,
  SQUAD_LINE,
  SQUAD_SCRAP,
  SQUAD_SLOT_COSTS,
  STASH_CAP,
  STASH_SLOT,
  FIELD,
} from './data.ts';
import { recruit } from './camp.ts';
import type { OwnedWeapon } from './armoury.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import type { HordeState } from './horde.ts';
import {
  buySquadSlot,
  buyStashSlots,
  capSquad,
  fillSquad,
  finishSquadHorde,
  letGo,
  nextSquadSlotCost,
  nextStashSlotCost,
  squadCap,
  squadLine,
  squadOf,
  squadResult,
  SQUAD_SLOTS,
  stashCap,
  stashWith,
  startSquadHorde,
  toggleSquad,
  winScrap,
} from './hordeonly.ts';

const NOW = 1_700_000_000_000;

const people = (n: number): RosterDefender[] => Array.from({ length: n }, (_, i) => recruit(i + 1));

/** A horde-only camp at Horde `horde` with `squad` in the squad and `bench` on the bench. */
function camp(squad: number, bench = 0, horde = 3, scrap = 0): GameState {
  const g = newGame('horde');
  const all = people(squad + bench);
  return {
    ...g,
    hordeNumber: horde,
    roster: all.slice(0, squad),
    reserve: all.slice(squad),
    camp: { ...g.camp, recruits: squad + bench },
    stock: { ...g.stock, scrap },
  };
}

const ended = (game: GameState, outcome: 'won' | 'lost', seed = 1, horde?: number): HordeState => ({
  ...startSquadHorde(game, seed, NOW, horde),
  outcome,
  wave: outcome === 'won' ? 99 : 1,
});

const rusty = (uid: string): OwnedWeapon => ({ uid, base: 'smg', rarity: 'rusty', affixes: [] });
const stashOf = (n: number): OwnedWeapon[] =>
  Array.from({ length: n }, (_, i) => rusty(`c${i + 1}`));

describe('Scrap earned (ID-179)', () => {
  it('a first-clear win pays base + per-horde × the horde number', () => {
    const g = camp(2, 0, 4, 7);
    const next = finishSquadHorde(g, ended(g, 'won'));
    expect(next.stock.scrap).toBe(7 + SQUAD_SCRAP.base + SQUAD_SCRAP.perHorde * 4);
    expect(winScrap(4)).toBe(30);
  });

  it('a replay win pays by the replayed horde', () => {
    const g = camp(2, 0, 4, 0);
    const next = finishSquadHorde(g, ended(g, 'won', 1, 2));
    expect(next.stock.scrap).toBe(winScrap(2));
  });

  it('a loss pays nothing', () => {
    const g = camp(2, 0, 4, 7);
    const next = finishSquadHorde(g, ended(g, 'lost'));
    expect(next.stock.scrap).toBe(7);
    expect(squadResult(g, ended(g, 'lost')).scrap).toEqual({ total: 0, salvage: 0, now: 7 });
  });

  it("guns thrown away from a full stash are salvaged by rarity, the win's own included", () => {
    const g = { ...camp(2, 0, 3, 0), armoury: stashOf(STASH_CAP) };
    const horde = ended(g, 'won');
    const result = squadResult(g, horde);
    const thrown = result.drop!.thrown;
    expect(thrown.length).toBeGreaterThan(0);
    const salvage = thrown.reduce((t, w) => t + RARITIES[w.rarity].salvage, 0);
    expect(result.scrap).toEqual({
      total: winScrap(3) + salvage,
      salvage,
      now: winScrap(3) + salvage,
    });
    expect(finishSquadHorde(g, horde).stock.scrap).toBe(winScrap(3) + salvage);
    expect(finishSquadHorde(g, horde).armoury.length).toBe(STASH_CAP);
  });

  it('adds Scrap without touching the fight, the drop or the RNG stream', () => {
    const g = camp(3, 2, 3, 0);
    const horde = ended(g, 'won', 5);
    const poor = finishSquadHorde(g, horde);
    const rich = finishSquadHorde({ ...g, stock: { ...g.stock, scrap: 999 } }, horde);
    expect({ ...rich, stock: poor.stock }).toEqual(poor);
    // The same fight, whatever the Scrap: the squad's start state is identical.
    expect(startSquadHorde({ ...g, stock: { ...g.stock, scrap: 999 } }, 5, NOW)).toEqual(
      startSquadHorde(g, 5, NOW),
    );
  });

  it('letting a survivor go salvages the gun a full stash throws away', () => {
    const base = camp(SQUAD_CAP, 1, 3, 0);
    const holder = base.roster[0]!;
    const g: GameState = {
      ...base,
      armoury: stashOf(STASH_CAP),
      roster: [
        { ...holder, loadout: { ...holder.loadout, primary: rusty('held') } },
        ...base.roster.slice(1),
      ],
    };
    const r = letGo(g, holder.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const salvage = r.thrown.reduce((t, w) => t + RARITIES[w.rarity].salvage, 0);
    expect(salvage).toBeGreaterThan(0);
    expect(r.game.stock.scrap).toBe(salvage);
  });
});

describe('Scrap is capped where a save reads it (ID-179)', () => {
  it.each([MAX_COUNT, MAX_COUNT - 1])('a win from %i Scrap ends at MAX_COUNT', (scrap) => {
    const g = camp(2, 0, 4, scrap);
    expect(finishSquadHorde(g, ended(g, 'won')).stock.scrap).toBe(MAX_COUNT);
  });

  it('the displayed total is what was actually added', () => {
    const g = camp(2, 0, 4, MAX_COUNT - 1);
    const r = squadResult(g, ended(g, 'won')).scrap;
    expect(r).toEqual({ total: 1, salvage: 0, now: MAX_COUNT });
    const full = camp(2, 0, 4, MAX_COUNT);
    expect(squadResult(full, ended(full, 'won')).scrap.total).toBe(0);
  });

  it.each([MAX_COUNT, MAX_COUNT - 1])(
    'salvage alone (a let-go) from %i ends at MAX_COUNT',
    (scrap) => {
      const base = camp(SQUAD_CAP, 1, 3, scrap);
      const holder = base.roster[0]!;
      const g: GameState = {
        ...base,
        armoury: stashOf(STASH_CAP),
        roster: [
          { ...holder, loadout: { ...holder.loadout, primary: rusty('held') } },
          ...base.roster.slice(1),
        ],
      };
      const r = letGo(g, holder.id);
      expect(r.ok && r.game.stock.scrap).toBe(MAX_COUNT);
    },
  );
});

describe('caps and buying (ID-179)', () => {
  it('start at the base caps; each purchase raises them', () => {
    const g = camp(2);
    expect(squadCap(g)).toBe(SQUAD_CAP);
    expect(stashCap(g)).toBe(STASH_CAP);
    expect(squadCap({ slots: { squad: 2, stash: 4 } })).toBe(SQUAD_CAP + 2);
    expect(stashCap({ slots: { squad: 2, stash: 4 } })).toBe(STASH_CAP + 4 * STASH_SLOT.add);
    expect(stashCap({ slots: { squad: 2, stash: 4 } })).toBe(80);
  });

  it('prices step up and end at null', () => {
    expect(nextSquadSlotCost({})).toBe(SQUAD_SLOT_COSTS[0]);
    expect(nextSquadSlotCost({ slots: { squad: 1, stash: 0 } })).toBe(SQUAD_SLOT_COSTS[1]);
    expect(nextSquadSlotCost({ slots: { squad: 2, stash: 0 } })).toBeNull();
    expect(nextStashSlotCost({})).toBe(STASH_SLOT.costs[0]);
    expect(nextStashSlotCost({ slots: { squad: 0, stash: 3 } })).toBe(STASH_SLOT.costs[3]);
    expect(nextStashSlotCost({ slots: { squad: 0, stash: 4 } })).toBeNull();
  });

  it('buys a squad slot: spends the Scrap, raises the cap, fills it from the bench', () => {
    const g = camp(SQUAD_CAP, 2, 3, 600);
    const r = buySquadSlot(g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.stock.scrap).toBe(100);
    expect(r.game.slots).toEqual({ squad: 1, stash: 0 });
    expect(squadCap(r.game)).toBe(7);
    expect(r.game.roster).toHaveLength(7);
    expect(r.game.reserve).toHaveLength(1);
    // Pure: the old game is untouched.
    expect(g.stock.scrap).toBe(600);
    expect(g.slots).toBeUndefined();
  });

  it('buys stash slots: +10 a time, the stash then holds more', () => {
    const g = { ...camp(2, 0, 3, 150), armoury: stashOf(STASH_CAP) };
    const r = buyStashSlots(g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.stock.scrap).toBe(0);
    expect(stashCap(r.game)).toBe(STASH_CAP + STASH_SLOT.add);
    const into = stashWith(r.game.armoury, [rusty('new')], stashCap(r.game));
    expect(into.thrown).toHaveLength(0);
    expect(into.armoury).toHaveLength(STASH_CAP + 1);
  });

  it('refuses with too little Scrap, saying how many it needs', () => {
    const g = camp(2, 0, 3, 499);
    expect(buySquadSlot(g)).toEqual({ ok: false, reason: 'Needs 500 Scrap' });
    expect(buyStashSlots({ ...g, stock: { ...g.stock, scrap: 149 } })).toEqual({
      ok: false,
      reason: 'Needs 150 Scrap',
    });
  });

  it('refuses at the most slots', () => {
    const g = { ...camp(2, 0, 3, 99999), slots: { squad: 2, stash: 4 } };
    const a = buySquadSlot(g);
    const b = buyStashSlots(g);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });

  it('squad size: toggle, fill and cap follow the bought slots', () => {
    const g = { ...camp(SQUAD_CAP, 2), slots: { squad: 1, stash: 0 } };
    expect(squadOf(g)).toHaveLength(SQUAD_CAP);
    const joined = toggleSquad(g, g.reserve[0]!.id);
    expect(joined.ok).toBe(true);
    const full = { ...g, slots: { squad: 2, stash: 0 } };
    expect(fillSquad(full).roster).toHaveLength(8);
    expect(fillSquad(full).reserve).toHaveLength(0);
    // Without the slots the same roster is cut to 6.
    const eight = fillSquad(full);
    expect(capSquad({ ...eight, slots: undefined }).roster).toHaveLength(SQUAD_CAP);
    expect(capSquad(eight).roster).toHaveLength(8);
  });
});

describe('the firing line for 7 and 8 (ID-179)', () => {
  it('a squad of 6 or fewer has exactly the old line and order', () => {
    for (const n of [1, 3, 6]) {
      const line = squadLine(n);
      expect(line.slots).toBe(SQUAD_SLOTS);
      expect(line.order).toBe(SQUAD_LINE.order);
    }
    expect(SQUAD_SLOTS.map((p) => p.y)).toEqual(
      Array.from({ length: 6 }, (_, i) => ((i + 0.5) * FIELD.height) / 6),
    );
    expect(SQUAD_LINE.order).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it.each([7, 8])('a squad of %i has %i distinct slots inside the field, each used once', (n) => {
    const { slots, order } = squadLine(n);
    expect(slots).toHaveLength(n);
    expect(new Set(order).size).toBe(n);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    const ys = slots.map((p) => p.y);
    expect(new Set(ys).size).toBe(n);
    for (const y of ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(FIELD.height);
    }
    // Top to bottom, evenly spread.
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    // From the middle out: the first survivor stands in the middle row.
    expect(Math.abs(ys[order[0]!]! - FIELD.height / 2)).toBeLessThan(FIELD.height / n);
  });

  it('starts a fight with 8 survivors, each in their own post on the 8-slot line', () => {
    const g = { ...camp(8), slots: { squad: 2, stash: 0 } };
    const s = startSquadHorde(g, 1, NOW);
    expect(s.defenders).toHaveLength(8);
    expect(new Set(s.defenders.map((d) => d.postId)).size).toBe(8);
    const posts = s.defenders.map((d) => s.posts[d.postId]!);
    expect(posts.every((p) => p.kind === 'line')).toBe(true);
    expect(new Set(posts.map((p) => p.y)).size).toBe(8);
  });

  it('a squad of 6 starts exactly as before (6 line posts)', () => {
    const s = startSquadHorde(camp(6), 1, NOW);
    expect(s.posts.filter((p) => p.kind === 'line')).toHaveLength(6);
  });
});
