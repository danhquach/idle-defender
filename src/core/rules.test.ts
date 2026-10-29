// Horde rules (ID-006): defenders hit in the camp, injury, the camp falling, and
// replacements between waves.
import { describe, expect, it } from 'vitest';
import { chooseCard, rollOffer } from './cards.ts';
import { CAMP, FALL_WARNING, MELEE_REACH, STEP } from './data.ts';
import { moveDefender, newHorde, standing, tick, type HordeState } from './horde.ts';
import { replaceInjured, replacePosts, skipReplace } from './replace.ts';
import { rngFrom } from './rng.ts';
import { enemy, setup } from './testing.ts';

/** Horde 1, a on post 0 (420, 120), no spawns left: only placed enemies move. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  return s;
}

/** Quiet with nobody in the fight. */
function empty(): HordeState {
  const s = quiet();
  s.defenders = [];
  for (const p of s.posts) p.defenderId = null;
  return s;
}

/** Bench defender `id` standing on post `postId` of `s` (mutates `s`). */
function field(s: HordeState, id: string, postId: number): void {
  const i = s.bench.findIndex((d) => d.id === id);
  const [spec] = s.bench.splice(i, 1);
  s.defenders.push(standing(spec!, s.posts[postId]!, 0));
  s.posts[postId]!.defenderId = id;
  s.tookPart.push(id);
}

/** An enemy already inside the camp that won't die to a pistol soon. */
const intruder = (s: HordeState, x: number, y: number) =>
  enemy(s, { x, y, hp: 1e6, maxHp: 1e6, inCamp: true });

/** Keeps the wave going (mutates `s`): a far enemy that a pistol can't reach. */
const holdWave = (s: HordeState) => enemy(s, { x: 1590, y: 40 });

/** `s` with a's HP at 0, ticked one step: a is injured, and wave 1 (empty) is cleared. */
function injuredAfterWave(s: HordeState): HordeState {
  s.defenders.find((d) => d.id === 'a')!.hp = 0;
  return tick(s, STEP);
}

describe('defenders in the camp', () => {
  it('start at 100 HP', () => {
    const s = quiet();
    expect(s.defenders[0]).toMatchObject({ hp: 100, maxHp: 100 });
  });

  it('an enemy that crosses every layer is in the camp from then on', () => {
    const s = empty();
    s.layers[0]!.segments[2]!.hp = 0;
    enemy(s, { x: 530, y: 200 });
    const after = tick(s, 1);
    expect(after.enemies[0]?.inCamp).toBe(true);
    // An enemy stopped at a wall is not in.
    const t = empty();
    enemy(t, { x: 520, y: 120 });
    expect(tick(t, 1).enemies[0]?.inCamp).toBe(false);
  });

  it('an enemy in the camp hits a defender within reach for its damage, once a second', () => {
    const s = quiet();
    intruder(s, 420 + MELEE_REACH, 120);
    const after = tick(s, STEP);
    expect(after.defenders[0]?.hp).toBe(95);
    expect(tick(after, 1 - 2 * STEP).defenders[0]?.hp).toBe(95);
    expect(tick(after, 1).defenders[0]?.hp).toBe(90);
  });

  it('walks straight to the nearest defender and stops within reach', () => {
    const s = quiet();
    intruder(s, 300, 120);
    const after = tick(s, 5);
    const e = after.enemies[0]!;
    expect(e.y).toBeCloseTo(120);
    expect(Math.hypot(e.x - 420, e.y - 120)).toBeCloseTo(MELEE_REACH);
    expect(after.defenders[0]!.hp).toBeLessThan(100);
  });

  it('walls do not stop an enemy in the camp going back out to a defender', () => {
    const s = quiet();
    // Standing on the far side of a whole wall, but already in the camp.
    intruder(s, 600, 120);
    const after = tick(s, 6);
    expect(after.enemies[0]!.x).toBeCloseTo(420 + MELEE_REACH);
  });

  it('goes for the nearest defender, ties to the lower index', () => {
    const s = quiet();
    field(s, 'b', 1); // (420, 280)
    intruder(s, 420, 200 + 1);
    let after = tick(s, 3);
    expect(after.defenders[1]!.hp).toBeLessThan(100);
    expect(after.defenders[0]!.hp).toBe(100);
    const t = quiet();
    field(t, 'b', 1);
    intruder(t, 420, 200);
    after = tick(t, 3);
    expect(after.defenders[0]!.hp).toBeLessThan(100);
    expect(after.defenders[1]!.hp).toBe(100);
  });

  it('enemies outside never hit defenders', () => {
    const s = quiet();
    enemy(s, { x: 520, y: 120, hp: 1e6, maxHp: 1e6 });
    const after = tick(s, 5);
    expect(after.defenders[0]!.hp).toBe(100);
    expect(after.layers[0]!.segments[1]!.hp).toBeLessThan(200);
  });

  it('with no defender left it walks to the camp line and waits', () => {
    const s = empty();
    intruder(s, 300, 120);
    const after = tick(s, 9);
    expect(after.enemies[0]!.x).toBe(CAMP.x);
    expect(after.layers[0]!.segments.every((g) => g.hp === g.maxHp)).toBe(true);
  });
});

describe('injury', () => {
  it('at 0 HP the defender leaves the fight, frees the post and is injured, not benched', () => {
    const s = quiet();
    s.defenders[0]!.hp = 5;
    intruder(s, 420 + MELEE_REACH, 120);
    const after = tick(s, STEP);
    expect(after.defenders).toEqual([]);
    expect(after.posts[0]!.defenderId).toBeNull();
    expect(after.injured).toEqual([
      { defender: { id: 'a', name: 'A', weapon: 'pistol' }, postId: 0, at: 0, offered: false },
    ]);
    expect(after.bench.map((d) => d.id)).toEqual(['b', 'c']);
    expect(after.tookPart).toEqual(['a']);
  });

  it('a walker injured on the way frees its reservation', () => {
    const moved = moveDefender(quiet(), 'a', 1);
    if (!moved.ok) throw new Error(moved.reason);
    const s = moved.state;
    s.defenders[0]!.hp = 0;
    const after = tick(s, STEP);
    expect(after.posts[1]!.defenderId).toBeNull();
    expect(after.injured[0]!.postId).toBe(1);
  });

  it('an injured defender is never offered on a recruit card', () => {
    const s = quiet();
    s.bench = [];
    s.defenders[0]!.hp = 0;
    holdWave(s); // no replacement is due mid-wave
    const after = tick(s, STEP);
    for (let seed = 0; seed < 50; seed++) {
      const cards = rollOffer(rngFrom({ s: seed }), after);
      expect(cards.every((c) => c.kind === 'upgrade')).toBe(true);
    }
  });
});

describe('the camp falling', () => {
  it('runs with an enemy inside and nobody left, and loses at 10 s', () => {
    const s = empty();
    intruder(s, 300, 120);
    const before = tick(s, FALL_WARNING - 0.5);
    expect(before.outcome).toBe('fighting');
    expect(before.fallingFor).toBeCloseTo(FALL_WARNING - 0.5);
    const after = tick(before, 0.5);
    expect(after.outcome).toBe('lost');
    expect(tick(after, 1)).toEqual({ ...after, acc: 0 });
  });

  it('does not run with nobody left but no enemy inside', () => {
    const s = empty();
    enemy(s, { x: 520, y: 120, hp: 1e6, maxHp: 1e6 });
    const after = tick(s, 20);
    expect(after.fallingFor).toBe(0);
    expect(after.outcome).toBe('fighting');
  });

  it('does not run while a defender is still in the fight', () => {
    const s = quiet();
    s.defenders[0]!.hp = 1e9;
    intruder(s, 300, 120);
    const after = tick(s, 20);
    expect(after.fallingFor).toBe(0);
    expect(after.outcome).toBe('fighting');
  });

  it('resets when a defender is back in the fight', () => {
    const s = empty();
    intruder(s, 300, 120);
    const falling = tick(s, 5);
    expect(falling.fallingFor).toBeGreaterThan(4);
    field(falling, 'b', 1);
    falling.defenders[0]!.hp = 1e9;
    expect(tick(falling, STEP).fallingFor).toBe(0);
  });

  it('pauses during a card offer', () => {
    const s = empty();
    intruder(s, 300, 120);
    const falling = tick(s, 5);
    falling.offer = [{ kind: 'upgrade', id: 'sharpshooter' }];
    expect(tick(falling, 20).fallingFor).toBe(falling.fallingFor);
  });
});

describe('replacing an injured defender', () => {
  it('after a wave, offers the injured one post and pauses the fight', () => {
    const after = injuredAfterWave(quiet());
    expect(after.wave).toBe(2);
    expect(after.replace).toEqual({ injuredId: 'a', postId: 0 });
    expect(replacePosts(after).map((p) => p.id)).toEqual([0]);
    const later = tick(after, 10);
    expect(later.time).toBe(after.time);
    expect(later.toSpawn).toBe(after.toSpawn);
  });

  it('no offer mid-wave', () => {
    const s = quiet();
    holdWave(s);
    s.defenders[0]!.hp = 0;
    expect(tick(s, STEP).replace).toBeNull();
  });

  it('sends the replacement in at full HP on that post', () => {
    const offered = injuredAfterWave(quiet());
    const r = replaceInjured(offered, 'c', 0);
    if (!r.ok) throw new Error(r.reason);
    const s = r.state;
    expect(s.replace).toBeNull();
    expect(s.posts[0]!.defenderId).toBe('c');
    expect(s.defenders).toEqual([
      standing({ id: 'c', name: 'C', weapon: 'pistol' }, s.posts[0]!, s.time),
    ]);
    expect(s.bench.map((d) => d.id)).toEqual(['b']);
    expect(s.tookPart).toEqual(['a', 'c']);
    expect(s.injured[0]!.offered).toBe(true);
    expect(tick(s, 1).time).toBeGreaterThan(s.time);
  });

  it('with the old post taken, the player picks a free post', () => {
    const s = quiet();
    field(s, 'b', 1);
    s.defenders[0]!.hp = 0;
    const injured = tick(s, STEP);
    // b moves onto a's old post before the wave ends: re-check in the break.
    expect(injured.replace).toEqual({ injuredId: 'a', postId: 0 });
    const t = quiet();
    field(t, 'b', 1);
    t.defenders[0]!.hp = 0;
    holdWave(t);
    let mid = tick(t, STEP);
    expect(mid.replace).toBeNull();
    const moved = moveDefender(mid, 'b', 0);
    if (!moved.ok) throw new Error(moved.reason);
    mid = moved.state;
    mid.enemies = [];
    const offered = tick(mid, STEP);
    expect(offered.replace).toEqual({ injuredId: 'a', postId: null });
    expect(replacePosts(offered).map((p) => p.id)).toEqual([1]);
    const r = replaceInjured(offered, 'c', 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.posts[1]!.defenderId).toBe('c');
    expect(() => replaceInjured(offered, 'c', 0)).not.toThrow();
    expect(replaceInjured(offered, 'c', 0)).toEqual({ ok: false, reason: 'Post taken' });
  });

  it('no offer with no usable free post', () => {
    const s = quiet();
    s.defenders[0]!.hp = 0;
    holdWave(s);
    let mid = tick(s, STEP);
    field(mid, 'b', 0);
    field(mid, 'c', 1);
    mid.enemies = [];
    // Bench empty and every post taken: put one back on the bench to test the posts alone.
    mid.bench.push({ id: 'd', name: 'D', weapon: 'pistol' });
    mid = tick(mid, STEP);
    expect(mid.wave).toBe(2);
    expect(mid.replace).toBeNull();
    expect(mid.injured[0]!.offered).toBe(false);
  });

  it('no offer with nobody on the bench', () => {
    const s = quiet();
    s.bench = [];
    expect(injuredAfterWave(s).replace).toBeNull();
  });

  it('no offer after the last wave: the horde is won', () => {
    const s = quiet();
    s.wave = s.waveCount;
    const after = injuredAfterWave(s);
    expect(after.outcome).toBe('won');
    expect(after.replace).toBeNull();
  });

  it('skip turns the offer down for good', () => {
    const skipped = skipReplace(injuredAfterWave(quiet()));
    expect(skipped.replace).toBeNull();
    expect(skipped.injured[0]!.offered).toBe(true);
    expect(skipped.bench.map((d) => d.id)).toEqual(['b', 'c']);
    // Next wave break: not offered again.
    skipped.toSpawn = 0;
    skipped.time = skipped.breakUntil;
    expect(tick(skipped, STEP).replace).toBeNull();
  });

  it('several injured: one offer each, in injury order', () => {
    const s = quiet();
    field(s, 'b', 1);
    s.bench.push({ id: 'd', name: 'D', weapon: 'pistol' });
    // Both go down the same step: injury order is `defenders` order.
    s.defenders[1]!.hp = 0;
    s.defenders[0]!.hp = 0;
    const offered = tick(s, STEP);
    expect(offered.injured.map((i) => i.defender.id)).toEqual(['a', 'b']);
    expect(offered.replace).toEqual({ injuredId: 'a', postId: 0 });
    const next = skipReplace(offered);
    expect(next.replace).toEqual({ injuredId: 'b', postId: 1 });
    const r = replaceInjured(next, 'd', 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.replace).toBeNull();
  });

  it('a card pick waits behind the offer, then opens', () => {
    const s = quiet();
    s.xp = 10;
    const offered = injuredAfterWave(s);
    expect(offered.replace).not.toBeNull();
    expect(offered.offer).toBeNull();
    const after = skipReplace(offered);
    expect(after.offer).not.toBeNull();
    expect(after.level).toBe(2);
  });

  it('moves are refused while the offer is open', () => {
    const offered = injuredAfterWave(quiet());
    field(offered, 'b', 1);
    expect(moveDefender(offered, 'b', 0)).toEqual({
      ok: false,
      reason: 'Pick a replacement first',
    });
  });

  it('a recruit card counts as taking part', () => {
    const s = quiet();
    s.offer = [{ kind: 'recruit', defender: { id: 'b', name: 'B', weapon: 'pistol' } }];
    expect(chooseCard(s, 0).tookPart).toEqual(['a', 'b']);
  });

  it('a defender dropped to the bench and sent back in takes part once', () => {
    const s = quiet();
    s.tookPart.push('b'); // b fought, then dropped to the bench
    s.offer = [{ kind: 'recruit', defender: { id: 'b', name: 'B', weapon: 'pistol' } }];
    expect(chooseCard(s, 0).tookPart).toEqual(['a', 'b']);
    const t = quiet();
    t.tookPart.push('b');
    const r = replaceInjured(injuredAfterWave(t), 'b', 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.state.tookPart).toEqual(['a', 'b']);
  });

  it('rejects programmer errors and leaves inputs untouched', () => {
    const offered = injuredAfterWave(quiet());
    const before = structuredClone(offered);
    expect(() => replaceInjured(quiet(), 'b', 0)).toThrow(RangeError);
    expect(() => skipReplace(quiet())).toThrow(RangeError);
    expect(() => replaceInjured(offered, 'a', 0)).toThrow(RangeError);
    expect(() => replaceInjured(offered, 'b', 1)).toThrow(RangeError);
    expect(() => replaceInjured(offered, 'b', 0.5)).toThrow(RangeError);
    replaceInjured(offered, 'b', 0);
    skipReplace(offered);
    expect(offered).toEqual(before);
  });
});
