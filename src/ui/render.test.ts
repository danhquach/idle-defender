// Design §15: a turret's and a trap's state reads from its sprite: lit, dark, jammed, worn, broken.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTurret, newBase, type Base } from '../core/base.ts';
import { recruit } from '../core/camp.ts';
import { newGame, startHorde, type GameState } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { layoutOf, tick, type Defender, type Layer, type Post } from '../core/horde.ts';
import {
  CAMP,
  DAMAGE_POP,
  CARD,
  ENEMIES,
  FIELD,
  IMPACT_FLASH,
  MUZZLE_FLASH,
  SKILL_FLASH,
  SKILLS,
  STEP,
  TURRET,
  WEAPONS,
  SEGMENT_HEIGHT,
  SEGMENTS,
  SQUAD_CAP,
  WALK_SPOTS,
  WALL,
  type EnemyKind,
  type Tracer,
  stockOf,
} from '../core/data.ts';
import type { Tier } from '../core/base.ts';
import type { Bullet, Enemy, HordeState, Pop } from '../core/horde.ts';
import { CHAT, type Bubble } from '../core/chatter.ts';
import { SPEEDS } from '../storage/settings.ts';
import { carpet } from '../core/skills.ts';
import { reloadTime } from '../core/stats.ts';
import { enemy } from '../core/testing.ts';
import { ANIM, Animator, STILL } from './anim.ts';
import {
  FIGHT_FRAME,
  frameCamera,
  HEIGHT_SCALE,
  postFloor,
  project,
  TILT,
  WALL_CARD,
  WALL_HIT,
  wallHeight,
  wallPulse,
  type Camera,
} from './projection.ts';
import { GROUND_TILE, SURROUND_BLOCK, WIRE } from './ground.ts';
import {
  BUBBLE,
  bubbleLayout,
  bubbleLook,
  bubbleShift,
  bubbleTip,
  BULLET,
  BURN,
  burnHeat,
  fireLook,
  bulletShape,
  drawScene,
  forgetBackdrop,
  DUSK,
  FLASH,
  FLASH_STYLE,
  flashShape,
  GRENADE,
  grenadeAt,
  NAME_TAG_GAP,
  offFrame,
  PLATE_H,
  POP,
  popLook,
  shownPops,
  RELOAD_PIE,
  reloadShare,
  SURVIVOR_BAR,
  TAIL,
  trapLook,
  turretLook,
  type BuildOverlay,
  type Scene,
} from './render.ts';
import { ghostsOf, NEEDS_WALL, plotsOf } from './buildscene.ts';
import {
  ART_IDS,
  ART_PX,
  BASE_ART,
  ENEMY_ART,
  GUNNER_ART,
  GUNNER_LOOKS,
  LOOKS,
  SKILL_ART,
  lookOf,
  TIER_ART,
  type Art,
  type ArtId,
  type GunId,
} from './sprites.ts';

function scene(condition: number, energy: number, wallHp?: number) {
  const r = buildTurret(
    newBase(),
    stockOf({ scrap: 99, wood: 99, metal: 0, concrete: 0 }),
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
    createLinearGradient: () => ({ addColorStop: noop }),
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    bezierCurveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    closePath: noop,
    clip: noop,
    setLineDash: noop,
    fillText: noop,
    strokeText: noop,
    measureText: () => ({ width: 0 }),
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    roundRect: noop,
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
      id: string = 'ground-canvas';
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        // The block repeated past the field is square, SURROUND_BLOCK tiles a side.
        if (width === SURROUND_BLOCK * ART_PX && height === width) this.id = 'surround-canvas';
      }
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

describe('the backdrop on its own canvas (ID-087)', () => {
  beforeEach(() => {
    stubCanvas();
    forgetBackdrop();
  });
  afterEach(() => vi.unstubAllGlobals());

  /** A scene and an under context, each recording what it drew and cleared. */
  const pair = () => {
    const scene = recorder();
    const under = recorder();
    const cleared: number[][] = [];
    Object.assign(scene.ctx, { clearRect: (...a: number[]) => cleared.push(a) });
    Object.assign(under.ctx, { clearRect: () => {} });
    return { scene, under, cleared };
  };

  it('paints the ground and surround under the scene, which is cleared see-through', () => {
    const { scene, under, cleared } = pair();
    drawScene(
      scene.ctx,
      scene.art,
      blank(),
      CAM,
      VIEW,
      null,
      null,
      null,
      null,
      null,
      null,
      under.ctx,
    );
    expect(under.drawn).toEqual(['ground-canvas']);
    expect(under.textured).toEqual(['surround-canvas']);
    expect(scene.drawn).toEqual([]);
    expect(scene.textured).toEqual([]);
    expect(cleared).toEqual([[0, 0, VIEW.w, VIEW.h]]);
  });

  it('repaints the steady fight backdrop only when the camera or view changes, or after forgetBackdrop', () => {
    const { scene, under } = pair();
    const draw = (cam = CAM, view = VIEW) =>
      drawScene(
        scene.ctx,
        scene.art,
        blank(),
        cam,
        view,
        null,
        null,
        null,
        null,
        null,
        null,
        under.ctx,
      );
    draw();
    draw();
    expect(under.drawn).toEqual(['ground-canvas']);
    draw({ ...CAM, x: 10 });
    expect(under.drawn).toHaveLength(2);
    draw({ ...CAM, x: 10 }, { w: 800, h: 600 });
    expect(under.drawn).toHaveLength(3);
    forgetBackdrop();
    draw({ ...CAM, x: 10 }, { w: 800, h: 600 });
    expect(under.drawn).toHaveLength(4);
  });

  it('repaints every frame while the camera eases in (a clip) or the camp shows', () => {
    const { scene, under } = pair();
    const s = blank();
    const camp = { fence: 'wood' as const, plots: plotsOf(newGame()) };
    for (let i = 0; i < 2; i++) {
      drawScene(scene.ctx, scene.art, s, CAM, VIEW, null, null, null, null, null, 100, under.ctx);
    }
    expect(under.drawn).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      drawScene(scene.ctx, scene.art, s, CAM, VIEW, null, null, null, null, camp, null, under.ctx);
    }
    expect(under.drawn).toHaveLength(4);
  });
});

describe('drawScene with art', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  const draw = (scene: Scene) => {
    const r = recorder();
    drawScene(r.ctx, r.art, scene, CAM, VIEW);
    return r;
  };

  it('draws the painted ground (field and yard) first and skips an unbuilt slot; a fight draws no camp (ID-065)', () => {
    const r = draw(blank());
    expect(r.textured).toEqual(['surround-canvas']);
    expect(r.drawn).toEqual(['ground-canvas']);
  });

  it('fills the whole view with the repeating ground before the field (ID-057)', () => {
    const r = recorder();
    const order: string[] = [];
    const fills: number[][] = [];
    const ctx = r.ctx as unknown as Record<string, unknown>;
    let matrix: number[] = [];
    // translate(e, f) then scale(a, d): all a texture's transform uses.
    vi.stubGlobal(
      'DOMMatrix',
      class {
        m = [1, 1, 0, 0];
        translate(e: number, f: number) {
          this.m = [this.m[0]!, this.m[1]!, e, f];
          return this;
        }
        scale(a: number, d: number) {
          this.m = [a, d, this.m[2]!, this.m[3]!];
          return this;
        }
      },
    );
    Object.assign(ctx, {
      createPattern: () => ({ setTransform: (t: { m: number[] }) => (matrix = t.m) }),
      fillRect: (...args: number[]) => {
        order.push('fill');
        fills.push(args);
      },
      drawImage: (img: { id: string }) => order.push(img.id),
    });
    drawScene(r.ctx, r.art, blank(), CAM, VIEW);
    // The sky, then the repeating block over the same whole view, then the fight's dusk
    // over it (ID-071), then the painted field.
    expect(order.slice(0, 4)).toEqual(['fill', 'fill', 'fill', 'ground-canvas']);
    expect(fills[1]).toEqual([0, 0, VIEW.w, VIEW.h]);
    // Fixed to the world: its origin is the field's top left, a block of tiles at their
    // own resolution per SURROUND_BLOCK tiles of ground.
    const origin = project({ x: 0, y: 0 }, CAM);
    const s = (SURROUND_BLOCK * GROUND_TILE * CAM.zoom) / (SURROUND_BLOCK * ART_PX);
    expect(matrix).toEqual([s, s * TILT, origin.sx, origin.sy]);
  });

  describe('the fight’s dusk (ID-071)', () => {
    type Step = { what: string; style?: unknown; alpha: number; rect?: number[] };
    /** The scene's draws in order: images by id, whole-view fills with their style and alpha. */
    function steps(scene: Scene, cam: Camera, build: BuildOverlay | null = null): Step[] {
      const r = recorder();
      const out: Step[] = [];
      const ctx = r.ctx as unknown as Record<string, unknown> & {
        fillStyle: unknown;
        globalAlpha: number;
      };
      Object.assign(ctx, {
        fillStyle: '',
        fillRect: (...rect: number[]) =>
          out.push({ what: 'fill', style: ctx.fillStyle, alpha: ctx.globalAlpha, rect }),
        drawImage: (img: { id: string }) => out.push({ what: img.id, alpha: ctx.globalAlpha }),
      });
      drawScene(r.ctx, r.art, scene, cam, VIEW, build);
      return out;
    }
    const dusks = (s: Step[]) => s.filter((x) => x.style === DUSK);
    const whole = [0, 0, VIEW.w, VIEW.h];

    it('is dark: well under half the ground’s light gets through', () => {
      const [r, g, b, a] = DUSK.match(/[\d.]+/g)!.map(Number);
      expect(Math.max(r!, g!, b!)).toBeLessThan(32);
      expect(a).toBeGreaterThanOrEqual(0.5);
      expect(a).toBeLessThan(0.8); // the ground's cracks and decals still show through
    });

    it('washes the surround and the field’s ground in a fight, under every sprite', () => {
      const game = newGame();
      const s = steps(startHorde(game, 1, game.roster[0]!.id, 0, 0), frameCamera(VIEW));
      const d = dusks(s);
      expect(d).toHaveLength(2);
      for (const x of d) expect(x).toMatchObject({ alpha: 1, rect: whole });
      const ground = s.findIndex((x) => x.what === 'ground-canvas');
      // One over the surround before the field's ground, one over the field right after it.
      expect(s.indexOf(d[0]!)).toBeLessThan(ground);
      expect(s.indexOf(d[1]!)).toBe(ground + 1);
      // Every sprite (wall, survivors, enemies) draws over it, at full brightness.
      const sprites = s.filter((x, i) => i > ground + 1 && x.what !== 'fill');
      expect(sprites.length).toBeGreaterThan(0);
      for (const x of sprites) expect(x.alpha).toBe(1);
      expect(s.slice(s.indexOf(d[1]!) + 1).some((x) => x.style === DUSK)).toBe(false);
    });

    it('stays out of the build scene', () => {
      const { layers, posts, turrets, traps } = layoutOf(newBase());
      const base = { ...blank(), layers, posts, turrets, traps };
      const s = steps(base, CAM, { selected: null, hover: null, ghosts: ghostsOf(newBase()) });
      expect(dusks(s)).toHaveLength(0);
    });
  });

  it('clips everything but the surround at the frame’s left edge, so the yard and huts never show (ID-064)', () => {
    const r = recorder();
    const calls: string[] = [];
    const rects: number[][] = [];
    const cam = frameCamera({ w: 1600, h: 900 });
    Object.assign(r.ctx, {
      rect: (...args: number[]) => rects.push(args),
      clip: () => calls.push('clip'),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      drawImage: (img: { id: string }) => calls.push(img.id),
    });
    drawScene(r.ctx, r.art, blank(), cam, VIEW);
    // Saved and clipped before the field's ground, the huts after it; restored at the end.
    expect(calls.slice(0, 3)).toEqual(['save', 'clip', 'ground-canvas']);
    expect(calls.at(-1)).toBe('restore');
    const left = Math.round(project({ x: FIGHT_FRAME.left, y: 0 }, cam).sx);
    expect(rects[0]).toEqual([left, 0, VIEW.w - left, VIEW.h]);
    // The huts stand left of the frame, so the clip hides them.
    expect(project({ x: CAMP.x, y: 0 }, cam).sx).toBeLessThan(left);
  });

  describe('enemies left of the frame (ID-064)', () => {
    const at = (id: number, x: number, y: number): Enemy => ({
      id,
      kind: 'shambler',
      x,
      y,
      hp: 20,
      maxHp: 20,
      nextAttackAt: 0,
      inCamp: false,
      stunnedUntil: 0,
      vx: 0,
      vy: 0,
      climbUntil: 0,
      climbed: false,
    });

    it('counts them per row, top to bottom; none inside the frame', () => {
      const row = (r: number) => (r + 0.5) * SEGMENT_HEIGHT;
      const enemies = [
        at(1, FIGHT_FRAME.left - 1, row(7)),
        at(2, CAMP.x, row(2)),
        at(3, 200, row(7)),
        at(4, FIGHT_FRAME.left, row(3)),
        at(5, 900, row(0)),
        // Off the field's depth: kept on its nearest row; a NaN spot is dropped.
        at(6, 100, -40),
        at(7, 100, FIELD.height + 40),
        at(8, 100, NaN),
      ];
      expect(offFrame(enemies)).toEqual([
        { row: 0, count: 1 },
        { row: 2, count: 1 },
        { row: 7, count: 2 },
        { row: 9, count: 1 },
      ]);
      expect(offFrame([])).toEqual([]);
    });

    it('marks each row at the frame’s left edge with its count, over everything', () => {
      const r = recorder();
      const texts: { text: string; x: number; y: number }[] = [];
      const order: string[] = [];
      const cam = frameCamera({ w: 1280, h: 720 });
      Object.assign(r.ctx, {
        restore: () => order.push('restore'),
        fillText: (text: string, x: number, y: number) => {
          order.push('text');
          texts.push({ text, x, y });
        },
      });
      const scene = {
        ...blank(),
        enemies: [
          at(1, 200, 4.5 * SEGMENT_HEIGHT),
          at(2, 150, 4.2 * SEGMENT_HEIGHT),
          at(3, 900, 50),
        ],
      };
      drawScene(r.ctx, r.art, scene, cam, VIEW);
      expect(texts).toHaveLength(1);
      expect(texts[0]!.text).toBe('2');
      const left = project({ x: FIGHT_FRAME.left, y: 0 }, cam).sx;
      expect(texts[0]!.x).toBeGreaterThan(left);
      expect(texts[0]!.x).toBeLessThan(left + 40);
      expect(texts[0]!.y).toBeCloseTo(project({ x: 0, y: 4.5 * SEGMENT_HEIGHT }, cam).sy, 9);
      // Drawn after the clip is lifted, so the marker itself is never clipped.
      expect(order.indexOf('restore')).toBeLessThan(order.indexOf('text'));
    });
  });

  it("draws a whole wall in its tier's textures, with no cracks", () => {
    const r = draw(withSegment(blank(), { kind: 'wall', tier: 'metal', hp: 100, maxHp: 100 }));
    expect(r.textured).toEqual(expect.arrayContaining(['metal-top', 'metal-front']));
    expect(r.drawn).not.toContain('cracks');
  });

  it('shows damage as cracks, then puts the alpha back', () => {
    const scene = withSegment(blank(), { kind: 'wall', tier: 'wood', hp: 80, maxHp: 100 });
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
    expect(r.drawn.indexOf('shambler-walk-b')).toBeGreaterThan(i);
    expect(i).toBeGreaterThanOrEqual(0);
    // Cracked (ID-072): faint over its top and front, then full alpha for the rest.
    const last = r.drawn.lastIndexOf('cracks');
    expect(last).toBe(i + 1);
    expect(r.alphas[i]).toBeLessThan(1);
    expect(r.alphas[last]).toBeLessThan(1);
    expect(r.alphas.slice(last + 1).every((a) => a === 1)).toBe(true);
  });

  it('a wall looks worse in stages: cracks, then edge chips, then a broken band (ID-072)', () => {
    const at = (hp: number) =>
      draw(withSegment(blank(), { kind: 'wall', tier: 'concrete', hp, maxHp: 300 })).drawn;
    const count = (d: ArtId[], id: ArtId) => d.filter((x) => x === id).length;
    const whole = at(300);
    expect(['cracks', 'wall-chips', 'wall-breach'].some((id) => whole.includes(id as ArtId))).toBe(
      false,
    );
    // Cracked: top and front, nothing more.
    const cracked = at(200);
    expect(count(cracked, 'cracks')).toBe(2);
    expect(cracked).not.toContain('wall-chips');
    // Chipped: a gouge on each long edge of the top.
    const chipped = at(100);
    expect(count(chipped, 'wall-chips')).toBe(2);
    expect(chipped).not.toContain('wall-breach');
    // Broken through: the band over the chips; then rubble alone at 0.
    const breaking = at(99);
    expect(breaking.indexOf('wall-breach')).toBeGreaterThan(breaking.lastIndexOf('wall-chips'));
    const broken = at(0);
    expect(broken).toContain('concrete-rubble');
    expect(broken).not.toContain('cracks');
  });

  it('a gate segment shows the same stages over its gate art (ID-072)', () => {
    const d = draw(withSegment(blank(), { kind: 'gate', tier: 'wood', hp: 10, maxHp: 150 })).drawn;
    expect(d.indexOf('wall-breach')).toBeGreaterThan(d.indexOf('wood-gate'));
  });

  /** A fight's fills by colour, with the alpha each was drawn at. */
  const fillsOf = (scene: Scene) => {
    const r = recorder();
    const fills: { style: string; alpha: number }[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string; globalAlpha: number };
    Object.assign(r.ctx, {
      fillRect: () => fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha }),
    });
    drawScene(r.ctx, r.art, scene, CAM, VIEW);
    return fills;
  };

  it('a wall segment’s HP bar shows in a fight only once it is hit, and not once broken (ID-072)', () => {
    const bars = (hp: number) =>
      fillsOf(withSegment(blank(), { kind: 'wall', tier: 'concrete', hp, maxHp: 300 })).filter(
        (f) => f.style === '#c43b3b',
      ).length;
    expect(bars(300)).toBe(0);
    expect(bars(299)).toBe(1);
    expect(bars(1)).toBe(1);
    expect(bars(0)).toBe(0);
    // An unbuilt slot has none either.
    expect(fillsOf(blank()).filter((f) => f.style === '#c43b3b')).toHaveLength(0);
  });

  it('a segment just hit flashes white, fading out, and then puts the alpha back (ID-072)', () => {
    const scene = (hitAt: number | undefined) => ({
      ...withSegment(blank(), { kind: 'wall', tier: 'concrete', hp: 250, maxHp: 300, hitAt }),
      time: 10,
    });
    const flashes = (hitAt: number | undefined) =>
      fillsOf(scene(hitAt)).filter((f) => f.style === '#ffb070');
    // Top and front, at full strength as it lands.
    const now = flashes(10);
    expect(now).toHaveLength(2);
    expect(now[0]!.alpha).toBeCloseTo(WALL_HIT.flash, 9);
    expect(flashes(10 - WALL_HIT.time / 2)[0]!.alpha).toBeCloseTo(WALL_HIT.flash / 2, 9);
    expect(flashes(10 - WALL_HIT.time)).toHaveLength(0);
    expect(flashes(undefined)).toHaveLength(0);
    // A broken segment (its last blow) is rubble, with no flash.
    const rubble = fillsOf({
      ...withSegment(blank(), { kind: 'wall', tier: 'concrete', hp: 0, maxHp: 300, hitAt: 10 }),
      time: 10,
    });
    expect(rubble.filter((f) => f.style === '#ffb070')).toHaveLength(0);
    const r = recorder();
    drawScene(r.ctx, r.art, scene(10), CAM, VIEW);
    expect(r.ctx.globalAlpha).toBe(1);
  });

  it('a segment just hit shakes sideways, then stops, its saves all restored (ID-072)', () => {
    const shakes = (hitAt: number | undefined) => {
      const r = recorder();
      const moves: number[][] = [];
      let depth = 0;
      Object.assign(r.ctx, {
        save: () => depth++,
        restore: () => depth--,
        translate: (x: number, y: number) => moves.push([x, y]),
      });
      const s = withSegment(blank(), {
        kind: 'wall',
        tier: 'concrete',
        hp: 250,
        maxHp: 300,
        hitAt,
      });
      drawScene(r.ctx, r.art, { ...s, time: 10 }, CAM, VIEW);
      expect(depth).toBe(0);
      return moves.filter(([x, y]) => y === 0 && x !== 0);
    };
    // Mid-shake: a sideways move within WALL_HIT.shake.
    const mid = shakes(10 - WALL_HIT.time / 12);
    expect(mid).toHaveLength(1);
    expect(Math.abs(mid[0]![0]!)).toBeLessThanOrEqual(WALL_HIT.shake);
    expect(shakes(10 - WALL_HIT.time)).toHaveLength(0);
    expect(shakes(undefined)).toHaveLength(0);
  });

  it('the build scene shows only its own bar for a damaged segment, not the fight’s too (ID-072)', () => {
    const r = recorder();
    const fills: string[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string };
    Object.assign(r.ctx, { fillRect: () => fills.push(ctx.fillStyle) });
    const scene = withSegment(blank(), { kind: 'wall', tier: 'concrete', hp: 150, maxHp: 300 });
    const overlay = { selected: null, hover: null, ghosts: { slots: [], lines: [] } };
    drawScene(r.ctx, r.art, scene, CAM, VIEW, overlay);
    expect(fills.filter((f) => f === '#c43b3b')).toHaveLength(1);
  });

  it('draws every enemy kind’s art and a Spewer glob without a throw (ID-023)', () => {
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
    // Each kind stands in its passing frame (no animator: nothing walks or strikes).
    for (const kind of kinds) {
      expect(
        r.drawn.filter((id) => id === ENEMY_ART[kind].walk[1]),
        kind,
      ).toHaveLength(1);
    }
  });

  it('draws a burning enemy (ID-022) and a Frag Grenade in the air, then its blast (ID-077)', () => {
    const r = recorder();
    const strokes: unknown[] = [];
    const fills: unknown[] = [];
    const c = r.ctx as unknown as { strokeStyle: unknown; fillStyle: unknown } & Record<
      'stroke' | 'fill',
      () => void
    >;
    c.stroke = () => strokes.push(c.strokeStyle);
    c.fill = () => fills.push(c.fillStyle);
    const shambler = (id: number, burnUntil?: number): Enemy => ({
      id,
      kind: 'shambler',
      x: 700 + id * 60,
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
      ...(burnUntil === undefined ? {} : { burnUntil }),
    });
    const scene = (time: number, burnUntil: number): Scene => ({
      ...blank(),
      time,
      enemies: [shambler(0, burnUntil)],
      grenades: [
        { fromX: 420, fromY: 360, x: 760, y: 320, at: 0.8, lands: 1.4, burst: time >= 1.4 },
      ],
    });
    const blasts = () => r.drawn.filter((id) => id === SKILL_ART.airstrike).length;
    // In the air: the grenade's dark olive ball; no blast yet.
    drawScene(r.ctx, r.art, scene(1, 2), CAM, VIEW);
    expect(fills).toContain('#8a9a4a');
    expect(fills).toContain('#ff7a1a');
    expect(blasts()).toBe(0);
    // Landed: the blast art, no ball.
    fills.length = 0;
    drawScene(r.ctx, r.art, scene(1.5, 2), CAM, VIEW);
    expect(fills).not.toContain('#8a9a4a');
    expect(blasts()).toBe(1);
    // Later: the blast has faded, the burn is out.
    fills.length = 0;
    drawScene(r.ctx, r.art, scene(3, 2), CAM, VIEW);
    expect(fills).not.toContain('#8a9a4a');
    expect(fills).not.toContain('#ff7a1a');
    expect(blasts()).toBe(1);
  });

  it('a Frag Grenade flies from its thrower to where it lands, highest at the middle', () => {
    const g = { fromX: 400, fromY: 300, x: 800, y: 500, at: 1, lands: 2, burst: false };
    expect(grenadeAt(g, 1)).toEqual({ x: 400, y: 300, z: 0 });
    expect(grenadeAt(g, 1.5)).toEqual({ x: 600, y: 400, z: GRENADE.arc });
    expect(grenadeAt(g, 2)).toEqual({ x: 800, y: 500, z: 0 });
    expect(grenadeAt(g, 5)).toEqual({ x: 800, y: 500, z: 0 });
  });

  it("draws a broken gate as its tier's rubble only, in every tier", () => {
    for (const tier of Object.keys(TIER_ART) as Tier[]) {
      const r = draw(withSegment(blank(), { kind: 'gate', tier, hp: 0, maxHp: 100 }));
      expect(r.drawn).toContain(TIER_ART[tier].rubble);
      expect(r.textured).not.toContain(TIER_ART[tier].top);
      expect(r.drawn.some((id) => id.endsWith('-gate'))).toBe(false);
    }
  });

  /** Where each sprite was drawn, in order. */
  const placed = (scene: Scene, cam = CAM) => {
    const r = recorder();
    const at: { id: ArtId; x: number; y: number; w: number; h: number }[] = [];
    Object.assign(r.ctx, {
      drawImage: (img: { id: ArtId }, ...n: number[]) => {
        r.drawn.push(img.id);
        const [x, y, w, h] = n.length === 8 ? n.slice(4) : n;
        at.push({ id: img.id, x: x!, y: y!, w: w!, h: h! });
      },
    });
    drawScene(r.ctx, r.art, scene, cam, VIEW);
    return { ...r, at };
  };

  it("lays a standing gate over its segment's top in its tier: a closed sliding gate, flush with the wall (ID-075)", () => {
    for (const zoom of [0.5, 1, 2]) {
      for (const tier of Object.keys(TIER_ART) as Tier[]) {
        const scene = withSegment(blank(), { kind: 'gate', tier, hp: 100, maxHp: 100 });
        const cam = { x: 0, y: 0, zoom };
        const r = placed(scene, cam);
        const gate = r.at.filter((a) => a.id === TIER_ART[tier].gate);
        expect(gate).toHaveLength(1);
        const x0 = scene.layers[0]!.x;
        const z = wallHeight(100, 100);
        const back = project({ x: x0, y: 2, z }, cam);
        const front = project({ x: x0 + WALL.depth, y: SEGMENT_HEIGHT - 2, z }, cam);
        expect(gate[0]!.x).toBeCloseTo(back.sx);
        expect(gate[0]!.y).toBeCloseTo(back.sy);
        expect(gate[0]!.h).toBeCloseTo(front.sy - back.sy);
        // Closed and in line with the wall: exactly the top's width, nothing over the field.
        expect(gate[0]!.w).toBeCloseTo(front.sx - back.sx);
        expect(r.textured).toEqual(expect.arrayContaining([TIER_ART[tier].front]));
        expect(r.drawn).not.toContain('cracks');
      }
    }
  });

  it('lowers a damaged gate with its wall and shows cracks over it', () => {
    const at = (hp: number) =>
      placed(withSegment(blank(), { kind: 'gate', tier: 'wood', hp, maxHp: 100 }));
    const whole = at(100).at.find((a) => a.id === 'wood-gate')!;
    const hurt = at(40);
    const gate = hurt.at.find((a) => a.id === 'wood-gate')!;
    const drop = (wallHeight(100, 100) - wallHeight(40, 100)) * HEIGHT_SCALE;
    expect(gate.y - whole.y).toBeCloseTo(drop);
    expect(gate.h).toBeCloseTo(whole.h);
    expect(hurt.drawn.indexOf('cracks')).toBeGreaterThan(hurt.drawn.indexOf('wood-gate'));
  });

  it('draws a defender on a gate post over the gate, where a wall-walk defender stands, with no platform', () => {
    // Metal segments, so the only plank texture is a wall-walk platform's.
    const gate = withSegment(blank(), { kind: 'gate', tier: 'metal', hp: 100, maxHp: 100 });
    const wall = withSegment(blank(), { kind: 'wall', tier: 'metal', hp: 100, maxHp: 100 });
    const d0 = startHorde(newGame(), 1, newGame().roster[0]!.id, 0, 0).defenders[0]!;
    const post: Post = {
      id: 0,
      kind: 'wall-walk',
      column: 0,
      row: 0,
      x: gate.layers[0]!.x + WALL.depth / 2,
      y: SEGMENT_HEIGHT / 4,
      defenderId: d0.id,
    };
    const defender = { ...d0, x: post.x, y: post.y, walking: false, postId: post.id };
    const onGate = placed({ ...gate, posts: [post], defenders: [defender] });
    const onWall = placed({ ...wall, posts: [post], defenders: [defender] });
    const sprite = (r: ReturnType<typeof placed>) =>
      r.at.filter((a) => a.id.startsWith('gunner') || a.id === 'ripper' || a.id === 'engineer');
    expect(sprite(onGate)).toHaveLength(1);
    expect(sprite(onGate)).toEqual(sprite(onWall));
    const order = onGate.at.map((a) => a.id);
    expect(order.indexOf(sprite(onGate)[0]!.id)).toBeGreaterThan(order.indexOf('metal-gate'));
    expect(onWall.textured).toContain('wood-top');
    expect(onGate.textured).not.toContain('wood-top');
    // A turret on a gate's spot sits on the gate the same way.
    const turret = {
      id: 0,
      mount: 'wall-walk' as const,
      column: 0,
      row: 0,
      x: post.x,
      y: post.y,
      condition: 100,
      nextShotAt: 0,
    };
    const mounted = placed({ ...gate, turrets: [turret] });
    expect(mounted.drawn).toContain('turret-lit');
    expect(mounted.textured).not.toContain('wood-top');
    // A broken gate's rubble gets its platform back, as a broken wall's does.
    const broken = withSegment(blank(), { kind: 'gate', tier: 'metal', hp: 0, maxHp: 100 });
    expect(placed({ ...broken, posts: [post] }).textured).toContain('wood-top');
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
      // Ids in the soldier's look (ID-074), so a Gunner draws the soldier's sprites.
      id: `t${LOOKS * i + 1}`,
      x: 200,
      y: 60 + i * 80,
      walking: true,
      loadout,
    });
    for (const i of [0, 1, 2, 3, 4]) expect(lookOf(at(i, d0.loadout).id)).toBe(0);
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
        'gunner-pistol-idle',
        'gunner-rifle-idle',
        'gunner-sniper-idle',
        'ripper',
        'engineer',
        'shield',
        'shambler-walk-b',
      ]),
    );
  });

  it('draws a molotov fire and a fading skill flash from their art, no flat circles (ID-019, ID-041)', () => {
    const r = recorder();
    const rings: number[] = [];
    Object.assign(r.ctx, { ellipse: (_x: number, _y: number, rx: number) => rings.push(rx) });
    const scene: Scene = {
      ...blank(),
      time: 0.3,
      fires: [{ x: 900, y: 200, at: 0, until: 5 }],
      blasts: [{ skill: 'airstrike', x: 700, y: 100, at: 0.1 }],
    };
    drawScene(r.ctx, r.art, scene, CAM, VIEW);
    expect(rings).toEqual([]);
    // The fire is its art, see-through; the airstrike's flash is its art, fading.
    expect(r.alphas[r.drawn.indexOf('molotov')]).toBeCloseTo(0.7, 9);
    expect(r.drawn.indexOf('molotov')).toBeLessThan(r.drawn.indexOf('airstrike'));
    expect(r.alphas[r.drawn.indexOf('airstrike')]).toBeCloseTo(1 - 0.2 / SKILL_FLASH, 9);
    expect(r.ctx.globalAlpha).toBe(1);
  });

  it('fades a fire in as it lights and out as it dies, and not at all once out (ID-041)', () => {
    const alphaAt = (time: number): number | undefined => {
      const r = recorder();
      const fires = [{ x: 900, y: 200, at: 1, until: 7 }];
      drawScene(r.ctx, r.art, { ...blank(), time, fires }, CAM, VIEW);
      const i = r.drawn.indexOf('molotov');
      return i < 0 ? undefined : r.alphas[i];
    };
    expect(alphaAt(1)).toBeUndefined(); // just lit: nothing yet
    expect(alphaAt(1.075)).toBeCloseTo(0.35, 6);
    expect(alphaAt(4)).toBeCloseTo(0.7, 6);
    expect(alphaAt(6.75)).toBeCloseTo(0.35, 6);
    expect(alphaAt(7)).toBeUndefined();
  });

  it('shows an armed airstrike as every bomb along the hovered row (ID-041)', () => {
    const r = recorder();
    const centres: number[][] = [];
    Object.assign(r.ctx, {
      ellipse: (x: number, y: number, rx: number) => centres.push([x, y, rx]),
    });
    const scene = blank();
    drawScene(r.ctx, r.art, scene, CAM, VIEW, null, null, { skill: 'airstrike', x: 900, y: 300 });
    const bombs = carpet(scene, 300).map((p) => project(p, CAM));
    expect(bombs.length).toBeGreaterThan(1);
    expect(centres).toEqual(bombs.map((b) => [b.sx, b.sy, SKILLS.airstrike.radius]));
  });

  it('lays a skill flash’s art flat across its reach, swelling as it fades (ID-041)', () => {
    const r = recorder();
    const boxes: { w: number; h: number; cx: number; cy: number }[] = [];
    Object.assign(r.ctx, {
      drawImage: (
        img: { id: ArtId; width: number; height: number },
        x: number,
        y: number,
        w: number,
        h: number,
      ) => {
        if (img.id === 'airstrike')
          boxes.push({ w, h: (h / w) * (img.width / img.height), cx: x + w / 2, cy: y + h / 2 });
      },
    });
    const blast = { skill: 'airstrike' as const, x: 700, y: 100, at: 0 };
    for (const time of [0, SKILL_FLASH / 2]) {
      drawScene(r.ctx, r.art, { ...blank(), time, blasts: [blast] }, CAM, VIEW);
    }
    const reach = 2 * SKILLS.airstrike.radius * CAM.zoom;
    expect(boxes[0]!.w).toBeCloseTo(reach * 0.85, 6);
    expect(boxes[1]!.w).toBeCloseTo(reach * 0.925, 6);
    for (const b of boxes) expect(b.h).toBeCloseTo(TILT, 6); // squashed like the ground
    const c = project(blast, CAM);
    expect(boxes[0]!.cx).toBeCloseTo(c.sx, 6);
    expect(boxes[0]!.cy).toBeCloseTo(c.sy, 6);
    // Gone once the flash is over.
    drawScene(r.ctx, r.art, { ...blank(), time: SKILL_FLASH, blasts: [blast] }, CAM, VIEW);
    expect(boxes).toHaveLength(2);
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

const PUFF = {
  blood: '#8e1f1a',
  dust: '#a8987c',
  // A muzzle flash's white-hot dot at the barrel tip (ID-088; its flames reach ahead).
  flash: '#fffdf2',
  slug: '#fffbe8',
} as const;

describe('the build scene (ID-065)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  /** The base laid out as build mode draws it. */
  const laid = (base: Base): Scene => {
    const { layers, posts, turrets, traps } = layoutOf(base);
    return { ...blank(), layers, posts, turrets, traps };
  };
  /** A recorder that also keeps every text drawn, every stroke colour and every clip rect. */
  function build(
    base: Base,
    game: GameState = newGame(),
    hover: BuildOverlay['hover'] = null,
    fence: Tier = 'wood',
  ) {
    const r = recorder();
    const texts: string[] = [];
    const strokes: string[] = [];
    const rects: number[][] = [];
    const ctx = r.ctx as unknown as Record<string, unknown>;
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => strokes.push(v),
      get: () => '',
    });
    Object.assign(ctx, {
      fillText: (t: string) => texts.push(t),
      measureText: (t: string) => ({ width: t.length * 5 }),
      rect: (...a: number[]) => rects.push(a),
    });
    const overlay: BuildOverlay = { selected: null, hover, ghosts: ghostsOf(base) };
    const camp = { fence, plots: plotsOf(game) };
    drawScene(r.ctx, r.art, laid(base), CAM, VIEW, overlay, null, null, null, camp);
    return { ...r, texts, strokes, rects };
  }

  it('shows the whole camp: no clip, and no off-frame marker even with an enemy in the camp', () => {
    const r = recorder();
    const rects: number[][] = [];
    const texts: string[] = [];
    Object.assign(r.ctx, {
      rect: (...a: number[]) => rects.push(a),
      fillText: (t: string) => texts.push(t),
    });
    const base = newBase();
    const scene = {
      ...laid(base),
      enemies: [
        {
          id: 1,
          kind: 'shambler',
          x: 50,
          y: 50,
          hp: 20,
          maxHp: 20,
          nextAttackAt: 0,
          inCamp: true,
          stunnedUntil: 0,
          vx: 0,
          vy: 0,
          climbUntil: 0,
          climbed: false,
        } satisfies Enemy,
      ],
    };
    const overlay = { selected: null, hover: null, ghosts: { slots: [], lines: [] } };
    const cam = frameCamera({ w: 1280, h: 720 });
    drawScene(r.ctx, r.art, scene, cam, VIEW, overlay);
    expect(rects[0]).toEqual([0, 0, VIEW.w, VIEW.h]);
    expect(texts).not.toContain('1');
  });

  it('draws the fence in its tier, built huts in their art, a built Lab and Generator; a fight draws none', () => {
    const none = build(newBase(), newGame(), null, 'metal');
    expect(none.textured).toEqual(expect.arrayContaining(['metal-top', 'metal-front']));
    expect(none.drawn).not.toContain('shack');
    expect(none.drawn).not.toContain('tent');
    const g = newGame();
    const grown: GameState = {
      ...g,
      lab: 2,
      power: { ...g.power, generator: { at: 1 } },
      camp: { ...g.camp, upgrades: 2 },
    };
    const r = build(newBase(), grown, null, 'concrete');
    expect(r.textured).toEqual(expect.arrayContaining(['concrete-top', 'concrete-front']));
    expect(r.drawn.filter((id) => id === 'shack' || id === 'tent')).toHaveLength(2);
    expect(r.texts).toEqual(
      expect.arrayContaining(['Research Lab · Lv 2', 'Generator · running', 'Hut']),
    );
    // A fight's scene with no camp: no fence textures past the wall's own.
    const fight = recorder();
    drawScene(fight.ctx, fight.art, laid(newBase()), CAM, VIEW);
    expect(fight.textured).not.toContain('concrete-top');
    expect(fight.drawn).not.toContain('shack');
  });

  it('a ghost "+" on every empty slot; a post slot with no wall is dimmed, its reason once per unbuilt column', () => {
    const r = build(newBase());
    // Columns 1 and 2 have no wall: one plate each, not one per post slot.
    expect(r.texts.filter((t) => t === NEEDS_WALL)).toHaveLength(2);
    const ghost = 'rgba(240, 236, 226, 0.85)';
    const dim = 'rgba(232, 228, 218, 0.4)';
    const slots = ghostsOf(newBase()).slots;
    const blocked = slots.filter((g) => 'needsWall' in g && g.needsWall).length;
    expect(blocked).toBe(40);
    expect(r.strokes.filter((s) => s === dim)).toHaveLength(blocked + 1); // + the Workbench's plot
    expect(r.strokes.filter((s) => s === ghost).length).toBeGreaterThan(slots.length - blocked);
    // With no ghost there is no reason.
    const full: Base = { ...newBase(), layers: [], posts: [], turrets: [], traps: [] };
    expect(drawWith(full, { slots: [], lines: [] }).texts).not.toContain(NEEDS_WALL);
  });

  it('hovering a post slot with no wall shows why on it', () => {
    // On the slot, in place of its column's plate.
    const r = build(newBase(), newGame(), { slot: { column: 2, row: 5, what: 'tower' } });
    expect(r.texts.filter((t) => t === NEEDS_WALL)).toHaveLength(2);
    const open = build(newBase(), newGame(), { slot: { column: 0, row: 5, what: 'ground' } });
    expect(open.texts.filter((t) => t === NEEDS_WALL)).toHaveLength(2);
    // A trap cell sits in the outer column's area, but isn't a post slot: both plates stay.
    const trap = build(newBase(), newGame(), { slot: { column: 2, row: 5, what: 'trap' } });
    expect(trap.texts.filter((t) => t === NEEDS_WALL)).toHaveLength(2);
  });

  it('hovering a wall-walk spot rings that spot', () => {
    const hoverColour = '#cfe3fa';
    const r = recorder();
    const strokes: string[] = [];
    const ellipses: number[][] = [];
    const ctx = r.ctx as unknown as Record<string, unknown>;
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => strokes.push(v),
      get: () => '',
    });
    Object.assign(ctx, { ellipse: (...a: number[]) => ellipses.push(a) });
    const hover = { slot: { column: 0, row: 2, what: 'segment' as const }, spot: 1 };
    const overlay = { selected: null, hover, ghosts: { slots: [], lines: [] } };
    drawScene(r.ctx, r.art, laid(newBase()), CAM, VIEW, overlay);
    expect(strokes).toContain(hoverColour);
    expect(ellipses).toHaveLength(1);
  });

  it('a tier badge per segment; a damaged one’s bar, a broken one’s cross', () => {
    const base = newBase();
    base.layers[0]!.slots[2] = { ...base.layers[0]!.slots[2]!, hp: 50 };
    base.layers[0]!.slots[3] = { ...base.layers[0]!.slots[3]!, hp: 0 };
    base.layers[0]!.slots[4] = { ...base.layers[0]!.slots[4]!, tier: 'metal', hp: 400, maxHp: 400 };
    const r = build(base);
    expect(r.texts.filter((t) => t === 'W')).toHaveLength(SEGMENTS - 1);
    expect(r.texts.filter((t) => t === 'M')).toHaveLength(1);
    expect(r.strokes.filter((s) => s === '#e0483e')).toHaveLength(1);
    const whole = build(newBase());
    expect(whole.strokes).not.toContain('#e0483e');
  });

  it('crosses a jammed turret and a broken trap', () => {
    let base = newBase();
    const t = buildTurret(base, stockOf({ scrap: 99, wood: 99 }), true, 'tower', 0, 0);
    if (!t.ok) throw new Error(t.reason);
    base = t.base;
    base.turrets[0]!.condition = 0;
    base.traps = [
      { kind: 'spikes', row: 1, durability: 0 },
      { kind: 'wire', row: 2, durability: 3 },
    ];
    expect(build(base).strokes.filter((s) => s === '#e0483e')).toHaveLength(2);
  });

  it('highlights the hovered slot or plot', () => {
    const hoverColour = '#cfe3fa';
    expect(build(newBase()).strokes).not.toContain(hoverColour);
    const slot = build(newBase(), newGame(), { slot: { column: 1, row: 0, what: 'segment' } });
    expect(slot.strokes).toContain(hoverColour);
    const plot = build(newBase(), newGame(), { plot: plotsOf(newGame())[0]! });
    expect(plot.strokes).toContain(hoverColour);
  });

  /** The build scene with `ghosts` and no camp. */
  function drawWith(base: Base, ghosts: BuildOverlay['ghosts']) {
    const r = recorder();
    const texts: string[] = [];
    Object.assign(r.ctx, { fillText: (t: string) => texts.push(t) });
    drawScene(r.ctx, r.art, laid(base), CAM, VIEW, { selected: null, hover: null, ghosts });
    return { texts };
  }
});

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
    'no laser at %s× zoom: every bullet is a short tail, none joins shooter and target',
    (zoom) => {
      const cam = { x: 0, y: 0, zoom };
      const { scene, post, target } = fight();
      // Just fired, midway, and about to land.
      const bullets = [5, 60, 200, 370].map((f) => flying(post, target, f));
      const shooter = project(post, cam);
      const enemyAt = project(target, cam);
      // The gun's tracer plus one 60 fps frame of flight at 1× (ID-070).
      const tail = WEAPONS.pistol.tracer.length + 1800 * TAIL.frame;
      for (const b of bullets) {
        const s = bulletShape(scene, b, cam);
        const len = Math.hypot(s.head.sx - s.tail.sx, s.head.sy - s.tail.sy);
        // The tail drops toward body height too, so a hair over its flat length.
        expect(len).toBeLessThanOrEqual(tail * zoom * 1.1);
        const near = (p: { sx: number; sy: number }, q: { sx: number; sy: number }) =>
          Math.hypot(p.sx - q.sx, p.sy - q.sy) < 1;
        expect(near(s.tail, shooter) && near(s.head, enemyAt)).toBe(false);
      }
    },
  );

  it('draws each bullet as a white head at its simulated position, through the depth sort', () => {
    const cam = { x: 37, y: 12, zoom: 1.5 };
    const { scene, post, target } = fight();
    const b = flying(post, target, 150);
    // An enemy in front of the bullet (lower on screen) draws over it.
    const front: Enemy = { ...target, id: 2, x: b.x + 5, y: b.y + 40 };
    const g = geometry(cam, { ...scene, enemies: [target, front], bullets: [b] });
    const heads = g.lines.filter((m) => m.kind === 'line' && m.colour === PUFF.slug);
    expect(heads).toHaveLength(1);
    const slug = heads[0]!;
    if (slug.kind !== 'line') throw new Error('not a line');
    // The capsule ends at the bullet's spot (no time since the step: nothing to carry on).
    expect(slug.b[0]).toBeCloseTo((b.x - cam.x) * cam.zoom, 9);
    // On screen it sits between the ground under it and the muzzle height.
    const ground = project({ x: b.x, y: b.y }, cam).sy;
    expect(slug.b[1]).toBeLessThan(ground);
    const at = g.marks.indexOf(slug);
    const shamblers = g.marks.flatMap((m, i) =>
      m.kind === 'art' && m.id === 'shambler-walk-b' ? [i] : [],
    );
    expect(shamblers).toHaveLength(2);
    expect(shamblers[1]).toBeGreaterThan(at); // the enemy in front
  });

  it("takes each bullet's streak length and colour from its gun", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, post, target } = fight();
    const long: Tracer = { length: 40, colour: '#123456' };
    const flat = { x: target.x, y: post.y };
    const pistol = flying(post, flat, 200);
    const other = flying(post, flat, 200, long);
    // Each gun's tracer, plus the same frame of flight at its speed (ID-070).
    const flight = 1800 * TAIL.frame;
    expect(bulletShape(scene, pistol, cam).length).toBeCloseTo(
      WEAPONS.pistol.tracer.length + flight,
      6,
    );
    expect(bulletShape(scene, other, cam).length).toBeCloseTo(40 + flight, 6);
    // The tail fades from white through the gun's colour to clear.
    const r = recorder();
    const stops: string[][] = [];
    Object.assign(r.ctx, {
      createLinearGradient: () => {
        const g: string[] = [];
        stops.push(g);
        return { addColorStop: (_at: number, c: string) => g.push(c) };
      },
    });
    drawScene(r.ctx, r.art, { ...scene, bullets: [pistol, other] }, cam, VIEW);
    expect(stops).toContainEqual(['#ffffff', 'rgba(255, 211, 106, 0.9)', 'rgba(255, 211, 106, 0)']);
    expect(stops).toContainEqual(['#ffffff', 'rgba(18, 52, 86, 0.9)', 'rgba(18, 52, 86, 0)']);
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
    // Full bright through its flare, then a fast fade (ID-088): under half by its middle.
    const flare = at(1 + MUZZLE_FLASH * FLASH.rise * 0.9)[0]!;
    expect(flare.kind === 'dot' && flare.alpha).toBe(1);
    const half = at(1 + MUZZLE_FLASH / 2)[0]!;
    if (half.kind !== 'dot') throw new Error('not a dot');
    expect(half.alpha).toBeGreaterThan(0);
    expect(half.alpha).toBeLessThan(0.5);
    expect(at(1 + MUZZLE_FLASH)).toEqual([]);
    // Someone else's shot flashes nothing here.
    expect(geometry(cam, { ...scene, time: 1, shots: [{ owner: 'zz', at: 1 }] }).dots).toEqual([]);
  });

  it("lights the flash at each gun's aimed barrel tip (ID-069)", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const { scene, d, post } = fight();
    const flashOf = (gun: GunId, age = 0) => {
      const primary = { uid: `g-${gun}`, base: gun, rarity: 'common' as const, affixes: [] };
      const shooter = { ...d, loadout: { ...d.loadout, primary } };
      const dots = geometry(cam, {
        ...scene,
        defenders: [shooter],
        time: 1 + age * MUZZLE_FLASH,
        shots: [{ owner: d.id, at: 1 }],
      }).dots.filter((m) => m.kind === 'dot' && m.colour === PUFF.flash);
      expect(dots, gun).toHaveLength(1);
      const dot = dots[0]!;
      if (dot.kind !== 'dot') throw new Error('not a dot');
      return dot;
    };
    const guns = Object.keys(GUNNER_ART) as GunId[];
    const spot = project(post, cam);
    // One scale for every gun: the sprite's px to the screen's.
    const scale = (flashOf('smg').x - spot.sx) / GUNNER_ART.smg.barrel.x;
    expect(scale).toBeGreaterThan(0);
    for (const gun of guns) {
      const f = flashOf(gun);
      expect(f.x - spot.sx, gun).toBeCloseTo(GUNNER_ART[gun].barrel.x * scale, 6);
      // Higher on screen as the barrel is higher on the sprite, by the same scale.
      const up = GUNNER_ART[gun].barrel.y - GUNNER_ART.smg.barrel.y;
      expect(flashOf('smg').y - f.y, gun).toBeCloseTo(up * scale, 6);
    }
    // The sniper's long barrel reaches further than the pistol held out.
    expect(flashOf('sniper').x).toBeGreaterThan(flashOf('pistol').x);
    // And a pistol's flash is smaller than an LMG's, sized to the gun (ID-088), once flared.
    expect(flashOf('pistol', FLASH.rise).r).toBeLessThan(flashOf('lmg', FLASH.rise).r);
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
    const s = bulletShape(
      { ...scene, posts: [], defenders: [walker] },
      flying(walker, target, 30),
      cam,
    );
    expect(feet - s.tail.sy).toBeGreaterThan(5);
    expect(feet - s.tail.sy).toBeLessThan(30);
  });

  it("flashes at a turret's barrel when it fires", () => {
    const built = buildTurret(
      newBase(),
      stockOf({ scrap: 99, wood: 99, metal: 0, concrete: 0 }),
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
    // The fixed frame's zoom at 1280×720 (ID-064), about 0.98×, keeps the minimum too.
    const framed = busy(frameCamera({ w: 1280, h: 720 }).zoom);
    for (const m of [...small.marks, ...framed.marks]) {
      if (m.kind === 'dot') expect(m.r).toBeGreaterThanOrEqual(1);
      if (m.kind === 'line') expect(m.width).toBeGreaterThanOrEqual(1);
    }
    const sizes = (g: typeof small) => g.dots.map((m) => (m.kind === 'dot' ? m.r : 0));
    sizes(big).forEach((r, i) => expect(r).toBeGreaterThan(sizes(small)[i]!));
  });

  describe('easy to see, bullets not beams (ID-070)', () => {
    const SPARK = '#ffffff';
    const FRAME = 1 / 60;
    type Paint = {
      op: 'fill' | 'stroke';
      style: unknown;
      width: number;
      path: [number, number][];
    };
    /** Every fill and stroke `drawScene` makes, in order, with its style and path. */
    function paints(scene: Scene, cam: Camera): Paint[] {
      const r = recorder();
      const out: Paint[] = [];
      let path: [number, number][] = [];
      const ctx = r.ctx as unknown as Record<string, unknown> & {
        fillStyle: unknown;
        strokeStyle: unknown;
        lineWidth: number;
      };
      Object.assign(ctx, {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        beginPath: () => (path = []),
        moveTo: (x: number, y: number) => path.push([x, y]),
        lineTo: (x: number, y: number) => path.push([x, y]),
        fill: () => out.push({ op: 'fill', style: ctx.fillStyle, width: 0, path }),
        stroke: () =>
          out.push({ op: 'stroke', style: ctx.strokeStyle, width: ctx.lineWidth, path }),
      });
      drawScene(r.ctx, r.art, scene, cam, VIEW);
      return out;
    }
    const gap = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);

    it('draws the head as a white capsule over a darker, wider backing, with no rim on the tail', () => {
      const cam = frameCamera({ w: 1280, h: 720 });
      const { scene, post, target } = fight();
      const p = paints({ ...scene, bullets: [flying(post, target, 200)] }, cam);
      const strokes = p.filter((x) => x.op === 'stroke');
      const backing = strokes.findIndex((x) => x.style === BULLET.head.backing);
      const head = strokes.findIndex((x) => x.style === PUFF.slug);
      expect(backing).toBeGreaterThanOrEqual(0);
      expect(head).toBeGreaterThan(backing);
      const w = strokes[head]!.width;
      expect(w).toBeCloseTo(Math.max(1.5, BULLET.head.w * cam.zoom), 9);
      expect(strokes[backing]!.width).toBeCloseTo(w + 2 * BULLET.head.edge, 9);
      // A capsule (round caps add half its width at each end) BULLET.head.len long.
      const [a, b] = strokes[head]!.path;
      expect(gap(a!, b!) + w).toBeCloseTo(BULLET.head.len * cam.zoom, 6);
      // Those are the bullet's only strokes: nothing outlines the tail.
      expect(strokes).toHaveLength(2);
    });

    it('thins the tail from the head to a point, with its shadow on the ground under it', () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      const b = flying(post, target, 200);
      const p = paints({ ...scene, bullets: [b] }, cam);
      const quads = p.filter((x) => x.op === 'fill' && x.path.length === 4);
      const shadow = quads.find((x) => x.style === BULLET.shadow.colour);
      const tail = quads.find((x) => typeof x.style !== 'string');
      if (!shadow || !tail) throw new Error('no tail or shadow');
      // Points: head side, tail side, tail other side, head other side.
      const widths = (q: Paint) => [gap(q.path[0]!, q.path[3]!), gap(q.path[1]!, q.path[2]!)];
      expect(widths(tail)[0]).toBeCloseTo(BULLET.head.w, 9);
      expect(widths(tail)[1]).toBeCloseTo(BULLET.tail.end, 9);
      expect(widths(shadow)[0]).toBeCloseTo(BULLET.shadow.w, 9);
      expect(widths(shadow)[1]).toBeCloseTo(BULLET.tail.end, 9);
      // The shadow lies on the ground, the tail up in the air above it.
      const s = bulletShape(scene, b, cam);
      // Its head end is centred on the ground under the bullet's head.
      expect((shadow.path[0]![1] + shadow.path[3]![1]) / 2).toBeCloseTo(s.groundHead.sy, 9);
      expect(s.groundHead.sy - s.head.sy).toBeGreaterThan(5);
      expect(p.indexOf(shadow)).toBeLessThan(p.indexOf(tail));
    });

    it.each([
      [undefined, 1],
      [1, 1],
      [2, 2],
      [3, 2],
    ])('at game speed %s the tail is the tracer plus %s frame(s) of flight', (pace, frames) => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      const b = flying(post, target, 300);
      const s = bulletShape({ ...scene, pace }, b, cam);
      expect(s.length).toBeCloseTo(WEAPONS.pistol.tracer.length + 1800 * FRAME * frames, 9);
    });

    it.each([1, 3])(
      'carries the head on smoothly between the fight steps at %s×, so it never jumps',
      (pace) => {
        const cam = { x: 0, y: 0, zoom: 1 };
        const { scene } = fight();
        const game = newGame();
        const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
        const d = h.defenders[0]!;
        const post = h.posts[d.postId]!;
        h.toSpawn = 0;
        // Straight across the field and far: every frame below is mid-flight.
        h.enemies = [{ ...scene.enemies[0]!, x: post.x + 700, y: post.y }];
        d.nextShotAt = 0;
        let t = tick(h, STEP);
        const heads: number[] = [];
        for (let f = 0; f < 6; f++) {
          t = tick(t, pace * FRAME);
          const b = t.bullets[0]!;
          heads.push(bulletShape({ ...t, pace }, b, cam).head.sx);
        }
        // The sim moves bullets a whole step at a time (0 or 2 frames' travel at 1×); drawn,
        // each frame moves the head the same distance: its speed over one frame (across the
        // screen, the share of it along x, as the gun's spread turns it a little).
        const { speed, dx } = t.bullets[0]!;
        for (let i = 1; i < heads.length; i++) {
          expect(heads[i]! - heads[i - 1]!).toBeCloseTo(speed * dx * pace * FRAME * cam.zoom, 6);
        }
      },
    );

    it('never carries the head past the aimed spot before it gets there, nor past its flight', () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      const flat = { x: target.x, y: post.y };
      const near = flying(post, flat, 395);
      const at = (b: Bullet) => bulletShape({ ...scene, acc: STEP }, b, cam).head.sx;
      // Aimed 400 px out: 5 px short, it is drawn at the aimed spot, not 60 px past it.
      expect(at(near)).toBeCloseTo(project(flat, cam).sx, 9);
      // A miss flies on past the aim, but no further than it has left to fly.
      const last = { ...flying(post, flat, 450), left: 7 };
      expect(at(last)).toBeCloseTo(project({ x: last.x + 7, y: last.y }, cam).sx, 9);
    });

    it('never trails back past the muzzle, so a fresh shot draws no line to the shooter', () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      const s = bulletShape(scene, flying(post, { x: target.x, y: post.y }, 5), cam);
      expect(s.length).toBeCloseTo(5, 9);
      expect(Math.abs(s.head.sx - s.tail.sx)).toBeCloseTo(5, 6);
    });

    it('joins shooter and a close target only while the bullet is still short of it', () => {
      // An enemy at the wall, 60 px out: for the frame or two the bullet takes, its tail
      // runs from the muzzle to the head (a point-blank flicker); once it lands it is gone.
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post } = fight();
      const close = { x: post.x + 60, y: post.y };
      const s = bulletShape(scene, flying(post, close, 40), cam);
      expect(s.length).toBeCloseTo(40, 9);
      expect(s.head.sx).toBeLessThan(project(close, cam).sx);
    });

    it("lays every shadow and backing of a shotgun's pellets under every pellet's tail and head", () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      const fan = [-40, -20, 0, 20, 40].map((dy) =>
        flying(post, { x: target.x, y: target.y + dy }, 60, WEAPONS.shotgun.tracer),
      );
      const p = paints({ ...scene, bullets: fan }, cam);
      const under = p.flatMap((x, i) =>
        x.style === BULLET.shadow.colour || x.style === BULLET.head.backing ? [i] : [],
      );
      const over = p.flatMap((x, i) =>
        x.style === PUFF.slug ||
        (x.op === 'fill' && x.path.length === 4 && typeof x.style !== 'string')
          ? [i]
          : [],
      );
      expect(under).toHaveLength(fan.length * 2);
      expect(over).toHaveLength(fan.length * 2);
      expect(Math.max(...under)).toBeLessThan(Math.min(...over));
    });

    it('points the muzzle flash along the shot, lit for at least one 60 fps frame at 3×', () => {
      expect(MUZZLE_FLASH).toBeGreaterThan(3 * FRAME);
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, d } = fight();
      const shot = { ...scene, enemies: [], time: 1, shots: [{ owner: d.id, at: 1 }] };
      /** Which way the flash's main flame points: from its back, at the barrel, to its tip. */
      const pointing = (s: Scene) => {
        const flames = paints(s, cam).filter((x) => x.style === FLASH_STYLE.pistol.edge);
        expect(flames).toHaveLength(1);
        const [back, , tip] = flames[0]!.path;
        return Math.atan2(tip![1] - back![1], tip![0] - back![0]);
      };
      // Ahead, into the field, with no bullet; turned up to `FLASH.spin` per shot.
      expect(Math.abs(pointing(shot))).toBeLessThanOrEqual(FLASH.spin + 1e-9);
      // Aimed off to one side, it turns with the shot (its newest bullet).
      const post = scene.posts[d.postId]!;
      const b = { ...flying(post, { x: post.x + 300, y: post.y + 300 }, 20), owner: d.id };
      const p0 = project(post, cam);
      const p1 = project({ x: post.x + b.dx, y: post.y + b.dy }, cam);
      const want = Math.atan2(p1.sy - p0.sy, p1.sx - p0.sx);
      expect(want).toBeGreaterThan(0.2);
      expect(Math.abs(pointing({ ...shot, bullets: [b] }) - want)).toBeLessThanOrEqual(
        FLASH.spin + 1e-9,
      );
    });

    describe('the muzzle flash (ID-088)', () => {
      const at = { sx: 100, sy: 100 };
      const CAM1 = { x: 0, y: 0, zoom: 1 };
      const guns = Object.keys(FLASH_STYLE) as (keyof typeof FLASH_STYLE)[];
      const tipOf = (f: ReturnType<typeof flashShape>) => f.flames[0]![2]!;
      const reach = (f: ReturnType<typeof flashShape>) =>
        Math.hypot(tipOf(f).sx - at.sx, tipOf(f).sy - at.sy);

      it('adds light: every part of it is drawn lighter, and the canvas is put back after', () => {
        const { scene, d } = fight();
        const r = recorder();
        const ctx = r.ctx as unknown as Record<string, unknown> & {
          fillStyle: unknown;
          globalCompositeOperation: string;
        };
        const fills: { style: unknown; comp: string }[] = [];
        Object.assign(ctx, {
          fillStyle: '',
          globalCompositeOperation: 'source-over',
          fill: () => fills.push({ style: ctx.fillStyle, comp: ctx.globalCompositeOperation }),
        });
        const shot = { ...scene, time: 1, shots: [{ owner: d.id, at: 1 }] };
        drawScene(r.ctx, r.art, shot, CAM1, VIEW);
        // Its halo (a gradient), then its flames, their hot centres and the white-hot dot.
        const flames = fills.findIndex((x) => x.style === FLASH_STYLE.pistol.edge);
        expect(flames).toBeGreaterThan(0);
        const flash = fills.slice(flames - 1, flames + 3);
        expect(flash.map((x) => (typeof x.style === 'string' ? x.style : 'glow'))).toEqual([
          'glow',
          FLASH_STYLE.pistol.edge,
          FLASH.centre,
          FLASH.white,
        ]);
        expect(flash.every((x) => x.comp === 'lighter')).toBe(true);
        // Put back after: whatever is drawn next covers as usual.
        expect(fills[flames + 3]?.comp ?? ctx.globalCompositeOperation).toBe('source-over');
        expect(ctx.globalCompositeOperation).toBe('source-over');
      });

      it('rolls its own look each shot from the seeded RNG, the same on a replay', () => {
        const look = (seed: number) => flashShape(at, 0, 0.1, FLASH_STYLE.rifle, seed, CAM1);
        expect(look(7)).toEqual(look(7));
        const tips = new Set(
          Array.from({ length: 30 }, (_, i) => {
            const t = tipOf(look(i));
            return `${t.sx.toFixed(2)},${t.sy.toFixed(2)}`;
          }),
        );
        expect(tips.size).toBe(30);
        // Turned and sized only a little: it still points along the shot.
        for (let i = 0; i < 30; i++) {
          const t = tipOf(look(i));
          expect(Math.abs(Math.atan2(t.sy - at.sy, t.sx - at.sx))).toBeLessThanOrEqual(
            FLASH.spin + 1e-9,
          );
        }
        // Each flame's length rolls within its range, with the whole flash's size: an SMG's
        // spikier than the rest.
        expect(FLASH_STYLE.smg.roll).toBeGreaterThan(FLASH.tongue);
        for (const g of guns) {
          const style = FLASH_STYLE[g];
          const spread = style.roll ?? FLASH.tongue;
          const len = style.tongues[0]![1];
          const reaches = Array.from({ length: 200 }, (_, i) =>
            reach(flashShape(at, 0, FLASH.rise, style, i, CAM1)),
          );
          expect(Math.max(...reaches), g).toBeLessThanOrEqual(
            len * (1 + FLASH.size) * (1 + spread) + 1e-9,
          );
          expect(Math.min(...reaches), g).toBeGreaterThanOrEqual(
            len * (1 - FLASH.size) * (1 - spread) - 1e-9,
          );
          // And it really varies: the longest well past the shortest.
          expect(Math.max(...reaches) / Math.min(...reaches), g).toBeGreaterThan(1 + spread);
        }
        // In the fight: one scene draws the same twice; another shot draws another flash.
        const { scene, d } = fight();
        const flames = (s: Scene) =>
          paints(s, CAM1)
            .filter((x) => x.style === FLASH_STYLE.pistol.edge)
            .map((x) => x.path);
        const first = { ...scene, time: 1.02, shots: [{ owner: d.id, at: 1 }] };
        const next = { ...scene, time: 1.52, shots: [{ owner: d.id, at: 1.5 }] };
        expect(flames(first)).toEqual(flames(first));
        expect(flames(first)).not.toEqual(flames(next));
      });

      it("fits each gun: sized and shaped for it, and a turret's unlike a survivor's", () => {
        const len = (g: keyof typeof FLASH_STYLE) => FLASH_STYLE[g].tongues[0]![1];
        expect(len('pistol')).toBeLessThan(len('smg'));
        expect(len('smg')).toBeLessThan(len('rifle'));
        expect(len('rifle')).toBeLessThan(len('sniper'));
        // An SMG's thinner than a pistol's; a sniper's a needle, thinner than a rifle's.
        const width = (g: keyof typeof FLASH_STYLE) => FLASH_STYLE[g].tongues[0]![2];
        expect(width('smg')).toBeLessThan(width('pistol'));
        expect(width('sniper')).toBeLessThan(width('rifle'));
        const halo = (g: keyof typeof FLASH_STYLE) => FLASH_STYLE[g].halo;
        for (const g of ['pistol', 'smg', 'rifle', 'sniper'] as const) {
          expect(halo(g)).toBeLessThan(halo('lmg'));
          expect(halo(g)).toBeLessThanOrEqual(halo('shotgun'));
        }
        // A shotgun's is a wide fan: three big flames forward, not one.
        const forward = FLASH_STYLE.shotgun.tongues.filter(
          ([off, l]) => Math.abs(off) < 0.5 && l > 5,
        );
        expect(forward).toHaveLength(3);
        // An LMG's main flame is the broadest of any gun.
        for (const g of guns) {
          if (g !== 'lmg')
            expect(FLASH_STYLE[g].tongues[0]![2]).toBeLessThanOrEqual(
              FLASH_STYLE.lmg.tongues[0]![2],
            );
        }
        // A turret's is a cold cross, with a flame out the back: no survivor's is.
        for (const g of guns) {
          if (g === 'turret') continue;
          expect(FLASH_STYLE[g].edge).not.toBe(FLASH_STYLE.turret.edge);
          expect(FLASH_STYLE[g].tongues.some(([off]) => Math.abs(off) > 3)).toBe(false);
        }
        expect(FLASH_STYLE.turret.tongues.some(([off]) => Math.abs(off) > 3)).toBe(true);
        // The same roll draws a pistol's smaller than a shotgun's.
        const pistol = flashShape(at, 0, 0.1, FLASH_STYLE.pistol, 3, CAM1);
        const shotgun = flashShape(at, 0, 0.1, FLASH_STYLE.shotgun, 3, CAM1);
        expect(pistol.halo).toBeLessThan(shotgun.halo);
        expect(pistol.flames).toHaveLength(3);
        expect(shotgun.flames).toHaveLength(5);
      });

      it("draws a turret's flash in its own colour", () => {
        const built = buildTurret(
          newBase(),
          stockOf({ scrap: 99, wood: 99, metal: 0, concrete: 0 }),
          true,
          'tower',
          0,
          5,
        );
        if (!built.ok) throw new Error(built.reason);
        const { turrets, layers } = layoutOf(built.base);
        const { scene } = fight();
        const p = paints(
          {
            ...scene,
            layers,
            turrets,
            time: 2,
            shots: [{ owner: `turret:${turrets[0]!.id}`, at: 2 }],
          },
          CAM1,
        );
        expect(p.filter((x) => x.style === FLASH_STYLE.turret.edge)).toHaveLength(1);
        expect(p.filter((x) => x.style === FLASH_STYLE.pistol.edge)).toHaveLength(0);
      });

      it('flares up at full brightness, then shrinks and fades fast to nothing', () => {
        const shape = (age: number) => flashShape(at, 0, age, FLASH_STYLE.rifle, 5, CAM1);
        expect(shape(0).alpha).toBe(1);
        expect(shape(FLASH.rise * 0.99).alpha).toBe(1);
        expect(reach(shape(0))).toBeLessThan(reach(shape(FLASH.rise)));
        expect(shape(0).halo).toBeLessThan(shape(FLASH.rise).halo);
        const later = [0.3, 0.5, 0.7, 0.9].map(shape);
        later.reduce((a, b) => {
          expect(b.alpha).toBeLessThan(a.alpha);
          expect(reach(b)).toBeLessThan(reach(a));
          return b;
        }, shape(FLASH.rise));
        expect(shape(0.5).alpha).toBeLessThan(0.5);
        expect(shape(0.999).alpha).toBeLessThan(0.001);
        // Its glow is full through the flare, then goes before the flames: an ember, not a smudge.
        expect(shape(0).glow).toBe(1);
        for (const age of [0.3, 0.5, 0.7]) {
          expect(shape(age).glow).toBeLessThan(shape(age).alpha);
          expect(shape(age).glow).toBeCloseTo(shape(age).alpha ** 1.5, 9);
        }
      });

      it('reads from 0.5× to 2× zoom: in proportion, never under the smallest effect size', () => {
        for (const g of guns) {
          const half = flashShape(at, 0, 0.5, FLASH_STYLE[g], 9, { ...CAM1, zoom: 0.5 });
          const one = flashShape(at, 0, 0.5, FLASH_STYLE[g], 9, CAM1);
          const two = flashShape(at, 0, 0.5, FLASH_STYLE[g], 9, { ...CAM1, zoom: 2 });
          expect(reach(two) / reach(one), g).toBeCloseTo(2, 6);
          expect(reach(half), g).toBeGreaterThanOrEqual(1.5);
          expect(half.halo, g).toBeGreaterThanOrEqual(1.5);
          expect(half.core, g).toBeGreaterThanOrEqual(1.5);
          // Its main flame keeps a point, so it still shows which way the shot went.
          expect(reach(half), g).toBeGreaterThanOrEqual(FLASH.reach - 1e-9);
          for (const f of half.flames) {
            // Every flame at least the smallest effect across.
            expect(Math.hypot(f[1]!.sx - f[3]!.sx, f[1]!.sy - f[3]!.sy), g).toBeGreaterThanOrEqual(
              1.5 - 1e-9,
            );
          }
        }
      });

      it("stays clear of the next survivor's flash along the wall, for shots across the field", () => {
        // The closest two posts survivors fire from: a wall walk's spots, side by side.
        const step = SEGMENT_HEIGHT / WALK_SPOTS;
        const gap = project({ x: 0, y: step }, CAM1).sy - project({ x: 0, y: 0 }, CAM1).sy;
        expect(gap).toBeGreaterThan(0);
        // Shots up to 0.4 rad off straight across on screen: an enemy up to 0.7× as far off
        // the shooter's row as it is out in the field.
        const aim = 0.4;
        for (const g of guns) {
          const style = FLASH_STYLE[g];
          const roll = style.roll ?? FLASH.tongue;
          // The most any flame can reach up or down: its longest roll, at its steepest turn,
          // plus half its widest width.
          const bound = Math.max(
            ...style.tongues.map(([off, len, w]) => {
              let steep = 0;
              for (let a = -aim - FLASH.spin; a <= aim + FLASH.spin + 1e-9; a += 0.01) {
                steep = Math.max(steep, Math.abs(Math.sin(a + off)));
              }
              const big = 1 + FLASH.size;
              return len * big * (1 + roll) * steep + Math.max(w * big, 1.5) / 2;
            }),
          );
          // One reaching down and the next reaching up still leave a gap between them.
          expect(bound * 2, g).toBeLessThan(gap);
          // And the bound holds for real flashes at their biggest (the end of the flare).
          for (let seed = 0; seed < 60; seed++) {
            for (const turn of [-aim, 0, aim]) {
              const f = flashShape(at, turn, FLASH.rise, style, seed, CAM1);
              for (const p of f.flames.flat()) {
                expect(Math.abs(p.sy - at.sy), g).toBeLessThanOrEqual(bound + 1e-9);
              }
            }
          }
        }
      });
    });

    it("sorts each of a shooter's shots on its own: only one shot's pellets draw together", () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene, post, target } = fight();
      // Two shots in the air from one gun: one just fired, one far out.
      const shots = [60, 300].map((f) => flying(post, target, f));
      const p = paints({ ...scene, bullets: shots }, cam);
      const backings = p.flatMap((x, i) => (x.style === BULLET.head.backing ? [i] : []));
      const heads = p.flatMap((x, i) => (x.style === PUFF.slug ? [i] : []));
      expect(backings).toHaveLength(2);
      expect(heads).toHaveLength(2);
      // Each shot's backing then head, not both backings first.
      expect(backings[1]).toBeGreaterThan(heads[0]!);
    });

    it('takes every tracer colour as #rrggbb, so its fade stops are real colours', () => {
      const guns = [...Object.values(WEAPONS).flatMap((w) => ('tracer' in w ? [w] : [])), TURRET];
      for (const g of guns) expect(g.tracer.colour).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('flashes a white spark on the body for a hit, not a miss, shrinking and fading', () => {
      const cam = { x: 0, y: 0, zoom: 1 };
      const { scene } = fight();
      const sparks = (time: number, hit: boolean) =>
        geometry(cam, {
          ...scene,
          enemies: [],
          time,
          impacts: [{ x: 900, y: 300, hit, at: 1 }],
        }).dots.flatMap((m) => (m.kind === 'dot' && m.colour === SPARK ? [m] : []));
      const fresh = sparks(1, true);
      expect(fresh).toHaveLength(1);
      expect(fresh[0]!.alpha).toBe(1);
      // At body height, not on the ground.
      expect(project({ x: 900, y: 300 }, cam).sy - fresh[0]!.y).toBeGreaterThan(5);
      const later = sparks(1 + IMPACT_FLASH * 0.2, true);
      expect(later).toHaveLength(1);
      expect(later[0]!.alpha).toBeLessThan(1);
      expect(later[0]!.r).toBeLessThan(fresh[0]!.r);
      expect(sparks(1 + IMPACT_FLASH * 0.45, true)).toEqual([]);
      expect(sparks(1, false)).toEqual([]);
    });
  });
});

describe('sprite animation (ID-049)', () => {
  beforeEach(() => {
    stubCanvas();
    // A hit's white silhouette is a sprite-sized canvas; the ground's is field-sized.
    const Ground = globalThis.OffscreenCanvas as unknown as new (
      w: number,
      h: number,
    ) => { id: string };
    vi.stubGlobal(
      'OffscreenCanvas',
      class extends Ground {
        constructor(w: number, h: number) {
          super(w, h);
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
      shambler: draws.filter((d) => d.id.startsWith('shambler-')),
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

  it('without an animator (build mode) nothing moves, the Horror included', () => {
    const w = walking();
    const s = {
      ...w,
      enemies: [...w.enemies, { ...w.enemies[0]!, id: 8, kind: 'horror' as const }],
    };
    const r = recorder();
    const moved: unknown[] = [];
    Object.assign(r.ctx, { save: () => moved.push('save') });
    drawScene(r.ctx, r.art, s, CAM, VIEW);
    // The frame's clips (ID-064), the backdrop's and the scene's, are the only saves: no
    // sprite is posed.
    expect(moved).toEqual(['save', 'save']);
  });
});

describe('the horde-only fight (ID-068)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  const squadScene = (n: number): Scene => {
    const g = newGame('horde');
    const roster = Array.from({ length: n }, (_, i) => ({ ...recruit(i + 1), xp: 0 }));
    return startSquadHorde({ ...g, roster, camp: { ...g.camp, recruits: n } }, 7, 0);
  };

  it('draws no tower, ground post or wall-walk platform: survivors stand on bare ground', () => {
    const r = recorder();
    drawScene(r.ctx, r.art, squadScene(SQUAD_CAP), frameCamera({ w: 1280, h: 720 }), {
      w: 1280,
      h: 720,
    });
    const all = [...r.drawn, ...r.textured];
    for (const id of [
      'tower',
      'ground-post',
      'turret-lit',
      'turret-dark',
      'turret-jammed',
    ] as const) {
      expect(all).not.toContain(id);
    }
    expect(r.textured).not.toContain(BASE_ART.walk.top);
    // Each survivor's sprite is drawn, in their own look (ID-074).
    const scene = squadScene(SQUAD_CAP);
    const own = scene.defenders.map((d) => GUNNER_LOOKS[lookOf(d.id)]!.pistol.idle);
    expect(new Set(own).size).toBe(4);
    expect(r.drawn.filter((id) => id.startsWith('gunner-')).sort()).toEqual(own.sort());
  });

  it("sits each HP bar wholly over its sprite's head, a survivor's and an enemy's (ID-069)", () => {
    const scene = squadScene(1);
    const survivor = scene.defenders[0]!;
    const cam = frameCamera({ w: 1280, h: 720 });
    const enemy: Enemy = {
      id: 9,
      kind: 'brute',
      x: 1000,
      y: survivor.y,
      hp: 5,
      maxHp: 20,
      nextAttackAt: 0,
      inCamp: false,
      stunnedUntil: 0,
      vx: 0,
      vy: 0,
      climbUntil: 0,
      climbed: false,
    };
    const r = recorder();
    const tops = new Map<string, number>();
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    Object.assign(r.ctx as unknown as Record<string, unknown>, {
      drawImage: (img: { id: ArtId }, _x: number, y: number) =>
        tops.set(img.id, Math.min(tops.get(img.id) ?? Infinity, y)),
      fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
    });
    drawScene(r.ctx, r.art, { ...scene, enemies: [enemy] }, cam, { w: 1280, h: 720 });
    const barOver = (sx: number) =>
      rects.filter((b) => b.x < sx && b.x + b.w > sx && b.w < 60 && b.h < 10);
    for (const [id, who] of [
      ['gunner-pistol-idle', survivor],
      ['brute-walk-b', enemy],
    ] as const) {
      const top = tops.get(id);
      expect(top, id).toBeDefined();
      const bars = barOver(project(who, cam).sx);
      expect(bars.length, id).toBeGreaterThan(0);
      for (const b of bars) expect(b.y + b.h, id).toBeLessThanOrEqual(top! + 1e-6);
    }
  });

  it('draws a survivor aiming while they fire and at rest once they stop (ID-069)', () => {
    const scene = squadScene(2);
    const [a, b] = scene.defenders;
    const anim = new Animator();
    const at = (time: number, shots: Scene['shots'] = []) => {
      const r = recorder();
      drawScene(
        r.ctx,
        r.art,
        { ...scene, time, shots },
        frameCamera({ w: 1280, h: 720 }),
        {
          w: 1280,
          h: 720,
        },
        null,
        null,
        null,
        anim,
      );
      return r.drawn.filter((id) => id.startsWith('gunner-'));
    };
    // a and b, in two different looks (ID-074).
    const [pa, pb] = [a!, b!].map((d) => GUNNER_LOOKS[lookOf(d.id)]!.pistol);
    expect(pa!.idle).not.toBe(pb!.idle);
    // Survivor a fires at 1, their next shot due at 1.5; b never fires.
    a!.nextShotAt = 1.5;
    expect(at(1, [{ owner: a!.id, at: 1 }]).sort()).toEqual([pa!.aim, pb!.idle].sort());
    expect(at(1.5 + ANIM.aim.hold)).toContain(pa!.aim);
    // No shot when the gun was ready: nothing was in range, so the gun drops.
    expect(at(1.5 + ANIM.aim.hold + 0.1).sort()).toEqual([pa!.idle, pb!.idle].sort());
    expect(b!.id).not.toBe(a!.id);
  });

  it('each survivor’s HP bar always shows, at least its readable size on screen, with a dark edge', () => {
    const r = recorder();
    const fills: { style: string; w: number; h: number }[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string };
    Object.assign(r.ctx, {
      fillRect: (_x: number, _y: number, w: number, h: number) =>
        fills.push({ style: ctx.fillStyle, w, h }),
    });
    const scene = squadScene(3);
    // Full HP and a small zoom: the bar still shows at its minimum size.
    drawScene(r.ctx, r.art, scene, { x: 0, y: 0, zoom: 0.5 }, VIEW);
    const backs = fills.filter((f) => f.style === '#c43b3b');
    expect(backs).toHaveLength(3);
    for (const b of backs) {
      expect(b.w).toBeGreaterThanOrEqual(SURVIVOR_BAR.min.w);
      expect(b.h).toBeGreaterThanOrEqual(SURVIVOR_BAR.min.h);
    }
    expect(fills.filter((f) => f.style === '#1b1a18' && f.w > SURVIVOR_BAR.min.w)).toHaveLength(3);
    // At the 1280×720 frame's zoom it is bigger than an enemy's bar.
    fills.length = 0;
    const cam = frameCamera({ w: 1280, h: 720 });
    drawScene(r.ctx, r.art, scene, cam, { w: 1280, h: 720 });
    const bar = fills.find((f) => f.style === '#c43b3b')!;
    expect(bar.w).toBeCloseTo(SURVIVOR_BAR.w * cam.zoom, 9);
    expect(bar.h).toBeGreaterThanOrEqual(5);
  });

  describe('name tags (ID-074)', () => {
    type Rect = { style: string; x: number; y: number; w: number; h: number };
    /** Every rect filled, every text drawn with where, and the order of images and texts. */
    const tagged = (scene: Scene, cam: Camera, build: BuildOverlay | null = null) => {
      const r = recorder();
      const rects: Rect[] = [];
      const texts: { text: string; x: number; y: number }[] = [];
      const order: string[] = [];
      const ctx = r.ctx as unknown as { fillStyle: string };
      Object.assign(r.ctx, {
        fillRect: (x: number, y: number, w: number, h: number) =>
          rects.push({ style: ctx.fillStyle, x, y, w, h }),
        fillText: (text: string, x: number, y: number) => {
          texts.push({ text, x, y });
          order.push(`text:${text}`);
        },
        measureText: (t: string) => ({ width: t.length * 6 }),
        drawImage: (img: { id: ArtId }) => order.push(img.id),
      });
      drawScene(r.ctx, r.art, scene, cam, { w: 1280, h: 720 }, build);
      return { rects, texts, order };
    };

    it("shows each survivor's roster name once, centred over them and wholly above their HP bar", () => {
      const scene = squadScene(SQUAD_CAP);
      const cam = frameCamera({ w: 1280, h: 720 });
      const { rects, texts } = tagged(scene, cam);
      const names = scene.defenders.map((d) => d.name);
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(texts.map((t) => t.text).sort()).toEqual([...names].sort());
      for (const d of scene.defenders) {
        const feet = project(d, cam);
        const text = texts.find((t) => t.text === d.name && Math.abs(t.x - feet.sx) < 1e-6);
        expect(text, d.name).toBeDefined();
        // Its plate holds the text; the bar's dark edge right under it, at the same x.
        const plate = rects.find(
          (p) => p.style === 'rgba(21, 23, 26, 0.6)' && p.y < text!.y && p.y + p.h > text!.y,
        )!;
        expect(plate, d.name).toBeDefined();
        const edge = rects.find(
          (b) => b.style === '#1b1a18' && b.x < feet.sx && b.x + b.w > feet.sx && b.y > plate.y,
        )!;
        expect(edge, d.name).toBeDefined();
        expect(edge.y - (plate.y + plate.h)).toBeCloseTo(NAME_TAG_GAP, 9);
      }
    });

    it('draws the tags after every sprite, so nothing covers a name', () => {
      const { order } = tagged(squadScene(3), frameCamera({ w: 1280, h: 720 }));
      const lastImage = order.findLastIndex((o) => !o.startsWith('text:'));
      const firstText = order.findIndex((o) => o.startsWith('text:'));
      expect(firstText).toBeGreaterThan(lastImage);
    });

    it('tags a full-game defender over their title badge spot too, and none in the build scene', () => {
      const game = newGame();
      const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
      const cam = frameCamera({ w: 1280, h: 720 });
      const fight = tagged(h, cam);
      const shown = h.defenders.filter((d) => h.posts.some((p) => p.id === d.postId) || d.walking);
      expect(shown.length).toBeGreaterThan(0);
      expect(fight.texts.map((t) => t.text).sort()).toEqual(shown.map((d) => d.name).sort());
      const overlay: BuildOverlay = {
        selected: null,
        hover: null,
        ghosts: { slots: [], lines: [] },
      };
      const build = tagged(h, cam, overlay);
      for (const d of h.defenders) expect(build.texts.map((t) => t.text)).not.toContain(d.name);
    });

    it('names every defender by name alone, whatever their stats: titles are parked (ID-084)', () => {
      const game = newGame();
      const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
      const d = h.defenders.find((x) => h.posts.some((p) => p.id === x.postId))!;
      const statted = { ...d, stats: { instinct: 100, agility: 100, mind: 100, tinker: 0 } };
      const cam = frameCamera({ w: 1280, h: 720 });
      const full = tagged({ ...h, defenders: [statted] }, cam).texts.map((t) => t.text);
      expect(full).toEqual([d.name]);
      const plain = tagged({ ...h, defenders: [{ ...statted, plain: true }] }, cam).texts;
      expect(plain.map((t) => t.text)).toEqual([d.name]);
    });
  });

  describe('reload pie (ID-078)', () => {
    /** `scene` with survivor `i` out of rounds, their reload ending `left` s after its time. */
    const reloading = (scene: Scene, i: number, left: number): Scene => ({
      ...scene,
      defenders: scene.defenders.map((d, j) =>
        j === i
          ? {
              ...d,
              ammo: { ...d.ammo, primary: 0 },
              reloadedAt: { ...d.reloadedAt, primary: scene.time + left },
            }
          : d,
      ),
    });
    type Arc = { x: number; y: number; r: number; a0: number; a1: number; style: string };
    /** Every arc traced with the fill or stroke style then set; plate rects; draw order. */
    const pies = (scene: Scene, cam: Camera) => {
      const r = recorder();
      const arcs: Arc[] = [];
      const plates: { x: number; y: number; w: number; h: number }[] = [];
      const order: string[] = [];
      const ctx = r.ctx as unknown as { fillStyle: string; strokeStyle: string };
      Object.assign(r.ctx, {
        arc: (x: number, y: number, rad: number, a0: number, a1: number) => {
          arcs.push({ x, y, r: rad, a0, a1, style: `${ctx.fillStyle}|${ctx.strokeStyle}` });
          order.push('arc');
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          if (ctx.fillStyle === 'rgba(21, 23, 26, 0.6)') plates.push({ x, y, w, h });
        },
        fillText: (text: string) => order.push(`text:${text}`),
        measureText: (t: string) => ({ width: t.length * 6 }),
        drawImage: (img: { id: ArtId }) => order.push(img.id),
      });
      drawScene(r.ctx, r.art, scene, cam, { w: 1280, h: 720 });
      return { arcs, plates, order };
    };
    const cam = frameCamera({ w: 1280, h: 720 });
    const fill = (a: Arc) => a.style.split('|')[0];
    const stroke = (a: Arc) => a.style.split('|')[1];
    // The wedge: filled in the reload colour at the disc's radius.
    const wedges = (arcs: Arc[]) =>
      arcs.filter((a) => fill(a) === '#ffc94d' && a.r === RELOAD_PIE.r);
    /** A pie's arcs: its see-through disc, its wedge and its pale ring just outside. */
    const pieArcs = (arcs: Arc[]) =>
      arcs.filter(
        (a) =>
          (a.r === RELOAD_PIE.r && ['rgba(21, 23, 26, 0.6)', '#ffc94d'].includes(fill(a)!)) ||
          (a.r === RELOAD_PIE.r + RELOAD_PIE.edge / 2 && stroke(a) === 'rgba(216, 212, 204, 0.7)'),
      );
    /** The name plate nearest over a point's feet: the defender's own. */
    const plateOver = (
      plates: { x: number; y: number; w: number; h: number }[],
      feet: { sx: number; sy: number },
    ) =>
      plates
        .filter((p) => p.x < feet.sx && p.x + p.w > feet.sx && p.h === PLATE_H && p.y < feet.sy)
        .sort((a, b) => b.y - a.y)[0];

    it('shows nothing while every survivor has rounds', () => {
      const scene = squadScene(3);
      for (const d of scene.defenders) expect(reloadShare(d, scene.time)).toBeNull();
      const { arcs } = pies(scene, cam);
      expect(pieArcs(arcs)).toEqual([]);
    });

    it('fills over the reload time, from empty to full, then goes once the gun is ready', () => {
      const scene = squadScene(1);
      const d = scene.defenders[0]!;
      const total = reloadTime(d, d.loadout.primary);
      expect(total).toBeGreaterThan(0);
      const at = (left: number, t = scene.time) =>
        reloadShare(reloading(scene, 0, left).defenders[0]!, t);
      expect(at(total)).toBeCloseTo(0, 9);
      expect(at(total / 2)).toBeCloseTo(0.5, 9);
      expect(at(total / 4)).toBeCloseTo(0.75, 9);
      expect(at(0)).toBeNull(); // ready now
      expect(at(-1)).toBeNull(); // ready since
      // Rounds back in: no pie, whatever the clock says.
      const refilled = {
        ...reloading(scene, 0, 1).defenders[0]!,
        ammo: { primary: 1, secondary: 0 },
      };
      expect(reloadShare(refilled, scene.time)).toBeNull();
    });

    it('with Speed Loaders, fills over the shorter reload: empty when it starts (ID-077)', () => {
      const scene = squadScene(1);
      const d = scene.defenders[0]!;
      const total = reloadTime(d, d.loadout.primary) * CARD.loaders;
      const at = (left: number) =>
        reloadShare(reloading(scene, 0, left).defenders[0]!, scene.time, ['speed-loaders']);
      expect(at(total)).toBeCloseTo(0, 9);
      expect(at(total / 2)).toBeCloseTo(0.5, 9);
    });

    it("tracks a Gunner's primary while their sidearm fires", () => {
      const scene = squadScene(1);
      const d = reloading(scene, 0, 1).defenders[0]!;
      const share = reloadShare(d, scene.time);
      expect(share).not.toBeNull();
      for (const secondary of [0, 3, 12]) {
        const firing = {
          ...d,
          ammo: { ...d.ammo, secondary },
          reloadedAt: { ...d.reloadedAt, secondary: scene.time + 0.3 },
        };
        expect(reloadShare(firing, scene.time)).toBe(share);
      }
      // A loaded primary shows nothing even with the sidearm reloading.
      const sidearmOnly = {
        ...scene.defenders[0]!,
        ammo: { ...scene.defenders[0]!.ammo, secondary: 0 },
        reloadedAt: { ...scene.defenders[0]!.reloadedAt, secondary: scene.time + 1 },
      };
      expect(reloadShare(sidearmOnly, scene.time)).toBeNull();
    });

    it("draws one pie, over the reloading survivor's name and clear of it, after every sprite", () => {
      const base = squadScene(3);
      const d0 = base.defenders[1]!;
      const total = reloadTime(d0, d0.loadout.primary);
      const scene = reloading(base, 1, total / 2);
      const { arcs, plates, order } = pies(scene, cam);
      const feet = project(scene.defenders[1]!, cam);
      // One wedge, half way round clockwise from the top.
      const wedge = wedges(arcs);
      expect(wedge).toHaveLength(1);
      expect(wedge[0]!.x).toBeCloseTo(feet.sx, 9);
      expect(wedge[0]!.a0).toBeCloseTo(-Math.PI / 2, 9);
      expect(wedge[0]!.a1 - wedge[0]!.a0).toBeCloseTo(Math.PI, 9);
      // Its disc, wedge and edge all on one spot: the only pie drawn.
      const pie = pieArcs(arcs);
      expect(pie).toHaveLength(3);
      for (const a of pie) expect([a.x, a.y]).toEqual([wedge[0]!.x, wedge[0]!.y]);
      // Its bottom edge `gap` over the top of this survivor's own name plate (the nearest
      // over their feet), so it hides no name.
      const plate = plateOver(plates, feet)!;
      expect(plate).toBeDefined();
      expect(wedge[0]!.y).toBeLessThan(plate.y);
      const bottom = wedge[0]!.y + RELOAD_PIE.r + RELOAD_PIE.edge;
      expect(plate.y - bottom).toBeCloseTo(RELOAD_PIE.gap, 9);
      // After the last sprite, and before every name, so where survivors crowd together a
      // name is never under a pie.
      const lastImage = order.findLastIndex((o) => o !== 'arc' && !o.startsWith('text:'));
      expect(order.lastIndexOf('arc')).toBeGreaterThan(lastImage);
      expect(order.findIndex((o) => o.startsWith('text:'))).toBeGreaterThan(
        order.lastIndexOf('arc'),
      );
    });

    it("sits over a full-game defender's titled name plate the same way", () => {
      const game = newGame();
      const h = startHorde(game, 1, game.roster[0]!.id, 0, 0);
      const i = h.defenders.findIndex((x) => h.posts.some((p) => p.id === x.postId));
      const d = h.defenders[i]!;
      expect(d.plain).toBeFalsy();
      const scene = reloading(h, i, reloadTime(d, d.loadout.primary) / 4);
      const { arcs, plates } = pies({ ...scene, defenders: [scene.defenders[i]!] }, cam);
      const wedge = wedges(arcs);
      expect(wedge).toHaveLength(1);
      expect(wedge[0]!.a1 - wedge[0]!.a0).toBeCloseTo(1.5 * Math.PI, 9);
      const post = h.posts.find((p) => p.id === d.postId)!;
      const feet = project({ x: d.x, y: d.y, z: postFloor(h.layers, post) }, cam);
      const plate = plateOver(plates, feet)!;
      expect(plate).toBeDefined();
      const bottom = wedge[0]!.y + RELOAD_PIE.r + RELOAD_PIE.edge;
      expect(plate.y - bottom).toBeCloseTo(RELOAD_PIE.gap, 9);
    });

    it('draws an empty disc at the start of a reload, and none in the build scene', () => {
      const scene = squadScene(1);
      const d = scene.defenders[0]!;
      const start = reloading(scene, 0, reloadTime(d, d.loadout.primary));
      const { arcs } = pies(start, cam);
      expect(wedges(arcs)).toEqual([]);
      expect(pieArcs(arcs)).toHaveLength(2);
      const r = recorder();
      const traced: Arc[] = [];
      const c = r.ctx as unknown as { fillStyle: string; strokeStyle: string };
      Object.assign(r.ctx, {
        arc: (x: number, y: number, rad: number, a0: number, a1: number) =>
          traced.push({ x, y, r: rad, a0, a1, style: `${c.fillStyle}|${c.strokeStyle}` }),
      });
      drawScene(
        r.ctx,
        r.art,
        start,
        cam,
        { w: 1280, h: 720 },
        {
          selected: null,
          hover: null,
          ghosts: { slots: [], lines: [] },
        },
      );
      expect(pieArcs(traced)).toEqual([]);
    });

    it('shows while a survivor really reloads in a fight, and goes when they are loaded again', () => {
      let s: HordeState = squadScene(SQUAD_CAP) as HordeState;
      const empty = () => s.defenders.find((d) => d.ammo.primary === 0);
      while (!empty() && s.time < 120) s = tick(s, STEP);
      const d = empty();
      expect(d, 'a survivor emptied their magazine').toBeDefined();
      const first = reloadShare(d!, s.time)!;
      expect(first).not.toBeNull();
      expect(first).toBeLessThan(0.1);
      const id = d!.id;
      let last = first;
      // It grows every step until the gun is ready (the refill lands on the next step).
      for (;;) {
        s = tick(s, STEP);
        const now = s.defenders.find((x) => x.id === id);
        if (!now || now.ammo.primary > 0) break;
        const share = reloadShare(now, s.time);
        if (share === null) {
          expect(s.time).toBeGreaterThanOrEqual(now.reloadedAt.primary - 1e-6);
          break;
        }
        expect(share).toBeGreaterThan(last);
        last = share;
      }
      expect(last).toBeGreaterThan(0.9);
      // Loaded again: no pie.
      while (s.defenders.find((x) => x.id === id)?.ammo.primary === 0) s = tick(s, STEP);
      const after = s.defenders.find((x) => x.id === id);
      if (after) expect(reloadShare(after, s.time)).toBeNull();
    });
  });
});

describe('the field’s edges in a fight (ID-068)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  it('shades the ground above and below the field, not the field itself', () => {
    const r = recorder();
    const fills: { style: string; y: number; h: number }[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string };
    Object.assign(r.ctx, {
      fillRect: (_x: number, y: number, _w: number, h: number) =>
        fills.push({ style: ctx.fillStyle, y, h }),
    });
    const view = { w: 1440, h: 900 };
    const cam = frameCamera(view);
    drawScene(r.ctx, r.art, blank(), cam, view);
    const top = project({ x: 0, y: 0 }, cam).sy;
    const bottom = project({ x: 0, y: FIELD.height }, cam).sy;
    const shades = fills.filter((f) => f.style === 'rgba(0, 0, 0, 0.3)');
    expect(shades).toEqual([
      { style: 'rgba(0, 0, 0, 0.3)', y: 0, h: top },
      { style: 'rgba(0, 0, 0, 0.3)', y: bottom, h: view.h - bottom },
    ]);
    expect(bottom).toBeLessThan(view.h);
  });
});

describe('barrier cards on the wall and the sliding gate (ID-075)', () => {
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
    // No painted canvases unless a test paints one.
    vi.stubGlobal('OffscreenCanvas', undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  type Seg = Partial<Layer['segments'][number]>;
  const fight = (seg: Seg, more: Partial<Scene> = {}): Scene => ({
    ...withSegment(blank(), { kind: 'wall', tier: 'concrete', hp: 300, maxHp: 300, ...seg }),
    time: 10,
    ...more,
  });
  /** Every image, fill and filled path drawn, in order, with its style and alpha. */
  const trace = (scene: Scene, build: BuildOverlay | null = null) => {
    const r = recorder();
    const ops: { op: string; id?: string; style?: string; alpha: number; at?: number[] }[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string; globalAlpha: number };
    Object.assign(r.ctx, {
      drawImage: (img: { id: ArtId }, ...n: number[]) =>
        ops.push({ op: 'image', id: img.id, alpha: ctx.globalAlpha, at: n }),
      fillRect: (...n: number[]) =>
        ops.push({ op: 'fill', style: ctx.fillStyle, alpha: ctx.globalAlpha, at: n }),
      fill: () => ops.push({ op: 'path', style: ctx.fillStyle, alpha: ctx.globalAlpha }),
    });
    drawScene(r.ctx, r.art, scene, CAM, VIEW, build);
    return { ops, ctx };
  };
  const images = (s: Scene, id: ArtId, build: BuildOverlay | null = null) =>
    trace(s, build).ops.filter((o) => o.op === 'image' && o.id === id);
  const fills = (s: Scene, style: string) =>
    trace(s).ops.filter((o) => o.op === 'fill' && o.style === style);
  const overlay = (): BuildOverlay => ({
    selected: null,
    hover: null,
    ghosts: { slots: [], lines: [] },
  });

  it('Spiked Walls: stakes along each standing segment’s field edge, reaching over the ground', () => {
    const on = fight({}, { taken: ['spiked-walls'] });
    const stakes = images(on, BASE_ART.spikes);
    expect(stakes).toHaveLength(1);
    const x0 = on.layers[0]!.x;
    const z = wallHeight(300, 300);
    const a = project({ x: x0 + WALL.depth - WALL_CARD.spike.in, y: 2, z }, CAM);
    const b = project({ x: x0 + WALL.depth + WALL_CARD.spike.out, y: SEGMENT_HEIGHT - 2, z }, CAM);
    expect(stakes[0]!.at).toEqual([a.sx, a.sy, b.sx - a.sx, b.sy - a.sy]);
    // None without the card, on rubble, or in the build scene.
    expect(images(fight({}), BASE_ART.spikes)).toHaveLength(0);
    expect(images(fight({ hp: 0 }, { taken: ['spiked-walls'] }), BASE_ART.spikes)).toHaveLength(0);
    expect(images(on, BASE_ART.spikes, overlay())).toHaveLength(0);
  });

  it('Spiked Walls: a bite flashes a pale burst with a warm core, gone after its time', () => {
    const core = (spikeAt: number | undefined, taken: Scene['taken'] = ['spiked-walls']) =>
      trace(fight({ spikeAt }, { taken })).ops.filter(
        (o) => o.op === 'path' && o.style === '#e0a020',
      );
    expect(core(10)).toHaveLength(1);
    expect(core(10)[0]!.alpha).toBeCloseTo(WALL_CARD.spike.alpha, 9);
    expect(core(10 - WALL_CARD.spike.time)).toHaveLength(0);
    expect(core(undefined)).toHaveLength(0);
    expect(core(10, [])).toHaveLength(0);
  });

  it('Reinforce: a brace over the top and front, under the damage, at its alpha', () => {
    const hurt = fight({ hp: 90 }, { taken: ['reinforce'] });
    const ops = trace(hurt).ops.filter((o) => o.op === 'image');
    const braces = ops.filter((o) => o.id === BASE_ART.brace);
    expect(braces).toHaveLength(2);
    expect(braces.every((o) => o.alpha === WALL_CARD.brace.alpha)).toBe(true);
    const ids = ops.map((o) => o.id);
    expect(ids.lastIndexOf(BASE_ART.brace)).toBeLessThan(ids.indexOf(BASE_ART.cracks));
    expect(ids.lastIndexOf(BASE_ART.brace)).toBeLessThan(ids.indexOf(BASE_ART.breach));
    expect(images(fight({ hp: 0 }, { taken: ['reinforce'] }), BASE_ART.brace)).toHaveLength(0);
    expect(images(fight({}), BASE_ART.brace)).toHaveLength(0);
    expect(images(fight({}, { taken: ['reinforce'] }), BASE_ART.brace, overlay())).toHaveLength(0);
  });

  it('a barrier card’s pick pulses every standing segment, swelling and fading back', () => {
    const pulse = (barrierAt: number | undefined, seg: Seg = {}) =>
      fills(fight(seg, { barrierAt }), '#b8f4ec');
    // Top and front, at its peak halfway through.
    const peak = pulse(10 - WALL_CARD.pulse.time / 2);
    expect(peak).toHaveLength(2);
    expect(peak[0]!.alpha).toBeCloseTo(WALL_CARD.pulse.alpha, 9);
    expect(pulse(10 - WALL_CARD.pulse.time / 4)[0]!.alpha).toBeLessThan(WALL_CARD.pulse.alpha);
    expect(pulse(10 - WALL_CARD.pulse.time - 1e-9)).toHaveLength(0);
    expect(pulse(10.1)).toHaveLength(0);
    expect(pulse(undefined)).toHaveLength(0);
    expect(pulse(9.8, { hp: 0 })).toHaveLength(0);
    expect(wallPulse(10, 10)).toBeCloseTo(0, 9);
  });

  it('at 3× the pick pulse and repair glow last as long in real time as at 1×', () => {
    // Fight time runs 3× as fast, so 1.5 fight s is 0.5 real s: still glowing at 3×.
    const at = 10 - 1.5;
    const shown = (pace: number) =>
      trace(fight({ repairAt: at }, { barrierAt: at, pace })).ops.filter(
        (o) => o.op === 'fill' && (o.style === '#b8f4ec' || o.style === '#7fe08c'),
      );
    expect(shown(1)).toHaveLength(0);
    expect(shown(3)).toHaveLength(4);
    // The spike bite is combat feedback: it keeps to fight time at any speed.
    const bite = (pace: number) =>
      trace(fight({ spikeAt: 10 - 0.2 }, { taken: ['spiked-walls'], pace })).ops.filter(
        (o) => o.op === 'path' && o.style === '#e0a020',
      );
    expect(bite(1)).toHaveLength(1);
    expect(bite(3)).toHaveLength(1);
    expect(
      trace(fight({ spikeAt: 10 - 0.3 }, { taken: ['spiked-walls'], pace: 3 })).ops.filter(
        (o) => o.op === 'path' && o.style === '#e0a020',
      ),
    ).toHaveLength(0);
  });

  it('a repair glows green on the segment it healed, fading, with its alpha put back', () => {
    const glow = (repairAt: number | undefined) => fills(fight({ repairAt }), '#7fe08c');
    expect(glow(10)).toHaveLength(2);
    expect(glow(10)[0]!.alpha).toBeCloseTo(WALL_CARD.repair.alpha, 9);
    expect(glow(10 - WALL_CARD.repair.time / 2)[0]!.alpha).toBeCloseTo(
      WALL_CARD.repair.alpha / 2,
      9,
    );
    expect(glow(10 - WALL_CARD.repair.time - 1e-9)).toHaveLength(0);
    expect(glow(undefined)).toHaveLength(0);
    expect(trace(fight({ repairAt: 10 }, { barrierAt: 9.8 })).ctx.globalAlpha).toBe(1);
  });

  it('Barbed Wire: a faint band 250–400 units in front of the outermost layer, only with the card', () => {
    // No OffscreenCanvas under test: the tint alone shows, across the band's full height.
    const tint = (s: Scene, build: BuildOverlay | null = null) =>
      trace(s, build).ops.filter((o) => o.op === 'fill' && o.style === WIRE.tint.colour);
    const on = fight({}, { taken: ['barbed-wire'] });
    const band = tint(on);
    expect(band).toHaveLength(1);
    const front = on.layers[0]!.x + WALL.depth;
    const a = project({ x: front + CARD.wire.from, y: 0 }, CAM);
    const b = project({ x: front + CARD.wire.to, y: FIELD.height }, CAM);
    expect(band[0]!.at).toEqual([a.sx, a.sy, b.sx - a.sx, b.sy - a.sy]);
    expect(band[0]!.alpha).toBeCloseTo(WIRE.tint.alpha, 9);
    expect(tint(fight({}))).toHaveLength(0);
    // The coils are out in the field: they stay when the wall falls.
    expect(tint(fight({ hp: 0 }, { taken: ['barbed-wire'] }))).toHaveLength(1);
    expect(tint(on, overlay())).toHaveLength(0);
  });

  it('Barbed Wire: drawn from its painted band when the browser can paint one', () => {
    const Painted = class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        const noop = () => {};
        return {
          fillRect: noop,
          drawImage: noop,
          save: noop,
          restore: noop,
          translate: noop,
          scale: noop,
          createLinearGradient: () => ({ addColorStop: noop }),
          beginPath: noop,
          ellipse: noop,
          moveTo: noop,
          lineTo: noop,
          stroke: noop,
          fill: noop,
          closePath: noop,
        };
      }
    };
    vi.stubGlobal('OffscreenCanvas', Painted);
    {
      const r = recorder();
      const drawn: unknown[] = [];
      Object.assign(r.ctx, { drawImage: (img: unknown) => drawn.push(img) });
      drawScene(r.ctx, r.art, fight({}, { taken: ['barbed-wire'] }), CAM, VIEW);
      const band = drawn.find((d) => d instanceof Painted) as InstanceType<typeof Painted>;
      expect(band.width).toBe((CARD.wire.to - CARD.wire.from) * WIRE.px);
      expect(band.height).toBe(FIELD.height * WIRE.px);
    }
  });

  it('an enemy at a spiked segment draws over the stakes, never under them', () => {
    const s = fight({}, { taken: ['spiked-walls'] });
    const h = { ...s, nextEnemyId: 1 } as unknown as HordeState;
    const at = enemy(h, { x: s.layers[0]!.x + WALL.depth + 8, y: SEGMENT_HEIGHT / 2 });
    const ops = trace({ ...s, enemies: [at] }).ops.filter((o) => o.op === 'image');
    const stakes = ops.findIndex((o) => o.id === BASE_ART.spikes);
    const walker = ops.findIndex((o) => ENEMY_ART.shambler.walk.includes(o.id as never));
    expect(stakes).toBeGreaterThanOrEqual(0);
    expect(walker).toBeGreaterThan(stakes);
  });

  it('a repair’s three crosses float up as they fade, and stay put with Reduce motion', () => {
    /** Each cross's middle, from its horizontal stroke's two ends. */
    const crosses = (repairAt: number, reduced: boolean) => {
      const r = recorder();
      const moves: { x: number; y: number; style: string }[] = [];
      const ctx = r.ctx as unknown as { strokeStyle: string };
      Object.assign(r.ctx, {
        moveTo: (x: number, y: number) => moves.push({ x, y, style: ctx.strokeStyle }),
      });
      const anim = new Animator();
      anim.reduced = reduced;
      drawScene(r.ctx, r.art, fight({ hp: 200, repairAt }), CAM, VIEW, null, null, null, anim);
      return moves.filter((m) => m.style === '#7fe08c').filter((_, k) => k % 2 === 0);
    };
    const fresh = crosses(10, false);
    expect(fresh).toHaveLength(3);
    const later = crosses(10 - WALL_CARD.repair.time / 2, false);
    later.forEach((m, k) => expect(m.y).toBeLessThan(fresh[k]!.y));
    // Reduce motion: the same spots at any age.
    expect(crosses(10 - WALL_CARD.repair.time / 2, true)).toEqual(crosses(10, true));
    expect(crosses(10, true)).toEqual(fresh);
    expect(crosses(10 - WALL_CARD.repair.time - 1e-9, false)).toHaveLength(0);
  });

  it('a game speed under 1× never shortens the pulse below its real time', () => {
    const pulse = (pace: number) =>
      fills(fight({}, { barrierAt: 10 - WALL_CARD.pulse.time / 2, pace }), '#b8f4ec');
    expect(pulse(0.5)).toEqual(pulse(1));
    expect(pulse(0.5)[0]!.alpha).toBeCloseTo(WALL_CARD.pulse.alpha, 9);
  });

  it('the sliding gate shows the barrier cards like any segment', () => {
    const gate = fight(
      { kind: 'gate', tier: 'wood' },
      { taken: ['spiked-walls', 'reinforce'], barrierAt: 9.7 },
    );
    expect(images(gate, TIER_ART.wood.gate)).toHaveLength(1);
    expect(images(gate, BASE_ART.spikes)).toHaveLength(1);
    expect(images(gate, BASE_ART.brace)).toHaveLength(2);
    expect(fills(gate, '#b8f4ec')).toHaveLength(2);
  });
});

describe('damage numbers (ID-082)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());

  const pop = (p: Partial<Pop> = {}): Pop => ({
    x: 600,
    y: 360,
    amount: 6,
    crit: false,
    on: 'shambler',
    key: 'e1',
    at: 1,
    ...p,
  });

  it('shows a hit rounded (at least 1), a crit bigger, gold and with "!", a blow on the wall as a loss', () => {
    const plain = popLook(pop({ amount: 6.2 }), 1, 1, false)!;
    expect(plain).toMatchObject({ text: '6', colour: '#f4f1ea', alpha: 1, rise: 0 });
    expect(popLook(pop({ amount: 0.2 }), 1, 1, false)!.px).toBe(POP.size);
    expect(popLook(pop({ amount: 0.2 }), 1, 1, false)!.text).toBe('1');
    const crit = popLook(pop({ amount: 12, crit: true }), 1, 1, false)!;
    expect(crit.text).toBe('12!');
    expect(crit.colour).toBe('#ffd23f');
    expect(crit.px).toBeGreaterThan(popLook(pop({ amount: 12 }), 1, 1, false)!.px);
    const wall = popLook(pop({ amount: 5, on: 'wall', key: 'w0:5' }), 1, 1, false)!;
    expect(wall).toMatchObject({ text: '−5', colour: '#ff8a7a' });
  });

  it('a bigger hit is a bigger number, up to POP.big at POP.bigAt', () => {
    const px = (amount: number) => popLook(pop({ amount }), 1, 1, false)!.px;
    expect(px(4)).toBeLessThanOrEqual(px(20));
    expect(px(20)).toBeLessThan(px(POP.bigAt));
    expect(px(POP.bigAt)).toBe(POP.big);
    expect(px(10 * POP.bigAt)).toBe(POP.big);
  });

  it('rises and fades over POP.life real seconds at any game speed, then is gone', () => {
    const at = (age: number, pace = 1) => popLook(pop({ at: 0 }), age, pace, false);
    expect(at(-0.01)).toBeNull();
    expect(at(POP.life / 4)!).toMatchObject({ alpha: 1, rise: POP.rise / 4 });
    expect(at(POP.life * 0.75)!.alpha).toBeCloseTo(0.5, 9);
    expect(at(POP.life)).toBeNull();
    // At 3× the same look comes three times the fight time later.
    expect(at((3 * POP.life) / 4, 3)).toEqual(at(POP.life / 4));
    expect(at(3 * POP.life, 3)).toBeNull();
  });

  it('is kept by the sim at least as long as it shows at the top speed', () => {
    expect(POP.life * Math.max(...SPEEDS)).toBeLessThanOrEqual(DAMAGE_POP.keep);
  });

  it('a crit is POP.crit times bigger, and lands bigger still, settling over POP.punch.time', () => {
    const px = (crit: boolean, age: number, still = false) =>
      popLook(pop({ amount: 12, crit, at: 0 }), age, 1, still)!.px;
    const settled = px(true, POP.punch.time);
    // Sizes are whole px, so each is within 1 of the exact scale.
    expect(Math.abs(settled - px(false, POP.punch.time) * POP.crit)).toBeLessThanOrEqual(1);
    expect(settled).toBeGreaterThanOrEqual(px(false, 0) * 1.5);
    expect(Math.abs(px(true, 0) - settled * (1 + POP.punch.extra))).toBeLessThanOrEqual(1);
    expect(px(true, POP.punch.time / 2)).toBeLessThan(px(true, 0));
    expect(px(true, POP.punch.time / 2)).toBeGreaterThan(settled);
    expect(px(true, POP.life / 2)).toBe(settled);
    // Reduce motion: no punch, just the bigger size.
    expect(px(true, 0, true)).toBe(settled);
  });

  it("a wall's loss grows to POP.big by POP.wallBigAt and never staggers", () => {
    const wall = (amount: number, at = 1) =>
      popLook(pop({ amount, on: 'wall', key: 'w0:1', at }), at, 1, false)!;
    expect(wall(POP.wallBigAt).px).toBe(POP.big);
    expect(wall(5).px).toBeLessThan(wall(POP.wallBigAt).px);
    for (let k = 0; k < 3; k++) expect(wall(5, k * DAMAGE_POP.merge).dx).toBe(0);
  });

  it('numbers from one spot in the next merge windows sit apart: left, centre, right', () => {
    const dx = (at: number) => popLook(pop({ at }), at, 1, false)!.dx;
    const w = DAMAGE_POP.merge;
    const xs = [0, 1, 2, 3].map((k) => dx(k * w));
    expect(new Set(xs.slice(0, 3))).toEqual(new Set([-POP.stagger, 0, POP.stagger]));
    expect(xs[3]).toBe(xs[0]);
    // Anywhere in one window, the same place.
    expect(dx(w * 1.01)).toBe(dx(w * 1.99));
    // A crit, being bigger, sits further out.
    const critDx = (at: number) => popLook(pop({ at, crit: true }), at, 1, false)!.dx;
    expect(new Set([0, 1, 2].map((k) => critDx(k * w)))).toEqual(
      new Set([-POP.critStagger, 0, POP.critStagger]),
    );
    expect(POP.critStagger).toBeGreaterThan(POP.stagger);
  });

  it('reduce motion: fades in place instead of rising', () => {
    const look = popLook(pop({ at: 0 }), POP.life * 0.75, 1, true)!;
    expect(look.rise).toBe(0);
    expect(look.alpha).toBeCloseTo(0.5, 9);
  });

  it('shows at most POP.cap, the newest, and none gone', () => {
    const many = Array.from({ length: POP.cap + 6 }, (_, i) => pop({ key: `e${i}`, at: 1 }));
    const gone = pop({ key: 'old', at: 0 });
    const shown = shownPops([gone, ...many], 0.5 + POP.life, 1);
    expect(shown).toEqual(many.slice(6));
  });

  /** Every text drawn (filled or edged) with its y, in order, and the fill colour then set. */
  const texts = (scene: Scene, anim: Animator | null = null) => {
    const r = recorder();
    type Drawn = { text: string; x: number; y: number; fill: string; how: string; align: string };
    const drawn: Drawn[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string; textAlign: string };
    Object.assign(r.ctx, {
      fillText: (text: string, x: number, y: number) =>
        drawn.push({ text, x, y, fill: ctx.fillStyle, how: 'fill', align: ctx.textAlign }),
      strokeText: (text: string, x: number, y: number) =>
        drawn.push({ text, x, y, fill: ctx.fillStyle, how: 'stroke', align: ctx.textAlign }),
      measureText: (t: string) => ({ width: t.length * 6 }),
    });
    const cam = frameCamera({ w: 1280, h: 720 });
    drawScene(r.ctx, r.art, scene, cam, { w: 1280, h: 720 }, null, null, null, anim);
    return drawn;
  };
  const squad = (): Scene => {
    const g = newGame('horde');
    const roster = [{ ...recruit(1), xp: 0 }];
    return startSquadHorde({ ...g, roster, camp: { ...g.camp, recruits: 1 } }, 7, 0);
  };

  it('draws each number on a dark edge, under every name tag so none is hidden', () => {
    const base = squad();
    const scene: Scene = {
      ...base,
      pops: [
        pop({ amount: 7, at: base.time }),
        pop({ amount: 9, on: 'wall', key: 'w0:3', at: base.time }),
      ],
    };
    const drawn = texts(scene);
    const name = base.defenders[0]!.name;
    const order = drawn.map((d) => `${d.how}:${d.text}`);
    expect(order).toEqual(['stroke:7', 'fill:7', 'stroke:−9', 'fill:−9', `fill:${name}`]);
    expect(drawn[1]!.fill).toBe('#f4f1ea');
    expect(drawn[3]!.fill).toBe('#ff8a7a');
  });

  it('draws every crit after the plain hits, so a newer plain number never paints over one', () => {
    const base = squad();
    const scene: Scene = {
      ...base,
      pops: [
        pop({ amount: 6, key: 'e1', at: base.time - 0.3 }),
        pop({ amount: 12, crit: true, key: 'e1', at: base.time - 0.2 }),
        pop({ amount: 7, key: 'e1', at: base.time }),
      ],
    };
    const fills = texts(scene).filter((d) => d.how === 'fill' && /^\d/.test(d.text));
    expect(fills.map((d) => d.text)).toEqual(['6', '7', '12!']);
  });

  it("puts a wall's loss right-aligned just on the camp side of the wall, an enemy's centred", () => {
    const base = squad();
    const layer = base.layers[0]!;
    const cam = frameCamera({ w: 1280, h: 720 });
    const y = 3.5 * SEGMENT_HEIGHT;
    const scene: Scene = {
      ...base,
      pops: [
        pop({ amount: 9, on: 'wall', key: 'w0:3', x: layer.x, y, at: base.time }),
        pop({ amount: 7, x: 600, y: 360, at: base.time }),
      ],
    };
    const drawn = texts(scene).filter((d) => d.how === 'fill');
    const wall = drawn.find((d) => d.text === '−9')!;
    expect(wall.align).toBe('right');
    const face = project({ x: layer.x, y, z: 0 }, cam).sx;
    expect(wall.x).toBeCloseTo(face - POP.gap, 6);
    expect(drawn.find((d) => d.text === '7')!.align).toBe('center');
  });

  it('none in the build scene or with no numbers', () => {
    expect(texts(squad()).filter((d) => d.how === 'stroke')).toEqual([]);
  });

  it('floats up as it ages, but stays put with reduce motion on', () => {
    const base = squad();
    const yAt = (age: number, reduced: boolean) => {
      const anim = new Animator();
      anim.reduced = reduced;
      const scene: Scene = { ...base, time: base.time + age, pops: [pop({ at: base.time })] };
      return texts(scene, anim).find((d) => d.text === '6')!.y;
    };
    expect(yAt(POP.life / 2, false)).toBeCloseTo(yAt(0, false) - POP.rise / 2, 6);
    expect(yAt(POP.life / 2, true)).toBeCloseTo(yAt(0, true), 6);
  });
});

describe('speech bubbles (ID-085)', () => {
  beforeEach(stubCanvas);
  afterEach(() => vi.unstubAllGlobals());
  const squad = (): Scene => {
    const g = newGame('horde');
    const roster = [{ ...recruit(1), xp: 0 }];
    return startSquadHorde({ ...g, roster, camp: { ...g.camp, recruits: 1 } }, 7, 0);
  };
  const bubble = (d: Defender, over: Partial<Bubble> = {}): Bubble => ({
    by: d.id,
    event: 'reload',
    line: 'Reloading!',
    at: 0,
    x: d.x,
    y: d.y,
    postId: d.walking ? null : d.postId,
    plain: d.plain === true,
    ...over,
  });

  it('grows in, holds, then fades over its last moment, gone after 1.5 s', () => {
    const b = { at: 1 } as Bubble;
    expect(bubbleLook(b, 0.99, false)).toBeNull();
    expect(bubbleLook(b, 1, false)).toEqual({ scale: BUBBLE.from, alpha: 1 });
    expect(bubbleLook(b, 1 + BUBBLE.grow / 2, false)!.scale).toBeCloseTo((1 + BUBBLE.from) / 2, 9);
    expect(bubbleLook(b, 1.7, false)).toEqual({ scale: 1, alpha: 1 });
    expect(bubbleLook(b, 1 + CHAT.life - BUBBLE.fade / 2, false)!.alpha).toBeCloseTo(0.5, 9);
    expect(bubbleLook(b, 1 + CHAT.life, false)).toBeNull();
  });

  it('with reduce motion it just shows for its life and goes', () => {
    const b = { at: 1 } as Bubble;
    for (const t of [1, 1.01, 2, 1 + CHAT.life - 0.01]) {
      expect(bubbleLook(b, t, true)).toEqual({ scale: 1, alpha: 1 });
    }
    expect(bubbleLook(b, 1 + CHAT.life, true)).toBeNull();
  });

  /** Every text drawn and every name plate rect, in draw order. */
  const draw = (scene: Scene, cam: Camera) => {
    const r = recorder();
    const order: string[] = [];
    const ys: Record<string, number> = {};
    const at: Record<string, { x: number; y: number }> = {};
    const plates: { y: number; h: number }[] = [];
    const ctx = r.ctx as unknown as { fillStyle: string };
    // A bubble draws about its tail's point: the last translate before its text.
    let moved = { x: 0, y: 0 };
    Object.assign(r.ctx, {
      translate: (x: number, y: number) => (moved = { x, y }),
      fillText: (text: string, _x: number, y: number) => {
        order.push(text);
        ys[text] = y;
        at[text] = moved;
      },
      fillRect: (_x: number, y: number, _w: number, h: number) => {
        if (ctx.fillStyle === 'rgba(21, 23, 26, 0.6)' && h === PLATE_H) plates.push({ y, h });
      },
      measureText: (t: string) => ({ width: t.length * 6 }),
    });
    drawScene(r.ctx, r.art, scene, cam, { w: 1280, h: 720 });
    return { order, ys, at, plates };
  };

  it('draws each line over its survivor, above the name tag and the reload pie, under the damage numbers and names', () => {
    const base = squad();
    const d = base.defenders[0]!;
    const cam = frameCamera({ w: 1280, h: 720 });
    const scene: Scene = {
      ...base,
      chat: { bubbles: [bubble(d)], clock: 0.5 },
      pops: [
        {
          x: d.x + 100,
          y: d.y,
          amount: 7,
          crit: false,
          on: 'shambler',
          key: 'e1',
          at: base.time,
        },
      ],
    };
    const { order, ys, at, plates } = draw(scene, cam);
    expect(order).toEqual(['Reloading!', '7', d.name]);
    const tip = bubbleTip(bubble(d), base.layers, base.posts, cam);
    // The text sits over the tail's point, and the point clears the plate and the pie's spot.
    // Drawn about the card's centre: the tail's length over the tip, slid into the view.
    const w = 'Reloading!'.length * 6 + 2 * BUBBLE.padX;
    expect(at['Reloading!']).toEqual({
      x: tip.sx + bubbleShift(tip.sx, w, 1280),
      y: tip.sy - BUBBLE.tail - BUBBLE.h / 2,
    });
    expect(ys['Reloading!']).toBe(0);
    expect(plates.length).toBeGreaterThan(0);
    const plateTop = Math.min(...plates.map((p) => p.y));
    expect(tip.sy).toBeLessThanOrEqual(
      plateTop - RELOAD_PIE.gap - 2 * (RELOAD_PIE.r + RELOAD_PIE.edge),
    );
  });

  it('slides into the view at its edges, its tail still joined to the card', () => {
    expect(bubbleShift(640, 80, 1280)).toBe(0);
    expect(bubbleShift(30, 80, 1280)).toBe(BUBBLE.margin + 40 - 30);
    expect(bubbleShift(1260, 80, 1280)).toBe(1280 - BUBBLE.margin - 40 - 1260);
    // Right at the edge it still slides all the way in (the tail leans to reach it).
    expect(bubbleShift(2, 140, 1280)).toBe(BUBBLE.margin + 70 - 2);
    expect(bubbleShift(1280, 80, 1280)).toBe(-(BUBBLE.margin + 40));
  });

  it('stacks bubbles that would overlap: the higher rank keeps its spot, the other rises clear', () => {
    const spot = (tipX: number, tipY: number, rank: number) => ({ tipX, tipY, w: 80, rank });
    // Two survivors one over the other, 20 px apart.
    const [low, high] = bubbleLayout([spot(400, 300, 1), spot(410, 280, 9)], 1280);
    expect(high).toEqual({ dx: 0, lift: 0, hidden: false });
    // The lower one's card ends a gap over the higher one's card top.
    const highTop = 280 - BUBBLE.tail - BUBBLE.h;
    expect(300 - BUBBLE.tail - low!.lift).toBe(highTop - BUBBLE.gap);
    // Far apart: neither moves; a third pushed past both stacks over both.
    expect(bubbleLayout([spot(100, 300, 1), spot(600, 300, 1)], 1280).map((l) => l.lift)).toEqual([
      0, 0,
    ]);
    const three = bubbleLayout([spot(400, 300, 5), spot(400, 300, 5), spot(400, 300, 5)], 1280);
    const step = BUBBLE.h + BUBBLE.gap;
    expect(three.map((l) => l.lift)).toEqual([0, step, 2 * step]);
  });

  it("a lifted bubble keeps off other survivors' name tags; one pushed past the top hides", () => {
    const spot = (tipX: number, tipY: number, rank: number) => ({ tipX, tipY, w: 80, rank });
    // A name tag just over where the card would sit: the card rises clear of it.
    const tag = { x0: 380, x1: 440, y0: 260, y1: 290 };
    const [one] = bubbleLayout([spot(400, 300, 1)], 1280, [tag]);
    expect(300 - BUBBLE.tail - one!.lift).toBe(tag.y0 - BUBBLE.gap);
    expect(one!.hidden).toBe(false);
    // Its own tag sits under its tip: no lift.
    const own = { x0: 380, x1: 420, y0: 300 + BUBBLE.gap, y1: 330 };
    expect(bubbleLayout([spot(400, 300, 1)], 1280, [own])[0]!.lift).toBe(0);
    // Near the top, a second card has nowhere to go: hidden, and the first keeps its spot.
    const top = bubbleLayout([spot(400, 30, 9), spot(400, 30, 1)], 1280);
    expect(top.map((l) => l.hidden)).toEqual([false, true]);
  });

  it('a bubble on a raised post sits higher than one on the ground', () => {
    const game = newGame();
    const base = startHorde(game, 1, game.roster[0]!.id, 0, 0);
    const d = base.defenders[0]!;
    const cam = frameCamera({ w: 1280, h: 720 });
    const raised = base.posts.find((p) => postFloor(base.layers, p) > 0);
    expect(raised).toBeDefined();
    const onPost = bubbleTip(bubble(d, { postId: raised!.id }), base.layers, base.posts, cam);
    const walking = bubbleTip(bubble(d, { postId: null }), base.layers, base.posts, cam);
    expect(walking.sy - onPost.sy).toBeCloseTo(
      project({ x: 0, y: 0, z: 0 }, cam).sy -
        project({ x: 0, y: 0, z: postFloor(base.layers, raised!) }, cam).sy,
      9,
    );
  });

  it('draws nothing for a bubble past its life, or with no chat (build mode)', () => {
    const base = squad();
    const d = base.defenders[0]!;
    const cam = frameCamera({ w: 1280, h: 720 });
    const old = draw({ ...base, chat: { bubbles: [bubble(d)], clock: CHAT.life } }, cam);
    expect(old.order).toEqual([d.name]);
    expect(draw({ ...base }, cam).order).toEqual([d.name]);
  });
});

describe('a burning enemy’s fire (ID-089)', () => {
  const feet = { sx: 400, sy: 300 };
  const body = { h: 34, w: 30 };
  const look = (over: Partial<{ id: number; size: number; heat: number; clock: number }> = {}) =>
    fireLook(over.id ?? 3, over.size ?? 1, body, feet, STILL, over.heat ?? 1, over.clock ?? 2, CAM);
  const flames = (f: ReturnType<typeof fireLook>) => f.licks;
  const tall = (f: ReturnType<typeof fireLook>) => flames(f).reduce((n, k) => n + k.h, 0);

  it('flares up as it catches fire, burns steady, then dies down instead of popping off', () => {
    expect(burnHeat(5, {}, -Infinity)).toBe(0);
    expect(burnHeat(5, { burnUntil: 0 }, -Infinity)).toBe(0);
    // Alight with no known start (no animator): steady, no flare.
    expect(burnHeat(5, { burnUntil: 8 }, -Infinity)).toBe(1);
    // Just lit: it flares up over 1, then settles to 1.
    expect(burnHeat(5, { burnUntil: 8 }, 5)).toBe(1 + BURN.boost);
    const flare = burnHeat(5 + BURN.flare / 2, { burnUntil: 8 }, 5);
    expect(flare).toBeGreaterThan(1);
    expect(flare).toBeLessThan(1 + BURN.boost);
    expect(burnHeat(5 + BURN.flare, { burnUntil: 8 }, 5)).toBe(1);
    // Out: it fades over BURN.out.
    expect(burnHeat(8 + BURN.out / 2, { burnUntil: 8 }, 5)).toBeCloseTo(0.5, 9);
    expect(burnHeat(8 + BURN.out, { burnUntil: 8 }, 5)).toBe(0);
    expect(burnHeat(20, { burnUntil: 8 }, 5)).toBe(0);
    // Hit again while it dies down: it flares straight back up, never blinking out first.
    const dying = burnHeat(8 + BURN.out / 2, { burnUntil: 8 }, 5);
    const relit = 8 + BURN.out / 2;
    expect(burnHeat(relit, { burnUntil: relit + 3 }, relit)).toBeGreaterThan(dying);
  });

  it('is the same on a replay, differs from enemy to enemy, and moves over time', () => {
    expect(look()).toEqual(look());
    expect(look({ id: 4 })).not.toEqual(look());
    expect(look({ clock: 2.1 })).not.toEqual(look());
  });

  it('has more flames on a bigger body, from Crawler to Brute to the Horror', () => {
    const count = (kind: keyof typeof ENEMIES) =>
      flames(look({ size: ENEMIES[kind].radius / ENEMIES.shambler.radius })).length;
    expect(count('crawler')).toBeGreaterThanOrEqual(BURN.licks.min);
    expect(count('crawler')).toBeLessThan(count('shambler'));
    expect(count('shambler')).toBeLessThan(count('brute'));
    expect(count('brute')).toBeLessThanOrEqual(count('horror'));
    expect(count('horror')).toBe(BURN.licks.max);
  });

  it('sits on the body: within its width, above its feet, rising straight up', () => {
    for (let clock = 0; clock < 3; clock += 0.37) {
      const f = look({ clock });
      for (const k of flames(f)) {
        expect(Math.abs(k.x - feet.sx)).toBeLessThanOrEqual(body.w * BURN.body);
        expect(k.y).toBeLessThan(feet.sy);
        expect(k.y).toBeGreaterThanOrEqual(feet.sy - body.h);
        expect(k.h).toBeGreaterThanOrEqual(0);
      }
      expect(f.glow.y).toBeLessThan(feet.sy);
    }
  });

  it('follows the sprite as it flinches, bobs and falls', () => {
    const at = (pose: typeof STILL) => fireLook(3, 1, body, feet, pose, 1, 2, { ...CAM, zoom: 2 });
    const still = at(STILL);
    const moved = at({ ...STILL, dx: 3, lift: 2 });
    flames(moved).forEach((k, i) => {
      expect(k.x).toBeCloseTo(flames(still)[i]!.x + 6, 9);
      expect(k.y).toBeCloseTo(flames(still)[i]!.y - 4, 9);
    });
    // Fallen over (a quarter turn): the flames lie along the body, still rising up.
    const fallen = at({ ...STILL, rot: Math.PI / 2 });
    for (const k of flames(fallen)) {
      expect(Math.abs(k.y - feet.sy)).toBeLessThanOrEqual(body.w * BURN.body * 2);
      expect(k.x).toBeGreaterThan(feet.sx);
      expect(k.h).toBeGreaterThanOrEqual(0);
    }
  });

  it('flares bigger as it catches fire and shrinks as it dies down', () => {
    const steady = look();
    expect(tall(look({ heat: 1.5 }))).toBeGreaterThan(tall(steady));
    const dying = look({ heat: 0.4 });
    expect(tall(dying)).toBeLessThan(tall(steady));
    dying.layers.forEach((l, i) => expect(l.alpha).toBeCloseTo(steady.layers[i]!.alpha * 0.4, 9));
  });

  it('never fully covers the sprite: every layer is see-through, even in the flare-up', () => {
    const f = look({ heat: 1 + BURN.boost });
    for (const l of f.layers) expect(l.alpha).toBeLessThan(1);
    expect(f.glow.alpha).toBeLessThan(1);
    for (const s of f.smoke) expect(s.alpha).toBeLessThanOrEqual(BURN.smoke.alpha);
  });

  it('still shows at 0.5× zoom: every flame at least BURN.lick.least wide', () => {
    const small = fireLook(3, 0.75, { h: 8, w: 9 }, feet, STILL, 1, 2, { ...CAM, zoom: 0.5 });
    for (const k of flames(small)) expect(k.w).toBeGreaterThanOrEqual(BURN.lick.least);
    // A squat body's fire is sized to its width, not its short height.
    const squat = fireLook(3, 1, { h: 10, w: 40 }, feet, STILL, 1, 2, CAM);
    expect(squat.glow.r).toBeCloseTo(40 * BURN.squat * BURN.glow.r, 9);
  });

  describe('in the fight', () => {
    // A falling body's white flash needs a canvas.
    beforeEach(stubCanvas);
    afterEach(() => vi.unstubAllGlobals());
    function record() {
      const r = recorder();
      const ctx = r.ctx as unknown as Record<string, unknown> & {
        fillStyle: unknown;
        globalCompositeOperation: string;
      };
      const fills: { style: unknown; comp: string; alpha: number }[] = [];
      const curves: number[][] = [];
      Object.assign(ctx, {
        fillStyle: '',
        globalCompositeOperation: 'source-over',
        fill: () =>
          fills.push({
            style: ctx.fillStyle,
            comp: ctx.globalCompositeOperation,
            alpha: ctx.globalAlpha as number,
          }),
        bezierCurveTo: (...p: number[]) => curves.push(p),
        fillRect: () =>
          fills.push({
            style: ctx.fillStyle,
            comp: ctx.globalCompositeOperation,
            alpha: ctx.globalAlpha as number,
          }),
      });
      return { r, ctx, fills, curves };
    }
    const burningScene = (time: number, burnUntil: number, alive = true): Scene => {
      const s = blank();
      s.time = time;
      if (alive) enemy(s as unknown as HordeState, { id: 7, burnUntil });
      return s;
    };
    const flameFills = (fills: { style: unknown }[]) =>
      fills.filter((x) => x.style === BURN.layers[1][0]);

    it('draws its flames adding light, then puts the canvas back', () => {
      const { r, ctx, fills } = record();
      drawScene(r.ctx, r.art, burningScene(1, 3), CAM, VIEW);
      const at = fills.findIndex((x) => x.style === BURN.layers[0][0]);
      expect(at).toBeGreaterThan(0);
      // Its glow (a gradient), its three flame layers and its embers add light; the smoke doesn't.
      const fire = fills.slice(at - 1, at + 4);
      expect(fire.map((x) => (typeof x.style === 'string' ? x.style : 'glow'))).toEqual([
        'glow',
        ...BURN.layers.map((l) => l[0]),
        BURN.ember,
      ]);
      expect(fire.every((x) => x.comp === 'lighter')).toBe(true);
      expect(
        fills.filter((x) => x.style === BURN.smokeColour).every((x) => x.comp === 'source-over'),
      ).toBe(true);
      expect(ctx.globalCompositeOperation).toBe('source-over');
      // Its HP bar, drawn next, is as solid as ever.
      const bar = fills.slice(at).find((x) => x.style === '#c43b3b');
      expect(bar?.alpha).toBe(1);
    });

    it('holds its flames still with Reduce motion', () => {
      const flamesAt = (time: number, reduced: boolean) => {
        const anim = new Animator();
        anim.reduced = reduced;
        const { r, curves } = record();
        drawScene(r.ctx, r.art, burningScene(time, 9), CAM, VIEW, null, null, null, anim);
        return curves;
      };
      expect(flamesAt(2.7, true)).toEqual(flamesAt(2, true));
      expect(flamesAt(2.7, false)).not.toEqual(flamesAt(2, false));
    });

    it('keeps burning on a body as it falls, and is gone once it has', () => {
      const anim = new Animator();
      const { r, fills } = record();
      // It caught fire this frame: it flares up at once.
      drawScene(r.ctx, r.art, burningScene(1, 3), CAM, VIEW, null, null, null, anim);
      expect(flameFills(fills)).toHaveLength(1);
      fills.length = 0;
      drawScene(r.ctx, r.art, burningScene(1.1, 3), CAM, VIEW, null, null, null, anim);
      expect(flameFills(fills)).toHaveLength(1);
      fills.length = 0;
      drawScene(r.ctx, r.art, burningScene(1.2, 3, false), CAM, VIEW, null, null, null, anim);
      expect(anim.corpses).toHaveLength(1);
      expect(flameFills(fills)).toHaveLength(1);
      fills.length = 0;
      const gone = 1.2 + ANIM.fall.time;
      drawScene(r.ctx, r.art, burningScene(gone, 3, false), CAM, VIEW, null, null, null, anim);
      expect(flameFills(fills)).toHaveLength(0);
    });

    it('fades out after the burn ends rather than stopping at once', () => {
      const { r, fills } = record();
      drawScene(r.ctx, r.art, burningScene(3 + BURN.out / 2, 3), CAM, VIEW);
      expect(flameFills(fills)).toHaveLength(1);
      fills.length = 0;
      drawScene(r.ctx, r.art, burningScene(3 + BURN.out, 3), CAM, VIEW);
      expect(flameFills(fills)).toHaveLength(0);
    });
  });
});
