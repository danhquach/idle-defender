// The intro (ID-106): a title screen over the camp at launch, with Continue (only with a
// save), New game (asked first when it would replace a save) and Mute; then, on a first
// launch, a short how-to-play card that can be skipped and opened again from the Menu.
// Like the Menu it sits outside `root`, which goes inert behind it, and its keys stay in it:
// Enter is the main action, Esc goes back.
import { el, SKILL_KEYS, SQUAD_LOSS_RULE } from './hud.ts';
import { createTitleLogo } from './introTitle.ts';

export const INTRO_TITLE = 'The Long Hold';
export const INTRO_TAGLINE =
  'The last survivors hold a wall against the hordes. Keep them standing.';
export const NEW_GAME_CONFIRM =
  'Start a new game? Your saved camp is lost unless you kept its backup code (Menu, then Save).';

/**
 * The how-to-play card: the wall, the survivors, skills and the screens between hordes.
 * A third part is a keyboard-only hint, hidden on a touch screen.
 */
export const HOW_TO_CARD: readonly (readonly [string, string, string?])[] = [
  ['The wall', `Hordes walk at your wall. ${SQUAD_LOSS_RULE}`],
  [
    'Survivors',
    'They shoot on their own. Tap or click an enemy to focus fire. Kills level the fight up, and each level offers three cards.',
  ],
  [
    'Skills',
    'Pick up to 2 before each horde, then tap or click them when they are ready.',
    `Keys: ${SKILL_KEYS.join(' ')}.`,
  ],
  [
    'Between hordes',
    'Spend stat points, swap guns and pick the next horde. A loss costs nothing: try again.',
  ],
];

export interface IntroOptions {
  /** A save was loaded: Continue shows, and New game asks first. */
  hasSave: boolean;
  /** No save and the card never shown: New game opens the how-to-play card. */
  firstLaunch: boolean;
  muted: boolean;
  onMute: (on: boolean) => void;
  /** New game, after the confirm when there is a save. */
  onNewGame: () => void;
  /** The title screen and any card after it are gone: the camp is the player's. */
  onDone: () => void;
  /** The card was shown, so a first launch is over. */
  onCardSeen: () => void;
  /** The title art behind it all (lazy art: it fades in once loaded, if it loads). */
  backdrop?: HTMLImageElement;
}

export interface Intro {
  isOpen(): boolean;
  /** Opens the how-to-play card on its own (from the Menu's Help tab). */
  showCard(): void;
  /** The Menu's Mute changed: the intro's switch follows. */
  setMuted(on: boolean): void;
}

type Step = 'title' | 'confirm' | 'card' | 'closed';

export function createIntro(root: HTMLElement, opts: IntroOptions): Intro {
  const doc = root.ownerDocument;
  let step: Step = 'closed';
  // Where focus goes back to when a card opened from the Menu closes.
  let returnTo: HTMLElement | null = null;
  // Whether the card closing ends the intro (true) or only returns to the game (false).
  let fromTitle = false;

  const scrim = el('div', 'intro-scrim');
  const dialog = el('div', 'intro');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  // The title art fills the window under a shade that keeps the text readable.
  const art = opts.backdrop;
  const shade = el('div', 'intro-shade');
  if (art) {
    art.className = 'intro-art';
    art.alt = '';
    const on = (): void => art.classList.add('intro-art-on');
    if (art.complete && art.naturalWidth > 0) on();
    else art.addEventListener('load', on, { once: true });
    scrim.append(art, shade);
  }
  scrim.append(dialog);
  doc.body.append(scrim);
  // A click on the backdrop neither closes it nor takes focus out of it.
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });

  // The title screen.
  // The logo is drawn; the heading's text (its accessible name) is a hidden span.
  const title = el('h1', 'intro-title');
  title.id = 'intro-title';
  title.append(el('span', 'sr-only', INTRO_TITLE), createTitleLogo(doc));
  const tagline = el('p', 'intro-tagline', INTRO_TAGLINE);
  const cont = el('button', 'btn btn-primary intro-action', 'Continue');
  cont.type = 'button';
  const fresh = el('button', 'btn intro-action', 'New game');
  fresh.type = 'button';
  fresh.classList.add(opts.hasSave ? 'btn-secondary' : 'btn-primary');
  cont.hidden = !opts.hasSave;
  const actions = el('div', 'intro-actions');
  actions.append(cont, fresh);
  const mute = el('input', 'menu-check-box');
  mute.type = 'checkbox';
  mute.id = 'intro-mute';
  mute.checked = opts.muted;
  mute.addEventListener('change', () => opts.onMute(mute.checked));
  const muteLabel = el('label', 'intro-mute');
  muteLabel.htmlFor = mute.id;
  muteLabel.append(mute, el('span', '', 'Mute'));
  // Key hints are for a keyboard: a touch screen hides them (page.css).
  const hint = el('p', 'intro-hint intro-keys');
  hint.append(el('kbd', 'menu-key', 'Enter'), opts.hasSave ? ' Continue' : ' New game');
  // Over the art with no box: the title in the sky, the buttons on the shaded ground.
  const head = el('div', 'intro-head');
  head.append(title, tagline);
  const foot = el('div', 'intro-foot');
  foot.append(actions, muteLabel, hint);
  const titlePage = el('div', 'intro-page intro-title-page');
  titlePage.append(head, foot);

  // New game over a save: asked first.
  const question = el('p', 'intro-question', NEW_GAME_CONFIRM);
  question.id = 'intro-question';
  const accept = el('button', 'btn intro-action intro-danger', 'Start new game');
  accept.type = 'button';
  const back = el('button', 'btn btn-secondary intro-action', 'Back');
  back.type = 'button';
  const confirmRow = el('div', 'intro-actions');
  confirmRow.append(accept, back);
  // A step of the dialog, which takes the question as its label (no dialog inside a dialog).
  const confirmBox = el('div', 'intro-page intro-panel intro-confirm');
  confirmBox.append(question, confirmRow);

  // The how-to-play card.
  const cardTitle = el('h2', 'intro-card-title', 'How to play');
  cardTitle.id = 'intro-card-title';
  const skip = el('button', 'menu-close intro-skip', '×');
  skip.type = 'button';
  skip.setAttribute('aria-label', 'Skip how to play');
  const cardHead = el('div', 'intro-card-head');
  cardHead.append(cardTitle, skip);
  const list = el('dl', 'intro-how');
  for (const [term, text, keys] of HOW_TO_CARD) {
    const dd = el('dd', '', text);
    if (keys) dd.append(el('span', 'intro-keys', ` ${keys}`));
    list.append(el('dt', '', term), dd);
  }
  const got = el('button', 'btn btn-primary intro-action', 'Got it');
  got.type = 'button';
  const cardHint = el('p', 'intro-hint');
  const escSkips = el('span', 'intro-keys');
  escSkips.append(el('kbd', 'menu-key', 'Esc'), ' skips. ');
  cardHint.append(escSkips, 'Menu, then Help, shows this again.');
  const card = el('div', 'intro-page intro-panel intro-card');
  card.append(cardHead, list, got, cardHint);

  dialog.append(titlePage, confirmBox, card);

  function show(next: Step): void {
    step = next;
    scrim.hidden = next === 'closed';
    titlePage.hidden = next !== 'title';
    confirmBox.hidden = next !== 'confirm';
    card.hidden = next !== 'card';
    if (next === 'closed') {
      root.removeAttribute('inert');
      // The title art is for launch only: a card opened later from the Menu goes over plain dark.
      art?.remove();
      shade.remove();
      return;
    }
    root.setAttribute('inert', '');
    dialog.setAttribute(
      'aria-labelledby',
      next === 'card' ? cardTitle.id : next === 'confirm' ? question.id : title.id,
    );
    const focus =
      next === 'title' ? (opts.hasSave ? cont : fresh) : next === 'confirm' ? back : got;
    focus.focus();
  }

  /** Out of the title screen: the card on a first launch, else straight to the camp. */
  function leaveTitle(): void {
    if (opts.firstLaunch) {
      fromTitle = true;
      openCard();
      return;
    }
    show('closed');
    opts.onDone();
  }

  function openCard(): void {
    opts.onCardSeen();
    show('card');
  }

  function closeCard(): void {
    show('closed');
    if (fromTitle) {
      fromTitle = false;
      opts.onDone();
    } else if (returnTo?.isConnected) returnTo.focus();
    returnTo = null;
  }

  function newGame(): void {
    opts.onNewGame();
    leaveTitle();
  }

  cont.addEventListener('click', () => leaveTitle());
  fresh.addEventListener('click', () => (opts.hasSave ? show('confirm') : newGame()));
  accept.addEventListener('click', () => newGame());
  back.addEventListener('click', () => show('title'));
  got.addEventListener('click', () => closeCard());
  skip.addEventListener('click', () => closeCard());

  // Keys pressed here stay here: the field's keys (Esc for the Menu, cards) never see them.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (step === 'confirm') show('title');
      else if (step === 'card') closeCard();
      return;
    }
    if (e.key === 'Tab') {
      // Focus stays inside: round the shown controls.
      const shown = [...dialog.querySelectorAll<HTMLElement>('button, input')].filter(
        (n) => !n.hidden && !n.closest('[hidden]'),
      );
      const first = shown[0];
      const last = shown[shown.length - 1];
      if (!first || !last) return;
      const at = doc.activeElement;
      if (e.shiftKey && (at === first || !dialog.contains(at) || at === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !dialog.contains(at) || at === dialog)) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    // Enter on a button presses that button, on the Mute switch does nothing (Space toggles
    // it); anywhere else it is the main action.
    const t = e.target;
    if (e.key !== 'Enter' || t instanceof HTMLButtonElement || t instanceof HTMLInputElement) {
      return;
    }
    e.preventDefault();
    if (step === 'title') (opts.hasSave ? cont : fresh).click();
    else if (step === 'card') got.click();
  });

  show('title');

  return {
    isOpen: () => step !== 'closed',
    showCard() {
      if (step !== 'closed') return;
      const at = doc.activeElement;
      returnTo = at instanceof HTMLElement ? at : null;
      fromTitle = false;
      openCard();
    },
    setMuted(on) {
      mute.checked = on;
    },
  };
}
