// ID-219: the world map and Medicine in the save. `map` (its areas, the patrols out, the draws
// so far) and `medicine` are written once there is one; every field is read through an
// allow-list with bounds, and anything a hostile file could hold is refused, prototype keys
// included. Older saves load with no map (the game draws a fresh one) and no Medicine.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { MAP_PATROL } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { createRng } from '../core/rng.ts';
import { sendMapPatrol, takeReport, tripMs, withMap } from '../core/scout.ts';
import { decodeSave, encodeSave } from './save.ts';
import { NOW } from './testing.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** A horde-only camp at Horde 9 with a squad of one and a bench of five, and a map. */
function camp(): GameState {
  const g = newGame('horde');
  return withMap(
    {
      ...g,
      hordeNumber: 9,
      roster: [recruit(1)],
      reserve: [2, 3, 4, 5, 6].map((n) => recruit(n)),
      camp: { ...g.camp, recruits: 6 },
    },
    123,
  );
}

/** `camp()` with a patrol of recruits 2 and 3 out at its first area. */
function out(): GameState {
  const g = camp();
  const r = sendMapPatrol(g, g.map!.areas[0]!.kind, ['recruit-2', 'recruit-3'], 99, NOW);
  if (!r.ok) throw new Error(r.reason);
  return r.game;
}

/** The save of `game`, changed by `change`, read back. */
function reread(game: GameState, change: (g: Loose) => void = () => {}, v?: number) {
  const save = JSON.parse(encodeSave(game, NOW));
  if (v !== undefined) save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: the world map (ID-219)', () => {
  it('round-trips the map, a patrol out and Medicine', () => {
    const g = { ...out(), medicine: 7 };
    expect(reread(g)?.game).toEqual(g);
  });

  it('writes no Medicine at 0, and reads 0 to the cap', () => {
    expect('medicine' in JSON.parse(encodeSave(camp(), NOW)).game).toBe(false);
    expect(reread(camp(), (s) => (s.medicine = 0))?.game.medicine).toBeUndefined();
    expect(reread(camp(), (s) => (s.medicine = MAP_PATROL.medicineMax))?.game.medicine).toBe(
      MAP_PATROL.medicineMax,
    );
  });

  it('an older save loads with no map and no Medicine', () => {
    for (const v of [24, 23]) {
      const r = reread(
        camp(),
        (s) => {
          delete s.map;
          delete s.slots;
          delete s.mode;
          delete s.modes;
        },
        v,
      );
      expect(r).not.toBeNull();
      expect(r!.game.map).toBeUndefined();
      expect(r!.game.medicine).toBeUndefined();
    }
  });

  it('an older save holding a map or Medicine is refused', () => {
    expect(reread(camp(), () => {}, 24)).toBeNull();
    expect(
      reread(
        camp(),
        (s) => {
          delete s.map;
          s.medicine = 3;
        },
        24,
      ),
    ).toBeNull();
  });

  it('a patrol that is out survives a reload and still pays once', () => {
    const g = out();
    const loaded = reread(g)!.game;
    const area = g.map!.areas[0]!.kind;
    const back = NOW + tripMs(g.map!.areas[0]!.danger);
    const a = takeReport(g, area, back);
    const b = takeReport(loaded, area, back);
    expect(a.ok && b.ok && b.report).toEqual(a.ok && a.report);
    if (!b.ok) return;
    expect(reread(b.game)?.game.map!.patrols).toEqual([]);
  });

  it('refuses a map gun (m<no>-<k>) from a patrol still out or never sent', () => {
    const gun = (uid: string) => rollWeapon(createRng(1), uid, 'pistol', 'common', 1);
    expect(reread({ ...out(), armoury: [gun('m1-1')] })).toBeNull();
    expect(reread({ ...camp(), armoury: [gun('m3-1')] })).toBeNull();
    const done = { ...out(), map: { ...out().map!, patrols: [], sent: 1 }, armoury: [gun('m1-1')] };
    expect(reread(done)?.game.armoury.map((w) => w.uid)).toEqual(['m1-1']);
    // A patrol finds at most one gun a member, numbered from 1.
    for (const uid of ['m1-5', 'm1-0', 'm0-1', 'm01-1', 'm1-1-1', 'M1-1']) {
      expect(reread({ ...done, armoury: [gun(uid)] }), uid).toBeNull();
    }
  });
});

describe('save: hostile map payloads (ID-219)', () => {
  const bad: [string, (s: Loose) => void][] = [
    ['an unknown key on the map', (s) => (s.map.extra = 1)],
    ['a missing key', (s) => delete s.map.drawn],
    [
      'a prototype key on the map',
      (s) => (s.map = JSON.parse(`{"__proto__":{"x":1},${JSON.stringify(s.map).slice(1)}`)),
    ],
    [
      'a prototype key on an area',
      (s) => (s.map.areas[0] = JSON.parse('{"kind":"police","danger":"safe","__proto__":{}}')),
    ],
    ['a constructor key on a patrol', (s) => (s.map.patrols[0].constructor = 1)],
    ['an unknown area kind', (s) => (s.map.areas[1].kind = 'casino')],
    ['a look-alike kind', (s) => (s.map.areas[1].kind = 'Police')],
    ['a padded kind', (s) => (s.map.areas[1].kind = ' police')],
    ['an unknown danger', (s) => (s.map.areas[1].danger = 'deadly')],
    ['an area twice', (s) => (s.map.areas[1] = { ...s.map.areas[2] })],
    ['3 areas', (s) => s.map.areas.pop()],
    ['5 areas', (s) => s.map.areas.push({ kind: 'police', danger: 'safe' })],
    ['a non-array of areas', (s) => (s.map.areas = { 0: s.map.areas[0] })],
    [
      'a patrol at an area not on the map',
      (s) => {
        const free = ['police', 'military', 'pharmacy', 'hospital', 'hardware', 'electronics'].find(
          (k) => !s.map.areas.some((a: Loose) => a.kind === k),
        );
        s.map.patrols[0].area = free;
      },
    ],
    [
      'a patrol with the wrong danger',
      (s) => {
        const d = s.map.patrols[0].danger;
        s.map.patrols[0].danger = d === 'safe' ? 'risky' : 'safe';
      },
    ],
    [
      'two patrols at one area',
      (s) => {
        s.map.patrols.push({ ...s.map.patrols[0], no: 2, members: ['recruit-4'] });
        s.map.sent = 2;
      },
    ],
    ['0 members', (s) => (s.map.patrols[0].members = [])],
    [
      '5 members',
      (s) =>
        (s.map.patrols[0].members = [
          'recruit-2',
          'recruit-3',
          'recruit-4',
          'recruit-5',
          'recruit-6',
        ]),
    ],
    ['a member twice', (s) => (s.map.patrols[0].members = ['recruit-2', 'recruit-2'])],
    ['a squad member', (s) => (s.map.patrols[0].members = ['recruit-1'])],
    ['a stranger', (s) => (s.map.patrols[0].members = ['recruit-99'])],
    ['a member id that is no id', (s) => (s.map.patrols[0].members = ['<b>x</b>'])],
    [
      'a member on two patrols',
      (s) => {
        const other = s.map.areas[1];
        s.map.patrols.push({
          ...s.map.patrols[0],
          no: 2,
          area: other.kind,
          danger: other.danger,
          backAt:
            s.map.patrols[0].sentAt +
            ({ safe: 30, risky: 60, dangerous: 120 } as Loose)[other.danger] * 60000,
          members: ['recruit-2'],
        });
        s.map.sent = 2;
      },
    ],
    [
      'a negative time',
      (s) => {
        s.map.patrols[0].sentAt = -60_000;
        s.map.patrols[0].backAt = -60_000 + tripMs(s.map.patrols[0].danger);
      },
    ],
    [
      'a far-future time',
      (s) => {
        s.map.patrols[0].sentAt = 9e15;
        s.map.patrols[0].backAt = 9e15 + tripMs(s.map.patrols[0].danger);
      },
    ],
    ['a time that is no whole number', (s) => (s.map.patrols[0].sentAt += 0.5)],
    ['a time as text', (s) => (s.map.patrols[0].sentAt = String(s.map.patrols[0].sentAt))],
    ['a trip shorter than its danger', (s) => (s.map.patrols[0].backAt -= 1)],
    ['a trip longer than its danger', (s) => (s.map.patrols[0].backAt += 60_000)],
    ['a patrol number past those sent', (s) => (s.map.patrols[0].no = 5)],
    ['a patrol number 0', (s) => (s.map.patrols[0].no = 0)],
    ['a huge draw count', (s) => (s.map.drawn = 1e300)],
    ['a draw count under the areas', (s) => (s.map.drawn = 1)],
    ['a seed past 32 bits', (s) => (s.map.seed = 2 ** 33)],
    ['a negative seed', (s) => (s.map.patrols[0].seed = -1)],
    ['a best horde past those beaten', (s) => (s.map.patrols[0].best = 500)],
    ['a NaN power', (s) => (s.map.patrols[0].power = 'NaN')],
    ['a huge power', (s) => (s.map.patrols[0].power = 1e300)],
    ['a negative power', (s) => (s.map.patrols[0].power = -1)],
    [
      '5 patrols',
      (s) => {
        s.map.patrols = Array.from({ length: 5 }, (_, i) => ({ ...s.map.patrols[0], no: i + 1 }));
      },
    ],
    ['Medicine past the cap', (s) => (s.medicine = MAP_PATROL.medicineMax + 1)],
    ['huge Medicine', (s) => (s.medicine = 1e300)],
    ['negative Medicine', (s) => (s.medicine = -1)],
    ['Medicine as text', (s) => (s.medicine = '5')],
    ['a map that is no object', (s) => (s.map = 'map')],
    ['a map that is null', (s) => (s.map = null)],
  ];
  for (const [what, change] of bad) {
    it(`refuses ${what}`, () => {
      expect(reread(out(), change)).toBeNull();
    });
  }

  it('the good save under each change still loads (the checks are not vacuous)', () => {
    expect(reread(out())).not.toBeNull();
  });

  it('copies no extra keys and keeps no prototype changes', () => {
    const r = reread(out())!.game;
    expect(Object.keys(r.map!).sort()).toEqual(['areas', 'drawn', 'patrols', 'seed', 'sent']);
    expect(Object.keys(r.map!.patrols[0]!).sort()).toEqual(
      ['area', 'backAt', 'best', 'danger', 'members', 'no', 'power', 'seed', 'sentAt'].sort(),
    );
    expect(({} as Loose).x).toBeUndefined();
  });
});
