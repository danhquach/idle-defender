// The Menu (ID-039, design §12): a dialog over the field with Settings, Save and Help.
// It opens from the top-right button or Esc (when Esc has nothing else to cancel); in a
// fight the game loop holds the fight while it is open. The field behind is inert and
// focus stays inside until it closes, then goes back to the Menu button.
import { newGame, type GameState } from '../core/game.ts';
import { exportCode, importCode, type ImportResult } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import { FIELD_GREW } from './build.ts';
import { el } from './hud.ts';

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

/** The Help tab's controls, grouped by when they apply. */
export const CONTROLS: readonly { group: string; rows: readonly (readonly [string, string])[] }[] =
  [
    {
      group: 'Field',
      rows: [
        ['W A S D or arrows', 'Pan the field (or drag it)'],
        ['Mouse wheel', 'Zoom in and out'],
      ],
    },
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
        ['Esc', 'Cancel a skill or deselect a defender'],
      ],
    },
    {
      group: 'Anywhere',
      rows: [['Esc', 'Open or close this menu (when there is nothing to cancel)']],
    },
  ];

/** The Help tab's how-to-play, in order. */
export const HOW_TO_PLAY: readonly (readonly [string, string])[] = [
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

/**
 * What "Load code" makes of `pasted`: a readable code's camp and the line to show once
 * it is loaded, or no camp and why.
 */
export function readCode(pasted: string): { game: GameState | null; message: string } {
  const result = importCode(pasted);
  if (!result.ok) return { game: null, message: IMPORT_REFUSAL[result.why] };
  const message = result.save.grew ? `${IMPORT_DONE} ${FIELD_GREW}` : IMPORT_DONE;
  return { game: result.save.game, message };
}

type Tab = 'settings' | 'save' | 'help';
const TABS: readonly [Tab, string][] = [
  ['settings', 'Settings'],
  ['save', 'Save'],
  ['help', 'Help'],
];

export interface MenuOptions {
  /** The camp now, and whether a fight is on. */
  state: () => { game: GameState; fighting: boolean };
  /** A loaded code's camp, to take as the game. */
  onLoad: (game: GameState) => void;
  /** A new camp, to take as the game. */
  onNewCamp: (game: GameState) => void;
  reduceMotion: boolean;
  onReduceMotion: (on: boolean) => void;
  /** Called as the menu opens. */
  onOpen: () => void;
}

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
      'Stops defenders and enemies bobbing and leaning. Starts on if your system asks for less motion.',
    ),
  );
  motionLabel.append(motion, motionText);
  panels
    .get('settings')!
    .append(
      section(el('h3', 'menu-heading', 'Settings'), motionLabel),
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
      opts.onNewCamp(newGame());
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

  // Keys pressed in the menu stay in it: the field's keys (pan, cards, Esc) never see them.
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
      opts.onOpen();
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
      const { game, fighting } = opts.state();
      if (game !== coded) code.value = exportCode(encodeSave(game, Date.now()));
      coded = game;
      chip.hidden = !fighting;
      fightNote.hidden = !fighting;
      hintText.textContent = fighting ? ' closes and resumes' : ' closes';
      done.textContent = fighting ? 'Resume' : 'Close';
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

/** A control's keys as key caps (single letters, digits, Esc), the rest as text. */
function keyLabel(text: string): HTMLElement {
  const dt = el('dt', '');
  text.split(' ').forEach((word, i) => {
    if (i > 0) dt.append(' ');
    dt.append(/^([A-Z0-9]|Esc)$/.test(word) ? el('kbd', '', word) : word);
  });
  return dt;
}

function section(...children: (HTMLElement | string)[]): HTMLElement {
  const s = el('section', 'menu-section');
  s.append(...children);
  return s;
}
