// Design §8, ID-132: Sandbags (the outer wall takes less damage), Scavenged Ammo (a shot may
// use no round) and Oil Bomb (a thrown tar bomb's slick, lit by Incendiary Rounds).
import { describe, expect, it } from 'vitest';
import {
  UPGRADES,
  chooseCard,
  effectAt,
  eligible,
  outerWallHit,
  pitch,
  synergyOf,
} from './cards.ts';
import {
  CARD,
  CARD_MAX_LEVEL,
  ENEMIES,
  FIELD,
  SEGMENT_HEIGHT,
  START_BASE,
  STEP,
  WALL,
} from './data.ts';
import {
  mortars,
  newHorde,
  wallFront,
  sandbagged,
  shamblerHp,
  SAVE_CUE,
  slickDps,
  tick,
  type Enemy,
  type HordeState,
  type UpgradeId,
} from './horde.ts';
import { SQUAD_CARDS } from './hordeonly.ts';
import { enemy, setup } from './testing.ts';

const GATE = START_BASE.gate;
const rowY = (row: number): number => (row + 0.5) * SEGMENT_HEIGHT;
const tough = { hp: 1000, maxHp: 1000 };
/** Held still, so nothing walks. */
const still = { stunnedUntil: 1e9 };
/** Row 4's middle: level with defender a on the upper tower (420, 360). */
const ROW4 = 4.5 * SEGMENT_HEIGHT;

/** Horde 1 with nothing to spawn; defender a never fires unless `fires`. */
function quiet(fires = false): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  if (!fires) s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** `s` with card `id` picked from an offer `times` times, as the player would. */
function picked(s: HordeState, id: UpgradeId, times = 1): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = chooseCard({ ...t, offer: [{ kind: 'upgrade', id }] }, 0);
    t.offer = null;
  }
  return t;
}
function steps(s: HordeState, n: number): HordeState {
  let t = s;
  for (let i = 0; i < n; i++) t = tick(t, STEP);
  return t;
}
const find = (s: HordeState, id: number): Enemy => s.enemies.find((e) => e.id === id)!;

describe('wall and ammo cards (ID-132): data and levels', () => {
  it('Sandbags and Scavenged Ammo are rare, levelled; Oil Bomb is epic and unique', () => {
    expect(UPGRADES.sandbags).toMatchObject({
      name: 'Sandbags',
      category: 'barrier',
      rarity: 'rare',
      levels: CARD_MAX_LEVEL,
    });
    expect(UPGRADES['scavenged-ammo']).toMatchObject({
      name: 'Scavenged Ammo',
      category: 'stat',
      rarity: 'rare',
      levels: CARD_MAX_LEVEL,
    });
    expect(UPGRADES['oil-bomb']).toMatchObject({
      name: 'Oil Bomb',
      category: 'behaviour',
      rarity: 'epic',
      levels: 1,
    });
    for (const id of ['sandbags', 'scavenged-ammo', 'oil-bomb'] as const) {
      expect(SQUAD_CARDS).toContain(id);
    }
  });

  it('the levelled pair level up with each pick and leave the pool at max', () => {
    for (const id of ['sandbags', 'scavenged-ammo'] as const) {
      let s = quiet();
      s.layers[0]!.segments[GATE]!.hp -= 1;
      for (let lv = 1; lv <= 3; lv++) {
        expect(eligible(s, id), `${id} before pick ${lv}`).toBe(true);
        s = picked(s, id);
        expect(s.cardLevels[id]).toBe(lv);
      }
      expect(eligible(s, id)).toBe(false);
    }
    const s = picked(quiet(), 'oil-bomb');
    expect(eligible(s, 'oil-bomb')).toBe(false);
    expect(pitch(quiet(), 'oil-bomb').tag).toBe('Unique');
  });

  it('Sandbags and Oil Bomb are offered only once enemies have reached the outer wall', () => {
    const s = quiet();
    s.cardPool = [...SQUAD_CARDS];
    expect(outerWallHit(s)).toBe(false);
    expect(eligible(s, 'sandbags')).toBe(false);
    expect(eligible(s, 'oil-bomb')).toBe(false);
    expect(eligible(s, 'scavenged-ammo')).toBe(true);
    // An inner layer's damage doesn't count; the outer one's (a broken segment too) does.
    const inner = {
      column: 1,
      x: s.layers[0]!.x - 200,
      segments: structuredClone(s.layers[0]!.segments),
    };
    inner.segments[0]!.hp -= 5;
    s.layers.push(inner);
    expect(outerWallHit(s)).toBe(false);
    s.layers[0]!.segments[GATE]!.hp = 0;
    expect(outerWallHit(s)).toBe(true);
    expect(eligible(s, 'sandbags')).toBe(true);
    expect(eligible(s, 'oil-bomb')).toBe(true);
  });

  it('card texts show the exact numbers', () => {
    expect(effectAt('sandbags', 1)).toEqual({
      pre: 'The outer wall takes ',
      value: '−10%',
      post: ' damage',
    });
    expect(effectAt('sandbags', 3)!.value).toBe('−30%');
    expect(effectAt('scavenged-ammo', 1)!.value).toBe('20%');
    expect(effectAt('scavenged-ammo', 3)!.value).toBe('40%');
    const lv2 = pitch(picked(quiet(), 'sandbags'), 'sandbags');
    expect(lv2.tag).toBe('Lv 1 → 2');
    expect(lv2.effect).toMatchObject({ from: '−10%', to: '−20%' });
    // The epic card names its gain and its cost (ID-137), with the numbers.
    const oil = UPGRADES['oil-bomb'].text;
    for (const part of ['20 s', '60%', '10 s', 'Incendiary hits', '20%', '3 s', '1.5 s']) {
      expect(oil).toContain(part);
    }
  });
});

describe('Sandbags (ID-132)', () => {
  /** HP the gate segment loses to a Shambler hitting it for 1.5 s, with Sandbags at `level`. */
  function gateLoss(level: number): number {
    let s = quiet();
    if (level > 0) s = picked(s, 'sandbags', level);
    s.defenders = [];
    enemy(s, { x: 530, y: rowY(GATE) });
    const before = s.layers[0]!.segments[GATE]!.hp;
    return before - tick(s, 1.5).layers[0]!.segments[GATE]!.hp;
  }

  it('the outer wall takes 10%, 20%, 30% less of each hit', () => {
    // Two Shambler blows of 5 land in 1.5 s.
    const hit = 2 * ENEMIES.shambler.damage;
    expect(gateLoss(0)).toBeCloseTo(hit, 9);
    expect(gateLoss(1)).toBeCloseTo(hit * 0.9, 9);
    expect(gateLoss(2)).toBeCloseTo(hit * 0.8, 9);
    expect(gateLoss(3)).toBeCloseTo(hit * 0.7, 9);
  });

  it('takes as much off a Swollen’s blast, its splash on the neighbours too', () => {
    /** HP each segment of the outer layer loses to one Swollen blowing up at row 2, Sandbags at `level`. */
    const blastLoss = (level: number): number[] => {
      let s = quiet();
      if (level > 0) s = picked(s, 'sandbags', level);
      s.defenders = [];
      enemy(s, { kind: 'swollen', x: 530, y: rowY(2), hp: 1e9, maxHp: 1e9 });
      const before = s.layers[0]!.segments.map((g) => g.hp);
      const after = tick(s, 1.5).layers[0]!.segments.map((g) => g.hp);
      return before.map((hp, i) => hp - after[i]!);
    };
    const plain = blastLoss(0);
    // The centre and both neighbours are hit, and nothing else.
    expect(plain.flatMap((l, i) => (l > 0 ? [i] : []))).toEqual([1, 2, 3]);
    const bagged = blastLoss(3);
    for (const i of [1, 2, 3]) expect(bagged[i]).toBeCloseTo(plain[i]! * 0.7, 9);
  });

  it('shields only the outermost built layer', () => {
    const s = picked(quiet(), 'sandbags');
    const outer = s.layers[0]!;
    const inner = { column: 1, x: outer.x - 200, segments: structuredClone(outer.segments) };
    s.layers.push(inner);
    expect(sandbagged(s, outer)).toBe(true);
    expect(sandbagged(s, inner)).toBe(false);
    // Unbuilt in front: the next layer back takes the sandbags.
    const unbuilt = {
      column: 2,
      x: outer.x + 200,
      segments: outer.segments.map((g) => ({ ...g, kind: null })),
    };
    s.layers.push(unbuilt);
    expect(sandbagged(s, outer)).toBe(true);
    expect(sandbagged(quiet(), quiet().layers[0]!)).toBe(false);
  });
});

describe('Scavenged Ammo (ID-132)', () => {
  /** Shots fired and rounds used by defender a over `n` steps at a tough target, with the card at `level`. */
  function fired(level: number, n = 2000): { shots: number; rounds: number } {
    let s = quiet(true);
    if (level > 0) s = picked(s, 'scavenged-ammo', level);
    s.defenders[0]!.nextShotAt = 0;
    enemy(s, { ...tough, hp: 1e9, maxHp: 1e9, ...still, x: 700, y: ROW4 });
    let shots = 0;
    let rounds = 0;
    for (let i = 0; i < n; i++) {
      const a = s.defenders[0]!;
      const [ammo, next] = [a.ammo.primary, a.nextShotAt];
      s = tick(s, STEP);
      const b = s.defenders[0]!;
      if (b.nextShotAt !== next) {
        shots += 1;
        // A round is used unless the magazine count stays put (a reload and shot can share a step).
        if (b.ammo.primary !== ammo) rounds += 1;
      }
    }
    return { shots, rounds };
  }

  it('without it every shot uses a round', () => {
    const { shots, rounds } = fired(0);
    expect(shots).toBeGreaterThan(50);
    expect(rounds).toBe(shots);
  });

  it('marks saved rounds for the view, at most one per survivor every 1.5 s', () => {
    let s = picked(quiet(true), 'scavenged-ammo', 3);
    s.defenders[0]!.nextShotAt = 0;
    enemy(s, { ...tough, hp: 1e9, maxHp: 1e9, ...still, x: 700, y: ROW4 });
    const marks: number[] = [];
    for (let i = 0; i < 1200; i++) {
      s = tick(s, STEP);
      for (const k of s.saves) if (!marks.includes(k.at)) marks.push(k.at);
      expect(s.saves.every((k) => s.time - k.at < SAVE_CUE.gap + STEP + 1e-9)).toBe(true);
    }
    expect(marks.length).toBeGreaterThan(3);
    for (let i = 1; i < marks.length; i++) {
      expect(marks[i]! - marks[i - 1]!).toBeGreaterThanOrEqual(SAVE_CUE.gap - 1e-9);
    }
    // Without the card, never.
    let none = quiet(true);
    none.defenders[0]!.nextShotAt = 0;
    enemy(none, { ...tough, hp: 1e9, maxHp: 1e9, ...still, x: 700, y: ROW4 });
    for (let i = 0; i < 300; i++) none = tick(none, STEP);
    expect(none.saves).toEqual([]);
  });

  it('saves about its chance of the rounds at each level', () => {
    const plain = fired(0).shots;
    for (let lv = 1; lv <= 3; lv++) {
      const { shots, rounds } = fired(lv);
      const saved = 1 - rounds / shots;
      expect(saved, `level ${lv}`).toBeGreaterThan(CARD.scavenge[lv - 1]! - 0.1);
      expect(saved, `level ${lv}`).toBeLessThan(CARD.scavenge[lv - 1]! + 0.1);
      // Fewer reloads, so more shots in the same time.
      expect(shots).toBeGreaterThan(plain);
    }
  });
});

describe('Oil Bomb (ID-132)', () => {
  /** Oil Bomb picked by defender a (420, 360), with a group of 3 held still at 900. */
  function oiled(...extra: UpgradeId[]) {
    let s = quiet();
    for (const id of extra) s = picked(s, id);
    s = picked(s, 'oil-bomb');
    const group = [-30, 0, 30].map((dy) => enemy(s, { ...tough, ...still, x: 900, y: ROW4 + dy }));
    return { s, group };
  }
  const flight = Math.round(CARD.oil.flight / STEP) + 1;

  it('two mortars stand behind the outer wall, one at each end', () => {
    const s = quiet();
    const front = wallFront(s);
    const { back, end } = CARD.oil.mortar;
    expect(mortars(s)).toEqual([
      { id: 'mortar:top', x: front - WALL.depth - back, y: end },
      { id: 'mortar:bottom', x: front - WALL.depth - back, y: FIELD.height - end },
    ]);
    // No built wall, no mortars.
    s.layers = s.layers.map((l) => ({
      ...l,
      segments: l.segments.map((g) => ({ ...g, kind: null })),
    }));
    expect(mortars(s)).toEqual([]);
  });

  it('the nearer mortar lobs a tar bomb on pick at the thickest group; it lands after 1.5 s as a slick', () => {
    const { s } = oiled();
    expect(s.nextTarAt).toBe(s.time);
    const shotAt = s.defenders[0]!.nextShotAt;
    let t = tick(s, STEP);
    expect(t.tarBombs).toHaveLength(1);
    const b = t.tarBombs[0]!;
    // All three have 2 others within 90 px; same x, so the lowest id (the top one).
    expect({ x: b.x, y: b.y }).toEqual({ x: 900, y: ROW4 - 30 });
    // Thrown by the top mortar (nearer row 3), from where it stands; no survivor's hands.
    const top = mortars(t)[0]!;
    expect({ by: b.by, x: b.fromX, y: b.fromY }).toEqual({ by: top.id, x: top.x, y: top.y });
    expect(t.feats.some((f) => f.kind === 'throw')).toBe(false);
    expect(t.defenders[0]!.nextShotAt).toBe(shotAt);
    expect(b.lands).toBeCloseTo(b.at + CARD.oil.flight, 9);
    expect(t.nextTarAt).toBeCloseTo(b.at + CARD.oil.every, 9);
    expect(t.slicks).toHaveLength(0);
    t = steps(t, flight);
    expect(t.tarBombs).toHaveLength(0);
    expect(t.slicks).toHaveLength(1);
    expect(t.slicks[0]).toMatchObject({ x: 900, y: ROW4 - 30 });
    expect(t.slicks[0]!.litAt).toBeUndefined();
    // It harms no one by itself.
    expect(t.enemies.every((e) => e.hp === 1000)).toBe(true);
  });

  it('slows enemies inside by 60%; gone after 10 s; one bomb every 20 s', () => {
    const { s } = oiled();
    let t = steps(s, flight + 1);
    const k = t.slicks[0]!;
    const inside = enemy(t, { x: k.x + 20, y: k.y });
    const outside = enemy(t, { x: k.x + 20, y: k.y + CARD.oil.radius + 40 });
    const [x0, x1] = [inside.x, outside.x];
    t = tick(t, STEP);
    const dIn = x0 - find(t, inside.id).x;
    const dOut = x1 - find(t, outside.id).x;
    expect(dOut).toBeGreaterThan(0);
    expect(dIn).toBeCloseTo(dOut * (1 - CARD.oil.slow), 9);
    // No second bomb before 20 s.
    t = steps(t, Math.round((CARD.oil.seconds - 0.5) / STEP));
    expect(t.slicks).toHaveLength(1);
    expect(t.tarBombs).toHaveLength(0);
    t = steps(t, Math.round(1 / STEP));
    expect(t.slicks).toHaveLength(0);
  });

  it('an Incendiary Rounds hit on an enemy inside lights it: it burns everyone inside, then burns out', () => {
    const { s, group } = oiled('incendiary-rounds');
    const t = steps(s, flight + 1);
    expect(t.slicks).toHaveLength(1);
    // Defender a fires at the group from now on.
    t.defenders[0]!.nextShotAt = t.time;
    let lit = t;
    for (let i = 0; i < 200 && lit.slicks[0]?.litAt === undefined; i++) lit = tick(lit, STEP);
    const k = lit.slicks[0]!;
    expect(k.litAt).toBeDefined();
    expect(k.until).toBeCloseTo(k.litAt! + CARD.oil.burnFor, 9);
    // Stop the shooting: only the fire now.
    lit.defenders[0]!.nextShotAt = 1e9;
    const [a, c] = [find(lit, group[0]!.id), find(lit, group[2]!.id)];
    const [ha, hc] = [a.hp, c.hp];
    const burn = lit.enemies.map((e) => ({ id: e.id, until: e.burnUntil }));
    let u = steps(lit, Math.round(1 / STEP));
    // Each in the slick loses the slick's share of a Shambler a second (plus any bullet burn).
    expect(slickDps(u)).toBeCloseTo(CARD.oil.burn * shamblerHp(u), 9);
    for (const [e, h] of [
      [a, ha],
      [c, hc],
    ] as const) {
      const bulletBurn = burn.find((b) => b.id === e.id)?.until ?? 0;
      const lost = h - find(u, e.id).hp;
      expect(lost).toBeGreaterThanOrEqual(slickDps(u) * 0.99 - 1e-9);
      if (bulletBurn <= lit.time) expect(lost).toBeCloseTo(slickDps(u), 6);
    }
    // Burnt out after 3 s: gone, no more slow or fire.
    u = steps(u, Math.round((CARD.oil.burnFor - 1) / STEP) + 1);
    expect(u.slicks).toHaveLength(0);
  });

  it('a group near the bottom end gets the bottom mortar’s bomb', () => {
    let s = picked(quiet(), 'oil-bomb');
    for (const dy of [-20, 0, 20])
      enemy(s, { ...tough, ...still, x: 800, y: FIELD.height - 60 + dy });
    s = tick(s, STEP);
    expect(s.tarBombs[0]!.by).toBe('mortar:bottom');
  });

  it('bullets without Incendiary Rounds never light it', () => {
    const { s } = oiled();
    let t = steps(s, flight + 1);
    t.defenders[0]!.nextShotAt = t.time;
    t = steps(t, Math.round(3 / STEP));
    expect(t.slicks).toHaveLength(1);
    expect(t.slicks[0]!.litAt).toBeUndefined();
  });

  it('the synergy shows on both cards once the other is held', () => {
    expect(synergyOf(quiet(), 'oil-bomb')).toBeNull();
    expect(synergyOf(quiet(), 'incendiary-rounds')).toBeNull();
    expect(synergyOf(picked(quiet(), 'incendiary-rounds'), 'oil-bomb')).toBe(
      'Incendiary Rounds: hits light the slick',
    );
    expect(synergyOf(picked(quiet(), 'oil-bomb'), 'incendiary-rounds')).toBe(
      'Oil Bomb: hits light the slick',
    );
  });

  it('no throw without the card or with nobody in reach, and the horde end clears it', () => {
    const none = quiet();
    enemy(none, { ...tough, ...still, x: 900, y: ROW4 });
    expect(steps(none, 10).tarBombs).toHaveLength(0);
    let far = picked(quiet(), 'oil-bomb');
    const top = mortars(far)[0]!;
    enemy(far, { ...tough, ...still, x: top.x + CARD.oil.range + 60, y: top.y });
    far = steps(far, 5);
    expect(far.tarBombs).toHaveLength(0);
  });
});
