/// <reference types="node" />
// ID-284, ID-285: the Research Center's Ammo & throwables tab and the squad screen's starting pick.
// The tab is a 6 x 3 chart (the six cards by Unlock, Mk II, Mk III) with no sideways scroll, nothing
// overlapping or cut off; the picker has three states (nothing unlocked: hidden; one slot; both),
// its list (a sheet on the phone) stays inside the window, phone buttons are at least 44 px tall and
// 8 px apart, and the start row is not pushed under the skill picker. Measured in real Chromium on
// the built game, muted, from a seeded save, at desktop 16:10, 16:9, 21:9, iPad and phone sizes.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { recruit } from '../src/core/camp.ts';
import { STEP, type TechId } from '../src/core/data.ts';
import { newGame, type GameState } from '../src/core/game.ts';
import { tick, type UpgradeId } from '../src/core/horde.ts';
import { startSquadHorde } from '../src/core/hordeonly.ts';
import { decodeSave, encodeSave } from '../src/storage/save.ts';
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
];

const NOW = 1_800_000_000_000;
/** A camp at Horde 3 with plenty of Scrap, some nodes researched and a pick made. */
function camp(tech: TechId[], kit?: GameState['kit']): GameState {
  const g = newGame('horde');
  return {
    ...g,
    hordeNumber: 3,
    stock: { ...g.stock, scrap: 20_000 },
    roster: [recruit(1), recruit(2)],
    camp: { ...g.camp, recruits: 2 },
    ...(tech.length > 0 ? { tech } : {}),
    ...(kit ? { kit } : {}),
  };
}

const NONE = camp([]);
const THROW_ONLY = camp(['frag-grenades', 'flashbang', 'molotov', 'molotov-mk2'], {
  throwable: 'molotov',
});
const BOTH = camp(
  [
    'incendiary-rounds',
    'incendiary-rounds-mk2',
    'shock-rounds',
    'frag-grenades',
    'flashbang',
    'toxin-rounds',
  ],
  { ammo: 'incendiary-rounds', throwable: 'flashbang' },
);

/** Opens the game on the seeded camp's squad screen, muted. */
async function open(page: Page, game: GameState, width: number, height: number): Promise<void> {
  // Seeded once: the page saves over it on unload, so a reload must not seed it again.
  await page.addInitScript(
    (raw) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('idle-defender.save', raw);
    },
    encodeSave(game, NOW),
  );
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: /^Start Normal 3$/ })).toBeVisible();
}

const boxOf = async (l: Locator): Promise<Box> => {
  const b = (await l.boundingBox())!;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
};
const boxes = (page: Page, selector: string): Promise<Box[]> =>
  page.locator(selector).evaluateAll((els) =>
    els
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
const area = (a: Box, b: Box): number => intersect(a, b).w * intersect(a, b).h;

test('the seeded camps are valid saves', () => {
  for (const g of [NONE, THROW_ONLY, BOTH]) {
    const loaded = decodeSave(encodeSave(g, NOW))!;
    expect(loaded.game.tech).toEqual(g.tech);
    expect(loaded.game.kit).toEqual(g.kit);
  }
});

/**
 * The new tab's chart: 6 rows by 3 columns, whole, with no sideways scroll or overlap. On the phone
 * shell (ID-285) the one-line note is hidden and the rows are 38 px to fit the 303 px screen; on
 * desktop and iPad it shows.
 */
async function chartLaidOut(
  page: Page,
  width: number,
  height: number,
  phone = false,
): Promise<void> {
  await page.locator('.research-button').click();
  await page.locator('#camp-tab-kit').click();
  await expect(page.locator('#camp-panel-kit')).toBeVisible();
  // One tab on show: the Upgrades chart is not drawn under it.
  await expect(page.locator('#camp-panel-upgrades')).toBeHidden();
  await expect(page.locator('#camp-panel-upgrades .research-node').first()).toBeHidden();
  expect(await boxes(page, '#camp-panel-upgrades .research-node')).toEqual([]);
  const nodes = await boxes(page, '#camp-panel-kit .research-node');
  expect(nodes, 'eighteen nodes').toHaveLength(18);
  const rows = new Set(nodes.map((n) => Math.round(n.y)));
  const cols = new Set(nodes.map((n) => Math.round(n.x)));
  expect([rows.size, cols.size], 'six rows, three columns').toEqual([6, 3]);
  expect(await page.locator('#camp-panel-kit .research-branch').allTextContents()).toEqual([
    'Incendiary',
    'Shock',
    'Toxin',
    'Frag',
    'Flashbang',
    'Molotov',
  ]);
  // The headings, and the note over the chart.
  const heads = await page.locator('#camp-panel-kit .research-tier').allTextContents();
  expect(heads).toEqual(['Unlock', 'Mk II', 'Mk III']);
  const note = page.locator('#camp-panel-kit .research-kit-note');
  if (phone) {
    await expect(note, 'the note is hidden on the phone shell').toBeHidden();
    // 38 px rows (six 40 px rows ran 9 px off the 303 px screen), the whole chart on it.
    const ys = [...rows].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeCloseTo(38, 0);
    // Touch spacing: two nodes of a column stay at least 8 px apart.
    const col = nodes
      .filter((n) => Math.round(n.x) === Math.min(...cols))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) {
      expect(
        col[i]!.y - (col[i - 1]!.y + col[i - 1]!.h),
        'gap between nodes',
      ).toBeGreaterThanOrEqual(7.5);
    }
    const chartBox = await boxOf(page.locator('#camp-panel-kit .research-chart'));
    expect(chartBox.y + chartBox.h, 'chart bottom on screen').toBeLessThanOrEqual(height + 0.5);
  } else {
    await expect(note).toHaveText('Pick your starting ammo and throwable on the squad screen.');
  }
  // No sideways scroll: the chart fits its scroller.
  const [sw, cw] = await page
    .locator('#camp-panel-kit .research-scroll')
    .evaluate((e) => [e.scrollWidth, e.clientWidth]);
  expect(sw, 'no sideways scroll').toBeLessThanOrEqual(cw + 1);
  // Inside the window, inside the screen, no node on another, no word cut off.
  const dialog = await rectOf(page, '.camp-dialog');
  expect(inside(dialog, { x: 0, y: 0, w: width, h: height }), `dialog ${fmt(dialog)}`).toBe(true);
  const scroller = await boxOf(page.locator('#camp-panel-kit .research-scroll'));
  for (const n of nodes) {
    expect(inside(n, scroller), `node ${fmt(n)} in the chart ${fmt(scroller)}`).toBe(true);
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(area(nodes[i]!, nodes[j]!), `${fmt(nodes[i]!)} x ${fmt(nodes[j]!)}`).toBe(0);
    }
  }
  const cut = await page.locator('#camp-panel-kit .research-node').evaluateAll((els) =>
    els
      .filter((e) => {
        const kids = [...e.children] as HTMLElement[];
        return (
          e.scrollHeight > e.clientHeight + 1 || kids.some((k) => k.scrollWidth > k.clientWidth + 1)
        );
      })
      .map((e) => (e as HTMLElement).dataset.id),
  );
  expect(cut, 'nodes whose words are cut off').toEqual([]);
  // The connector lines stay inside the chart.
  const lines = await rectOf(page, '#camp-panel-kit .research-lines');
  expect(inside(lines, await rectOf(page, '#camp-panel-kit .research-chart'))).toBe(true);
  // Reading a node: its effect shows in the detail panel.
  await page.locator('#camp-panel-kit [data-id="flashbang-mk3"]').click();
  await expect(page.locator('#camp-panel-kit .research-effect')).toContainText('110 px');
  // What the hidden note says stays reachable: the unlock's detail names the starting pick.
  await page.locator('#camp-panel-kit [data-id="toxin-rounds"]').click();
  await expect(page.locator('#camp-panel-kit .research-effect')).toContainText(
    'Can be the squad’s starting ammo card.',
  );
  // The detail panel and its Research button are reachable (the body scrolls), as on the Upgrades tab.
  for (const tab of ['kit', 'upgrades']) {
    await page.locator(`#camp-tab-${tab}`).click();
    const go = page.locator(`#camp-panel-${tab} .research-go`);
    await go.scrollIntoViewIfNeeded();
    const gb = await boxOf(go);
    expect(
      inside(gb, { x: 0, y: 0, w: width, h: height }),
      `${tab} Research button ${fmt(gb)}`,
    ).toBe(true);
    const covered = await go.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !(top && (e === top || e.contains(top)));
    });
    expect(covered, `${tab} Research button is on top`).toBe(false);
  }
  await page.locator('#camp-tab-kit').click();
  // The first tab still counts its 14, and the two are tabs side by side.
  await expect(page.locator('#camp-tab-upgrades')).toHaveText('Upgrades · 0/14');
  await expect(page.locator('#camp-tab-kit')).toHaveText('Ammo & throwables · 0/18');
}

for (const [name, width, height] of SHAPES) {
  test(`Research: the Ammo & throwables chart is 6 x 3 and whole: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await open(page, NONE, width, height);
    await chartLaidOut(page, width, height);
  });
}

const THROWS = ['frag-grenades', 'flashbang', 'molotov'];
const AMMO = ['incendiary-rounds', 'shock-rounds', 'toxin-rounds'];

/** The picker's buttons, the start row and the list on one squad screen. */
async function pickerLaidOut(
  page: Page,
  game: GameState,
  slots: string[],
  phone: boolean,
): Promise<void> {
  const group = page.locator('.hud-debrief .hud-kit-pick');
  if (slots.length === 0) {
    await expect(group, 'nothing unlocked: no group').toBeHidden();
    await expect(page.locator('.hud-kit-button')).toHaveCount(0);
    return;
  }
  await expect(group).toBeVisible();
  const buttons = page.locator('.hud-debrief .hud-kit-button');
  await expect(buttons).toHaveCount(slots.length);
  expect(
    await buttons.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slot)),
  ).toEqual(slots);
  const panel = await rectOf(page, '.hud-debrief');
  const bs = await boxes(page, '.hud-debrief .hud-kit-button');
  const skill = await rectOf(page, '.hud-debrief .hud-skill-option');
  const start = await rectOf(page, '.hud-debrief .hud-start-row > .hud-button');
  const viewport = page.viewportSize()!;
  for (const b of bs) {
    expect(b.h, `${fmt(b)} tall enough to press`).toBeGreaterThanOrEqual(44);
    expect(inside(b, panel), `${fmt(b)} in the panel ${fmt(panel)}`).toBe(true);
    expect(area(b, skill), 'clear of the skill').toBe(0);
    expect(area(b, start), 'clear of Start').toBe(0);
    expect(b.y + b.h, 'not cut off by the window').toBeLessThanOrEqual(viewport.height + 0.5);
  }
  // The start row is not pushed under the skill picker: Start is on screen and under the skills.
  expect(start.y + start.h, 'Start on screen').toBeLessThanOrEqual(viewport.height + 0.5);
  expect(start.y, 'Start below the skills').toBeGreaterThanOrEqual(skill.y);
  if (bs.length === 2) {
    const apart = Math.max(bs[1]!.x - (bs[0]!.x + bs[0]!.w), bs[1]!.y - (bs[0]!.y + bs[0]!.h));
    expect(apart, 'the two buttons are apart').toBeGreaterThanOrEqual(phone ? 8 : 4);
  }
  if (phone) {
    for (const b of bs) expect(b.w, `${fmt(b)} wide enough to press`).toBeGreaterThanOrEqual(44);
    // The icon, not the words, shows; the label stays for a screen reader.
    await expect(page.locator('.hud-kit-button .hud-kit-icon').first()).toBeVisible();
    // Empty and set look different: dashed and dim with none, a tick on a pick.
    for (const b of await buttons.all()) {
      const state = await b.getAttribute('data-state');
      const look = await b.evaluate((e) => ({
        border: getComputedStyle(e).borderStyle,
        tick: getComputedStyle(e, '::after').content,
        icon: getComputedStyle(e.querySelector('.hud-kit-icon')!).opacity,
      }));
      if (state === 'none') {
        expect(look.border, 'none: dashed').toBe('dashed');
        expect(look.tick, 'none: no tick').toMatch(/^(none|normal)$/);
        expect(Number(look.icon)).toBeLessThan(1);
      } else {
        expect(state).toBe('set');
        expect(look.border, 'set: solid').toBe('solid');
        expect(look.tick, 'set: a tick').toContain('✓');
      }
    }
    for (const b of await buttons.all()) {
      expect(await b.getAttribute('aria-label')).toMatch(/^Start with: (Ammo|Throwable): /);
    }
    const label = await buttons
      .first()
      .evaluate((e) => e.querySelector('.hud-kit-label')!.getBoundingClientRect().width);
    expect(label, 'the words are for a screen reader only').toBeLessThanOrEqual(2);
  } else {
    await expect(page.locator('.hud-kit-button .hud-kit-label').first()).toBeVisible();
    const cutLabel = await page
      .locator('.hud-kit-button .hud-kit-label')
      .evaluateAll((els) => els.some((k) => k.scrollWidth > k.clientWidth + 1));
    expect(cutLabel, 'the label is not cut off').toBe(false);
  }
  // The list: inside the window (on the phone a sheet), the rule, None and the cards.
  await buttons.first().click();
  const list = page.locator('.hud-kit-list');
  await expect(list).toBeVisible();
  const lb = await boxOf(list);
  const screen = { x: 0, y: 0, w: viewport.width, h: viewport.height };
  expect(inside(lb, screen), `list ${fmt(lb)}`).toBe(true);
  await expect(list.locator('.hud-kit-rule')).toHaveText(
    'Picking another card of this slot in a fight replaces this one. Its levels are lost.',
  );
  const unlocked = (game.tech ?? []).filter((t) =>
    (slots[0] === 'ammo' ? AMMO : THROWS).includes(t),
  );
  await expect(list.locator('.hud-kit-option')).toHaveCount(unlocked.length + 1);
  for (const o of await boxes(page, '.hud-kit-option')) {
    expect(o.h).toBeGreaterThanOrEqual(44);
    expect(inside(o, lb), `option ${fmt(o)} in the list ${fmt(lb)}`).toBe(true);
  }
  const cutWords = await list.evaluate((e) =>
    [...e.querySelectorAll<HTMLElement>('*')]
      .filter((k) => k.scrollWidth > k.clientWidth + 1)
      .map((k) => k.className),
  );
  expect(cutWords, 'words in the list cut off').toEqual([]);
  // Choosing saves at once and shows on the button.
  await list.locator('.hud-kit-option').nth(1).click();
  await expect(list).toBeHidden();
  const kit = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('idle-defender.save')!).game.kit);
  expect((await kit())?.[slots[0]!]).toBeTruthy();
  // None clears the slot.
  await buttons.first().click();
  await list.locator('.hud-kit-option').first().click();
  expect((await kit())?.[slots[0]!]).toBeUndefined();
}

const STATES: readonly [string, GameState, string[]][] = [
  ['nothing unlocked', NONE, []],
  ['one slot (throwables)', THROW_ONLY, ['throwable']],
  ['both slots', BOTH, ['ammo', 'throwable']],
];

for (const [name, width, height] of SHAPES) {
  for (const [state, game, slots] of STATES) {
    test(`Squad screen: the starting pick, ${state}: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await open(page, game, width, height);
      await pickerLaidOut(page, game, slots, false);
    });
  }
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`Research: the Ammo & throwables chart is 6 x 3 and whole: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await open(page, NONE, width, height);
      await chartLaidOut(page, width, height, true);
      // The two Research tabs are pills on the sheet: 44 px tall, 8 px apart.
      const pills = await boxes(page, '.camp-head .camp-tab');
      expect(pills).toHaveLength(2);
      for (const p of pills) expect(p.h).toBeGreaterThanOrEqual(44);
      expect(pills[1]!.x - (pills[0]!.x + pills[0]!.w)).toBeGreaterThanOrEqual(8);
    });
    for (const [state, game, slots] of STATES) {
      test(`Squad screen: the starting pick, ${state}: ${name} (${width}x${height})`, async ({
        page,
      }) => {
        await open(page, game, width, height);
        await pickerLaidOut(page, game, slots, true);
      });
    }
  }
});

/**
 * The first level-up offer of the fight the browser will start when the clock is fixed at `seed`
 * (the app seeds a fight from Date.now), played in the core with nobody touching the game.
 */
function firstOffer(game: GameState, seed: number): UpgradeId[] {
  let s = startSquadHorde(game, seed, seed, game.hordeNumber);
  for (let i = 0; i < Math.round(240 / STEP) && s.offer === null; i++) s = tick(s, STEP);
  return (s.offer ?? []).flatMap((c) => (c.kind === 'upgrade' ? [c.id] : []));
}
const seeds = new Map<GameState, number>();
/** The first fixed time from NOW whose first offer holds Toxin Rounds (the core is deterministic); found once per camp. */
function toxinSeed(game: GameState): number {
  const known = seeds.get(game);
  if (known !== undefined) return known;
  const loaded = decodeSave(encodeSave(game, NOW))!.game;
  for (let seed = NOW; seed < NOW + 500; seed++) {
    if (firstOffer(loaded, seed).includes('toxin-rounds')) {
      seeds.set(game, seed);
      return seed;
    }
  }
  throw new Error('no seed in 500 offers Toxin Rounds');
}

/** Toxin Rounds shown as a level-up offer card: whole, inside the window and the screen, clear of its neighbours. */
async function offerLaidOut(
  page: Page,
  width: number,
  height: number,
  phone: boolean,
): Promise<void> {
  await page.clock.setFixedTime(toxinSeed(NONE));
  await open(page, NONE, width, height);
  await page.getByRole('button', { name: /^Start Normal 3$/ }).click();
  // 5x (key D), muted already: the first level-up comes quickly.
  await page.keyboard.press('d');
  const icon = page.locator('.hud-cards img.hud-card-icon[data-card="toxin-rounds"]');
  await expect(icon).toBeVisible({ timeout: 120_000 });
  const panel = await rectOf(page, '.hud-cards');
  const screen = { x: 0, y: 0, w: width, h: height };
  expect(inside(panel, screen), `offer ${fmt(panel)} on screen`).toBe(true);
  if (phone) expect(panel.h, 'the offer stays 200 px tall or less').toBeLessThanOrEqual(200);
  const cards = await boxes(page, '.hud-cards .hud-card');
  expect(cards.length).toBeGreaterThanOrEqual(2);
  for (const c of cards)
    expect(inside(c, panel), `card ${fmt(c)} in the offer ${fmt(panel)}`).toBe(true);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      expect(area(cards[i]!, cards[j]!), `card ${i} x card ${j}`).toBe(0);
    }
  }
  // The Toxin card: its icon loaded, its name and effect in words, nothing cut off or spilling out.
  const toxin = page.locator('.hud-cards .hud-card').filter({
    has: page.locator('img.hud-card-icon[data-card="toxin-rounds"]'),
  });
  expect(
    await icon.evaluate((e) => (e as HTMLImageElement).naturalWidth),
    'icon loaded',
  ).toBeGreaterThan(0);
  await expect(toxin.locator('.hud-card-title')).toHaveText('Toxin Rounds');
  await expect(toxin).toContainText('poison');
  const spill = await toxin.evaluate((card) => {
    const r = card.getBoundingClientRect();
    // Cut off: a box that clips (overflow not visible) holding more than it shows. A glyph taller
    // than an unclipped line box (the key's line-height 1 on Linux fonts) shows whole, so it is not.
    const clips = (k: Element): boolean => getComputedStyle(k).overflow !== 'visible';
    return [card, ...card.querySelectorAll<HTMLElement>('*')]
      .filter((k) => {
        const kr = k.getBoundingClientRect();
        return (
          kr.width > 0 &&
          ((clips(k) &&
            (k.scrollWidth > k.clientWidth + 1 || k.scrollHeight > k.clientHeight + 1)) ||
            kr.right > r.right + 1 ||
            kr.bottom > r.bottom + 1)
        );
      })
      .map((k) => k.className);
  });
  expect(spill, 'parts of the Toxin card cut off or spilling out').toEqual([]);
  // Every card is one size (ID-195): the Toxin card is as tall and wide as its neighbours.
  const mine = await boxOf(toxin);
  for (const c of cards) {
    expect(Math.abs(c.w - mine.w), 'same width').toBeLessThanOrEqual(1);
    expect(Math.abs(c.h - mine.h), 'same height').toBeLessThanOrEqual(1);
  }
}

for (const [name, width, height] of SHAPES) {
  test(`Level-up offer: Toxin Rounds is a whole card: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await offerLaidOut(page, width, height, false);
  });
}

test.describe('phone shell: the level-up offer', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`Level-up offer: Toxin Rounds is a whole card: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await offerLaidOut(page, width, height, true);
    });
  }
});
