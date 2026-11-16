// ID-100, ID-139: the skill pick before a horde-only horde, and the fight's skill button.
// Only a picked skill shows, with no cash cost and a key (Q). The Airstrike is the only skill
// since Flashbang and Molotov became cards (ID-139). A lone pick still works ×2, but no text
// says so (ID-174, PM).
import { describe, expect, it } from 'vitest';
import { SKILLS, type SkillId } from '../core/data.ts';
import { newGame } from '../core/game.ts';
import { startSquadHorde } from '../core/hordeonly.ts';
import { useSkill } from '../core/skills.ts';
import { AIM_PROMPT, SKILL_KEYS, skillButtons, skillHelp, skillPicker, skillSlots } from './hud.ts';

const NOW = 1_700_000_000_000;
const fight = (...pick: SkillId[]) => startSquadHorde({ ...newGame(), skillPick: pick }, 1, NOW);

describe('the skill pick (ID-100, ID-139)', () => {
  const rows = (pick: SkillId[]) =>
    skillPicker(pick).options.map((o) => [o.skill, o.picked, o.full, o.detail, o.cooldown]);

  it('the Airstrike card says what the skill does and its cooldown, and nothing else is offered', () => {
    const p = skillPicker([]);
    expect(rows([])).toEqual([
      ['airstrike', false, false, 'Bombs an area you pick, 12 bombs', '60s cooldown'],
    ]);
    expect(p.options.map((o) => o.name)).toEqual(['Airstrike']);
  });

  it('nothing picked: the note asks for the one skill there is, not for "up to 2"', () => {
    expect(skillPicker([]).note).toBe('No skill picked');
  });

  it('picked alone: no note (ID-185) and no ×2 claim anywhere, though it still works ×2 (ID-174)', () => {
    const p = skillPicker(['airstrike']);
    expect(p.note).toBe('');
    expect(rows(['airstrike'])).toEqual([
      ['airstrike', true, false, 'Bombs an area you pick, 12 bombs', '60s cooldown'],
    ]);
    expect(JSON.stringify(p)).not.toMatch(/×|twice/);
    expect(fight('airstrike').freeSkills).toEqual({ power: 2 });
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

  it('alone it shows its name, no ×2 (ID-174); cooling down it shows its seconds', () => {
    const s = fight('airstrike');
    expect(skillButtons(s, null)[0]).toMatchObject({
      label: 'Airstrike',
      key: 'Q',
      hidden: false,
      cost: '',
    });
    const r = useSkill(s, 'airstrike', 1000, 200);
    if (!r.ok) throw new Error(r.reason);
    expect(skillButtons(r.state, null)[0]).toMatchObject({
      label: `Airstrike ${SKILLS.airstrike.cooldown}s`,
      cooling: true,
      cost: '',
      disabled: true,
      reason: 'Not ready yet',
    });
  });

  it('an armed skill stays pressed while a card or replacement offer holds it (ID-159)', () => {
    const s = fight('airstrike');
    const offer = { ...s, offer: [] };
    const replace = { ...s, replace: { injuredId: 'x', postId: null } };
    for (const held of [offer, replace]) {
      expect(skillButtons(held, 'airstrike')[0]).toMatchObject({
        armed: true,
        disabled: true,
        reason: 'Pick first',
      });
      expect(skillButtons(held, null)[0]!.armed).toBe(false);
    }
    // A skill that truly cannot be used never shows armed, offer or not.
    expect(skillButtons({ ...offer, outcome: 'won' }, 'airstrike')[0]!.armed).toBe(false);
    const r = useSkill(s, 'airstrike', 1000, 200);
    if (!r.ok) throw new Error(r.reason);
    expect(skillButtons(r.state, 'airstrike')[0]!.armed).toBe(false);
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

describe('the skills help text (ID-193)', () => {
  it('with the one skill there is: names it, one key, no "up to"', () => {
    expect(skillHelp()).toEqual({
      line: 'Pick the Airstrike before each horde, then tap or click it when it is ready.',
      keys: ['Q'],
      keyHint: 'Key: Q.',
      one: true,
    });
  });

  it('with more skills than may be picked: "up to" the max, one key per pick', () => {
    const three: SkillId[] = ['airstrike', 'airstrike', 'airstrike'];
    expect(skillHelp(three, 2)).toEqual({
      line: 'Pick up to 2 before each horde, then tap or click them when they are ready.',
      keys: ['Q', 'W'],
      keyHint: 'Keys: Q W.',
      one: false,
    });
  });

  it('never offers more keys than there are skills, or than may be picked', () => {
    expect(skillHelp(['airstrike', 'airstrike'], 5).keys).toEqual(['Q', 'W']);
    expect(skillHelp(['airstrike', 'airstrike'], 1).keys).toEqual(['Q']);
  });

  it('several skills but 1 pick: one key, no skill named', () => {
    const h = skillHelp(['airstrike', 'airstrike'], 1);
    expect([h.line, h.keyHint, h.one]).toEqual([
      'Pick 1 skill before each horde, then tap or click it when it is ready.',
      'Key: Q.',
      false,
    ]);
  });
});
