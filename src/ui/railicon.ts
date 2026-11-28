// The phone shell's rail icons (ID-273): line drawings in the text colour, drawn only where
// the left rail shows (the CSS hides them elsewhere). Built as SVG nodes, never from markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A rail icon's shapes, in a 24 × 24 box. */
const SHAPES = {
  roster: [
    ['circle', { cx: '12', cy: '8', r: '3.5' }],
    ['path', { d: 'M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5' }],
  ],
  weapons: [
    ['circle', { cx: '12', cy: '12', r: '6' }],
    ['path', { d: 'M12 3v5M12 16v5M3 12h5M16 12h5' }],
  ],
  menu: [['path', { d: 'M4 7h16M4 12h16M4 17h16' }]],
} as const;

export type RailIcon = keyof typeof SHAPES;

/** The icon's svg.rail-icon: decoration only, so a screen reader reads the button's label. */
export function railIcon(doc: Document, icon: RailIcon): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'rail-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of SHAPES[icon]) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
    svg.append(shape);
  }
  return svg;
}

/**
 * The title screen's Mute icon (ID-279), drawn only in the phone shell: a speaker with sound
 * waves, and a slash across it while the box is ticked (the CSS shows one or the other).
 */
export function speakerIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'intro-mute-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shapes: [string, Record<string, string>][] = [
    ['path', { d: 'M4 9h4l5-4v14l-5-4H4z' }],
    ['path', { class: 'intro-mute-waves', d: 'M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11' }],
    ['path', { class: 'intro-mute-slash', d: 'M17 9l5 6M22 9l-5 6' }],
  ];
  for (const [tag, attrs] of shapes) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
    svg.append(shape);
  }
  return svg;
}
