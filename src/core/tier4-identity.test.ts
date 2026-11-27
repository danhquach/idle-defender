// ID-264: a game without the Tier 4 cards plays byte for byte as it did before them. The digests
// are of the finished horde's whole state (its RNG position included), recorded on main.
import { describe, expect, it } from 'vitest';
import { squadAt } from './balance/shared.ts';
import type { TechId } from './data.ts';
import { playSquadHorde } from './sim.ts';
import { startSquadHorde } from './hordeonly.ts';

/** FNV-1a over the JSON text: enough to tell any change in the numbers. */
function digest(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}:${text.length}`;
}

const TIER_1_3: TechId[] = [
  'reinforced-wall',
  'steel-plating',
  'spiked-wall',
  'razor-wire',
  'thick-coils',
  'electric-wire',
  'hand-loads',
  'armour-piercing',
  'quick-mortars',
  'wide-slick',
  'napalm-mortar',
];

const ARMS: Record<string, { n: number; level: number; tech?: TechId[] }> = {
  'bare-h4': { n: 4, level: 4 },
  'bare-h9': { n: 9, level: 8 },
  'empty-h9': { n: 9, level: 8, tech: [] },
  'tier13-h4': { n: 4, level: 4, tech: TIER_1_3 },
  'tier13-h9': { n: 9, level: 8, tech: TIER_1_3 },
};

/** Digest and RNG position (`rng.s`) of each arm's finished horde, recorded on origin/main at 0.5.206 (Node 25). */
const RECORDED: Record<string, [string, number]> = {
  'bare-h4': ['4f914e54:5232', 3964940904],
  'bare-h9': ['a234aebb:6337', 363265009],
  'empty-h9': ['a234aebb:6337', 363265009],
  'tier13-h4': ['37caab11:5426', 3964940904],
  'tier13-h9': ['b199544f:6467', 740250597],
};

const NEW_KEYS = ['nextGunAt', 'nextNetAt', 'moat', 'gunDps', 'nettedUntil'];

describe('Tier 4 leaves games without it byte-identical (ID-264)', () => {
  for (const [name, arm] of Object.entries(ARMS)) {
    it(`${name}: same digest and RNG position as on main, no new key`, () => {
      const game = { ...squadAt(arm.n, arm.level), ...(arm.tech ? { tech: arm.tech } : {}) };
      const done = playSquadHorde(game, 11, undefined, undefined, arm.n);
      const text = JSON.stringify(done) + JSON.stringify(startSquadHorde(game, 11, 0));
      for (const k of NEW_KEYS) expect(text).not.toContain(`"${k}"`);
      expect([digest(done), done.rng.s]).toEqual(RECORDED[name]);
    });
  }
});
