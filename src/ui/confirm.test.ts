// @vitest-environment jsdom
// ID-191: the game's own confirm panel — Confirm, Cancel, Esc, a click outside and Enter;
// focus in and back; one panel at a time; the question only ever text; the page behind inert.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askConfirm } from './confirm.ts';
import { flush } from './testing.ts';

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('.confirm-scrim');
const yes = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.confirm-yes')!;
const no = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.confirm-no')!;
const key = (
  k: string,
  init: KeyboardEventInit = {},
  on: EventTarget = document.activeElement!,
) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  on.dispatchEvent(e);
  return e;
};

let opener: HTMLButtonElement;
let app: HTMLElement;
beforeEach(() => {
  app = document.createElement('div');
  opener = document.createElement('button');
  opener.textContent = 'Open';
  app.append(opener);
  document.body.replaceChildren(app);
  opener.focus();
});
afterEach(() => {
  // Whatever a test left up.
  document.querySelector('.confirm-no')?.dispatchEvent(new MouseEvent('click'));
  vi.restoreAllMocks();
});

describe('askConfirm', () => {
  it('shows the question with Confirm and Cancel, as an alert dialog named by the question', () => {
    void askConfirm('Buy 1 squad slot for 500 Scrap?');
    const dialog = panel()!.querySelector('[role="alertdialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const q = dialog.querySelector('.confirm-question')!;
    expect(q.textContent).toBe('Buy 1 squad slot for 500 Scrap?');
    expect(dialog.getAttribute('aria-labelledby')).toBe(q.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(q.id);
    expect(yes().textContent).toBe('Confirm');
    expect(no().textContent).toBe('Cancel');
    // Sits on the page itself, outside the game's root, so the Roster and Inventory scrims
    // (also on the body) are under it.
    expect(panel()!.parentElement).toBe(document.body);
  });

  it('Confirm resolves true and takes the panel away', async () => {
    const answer = askConfirm('Sure?');
    yes().click();
    expect(await answer).toBe(true);
    expect(panel()).toBeNull();
  });

  it('Cancel resolves false', async () => {
    const answer = askConfirm('Sure?');
    no().click();
    expect(await answer).toBe(false);
    expect(panel()).toBeNull();
  });

  it('Esc cancels', async () => {
    const answer = askConfirm('Sure?');
    const e = key('Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(await answer).toBe(false);
    expect(panel()).toBeNull();
  });

  it('a held-down Esc (a repeat) does not cancel', async () => {
    const answer = askConfirm('Sure?');
    key('Escape', { repeat: true });
    expect(panel()).not.toBeNull();
    key('Escape');
    expect(await answer).toBe(false);
  });

  it('a click on the backdrop cancels; a click inside the panel does not', async () => {
    const answer = askConfirm('Sure?');
    panel()!.querySelector<HTMLElement>('.confirm-question')!.click();
    panel()!.querySelector<HTMLElement>('.confirm-dialog')!.click();
    await flush();
    expect(panel()).not.toBeNull();
    panel()!.click();
    expect(await answer).toBe(false);
    expect(panel()).toBeNull();
  });

  it('a press that began inside the panel and ended on the backdrop does not cancel', async () => {
    const answer = askConfirm('Sure?');
    panel()!
      .querySelector('.confirm-question')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    panel()!.click();
    expect(panel()).not.toBeNull();
    // The next whole click on the backdrop does.
    panel()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    panel()!.click();
    expect(await answer).toBe(false);
  });

  it('Enter confirms, once, and its default (a button press) is stopped', async () => {
    const answer = askConfirm('Sure?');
    const e = key('Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(await answer).toBe(true);
    // The panel is gone: a second Enter finds nothing to confirm.
    expect(panel()).toBeNull();
  });

  it("Enter with focus on Cancel is the button's own press, not a confirm", async () => {
    const answer = askConfirm('Sure?');
    no().focus();
    const e = key('Enter');
    expect(e.defaultPrevented).toBe(false);
    expect(panel()).not.toBeNull();
    // What the browser does next with that Enter: press the button.
    no().click();
    expect(await answer).toBe(false);
  });

  it('a held-down Enter (a repeat) neither confirms nor presses a button', () => {
    void askConfirm('Sure?');
    const e = key('Enter', { repeat: true });
    expect(e.defaultPrevented).toBe(true);
    expect(panel()).not.toBeNull();
  });

  it('its keys never reach the page behind: a dialog under it, nor a game shortcut', async () => {
    const behind = vi.fn();
    const onDocument = vi.fn();
    app.addEventListener('keydown', behind);
    document.body.addEventListener('keydown', behind);
    document.addEventListener('keydown', onDocument);
    const answer = askConfirm('Sure?');
    key('a');
    key('Escape');
    await answer;
    expect(behind).not.toHaveBeenCalled();
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onDocument);
  });

  it('focus starts on Confirm, Tab stays on the two buttons, and it returns to the opener', async () => {
    const answer = askConfirm('Sure?');
    expect(document.activeElement).toBe(yes());
    key('Tab');
    // Past Cancel (the last) it wraps to Confirm; from Confirm, Shift+Tab wraps to Cancel.
    no().focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(yes());
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(no());
    // Focus that got out is pulled back in.
    opener.focus();
    key('Tab');
    expect(document.activeElement).toBe(yes());
    no().click();
    await answer;
    expect(document.activeElement).toBe(opener);
  });

  it('the page behind is inert while it is up, and what was inert already stays so', async () => {
    const other = document.createElement('div');
    other.setAttribute('inert', '');
    document.body.append(other);
    const answer = askConfirm('Sure?');
    expect(app.hasAttribute('inert')).toBe(true);
    expect(panel()!.hasAttribute('inert')).toBe(false);
    yes().click();
    await answer;
    expect(app.hasAttribute('inert')).toBe(false);
    expect(other.hasAttribute('inert')).toBe(true);
  });

  it('the question is text, never markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    void askConfirm(hostile, { confirm: '<b>Go</b>', cancel: '<i>Stop</i>' });
    expect(panel()!.querySelector('img, script, b, i')).toBeNull();
    expect(panel()!.querySelector('.confirm-question')!.textContent).toBe(hostile);
    expect(yes().textContent).toBe('<b>Go</b>');
    expect(no().textContent).toBe('<i>Stop</i>');
  });

  it('takes its button labels and a danger look from the options', () => {
    void askConfirm('Let Ava go?', { confirm: 'Let go', cancel: 'Keep', danger: true });
    expect(yes().textContent).toBe('Let go');
    expect(no().textContent).toBe('Keep');
    expect(yes().classList.contains('menu-danger')).toBe(true);
    expect(no().classList.contains('menu-danger')).toBe(false);
  });

  it('a second ask while one is up cancels the first and shows only the new one', async () => {
    const first = askConfirm('First?');
    const second = askConfirm('Second?');
    expect(await first).toBe(false);
    expect(document.querySelectorAll('.confirm-scrim')).toHaveLength(1);
    expect(panel()!.querySelector('.confirm-question')!.textContent).toBe('Second?');
    // Focus and inertness are as for one panel: the opener is still the first opener.
    expect(app.hasAttribute('inert')).toBe(true);
    yes().click();
    expect(await second).toBe(true);
    expect(app.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('a double-click on the opener does not cancel it at once', async () => {
    const answer = askConfirm('Sure?');
    // The second click of a double-click lands on the backdrop with detail 2.
    panel()!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    expect(panel()).not.toBeNull();
    panel()!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(await answer).toBe(false);
  });

  it('bidi, zero-width and newline characters stay exactly as text: one text node, no elements', () => {
    const odd = 'Ava\u202E go\u200B?\nSure';
    void askConfirm(odd);
    const q = panel()!.querySelector('.confirm-question')!;
    expect(q.textContent).toBe(odd);
    expect(q.childNodes).toHaveLength(1);
    expect(q.firstChild!.nodeType).toBe(Node.TEXT_NODE);
    expect(q.children).toHaveLength(0);
  });

  it('a 2,000-character question still has both buttons, focus on Confirm', () => {
    void askConfirm('long '.repeat(400));
    expect(panel()!.querySelector('.confirm-question')!.textContent).toHaveLength(2000);
    expect(yes()).not.toBeNull();
    expect(no()).not.toBeNull();
    expect(document.activeElement).toBe(yes());
  });

  it('answers once: a late Confirm after Esc changes nothing', async () => {
    const answer = askConfirm('Sure?');
    const stale = yes();
    key('Escape');
    stale.click();
    expect(await answer).toBe(false);
  });
});
