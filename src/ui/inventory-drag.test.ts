// @vitest-environment jsdom
// ID-095: between hordes, guns move around the Inventory by drag and drop — a stash gun
// or the free pistol onto a survivor equips it, a survivor's gun into the stash takes it
// off them, and a stash gun onto one of its set opens that set's Combine — and by the
// details' Equip on, Unequip and Combine buttons. Each move is said in a status line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type OwnedWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { STASH_CAP, type Rarity, type WeaponId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { combineGuns, equipGun } from '../core/hordeonly.ts';
import {
  canDrag,
  COMBINE_NOT_GUN,
  COMBINE_TOP,
  createInventory,
  DRAG_NOTE,
  DRAG_NOTE_TOUCH,
  DRAG_SLOP,
  dropAction,
  equipMessage,
  GUNS_WAIT,
  inventoryView,
  LONG_PRESS,
  STASH_FULL,
  TOUCH_SLOP,
} from './inventory.ts';

const gun = (uid: string, base: WeaponId, rarity: Rarity): OwnedWeapon => ({
  uid,
  base,
  rarity,
  affixes: [],
});
const rusty = (n: number, base: WeaponId = 'smg', from = 1) =>
  Array.from({ length: n }, (_, i) => gun(`h${i + from}`, base, 'rusty'));

/** `n` survivors on the pistol; `held` gives survivor i (from 0) a gun in hand. */
function camp(n: number, stash: OwnedWeapon[] = [], held: OwnedWeapon[] = []): GameState {
  const g = newGame('horde');
  return {
    ...g,
    roster: Array.from({ length: n }, (_, i) => {
      const d = recruit(i + 1);
      const h = held[i];
      return h ? { ...d, loadout: { ...d.loadout, primary: h } } : d;
    }),
    camp: { ...g.camp, recruits: n },
    armoury: stash,
  };
}

const full = (from = 1) =>
  Array.from({ length: STASH_CAP }, (_, i) =>
    gun(`f${i + from}`, (['smg', 'rifle', 'lmg', 'sniper'] as const)[i % 4]!, 'relic'),
  );

describe('dropAction', () => {
  it('a stash gun onto a survivor equips it, in place of what they hold', () => {
    const g = camp(2, [gun('a', 'rifle', 'military')], [gun('x', 'smg', 'rusty')]);
    const v = inventoryView(g);
    expect(dropAction(v, 'stash:a', 'squad:recruit-1')).toEqual({
      kind: 'equip',
      defender: 'recruit-1',
      choice: 'a',
    });
    expect(dropAction(v, 'stash:a', 'squad:recruit-2')).toMatchObject({ defender: 'recruit-2' });
    // Even into a full stash: the gun they held takes the place the new one left.
    const f = inventoryView(camp(1, full(), [gun('x', 'smg', 'rusty')]));
    expect(dropAction(f, 'stash:f1', 'squad:recruit-1')).toMatchObject({ kind: 'equip' });
  });

  it("the free pistol onto a survivor with a gun sends their gun to the stash; refused when it's full", () => {
    const v = inventoryView(camp(2, [], [gun('x', 'smg', 'rusty')]));
    expect(dropAction(v, 'pistol', 'squad:recruit-1')).toEqual({
      kind: 'equip',
      defender: 'recruit-1',
      choice: 'pistol',
    });
    // One already on the pistol: nothing to do.
    expect(dropAction(v, 'pistol', 'squad:recruit-2')).toEqual({ kind: 'none' });
    const f = inventoryView(camp(1, full(), [gun('x', 'smg', 'rusty')]));
    expect(dropAction(f, 'pistol', 'squad:recruit-1')).toEqual({
      kind: 'refused',
      reason: STASH_FULL,
    });
  });

  it("a survivor's gun into the stash, or onto a stash gun, takes it off them; refused when full", () => {
    const v = inventoryView(camp(1, rusty(3), [gun('x', 'smg', 'rusty')]));
    const off = { kind: 'equip', defender: 'recruit-1', choice: 'pistol' };
    expect(dropAction(v, 'squad:recruit-1', 'stash')).toEqual(off);
    // Onto a stash gun of its own set: into the stash, never a combine.
    expect(dropAction(v, 'squad:recruit-1', 'stash:h1')).toEqual(off);
    const f = inventoryView(camp(1, full(), [gun('x', 'smg', 'rusty')]));
    expect(dropAction(f, 'squad:recruit-1', 'stash')).toEqual({
      kind: 'refused',
      reason: STASH_FULL,
    });
  });

  it('a stash gun onto one of its set of 3 or more opens Combine with the weakest 3', () => {
    const strong: OwnedWeapon = {
      ...gun('h9', 'smg', 'rusty'),
      affixes: [{ id: 'damage', value: 20 }],
    };
    const v = inventoryView(camp(1, [strong, ...rusty(3)]));
    const d = dropAction(v, 'stash:h9', 'stash:h2');
    expect(d.kind).toBe('combine');
    // The strongest of the set, the one dragged, stays out.
    expect(d.kind === 'combine' && d.uses.map((w) => w.uid).sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('refuses a combine drop with the details wording', () => {
    const v = inventoryView(
      camp(1, [
        ...rusty(2),
        gun('r1', 'rifle', 'rusty'),
        gun('z1', 'sniper', 'relic'),
        gun('z2', 'sniper', 'relic'),
        gun('k1', 'knife', 'rusty'),
      ]),
    );
    expect(dropAction(v, 'stash:h1', 'stash:h2')).toEqual({
      kind: 'refused',
      reason: '1 more for a Common SMG',
    });
    expect(dropAction(v, 'stash:h1', 'stash:r1')).toEqual({
      kind: 'refused',
      reason: `Rusty SMG and Rusty Rifle don't combine.`,
    });
    expect(dropAction(v, 'stash:z1', 'stash:z2')).toEqual({ kind: 'refused', reason: COMBINE_TOP });
    expect(dropAction(v, 'stash:h1', 'stash:k1')).toEqual({
      kind: 'refused',
      reason: COMBINE_NOT_GUN,
    });
  });

  it('puts the gun back for a drop on nothing, on itself, its own stash, or no target', () => {
    const v = inventoryView(camp(2, rusty(1), [gun('x', 'smg', 'rusty')]));
    const none = { kind: 'none' };
    expect(dropAction(v, 'stash:h1', null)).toEqual(none);
    expect(dropAction(v, 'stash:h1', 'stash:h1')).toEqual(none);
    expect(dropAction(v, 'stash:h1', 'stash')).toEqual(none);
    expect(dropAction(v, 'stash:h1', 'pistol')).toEqual(none);
    // Survivor to survivor, or onto the pistol: not a move this version has.
    expect(dropAction(v, 'squad:recruit-1', 'squad:recruit-2')).toEqual(none);
    expect(dropAction(v, 'squad:recruit-1', 'pistol')).toEqual(none);
    expect(dropAction(v, 'pistol', 'stash')).toEqual(none);
  });

  it('picks up stash guns, the pistol and a survivor’s stash gun, never the pistol in hand or a blade', () => {
    const v = inventoryView(
      camp(2, [gun('k', 'knife', 'rusty'), ...rusty(1)], [gun('x', 'smg', 'rusty')]),
    );
    expect(canDrag(v, 'stash:h1')).toBe(true);
    expect(canDrag(v, 'pistol')).toBe(true);
    expect(canDrag(v, 'squad:recruit-1')).toBe(true);
    expect(canDrag(v, 'squad:recruit-2')).toBe(false);
    expect(canDrag(v, 'stash:k')).toBe(false);
    expect(canDrag(v, 'stash:nope')).toBe(false);
    expect(dropAction(v, 'squad:recruit-2', 'stash')).toEqual({ kind: 'none' });
  });

  it('says what each equip did', () => {
    const g = camp(2, [gun('a', 'rifle', 'military')], [gun('x', 'smg', 'rusty')]);
    const v = inventoryView(g);
    const [one, two] = g.roster.map((d) => d.name);
    const eq = (defender: string, choice: string) =>
      equipMessage(v, { kind: 'equip', defender, choice });
    expect(eq('recruit-2', 'a')).toBe(`${two} now holds Military Rifle`);
    expect(eq('recruit-1', 'a')).toBe(
      `${one} now holds Military Rifle; Rusty SMG is back in the stash`,
    );
    expect(eq('recruit-1', 'pistol')).toBe(
      `${one} now holds the free pistol; Rusty SMG is back in the stash`,
    );
  });
});

/** The dialog with Combine and Equip wired to the core, between hordes unless `fight`. */
function setup(game: GameState, fight = false) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  let state = { game, resumes: false, canCombine: !fight };
  const equips: [string, string][] = [];
  const inv = createInventory(root, {
    state: () => state,
    onCombine: (uids) => {
      const r = combineGuns(state.game, uids);
      if (r.ok) state = { ...state, game: r.game };
      return r;
    },
    onEquip: (id, choice) => {
      equips.push([id, choice]);
      const r = equipGun(state.game, id, choice);
      if (!r.ok) return r;
      state = { ...state, game: r.game };
      return { ok: true };
    },
  });
  root.querySelector<HTMLButtonElement>('.inv-button')!.click();
  const scrim = document.querySelector<HTMLElement>('.inv-scrim')!;
  const dialog = scrim.querySelector<HTMLElement>('[role="dialog"]')!;
  const slot = (key: string) =>
    dialog.querySelector<HTMLButtonElement>(`.inv-slot[data-key="${key}"]`)!;
  const status = () => dialog.querySelector<HTMLElement>('.inv-status')!;
  const details = () => dialog.querySelector<HTMLElement>('.inv-details')!;
  const ghost = () => scrim.querySelector<HTMLElement>('.inv-ghost');
  const now = () => state.game;
  return { root, inv, scrim, dialog, slot, status, details, ghost, now, equips };
}

/** A pointer event (jsdom has no PointerEvent): a MouseEvent with the pointer fields. */
function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  pointerType = 'mouse',
  // A move is made with the button held; anything else with none.
  buttons = type === 'pointermove' ? 1 : 0,
  pointerId = 1,
): Event {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    buttons,
  });
  Object.defineProperties(e, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  target.dispatchEvent(e);
  return e;
}

/** What `elementFromPoint` finds (jsdom has none): the element the pointer is over. */
let under: Element | null = null;
beforeEach(() => {
  under = null;
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => under,
  });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.useRealTimers();
});

/** Drags `from` with the mouse and lets go over `to` (null: over nothing). */
function drag(from: HTMLElement, to: Element | null, release = true): void {
  under = from;
  pointer(from, 'pointerdown', 10, 10);
  under = to;
  pointer(from, 'pointermove', 10 + DRAG_SLOP + 4, 10);
  pointer(from, 'pointermove', 200, 200);
  if (release) pointer(to ?? document.body, 'pointerup', 200, 200);
}

describe('drag and drop in the Inventory (ID-095)', () => {
  it('drag a stash gun onto a survivor: they hold it, their gun goes to the stash, and it is said', () => {
    const { slot, status, now, ghost, dialog } = setup(
      camp(1, [gun('a', 'rifle', 'military')], [gun('x', 'smg', 'rusty')]),
    );
    const name = now().roster[0]!.name;
    drag(slot('stash:a'), slot('squad:recruit-1'));
    expect(now().roster[0]!.loadout.primary).toMatchObject({ uid: 'a' });
    expect(now().armoury.map((w) => w.uid)).toEqual(['x']);
    expect(status().textContent).toBe(
      `${name} now holds Military Rifle; Rusty SMG is back in the stash`,
    );
    expect(status().getAttribute('role')).toBe('status');
    expect(ghost()).toBeNull();
    expect(dialog.classList.contains('inv-dragging')).toBe(false);
    // The grid is redrawn and the survivor's slot selected and focused.
    expect(slot('squad:recruit-1').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(slot('squad:recruit-1'));
    expect(slot('stash:x')).not.toBeNull();
  });

  it('while dragging, the gun follows the pointer in its rarity frame and drop places light up', () => {
    const { slot, ghost, dialog, scrim } = setup(
      camp(
        2,
        [gun('a', 'rifle', 'military'), gun('b', 'smg', 'rusty')],
        [gun('x', 'smg', 'rusty')],
      ),
    );
    drag(slot('stash:a'), slot('squad:recruit-2'), false);
    const g = ghost()!;
    expect(g.dataset.rarity).toBe('military');
    expect(g.getAttribute('aria-hidden')).toBe('true');
    expect(g.querySelector('img.gun-icon')).not.toBeNull();
    expect(g.style.transform).toBe('translate(200px, 200px)');
    expect(dialog.classList.contains('inv-dragging')).toBe(true);
    expect(slot('stash:a').dataset.dragFrom).toBe('true');
    expect(slot('squad:recruit-1').dataset.drop).toBe('ok');
    expect(slot('squad:recruit-2').dataset.drop).toBe('ok');
    expect(slot('squad:recruit-2').dataset.over).toBe('true');
    // Another gun of another set, and the pistol, look refused.
    expect(slot('stash:b').dataset.drop).toBe('no');
    expect(slot('pistol').dataset.drop).toBe('no');
    expect(scrim.contains(g)).toBe(true);
  });

  it('a mouse press that stays put is a click: it selects, and nothing drags', () => {
    const { slot, ghost, now } = setup(camp(1, [gun('a', 'rifle', 'military'), ...rusty(1)]));
    const before = now();
    under = slot('stash:h1');
    pointer(slot('stash:h1'), 'pointerdown', 10, 10);
    pointer(slot('stash:h1'), 'pointermove', 12, 11);
    expect(ghost()).toBeNull();
    pointer(slot('stash:h1'), 'pointerup', 12, 11);
    slot('stash:h1').click();
    expect(slot('stash:h1').getAttribute('aria-pressed')).toBe('true');
    expect(now()).toBe(before);
  });

  it('dropping on nothing, or Esc, puts the gun back; Esc leaves the dialog open', () => {
    const { slot, ghost, now, inv, dialog } = setup(camp(1, rusty(1)));
    const before = now();
    drag(slot('stash:h1'), null);
    expect(now()).toBe(before);
    expect(ghost()).toBeNull();
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    expect(ghost()).not.toBeNull();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inv.isOpen()).toBe(true);
    expect(ghost()).toBeNull();
    expect(slot('squad:recruit-1').dataset.drop).toBeUndefined();
    // The release after Esc does nothing.
    pointer(slot('squad:recruit-1'), 'pointerup', 200, 200);
    expect(now()).toBe(before);
  });

  it("drag a survivor's gun into the stash: it goes there and they fall back to the pistol", () => {
    const { slot, now, dialog, status } = setup(camp(1, rusty(1), [gun('x', 'rifle', 'common')]));
    // An empty place of the stash grid.
    drag(slot('squad:recruit-1'), dialog.querySelector('.inv-slot-empty'));
    expect(now().roster[0]!.loadout.primary).toBe('pistol');
    expect(now().armoury.map((w) => w.uid)).toContain('x');
    expect(status().textContent).toMatch(
      /now holds the free pistol; Common Rifle is back in the stash$/,
    );
    expect(slot('stash:x').getAttribute('aria-pressed')).toBe('true');
  });

  it('a full stash refuses an unequip with "Stash full", and nothing moves', () => {
    const { slot, now, status, dialog } = setup(camp(1, full(), [gun('x', 'rifle', 'common')]));
    const before = now();
    drag(slot('squad:recruit-1'), slot('squad:recruit-1'), false);
    expect(dialog.querySelector<HTMLElement>('.inv-stash-zone')!.dataset.drop).toBe('no');
    pointer(document.body, 'pointerup', 0, 0);
    drag(slot('squad:recruit-1'), dialog.querySelector('.inv-stash-heading'));
    expect(now()).toBe(before);
    expect(status().textContent).toBe(STASH_FULL);
  });

  it('the free pistol onto a survivor gives them the pistol and sends their gun to the stash', () => {
    const { slot, now } = setup(camp(1, [], [gun('x', 'rifle', 'common')]));
    drag(slot('pistol'), slot('squad:recruit-1'));
    expect(now().roster[0]!.loadout.primary).toBe('pistol');
    expect(now().armoury.map((w) => w.uid)).toEqual(['x']);
    expect(now().armoury).toHaveLength(1);
  });

  it('a stash gun onto one of its set opens the Combine confirm; nothing changes until confirmed', () => {
    const { slot, now, details } = setup(camp(1, rusty(4)));
    const before = now();
    drag(slot('stash:h4'), slot('stash:h2'));
    expect(now()).toBe(before);
    expect(slot('stash:h2').getAttribute('aria-pressed')).toBe('true');
    const box = details().querySelector('.inv-combine-confirm')!;
    expect(box.getAttribute('aria-label')).toBe('Combine into a Common SMG');
    expect(document.activeElement).toBe(box.querySelector('.inv-combine-no'));
    details().querySelector<HTMLButtonElement>('.inv-combine-yes')!.click();
    expect(now().armoury).toHaveLength(2);
  });

  it('a drop on a short set or another kind is refused with the details wording', () => {
    const { slot, now, status } = setup(camp(1, [...rusty(2), gun('r', 'rifle', 'rusty')]));
    const before = now();
    drag(slot('stash:h1'), slot('stash:h2'));
    expect(status().textContent).toBe('1 more for a Common SMG');
    // A refusal reads as a no.
    expect(status().dataset.tone).toBe('refused');
    drag(slot('stash:h1'), slot('stash:r'));
    expect(status().textContent).toBe(`Rusty SMG and Rusty Rifle don't combine.`);
    expect(now()).toBe(before);
  });

  it('the same refusal twice is emptied and refilled, so it is read out again', () => {
    vi.useFakeTimers();
    const { slot, status, details } = setup(camp(1, full(), [gun('x', 'rifle', 'common')]));
    slot('squad:recruit-1').click();
    const off = () => details().querySelector<HTMLButtonElement>('.inv-unequip')!.click();
    off();
    expect(status().textContent).toBe(STASH_FULL);
    off();
    expect(status().textContent).toBe('');
    vi.advanceTimersByTime(60);
    expect(status().textContent).toBe(STASH_FULL);
  });

  it('selecting another gun clears the last move’s line; a success is no refusal', () => {
    const { slot, status } = setup(camp(1, [gun('a', 'rifle', 'military'), ...rusty(1)]));
    drag(slot('stash:a'), slot('squad:recruit-1'));
    expect(status().textContent).toMatch(/now holds Military Rifle$/);
    expect(status().dataset.tone).toBeUndefined();
    slot('stash:h1').click();
    expect(status().textContent).toBe('');
  });

  it('a lost release (window blur, or a mouse moving with no button) drops the drag', () => {
    const { slot, ghost, now } = setup(camp(1, rusty(1)));
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    window.dispatchEvent(new Event('blur'));
    expect(ghost()).toBeNull();
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    pointer(slot('squad:recruit-1'), 'pointermove', 210, 210, 'mouse', 0);
    expect(ghost()).toBeNull();
    // A later press drags again, and its release lands.
    drag(slot('stash:h1'), slot('squad:recruit-1'));
    expect(now().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
  });

  it('a press whose release never came does not block the next one', () => {
    const { slot, ghost } = setup(camp(1, rusty(1)));
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    expect(document.querySelectorAll('.inv-ghost')).toHaveLength(1);
    expect(ghost()).not.toBeNull();
  });

  it("another finger's cancel leaves the drag alone; its own ends it", () => {
    const { slot, ghost } = setup(camp(1, rusty(1)));
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    pointer(document.body, 'pointercancel', 0, 0, 'mouse', 0, 2);
    expect(ghost()).not.toBeNull();
    // Nor does another finger's press (not primary) on a slot.
    const second = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperties(second, {
      pointerId: { value: 2 },
      pointerType: { value: 'touch' },
      isPrimary: { value: false },
    });
    slot('stash:h1').dispatchEvent(second);
    expect(ghost()).not.toBeNull();
    pointer(document.body, 'pointercancel', 0, 0);
    expect(ghost()).toBeNull();
  });

  it('picking up a survivor’s gun with the stash full says "Stash full" at once', () => {
    const { slot, status } = setup(camp(1, full(), [gun('x', 'rifle', 'common')]));
    drag(slot('squad:recruit-1'), null, false);
    expect(status().textContent).toBe(STASH_FULL);
    expect(status().dataset.tone).toBe('refused');
  });

  it('a drag release does not select the slot it lands on', () => {
    const { slot } = setup(camp(1, [...rusty(2), gun('r', 'rifle', 'rusty')]));
    drag(slot('stash:h1'), slot('stash:r'));
    // The release's click lands on the target.
    slot('stash:r').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(slot('stash:h1').getAttribute('aria-pressed')).toBe('true');
    expect(slot('stash:r').getAttribute('aria-pressed')).toBe('false');
  });

  it('on touch, a long-press starts the drag; a touch that moves first is a scroll', () => {
    vi.useFakeTimers();
    const { slot, ghost, now } = setup(camp(1, rusty(1)));
    under = slot('stash:h1');
    pointer(slot('stash:h1'), 'pointerdown', 10, 10, 'touch');
    pointer(slot('stash:h1'), 'pointermove', 10, 10 + TOUCH_SLOP + 2, 'touch');
    vi.advanceTimersByTime(LONG_PRESS + 50);
    expect(ghost()).toBeNull();
    pointer(slot('stash:h1'), 'pointerup', 10, 30, 'touch');

    pointer(slot('stash:h1'), 'pointerdown', 10, 10, 'touch');
    // Held still: no drag yet, then the drag.
    vi.advanceTimersByTime(LONG_PRESS - 50);
    expect(ghost()).toBeNull();
    vi.advanceTimersByTime(100);
    expect(ghost()).not.toBeNull();
    // It rides above the finger.
    expect(ghost()!.dataset.touch).toBe('true');
    // Now the page holds still under the finger.
    const tm = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(tm);
    expect(tm.defaultPrevented).toBe(true);
    // No long-press menu over the slot.
    const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    slot('stash:h1').dispatchEvent(cm);
    expect(cm.defaultPrevented).toBe(true);
    under = slot('squad:recruit-1');
    pointer(slot('stash:h1'), 'pointermove', 100, 100, 'touch');
    pointer(slot('stash:h1'), 'pointerup', 100, 100, 'touch');
    expect(now().roster[0]!.loadout.primary).toMatchObject({ uid: 'h1' });
    // Done: a touchmove scrolls again.
    const after = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('in a fight nothing drags, there is no Equip, and the Inventory says when guns change', () => {
    const { slot, ghost, dialog, details, now } = setup(
      camp(1, rusty(1), [gun('x', 'rifle', 'common')]),
      true,
    );
    const before = now();
    expect(dialog.textContent).toContain(GUNS_WAIT);
    expect(dialog.textContent).not.toContain(DRAG_NOTE);
    expect(dialog.querySelectorAll('[data-drag]')).toHaveLength(0);
    drag(slot('stash:h1'), slot('squad:recruit-1'));
    expect(ghost()).toBeNull();
    expect(now()).toBe(before);
    expect(details().querySelector('.inv-gear')).toBeNull();
  });

  it('on a touch screen the note says to hold the gun first', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: q === '(pointer: coarse)' }),
    });
    try {
      const { dialog } = setup(camp(1, rusty(1)));
      expect(dialog.textContent).toContain(DRAG_NOTE_TOUCH);
      expect(dialog.textContent).not.toContain(DRAG_NOTE);
    } finally {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('between hordes it says how to drag, and marks what can be picked up', () => {
    const { dialog, slot } = setup(camp(2, rusty(1), [gun('x', 'rifle', 'common')]));
    expect(dialog.textContent).toContain(DRAG_NOTE);
    expect(slot('stash:h1').dataset.drag).toBe('true');
    expect(slot('pistol').dataset.drag).toBe('true');
    expect(slot('squad:recruit-1').dataset.drag).toBe('true');
    // On the pistol already: nothing to pick up.
    expect(slot('squad:recruit-2').dataset.drag).toBeUndefined();
  });

  it('a drag held near the grid’s bottom or top edge scrolls it, and stops when it ends', () => {
    vi.useFakeTimers();
    const { slot, dialog } = setup(camp(1, rusty(1)));
    const body = dialog.querySelector<HTMLElement>('.inv-body')!;
    // jsdom lays nothing out: the grid is 100..500 on screen and scrolls freely.
    let top = 100;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => (top = Math.max(0, v)),
    });
    body.getBoundingClientRect = () => ({ top: 100, bottom: 500, height: 400 }) as DOMRect;
    under = slot('stash:h1');
    pointer(slot('stash:h1'), 'pointerdown', 50, 300);
    pointer(slot('stash:h1'), 'pointermove', 50, 300 + DRAG_SLOP + 1);
    vi.advanceTimersByTime(100);
    // Mid-grid: no scroll.
    expect(top).toBe(100);
    pointer(slot('stash:h1'), 'pointermove', 50, 495);
    vi.advanceTimersByTime(100);
    expect(top).toBeGreaterThan(100);
    const down = top;
    pointer(slot('stash:h1'), 'pointermove', 50, 105);
    vi.advanceTimersByTime(160);
    expect(top).toBeLessThan(down);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const stopped = top;
    vi.advanceTimersByTime(500);
    expect(top).toBe(stopped);
  });

  it('a refresh mid-drag puts the gun back', () => {
    const { slot, ghost, inv, now } = setup(camp(1, rusty(1)));
    drag(slot('stash:h1'), slot('squad:recruit-1'), false);
    inv.close();
    expect(ghost()).toBeNull();
    pointer(document.body, 'pointerup', 200, 200);
    expect(now().roster[0]!.loadout.primary).toBe('pistol');
  });
});

describe('moving guns without dragging (ID-095)', () => {
  it("a stash gun's details have Equip on, one button per survivor", () => {
    const { slot, details, now, status } = setup(camp(2, [gun('a', 'rifle', 'military')]));
    slot('stash:a').click();
    const names = now().roster.map((d) => d.name);
    const group = details().querySelector<HTMLElement>('.inv-gear')!;
    expect(group.getAttribute('role')).toBe('group');
    const buttons = [...group.querySelectorAll<HTMLButtonElement>('.inv-equip-on')];
    expect(buttons.map((b) => b.textContent)).toEqual(names);
    expect(buttons[1]!.getAttribute('aria-label')).toBe(`Equip Military Rifle on ${names[1]}`);
    buttons[1]!.click();
    expect(now().roster[1]!.loadout.primary).toMatchObject({ uid: 'a' });
    expect(status().textContent).toBe(`${names[1]} now holds Military Rifle`);
    expect(document.activeElement).toBe(slot('squad:recruit-2'));
  });

  it("a survivor's gun has Unequip; the pistol's Equip on lists only survivors with a gun", () => {
    const { slot, details, now, status } = setup(camp(2, [], [gun('x', 'rifle', 'common')]));
    slot('pistol').click();
    const on = [...details().querySelectorAll<HTMLButtonElement>('.inv-equip-on')];
    expect(on.map((b) => b.dataset.defender)).toEqual(['recruit-1']);
    slot('squad:recruit-2').click();
    expect(details().querySelector('.inv-gear')).toBeNull();
    slot('squad:recruit-1').click();
    const off = details().querySelector<HTMLButtonElement>('.inv-unequip')!;
    expect(off.getAttribute('aria-label')).toBe(
      `Unequip Common Rifle from ${now().roster[0]!.name}`,
    );
    off.click();
    expect(now().roster[0]!.loadout.primary).toBe('pistol');
    expect(status().textContent).toMatch(/Common Rifle is back in the stash$/);
  });

  it('Unequip into a full stash is refused with "Stash full"', () => {
    const { slot, details, now, status } = setup(camp(1, full(), [gun('x', 'rifle', 'common')]));
    const before = now();
    slot('squad:recruit-1').click();
    details().querySelector<HTMLButtonElement>('.inv-unequip')!.click();
    expect(now()).toBe(before);
    expect(status().textContent).toBe(STASH_FULL);
  });

  it('shows hostile names as text', () => {
    const g = camp(1, [gun('a', 'rifle', 'military')]);
    const evil = '<img src=x onerror=alert(1)>‮';
    g.roster[0] = { ...g.roster[0]!, name: evil };
    const { slot, details, status, dialog } = setup(g);
    slot('stash:a').click();
    const on = details().querySelector<HTMLButtonElement>('.inv-equip-on')!;
    expect(on.textContent).toBe(evil);
    expect(on.getAttribute('aria-label')).toBe(`Equip Military Rifle on ${evil}`);
    on.click();
    expect(status().textContent).toBe(`${evil} now holds Military Rifle`);
    expect(dialog.querySelector('img:not(.gun-icon)')).toBeNull();
  });
});
