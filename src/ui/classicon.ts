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
 * The class badge (ID-254): the class's polygon, in the class's colour, on a small dark plate.
 * One look wherever a class shows; `label` makes it a named image (a lone badge), otherwise it
 * is decoration beside or inside something that says the class already.
 */
export function classBadge(
  cls: GunClass,
  opts: { label?: boolean; title?: string } = {},
): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `class-badge class-badge-${cls}`;
  if (opts.label) {
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', className(cls));
    badge.title = opts.title ?? className(cls);
  } else badge.setAttribute('aria-hidden', 'true');
  badge.append(classIcon(cls));
  return badge;
}

/** A chip: the class's badge and its name as text; `title` carries the longer line. */
export function classChip(cls: GunClass, title?: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `class-chip class-chip-${cls}`;
  if (title) chip.title = title;
  chip.append(classBadge(cls), document.createTextNode(className(cls)));
  return chip;
}
