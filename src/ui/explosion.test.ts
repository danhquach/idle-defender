// ID-107: explosions. A fireball is a flip-book of generated frames (pop, fireball, smoke)
// over the scorch; a flashbang's white pop is drawn as live shapes.
import { describe, expect, it } from 'vitest';
import { BLAST, blastLook, blastSeed, fireFrames, FIREBALL } from './explosion.ts';
import { project } from './projection.ts';
import { ART_IDS } from './sprites.ts';

const CAM = { x: 0, y: 0, zoom: 1 };
const white = (u: number, zoom = 1, still = false) =>
  blastLook('white', 800, 300, 100, u, blastSeed(800, 300, 2), { ...CAM, zoom }, still);
const arts = (u: number) => fireFrames(u).map((f) => f.art);

describe('fireball flip-book (ID-107)', () => {
  it('uses bundled art for every frame', () => {
    for (const a of Object.values(FIREBALL.art)) expect(ART_IDS).toContain(a);
  });

  it('runs pop, fireball, smoke in order, cross-fading, and is gone at the end', () => {
    expect(arts(0)).toEqual([FIREBALL.art.pop]);
    expect(arts((FIREBALL.pop + FIREBALL.ball[0]) / 2)).toEqual([
      FIREBALL.art.ball,
      FIREBALL.art.pop,
    ]);
    expect(arts(0.25)).toEqual([FIREBALL.art.ball]);
    expect(arts((FIREBALL.ball[1] + FIREBALL.smoke) / 2)).toEqual([
      FIREBALL.art.ball,
      FIREBALL.art.smoke,
    ]);
    expect(arts(0.9)).toEqual([FIREBALL.art.smoke]);
    expect(fireFrames(1)).toEqual([]);
    expect(fireFrames(-0.01)).toEqual([]);
  });

  it('a cross-fade’s two frames add up to fully there', () => {
    for (const u of [0.08, 0.5]) {
      const total = fireFrames(u).reduce((s, f) => s + f.alpha, 0);
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it('grows, never shrinks, while burning; the smoke rises and fades out', () => {
    const grows = [0.15, 0.25, 0.35].map((u) => fireFrames(u)[0]!.grow);
    expect(grows[1]!).toBeGreaterThan(grows[0]!);
    expect(grows[2]!).toBeGreaterThan(grows[1]!);
    const [late, later] = [fireFrames(0.8)[0]!, fireFrames(0.95)[0]!];
    expect(later.alpha).toBeLessThan(late.alpha);
    expect(later.rise).toBeGreaterThan(late.rise);
    expect(later.rise).toBeLessThanOrEqual(FIREBALL.rise + 1e-9);
  });

  it('with Reduce motion it holds the fireball and only fades', () => {
    const [a, b] = [fireFrames(0.2, true), fireFrames(0.8, true)];
    expect(a.map((f) => f.art)).toEqual([FIREBALL.art.ball]);
    expect(b.map((f) => f.art)).toEqual([FIREBALL.art.ball]);
    expect(b[0]!.alpha).toBeLessThan(a[0]!.alpha);
    expect(b[0]!.grow).toBe(1);
  });

  it('its look is only the scorch, which fades over the end', () => {
    const at = (u: number) => blastLook('fire', 800, 300, 60, u, 1, CAM)!;
    expect(at(0.3)).toMatchObject({ ring: null, air: [] });
    expect(at(0.3).scorch!.r).toBeCloseTo(60 * BLAST.scorch.r, 9);
    expect(at(0.3).scorch!.alpha).toBeCloseTo(BLAST.scorch.alpha, 9);
    expect(at(0.99).scorch!.alpha).toBeLessThan(0.05);
    expect(blastLook('fire', 800, 300, 60, 1, 1, CAM)).toBeNull();
  });
});

describe('flashbang white pop (ID-107)', () => {
  it('a dimmed flash, a soft ring and pale smoke; no scorch', () => {
    const start = white(0.02)!;
    expect(start.scorch).toBeNull();
    const flash = start.air.find((d) => d.colour === BLAST.white.flash[0])!;
    expect(flash.alpha).toBeLessThanOrEqual(BLAST.flash.alpha);
    expect(BLAST.flash.alpha).toBeLessThan(1);
    expect(start.ring!.colour).toBe(BLAST.white.ring);
    const late = white(0.6)!;
    expect(late.ring).toBeNull();
    expect(late.air.every((d) => d.colour === BLAST.white.smoke)).toBe(true);
    expect(white(1)).toBeNull();
  });

  it('the flash stays within the stun reach', () => {
    for (const u of [0, 0.05, 0.09]) {
      const flash = white(u)!.air.find((d) => d.colour === BLAST.white.flash[0])!;
      expect(flash.r).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('the ring races out along the ground, fading', () => {
    const [a, b] = [white(0.02)!.ring!, white(0.1)!.ring!];
    expect(b.r).toBeGreaterThan(a.r);
    expect(b.alpha).toBeLessThan(a.alpha);
    const c = project({ x: 800, y: 300 }, CAM);
    expect([a.x, a.y]).toEqual([c.sx, c.sy]);
  });

  it('the same pop looks the same every replay', () => {
    expect(white(0.4)).toEqual(white(0.4));
  });

  it('reads from 0.5× to 2× zoom: sizes never drop under the minimum', () => {
    for (const zoom of [0.5, 1, 2]) {
      const l = white(0.05, zoom)!;
      for (const d of l.air) expect(d.r).toBeGreaterThanOrEqual(BLAST.min);
      expect(l.ring!.width).toBeGreaterThanOrEqual(BLAST.min);
    }
  });

  it('with Reduce motion it holds one shape and only fades', () => {
    const [a, b] = [white(0.2, 1, true)!, white(0.7, 1, true)!];
    expect(b.air.map((d) => [d.x, d.y, d.r])).toEqual(a.air.map((d) => [d.x, d.y, d.r]));
    expect(b.ring!.alpha).toBeLessThan(a.ring!.alpha);
  });
});
