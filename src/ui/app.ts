// Wires the sim to the page: canvas, frame loop, camera and focus input, and the HUD.
import { chooseCard } from '../core/cards.ts';
import { FIELD } from '../core/data.ts';
import {
  enemyAt,
  newHorde,
  setFocus,
  tick,
  type HordeSetup,
  type HordeState,
} from '../core/horde.ts';
import { createHud } from './hud.ts';
import {
  clampCamera,
  MARGIN_Y,
  TILT,
  unproject,
  zoomAt,
  type Camera,
  type View,
} from './projection.ts';
import { drawScene } from './render.ts';

/** Longest frame the sim will advance by: a stall never jumps the fight ahead. */
const MAX_DT = 0.1;
/** Keyboard pan speed in screen pixels per second. */
const PAN_SPEED = 600;
const WHEEL_ZOOM = 0.0015;
/** Pixels per wheel line, for wheels that report lines. */
const LINE_PX = 16;
/** A press that moves less than this (CSS px) before release is a click, not a drag. */
const CLICK_SLOP = 5;

// Placeholder starter roster (names are placeholders until the roster ticket).
const SETUP: HordeSetup = {
  hordeNumber: 1,
  roster: [
    { id: 'bob', name: 'Bob', weapon: 'pistol' },
    { id: 'jack', name: 'Jack', weapon: 'pistol' },
    { id: 'john', name: 'John', weapon: 'pistol' },
  ],
  startDefenderId: 'bob',
};

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

export function start(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'view';
  root.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('start: no 2D canvas context');
  const ctx: CanvasRenderingContext2D = context;

  // The seed is the only randomness from outside the core.
  let state: HordeState = newHorde(Date.now(), SETUP);
  const hud = createHud(
    root,
    (index) => {
      if (state.offer) state = chooseCard(state, index);
    },
    () => {
      state = newHorde(Date.now(), SETUP);
    },
  );

  let view: View = { w: 0, h: 0 };
  // Starts framed on the whole field (the first resize fits the zoom to the width).
  let cam: Camera = { x: 0, y: -MARGIN_Y, zoom: window.innerWidth / FIELD.right };
  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    view = { w: window.innerWidth, h: window.innerHeight };
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cam = clampCamera(cam, view);
  }
  resize();
  window.addEventListener('resize', resize);

  const held = new Set<string>();
  const panKey = (e: KeyboardEvent): string | null => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return key in PAN_KEYS ? key : null;
  };
  document.addEventListener('keydown', (e) => {
    const key = panKey(e);
    if (!key || e.ctrlKey || e.metaKey || e.altKey) return;
    held.add(key);
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    const key = panKey(e);
    if (key) held.delete(key);
  });
  window.addEventListener('blur', () => held.clear());

  // One primary pointer pans or clicks: right-click and a second finger are ignored.
  let drag: { x: number; y: number } | null = null;
  let press: { x: number; y: number; click: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    drag = { x: e.clientX, y: e.clientY };
    press = { x: e.clientX, y: e.clientY, click: true };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !press || !e.isPrimary) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= CLICK_SLOP) press.click = false;
    cam = clampCamera(
      {
        ...cam,
        x: cam.x - (e.clientX - drag.x) / cam.zoom,
        y: cam.y - (e.clientY - drag.y) / (cam.zoom * TILT),
      },
      view,
    );
    drag = { x: e.clientX, y: e.clientY };
  });
  const endDrag = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    drag = null;
    press = null;
  };
  // A click focuses the shambler under it for every defender, or clears the focus on
  // empty ground. Only finite canvas coordinates reach the core.
  canvas.addEventListener('pointerup', (e) => {
    const click = e.isPrimary && press?.click === true;
    endDrag(e);
    if (!click || !Number.isFinite(e.offsetX) || !Number.isFinite(e.offsetY)) return;
    const ground = unproject({ sx: e.offsetX, sy: e.offsetY }, cam);
    state = setFocus(state, enemyAt(state, ground.x, ground.y));
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Some mouse wheels report lines, not pixels.
      const dy = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * LINE_PX : e.deltaY;
      cam = zoomAt(cam, Math.exp(-dy * WHEEL_ZOOM), { sx: e.offsetX, sy: e.offsetY }, view);
    },
    { passive: false },
  );

  // A hidden tab doesn't advance the fight; coming back resumes from where it was.
  let last: number | null = null;
  document.addEventListener('visibilitychange', () => {
    last = null;
  });

  function frame(now: number): void {
    const dt = last === null || document.hidden ? 0 : Math.min(MAX_DT, (now - last) / 1000);
    last = document.hidden ? null : now;
    if (dt > 0) {
      state = tick(state, dt);
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        dx += PAN_KEYS[key]![0];
        dy += PAN_KEYS[key]![1];
      }
      if (dx || dy) {
        cam = clampCamera(
          {
            ...cam,
            x: cam.x + (dx * PAN_SPEED * dt) / cam.zoom,
            y: cam.y + (dy * PAN_SPEED * dt) / (cam.zoom * TILT),
          },
          view,
        );
      }
    }
    drawScene(ctx, state, cam, view);
    hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
