// @vitest-environment jsdom
// ID-039: the Menu — its button and Esc, focus kept inside, the Save tab's code, load and
// new camp (asked first, off in a fight), the save-problem dot, Reduce motion and Help.
import { describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import { NOW, oldStock, prePatrol } from '../storage/testing.ts';
import { escapeAction, frameStep } from './app.ts';
import { FIELD_GREW } from './build.ts';
import {
  CONTROLS,
  createMenu,
  FIGHT_REFUSAL,
  HOW_TO_PLAY,
  IMPORT_CONFIRM,
  IMPORT_DONE,
  IMPORT_REFUSAL,
  NEW_CAMP_CONFIRM,
  NEW_CAMP_DONE,
  readCode,
  SAVE_STATUS,
  type MenuOptions,
} from './menu.ts';

function setup(over: Partial<MenuOptions> & { fighting?: boolean; game?: GameState } = {}) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let game = over.game ?? newGame();
  let fighting = over.fighting ?? false;
  const loaded: GameState[] = [];
  const fresh: GameState[] = [];
  const motion: boolean[] = [];
  const menu = createMenu(root, {
    state: () => ({ game, fighting }),
    onLoad: (g) => (loaded.push(g), (game = g)),
    onNewCamp: (g) => (fresh.push(g), (game = g)),
    reduceMotion: over.reduceMotion ?? false,
    onReduceMotion: (on) => motion.push(on),
  });
  const scrim = document.querySelector<HTMLElement>('.menu-scrim')!;
  const dialog = scrim.querySelector<HTMLElement>('[role="dialog"]')!;
  const menuButton = root.querySelector<HTMLButtonElement>('.menu-button')!;
  const button = (label: string): HTMLButtonElement => {
    const found = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent === label && !b.closest('[hidden]') && !b.hidden,
    );
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };
  const tab = (name: string) => dialog.querySelector<HTMLButtonElement>(`#menu-tab-${name}`)!;
  const panel = (name: string) => dialog.querySelector<HTMLElement>(`#menu-panel-${name}`)!;
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  const paste = dialog.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Backup code to load"]',
  )!;
  const code = dialog.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Backup code for this camp"]',
  )!;
  const fight = (on: boolean) => {
    fighting = on;
    menu.refresh();
  };
  return {
    root,
    menu,
    scrim,
    dialog,
    menuButton,
    button,
    tab,
    panel,
    key,
    paste,
    code,
    loaded,
    fresh,
    motion,
    fight,
  };
}

describe('readCode', () => {
  it('says why a code is refused', () => {
    expect(readCode('')).toEqual({ game: null, message: IMPORT_REFUSAL.empty });
    expect(readCode('ID1:' + 'A'.repeat(200_000))).toEqual({
      game: null,
      message: IMPORT_REFUSAL.tooBig,
    });
    expect(readCode('ID1:nope')).toEqual({ game: null, message: IMPORT_REFUSAL.bad });
    expect(readCode('<img src=x onerror=alert(1)>')).toEqual({
      game: null,
      message: IMPORT_REFUSAL.bad,
    });
  });

  it('a good code gives its camp; an old one says the field grew', () => {
    const g = { ...newGame(), hordeNumber: 5 };
    expect(readCode(exportCode(encodeSave(g, NOW)))).toEqual({ game: g, message: IMPORT_DONE });
    // A code from before the taller field (a v1 save, 5 rows) says the field grew.
    const old = JSON.parse(encodeSave(g, NOW));
    old.v = 1;
    old.game = prePatrol(g);
    old.game.stock = oldStock(g);
    old.game.base.layers[0].slots = old.game.base.layers[0].slots.slice(3, 8);
    old.game.base.posts = old.game.base.posts.map((p: { row: number }) => ({
      ...p,
      row: p.row - 3,
    }));
    const loaded = readCode(exportCode(JSON.stringify(old)));
    expect(loaded.message).toBe(`${IMPORT_DONE} ${FIELD_GREW}`);
    expect(loaded.game?.base.posts).toEqual(g.base.posts);
  });
});

describe('Esc and the frame step (app.ts)', () => {
  const s = { fighting: false, armed: false, slot: false, defender: false };
  it('Esc cancels first, in order, and opens the menu only with nothing to cancel', () => {
    expect(escapeAction({ ...s, fighting: true, armed: true, defender: true })).toBe('disarm');
    expect(escapeAction({ ...s, fighting: true, defender: true })).toBe('defender');
    expect(escapeAction({ ...s, slot: true })).toBe('slot');
    expect(escapeAction(s)).toBe('menu');
    expect(escapeAction({ ...s, fighting: true })).toBe('menu');
    // A stale slot in a fight, or a skill in build mode, doesn't stop the menu.
    expect(escapeAction({ ...s, fighting: true, slot: true })).toBe('menu');
    expect(escapeAction({ ...s, armed: true, defender: true })).toBe('menu');
  });

  it('a paused frame (the menu open) advances nothing, and resumes without a jump', () => {
    expect(frameStep(1000, 1016, false)).toBeCloseTo(0.016);
    expect(frameStep(1000, 1016, true)).toBe(0);
    // The first frame after the pause has no last time: it doesn't count the pause.
    expect(frameStep(null, 60_000, false)).toBe(0);
    expect(frameStep(1000, 9000, false)).toBe(0.1);
  });
});

describe('the Menu', () => {
  it('the button opens a modal dialog; the field goes inert and focus lands on the tab', () => {
    const { root, scrim, dialog, menuButton, menu, tab } = setup();
    expect(menuButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(menuButton.title).toBe('Menu (Esc)');
    expect(scrim.hidden).toBe(true);
    menuButton.click();
    expect(menu.isOpen()).toBe(true);
    expect(scrim.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
    expect(root.contains(scrim)).toBe(false);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Menu',
    );
    expect(document.activeElement).toBe(tab('settings'));
  });

  it('Close, ×, and Esc close it, and focus goes back to the Menu button', () => {
    const { root, menu, menuButton, button, dialog, key } = setup();
    for (const close of [
      () => button('Close').click(),
      () => dialog.querySelector<HTMLButtonElement>('[aria-label="Close menu"]')!.click(),
      () => key(document.activeElement!, 'Escape'),
    ]) {
      menuButton.click();
      close();
      expect(menu.isOpen()).toBe(false);
      expect(root.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(menuButton);
    }
  });

  it('keys pressed in the menu never reach the field (cards, pan, Esc)', () => {
    const { menuButton, key, tab } = setup();
    const field = vi.fn();
    document.addEventListener('keydown', field);
    menuButton.click();
    for (const k of ['1', 'w', 'ArrowDown', 'Escape']) key(tab('settings'), k);
    document.removeEventListener('keydown', field);
    expect(field).not.toHaveBeenCalled();
  });

  it('a click on the backdrop neither closes it nor takes focus', () => {
    const { menu, menuButton, scrim } = setup();
    menuButton.click();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    scrim.dispatchEvent(down);
    scrim.click();
    expect(down.defaultPrevented).toBe(true);
    expect(menu.isOpen()).toBe(true);
  });

  it('Tab and Shift+Tab wrap inside the dialog', () => {
    const { menuButton, key, tab, button, dialog } = setup();
    menuButton.click();
    const done = button('Close');
    done.focus();
    expect(key(done, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Close menu"]'));
    const first = document.activeElement!;
    expect(key(first, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(done);
    // In the middle, Tab is left to the browser.
    tab('settings').focus();
    expect(key(tab('settings'), 'Tab').defaultPrevented).toBe(false);
  });

  it('tabs: one in the tab order, arrows move and show their panel', () => {
    const { menuButton, key, tab, panel } = setup();
    menuButton.click();
    expect(tab('settings').getAttribute('aria-selected')).toBe('true');
    expect([tab('settings'), tab('save'), tab('help')].map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    key(tab('settings'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('save'));
    expect(panel('save').hidden).toBe(false);
    expect(panel('settings').hidden).toBe(true);
    key(tab('save'), 'End');
    expect(document.activeElement).toBe(tab('help'));
    key(tab('help'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('settings'));
    key(tab('settings'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('help'));
    expect(panel('help').getAttribute('aria-labelledby')).toBe('menu-tab-help');
  });

  it("the Save tab shows this camp's code, and keeps up with changes while open", () => {
    const g = { ...newGame(), hordeNumber: 7 };
    const { menuButton, code, menu, fight } = setup({ game: g });
    menuButton.click();
    expect(readCode(code.value).game).toEqual(g);
    fight(false);
    expect(menu.isOpen()).toBe(true);
    expect(code.readOnly).toBe(true);
  });

  it('Load code: a refused code says why and asks nothing', () => {
    const { menuButton, tab, button, paste, dialog, loaded } = setup();
    menuButton.click();
    tab('save').click();
    paste.value = 'ID1:nope';
    button('Load code').click();
    expect(dialog.textContent).toContain(IMPORT_REFUSAL.bad);
    expect(dialog.querySelector('[role="alertdialog"]:not([hidden])')).toBeNull();
    expect(loaded).toEqual([]);
  });

  it('Load code: asks inside the menu; Keep changes nothing, Replace loads and clears', () => {
    const g = { ...newGame(), hordeNumber: 9 };
    const { menuButton, tab, button, paste, dialog, loaded, key, menu } = setup();
    const confirm = vi.spyOn(window, 'confirm');
    menuButton.click();
    tab('save').click();
    paste.value = exportCode(encodeSave(g, NOW));
    button('Load code').click();
    const box = dialog.querySelector<HTMLElement>('[role="alertdialog"]:not([hidden])')!;
    expect(box.textContent).toContain(IMPORT_CONFIRM);
    expect(document.activeElement).toBe(button('Keep this camp'));
    button('Keep this camp').click();
    expect(loaded).toEqual([]);
    expect(box.hidden).toBe(true);
    expect(document.activeElement).toBe(button('Load code'));
    // Esc backs out of the confirm first, then closes the menu.
    button('Load code').click();
    key(document.activeElement!, 'Escape');
    expect(box.hidden).toBe(true);
    expect(menu.isOpen()).toBe(true);
    button('Load code').click();
    button('Replace camp').click();
    expect(loaded).toEqual([g]);
    expect(paste.value).toBe('');
    expect(dialog.textContent).toContain(IMPORT_DONE);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('a confirm closes when its tab is left, or when the pasted code is edited', () => {
    const g = { ...newGame(), hordeNumber: 9 };
    const { menuButton, tab, button, paste, dialog, menu, key, loaded } = setup();
    const open = () => dialog.querySelector('[role="alertdialog"]:not([hidden])');
    menuButton.click();
    tab('save').click();
    paste.value = exportCode(encodeSave(g, NOW));
    button('Load code').click();
    tab('help').click();
    tab('save').click();
    expect(open()).toBeNull();
    // Esc on another tab closes the menu: no hidden confirm takes it.
    button('Load code').click();
    tab('help').click();
    key(tab('help'), 'Escape');
    expect(menu.isOpen()).toBe(false);
    menuButton.click();
    tab('save').click();
    button('Load code').click();
    paste.value = 'something else';
    paste.dispatchEvent(new Event('input', { bubbles: true }));
    expect(open()).toBeNull();
    expect(loaded).toEqual([]);
  });

  it('the backup code is rewritten only when the camp changes', () => {
    const { menuButton, code, menu, fight } = setup();
    menuButton.click();
    const first = code.value;
    code.value = 'kept';
    fight(false);
    menu.refresh();
    expect(code.value).toBe('kept');
    expect(first).toMatch(/^ID1:/);
  });

  it('New camp: asked first, then a new camp from Horde 1', () => {
    const { menuButton, tab, button, dialog, fresh } = setup({
      game: { ...newGame(), hordeNumber: 12 },
    });
    menuButton.click();
    tab('save').click();
    button('New camp').click();
    expect(dialog.textContent).toContain(NEW_CAMP_CONFIRM);
    button('Keep this camp').click();
    expect(fresh).toEqual([]);
    button('New camp').click();
    button('Start new camp').click();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toEqual(newGame());
    expect(dialog.textContent).toContain(NEW_CAMP_DONE);
  });

  it('in a fight: Paused, Resume, and Load code and New camp are off with the reason', () => {
    const { menuButton, dialog, button, tab, loaded, fresh } = setup({ fighting: true });
    menuButton.click();
    expect(dialog.querySelector<HTMLElement>('.menu-chip')!.hidden).toBe(false);
    expect(dialog.querySelector('.menu-chip')!.getAttribute('role')).toBe('status');
    expect(button('Resume')).toBeTruthy();
    expect(dialog.querySelector('.menu-hint')!.textContent).toBe('Esc closes and resumes');
    tab('save').click();
    const load = button('Load code');
    const reset = button('New camp');
    expect(load.disabled && reset.disabled).toBe(true);
    const reasons = [...dialog.querySelectorAll<HTMLElement>('.build-option-reason')];
    expect(reasons.filter((r) => !r.hidden).map((r) => r.textContent)).toEqual([
      FIGHT_REFUSAL,
      FIGHT_REFUSAL,
    ]);
    load.click();
    reset.click();
    expect(loaded).toEqual([]);
    expect(fresh).toEqual([]);
  });

  it('build mode: no Paused chip, Close, and the actions are on', () => {
    const { menuButton, dialog, button, tab } = setup();
    menuButton.click();
    expect(dialog.querySelector<HTMLElement>('.menu-chip')!.hidden).toBe(true);
    expect(dialog.querySelector('.menu-hint')!.textContent).toBe('Esc closes');
    expect(button('Close')).toBeTruthy();
    tab('save').click();
    expect(button('Load code').disabled).toBe(false);
    expect(button('New camp').disabled).toBe(false);
  });

  it('saving off or a refused write marks the button and opens on Save; a good write clears it', () => {
    const { menu, menuButton, tab, dialog } = setup();
    const status = () => dialog.querySelector('.menu-status')!;
    expect(status().textContent).toBe(SAVE_STATUS.ok.text);
    for (const s of ['off', 'failed'] as const) {
      menu.status(s);
      expect(menuButton.classList.contains('menu-alert')).toBe(true);
      expect(menuButton.getAttribute('aria-label')).toBe('Menu, saving problem');
      expect(status().textContent).toBe(SAVE_STATUS[s].text);
      menuButton.click();
      expect(document.activeElement).toBe(tab('save'));
      menu.close();
    }
    menu.status('rejected');
    expect(menuButton.classList.contains('menu-alert')).toBe(false);
    expect(status().textContent).toBe(SAVE_STATUS.rejected.text);
    menu.status('ok');
    expect(menuButton.getAttribute('aria-label')).toBe('Menu');
  });

  it('Reduce motion shows the setting and hands on each change', () => {
    const { menuButton, dialog, motion } = setup({ reduceMotion: true });
    menuButton.click();
    const box = dialog.querySelector<HTMLInputElement>('#menu-reduce-motion')!;
    expect(box.checked).toBe(true);
    expect(dialog.querySelector('label[for="menu-reduce-motion"]')!.textContent).toContain(
      'Reduce motion',
    );
    box.click();
    box.click();
    expect(motion).toEqual([false, true]);
  });

  it('Help lists every control and the how-to-play steps', () => {
    const { panel } = setup();
    const help = panel('help');
    for (const { group, rows } of CONTROLS) {
      expect(help.textContent).toContain(group);
      for (const [k, what] of rows) expect(help.textContent).toContain(`${k}${what}`);
    }
    expect(help.querySelectorAll('ol li')).toHaveLength(HOW_TO_PLAY.length);
    expect([...help.querySelectorAll('kbd')].map((k) => k.textContent)).toContain('1');
    expect([...help.querySelectorAll('kbd')].map((k) => k.textContent)).not.toContain('a');
  });

  it('Help lists no pan or zoom: the field is one fixed frame (ID-064)', () => {
    const help = setup().panel('help').textContent ?? '';
    expect(help).not.toMatch(/\b(pan|zoom|drag)\b|wheel|arrows/i);
  });

  it('a pasted payload is never parsed as page markup', () => {
    const { menuButton, tab, button, paste, dialog } = setup();
    menuButton.click();
    tab('save').click();
    paste.value = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    button('Load code').click();
    expect(dialog.querySelector('img, script')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
