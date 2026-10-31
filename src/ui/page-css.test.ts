// The UI kit's tokens (design §15, ID-056): colours live only in `:root`, every token a
// rule uses is defined, and the text colours meet WCAG AA on the surfaces they sit on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PANEL_SPACE } from './build.ts';

const css = readFileSync(new URL('../page.css', import.meta.url), 'utf8');

const rootBlock = /:root\s*{([^}]*)}/.exec(css)![1]!;
const rules = css.replace(/:root\s*{[^}]*}/, '').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = new Map(
  [...rootBlock.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
);

/** A token's colour (or a literal colour) as [r, g, b, alpha 0–1]. */
function rgba(name: string): [number, number, number, number] {
  const value = name.startsWith('--') ? tokens.get(name) : name;
  if (value === undefined) throw new Error(`no token ${name}`);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [n >> 16, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ (\d+)%)?\)$/.exec(value);
  if (!rgb) throw new Error(`${name} is not a colour: ${value}`);
  return [+rgb[1]!, +rgb[2]!, +rgb[3]!, rgb[4] === undefined ? 1 : +rgb[4] / 100];
}

/**
 * A see-through background over white: the lightest thing that can show through it,
 * so the worst case for light text over the field.
 */
function solid(name: string): [number, number, number] {
  const [r, g, b, a] = rgba(name);
  return [r, g, b].map((c) => c * a + 255 * (1 - a)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (fg: string, bg: string): number => {
  const [a, b] = [luminance(solid(fg)), luminance(solid(bg))].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
};

// Each text colour with every surface the page puts it on.
const TEXT_ON: Record<string, string[]> = {
  '--color-text': [
    '--color-bg',
    '--color-surface-sunken',
    '--color-surface',
    '--color-surface-hover',
    '--color-surface-active',
    '--color-map-camp',
    '--color-bar-bg',
    '--color-label-bg',
    '--color-toast-bg',
    '--color-panel-bg',
    '--color-menu-bg',
    '--color-danger-bg',
    '--color-danger-surface',
    '--color-warning-bg',
    '--color-boss-bg',
  ],
  '--color-text-muted': [
    '--color-bg',
    '--color-surface',
    '--color-surface-hover',
    '--color-panel-bg',
    '--color-menu-bg',
  ],
  '--color-text-subtle': [
    '--color-bg',
    '--color-surface',
    '--color-surface-hover',
    '--color-surface-active',
    '--color-panel-bg',
    '--color-menu-bg',
  ],
  '--color-text-disabled': ['--color-bg', '--color-surface', '--color-panel-bg'],
  '--color-text-faint': ['--color-bg'],
  '--color-text-on-accent': ['--color-accent', '--color-accent-hover'],
  '--color-cost-short': ['--color-surface', '--color-panel-bg'],
  '--color-reason': [
    '--color-surface',
    '--color-surface-hover',
    '--color-panel-bg',
    '--color-menu-bg',
  ],
  '--color-warn': ['--color-bg', '--color-warn-bg', '--color-menu-bg'],
  '--color-ok-text': ['--color-surface-sunken'],
  '--color-danger-text': ['--color-danger-bg'],
  '--color-synergy': ['--color-surface', '--color-surface-hover'],
  '--color-rare-text': ['--color-surface', '--color-surface-hover'],
  '--color-epic-text': ['--color-surface', '--color-surface-hover'],
};

describe('UI kit tokens (ID-056)', () => {
  it('keeps colour literals out of the component rules', () => {
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i);
    // Named colours too (`transparent` is fine: it is no colour).
    expect(rules).not.toMatch(
      /:[^;{}]*\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gr[ae]y|silver|gold|brown|cyan|magenta|maroon|navy|teal|olive|lime|aqua|fuchsia)\b/i,
    );
  });

  it('defines every token a rule uses', () => {
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!));
    // `--risk` is set per place by the world map's script.
    const missing = [...used].filter((t) => !tokens.has(t) && t !== '--risk');
    expect(missing).toEqual([]);
  });

  it('has a type scale of display and body sizes', () => {
    for (const t of ['--text-display-lg', '--text-display', '--text-title', '--text-body']) {
      expect(tokens.get(t)).toMatch(/^[\d.]+rem$/);
    }
    expect(parseFloat(tokens.get('--text-display')!)).toBeGreaterThan(
      parseFloat(tokens.get('--text-title')!),
    );
  });

  it.each(Object.entries(TEXT_ON).flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg])))(
    'puts %s on %s at WCAG AA (4.5:1) or better',
    (fg, bg) => {
      expect(contrast(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('draws the lock badge at 3:1 or better on a button (non-text contrast)', () => {
    expect(contrast('--color-text-muted', '--color-surface')).toBeGreaterThanOrEqual(3);
  });

  it('pins a few ratios, so a broken check cannot pass everything', () => {
    expect(contrast('--color-text', '--color-bg')).toBeCloseTo(12.15, 1);
    // The old faint grey failed AA on the page background.
    expect(contrast('#6f6b64', '--color-bg')).toBeLessThan(4.5);
  });
});

describe('the build panel’s size (ID-065)', () => {
  it('PANEL_SPACE is its CSS width plus its right gap, so the build scene fits beside it', () => {
    const rule = /\n\.build-panel \{([^}]*)\}/.exec(css)![1]!;
    const px = (prop: string) => Number(new RegExp(`\\n\\s*${prop}:\\s*(\\d+)px`).exec(rule)![1]);
    expect(PANEL_SPACE).toBe(px('width') + px('right'));
  });
});
