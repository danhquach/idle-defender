// The UI kit's buttons (design §15, ID-056): primary and secondary for actions, and two
// refused states. An unaffordable button shows the part of its cost it can't pay in red
// (`.btn-cost-short`); a locked one shows a lock badge and the reason as visible text, not
// only as a tooltip.
import { MATERIALS, type Stock } from '../core/data.ts';

// Primary is the build panel's Start Horde (ID-059).
export const BUTTON_VARIANTS = ['primary', 'secondary', 'unaffordable', 'locked'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/**
 * Puts `button` in `variant`: the two refused ones disable it. A locked button gets the
 * lock badge before its label; a refused one shows `reason`, when given, on its own line.
 * Safe to call again on the same button as its state changes.
 */
export function setVariant(button: HTMLButtonElement, variant: ButtonVariant, reason = ''): void {
  for (const v of BUTTON_VARIANTS) button.classList.toggle(`btn-${v}`, v === variant);
  const refused = variant === 'unaffordable' || variant === 'locked';
  button.disabled = refused;
  const badge = button.querySelector(':scope > .btn-lock');
  if (variant === 'locked' && !badge) {
    const lock = document.createElement('span');
    lock.className = 'btn-lock';
    lock.setAttribute('aria-hidden', 'true');
    button.prepend(lock);
  } else if (variant !== 'locked') badge?.remove();
  let line = button.querySelector(':scope > .btn-reason');
  if (refused && reason !== '') {
    if (!line) {
      line = document.createElement('span');
      line.className = 'btn-reason';
      button.append(line);
    }
    if (line.textContent !== reason) line.textContent = reason;
  } else line?.remove();
}

/**
 * A cost as "(60 scrap, 80 wood)" ("(nothing)" when free), each material `stock` is short
 * of marked `.btn-cost-short`, so an unaffordable button shows just those in red.
 */
export function costLine(
  cost: Partial<Stock>,
  stock: Stock | null,
  className: string,
): HTMLElement {
  const line = document.createElement('span');
  line.className = className;
  const parts = MATERIALS.filter((m) => (cost[m] ?? 0) > 0);
  line.append('(');
  parts.forEach((m, i) => {
    const part = document.createElement('span');
    part.textContent = `${cost[m]} ${m}`;
    if (stock && stock[m] < cost[m]!) part.className = 'btn-cost-short';
    line.append(...(i > 0 ? [', ', part] : [part]));
  });
  line.append(parts.length > 0 ? ')' : 'nothing)');
  return line;
}
