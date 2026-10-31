// Wires the game to the page: canvas, frame loop, fixed camera and click input, the build
// panel between hordes and the HUD in a fight.
import { recruitArrivals, takeCampPick, type CampChoice } from '../core/camp.ts';
import { chooseCard, rerollLock, rerollOffer } from '../core/cards.ts';
import { SKILLS, type SkillId, type Stat } from '../core/data.ts';
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
import { settlePatrols } from '../core/patrol.ts';
import { loadBatteries, runGenerator } from '../core/power.ts';
import { advanceResearch } from '../core/research.ts';
import { replaceInjured, skipReplace } from '../core/replace.ts';
import { buy } from '../core/shop.ts';
import { skillLock, useSkill } from '../core/skills.ts';
import { browserStorage, loadSave, writeSave } from '../storage/save.ts';
import {
  readReduceMotion,
  readSpeed,
  SPEEDS,
  writeReduceMotion,
  writeSpeed,
  type Speed,
} from '../storage/settings.ts';
import { Animator } from './anim.ts';
import { createBuildPanel, FIELD_GREW } from './build.ts';
import {
  buildCamera,
  EASE_MS,
  easeCamera,
  fenceTier,
  ghostsOf,
  plotsOf,
  targetAt,
} from './buildscene.ts';
import { createHud, defenderLabel, resultScreen, SPEED_KEYS } from './hud.ts';
import { createMenu, SAVE_STATUS } from './menu.ts';
import { recruitNotice } from './roster.ts';
import {
  fightHitAt,
  frameCamera,
  FRAME,
  project,
  unproject,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';
import { drawScene, type Aim, type CampView, type Scene } from './render.ts';
import type { Art } from './sprites.ts';

/** Longest frame the sim will advance by: a stall never jumps the fight ahead. */
const MAX_DT = 0.1;
/** A press that moves less than this (CSS px) before release is a click, not a drag. */
const CLICK_SLOP = 5;

/**
 * What Esc does, first match wins: put an armed skill away, close the open slot, drop
 * the picked defender; with none of those, open the menu.
 */
export function escapeAction(s: {
  fighting: boolean;
  armed: boolean;
  slot: boolean;
  defender: boolean;
}): 'disarm' | 'slot' | 'defender' | 'menu' {
  if (s.fighting && s.armed) return 'disarm';
  if (!s.fighting && s.slot) return 'slot';
  if (s.fighting && s.defender) return 'defender';
  return 'menu';
}

/**
 * Real seconds this frame covers: none on the first frame after a pause (a hidden tab,
 * the open menu, Space) or while paused, and never more than MAX_DT.
 */
export function frameStep(last: number | null, now: number, paused: boolean): number {
  return last === null || paused ? 0 : Math.min(MAX_DT, (now - last) / 1000);
}

export function start(root: HTMLElement, art: Art): void {
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
  // What the fight's animation remembers between frames (anim.ts); a new fight resets it.
  const animator = new Animator();
  animator.reduced = readReduceMotion(
    storage,
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  // When the fight ended (ms): read once, so the screen and the rest timers agree.
  let endedAt: number | null = null;
  // Stat points spent on the result screen, applied with "Back to build".
  let spends: [string, Stat][] = [];
  // Camp-level picks (or a survivor let in) on the result screen, applied in order with "Back to build".
  let campPicks: CampChoice[] = [];
  let selected: SlotHit | null = null;
  // The defender picked in a fight, waiting for a post to walk to.
  let selectedDefender: string | null = null;
  // The skill waiting for a click on the field to aim it (design §4).
  let armed: SkillId | null = null;
  // Where the pointer is over the canvas (CSS px), for the armed skill's reach.
  let hover: { sx: number; sy: number } | null = null;
  // Fight speed, kept between hordes, and the Space pause, which each fight starts without (ID-062).
  let speed: Speed = readSpeed(storage);
  let held = false;

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
      for (const id of campPicks) {
        const r = takeCampPick(next, id);
        // The HUD counts room as the core does, so a refusal is a bug: say so, and the
        // offer and those after it stay for the roster.
        if (!r.ok) {
          hud.toast(r.reason);
          break;
        }
        next = r.game;
      }
      campPicks = [];
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
    (item) => {
      if (!horde) return;
      const r = buy(horde, item);
      if (r.ok) horde = r.state;
      else hud.toast(r.reason);
    },
    (skill) => {
      if (!horde) return;
      // A skill with nothing to aim goes off at once (its aim point is ignored).
      if (SKILLS[skill].aim === 'none') {
        const used = useSkill(horde, skill, 0, 0);
        if (used.ok) horde = used.state;
        else hud.toast(used.reason);
        armed = null;
        return;
      }
      // A second click on the armed skill puts it away.
      const lock = skillLock(horde, skill);
      if (lock) hud.toast(lock);
      armed = lock || armed === skill ? null : skill;
      if (armed) selectedDefender = null;
    },
    () => {
      if (horde && rerollLock(horde) === null) horde = rerollOffer(horde);
    },
    (id) => {
      if (horde && endedAt !== null) campPicks.push(id);
    },
    (next) => setSpeed(next),
  );
  function setSpeed(next: Speed): void {
    if (next !== speed) writeSpeed(storage, next);
    speed = next;
    hud.speed(speed, held);
  }
  function hold(on: boolean): void {
    held = on;
    hud.speed(speed, held);
  }
  hud.speed(speed, held);
  const panel = createBuildPanel(
    root,
    (base, stock) => {
      // A build is the player moving on: an old line at the foot of the panel goes.
      panel.notice('');
      commit({ ...game, base, stock });
      panel.show(game, selected);
    },
    (defenderId, postId) => {
      // The seed is the only randomness from outside the core.
      const now = Date.now();
      horde = startHorde(game, now, defenderId, postId, now);
      endedAt = null;
      spends = [];
      campPicks = [];
      selected = null;
      selectedDefender = null;
      canvas.style.cursor = '';
      hold(false);
      // Into the fight frame: eased from the build frame, a hard cut with Reduce motion on.
      ease = animator.reduced ? null : { from: buildCam, at: null };
      panel.hide();
      hud.show(true);
      menu.refresh();
    },
    (next) => {
      commit(next);
      panel.show(game, selected);
    },
  );
  /** Another camp from the menu (a loaded code, a new camp): saved and shown. */
  function replaceCamp(next: GameState): void {
    commit(next);
    selected = null;
    panel.forget();
    panel.notice('');
    panel.show(game, selected);
  }
  const menu = createMenu(root, {
    state: () => ({ game, fighting: horde !== null, held }),
    onLoad: replaceCamp,
    onNewCamp: replaceCamp,
    reduceMotion: animator.reduced,
    onReduceMotion: (on) => {
      animator.reduced = on;
      writeReduceMotion(storage, on);
    },
  });
  /** Takes `next` as the game and saves it; the menu's Save tab says how that went. */
  function commit(next: GameState): void {
    game = next;
    if (storage) menu.status(writeSave(storage, game, Date.now()) ? 'ok' : 'failed');
    menu.refresh();
  }
  // Two fixed frames (ID-064, ID-065), fitted to the window: nothing pans or zooms. The
  // build scene fits left of the build panel; a fight shows the fight frame.
  let view: View = { w: 0, h: 0 };
  let fightCam: Camera = { x: 0, y: 0, zoom: 1 };
  let buildCam: Camera = fightCam;
  // The camera drawn last, which clicks land through.
  let cam: Camera = fightCam;
  // Start Horde's ease from the build frame; `at` is the first fight frame's time.
  let ease: { from: Camera; at: number | null } | null = null;
  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    view = { w: window.innerWidth, h: window.innerHeight };
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fightCam = frameCamera(view, hud.bottomSpace());
    buildCam = buildCamera(view, panel.room(view));
    cam = horde ? fightCam : buildCam;
  }
  resize();
  window.addEventListener('resize', resize);

  // "Back to build" swaps the scene while the result screen closes: a hard cut to the build frame.
  function toBuild(): void {
    horde = null;
    selected = null;
    selectedDefender = null;
    armed = null;
    ease = null;
    hold(false);
    hud.show(false);
    panel.show(game, selected);
    buildCam = buildCamera(view, panel.room(view));
    cam = buildCam;
    menu.refresh();
  }
  toBuild();
  if (!storage) menu.status('off');
  else if (loaded.rejected) {
    // Said in the build panel too, so it is seen without opening the menu.
    menu.status('rejected');
    panel.notice(SAVE_STATUS.rejected.text);
  } else if (loaded.save?.grew) {
    panel.notice(FIELD_GREW);
  }

  // A fight isn't saved, and neither is its payout until "Back to build": while one
  // is on (or its result is up), leaving the page asks first.
  window.addEventListener('beforeunload', (e) => {
    if (horde) e.preventDefault();
  });

  // Keys pressed inside the open menu stay in it (menu.ts); Esc opens it when it has
  // nothing else to cancel.
  document.addEventListener('keydown', (e) => {
    if (menu.isOpen() || e.key !== 'Escape') return;
    const act = escapeAction({
      fighting: horde !== null,
      armed: armed !== null,
      slot: selected !== null,
      defender: selectedDefender !== null,
    });
    if (act === 'disarm') armed = null;
    else if (act === 'slot') {
      selected = null;
      panel.show(game, selected);
    } else if (act === 'defender') selectedDefender = null;
    else if (!e.repeat) menu.open();
  });

  // In a fight with the menu shut, Space holds or resumes it and A S D set its speed
  // (ID-062). A typing field or a list keeps its keys; a focused button doesn't take
  // Space from the pause (some browsers press it on keyup, so that is stopped too). The
  // result screen's keys are its own.
  const fightKey = (e: KeyboardEvent): boolean => {
    if (horde?.outcome !== 'fighting' || menu.isOpen() || e.ctrlKey || e.metaKey || e.altKey) {
      return false;
    }
    const t = e.target;
    return !(
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement
    );
  };
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && fightKey(e)) e.preventDefault();
  });
  document.addEventListener('keydown', (e) => {
    if (!fightKey(e)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) hold(!held);
      return;
    }
    const next = SPEEDS.find((sp) => SPEED_KEYS[sp] === e.key.toUpperCase());
    if (next && !e.repeat) setSpeed(next);
  });

  // One primary pointer clicks: right-click and a second finger are ignored, and a
  // press that moves off its spot is no click.
  let press: { x: number; y: number; click: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    press = { x: e.clientX, y: e.clientY, click: true };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.isPrimary && Number.isFinite(e.offsetX) && Number.isFinite(e.offsetY)) {
      hover = { sx: e.offsetX, sy: e.offsetY };
    }
    if (!press || !e.isPrimary) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= CLICK_SLOP) press.click = false;
  });
  const endPress = (e: PointerEvent): void => {
    if (!e.isPrimary) return;
    press = null;
    // A finger lifted hovers nothing: no highlight left on a tapped slot.
    if (e.pointerType !== 'mouse') hover = null;
  };
  // In a fight with a skill armed, a click aims it there (a refusal shows as a toast)
  // and puts it away. Otherwise a click on one of your defenders selects it; with one
  // selected, a click on a post sends it there (a refusal shows as a toast, unless a
  // shambler is under the click). Otherwise a click focuses the shambler under it for
  // every defender, or clears focus and selection on empty ground. In build mode it
  // opens the slot under it (or closes the menu), or the part of the panel for the plot
  // under it. Only finite canvas coordinates reach the hit tests, and only in-range grid
  // slots from `slotAt` reach the core. In a fight nothing is drawn left of the frame, so
  // a click there lands on nothing: an armed skill stays armed.
  canvas.addEventListener('pointerup', (e) => {
    const click = e.isPrimary && press?.click === true;
    endPress(e);
    if (!click || !Number.isFinite(e.offsetX) || !Number.isFinite(e.offsetY)) return;
    const ground = unproject({ sx: e.offsetX, sy: e.offsetY }, cam);
    if (horde && ground.x < FRAME.left) return;
    if (horde && armed) {
      const used = useSkill(horde, armed, ground.x, ground.y);
      if (used.ok) horde = used.state;
      else hud.toast(used.reason);
      armed = null;
    } else if (horde) {
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
      const hit = targetAt(ground.x, ground.y, game.base, plotsOf(game));
      if (hit && 'plot' in hit) {
        selected = null;
        panel.reveal(game, hit.plot.opens);
      } else {
        selected = hit?.slot ?? null;
        panel.show(game, selected);
      }
    }
  });
  canvas.addEventListener('pointercancel', endPress);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
  });

  // A hidden tab, the open menu or Space doesn't advance the fight; it resumes from where it was.
  let last: number | null = null;
  document.addEventListener('visibilitychange', () => {
    last = null;
  });

  function frame(now: number): void {
    const paused = document.hidden || menu.isOpen() || held;
    const dt = frameStep(last, now, paused);
    last = paused ? null : now;
    if (dt > 0) {
      // Speed runs more of the core's fixed steps per frame, never longer ones; a pick
      // or replacement stops the rest of the frame's steps in the core.
      if (horde) horde = tick(horde, dt * speed);
      // A defender sent to the bench, or a finished fight, drops the selection.
      if (
        horde &&
        selectedDefender !== null &&
        (horde.outcome !== 'fighting' || !horde.defenders.some((d) => d.id === selectedDefender))
      ) {
        selectedDefender = null;
      }
    }
    if (horde) {
      // A pick, the end of the fight or a cooldown puts an armed skill away.
      if (armed && skillLock(horde, armed) !== null) armed = null;
      // Start Horde's ease: the camp shows until the clip has slid to the frame's edge.
      let t = 1;
      if (ease) {
        ease.at ??= now;
        t = (now - ease.at) / EASE_MS;
        if (t >= 1) ease = null;
      }
      cam = ease ? easeCamera(ease.from, fightCam, t) : fightCam;
      const aim: Aim | null =
        armed === 'airstrike' && hover ? { skill: armed, ...unproject(hover, cam) } : null;
      const edge = project({ x: FRAME.left, y: 0 }, fightCam).sx;
      drawScene(
        ctx,
        art,
        horde,
        cam,
        view,
        null,
        selectedDefender,
        aim,
        animator,
        ease ? campView(game) : null,
        ease ? Math.max(0, t) * edge : null,
      );
      hud.update(horde, armed);
      if (horde.outcome !== 'fighting' && endedAt === null) {
        endedAt = Date.now();
        hud.showResult(resultScreen(game, horde, endedAt));
      }
    } else {
      // Someone back from rest or patrol, a free recruit, or the generator burnt a Gas:
      // save and redraw.
      const now = Date.now();
      const settled = recruitArrivals(
        // Research done may raise the bank's cap: batteries waiting load into the room.
        settlePatrols(
          loadBatteries(runGenerator(advanceResearch(recover(game, now), now), now)),
          now,
        ),
        now,
      );
      if (settled !== game) {
        const arrived = settled.roster.filter(
          (d) => d.id.startsWith('recruit-') && !game.roster.some((r) => r.id === d.id),
        );
        if (arrived.length > 0) {
          panel.notice(recruitNotice(arrived.map((d) => d.name)));
        }
        commit(settled);
        panel.show(game, selected);
      }
      // Worked out each frame, so a build, a resize or a still pointer never leaves it stale.
      const plots = plotsOf(game);
      const under = hover ? unproject(hover, cam) : null;
      const target = under ? targetAt(under.x, under.y, game.base, plots) : null;
      canvas.style.cursor = target ? 'pointer' : '';
      const overlay = { selected, hover: target, ghosts: ghostsOf(game.base) };
      const scene = buildScene(game, panel.choice(game));
      const camp = { fence: fenceTier(game.base), plots };
      drawScene(ctx, art, scene, cam, view, overlay, null, null, null, camp);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** The camp around the field, read from the game: its fence's tier and its plots (ID-065). */
function campView(game: GameState): CampView {
  return { fence: fenceTier(game.base), plots: plotsOf(game) };
}

/** The base as build mode shows it: no horde, the start defender on the picked post. */
function buildScene(game: GameState, choice: { defenderId: string; postId: number } | null): Scene {
  const { layers, posts, turrets, traps } = layoutOf(game.base);
  const post = choice ? posts[choice.postId] : undefined;
  const spec = game.roster.find((d) => d.id === choice?.defenderId);
  const defenders = post && spec ? [standing(spec, post, 0)] : [];
  if (post && spec) post.defenderId = spec.id;
  // The bank as it stands, so build mode shows each turret lit or dark as the next fight starts.
  return {
    layers,
    posts,
    turrets,
    traps,
    energy: game.power.bank,
    defenders,
    enemies: [],
    strikes: [],
    bullets: [],
    shots: [],
    impacts: [],
    spits: [],
    bursts: [],
    arcs: [],
    pops: [],
    focusId: null,
    time: 0,
    outcome: 'fighting',
    fires: [],
    blasts: [],
  };
}
