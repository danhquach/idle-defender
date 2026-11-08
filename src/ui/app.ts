// Wires the game to the page: canvas, frame loop, fixed camera and click input, the build
// panel between hordes and the HUD in a fight.
import { recruitArrivals, takeCampPick, type CampChoice } from '../core/camp.ts';
import { chooseCard, rerollLock, rerollOffer } from '../core/cards.ts';
import { HORDE_ONLY, SKILLS, type SkillId, type Stat } from '../core/data.ts';
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
import {
  combineGuns,
  equipGun,
  finishSquadHorde,
  startSquadHorde,
  toggleSkill,
  type GunChoice,
} from '../core/hordeonly.ts';
import { settlePatrols } from '../core/patrol.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import { loadBatteries, runGenerator } from '../core/power.ts';
import { chatter, newChat } from '../core/chatter.ts';
import { advanceResearch } from '../core/research.ts';
import { replaceInjured, skipReplace } from '../core/replace.ts';
import { buy } from '../core/shop.ts';
import { skillLock, useSkill } from '../core/skills.ts';
import { browserStorage, loadSave, writeSave } from '../storage/save.ts';
import {
  readChatter,
  readHowToSeen,
  readReduceMotion,
  readSound,
  readSpeed,
  SPEEDS,
  writeChatter,
  writeHowToSeen,
  writeMute,
  writeReduceMotion,
  writeSpeed,
  writeVolume,
  type Speed,
} from '../storage/settings.ts';
import { Animator } from './anim.ts';
import { SoundEngine, STING } from './audio.ts';
import { createBuildPanel, FIELD_GREW, STATS_REFUNDED } from './build.ts';
import {
  buildCamera,
  EASE_MS,
  easeCamera,
  fenceTier,
  ghostsOf,
  plotsOf,
  targetAt,
} from './buildscene.ts';
import {
  createHud,
  defenderLabel,
  hordePicker,
  powerLine,
  resultScreen,
  fightKeyName,
  SKILL_KEYS,
  skillPicker,
  skillSlots,
  SPEED_KEYS,
  squadGear,
  squadScreen,
  squadStart,
} from './hud.ts';
import { createIntro } from './intro.ts';
import { COMBINE_WAIT, createInventory, GUNS_WAIT } from './inventory.ts';
import { createMenu, SAVE_STATUS } from './menu.ts';
import { recruitNotice } from './roster.ts';
import { createRoster, type Roster } from './squadroster.ts';
import { cuesBetween } from './sound.ts';
import {
  fightHitAt,
  frameCamera,
  FIGHT_FRAME,
  project,
  unproject,
  type Camera,
  type SlotHit,
  type View,
} from './projection.ts';
import { drawScene, forgetBackdrop, type Aim, type CampView, type Scene } from './render.ts';
import { TITLE_PICTURE, type Art } from './sprites.ts';

/** Longest frame the sim will advance by: a stall never jumps the fight ahead. */
const MAX_DT = 0.1;
/** A press that moves less than this (CSS px) before release is a click, not a drag. */
const CLICK_SLOP = 5;
/** How long the one-time stat refund note stays up, in ms (ID-084). */
const REFUND_TOAST_MS = 8000;

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
  // The backdrop's own canvas, shown beneath the scene's (ID-087): in a fight it is only
  // repainted when the camera or the window changes, not every frame.
  const backdrop = document.createElement('canvas');
  backdrop.className = 'view view-under';
  root.append(backdrop);
  const backdropCtx = backdrop.getContext('2d');

  // The game between hordes is saved after every change; a fight is not, so a
  // reload mid-horde comes back to the camp as it was before it.
  const storage = browserStorage();
  const loaded = storage ? loadSave(storage) : { save: null, rejected: false };
  let game: GameState = loaded.save?.game ?? newGame(HORDE_ONLY ? 'horde' : 'full');
  // The fight under way, or null in build mode.
  let horde: HordeState | null = null;
  // The horde the horde-only start or result screen has picked (ID-098): the next new horde,
  // or one already beaten; the next fight is this one.
  let picked = game.hordeNumber;
  // The horde-only build between hordes (ID-066): the next horde, set up but not started,
  // drawn behind its start screen.
  let preview: HordeState | null = null;
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
  // Sound (ID-080): it starts on the first click or key press, as browsers require; the
  // fight's cues come from comparing each frame's state with the last one heard.
  const soundSettings = readSound(storage);
  const sound = new SoundEngine(soundSettings);
  let heard: HordeState | null = null;
  // Chatter (ID-085): speech bubbles from the same frame-to-frame comparison, timed in real
  // seconds while the fight runs.
  let chatterLevel = readChatter(storage);
  let chat = newChat();
  const unlock = (): void => sound.unlock();
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      // Switching Mute on is silent (the box is ticked before this runs; ID-106).
      const muting =
        t instanceof HTMLInputElement && t.matches('#intro-mute, #menu-mute') && t.checked;
      if (
        !muting &&
        t instanceof Element &&
        t.closest('button, [role="tab"], input[type="checkbox"]')
      ) {
        sound.play('click');
      }
    },
    true,
  );

  const hud = createHud(
    root,
    (index) => {
      if (horde?.offer) horde = chooseCard(horde, index);
    },
    () => {
      if (HORDE_ONLY) {
        squadNext();
        return;
      }
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
      if (!horde || endedAt === null) return;
      spends.push([defenderId, stat]);
      showPicker();
    },
    (item) => {
      if (!horde) return;
      const r = buy(horde, item);
      if (r.ok) horde = r.state;
      else hud.toast(r.reason);
    },
    (skill) => arm(skill),
    () => {
      if (horde && rerollLock(horde) === null) horde = rerollOffer(horde);
    },
    (id) => {
      if (horde && endedAt !== null) campPicks.push(id);
    },
    (next) => setSpeed(next),
  );
  /** A skill's button or key (ID-100): one with nothing to aim goes off, else it is armed. */
  function arm(skill: SkillId): void {
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
  }
  // The skill pick (ID-100), between hordes only: saved at once, so it is there next time.
  hud.onSkillPick((skill) => {
    if (horde && endedAt === null) return;
    const r = toggleSkill(game, skill);
    if (!r.ok) hud.toast(r.reason);
    else commit(r.game);
    hud.showSkills(skillPicker(game.skillPick));
  });
  hud.onHordePick((n) => {
    picked = n;
    // The Inventory's Squad Power line compares with the horde picked.
    inventory.refresh();
  });
  /**
   * The horde-only result or start screen's button (ID-066): the stat points spent on the
   * result screen are saved (the horde itself was taken in when it ended), then the next
   * horde starts at once, or the same one again after a loss.
   */
  function squadNext(): void {
    if (horde) {
      if (endedAt === null) return;
      commit(pending());
    }
    // The seed is the only randomness from outside the core.
    const now = Date.now();
    // Whatever is picked starts: one that isn't open (a stale pick) falls back to the new horde.
    const open = Number.isInteger(picked) && picked >= 1 && picked <= game.hordeNumber;
    startFight(startSquadHorde(game, now, now, open ? picked : game.hordeNumber));
  }
  /** The horde picker redrawn off the squad as it stands, the pick kept (ID-098). */
  function showPicker(): void {
    const retry = horde && endedAt !== null && horde.outcome === 'lost' ? horde.hordeNumber : null;
    hud.showPicker(hordePicker(pending(), picked, retry, !horde));
  }
  /** The horde-only gun pickers (ID-067) for the game as it stands, between hordes only. */
  function showGear(): void {
    hud.showGear(squadGear(game), (defenderId, choice) => {
      if (horde && endedAt === null) return;
      const r = changeGun(defenderId, choice);
      if (!r.ok) {
        hud.toast(r.reason);
        showGear();
      }
    });
    // A new gun or a spent point moves Squad Power, so the picker's bands follow.
    showPicker();
  }
  /**
   * Gives survivor `defenderId` gun `choice` between hordes (the gun pickers, and the
   * Inventory's drag and drop, ID-095): saved at once, and the pickers redrawn.
   */
  function changeGun(
    defenderId: string,
    choice: GunChoice,
  ): { ok: true } | { ok: false; reason: string } {
    if (horde && endedAt === null) return { ok: false, reason: GUNS_WAIT };
    const r = equipGun(game, defenderId, choice);
    if (!r.ok) return r;
    commit(r.game);
    // The start screen's squad on the wall holds the new gun too.
    if (!horde) preview = startSquadHorde(game, 0, Date.now());
    showGear();
    return { ok: true };
  }
  /** Into fight `next`: from the build panel, or the horde-only start or result screen. */
  function startFight(next: HordeState): void {
    horde = next;
    preview = null;
    endedAt = null;
    spends = [];
    campPicks = [];
    selected = null;
    selectedDefender = null;
    canvas.style.cursor = '';
    hold(false);
    // Into the fight frame: eased from the build frame, a hard cut with Reduce motion on
    // or with no build frame (the horde-only build).
    ease = animator.reduced || HORDE_ONLY ? null : { from: buildCam, at: null };
    cam = fightCam;
    panel?.hide();
    if (HORDE_ONLY) {
      hud.fightPower(powerLine(squadPower(game), recommendedPower(next.hordeNumber)));
    }
    hud.show(true);
    refreshDialogs();
  }
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
  // The horde-only build has no build panel at all (ID-066), so nothing it opens (the
  // world map, patrols, research, the workbench, the camp, perks) can be reached.
  const panel = HORDE_ONLY
    ? null
    : createBuildPanel(
        root,
        (base, stock) => {
          // A build is the player moving on: an old line at the foot of the panel goes.
          panel?.notice('');
          commit({ ...game, base, stock });
          panel?.show(game, selected);
        },
        (defenderId, postId) => {
          // The seed is the only randomness from outside the core.
          const now = Date.now();
          startFight(startHorde(game, now, defenderId, postId, now));
        },
        (next) => {
          commit(next);
          panel?.show(game, selected);
        },
      );
  /** Another camp from the menu (a loaded code, a new camp): saved and shown. */
  function replaceCamp(next: GameState): void {
    commit(next);
    picked = game.hordeNumber;
    selected = null;
    if (!panel) {
      // The menu only loads a camp between hordes: its start screen is up.
      toBuild();
      return;
    }
    panel.forget();
    panel.notice('');
    panel.show(game, selected);
  }
  // The Inventory (ID-079) sits left of the Menu; either one open holds a fight.
  // Its Combine (ID-091, horde-only) works between hordes, like the gun pickers.
  const inventory = createInventory(root, {
    state: () => ({
      game,
      resumes: horde?.outcome === 'fighting' && !held,
      canCombine: !horde || endedAt !== null,
      // Squad Power against the horde under way, or the one picked (ID-098).
      ...(HORDE_ONLY ? { horde: horde && endedAt === null ? horde.hordeNumber : picked } : {}),
    }),
    onCombine: HORDE_ONLY
      ? (uids) => {
          if (horde && endedAt === null) return { ok: false, reason: COMBINE_WAIT };
          const r = combineGuns(game, uids);
          if (!r.ok) return r;
          commit(r.game);
          // The gun pickers list the stash: the new gun is there, the used ones gone.
          showGear();
          return { ok: true, weapon: r.weapon };
        }
      : undefined,
    // Drag and drop (ID-095), horde-only and between hordes, as the gun pickers.
    onEquip: HORDE_ONLY ? changeGun : undefined,
  });
  const menu = createMenu(root, {
    state: () => ({ game, fighting: horde !== null, held }),
    onLoad: replaceCamp,
    onNewCamp: replaceCamp,
    reduceMotion: animator.reduced,
    onReduceMotion: (on) => {
      animator.reduced = on;
      writeReduceMotion(storage, on);
    },
    sound: soundSettings,
    onVolume: (which, level) => {
      sound.setVolume(which, level);
      writeVolume(storage, which, level);
    },
    // A sample shot to hear the effects level by (the music is already playing).
    onVolumeSet: (which) => {
      if (which !== 'music') sound.play('shot-pistol');
    },
    onMute: (on) => {
      setMuted(on);
      intro.setMuted(on);
    },
    chatter: chatterLevel,
    onChatter: (level) => {
      chatterLevel = level;
      writeChatter(storage, level);
    },
    onHowToCard: () => intro.showCard(),
  });
  function setMuted(on: boolean): void {
    sound.setMuted(on);
    writeMute(storage, on);
  }
  /** The game with the points spent on the result screen so far (saved with its button). */
  function pending(): GameState {
    let next = game;
    for (const [id, stat] of spends) {
      const r = spendPoint(next, id, stat);
      if (r.ok) next = r.game;
    }
    return next;
  }
  // The Roster (ID-086), left of the Inventory, in the horde-only build: every survivor,
  // and each one's card. Its + spends a point between hordes: on the result screen with
  // the screen's own picks, on the start screen at once.
  const roster: Roster | null = HORDE_ONLY
    ? createRoster(root, {
        state: () => ({
          game: pending(),
          fight: horde?.outcome === 'fighting' ? horde : null,
          canSpend: !horde || endedAt !== null,
          resumes: horde?.outcome === 'fighting' && !held,
        }),
        onSpend: (id, stat) => {
          if (horde && endedAt === null) return;
          const r = spendPoint(pending(), id, stat);
          if (!r.ok) {
            hud.toast(r.reason);
            return;
          }
          if (horde) {
            spends.push([id, stat]);
            hud.syncPicks(r.game.roster);
            showPicker();
            refreshDialogs();
            return;
          }
          commit(r.game);
          // The start screen's squad on the wall stands with the new HP too.
          preview = startSquadHorde(game, 0, Date.now());
          showPicker();
        },
      })
    : null;
  // A survivor's name on the squad screen opens their card.
  root.addEventListener('click', (e) => {
    const t =
      e.target instanceof Element ? e.target.closest<HTMLElement>('[data-open-survivor]') : null;
    const id = t?.dataset.openSurvivor;
    if (roster && t && id !== undefined) roster.open(id, t);
  });
  const dialogOpen = (): boolean =>
    intro.isOpen() || menu.isOpen() || inventory.isOpen() || !!roster?.isOpen();
  function refreshDialogs(): void {
    menu.refresh();
    inventory.refresh();
    roster?.refresh();
  }
  /** Takes `next` as the game and saves it; the menu's Save tab says how that went. */
  function commit(next: GameState): void {
    game = next;
    if (storage) menu.status(writeSave(storage, game, Date.now()) ? 'ok' : 'failed');
    refreshDialogs();
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
    canvas.width = backdrop.width = Math.round(view.w * dpr);
    canvas.height = backdrop.height = Math.round(view.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdropCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Resizing cleared the backdrop's canvas.
    forgetBackdrop();
    fightCam = frameCamera(view, hud.bottomSpace());
    // The horde-only build shows the fight frame between hordes too.
    buildCam = panel ? buildCamera(view, panel.room(view)) : fightCam;
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
    if (!panel) {
      // The horde-only build (ID-066): the next horde's start screen over the squad on the wall.
      preview = startSquadHorde(game, 0, Date.now());
      hud.show(true);
      hud.update(preview);
      picked = picked >= 1 && picked <= game.hordeNumber ? picked : game.hordeNumber;
      hud.showResult(squadStart(game, picked));
      showGear();
      cam = buildCam = fightCam;
      refreshDialogs();
      return;
    }
    hud.show(false);
    panel.show(game, selected);
    buildCam = buildCamera(view, panel.room(view));
    cam = buildCam;
    refreshDialogs();
  }
  toBuild();
  if (!storage) menu.status('off');
  else if (loaded.rejected) menu.status('rejected');
  // The intro (ID-106) covers the camp at launch; the load's notes wait until it is gone,
  // and a new game started from it has none.
  let startedFresh = false;
  const intro = createIntro(root, {
    hasSave: loaded.save !== null,
    firstLaunch: loaded.save === null && !readHowToSeen(storage),
    muted: soundSettings.muted,
    onMute: (on) => {
      setMuted(on);
      menu.setMuted(on);
    },
    // Without a save the camp shown is already new: it is saved now, so the next launch
    // offers Continue (an unreadable save was kept aside on load, and its note still shows).
    onNewGame: () => {
      if (!loaded.save) {
        // The Save tab keeps saying an unreadable save was set aside, unless this write failed.
        if (!storage) return;
        const ok = writeSave(storage, game, Date.now());
        menu.status(!ok ? 'failed' : loaded.rejected ? 'rejected' : 'ok');
        return;
      }
      startedFresh = true;
      replaceCamp(newGame(HORDE_ONLY ? 'horde' : 'full'));
    },
    onCardSeen: () => writeHowToSeen(storage),
    backdrop: art[TITLE_PICTURE],
    onDone: () => {
      if (!startedFresh) loadNotes();
    },
  });
  function loadNotes(): void {
    if (loaded.rejected) {
      // Said in the build panel too, so it is seen without opening the menu.
      panel?.notice(SAVE_STATUS.rejected.text);
      if (!panel) hud.toast(SAVE_STATUS.rejected.text);
    } else if (loaded.save) {
      // Said once: the next save is the new version, the field grown and the points refunded.
      const notes = [
        ...(loaded.save.grew ? [FIELD_GREW] : []),
        ...(loaded.save.refunded ? [STATS_REFUNDED] : []),
      ].join(' ');
      if (panel && notes) panel.notice(notes);
      // A one-time note: up long enough to read (ID-084).
      else if (!panel && loaded.save.refunded) hud.toast(STATS_REFUNDED, REFUND_TOAST_MS);
    }
  }

  // A fight isn't saved, and neither is its payout until "Back to build": while one
  // is on (or its result is up), leaving the page asks first.
  // The horde-only build saves a horde as soon as it ends: only a fight still on asks.
  window.addEventListener('beforeunload', (e) => {
    if (horde && !(HORDE_ONLY && endedAt !== null)) e.preventDefault();
  });

  // Keys pressed inside the open menu stay in it (menu.ts); Esc opens it when it has
  // nothing else to cancel.
  document.addEventListener('keydown', (e) => {
    if (dialogOpen() || e.key !== 'Escape') return;
    const act = escapeAction({
      fighting: horde !== null,
      armed: armed !== null,
      slot: selected !== null,
      defender: selectedDefender !== null,
    });
    if (act === 'disarm') armed = null;
    else if (act === 'slot') {
      selected = null;
      panel?.show(game, selected);
    } else if (act === 'defender') selectedDefender = null;
    else if (!e.repeat) menu.open();
  });

  // In a fight with the menu shut, Space holds or resumes it and A S D set its speed
  // (ID-062). A typing field or a list keeps its keys; a focused button doesn't take
  // Space from the pause (some browsers press it on keyup, so that is stopped too). The
  // result screen's keys are its own.
  const fightKey = (e: KeyboardEvent): boolean => {
    if (horde?.outcome !== 'fighting' || dialogOpen() || e.ctrlKey || e.metaKey || e.altKey) {
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
    // Every fight key by its place (ID-100), so one press is one key on any layout.
    const name = fightKeyName(e);
    const next = SPEEDS.find((sp) => SPEED_KEYS[sp] === name);
    if (next && !e.repeat) setSpeed(next);
    // Horde-only (ID-100): Q and W use the picked skills, left to right as their buttons stand.
    const slot = SKILL_KEYS.indexOf(name);
    const skill = horde?.freeSkills ? skillSlots(horde)[slot] : undefined;
    if (slot >= 0 && skill && !e.repeat) arm(skill);
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
    if (horde && ground.x < FIGHT_FRAME.left) return;
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
        // A survivor on the firing line holds their slot (ID-068): nothing to move to.
        const fixed = d && horde.posts[d.postId]?.kind === 'line';
        if (d && selectedDefender !== d.id) {
          hud.toast(fixed ? defenderLabel(d) : `${defenderLabel(d)} · click a post to move`);
        }
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
    } else if (panel) {
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
    sound.hidden(document.hidden);
  });

  function frame(now: number): void {
    const paused = document.hidden || dialogOpen() || held;
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
    // The horde track while a fight is on; the camp's at the build and the result screen.
    // A won or lost sting plays alone: the horde track drops fast and the camp's waits for it.
    const cues = horde ? cuesBetween(heard, horde) : [];
    for (const cue of cues) sound.play(cue);
    if (horde) chat = chatter(chat, heard, horde, dt, chatterLevel);
    heard = horde;
    const sting = cues.includes('won') || cues.includes('lost') ? STING : 0;
    sound.music(horde?.outcome === 'fighting' ? 'horde' : 'camp', sting);
    sound.pump();
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
      const edge = project({ x: FIGHT_FRAME.left, y: 0 }, fightCam).sx;
      drawScene(
        ctx,
        art,
        // Bullet tails grow with the game speed (ID-070).
        { ...horde, pace: speed, chat },
        cam,
        view,
        null,
        selectedDefender,
        aim,
        animator,
        ease ? campView(game) : null,
        ease ? Math.max(0, t) * edge : null,
        backdropCtx,
      );
      hud.update(horde, armed);
      if (horde.outcome !== 'fighting' && endedAt === null) {
        endedAt = Date.now();
        const screen = HORDE_ONLY ? squadScreen(game, horde) : resultScreen(game, horde, endedAt);
        // After a first clear the next new horde is picked; else the same horde again.
        if (screen.picker) picked = screen.picker.value;
        hud.showResult(screen);
        // Horde-only (ID-066): XP and the new survivor are saved at once, so a reload on
        // the result screen never loses a win; stat points follow with its button.
        if (HORDE_ONLY) {
          commit(finishSquadHorde(game, horde));
          showGear();
        }
      }
    } else if (!panel) {
      // The horde-only build between hordes: the squad on a full wall, waiting to start.
      if (preview) {
        drawScene(
          ctx,
          art,
          preview,
          fightCam,
          view,
          null,
          null,
          null,
          animator,
          null,
          null,
          backdropCtx,
        );
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
      drawScene(ctx, art, scene, cam, view, overlay, null, null, null, camp, null, backdropCtx);
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
    grenades: [],
    focusId: null,
    time: 0,
    outcome: 'fighting',
    fires: [],
    blasts: [],
  };
}
