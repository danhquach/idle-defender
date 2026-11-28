/// <reference types="node" />
// The Airstrike's bombs at every screen shape (ID-290): each drops from the field's top edge
// straight down onto its spot, so where it starts and where it falls must be on screen and
// clear of the HUD. Measured in real Chromium on the built game in a real fight, through the
// fight camera the canvas carries (`data-fight-camera`).
import { expect, test, type Page } from '@playwright/test';
import { FIELD } from '../src/core/data.ts';
import { BOMB, bombAt } from '../src/ui/bomb.ts';
import { HUD_SPACE, HUD_SPACE_SHORT, project, type Camera } from '../src/ui/projection.ts';
import { openIntro } from './helpers.ts';

const SHAPES: readonly [string, number, number][] = [
  ['desktop 16:10', 1440, 900],
  ['desktop 16:9', 1920, 1080],
  ['desktop 21:9', 2560, 1080],
  ['laptop 1366', 1366, 768],
  ['iPad landscape', 1024, 768],
  ['iPad portrait', 768, 1024],
];
/** Phones in landscape run the phone shell (coarse pointer, at most 540 px tall). */
const PHONES: readonly [string, number, number][] = [
  ['phone landscape 862', 862, 303],
  ['phone landscape 844', 844, 390],
  ['phone landscape 932', 932, 430],
];

/** Starts the first fight and returns the camera the game frames it with. */
async function fight(page: Page, width: number, height: number): Promise<Camera> {
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'New game' }).click();
  const start = page.getByRole('button', { name: /^Start Normal 1$/ });
  await start.click();
  await expect(start).toBeHidden();
  await expect(page.locator('.hud-fight-bar')).toBeVisible();
  return JSON.parse(
    (await page.locator('canvas[data-fight-camera]').getAttribute('data-fight-camera'))!,
  );
}

/** The topmost element at a screen point that takes pointer events (the canvas counts). */
async function topAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py]) => {
      const hit = document.elementsFromPoint(px!, py!).find((e) => {
        const s = getComputedStyle(e);
        return s.pointerEvents !== 'none' || e.tagName === 'CANVAS';
      });
      return hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing';
    },
    [x, y],
  );
}

/**
 * Bombs aimed across the field (near, middle and far rows; left, middle and right of the view):
 * each starts at the field's top edge, on screen, clear of the HUD, and drops straight down.
 */
async function bombsShow(
  page: Page,
  cam: Camera,
  width: number,
  height: number,
  reserve: number,
): Promise<void> {
  const half = (BOMB.length * cam.zoom) / 2;
  for (const across of [0.35, 0.6, 0.85]) {
    const x = Math.min(FIELD.right, cam.x + (width * across) / cam.zoom);
    for (const down of [0.05, 0.5, 0.95]) {
      const spot = { x, y: FIELD.height * down };
      const at = `${across}/${down}`;
      const land = project(spot, cam);
      const start = bombAt(spot, 0, cam);
      const end = bombAt(spot, 1, cam);
      // Straight down onto the spot, its nose on it at the landing.
      for (const u of [0, 0.5, 1]) expect(bombAt(spot, u, cam).sx, at).toBeCloseTo(land.sx, 6);
      expect(end.sy + half, at).toBeCloseTo(land.sy, 6);
      // From the top: its tail on the field's top edge (or just over a spot by that edge), never
      // from beside the spot down on the ground.
      const fieldTop = project({ x, y: 0 }, cam).sy;
      const highest = Math.max(
        fieldTop - half,
        Math.min(fieldTop, land.sy - 2 * half - BOMB.shortDrop * cam.zoom),
      );
      expect(start.sy - half, at).toBeCloseTo(Math.min(end.sy - half, highest), 6);
      expect(start.sy, at).toBeLessThanOrEqual(end.sy);
      if (down >= 0.5) expect(end.sy - start.sy, `${at}: a long fall`).toBeGreaterThan(half);
      // The whole bomb on screen as it drops, and no HUD over its tail or its middle.
      expect(start.sx, at).toBeGreaterThan(0);
      expect(start.sx, at).toBeLessThan(width);
      // Below the top HUD's reserved band, so no top bar or strip can cover its tail.
      expect(start.sy - half, at).toBeGreaterThanOrEqual(reserve);
      expect(start.sy + half, at).toBeLessThanOrEqual(height);
      // Sampled down its length every 4 px, at the drop and halfway down.
      for (const u of [0, 0.5]) {
        const mid = bombAt(spot, u, cam).sy;
        for (let y = mid - half + 1; y <= mid + half - 1; y += 4) {
          expect(await topAt(page, start.sx, y), `${at}: fall ${u}, y ${y.toFixed(0)}`).toMatch(
            /^canvas/,
          );
        }
      }
    }
  }
}

for (const [name, width, height] of SHAPES) {
  test(`Airstrike bombs drop from the field's top, on screen, clear of the HUD: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    const cam = await fight(page, width, height);
    await bombsShow(page, cam, width, height, HUD_SPACE.top);
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`Airstrike bombs drop from the field's top, on screen, clear of the HUD: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      const cam = await fight(page, width, height);
      await bombsShow(page, cam, width, height, HUD_SPACE_SHORT.top);
    });
  }
});
