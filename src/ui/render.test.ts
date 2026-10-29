// Design §15: a turret's state reads from its sprite: lit, dark, jammed, worn.
import { describe, expect, it } from 'vitest';
import { buildTurret, newBase } from '../core/base.ts';
import { layoutOf } from '../core/horde.ts';
import { trapLook, turretLook } from './render.ts';

function scene(condition: number, energy: number, wallHp?: number) {
  const r = buildTurret(
    newBase(),
    { scrap: 99, wood: 99, metal: 0, concrete: 0 },
    true,
    'wall-walk',
    0,
    0,
  );
  if (!r.ok) throw new Error(r.reason);
  r.base.turrets[0]!.condition = condition;
  const { layers, turrets } = layoutOf(r.base);
  if (wallHp !== undefined) layers[0]!.segments[0]!.hp = wallHp;
  return { s: { layers, energy }, t: turrets[0]! };
}

describe('turret look', () => {
  it('lit when powered and whole, dark with no charge or its wall down', () => {
    const lit = scene(100, 10);
    const dark = scene(100, 0);
    const down = scene(100, 10, 0);
    expect(turretLook(lit.s, lit.t)).toMatchObject({ jammed: false, sparks: false, smoke: false });
    expect(turretLook(dark.s, dark.t).top).not.toBe(turretLook(lit.s, lit.t).top);
    expect(turretLook(down.s, down.t).top).toBe(turretLook(dark.s, dark.t).top);
  });

  it('sparks below 50, smoke below 25, and a distinct jammed look at 0', () => {
    const at = (c: number) => {
      const { s, t } = scene(c, 10);
      return turretLook(s, t);
    };
    expect(at(50)).toMatchObject({ sparks: false, smoke: false });
    expect(at(49)).toMatchObject({ sparks: true, smoke: false });
    expect(at(24)).toMatchObject({ sparks: true, smoke: true });
    const jam = at(0);
    expect(jam).toMatchObject({ jammed: true, sparks: false, smoke: false });
    const dark = scene(100, 0);
    const looks = [jam, at(100), turretLook(dark.s, dark.t)];
    expect(new Set(looks.map((l) => l.top)).size).toBe(3);
  });
});

describe('trap look', () => {
  it('draws spikes and wire apart, and any broken trap grey', () => {
    const spikes = trapLook({ kind: 'spikes', durability: 1 });
    const wire = trapLook({ kind: 'wire', durability: 30 });
    expect(spikes.broken).toBe(false);
    expect(wire.broken).toBe(false);
    expect(spikes.bed).not.toBe(wire.bed);
    const broken = [
      trapLook({ kind: 'spikes', durability: 0 }),
      trapLook({ kind: 'wire', durability: 0 }),
    ];
    expect(broken[0]).toEqual(broken[1]);
    expect(broken[0]!.broken).toBe(true);
    expect(broken[0]!.bed).not.toBe(spikes.bed);
  });
});
