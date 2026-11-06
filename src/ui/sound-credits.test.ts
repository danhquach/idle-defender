// ID-080: every sound file the game ships is credited with its licence, is small, and
// carries no tags; every recording the engine asks for exists.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLES } from './audio.ts';

const root = new URL('../../', import.meta.url);
const dir = new URL('src/assets/sounds/', root);
const files = readdirSync(dir).filter((f) => !f.startsWith('.'));
const credits = readFileSync(new URL('docs/audio-credits.md', root), 'utf8');

describe('Sound files (ID-080)', () => {
  it('ships only MP3s, each credited by name, under a CC0 source', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f).toMatch(/^shot-[a-z]+\.mp3$/);
      expect(credits).toContain(`\`${f}\``);
    }
    expect(credits).toContain('CC0');
    expect(credits).toContain('The Free Firearm Sound');
  });

  it('every recording the engine asks for is one of them', () => {
    const asked = Object.keys(SAMPLES).map((cue) => `${cue}.mp3`);
    expect([...asked].sort()).toEqual([...files].sort());
  });

  it('each is a small MP3 with no ID3 tags (nothing about where it was made)', () => {
    for (const f of files) {
      const bytes = readFileSync(new URL(f, dir));
      const size = statSync(new URL(f, dir)).size;
      expect(size).toBeLessThan(32 * 1024);
      // Over Vite's 4 KiB inline limit: a smaller file would ship as a data: URL, which the
      // CSP's connect-src 'self' refuses to fetch (and the shot would quietly fall back).
      expect(size).toBeGreaterThan(4 * 1024);
      expect(bytes.subarray(0, 3).toString('latin1')).not.toBe('ID3');
      expect(bytes.subarray(-128, -125).toString('latin1')).not.toBe('TAG');
      // An MPEG audio frame sync at the start.
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]! & 0xe0).toBe(0xe0);
    }
  });
});
