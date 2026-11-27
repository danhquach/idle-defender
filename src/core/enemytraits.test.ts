// Enemy traits against gun classes in a fight (ID-237, design §9): the class factor on a
// squad gun's bullet, where it sits in the damage order, what it leaves alone, and the
// damage numbers' fit and word.
import { describe, expect, it } from 'vitest';
import { buildTrap, buildTurret, newBase } from './base.ts';
import {
  BOSS_SKILL,
  BRUTE,
  CARD,
  CARD_MAX_LEVEL,
  HORROR,
  TRAP_STRIP,
  STEP,
  TRAIT_WORDS,
  TURRET,
  WEAPONS,
  stockOf,
  type EnemyKind,
  type GunClass,
} from './data.ts';
import { newHorde, shamblerHp, tick, type Bullet, type Enemy, type HordeState } from './horde.ts';
import type { HigherMode } from './data.ts';
import { useSkill } from './skills.ts';
import { enemy, horror, landed, setup } from './testing.ts';

/** A fight in `mode` (none: Normal) with nothing to spawn, nobody shooting. */
function fight(mode?: HigherMode): HordeState {
  const s = newHorde(1, setup());
  s.toSpawn = 0;
  s.defenders = [];
  s.bench = [];
  for (const p of s.posts) p.defenderId = null;
  if (mode) s.mode = mode;
  return s;
}

/** A big, still enemy of `kind` that a bullet shot at it lands on. */
const target = (s: HordeState, kind: EnemyKind, y = 120): Enemy =>
  enemy(s, { kind, hp: 5000, maxHp: 5000, x: 520, y, stunnedUntil: 99 });

/** A squad bullet of `damage` (class `cls`) about to land on `e`. */
function shoot(s: HordeState, e: Enemy, damage: number, extra: Partial<Bullet> = {}): void {
  s.bullets.push({
    x: e.x - 20,
    y: e.y,
    dx: 1,
    dy: 0,
    speed: 1800,
    damage,
    owner: 'a',
    fromX: 420,
    fromY: e.y,
    aim: 100,
    left: 500,
    pierce: 0,
    hit: [],
    tracer: WEAPONS.pistol.tracer,
    ...extra,
  });
}

/** What one bullet takes off `kind` in `mode`. */
function dealt(
  mode: HigherMode | undefined,
  kind: EnemyKind,
  cls: GunClass | undefined,
  damage = 100,
  extra: Partial<Bullet> = {},
): number {
  const s = fight(mode);
  const e = target(s, kind);
  shoot(s, e, damage, { ...(cls ? { cls } : {}), ...extra });
  const t = landed(tick(s, STEP));
  return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
}

describe('the class factor on a bullet (ID-237)', () => {
  it('Nightmare: a resisted class deals 65%, a weak-to one 125%, any other 100%', () => {
    expect(dealt('nightmare', 'runner', 'light')).toBeCloseTo(125, 9);
    expect(dealt('nightmare', 'runner', 'heavy')).toBeCloseTo(65, 9);
    expect(dealt('nightmare', 'runner', 'medium')).toBeCloseTo(100, 9);
    expect(dealt('nightmare', 'screamer', 'spread')).toBeCloseTo(125, 9);
  });

  it('Hell: resisted 50%, weak-to 125%', () => {
    expect(dealt('hell', 'runner', 'heavy')).toBeCloseTo(50, 9);
    expect(dealt('hell', 'runner', 'light')).toBeCloseTo(125, 9);
    expect(dealt('hell', 'swollen', 'spread')).toBeCloseTo(50, 9);
  });

  it('a Shambler has no trait, and Normal ignores a class', () => {
    for (const c of ['light', 'medium', 'heavy', 'spread'] as const) {
      expect(dealt('hell', 'shambler', c), c).toBeCloseTo(100, 9);
      expect(dealt(undefined, 'runner', c), c).toBeCloseTo(100, 9);
    }
  });

  it('a mini-boss or boss takes its own kind’s factor', () => {
    const s = fight('hell');
    const e = target(s, 'brute');
    e.elite = true;
    shoot(s, e, 100, { cls: 'heavy' });
    const t = landed(tick(s, STEP));
    // Weak to Heavy: 125, less the Brute's flat 3.
    expect(5000 - t.enemies.find((x) => x.id === e.id)!.hp).toBeCloseTo(122, 9);
  });
});

describe('where the class factor sits in the damage order (ID-237)', () => {
  it('it comes before the flat armour: a resisted Brute hit is max(1, damage x factor - 3)', () => {
    expect(dealt('hell', 'brute', 'light', 100)).toBeCloseTo(100 * 0.5 - BRUTE.armour, 9);
    expect(dealt('hell', 'brute', 'light', 4)).toBe(BRUTE.min);
    expect(dealt('hell', 'brute', 'heavy', 100)).toBeCloseTo(125 - BRUTE.armour, 9);
  });

  it('plates cut after it, through the real hit: a resisted bullet on a plated Horror is x0.5 x0.5, less the flat cut', () => {
    const s = fight('hell');
    s.bosses = [{ kind: 'horror', skills: ['plates'], wave: 1, hp: 1, elite: false, id: 0 }];
    const e = horror(s, 'plates', { x: 520, y: 120, hp: 5000, maxHp: 5000, stunnedUntil: 99 });
    shoot(s, e, 100, { cls: 'light' });
    const t = landed(tick(s, STEP));
    const lost = 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
    expect(lost).toBeCloseTo(100 * 0.5 * 0.5 - HORROR.armour, 9);
  });

  it('Breaching Rounds gives back half the shield cut only, never the resist', () => {
    const s = fight('hell');
    s.taken = ['breaching-rounds'];
    const e = target(s, 'brute');
    e.shielded = true;
    shoot(s, e, 100, { cls: 'light' });
    const t = landed(tick(s, STEP));
    // 100 x 0.5 (resist) = 50; the Shield's 0.6 with half given back is 0.8 = 40; less the flat 3.
    expect(5000 - t.enemies.find((x) => x.id === e.id)!.hp).toBeCloseTo(
      100 * 0.5 * (1 - (1 - BOSS_SKILL.shield.factor) * (1 - CARD.breach.share)) - BRUTE.armour,
      9,
    );
  });

  it('Cauterise comes last: a scorched resisted Brute takes (damage x factor - 3) x 1.1', () => {
    const s = fight('hell');
    const e = target(s, 'brute');
    e.scorchUntil = 99;
    shoot(s, e, 100, { cls: 'light' });
    const t = landed(tick(s, STEP));
    expect(5000 - t.enemies.find((x) => x.id === e.id)!.hp).toBeCloseTo(
      (100 * 0.5 - BRUTE.armour) * (1 + CARD.cauterise.taken),
      9,
    );
  });

  it('an armour-piercing round (a Sniper’s crit) skips the flat cut but keeps the class factor', () => {
    expect(dealt('hell', 'brute', 'light', 100, { ap: true })).toBeCloseTo(50, 9);
    expect(dealt('hell', 'brute', 'heavy', 100, { ap: true })).toBeCloseTo(125, 9);
  });
});

describe('a Ricochet bounce (ID-237)', () => {
  it('is judged against the bounce target’s own kind, at its own damage', () => {
    const bounce = (kind: EnemyKind): number => {
      const s = fight('hell');
      s.taken = ['ricochet'];
      const first = target(s, 'shambler');
      const other = target(s, kind, 170);
      shoot(s, first, 100, { cls: 'light' });
      const t = landed(tick(s, STEP));
      expect(t.enemies.find((x) => x.id === first.id)!.hp).toBeCloseTo(5000 - 100, 9);
      return 5000 - t.enemies.find((x) => x.id === other.id)!.hp;
    };
    const share = CARD.ricochet.share[CARD_MAX_LEVEL - 1]!;
    // Light is weak to a Runner and resisted by a Brute (less its flat 3); a Shambler is plain.
    expect(bounce('runner')).toBeCloseTo(100 * share * 1.25, 9);
    expect(bounce('brute')).toBeCloseTo(100 * share * 0.5 - BRUTE.armour, 9);
    expect(bounce('shambler')).toBeCloseTo(100 * share, 9);
  });
});

describe('what never carries a class (ID-237)', () => {
  // Each source deals the same in Hell as on Normal, and something: it never goes through a
  // class factor. (Blades are no squad weapon; the Frag Grenade has its own test below.)
  const same = (run: (mode?: HigherMode) => number, name: string): void => {
    const normal = run();
    expect(normal, name).toBeGreaterThan(0);
    expect(run('hell'), name).toBeCloseTo(normal, 9);
  };

  it('a burn tick', () => {
    same((mode) => {
      const s = fight(mode);
      const e = target(s, 'runner');
      e.burnUntil = 99;
      e.burnDps = 30;
      const t = tick(s, 0.5);
      return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
    }, 'burn');
  });

  it('a Frag Grenade', () => {
    same((mode) => {
      const s = fight(mode);
      const e = target(s, 'runner');
      s.grenades.push({
        by: 'a',
        fromX: 420,
        fromY: 120,
        x: e.x,
        y: e.y,
        at: 0,
        lands: 0,
        burst: false,
      });
      const t = tick(s, STEP);
      return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
    }, 'frag');
  });

  it('spikes', () => {
    same((mode) => {
      const r = buildTrap(
        newBase(),
        stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
        'spikes',
        1,
      );
      if (!r.ok) throw new Error(r.code);
      const s = newHorde(1, { ...setup(), base: r.base });
      s.toSpawn = 0;
      s.defenders = [];
      for (const p of s.posts) p.defenderId = null;
      if (mode) s.mode = mode;
      const e = enemy(s, {
        kind: 'runner',
        hp: 5000,
        maxHp: 5000,
        x: TRAP_STRIP.x + TRAP_STRIP.width / 2,
        y: 120,
      });
      const t = tick(s, 10 * STEP);
      return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
    }, 'spikes');
  });

  it('the Airstrike', () => {
    same((mode) => {
      // Nobody on the wall, so only the Airstrike hurts it.
      const s = fight(mode);
      s.skills = ['airstrike'];
      s.cash = 100;
      const e = target(s, 'runner');
      const r = useSkill(s, 'airstrike', e.x, e.y);
      if (!r.ok) throw new Error(r.code);
      let t = r.state;
      for (let i = 0; i < 200 && t.incoming.length > 0; i++) t = tick(t, STEP);
      return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
    }, 'airstrike');
  });

  it('Barbed Wire’s bleed, on a kind that resists Light and one that is weak to it', () => {
    for (const kind of ['brute', 'runner'] as const) {
      let expected = 0;
      same((mode) => {
        const s = fight(mode);
        s.taken = ['barbed-wire'];
        // In the band: the wall's front (520) plus 300 px, in the first row.
        const e = target(s, kind);
        e.x = 520 + 300;
        const t = tick(s, STEP);
        expected = shamblerHp(s) * STEP * CARD.wire.bleed[CARD_MAX_LEVEL - 1]!;
        return 5000 - t.enemies.find((x) => x.id === e.id)!.hp;
      }, `wire ${kind}`);
      // And it is the formula's: this wave's Shambler HP, no class factor.
      const s = fight('hell');
      s.taken = ['barbed-wire'];
      const e = target(s, kind);
      e.x = 520 + 300;
      expect(5000 - tick(s, STEP).enemies.find((x) => x.id === e.id)!.hp, kind).toBeCloseTo(
        expected,
        9,
      );
    }
  });

  // A blade is never fired by the squad (its primary is a gun), so it has no path to test.
});

describe('what carries a class (ID-237)', () => {
  /** The first bullet a rifle (Medium) defender fires in a fight of `mode`. */
  function fired(mode?: HigherMode, noTraits = false): Bullet {
    const s = newHorde(1, {
      ...setup(),
      roster: [{ id: 'a', name: 'A', loadout: { primary: 'pistol', secondary: null, item: null } }],
    });
    s.toSpawn = 0;
    if (mode) s.mode = mode;
    if (noTraits) s.noTraits = true;
    enemy(s, { hp: 5000, maxHp: 5000, x: 700, y: 360, stunnedUntil: 9 });
    return tick(s, STEP).bullets[0]!;
  }

  it('a squad gun’s bullet has its gun’s class in a higher mode', () => {
    expect(fired('nightmare').cls).toBe('light');
    expect(fired('hell').cls).toBe('light');
  });

  it('on Normal the bullet has no class key at all, and with the test switch off none either', () => {
    expect('cls' in fired()).toBe(false);
    expect('cls' in fired('hell', true)).toBe(false);
  });

  it('a turret’s bullet never has one, and a turret deals its damage whatever the kind', () => {
    let base = newBase();
    const r = buildTurret(
      base,
      stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 }),
      true,
      'tower',
      0,
      5,
    );
    if (!r.ok) throw new Error(r.code);
    base = r.base;
    const s = newHorde(1, { ...setup(), base });
    s.toSpawn = 0;
    s.defenders = [];
    for (const p of s.posts) p.defenderId = null;
    s.mode = 'hell';
    const e = enemy(s, { kind: 'runner', x: 600, y: 440, hp: 100, maxHp: 100 });
    const t = tick(s, STEP);
    const shot = t.bullets.find((b) => b.owner.startsWith('turret:'))!;
    expect('cls' in shot).toBe(false);
    expect(landed(t).enemies.find((x) => x.id === e.id)!.hp).toBe(100 - TURRET.damage);
  });
});

describe('damage numbers on a trait (ID-237)', () => {
  /** Hits `n` different enemies of `kind` once each with a `cls` bullet, one step apart; returns the pops. */
  function hits(cls: GunClass, kind: EnemyKind, n: number, wave = 1) {
    const s = fight('hell');
    s.wave = wave;
    for (let k = 0; k < n; k++) {
      const e = target(s, kind, 60 + 40 * k);
      shoot(s, e, 10, { cls });
    }
    return landed(tick(s, STEP)).pops;
  }

  it('a number carries its fit; no fit, no key', () => {
    expect(hits('heavy', 'runner', 1)[0]!.fit).toBe('resist');
    expect(hits('light', 'runner', 1)[0]!.fit).toBe('weak');
    expect('fit' in hits('medium', 'runner', 1)[0]!).toBe(false);
  });

  it('the first few of each fit carry a word, then none, whatever the wave', () => {
    const pops = hits('heavy', 'runner', TRAIT_WORDS + 2, 3);
    expect(pops.filter((p) => p.word)).toHaveLength(TRAIT_WORDS);
    expect(pops.slice(0, TRAIT_WORDS).every((p) => p.word)).toBe(true);
    expect(pops.slice(TRAIT_WORDS).some((p) => p.word)).toBe(false);
  });

  it('a hit merged into a number on the same enemy does not use up a word', () => {
    const s = fight('hell');
    const e = target(s, 'runner', 60);
    for (let k = 0; k < 4; k++) shoot(s, e, 10, { cls: 'heavy', x: e.x - 20 - 30 * k });
    for (let k = 0; k < TRAIT_WORDS; k++)
      shoot(s, target(s, 'runner', 100 + 40 * k), 10, { cls: 'heavy' });
    const pops = landed(tick(s, STEP)).pops;
    // One number for the four merged hits, then one each: the first TRAIT_WORDS numbers get the words.
    expect(pops).toHaveLength(1 + TRAIT_WORDS);
    expect(pops.filter((p) => p.word)).toHaveLength(TRAIT_WORDS);
    expect(pops[TRAIT_WORDS]!.word).toBeUndefined();
  });

  it('weak and resist count apart', () => {
    const s = fight('hell');
    for (let k = 0; k < TRAIT_WORDS + 1; k++) {
      shoot(s, target(s, 'runner', 40 + 40 * k), 10, { cls: 'heavy' });
    }
    shoot(s, target(s, 'runner', 300), 10, { cls: 'light' });
    const pops = landed(tick(s, STEP)).pops;
    expect(pops.filter((p) => p.fit === 'resist' && p.word)).toHaveLength(TRAIT_WORDS);
    expect(pops.filter((p) => p.fit === 'weak' && p.word)).toHaveLength(1);
  });

  it('hits on one enemy merge only when they share a fit', () => {
    const s = fight('hell');
    const e = target(s, 'runner');
    shoot(s, e, 10, { cls: 'heavy' });
    shoot(s, e, 10, { cls: 'light', x: e.x - 60 });
    shoot(s, e, 10, { x: e.x - 100 });
    const pops = landed(tick(s, STEP)).pops.filter((p) => p.key === `e${e.id}`);
    expect(pops.map((p) => p.fit ?? null).sort()).toEqual([null, 'resist', 'weak']);
  });

  it('on Normal no pop has a fit or a word, even for a bullet with a class', () => {
    const s = fight();
    shoot(s, target(s, 'runner'), 10, { cls: 'heavy' });
    const pops = landed(tick(s, STEP)).pops;
    expect(pops).toHaveLength(1);
    expect('fit' in pops[0]!).toBe(false);
    expect('word' in pops[0]!).toBe(false);
  });
});
