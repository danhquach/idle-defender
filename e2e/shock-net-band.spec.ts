/// <reference types="node" />
// Shock Net's band at every screen shape (ID-283): the net lies across the wire band all fight
// long, so the band must be on screen and not under the HUD. Measured in real Chromium on the
// built game in a real fight, through the fight camera the canvas carries (`data-fight-camera`).
import { expect, test, type Page } from '@playwright/test';
import { newGame } from '../src/core/game.ts';
import { netBand } from '../src/core/horde.ts';
import { startSquadHorde } from '../src/core/hordeonly.ts';
import { FIELD } from '../src/core/data.ts';
import { project, type Camera } from '../src/ui/projection.ts';
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

/** The band on a horde-only fight's fresh wall: the same for every fight. */
const band = netBand(startSquadHorde(newGame('horde'), 1, 0))!;

/** Starts the first fight and returns the camera the game frames it with. */
async function fight(page: Page, width: number, height: number): Promise<Camera> {
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'New game' }).click();
  const start = page.getByRole('button', { name: /^Start Normal 1$/ });
  await start.click();
  // In the fight: the start button gone and the fight's bar up, so the camera read is the fight's.
  await expect(start).toBeHidden();
  await expect(page.locator('.hud-fight-bar')).toBeVisible();
  return JSON.parse(
    (await page.locator('canvas[data-fight-camera]').getAttribute('data-fight-camera'))!,
  );
}

/** Checks the band's middle runs on screen, over the canvas, down the middle of the field. */
async function bandShows(page: Page, cam: Camera, width: number, height: number): Promise<void> {
  const mid = (band.from + band.to) / 2;
  for (const share of [0.3, 0.5, 0.7]) {
    const y = FIELD.height * share;
    const a = project({ x: band.from, y }, cam);
    const b = project({ x: band.to, y }, cam);
    const c = project({ x: mid, y }, cam);
    for (const p of [a, b]) {
      expect(p.sx, `band edge x at ${share}`).toBeGreaterThanOrEqual(0);
      expect(p.sx, `band edge x at ${share}`).toBeLessThanOrEqual(width);
      expect(p.sy, `band edge y at ${share}`).toBeGreaterThanOrEqual(0);
      expect(p.sy, `band edge y at ${share}`).toBeLessThanOrEqual(height);
    }
    // The band's on-screen width: a net the player can see, not a sliver.
    expect(b.sx - a.sx).toBeGreaterThan(24);
    // Nothing of the HUD covers the band's middle: the topmost element there that takes pointer
    // events is the canvas (the HUD's full-window wrappers let clicks through and are skipped).
    const top = await page.evaluate(
      ([x, y]) => {
        const hit = document.elementsFromPoint(x!, y!).find((e) => {
          const s = getComputedStyle(e);
          return s.pointerEvents !== 'none' || e.tagName === 'CANVAS';
        });
        return hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : 'nothing';
      },
      [c.sx, c.sy],
    );
    expect(top, `top element on the band at ${share}`).toMatch(/^canvas/);
  }
}

for (const [name, width, height] of SHAPES) {
  test(`Shock Net's band is on screen, clear of the HUD: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    const cam = await fight(page, width, height);
    await bandShows(page, cam, width, height);
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`Shock Net's band is on screen, clear of the HUD: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      const cam = await fight(page, width, height);
      await bandShows(page, cam, width, height);
    });
  }
});
