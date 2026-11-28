// The squad screen's actions and goal line (ID-288). On the phone shell "Best gun for
// everyone" and "Change squad" are 44 px icon buttons stacked in a column between the cards
// and the foot column, the cards a grid of their own, the "Next:" goal in the header, the foot
// column 208 px wide; desktop and iPad keep the worded buttons in a row over the cards and
// the goal in the body. Measured in real Chromium on the built game's first squad screen.
import { expect, test, type Page } from '@playwright/test';
import { fmt, inside, intersect, openIntro, rectOf, type Box } from './helpers.ts';

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
  ['phone landscape 640', 640, 320],
  ['phone landscape 568', 568, 320],
];

async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
}

/** The first squad screen, its squad made six by copying the one card (a full squad's grid). */
async function squadScreen(page: Page, width: number, height: number): Promise<void> {
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('button', { name: /^Start Normal 1$/ })).toBeVisible();
  await expect(page.locator('.hud-debrief .debrief-best-guns')).toBeVisible();
  await page.locator('.hud-debrief .squad-grid').evaluate((grid) => {
    const card = grid.querySelector('.squad-card')!;
    for (let i = 0; i < 5; i++) grid.append(card.cloneNode(true));
  });
}

/** Neither button's label is cut off, and the buttons come before the cards for Tab. */
async function common(page: Page): Promise<[Box, Box, Box[]]> {
  const [b] = await boxes(page, '.hud-debrief .debrief-best-guns');
  const [c] = await boxes(page, '.hud-debrief .debrief-change-squad');
  const cards = await boxes(page, '.hud-debrief .squad-card');
  expect(cards).toHaveLength(6);
  const panel = await rectOf(page, '.hud-debrief');
  for (const box of [b!, c!]) expect(inside(box, panel), `${fmt(box)} in ${fmt(panel)}`).toBe(true);
  for (const card of cards)
    for (const box of [b!, c!])
      expect(intersect(card, box).w * intersect(card, box).h, `${fmt(card)} x ${fmt(box)}`).toBe(0);
  const order = await page.evaluate(() => {
    const best = document.querySelector('.hud-debrief .debrief-best-guns')!;
    const change = document.querySelector('.hud-debrief .debrief-change-squad')!;
    const card = document.querySelector('.hud-debrief .squad-card')!;
    return [
      !!(best.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING),
      !!(change.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
    ];
  });
  expect(order, 'Tab: Best guns, Change squad, then the cards').toEqual([true, true]);
  return [b!, c!, cards];
}

for (const [name, width, height] of SHAPES) {
  test(`squad actions: worded, one row over the cards: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await squadScreen(page, width, height);
    const [b, c, cards] = await common(page);
    expect(Math.abs(b.y - c.y), `one row: ${fmt(b)} ${fmt(c)}`).toBeLessThan(1);
    const rowBottom = Math.max(b.y + b.h, c.y + c.h);
    for (const card of cards) expect(card.y).toBeGreaterThanOrEqual(rowBottom);
    // The words show, the icons don't; the goal stays in the body.
    await expect(
      page.locator('.hud-debrief .debrief-best-guns .debrief-action-label'),
    ).toBeVisible();
    await expect(page.locator('.hud-debrief .debrief-best-guns svg')).toBeHidden();
    await expect(page.locator('.hud-result-scroll .debrief-goal')).toBeVisible();
    await expect(page.locator('.debrief-goal-head')).toBeHidden();
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`squad actions: an icon column by the foot, goal in the header: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await squadScreen(page, width, height);
      const [b, c, cards] = await common(page);
      // 44 px icon buttons, stacked, the icon showing.
      for (const box of [b, c]) {
        expect(box.w).toBeGreaterThanOrEqual(44);
        expect(box.h).toBeGreaterThanOrEqual(44);
      }
      expect(Math.abs(b.x - c.x)).toBeLessThan(1);
      expect(c.y).toBeGreaterThanOrEqual(b.y + b.h);
      await expect(page.locator('.hud-debrief .debrief-best-guns svg')).toBeVisible();
      // Right of every card, left of the foot column, which is 208 px wide.
      const foot = await rectOf(page, '.hud-debrief .hud-result-foot');
      expect(Math.round(foot.w)).toBe(208);
      for (const card of cards) expect(b.x).toBeGreaterThanOrEqual(card.x + card.w);
      expect(b.x + b.w).toBeLessThanOrEqual(foot.x);
      // Three cards to a row where the body is wide enough (862 and up).
      if (width >= 862) {
        const tops = new Set(cards.map((k) => Math.round(k.y)));
        expect(tops.size, 'two rows of three').toBe(2);
      }
      // The goal is in the header, once, inside it; Power and its badge are not cut off.
      const goal = page.locator('.hud-result-head .debrief-goal-head');
      await expect(goal).toBeVisible();
      await expect(page.locator('.hud-result-scroll .debrief-goal')).toHaveCount(0);
      const head = await rectOf(page, '.hud-debrief .hud-result-head');
      expect(inside(await rectOf(page, '.debrief-goal-head'), head)).toBe(true);
      const power = page.locator('.hud-debrief .hud-horde-power').first();
      expect(
        await power.evaluate((e) => e.scrollWidth <= e.clientWidth),
        'Power and its badge fit',
      ).toBe(true);
      expect(inside(await rectOf(page, '.hud-debrief .hud-horde-power'), foot)).toBe(true);
    });
  }
});
