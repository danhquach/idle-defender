// Wires the game to the page: canvas, frame loop, fixed camera and click input, the build
// panel between hordes and the HUD in a fight.
import { campLevelOf, recruitArrivals, takeCampPick, type CampChoice } from '../core/camp.ts';
import { banCard, banLock, chooseCard, rerollLock, rerollOffer, skipOffer } from '../core/cards.ts';
import { FIELD, HORDE_ONLY, type SkillId, type TechId, type WeaponId } from '../core/data.ts';
import { researchTech } from '../core/techtree.ts';
import type { OwnedWeapon } from '../core/armoury.ts';
import { finishHorde, newGame, recover, startHorde, type GameState } from '../core/game.ts';
import { localHorde, localOf, modeOf, modeUnlocked, setMode } from '../core/modes.ts';
import {
  layoutOf,
  moveDefender,
  setFocus,
  standing,
  tick,
  type HordeState,
} from '../core/horde.ts';
import {
  answerJoin,
  autoSquad,
  bestGuns,
  bestSquad,
  buySquadSlot,
  buyStashSlots,
  campOf,
  combineGuns,
  combineSurvivors,
  equipGun,
  finishSquadHorde,
  joiningOf,
  letGo,
  refuseJoins,
  setAutoSquad,
  squadOf,
  squadSize,
  startSquadHorde,
  craftGun,
  salvageBlueprint,
  salvageGun,
  stashCap,
  upgradeGun,
  withUpgradedGun,
  toggleSkill,
  toggleSquad,
  treatSurvivor,
  type GunChoice,
  type GunMove,
} from '../core/hordeonly.ts';
import { settlePatrols } from '../core/patrol.ts';
import { recommendedPower, squadPower } from '../core/squadpower.ts';
import { loadBatteries, runGenerator } from '../core/power.ts';
import { chatter, newChat } from './chatter.ts';
import {
  cardsOpen,
  downSurvivor,
  fillStash,
  grantCard,
  grantGun,
  loseNow,
  offerCard,
  reachHorde,
  setCampLevel,
  setScrap,
  setSkill,
  setSquadSize,
  setSurvivorLevel,
  winNow,
  type DebugFight,
  type DebugGame,
} from '../core/debug.ts';
import { advanceResearch } from '../core/research.ts';
import { replaceInjured, skipReplace } from '../core/replace.ts';
import { buy } from '../core/shop.ts';
import {
  autoLookDue,
  autoStrike,
  repairsState,
  skillLock,
  useRepairs,
  useSkill,
} from '../core/skills.ts';
import { debugFlag, debugStorage } from '../storage/debug.ts';
import { browserStorage, decodeSave, encodeSave, loadSave, writeSave } from '../storage/save.ts';
import {
  readAutoStrike,
  readChatter,
  readAirstrikeHintSeen,
  readHowToSeen,
  readReduceMotion,
  readSound,
  readSpeed,
  SPEEDS,
  writeAirstrikeHintSeen,
  writeAutoStrike,
  writeChatter,
  writeHowToSeen,
  writeMute,
  writeReduceMotion,
  writeSpeed,
  writeVolume,
  type Speed,
} from '../storage/settings.ts';
import { Animator } from './anim.ts';
import {
  answerText,
  combineQuestion,
  combineText,
  joinCards,
  leaveJoinQuestion,
  letGoQuestion,
  letGoText,
} from './joining.ts';
import { dyingLeft } from './death.ts';
import { SoundEngine, STING } from './audio.ts';
import { createBuildPanel, FIELD_GREW, LEVELS_REWORKED } from './build.ts';
import { ASK_CHANGED, askConfirm, type Answer } from './confirm.ts';
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
  AUTO_KEY,
  HOLD_MS,
  REPAIRS_KEY,
  bestGunsLine,
  buyQuestion,
  buyText,
  bulkSalvageQuestion,
  bulkSalvageText,
  salvageAsks,
  salvageGuns,
  salvageQuestion,
  salvageText,
  upgradeText,
  withScrapNow,
  withStashNow,
  BUY_WAIT,
  createHud,
  createScrapChip,
  defenderLabel,
  hordePicker,
  joinedCard,
  joinMoves,
  markBench,
  offerHolds,
  powerLine,
  resultScreen,
  fightKeyName,
  SKILL_KEYS,
  STRIKE_HINT_MS,
  skillPicker,
  skillSlots,
  OFFER_KEYS,
  SPEED_KEYS,
  squadScreen,
  type ResultScreen,
  squadStart,
} from './hud.ts';
import { createHold } from './hold.ts';
import { createDebugPanel, type DebugActions, type DebugSpeed, type DebugView } from './debug.ts';
import { createIntro } from './intro.ts';
import { createCampWindow } from './campwindow.ts';
import {
  createResearchCenter,
  RESEARCH_WAIT,
  researchQuestion,
  researchText,
} from './researchcenter.ts';
import { CRAFT_WAIT, createCraft, type CraftTab } from './craft.ts';
import { createMapButton, setMapButton } from './hud.ts';
import { mapButton } from './maptext.ts';
import { createMapView, MAP_WAIT, type MapTab } from './mapview.ts';
import {
  backPatrols,
  clockCheck,
  patrolAt,
  patrolReport,
  sendMapPatrol,
  rerollMap,
  takeReport,
  withMap,
} from '../core/scout.ts';
import { COMBINE_WAIT, createInventory, GUNS_WAIT } from './inventory.ts';
import { createMenu, SAVE_STATUS } from './menu.ts';
import { recruitNotice } from './roster.ts';
import { createRoster, SQUAD_WAIT, TREAT_WAIT, type Roster } from './squadroster.ts';
import { cuesBetween } from './sound.ts';
import {
  enemyHitAt,
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
import { fightSpeed } from './fastforward.ts';
import { createTurnPrompt, goLandscape } from './landscape.ts';
import { TITLE_PICTURE, type Art } from './sprites.ts';
import { refusalText, refusedText, type Refused } from './text/index.ts';

/** Longest frame the sim will advance by: a stall never jumps the fight ahead. */
const MAX_DT = 0.1;
/** A press that moves less than this (CSS px) before release is a click, not a drag. */
const CLICK_SLOP = 5;
/** How long the one-time stats note stays up, in ms (ID-084; the level rework note since ID-146). */
const REWORK_TOAST_MS = 8000;

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
  // Debug mode (ID-197) keeps its camp in a save slot of its own: the player's is never read
  // or written while it is on.
  const debugOn = debugFlag(window.location.search);
  const realStorage = browserStorage();
  const storage = realStorage && debugOn ? debugStorage(realStorage) : realStorage;
  const loaded = storage ? loadSave(storage) : { save: null, rejected: false };
  let game: GameState = loaded.save?.game ?? newGame(HORDE_ONLY ? 'horde' : 'full', Date.now());
  // The world map (ID-219): a new game, or an older save, draws a fresh one.
  if (HORDE_ONLY) game = withMap(game, Date.now() >>> 0);
  // The fight under way, or null in build mode.
  let horde: HordeState | null = null;
  // The horde the horde-only start or result screen has picked (ID-098): the next new horde,
  // or one already beaten; the next fight is this one.
  let picked = localHorde(game);
  // The horde-only build between hordes (ID-066): the next horde, set up but not started,
  // drawn behind its start screen.
  let preview: HordeState | null = null;
  // What the fight's animation remembers between frames (anim.ts); a new fight resets it.
  const animator = new Animator();
  animator.reduced = readReduceMotion(
    storage,
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  // The page's CSS motion follows the setting too (ID-121).
  document.documentElement.toggleAttribute('data-reduce-motion', animator.reduced);
  // When the fight ended (ms): read once, so the screen and the rest timers agree.
  let endedAt: number | null = null;
  // The result screen made when the fight ended, waiting to show until `at` (ms): a win's
  // waits while its last kills finish dying (ID-110).
  let pendingResult: { screen: ResultScreen; at: number } | null = null;
  /** Whether the fight is over and its result screen up, so camp actions are open again. */
  const resultUp = (): boolean => endedAt !== null && pendingResult === null;
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
  // A debug fight speed (ID-197) in place of the player's; null when off.
  let debugSpeed: DebugSpeed | null = null;
  // Airstrike auto-aim (ID-140), kept between hordes and sessions; and the fight time it
  // last looked for a target, so it looks every `AUTO_AIM.look` s, not every frame.
  let autoOn = readAutoStrike(storage);
  let autoLookedAt = -Infinity;
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

  // The Scrap balance in the top bar (ID-179), horde-only; redrawn with the dialogs.
  const scrapChip = HORDE_ONLY ? createScrapChip(root.ownerDocument) : null;
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
      for (const id of campPicks) {
        const r = takeCampPick(next, id);
        // The HUD counts room as the core does, so a refusal is a bug: say so, and the
        // offer and those after it stay for the roster.
        if (!r.ok) {
          hud.toast(refusedText(r));
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
      else hud.toast(refusalText(sent));
    },
    () => {
      if (horde?.replace) horde = skipReplace(horde);
    },
    (item) => {
      if (!horde) return;
      const r = buy(horde, item);
      if (r.ok) horde = r.state;
      else hud.toast(refusalText(r));
    },
    (skill) => arm(skill),
    (act) => {
      // The card pick's buttons (ID-210), each checked against the live fight.
      if (!horde?.offer) return;
      if (act.act === 'skip') horde = skipOffer(horde);
      else if (act.act === 'reroll') {
        if (rerollLock(horde) === null) horde = rerollOffer(horde);
      } else if (banLock(horde, act.index) === null) horde = banCard(horde, act.index);
    },
    (id) => {
      if (horde && endedAt !== null) campPicks.push(id);
    },
    (next) => setSpeed(next),
  );
  /**
   * The Airstrike's Auto toggle (ID-140), by its pill, a hold or the E key: saved at once,
   * and said for a moment above the skill bar (ID-232).
   */
  function toggleAuto(): void {
    autoOn = !autoOn;
    writeAutoStrike(storage, autoOn);
    hud.showAutoStrike(autoOn);
    hud.autoNote(autoOn);
    dismissStrikeHint();
  }
  // The Airstrike's one-time hint (ID-232): the first fight it is in, until a tap or a few
  // seconds; remembered when shown, so it never comes back.
  let strikeHintSeen = readAirstrikeHintSeen(storage);
  let strikeHintTimer: ReturnType<typeof setTimeout> | undefined;
  function dismissStrikeHint(): void {
    if (strikeHintTimer === undefined) return;
    clearTimeout(strikeHintTimer);
    strikeHintTimer = undefined;
    hud.strikeHint(false);
  }
  function maybeStrikeHint(): void {
    if (strikeHintSeen || !horde || horde.outcome !== 'fighting' || resultUp()) return;
    if (!horde.skills.includes('airstrike')) return;
    strikeHintSeen = true;
    writeAirstrikeHintSeen(storage);
    hud.strikeHint(true);
    strikeHintTimer = setTimeout(dismissStrikeHint, STRIKE_HINT_MS);
  }
  hud.onAutoStrike(toggleAuto);
  hud.showAutoStrike(autoOn);
  /**
   * Field Repairs' button or key (ID-231): used at once, never armed; a refusal is toasted.
   * Without the card there is no button, so F says nothing (as Q and W with no skill).
   */
  function repair(): void {
    if (!horde || repairsState(horde) === 'none') return;
    const r = useRepairs(horde);
    if (r.ok) horde = r.state;
    else hud.toast(refusalText(r));
  }
  hud.onRepairs(repair);
  /** A skill's button or key (ID-100): it is armed, waiting for an aim (ID-107). */
  function arm(skill: SkillId): void {
    if (!horde) return;
    if (skill === 'airstrike') dismissStrikeHint();
    // An open offer holds the skills (ID-159): a key only says so and leaves the armed
    // one armed; Esc still puts it away.
    if (offerHolds(horde)) return hud.toast('Pick first');
    // A second click on the armed skill puts it away.
    const lock = skillLock(horde, skill);
    if (lock) hud.toast(refusalText(lock));
    armed = lock || armed === skill ? null : skill;
    if (armed) selectedDefender = null;
  }
  // The pause button (ID-165) does what Space does: in a fight, with no dialog open.
  hud.onPause(() => {
    if (horde?.outcome === 'fighting' && !dialogOpen()) hold(!held);
  });
  // The skill pick (ID-100), between hordes only: saved at once, so it is there next time.
  hud.onSkillPick((skill) => {
    if (horde && !resultUp()) return;
    const r = toggleSkill(game, skill);
    if (!r.ok) hud.toast(refusedText(r));
    else commit(r.game);
    hud.showSkills(skillPicker(game.skillPick));
  });
  // A mode picked on the start or result screen (ID-218), between fights: saved at once, and
  // back to the new mode's start screen with its own horde picked.
  hud.onModePick((mode) => {
    if (horde && !resultUp()) return;
    if (!modeUnlocked(game, mode) || mode === modeOf(game)) return;
    // Switching leaves the result screen, so anyone still asking would be refused unseen.
    if (joiningOf(game).length > 0) {
      hud.toast('Answer who is asking to join first');
      return;
    }
    // With Auto on, the squad re-fits the new mode's horde (ID-237); without it nobody moves.
    commit(autoSquad(setMode(game, mode)));
    picked = localHorde(game);
    endedAt = null;
    pendingResult = null;
    campPicks = [];
    toBuild();
  });
  hud.onHordePick((n) => {
    picked = n;
    // The Inventory's Squad Power line compares with the horde picked.
    inventory.refresh();
  });
  // Leaving with someone still asking to join refuses them (ID-150): asked first.
  hud.onLeave(() => {
    const ask = leaveJoinQuestion(game);
    return ask === null ? true : askConfirm(ask, { danger: true });
  });
  // An Accept or Refuse on the offer tile (ID-150), between hordes only: saved at once.
  hud.onJoin((id, accept) => {
    if (horde && !resultUp()) return;
    const name = joiningOf(game).find((d) => d.id === id)?.name ?? '';
    const r = answerJoin(game, id, accept);
    if (!r.ok) {
      hud.toast(refusedText(r));
      return;
    }
    commit(r.game);
    // One string, in the toast and on the result's offer line (ID-182).
    const said = answerText(name, r.where);
    hud.toast(said);
    hud.noteJoin(said);
    // Into the squad (ID-157): a win's screen shows only level-ups, so their card is added
    // before the gun pickers are drawn into the cards.
    const card = r.where === 'squad' ? joinedCard(game, id) : null;
    if (card && horde) hud.showJoined(card);
    redrawSquad();
    // A start screen redrawn under the keyboard: it goes back to the tile, else the button.
    hud.showJoin(joinCards(game), true);
    // Marked "New" and scrolled to last, once the tile has taken the keyboard (and on a start
    // screen, once redrawn with them in it).
    if (card) hud.showJoined(card);
  });
  /**
   * The horde-only result or start screen's button (ID-066): the horde itself was taken in
   * when it ended, so the next horde starts at once, or the same one again after a loss.
   */
  function squadNext(): void {
    if (horde && endedAt === null) return;
    // Going on without answering refused whoever was still asking to join (ID-150): the
    // HUD asked first (`onLeave`).
    if (joiningOf(game).length > 0) commit(refuseJoins(game));
    // The seed is the only randomness from outside the core.
    const now = Date.now();
    // Whatever is picked starts: one that isn't open (a stale pick) falls back to the new horde.
    const open = Number.isInteger(picked) && picked >= 1 && picked <= localHorde(game);
    startFight(startSquadHorde(game, now, now, open ? picked : localHorde(game)));
  }
  /** The horde picker redrawn off the squad as it stands, the pick kept (ID-098). */
  function showPicker(): void {
    const retry = horde && endedAt !== null && horde.outcome === 'lost' ? localOf(horde) : null;
    hud.showPicker(hordePicker(game, picked, retry, !horde));
  }
  /**
   * The result or start screen brought up to the game as it stands, between hordes only: its
   * squad (ID-157), the picker's readiness and whoever is asking to join.
   */
  function refreshPanel(): void {
    hud.showSquad(new Set(squadOf(game).map((d) => d.id)));
    // A new gun moves Squad Power, so the picker's bands follow.
    showPicker();
    // Whoever is still asking to join (ID-150), on the result or start screen.
    hud.showJoin(joinCards(game));
  }
  /**
   * Gives survivor `defenderId` gun `choice` between hordes (the gun pickers, and the
   * Inventory's drag and drop, ID-095): saved at once, and the pickers redrawn.
   */
  function changeGun(defenderId: string, choice: GunChoice): { ok: true } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: GUNS_WAIT };
    const r = equipGun(game, defenderId, choice);
    if (!r.ok) return r;
    commit(r.game);
    // The start screen's squad on the wall holds the new gun too.
    if (!horde) preview = startSquadHorde(game, 0, Date.now());
    refreshPanel();
    return { ok: true };
  }
  /**
   * Crafts a `base` gun from a blueprint and `amount` Scrap (the Craft tab, ID-209), between
   * hordes: saved at once, the gun in the stash; the gun pickers and the result screen's Scrap
   * follow.
   */
  function craftNow(base: WeaponId, amount: number): { ok: true; weapon: OwnedWeapon } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: CRAFT_WAIT };
    const r = craftGun(game, base, amount);
    if (!r.ok) return r;
    commit(r.game);
    if (!horde) preview = startSquadHorde(game, 0, Date.now());
    refreshPanel();
    refreshResultScrap();
    return { ok: true, weapon: r.weapon };
  }
  /** Turns a `base` blueprint into a little Scrap (the Craft tab, ID-209), between hordes: saved at once. */
  function salvageNow(base: WeaponId): { ok: true; scrap: number } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: CRAFT_WAIT };
    const r = salvageBlueprint(game, base);
    if (!r.ok) return r;
    commit(r.game);
    refreshResultScrap();
    return { ok: true, scrap: r.scrap };
  }
  /**
   * Raises gun `uid` one upgrade step (the Inventory, ID-208), held or in the stash, between
   * hordes or in a fight: saved at once. In a fight the survivor holding it fights with the new
   * numbers from the next shot, and the Squad Power chip follows.
   */
  function upgradeGunNow(uid: string): { ok: true; text: string } | Refused {
    const r = upgradeGun(game, uid);
    if (!r.ok) return r;
    commit(r.game);
    if (horde && !resultUp()) {
      horde = withUpgradedGun(horde, r.weapon);
      hud.fightPower(
        powerLine(
          squadPower(game),
          recommendedPower(horde.hordeNumber, horde.mode ?? 'normal', squadSize(game)),
          squadSize(game),
        ),
      );
    } else {
      // The start screen's squad on the wall holds the new numbers too.
      if (!horde) preview = startSquadHorde(game, 0, Date.now());
      refreshPanel();
    }
    refreshResultScrap();
    return { ok: true, text: upgradeText(r.weapon, r.cost, game.stock.scrap) };
  }
  /**
   * Salvages stash gun `uid` for Scrap (the Inventory, ID-207), between hordes or in a fight:
   * a Prototype or Relic asks first, in the game's own panel, and is checked again after the
   * answer; saved at once. Null when the player said no.
   */
  async function salvageGunNow(uid: string): Promise<Answer> {
    const first = salvageGun(game, uid);
    if (!first.ok) return first;
    const ask = salvageAsks(first.weapon) ? salvageQuestion(first.weapon, first.scrap) : null;
    if (ask !== null && !(await askConfirm(ask, { confirm: 'Salvage', danger: true }))) return null;
    const now = salvageGun(game, uid);
    if (!now.ok) return now;
    if (ask !== null && salvageQuestion(now.weapon, now.scrap) !== ask) {
      return { ok: false, reason: ASK_CHANGED };
    }
    commit(now.game);
    // The start screen's squad is unchanged (no one holds a stash gun); the Scrap chip and a
    // result screen's "now" figure follow the new balance.
    refreshResultScrap();
    return { ok: true, text: salvageText(now.weapon, now.scrap, game.stock.scrap) };
  }

  /**
   * Salvages the stash guns `uids` together (ID-215), between hordes or in a fight: one with a
   * Prototype or Relic asks first, and is checked again after the answer; saved once. Null
   * when the player said no.
   */
  async function salvageGunsNow(uids: readonly string[]): Promise<Answer> {
    const first = salvageGuns(game, uids);
    if (!first.ok) return first;
    const ask = bulkSalvageQuestion(first.weapons, first.scrap);
    if (ask !== null && !(await askConfirm(ask, { confirm: 'Salvage', danger: true }))) return null;
    const now = salvageGuns(game, uids);
    if (!now.ok) return now;
    if (bulkSalvageQuestion(now.weapons, now.scrap) !== ask) {
      return { ok: false, reason: ASK_CHANGED };
    }
    commit(now.game);
    refreshResultScrap();
    return { ok: true, text: bulkSalvageText(now.weapons.length, now.scrap, game.stock.scrap) };
  }
  /**
   * The Scrap balance a won horde's result screen reports, as it stands (ID-208): only its "now"
   * figure is set, in place (a screen waiting for the last kills is patched before it shows),
   * so a skill picked, details opened or a scroll on the screen stay as they are. Does nothing
   * with no won result screen.
   */
  function refreshResultScrap(): void {
    if (!HORDE_ONLY || !horde || horde.outcome !== 'won') return;
    const stash = [game.armoury.length, stashCap(game)] as const;
    if (pendingResult) {
      pendingResult.screen = withStashNow(
        withScrapNow(pendingResult.screen, game.stock.scrap),
        ...stash,
      );
    } else if (endedAt !== null) {
      hud.resultScrap(game.stock.scrap);
      // The drop tile's "Stash n/cap" follows a gun crafted here (ID-209).
      hud.resultStash(...stash);
    }
  }
  /**
   * Moves survivor `id` between the squad and the bench between hordes (the Roster, ID-147):
   * saved at once; the start screen, its squad on the wall and the gun pickers redrawn.
   */
  function changeSquad(id: string): { ok: true } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
    const r = toggleSquad(game, id);
    if (!r.ok) return r;
    commit(r.game);
    redrawSquad();
    return { ok: true };
  }
  /** Treats resting survivor `id` with Medicine (ID-220): between hordes, saved at once. */
  function treatInjured(id: string): { ok: true } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: TREAT_WAIT };
    const r = treatSurvivor(game, id);
    if (!r.ok) return r;
    commit(r.game);
    redrawSquad();
    return { ok: true };
  }
  /** The horde picked on the screen, for the squad tools' fit (ID-237); undefined when none is open. */
  function pickedHorde(): number | undefined {
    return Number.isInteger(picked) && picked >= 1 && picked <= localHorde(game)
      ? picked
      : undefined;
  }
  /**
   * "Best gun for everyone" between hordes (the Roster, the result or start screen and the
   * Inventory): saved at once, and the screens redrawn.
   */
  function handOutBestGuns(): { ok: true; moves: GunMove[] } | Refused {
    if (horde && !resultUp()) return { ok: false, reason: GUNS_WAIT };
    const local = pickedHorde();
    let r = bestGuns(game, local);
    let moves = r.moves;
    // "Auto" (ID-154) re-picks the squad on every press, new guns or not (they change
    // Squad Power; with none, it still undoes a hand-picked squad, as the Roster says).
    let next = autoSquad(r.game, local);
    // Whoever Auto brought in still holds their old gun: hand out again for the squad it
    // picked, until it stands (a few rounds at most), so one press is enough.
    const ids = (g: GameState): string => g.roster.map((d) => d.id).join();
    for (let round = 0; round < 3 && ids(next) !== ids(r.game); round++) {
      r = bestGuns(next, local);
      moves = joinMoves(moves, r.moves);
      next = autoSquad(r.game, local);
    }
    // Still moving after that: one last hand-out for the squad that stands, Auto not run again.
    if (ids(next) !== ids(r.game)) {
      r = bestGuns(next, local);
      moves = joinMoves(moves, r.moves);
      next = r.game;
    }
    if (next !== game) {
      commit(next);
      // The start screen and its squad on the wall hold the new guns (and squad) too.
      redrawSquad();
    }
    // Marked by where each ends: Auto may have moved them between squad and bench (ID-188).
    return { ok: true, moves: markBench(moves, new Set(squadOf(next).map((d) => d.id))) };
  }
  /**
   * After the camp changed between hordes (the squad picked, someone joined or left): the
   * start screen and its squad on the wall, and the gun pickers, redrawn.
   */
  function redrawSquad(): void {
    if (!horde) {
      preview = startSquadHorde(game, 0, Date.now());
      hud.update(preview);
      hud.showResult(squadStart(game, picked));
    }
    refreshPanel();
  }
  /**
   * Lets survivor `id` go between hordes (the Roster, ID-150), on a yes to the confirm
   * (ID-191, the game's own panel): saved at once, and the screens redrawn. Null when the
   * player said no. The camp is read again after the answer, and an answer to a question that
   * has since changed (or a horde that has started) commits nothing.
   */
  async function letSurvivorGo(id: string): Promise<Answer> {
    if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
    const r = letGo(game, id);
    if (!r.ok) return r;
    // `letGo` found them, so they are in the camp.
    const d = campOf(game).find((x) => x.id === id)!;
    const ask = letGoQuestion(d, r.thrown);
    if (!(await askConfirm(ask, { danger: true }))) return null;
    if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
    const now = letGo(game, id);
    if (!now.ok) return now;
    const here = campOf(game).find((x) => x.id === id)!;
    if (letGoQuestion(here, now.thrown) !== ask) return { ok: false, reason: ASK_CHANGED };
    commit(now.game);
    redrawSquad();
    return { ok: true, text: letGoText(d.name) };
  }
  /**
   * Buys the next squad slot or stash slots between hordes (ID-179), on a yes to the confirm
   * (ID-191): saved at once, and the screens redrawn. Null when the player said no. The buy
   * is worked out again after the answer: a horde that has started, or a price or Scrap that
   * moved, commits nothing.
   */
  async function buySlots(kind: 'squad' | 'stash'): Promise<Answer> {
    if (horde && !resultUp()) return { ok: false, reason: BUY_WAIT };
    const buy = (): { r: ReturnType<typeof buySquadSlot>; cost: number; before: number } => {
      const before = game.stock.scrap;
      const r = kind === 'squad' ? buySquadSlot(game) : buyStashSlots(game);
      return { r, cost: r.ok ? before - r.game.stock.scrap : 0, before };
    };
    const first = buy();
    if (!first.r.ok) return first.r;
    const ask = buyQuestion(kind, first.cost, first.before);
    if (!(await askConfirm(ask))) return null;
    if (horde && !resultUp()) return { ok: false, reason: BUY_WAIT };
    const now = buy();
    if (!now.r.ok) return now.r;
    if (buyQuestion(kind, now.cost, now.before) !== ask) return { ok: false, reason: ASK_CHANGED };
    commit(now.r.game);
    redrawSquad();
    refreshResultScrap();
    return { ok: true, text: buyText(kind, now.cost, now.r.game.stock.scrap) };
  }
  /**
   * Buys Research Center node `id` between hordes (ID-263) on a yes to the confirm: saved at once.
   * Null when the player said no. Worked out again after the answer, as `buySlots`: a fight that
   * has started, or a price or Scrap that moved, commits nothing. A finished horde keeps the
   * research it started with; the next one has the new node.
   */
  async function researchNode(id: TechId): Promise<Answer> {
    if (horde && !resultUp()) return { ok: false, reason: RESEARCH_WAIT };
    const buy = (): { r: ReturnType<typeof researchTech>; before: number } => ({
      before: game.stock.scrap,
      r: researchTech(game, id),
    });
    const first = buy();
    if (!first.r.ok) return first.r;
    const ask = researchQuestion(id, first.r.cost, first.before);
    if (!(await askConfirm(ask, { confirm: 'Research' }))) return null;
    if (horde && !resultUp()) return { ok: false, reason: RESEARCH_WAIT };
    const now = buy();
    if (!now.r.ok) return now.r;
    if (researchQuestion(id, now.r.cost, now.before) !== ask) {
      return { ok: false, reason: ASK_CHANGED };
    }
    commit(now.r.game);
    refreshResultScrap();
    return { ok: true, text: researchText(id, now.r.cost, now.r.game.stock.scrap) };
  }
  /**
   * Survivor `keeperId` takes in `fedId` between hordes (the Roster, ID-170), on a yes to the
   * confirm (ID-191): saved at once, and the screens redrawn. Null when the player said no.
   * Checked again after the answer, as `letSurvivorGo`.
   */
  async function combineSurvivor(keeperId: string, fedId: string): Promise<Answer> {
    if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
    const r = combineSurvivors(game, keeperId, fedId);
    if (!r.ok) return r;
    // `combineSurvivors` found both, so they are in the camp.
    const keeper = campOf(game).find((x) => x.id === keeperId)!;
    const fed = campOf(game).find((x) => x.id === fedId)!;
    const ask = combineQuestion(keeper, fed, r.xp, r.thrown);
    if (!(await askConfirm(ask, { danger: true }))) return null;
    if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
    const now = combineSurvivors(game, keeperId, fedId);
    if (!now.ok) return now;
    const k = campOf(game).find((x) => x.id === keeperId)!;
    const f = campOf(game).find((x) => x.id === fedId)!;
    if (combineQuestion(k, f, now.xp, now.thrown) !== ask)
      return { ok: false, reason: ASK_CHANGED };
    commit(now.game);
    redrawSquad();
    return { ok: true, text: combineText(k.name, f.name, now.xp) };
  }
  /** Into fight `next`: from the build panel, or the horde-only start or result screen. */
  function startFight(next: HordeState): void {
    horde = next;
    preview = null;
    endedAt = null;
    pendingResult = null;
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
      hud.fightPower(
        powerLine(
          squadPower(game),
          recommendedPower(next.hordeNumber, next.mode ?? 'normal', squadSize(game)),
          squadSize(game),
        ),
      );
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
    // A loaded camp's trips keep the time they had left if the clock ran back meanwhile (ID-219).
    commit(HORDE_ONLY ? syncClock(next, Date.now()) : next);
    picked = localHorde(game);
    selected = null;
    // The menu only loads a camp between hordes: over a result screen, the fight it shows
    // belongs to the old camp and goes with it (ID-156).
    const overResult = horde !== null;
    endedAt = null;
    pendingResult = null;
    campPicks = [];
    if (!panel || overResult) {
      // Back to the start screen (or the build) for the new camp.
      toBuild();
      return;
    }
    panel.forget();
    panel.notice('');
    panel.show(game, selected);
  }
  // The Inventory (ID-079) sits left of the Menu; either one open holds a fight.
  // Its Combine (ID-091, horde-only) works between hordes, like the gun pickers.
  // Both are tabs of one camp window (ID-183): moving between them never closes it.
  const campWindow = createCampWindow(root);
  const inventory = createInventory(
    root,
    {
      state: () => ({
        game,
        resumes: horde?.outcome === 'fighting' && !held,
        canCombine: !horde || resultUp(),
        canBuy: !horde || resultUp(),
        // Squad Power against the horde under way, or the one picked (ID-098).
        ...(HORDE_ONLY ? { horde: horde && endedAt === null ? localOf(horde) : picked } : {}),
      }),
      onCombine: HORDE_ONLY
        ? (uids) => {
            if (horde && !resultUp()) return { ok: false, reason: COMBINE_WAIT };
            const r = combineGuns(game, uids);
            if (!r.ok) return r;
            commit(r.game);
            // The gun pickers list the stash: the new gun is there, the used ones gone.
            refreshPanel();
            return { ok: true, weapon: r.weapon };
          }
        : undefined,
      // Drag and drop (ID-095), horde-only and between hordes, as the gun pickers.
      onEquip: HORDE_ONLY ? changeGun : undefined,
      onUpgrade: HORDE_ONLY ? upgradeGunNow : undefined,
      onSalvage: HORDE_ONLY ? salvageGunNow : undefined,
      onSalvageMany: HORDE_ONLY ? salvageGunsNow : undefined,
      onBuyStash: HORDE_ONLY ? () => buySlots('stash') : undefined,
      onBestGuns: HORDE_ONLY ? handOutBestGuns : undefined,
    },
    campWindow,
  );
  // The Craft tab (ID-209), third in the camp window: blueprints and Scrap make a gun.
  const craftTab: CraftTab | null = HORDE_ONLY
    ? createCraft(
        {
          state: () => ({
            game,
            resumes: horde?.outcome === 'fighting' && !held,
            canCraft: !horde || resultUp(),
          }),
          onCraft: craftNow,
          onSalvage: salvageNow,
          onView: (uid) => inventory.open(uid),
        },
        campWindow,
        inventory.button,
      )
    : null;
  // The latest time seen (ID-219): the save's own time to start with, so a clock set back while
  // the game was closed is caught too.
  let seen = Math.max(loaded.save?.savedAt ?? 0, Date.now());
  /**
   * `g` with a clock that ran back since `seen` made up for (time running backwards counts as
   * 0, `clockCheck`), once: from here the clock runs on from `now`. Before anything reads or
   * sends a patrol, so a patrol sent just after a jump is never moved by it.
   */
  function syncClock(g: GameState, now: number): GameState {
    const out = clockCheck(g, now, seen);
    seen = now;
    return out;
  }
  // The World map (ID-219), fourth in the camp window: patrols from the bench, between hordes.
  // Its globe button sits in the top bar, left of Roster.
  const mapOpen = HORDE_ONLY ? createMapButton(root) : null;
  const mapTab: MapTab | null = HORDE_ONLY
    ? createMapView(
        {
          state: () => ({
            game,
            now: Date.now(),
            resumes: horde?.outcome === 'fighting' && !held,
            canSend: !horde || resultUp(),
          }),
          onSend: (area, ids) => {
            if (horde && !resultUp()) return { ok: false, reason: MAP_WAIT };
            const now = Date.now();
            const synced = syncClock(game, now);
            // The seed is the only randomness from outside the core.
            const r = sendMapPatrol(synced, area, ids, now >>> 0, now);
            if (!r.ok) return r;
            commit(r.game);
            redrawSquad();
            return { ok: true };
          },
          onTake: (area) => {
            if (horde && !resultUp()) return { ok: false, reason: MAP_WAIT };
            const r = takeReport(game, area, Date.now());
            if (!r.ok) return r;
            commit(r.game);
            redrawSquad();
            return { ok: true };
          },
          onReroll: () => {
            if (horde && !resultUp()) return { ok: false, reason: MAP_WAIT };
            const r = rerollMap(game);
            if (!r.ok) return r;
            commit(r.game);
            redrawSquad();
            return { ok: true };
          },
          report: (area) => {
            const p = patrolAt(game, area);
            return p ? patrolReport(game, p) : null;
          },
        },
        campWindow,
        mapOpen ?? inventory.button,
      )
    : null;
  if (mapOpen) {
    setMapButton(mapOpen, mapButton(game, Date.now()));
    mapOpen.addEventListener('click', () => mapTab?.open(mapOpen));
  }
  const menu = createMenu(root, {
    // Load and New camp lock only while a fight runs: the result screen is between hordes (ID-156).
    state: () => ({ game, fighting: horde !== null && !resultUp(), held }),
    onLoad: replaceCamp,
    onNewCamp: replaceCamp,
    reduceMotion: animator.reduced,
    onReduceMotion: (on) => {
      animator.reduced = on;
      document.documentElement.toggleAttribute('data-reduce-motion', on);
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
  // The Roster (ID-086, ID-108), left of the Inventory, in the horde-only build: every
  // survivor's level bonus and gun (ID-146). Guns change as on the gun pickers, between
  // hordes only.
  const roster: Roster | null = HORDE_ONLY
    ? createRoster(
        root,
        {
          state: () => ({
            game,
            fight: horde?.outcome === 'fighting' ? horde : null,
            canGear: !horde || resultUp(),
            resumes: horde?.outcome === 'fighting' && !held,
          }),
          storage,
          onEquip: changeGun,
          onToggleSquad: changeSquad,
          onTreat: treatInjured,
          onLetGo: letSurvivorGo,
          onBuySquad: () => buySlots('squad'),
          onCombine: combineSurvivor,
          onBestGuns: handOutBestGuns,
          // "Best squad" and "Auto" (ID-154): between hordes, saved at once, the start
          // screen and its squad on the wall redrawn.
          onBestSquad: () => {
            if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
            const r = bestSquad(game, pickedHorde());
            if (r.game !== game) {
              commit(r.game);
              redrawSquad();
            }
            return { ok: true, moves: r.moves };
          },
          onAutoSquad: (on) => {
            if (horde && !resultUp()) return { ok: false, reason: SQUAD_WAIT };
            const r = setAutoSquad(game, on, pickedHorde());
            commit(r.game);
            redrawSquad();
            return { ok: true, moves: r.moves };
          },
        },
        campWindow,
      )
    : null;
  // The Research Center (ID-263), left of Roster: Scrap upgrades, bought between hordes.
  const researchCenter = HORDE_ONLY
    ? createResearchCenter(root, {
        state: () => ({
          game,
          canBuy: !horde || resultUp(),
          resumes: horde?.outcome === 'fighting' && !held,
        }),
        onResearch: researchNode,
      })
    : null;
  // The top bar's buttons in the order they show, left to right, so Tab walks them that way.
  for (const cls of [
    'map-button',
    'research-button',
    'roster-button',
    'inv-button',
    'menu-button',
  ]) {
    const b = root.querySelector(`:scope > .${cls}`);
    if (b) root.append(b);
  }
  // "Best gun for everyone" beside the result or start screen's Squad heading: what it did
  // shows as a toast.
  root.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-best-guns]') : null;
    if (!HORDE_ONLY || !t) return;
    const r = handOutBestGuns();
    hud.toast(r.ok ? bestGunsLine(r.moves) : refusedText(r), 4000);
    // The start screen is drawn afresh on a change: the keyboard stays on the new button.
    if (!t.isConnected) root.querySelector<HTMLButtonElement>('[data-best-guns]')?.focus();
  });
  // A survivor's name on the squad screen opens their card; "Change squad" opens the Roster
  // on the squad's first (ID-147).
  root.addEventListener('click', (e) => {
    const t =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('[data-open-survivor], [data-open-roster]')
        : null;
    if (!roster || !t) return;
    roster.open(t.dataset.openSurvivor, t);
  });
  const dialogOpen = (): boolean =>
    intro.isOpen() ||
    menu.isOpen() ||
    inventory.isOpen() ||
    !!craftTab?.isOpen() ||
    !!mapTab?.isOpen() ||
    !!researchCenter?.isOpen() ||
    !!roster?.isOpen();
  function refreshDialogs(): void {
    scrapChip?.set(game.stock.scrap, game.medicine ?? 0);
    menu.refresh();
    inventory.refresh();
    craftTab?.refresh();
    mapTab?.refresh();
    researchCenter?.refresh();
    roster?.refresh();
  }
  /** Takes `next` as the game and saves it; the menu's Save tab says how that went. */
  function commit(next: GameState): void {
    // A new camp (the menu's New camp or Load of an older save) draws its map (ID-219).
    game = HORDE_ONLY ? withMap(next, Date.now() >>> 0) : next;
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
    fightCam = frameCamera(view, hud.bottomSpace(), FIGHT_FRAME, hud.topSpace());
    // The horde-only build shows the fight frame between hordes too.
    buildCam = panel ? buildCamera(view, panel.room(view)) : fightCam;
    cam = horde ? fightCam : buildCam;
  }
  resize();
  window.addEventListener('resize', resize);

  // "Back to build" swaps the scene while the result screen closes: a hard cut to the build frame.
  function toBuild(): void {
    horde = null;
    hud.fighting(false);
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
      picked = picked >= 1 && picked <= localHorde(game) ? picked : localHorde(game);
      hud.showResult(squadStart(game, picked));
      refreshPanel();
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
  // An older save's fresh map is kept at once, so a reload shows the same areas (ID-219).
  if (HORDE_ONLY && storage && loaded.save && !loaded.save.game.map) {
    writeSave(storage, game, Date.now());
  }
  // Once a second (ID-219): the map's countdowns and the World map button; a clock run back is
  // made up for (`syncClock`); a patrol back shows its report on the start screen once, with
  // nothing else open.
  const reported = new Set<number>();
  window.setInterval(() => {
    if (!mapTab) return;
    const now = Date.now();
    const checked = syncClock(game, now);
    if (checked !== game) commit(checked);
    mapTab.tick(now);
    roster?.tick(now);
    if (mapOpen) setMapButton(mapOpen, mapButton(game, now));
    const back = backPatrols(game, now).filter((p) => !reported.has(p.no));
    if (back.length > 0 && !horde && !dialogOpen()) {
      for (const p of back) reported.add(p.no);
      mapTab.open(mapOpen);
    }
  }, 1000);
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
      replaceCamp(newGame(HORDE_ONLY ? 'horde' : 'full', Date.now()));
    },
    onCardSeen: () => writeHowToSeen(storage),
    backdrop: art[TITLE_PICTURE],
    onDone: () => {
      // The tap to play: a phone goes full screen and sideways where the browser allows.
      goLandscape(window);
      if (!startedFresh) loadNotes();
    },
  });
  function loadNotes(): void {
    if (loaded.rejected) {
      // Said in the build panel too, so it is seen without opening the menu.
      panel?.notice(SAVE_STATUS.rejected.text);
      if (!panel) hud.toast(SAVE_STATUS.rejected.text);
    } else if (loaded.save) {
      // Said once: the next save is the new version, the field grown and the stat points dropped.
      const notes = [
        ...(loaded.save.grew ? [FIELD_GREW] : []),
        ...(loaded.save.reworked ? [LEVELS_REWORKED] : []),
      ].join(' ');
      if (panel && notes) panel.notice(notes);
      // A one-time note: up long enough to read (ID-146).
      else if (!panel && loaded.save.reworked) hud.toast(LEVELS_REWORKED, REWORK_TOAST_MS);
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
    // A skill key aims on release (ID-232), so a hold can be told from a tap. The release of a
    // key that was never pressed in a fight, or of one whose fight or window has gone, does nothing.
    if (!skillKeyDown || fightKeyName(e) !== skillKeyDown.name) return;
    const { skill } = skillKeyDown;
    skillKeyDown = null;
    const how = skillHold.up();
    hud.strikeHolding(false);
    if (how !== 'hold' && fightKey(e)) arm(skill);
  });
  // Holding Q for HOLD_MS turns Auto on or off, but only where a fight is on and no dialog is
  // open (a dialog opening mid-hold takes the key's release too); the release then does nothing.
  let skillKeyDown: { name: string; skill: SkillId } | null = null;
  const skillHold = createHold(HOLD_MS, () => {
    hud.strikeHolding(false);
    if (horde?.outcome === 'fighting' && !dialogOpen()) toggleAuto();
    // Nothing to set: the release that follows is then no tap either.
    else skillKeyDown = null;
  });
  window.addEventListener('blur', () => {
    skillKeyDown = null;
    skillHold.cancel();
    hud.strikeHolding(false);
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
    if (name === AUTO_KEY && !e.repeat) toggleAuto();
    if (name === REPAIRS_KEY && !e.repeat) repair();
    // An open pick's Skip takes S (ID-210; the pick marks the key handled): the 3× speed waits.
    const next =
      name === OFFER_KEYS.skip && (e.defaultPrevented || horde?.offer)
        ? undefined
        : SPEEDS.find((sp) => SPEED_KEYS[sp] === name);
    if (next && !e.repeat) setSpeed(next);
    // Horde-only (ID-100): Q and W use the picked skills, left to right as their buttons stand.
    const slot = SKILL_KEYS.indexOf(name);
    const skill = horde?.freeSkills ? skillSlots(horde)[slot] : undefined;
    // They aim on release (ID-232); held for HOLD_MS they toggle Auto instead. Only the
    // Airstrike has Auto: another skill's hold is a tap.
    if (slot >= 0 && skill && !e.repeat) {
      // A press whose release never came (an open dialog takes the key's keyup) is dropped.
      skillHold.cancel();
      skillKeyDown = { name, skill };
      if (skill === 'airstrike') {
        skillHold.down();
        hud.strikeHolding(true);
      }
    }
  });

  // One primary pointer clicks: right-click and a second finger are ignored, and a
  // press that moves off its spot is no click.
  let press: { x: number; y: number; click: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    press = { x: e.clientX, y: e.clientY, click: true };
    canvas.setPointerCapture(e.pointerId);
    // With a skill armed, its area shows under a finger at once, as under a mouse (ID-107).
    if (horde && armed && Number.isFinite(e.offsetX) && Number.isFinite(e.offsetY)) {
      hover = { sx: e.offsetX, sy: e.offsetY };
    }
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
  // and puts it away (while an offer is open it stays armed, ID-159). Otherwise a click
  // on one of your defenders selects it; with one selected, a click on a post sends it
  // there (a refusal shows as a toast, unless a shambler is under the click). Otherwise
  // a click focuses the shambler under it for every defender, or clears focus and
  // selection on empty ground. In build mode it opens the slot under it (or closes the
  // menu), or the part of the panel for the plot under it. Only finite canvas coordinates
  // reach the hit tests, and only in-range grid slots from `slotAt` reach the core. In a
  // fight nothing is drawn left of the frame, so a click there lands on nothing: an armed
  // skill stays armed. With a skill armed, a press dragged across the field aims it where
  // it lifts (ID-107): a finger sees the area first, slides it onto the crowd, and lets
  // go; a cancelled press keeps it armed.
  canvas.addEventListener('pointerup', (e) => {
    const pressed = e.isPrimary && press !== null;
    const click = pressed && press?.click === true;
    endPress(e);
    const aiming = pressed && horde !== null && armed !== null;
    if (!(click || aiming) || !Number.isFinite(e.offsetX) || !Number.isFinite(e.offsetY)) return;
    const ground = unproject({ sx: e.offsetX, sy: e.offsetY }, cam);
    if (horde && ground.x < FIGHT_FRAME.left) return;
    if (horde && armed) {
      // A drag let go off the field keeps the skill armed (ID-107): aim again.
      if (!click && (ground.x > FIELD.right || ground.y < 0 || ground.y > FIELD.height)) return;
      const used = useSkill(horde, armed, ground.x, ground.y);
      if (used.ok) horde = used.state;
      else hud.toast(refusalText(used));
      // A click while an offer is open throws nothing and keeps the skill armed for after
      // the pick (ID-159).
      if (used.ok || !offerHolds(horde)) armed = null;
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
      const enemyId = enemyHitAt(ground.x, ground.y, horde);
      if (hit && selectedDefender !== null) {
        const moved = moveDefender(horde, selectedDefender, hit.postId);
        if (moved.ok) {
          horde = moved.state;
          selectedDefender = null;
          return;
        }
        // A refused move over a shambler (one hitting the wall) is a focus click.
        if (enemyId === null) {
          hud.toast(refusalText(moved));
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

  /** Debug mode's panel (ID-197): only with the URL flag; without it nothing here exists. */
  const debugPanel = debugOn ? createDebugPanel(root, debugActions()) : null;

  /** A phone held upright is asked to turn sideways (ID-205); the fight waits. */
  const turnPrompt = createTurnPrompt(window);

  // A hidden tab, the open menu, Space or an upright phone doesn't advance the fight; it
  // resumes from where it was.
  let last: number | null = null;
  document.addEventListener('visibilitychange', () => {
    last = null;
    sound.hidden(document.hidden);
  });

  function frame(now: number): void {
    const paused = document.hidden || dialogOpen() || held || turnPrompt.showing();
    const dt = frameStep(last, now, paused);
    last = paused ? null : now;
    // The empty field runs fast (ID-164): the walk-in and the gaps between waves.
    const pace = debugSpeed ?? (horde ? fightSpeed(speed, horde) : speed);
    hud.skipping(!paused && debugSpeed === null && pace > speed);
    if (dt > 0) {
      // Speed runs more of the core's fixed steps per frame, never longer ones; a pick
      // or replacement stops the rest of the frame's steps in the core.
      if (horde) horde = tick(horde, dt * pace);
      if (!strikeHintSeen) maybeStrikeHint();
      // Auto-aim (ID-140): fires the Airstrike on the biggest group the moment it is ready.
      if (horde && autoOn && autoLookDue(horde.time, autoLookedAt)) {
        autoLookedAt = horde.time;
        horde = autoStrike(horde);
      }
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
      // The end of the fight or a cooldown puts an armed skill away. A card offer only
      // locks skills for the moment: the pick keeps what was armed armed (ID-159).
      if (armed && !offerHolds(horde) && skillLock(horde, armed) !== null) armed = null;
      // Start Horde's ease: the camp shows until the clip has slid to the frame's edge.
      let t = 1;
      if (ease) {
        ease.at ??= now;
        t = (now - ease.at) / EASE_MS;
        if (t >= 1) ease = null;
      }
      cam = ease ? easeCamera(ease.from, fightCam, t) : fightCam;
      const aim: Aim | null = armed && hover ? { skill: armed, ...unproject(hover, cam) } : null;
      const edge = project({ x: FIGHT_FRAME.left, y: 0 }, fightCam).sx;
      drawScene(
        ctx,
        art,
        // Bullet tails grow with the game speed (ID-070).
        {
          ...horde,
          pace,
          chat,
          // Once it is over, the real seconds since, for its last kills to finish dying
          // (ID-110): 0 on the frame it ends, before `endedAt` is read below.
          ...(horde.outcome === 'fighting'
            ? {}
            : { ended: endedAt === null ? 0 : (Date.now() - endedAt) / 1000 }),
        },
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
      hud.fighting(horde.outcome === 'fighting');
      // An armed skill shows at the pointer too (ID-107).
      const cursor = armed ? 'crosshair' : '';
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
      if (horde.outcome !== 'fighting' && endedAt === null) {
        endedAt = Date.now();
        const screen = HORDE_ONLY ? squadScreen(game, horde) : resultScreen(game, horde, endedAt);
        // After a first clear the next new horde is picked; else the same horde again.
        if (screen.picker) picked = screen.picker.value;
        // A win's last kill ends the fight mid-death: its result waits until they have died.
        const left =
          horde.outcome === 'won'
            ? dyingLeft(horde.seed, horde.time, animator.corpses, animator.reduced)
            : 0;
        pendingResult = { screen, at: endedAt + left * 1000 };
        // Horde-only (ID-066): XP and the new survivor are saved at once, so a reload on
        // the result screen never loses a win.
        if (HORDE_ONLY) commit(finishSquadHorde(game, horde));
      }
      if (pendingResult && Date.now() >= pendingResult.at) {
        hud.showResult(pendingResult.screen);
        pendingResult = null;
        if (HORDE_ONLY) refreshPanel();
        // A Menu, Inventory or Roster open over the last kills unlocks now (ID-156).
        refreshDialogs();
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
    if (debugPanel?.isOpen()) debugPanel.show(debugView());
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function debugView(): DebugView {
    const fighting = horde?.outcome === 'fighting';
    return {
      fighting,
      between: !horde || resultUp(),
      hordeNumber: game.hordeNumber,
      campLevel: campLevelOf(game.camp.xp).level,
      scrap: game.stock.scrap,
      squad: squadOf(game).length,
      stash: game.armoury.length,
      seed: horde?.seed ?? null,
      survivors: campOf(game),
      line: fighting ? horde!.defenders : [],
      cards: fighting ? cardsOpen(horde!) : [],
      speed: debugSpeed,
      held,
    };
  }
  function debugActions(): DebugActions {
    /** A camp edit between hordes, kept only when the save's own rules take it. */
    const camp = (r: DebugGame): string | null => {
      if (horde && !resultUp()) return 'Between hordes only';
      if (!r.ok) return r.reason;
      if (decodeSave(encodeSave(r.game, Date.now())) === null) {
        return 'The game could not reach that state';
      }
      commit(r.game);
      redrawSquad();
      return null;
    };
    /** A fight edit, while one is on. */
    const fight = (move: (s: HordeState) => DebugFight): string | null => {
      if (!horde) return 'No fight on';
      const r = move(horde);
      if (r.ok) horde = r.state;
      return r.ok ? null : r.reason;
    };
    const seed = (): number => Date.now() >>> 0;
    return {
      start(n, typed) {
        if (horde && !resultUp()) return 'Between hordes only';
        // Checked first: a refused start leaves the camp as it was.
        if (squadOf(game).length === 0) return 'Nobody in the squad';
        const reached = camp(reachHorde(game, n));
        if (reached) return reached;
        if (joiningOf(game).length > 0) commit(refuseJoins(game));
        picked = n;
        const now = Date.now();
        hud.hideResult();
        startFight(startSquadHorde(game, typed ?? seed(), now, n));
        return null;
      },
      campLevel: (n) => camp(setCampLevel(game, n)),
      scrap: (n) => camp(setScrap(game, n)),
      squad: (n) => camp(setSquadSize(game, n, seed())),
      level: (id, n) => camp(setSurvivorLevel(game, id, n)),
      gun: (base, rarity) => camp(grantGun(game, base, rarity, seed())),
      stash: (n) => camp(fillStash(game, n, seed())),
      skill: (id) => {
        const r = camp(setSkill(game, id));
        if (r === null) hud.showSkills(skillPicker(game.skillPick));
        return r;
      },
      offer: (id) => fight((s) => offerCard(s, id)),
      grant: (id) => fight((s) => grantCard(s, id)),
      speed: (x) => {
        debugSpeed = x;
      },
      pause: () => {
        if (horde?.outcome === 'fighting') hold(!held);
      },
      win: () => fight(winNow),
      lose: () => fight(loseNow),
      down: (id) => fight((s) => downSurvivor(s, id)),
      reset: () => {
        debugSpeed = null;
        replaceCamp(newGame(HORDE_ONLY ? 'horde' : 'full', Date.now()));
      },
    };
  }
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
    incoming: [],
  };
}
