// ID-237: in Nightmare and Hell the squad tools (Best gun, Best squad, Auto) and the Fit pill
// work on the squad's effective power, the gun classes against the horde's enemy traits.
import { describe, expect, it } from 'vitest';
import { rollWeapon, type Held } from './armoury.ts';
import { recruit } from './camp.ts';
import { type GunBase, type GunClass } from './data.ts';
import { newGame, type GameState, type RosterDefender } from './game.ts';
import {
  bestGuns,
  bestSquad,
  autoSquad,
  fitFor,
  squadOf,
  squadSpec,
  survivorPower,
} from './hordeonly.ts';
import { setMode } from './modes.ts';
import { createRng } from './rng.ts';
import { squadFit } from './squadpower.ts';
import { classOf, effectivePower } from './traits.ts';

const gun = (base: GunBase, level: number, uid: string): Held =>
  rollWeapon(createRng(7), uid, base, 'military', level);

const person = (no: number, primary: Held): RosterDefender => ({
  ...recruit(no),
  xp: 5000,
  loadout: { primary, secondary: null, item: null },
});

/** A Hell game (Nightmare done) with `squad` and `bench`, `stash` in the stash. */
function hell(
  squad: RosterDefender[],
  bench: RosterDefender[] = [],
  stash: Held[] = [],
): GameState {
  const g = newGame('horde');
  return {
    ...g,
    mode: 'hell',
    modes: { nightmare: 51, hell: 1 },
    hordeNumber: 60,
    roster: squad,
    reserve: bench,
    armoury: stash.filter((h) => typeof h === 'object'),
    slots: { squad: 0, stash: 20 },
    camp: { ...g.camp, recruits: squad.length + bench.length },
  };
}

/** The effective power of `game`'s squad against its mode's next horde. */
function effective(game: GameState): number {
  const ctx = fitFor(game)!;
  return effectivePower(
    ctx,
    squadOf(game).map((d) => ({
      power: survivorPower(d),
      cls: classOf(squadSpec(d).loadout.primary),
    })),
  );
}

/** A gun level at which `base`'s survivor power is the nearest to `power`. */
function levelFor(base: GunBase, power: number): number {
  let best = 1;
  let off = Infinity;
  for (let level = 1; level <= 400; level++) {
    const o = Math.abs(survivorPower(person(1, gun(base, level, 'x'))) - power);
    if (o < off) [best, off] = [level, o];
  }
  return best;
}

const CLASS_BASE: Record<GunClass, GunBase> = {
  light: 'lmg',
  medium: 'rifle',
  heavy: 'sniper',
  spread: 'shotgun',
};

describe('Best gun in a higher mode (ID-237)', () => {
  // Four guns of each class at the same survivor power, for four survivors on pistols.
  const lvl = Object.fromEntries(
    (Object.keys(CLASS_BASE) as GunClass[]).map((c) => [
      c,
      levelFor(CLASS_BASE[c], survivorPower(person(1, gun('lmg', 40, 'x')))),
    ]),
  ) as Record<GunClass, number>;
  const stash = (Object.keys(CLASS_BASE) as GunClass[]).flatMap((c) =>
    [0, 1, 2, 3].map((i) => gun(CLASS_BASE[c], lvl[c], `${c}${i}`)),
  );
  const squad = [1, 2, 3, 4].map((n) => person(n, 'pistol'));

  it('hands the squad guns whose effective power is at least any one class’s', () => {
    const g = hell(squad, [], stash);
    const r = bestGuns(g);
    const got = effective(r.game);
    for (const c of Object.keys(CLASS_BASE) as GunClass[]) {
      const same = hell(
        squad.map((d, i) => ({
          ...d,
          loadout: { ...d.loadout, primary: gun(CLASS_BASE[c], lvl[c], `${c}${i}`) },
        })),
      );
      expect(got, c).toBeGreaterThanOrEqual(effective(same) - 1e-6);
    }
    // And it mixes classes: not four of one.
    const classes = new Set(squadOf(r.game).map((d) => classOf(squadSpec(d).loadout.primary)));
    expect(classes.size).toBeGreaterThan(1);
  });

  it('a second call moves nothing', () => {
    const once = bestGuns(hell(squad, [], stash));
    expect(bestGuns(once.game).moves).toEqual([]);
  });

  it('on Normal the same stash is handed out by dmg/s alone, whatever horde is asked about', () => {
    const normal = { ...hell(squad, [], stash), mode: undefined, modes: undefined } as GameState;
    delete (normal as { mode?: unknown }).mode;
    delete (normal as { modes?: unknown }).modes;
    expect(bestGuns(normal, 5)).toEqual(bestGuns(normal));
  });
});

describe('Best squad in a higher mode (ID-237)', () => {
  // Six Light survivors a little stronger than two Heavy ones: by Squad Power alone the six
  // Light are the squad; against Hell's traits a Heavy gun is worth a place.
  const lightLevel = 60;
  const lightPower = survivorPower(person(1, gun('lmg', lightLevel, 'x')));
  // ID-247: 0.8, not 0.9: Squad Power now counts the Sniper at 0.85 and the LMG at 0.74, so the
  // Heavy pair needs a wider gap to stay the weaker by Squad Power alone.
  const heavyLevel = levelFor('sniper', lightPower * 0.8);
  const light = [1, 2, 3, 4, 5, 6].map((n) => person(n, gun('lmg', lightLevel, `l${n}`)));
  const heavy = [7, 8].map((n) => person(n, gun('sniper', heavyLevel, `s${n}`)));
  const classesOf = (g: GameState): (GunClass | null)[] =>
    squadOf(g).map((d) => classOf(squadSpec(d).loadout.primary));

  it('Normal keeps ranking by Squad Power alone', () => {
    const g = hell(light, heavy);
    delete (g as { mode?: unknown }).mode;
    const picked = bestSquad(g).game;
    expect(classesOf(picked).every((c) => c === 'light')).toBe(true);
  });

  it('Hell brings a Heavy survivor in, and the squad fits better than six Light', () => {
    const g = hell(light, heavy);
    const r = bestSquad(g);
    expect(classesOf(r.game)).toContain('heavy');
    expect(effective(r.game)).toBeGreaterThan(effective(g));
  });

  it('a second call moves nobody', () => {
    const once = bestSquad(hell(light, heavy));
    const again = bestSquad(once.game);
    expect(again.moves).toEqual({ in: [], out: [] });
    expect(again.game).toBe(once.game);
  });

  it('the picked horde decides: a Fit is told for it, and nobody is moved on a mode with no traits', () => {
    expect(squadFit(hell(light, heavy), 1)).not.toBeNull();
    const normal = hell(light, heavy);
    delete (normal as { mode?: unknown }).mode;
    expect(squadFit(normal)).toBeNull();
  });

  it('a mode switch with Auto on re-fits the squad; with Auto off nobody moves', () => {
    const normal = hell(light, heavy);
    delete (normal as { mode?: unknown }).mode;
    const on = autoSquad(setMode({ ...normal, autoSquad: true }, 'hell'));
    expect(classesOf(on)).toContain('heavy');
    const off = setMode(normal, 'hell');
    expect(autoSquad(off)).toBe(off);
    expect(classesOf(off).every((c) => c === 'light')).toBe(true);
  });
});

describe('what the tools count (ID-237)', () => {
  it('a survivor with no gun primary counts as the free pistol, Light', () => {
    const knife = rollWeapon(createRng(1), 'k', 'knife', 'military', 1);
    const odd = hell([person(1, knife)]);
    const pistol = hell([person(1, 'pistol')]);
    expect(squadFit(odd)).toEqual(squadFit(pistol));
  });

  it('a sidearm in the secondary slot does not change the class counted', () => {
    const sniper = gun('sniper', 30, 's');
    const plain = hell([{ ...person(1, sniper) }]);
    const withSide = hell([
      { ...person(1, sniper), loadout: { primary: sniper, secondary: 'pistol', item: null } },
    ]);
    expect(squadFit(withSide)).toEqual(squadFit(plain));
  });
});
