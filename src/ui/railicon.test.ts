// @vitest-environment jsdom
// ID-273: the left rail's icons are SVG nodes made with createElementNS, decoration only,
// and sit on the Roster, Weapons and Menu buttons.
import { describe, expect, it } from 'vitest';
import { railIcon, type RailIcon } from './railicon.ts';

describe('the rail icons (ID-273)', () => {
  it.each(['roster', 'weapons', 'menu', 'bestGuns', 'squad'] as RailIcon[])(
    '%s is a hidden-from-readers svg.rail-icon',
    (name) => {
      const svg = railIcon(document, name);
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('class')).toBe('rail-icon');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('circle, path').length).toBeGreaterThan(0);
      // No text, so a button's own words stay its name.
      expect(svg.textContent).toBe('');
    },
  );
});
