// ID-100 (farming design, Part 3): skills in the horde-only build. Up to 2 picked before
// each horde; 1 picked alone works twice as hard with the same cooldown; no cash, so they
// run on cooldown only; fight time, so their clocks stop during picks.
import { describe, expect, it } from 'vitest';
import {
  FIELD,
  SKILL_IDS,
  SKILLS,
  SQUAD_SKILLS,
  START_SKILLS,
  STEP,
  type SkillId,
} from './data.ts';
import { newGame, type GameState } from './game.ts';
import { bombDamage, skillPower, tick, type HordeState } from './horde.ts';
import { skillPickPower, startSquadHorde, toggleSkill } from './hordeonly.ts';
import { skillLeft, skillLock, useSkill } from './skills.ts';
import { enemy } from './testing.ts';

const NOW = 1_700_000_000_000;

const picked = (...pick: SkillId[]): GameState => ({ ...newGame(), skillPick: pick });

/** A horde-only fight with `pick`, nothing left to spawn. */
function fight(...pick: SkillId[]): HordeState {
  const s = startSquadHorde(picked(...pick), 1, NOW);
  s.toSpawn = 0;
  s.enemies = [];
  return s;
}

function used(s: HordeState, id: SkillId, x = 1400, y = 200): HordeState {
  const r = useSkill(s, id, x, y);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

/** `s` ticked until every bomb in the air has landed. */
function landed(s: HordeState): HordeState {
  let t = s;
  for (let i = 0; i < 100 && t.incoming.length > 0; i++) t = tick(t, STEP);
  expect(t.incoming).toEqual([]);
  return t;
}

const hold = { hp: 10_000, maxHp: 10_000, stunnedUntil: 1e9 };

describe('the skill pick (ID-100, ID-139)', () => {
  it('a new game starts with the Airstrike picked', () => {
    expect(START_SKILLS).toEqual(['airstrike']);
    expect(newGame().skillPick).toEqual(['airstrike']);
    // Its own copy: a game never shares the constant.
    expect(newGame().skillPick).not.toBe(START_SKILLS);
  });

  it('toggles the Airstrike in and out', () => {
    let g = picked();
    const toggle = (id: SkillId) => {
      const r = toggleSkill(g, id);
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    };
    toggle('airstrike');
    expect(g.skillPick).toEqual(['airstrike']);
    toggle('airstrike');
    expect(g.skillPick).toEqual([]);
  });

  it('refuses a pick past the maximum, whatever it holds', () => {
    // Only one skill exists now: a pick of two stale ids stands in for a full one.
    const full = picked('a' as SkillId, 'b' as SkillId);
    expect(toggleSkill(full, 'airstrike')).toEqual({
      ok: false,
      reason: 'Pick up to 2: drop one first',
    });
  });

  it('leaves the game it was given alone, and refuses an unknown or retired skill', () => {
    const g = picked();
    toggleSkill(g, 'airstrike');
    expect(g.skillPick).toEqual([]);
    for (const bad of ['nuke', '__proto__', 'constructor', '', 'flashbang', 'molotov']) {
      expect(() => toggleSkill(g, bad as SkillId)).toThrow(RangeError);
    }
  });

  it('1 picked works ×2, 0 or 2 at 1×', () => {
    expect(SQUAD_SKILLS).toEqual({ max: 2, solo: 2 });
    expect(skillPickPower([])).toBe(1);
    expect(skillPickPower(['airstrike'])).toBe(2);
    expect(skillPickPower(['airstrike', 'airstrike'])).toBe(1);
  });
});

describe('skills in a horde-only fight (ID-100, ID-139)', () => {
  it('only the picked skills come in, free, at the pick’s power', () => {
    const one = fight('airstrike');
    expect(one.skills).toEqual(['airstrike']);
    expect(one.freeSkills).toEqual({ power: 2 });
    expect(skillPower(one)).toBe(2);
    const none = fight();
    expect(none.skills).toEqual([]);
    expect(none.freeSkills).toEqual({ power: 1 });
    expect(skillLock(none, 'airstrike')).toBe('Research Airstrike first');
  });

  it('a later change to the pick never reaches a fight already started', () => {
    const g = picked();
    const s = startSquadHorde(g, 1, NOW);
    g.skillPick.push('airstrike');
    expect(s.skills).toEqual([]);
  });

  it('costs no cash: usable with none, and the cash stays put', () => {
    const s = fight('airstrike');
    expect(s.cash).toBe(0);
    expect(skillLock(s, 'airstrike')).toBeNull();
    const after = used(s, 'airstrike');
    expect(after.cash).toBe(0);
    expect(skillLeft(after, 'airstrike')).toBe(SKILLS.airstrike.cooldown);
    expect(skillLock(after, 'airstrike')).toBe('Not ready yet');
  });

  it('keeps the full game’s cost and 1× power when the fight is not horde-only', () => {
    const s = fight('airstrike');
    delete s.freeSkills;
    expect(skillPower(s)).toBe(1);
    expect(skillLock(s, 'airstrike')).toBe('Not enough cash');
  });

  it('the cooldown is the same at ×2', () => {
    for (const id of SKILL_IDS) {
      expect(skillLeft(used(fight(id), id), id)).toBe(SKILLS[id].cooldown);
    }
  });

  it('an airstrike alone throws as many bombs, each hitting twice as hard; with none other picked it is always alone', () => {
    const solo = used(fight('airstrike'), 'airstrike');
    expect(solo.incoming).toHaveLength(SKILLS.airstrike.count);
    for (const b of solo.incoming) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(FIELD.right);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(FIELD.height);
    }
    const hit = (s: HordeState): number => {
      const bombs = used(s, 'airstrike', 1000, 300);
      bombs.incoming = bombs.incoming.slice(0, 1);
      // Only the bomb hits: it falls for THROW_FALL (ID-107), time the squad would shoot in.
      for (const d of bombs.defenders) d.nextShotAt = 1e9;
      const b = bombs.incoming[0]!;
      const e = enemy(bombs, { x: b.x, y: b.y, ...hold });
      const after = landed(bombs);
      return 10_000 - after.enemies.find((x) => x.id === e.id)!.hp;
    };
    const one = bombDamage({ ...fight('airstrike'), freeSkills: { power: 1 } });
    expect(hit(fight('airstrike'))).toBeCloseTo(2 * one, 9);
    const plain = fight('airstrike');
    plain.freeSkills = { power: 1 }; // as with two picked
    expect(hit(plain)).toBeCloseTo(one, 9);
  });

  it('the clocks run on fight time: they stop while a card pick is open', () => {
    let s = used(fight('airstrike'), 'airstrike');
    const left = skillLeft(s, 'airstrike');
    s.offer = [];
    s = tick(s, 10);
    expect(skillLeft(s, 'airstrike')).toBe(left);
    expect(skillLock(s, 'airstrike')).toBe('Pick first');
    s.offer = null;
    s = tick(s, 10);
    expect(skillLeft(s, 'airstrike')).toBeCloseTo(left - 10, 6);
  });
});
