// Shared helpers for the browser layout tests (ID-282). Every test loads the game muted.
import { expect, type Page } from '@playwright/test';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MUTE_KEY = 'idle-defender.mute';
const HOW_TO_SEEN_KEY = 'idle-defender.how-to-seen';
const SAVE_KEY = 'idle-defender.save';

/**
 * Opens the title screen at a size, muted, with the title font and the art loaded.
 * `returning`: a player with a save, so Continue shows above New game. The save is the
 * game's own: New game saves the new camp at once, then the page reloads.
 */
export async function openIntro(
  page: Page,
  width: number,
  height: number,
  { returning = false } = {},
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript(
    ([mute, seen]) => {
      localStorage.setItem(mute!, '1');
      localStorage.setItem(seen!, '1');
    },
    [MUTE_KEY, HOW_TO_SEEN_KEY],
  );
  await page.goto('/');
  await expect(page.locator('.intro-title-page')).toBeVisible();
  if (returning) {
    await page.getByRole('button', { name: 'New game' }).click();
    await page.waitForFunction((key) => !!localStorage.getItem(key), SAVE_KEY);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  }
  await page.waitForFunction(() => {
    const art = document.querySelector<HTMLImageElement>('.intro-art.intro-art-on');
    return !!art && art.complete && art.naturalWidth > 0;
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The logo's own font loaded (ID-282: the CSP once refused it as an inlined data: URL).
  expect(
    await page.evaluate(() => document.fonts.check('40px "Long Hold Title"', 'HOLD')),
    'the title font loaded',
  ).toBe(true);
}

/** An element's box on screen (the union of the matches when several). */
export async function rectOf(page: Page, selector: string): Promise<Box> {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
  if (boxes.length === 0) throw new Error(`nothing visible matches ${selector}`);
  return boxes.reduce(union);
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

/** True when `inner` lies inside `outer` (half a pixel of rounding allowed). */
export function inside(inner: Box, outer: Box): boolean {
  const e = 0.5;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.w <= outer.x + outer.w + e &&
    inner.y + inner.h <= outer.y + outer.h + e
  );
}

/** The gap between two boxes: 0 when they touch or overlap, else the larger axis gap. */
export function gap(a: Box, b: Box): number {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.max(0, gx, gy);
}

/** A box as short text for failure messages. */
export const fmt = (b: Box): string =>
  `[${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}]`;
