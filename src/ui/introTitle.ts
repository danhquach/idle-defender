// The title-screen logo (ID-281): "THE LONG HOLD" set clean in the title font, "THE LONG"
// widely spaced in off-white over a big red "HOLD", each letter edged dark with a soft drop
// shadow so it reads over the title art. All of it is SVG built here; the logo is decoration
// (aria-hidden), the heading's name comes from a hidden span instead.

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The logo's look. It is art, not UI text, so it lives here rather than in page.css's tokens
 * and is outside the WCAG text-contrast test; it sits on the dark title art. Each line is
 * `[text, baseline y, font size, letter spacing]` in the 640 × 300 view box.
 */
export const TITLE_LOGO = {
  top: ['THE LONG', 104, 118, 22],
  hold: ['HOLD', 258, 200, 10],
  light: '#efe9dc',
  red: '#c8352a',
  edge: '#120807',
  edgeWidth: 4,
  shadow: { dy: 4, blur: 5, opacity: 0.85 },
} as const;

type Attrs = Record<string, string | number>;

function add(parent: Element, tag: string, attrs: Attrs = {}): SVGElement {
  const node = parent.ownerDocument.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.append(node);
  return node;
}

/** Builds the logo. Same look every time. */
export function createTitleLogo(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'intro-logo');
  svg.setAttribute('viewBox', '0 0 640 300');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const { shadow } = TITLE_LOGO;
  const filter = add(add(svg, 'defs'), 'filter', {
    id: 'lh-shadow',
    x: '-10%',
    y: '-10%',
    width: '120%',
    height: '140%',
  });
  add(filter, 'feDropShadow', {
    dx: 0,
    dy: shadow.dy,
    stdDeviation: shadow.blur,
    'flood-color': '#000',
    'flood-opacity': shadow.opacity,
  });
  const words = add(svg, 'g', {
    'text-anchor': 'middle',
    stroke: TITLE_LOGO.edge,
    'stroke-width': TITLE_LOGO.edgeWidth,
    'stroke-linejoin': 'round',
    'paint-order': 'stroke',
    filter: 'url(#lh-shadow)',
  });
  for (const [[text, y, size, spacing], fill] of [
    [TITLE_LOGO.top, TITLE_LOGO.light],
    [TITLE_LOGO.hold, TITLE_LOGO.red],
  ] as const) {
    // Letter spacing also follows the last letter: half of it back keeps the line centred.
    const t = add(words, 'text', {
      x: 320 + spacing / 2,
      y,
      'font-size': size,
      'letter-spacing': spacing,
      fill,
    });
    t.textContent = text;
  }
  return svg;
}
