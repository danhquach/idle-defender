/// <reference types="node" />
// The title screen at every screen shape (ID-282): the art shows the three survivors head to
// boots, the title sits in the sky above them and the buttons stay off them. Measured in real
// Chromium on the built game, against the survivors' boxes in the art (src/ui/titleArt.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { TITLE_ART_FOCUS, type ArtBox } from '../src/ui/titleArt.ts';
import { fmt, gap, inside, intersect, openIntro, rectOf, union, type Box } from './helpers.ts';

/** Clearance between the title and any survivor, and between the buttons and a survivor's upper body. */
const TITLE_CLEAR = 16;
const FOOT_CLEAR = 12;

/** Screens wider than 3:4 and at least 541 px tall: desktops, iPads in landscape, square windows. */
const LANDSCAPE: readonly [string, number, number][] = [
  ['desktop 16:10', 1440, 900],
  ['desktop 16:10 large', 1680, 1050],
  ['desktop 16:9', 1920, 1080],
  ['desktop 21:9', 2560, 1080],
  ['desktop 21:9 large', 3440, 1440],
  ['laptop 1366', 1366, 768],
  ['laptop 1280x800', 1280, 800],
  ['laptop 1280x720', 1280, 720],
  ['short desktop', 1280, 600],
  ['exactly 3:2', 1500, 1000],
  ['iPad landscape', 1024, 768],
  ['iPad Air landscape', 1180, 820],
  ['iPad Pro landscape', 1366, 1024],
  ['5:4 monitor', 1280, 1024],
  ['exactly 5:4', 1000, 800],
  ['square 1024', 1024, 1024],
  ['square 1000', 1000, 1000],
];

/** Portrait and phone shapes: placed as recorded (ID-281's layout), all three survivors across the art. */
const UNCHANGED: readonly [string, number, number, boolean][] = [
  ['iPad portrait (exactly 3:4)', 768, 1024, false],
  ['iPad Air portrait', 820, 1180, false],
  ['iPad Pro portrait', 1024, 1366, false],
  ['phone portrait', 390, 844, true],
  ['phone landscape 862', 862, 303, true],
  ['phone landscape 844', 844, 390, true],
  ['phone landscape 932', 932, 430, true],
];

interface Layout {
  /** The painting as drawn (may run past the screen). */
  painting: Box;
  /** The part of the screen where the art shows at full strength. */
  visible: Box;
  /** The art element's box and the styles that place the art and the title. */
  styles: Record<string, string | number>;
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('.intro-art')!;
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    let sx = r.width / nw;
    let sy = r.height / nh;
    if (cs.objectFit === 'cover') sx = sy = Math.max(sx, sy);
    else if (cs.objectFit === 'contain') sx = sy = Math.min(sx, sy);
    else if (cs.objectFit !== 'fill') throw new Error(`object-fit ${cs.objectFit} not handled`);
    const [px, py] = cs.objectPosition.split(' ').map((v) => {
      if (!v.endsWith('%')) throw new Error(`object-position ${cs.objectPosition} not handled`);
      return parseFloat(v) / 100;
    });
    const w = nw * sx;
    const h = nh * sy;
    const painting = { x: r.x + (r.width - w) * px!, y: r.y + (r.height - h) * py!, w, h };
    // The mask's opaque band: between its first and last stop, across or down the box.
    let band = { x: r.x, y: r.y, w: r.width, h: r.height };
    const mask = cs.maskImage || cs.getPropertyValue('-webkit-mask-image');
    if (mask && mask !== 'none') {
      const stops = [...mask.matchAll(/([\d.]+)%/g)].map((m) => parseFloat(m[1]!) / 100);
      if (!mask.startsWith('linear-gradient(') || stops.length < 2)
        throw new Error(`mask ${mask} not handled`);
      const a = stops[0]!;
      const b = stops[stops.length - 1]!;
      if (mask.startsWith('linear-gradient(to right'))
        band = { x: r.x + r.width * a, y: r.y, w: r.width * (b - a), h: r.height };
      else if (/^linear-gradient\((rgba?|to bottom)/.test(mask))
        band = { x: r.x, y: r.y + r.height * a, w: r.width, h: r.height * (b - a) };
      else throw new Error(`mask direction in ${mask} not handled`);
    }
    const cut = (a: typeof band, b: typeof band) => {
      const x = Math.max(a.x, b.x);
      const y = Math.max(a.y, b.y);
      return {
        x,
        y,
        w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
        h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
      };
    };
    const screen = { x: 0, y: 0, w: innerWidth, h: innerHeight };
    const visible = cut(cut(cut(band, painting), screen), {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    });
    const style = (sel: string, props: string[]) => {
      const s = getComputedStyle(document.querySelector(sel)!);
      return Object.fromEntries(props.map((p) => [`${sel} ${p}`, s.getPropertyValue(p)]));
    };
    const round = (n: number) => Math.round(n * 2) / 2;
    return {
      painting,
      visible,
      styles: {
        'art x': round(r.x),
        'art y': round(r.y),
        'art w': round(r.width),
        'art h': round(r.height),
        ...style('.intro-art', ['object-fit', 'object-position', 'mask-image', 'transform']),
        ...style('.intro-head', ['padding-top']),
        ...style('.intro-logo', ['max-height']),
        ...style('.intro-foot', ['width']),
      },
    };
  });
}

/** A survivor's box on screen, from the top of the head down to `to` (boots or knee). */
function onScreen(p: Box, s: ArtBox, to: 'boots' | 'knee'): Box {
  const [nw, nh] = TITLE_ART_FOCUS.size;
  const kx = p.w / nw;
  const ky = p.h / nh;
  return {
    x: p.x + s.x0 * kx,
    y: p.y + s.top * ky,
    w: (s.x1 - s.x0) * kx,
    h: (s[to] - s.top) * ky,
  };
}

test.describe('title art on landscape screens (ID-282)', () => {
  for (const [name, w, h] of LANDSCAPE)
    for (const returning of [false, true])
      test(`${name} ${w}x${h}${returning ? ' with a save (Continue)' : ''}: survivors head to boots, title over the sky, buttons off them`, async ({
        page,
      }) => {
        await openIntro(page, w, h, { returning });
        const { painting, visible } = await layout(page);
        const title = union(
          await rectOf(page, '.intro-logo'),
          await rectOf(page, '.intro-tagline'),
        );
        const foot = await rectOf(page, '.intro-foot');
        TITLE_ART_FOCUS.survivors.forEach((s, i) => {
          const body = onScreen(painting, s, 'boots');
          const upper = onScreen(painting, s, 'knee');
          expect(
            inside(body, visible),
            `survivor ${i + 1} ${fmt(body)} shows in ${fmt(visible)}`,
          ).toBe(true);
          expect(
            gap(title, body),
            `title ${fmt(title)} clear of survivor ${i + 1} ${fmt(body)}`,
          ).toBeGreaterThanOrEqual(TITLE_CLEAR);
          expect(
            gap(foot, upper),
            `buttons ${fmt(foot)} clear of survivor ${i + 1}'s upper body ${fmt(upper)}`,
          ).toBeGreaterThanOrEqual(FOOT_CLEAR);
        });
        // The buttons stay whole, on screen, finger-sized, their labels uncut.
        expect(inside(foot, { x: 0, y: 0, w, h }), `buttons ${fmt(foot)} on screen`).toBe(true);
        for (const b of await page.locator('.intro-action:visible').all()) {
          const box = (await b.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
        }
      });

  test('the 3:2 handoff: 1499 and 1500 wide draw the painting and the buttons alike', async ({
    page,
  }) => {
    await openIntro(page, 1499, 1000);
    const a = await layout(page);
    const footA = await rectOf(page, '.intro-foot');
    await openIntro(page, 1500, 1000);
    const b = await layout(page);
    const footB = await rectOf(page, '.intro-foot');
    for (const k of ['x', 'y', 'w', 'h'] as const)
      expect(Math.abs(a.painting[k] - b.painting[k]), `painting ${k}`).toBeLessThanOrEqual(1);
    expect(Math.abs(footA.w - footB.w)).toBeLessThanOrEqual(1);
  });
});

// The layout at these shapes, pinned (RECORD=1 re-records). Taken on main before ID-282; the
// portrait entries since carry ID-282's one change there (art aimed at 3%, the rifle shows).
const BEFORE = new URL('./intro-art.unchanged.json', import.meta.url);
const record = !!process.env.RECORD;
const load = (): Record<string, Layout['styles']> => JSON.parse(readFileSync(BEFORE, 'utf8'));
const recorded = record ? {} : load();

test.describe('title art where ID-282 changes nothing', () => {
  for (const [name, w, h, touch] of UNCHANGED) {
    test.describe(name, () => {
      if (touch) test.use({ hasTouch: true, isMobile: true });
      test(`${w}x${h}: art and title placed as before, all three survivors across the art`, async ({
        page,
      }) => {
        await openIntro(page, w, h);
        const { painting, visible, styles } = await layout(page);
        if (record) {
          // Written per test: a failed test restarts the worker and loses its memory.
          let all: Record<string, Layout['styles']> = {};
          try {
            all = load();
          } catch {
            // First test of the run.
          }
          writeFileSync(BEFORE, JSON.stringify({ ...all, [name]: styles }, null, 2) + '\n');
          return;
        }
        expect(styles).toEqual(recorded[name]);
        if (h >= 541)
          TITLE_ART_FOCUS.survivors.forEach((s, i) => {
            const body = onScreen(painting, s, 'boots');
            const across = intersect(body, { ...visible, y: body.y, h: body.h });
            expect(across.w, `survivor ${i + 1} ${fmt(body)} across ${fmt(visible)}`).toBeCloseTo(
              body.w,
              0,
            );
          });
      });
    });
  }
});
