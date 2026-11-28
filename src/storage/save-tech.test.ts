// ID-263: save version 27. The Research Center's `tech` (written only when any). Everything in
// it is untrusted: the reader never refuses the save for it, keeps only known ids, once each, in
// table order, with prerequisites closed, and cuts the list's size before any work.
import { describe, expect, it } from 'vitest';
import { recruit } from '../core/camp.ts';
import { TECH, TECH_IDS, type TechId } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { cleanTech } from '../core/techtree.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { exportCode, importCode } from './code.ts';
import { NOW } from './testing.ts';

// Hostile saves are built loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

const camp = (extra: Partial<GameState> = {}): GameState => {
  const g = newGame('horde');
  return { ...g, roster: [recruit(1)], camp: { ...g.camp, recruits: 1 }, ...extra };
};

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}
/** The saved game with its `tech` replaced by `value`. */
const withTech = (value: unknown, v = SAVE_VERSION) => reread(camp(), (g) => (g.tech = value), v);

/** What a load must always give: a save, a closed subset of the table, and a clean prototype. */
function expectClean(value: unknown): TechId[] {
  const before = Object.getOwnPropertyNames(Object.prototype).sort();
  const loaded = withTech(value);
  expect(loaded).not.toBeNull();
  const tech = loaded!.game.tech ?? [];
  for (const id of tech) {
    expect(TECH_IDS).toContain(id);
    for (const n of TECH[id].needs) expect(tech).toContain(n);
  }
  expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  expect(({} as Loose).polluted).toBeUndefined();
  // Re-encoding gives canonical JSON.
  const again = JSON.parse(encodeSave(loaded!.game, NOW)).game.tech;
  expect(again).toEqual(tech.length > 0 ? tech : undefined);
  return tech;
}

describe('save: Research Center (ID-263)', () => {
  it('is version 28; a game with nothing researched writes no key, and loads as before', () => {
    expect(SAVE_VERSION).toBe(28);
    const g = camp();
    expect('tech' in JSON.parse(encodeSave(g, NOW)).game).toBe(false);
    expect(reread(g)!.game).toEqual(g);
  });

  it('round-trips what is researched, in table order', () => {
    const g = camp({ tech: ['reinforced-wall', 'steel-plating', 'razor-wire', 'quick-mortars'] });
    expect(reread(g)!.game).toEqual(g);
    expect(reread(camp({ tech: [...TECH_IDS] }))!.game.tech).toEqual([...TECH_IDS]);
  });

  it('a v26 save without the key loads with nothing researched; one carrying it is refused', () => {
    const old = reread(camp(), () => {}, 26);
    expect(old).not.toBeNull();
    expect(old!.game.tech).toBeUndefined();
    expect(withTech(['razor-wire'], 26)).toBeNull();
    expect(withTech(['razor-wire'], 25)).toBeNull();
  });

  it('v27 with an empty list loads and re-encodes without the key', () => {
    const loaded = withTech([]);
    expect(loaded!.game.tech).toBeUndefined();
    expect('tech' in JSON.parse(encodeSave(loaded!.game, NOW)).game).toBe(false);
  });

  it('anything that is not a list loads as nothing researched', () => {
    for (const v of [null, 7, 'razor-wire', true, {}, { length: 3 }, { 0: 'razor-wire' }]) {
      expect(expectClean(v), JSON.stringify(v)).toEqual([]);
    }
  });

  it('entries that are not known text are ignored, the known ones kept', () => {
    const mixed = [1, null, {}, [], ['razor-wire'], true, 'razor-wire', undefined, 'nope'];
    expect(expectClean(mixed)).toEqual(['razor-wire']);
    expect(expectClean([{ toString: 'razor-wire' }, ['reinforced-wall']])).toEqual([]);
  });

  it('prototype keys and the full game’s own research ids do nothing', () => {
    for (const bad of [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      'sharpened-spikes',
    ]) {
      expect(expectClean([bad, 'razor-wire']), bad).toEqual(['razor-wire']);
    }
    // A key named __proto__ on the save's game object is refused or ignored, never merged.
    const raw = encodeSave(camp(), NOW).replace('"game":{', '"game":{"__proto__":{"polluted":1},');
    decodeSave(raw);
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('look-alikes are not the id: case, padding, other hyphens, invisible and bidi characters, Cyrillic', () => {
    const lookalikes = [
      'Razor-Wire',
      ' razor-wire',
      'razor-wire ',
      'razor\u{2011}wire',
      'razor-wire\u{200d}',
      'ra\u{200d}zor-wire',
      '\u{202e}razor-wire',
      'r\u{430}zor-wire',
      '\u{ff52}azor-wire',
      'razor-wire\u{0}',
    ];
    expect(expectClean(lookalikes)).toEqual([]);
  });

  it('junk entries before the valid ids: nothing researched (the size cap, twice the 29 nodes, comes first)', () => {
    const junk = Array.from({ length: 58 }, (_, i) => 'junk' + i);
    expect(expectClean([...junk, 'reinforced-wall', 'razor-wire'])).toEqual([]);
    expect(expectClean([...junk.slice(0, 5), 'reinforced-wall'])).toEqual(['reinforced-wall']);
  });

  it('oversized input costs nothing and breaks nothing', () => {
    expect(expectClean(Array.from({ length: 2500 }, () => 'razor-wire'))).toEqual(['razor-wire']);
    expect(expectClean(['x'.repeat(40000), 'razor-wire'])).toEqual(['razor-wire']);
    // Past the save's own size cap the whole text is refused before any reader runs.
    expect(withTech(Array.from({ length: 1000000 }, (_, i) => i))).toBeNull();
  });

  it('a node without its prerequisite is dropped, and takes the ones above it', () => {
    expect(expectClean(['spiked-wall'])).toEqual([]);
    expect(expectClean(['steel-plating', 'spiked-wall'])).toEqual([]);
    expect(expectClean(['reinforced-wall', 'spiked-wall'])).toEqual(['reinforced-wall']);
    expect(expectClean(['thick-coils', 'electric-wire', 'hand-loads'])).toEqual(['hand-loads']);
    expect(expectClean([...TECH_IDS].reverse())).toEqual([...TECH_IDS]);
    const shuffled = [...TECH_IDS].sort((a, b) => (a < b ? -1 : 1));
    expect(expectClean(shuffled)).toEqual([...TECH_IDS]);
    expect(cleanTech(shuffled)).toEqual([...TECH_IDS]);
  });

  it('the full game’s own research list is never read as tech', () => {
    const g = camp();
    const loaded = reread(g, (x) => {
      x.research = [];
    });
    expect(loaded!.game.tech).toBeUndefined();
    expect(withTech(['sharpened-spikes', 'razor-wire'])!.game.tech).toEqual(['razor-wire']);
  });

  it('rides the backup code too', () => {
    const g = camp({ tech: ['razor-wire', 'thick-coils'] });
    const got = importCode(exportCode(encodeSave(g, NOW)));
    expect(got.ok && got.save.game.tech).toEqual(['razor-wire', 'thick-coils']);
  });

  it('a hole in the list (JSON has no sparse arrays: it is null) is ignored like any junk', () => {
    expect(expectClean([null, 'razor-wire', null])).toEqual(['razor-wire']);
  });
});

describe('save: Tier 4 combos (ID-264, no version bump)', () => {
  const WMG: TechId[] = [
    'reinforced-wall',
    'steel-plating',
    'spiked-wall',
    'hand-loads',
    'armour-piercing',
  ];
  const COMBOS: TechId[] = ['wall-machine-gun', 'shock-net', 'tar-moat'];

  it('ID-284 bumped the version to 28 and the cap to twice the 29 nodes', () => {
    expect(SAVE_VERSION).toBe(28);
    expect(TECH_IDS.length).toBe(29);
  });

  it('a combo with both parents loads; a combo alone, or with one parent, is dropped', () => {
    expect(expectClean([...WMG, 'wall-machine-gun'])).toEqual([...WMG, 'wall-machine-gun']);
    expect(expectClean(['wall-machine-gun'])).toEqual([]);
    expect(expectClean(COMBOS)).toEqual([]);
    // One parent short: Spiked Wall's chain without Armour-piercing.
    expect(
      expectClean(['reinforced-wall', 'steel-plating', 'spiked-wall', 'wall-machine-gun']),
    ).toEqual(['reinforced-wall', 'steel-plating', 'spiked-wall']);
    // Armour-piercing's chain without Spiked Wall.
    expect(expectClean(['hand-loads', 'armour-piercing', 'wall-machine-gun'])).toEqual([
      'hand-loads',
      'armour-piercing',
    ]);
  });

  it('a combo listed before its parents is kept once they are there (the list is put in table order)', () => {
    const early = ['tar-moat', 'shock-net', 'wall-machine-gun', ...TECH_IDS.slice(0, 11)];
    expect(expectClean(early)).toEqual(TECH_IDS.slice(0, 14));
  });

  it('a removed parent takes its combos with it, the others stay', () => {
    const without = TECH_IDS.filter((id) => id !== 'reinforced-wall');
    expect(expectClean(without)).toEqual(
      TECH_IDS.filter(
        (id) => !['reinforced-wall', 'steel-plating', 'spiked-wall', ...COMBOS].includes(id),
      ),
    );
    expect(expectClean(TECH_IDS.filter((id) => id !== 'napalm-mortar'))).not.toContain('tar-moat');
    expect(expectClean(TECH_IDS.filter((id) => id !== 'napalm-mortar'))).toContain('shock-net');
  });

  it('duplicates, numbers, objects and nulls around a combo change nothing', () => {
    const all: unknown[] = [...TECH_IDS];
    const noisy = [
      'shock-net',
      7,
      null,
      {},
      ['tar-moat'],
      ...all,
      ...all,
      'wall-machine-gun',
      NaN,
      true,
    ];
    expect(expectClean(noisy)).toEqual([...TECH_IDS]);
    expect(expectClean([...all, ...all])).toEqual([...TECH_IDS]);
  });

  it('prototype keys beside a combo do nothing, and the combos stay put', () => {
    expect(expectClean(['__proto__', 'constructor', ...TECH_IDS])).toEqual([...TECH_IDS]);
    expect(expectClean({ __proto__: { 'tar-moat': true }, length: 3 })).toEqual([]);
  });

  it('invisible, bidi and look-alike spellings of a combo are not the combo', () => {
    const lookalikes = [
      'shock\u{2011}net',
      'shock-net\u{200b}',
      'sho\u{200d}ck-net',
      '\u{202e}tar-moat',
      'tar-m\u{43e}at',
      'Wall-Machine-Gun',
      'wall-machine-gun\u{0}',
      ' wall-machine-gun',
    ];
    expect(expectClean([...TECH_IDS.slice(0, 11), ...lookalikes])).toEqual([
      ...TECH_IDS.slice(0, 11),
    ]);
  });

  it('more than 58 entries: the list is cut first, so combos past the cut are lost', () => {
    const pad = Array.from({ length: 58 }, (_, i) => 'pad' + i);
    expect(expectClean([...pad, ...TECH_IDS])).toEqual([]);
    expect(expectClean([...TECH_IDS, ...pad])).toEqual([...TECH_IDS]);
    expect(expectClean(Array.from({ length: 2000 }, () => 'shock-net'))).toEqual([]);
  });

  it('is byte-stable: save, load, save again gives the same text', () => {
    const g = camp({ tech: [...TECH_IDS] });
    const first = encodeSave(g, NOW);
    const loaded = decodeSave(first)!;
    expect(loaded.game.tech).toEqual([...TECH_IDS]);
    expect(encodeSave(loaded.game, NOW)).toBe(first);
    const part = camp({ tech: [...WMG, 'wall-machine-gun'] });
    const text = encodeSave(part, NOW);
    expect(encodeSave(decodeSave(text)!.game, NOW)).toBe(text);
    // And through the backup code.
    const got = importCode(exportCode(first));
    expect(got.ok && got.save.game.tech).toEqual([...TECH_IDS]);
  });
});
