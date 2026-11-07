// ID-098: farming in the save. The replays won, the bad-luck count and each gun's level
// go through the allow-list and are checked on load: whole numbers in range, a replay's
// drop (`r<k>`) from a replay already won, a gun's level from a horde already beaten,
// and prototype keys, oversized and look-alike values refused. Older saves load with no
// farming and level-1 guns.
import { describe, expect, it } from 'vitest';
import { gunLevel, type OwnedWeapon } from '../core/armoury.ts';
import { FARM } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { finishSquadHorde, startSquadHorde } from '../core/hordeonly.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preFarm } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** Horde-only after 4 first clears and 2 replays of Horde 3. */
function farmed(): GameState {
  let g = newGame('horde');
  for (let i = 0; i < 4; i++) {
    g = finishSquadHorde(g, { ...startSquadHorde(g, 100 + i, NOW), outcome: 'won' });
  }
  for (let i = 0; i < 2; i++) {
    g = finishSquadHorde(g, { ...startSquadHorde(g, 200 + i, NOW, 3), outcome: 'won' });
  }
  return g;
}

function reread(game: GameState, change: (g: Loose) => void = () => {}) {
  const save = JSON.parse(encodeSave(game, NOW));
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

const replayGun = (g: Loose): Loose => g.armoury.find((w: Loose) => w.uid.startsWith('r'));

describe('save: farming (ID-098)', () => {
  it('round-trips the farm, replay drops and gun levels', () => {
    const g = farmed();
    expect(g.farm.replays).toBe(2);
    expect(g.armoury.map((w) => w.uid)).toEqual(['h1', 'h2', 'h3', 'h4', 'r1', 'r2']);
    expect(g.armoury.map(gunLevel)).toEqual([1, 2, 3, 4, 3, 3]);
    expect(reread(g)?.game).toEqual(g);
  });

  it('a v14 save loads with no farming and every gun at level 1', () => {
    const g = farmed();
    const old = { v: 14, savedAt: NOW, game: preFarm({ ...g, armoury: g.armoury.slice(0, 4) }) };
    const save = decodeSave(JSON.stringify(old));
    expect(save?.game.farm).toEqual({ replays: 0, badLuck: 0 });
    expect(save?.game.armoury.map(gunLevel)).toEqual([1, 1, 1, 1]);
    // Its beaten hordes count as beaten: the next new horde is where it was.
    expect(save?.game.hordeNumber).toBe(g.hordeNumber);
    // It saves again as the current version.
    expect(JSON.parse(encodeSave(save!.game, NOW)).v).toBe(SAVE_VERSION);
  });

  it('refuses a v14 save whose gun carries a level', () => {
    const g = farmed();
    const json = preFarm({ ...g, armoury: g.armoury.slice(0, 4) }) as Loose;
    expect(decodeSave(JSON.stringify({ v: 14, savedAt: NOW, game: json }))).not.toBeNull();
    json.armoury[3].level = 2;
    expect(decodeSave(JSON.stringify({ v: 14, savedAt: NOW, game: json }))).toBeNull();
  });

  it('caps replays so the next replay drop still has a valid uid', () => {
    const g = farmed();
    expect(reread(g, (x) => (x.farm.replays = 999_998))).not.toBeNull();
    expect(reread(g, (x) => (x.farm.replays = 999_999))).not.toBeNull();
    expect(reread(g, (x) => (x.farm.replays = 1_000_000))).toBeNull();
    const top = reread(g, (x) => (x.farm.replays = 999_998))!.game;
    const after = finishSquadHorde(top, {
      ...startSquadHorde(top, 7, NOW, 3),
      outcome: 'won',
    });
    expect(after.armoury.some((w) => w.uid === 'r999999')).toBe(true);
    expect(decodeSave(encodeSave(after, NOW))).not.toBeNull();
    // At the cap a replay still pays XP but drops nothing, so the save keeps loading.
    const again = finishSquadHorde(after, {
      ...startSquadHorde(after, 8, NOW, 3),
      outcome: 'won',
    });
    expect(again.farm.replays).toBe(999_999);
    expect(again.armoury).toEqual(after.armoury);
    expect(again.roster[0]!.xp).toBeGreaterThan(after.roster[0]!.xp);
    expect(decodeSave(encodeSave(again, NOW))).not.toBeNull();
  });

  it('refuses a v14 save with a farm, and a v15 save without one', () => {
    const g = farmed();
    const v14 = { v: 14, savedAt: NOW, game: { ...preFarm(g), farm: { replays: 0, badLuck: 0 } } };
    expect(decodeSave(JSON.stringify(v14))).toBeNull();
    expect(reread(g, (x) => delete x.farm)).toBeNull();
  });

  it('refuses hostile farm values', () => {
    const g = farmed();
    const bad: unknown[] = [-1, 1.5, '2', null, true, [], {}, Infinity, 1e300, NaN];
    for (const v of bad) {
      expect(
        reread(g, (x) => (x.farm.replays = v)),
        `replays ${String(v)}`,
      ).toBeNull();
      expect(
        reread(g, (x) => (x.farm.badLuck = v)),
        `badLuck ${String(v)}`,
      ).toBeNull();
    }
    expect(reread(g, (x) => (x.farm.badLuck = FARM.guarantee + 1))).toBeNull();
    expect(reread(g, (x) => (x.farm.badLuck = FARM.guarantee))).not.toBeNull();
    // The allow-list: no extra or prototype keys, nothing but a plain object.
    expect(reread(g, (x) => (x.farm.extra = 1))).toBeNull();
    for (const farm of [null, [], 'farm', 3]) expect(reread(g, (x) => (x.farm = farm))).toBeNull();
    const raw = encodeSave(g, NOW).replace(
      '"farm":{"replays":2,',
      '"farm":{"__proto__":{"polluted":1},"replays":2,',
    );
    expect(raw).toContain('__proto__');
    expect(decodeSave(raw)).toBeNull();
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it('refuses a replay drop from a replay not yet won, or a bad replay uid', () => {
    const g = farmed();
    expect(reread(g, (x) => (x.farm.replays = 1))).toBeNull();
    expect(reread(g, (x) => (x.farm.replays = 9))).not.toBeNull();
    for (const uid of ['r0', 'r01', 'r', 'r-1', 'r1.5', 'R2', 'r2 ', 'r​2', 'r‮2', 'r１']) {
      expect(
        reread(g, (x) => (replayGun(x).uid = uid)),
        JSON.stringify(uid),
      ).toBeNull();
    }
  });

  it('refuses hostile gun levels: whole, 1 to the highest horde beaten', () => {
    const g = farmed();
    // Highest beaten is Horde 4.
    expect(reread(g, (x) => (x.armoury[0].level = 4))).not.toBeNull();
    for (const v of [0, -1, 5, 1.5, '3', null, true, [3], Infinity, 1e300]) {
      expect(
        reread(g, (x) => (x.armoury[0].level = v)),
        `level ${String(v)}`,
      ).toBeNull();
    }
    // A survivor's gun is checked the same way.
    const held: OwnedWeapon = { ...g.armoury[0]!, uid: 'h1' };
    const armed = {
      ...g,
      armoury: g.armoury.slice(1),
      roster: [
        { ...g.roster[0]!, loadout: { primary: held, secondary: null, item: null } },
        ...g.roster.slice(1),
      ],
    };
    expect(reread(armed)).not.toBeNull();
    expect(reread(armed, (x) => (x.roster[0].loadout.primary.level = 99))).toBeNull();
    // And a reserve survivor's.
    const reserved = { ...armed, roster: armed.roster.slice(1), reserve: [armed.roster[0]!] };
    expect(reread(reserved)).not.toBeNull();
    expect(reread(reserved, (x) => (x.reserve[0].loadout.primary.level = 5))).toBeNull();
  });
});
