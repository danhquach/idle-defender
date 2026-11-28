// The field behind an open window (ID-276). Off the phone shell a window makes the whole field
// (`root`) inert, as it always did. On the phone shell the five rail buttons stay live so the
// rail can switch or close a sheet: every other child of `root` goes inert instead, and a
// child added while a sheet is open (a toast, an overlay) goes inert too. A full hold (the title
// screen, the Help card) keeps the rail dead as well. Several windows can hold at once (a Help
// card over the Menu); the field is released only when the last one lets go, and a release
// clears only what this module set.
import { isShortTouch, watchShortTouch } from './landscape.ts';

/** The rail's five buttons: the only children of `root` a sheet leaves live. */
export const RAIL_BUTTONS =
  '.roster-button, .inv-button, .map-button, .research-button, .menu-button';

interface Field {
  root: HTMLElement;
  /** Who holds, and whether each lets the rail stay live. */
  holds: Map<unknown, boolean>;
  /** The children this module made inert on the phone shell. */
  kids: Set<Element>;
  /** Whether this module set `root`'s own inert. */
  rootSet: boolean;
  watching: { stop(): void } | null;
  watcher: MutationObserver | null;
}

const fields = new WeakMap<HTMLElement, Field>();
const live = new Set<Field>();

function apply(f: Field): void {
  const { root } = f;
  const held = f.holds.size > 0;
  const rail = held && isShortTouch(window) && ![...f.holds.values()].some((r) => !r);
  const wholly = held && !rail;
  if (wholly) {
    root.setAttribute('inert', '');
    f.rootSet = true;
  } else if (f.rootSet) {
    root.removeAttribute('inert');
    f.rootSet = false;
  }
  if (rail) {
    // Forget children that have left root (a toast gone), so a long sheet doesn't hoard them.
    for (const kid of f.kids) if (kid.parentElement !== root) f.kids.delete(kid);
    for (const child of root.children) {
      if (child.matches(RAIL_BUTTONS)) {
        if (f.kids.delete(child)) child.removeAttribute('inert');
      } else if (!f.kids.has(child) && !child.hasAttribute('inert')) {
        child.setAttribute('inert', '');
        f.kids.add(child);
      }
    }
  } else {
    for (const child of f.kids) child.removeAttribute('inert');
    f.kids.clear();
  }
  // Only a sheet needs to see children arrive; only the child list, never an attribute.
  if (rail && !f.watcher && typeof MutationObserver === 'function') {
    f.watcher = new MutationObserver(() => apply(f));
    f.watcher.observe(root, { childList: true });
  } else if (!rail && f.watcher) {
    f.watcher.disconnect();
    f.watcher = null;
  }
}

/** Redoes the field, and follows the phone shell only while a sheet's hold needs it to. */
function update(f: Field): void {
  apply(f);
  const watch = [...f.holds.values()].some((rail) => rail);
  if (watch && !f.watching) f.watching = { stop: watchShortTouch(window, () => apply(f)) };
  else if (!watch && f.watching) {
    f.watching.stop();
    f.watching = null;
  }
  if (f.holds.size === 0) live.delete(f);
  else live.add(f);
}

/**
 * `owner` holds the field behind it. `rail: false` is a full hold: the rail goes dead on the
 * phone shell too. Holding again by the same owner changes its kind, never the count.
 */
export function holdField(root: HTMLElement, owner: unknown, opts: { rail?: boolean } = {}): void {
  let f = fields.get(root);
  if (!f) {
    f = { root, holds: new Map(), kids: new Set(), rootSet: false, watching: null, watcher: null };
    fields.set(root, f);
  }
  f.holds.set(owner, opts.rail !== false);
  update(f);
}

/** `owner` lets go. The field is free again when no one holds it. */
export function releaseField(root: HTMLElement, owner: unknown): void {
  const f = fields.get(root);
  if (f?.holds.delete(owner)) update(f);
}

/** Puts every held field right again: after something else (a confirm) restored the page. */
export function refreshFields(): void {
  for (const f of live) apply(f);
}
