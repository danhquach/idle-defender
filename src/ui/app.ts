// Wires the game to the page: canvas, frame loop, camera and click input, the build
// panel between hordes and the HUD in a fight.
import { chooseCard } from '../core/cards.ts';
import { FIELD, type Stat } from '../core/data.ts';
import {
  finishHorde,
  newGame,
  recover,
  spendPoint,
  startHorde,
  type GameState,
} from '../core/game.ts';
import {
  enemyAt,
  layoutOf,
  moveDefender,
  setFocus,
  standing,
  tick,
  type HordeState,
} from '../core/horde.ts';
import { replaceInjured, skipReplace } from '../core/replace.ts';
import { browserStorage, loadSave, writeSave } from '../storage/save.ts';
import { createBuildPanel } from './build.ts';
import { createHud, defenderLabel, resultScreen } from './hud.ts';
import {
  clampCamera,
  fightHitAt,
  MARGIN_Y,
  slotAt,
  TILT,
  unproject,
  zoomAt,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';
import { drawScene, type Scene } from './render.ts';

/** Longest frame the sim will advance by: a stall never jumps the fight ahead. */
const MAX_DT = 0.1;
/** Keyboard pan speed in screen pixels per second. */
const PAN_SPEED = 600;
const WHEEL_ZOOM = 0.0015;
/** Pixels per wheel line, for wheels that report lines. */
const LINE_PX = 16;
/** A press that moves less than this (CSS px) before release is a click, not a drag. */
const CLICK_SLOP = 5;

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

  // The game between hordes is saved after every change; a fight is not, so a
  // reload mid-horde comes back to the camp as it was before it.
  const storage = browserStorage();
  const loaded = storage ? loadSave(storage) : { save: null, rejected: false };
  let game: GameState = loaded.save?.game ?? newGame();
  // The fight under way, or null in build mode.
  let horde: HordeState | null = null;
  // When the fight ended (ms): read once, so the screen and the rest timers agree.
  let endedAt: number | null = null;
  // Stat points spent on the result screen, applied with "Back to build".
  let spends: [string, Stat][] = [];
  let selected: SlotHit | null = null;
  // The defender picked in a fight, waiting for a post to walk to.
  let selectedDefender: string | null = null;

  const hud = createHud(
    root,
    (index) => {
      if (horde?.offer) horde = chooseCard(horde, index);
    },
    () => {
      if (!horde || endedAt === null) return;
      let next = finishHorde(game, horde, endedAt);
      for (const [id, stat] of spends) {
        const r = spendPoint(next, id, stat);
        if (r.ok) next = r.game;
      }
      spends = [];
      commit(next);
      toBuild();
    },
    (defenderId, postId) => {
      if (!horde?.replace) return;
      const sent = replaceInjured(horde, defenderId, postId);
      if (sent.ok) horde = sent.state;
      else hud.toast(sent.reason);
    },
    () => {
      if (horde?.replace) horde = skipReplace(horde);
    },
    (defenderId, stat) => {
      if (horde && endedAt !== null) spends.push([defenderId, stat]);
    },
  );
  const panel = createBuildPanel(
    root,
    (base, stock) => {
      // A build is the player moving on: an old line in the backup section goes,
      // except the warning that nothing is saved.
      if (storage) panel.notice('');
      commit({ ...game, base, stock });
      panel.show(game, selected);
    },
    (defenderId, postId) => {
      // The seed is the only randomness from outside the core.
      const now = Date.now();
      horde = startHorde(game, now, defenderId, postId, now);
      endedAt = null;
      spends = [];
      selected = null;
      selectedDefender = null;
      panel.hide();
      hud.show(true);
    },
    (loadedGame) => {
      commit(loadedGame);
      selected = null;
      panel.show(game, selected);
    },
    (next) => {
      commit(next);
      panel.show(game, selected);
    },
  );
  // Whether the last write was refused, so the next one that works can say so.
  let saveRefused = false;
  /** Takes `next` as the game and saves it; a refused write is said in the build panel. */
  function commit(next: GameState): void {
    game = next;
    if (!storage) return;
    const ok = writeSave(storage, game, Date.now());
    if (!ok) panel.notice("Couldn't save: this browser's storage is full or blocked.");
    else if (saveRefused) panel.notice('Saved.');
    saveRefused = !ok;
  }
  function toBuild(): void {
    horde = null;
    selected = null;
    selectedDefender = null;
    hud.show(false);
    panel.show(game, selected);
  }
  toBuild();
  if (!storage) panel.notice('Saving is off: this browser blocks storage. Keep the backup code.');
  else if (loaded.rejected) {
    panel.notice("Your save couldn't be read, so a new camp started. The old save is kept aside.");
  }

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

  // A fight isn't saved, and neither is its payout until "Back to build": while one
  // is on (or its result is up), leaving the page asks first.
  window.addEventListener('beforeunload', (e) => {
    if (horde) e.preventDefault();
  });

  const held = new Set<string>();
  const panKey = (e: KeyboardEvent): string | null => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return key in PAN_KEYS ? key : null;
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !horde && selected) {
      selected = null;
      panel.show(game, selected);
      return;
    }
    if (e.key === 'Escape' && horde && selectedDefender !== null) {
      selectedDefender = null;
      return;
    }
    const key = panKey(e);
    // A focused picker keeps its own arrow keys and type-ahead.
    if (!key || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLSelectElement) return;
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
  // In a fight a click on one of your defenders selects it; with one selected, a click
  // on a post sends it there (a refusal shows as a toast, unless a shambler is under the
  // click). Otherwise a click focuses the
  // shambler under it for every defender, or clears focus and selection on empty
  // ground. In build mode it opens the slot under it (or closes the menu).
  // Only finite canvas coordinates reach the hit tests, and only in-range grid slots
  // from `slotAt` reach the core.
  canvas.addEventListener('pointerup', (e) => {
    const click = e.isPrimary && press?.click === true;
    endDrag(e);
    if (!click || !Number.isFinite(e.offsetX) || !Number.isFinite(e.offsetY)) return;
    const ground = unproject({ sx: e.offsetX, sy: e.offsetY }, cam);
    if (horde) {
      const hit = fightHitAt(ground.x, ground.y, horde);
      if (hit && 'defenderId' in hit) {
        // Name who was picked once, not on every click of the same defender.
        const d = horde.defenders.find((x) => x.id === hit.defenderId);
        if (d && selectedDefender !== d.id) hud.toast(`${defenderLabel(d)} · click a post to move`);
        selectedDefender = hit.defenderId;
        return;
      }
      const enemyId = enemyAt(horde, ground.x, ground.y);
      if (hit && selectedDefender !== null) {
        const moved = moveDefender(horde, selectedDefender, hit.postId);
        if (moved.ok) {
          horde = moved.state;
          selectedDefender = null;
          return;
        }
        // A refused move over a shambler (one hitting the wall) is a focus click.
        if (enemyId === null) {
          hud.toast(moved.reason);
          return;
        }
      }
      if (enemyId === null) selectedDefender = null;
      horde = setFocus(horde, enemyId);
    } else {
      selected = slotAt(ground.x, ground.y, game.base);
      panel.show(game, selected);
    }
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
      if (horde) horde = tick(horde, dt);
      // A defender sent to the bench, or a finished fight, drops the selection.
      if (
        horde &&
        selectedDefender !== null &&
        (horde.outcome !== 'fighting' || !horde.defenders.some((d) => d.id === selectedDefender))
      ) {
        selectedDefender = null;
      }
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
    if (horde) {
      drawScene(ctx, horde, cam, view, null, selectedDefender);
      hud.update(horde);
      if (horde.outcome !== 'fighting' && endedAt === null) {
        endedAt = Date.now();
        hud.showResult(resultScreen(game, horde, endedAt));
      }
    } else {
      // Someone back from rest: redraw the start picker.
      const recovered = recover(game, Date.now());
      if (recovered !== game) {
        commit(recovered);
        panel.show(game, selected);
      }
      drawScene(ctx, buildScene(game, panel.choice(game)), cam, view, { selected });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** The base as build mode shows it: no horde, the start defender on the picked post. */
function buildScene(game: GameState, choice: { defenderId: string; postId: number } | null): Scene {
  const { layers, posts } = layoutOf(game.base);
  const post = choice ? posts[choice.postId] : undefined;
  const spec = game.roster.find((d) => d.id === choice?.defenderId);
  const defenders = post && spec ? [standing(spec, post, 0)] : [];
  if (post && spec) post.defenderId = spec.id;
  return { layers, posts, defenders, enemies: [], shots: [], focusId: null };
}
