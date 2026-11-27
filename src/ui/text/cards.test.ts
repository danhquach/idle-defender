// The upgrade cards in words (ID-269): each card's effect at a level, what a pick would give,
// replace warnings and synergy lines, pinned to the text core gave before it moved.
import { describe, expect, it } from 'vitest';
import {
  AMMO_CARDS,
  chooseCard,
  patchUpGain,
  synergyOf,
  THROWABLE_CARDS,
  UPGRADE_IDS,
  UPGRADES,
  type Synergy,
} from '../../core/cards.ts';
import { CARD, type TechId } from '../../core/data.ts';
import { newHorde, type HordeState, type UpgradeId } from '../../core/horde.ts';
import { setup } from '../../core/testing.ts';
import { CARD_NAME, CARD_TEXT, cardPitch, effectAt, SYNERGY_TEXT, synergyText } from './cards.ts';

/** Horde 1 with nothing left to spawn; defender a never fires. */
function quiet(): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
/** `s` with card `id` picked from an offer (as the player would), `times` times. */
function picked(s: HordeState, id: UpgradeId, times = 1): HordeState {
  let t = s;
  for (let i = 0; i < times; i++) {
    t = { ...t, offer: [{ kind: 'upgrade', id }] };
    t = chooseCard(t, 0);
    t.offer = null;
  }
  return t;
}
/** `s` with card `id` held at `level`. */
const at = (id: UpgradeId, level: number, s = quiet()): HordeState => picked(s, id, level);
const EPIC = UPGRADE_IDS.filter((id) => UPGRADES[id].rarity === 'epic');

describe('Research Center in the card words (ID-263)', () => {
  const HL: TechId[] = ['hand-loads'];
  const quietWith = (tech: readonly TechId[]): HordeState => {
    const s = newHorde(1, { ...setup(), ...(tech.length > 0 ? { tech } : {}) });
    s.toSpawn = 0;
    s.defenders[0]!.nextShotAt = 1e9;
    return s;
  };

  it('Hand-loads: the five ammo cards’ numbers are shown 10% stronger', () => {
    expect(effectAt('incendiary-rounds', 3, HL)!.value).toBe('9.9%');
    expect(effectAt('incendiary-rounds', 3)!.value).toBe('9%');
    expect(effectAt('piercing-rounds', 3, HL)!.value).toBe('82.5%');
    expect(effectAt('scavenged-ammo', 3, HL)!.value).toBe('44%');
    expect(effectAt('shock-rounds', 3, HL)!.value).toBe('0.44 s');
    expect(effectAt('shock-rounds', 3)!.value).toBe('0.4 s');
    expect(cardPitch(quietWith(HL), 'hollow-points').text).toBe('+41.8% damage, +25% reload time');
    expect(cardPitch(quietWith([]), 'hollow-points').text).toBe('+38% damage, +25% reload time');
  });
});

describe('card names and texts (ID-269)', () => {
  it('names the cards as before', () => {
    expect(CARD_NAME['kevlar-vests']).toBe('Kevlar Vests');
    expect(CARD_NAME['first-aid-kits']).toBe('First Aid Kits');
    expect(CARD_NAME['aim-for-the-head']).toBe('Aim for the Head');
    expect(CARD_NAME['hollow-point-rounds']).toBe('Hollow Points');
    expect(CARD_NAME['hollow-points']).toBe('Heavy Rounds');
    expect(CARD_NAME.sandbags).toBe('Sandbags');
    expect(CARD_NAME['scavenged-ammo']).toBe('Scavenged Ammo');
    expect(CARD_NAME['oil-bomb']).toBe('Oil Bomb');
    expect(CARD_TEXT['hollow-points']).toBe('+38% damage, +25% reload time');
  });

  it('every synergy has its line', () => {
    const lines: Record<Synergy, string> = {
      'ricochet-pierce': 'Piercing Rounds: bounces pierce',
      'pierce-ricochet': 'Ricochet: bounces pierce',
      'oil-both': 'Incendiary Rounds, Molotov: they light the slick',
      'oil-incendiary': 'Incendiary Rounds: hits light the slick',
      'incendiary-oil': 'Oil Bomb: hits light the slick',
      'oil-molotov': 'Molotov: fire lights the slick',
      'molotov-oil': 'Oil Bomb: fire lights the slick',
    };
    expect(SYNERGY_TEXT).toEqual(lines);
    expect(synergyText(quiet(), 'oil-bomb')).toBeNull();
    expect(synergyText(picked(quiet(), 'incendiary-rounds'), 'oil-bomb')).toBe(
      'Incendiary Rounds: hits light the slick',
    );
    expect(synergyOf(picked(quiet(), 'incendiary-rounds'), 'oil-bomb')).toBe('oil-incendiary');
  });

  it('Patch Up shows what it restores', () => {
    const s = quiet();
    const segs = s.layers[0]!.segments;
    const max = segs[0]!.maxHp;
    segs[0]!.hp = max - 20;
    segs[1]!.hp = 0;
    expect(patchUpGain(s).segments).toBe(2);
    expect(cardPitch(s, 'patch-up').text).toBe(
      `Repairs ${Math.round(20 + 0.3 * max)} HP across 2 segments`,
    );
    expect(cardPitch(s, 'patch-up')).toMatchObject({
      tag: 'Repeatable',
      effect: {
        pre: 'Repairs ',
        to: `${Math.round(20 + 0.3 * max)} HP`,
        post: ' across 2 segments',
      },
    });
  });

  it('warns what a pick replaces: a unique card has no level to lose', () => {
    // Frag Grenades held (unique): no level, no "levels are lost".
    expect(cardPitch(at('frag-grenades', 1), 'molotov').replace).toEqual({
      warning: 'Replaces Frag Grenades.',
      swap: 'Frag Grenades → Molotov Lv 1',
    });
    expect(cardPitch(at('frag-grenades', 1), 'flashbang').replace).toEqual({
      warning: 'Replaces Frag Grenades.',
      swap: 'Frag Grenades → Flashbang Lv 1',
    });
    // A levelled card held: its level, and that its levels are lost.
    expect(cardPitch(at('molotov', 2), 'flashbang').replace).toEqual({
      warning: 'Replaces Molotov Lv 2. Its levels are lost.',
      swap: 'Molotov Lv 2 → Flashbang Lv 1',
    });
    expect(cardPitch(at('flashbang', 3), 'molotov').replace!.warning).toBe(
      'Replaces Flashbang Lv Max. Its levels are lost.',
    );
    // To a unique card: it starts with no level.
    expect(cardPitch(at('molotov', 2), 'frag-grenades').replace).toEqual({
      warning: 'Replaces Molotov Lv 2. Its levels are lost.',
      swap: 'Molotov Lv 2 → Frag Grenades',
    });
    // Nothing held, or the card itself held: nothing replaced.
    expect(cardPitch(quiet(), 'molotov').replace).toBeUndefined();
    expect(cardPitch(at('molotov', 1), 'molotov').replace).toBeUndefined();
    // Another slot's card is not what it replaces.
    expect(cardPitch(at('shock-rounds', 1), 'molotov').replace).toBeUndefined();
  });

  it('Oil Bomb is Unique', () => {
    expect(cardPitch(quiet(), 'oil-bomb').tag).toBe('Unique');
  });

  it('card texts show the exact numbers', () => {
    expect(effectAt('sandbags', 1)).toEqual({
      pre: 'The outer wall takes ',
      value: '−10%',
      post: ' damage',
    });
    expect(effectAt('sandbags', 3)!.value).toBe('−30%');
    expect(effectAt('scavenged-ammo', 1)!.value).toBe('20%');
    expect(effectAt('scavenged-ammo', 3)!.value).toBe('40%');
    const lv2 = cardPitch(picked(quiet(), 'sandbags'), 'sandbags');
    expect(lv2.tag).toBe('Lv 1 → 2');
    expect(lv2.effect).toMatchObject({ from: '−10%', to: '−20%' });
    // The epic card names its gain and its cost (ID-137), with the numbers.
    const oil = CARD_TEXT['oil-bomb'];
    for (const part of ['20 s', '60%', '10 s', 'Incendiary', 'Molotov', '20%', '3 s', '1.5 s']) {
      expect(oil).toContain(part);
    }
  });

  it('card texts show the exact number at each level', () => {
    expect([1, 2, 3].map((n) => effectAt('kevlar-vests', n)!.value)).toEqual([
      '−1 HP',
      '−2 HP',
      '−3 HP',
    ]);
    expect(effectAt('kevlar-vests', 1)).toEqual({
      pre: 'Each hit on a survivor ',
      value: '−1 HP',
      post: '',
    });
    expect([1, 2, 3].map((n) => effectAt('first-aid-kits', n)!.value)).toEqual([
      '0.5%',
      '1%',
      '1.5%',
    ]);
    expect(effectAt('first-aid-kits', 1)).toEqual({
      pre: 'Survivors recover ',
      value: '0.5%',
      post: ' of max HP a second',
    });
    const s = picked(newHorde(1, setup()), 'kevlar-vests', 1);
    expect(cardPitch(s, 'kevlar-vests')).toMatchObject({
      tag: 'Lv 1 → 2',
      effect: { from: '−1 HP', to: '−2 HP' },
    });
  });

  it('card texts show the exact number at each level', () => {
    expect([1, 2, 3].map((n) => effectAt('aim-for-the-head', n)!.value)).toEqual([
      '+5%',
      '+10%',
      '+15%',
    ]);
    expect(effectAt('aim-for-the-head', 1)).toEqual({
      pre: 'Squad crit chance ',
      value: '+5%',
      post: '',
    });
    expect([1, 2, 3].map((n) => effectAt('hollow-point-rounds', n)!.value)).toEqual([
      '+25%',
      '+50%',
      '+75%',
    ]);
    expect(effectAt('hollow-point-rounds', 1)).toEqual({
      pre: 'Squad crit damage ',
      value: '+25%',
      post: ', added to the ×2',
    });
    const s = picked(newHorde(1, setup()), 'hollow-point-rounds', 1);
    expect(cardPitch(s, 'hollow-point-rounds')).toMatchObject({
      tag: 'Lv 1 → 2',
      effect: { from: '+25%', to: '+50%' },
    });
  });

  it('each card’s text names its gain and then its cost, with the numbers', () => {
    expect(CARD_TEXT['concussion-rounds']).toBe(
      'Hits knock enemies back up to 100 px and daze them: +30% damage taken for 1 s; −10% fire rate',
    );
    // Short enough for the one-size card (ID-195).
    expect(CARD_TEXT['frag-grenades']).toBe(
      '3 per survivor, one back every 8 s. Hits the thickest group for 25% of a Shambler’s HP; the thrower stops firing for 1.5 s',
    );
    expect(CARD_TEXT['field-repairs']).toBe(
      'Field Repairs skill: repair every wall segment to full when you choose; −25% fire rate for 5 s',
    );
    expect(CARD_TEXT['hollow-points']).toBe('+38% damage, +25% reload time');
    // ID-132: its cost is the slow throw and a lit slick burning out.
    expect(CARD_TEXT['oil-bomb']).toBe(
      'Tar slick every 20 s: 60% slower for 10 s, lit by Incendiary or Molotov fire (20% of a Shambler’s HP a second); but it lands 1.5 s late, and a lit slick burns out in 3 s',
    );
  });

  it('no two epic cards share a cost', () => {
    // The cost is the text after the gain: after "; " or, for Heavy Rounds, ", ".
    const costs = EPIC.map((id) => {
      const text = CARD_TEXT[id];
      return text.includes('; ') ? text.split('; ')[1]! : text.split(', ')[1]!;
    });
    expect(costs.every((c) => c.length > 0)).toBe(true);
    expect(new Set(costs).size).toBe(EPIC.length);
    // The two fire-rate costs differ in size and in how long they last.
    expect(CARD.concussion.fireRate).not.toBe(CARD.fieldRepairs.fireRate);
  });
});

describe('the offer spells out each pick (ID-097)', () => {
  it('a card not held shows "New" and its level 1 effect', () => {
    expect(cardPitch(quiet(), 'barbed-wire')).toMatchObject({
      tag: 'New',
      effect: { from: null, to: '15%', pre: 'Field wire slows enemies ' },
    });
  });

  it('a card held shows its level step and the effect before and after', () => {
    expect(cardPitch(at('barbed-wire', 1), 'barbed-wire')).toMatchObject({
      tag: 'Lv 1 → 2',
      tagSpoken: 'Level 1 to 2',
      effect: { from: '15%', to: '25%' },
    });
    expect(cardPitch(at('barbed-wire', 2), 'barbed-wire')).toMatchObject({
      tag: 'Lv 2 → Max',
      tagSpoken: 'Level 2 to max',
      effect: { from: '25%', to: '35%' },
    });
    expect(cardPitch(at('extended-mags', 1), 'extended-mags').effect).toMatchObject({
      from: '×1.33',
      to: '×1.67',
    });
  });

  it('an epic shows "Unique"; a repeatable card its stack and totals', () => {
    expect(cardPitch(quiet(), 'concussion-rounds').tag).toBe('Unique');
    expect(cardPitch(quiet(), 'frag-grenades').tag).toBe('Unique');
    expect(cardPitch(quiet(), 'sharpshooter')).toMatchObject({
      tag: 'New',
      effect: { from: null, to: '+10%', post: ' damage' },
    });
    expect(cardPitch(picked(quiet(), 'sharpshooter', 3), 'sharpshooter')).toMatchObject({
      tag: '×3 → ×4',
      effect: { from: '+30%', to: '+40%', post: ' damage' },
    });
  });

  it('the other ammo card warns what it replaces, with what you’d hold before and after', () => {
    const p = cardPitch(at('incendiary-rounds', 2), 'shock-rounds');
    expect(p.tag).toBe('New');
    expect(p.replace).toEqual({
      warning: 'Replaces Incendiary Rounds Lv 2. Its levels are lost.',
      swap: 'Incendiary Rounds Lv 2 → Shock Rounds Lv 1',
    });
    expect(cardPitch(at('incendiary-rounds', 3), 'shock-rounds').replace!.warning).toBe(
      'Replaces Incendiary Rounds Lv Max. Its levels are lost.',
    );
    expect(cardPitch(quiet(), 'shock-rounds').replace).toBeUndefined();
  });
});

describe('a card states its number as the data has it (ID-125)', () => {
  it('Rapid Fire reads +7.5% a pick, not rounded to +8%', () => {
    expect(CARD.step.fireRate).toBe(0.075);
    expect(effectAt('rapid-fire', 1)).toEqual({ pre: '', value: '+7.5%', post: ' fire rate' });
    expect(effectAt('rapid-fire', 2)!.value).toBe('+15%');
    expect(effectAt('sharpshooter', 1)!.value).toBe('+10%');
  });
});

describe('Flashbang and Molotov say they are thrown, and how often (ID-139 design review)', () => {
  it('every level names the cadence, the effect and the cost', () => {
    for (const n of [1, 2, 3]) {
      const f = effectAt('flashbang', n)!;
      expect(f.pre).toBe(
        `3 per survivor, one back every ${CARD.flashbang.every} s. Stuns enemies within ${CARD.flashbang.radius} px for `,
      );
      expect(f.value).toBe(`${CARD.flashbang.seconds[n - 1]} s`);
      expect(f.post).toBe('; −15% squad gun range while held');
      const m = effectAt('molotov', n)!;
      expect(m.pre).toBe(`3 per survivor, one back every ${CARD.molotov.every} s. Burns for `);
      expect(m.value).toBe(`${CARD.molotov.seconds[n - 1]} s`);
      expect(m.post).toContain('enemies 30% faster in it');
    }
  });
});

describe('replace warnings (ID-161)', () => {
  it('every pick that drops a held card says so, whichever card is Unique', () => {
    let drops = 0;
    for (const held of UPGRADE_IDS) {
      for (const id of UPGRADE_IDS) {
        if (id === held) continue;
        const s = at(held, 1);
        const warning = cardPitch(s, id).replace?.warning;
        const dropped = !picked(s, id).taken.includes(held);
        expect(warning !== undefined, `${id} over ${held}`).toBe(dropped);
        if (dropped) expect(warning).toMatch(new RegExp(`^Replaces ${CARD_NAME[held]}\\b`));
        if (dropped) drops++;
      }
    }
    // Each card of a slot drops each other card of that slot, and nothing else drops.
    const pairs = (n: number): number => n * (n - 1);
    expect(drops).toBe(pairs(AMMO_CARDS.length) + pairs(THROWABLE_CARDS.length));
    expect(drops).toBeGreaterThan(0);
    // As reported: Frag Grenades leaves Concussion Rounds held, so it warns of nothing.
    const s = picked(at('concussion-rounds', 1), 'frag-grenades');
    expect(s.taken).toEqual(expect.arrayContaining(['concussion-rounds', 'frag-grenades']));
    expect(cardPitch(at('concussion-rounds', 1), 'frag-grenades').replace).toBeUndefined();
  });
});
