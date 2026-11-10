// The title-screen logo: "THE LONG HOLD" as a damaged concrete wall, "HOLD" smeared with
// blood, splats and drips. All of it is SVG built here: the letters are SVG text in a
// title font, roughened by noise filters, chipped, holed and cracked by a mask. The
// logo is decoration (aria-hidden); the heading's name comes from a hidden span instead.
import { createRng, type Rng } from '../core/rng.ts';

const SVG = 'http://www.w3.org/2000/svg';

// The logo's palette. It is art, not UI text, so it lives here rather than in page.css's
// tokens and is outside the WCAG text-contrast test; it sits on the dark title art.
const CONCRETE_STOPS = [
  [0, '#d9d3c7'],
  [0.6, '#b3ac9f'],
  [1, '#7c776e'],
] as const;
const BLOOD_STOPS = [
  [0, '#c62a22'],
  [0.6, '#8e1712'],
  [1, '#560a08'],
] as const;
const SPLAT_FILL = '#8e1712';
const DRIP_FILL = '#7d130f';
const SHADOW_FILL = '#000';
/** Grime on the wall: grey dust on the concrete, dark clots on the blood. */
const GRIME_DUST: Rgb = [0.42, 0.4, 0.37];
const GRIME_CLOT: Rgb = [0.32, 0.05, 0.04];

type Rgb = readonly [number, number, number];
type Attrs = Record<string, string | number>;

function add(parent: Element, tag: string, attrs: Attrs = {}): SVGElement {
  const node = parent.ownerDocument.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.append(node);
  return node;
}

/** Noise displacement: rough, uneven edges (`scale` px of wobble). */
function wobble(filter: Element, freq: number, seed: number, scale: number, out?: string): void {
  add(filter, 'feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: freq,
    numOctaves: 3,
    seed,
    result: `n${seed}`,
  });
  add(filter, 'feDisplacementMap', {
    in: 'SourceGraphic',
    in2: `n${seed}`,
    scale,
    xChannelSelector: 'R',
    yChannelSelector: 'G',
    ...(out ? { result: out } : {}),
  });
}

/**
 * Noise turned into a flat-coloured layer kept inside the letters: `rgb` is the colour,
 * and alpha is `bias - gain * noise`, so a higher bias covers more of the letter.
 */
function stain(
  filter: Element,
  o: { freq: number; seed: number; rgb: Rgb; gain: number; bias: number },
  out: string,
): void {
  add(filter, 'feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: o.freq,
    numOctaves: o.freq > 0.3 ? 2 : 3,
    seed: o.seed,
    result: `${out}N`,
  });
  const [r, g, b] = o.rgb;
  add(filter, 'feColorMatrix', {
    in: `${out}N`,
    type: 'matrix',
    values: `0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${-o.gain} ${o.bias}`,
    result: `${out}C`,
  });
  add(filter, 'feComposite', { in: `${out}C`, in2: 'chipped', operator: 'in', result: out });
}

/**
 * A wall filter: rough edges, chips knocked out (bias 26.6: the chip noise's alpha cut-off
 * is 26.6 / 40, so a higher bias leaves more of each letter solid), grime and a fine grain.
 */
function wallFilter(d: Element, id: string, grime: Rgb, grimeBias: number): void {
  const wall = add(d, 'filter', {
    id,
    x: '-5%',
    y: '-10%',
    width: '110%',
    height: '130%',
    'color-interpolation-filters': 'sRGB',
  });
  wobble(wall, 0.05, 4, 9, 'rough');
  add(wall, 'feTurbulence', {
    type: 'fractalNoise',
    baseFrequency: 0.1,
    numOctaves: 4,
    seed: 11,
    result: 'chipN',
  });
  add(wall, 'feColorMatrix', {
    in: 'chipN',
    type: 'matrix',
    values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -40 26.6',
    result: 'chipA',
  });
  add(wall, 'feComposite', { in: 'rough', in2: 'chipA', operator: 'in', result: 'chipped' });
  stain(wall, { freq: 0.025, seed: 8, rgb: grime, gain: 10, bias: grimeBias }, 'grime');
  stain(wall, { freq: 0.7, seed: 3, rgb: [0.1, 0.1, 0.1], gain: 1.2, bias: 0.72 }, 'grain');
  const merge = add(wall, 'feMerge');
  for (const n of ['chipped', 'grime', 'grain']) add(merge, 'feMergeNode', { in: n });
}

function defs(svg: SVGElement): void {
  const d = add(svg, 'defs');
  const grad = (id: string, stops: readonly (readonly [number, string])[]) => {
    const g = add(d, 'linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    for (const [offset, color] of stops) add(g, 'stop', { offset, 'stop-color': color });
  };
  grad('lh-concrete', CONCRETE_STOPS);
  grad('lh-blood', BLOOD_STOPS);

  // THE LONG is concrete with grey dust; HOLD keeps its red under darker clots.
  wallFilter(d, 'lh-wall', GRIME_DUST, 5.3);
  wallFilter(d, 'lh-wall-blood', GRIME_CLOT, 4.6);

  // Blood: splats torn ragged, drips only a little uneven.
  const splat = add(d, 'filter', {
    id: 'lh-splat',
    x: '-20%',
    y: '-20%',
    width: '140%',
    height: '140%',
  });
  wobble(splat, 0.08, 21, 16);
  const drip = add(d, 'filter', {
    id: 'lh-drip',
    x: '-5%',
    y: '-5%',
    width: '110%',
    height: '110%',
  });
  wobble(drip, 0.05, 9, 4);

  // Damage cut out of the letters: torn chunks, bullet holes and cracks.
  const mask = add(d, 'mask', {
    id: 'lh-damage',
    maskUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: 640,
    height: 300,
  });
  add(mask, 'rect', { width: 640, height: 300, fill: '#fff' });
  const holes = add(mask, 'g', { fill: '#000', filter: 'url(#lh-drip)' });
  for (const p of [
    'M150 30 l30 16 l-12 14 z',
    'M520 38 l28 8 l-8 28 z',
    'M226 238 l26 -10 l4 20 z',
    'M440 200 l24 4 l-6 22 z',
  ])
    add(holes, 'path', { d: p });
  for (const [cx, cy, r] of [
    [268, 62, 5],
    [282, 74, 3.5],
    [470, 88, 5.5],
    [330, 178, 6],
    [346, 196, 4],
    [196, 84, 4],
  ] as const)
    add(holes, 'circle', { cx, cy, r });
  const cracks = add(mask, 'g', { stroke: '#000', fill: 'none', 'stroke-linecap': 'round' });
  for (const [p, w] of [
    ['M300 22 L312 50 L304 72 L318 100', 2.4],
    ['M312 50 L332 60', 1.4],
    ['M120 60 L160 74 L178 70', 1.8],
    ['M420 140 L404 170 L414 196 L400 236', 2.4],
    ['M404 170 L382 178', 1.4],
    ['M500 84 L540 92', 1.6],
  ] as const)
    add(cracks, 'path', { d: p, 'stroke-width': w });
}

/** The two lines of the logo, filled with `fills`. */
function words(parent: Element, fills: readonly [string, string]): void {
  const line = (text: string, y: number, size: number, fill: string, filter: string) => {
    const t = add(parent, 'text', {
      x: 320,
      y,
      'font-size': size,
      fill,
      filter: `url(#${filter})`,
    });
    t.textContent = text;
  };
  line('THE LONG', 110, 112, fills[0], 'lh-wall');
  line('HOLD', 225, 126, fills[1], 'lh-wall-blood');
}

/** A blood splat at (cx, cy): one blob of radius `r` and `n` drops sprayed around it. */
function splat(g: Element, rng: Rng, cx: number, cy: number, r: number, n: number): void {
  add(g, 'circle', { cx, cy, r });
  const spread = 2.6;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const dist = r * (1.1 + rng() * spread);
    const size = Math.max(1.2, r * 0.22 * (1 - dist / (r * (1 + spread))) + rng() * 2);
    add(g, 'circle', {
      cx: (cx + Math.cos(a) * dist).toFixed(1),
      cy: (cy + Math.sin(a) * dist * 0.7).toFixed(1),
      r: size.toFixed(1),
    });
  }
}

/** A drip running down from (x, y): `w` wide, `h` long, with a rounded drop at the end. */
function drip(g: Element, x: number, y: number, w: number, h: number): void {
  const tip = w * 0.8;
  add(g, 'path', {
    d: `M${x} ${y} h${w} v${h} q0 ${tip} ${-w / 2} ${tip} q${-w / 2} 0 ${-w / 2} ${-tip}z`,
  });
}

/** Builds the logo. Same look every time: the spray comes from a fixed seed. */
export function createTitleLogo(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'intro-logo');
  svg.setAttribute('viewBox', '0 0 640 300');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  defs(svg);

  const shadow = add(svg, 'g', {
    transform: 'translate(5 6)',
    opacity: 0.75,
    'text-anchor': 'middle',
    mask: 'url(#lh-damage)',
  });
  words(shadow, [SHADOW_FILL, SHADOW_FILL]);
  const face = add(svg, 'g', { 'text-anchor': 'middle', mask: 'url(#lh-damage)' });
  words(face, ['url(#lh-concrete)', 'url(#lh-blood)']);

  const rng = createRng(7);
  const blood = add(svg, 'g', { fill: SPLAT_FILL, filter: 'url(#lh-splat)' });
  splat(blood, rng, 445, 84, 22, 28);
  splat(blood, rng, 150, 64, 12, 16);
  const drips = add(svg, 'g', { fill: DRIP_FILL, filter: 'url(#lh-drip)' });
  for (const [x, y, w, h] of [
    [196, 214, 10, 34],
    [248, 220, 8, 58],
    [300, 216, 10, 22],
    [352, 218, 7, 44],
    [408, 214, 11, 28],
    [436, 220, 6, 66],
    [439, 98, 6, 40],
    [461, 100, 5, 22],
  ] as const)
    drip(drips, x, y, w, h);
  return svg;
}
