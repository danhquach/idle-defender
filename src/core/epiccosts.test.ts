// ID-137: the epic cards each come with a cost the player weighs, every one different.
// Concussion Rounds dazes what it hits (+30% squad damage for 1 s) and slows the squad's
// fire while held; a Frag Grenade's throw takes its thrower's hands for 1.5 s; Field
// Repairs slows the squad's fire for 5 s after its pick, while the wall is repaired.
// Heavy Rounds' reload cost is ID-136's.
import { describe, expect, it } from 'vitest';
import { chooseCard, UPGRADE_IDS, UPGRADES } from './cards.ts';
import { CARD, MAX_CONDITION, SEGMENT_HEIGHT, STEP, WEAPONS } from './data.ts';
import {
  cardFireRate,
  newHorde,
  repairsLeft,
  tick,
  type Enemy,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { enemy, setup } from './testing.ts';

const ROW4 = 4.5 * SEGMENT_HEIGHT;
/** Unkillable and held still, out in the field in front of defender a. */
const target = { hp: 1e6, maxHp: 1e6, stunnedUntil: 1e9, x: 700, y: ROW4 };

/** Horde 1 with nothing left to spawn and one held enemy in reach of defender a. */
function field(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.research = ['hollow-points', 'field-repairs'];
  enemy(s, target);
  return s;
}
/** `s` with card `id` picked from an offer, as the player would. */
function picked(s: HordeState, id: UpgradeId): HordeState {
  const t = chooseCard({ ...s, offer: [{ kind: 'upgrade', id }] }, 0);
  t.offer = null;
  return t;
}
function steps(s: HordeState, n: number): HordeState {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
}
/**
 * Seconds between defender a's next two shots: each shot sets when the next is due, so the
 * gap between the two it sets is the interval.
 */
function interval(s: HordeState): number {
  let t = s;
  const set: number[] = [];
  let last = t.defenders[0]!.nextShotAt;
  for (let i = 0; i < 400 && set.length < 2; i++) {
    t = tick(t, STEP);
    const next = t.defenders[0]!.nextShotAt;
    if (next !== last) set.push(next);
    last = next;
  }
  if (set.length < 2) throw new RangeError('never fired twice');
  return set[1]! - set[0]!;
}
/** Defender a's shots in the next `n` steps (each shot is stamped with the step it went off). */
function shotsIn(s: HordeState, n: number): { shots: number; after: HordeState } {
  let t = s;
  let shots = 0;
  for (let i = 0; i < n; i++) {
    const was = t.time;
    t = tick(t, STEP);
    shots += t.shots.filter((k) => k.owner === 'a' && k.at > was + STEP / 2).length;
  }
  return { shots, after: t };
}

const EPIC = UPGRADE_IDS.filter((id) => UPGRADES[id].rarity === 'epic');

describe('every epic card names its gain and a cost (ID-137)', () => {
  it('the epic cards are Heavy Rounds, Concussion Rounds, Frag Grenades, Field Repairs and Oil Bomb', () => {
    expect([...EPIC].sort()).toEqual(
      ['concussion-rounds', 'field-repairs', 'frag-grenades', 'hollow-points', 'oil-bomb'].sort(),
    );
  });

  it('each card’s text names its gain and then its cost, with the numbers', () => {
    expect(UPGRADES['concussion-rounds'].text).toBe(
      'Hits knock enemies back (up to 100 px each) and daze them: +30% damage taken for 1 s after each hit; −10% fire rate',
    );
    expect(UPGRADES['frag-grenades'].text).toBe(
      'Each survivor throws a grenade every 8 s into the thickest group, for 25% of a Shambler’s HP; a throw stops its thrower firing for 1.5 s',
    );
    expect(UPGRADES['field-repairs'].text).toBe(
      'Repair every wall segment to full; −25% fire rate for 5 s',
    );
    expect(UPGRADES['hollow-points'].text).toBe('+38% damage, +25% reload time');
    // ID-132: its cost is the slow throw and a lit slick burning out.
    expect(UPGRADES['oil-bomb'].text).toBe(
      'Two wall mortars lob a tar bomb into the thickest group every 20 s. Its slick slows enemies 60% for 10 s, and Incendiary hits set it alight (20% of a Shambler’s HP a second); but the bomb takes 1.5 s to land, and a lit slick burns out in 3 s',
    );
  });

  it('no two epic cards share a cost', () => {
    // The cost is the text after the gain: after "; " or, for Heavy Rounds, ", ".
    const costs = EPIC.map((id) => {
      const text = UPGRADES[id].text;
      return text.includes('; ') ? text.split('; ')[1]! : text.split(', ')[1]!;
    });
    expect(costs.every((c) => c.length > 0)).toBe(true);
    expect(new Set(costs).size).toBe(EPIC.length);
    // The two fire-rate costs differ in size and in how long they last.
    expect(CARD.concussion.fireRate).not.toBe(CARD.fieldRepairs.fireRate);
  });
});

describe('Concussion Rounds: −10% squad fire rate while held (ID-137)', () => {
  it('the squad’s shots come 1/0.9 times as far apart', () => {
    const plain = interval(field());
    const held = interval(picked(field(), 'concussion-rounds'));
    expect(held).toBeCloseTo(plain / CARD.concussion.fireRate, 6);
  });

  it('multiplies with Rapid Fire, which still speeds the squad up', () => {
    const plain = interval(field());
    const both = interval(picked(picked(field(), 'rapid-fire'), 'concussion-rounds'));
    expect(both).toBeCloseTo(plain / ((1 + CARD.step.fireRate) * CARD.concussion.fireRate), 6);
  });

  it('turrets fire as fast as before: the cost is the squad’s', () => {
    /** Turret 0's next shot, a step after it first fires, with the squad never firing. */
    const turretGap = (s: HordeState): number => {
      s.defenders[0]!.nextShotAt = 1e9;
      s.energy = s.bankCap;
      s.turrets.push({
        id: 0,
        mount: 'tower',
        column: 0,
        row: 4,
        x: 420,
        y: ROW4,
        condition: MAX_CONDITION,
        nextShotAt: 0,
      });
      const t = tick(s, STEP);
      return t.turrets[0]!.nextShotAt - t.time;
    };
    const plain = turretGap(field());
    expect(plain).toBeGreaterThan(0);
    const s = picked(picked(field(), 'concussion-rounds'), 'field-repairs');
    expect(cardFireRate(s)).toBeCloseTo(0.9 * 0.75, 9);
    expect(turretGap(s)).toBeCloseTo(plain, 9);
  });
});

describe('Concussion Rounds: a hit dazes, +30% squad damage for 1 s (ID-137)', () => {
  /** Horde 1, the squad holding `taken`, defender a never firing, one held enemy at 600. */
  function range(...taken: UpgradeId[]) {
    const s = newHorde(1, setup());
    s.toSpawn = 0;
    s.defenders[0]!.nextShotAt = 1e9;
    s.taken = taken;
    const e = enemy(s, { ...target, x: 600 });
    return { s, e };
  }
  /** `s` after `n` 10-damage bullets from `owner` hit `e` in one step, and the HP they took off. */
  function hit(s: HordeState, e: Enemy, owner = 'a', n = 1): { s: HordeState; took: number } {
    const before = s.enemies.find((o) => o.id === e.id)!;
    const hp = before.hp;
    for (let i = 0; i < n; i++)
      s.bullets.push({
        dx: 1,
        dy: 0,
        speed: 1800,
        damage: 10,
        owner,
        fromX: before.x - 10,
        fromY: before.y,
        x: before.x - 10,
        y: before.y,
        aim: 100,
        left: 1000,
        pierce: 0,
        hit: [],
        tracer: WEAPONS.pistol.tracer,
      });
    const t = tick(s, STEP);
    return { s: t, took: hp - t.enemies.find((o) => o.id === e.id)!.hp };
  }

  it('the hit that dazes deals its damage; squad hits in the next second deal 1.3×', () => {
    const { s, e } = range('concussion-rounds');
    const first = hit(s, e);
    expect(first.took).toBeCloseTo(10, 9);
    const second = hit(steps(first.s, Math.round(0.6 / STEP)), e);
    expect(second.took).toBeCloseTo(10 * (1 + CARD.concussion.daze), 9);
  });

  it('in the volley that dazes, the first bullet deals plain damage and the rest gain (a shotgun’s pellets)', () => {
    const { s, e } = range('concussion-rounds');
    const volley = hit(s, e, 'a', 5);
    expect(volley.took).toBeCloseTo(10 + 4 * 13, 9);
    expect(hit(steps(volley.s, 6), e, 'a', 5).took).toBeCloseTo(50 * 1.3, 9);
  });

  it('a hit inside the 0.5 s gap gains the daze but does not renew it', () => {
    const { s, e } = range('concussion-rounds');
    const first = hit(s, e);
    // 0.3 s on: inside the push gap, so it doesn't refresh the daze.
    const gap = hit(steps(first.s, Math.round(0.3 / STEP) - 1), e);
    expect(gap.took).toBeCloseTo(13, 9);
    // 1.1 s after the first hit: its daze is over, and nothing renewed it.
    const after = hit(steps(gap.s, Math.round(0.8 / STEP) - 1), e);
    expect(after.took).toBeCloseTo(10, 9);
  });

  it('wears off a second after the last hit that dazed', () => {
    const { s, e } = range('concussion-rounds');
    const first = hit(s, e);
    const late = hit(steps(first.s, Math.round(1.2 / STEP)), e);
    expect(late.took).toBeCloseTo(10, 9);
  });

  it('still dazes once the enemy’s push is used up', () => {
    const { s, e } = range('concussion-rounds');
    s.enemies.find((o) => o.id === e.id)!.pushed = CARD.concussion.cap;
    const first = hit(s, e);
    expect(first.s.enemies.find((o) => o.id === e.id)!.x).toBe(600);
    expect(hit(steps(first.s, Math.round(0.6 / STEP)), e).took).toBeCloseTo(13, 9);
  });

  it('turret bullets neither daze nor deal more to a dazed enemy; no daze without the card', () => {
    const { s, e } = range('concussion-rounds');
    const dazed = hit(s, e);
    expect(hit(steps(dazed.s, 6), e, 'turret:0').took).toBeCloseTo(10, 9);
    const t = range('concussion-rounds');
    const byTurret = hit(t.s, t.e, 'turret:0');
    expect(hit(steps(byTurret.s, 6), t.e).took).toBeCloseTo(10, 9);
    const plain = range();
    const once = hit(plain.s, plain.e);
    expect(hit(steps(once.s, 6), plain.e).took).toBeCloseTo(10, 9);
  });
});

describe('Frag Grenades: the thrower fires no shot for 1.5 s after a throw (ID-137)', () => {
  it('a throw pushes the thrower’s next shot back by the pause, and no shot comes in it', () => {
    let s = field();
    // Let a fire once, so a shot is due soon after.
    s = shotsIn(s, 20).after;
    const due = s.defenders[0]!.nextShotAt;
    s = picked(s, 'frag-grenades');
    s = tick(s, STEP);
    expect(s.grenades).toHaveLength(1);
    const g = s.grenades[0]!;
    expect(g.by).toBe('a');
    expect(s.defenders[0]!.nextShotAt).toBeCloseTo(Math.max(due, g.at) + CARD.frag.pause, 9);
    // Nothing from a in the pause.
    const { shots } = shotsIn(s, Math.floor(CARD.frag.pause / STEP) - 1);
    expect(shots).toBe(0);
  });

  it('without the card, the same survivor keeps firing through those steps', () => {
    let s = shotsIn(field(), 20).after;
    s = tick(s, STEP);
    const { shots } = shotsIn(s, Math.round(CARD.frag.pause / STEP) * 2);
    expect(shots).toBeGreaterThan(0);
  });
});

describe('Field Repairs: −25% squad fire rate for 5 s after the pick (ID-137)', () => {
  it('starts a 5 s countdown of fight time, slowing the squad until it ends', () => {
    let s = field();
    s.time = 12;
    s = picked(s, 'field-repairs');
    expect(s.repairsUntil).toBeCloseTo(12 + CARD.fieldRepairs.seconds, 9);
    expect(repairsLeft(s)).toBeCloseTo(5, 9);
    expect(cardFireRate(s)).toBeCloseTo(0.75, 9);
    s = steps(s, Math.round(4.5 / STEP));
    expect(repairsLeft(s)).toBeCloseTo(0.5, 6);
    expect(cardFireRate(s)).toBeCloseTo(0.75, 9);
    s = steps(s, Math.round(0.5 / STEP));
    expect(repairsLeft(s)).toBe(0);
    expect(cardFireRate(s)).toBe(1);
  });

  it('the squad’s shots come 1/0.75 times as far apart while it runs, as before after', () => {
    const plain = interval(field());
    const s = picked(field(), 'field-repairs');
    expect(interval(s)).toBeCloseTo(plain / CARD.fieldRepairs.fireRate, 6);
    const later = steps(s, Math.round((CARD.fieldRepairs.seconds + 1) / STEP));
    // A full magazine and a shot due now, so no reload falls between the two shots measured.
    const fresh = field().defenders[0]!;
    Object.assign(later.defenders[0]!, {
      nextShotAt: later.time,
      ammo: { ...fresh.ammo },
      reloadedAt: { ...fresh.reloadedAt },
    });
    expect(interval(later)).toBeCloseTo(plain, 6);
  });

  it('the countdown waits while a card offer is open (fight time stops)', () => {
    let s = picked(field(), 'field-repairs');
    s = { ...s, offer: [{ kind: 'upgrade', id: 'sharpshooter' }] };
    const left = repairsLeft(s);
    s = steps(s, 30);
    expect(repairsLeft(s)).toBeCloseTo(left, 9);
  });

  it('stacks with Concussion Rounds: the two costs multiply', () => {
    const s = picked(picked(field(), 'concussion-rounds'), 'field-repairs');
    expect(cardFireRate(s)).toBeCloseTo(0.9 * 0.75, 9);
  });

  it('no countdown before the pick', () => {
    const s = field();
    expect(s.repairsUntil).toBeUndefined();
    expect(repairsLeft(s)).toBe(0);
    expect(cardFireRate(s)).toBe(1);
  });
});
