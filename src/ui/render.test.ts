// Design §15: a turret's and a trap's state reads from its sprite: lit, dark, jammed, worn, broken.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTurret, newBase } from '../core/base.ts';
import { newGame, startHorde } from '../core/game.ts';
import { layoutOf, type Defender, type Layer, type Post } from '../core/horde.ts';
import { drawScene, trapLook, turretLook, type Scene } from './render.ts';
import { ART_IDS, ART_PX, type Art, type ArtId } from './sprites.ts';

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
    expect(turretLook(lit.s, lit.t)).toMatchObject({
      art: 'turret-lit',
      glow: true,
      jammed: false,
      sparks: false,
      smoke: false,
    });
    expect(turretLook(dark.s, dark.t)).toMatchObject({ art: 'turret-dark', glow: false });
    expect(turretLook(down.s, down.t)).toMatchObject({ art: 'turret-dark', glow: false });
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
    expect(jam).toMatchObject({ art: 'turret-jammed', jammed: true, sparks: false, smoke: false });
    const dark = scene(100, 0);
    const looks = [jam, at(100), turretLook(dark.s, dark.t)];
    expect(new Set(looks.map((l) => l.art)).size).toBe(3);
  });
});

describe('trap look', () => {
  it('draws spikes and wire apart, and each broken in its own broken sprite', () => {
    expect(trapLook({ kind: 'spikes', durability: 1 })).toEqual({ art: 'spikes', broken: false });
    expect(trapLook({ kind: 'wire', durability: 30 })).toEqual({ art: 'wire', broken: false });
    expect(trapLook({ kind: 'spikes', durability: 0 })).toEqual({
      art: 'spikes-broken',
      broken: true,
    });
    expect(trapLook({ kind: 'wire', durability: 0 })).toEqual({ art: 'wire-broken', broken: true });
  });
});

/**
 * A 2D context that records which art it was asked to draw: `drawImage` for sprites,
 * `createPattern` for textures. Everything else is a no-op.
 */
function recorder() {
  const drawn: ArtId[] = [];
  const textured: ArtId[] = [];
  const alphas: number[] = [];
  const noop = () => {};
  const ctx = {
    globalAlpha: 1,
    drawImage(img: { id: ArtId }) {
      drawn.push(img.id);
      alphas.push(ctx.globalAlpha);
    },
    createPattern(img: { id: ArtId }) {
      textured.push(img.id);
      return { setTransform: noop };
    },
    createRadialGradient: () => ({ addColorStop: noop }),
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    ellipse: noop,
  };
  // Fresh images each time, so the renderer's pattern cache never hides a texture.
  const art = Object.fromEntries(
    ART_IDS.map((id) => [id, { id, width: ART_PX, height: ART_PX }]),
  ) as unknown as Art;
  return { ctx: ctx as unknown as CanvasRenderingContext2D, art, drawn, textured, alphas };
}

const CAM = { x: 0, y: 0, zoom: 1 };
const VIEW = { w: 1600, h: 900 };

/** A fight's scene with only what a test puts in it. */
function blank(): Scene {
  const game = newGame();
  const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
  const empty = (l: Layer): Layer => ({
    ...l,
    segments: l.segments.map((s) => ({ ...s, kind: null, tier: null, hp: 0, maxHp: 0 })),
  });
  return {
    ...h,
    layers: h.layers.map(empty),
    posts: [],
    turrets: [],
    traps: [],
    defenders: [],
    enemies: [],
    shots: [],
    energy: 10,
  };
}
const withSegment = (s: Scene, seg: Partial<Layer['segments'][number]>): Scene => ({
  ...s,
  layers: s.layers.map((l, i) =>
    i === 0 ? { ...l, segments: l.segments.map((x, r) => (r === 0 ? { ...x, ...seg } : x)) } : l,
  ),
});

describe('drawScene with art', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'DOMMatrix',
      class {
        translate() {
          return this;
        }
        scale() {
          return this;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const draw = (scene: Scene) => {
    const r = recorder();
    drawScene(r.ctx, r.art, scene, CAM, VIEW);
    return r;
  };

  it('draws the ground and the camp, and skips an unbuilt slot', () => {
    const r = draw(blank());
    expect(r.textured).toEqual(['ground', 'camp-ground']);
    expect(new Set(r.drawn)).toEqual(new Set(['shack', 'tent']));
  });

  it("draws a whole wall in its tier's textures, with no cracks", () => {
    const r = draw(withSegment(blank(), { kind: 'wall', tier: 'metal', hp: 100, maxHp: 100 }));
    expect(r.textured).toEqual(expect.arrayContaining(['metal-top', 'metal-front']));
    expect(r.drawn).not.toContain('cracks');
  });

  it('shows damage as cracks, then puts the alpha back', () => {
    const scene = withSegment(blank(), { kind: 'wall', tier: 'wood', hp: 40, maxHp: 100 });
    // An enemy in front of the wall draws after it, and must draw opaque.
    const enemy = { id: 1, kind: 'shambler' as const, x: 600, y: 300 };
    const r = draw({
      ...scene,
      enemies: [{ ...enemy, hp: 20, maxHp: 20, nextAttackAt: 0, inCamp: false }],
    });
    const i = r.drawn.indexOf('cracks');
    expect(r.drawn.indexOf('shambler')).toBeGreaterThan(i);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.alphas[i]).toBeLessThan(1);
    expect(r.alphas.slice(i + 1).every((a) => a === 1)).toBe(true);
  });

  it("draws a broken segment as its tier's rubble only", () => {
    const r = draw(withSegment(blank(), { kind: 'gate', tier: 'concrete', hp: 0, maxHp: 100 }));
    expect(r.drawn).toContain('concrete-rubble');
    expect(r.textured).not.toContain('concrete-top');
    expect(r.drawn).not.toContain('gate');
  });

  it("puts a door on a standing gate's top", () => {
    const r = draw(withSegment(blank(), { kind: 'gate', tier: 'reinforced', hp: 100, maxHp: 100 }));
    expect(r.drawn).toContain('gate');
  });

  it('draws each mount, each turret state, and both trap states', () => {
    const scene = withSegment(blank(), { kind: 'wall', tier: 'wood', hp: 100, maxHp: 100 });
    const post = (kind: Post['kind'], id: number): Post => ({
      id,
      kind,
      column: 0,
      row: 1,
      x: 300 + id * 40,
      y: 100,
      defenderId: null,
    });
    const turret = (id: number, condition: number) => ({
      id,
      mount: 'tower' as const,
      column: 1,
      row: id,
      x: 600,
      y: 40 + id * 80,
      condition,
      nextShotAt: 0,
    });
    const r = draw({
      ...scene,
      posts: [post('tower', 0), post('ground', 1), post('wall-walk', 2)],
      turrets: [turret(0, 100), turret(1, 0)],
      traps: [
        { id: 0, kind: 'spikes', row: 0, durability: 30, hit: [] },
        { id: 1, kind: 'wire', row: 1, durability: 0, hit: [] },
      ],
    });
    expect(r.drawn).toEqual(
      expect.arrayContaining(['tower', 'ground-post', 'turret-lit', 'turret-jammed']),
    );
    expect(r.drawn).toEqual(expect.arrayContaining(['spikes', 'wire-broken']));
    expect(r.textured).toEqual(expect.arrayContaining(['wood-top', 'wood-front']));
    const dark = draw({ ...scene, energy: 0, turrets: [turret(0, 100)] });
    expect(dark.drawn).toContain('turret-dark');
  });

  it('draws each profession by its weapon, a shield in front, and the Shambler', () => {
    const base = blank();
    const game = newGame();
    const d0 = startHorde(game, 1, game.roster[0]!.id, 0, 0).defenders[0]!;
    const at = (i: number, loadout: Defender['loadout']): Defender => ({
      ...d0,
      id: `t${i}`,
      x: 200,
      y: 60 + i * 80,
      walking: true,
      loadout,
    });
    const r = draw({
      ...base,
      defenders: [
        at(0, d0.loadout),
        at(1, { ...d0.loadout, secondary: 'knife', item: 'shield' }),
        at(2, { ...d0.loadout, secondary: 'toolkit' }),
      ],
      enemies: [
        {
          id: 1,
          kind: 'shambler',
          x: 1400,
          y: 100,
          hp: 5,
          maxHp: 20,
          nextAttackAt: 0,
          inCamp: false,
        },
      ],
    });
    expect(r.drawn).toEqual(
      expect.arrayContaining(['gunner', 'ripper', 'engineer', 'shield', 'shambler']),
    );
  });
});
