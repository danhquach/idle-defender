// The UI kit's tokens (design §15, ID-056): colours live only in `:root`, every token a
// rule uses is defined, and the text colours meet WCAG AA on the surfaces they sit on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PANEL_SPACE } from './build.ts';
import { BOSS_LOOK, COLOR } from './render.ts';

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
  // The swarm banner, its countdown disc and the red wave line (ID-121).
  '--color-on-danger': ['--color-danger'],
  '--color-danger-text': ['--color-danger-bg', '--color-warning-bg', '--color-bar-bg'],
  '--color-synergy': ['--color-surface', '--color-surface-hover'],
  '--color-rare-text': ['--color-surface', '--color-surface-hover'],
  '--color-epic-text': ['--color-surface', '--color-surface-hover'],
  // Weapon names in the Inventory's rows (ID-079).
  '--rarity-rusty': ['--color-surface'],
  '--rarity-common': ['--color-surface'],
  '--rarity-military': ['--color-surface'],
  '--rarity-prototype': ['--color-surface'],
  '--rarity-relic': ['--color-surface'],
};

describe('offer card motion (ID-103)', () => {
  it('turns every offer animation and transition off when the system asks for less motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) {([\s\S]*?)\n}/.exec(css)?.[1] ?? '';
    // Each selector that sets a card animation elsewhere is matched here at least as strongly.
    for (const sel of [
      '.hud-card,',
      '.hud-card:not(.hud-card-picked)',
      '.hud-card-picked',
      '.hud-card-epic::after',
    ]) {
      expect(block, sel).toContain(sel);
    }
    expect(block).toMatch(/animation: none;\s*transition: none;/);
    expect(block).toMatch(/\.hud-card-epic::after {\s*display: none;/);
  });
});

describe('swarm alarm motion (ID-121)', () => {
  it('holds the swarm banner and glow still with the system setting or the game’s own', () => {
    // Every swarm rule that animates is one of these two.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const animated = [
      ...bare.matchAll(/([^{}]*){[^}]*animation: hud-swarm-(?:pulse|glow) [^}]*}/g),
    ].map((m) => m[1]!.trim());
    expect(animated).toEqual(['.hud-swarm-hit', '.hud-swarm-edge']);
    const system = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) {([\s\S]*?)\n}/g)]
      .map((m) => m[1]!)
      .join('\n');
    expect(system).toMatch(/\.hud-swarm,\s*\.hud-swarm-edge,[^{]*{\s*animation: none;/);
    expect(css).toMatch(
      /:root\[data-reduce-motion\] \.hud-swarm,\s*:root\[data-reduce-motion\] \.hud-swarm-edge {\s*animation: none;/,
    );
    // Each beats the rule it stills: `.hud-swarm` (0,1,0) after `.hud-swarm-hit` (0,1,0),
    // and the attribute rules (0,3,0) on specificity.
    expect(css.lastIndexOf('animation: none')).toBeGreaterThan(css.indexOf('.hud-swarm-hit {'));
  });
});

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

describe('the horde-only skill row on a phone (ID-100)', () => {
  it('hides the key tags and the version label while the skill row is up', () => {
    // Each rule sits in a phone-width block: the nearest @media above it is 640px.
    const inPhone = (rule: RegExp): void => {
      const at = css.search(rule);
      expect(at, String(rule)).toBeGreaterThan(0);
      const media = css
        .slice(0, at)
        .match(/@media [^{]*/g)!
        .at(-1);
      expect(media).toBe('@media (max-width: 640px) ');
    };
    inPhone(/\.hud-skill \.menu-key,[^{]*\{\s*display: none;/);
    inPhone(
      /body:has\(\.hud:not\(\[hidden\]\) \.hud-shop:not\(\[hidden\]\) \.hud-skill:not\(\[hidden\]\)\) \.version \{\s*display: none;/,
    );
  });
});

describe('narrow squad cards: a 320 px window, two columns in a wide one (ID-151)', () => {
  /** The body of the rule for exactly `selector`; a missing rule fails with its name. */
  const rule = (selector: string): string => {
    const found = new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(rules);
    expect(found, `no "${selector} {" rule in page.css`).not.toBeNull();
    return found![1]!;
  };

  it('caps a card at the grid’s width, so it never sticks out of the panel', () => {
    const grid = rule('.squad-grid');
    expect(grid).toMatch(
      /grid-template-columns: repeat\(auto-fill, minmax\(min\(260px, 100%\), 1fr\)\);/,
    );
  });

  it('lets the horde picker shrink to the panel, so it does not scroll sideways', () => {
    expect(rule('.hud-horde-pick')).toMatch(/min-width: 0;/);
  });

  it('gives a narrow card a two-row head, measured on the card itself', () => {
    // The card, not the grid: two 284 px cards in a wide window are narrow too.
    expect(rule('.squad-card')).toMatch(/container: squad-card \/ inline-size;/);
    const block = /@container squad-card \(width < (\d+)px\) \{([\s\S]*?)\n\}/.exec(rules);
    expect(block, 'no "@container squad-card (width < …px)" block in page.css').not.toBeNull();
    if (!block) return;
    // Wider than a two-column card (up to ~400 px) and its worst one-line head (~390 px).
    expect(Number(block[1])).toBe(400);
    expect(block[2]).toMatch(/\.squad-card-head \{[^}]*display: grid;/);
    expect(block[2]).toMatch(/\.squad-card-who \{[^}]*display: contents;/);
    // Row 1 name and level, row 2 badge and XP: the badge never shares the name's row.
    expect(block[2]).toMatch(/\.squad-card-level \{[^}]*grid-area: 1 \//);
    expect(block[2]).toMatch(/\.squad-badge \{[^}]*grid-area: 2 \//);
    expect(block[2]).toMatch(/\.squad-card-xp \{[^}]*grid-area: 2 \//);
  });

  it('on a phone, upright or on its side, only Start stays pinned, so a whole squad card fits (ID-169)', () => {
    // A roomy window keeps the whole footer pinned; a short desktop window (720 px) too,
    // since the footer is one compact bar (ID-186). A window 500 px tall or less does not:
    // at 360 px the bar would cover most of the 230 px panel.
    expect(rule('.hud-debrief .hud-result-foot')).toMatch(/position: sticky;/);
    expect(rules).not.toMatch(/@media \(max-width: 480px\), \(max-height: 700px\)/);
    const block =
      /@media \(max-width: 480px\), \(max-height: 500px\) \{\n {2}\.hud-debrief \.hud-result-foot \{([\s\S]*?)\n\}/.exec(
        rules,
      );
    expect(block, 'no phone footer block in page.css').not.toBeNull();
    if (!block) return;
    block[1] = `.hud-debrief .hud-result-foot {${block[1]}`;
    // The footer's box goes: the Skill box, horde picker and lines scroll with the panel.
    expect(block[1]).toMatch(/\.hud-debrief \.hud-result-foot \{\s*display: contents;/);
    // Only the button is pinned, full width.
    expect(block[1]).toMatch(
      /\.hud-debrief \.hud-result-foot \.hud-button \{[^}]*position: sticky;[^}]*width: 100%;/,
    );
  });
});

describe('the Roster tabs (ID-154)', () => {
  it('the shown survivor is styled by the attribute its tab sets (aria-current)', () => {
    // The tabs mark the one shown with aria-current; a rule on aria-pressed never matched.
    expect(rules).toMatch(/\.rv-tab\[aria-current='true'\]\s*\{/);
    expect(rules).not.toMatch(/\.rv-tab\[aria-pressed/);
  });

  it('with a bench, the squad is raised and the bench dashed', () => {
    expect(rules).toMatch(
      /\.rv-tabs:not\(\.rv-bench\) \.rv-tab \{[^}]*background: var\(--color-surface\)/,
    );
    expect(rules).toMatch(/\.rv-bench \.rv-tab \{[^}]*border-style: dashed/);
  });

  it('a card is two equal columns, 2:3 on a 320 px phone, with no fixed-width left side (ID-187)', () => {
    expect(rules).toMatch(
      /\.rv-tab \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/,
    );
    expect(rules).toMatch(
      /@container \(max-width: 340px\) \{\s*\.rv-tab \{\s*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/,
    );
    expect(rules).not.toMatch(/\.rv-tab \{[^}]*grid-template-columns: \d+px/);
    // Portrait and gun fill their column at a fixed shape, never stretched.
    expect(rules).toMatch(/\.roster-avatar-xs \{[^}]*width: 100%;[^}]*aspect-ratio: 1;/);
    expect(rules).toMatch(/\.rv-tab-gun \{[^}]*width: 100%;[^}]*aspect-ratio: 2 \/ 1;/);
    expect(rules).not.toMatch(/\.rv-tab-gun \{[^}]*width: \d+px/);
    // Rows of four cards at most 100 px wide on desktop; the bench at the same width.
    expect(rules).toMatch(
      /\.rv-tabs \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 100px\)\)/,
    );
    expect(rules).toMatch(/\.rv-bench \{[^}]*grid-auto-columns: 100px/);
  });
});

describe('Help marks (ID-168)', () => {
  it('each mark swatch uses the colour the field draws it in', () => {
    expect(tokens.get('--color-mark-hp')).toBe(COLOR.hpFill);
    expect(tokens.get('--color-mark-hp-lost')).toBe(COLOR.hpBack);
    expect(tokens.get('--color-mark-ammo')).toBe(COLOR.ammo);
    expect(tokens.get('--color-mark-edge')).toBe(COLOR.hpEdge);
    expect(tokens.get('--color-mark-ammo-empty')).toBe(COLOR.ammoBack);
    // The field strokes rgba(r, g, b, a); the token is rgb(r g b / a%).
    const [r, g, b, a] = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(BOSS_LOOK.roar)!.slice(1);
    expect(rgba('--color-mark-roar')).toEqual([+r!, +g!, +b!, +a!]);
  });
});

describe('the offer cards (ID-177)', () => {
  it('the pick number is large and centred at the top; the name is centred', () => {
    expect(rules).toMatch(
      /\.hud-card-has-art \.hud-card-key \{[^}]*align-self: center;[^}]*font-size: var\(--text-title\)/,
    );
    expect(rules).not.toMatch(/\.hud-card-has-art \.hud-card-key \{[^}]*position: absolute/);
    expect(rules).toMatch(
      /\.hud-card-has-art \.hud-card-title,\s*\.hud-card-has-art \.hud-card-kind \{[^}]*text-align: center/,
    );
    expect(rules).toMatch(/\.hud-card-has-art \.hud-card-tag \{[^}]*align-self: center/);
    // Stacked on a phone, both centre over the text column.
    expect(rules).toMatch(
      /\.hud-card-has-art > \.hud-card-key,\s*\.hud-card-has-art > \.hud-card-title,[^{]*\.hud-card-has-art > \.hud-card-kind \{[^}]*justify-self: center/,
    );
  });
});

describe("a win's result at a glance (ID-186)", () => {
  const won = String.raw`\.hud-debrief\[data-kind='won'\]`;
  const closed = String.raw`${won}:not\(\[data-details\]\)`;

  it('closed, the long lines are hidden; open, nothing is', () => {
    // One rule hides them all, and only while the details are closed.
    const hidden = new RegExp(
      String.raw`((?:${closed} [^{]+,\s*)+${closed} [^{]+)\{\s*display: none;`,
    );
    const list = hidden.exec(rules);
    expect(list, 'no closed-details rule in page.css').not.toBeNull();
    for (const part of [
      'tile-more',
      'tile-recruit-full',
      'squad-card-xptext',
      'squad-card-gear',
      'squad-card-bonus',
      'debrief-hint',
      'debrief-stash',
    ]) {
      expect(list![1]).toContain(`.${part}`);
    }
    // No rule hides any of them with the details open.
    expect(rules).not.toMatch(/\[data-details\] [^{]*\{\s*display: none;/);
  });

  it('desktop and tablet first: tiles and squad share a row from 700 px, wider from 1000 px', () => {
    const tablet = /@media \(min-width: 700px\) \{([\s\S]*?)\n\}/.exec(rules);
    expect(tablet, 'no 700 px block').not.toBeNull();
    expect(tablet![1]).toMatch(/width: min\(720px, calc\(100vw - 48px\)\);/);
    // The panel's own boxes step aside so their children lay out as one row.
    expect(tablet![1]).toMatch(/\.debrief-spoils \{\s*display: contents;/);
    // Three level-ups or more take a row of their own.
    expect(tablet![1]).toMatch(/\.debrief-squad:has\(\.squad-card:nth-child\(3\)\)/);
    const desktop = /@media \(min-width: 1000px\) \{([\s\S]*?)\n\}/.exec(rules);
    expect(desktop, 'no 1000 px block').not.toBeNull();
    expect(desktop![1]).toMatch(/width: min\(760px, calc\(100vw - 64px\)\);/);
    // Wide only with something to fill it: someone asking, or three level-ups.
    expect(desktop![1]).toMatch(
      /:has\(\.tile-join:not\(\[hidden\], \.tile-recruit-full\)\),[^{]*:has\(\.squad-card:nth-child\(3\)\) \{\s*width: min\(1120px, calc\(100vw - 64px\)\);/,
    );
  });

  it('small things a finger must hit keep their size: answers 40 px, toggles a wider hit area', () => {
    expect(rules).toMatch(/\.join-btn \{[^}]*min-height: 40px;/);
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{[\s\S]*?\.chip-details::before,\s*\.debrief-details::before \{[^}]*inset: -8px/,
    );
    // A small card's name is a 41 px button under a finger (17 px of text, 12 px each side).
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{[\s\S]*?:not\(\[data-details\]\) \.squad-card-name \{[^}]*min-width: 44px;[^}]*padding-block: 12px;/,
    );
    // Open, "Details" is filled: the state is not left to its caret.
    expect(rules).toMatch(
      /\.debrief-details\[aria-expanded='true'\] \{[^}]*background: var\(--color-accent\);/,
    );
    // The footer's skill toggle and horde select, on every debrief screen.
    expect(rules).toMatch(/\.hud-debrief \.hud-skill-option \{[^}]*min-height: 40px;/);
    expect(rules).toMatch(/\.hud-debrief \.hud-horde-select \{[^}]*min-height: 40px;/);
  });
});

describe('one card size per grid (ID-186)', () => {
  it('cards of a row stretch to the tallest, and every row is as tall as the tallest row', () => {
    const grid = /\n\.squad-grid \{([^}]*)\}/.exec(rules);
    expect(grid, 'no .squad-grid rule').not.toBeNull();
    expect(grid![1]).toMatch(/align-items: stretch;/);
    expect(grid![1]).toMatch(/grid-auto-rows: 1fr;/);
    // Equal columns too: every grid of cards is auto-fill tracks of one minmax.
    for (const m of rules.matchAll(/\.squad-grid \{[^}]*grid-template-columns: ([^;]+);/g)) {
      expect(m[1]).toMatch(/^repeat\(auto-fill, minmax\(.+, 1fr\)\)$/);
    }
  });

  it('tiles that share a row are equally tall', () => {
    expect(rules).toMatch(/\.tile-drop,\s*[^{]*\.tile-join \{[^}]*align-self: stretch;/);
  });
});
