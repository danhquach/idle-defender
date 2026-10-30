// Design §15: a turret's and a trap's state reads from its sprite: lit, dark, jammed, worn, broken.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTurret, newBase } from '../core/base.ts';
import { newGame, startHorde } from '../core/game.ts';
import { layoutOf, tick, type Defender, type Layer, type Post } from '../core/horde.ts';
import {
  ENEMIES,
  IMPACT_FLASH,
  MUZZLE_FLASH,
  SKILL_FLASH,
  SKILLS,
  STEP,
  TURRET,
  WEAPONS,
  type EnemyKind,
  type Tracer,
} from '../core/data.ts';
import type { Bullet, Enemy } from '../core/horde.ts';
import { ANIM, Animator } from './anim.ts';
import { project, TILT } from './projection.ts';
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
    rect: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
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
    strikes: [],
    bullets: [],
    energy: 10,
  };
}
const withSegment = (s: Scene, seg: Partial<Layer['segments'][number]>): Scene => ({
  ...s,
  layers: s.layers.map((l, i) =>
    i === 0 ? { ...l, segments: l.segments.map((x, r) => (r === 0 ? { ...x, ...seg } : x)) } : l,
  ),
});

function stubCanvas() {
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
  // The ground is painted once into its own canvas (ground.test.ts); here it only
  // needs to be drawn, under a name the recorder can see.
  const noop = () => {};
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      id = 'ground-canvas';
      getContext() {
        return {
          drawImage: noop,
          fillRect: noop,
          save: noop,
          restore: noop,
          translate: noop,
          scale: noop,
          createPattern: () => ({ setTransform: noop }),
          createLinearGradient: () => ({ addColorStop: noop }),
        };
      }
    },
  );
}

describe('drawScene with art', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  const draw = (scene: Scene) => {
    const r = recorder();
    drawScene(r.ctx, r.art, scene, CAM, VIEW);
    return r;
  };

  it('draws the painted ground (field and yard) first, then the camp, and skips an unbuilt slot', () => {
    const r = draw(blank());
    expect(r.textured).toEqual([]);
    expect(r.drawn[0]).toBe('ground-canvas');
    expect(new Set(r.drawn.slice(1))).toEqual(new Set(['shack', 'tent']));
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
      enemies: [
        {
          ...enemy,
          hp: 20,
          maxHp: 20,
          nextAttackAt: 0,
          inCamp: false,
          stunnedUntil: 0,
          vx: 0,
          vy: 0,
          climbUntil: 0,
          climbed: false,
        },
      ],
    });
    const i = r.drawn.indexOf('cracks');
    expect(r.drawn.indexOf('shambler')).toBeGreaterThan(i);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.alphas[i]).toBeLessThan(1);
    expect(r.alphas.slice(i + 1).every((a) => a === 1)).toBe(true);
  });

  it('draws every enemy kind (art or placeholder shape) and a Spitter glob without a throw (ID-023)', () => {
    const kinds = Object.keys(ENEMIES) as EnemyKind[];
    const base = blank();
    const r = draw({
      ...base,
      time: 1,
      enemies: kinds.map((kind, i) => ({
        id: i,
        kind,
        x: 700 + i * 40,
        y: 300,
        hp: 10,
        maxHp: 10,
        nextAttackAt: 0,
        inCamp: false,
        stunnedUntil: 0,
        vx: 0,
        vy: 0,
        climbUntil: 0,
        climbed: false,
      })),
      spits: [{ fromX: 900, fromY: 300, x: 520, y: 300, at: 0.9 }],
    });
    // Only the Shambler has art yet; the rest are drawn shapes.
    expect(r.drawn.filter((id) => id === 'shambler')).toHaveLength(1);
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

  it('draws each profession by its weapon, a Gunner by their gun, a shield in front, and the Shambler', () => {
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
        at(3, {
          ...d0.loadout,
          primary: { uid: 'h1', base: 'rifle', rarity: 'common', affixes: [] },
        }),
        at(4, {
          ...d0.loadout,
          primary: { uid: 'h2', base: 'sniper', rarity: 'rusty', affixes: [] },
        }),
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
          stunnedUntil: 0,
          vx: 0,
          vy: 0,
          climbUntil: 0,
          climbed: false,
        },
      ],
    });
    expect(r.drawn).toEqual(
      expect.arrayContaining([
        'gunner-pistol',
        'gunner',
        'gunner-sniper',
        'ripper',
        'engineer',
        'shield',
        'shambler',
      ]),
    );
  });

  it('draws a molotov fire, a fading skill flash and the armed reach on the ground (ID-019)', () => {
    const r = recorder();
    const rings: number[] = [];
    const alphas: number[] = [];
    Object.assign(r.ctx, {
      ellipse: (_x: number, _y: number, rx: number, ry: number) => {
        rings.push(rx);
        expect(ry).toBeCloseTo(rx * TILT, 9);
      },
      fill: () => alphas.push(r.ctx.globalAlpha),
    });
    const scene: Scene = {
      ...blank(),
      time: 0.3,
      fires: [{ x: 900, y: 200, until: 5 }],
      blasts: [{ skill: 'airstrike', x: 700, y: 100, at: 0.1 }],
    };
    drawScene(r.ctx, r.art, scene, CAM, VIEW, null, null, { skill: 'flashbang', x: 500, y: 50 });
    const { molotov, airstrike, flashbang } = SKILLS;
    expect(rings).toEqual([molotov.radius, airstrike.radius, flashbang.radius]);
    expect(alphas[1]).toBeCloseTo(0.6 * (1 - 0.2 / SKILL_FLASH), 9); // the flash fades
    expect(r.ctx.globalAlpha).toBe(1);
  });
});

/** Lines and dots the renderer drew, with their colour and alpha, and the sprites between them. */
function geometry(cam: { x: number; y: number; zoom: number }, scene: Scene) {
  const r = recorder();
  type Mark =
    | { kind: 'line'; a: [number, number]; b: [number, number]; colour: string; width: number }
    | { kind: 'dot'; x: number; y: number; r: number; colour: string; alpha: number }
    | { kind: 'art'; id: ArtId };
  const marks: Mark[] = [];
  let from: [number, number] = [0, 0];
  const ctx = r.ctx as unknown as Record<string, unknown> & {
    strokeStyle: string;
    fillStyle: string;
    lineWidth: number;
    globalAlpha: number;
  };
  Object.assign(ctx, {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    drawImage: (img: { id: ArtId }) => marks.push({ kind: 'art', id: img.id }),
    moveTo: (x: number, y: number) => (from = [x, y]),
    lineTo: (x: number, y: number) =>
      marks.push({
        kind: 'line',
        a: from,
        b: [x, y],
        colour: ctx.strokeStyle,
        width: ctx.lineWidth,
      }),
    arc: (x: number, y: number, rad: number) =>
      marks.push({ kind: 'dot', x, y, r: rad, colour: ctx.fillStyle, alpha: ctx.globalAlpha }),
  });
  drawScene(r.ctx, r.art, scene, cam, VIEW);
  const lines = marks.filter((m) => m.kind === 'line');
  const dots = marks.filter((m) => m.kind === 'dot');
  return { marks, lines, dots, alpha: ctx.globalAlpha };
}

const PUFF = { blood: '#8e1f1a', dust: '#a8987c', flash: '#fff2b0', slug: '#fffbe8' } as const;

describe('bullet visuals (ID-045)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  /** A fight with defender 0 on their post, one enemy out in the field, nothing else moving. */
  function fight() {
    const game = newGame();
    const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    const d = h.defenders[0]!;
    const post = h.posts[d.postId]!;
    const target: Enemy = {
      id: 1,
      kind: 'shambler',
      x: post.x + 400,
      y: post.y + 30,
      hp: 20,
      maxHp: 20,
      nextAttackAt: 0,
      inCamp: false,
      stunnedUntil: 0,
      vx: 0,
      vy: 0,
      climbUntil: 0,
      climbed: false,
    };
    const scene: Scene = { ...h, enemies: [target], bullets: [], shots: [], impacts: [] };
    return { scene, d, post, target };
  }
  /** A bullet from `post` toward `target`, `flown` px out. */
  function flying(
    from: { x: number; y: number },
    to: { x: number; y: number },
    flown: number,
    tracer: Tracer = WEAPONS.pistol.tracer,
  ): Bullet {
    const aim = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) / aim;
    const dy = (to.y - from.y) / aim;
    return {
      x: from.x + dx * flown,
      y: from.y + dy * flown,
      dx,
      dy,
      speed: 1800,
      damage: 6,
      owner: 'a',
      fromX: from.x,
      fromY: from.y,
      aim,
      left: 600 - flown,
      pierce: 0,
      hit: [],
      tracer,
    };
  }

  it.each([0.5, 1, 2])(
    'no laser at %s× zoom: every line is a short streak, none joins shooter and target',
    (zoom) => {
      const cam = { x: 0, y: 0, zoom };
      const { scene, post, target } = fight();
      // Just fired, midway, and about to land.
      const bullets = [5, 60, 200, 370].map((f) => flying(post, target, f));
      const g = geometry(cam, { ...scene, bullets });
      expect(g.lines).toHaveLength(bullets.length);
      const shooter = project(post, cam);
      const enemyAt = project(target, cam);
      for (const l of g.lines) {
        if (l.kind !== 'line') continue;
        const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
        // The streak drops toward body height too, so a hair over its flat length.
        expect(len).toBeLessThanOrEqual(WEAPONS.pistol.tracer.length * zoom * 1.1);
        const near = (p: [number, number], q: { sx: number; sy: number }) =>
          Math.hypot(p[0] - q.sx, p[1] - q.sy) < 1;
        expect(near(l.a, shooter) && near(l.b, enemyAt)).toBe(false);
      }
    },
  );

  it('draws each bullet as a slug at its simulated position, through the depth sort', () => {
    const cam = { x: 37, y: 12, zoom: 1.5 };
    const { scene, post, target } = fight();
    const b = flying(post, target, 150);
    // An enemy in front of the bullet (lower on screen) draws over it.
    const front: Enemy = { ...target, id: 2, x: b.x + 5, y: b.y + 40 };
    const g = geometry(cam, { ...scene, enemies: [target, front], bullets: [b] });
    const slugs = g.dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.slug);
    expect(slugs).toHaveLength(1);
    const slug = slugs[0]!;
    if (slug.kind !== 'dot') throw new Error('not a dot');
    expect(slug.x).toBeCloseTo((b.x - cam.x) * cam.zoom, 9);
    // On screen it sits between the ground under it and the muzzle height.
    const ground = project({ x: b.x, y: b.y }, cam).sy;
    expect(slug.y).toBeLessThan(ground);
    const at = g.marks.indexOf(slug);
    const shamblers = g.marks.flatMap((m, i) =>
      m.kind === 'art' && m.id === 'shambler' ? [i] : [],
    );
    expect(shamblers).toHaveLength(2);
    expect(shamblers[1]).toBeGreaterThan(at); // the enemy in front
  });

  it("takes each bullet's streak length and colour from its gun", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, post, target } = fight();
    const long: Tracer = { length: 40, colour: '#123456' };
    const g = geometry(cam, {
      ...scene,
      bullets: [
        flying(post, { x: target.x, y: post.y }, 200),
        flying(post, { x: target.x, y: post.y }, 200, long),
      ],
    });
    const byColour = Object.fromEntries(
      g.lines.map((l) => (l.kind === 'line' ? [l.colour, Math.abs(l.b[0] - l.a[0])] : [])),
    );
    expect(byColour[WEAPONS.pistol.tracer.colour]).toBeCloseTo(WEAPONS.pistol.tracer.length, 6);
    expect(byColour[long.colour]).toBeCloseTo(40, 6);
    expect(TURRET.tracer).not.toEqual(WEAPONS.pistol.tracer);
  });

  it('flashes at the barrel for MUZZLE_FLASH s after a shot, fading', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, d, post } = fight();
    const at = (time: number) =>
      geometry(cam, { ...scene, time, shots: [{ owner: d.id, at: 1 }] }).dots.filter(
        (m) => m.kind === 'dot' && m.colour === PUFF.flash,
      );
    const fresh = at(1);
    expect(fresh).toHaveLength(1);
    const flash = fresh[0]!;
    if (flash.kind !== 'dot') throw new Error('not a dot');
    // Ahead of the shooter's spot and up at the weapon, not on the ground.
    expect(flash.x).toBeGreaterThan(project(post, cam).sx);
    expect(flash.y).toBeLessThan(project(post, cam).sy);
    expect(flash.alpha).toBe(1);
    const half = at(1 + MUZZLE_FLASH / 2)[0]!;
    expect(half.kind === 'dot' && half.alpha).toBeCloseTo(0.5, 9);
    expect(at(1 + MUZZLE_FLASH)).toEqual([]);
    // Someone else's shot flashes nothing here.
    expect(geometry(cam, { ...scene, time: 1, shots: [{ owner: 'zz', at: 1 }] }).dots).toEqual([]);
  });

  it('shows a real shot at full flash on the first frame after the step that fired it', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene } = fight();
    const game = newGame();
    const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    const d = h.defenders[0]!;
    const post = h.posts[d.postId]!;
    h.toSpawn = 0;
    h.enemies = [{ ...scene.enemies[0]!, x: post.x + 300 }];
    d.nextShotAt = 0;
    const fired = tick(h, STEP);
    expect(fired.shots.map((k) => k.owner)).toEqual([d.id]);
    const flashes = (t: Scene) =>
      geometry(cam, t).dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.flash);
    const first = flashes(fired);
    expect(first).toHaveLength(1);
    expect(first[0]!.kind === 'dot' && first[0]!.alpha).toBe(1);
    // Still showing, fading, on the next frame: about MUZZLE_FLASH in all.
    expect(flashes(tick(fired, STEP))).toHaveLength(1);
  });

  it('flashes at a walking defender and starts their bullet at a standing height', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, d, target } = fight();
    const walker = { ...d, walking: true, x: 300, y: 500 };
    const g = geometry(cam, {
      ...scene,
      posts: [],
      defenders: [walker],
      time: 1,
      shots: [{ owner: d.id, at: 1 }],
      bullets: [flying(walker, target, 30)],
    });
    const flash = g.dots.find((m) => m.kind === 'dot' && m.colour === PUFF.flash);
    expect(flash).toBeDefined();
    const feet = project(walker, cam).sy;
    if (flash?.kind !== 'dot') throw new Error('not a dot');
    // Up at the weapon, well under a tower's height.
    expect(feet - flash.y).toBeGreaterThan(5);
    expect(feet - flash.y).toBeLessThan(30);
    const streak = g.lines[0]!;
    if (streak.kind !== 'line') throw new Error('not a line');
    expect(feet - streak.a[1]).toBeLessThan(30);
  });

  it("flashes at a turret's barrel when it fires", () => {
    const built = buildTurret(
      newBase(),
      { scrap: 99, wood: 99, metal: 0, concrete: 0 },
      true,
      'tower',
      0,
      5,
    );
    if (!built.ok) throw new Error(built.reason);
    const { turrets, layers } = layoutOf(built.base);
    const { scene } = fight();
    const g = geometry(
      { x: 0, y: 0, zoom: 1 },
      { ...scene, layers, turrets, time: 2, shots: [{ owner: `turret:${turrets[0]!.id}`, at: 2 }] },
    );
    expect(g.dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.flash)).toHaveLength(1);
  });

  it('a hit puffs blood at body height, a miss kicks dust on the ground; both fade out', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene } = fight();
    const impacts = [
      { x: 900, y: 300, hit: true, at: 1 },
      { x: 1100, y: 500, hit: false, at: 1 },
    ];
    const g = geometry(cam, { ...scene, enemies: [], time: 1.05, impacts });
    const blood = g.dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.blood);
    const dust = g.dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.dust);
    expect(blood.length).toBeGreaterThan(0);
    expect(dust.length).toBeGreaterThan(0);
    const lowest = (ds: typeof blood) => Math.max(...ds.map((m) => (m.kind === 'dot' ? m.y : 0)));
    // Blood sits well up the body; dust hugs the ground.
    expect(project({ x: 900, y: 300 }, cam).sy - lowest(blood)).toBeGreaterThan(5);
    expect(project({ x: 1100, y: 500 }, cam).sy - lowest(dust)).toBeLessThan(5);
    expect(g.alpha).toBe(1);
    const gone = geometry(cam, { ...scene, enemies: [], time: 1 + IMPACT_FLASH, impacts });
    expect(gone.dots).toEqual([]);
  });

  it('keeps the melee slash: one short line across the enemy, no bullet marks', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, target } = fight();
    const g = geometry(cam, {
      ...scene,
      strikes: [{ x: target.x, y: target.y, at: 0, owner: 'a' }],
    });
    expect(g.lines).toHaveLength(1);
    expect(g.dots).toEqual([]);
  });

  it('keeps every effect at least 1 px on screen at 0.5× zoom, and scales it up at 2×', () => {
    const { scene, d, post, target } = fight();
    const busy = (zoom: number) =>
      geometry(
        { x: 0, y: 0, zoom },
        {
          ...scene,
          time: 1,
          bullets: [flying(post, target, 100)],
          shots: [{ owner: d.id, at: 1 }],
          impacts: [{ x: 900, y: 300, hit: true, at: 1 }],
        },
      );
    const small = busy(0.5);
    const big = busy(2);
    for (const m of small.marks) {
      if (m.kind === 'dot') expect(m.r).toBeGreaterThanOrEqual(1);
      if (m.kind === 'line') expect(m.width).toBeGreaterThanOrEqual(1);
    }
    const sizes = (g: typeof small) => g.dots.map((m) => (m.kind === 'dot' ? m.r : 0));
    sizes(big).forEach((r, i) => expect(r).toBeGreaterThan(sizes(small)[i]!));
  });
});

describe('sprite animation (ID-049)', () => {
  beforeEach(() => {
    stubCanvas();
    // A hit's white silhouette is a sprite-sized canvas; the ground's is field-sized.
    const Ground = globalThis.OffscreenCanvas as unknown as new () => { id: string };
    vi.stubGlobal(
      'OffscreenCanvas',
      class extends Ground {
        constructor(w: number, h: number) {
          super();
          if (w === ART_PX && h === ART_PX) this.id = 'white';
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Each sprite drawn, with the move, turn and alpha it was drawn under. */
  function poses(scene: Scene, anim: Animator) {
    const r = recorder();
    type Draw = { id: ArtId | 'white'; tx: number; ty: number; rot: number; alpha: number };
    const draws: Draw[] = [];
    let t = { tx: 0, ty: 0, rot: 0 };
    const stack: (typeof t)[] = [];
    const ctx = r.ctx as unknown as Record<string, unknown> & { globalAlpha: number };
    Object.assign(ctx, {
      save: () => stack.push({ ...t, alpha: ctx.globalAlpha } as typeof t),
      restore: () => {
        const top = stack.pop() as typeof t & { alpha: number };
        t = { tx: top.tx, ty: top.ty, rot: top.rot };
        ctx.globalAlpha = top.alpha;
      },
      translate: (x: number, y: number) => (t = { ...t, tx: t.tx + x, ty: t.ty + y }),
      rotate: (a: number) => (t = { ...t, rot: t.rot + a }),
      scale: () => {},
      drawImage: (img: { id: ArtId }) => draws.push({ id: img.id, ...t, alpha: ctx.globalAlpha }),
    });
    drawScene(r.ctx, r.art, scene, CAM, VIEW, null, null, null, anim);
    return {
      draws,
      shambler: draws.filter((d) => d.id === 'shambler'),
      flashes: draws.filter((d) => d.id === 'white'),
      balanced: stack.length === 0 && ctx.globalAlpha === 1,
    };
  }
  /** A fight with one Shambler walking up the field. */
  function walking() {
    const game = newGame();
    const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    const e: Enemy = {
      id: 7,
      kind: 'shambler',
      x: 900,
      y: 60,
      hp: 20,
      maxHp: 20,
      nextAttackAt: 0,
      inCamp: false,
      stunnedUntil: 0,
      vx: -30,
      vy: 0,
      climbUntil: 0,
      climbed: false,
    };
    return { ...h, time: 3, enemies: [e], bullets: [], shots: [], impacts: [], strikes: [] };
  }

  it('a hit makes the enemy flinch back and flash white', () => {
    const anim = new Animator();
    const s = walking();
    const before = poses(s, anim).shambler[0]!;
    const hurt = { ...s, time: s.time + STEP, enemies: [{ ...s.enemies[0]!, hp: 12 }] };
    const hit = poses(hurt, anim);
    const unhurt = poses({ ...hurt, enemies: [s.enemies[0]!] }, new Animator());
    expect(hit.shambler[0]!.tx).toBeCloseTo(unhurt.shambler[0]!.tx + ANIM.flinch.px, 6);
    expect(hit.flashes).toHaveLength(1);
    expect(unhurt.flashes).toHaveLength(0);
    expect(before.tx).not.toBe(hit.shambler[0]!.tx);
    expect(hit.balanced).toBe(true);
  });

  it('a dead enemy falls and fades where it stood before it is removed', () => {
    const anim = new Animator();
    const s = walking();
    poses(s, anim);
    const gone = (dt: number) => poses({ ...s, time: s.time + dt, enemies: [] }, anim);
    const first = gone(STEP);
    expect(first.shambler).toHaveLength(1);
    expect(first.shambler[0]!.rot).toBeCloseTo(0, 6);
    // The killing blow flashes it, though it never flinched.
    expect(first.flashes).toHaveLength(1);
    const mid = gone(STEP + 0.3);
    expect(mid.shambler[0]!.rot).toBeGreaterThan(0.5);
    const fading = gone(STEP + ANIM.fall.time - 0.1);
    expect(fading.shambler[0]!.alpha).toBeLessThan(0.5);
    expect(gone(STEP + ANIM.fall.time).shambler).toHaveLength(0);
  });

  it("the fight's last kill ends it mid-fall, so the result screen shows no corpse", () => {
    const anim = new Animator();
    const s = walking();
    poses(s, anim);
    const won = poses({ ...s, time: s.time + STEP, enemies: [], outcome: 'won' }, anim);
    expect(won.shambler).toHaveLength(0);
    expect(anim.corpses).toHaveLength(1);
  });

  it('pause freezes motion; running the fight moves it again', () => {
    const anim = new Animator();
    const game = newGame();
    let h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    while (h.enemies.length === 0) h = tick(h, 0.1);
    h = tick(h, 0.5);
    // An open card pick pauses the fight (any offer, even an empty one).
    const paused = { ...h, offer: [] as typeof h.offer };
    const a = poses(tick(paused, 0.5), anim).draws;
    const b = poses(tick(tick(paused, 0.5), 0.5), anim).draws;
    expect(b).toEqual(a);
    expect(poses(tick(h, 0.2), anim).draws).not.toEqual(a);
  });

  it('follows game speed: the same fight time gives the same pose however it was stepped', () => {
    const game = newGame();
    let h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    while (h.enemies.length === 0) h = tick(h, 0.1);
    const fast = tick(h, 1);
    const slow = tick(tick(tick(tick(h, 0.25), 0.25), 0.25), 0.25);
    expect(poses(fast, new Animator()).draws).toEqual(poses(slow, new Animator()).draws);
  });

  it('without an animator (build mode) nothing moves, placeholder shapes included', () => {
    const w = walking();
    const s = {
      ...w,
      enemies: [...w.enemies, { ...w.enemies[0]!, id: 8, kind: 'runner' as const }],
    };
    const r = recorder();
    const moved: unknown[] = [];
    Object.assign(r.ctx, { save: () => moved.push('save') });
    drawScene(r.ctx, r.art, s, CAM, VIEW);
    expect(moved).toEqual([]);
  });
});
