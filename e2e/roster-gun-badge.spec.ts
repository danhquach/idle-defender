/// <reference types="node" />
// A Roster card's gun clears its class badge (ID-297): the gun's painted pixels stop short of the
// badge in the tile's corner, so a long barrel never runs into it. Every gun kind is on a card
// (squad and bench), measured in real Chromium on the built game at desktop, iPad and phone.
import { expect, test, type Page } from '@playwright/test';
import { rollWeapon } from '../src/core/armoury.ts';
import { recruit } from '../src/core/camp.ts';
import { WEAPONS, type WeaponId } from '../src/core/data.ts';
import { createRng } from '../src/core/rng.ts';
import { newGame, type GameState, type RosterDefender } from '../src/core/game.ts';
import { decodeSave, encodeSave } from '../src/storage/save.ts';
import { fmt, inside, openIntro, type Box } from './helpers.ts';

const SHAPES: readonly [string, number, number][] = [
  ['desktop 16:10', 1440, 900],
  ['desktop 16:9', 1920, 1080],
  ['desktop 21:9', 2560, 1080],
  ['iPad landscape', 1024, 768],
  ['iPad portrait', 768, 1024],
];
// No thin window (a Roster 460 px wide or less): there the badge sits small over the stock and
// grip on purpose (ID-254), since a tile that small has no room for it at the muzzle end.
/** Phones in landscape run the phone shell (coarse pointer, at most 540 px tall). */
const PHONES: readonly [string, number, number][] = [
  ['phone landscape 862', 862, 303],
  ['phone landscape 932', 932, 430],
];

/** Each gun kind once, held by its own survivor: four in the squad, the rest on the bench. */
const GUNS = Object.keys(WEAPONS).filter((b) => {
  const k = WEAPONS[b as keyof typeof WEAPONS].kind;
  return k === 'gun' || k === 'sidearm';
});
const holders: RosterDefender[] = GUNS.map((base, i) => {
  const gun = rollWeapon(createRng(i + 1), `h${i + 1}`, base as WeaponId, 'common');
  return { ...recruit(i + 1), loadout: { primary: gun, secondary: null, item: null } };
});
const game: GameState = (() => {
  const g = newGame('horde');
  return {
    ...g,
    // Each gun is the drop of a horde already won.
    hordeNumber: GUNS.length + 1,
    roster: holders.slice(0, 4),
    reserve: holders.slice(4),
    camp: { ...g.camp, recruits: holders.length },
  };
})();
const SAVE = encodeSave(game, 1_800_000_000_000);

async function openRoster(page: Page, width: number, height: number): Promise<void> {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('idle-defender.save', raw);
    localStorage.setItem('idle-defender.airstrike-hint-seen', '1');
  }, SAVE);
  await openIntro(page, width, height);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('.roster-button').first().click();
  await expect(page.locator('.rv-tab-gun').first()).toBeVisible();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.rv-tab-gun img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
}

interface Tile {
  /** The box of the gun's opaque pixels, where they are drawn. */
  gun: Box;
  badge: Box;
  tile: Box;
  /** Opaque gun pixels on the badge or within 1 px of it. */
  near: number;
  /** Opaque gun pixels cut off by the tile's rounded corners. */
  clipped: number;
  src: string;
}

/**
 * Each visible card's gun as painted: its opaque pixels placed where object-fit (contain)
 * and object-position draw them, their box, and how many lie on its class badge or within
 * 1 px of it; the badge; the tile.
 */
async function tiles(page: Page): Promise<Tile[]> {
  return page.locator('.rv-tab-gun').evaluateAll((els) =>
    els
      .filter((t) => t.getBoundingClientRect().width > 0 && t.querySelector('.class-badge'))
      .map((t) => {
        const img = t.querySelector<HTMLImageElement>('img')!;
        const badge = t.querySelector('.class-badge')!.getBoundingClientRect();
        const tile = t.getBoundingClientRect();
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = nw;
        c.height = nh;
        const ctx = c.getContext('2d')!;
        // The icons are the game's own (same origin), so the canvas stays readable.
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, nw, nh).data;
        // object-fit: contain, placed by object-position (percentages of the free space).
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        // object-position per axis: a percentage of the free space, or a length in px.
        const at = (v: string, free: number): number => {
          if (v.endsWith('%')) return (free * parseFloat(v)) / 100;
          if (v.endsWith('px')) return parseFloat(v);
          throw new Error(`object-position ${cs.objectPosition}`);
        };
        const radius = getComputedStyle(t).borderTopLeftRadius;
        if (!/^[\d.]+px$/.test(radius)) throw new Error(`border radius ${radius}`);
        const rad = parseFloat(radius);
        // Outside the tile's rounded corner at (sx, sy)?
        const cut = (sx: number, sy: number): boolean => {
          const dx = Math.max(tile.left + rad - sx, sx - (tile.right - rad), 0);
          const dy = Math.max(tile.top + rad - sy, sy - (tile.bottom - rad), 0);
          return dx > 0 && dy > 0 && dx * dx + dy * dy > rad * rad;
        };
        const k = Math.min(r.width / nw, r.height / nh);
        const [px = '50%', py = '50%'] = cs.objectPosition.split(' ');
        const ox = r.x + at(px, r.width - nw * k);
        const oy = r.y + at(py, r.height - nh * k);
        const bx0 = badge.x - 1;
        const by0 = badge.y - 1;
        const bx1 = badge.right + 1;
        const by1 = badge.bottom + 1;
        let near = 0;
        let clipped = 0;
        let x0 = nw;
        let y0 = nh;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < nh; y++)
          for (let x = 0; x < nw; x++)
            if (data[(y * nw + x) * 4 + 3]! > 24) {
              x0 = Math.min(x0, x);
              y0 = Math.min(y0, y);
              x1 = Math.max(x1, x);
              y1 = Math.max(y1, y);
              const sx = ox + x * k;
              const sy = oy + y * k;
              if (sx + k > bx0 && sx < bx1 && sy + k > by0 && sy < by1) near++;
              if (cut(sx + k / 2, sy + k / 2)) clipped++;
            }
        return {
          gun: { x: ox + x0 * k, y: oy + y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k },
          badge: { x: badge.x, y: badge.y, w: badge.width, h: badge.height },
          tile: { x: tile.x, y: tile.y, w: tile.width, h: tile.height },
          near,
          clipped,
          src: img.src.slice(-40),
        };
      }),
  );
}

async function clear(page: Page, width: number, height: number): Promise<void> {
  expect(decodeSave(SAVE), 'a valid save').not.toBeNull();
  await openRoster(page, width, height);
  const all = await tiles(page);
  expect(all.length, 'cards with a gun and its badge').toBeGreaterThanOrEqual(4);
  for (const t of all) {
    const why = `${t.src}: gun ${fmt(t.gun)} badge ${fmt(t.badge)} tile ${fmt(t.tile)}`;
    // A small, clear gap between the gun (its barrel, the end that reaches the badge's corner)
    // and its badge: no gun pixel on the badge or within 1 px of it.
    expect.soft(t.near, why).toBe(0);
    // The whole gun shows: inside its tile, not cut off.
    expect.soft(inside(t.gun, t.tile), why).toBe(true);
    expect.soft(t.clipped, `${why}: cut by the rounded corners`).toBe(0);
  }
}

for (const [name, width, height] of SHAPES) {
  test(`a Roster card's gun clears its class badge: ${name} (${width}x${height})`, async ({
    page,
  }) => {
    await clear(page, width, height);
  });
}

test.describe('phone shell', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [name, width, height] of PHONES) {
    test(`a Roster card's gun clears its class badge: ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await clear(page, width, height);
    });
  }
});
