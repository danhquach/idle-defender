// The Roster's On patrol section folds as a whole (ID-289): its title is a fold header like the
// Bench's, the patrols' own block folds inside it. Shut, the box is its title row alone and
// nothing below it overlaps; open, every patrol block shows again. Measured in real Chromium on
// the built game, with a camp of two patrols out, at desktop, iPad and phone sizes.
import { expect, test, type Page } from '@playwright/test';
import { recruit } from '../src/core/camp.ts';
import { newGame, type GameState } from '../src/core/game.ts';
import { sendMapPatrol, withMap } from '../src/core/scout.ts';
import { encodeSave } from '../src/storage/save.ts';
import { fmt, inside, intersect, openIntro, rectOf } from './helpers.ts';

const SHAPES: readonly [string, number, number][] = [
  ['desktop 16:10', 1440, 900],
  ['desktop 16:9', 1920, 1080],
  ['desktop 21:9', 2560, 1080],
  ['iPad landscape', 1024, 768],
  ['iPad portrait', 768, 1024],
];
/** Phones in landscape run the phone shell (coarse pointer, at most 540 px tall). */
const PHONES: readonly [string, number, number][] = [
  ['phone landscape 862', 862, 303],
  ['phone landscape 915', 915, 412],
  ['phone landscape 667', 667, 375],
];

/** A camp of three in the squad and two on the bench, each of the two out on a patrol. */
function campSave(): string {
  const now = Date.now();
  const g0 = newGame('horde');
  const squad = [1, 2, 3].map((n) => recruit(n));
  const bench = [4, 5].map((n) => recruit(n));
  let g: GameState = withMap(
    {
      ...g0,
      hordeNumber: 3,
      roster: squad,
      reserve: bench,
      camp: { ...g0.camp, recruits: 5 },
    },
    7,
  );
  bench.forEach((d, i) => {
    const sent = sendMapPatrol(g, g.map!.areas[i]!.kind, [d.id], 1, now);
    if (!sent.ok) throw new Error(sent.code);
    g = sent.game;
  });
  return encodeSave(g, now);
}

async function openRoster(page: Page, width: number, height: number): Promise<void> {
  const save = campSave();
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('idle-defender.save', raw);
    localStorage.setItem('idle-defender.airstrike-hint-seen', '1');
  }, save);
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.roster-button').click();
  await expect(page.locator('.rv-box-patrol')).toBeVisible();
}

async function folds(page: Page, width: number, height: number, touch: boolean): Promise<void> {
  await openRoster(page, width, height);
  const head = page.locator('[data-key="fold:patrols"]');
  await expect(head).toHaveText('On patrol 2');
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rv-patrol-block')).toHaveCount(2);
  await expect(page.locator('.rv-patrol-block').first()).toBeVisible();
  // The title's words are never cut off.
  expect(await head.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
  const open = await rectOf(page, '.rv-box-patrol');
  const headBox = await rectOf(page, '[data-key="fold:patrols"]');
  // In the Roster pane (on the phone shell the boxes drop their frame, and the header's
  // whole-row tap reaches 2 px past it, as the Bench's does).
  const pane = await rectOf(page, '.roster-dialog');
  expect(inside(headBox, pane), `${fmt(headBox)} in ${fmt(pane)}`).toBe(true);
  // A finger-sized target on the phone shell, like every other fold header there.
  if (touch) expect(headBox.h, fmt(headBox)).toBeGreaterThanOrEqual(44);

  await head.scrollIntoViewIfNeeded();
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.rv-patrol-block').first()).toBeHidden();
  const shut = await rectOf(page, '.rv-box-patrol');
  const title = await rectOf(page, '[data-key="fold:patrols"]');
  // Shut, the box is its title row alone.
  expect(shut.h, `shut ${fmt(shut)} vs open ${fmt(open)}`).toBeLessThan(open.h);
  expect(Math.abs(shut.h - title.h), `${fmt(shut)} title ${fmt(title)}`).toBeLessThanOrEqual(2);
  // The boxes around it never overlap it.
  for (const other of ['.rv-box-squad', '.rv-box-details']) {
    const o = await rectOf(page, other).catch(() => null);
    if (!o) continue;
    const x = intersect(o, shut);
    expect(x.w * x.h, `${other} ${fmt(o)} x ${fmt(shut)}`).toBe(0);
  }

  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.rv-patrol-block').first()).toBeVisible();
}

for (const [name, width, height] of SHAPES) {
  test(`On patrol folds as a whole: ${name} (${width}x${height})`, async ({ page }) => {
    await folds(page, width, height, false);
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`On patrol folds as a whole: ${name} (${width}x${height})`, async ({ page }) => {
      await folds(page, width, height, true);
    });
  }
});
