// @vitest-environment jsdom
// ID-164: the empty field runs fast. While nothing is in reach the frame runs at least
// SKIP_SPEED× the core's fixed steps; the fight itself is unchanged.
import { describe, expect, it } from 'vitest';
import { newGame } from '../core/game.ts';
import { mortars, tickInPlace, wallFront, type HordeState } from '../core/horde.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { recruit } from '../core/camp.ts';
import { fightSpeed, quietField, SKIP_SPEED } from './fastforward.ts';
import { createHud, SKIP_TITLE } from './hud.ts';

const NOW = 1_700_000_000_000;
const FRAME = 1 / 60;

/** Horde `horde` of a horde-only game with `n` survivors. */
function fight(horde = 1, n = 1): HordeState {
  const g = newGame('horde');
  return startSquadHorde(
    {
      ...g,
      hordeNumber: horde,
      roster: Array.from({ length: n }, (_, i) => ({ ...recruit(i + 1), xp: 0 })),
      camp: { ...g.camp, recruits: n },
    },
    horde,
    NOW,
  );
}

/**
 * Plays `s` frame by frame at `chosen`× (fast-forwarded when `skip`) until `stop` or
 * `limit` real seconds; returns the real seconds taken, the fight time then, and the
 * real seconds spent fast-forwarded.
 */
function play(
  s: HordeState,
  chosen: number,
  skip: boolean,
  stop: (s: HordeState) => boolean,
  limit = 400,
): { real: number; time: number; skipped: number } {
  let real = 0;
  let skipped = 0;
  while (!stop(s) && real < limit) {
    const pace = skip ? fightSpeed(chosen, s) : chosen;
    if (pace > chosen) skipped += FRAME;
    tickInPlace(s, FRAME * pace);
    real += FRAME;
  }
  return { real, time: s.time, skipped };
}

const firstShot = (s: HordeState): boolean => s.bullets.length > 0 || s.outcome !== 'fighting';
/**
 * The fight time a play stops at is read at a frame's end: a fast frame covers up to
 * SKIP_SPEED frames of fight time, so the same moment can read up to that much later.
 */
const QUANTUM = SKIP_SPEED * FRAME + 1e-9;

describe('the empty field fast-forwards (ID-164)', () => {
  it('a horde starts quiet, at SKIP_SPEED× whatever the chosen speed below it', () => {
    const s = fight();
    expect(quietField(s)).toBe(true);
    expect(fightSpeed(1, s)).toBe(SKIP_SPEED);
    expect(fightSpeed(3, s)).toBe(SKIP_SPEED);
    expect(fightSpeed(5, s)).toBe(5);
  });

  for (const horde of [1, 2, 3, 4, 5]) {
    it(`Horde ${horde} at 1×: the first shot within 3 s, at the same fight time as without`, () => {
      const fast = play(fight(horde, Math.min(horde, 6)), 1, true, firstShot);
      const slow = play(fight(horde, Math.min(horde, 6)), 1, false, firstShot);
      expect(fast.real).toBeLessThanOrEqual(3);
      // The same fight: the first shot comes at the same fight time (to a frame), only sooner.
      expect(Math.abs(fast.time - slow.time)).toBeLessThanOrEqual(QUANTUM);
      expect(slow.real).toBeGreaterThan(fast.real);
    });
  }

  it('Horde 1 at 1× reaches its first card offer at the same fight time, quiet stretches cut to a fifth', () => {
    const over = (s: HordeState): boolean => s.outcome !== 'fighting' || s.offer !== null;
    // Card offers pause the fight; this plays to the first offer or the end.
    const fast = play(fight(1), 1, true, over);
    const slow = play(fight(1), 1, false, over);
    expect(Math.abs(fast.time - slow.time)).toBeLessThanOrEqual(QUANTUM);
    expect(fast.skipped).toBeGreaterThan(0);
    // Every fast-forwarded real second covers SKIP_SPEED fight seconds.
    expect(slow.real - fast.real).toBeCloseTo(fast.skipped * (SKIP_SPEED - 1), 0);
  });

  it('turns busy with anything in the air or anyone in reach', () => {
    const s = fight();
    play(s, 1, true, firstShot);
    expect(s.bullets.length).toBeGreaterThan(0);
    expect(quietField(s)).toBe(false);
    expect(fightSpeed(1, s)).toBe(1);
    // Bullets gone but the target still in reach: still busy.
    expect(quietField({ ...s, bullets: [] })).toBe(false);
    // The same enemies far off, nothing in the air: quiet.
    const far = { ...s, bullets: [], enemies: s.enemies.map((e) => ({ ...e, x: 10_000 })) };
    expect(quietField(far)).toBe(true);
    // A dead enemy in reach doesn't count.
    expect(
      quietField({ ...s, bullets: [], enemies: s.enemies.map((e) => ({ ...e, hp: 0 })) }),
    ).toBe(true);
  });

  /** Horde 1 with its first enemies on the field, its guns' reach cut short, nothing in the air. */
  function walkingIn(): HordeState {
    const s = fight();
    play(s, 1, true, (x) => x.enemies.length > 0);
    expect(quietField(s)).toBe(true);
    // Guns cut to a tenth of their reach, so the other reaches show past them.
    return { ...s, mods: { ...s.mods, range: 0.1 } };
  }
  /** `s` with its first enemy moved to `x`, the rest far off. */
  const enemyAt = (s: HordeState, x: number): HordeState => ({
    ...s,
    enemies: s.enemies.map((e, i) => ({ ...e, x: i === 0 ? x : 10_000 })),
  });

  it('anything in the air keeps the field busy', () => {
    const s = walkingIn();
    const thing = [{}] as never[];
    for (const key of ['bullets', 'grenades', 'tarBombs', 'incoming', 'spits', 'slabs'] as const) {
      expect(quietField({ ...s, [key]: thing }), key).toBe(false);
    }
  });

  it("a boss winding up is busy wherever it is; one that isn't, far off, is quiet", () => {
    const s = walkingIn();
    const boss = (at: number) => ({
      ...s,
      enemies: s.enemies.map((e, i) =>
        i === 0 ? { ...e, x: 10_000, horror: { skills: ['roar'], next: { roar: at } } } : e,
      ),
    });
    expect(quietField(boss(s.time + 0.5) as never)).toBe(false);
    expect(quietField(boss(s.time + 60) as never)).toBe(true);
  });

  it('reach counts the wall, a Spewer’s spit, throwables, oil mortars and turrets', () => {
    const s = walkingIn();
    const d = s.defenders[0]!;
    const wall = wallFront(s);
    // Short guns: a Spewer's spit (250 px) at the survivor, and 60 px past the wall.
    const base = Math.max(d.x + 250, wall + 60);
    expect(quietField(enemyAt(s, base - 1))).toBe(false);
    expect(quietField(enemyAt(s, base + 1))).toBe(true);
    // An enemy behind the wall (in the camp) is always in reach.
    expect(quietField(enemyAt(s, wall - 50))).toBe(false);
    // A throwable reaches 600 px from the survivor.
    expect(quietField({ ...enemyAt(s, d.x + 550), taken: ['frag-grenades'] })).toBe(false);
    expect(quietField({ ...enemyAt(s, d.x + 650), taken: ['frag-grenades'] })).toBe(true);
    // The oil mortars reach 600 px from where they stand.
    const m = mortars(s);
    expect(m.length).toBeGreaterThan(0);
    expect(quietField({ ...enemyAt(s, m[0]!.x + 550), taken: ['oil-bomb'] })).toBe(false);
    expect(quietField({ ...enemyAt(s, m[0]!.x + 650), taken: ['oil-bomb'] })).toBe(true);
    // A turret's reach from its own spot.
    const far = base + 2000;
    expect(quietField(enemyAt(s, far))).toBe(true);
    const turret = { ...(s.turrets[0] ?? {}), x: far - 100, mount: 'tower' } as never;
    expect(quietField({ ...enemyAt(s, far), turrets: [turret] })).toBe(false);
  });

  it('no squad, or a survivor off any post, falls back to the rest of the reach', () => {
    const s = walkingIn();
    const wall = wallFront(s);
    const nobody = { ...s, defenders: [] };
    expect(quietField(enemyAt(nobody, wall + 30))).toBe(false);
    expect(quietField(enemyAt(nobody, wall + 200))).toBe(true);
    const lost = { ...s, defenders: s.defenders.map((d) => ({ ...d, postId: 999 })) };
    expect(() => quietField(lost)).not.toThrow();
  });

  it('never runs a card offer, a replacement or a finished fight fast', () => {
    const s = fight();
    expect(quietField({ ...s, offer: [] })).toBe(false);
    expect(quietField({ ...s, replace: { injuredId: 'x', postId: null } })).toBe(false);
    expect(quietField({ ...s, outcome: 'won' })).toBe(false);
    expect(quietField({ ...s, outcome: 'lost' })).toBe(false);
  });
});

describe('the fast-forward chip (ID-164)', () => {
  it('shows only while the app says the field is skipping, never in the speed row', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const noop = (): void => {};
    const hud = createHud(root, noop, noop, noop, noop, noop, noop, noop, noop, noop, true);
    const chip = root.querySelector<HTMLElement>('.hud-skip-chip')!;
    expect(chip.parentElement?.classList.contains('hud-speed')).toBe(true);
    expect(chip.hidden).toBe(true);
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    const group = root.querySelector<HTMLElement>('.hud-speed')!;
    expect(group.classList.contains('hud-speed-skip')).toBe(false);
    hud.skipping(true);
    expect(chip.hidden).toBe(false);
    // The 5× button is outlined by this class (phones show only that).
    expect(group.classList.contains('hud-speed-skip')).toBe(true);
    const five = group.querySelector<HTMLElement>('[data-speed="5"]')!;
    expect(five.textContent).toMatch(/^5×/);
    expect(five.title).toBe(SKIP_TITLE);
    expect(chip.textContent).toBe('Fast-forward »');
    hud.skipping(false);
    expect(chip.hidden).toBe(true);
    expect(group.classList.contains('hud-speed-skip')).toBe(false);
    expect(five.hasAttribute('title')).toBe(false);
  });
});
