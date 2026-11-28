// The title art's focus boxes (ID-282) are measured on one art file: new art must be
// re-measured before the layout test can trust them.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TITLE_ART_FOCUS } from './titleArt.ts';

const css = readFileSync(new URL('../page.css', import.meta.url), 'utf8');

describe('the title art focus boxes (ID-282)', () => {
  it('were measured on this art file (re-measure in src/ui/titleArt.ts when the art changes)', () => {
    const png = readFileSync(new URL('../assets/art/title-dusk.png', import.meta.url));
    // A PNG's IHDR chunk: width and height, big-endian, at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([...TITLE_ART_FOCUS.size]);
  });

  it("page.css sizes the painting box to the art's own aspect ratio", () => {
    const [w, h] = TITLE_ART_FOCUS.size;
    expect(css).toMatch(new RegExp(`\\.intro-art \\{[^}]*aspect-ratio: ${w} / ${h};`));
  });

  it('every survivor box lies inside the art, head above knee above boots', () => {
    const [w, h] = TITLE_ART_FOCUS.size;
    for (const s of TITLE_ART_FOCUS.survivors) {
      expect(0 <= s.x0 && s.x0 < s.x1 && s.x1 <= w).toBe(true);
      expect(0 <= s.top && s.top < s.knee && s.knee < s.boots && s.boots <= h).toBe(true);
    }
  });
});
