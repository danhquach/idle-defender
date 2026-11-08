// ID-100: the skill pick before a horde-only horde, and the fight's skill buttons. Only
// the picked skills show, with no cash cost, ×2 on one picked alone, and a key each, Q
// then W left to right.
import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { useSkill } from '../core/skills.ts';
import { SKILL_KEYS, skillButtons, skillPicker, skillSlots } from './hud.ts';

const NOW = 1_700_000_000_000;
const fight = (...pick: SkillId[]) => startSquadHorde({ ...newGame(), skillPick: pick }, 1, NOW);

describe('the skill pick (ID-100)', () => {
  const rows = (pick: SkillId[]) =>
    skillPicker(pick).options.map((o) => [
      o.skill,
      o.picked,
      o.full,
      o.detail,
      o.boost,
      o.cooldown,
    ]);

  it('every card always says what the skill does and its cooldown', () => {
    const p = skillPicker([]);
    expect(p.solo).toBe(false);
    expect(p.note).toBe('Pick up to 2. Just 1 works twice as hard');
    expect(rows([])).toEqual([
      ['flashbang', false, false, 'Stuns an area you pick, 4 bursts', null, '25s cooldown'],
      ['molotov', false, false, 'Sets an area you pick on fire', null, '30s cooldown'],
      ['airstrike', false, false, 'Bombs a row you pick', null, '40s cooldown'],
    ]);
    expect(p.options.map((o) => o.name)).toEqual(['Flashbang', 'Molotov', 'Airstrike']);
  });

  it('1 picked: ×2 power in the note, and a ×2 line on that card only', () => {
    const p = skillPicker(['flashbang']);
    expect(p.solo).toBe(true);
    expect(p.note).toBe('×2 power: Flashbang alone works twice as hard');
    expect(rows(['flashbang'])).toEqual([
      [
        'flashbang',
        true,
        false,
        'Stuns an area you pick, 4 bursts',
        '×2: 8 bursts',
        '25s cooldown',
      ],
      ['molotov', false, false, 'Sets an area you pick on fire', null, '30s cooldown'],
      ['airstrike', false, false, 'Bombs a row you pick', null, '40s cooldown'],
    ]);
    expect(skillPicker(['molotov']).options[1]!.boost).toBe('×2: burns twice as hard');
    expect(skillPicker(['airstrike']).options[2]!.boost).toBe('×2: hits twice as hard');
  });

  it('2 picked: the third is full, no ×2 anywhere, and the note says how to get it', () => {
    const p = skillPicker(['airstrike', 'molotov']);
    expect(p.solo).toBe(false);
    expect(p.note).toBe('2 picked. Drop one for ×2 power');
    expect(rows(['airstrike', 'molotov'])).toEqual([
      ['flashbang', false, true, 'Stuns an area you pick, 4 bursts', null, '25s cooldown'],
      ['molotov', true, false, 'Sets an area you pick on fire', null, '30s cooldown'],
      ['airstrike', true, false, 'Bombs a row you pick', null, '40s cooldown'],
    ]);
  });
});

describe('the horde-only skill buttons (ID-100)', () => {
  it('only the picked skills show, free, keyed Q then W left to right', () => {
    const s = fight('airstrike', 'flashbang');
    expect(skillSlots(s)).toEqual(['flashbang', 'airstrike']);
    expect(SKILL_KEYS).toEqual(['Q', 'W']);
    expect(
      skillButtons(s, null).map((b) => [b.skill, b.hidden, b.key, b.label, b.cost, b.disabled]),
    ).toEqual([
      ['flashbang', false, 'Q', 'Flashbang', '', false],
      ['molotov', true, null, 'Molotov', '', true],
      ['airstrike', false, 'W', 'Airstrike', '', false],
    ]);
    expect(skillButtons(s, null)[0]!.reason).toBe(
      'Then click an area to throw it at (Esc to cancel) (key Q)',
    );
    expect(skillButtons(s, 'airstrike')[2]!.armed).toBe(true);
  });

  it('one picked alone says ×2 and takes Q; cooling down it shows its seconds', () => {
    const s = fight('molotov');
    const [, molotov] = skillButtons(s, null);
    expect(molotov).toMatchObject({ label: 'Molotov ×2', key: 'Q', hidden: false, cost: '' });
    const r = useSkill(s, 'molotov', 0, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(skillButtons(r.state, null)[1]).toMatchObject({
      label: `Molotov ×2 ${SKILLS.molotov.cooldown}s`,
      cooling: true,
      cost: '',
      disabled: true,
      reason: 'Not ready yet',
    });
  });

  it('nothing picked: no button shows', () => {
    expect(skillButtons(fight(), null).every((b) => b.hidden)).toBe(true);
  });
});
