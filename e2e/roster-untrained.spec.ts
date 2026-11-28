/// <reference types="node" />
// A non-fighting job's slower reload in the Roster (ID-287): the job line ends with it, and a
// note row under Reload speed names it. Worst case: a level 24 Chef holding an LMG (the longest
// words, "heavier gun") on the field, so the Chef's Max HP note shows too, with a second Chef
// for the no-stack note. Measured in real Chromium on the built game at desktop, iPad and phone.
import { expect, test, type Page } from '@playwright/test';
import type { OwnedWeapon } from '../src/core/armoury.ts';
import { recruit } from '../src/core/camp.ts';
import { newGame, type GameState, type RosterDefender } from '../src/core/game.ts';
import { xpForLevel } from '../src/core/stats.ts';
import { decodeSave, encodeSave } from '../src/storage/save.ts';
import { openIntro, rectOf } from './helpers.ts';

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
  ['phone landscape 932', 932, 430],
];

const lmg: OwnedWeapon = { uid: 'h1', base: 'lmg', rarity: 'common', affixes: [] };
const chef: RosterDefender = {
  ...recruit(1),
  job: 'chef',
  xp: xpForLevel(24),
  loadout: { primary: lmg, secondary: null, item: null },
};
const twin: RosterDefender = { ...recruit(2), job: 'chef', xp: xpForLevel(9) };
const game: GameState = (() => {
  const g = newGame('horde');
  return { ...g, hordeNumber: 3, roster: [chef, twin], camp: { ...g.camp, recruits: 2 } };
})();
const SAVE = encodeSave(game, 1_800_000_000_000);

/** Opens the game on the seeded camp and the Chef's Roster panel. */
async function openChef(page: Page, width: number, height: number): Promise<void> {
  // Seeded once: the page saves over it on unload, so a reload must not seed it again.
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('idle-defender.save', raw);
  }, SAVE);
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.roster-button').first().click();
  await expect(page.locator('.rv-job-line')).toContainText('not trained, heavier gun');
  // The phone shell opens with the pane shut (ID-277): a tap on the Chef's card opens it.
  if (!(await page.locator('.rv-job-line').isVisible())) {
    await page.getByRole('button', { name: /^.+, level 24, Chef,/ }).click();
    await expect(page.locator('.rv-job-line')).toBeVisible();
  }
}

/** The note row and the job line are whole on screen, inside their panel, over nothing. */
async function laidOut(page: Page, width: number, height: number): Promise<void> {
  const line = page.locator('.rv-job-line');
  const note = page.locator('.rv-stat-field', { hasText: 'not trained' });
  await expect(note).toHaveText('Reload speed: (−15% not trained, heavier gun)');
  for (const target of [line, note]) {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    expect(box.x, 'left edge on screen').toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'right edge on screen').toBeLessThanOrEqual(width + 0.5);
    expect(box.y, 'top on screen').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, 'bottom on screen').toBeLessThanOrEqual(height + 0.5);
    // No text cut off: nothing overflows its own box.
    const [sw, cw] = await target.evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(sw, 'text fits its box').toBeLessThanOrEqual(cw + 1);
    // On top where it is: nothing covers its middle.
    const hit = await target.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && (e === top || e.contains(top));
    });
    expect(hit, 'nothing covers it').toBe(true);
  }
  // The note sits in its own row right under Reload speed, inside the stat table, clear of
  // the rows above and below.
  const row = note.locator('xpath=..');
  const prev = row.locator('xpath=preceding-sibling::tr[1]');
  await expect(prev.locator('th')).toHaveText('Reload speed');
  const table = await rectOf(page, '.rv-stats:has(.rv-stat-field:has-text("not trained"))');
  const r = (await row.boundingBox())!;
  const p = (await prev.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(table.x - 0.5);
  expect(r.x + r.width).toBeLessThanOrEqual(table.x + table.w + 0.5);
  expect(r.y, 'under the Reload speed row').toBeGreaterThanOrEqual(p.y + p.height - 0.5);
  const next = row.locator('xpath=following-sibling::tr[1]');
  if ((await next.count()) > 0) {
    const n = (await next.boundingBox())!;
    expect(n.y, 'over the next row').toBeGreaterThanOrEqual(r.y + r.height - 0.5);
  }
}

test('the seeded camp is a valid save', () => {
  expect(decodeSave(SAVE)).not.toBeNull();
});

for (const [name, width, height] of SHAPES) {
  test(`Roster: a Chef's slower reload shows whole: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await openChef(page, width, height);
    await laidOut(page, width, height);
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`Roster: a Chef's slower reload shows whole: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await openChef(page, width, height);
      await laidOut(page, width, height);
    });
  }
});
