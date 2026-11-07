// ID-080: a fight's sound cues, read from two frames of it.
import { describe, expect, it } from 'vitest';
import { newHorde, tick, type HordeState } from '../core/horde.ts';
import { enemy, horror, setup } from '../core/testing.ts';
import { cuesBetween } from './sound.ts';

const fight = (): HordeState => newHorde(7, setup());
/** `s` and a copy of it to change, as the next frame. */
function frames(s = fight()): [HordeState, HordeState] {
  const next = structuredClone(s);
  next.time = s.time + 0.1;
  return [s, next];
}

describe('Sound cues (ID-080)', () => {
  it('none without a frame before, from another fight, or for the same frame twice', () => {
    const s = fight();
    expect(cuesBetween(null, s)).toEqual([]);
    const other = structuredClone(s);
    other.startedAt = 99;
    other.shots.push({ owner: 'a', at: 1 });
    expect(cuesBetween(s, other)).toEqual([]);
    expect(cuesBetween(s, structuredClone(s))).toEqual([]);
  });

  it('a real fight: the pistol fires, and the shot heard once is not heard again', () => {
    const s = fight();
    enemy(s, { x: 400 });
    let t = s;
    let cues: string[] = [];
    for (let i = 0; i < 40 && !cues.includes('shot-pistol'); i++) {
      const next = tick(t, 0.05);
      cues = cuesBetween(t, next);
      t = next;
    }
    expect(cues).toContain('shot-pistol');
    expect(cuesBetween(t, t)).toEqual([]);
  });

  it('each gun kind has its own shot, by the slot that fired; turrets theirs', () => {
    const [prev, next] = frames();
    const d = next.defenders[0]!;
    d.loadout = {
      primary: { uid: 'r1', base: 'rifle', rarity: 'common', affixes: [] },
      secondary: 'pistol',
      item: null,
    };
    prev.defenders[0]!.ammo = { primary: 30, secondary: 12 };
    d.ammo = { primary: 30, secondary: 11 };
    next.shots.push({ owner: d.id, at: next.time });
    expect(cuesBetween(prev, next)).toEqual(['shot-pistol']);
    d.ammo = { primary: 29, secondary: 12 };
    expect(cuesBetween(prev, next)).toEqual(['shot-rifle']);
    next.shots.push({ owner: 'turret:0', at: next.time });
    expect(cuesBetween(prev, next)).toEqual(['shot-rifle', 'shot-turret']);
  });

  it('a long frame at 3× that adds and drops a muzzle flash still sounds the shot', () => {
    const s = fight();
    enemy(s, { x: 400 });
    let t = s;
    let cues: string[] = [];
    for (let i = 0; i < 10 && !cues.includes('shot-pistol'); i++) {
      // 0.3 s of fight in one frame: longer than a muzzle flash stays listed.
      const next = tick(t, 0.3);
      cues = cuesBetween(t, next);
      t = next;
    }
    expect(cues).toContain('shot-pistol');
    // Without the flash list at all, the magazine going down is enough.
    const [prev, next] = frames();
    next.defenders[0]!.ammo.primary = prev.defenders[0]!.ammo.primary - 1;
    expect(cuesBetween(prev, next)).toEqual(['shot-pistol']);
  });

  it('a gun swapped for one with a smaller magazine is no shot', () => {
    const [prev, next] = frames();
    const d = next.defenders[0]!;
    d.loadout = {
      ...d.loadout,
      primary: { uid: 's1', base: 'sniper', rarity: 'common', affixes: [] },
    };
    d.ammo.primary = 5;
    prev.defenders[0]!.ammo.primary = 12;
    expect(cuesBetween(prev, next)).toEqual([]);
  });

  it('a turret shot read from its next shot moving later', () => {
    const [prev, next] = frames();
    if (next.turrets.length === 0) {
      const t = {
        id: 0,
        mount: 'wall',
        column: 0,
        row: 0,
        x: 0,
        y: 0,
        condition: 1,
        nextShotAt: 0,
      };
      prev.turrets = [structuredClone(t)] as typeof prev.turrets;
      next.turrets = [structuredClone(t)] as typeof next.turrets;
    }
    expect(cuesBetween(prev, next)).toEqual([]);
    next.turrets[0]!.nextShotAt += 1;
    expect(cuesBetween(prev, next)).toEqual(['shot-turret']);
  });

  it('many shots in one frame are one cue; a shot by someone gone is none', () => {
    const [prev, next] = frames();
    for (let i = 0; i < 20; i++) next.shots.push({ owner: 'a', at: next.time - i * 0.001 });
    next.shots.push({ owner: 'ghost', at: next.time });
    expect(cuesBetween(prev, next)).toEqual(['shot-pistol']);
  });

  it('a reload starting', () => {
    const [prev, next] = frames();
    next.defenders[0]!.reloadedAt.primary = next.time + 2;
    expect(cuesBetween(prev, next)).toEqual(['reload']);
  });

  it('hits on enemies (a bullet or a strike, not a miss) and kills', () => {
    const [prev, next] = frames();
    next.impacts.push({ x: 1, y: 2, at: next.time, hit: false });
    expect(cuesBetween(prev, next)).toEqual([]);
    next.impacts.push({ x: 3, y: 4, at: next.time, hit: true });
    expect(cuesBetween(prev, next)).toEqual(['enemy-hit']);
    const [p2, n2] = frames();
    n2.strikes.push({ x: 1, y: 1, at: n2.time, owner: 'a' });
    expect(cuesBetween(p2, n2)).toEqual(['enemy-hit']);
    const s = fight();
    enemy(s, {});
    const [p3, n3] = frames(s);
    n3.enemies = [];
    expect(cuesBetween(p3, n3)).toEqual(['enemy-die']);
  });

  it('the wall: a hit mark, and a break (which is not also a hit)', () => {
    const [prev, next] = frames();
    const at = prev.layers.findIndex((l) => l.segments.some((g) => g.hp > 0));
    const si = prev.layers[at]!.segments.findIndex((g) => g.hp > 0);
    const seg = next.layers[at]!.segments[si]!;
    seg.hitAt = next.time;
    seg.hp -= 1;
    expect(cuesBetween(prev, next)).toEqual(['wall-hit']);
    seg.hp = 0;
    expect(cuesBetween(prev, next)).toEqual(['wall-break']);
  });

  it('cards: a level-up (its offer comes with it), a reroll, a pick', () => {
    const [prev, next] = frames();
    next.level = prev.level + 1;
    next.offer = [{ kind: 'upgrade', id: 'sharpshooter' }];
    expect(cuesBetween(prev, next)).toEqual(['level-up']);
    const open = structuredClone(next);
    const rerolled = structuredClone(next);
    rerolled.offer = [{ kind: 'upgrade', id: 'rapid-fire' }];
    expect(cuesBetween(open, rerolled)).toEqual(['card-offer']);
    // The same cards copied by a step are no new offer.
    expect(cuesBetween(open, structuredClone(open))).toEqual([]);
    // A reroll that deals the same cards still sounds.
    const same = structuredClone(open);
    same.rerolls = open.rerolls + 1;
    expect(cuesBetween(open, same)).toEqual(['card-offer']);
    const picked = structuredClone(next);
    picked.offer = null;
    expect(cuesBetween(open, picked)).toEqual(['card-pick']);
  });

  it('the horde won or lost, once', () => {
    const [prev, next] = frames();
    next.outcome = 'won';
    expect(cuesBetween(prev, next)).toEqual(['won']);
    next.outcome = 'lost';
    expect(cuesBetween(prev, next)).toEqual(['lost']);
    const after = structuredClone(next);
    expect(cuesBetween(next, after)).toEqual([]);
  });
  it('a boss skill winding up, once as it starts (ID-099)', () => {
    const s = fight();
    s.toSpawn = 0;
    horror(s, 'roar', {}, { nextAt: 5 });
    const [prev, next] = frames(s);
    expect(cuesBetween(prev, next)).toEqual([]);
    prev.time = 3.7;
    next.time = 3.9;
    expect(cuesBetween(prev, next)).toEqual(['boss-windup']);
    const later = structuredClone(next);
    later.time = 4.2;
    expect(cuesBetween(next, later)).toEqual([]);
  });

  it('a swarm wave starting (ID-099)', () => {
    const [prev, next] = frames();
    next.swarm = true;
    next.breakUntil = 0.05;
    expect(cuesBetween(prev, next)).toEqual(['swarm']);
    const after = structuredClone(next);
    after.time += 0.1;
    expect(cuesBetween(next, after)).toEqual([]);
  });
});
