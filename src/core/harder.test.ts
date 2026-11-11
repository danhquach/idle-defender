// ID-099: harder hordes in the horde-only build. Late HP growth, swarm waves, boss skills
// (Roar, Slab throw, Armour plates, a growing Brood), several bosses and mini-bosses.
import { describe, expect, it } from 'vitest';
import {
  BOSS_SKILL,
  CARD,
  BOSSES,
  ELITE,
  ENEMIES,
  HORROR,
  SPAWN_INTERVAL,
  SQUAD_HP_GROWTH,
  STEP,
  SWARM,
  WALL,
  type BossSkill,
} from './data.ts';
import { hordeBossReward, hordeGenes, newGame } from './game.ts';
import {
  bossHorde,
  hitDamage,
  newHorde,
  plated,
  radiusOf,
  roared,
  tick,
  windingUp,
  type HordeState,
} from './horde.ts';
import { squadHpScale, startSquadHorde } from './hordeonly.ts';
import { hordeHp, recommendedPower } from './squadpower.ts';
import { enemy, horror, setup } from './testing.ts';
import { enemyHp, hordeBosses, kindFor, swarmWave, waveCount, waveMix, waveSize } from './waves.ts';

/** `s` ticked for `seconds`. */
function run(s: HordeState, seconds: number): HordeState {
  let t = s;
  for (let i = 0; i < Math.round(seconds / STEP); i++) t = tick(t, STEP);
  return t;
}
/** Horde 1 with nothing left to spawn, under the harder rules; its defender never fires. */
function quiet(): HordeState {
  const s = newHorde(1, { ...setup(), harder: true });
  s.toSpawn = 0;
  s.defenders[0]!.nextShotAt = 1e9;
  return s;
}
const one = (s: HordeState, id: number) => s.enemies.find((e) => e.id === id)!;
/** Horde `n` under the harder rules, at the start of wave `wave`, nothing on the field. */
function atWave(n: number, wave: number, seed = 1): HordeState {
  const s = newHorde(seed, { ...setup(), hordeNumber: n, harder: true });
  s.defenders[0]!.nextShotAt = 1e9;
  Object.assign(s.defenders[0]!, { hp: 1e9, maxHp: 1e9 });
  s.wave = wave;
  s.swarm = swarmWave(n, wave);
  s.toSpawn = waveSize(n, wave, true) * (s.swarm ? SWARM.size : 1);
  return s;
}

describe('late HP growth (ID-099)', () => {
  it('is one knob, steeper than the old ×1.03, past the squad cap', () => {
    expect(SQUAD_HP_GROWTH.late).toBeGreaterThan(1.03);
    // From Horde 11 (Hordes 8–10 are eased, ID-102).
    expect(squadHpScale(12) / squadHpScale(11)).toBeCloseTo(SQUAD_HP_GROWTH.late, 9);
    expect(squadHpScale(30) / squadHpScale(29)).toBeCloseTo(SQUAD_HP_GROWTH.late, 9);
  });

  it('makes Recommended Power rise every horde, Horde 1 to 60, a boss horde a spike (ID-102)', () => {
    for (let n = 2; n <= 60; n++) {
      // Past a boss horde, the next may ask for less than it, but more than the one before.
      const before = (n - 1) % HORROR.every === 0 ? n - 2 : n - 1;
      expect(recommendedPower(n), `Horde ${n}`).toBeGreaterThan(recommendedPower(before));
    }
  });
});

describe('swarm waves (ID-099)', () => {
  const swarms = (n: number) =>
    Array.from({ length: waveCount(n) }, (_, i) => i + 1).filter((w) => swarmWave(n, w));

  it('none before Horde 5, then one wave in four, more in later hordes, at most half', () => {
    for (let n = 1; n < SWARM.from; n++) expect(swarms(n), `Horde ${n}`).toEqual([]);
    // Spread back from the last wave, which always swarms (ID-102).
    expect(swarms(5)).toEqual([7]);
    expect(swarms(9)).toEqual([4, 9]);
    expect(swarms(10)).toEqual([4, 9]);
    expect(swarms(13)).toEqual([3, 7, 10]);
    expect(swarms(14)).toEqual([3, 7, 10]);
    expect(swarms(15).length).toBe(3);
    expect(swarms(40).length).toBe(5);
    for (let n = 5; n <= 60; n++) {
      expect(swarms(n).length).toBeGreaterThanOrEqual(swarms(n - 1).length > 0 ? 1 : 0);
      expect(swarms(n).length).toBeLessThanOrEqual(waveCount(n) * SWARM.cap);
      expect(swarms(n)).not.toContain(1);
      expect(swarms(n)).toContain(waveCount(n));
    }
  });

  it('a swarm mix has Runners at double their share, Shamblers taking the difference', () => {
    const plain = new Map(waveMix(8));
    const swarm = new Map(waveMix(8, true));
    expect(swarm.get('runner')).toBeCloseTo(plain.get('runner')! * SWARM.runners, 9);
    expect([...swarm.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(swarm.get('brute')).toBe(plain.get('brute'));
    expect(swarm.get('shambler')).toBeCloseTo(plain.get('shambler')! - plain.get('runner')!, 9);
    expect(kindFor(8, 0.999, true)).toBe(kindFor(8, 0.999));
  });

  it('spawns twice the enemies over the same time, from the seeded RNG', () => {
    // Horde 9: wave 4 swarms, wave 3 doesn't (its mini-boss comes in wave 5).
    const s = atWave(9, 4);
    expect(s.swarm).toBe(true);
    expect(s.toSpawn).toBe(2 * waveSize(9, 4));
    const t = run(s, SPAWN_INTERVAL * 10 - STEP / 2);
    expect(t.enemies.length).toBe(20);
    // The calm wave before spawns half as fast.
    expect(run(atWave(9, 3), SPAWN_INTERVAL * 10 - STEP / 2).enemies.length).toBe(10);
    expect(run(atWave(9, 4, 3), 20)).toEqual(run(atWave(9, 4, 3), 20));
  });

  it('starts with the wave: the wave before a swarm sets it, the full game never has one', () => {
    // Horde 6: its last wave, 7, swarms (Horde 5's mini-boss would hold wave 4 open).
    let s = atWave(6, 6);
    s.toSpawn = 0;
    s = tick(s, STEP);
    expect(s.wave).toBe(7);
    expect(s.swarm).toBe(true);
    expect(s.toSpawn).toBe(2 * waveSize(6, 7));
    const full = newHorde(1, { ...setup(), hordeNumber: 6 });
    full.wave = 6;
    full.toSpawn = 0;
    const next = tick(full, STEP);
    expect(next.swarm).toBe(false);
    expect(next.toSpawn).toBe(waveSize(6, 7));
  });

  it('a Runner-heavy swarm spawns more Runners than a calm wave of the same horde', () => {
    const runners = (swarm: boolean) => {
      // The same seed and wave, 80 spawns: well before any reach the wall.
      const s = atWave(9, 8);
      s.swarm = swarm;
      s.toSpawn = 80;
      const gap = swarm ? SPAWN_INTERVAL / SWARM.size : SPAWN_INTERVAL;
      const t = run(s, 80 * gap);
      expect(t.toSpawn).toBe(0);
      return t.enemies.filter((e) => e.kind === 'runner').length;
    };
    expect(runners(true)).toBeGreaterThan(runners(false) * 1.5);
  });
});

describe('bosses and mini-bosses, fixed by horde number (ID-099)', () => {
  it('Horde 10 has 1 boss, 20 has 2, 30 has 3, each with two skills no other shares', () => {
    for (const [n, count] of [
      [10, 1],
      [20, 2],
      [30, 3],
      [40, BOSSES.max],
      [70, BOSSES.max],
    ] as const) {
      const bosses = hordeBosses(n, true);
      expect(bosses.length, `Horde ${n}`).toBe(count);
      const skills = bosses.flatMap((b) => b.skills);
      expect(new Set(skills).size, `Horde ${n}`).toBe(skills.length);
      for (const b of bosses) {
        expect(b).toMatchObject({
          kind: 'horror',
          wave: waveCount(n),
          hp: BOSSES.hp,
          elite: false,
        });
        expect(b.skills).toHaveLength(2);
      }
      expect(hordeBosses(n, true)).toEqual(bosses);
    }
    expect(hordeBosses(10, true)[0]!.skills).toEqual(['brood', 'roar']);
    // Every new skill shows up within the first boss hordes.
    const seen = new Set(
      [10, 20, 30].flatMap((n) => hordeBosses(n, true).flatMap((b) => b.skills)),
    );
    for (const k of ['roar', 'slab', 'plates', 'brood', 'charge', 'regen'] as BossSkill[]) {
      expect(seen.has(k), k).toBe(true);
    }
  });

  it('a mini-boss on every odd horde from Horde 5: an elite Brute or Swollen with one skill', () => {
    for (let n = 1; n < ELITE.from; n++) expect(hordeBosses(n, true), `Horde ${n}`).toEqual([]);
    for (const n of [6, 8, 12, 14]) expect(hordeBosses(n, true), `Horde ${n}`).toEqual([]);
    expect(hordeBosses(5, true)).toEqual([
      {
        kind: 'brute',
        skills: ['roar'],
        wave: Math.ceil(waveCount(5) / 2),
        hp: ELITE.hp,
        elite: true,
      },
    ]);
    expect(hordeBosses(7, true)[0]).toMatchObject({ kind: 'swollen', skills: ['plates'] });
    for (let n = 5; n <= 49; n += 2) {
      const [b] = hordeBosses(n, true);
      expect(b?.elite, `Horde ${n}`).toBe(true);
      expect(ELITE.kinds).toContain(b!.kind);
      expect(b!.skills).toHaveLength(1);
    }
  });

  it('the full game keeps one Horror with one ability, and no mini-bosses', () => {
    expect(hordeBosses(10, false)).toEqual([
      { kind: 'horror', skills: ['brood'], wave: waveCount(10), hp: 1, elite: false },
    ]);
    expect(hordeBosses(20, false)).toHaveLength(1);
    expect(hordeBosses(5, false)).toEqual([]);
  });

  it('Horde 20’s two bosses come with its last wave at their HP; it is won once both are dead', () => {
    const s = atWave(20, waveCount(20));
    s.toSpawn = 0;
    let t = tick(s, STEP);
    const bosses = t.enemies.filter((e) => e.horror);
    expect(bosses).toHaveLength(2);
    expect(bosses.map((e) => e.horror!.skills)).toEqual(hordeBosses(20, true).map((b) => b.skills));
    for (const e of bosses) {
      expect(e.maxHp).toBe(Math.round(enemyHp('horror', 20, waveCount(20)) * BOSSES.hp));
    }
    expect(t.bosses.map((b) => b.id)).toEqual(bosses.map((e) => e.id));
    one(t, bosses[0]!.id).hp = 0;
    t = tick(t, STEP);
    expect(t.outcome).toBe('fighting');
    // No card offer in the way: just the bosses.
    Object.assign(t, { enemies: [], offer: null, xp: 0 });
    expect(tick(t, STEP).outcome).toBe('won');
  });

  it('a mini-boss comes with its wave’s first spawn, bigger; that wave waits for it', () => {
    const wave = Math.ceil(waveCount(5) / 2);
    const s = atWave(5, wave);
    const t = tick(s, STEP);
    const elite = t.enemies.find((e) => e.elite)!;
    expect(elite.kind).toBe('brute');
    expect(elite.maxHp).toBe(Math.round(enemyHp('brute', 5, wave) * ELITE.hp));
    expect(radiusOf(elite)).toBeCloseTo(ENEMIES.brute.radius * ELITE.size, 9);
    expect(elite.horror?.skills).toEqual(['roar']);
    // An elite Swollen's body isn't a whole number of px: it still spawns in the field.
    const w7 = Math.ceil(waveCount(7) / 2);
    const swollen = tick(atWave(7, w7), STEP).enemies.find((e) => e.elite)!;
    expect(swollen.kind).toBe('swollen');
    expect(swollen.y).toBeGreaterThanOrEqual(radiusOf(swollen));
    // A wave ending before its mini-boss came holds on for it.
    const held = atWave(5, wave);
    held.toSpawn = 0;
    held.breakUntil = 5;
    expect(tick(held, STEP).wave).toBe(wave);
  });

  it('a replay meets the same bosses: the horde-only start brings them', () => {
    const g = { ...newGame('horde'), hordeNumber: 31 };
    expect(startSquadHorde(g, 1, 0, 30).bosses.map((b) => b.skills)).toEqual(
      hordeBosses(30, true).map((b) => b.skills),
    );
    expect(startSquadHorde(g, 2, 0, 30).bosses).toEqual(startSquadHorde(g, 1, 0, 30).bosses);
    expect(startSquadHorde(g, 1, 0, 30).harder).toBe(true);
  });

  it('Recommended Power counts the swarms and bosses', () => {
    let calm = 0;
    const scale = squadHpScale(20);
    for (let w = 1; w <= waveCount(20); w++) {
      const mean = waveMix(20).reduce(
        (sum, [k, share]) => sum + share * enemyHp(k, 20, w, scale),
        0,
      );
      calm += waveSize(20, w, true) * mean;
    }
    expect(hordeHp(20)).toBeGreaterThan(calm + 2 * BOSSES.hp * enemyHp('horror', 20, 10, scale));
  });
});

describe('boss skills (ID-099)', () => {
  it('each timed skill winds up for BOSS_SKILL.windUp s first; a stun hides it', () => {
    const s = quiet();
    const h = horror(s, ['roar', 'regen'], {}, { nextAt: 2 });
    expect(windingUp(s, h)).toBeNull();
    const t = run(s, 2 - BOSS_SKILL.windUp + 0.1);
    expect(windingUp(t, one(t, h.id))).toBe('roar');
    one(t, h.id).stunnedUntil = t.time + 1;
    expect(windingUp(t, one(t, h.id))).toBeNull();
  });

  it(`Roar: others within ${BOSS_SKILL.roar.radius} px move ${BOSS_SKILL.roar.speed * 100}% faster for ${BOSS_SKILL.roar.time} s`, () => {
    const s = quiet();
    const h = horror(s, 'roar', { x: 1400, y: 400 });
    const near = enemy(s, { x: 1400, y: 400 + BOSS_SKILL.roar.radius - 20, hp: 1e6, maxHp: 1e6 });
    const far = enemy(s, { x: 1400, y: 400 - BOSS_SKILL.roar.radius - 40, hp: 1e6, maxHp: 1e6 });
    let t = run(s, 1 + STEP);
    expect(roared(t, one(t, near.id))).toBe(true);
    expect(roared(t, one(t, far.id))).toBe(false);
    expect(roared(t, one(t, h.id))).toBe(false);
    const x0 = one(t, near.id).x;
    const f0 = one(t, far.id).x;
    t = run(t, 1);
    const speed = ENEMIES.shambler.speed;
    expect(x0 - one(t, near.id).x).toBeCloseTo(speed * (1 + BOSS_SKILL.roar.speed), 0);
    expect(f0 - one(t, far.id).x).toBeCloseTo(speed, 0);
    t = run(t, BOSS_SKILL.roar.time);
    expect(roared(t, one(t, near.id))).toBe(false);
    expect(one(t, h.id).horror!.next.roar).toBeCloseTo(1 + BOSS_SKILL.roar.every, 5);
  });

  it('Slab throw: from range, heavy damage to the nearest standing wall segment when it lands', () => {
    const s = quiet();
    const layer = s.layers[0]!;
    const row = 4;
    const hp = layer.segments[row]!.hp;
    horror(s, 'slab', { x: 1400, y: (row + 0.5) * 80 });
    let t = run(s, 1 + STEP);
    expect(t.slabs).toHaveLength(1);
    expect(t.slabs[0]).toMatchObject({ row, column: layer.column, x: layer.x + WALL.depth });
    expect(t.layers[0]!.segments[row]!.hp).toBe(hp);
    t = run(t, BOSS_SKILL.slab.flight);
    expect(t.layers[0]!.segments[row]!.hp).toBe(Math.max(0, hp - BOSS_SKILL.slab.damage));
    t = run(t, BOSS_SKILL.slab.flight + STEP);
    expect(t.slabs).toEqual([]);
  });

  it('Slab throw: with Barbed Wire, it breaks the working wire row nearest it instead', () => {
    const s = quiet();
    s.taken.push('barbed-wire');
    s.cardLevels['barbed-wire'] = 1;
    s.wire[4]!.durability = 0;
    const hp = s.layers[0]!.segments[4]!.hp;
    horror(s, 'slab', { x: 1400, y: 4.5 * 80 });
    const t = run(s, 1 + BOSS_SKILL.slab.flight + 2 * STEP);
    // Row 4 is already broken; 3 and 5 are as near, the upper one goes.
    expect(t.wire[3]!.durability).toBe(0);
    expect(t.wire[5]!.durability).toBeGreaterThan(0);
    expect(t.layers[0]!.segments[4]!.hp).toBe(hp);
  });

  it('Slab throw: the wire row it breaks comes back at the next wave break (ID-123)', () => {
    const s = quiet();
    s.taken.push('barbed-wire');
    s.cardLevels['barbed-wire'] = 1;
    const h = horror(s, 'slab', { x: 1400, y: 4.5 * 80 });
    let t = run(s, 1 + BOSS_SKILL.slab.flight + 2 * STEP);
    expect(t.wire[4]!.durability).toBe(0);
    const wave = t.wave;
    // The boss and its wave gone: the next step starts the break, which rebuilds the row.
    t.enemies = t.enemies.filter((e) => e.id !== h.id);
    expect(t.enemies).toEqual([]);
    t = tick(t, STEP);
    expect(t.wave).toBe(wave + 1);
    expect(t.wire[4]!.durability).toBe(t.wire[4]!.max);
    expect(t.wire[4]!.max).toBeGreaterThanOrEqual(CARD.wire.durability[0]);
  });

  it('Slab throw: never from up close', () => {
    const s = quiet();
    const front = s.layers[0]!.x + WALL.depth;
    horror(s, 'slab', { x: front + BOSS_SKILL.slab.range - 30 });
    expect(run(s, 1 + STEP).slabs).toEqual([]);
  });

  it('Armour plates halve bullets until a quarter of its HP is gone, for good; sniper rounds go through (and its armour, ID-101)', () => {
    const s = quiet();
    const h = horror(s, ['plates', 'regen'], { hp: 1000, maxHp: 1000 });
    expect(plated(h)).toBe(true);
    expect(hitDamage(h, 40)).toBe(40 * BOSS_SKILL.plates.factor - HORROR.armour);
    // ID-101: a Sniper rifle's round ignores the Horror's own armour too.
    expect(hitDamage(h, 40, true)).toBe(40);
    one(s, h.id).hp = 740;
    let t = tick(s, STEP);
    expect(plated(one(t, h.id))).toBe(false);
    expect(hitDamage(one(t, h.id), 40)).toBe(40 - HORROR.armour);
    t = run(t, 15);
    expect(one(t, h.id).hp).toBeGreaterThan(900);
    expect(plated(one(t, h.id))).toBe(false);
  });

  it('a Sniper rifle’s bullets carry armour-piercing; other guns don’t', () => {
    const shoot = (gun: 'sniper' | 'rifle') => {
      const s = newHorde(1, {
        ...setup(),
        roster: [
          {
            id: 'a',
            name: 'A',
            loadout: {
              primary: { uid: 'g', base: gun, rarity: 'common', affixes: [] },
              secondary: null,
              item: null,
            },
          },
        ],
      });
      s.toSpawn = 0;
      enemy(s, { x: 700, hp: 1e6, maxHp: 1e6 });
      let t = s;
      for (let i = 0; i < 300 && t.bullets.length === 0; i++) t = tick(t, STEP);
      return t.bullets[0]!;
    };
    expect(shoot('sniper').ap).toBe(true);
    expect(shoot('rifle').ap).toBeUndefined();
  });

  it('Brood grows by one Shambler with each brood in the harder hordes', () => {
    const s = quiet();
    horror(s, 'brood');
    let t = run(s, 1 + STEP);
    expect(t.enemies.filter((e) => e.kind === 'shambler')).toHaveLength(HORROR.brood.count);
    t = run(t, HORROR.brood.every);
    expect(t.enemies.filter((e) => e.kind === 'shambler')).toHaveLength(
      2 * HORROR.brood.count + BOSS_SKILL.broodGrow,
    );
  });

  it('a slab that lands after its segment fell hits the nearest standing one; a broken wire row stays broken', () => {
    const s = quiet();
    const layer = s.layers[0]!;
    horror(s, 'slab', { x: 1400, y: 4.5 * 80 });
    let t = run(s, 1 + STEP);
    expect(t.slabs[0]!.row).toBe(4);
    t.layers[0]!.segments[4]!.hp = 0;
    const above = t.layers[0]!.segments[3]!.hp;
    t = run(t, BOSS_SKILL.slab.flight);
    expect(t.layers[0]!.segments[3]!.hp).toBe(Math.max(0, above - BOSS_SKILL.slab.damage));
    expect(t.layers[0]!.segments[5]!.hp).toBe(layer.segments[5]!.hp);

    const w = quiet();
    w.taken.push('barbed-wire');
    w.cardLevels['barbed-wire'] = 1;
    horror(w, 'slab', { x: 1400, y: 4.5 * 80 });
    let u = run(w, 1 + STEP);
    u.wire[4]!.durability = 0;
    const wall = u.layers[0]!.segments[4]!.hp;
    u = run(u, BOSS_SKILL.slab.flight + STEP);
    expect(u.wire[4]!.durability).toBe(0);
    expect(u.layers[0]!.segments[4]!.hp).toBe(wall);
  });

  it('an elite Swollen bursts at the wall ELITE.blast times as hard', () => {
    const blastAt = (elite: boolean) => {
      const s = quiet();
      const front = s.layers[0]!.x + WALL.depth;
      const e = enemy(s, { kind: 'swollen', x: front + 1, y: 4.5 * 80, hp: 1e6, maxHp: 1e6 });
      if (elite) e.elite = true;
      Object.assign(s.layers[0]!.segments[4]!, { hp: 5000, maxHp: 5000 });
      const hp = s.layers[0]!.segments[4]!.hp;
      const t = run(s, 1);
      return hp - t.layers[0]!.segments[4]!.hp;
    };
    expect(blastAt(true)).toBeCloseTo(blastAt(false) * ELITE.blast, 6);
  });

  it('a mini-boss horde is no boss horde: no boss Genes or boss reward', () => {
    const s = atWave(5, waveCount(5));
    expect(s.bosses).toHaveLength(1);
    expect(bossHorde(s)).toBe(false);
    const won = { ...s, outcome: 'won' as const, mutantKills: 0 };
    expect(hordeGenes(won)).toBe(hordeGenes({ ...won, bosses: [] }));
    expect(hordeBossReward(newGame(), won)).toBeNull();
    expect(bossHorde(atWave(10, 1))).toBe(true);
  });

  it('a boss horde with every skill is seeded: the same seed plays the same', () => {
    const play = (seed: number) => run(atWave(30, waveCount(30), seed), 40);
    expect(play(4)).toEqual(play(4));
  });
});
