// Placeholder art (design §15): muted boxes for the base, saturated colour
// only on the horde. Canvas 2D, no rendering library.
import { CAMP, ENEMY_RADIUS, FIELD, SEGMENT_HEIGHT, WALL } from '../core/data.ts';
import type { HordeState } from '../core/horde.ts';
import { depthSort, project, type Camera, type View } from './projection.ts';

const COLOR = {
  sky: '#15171a',
  ground: '#2d2f31',
  wallTop: '#8a7f6c',
  wallFront: '#5e5546',
  brokenTop: '#4b4b4b',
  brokenFront: '#363636',
  campTop: '#6e675b',
  campFront: '#4a453c',
  postTop: '#655f55',
  postFront: '#45413a',
  defenderTop: '#7d9cc0',
  defenderFront: '#4f6f94',
  shadow: 'rgba(0, 0, 0, 0.35)',
  enemy: '#7ccf3a',
  focus: '#ffe066',
  hpBack: '#c43b3b',
  hpFill: '#5ec24a',
  shot: '#e8d36a',
} as const;

const WALL_HEIGHT = 40;
/** Gap drawn between wall segments so they read as separate pieces. */
const SEGMENT_GAP = 2;
const CAMP_BOX = { x0: CAMP.x - 90, x1: CAMP.x, height: 70 } as const;
const POST = { halfWidth: 16, halfDepth: 24, height: 50 } as const;
const DEFENDER = { halfWidth: 7, halfDepth: 10, height: 30 } as const;
const ENEMY = { radius: ENEMY_RADIUS * 0.85, z: 10 } as const;
const HP_BAR = { w: 24, h: 4, z: 30 } as const;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  height: number;
  top: string;
  front: string;
}

/** An extruded box: the top face, then the face toward the viewer. */
function drawBox(ctx: CanvasRenderingContext2D, b: Box, cam: Camera): void {
  const backTop = project({ x: b.x0, y: b.y0, z: b.z0 + b.height }, cam);
  const frontTop = project({ x: b.x1, y: b.y1, z: b.z0 + b.height }, cam);
  const frontBottom = project({ x: b.x1, y: b.y1, z: b.z0 }, cam);
  ctx.fillStyle = b.top;
  ctx.fillRect(backTop.sx, backTop.sy, frontTop.sx - backTop.sx, frontTop.sy - backTop.sy);
  ctx.fillStyle = b.front;
  ctx.fillRect(backTop.sx, frontTop.sy, frontTop.sx - backTop.sx, frontBottom.sy - frontTop.sy);
}

type Sprite = { y: number; x: number; draw: () => void };

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: HordeState,
  cam: Camera,
  view: View,
): void {
  ctx.fillStyle = COLOR.sky;
  ctx.fillRect(0, 0, view.w, view.h);

  const a = project({ x: 0, y: 0 }, cam);
  const b = project({ x: FIELD.right, y: FIELD.height }, cam);
  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);

  // The camp spans the whole field depth at the back: drawn before the sprites.
  drawBox(
    ctx,
    {
      x0: CAMP_BOX.x0,
      x1: CAMP_BOX.x1,
      y0: 0,
      y1: FIELD.height,
      z0: 0,
      height: CAMP_BOX.height,
      top: COLOR.campTop,
      front: COLOR.campFront,
    },
    cam,
  );

  const sprites: Sprite[] = [];
  for (const layer of state.layers) {
    for (const seg of layer.segments) {
      const broken = seg.hp <= 0;
      const y0 = seg.index * SEGMENT_HEIGHT;
      // Keyed just past the wall's front edge so enemies stopped at it draw on top.
      sprites.push({
        y: y0 + SEGMENT_HEIGHT / 2,
        x: layer.x + WALL.depth + 0.5,
        draw: () =>
          drawBox(
            ctx,
            {
              x0: layer.x,
              x1: layer.x + WALL.depth,
              y0: y0 + SEGMENT_GAP,
              y1: y0 + SEGMENT_HEIGHT - SEGMENT_GAP,
              z0: 0,
              height: broken ? WALL_HEIGHT * 0.3 : WALL_HEIGHT * (0.5 + 0.5 * (seg.hp / seg.maxHp)),
              top: broken ? COLOR.brokenTop : COLOR.wallTop,
              front: broken ? COLOR.brokenFront : COLOR.wallFront,
            },
            cam,
          ),
      });
    }
  }
  for (const post of state.posts) {
    const manned = post.defenderId !== null;
    sprites.push({
      y: post.y,
      x: post.x,
      draw: () => {
        drawBox(
          ctx,
          {
            x0: post.x - POST.halfWidth,
            x1: post.x + POST.halfWidth,
            y0: post.y - POST.halfDepth,
            y1: post.y + POST.halfDepth,
            z0: 0,
            height: POST.height,
            top: COLOR.postTop,
            front: COLOR.postFront,
          },
          cam,
        );
        if (!manned) return;
        drawBox(
          ctx,
          {
            x0: post.x - DEFENDER.halfWidth,
            x1: post.x + DEFENDER.halfWidth,
            y0: post.y - DEFENDER.halfDepth,
            y1: post.y + DEFENDER.halfDepth,
            z0: POST.height,
            height: DEFENDER.height,
            top: COLOR.defenderTop,
            front: COLOR.defenderFront,
          },
          cam,
        );
      },
    });
  }
  for (const e of state.enemies) {
    sprites.push({
      y: e.y,
      x: e.x,
      draw: () => {
        const ground = project({ x: e.x, y: e.y }, cam);
        const body = project({ x: e.x, y: e.y, z: ENEMY.z }, cam);
        const r = ENEMY.radius * cam.zoom;
        ctx.fillStyle = COLOR.shadow;
        ctx.beginPath();
        ctx.ellipse(ground.sx, ground.sy, r, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (e.id === state.focusId) {
          ctx.strokeStyle = COLOR.focus;
          ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
          ctx.beginPath();
          ctx.ellipse(ground.sx, ground.sy, r * 1.8, r * 1.8 * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = COLOR.enemy;
        ctx.beginPath();
        ctx.arc(body.sx, body.sy, r, 0, Math.PI * 2);
        ctx.fill();
        const bar = project({ x: e.x, y: e.y, z: HP_BAR.z }, cam);
        const w = HP_BAR.w * cam.zoom;
        const h = HP_BAR.h * cam.zoom;
        ctx.fillStyle = COLOR.hpBack;
        ctx.fillRect(bar.sx - w / 2, bar.sy, w, h);
        ctx.fillStyle = COLOR.hpFill;
        ctx.fillRect(bar.sx - w / 2, bar.sy, w * Math.max(0, e.hp / e.maxHp), h);
      },
    });
  }
  for (const sprite of depthSort(sprites)) sprite.draw();

  // Shots on top: from the defender's chest to the enemy's body.
  ctx.strokeStyle = COLOR.shot;
  ctx.lineWidth = Math.max(1, 2 * cam.zoom);
  for (const shot of state.shots) {
    const from = project(
      { x: shot.fromX, y: shot.fromY, z: POST.height + DEFENDER.height * 0.7 },
      cam,
    );
    const to = project({ x: shot.toX, y: shot.toY, z: ENEMY.z }, cam);
    ctx.beginPath();
    ctx.moveTo(from.sx, from.sy);
    ctx.lineTo(to.sx, to.sy);
    ctx.stroke();
  }
}
