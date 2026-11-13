// Design §4, ID-140: Airstrike auto-aim. `strikeAim` picks where the circle covers the most
// live enemies past the outer wall (ties nearest the wall), holding under `AUTO_AIM.min`;
// `autoStrike` fires it there the moment the Airstrike is ready, as a manual strike would.
import { describe, expect, it } from 'vitest';
import { AUTO_AIM, FIELD, SKILL_IDS, SKILLS } from './data.ts';
import { newHorde, type HordeState } from './horde.ts';
import { autoLookDue, autoStrike, skillLock, strikeAim, useSkill, wallFront } from './skills.ts';
import { enemy, setup } from './testing.ts';

/** A horde with the Airstrike researched, no spawns left and `cash` in hand. */
function fight(cash = 100): HordeState {
  const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS] });
  s.toSpawn = 0;
  s.cash = cash;
  return s;
}

/** `n` live enemies in a tight group round `(x, y)`. */
function group(s: HordeState, n: number, x: number, y: number): void {
  for (let i = 0; i < n; i++) enemy(s, { x: x + (i % 3) * 10, y: y + Math.floor(i / 3) * 10 });
}

describe('strikeAim (ID-140)', () => {
  it('holds with no enemies, or fewer than the minimum in any circle', () => {
    const s = fight();
    expect(strikeAim(s)).toBeNull();
    group(s, AUTO_AIM.min - 1, 900, 400);
    expect(strikeAim(s)).toBeNull();
  });

  it('starts at 4 enemies', () => {
    expect(AUTO_AIM.min).toBe(4);
    const s = fight();
    group(s, 4, 900, 400);
    expect(strikeAim(s)).not.toBeNull();
  });

  it('aims at the biggest group, wherever it stands', () => {
    const s = fight();
    group(s, 4, 700, 150);
    group(s, 6, 1400, 650);
    const aim = strikeAim(s)!;
    expect(Math.hypot(aim.x - 1410, aim.y - 655)).toBeLessThan(SKILLS.airstrike.area);
  });

  it('counts every enemy its circle covers, not only a tight group', () => {
    const s = fight();
    // Four spread over a circle's reach beat three packed tight.
    const r = SKILLS.airstrike.area;
    for (const [dx, dy] of [
      [0, 0],
      [r * 0.6, 0],
      [0, r * 0.6],
      [-r * 0.6, 0],
    ])
      enemy(s, { x: 1100 + dx!, y: 400 + dy! });
    group(s, 3, 500, 100);
    const aim = strikeAim(s)!;
    expect(aim.x).toBeGreaterThan(800);
  });

  it('a tie goes to the group nearest the wall, then the lowest id', () => {
    const s = fight();
    group(s, 4, 1400, 400);
    group(s, 4, 700, 400);
    const aim = strikeAim(s)!;
    expect(aim.x).toBeLessThan(1000);

    const t = fight();
    const first = enemy(t, { x: 900, y: 100 });
    const second = enemy(t, { x: 900, y: 120 });
    enemy(t, { x: 950, y: 110 });
    enemy(t, { x: 960, y: 110 });
    expect(first.id).toBeLessThan(second.id);
    expect(strikeAim(t)).toEqual({ x: 900, y: 100 });
  });

  it('ignores the dead, enemies in the camp, behind the outer wall or off the field', () => {
    const s = fight();
    const front = wallFront(s);
    group(s, 3, 900, 400);
    enemy(s, { x: 910, y: 410, hp: 0 });
    enemy(s, { x: 905, y: 405, inCamp: true });
    enemy(s, { x: front - 5, y: 400 });
    enemy(s, { x: FIELD.right + 20, y: 400 });
    expect(strikeAim(s)).toBeNull();
  });

  it('aims on the field past the outer wall', () => {
    const s = fight();
    const front = wallFront(s);
    group(s, 4, front, 0);
    const aim = strikeAim(s)!;
    expect(aim.x).toBeGreaterThanOrEqual(front);
    expect(aim.x).toBeLessThanOrEqual(FIELD.right);
    expect(aim.y).toBeGreaterThanOrEqual(0);
    expect(aim.y).toBeLessThanOrEqual(FIELD.height);
  });

  it('is pure: the same state gives the same aim and is left as it was', () => {
    const s = fight();
    group(s, 5, 1000, 300);
    group(s, 5, 1300, 600);
    const before = structuredClone(s);
    expect(strikeAim(s)).toEqual(strikeAim(structuredClone(s)));
    expect(s).toEqual(before);
  });

  it('stays cheap with a full horde on the field', () => {
    const s = fight();
    let seed = 7;
    const next = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const front = wallFront(s);
    for (let i = 0; i < 500; i++) {
      enemy(s, { x: front + next() * (FIELD.right - front), y: next() * FIELD.height });
    }
    strikeAim(s);
    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) strikeAim(s);
    // Looked at most 4 times a fight second (`AUTO_AIM.look`): a few ms is far inside a frame.
    expect((performance.now() - t0) / runs).toBeLessThan(5);
  });
});

describe('autoLookDue (ID-140)', () => {
  it('looks at once, then every AUTO_AIM.look fight s', () => {
    expect(AUTO_AIM.look).toBe(0.25);
    expect(autoLookDue(0, -Infinity)).toBe(true);
    expect(autoLookDue(10.2, 10)).toBe(false);
    expect(autoLookDue(10.25, 10)).toBe(true);
    // Paused or held: fight time stands still, so it waits.
    expect(autoLookDue(10, 10)).toBe(false);
  });

  it('looks at once in a new horde, whose clock starts again', () => {
    expect(autoLookDue(0.01, 300)).toBe(true);
  });
});

describe('autoStrike (ID-140)', () => {
  it('fires the moment the Airstrike is ready, exactly as a manual strike there', () => {
    const s = fight();
    group(s, 5, 1000, 300);
    const aim = strikeAim(s)!;
    const manual = useSkill(s, 'airstrike', aim.x, aim.y);
    if (!manual.ok) throw new Error(manual.reason);
    const auto = autoStrike(s);
    expect(auto).toEqual(manual.state);
    expect(auto.cash).toBe(s.cash - SKILLS.airstrike.cost);
    expect(auto.cooldowns.airstrike).toBe(s.time + SKILLS.airstrike.cooldown);
    expect(auto.incoming).toHaveLength(SKILLS.airstrike.count);
  });

  it('holds with too few enemies', () => {
    const s = fight();
    group(s, AUTO_AIM.min - 1, 1000, 300);
    expect(autoStrike(s)).toBe(s);
  });

  it('holds while cooling down, during a pick, without the cash, or once the horde is over', () => {
    const ready = fight();
    group(ready, 6, 1000, 300);
    const cooling = autoStrike(ready);
    expect(skillLock(cooling, 'airstrike')).toBe('Not ready yet');
    expect(autoStrike(cooling)).toBe(cooling);

    const picking = structuredClone(ready);
    picking.offer = [];
    expect(autoStrike(picking)).toBe(picking);

    const poor = structuredClone(ready);
    poor.cash = SKILLS.airstrike.cost - 1;
    expect(autoStrike(poor)).toBe(poor);

    const over = structuredClone(ready);
    over.outcome = 'won';
    expect(autoStrike(over)).toBe(over);
  });

  it('a manual strike starts the same cooldown auto-aim waits on', () => {
    const s = fight();
    group(s, 6, 1000, 300);
    const r = useSkill(s, 'airstrike', 1200, 500);
    if (!r.ok) throw new Error(r.reason);
    expect(autoStrike(r.state)).toBe(r.state);
  });

  it('fires for free in the horde-only build', () => {
    const s = newHorde(1, { ...setup(), skills: [...SKILL_IDS], freeSkills: { power: 1 } });
    s.toSpawn = 0;
    s.cash = 0;
    group(s, 6, 1000, 300);
    const auto = autoStrike(s);
    expect(auto.cash).toBe(0);
    expect(auto.incoming).toHaveLength(SKILLS.airstrike.count);
  });
});
