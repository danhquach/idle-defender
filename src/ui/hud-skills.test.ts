// ID-100, ID-139: the skill pick before a horde-only horde, and the fight's skill button.
// Only a picked skill shows, with no cash cost, ×2 on one picked alone, and a key (Q). The
// Airstrike is the only skill since Flashbang and Molotov became cards (ID-139).
import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { useSkill } from '../core/skills.ts';
import { AIM_PROMPT, SKILL_KEYS, skillButtons, skillPicker, skillSlots } from './hud.ts';

const NOW = 1_700_000_000_000;
const fight = (...pick: SkillId[]) => startSquadHorde({ ...newGame(), skillPick: pick }, 1, NOW);

describe('the skill pick (ID-100, ID-139)', () => {
  const rows = (pick: SkillId[]) =>
    skillPicker(pick).options.map((o) => [
      o.skill,
      o.picked,
      o.full,
      o.detail,
      o.boost,
      o.cooldown,
    ]);

  it('the Airstrike card says what the skill does and its cooldown, and nothing else is offered', () => {
    const p = skillPicker([]);
    expect(p.solo).toBe(false);
    expect(rows([])).toEqual([
      ['airstrike', false, false, 'Bombs an area you pick, 12 bombs', null, '60s cooldown'],
    ]);
    expect(p.options.map((o) => o.name)).toEqual(['Airstrike']);
  });

  it('nothing picked: the note asks for the one skill there is, not for "up to 2"', () => {
    expect(skillPicker([]).note).toBe('No skill picked. Airstrike hits ×2 as your only skill');
  });

  it('picked alone: ×2 power in the note, and a ×2 line on the card', () => {
    const p = skillPicker(['airstrike']);
    expect(p.solo).toBe(true);
    expect(p.note).toBe('×2 power: your only skill, so it hits twice as hard');
    expect(rows(['airstrike'])).toEqual([
      [
        'airstrike',
        true,
        false,
        'Bombs an area you pick, 12 bombs',
        '×2: hits twice as hard',
        '60s cooldown',
      ],
    ]);
  });
});

describe('the horde-only skill button (ID-100, ID-139)', () => {
  it('only the picked skill shows, free, keyed Q', () => {
    const s = fight('airstrike');
    expect(skillSlots(s)).toEqual(['airstrike']);
    expect(SKILL_KEYS).toEqual(['Q', 'W']);
    const buttons = skillButtons(s, null);
    expect(buttons.map((b) => [b.skill, b.hidden, b.key, b.cost, b.disabled])).toEqual([
      ['airstrike', false, 'Q', '', false],
    ]);
    expect(buttons[0]!.reason).toBe('Then click an area to bomb (Esc to cancel) (key Q)');
    expect(skillButtons(s, 'airstrike')[0]!.armed).toBe(true);
  });

  it('alone it says ×2; cooling down it shows its seconds', () => {
    const s = fight('airstrike');
    expect(skillButtons(s, null)[0]).toMatchObject({
      label: 'Airstrike ×2',
      key: 'Q',
      hidden: false,
      cost: '',
    });
    const r = useSkill(s, 'airstrike', 1000, 200);
    if (!r.ok) throw new Error(r.reason);
    expect(skillButtons(r.state, null)[0]).toMatchObject({
      label: `Airstrike ×2 ${SKILLS.airstrike.cooldown}s`,
      cooling: true,
      cost: '',
      disabled: true,
      reason: 'Not ready yet',
    });
  });

  it('nothing picked: no button shows', () => {
    expect(skillButtons(fight(), null).every((b) => b.hidden)).toBe(true);
  });

  it('the touch aim prompt is the area one', () => {
    expect(AIM_PROMPT).toEqual({
      airstrike: 'Tap or drag to an area · tap Airstrike again to cancel',
    });
  });
});
