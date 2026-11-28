// @vitest-environment jsdom
// ID-039: the Menu — its button and Esc, focus kept inside, the Save tab's code, load and
// new camp (asked first, off in a fight), the save-problem dot, Reduce motion, Sound and Help.
import { JOB_IDS, STASH_CAP } from '../core/data.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import { NOW, oldStock, prePatrol, preStats } from '../storage/testing.ts';
import { escapeAction, frameStep } from './app.ts';
import { TRAIT_ROWS } from './statlines.ts';
import { versionText } from './version.ts';
import { FIELD_GREW, LEVELS_REWORKED } from './build.ts';
import {
  CONTROLS,
  createMenu,
  DAMAGE_NUMBERS,
  FIGHT_REFUSAL,
  HOW_TO_PLAY,
  IMPORT_CONFIRM,
  IMPORT_DONE,
  IMPORT_REFUSAL,
  MARKS,
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
  const volumes: [string, number][] = [];
  const mutes: boolean[] = [];
  const samples: string[] = [];
  const chatters: string[] = [];
  const menu = createMenu(root, {
    state: () => ({ game, fighting, held: false }),
    onLoad: (g) => (loaded.push(g), (game = g)),
    onNewCamp: (g) => (fresh.push(g), (game = g)),
    reduceMotion: over.reduceMotion ?? false,
    onReduceMotion: (on) => motion.push(on),
    sound: over.sound ?? { volumes: { master: 80, music: 60, effects: 80 }, muted: false },
    onVolume: (which, level) => volumes.push([which, level]),
    onVolumeSet: (which) => samples.push(which),
    onMute: (on) => mutes.push(on),
    chatter: over.chatter ?? 'full',
    onChatter: (level) => chatters.push(level),
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
    volumes,
    mutes,
    samples,
    chatters,
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

  it('a code from before the level bonus says stat points are gone (ID-146)', () => {
    const g = newGame();
    g.roster[0]!.xp = 25;
    const old = { v: 12, savedAt: NOW, game: preStats(g) };
    const loaded = readCode(exportCode(JSON.stringify(old)));
    expect(loaded.message).toBe(`${IMPORT_DONE} ${LEVELS_REWORKED}`);
    expect(LEVELS_REWORKED).toContain('stat points are gone');
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

  it('New camp: asked first, then a new horde-only camp from Horde 1 (ID-066)', () => {
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
    // The first survivor's profession rolls with the new camp's start time (ID-149).
    const job = fresh[0]!.roster[0]!.job;
    expect(JOB_IDS).toContain(job);
    const want = newGame('horde');
    // A new camp has its own theme seed (ID-238), from the same start time.
    const seed = fresh[0]!.themes?.seed;
    expect(Number.isInteger(seed)).toBe(true);
    expect(fresh[0]).toEqual({
      ...want,
      roster: [{ ...want.roster[0]!, job }],
      themes: { seed },
    });
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

  it('Chatter shows the stored level and hands on each change (ID-085)', () => {
    const { menuButton, dialog, chatters } = setup({ chatter: 'low' });
    menuButton.click();
    const select = dialog.querySelector<HTMLSelectElement>('#menu-chatter')!;
    expect(select.value).toBe('low');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['off', 'Off'],
      ['low', 'Low'],
      ['full', 'Full'],
    ]);
    expect(dialog.querySelector('label[for="menu-chatter"]')!.textContent).toBe('Chatter');
    for (const level of ['off', 'full']) {
      select.value = level;
      select.dispatchEvent(new Event('change'));
    }
    expect(chatters).toEqual(['off', 'full']);
  });

  it('Chatter hands on nothing for a value that is not one of its levels (ID-085)', () => {
    const { menuButton, dialog, chatters } = setup();
    menuButton.click();
    const select = dialog.querySelector<HTMLSelectElement>('#menu-chatter')!;
    const forged = document.createElement('option');
    forged.value = '__proto__';
    select.append(forged);
    select.value = '__proto__';
    select.dispatchEvent(new Event('change'));
    expect(chatters).toEqual([]);
  });

  it('Sound shows the stored volumes and mute, and hands on each change (ID-080)', () => {
    const { menuButton, dialog, volumes, mutes, samples, key } = setup({
      sound: { volumes: { master: 35, music: 0, effects: 100 }, muted: true },
    });
    menuButton.click();
    const slider = (w: string) => dialog.querySelector<HTMLInputElement>(`#menu-volume-${w}`)!;
    const label = (w: string) => dialog.querySelector(`label[for="menu-volume-${w}"]`)!.textContent;
    expect([slider('master').value, slider('music').value, slider('effects').value]).toEqual([
      '35',
      '0',
      '100',
    ]);
    expect([label('master'), label('music'), label('effects')]).toEqual([
      'Master volume',
      'Music',
      'Sound effects',
    ]);
    expect(slider('master').type).toBe('range');
    const value = slider('master').parentElement!.querySelector('output')!;
    expect(value.textContent).toBe('35%');
    slider('master').value = '50';
    slider('master').dispatchEvent(new Event('input', { bubbles: true }));
    expect(volumes).toEqual([['master', 50]]);
    expect(value.textContent).toBe('50%');
    expect(slider('master').getAttribute('aria-valuetext')).toBe('50%');
    // The readout is for the eye: the slider's own value is what a screen reader says.
    expect(value.getAttribute('aria-hidden')).toBe('true');
    // Dragging gives no sample; letting go gives one.
    expect(samples).toEqual([]);
    slider('master').dispatchEvent(new Event('change', { bubbles: true }));
    expect(samples).toEqual(['master']);
    const mute = dialog.querySelector<HTMLInputElement>('#menu-mute')!;
    const rows = () => [...dialog.querySelectorAll('.menu-range')];
    expect(mute.checked).toBe(true);
    expect(rows().every((r) => r.classList.contains('menu-range-muted'))).toBe(true);
    expect(dialog.querySelector('label[for="menu-mute"]')!.textContent).toContain('Mute');
    mute.click();
    expect(mutes).toEqual([false]);
    expect(rows().some((r) => r.classList.contains('menu-range-muted'))).toBe(false);
    // Arrow keys on a slider stay with the slider: the dialog moves tabs only from a tab.
    const e = key(slider('music'), 'ArrowRight');
    expect(e.defaultPrevented).toBe(false);
    expect(dialog.querySelector('#menu-tab-settings')!.getAttribute('aria-selected')).toBe('true');
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

  it('Help has a Research step after "Arm the squad" (ID-263)', () => {
    const { panel } = setup();
    const help = panel('help');
    const names = HOW_TO_PLAY.map(([name]) => name);
    expect(names.indexOf('Research upgrades.')).toBe(names.indexOf('Arm the squad.') + 1);
    expect(help.textContent).toContain('Open Research in the top bar');
    expect(help.textContent).toContain('no refunds');
    expect(help.textContent).toContain('flask icon');
    expect(help.textContent).toContain('A dot on it means an upgrade is affordable between hordes');
    expect(help.textContent).toContain('offered a little more often');
  });

  it('Help tells one skill and its one key while the Airstrike is the only skill (ID-193)', () => {
    const help = setup().panel('help');
    expect(help.textContent).toContain('Click a skill, or Q');
    expect(help.textContent).not.toContain('Q W');
    expect(help.textContent).toContain('Pick your skill.');
    expect(help.textContent).not.toContain('Pick your skills.');
  });

  it('Help has the enemy trait table and what the modes do to it (ID-237)', () => {
    const help = setup().panel('help');
    expect(help.textContent).toContain('Enemy traits (Nightmare and Hell)');
    const rows = [...help.querySelectorAll('.menu-traits tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(rows).toHaveLength(TRAIT_ROWS.length);
    expect(rows.find((r) => r[0] === 'Mutated Horror')).toEqual([
      'Mutated Horror',
      'Hulking',
      'Light',
      'Heavy',
    ]);
    expect(help.querySelectorAll('.menu-classes li')).toHaveLength(4);
    expect(help.querySelector('.menu-classes')!.textContent).toContain('Light: Pistol, SMG');
    // Each class cell carries its icon.
    expect(help.querySelectorAll('.menu-traits tbody td svg')).toHaveLength(TRAIT_ROWS.length * 2);
    expect(help.textContent).toContain('Nightmare: a gun class an enemy resists deals 65%');
    expect(help.textContent).toContain('Hell: a gun class an enemy resists deals 50%');
  });

  it('Help explains the ammo bar and the roar ring, each with a swatch (ID-168)', () => {
    const help = setup().panel('help');
    const items = [...help.querySelectorAll('.menu-marks li')];
    expect(items).toHaveLength(MARKS.length);
    MARKS.forEach(({ look, name, text }, i) => {
      expect(items[i]!.textContent).toBe(`${name} ${text}`);
      const swatch = items[i]!.querySelector(`.menu-mark-${look}`)!;
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
    });
    expect(help.textContent).toMatch(/survivor’s bars.*red is HP lost.*orange bar.*rounds left/);
    expect(help.textContent).toMatch(
      /Orange ring under an enemy.*nearby roared.*moves faster for 4 s/,
    );
  });

  it('Help explains each damage number colour with a sample in it (ID-262)', () => {
    const help = setup().panel('help');
    const heading = [...help.querySelectorAll('h3')].find(
      (h) => h.textContent === 'Damage numbers',
    );
    expect(heading).toBeDefined();
    const items = [...heading!.parentElement!.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('.menu-pop')!.className)).toEqual(
      DAMAGE_NUMBERS.map(({ look }) => `menu-pop menu-pop-${look}`),
    );
    DAMAGE_NUMBERS.forEach(({ sample, name, text }, i) => {
      const swatch = items[i]!.querySelector('.menu-pop')!;
      expect(swatch.textContent).toBe(sample);
      expect(swatch.getAttribute('aria-hidden')).toBe('true');
      expect(items[i]!.textContent).toBe(`${sample}${name} ${text}`);
    });
    expect(help.textContent).toMatch(/Orange with "!"\. A near-max crit: ×3\.25 damage or more/);
    expect(help.textContent).toMatch(/keeps that colour and its "!"/);
  });

  it('Help gives the stash limit the game uses (ID-158)', () => {
    const help = setup().panel('help').textContent ?? '';
    expect(help).toContain(`into the stash (${STASH_CAP} slots to start)`);
  });

  it('Help ends with the build version, the one the page label shows (ID-275)', () => {
    const { panel } = setup();
    const line = panel('help').querySelector('.menu-version')!;
    expect(line.textContent).toBe(versionText());
    expect(line.textContent).toMatch(/^v\d+\.\d+\.\d+ \(.+\)$/);
    expect(panel('help').lastElementChild).toBe(line);
    // main.ts draws the corner label from the same helper, not its own string.
    const main = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
    expect(main).toContain('versionText()');
    expect(main).not.toContain('__APP_VERSION__');
  });

  it('Help tells a touch screen to hold the Airstrike button, not tap a pill (ID-275)', () => {
    expect(JSON.stringify(CONTROLS)).not.toMatch(/Auto pill/);
    expect(JSON.stringify(CONTROLS)).toMatch(/hold the Airstrike button/);
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

describe('Settings on the phone shell and its Full screen switch (ID-279)', () => {
  type Fs = { enabled?: boolean; on?: boolean; request?: () => Promise<void> | undefined };
  let fullscreenElement: Element | null = null;
  const exit = vi.fn(() => {
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });

  /** A touch browser as the Menu reads it. */
  function browser(f: Fs = {}): { request: ReturnType<typeof vi.fn> } {
    fullscreenElement = f.on ? document.documentElement : null;
    const request = vi.fn(
      f.request ??
        (() => {
          fullscreenElement = document.documentElement;
          document.dispatchEvent(new Event('fullscreenchange'));
          return Promise.resolve();
        }),
    );
    window.matchMedia = ((q: string) => ({
      matches: q === '(pointer: coarse)',
    })) as typeof window.matchMedia;
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: f.enabled ?? true,
      configurable: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      get: () => fullscreenElement,
      configurable: true,
    });
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    document.documentElement.requestFullscreen = request as never;
    return { request };
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    exit.mockClear();
  });

  it('the first heading, which repeats the tab, is marked for the phone sheet to hide', () => {
    const { panel } = setup();
    const first = panel('settings').querySelector('h3')!;
    expect(first.textContent).toBe('Settings');
    expect(first.classList.contains('menu-heading-tab')).toBe(true);
    expect(panel('settings').querySelector('.menu-sound h3')!.textContent).toBe('Sound');
    expect(panel('settings').lastElementChild!.classList.contains('menu-settings-note')).toBe(true);
  });

  it('no switch without a touch screen, the API, or where the browser disables it', () => {
    expect(setup().panel('settings').querySelector('#menu-fullscreen')).toBeNull();
    browser({ enabled: false });
    expect(setup().panel('settings').querySelector('#menu-fullscreen')).toBeNull();
    // A mouse: not a touch device.
    browser();
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    expect(setup().panel('settings').querySelector('#menu-fullscreen')).toBeNull();
  });

  it('shows a labelled switch under Chatter, off when not full screen, on when it is', () => {
    browser();
    const off = setup().panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!;
    expect(off.checked).toBe(false);
    expect(document.querySelector('label[for="menu-fullscreen"]')!.textContent).toBe('Full screen');
    // In the left column's section, after Chatter.
    expect(off.closest('.menu-section')!.querySelector('#menu-chatter')).not.toBeNull();
    browser({ on: true });
    expect(
      setup().panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!.checked,
    ).toBe(true);
  });

  it('ticking it asks for full screen; unticking leaves it', async () => {
    const { request } = browser();
    const box = setup().panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!;
    box.click();
    expect(request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(box.checked).toBe(true));
    box.click();
    expect(exit).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(box.checked).toBe(false));
  });

  it('follows the browser: the back gesture leaving full screen unticks it', () => {
    browser({ on: true });
    const box = setup().panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!;
    expect(box.checked).toBe(true);
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(box.checked).toBe(false);
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(box.checked).toBe(true);
  });

  it('is unticked at render and when the Menu opens, whatever the box held before', () => {
    browser();
    const m = setup();
    const box = m.panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!;
    expect(box.autocomplete).toBe('off');
    // A restored or stale tick, with no fullscreenchange to say otherwise.
    box.checked = true;
    m.menuButton.click();
    expect(box.checked).toBe(false);
    m.menu.close();
    fullscreenElement = document.documentElement;
    m.menu.open();
    expect(box.checked).toBe(true);
  });

  it('a refused request leaves the box unticked and raises no error', async () => {
    const { request } = browser({ request: () => Promise.reject(new Error('refused')) });
    const box = setup().panel('settings').querySelector<HTMLInputElement>('#menu-fullscreen')!;
    box.click();
    expect(request).toHaveBeenCalled();
    await vi.waitFor(() => expect(box.checked).toBe(false));
  });
});
