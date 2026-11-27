// ID-231: Field Repairs is a skill the player uses when they choose: picking the card gives
// the button, using it mends the wall and starts the fire-rate cost, once per pick.
import { describe, expect, it } from 'vitest';
import { chooseCard } from './cards.ts';
import { CARD, STEP } from './data.ts';
import {
  cardFireRate,
  newHorde,
  repairsLeft,
  tick,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { useRepairsIfLow } from './sim.ts';
import { repairsLock, repairsState, useRepairs } from './skills.ts';
import { setup } from './testing.ts';

function fight(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.research = ['hollow-points', 'field-repairs'];
  return s;
}
const picked = (s: HordeState, id: UpgradeId = 'field-repairs'): HordeState => {
  const t = chooseCard({ ...s, offer: [{ kind: 'upgrade', id }] }, 0);
  t.offer = null;
  return t;
};
const segs = (s: HordeState) => s.layers.flatMap((l) => l.segments);
const built = (s: HordeState) => segs(s).filter((g) => g.kind !== null);
/** A fight with the card held and the wall hurt: one segment half, one broken. */
function hurt(): HordeState {
  const s = picked(fight());
  const b = built(s);
  b[0]!.hp = b[0]!.maxHp / 2;
  b[1]!.hp = 0;
  return s;
}
const used = (s: HordeState): HordeState => {
  const r = useRepairs(s);
  if (!r.ok) throw new Error(r.code);
  return r.state;
};

describe('Field Repairs as a skill (ID-231)', () => {
  it('the pick leaves the wall, the fire rate and the wall pulse alone', () => {
    const s = fight();
    const b = built(s);
    b[0]!.hp = 10;
    const hps = segs(s).map((g) => g.hp);
    const t = picked(s);
    expect(segs(t).map((g) => g.hp)).toEqual(hps);
    expect(segs(t).every((g) => g.repairAt === undefined)).toBe(true);
    expect(t.barrierAt).toBeUndefined();
    expect(t.repairsUntil).toBeUndefined();
    expect(cardFireRate(t)).toBe(1);
    expect(repairsState(t)).toBe('ready');
  });

  it('is none until the card is held, and a new horde starts none', () => {
    expect(repairsState(fight())).toBe('none');
    expect(repairsLock(fight())).toEqual({ ok: false, code: 'pick-repairs' });
    const s = used(hurt());
    expect(repairsState(s)).toBe('spent');
    expect(repairsState(newHorde(2, setup()))).toBe('none');
  });

  it('using it mends every built segment, broken ones too, and glows only the healed', () => {
    let s = hurt();
    s.time = 9;
    const whole = built(s)[2]!;
    expect(whole.hp).toBe(whole.maxHp);
    s = used(s);
    for (const g of built(s)) expect(g.hp).toBe(g.maxHp);
    const b = built(s);
    expect(b[0]!.repairAt).toBe(9);
    expect(b[1]!.repairAt).toBe(9);
    expect(b[2]!.repairAt).toBeUndefined();
  });

  it('starts the 5 s fire-rate cost, once; a second use is refused', () => {
    let s = hurt();
    s.time = 4;
    s = used(s);
    expect(s.repairsUntil).toBeCloseTo(4 + CARD.fieldRepairs.seconds, 9);
    expect(repairsLeft(s)).toBeCloseTo(5, 9);
    expect(cardFireRate(s)).toBeCloseTo(0.75, 9);
    built(s)[0]!.hp = 1;
    expect(useRepairs(s)).toEqual({ ok: false, code: 'repairs-used' });
    s = tick(s, 6);
    expect(repairsLeft(s)).toBe(0);
    expect(repairsState(s)).toBe('spent');
    expect(repairsLock(s)).toEqual({ ok: false, code: 'repairs-used' });
  });

  it('refuses a full wall, ignoring unbuilt slots', () => {
    const s = picked(fight());
    expect(useRepairs(s)).toEqual({ ok: false, code: 'wall-full' });
    // An unbuilt slot (hp 0, max 0) is not damage.
    const slot = segs(s)[0]!;
    Object.assign(slot, { kind: null, tier: null, hp: 0, maxHp: 0 });
    expect(useRepairs(s)).toEqual({ ok: false, code: 'wall-full' });
    expect(repairsLock(s)).toEqual({ ok: false, code: 'wall-full' });
  });

  it('is usable with a card offer or a replacement open, and while the fight is held', () => {
    for (const open of [{ offer: [] }, { replace: { injuredId: 1, postId: null } }]) {
      const s = { ...hurt(), ...open } as HordeState;
      expect(repairsLock(s), JSON.stringify(open)).toBeNull();
      expect(useRepairs(s).ok).toBe(true);
    }
    // Held is the app's pause: the state itself carries nothing that refuses.
    expect(repairsLock(hurt())).toBeNull();
  });

  it('is refused once the horde is over', () => {
    for (const outcome of ['won', 'lost'] as const) {
      const s = { ...hurt(), outcome };
      expect(useRepairs(s)).toEqual({ ok: false, code: 'horde-over' });
    }
  });

  it('stays ready across a wave change until it is used', () => {
    let s = hurt();
    const wave = s.wave;
    for (let i = 0; i < 4000 && s.wave === wave && s.outcome === 'fighting'; i++) {
      s = tick(s, STEP);
    }
    expect(s.wave).toBeGreaterThan(wave);
    expect(repairsState(s)).toBe('ready');
    expect(repairsLock(s)).toBeNull();
  });

  it('picking then using equals the old pick-time state', () => {
    const before = fight();
    built(before)[0]!.hp = 20;
    before.time = 3;
    const now = used(picked(before));
    for (const g of built(now)) expect(g.hp).toBe(g.maxHp);
    expect(now.repairsUntil).toBeCloseTo(3 + CARD.fieldRepairs.seconds, 9);
    expect(built(now)[0]!.repairAt).toBe(3);
  });
});

describe('the scripted player uses Field Repairs (ID-231)', () => {
  it('only once the weakest built segment is at 30% or less', () => {
    const s = picked(fight());
    expect(useRepairsIfLow(s)).toBe(s);
    built(s)[0]!.hp = built(s)[0]!.maxHp * 0.31;
    expect(useRepairsIfLow(s)).toBe(s);
    built(s)[0]!.hp = built(s)[0]!.maxHp * 0.3;
    const t = useRepairsIfLow(s);
    expect(repairsState(t)).toBe('spent');
    expect(built(t)[0]!.hp).toBe(built(t)[0]!.maxHp);
    // Unbuilt slots (hp 0) never trigger it, and a spent one is left alone.
    const open = picked(fight());
    Object.assign(segs(open)[0]!, { kind: null, tier: null, hp: 0, maxHp: 0 });
    expect(useRepairsIfLow(open)).toBe(open);
    expect(useRepairsIfLow(t)).toBe(t);
  });
});
