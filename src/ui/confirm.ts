// The game's own confirm (ID-191): one small modal in the game's dialog style, in place of the
// browser's `window.confirm`. A question, a Confirm button and a Cancel button; it resolves
// true on Confirm or Enter, false on Cancel, Esc or a click on the backdrop. Like the Menu it
// sits outside `root`, and everything else on the page goes inert behind it. It is the
// topmost layer, so it opens from inside the Roster or the Inventory too: its keys are taken
// on the document in the capture phase, so they never reach the dialog underneath (Esc
// cancels only the confirm) nor the game's shortcuts. The question reaches the page only as
// text. Focus starts on Confirm (Enter confirms), stays inside, and goes back to the opener.
import { el } from './hud.ts';
import { refreshFields } from './shield.ts';
import type { Refused } from './text/index.ts';

export interface ConfirmOptions {
  /** The Confirm button's label (default "Confirm"). */
  confirm?: string;
  /** The Cancel button's label (default "Cancel"). */
  cancel?: string;
  /** A one-way action: Confirm is drawn in the danger colour. */
  danger?: boolean;
}

/** The panel that is up, if any: a second ask cancels it first, so there is only ever one. */
let current: { cancel(): void } | null = null;
let serial = 0;

/**
 * Asks `question` in the game's own panel: true on Confirm (or Enter), false on Cancel, Esc
 * or a click outside the panel. Only one panel is up at a time: asking again while one is
 * open resolves the open one as cancelled, then shows the new one.
 */
export function askConfirm(question: string, opts: ConfirmOptions = {}): Promise<boolean> {
  current?.cancel();
  const doc = document;
  const opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const id = `confirm-q-${++serial}`;

  const scrim = el('div', 'confirm-scrim');
  const dialog = el('div', 'confirm-dialog');
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', id);
  dialog.setAttribute('aria-describedby', id);
  const text = el('p', 'confirm-question', question);
  text.id = id;
  const accept = el(
    'button',
    `build-option menu-action${opts.danger ? ' menu-danger' : ''}`,
    opts.confirm ?? 'Confirm',
  );
  accept.type = 'button';
  accept.classList.add('confirm-yes');
  const keep = el('button', 'build-option menu-action confirm-no', opts.cancel ?? 'Cancel');
  keep.type = 'button';
  const row = el('div', 'menu-row confirm-actions');
  row.append(accept, keep);
  dialog.append(text, row);
  scrim.append(dialog);

  // The rest of the page is inert while the panel is up; what was already inert stays so.
  const inerted: Element[] = [];
  for (const node of doc.body.children) {
    if (node !== scrim && !node.hasAttribute('inert')) {
      node.setAttribute('inert', '');
      inerted.push(node);
    }
  }
  doc.body.append(scrim);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const handle = { cancel: () => finish(false) };
    function finish(answer: boolean): void {
      if (settled) return;
      settled = true;
      doc.removeEventListener('keydown', onKey, true);
      scrim.remove();
      for (const node of inerted) node.removeAttribute('inert');
      // A sheet's field that was made inert while this was up (the phone turned) is again.
      refreshFields();
      if (current === handle) current = null;
      if (opener?.isConnected) opener.focus();
      resolve(answer);
    }
    function onKey(e: KeyboardEvent): void {
      // Nothing reaches the dialog underneath or the game's shortcuts.
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        // The Esc held down that opened a dialog mustn't answer this one.
        if (!e.repeat) finish(false);
      } else if (e.key === 'Enter') {
        // On Cancel, Enter is the button's own press (its click); otherwise it confirms.
        if (e.repeat) e.preventDefault();
        else if (doc.activeElement !== keep) {
          e.preventDefault();
          finish(true);
        }
      } else if (e.key === 'Tab') {
        const at = doc.activeElement;
        const first = e.shiftKey ? keep : accept;
        const last = e.shiftKey ? accept : keep;
        if (at === last || !dialog.contains(at)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    doc.addEventListener('keydown', onKey, true);
    accept.addEventListener('click', () => finish(true));
    keep.addEventListener('click', () => finish(false));
    // A click on the backdrop cancels, unless the press began inside the panel (a drag that
    // ends outside it, say while selecting text); the backdrop never takes focus.
    let pressedInside = false;
    scrim.addEventListener('mousedown', (e) => {
      pressedInside = dialog.contains(e.target as Node);
      if (e.target === scrim) e.preventDefault();
    });
    scrim.addEventListener('click', (e) => {
      e.stopPropagation();
      // A double-click on the opener lands its second click here: that is no cancel.
      if (e.detail > 1) return;
      const inside = pressedInside;
      pressedInside = false;
      if (e.target === scrim && !inside) finish(false);
    });
    current = handle;
    accept.focus();
  });
}

/**
 * What an action that asks first reports: what to say once done, why not, or null when the
 * player said no (nothing changed).
 */
export type Answer = { ok: true; text: string } | Refused | null;

/** Said when the camp changed while the question was open: nothing was done. */
export const ASK_CHANGED = 'That changed while you were deciding. Nothing was done: try again.';
