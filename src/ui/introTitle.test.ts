// @vitest-environment jsdom
// The title logo: every url(#…) it uses points at an element it defines, its text stays
// inside the cut-down title font, it is the same every time, and the name matches the page.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTRO_TITLE } from './intro.ts';
import { createTitleLogo } from './introTitle.ts';

/** The letters the title font file holds (src/assets/fonts/rubik-dirt-title.woff). */
const FONT_LETTERS = new Set('THE LONG HOLD');

describe('the title logo', () => {
  it('resolves every url(#id) it references to one of its own ids, each defined once', () => {
    const svg = createTitleLogo(document);
    const ids = [...svg.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = new Set<string>();
    for (const e of svg.querySelectorAll('*'))
      for (const a of e.attributes)
        for (const m of a.value.matchAll(/url\(#([^)]+)\)/g)) refs.add(m[1]!);
    expect(refs.size).toBeGreaterThan(0);
    for (const r of refs) expect(ids).toContain(r);
    for (const id of ids) expect(id.startsWith('lh-')).toBe(true);
  });

  it('only draws letters the title font holds', () => {
    const svg = createTitleLogo(document);
    const text = [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '').join('');
    expect(text.length).toBeGreaterThan(0);
    for (const ch of text) expect(FONT_LETTERS.has(ch)).toBe(true);
  });

  it('is the same every time (fixed seed) and holds no script or links', () => {
    const a = createTitleLogo(document);
    const b = createTitleLogo(document);
    expect(a.outerHTML).toBe(b.outerHTML);
    expect(a.querySelector('script, a, foreignObject, image')).toBeNull();
  });

  it('spells the name the page title uses', () => {
    // Under jsdom import.meta.url is not a file URL, so read from the repo root (Vitest's cwd).
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<title>${INTRO_TITLE}</title>`);
    const svg = createTitleLogo(document);
    const lines = [...svg.querySelectorAll('text')].slice(0, 2).map((t) => t.textContent);
    expect(lines.join(' ')).toBe(INTRO_TITLE.toUpperCase());
  });
});
