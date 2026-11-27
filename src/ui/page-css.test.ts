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
  // An alias (--class-badge-bg: var(--color-bg)) is its target's colour.
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias) return rgba(alias[1]!);
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
  // The class badge's glyphs sit on its own plate (ID-254).
  '--class-light': ['--class-badge-bg'],
  '--class-medium': ['--class-badge-bg'],
  '--class-heavy': ['--class-badge-bg'],
  '--class-spread': ['--class-badge-bg'],
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
    // `--risk` is set per place by the world map's script; `--scrap-chip-w` is the Scrap
    // chip's measured width (ID-239), set by its script.
    const set = ['--risk', '--scrap-chip-w'];
    const missing = [...used].filter((t) => !tokens.has(t) && !set.includes(t));
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
      /body:has\(\.hud:not\(\[hidden\]\) \.hud-shop:not\(\[hidden\]\) :is\(\.hud-skill, \.hud-repairs\):not\(\[hidden\]\)\)\s*\.version \{\s*display: none;/,
    );
  });
});

/** The body of the rule for exactly `selector`; a missing rule fails with its name. */
const rule = (selector: string): string => {
  const found = new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`).exec(rules);
  expect(found, `no "${selector} {" rule in page.css`).not.toBeNull();
  return found![1]!;
};

describe('squad cards: avatar and name, wrapping in the panel (ID-151, ID-196)', () => {
  it('lays the cards in a grid and lets a card shrink to its column, so it never sticks out of the panel', () => {
    // Three columns that shrink to the panel; two on a phone (below).
    expect(rule('.squad-grid')).toMatch(
      /display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(rule('.squad-card')).toMatch(/min-width: 0;/);
    // One line: a long name ends in "…" instead of growing the card.
    expect(rule('.squad-card .squad-card-name')).toMatch(
      /overflow: hidden;[^}]*text-overflow: ellipsis;/,
    );
  });

  it('lets the horde picker shrink to the panel, so it does not scroll sideways', () => {
    expect(rule('.hud-horde-pick')).toMatch(/min-width: 0;/);
  });

  it('a finger gets 44 px of the name, which opens the survivor’s card', () => {
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{[^@]*?\.squad-card \.squad-card-name \{[^}]*min-width: 44px;[^}]*padding-block: 12px;/,
    );
  });

  it('a level-up is a triangle beside the name, not a badge (ID-196)', () => {
    expect(rules).toMatch(/\n\.squad-up \{/);
    expect(rules).not.toMatch(/\.squad-badge-up/);
  });

  it('the weapons row is a 3-column grid, and a phone gets two columns of weapons and cards', () => {
    expect(rule('.gun-row')).toMatch(
      /display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(rules).toMatch(
      /@media \(max-width: 480px\) \{[\s\S]*?\.gun-row,\s*\.squad-grid \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });
});

describe('the horde panel is content-sized, in one layout (ID-196, ID-200)', () => {
  /** Every rule whose selector is the panel itself, with the qualifiers on it (no descendant). */
  const panelRules = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m) =>
    m[1]!
      .split(',')
      .map((sel) => sel.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((sel) => /^\S+$/.test(sel) && /hud-debrief/.test(sel))
      .map((sel) => ({ sel, body: m[2]! })),
  );
  const SIZE = /(?:^|[\s;])(?:min-|max-)?(?:width|height|flex-basis|aspect-ratio):/;

  it('the panel is content-sized under a cap, one width, in the base rule (ID-200)', () => {
    const base = panelRules.filter((r) => r.sel === '.hud-result.hud-debrief');
    expect(base.length).toBeGreaterThan(0);
    expect(base[0]!.body).toMatch(/(?:^|\s)width: min\(\d+px, calc\(100vw - \d+px\)\);/);
    expect(base[0]!.body).toMatch(/(?:^|\s)height: auto;/);
    expect(base[0]!.body).toMatch(/(?:^|\s)max-height: calc\(100vh - 128px\);/);
    expect(base[0]!.body).toMatch(/overflow: hidden;/);
    // No fixed height, and no top-and-bottom stretch, in the base rule.
    expect(base[0]!.body).not.toMatch(/(?:^|[\s;])height: (?:min\(|\d)/);
    expect(base[0]!.body).not.toMatch(/(?:^|\s)(?:top|bottom):/);
  });

  it('no rule sizes the panel by the screen’s kind, the open details or its contents', () => {
    const varied = panelRules.filter((r) => /\[data-|:has\(|:not\(/.test(r.sel));
    // The tiles' own rules hang off `[data-kind='won']` as descendants (they have a space), so
    // what is left here would be the panel itself.
    for (const r of varied) {
      expect(SIZE.test(r.body), `${r.sel} sizes the panel`).toBe(false);
    }
    expect(rules).not.toMatch(/\.hud-debrief\[data-details\]\s*\{/);
    expect(rules).not.toMatch(/\.hud-debrief:has\([^)]*\)\s*\{[^}]*width/);
  });

  it('keeps the old size breakpoints out: no 700 px or 1000 px panel widths', () => {
    expect(rules).not.toMatch(/width: min\((?:720|1120)px, calc\(100vw - (?:48|64)px\)\)/);
  });

  it('the header and footer keep their size and the body between them scrolls', () => {
    expect(rule('.hud-debrief .hud-result-head')).toMatch(/flex: none;/);
    expect(rule('.hud-debrief .hud-result-foot')).toMatch(/flex: none;/);
    expect(rule('.hud-debrief .hud-result-scroll')).toMatch(/flex: 1 1 auto;[^}]*min-height: 0;/);
    expect(rule('.hud-debrief .hud-result-scroll')).toMatch(/overflow-y: auto;/);
  });

  it('the footer is a two-column grid: the horde card, then the skills over Start (ID-200)', () => {
    expect(rule('.hud-debrief .hud-result-foot')).toMatch(/display: grid;/);
    expect(rule('.hud-debrief .hud-result-foot')).toMatch(
      /grid-template-columns: minmax\(0, 1fr\) \d+px;/,
    );
    // The card stacks its parts; the start row stacks the skills over the button.
    expect(rule('.hud-debrief .hud-horde-pick')).toMatch(/flex-direction: column;/);
    expect(rule('.hud-debrief .hud-start-row')).toMatch(/flex-direction: column;/);
    expect(rule('.hud-debrief .hud-start-row > .hud-button')).toMatch(/min-height: 52px;/);
  });

  it('a phone centres the panel below the speed buttons, one footer column, skill beside Start', () => {
    const phone = /@media \(max-width: 480px\) \{\n {2}\.hud-result\.hud-debrief \{([^}]*)\}/.exec(
      rules,
    );
    expect(phone, 'no phone panel rule in page.css').not.toBeNull();
    expect(phone![1]).toMatch(/top: calc\(50% \+ 44px\);/);
    expect(phone![1]).toMatch(/max-height: calc\(100vh - 120px\);/);
    expect(phone![1]).not.toMatch(/(?:^|\s)(?:height|bottom):/);
    const block = /@media \(max-width: 480px\) \{([\s\S]*?)\n\}\n/.exec(rules)![1]!;
    expect(block).toMatch(
      /\.hud-debrief \.hud-result-foot \{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(block).toMatch(/\.hud-debrief \.hud-start-row \{[^}]*flex-flow: row wrap;/);
    expect(block).toMatch(/\.hud-debrief \.hud-start-row > \.hud-button \{[^}]*min-height: 48px;/);
  });

  it('a short window hangs the panel from the top buttons, capped at the bottom edge (ID-205, ID-200)', () => {
    const short = /@media \(max-height: 540px\) \{\s*\.hud-result\.hud-debrief \{([^}]*)\}/.exec(
      rules,
    );
    expect(short, 'no short-window panel rule in page.css').not.toBeNull();
    expect(short![1]).toMatch(/top: 38px;/);
    expect(short![1]).toMatch(/max-height: calc\(100vh - 38px - var\(--space-6\)\);/);
    // Content-sized: no bottom stretch, no fixed height; the panel itself never scrolls.
    expect(short![1]).not.toMatch(/(?:^|\s)(?:bottom|height):/);
    expect(short![1]).not.toMatch(/overflow/);
    const block = /@media \(max-height: 540px\) \{([\s\S]*?)\n\}\n/.exec(rules)![1]!;
    // The card tighter, its label visually hidden; Start 44 px.
    expect(block).toMatch(
      /\.hud-debrief \.hud-horde-pick > \.hud-horde-label \{[^}]*clip-path: inset\(50%\);/,
    );
    expect(block).toMatch(/\.hud-debrief \.hud-start-row > \.hud-button \{[^}]*min-height: 44px;/);
  });

  it('more below the body: a sticky "more below" cue over a fade, taking no room or clicks (ID-200)', () => {
    const cue = rule('.hud-debrief .hud-result-scroll[data-more]::after');
    expect(cue).toMatch(/content: '\\25BE {2}more below' \/ '';/);
    expect(cue).toMatch(/position: sticky;[^}]*bottom: 0;/);
    // Pulled up by its own height and the body's gap, whatever the gap is (a short window's
    // is smaller): the cue nets no room, so the scroll end it measures never moves.
    expect(cue).toMatch(/margin-top: calc\(-28px - var\(--scroll-gap\)\);/);
    expect(rule('.hud-debrief .hud-result-scroll')).toMatch(
      /--scroll-gap: var\(--space-10\);[^}]*gap: var\(--scroll-gap\);/,
    );
    expect(rules).toMatch(
      /@media \(max-height: 540px\) \{[\s\S]*?\.hud-debrief \.hud-result-scroll \{[^}]*--scroll-gap: var\(--space-8\);/,
    );
    expect(rules).not.toMatch(
      /\.hud-debrief \.hud-result-scroll \{[^}]*\n\s+gap: var\(--space-8\)/,
    );
    expect(cue).toMatch(/background: linear-gradient\([^;]*var\(--color-panel-solid\)/);
    expect(cue).toMatch(/pointer-events: none;/);
    expect(cue).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|black/i);
    // No mask: it would fade the cue and the answers too.
    expect(rules).not.toMatch(/\.hud-result-scroll\[data-more\]\s*\{[^}]*mask-image/);
  });

  it('the join card sticks to the body’s top only while anyone asks, over the gun chips (ID-200)', () => {
    expect(rule('.hud-debrief .debrief-join[data-asking]')).toMatch(
      /position: sticky;[^}]*z-index: 2;[^}]*top: 0;/,
    );
    expect(rule('.debrief-join')).not.toMatch(/position: sticky/);
    expect(rules).toMatch(
      /\n\.join-row \+ \.join-row \{[^}]*border-top: 1px solid var\(--color-warn-border\);/,
    );
    // Side by side in a short window: no rule between the two.
    expect(rules).toMatch(
      /@media \(max-height: 540px\) \{[\s\S]*?\.join-row \+ \.join-row \{[^}]*border-top: 0;/,
    );
  });

  it('names wrap rather than cut: the join line freely, the loot to two lines (ID-200)', () => {
    expect(rule('.join-who')).not.toMatch(/white-space: nowrap|text-overflow/);
    const gun = rule('.gun-chip-name');
    expect(gun).toMatch(/-webkit-line-clamp: 2;/);
    expect(gun).toMatch(/-webkit-box-orient: vertical;/);
    expect(gun).not.toMatch(/white-space: nowrap/);
  });

  it("the next horde's meter keeps its tick standing out: no clip (the fill is clamped in code) (ID-200)", () => {
    expect(rule('.hud-debrief .hud-horde-pick > .hud-power-meter')).not.toMatch(/overflow/);
  });

  it('the old radio explainer, gun picker, XP bar, stash line and footer note have no rules left', () => {
    expect(rules).not.toMatch(
      /\.radio-help|\.hud-gear|\.xp-track|\.debrief-stash|\.hud-result-foot-note/,
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
    // Portrait and gun fill their column at a fixed shape, never stretched (the gun short of
    // it by its gap to the DPS, ID-249).
    expect(rules).toMatch(/\.roster-avatar-xs \{[^}]*width: 100%;[^}]*aspect-ratio: 1;/);
    expect(rules).toMatch(
      /\.rv-tab-gun \{[^}]*width: calc\(100% - var\(--space-4\)\);[^}]*aspect-ratio: 2 \/ 1;/,
    );
    expect(rules).not.toMatch(/\.rv-tab-gun \{[^}]*width: \d+px/);
    // Rows of four cards at most 100 px wide on desktop; the bench at the same width.
    expect(rules).toMatch(
      /\.rv-tabs \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 100px\)\)/,
    );
    expect(rules).toMatch(/\.rv-bench \{[^}]*grid-auto-columns: 100px/);
  });

  it('the bench wraps into rows of squad-size cards and scrolls down, never sideways (ID-241)', () => {
    const bench = /\.rv-bench:not\(\.rv-patrol\) \{([^}]*)\}/.exec(rules)?.[1] ?? '';
    expect(bench).toMatch(/grid-auto-flow: row/);
    expect(bench).toMatch(/grid-template-columns: repeat\(auto-fill, 100px\)/);
    expect(bench).toMatch(/max-height: \d+px/);
    expect(bench).toMatch(/overflow-x: hidden/);
    expect(bench).toMatch(/overflow-y: auto/);
    // On a phone, rows of four (three over a squad in rows of three), filling the row.
    expect(rules).toMatch(
      /@container \(max-width: 460px\) \{[\s\S]*?\.rv-bench:not\(\.rv-patrol\) \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
    );
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

  it('each damage number sample uses the colour the field draws it in (ID-262)', () => {
    expect(tokens.get('--color-pop-hit')).toBe(COLOR.popHit);
    expect(tokens.get('--color-pop-crit')).toBe(COLOR.popCrit);
    expect(tokens.get('--color-pop-top')).toBe(COLOR.popTopCrit);
    expect(tokens.get('--color-pop-weak')).toBe(COLOR.popWeak);
    expect(tokens.get('--color-pop-resist')).toBe(COLOR.popResist);
    expect(tokens.get('--color-pop-wall')).toBe(COLOR.popWall);
    const [r, g, b, a] = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(COLOR.popEdge)!.slice(1);
    expect(rgba('--color-pop-edge')).toEqual([+r!, +g!, +b!, +a!]);
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
    // Stacked on a phone, the key centres over the plate (ID-195).
    expect(rules).toMatch(
      /\.hud-card-has-art > \.hud-card-key \{[^}]*grid-column: 1;[^}]*justify-self: center/,
    );
  });
});

describe('every offer card one size (ID-195)', () => {
  /**
   * The declarations of the first rule whose selector is exactly `selector`, after `from`
   * (a `@media` block's start: each query used here appears once in page.css).
   */
  const block = (selector: string, from = 0): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|\\n)\\s*${esc} \\{([^}]*)\\}`).exec(rules.slice(from));
    expect(m, selector).not.toBeNull();
    return m![1]!;
  };
  const media = (q: string): number => {
    const at = rules.indexOf(`@media (${q})`);
    expect(at, q).toBeGreaterThan(0);
    return at;
  };

  it('fixes the width and height in px, at every screen width', () => {
    const base = block('.hud-card.hud-card-has-art');
    expect(base).toMatch(/\n\s*width: \d+px;/);
    expect(base).toMatch(/\n\s*height: \d+px;/);
    // Wide screens: wider, still one size; phones: one height, stacked full width.
    expect(block('.hud-card.hud-card-has-art', media('min-width: 1200px'))).toMatch(
      /\n\s*width: \d+px;/,
    );
    const phone = block('.hud-card.hud-card-has-art', media('max-width: 719px'));
    expect(phone).toMatch(/\n\s*height: \d+px;/);
    expect(phone).toMatch(/\n\s*width: auto;/);
    // The narrowest phones wrap more: one taller size for every card there.
    const narrow = block('.hud-card.hud-card-has-art', media('max-width: 359px'));
    const h = (b: string) => Number(/height: (\d+)px;/.exec(b)![1]);
    expect(h(narrow)).toBeGreaterThan(h(phone));
  });

  it('keeps each part in its place: a one-line name slot and the foot at the bottom', () => {
    expect(block('.hud-card-has-art .hud-card-title')).toMatch(/min-height: 1\.25em;/);
    expect(block('.hud-card-has-art .hud-card-title')).toMatch(/line-height: 1\.25;/);
    expect(block('.hud-card-foot')).toMatch(/margin-top: auto;/);
    expect(block('.hud-card-has-art .hud-card-tag')).toMatch(/position: absolute;/);
    // The tag: in the card's corner on a wide card, on the plate when stacked.
    expect(block('.hud-card-has-art .hud-card-tag')).toMatch(/top: var\(--space-12\);/);
    expect(block('.hud-card-has-art .hud-card-art', media('max-width: 719px'))).toMatch(
      /position: relative;/,
    );
  });

  it('stacks the cards up to 719px, where three side by side no longer fit', () => {
    const width = Number(/\n\s*width: (\d+)px;/.exec(block('.hud-card.hud-card-has-art'))![1]);
    // Three cards, two row gaps (12px) and the panel's side padding (24px each).
    expect(3 * width + 2 * 12 + 2 * 24).toBeLessThanOrEqual(719);
    // A phone on its side is never stacked: it has the width, not the height (ID-205).
    expect(rules).toMatch(
      /@media \(max-width: 719px\) and \(min-height: 541px\) \{\s*\.hud-cards \{/,
    );
  });

  it('on its side a phone gets three shorter cards in a row, inside 667 x 360 (ID-205)', () => {
    // The last short-window block: the phone-on-its-side rules at the end of page.css.
    const at = rules.lastIndexOf('@media (max-height: 540px) {');
    const card = block('.hud-card.hud-card-has-art', at);
    const width = Number(/width: (\d+)px;/.exec(card)![1]);
    const height = Number(/height: (\d+)px;/.exec(card)![1]);
    // Three cards, two 8 px gaps, 12 px of panel padding each side, on an iPhone SE.
    expect(3 * width + 2 * 8 + 2 * 12).toBeLessThanOrEqual(667 - 2 * 4);
    // Under the top buttons (34 px), the heading (about 28 px) and the panel's padding.
    expect(34 + 6 + 28 + height + 8).toBeLessThanOrEqual(360);
    // Measured against Oil Bomb with both fires held (the longest card): it fits 276 px.
    expect(height).toBeGreaterThanOrEqual(276);
    // Reroll, Skip and Ban ride the heading's row (ID-210), so they add no height under the cards.
    expect(block('.hud-cards > .hud-offer-actions', at)).toMatch(/position: absolute;/);
    // Shorter still (iPhone Safari's bars), the panel scrolls rather than cut a card.
    expect(block('.hud-cards', at)).toMatch(/overflow-y: auto;/);
  });
});

describe("a win's result at a glance (ID-186)", () => {
  it('closed, the sentences are hidden; open, nothing is', () => {
    expect(rules).toMatch(/\.debrief-notes\[hidden\],\s*\.debrief-notes:empty \{\s*display: none;/);
    // No rule hides anything with the details open, and the old tile rules are gone.
    expect(rules).not.toMatch(/\[data-details\] [^{]*\{\s*display: none;/);
    expect(rules).not.toMatch(
      /\.tile-more|\.tile-recruit|\.tile-drop|\.tile-join|\.tile-kind|\.tile-bonus|\.debrief-spoils/,
    );
  });

  it('a finger gets 44 px of weapons, answers, the Roster buttons, skills and the select', () => {
    const coarse = /@media \(pointer: coarse\) \{\s*([^{}]+)\{[^}]*min-height: 44px;/.exec(rules);
    expect(coarse, 'no coarse-pointer 44 px rule in page.css').not.toBeNull();
    const selectors = coarse![1]!.split(',').map((x) => x.trim());
    for (const sel of [
      '.tile.gun-chip',
      '.join-btn',
      '.debrief-change-squad',
      '.debrief-best-guns',
      '.hud-debrief .hud-skill-option',
      '.hud-debrief .hud-horde-select',
    ]) {
      expect(selectors, sel).toContain(sel);
    }
    // Start is already 52 px (48 on a phone, 44 in a short window): not in the list (ID-200).
    expect(selectors).not.toContain('.hud-debrief .hud-start-row > .hud-button');
    // The tick and the cross are 40 px square, 44 px square for a finger.
    expect(rule('.join-btn')).toMatch(/width: 40px;[^}]*min-height: 40px;/);
    expect(
      /@media \(pointer: coarse\) \{[\s\S]*?\n {2}\.join-btn \{([^}]*)\}/.exec(rules)![1],
    ).toMatch(/width: 44px;/);
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{[\s\S]*?\.chip-details::before,[\s\S]*?\.debrief-details::before \{[^}]*inset: -8px/,
    );
    // Open, "Details" is filled: the state is not left to its caret.
    expect(rules).toMatch(
      /\.debrief-details\[aria-expanded='true'\] \{[^}]*background: var\(--color-accent\);/,
    );
    // Drawn at 40 px even with a mouse.
    expect(rules).toMatch(/\.hud-debrief \.hud-skill-option \{[^}]*min-height: 40px;/);
    expect(rules).toMatch(/\.hud-debrief \.hud-horde-select \{[^}]*min-height: 40px;/);
  });

  it('the weapon chip and the join line have rules, and the caret marks a chip that opens', () => {
    expect(rules).toMatch(/\.tile\.gun-chip \{/);
    expect(rules).toMatch(/\.gun-chip::after \{/);
    expect(rules).toMatch(/\.gun-details \{/);
    expect(rules).toMatch(/\.debrief-join \{/);
    expect(rules).toMatch(/\.join-row \{/);
    expect(rules).toMatch(/\.join-who \{/);
  });
});

describe('the Weapons details hold still (ID-198)', () => {
  it('the box is one fixed size: a set width beside the grid, a set height under it on a phone', () => {
    expect(rule('.inv-details')).toMatch(/width: 240px;/);
    expect(rule('.inv-details')).not.toMatch(/overflow/);
    const phone = /@media \(max-width: 640px\) \{[\s\S]*?\n {2}\.inv-details \{([^}]*)\}/.exec(
      rules,
    );
    expect(phone, 'no phone details rule in page.css').not.toBeNull();
    expect(phone![1]).toMatch(/(?:^|\s)height: 55%;/);
    expect(phone![1]).not.toMatch(/max-height/);
    // Under the grid: a divider on top, none on the left.
    expect(phone![1]).toMatch(/border-top: 1px solid var\(--color-divider\);[^}]*border-left: 0;/);
    const equip = /@media \(max-width: 640px\) \{[\s\S]*?\n {2}\.inv-equip \{([^}]*)\}/.exec(rules);
    expect(equip![1]).not.toMatch(/border/);
  });

  it('the gun’s lines scroll; the dock at the foot keeps its size', () => {
    expect(rule('.inv-details-info')).toMatch(/flex: 1;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(rule('.inv-dock')).toMatch(/flex: none;/);
  });

  it('the dock’s parts have set sizes: equip cells, a two-line status, one button row', () => {
    expect(rule('.inv-equip')).toMatch(/display: grid;[^}]*grid-auto-rows: 32px;/);
    expect(rule('.inv-combine-line')).toMatch(
      /height: calc\(2 \* 1\.35em\);[^}]*overflow: hidden;/,
    );
    expect(rule('.inv-combine-actions')).toMatch(/grid-template-columns: 2fr 1fr;/);
    expect(rule('.inv-combine-actions')).toMatch(/grid-auto-rows: 36px;/);
    // Combine spans the row; Confirm takes its first two thirds, over Combine's centre.
    expect(rules).toMatch(
      /\.inv-combine-actions \.inv-combine-button,\n\.inv-combine-actions \.inv-combine-off \{\s*grid-column: 1 \/ -1;/,
    );
  });

  it('a finger gets 44 px dock buttons; under a result each status line is one line', () => {
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{\s*\.inv-equip,\n {2}\.inv-combine-actions \{\s*grid-auto-rows: 44px;/,
    );
    expect(rules).toMatch(
      /\.inv-combine-result\[data-made\],\n\.inv-combine-result\[data-made\] \+ \.inv-combine-count \{[^}]*line-clamp: 1;/,
    );
  });

  it('Unequip lies over the equip grid’s whole first row, so the word fits (ID-213)', () => {
    expect(rule('.inv-equip')).toMatch(/position: relative;/);
    expect(rule('.inv-equip .inv-unequip')).toMatch(
      /position: absolute;[^}]*grid-area: 1 \/ 1 \/ 2 \/ -1;[^}]*inset: 0;/,
    );
    // A narrow phone row never splits into more than 6 columns.
    expect(rules).toMatch(
      /minmax\(max\(48px, calc\(\(100% - 5 \* var\(--space-6\)\) \/ 6\)\), 1fr\)/,
    );
  });

  it('long names end in "…" in an equip cell instead of growing it', () => {
    expect(rule('.inv-equip .menu-action')).toMatch(
      /white-space: nowrap;[^}]*text-overflow: ellipsis;/,
    );
  });

  it('the old text lines of the confirm have no rules left', () => {
    expect(rules).not.toMatch(/\.inv-combine-row|\.inv-combine-affixes|\.inv-combine-power/);
  });
});

describe('a narrow desktop fight: the Scrap chip steps down (ID-228)', () => {
  it('641-929px: the chip, Research and the globe go under the speeds; the fight bar keeps clear of the buttons only (ID-263)', () => {
    expect(rules).toMatch(
      /@media \(min-width: 641px\) and \(max-width: 929px\) \{\s*\.hud-fight-bar \{\s*padding-right: 300px;\s*\}\s*\}/,
    );
    const away =
      'body:not\\(:has\\(\\.camp-scrim:not\\(\\[hidden\\]\\), \\.menu-scrim:not\\(\\[hidden\\]\\)\\)\\)';
    expect(rules).toMatch(
      new RegExp(
        `@media \\(min-width: 641px\\) and \\(max-width: 929px\\) and \\(min-height: 541px\\),\\s*\\(min-width: 641px\\) and \\(max-width: 929px\\) and \\(pointer: fine\\) \\{\\s*${away} \\.scrap-chip \\{\\s*top: 71px;\\s*right: calc\\(54px \\+ var\\(--research-w\\)\\);\\s*\\}\\s*${away} \\.research-button \\{\\s*top: 71px;\\s*right: 54px;\\s*\\}\\s*${away} \\.map-button \\{\\s*top: 71px;\\s*right: 12px;`,
      ),
    );
  });

  it('the Fast-forward chip steps aside where the third row is under the speeds (ID-263)', () => {
    expect(rules).toMatch(
      /\(pointer: fine\) \{[^@]*\.map-button \{\s*top: 71px;\s*right: 12px;\s*\}\s*\.hud-skip-chip \{\s*display: none;/,
    );
  });

  it('a phone on its side keeps its own top row: the media list, not source order, leaves it out', () => {
    // The step-down selector outranks the landscape `.scrap-chip` rules, so only its media
    // list keeps it off a coarse pointer at 540px tall or less: every query in it needs
    // either a taller window or a fine pointer.
    const media = /(@media [^{]*)\{\s*body:not\(:has\(\.camp-scrim/.exec(rules)![1]!;
    const queries = media.replace('@media', '').split(',');
    expect(queries).toHaveLength(2);
    for (const q of queries) expect(q).toMatch(/\(min-height: 541px\)|\(pointer: fine\)/);
  });
});

describe('the World map globe in the top bar', () => {
  it('Research sits left of Roster, the globe left of it, the Scrap chip left of that, each 8px apart (ID-263)', () => {
    expect(rules).toMatch(/\.roster-button \{\s*right: 213px;/);
    expect(rules).toMatch(/\.research-button \{\s*right: 289px;[^}]*width: var\(--research-btn\);/);
    // --research-w is its width and a gap: 42px as an icon, 84px as the 76px labelled button
    // from 1024px (not 1061-1110px with Medicine shown, where the widest chip needs the room).
    expect(css).toMatch(/:root \{[^}]*?--research-w: 42px;/);
    expect(rules).toMatch(
      /@media \(min-width: 1024px\) \{\s*:root \{\s*--research-w: 84px;\s*--research-btn: 76px;/,
    );
    expect(rules).toMatch(
      /@media \(min-width: 1061px\) and \(max-width: 1110px\) \{\s*body:has\(\.medicine-chip-count\) \{\s*--research-w: 42px;/,
    );
    expect(rules).toMatch(
      /\.map-button \{\s*right: calc\(289px \+ var\(--research-w\)\);[^}]*width: 34px;/,
    );
    expect(rules).toMatch(
      /\.scrap-chip \{\s*position: fixed;\s*top: 5px;\s*right: calc\(331px \+ var\(--research-w\)\);/,
    );
  });

  it('the speeds share the top row only above 1060px, clear of the corner panel', () => {
    expect(rules).toMatch(
      /@media \(min-width: 641px\) and \(max-width: 1060px\) \{\s*\.hud-speed \{/,
    );
    expect(rules).not.toMatch(/max-width: 1000px/);
    // 8px left of the Scrap chip (right 331px) however wide it grows, never nearer the edge
    // than before (ID-239); the fight's status line keeps clear of them by the same width.
    const w = 'var\\(--scrap-chip-w, 0px\\)';
    const r = 'var\\(--research-w\\)';
    expect(rules).toMatch(
      new RegExp(
        `\\.hud-speed \\{\\s*position: absolute;\\s*top: 5px;[^}]*right: max\\(\\s*calc\\(460px \\+ ${r}\\),\\s*calc\\(339px \\+ ${r} \\+ ${w}\\)\\s*\\);`,
      ),
    );
    expect(rules).toMatch(
      new RegExp(
        `\\.hud-fight-bar \\{\\s*padding-right: max\\(\\s*calc\\(736px \\+ ${r}\\),\\s*calc\\(615px \\+ ${r} \\+ ${w}\\)\\s*\\);`,
      ),
    );
  });

  it('up to 1210px the speeds drop their key hints and the bar follows, whatever the chip (ID-239, ID-263)', () => {
    expect(rules).toMatch(
      /@media \(max-width: 1210px\) \{\s*\.hud-speed \.menu-key \{\s*display: none;/,
    );
    expect(rules).toMatch(
      /@media \(min-width: 1061px\) and \(max-width: 1210px\) \{\s*\.hud-fight-bar \{\s*padding-right: max\(\s*calc\(736px \+ var\(--research-w\)\),\s*calc\(509px \+ var\(--research-w\) \+ var\(--scrap-chip-w, 0px\)\)\s*\);/,
    );
    expect(rules).not.toMatch(/max-width: 1100px|max-width: 1130px|max-width: 1180px/);
  });

  it('heads the speed column in a fight on a phone on its side, Research under the globe (ID-263)', () => {
    const fight = 'body:not\\(:has\\(\\.hud-debrief:not\\(\\[hidden\\]\\)\\)\\)';
    expect(rules).toMatch(new RegExp(`${fight} \\.map-button \\{\\s*top: 40px;`));
    expect(rules).toMatch(new RegExp(`${fight} \\.research-button \\{\\s*top: 80px;`));
    expect(rules).toMatch(new RegExp(`${fight} \\.hud-speed \\{\\s*top: 122px;`));
    expect(rules).toMatch(new RegExp(`${fight} \\.scrap-chip \\{\\s*right: 252px;`));
  });
});

describe('a Roster card keeps a gap between its gun and its DPS (ID-249)', () => {
  it('the gun tile stops short of its column, padding included; on a phone by less', () => {
    expect(rule('.rv-tab-gun')).toMatch(
      /box-sizing: border-box;[^}]*width: calc\(100% - var\(--space-4\)\);/,
    );
    const phone = /@container \(max-width: 460px\) \{[\s\S]*?\n {2}\.rv-tab-gun \{([^}]*)\}/.exec(
      rules,
    );
    expect(phone, 'no phone gun tile rule in page.css').not.toBeNull();
    expect(phone![1]).toMatch(/width: calc\(100% - var\(--space-2\)\);/);
    // The DPS keeps its whole column: the cards' column gap is unchanged.
    expect(rule('.rv-tab')).toMatch(
      /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*gap: 2px;/,
    );
  });
});

describe('the Craft tab holds still whatever the blueprints held (ID-250)', () => {
  it('the window is one set height on the Craft tab: mouse, finger and a stacked phone', () => {
    expect(rules).toMatch(/\.camp-dialog\[data-tab='craft'\] \{\s*height: min\(336px, 100%\);/);
    expect(rules).toMatch(
      /@media \(max-width: 640px\) \{\s*\.camp-dialog\[data-tab='craft'\] \{\s*height: min\(370px, 100%\);/,
    );
    expect(rules).toMatch(
      /@media \(pointer: coarse\) \{\s*\.camp-dialog\[data-tab='craft'\] \{\s*height: min\(362px, 100%\);/,
    );
    expect(rules).toMatch(
      /@media \(max-width: 520px\) \{\s*\.camp-dialog\[data-tab='craft'\] \{\s*height: min\(546px, 100%\);/,
    );
  });

  it("the list never sizes the row: it fills the area's height and scrolls", () => {
    expect(rule('.craft-list')).toMatch(/height: 0;[^}]*min-height: 100%;/);
    expect(rule('.craft-bps')).toMatch(/min-height: 0;[^}]*overflow-y: auto;/);
    // Stacked on a phone: a band two rows high.
    expect(rules).toMatch(
      /\.craft-bps \{[^}]*height: calc\(2 \* 32px \+ var\(--space-4\) \+ 4px\);/,
    );
    expect(rules).toMatch(
      /\.craft-bps \{[^}]*height: calc\(2 \* 44px \+ var\(--space-4\) \+ 4px\);/,
    );
  });

  it("the line under the heading and a craft's result share one slot height", () => {
    expect(rules).toMatch(
      /\.craft-area > \.craft-sub,\s*\.craft-result \{\s*box-sizing: border-box;\s*min-height: 34px;/,
    );
    expect(rules).toMatch(/\.craft-area > \.craft-sub,\s*\.craft-result \{\s*min-height: 40px;/);
    expect(rules).toMatch(/\.craft-area > \.craft-sub,\s*\.craft-result \{\s*min-height: 50px;/);
    expect(rule('.craft-view')).toMatch(/min-height: 28px;/);
  });
});

describe('the gun class badge (ID-254)', () => {
  const classes = ['light', 'medium', 'heavy', 'spread'];
  const slots = ['rusty', 'common', 'military', 'prototype', 'relic'].map((r) => `--slot-${r}`);

  it('the plate is the page background, by alias, and each class has its colour token', () => {
    expect(tokens.get('--class-badge-bg')).toBe('var(--color-bg)');
    for (const c of classes) expect(tokens.get(`--class-${c}`)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('the plate stands out from every rarity tint at 3:1 (non-text), the lowest being Rusty', () => {
    for (const s of slots) {
      expect(contrast('--class-badge-bg', s), s).toBeGreaterThanOrEqual(3);
    }
    expect(contrast('--class-badge-bg', '--slot-rusty')).toBeCloseTo(4.2, 1);
    expect(contrast('--class-badge-bg', '--slot-relic')).toBeCloseTo(6.41, 1);
  });

  it('the glyph colours are the TEXT_ON checks above; one is pinned here', () => {
    expect(contrast('--class-light', '--class-badge-bg')).toBeCloseTo(9.42, 1);
    for (const c of classes) {
      expect(contrast(`--class-${c}`, '--class-badge-bg'), c).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the 3:1 check can fail: white glyph straight on the Relic tint is 2.80', () => {
    expect(contrast('#ffffff', '--slot-relic')).toBeLessThan(3);
    expect(contrast('#ffffff', '--slot-relic')).toBeCloseTo(2.8, 1);
  });

  it('only the badge rules set colour, background or fill; surfaces set size and position', () => {
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (m) => [m[1]!.trim(), m[2]!] as const,
    );
    const badge = blocks.filter(([sel]) => /class-badge/.test(sel));
    expect(badge.length).toBeGreaterThan(6);
    const owners = new Set(['.class-badge', ...classes.map((c) => `.class-badge-${c}`)]);
    for (const [sel, body] of badge) {
      const paints = /(^|[\s;])(color|background(-color)?|fill)\s*:/.test(body);
      if (paints) expect(owners.has(sel), sel).toBe(true);
    }
    expect(rule('.class-badge')).toMatch(/background: var\(--class-badge-bg\)/);
    for (const c of classes) {
      expect(rule(`.class-badge-${c}`)).toMatch(new RegExp(`color: var\\(--class-${c}\\)`));
    }
  });

  it('no surface rule sets display on a badge: only .class-badge itself does', () => {
    const blocks = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (m) => [m[1]!.trim(), m[2]!] as const,
    );
    for (const [sel, body] of blocks) {
      if (!/(^|[\s,>])[^,{}]*\.class-badge(?![\w-])/.test(sel) || sel === '.class-badge') continue;
      expect(body, sel).not.toMatch(/(^|[\s;])display\s*:/);
    }
    expect(rule('.class-badge')).toMatch(/display: inline-flex/);
  });

  it('on a Roster card the badge is the tile’s bottom-right corner: 12px plate, 9px glyph', () => {
    expect(rule('.rv-tab-gun')).toMatch(/position: relative/);
    expect(rule('.rv-tab-gun')).toMatch(/overflow: hidden/);
    expect(rule('.class-badge')).toMatch(/width: 12px;\s*height: 12px/);
    expect(rule('.class-badge .class-icon')).toMatch(/width: 9px;\s*height: 9px/);
    const corner = rule('.rv-tab-gun .class-badge');
    expect(corner).toMatch(/position: absolute/);
    expect(corner).toMatch(/right: 0/);
    expect(corner).toMatch(/bottom: 0/);
    expect(corner).toMatch(/pointer-events: none/);
  });

  it('on a phone (container 460px or less) it shrinks to 9px / 7px and moves bottom-left', () => {
    const phone =
      /@container \(max-width: 460px\) \{\s*\.rv-tab-gun \.class-badge \{([^}]*)\}\s*\.rv-tab-gun \.class-badge \.class-icon \{([^}]*)\}/.exec(
        rules,
      );
    expect(phone, 'no phone block for the badge').not.toBeNull();
    expect(phone![1]).toMatch(/right: auto/);
    expect(phone![1]).toMatch(/left: 0/);
    expect(phone![1]).toMatch(/width: 9px;\s*height: 9px/);
    expect(phone![2]).toMatch(/width: 7px;\s*height: 7px/);
    // The only two rules for the tile's badge: the base and the phone one.
    expect(rules.match(/\.rv-tab-gun \.class-badge \{/g)).toHaveLength(2);
  });

  it('the weapon slot’s badge sits bottom-right (ID-253)', () => {
    const slot = rule('.inv-slot > .class-badge');
    expect(slot).toMatch(/position: absolute/);
    expect(slot).toMatch(/right: 2px/);
    expect(slot).toMatch(/bottom: 2px/);
  });
});

describe('the Roster folds (ID-256)', () => {
  const fold = /\n\.rv-fold \{([^}]*)\}/.exec(rules)?.[1] ?? '';

  it('a fold header is a 28 px row (40 px on touch) that keeps the title classes type', () => {
    expect(fold).toMatch(/min-height: 28px;/);
    expect(rules).toMatch(/@media \(pointer: coarse\) \{\s*\.rv-fold \{\s*min-height: 40px;/);
    // Family only: the title classes set the size and weight.
    expect(fold).toMatch(/font-family: inherit;/);
    expect(fold).not.toMatch(/font: /);
  });

  it('the hover tint is only where a pointer hovers', () => {
    expect(rules).toMatch(
      /@media \(hover: hover\) \{\s*\.rv-fold:hover \{[^}]*--color-surface-hover/,
    );
    expect(rules.replace(/@media \(hover: hover\) \{\s*\.rv-fold:hover \{[^}]*\}/, '')).not.toMatch(
      /\.rv-fold:hover/,
    );
  });

  it('a collapsed box keeps no vertical padding, and the arrow turns instead of swapping', () => {
    expect(rules).toMatch(/\.rv-box:has\(> \.rv-fold-body\[hidden\]\) \{\s*padding-block: 0;/);
    expect(rules).toMatch(
      /\.rv-fold\[aria-expanded='false'\]::before \{\s*transform: rotate\(-90deg\);/,
    );
  });

  it("the squad's raised look still keys off a visible .rv-bench list (a fold hides a wrapper)", () => {
    expect(rules).toMatch(
      /\.roster-dialog:has\(\.rv-bench:not\(\[hidden\]\)\) \.rv-tabs:not\(\.rv-bench\) \.rv-tab \{/,
    );
    expect(rules).toMatch(
      /\.roster-dialog:has\(\.rv-tabs:not\(\.rv-bench\):is\(\[data-count='5'\], \[data-count='6'\]\)\)\s*\.rv-bench:not\(\.rv-patrol\) \{/,
    );
    expect(rules).toMatch(/\.rv-fold-body\[hidden\] \{\s*display: none;/);
  });

  it('each box is bordered; patrol blocks have no border of their own, only a divider', () => {
    expect(/\n\.rv-box \{([^}]*)\}/.exec(rules)?.[1]).toMatch(/border: 1px solid/);
    const block = /\n\.rv-patrol-block \{([^}]*)\}/.exec(rules)?.[1] ?? '';
    expect(block).not.toMatch(/border|background/);
    expect(rules).toMatch(
      /\.rv-patrol-block \+ \.rv-patrol-block \{[^}]*border-top: 1px solid var\(--color-divider\)/,
    );
  });
});

describe('slot corners, the ready wedge and the icon key (ID-253)', () => {
  /** Every rule body ending in exactly `selector` (grouped rules included), joined. */
  const all = (selector: string): string =>
    [
      ...rules.matchAll(
        new RegExp(`\\n${selector.replace(/[.[\]>]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`, 'g'),
      ),
    ]
      .map((m) => m[1])
      .join('\n');

  const RARITIES = ['rusty', 'common', 'military', 'prototype', 'relic'];

  it('the gun icon lies level: no rotate anywhere', () => {
    expect(rule('.gun-icon')).not.toMatch(/rotate/);
    expect(rules).not.toMatch(/\.gun-icon[^{]*\{[^}]*rotate/);
  });

  it('the band sizing is scoped to slot faces (grid, tiles, ghost, bench picker), not the result chip', () => {
    const band = rule('.inv-slot .gun-icon');
    expect(band).toMatch(/width: 86%/);
    expect(band).toMatch(/height: 44%/);
    expect(band).toMatch(/object-fit: contain/);
    expect(rule('.gun-icon')).not.toMatch(/object-fit|height: 44%/);
    // The ghost and the bench picker's tile are .inv-slot elements, so they take the band.
    expect(rules).not.toMatch(/\.gun-chip[^{]*\.gun-icon[^{]*\{[^}]*44%/);
  });

  it('pins the four corners and the centred tick', () => {
    expect(all('.inv-slot-level')).toMatch(/top: 2px;[^}]*left: 2px/);
    expect(all('.inv-slot-step')).toMatch(/top: 2px;[^}]*right: 2px/);
    expect(all('.inv-slot-badge')).toMatch(/left: 2px;[^}]*bottom: 2px/);
    expect(rule('.inv-slot > .class-badge')).toMatch(/right: 2px;[^}]*bottom: 2px/);
    const tick = rule(".inv-slot[data-ticked='true']::after");
    expect(tick).toMatch(/top: 50%/);
    expect(tick).toMatch(/left: 50%/);
    expect(tick).toMatch(/translate\(-50%, -50%\)/);
    expect(tick).not.toMatch(/bottom:/);
  });

  it('a ready set: a green ring outside the frame, three chevrons at its left edge (ID-261)', () => {
    expect(rule('.inv-cell')).toMatch(/position: relative/);
    // The ring sits in the 2 px between the frame and the select/focus outline (offset 2px).
    expect(rule(".inv-slot[data-ready='true']")).toMatch(
      /box-shadow: 0 0 0 2px var\(--color-ready\);/,
    );
    expect(rule(".inv-slot[aria-pressed='true']")).toMatch(/outline-offset: 2px;/);
    const m = rule('.inv-ready');
    // 24 px tall, centred on the 64 px slot: from 20 to 44, between the level plate (ends
    // about 17) and the dmg/s plate (starts about 47); flush inside the 2 px frame.
    expect(m).toMatch(/top: calc\(var\(--slot-size\) \/ 2 - 12px\);/);
    expect(m).toMatch(/left: calc\(50% - var\(--slot-size\) \/ 2 \+ 2px\);/);
    expect(m).toMatch(/width: 10px;/);
    expect(m).toMatch(/height: 24px;/);
    expect(m).toMatch(/pointer-events: none/);
    // A dark edge under the green line.
    expect(rule('.inv-ready-edge')).toMatch(/stroke: var\(--color-bg\);[^}]*stroke-width: 4;/);
    // It fades with a lifted or refusing slot.
    expect(rules).toMatch(
      /\.inv-cell:has\(> \.inv-slot\[data-drag-from\]\) > \.inv-ready,\n\.inv-cell:has\(> \.inv-slot\[data-drop='no'\]\) > \.inv-ready \{\s*opacity: 0\.4;/,
    );
    expect(rule('.inv-ready-line')).toMatch(/stroke: var\(--color-ready\);[^}]*stroke-width: 2;/);
  });

  it('the ready mark reads on every rarity frame and tint: its dark edge 3:1 on each, the green 3:1 on the dark', () => {
    for (const r of RARITIES) {
      expect(contrast('--color-bg', `--rarity-${r}`), `frame ${r}`).toBeGreaterThanOrEqual(3);
      expect(contrast('--color-bg', `--slot-${r}`), `tint ${r}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast('--color-ready', '--color-bg')).toBeGreaterThanOrEqual(3);
  });

  it('the key toggle is a square and the key lays out as a grid', () => {
    const t = rule('.inv-key-toggle');
    expect(t).toMatch(/width: 36px/);
    expect(t).toMatch(/height: 36px/);
    expect(rule('.inv-key')).toMatch(/display: grid/);
    expect(rule('.inv-key')).toMatch(/grid-template-columns: 5\.5em 1fr/);
    expect(
      rule(
        '.inv-key .inv-slot-level, .inv-key .inv-slot-step, .inv-key .inv-slot-badge'.replace(
          /, /g,
          ',\n',
        ),
      ),
    ).toMatch(/position: static/);
  });
});

describe('Weapons on a 320 px window (ID-257)', () => {
  const phone = (selector: string): string => {
    const esc = selector.replace(/[.[\]]/g, '\\$&');
    const m = new RegExp(
      `@media \\(max-width: 640px\\) \\{[\\s\\S]*?\\n {2}${esc} \\{([^}]*)\\}`,
    ).exec(rules);
    expect(m, selector).not.toBeNull();
    return m![1]!;
  };

  it('a dock taller than the details box scrolls with it, never under the Close', () => {
    expect(phone('.inv-details')).toMatch(/overflow-x: hidden;\s*overflow-y: auto;/);
    // The gun's name line stays above the dock while the box scrolls.
    expect(phone('.inv-details-info')).toMatch(/min-height: 1lh;/);
  });

  it('the sort and filter menus keep their whole label and wrap the row instead', () => {
    expect(rules).toMatch(/@media \(max-width: 480px\) \{\s*\.inv-pick \{\s*flex: 1 1 auto;/);
    expect(rule('.inv-stash-tools')).toMatch(/flex-wrap: wrap;/);
  });
});

describe('the camp tab bar on a phone-wide window (ID-258)', () => {
  const inQuery = (q: string, selector: string): string => {
    const at = rules.indexOf(`@container (${q}) {`);
    expect(at, q).toBeGreaterThan(0);
    const body = rules.slice(at, rules.indexOf('\n}\n', at));
    const esc = selector.replace(/[.[\]]/g, '\\$&');
    const m = new RegExp(`\\n {2}${esc} \\{([^}]*)\\}`).exec(body);
    expect(m, selector).not.toBeNull();
    return m![1]!;
  };

  it('the strip starts from nothing, so the close never drops to a row of its own', () => {
    expect(inQuery('max-width: 479px', '.camp-tabs')).toMatch(/flex: 1 1 0;[^}]*min-width: 0;/);
  });

  it('no tab label wraps: a longer one ends in "…"', () => {
    const tab = inQuery('max-width: 479px', '.camp-tabs .camp-tab');
    expect(tab).toMatch(/min-width: 0;/);
    expect(tab).toMatch(/text-overflow: ellipsis;/);
    expect(tab).toMatch(/white-space: nowrap;/);
  });

  it('at 320 px the tabs take the small text and tighter padding', () => {
    const tab = inQuery('max-width: 359px', '.camp-tabs .camp-tab');
    expect(tab).toMatch(/padding: 0 var\(--space-4\);/);
    expect(tab).toMatch(/font-size: var\(--text-sm\);/);
  });
});

describe('a patrol report is one size (ID-260)', () => {
  it('the team list and the finds box have a set height for four lines and scroll past it', () => {
    const both = /\n\.map-report-team,\n\.map-found-box \{([^}]*)\}/.exec(rules);
    expect(both, 'no shared report-size rule').not.toBeNull();
    expect(both![1]).toMatch(/(?:^|\s)height: calc\(4lh \+ 3 \* var\(--space-4\)\);/);
    expect(both![1]).toMatch(/overflow-y: auto;/);
    // A column that wraps would grow a second column instead of scrolling.
    expect(both![1]).toMatch(/flex-wrap: nowrap;/);
    expect(rules).toMatch(/\n\.map-found-box > \* \{\s*flex: none;/);
    expect(both![1]).not.toMatch(/max-height|min-height/);
  });
});
