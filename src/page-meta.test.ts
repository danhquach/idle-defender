// The page's tab icon, home-screen icon and link preview card (ID-173): every tag is there,
// and every file it names ships in public/ at the size it claims.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const SITE = 'https://danhquach.github.io/idle-defender/';

/** The `content` of the meta tag whose `attr` is `key`. */
function meta(attr: 'name' | 'property', key: string): string | undefined {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.includes(`${attr}="${key}"`));
  return tag ? /content="([^"]*)"/.exec(tag)?.[1] : undefined;
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('ascii'), path).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** A JPEG's width and height, from its first start-of-frame marker. */
function jpegSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect([b[0], b[1]], path).toEqual([0xff, 0xd8]);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error(`${path}: no frame`);
}

describe('page metadata (ID-173)', () => {
  it('has a description and a theme colour', () => {
    expect(meta('name', 'description')).toMatch(/zombie-survival base-defence game/);
    expect(meta('name', 'theme-color')).toBe('#15171a');
  });

  it('links a favicon and an Apple touch icon, each at its stated size', () => {
    const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
    const icons = links.filter((l) => /rel="(icon|apple-touch-icon)"/.test(l));
    expect(icons).toHaveLength(3);
    for (const l of icons) {
      const href = /href="\.\/([^"]+)"/.exec(l)![1]!;
      const size = /sizes="(\d+)x(\d+)"/.exec(l);
      const [w, h] = pngSize(`public/${href}`);
      expect(w, href).toBe(h);
      if (size) expect([w, h], href).toEqual([+size[1]!, +size[2]!]);
      else expect(w, href).toBe(180); // the Apple touch icon
    }
  });

  it('has an Open Graph and a Twitter card with the game title, text and art', () => {
    expect(meta('property', 'og:title')).toBe('The Long Hold');
    expect(meta('property', 'og:url')).toBe(SITE);
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'));
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:title')).toBe('The Long Hold');
    expect(meta('name', 'twitter:description')).toBe(meta('name', 'description'));
    // Preview scrapers need an absolute URL; the file ships at the site root.
    const image = meta('property', 'og:image')!;
    expect(meta('name', 'twitter:image')).toBe(image);
    expect(image.startsWith(SITE)).toBe(true);
    const [w, h] = jpegSize(`public/${image.slice(SITE.length)}`);
    expect([w, h]).toEqual([
      Number(meta('property', 'og:image:width')),
      Number(meta('property', 'og:image:height')),
    ]);
    expect(meta('property', 'og:image:alt')).toBeTruthy();
  });
});
