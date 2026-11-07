// The Menu (ID-039, design §12): a dialog over the field with Settings, Save and Help.
// It opens from the top-right button or Esc (when Esc has nothing else to cancel); in a
// fight the game loop holds the fight while it is open. The field behind is inert and
// focus stays inside until it closes, then goes back to the Menu button.
import { CHATTER_LEVELS, type ChatterLevel } from '../core/chatter.ts';
import { HORDE_ONLY } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode, importCode, type ImportResult } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import { clampVolume, VOLUMES, type SoundSettings, type Volume } from '../storage/settings.ts';
import { FIELD_GREW, STATS_REFUNDED } from './build.ts';
import { el, SKILL_KEYS, SPEED_KEYS, SQUAD_LOSS_RULE } from './hud.ts';

/** What the Save tab says about a refused code. */
export const IMPORT_REFUSAL: Readonly<Record<Extract<ImportResult, { ok: false }>['why'], string>> =
  {
    empty: 'Paste a backup code first.',
    tooBig: 'That is too long to be a backup code.',
    bad: "That code can't be read.",
  };
export const IMPORT_CONFIRM = 'Replace this camp with the one in the code? This camp is lost.';
export const IMPORT_DONE = 'Backup code loaded.';
export const NEW_CAMP_CONFIRM =
  'Start a new camp? This camp is lost unless you kept its backup code.';
export const NEW_CAMP_DONE = 'New camp started.';
export const FIGHT_REFUSAL = 'Between hordes only: a horde is on.';
export const FIGHT_NOTE =
  "A horde in progress isn't saved. Leaving now brings you back to the camp as it was before this horde.";

export type SaveStatus = 'ok' | 'off' | 'failed' | 'rejected';
/** The Save tab's status line, and how it is shown. */
export const SAVE_STATUS: Readonly<Record<SaveStatus, { text: string; tone: string }>> = {
  ok: { text: 'Saved in this browser after every change.', tone: 'ok' },
  off: { text: 'Saving is off: this browser blocks storage. Keep the backup code.', tone: 'warn' },
  failed: { text: "Couldn't save: this browser's storage is full or blocked.", tone: 'bad' },
  rejected: {
    text: "Your save couldn't be read, so a new camp started. The old save is kept aside.",
    tone: 'warn',
  },
};

type Controls = readonly { group: string; rows: readonly (readonly [string, string])[] }[];

/** The full game's Help tab controls, grouped by when they apply. */
const FULL_CONTROLS: Controls = [
  {
    group: 'Between hordes',
    rows: [
      ['Click a slot', 'Open it to build or repair'],
      ['Esc', 'Close the open slot'],
    ],
  },
  {
    group: 'In a horde',
    rows: [
      ['Click a defender, then a post', 'Move that defender'],
      ['Click an enemy', 'Everyone focuses it (click empty ground to clear)'],
      ['Click a skill', 'Use it; one that aims goes where you click next'],
      ['1 2 3', 'Pick a card when three are offered'],
      ['Space', 'Pause or resume the fight'],
      [Object.values(SPEED_KEYS).join(' '), 'Fight at 1×, 2× or 3× speed'],
      ['Esc', 'Cancel a skill or deselect a defender'],
    ],
  },
  {
    group: 'Anywhere',
    rows: [['Esc', 'Open or close this menu (when there is nothing to cancel)']],
  },
];

/** The horde-only build's controls (ID-066): no building or shop; the picked skills (ID-100). */
const SQUAD_CONTROLS: Controls = [
  {
    group: 'In a horde',
    rows: [
      ['Click a survivor, then a post', 'Move that survivor'],
      ['Click an enemy', 'Everyone focuses it (click empty ground to clear)'],
      [
        `Click a skill, or ${SKILL_KEYS.join(' ')}`,
        'Use a picked skill; Airstrike bombs the row you click next',
      ],
      ['1 2 3', 'Pick a card when three are offered'],
      ['Space', 'Pause or resume the fight'],
      [Object.values(SPEED_KEYS).join(' '), 'Fight at 1×, 2× or 3× speed'],
      ['Esc', 'Cancel a skill or deselect a survivor'],
    ],
  },
  {
    group: 'Anywhere',
    rows: [['Esc', 'Open or close this menu (when there is nothing to cancel)']],
  },
];

/** The Help tab's controls, grouped by when they apply. */
export const CONTROLS: Controls = HORDE_ONLY ? SQUAD_CONTROLS : FULL_CONTROLS;

type Steps = readonly (readonly [string, string])[];

/** The horde-only build's how-to-play (ID-066). */
const SQUAD_HOW_TO_PLAY: Steps = [
  [
    'Hold the wall.',
    `Your survivors shoot on their own. Click an enemy to focus it. ${SQUAD_LOSS_RULE}`,
  ],
  ['Level up in the fight.', 'Kills give fight XP. Each fight level offers three cards.'],
  [
    'Pick your skills.',
    'Before each horde, pick up to 2 skills to use on cooldown. Pick just 1 and it works twice as hard.',
  ],
  [
    'Win and grow.',
    'A win gives survivor XP and stat points, and a new survivor joins, up to a squad of 6.',
  ],
  [
    'Arm the squad.',
    'Every win drops a gun into the stash (20 at most). Between hordes, pick each survivor’s gun.',
  ],
  ['Lose and retry.', 'A loss costs nothing: the same horde comes again with everyone back.'],
  ['Beat the boss.', 'Every 10th horde ends with a boss.'],
];

/** The full game's how-to-play, in order. */
const FULL_HOW_TO_PLAY: Steps = [
  ['Build the camp.', 'Spend materials on walls, turrets and traps between hordes.'],
  ['Start a horde.', 'Pick a start defender and a post, then start the next horde.'],
  ['Hold the line.', 'Keep defenders up and walls standing. Each fight level offers cards.'],
  [
    'Win or retry.',
    'A win pays defender and camp XP. A loss leaves repairs and injuries, then you try the same horde again.',
  ],
  [
    'Send patrols.',
    'On the World map, patrols bring back loot in real time, even while the game is closed. Riskier places pay more.',
  ],
];

/** The Help tab's how-to-play, in order. */
export const HOW_TO_PLAY: Steps = HORDE_ONLY ? SQUAD_HOW_TO_PLAY : FULL_HOW_TO_PLAY;

/**
 * What "Load code" makes of `pasted`: a readable code's camp and the line to show once
 * it is loaded, or no camp and why.
 */
export function readCode(pasted: string): { game: GameState | null; message: string } {
  const result = importCode(pasted);
  if (!result.ok) return { game: null, message: IMPORT_REFUSAL[result.why] };
  const notes = [
    ...(result.save.grew ? [FIELD_GREW] : []),
    ...(result.save.refunded ? [STATS_REFUNDED] : []),
  ];
  const message = [IMPORT_DONE, ...notes].join(' ');
  return { game: result.save.game, message };
}

type Tab = 'settings' | 'save' | 'help';
const TABS: readonly [Tab, string][] = [
  ['settings', 'Settings'],
  ['save', 'Save'],
  ['help', 'Help'],
];

export interface MenuOptions {
  /** The camp now, whether a fight is on, and whether Space holds it (ID-062). */
  state: () => { game: GameState; fighting: boolean; held: boolean };
  /** A loaded code's camp, to take as the game. */
  onLoad: (game: GameState) => void;
  /** A new camp, to take as the game. */
  onNewCamp: (game: GameState) => void;
  reduceMotion: boolean;
  onReduceMotion: (on: boolean) => void;
  /** The sound settings at load (ID-080); a change is applied and stored by the caller. */
  sound: SoundSettings;
  onVolume: (which: Volume, level: number) => void;
  /** A slider let go: a sample sound at the new level. */
  onVolumeSet: (which: Volume) => void;
  onMute: (on: boolean) => void;
  /** How much survivors say in a fight (ID-085); a change is applied and stored by the caller. */
  chatter: ChatterLevel;
  onChatter: (level: ChatterLevel) => void;
}

/** The chatter levels' names, in the order shown (ID-085). */
export const CHATTER_LABEL: Readonly<Record<ChatterLevel, string>> = {
  off: 'Off',
  low: 'Low',
  full: 'Full',
};

/** The volume sliders' labels, in the order shown (ID-080). */
export const VOLUME_LABEL: Readonly<Record<Volume, string>> = {
  master: 'Master volume',
  music: 'Music',
  effects: 'Sound effects',
};

export interface Menu {
  isOpen(): boolean;
  open(): void;
  close(): void;
  /** Re-reads the camp and the fight: call when either changes. */
  refresh(): void;
  /** Sets the Save tab's status line; saving off or refused also marks the Menu button. */
  status(status: SaveStatus): void;
}

export function createMenu(root: HTMLElement, opts: MenuOptions): Menu {
  const doc = root.ownerDocument;
  let opened = false;
  let tab: Tab = 'settings';
  let saveStatus: SaveStatus = 'ok';
  // The camp the backup code shows: it is rewritten only when the camp changes, so a
  // selection being copied isn't lost to a redraw.
  let coded: GameState | null = null;

  // The button, top-right in both modes.
  const button = el('button', 'menu-button', 'Menu');
  button.type = 'button';
  button.title = 'Menu (Esc)';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', 'Menu');
  button.append(el('kbd', 'menu-key', 'Esc'), el('span', 'menu-dot'));
  button.addEventListener('click', () => api.open());
  root.append(button);

  // The dialog sits outside `root` so the field can go inert behind it.
  const scrim = el('div', 'menu-scrim');
  scrim.hidden = true;
  const dialog = el('div', 'menu');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'menu-title');
  dialog.tabIndex = -1;
  scrim.append(dialog);
  doc.body.append(scrim);
  // A click on the backdrop neither closes the menu nor takes focus out of it.
  scrim.addEventListener('mousedown', (e) => {
    if (e.target === scrim) e.preventDefault();
  });

  const title = el('h2', 'menu-title', 'Menu');
  title.id = 'menu-title';
  const chip = el('span', 'menu-chip', 'Paused');
  chip.setAttribute('role', 'status');
  const closeX = el('button', 'menu-close', '×');
  closeX.type = 'button';
  closeX.setAttribute('aria-label', 'Close menu');
  closeX.addEventListener('click', () => api.close());
  const head = el('div', 'menu-head');
  head.append(title, chip, closeX);

  const tablist = el('div', 'menu-tabs');
  tablist.setAttribute('role', 'tablist');
  const tabs = new Map<Tab, HTMLButtonElement>();
  const panels = new Map<Tab, HTMLElement>();
  for (const [id, label] of TABS) {
    const t = el('button', 'menu-tab', label);
    t.type = 'button';
    t.id = `menu-tab-${id}`;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', `menu-panel-${id}`);
    t.addEventListener('click', () => select(id, true));
    tabs.set(id, t);
    tablist.append(t);
    const p = el('div', 'menu-body');
    p.id = `menu-panel-${id}`;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', t.id);
    panels.set(id, p);
  }

  const hint = el('span', 'menu-hint');
  const hintText = el('span', '');
  hint.append(el('kbd', 'menu-key', 'Esc'), hintText);
  const done = el('button', 'hud-button', 'Close');
  done.type = 'button';
  done.addEventListener('click', () => api.close());
  const foot = el('div', 'menu-foot');
  foot.append(hint, done);
  dialog.append(head, tablist, ...panels.values(), foot);

  // Settings.
  const motion = el('input', 'menu-check-box');
  motion.type = 'checkbox';
  motion.id = 'menu-reduce-motion';
  motion.checked = opts.reduceMotion;
  motion.addEventListener('change', () => opts.onReduceMotion(motion.checked));
  const motionLabel = el('label', 'menu-check');
  motionLabel.htmlFor = motion.id;
  const motionText = el('span', '');
  motionText.append(
    el('b', 'menu-check-title', 'Reduce motion'),
    el(
      'span',
      'menu-note',
      'Stops defenders and enemies bobbing and leaning, and speech bubbles popping in. Starts on if your system asks for less motion.',
    ),
  );
  motionLabel.append(motion, motionText);

  // Chatter (ID-085): survivors' speech bubbles in a fight, Off, Low or Full.
  const chatter = el('select', 'build-select menu-select');
  chatter.id = 'menu-chatter';
  for (const level of CHATTER_LEVELS) {
    const option = el('option', '', CHATTER_LABEL[level]);
    option.value = level;
    chatter.append(option);
  }
  chatter.value = opts.chatter;
  chatter.addEventListener('change', () => {
    const level = CHATTER_LEVELS.find((l) => l === chatter.value);
    if (level) opts.onChatter(level);
  });
  const chatterLabel = el('label', 'menu-check-title', 'Chatter');
  chatterLabel.htmlFor = chatter.id;
  const chatterRow = el('div', 'menu-choice');
  chatterRow.append(chatterLabel, chatter);
  const chatterNote = el(
    'span',
    'menu-note',
    'Speech bubbles over survivors in a fight. Low: only big moments, one at a time. Full: everything.',
  );
  const chatterBox = el('div', 'menu-choice-box');
  chatterBox.append(chatterRow, chatterNote);

  // Sound (ID-080): three sliders and a mute switch, applied as they move.
  const sliders = VOLUMES.map((which) => {
    const input = el('input', 'menu-range-input');
    input.type = 'range';
    input.id = `menu-volume-${which}`;
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(clampVolume(opts.sound.volumes[which]));
    const value = el('output', 'menu-range-value', `${input.value}%`);
    value.htmlFor.add(input.id);
    // The slider says its own value; the readout mustn't say it again.
    value.setAttribute('aria-hidden', 'true');
    input.setAttribute('aria-valuetext', `${input.value}%`);
    input.addEventListener('input', () => {
      const level = clampVolume(Number(input.value));
      value.textContent = `${level}%`;
      input.setAttribute('aria-valuetext', `${level}%`);
      opts.onVolume(which, level);
    });
    // Let go of the slider: one sample sound at the new level.
    input.addEventListener('change', () => opts.onVolumeSet(which));
    const label = el('label', 'menu-range-label', VOLUME_LABEL[which]);
    label.htmlFor = input.id;
    const row = el('div', 'menu-range');
    row.append(label, input, value);
    return row;
  });
  const mute = el('input', 'menu-check-box');
  mute.type = 'checkbox';
  mute.id = 'menu-mute';
  mute.checked = opts.sound.muted;
  // Muted, the sliders dim (they still move, and their levels come back on unmute).
  const dim = (): void => {
    for (const row of sliders) row.classList.toggle('menu-range-muted', mute.checked);
  };
  dim();
  mute.addEventListener('change', () => {
    dim();
    opts.onMute(mute.checked);
  });
  const muteLabel = el('label', 'menu-check');
  muteLabel.htmlFor = mute.id;
  const muteText = el('span', '');
  muteText.append(
    el('b', 'menu-check-title', 'Mute'),
    el('span', 'menu-note', 'Silences music and sound effects. The volumes are kept.'),
  );
  muteLabel.append(mute, muteText);

  panels
    .get('settings')!
    .append(
      section(el('h3', 'menu-heading', 'Settings'), motionLabel, chatterBox),
      section(el('h3', 'menu-heading', 'Sound'), ...sliders, muteLabel),
      el('p', 'menu-note', 'Settings stay in this browser. They are not part of the backup code.'),
    );

  // Save.
  const statusLine = el('p', 'menu-status');
  statusLine.setAttribute('role', 'status');
  const fightNote = el('p', 'menu-note', FIGHT_NOTE);
  const code = el('textarea', 'build-code menu-code');
  code.readOnly = true;
  code.rows = 3;
  code.setAttribute('aria-label', 'Backup code for this camp');
  code.addEventListener('focus', () => code.select());
  const paste = el('textarea', 'build-code menu-code');
  paste.rows = 2;
  paste.placeholder = 'Paste a backup code';
  paste.setAttribute('aria-label', 'Backup code to load');

  /** A button with its two-step confirm and its result line; `ask` gives the action, or why not. */
  function confirmed(
    label: string,
    question: string,
    yes: string,
    ask: () => { run: () => string } | { refused: string },
  ) {
    const trigger = el('button', 'build-option menu-action', label);
    trigger.type = 'button';
    const reason = el('p', 'build-option-reason', FIGHT_REFUSAL);
    const message = el('p', 'build-slot-note');
    message.setAttribute('role', 'status');
    const box = el('div', 'menu-confirm');
    box.setAttribute('role', 'alertdialog');
    const q = el('p', '', question);
    q.id = `menu-confirm-${label.toLowerCase().replace(/ /g, '-')}`;
    box.setAttribute('aria-labelledby', q.id);
    const accept = el('button', 'build-option menu-action menu-danger', yes);
    accept.type = 'button';
    const keep = el('button', 'build-option menu-action', 'Keep this camp');
    keep.type = 'button';
    const row = el('div', 'menu-row');
    row.append(accept, keep);
    box.append(q, row);
    box.hidden = true;
    let pending: (() => string) | null = null;
    const cancel = (): void => {
      box.hidden = true;
      trigger.hidden = false;
      pending = null;
    };
    trigger.addEventListener('click', () => {
      const asked = ask();
      if ('refused' in asked) {
        message.textContent = asked.refused;
        return;
      }
      message.textContent = '';
      pending = asked.run;
      trigger.hidden = true;
      box.hidden = false;
      keep.focus();
    });
    accept.addEventListener('click', () => {
      const run = pending;
      cancel();
      if (run) message.textContent = run();
      trigger.focus();
    });
    keep.addEventListener('click', () => {
      cancel();
      trigger.focus();
    });
    return { trigger, reason, message, box, cancel, open: () => !box.hidden };
  }

  const load = confirmed('Load code', IMPORT_CONFIRM, 'Replace camp', () => {
    const { game, message } = readCode(paste.value);
    if (!game) return { refused: message };
    return {
      run: () => {
        paste.value = '';
        opts.onLoad(game);
        return message;
      },
    };
  });
  const fresh = confirmed('New camp', NEW_CAMP_CONFIRM, 'Start new camp', () => ({
    run: () => {
      opts.onNewCamp(newGame(HORDE_ONLY ? 'horde' : 'full'));
      return NEW_CAMP_DONE;
    },
  }));
  const confirms = [load, fresh];
  // A code edited after "Load code" asked is not the one it asked about.
  paste.addEventListener('input', () => load.cancel());
  panels
    .get('save')!
    .append(
      section(statusLine, fightNote),
      section(
        el('h3', 'menu-heading', 'Backup code'),
        el('p', 'menu-note', 'Keep it somewhere safe; paste it back to restore this camp.'),
        code,
      ),
      section(
        el('h3', 'menu-heading', 'Load a backup code'),
        paste,
        load.trigger,
        load.reason,
        load.box,
        load.message,
      ),
      section(
        el('h3', 'menu-heading', 'New camp'),
        el('p', 'menu-note', 'Start over from Horde 1.'),
        fresh.trigger,
        fresh.reason,
        fresh.box,
        fresh.message,
      ),
    );

  // Help.
  const keys = el('dl', 'menu-keys');
  for (const { group, rows } of CONTROLS) {
    keys.append(el('dt', 'menu-group', group));
    for (const [k, what] of rows) keys.append(keyLabel(k), el('dd', '', what));
  }
  const how = el('ol', 'menu-how');
  for (const [step, text] of HOW_TO_PLAY) {
    const li = el('li', '');
    li.append(el('b', '', step), ` ${text}`);
    how.append(li);
  }
  panels
    .get('help')!
    .append(
      section(el('h3', 'menu-heading', 'Controls'), keys),
      section(el('h3', 'menu-heading', 'How to play'), how),
    );

  function select(next: Tab, focus: boolean): void {
    // A confirm left open on a hidden tab would catch the next Esc unseen.
    if (next !== tab) for (const c of confirms) c.cancel();
    tab = next;
    for (const [id, t] of tabs) {
      const on = id === next;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels.get(id)!.hidden = !on;
    }
    if (focus) tabs.get(next)!.focus();
  }

  /** What Tab may land on inside the dialog: shown, enabled controls. */
  function focusables(): HTMLElement[] {
    return [
      ...dialog.querySelectorAll<HTMLElement>('button, textarea, input, [tabindex="0"]'),
    ].filter(
      (n) =>
        n.tabIndex >= 0 &&
        !(n as HTMLButtonElement).disabled &&
        !n.closest('[hidden]') &&
        !n.hidden,
    );
  }

  // Keys pressed in the menu stay in it: the field's keys (cards, Esc) never see them.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      // The Esc held down that opened the menu mustn't close it again.
      if (e.repeat) return;
      const open = confirms.find((c) => c.open());
      if (open) {
        open.cancel();
        open.trigger.focus();
      } else api.close();
      return;
    }
    if (e.key === 'Tab') {
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
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
    const index = TABS.findIndex(([id]) => tabs.get(id) === e.target);
    if (index < 0) return;
    const moves: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    select(TABS[(moves[e.key]! + TABS.length) % TABS.length]![0], true);
  });

  function showStatus(): void {
    const { text, tone } = SAVE_STATUS[saveStatus];
    statusLine.textContent = text;
    statusLine.className = `menu-status menu-status-${tone}`;
    const alert = saveStatus === 'off' || saveStatus === 'failed';
    button.classList.toggle('menu-alert', alert);
    button.setAttribute('aria-label', alert ? 'Menu, saving problem' : 'Menu');
  }

  const api: Menu = {
    isOpen: () => opened,
    open() {
      if (opened) return;
      opened = true;
      for (const c of confirms) c.cancel();
      load.message.textContent = '';
      fresh.message.textContent = '';
      scrim.hidden = false;
      root.setAttribute('inert', '');
      api.refresh();
      const alert = saveStatus === 'off' || saveStatus === 'failed';
      select(alert ? 'save' : tab, true);
    },
    close() {
      if (!opened) return;
      opened = false;
      for (const c of confirms) c.cancel();
      scrim.hidden = true;
      root.removeAttribute('inert');
      button.focus();
    },
    refresh() {
      if (!opened) return;
      const { game, fighting, held } = opts.state();
      if (game !== coded) code.value = exportCode(encodeSave(game, Date.now()));
      coded = game;
      chip.hidden = !fighting;
      fightNote.hidden = !fighting;
      // Closing over a Space pause leaves the fight held.
      const resumes = fighting && !held;
      hintText.textContent = resumes ? ' closes and resumes' : ' closes';
      done.textContent = resumes ? 'Resume' : 'Close';
      for (const c of confirms) {
        c.trigger.disabled = fighting;
        c.reason.hidden = !fighting;
        if (fighting) c.cancel();
      }
    },
    status(next) {
      saveStatus = next;
      showStatus();
    },
  };
  select(tab, false);
  showStatus();
  return api;
}

/** A control's keys as key caps (single letters, digits, Esc, Space), the rest as text. */
function keyLabel(text: string): HTMLElement {
  const dt = el('dt', '');
  text.split(' ').forEach((word, i) => {
    if (i > 0) dt.append(' ');
    dt.append(/^([A-Z0-9]|Esc|Space)$/.test(word) ? el('kbd', '', word) : word);
  });
  return dt;
}

function section(...children: (HTMLElement | string)[]): HTMLElement {
  const s = el('section', 'menu-section');
  s.append(...children);
  return s;
}
