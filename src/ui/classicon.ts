// Gun class icons (ID-237): four small polygons, built as SVG nodes (no HTML sinks), so the
// class reads at a glance beside its name. Decoration only: the name always sits next to it.
import type { GunClass } from '../core/data.ts';
import { className } from './statlines.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** Each class's shape on a 16 x 16 box: Light a small arrow, Medium a diamond, Heavy a hexagon, Spread a fan. */
export const CLASS_SHAPE: Readonly<Record<GunClass, string>> = {
  light: '8,1 14,14 8,10 2,14',
  medium: '8,1 15,8 8,15 1,8',
  heavy: '4,2 12,2 15,8 12,14 4,14 1,8',
  // Three thin rays fanning from one point at the left, to the right (a spread of pellets); one
  // polygon each, joined by "|".
  spread: '2,8 14,1 14,4.5|2,8 14,6.2 14,9.8|2,8 14,11.5 14,15',
};

/** The class's icon as an SVG, hidden from screen readers. */
export function classIcon(cls: GunClass): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', `class-icon class-icon-${cls}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const points of CLASS_SHAPE[cls].split('|')) {
    const poly = document.createElementNS(SVG, 'polygon');
    poly.setAttribute('points', points);
    svg.append(poly);
  }
  return svg;
}

/**
 * A chip: the class's icon and its name as text; `title` carries the longer line. `iconOnly`
 * (a small weapon slot, where the name would collide with the dmg/s and the level) keeps the
 * name in the chip's accessible name and title instead.
 */
export function classChip(cls: GunClass, title?: string, iconOnly = false): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `class-chip class-chip-${cls}${iconOnly ? ' class-chip-icon' : ''}`;
  chip.title = title ?? (iconOnly ? className(cls) : '');
  if (!chip.title) chip.removeAttribute('title');
  if (iconOnly) {
    chip.setAttribute('role', 'img');
    chip.setAttribute('aria-label', className(cls));
    chip.append(classIcon(cls));
  } else chip.append(classIcon(cls), document.createTextNode(className(cls)));
  return chip;
}
