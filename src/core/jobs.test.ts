// Professions (ID-149, design §6): each survivor's job from before the outbreak adds to what
// their levels give. Fighting jobs only with their guns, self jobs with any gun, squad and
// camp jobs from the field only and never stacked.
import { describe, expect, it } from 'vitest';
import type { Held, OwnedWeapon } from './armoury.ts';
import { recruit } from './camp.ts';
import {
  CARD,
  CRIT_DAMAGE,
  DEFENDER_HP,
  WEAPON_IDS,
  WEAPONS,
  JOB_IDS,
  JOBS,
  LEVEL_BONUS,
  SQUAD_BONUS,
  SQUAD_XP_RATE,
  STEP,
  type Job,
  type JobId,
} from './data.ts';
import { hordeXp, newGame, type GameState, type RosterDefender } from './game.ts';
import { baseAfter, feed, fortify, magazineOf, newHorde, tick, type HordeState } from './horde.ts';
import { squadBase } from './base.ts';
import {
  fieldOf,
  finishSquadHorde,
  joiner,
  scavenged,
  squadDrop,
  squadSpec,
  squadXpGains,
  startSquadHorde,
} from './hordeonly.ts';
import { jobFor, rollJob } from './jobs.ts';
import { createRng } from './rng.ts';
import {
  critChance,
  critDamageOf,
  damageTaken,
  dodgeChance,
  fireRateFactor,
  jobBonus,
  jobFits,
  maxHpOf,
  reloadTime,
  spreadOf,
  xpForLevel,
  type Statted,
} from './stats.ts';
import { enemy, setup } from './testing.ts';

const NOW = 1_800_000_000_000;
/** Level 21: every bonus at half its cap (P = 20 = `LEVEL_HALF`). */
const HALF = xpForLevel(21);

const gun = (base: OwnedWeapon['base']): Held =>
  base === 'pistol' ? 'pistol' : { uid: `g-${base}`, base, rarity: 'common', affixes: [] };
/** A plain squad spec holding `held` at level 21, with `job` if given. */
const who = (held: Held, job?: JobId): Statted => ({
  loadout: { primary: held, secondary: null, item: null },
  xp: HALF,
  plain: true,
  ...(job ? { job } : {}),
});
const cap = (job: JobId, effect: string): number =>
  (JOBS[job] as Job).bonus[effect as keyof Job['bonus']] ?? 0;

/** A roster survivor `no` with `job` at lifetime `xp`. */
const person = (no: number, job: JobId, xp = HALF): RosterDefender => ({
  ...recruit(no),
  job,
  xp,
});
/** A horde-only game at Horde 1 whose squad is `people`. */
function squadOfPeople(people: RosterDefender[]): GameState {
  const g = newGame('horde');
  return { ...g, roster: people, camp: { ...g.camp, recruits: people.length } };
}

describe('the professions (ID-149)', () => {
  it('has 11 professions: 4 fighting, 3 self, 3 squad and 1 camp', () => {
    expect(JOB_IDS).toHaveLength(11);
    const kinds = JOB_IDS.map((j) => (JOBS[j] as Job).kind);
    expect(kinds.filter((k) => k === 'fight')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'self')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'squad')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'camp')).toHaveLength(1);
  });

  it('every gun is covered by at least one fighting job', () => {
    const shooting = WEAPON_IDS.filter((w) => ['sidearm', 'gun'].includes(WEAPONS[w].kind));
    expect(shooting).toHaveLength(10);
    for (const base of shooting) {
      expect(
        JOB_IDS.some((j) => (JOBS[j] as Job).guns?.includes(base as never)),
        base,
      ).toBe(true);
    }
  });

  it('starts from the same budget, then measured: Soldier and Guard trimmed, survival raised', () => {
    const caps = (j: JobId): number =>
      Object.entries((JOBS[j] as Job).bonus)
        .filter(([e]) => e in LEVEL_BONUS)
        .reduce((sum, [e, v]) => sum + v / LEVEL_BONUS[e as keyof typeof LEVEL_BONUS], 0);
    // A fighting job: 2.4 level caps on its two specialties (crit damage and magazine size
    // count as one cap at 1.2× a level stat's 30%), less for the two the balance test found
    // strongest; a self job about 1.5, the Construction worker more (survival decides fights).
    expect(caps('police')).toBeCloseTo(2.4);
    expect(caps('hunter') + cap('hunter', 'critDamage') / 0.3).toBeCloseTo(2.4);
    expect(caps('guard')).toBeCloseTo(2);
    expect(caps('soldier') + cap('soldier', 'magazine') / 0.3).toBeCloseTo(2);
    expect(caps('builder')).toBeGreaterThan(1.5);
    expect(caps('student')).toBeCloseTo(0.6);
  });

  it('a Paramedic’s heal stays under First Aid Kits’ first level at any level', () => {
    expect(jobBonus(10_000, 'paramedic', 'squadHeal')).toBeLessThan(CARD.firstAid[0]!);
  });

  it('gives nothing at level 1, and less each level than the one before', () => {
    for (const job of JOB_IDS) {
      for (const effect of Object.keys((JOBS[job] as Job).bonus) as (keyof Job['bonus'])[]) {
        expect(jobBonus(1, job, effect)).toBe(0);
        const steps = [2, 3, 10, 11, 40, 41].map((l) => jobBonus(l, job, effect));
        expect(steps[1]! - steps[0]!).toBeGreaterThan(steps[3]! - steps[2]!);
        expect(steps[3]! - steps[2]!).toBeGreaterThan(steps[5]! - steps[4]!);
        expect(jobBonus(1000, job, effect)).toBeLessThan(cap(job, effect));
        expect(jobBonus(21, job, effect)).toBeCloseTo(cap(job, effect) / 2);
      }
    }
  });
});

describe('fighting jobs: only with their guns (ID-149)', () => {
  it('fits a fighting job to its guns only, and any other job to anything', () => {
    expect(jobFits('hunter', gun('sniper'))).toBe(true);
    expect(jobFits('hunter', gun('rifle'))).toBe(true);
    expect(jobFits('hunter', gun('smg'))).toBe(false);
    expect(jobFits('hunter', 'knife')).toBe(false);
    expect(jobFits('hunter', null)).toBe(false);
    expect(jobFits('police', 'pistol')).toBe(true);
    expect(jobFits('guard', gun('machinepistol'))).toBe(true);
    expect(jobFits('police', gun('machinepistol'))).toBe(true);
    for (const j of ['builder', 'chef', 'scavenger'] as const) {
      expect(jobFits(j, gun('lmg'))).toBe(true);
      expect(jobFits(j, null)).toBe(true);
    }
  });

  it('a Police officer reloads and fires faster with a sidearm or shotgun', () => {
    for (const base of ['pistol', 'handcannon', 'shotgun', 'cartridge'] as const) {
      const h = gun(base);
      expect(fireRateFactor(who(h, 'police'), h)).toBeCloseTo(
        fireRateFactor(who(h), h) + cap('police', 'fireRate') / 2,
      );
      expect(reloadTime(who(h, 'police'), h)).toBeLessThan(reloadTime(who(h), h));
    }
  });

  it('a Security guard fires and reloads faster with an SMG or Machine Pistol', () => {
    const h = gun('smg');
    expect(fireRateFactor(who(h, 'guard'), h)).toBeCloseTo(
      fireRateFactor(who(h), h) + cap('guard', 'fireRate') / 2,
    );
    expect(reloadTime(who(h, 'guard'), h)).toBeLessThan(reloadTime(who(h), h));
  });

  it('a Soldier aims tighter and holds more rounds with an Assault Rifle or LMG', () => {
    const h = gun('assault');
    const none = { taken: [], cardLevels: {} };
    expect(spreadOf(who(h, 'soldier'), h)).toBeLessThan(spreadOf(who(h), h));
    expect(magazineOf(none, h, who(h, 'soldier'))).toBe(
      Math.round(magazineOf(none, h) * (1 + cap('soldier', 'magazine') / 2)),
    );
    expect(magazineOf(none, h, who(h))).toBe(magazineOf(none, h));
  });

  it('a Hunter crits more often and harder with a Sniper rifle or Carbine', () => {
    const h = gun('sniper');
    expect(critChance(who(h, 'hunter'), true, h)).toBeCloseTo(
      critChance(who(h), true, h) + cap('hunter', 'crit') / 2,
    );
    expect(critDamageOf(who(h, 'hunter'), h)).toBeCloseTo(cap('hunter', 'critDamage') / 2);
    expect(critDamageOf(who(h), h)).toBe(0);
  });

  it('off their guns a fighting job is exactly a plain survivor: no bonus, no penalty', () => {
    const off: [JobId, Held][] = [
      ['hunter', gun('smg')],
      ['soldier', 'pistol'],
      ['police', gun('sniper')],
      ['guard', gun('lmg')],
    ];
    const none = { taken: [], cardLevels: {} };
    for (const [job, h] of off) {
      const d = who(h, job);
      const p = who(h);
      expect(fireRateFactor(d, h), job).toBe(fireRateFactor(p, h));
      expect(reloadTime(d, h), job).toBe(reloadTime(p, h));
      expect(spreadOf(d, h), job).toBe(spreadOf(p, h));
      expect(critChance(d, true, h), job).toBe(critChance(p, true, h));
      expect(critDamageOf(d, h), job).toBe(0);
      expect(magazineOf(none, h, d), job).toBe(magazineOf(none, h, p));
      expect(maxHpOf(d), job).toBe(maxHpOf(p));
      expect(damageTaken(d, 10), job).toBe(damageTaken(p, 10));
    }
  });

  it('the all-round level bonus always applies, whatever the job and gun', () => {
    for (const job of JOB_IDS) {
      expect(maxHpOf(who(gun('smg'), job))).toBeGreaterThanOrEqual(DEFENDER_HP + 30);
    }
  });
});

describe('self jobs: with any gun (ID-149)', () => {
  it('a Construction worker adds wall max HP from the field; two never stack; leaving takes it back', () => {
    const wallOf = (people: RosterDefender[]) =>
      startSquadHorde(squadOfPeople(people), 1, NOW).layers[0]!.segments.filter((x) => x.kind);
    const bare = wallOf([person(1, 'police'), person(2, 'police')]);
    const one = wallOf([person(1, 'builder'), person(2, 'police')]);
    const two = wallOf([person(1, 'builder'), person(2, 'builder')]);
    for (const [i, seg] of one.entries()) {
      const want = bare[i]!.maxHp + Math.round(bare[i]!.maxHp * (cap('builder', 'wallHp') / 2));
      expect(seg.maxHp).toBe(want);
      expect(seg.hp).toBe(want);
      expect(two[i]!.maxHp).toBe(want);
    }
    const s = startSquadHorde(squadOfPeople([person(1, 'builder'), person(2, 'police')]), 1, NOW);
    const [seg] = s.layers[0]!.segments.filter((x) => x.kind);
    const broken = s.layers[0]!.segments.filter((x) => x.kind)[1]!;
    broken.hp = 0;
    s.defenders = s.defenders.filter((d) => d.id !== 'recruit-1');
    fortify(s);
    expect(seg!.maxHp).toBe(bare[0]!.maxHp);
    expect(seg!.hp).toBe(bare[0]!.maxHp);
    expect(seg!.built).toBeUndefined();
    expect(broken.hp).toBe(0);
  });

  it('a Paramedic heals everyone on the field over time; two never stack', () => {
    const run = (people: RosterDefender[]): number => {
      const s = startSquadHorde(squadOfPeople(people), 1, NOW);
      s.toSpawn = 0;
      for (const d of s.defenders) d.hp = d.maxHp / 2;
      let t = s;
      for (let i = 0; i < 10 / STEP; i++) t = tick(t, STEP);
      const d = t.defenders.find((x) => x.id === 'recruit-2')!;
      return d.hp / d.maxHp - 0.5;
    };
    const one = run([person(1, 'paramedic'), person(2, 'police')]);
    expect(one).toBeCloseTo((cap('paramedic', 'squadHeal') / 2) * 10, 3);
    expect(run([person(1, 'paramedic'), person(2, 'paramedic')])).toBeCloseTo(one, 6);
    expect(run([person(1, 'police'), person(2, 'police')])).toBe(0);
  });

  it('a Construction worker has more max HP and armour', () => {
    const h = gun('lmg');
    expect(maxHpOf(who(h, 'builder'))).toBe(maxHpOf(who(h)) + Math.round(cap('builder', 'hp') / 2));
    expect(damageTaken(who(h, 'builder'), 20)).toBeCloseTo(
      damageTaken(who(h), 20) - cap('builder', 'armour') / 2,
    );
  });

  it('a Paramedic may dodge the hit that would injure them, left at 1 HP', () => {
    expect(dodgeChance(who('pistol', 'paramedic'))).toBeCloseTo(cap('paramedic', 'dodge') / 2);
    expect(dodgeChance(who('pistol'))).toBe(0);
    // Each seed: a Paramedic at 5 HP takes a Brute's hit in the camp. Only the first hit
    // counts: it dodges (left standing) or injures them.
    let dodged = 0;
    let injured = 0;
    const SEEDS = 200;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = newHorde(seed, {
        ...setup(),
        roster: [
          { id: 'a', name: 'A', loadout: who('pistol').loadout, xp: HALF, job: 'paramedic' },
        ],
      });
      s.toSpawn = 0;
      const d = s.defenders[0]!;
      d.hp = 5;
      // An enemy in the camp hits the defender it reaches.
      enemy(s, { kind: 'brute', x: d.x, y: d.y, inCamp: true, nextAttackAt: 0 });
      let t: HordeState = s;
      for (let i = 0; i < 3 / STEP && t.outcome === 'fighting'; i++) {
        t = tick(t, STEP);
        const now = t.defenders.find((x) => x.id === 'a');
        if (!now) {
          injured++;
          break;
        }
        // Hit and still standing (the heal may lift them a little past 1 HP).
        if (now.hp < 2) {
          dodged++;
          break;
        }
      }
    }
    expect(dodged + injured).toBe(SEEDS);
    // About `dodgeChance` of the seeds (20% at level 21).
    expect(dodged / SEEDS).toBeGreaterThan(0.12);
    expect(dodged / SEEDS).toBeLessThan(0.28);
  });

  it('the dodge rolls only on a hit that would down them: other fights keep their RNG', () => {
    const fight = (job?: JobId): HordeState => {
      const s = newHorde(3, {
        ...setup(),
        roster: [
          { id: 'a', name: 'A', loadout: who('pistol').loadout, xp: HALF, ...(job ? { job } : {}) },
        ],
      });
      s.toSpawn = 0;
      const d = s.defenders[0]!;
      // A hit that hurts but never downs: 500 HP against a Brute's blows.
      d.hp = d.maxHp = 500;
      enemy(s, { kind: 'brute', x: d.x, y: d.y, inCamp: true, nextAttackAt: 0 });
      let t: HordeState = s;
      for (let i = 0; i < 5 / STEP; i++) t = tick(t, STEP);
      return t;
    };
    const plain = fight();
    // The Teacher has no fight effect, so any change is the dodge rolling; the Paramedic's
    // dodge must not roll either while no hit could down them.
    expect(fight('teacher').rng).toEqual(plain.rng);
    const medic = fight('paramedic');
    expect(medic.rng).toEqual(plain.rng);
    expect(medic.defenders[0]!.hp).toBeLessThan(500);
  });

  it('a Soldier’s bigger magazine is loaded at the start and on every reload', () => {
    const ar: Held = { uid: 'g-ar', base: 'assault', rarity: 'common', affixes: [] };
    const soldier = {
      ...person(1, 'soldier'),
      loadout: { primary: ar, secondary: null, item: null },
    };
    const s = startSquadHorde(squadOfPeople([soldier]), 1, NOW);
    s.toSpawn = 0;
    const d = s.defenders[0]!;
    const mag = magazineOf(s, ar, d);
    expect(mag).toBeGreaterThan(magazineOf(s, ar));
    expect(d.ammo.primary).toBe(mag);
    d.ammo.primary = 0;
    d.reloadedAt.primary = s.time;
    let t: HordeState = s;
    for (let i = 0; i < 10 / STEP && t.defenders[0]!.ammo.primary === 0; i++) t = tick(t, STEP);
    expect(t.defenders[0]!.ammo.primary).toBe(mag);
  });

  it('a plain survivor never dodges: the hit injures them', () => {
    const s = newHorde(1, {
      ...setup(),
      roster: [{ id: 'a', name: 'A', loadout: who('pistol').loadout, xp: HALF }],
    });
    s.toSpawn = 0;
    const d = s.defenders[0]!;
    d.hp = 5;
    enemy(s, { kind: 'brute', x: d.x, y: d.y, inCamp: true, nextAttackAt: 0 });
    let t: HordeState = s;
    for (let i = 0; i < 3 / STEP && t.outcome === 'fighting'; i++) t = tick(t, STEP);
    expect(t.injured.some((x) => x.defender.id === 'a')).toBe(true);
  });

  it('a Student levels faster and gets a little of every level stat', () => {
    const h = gun('smg');
    expect(maxHpOf(who(h, 'student'))).toBe(maxHpOf(who(h)) + Math.round(cap('student', 'hp') / 2));
    expect(fireRateFactor(who(h, 'student'), h)).toBeGreaterThan(fireRateFactor(who(h), h));
    const g = squadOfPeople([person(1, 'student'), person(2, 'builder')]);
    const h1 = { ...startSquadHorde(g, 1, NOW), outcome: 'won' as const };
    const [student, builder] = squadXpGains(g, h1);
    // A first clear of Horde 1 pays `hordeXp(1)` × `SQUAD_XP_RATE`, rounded down once.
    const win = hordeXp(1) * SQUAD_XP_RATE;
    expect(builder!.xp).toBe(Math.floor(win));
    expect(student!.xp).toBe(Math.floor(win * (1 + cap('student', 'xp') / 2)));
  });
});

describe('squad and camp jobs: from the field, never stacked (ID-149)', () => {
  it('a Construction worker’s extra wall HP lasts the fight only: the base keeps the same share of its own max', () => {
    const base = squadBase();
    const s = startSquadHorde(squadOfPeople([person(1, 'builder')]), 1, NOW);
    const seg = s.layers[0]!.segments.find((x) => x.kind)!;
    const max = base.layers[0]!.slots[seg.index]!.maxHp;
    expect(seg.built).toBeGreaterThan(0);
    expect(seg.maxHp).toBe(max + seg.built!);
    const after = () => baseAfter(base, s).layers[0]!.slots[seg.index]!.hp;
    // Whole after the fight: the base is whole, never over its own max.
    expect(after()).toBe(max);
    // Half the fight's max left: half the base's own max, none of the extra kept.
    seg.hp = seg.maxHp / 2;
    expect(after()).toBe(max / 2);
    seg.hp = 0;
    expect(after()).toBe(0);
  });

  it('a Chef adds max HP to everyone on the field, from the start', () => {
    const g = squadOfPeople([person(1, 'chef'), person(2, 'builder'), person(3, 'police')]);
    const s = startSquadHorde(g, 1, NOW);
    const extra = Math.round(cap('chef', 'squadHp') / 2);
    for (const d of s.defenders) {
      const spec = squadSpec(g.roster.find((r) => r.id === d.id)!);
      expect(d.maxHp, d.id).toBe(maxHpOf(spec) + extra);
      expect(d.hp, d.id).toBe(d.maxHp);
    }
  });

  it('two Chefs never stack: only the higher level counts', () => {
    const low = xpForLevel(5);
    const g = squadOfPeople([person(1, 'chef', low), person(2, 'chef'), person(3, 'police')]);
    const s = startSquadHorde(g, 1, NOW);
    const police = s.defenders.find((d) => d.id === 'recruit-3')!;
    expect(police.maxHp).toBe(
      maxHpOf(squadSpec(g.roster[2]!)) + Math.round(cap('chef', 'squadHp') / 2),
    );
  });

  it('a Chef who leaves the field takes the HP with them; no one drops below 0', () => {
    const g = squadOfPeople([person(1, 'chef'), person(2, 'police')]);
    const s = startSquadHorde(g, 1, NOW);
    const police = s.defenders.find((d) => d.id === 'recruit-2')!;
    const base = police.maxHp - police.fed!;
    s.defenders = s.defenders.filter((d) => d.id !== 'recruit-1');
    feed(s);
    expect(police.maxHp).toBe(base);
    expect(police.hp).toBe(base);
    expect(police.fed).toBeUndefined();
  });

  it('a Mechanic repairs every standing segment during the fight; two never stack', () => {
    const run = (people: RosterDefender[]): number => {
      const s = startSquadHorde(squadOfPeople(people), 1, NOW);
      s.toSpawn = 0;
      const seg = s.layers[0]!.segments.find((x) => x.hp > 0)!;
      seg.hp = seg.maxHp / 2;
      let t = s;
      for (let i = 0; i < 10 / STEP; i++) t = tick(t, STEP);
      return t.layers[0]!.segments[seg.index]!.hp / seg.maxHp - 0.5;
    };
    const one = run([person(1, 'mechanic'), person(2, 'police')]);
    expect(one).toBeCloseTo((cap('mechanic', 'wallRepair') / 2) * 10, 3);
    expect(run([person(1, 'mechanic'), person(2, 'mechanic')])).toBeCloseTo(one, 6);
    expect(run([person(1, 'police'), person(2, 'police')])).toBe(0);
  });

  it('a Teacher adds horde XP for everyone who fought; two never stack', () => {
    const plainXp = (g: GameState) =>
      squadXpGains(g, { ...startSquadHorde(g, 1, NOW), outcome: 'won' as const });
    const base = plainXp(squadOfPeople([person(1, 'police'), person(2, 'builder')]))[0]!.xp;
    const taught = plainXp(squadOfPeople([person(1, 'teacher'), person(2, 'builder')]));
    const want = Math.floor(hordeXp(1) * SQUAD_XP_RATE * (1 + cap('teacher', 'squadXp') / 2));
    expect(base).toBe(Math.floor(hordeXp(1) * SQUAD_XP_RATE));
    expect(taught.map((x) => x.xp)).toEqual([want, want]);
    const two = plainXp(squadOfPeople([person(1, 'teacher'), person(2, 'teacher')]));
    expect(two.map((x) => x.xp)).toEqual([want, want]);
  });

  it('a Teacher in the reserve (not on the field) adds nothing', () => {
    const g = squadOfPeople([person(1, 'police'), person(2, 'builder')]);
    const benched = { ...g, reserve: [person(9, 'teacher')] };
    const h = { ...startSquadHorde(benched, 1, NOW), outcome: 'won' as const };
    expect(fieldOf(benched, h).map((d) => d.id)).toEqual(['recruit-1', 'recruit-2']);
    expect(squadXpGains(benched, h)).toEqual(
      squadXpGains(g, { ...startSquadHorde(g, 1, NOW), outcome: 'won' as const }),
    );
  });

  it('a Scavenger who fought raises the bonus-gun chance; two never stack', () => {
    const h = (g: GameState) => ({ ...startSquadHorde(g, 1, NOW), outcome: 'won' as const });
    const one = squadOfPeople([person(1, 'scavenger'), person(2, 'police')]);
    const two = squadOfPeople([person(1, 'scavenger'), person(2, 'scavenger')]);
    expect(scavenged(one, h(one))).toBeCloseTo(cap('scavenger', 'dropChance') / 2);
    expect(scavenged(two, h(two))).toBeCloseTo(scavenged(one, h(one)));
    expect(scavenged(squadOfPeople([person(1, 'police')]), h(one))).toBe(0);
    // Over many seeds a Scavenger's squad gets more bonus guns, and the drop itself is the same.
    let plainBonus = 0;
    let scavBonus = 0;
    const plain = squadOfPeople([person(1, 'police'), person(2, 'police')]);
    for (let seed = 1; seed <= 200; seed++) {
      const a = squadDrop(plain, { ...h(plain), seed })!;
      const b = squadDrop(one, { ...h(one), seed })!;
      expect(b.weapon).toEqual(a.weapon);
      plainBonus += a.bonus.length;
      scavBonus += b.bonus.length;
    }
    expect(plainBonus / 200).toBeCloseTo(SQUAD_BONUS.rolls * SQUAD_BONUS.chance, 0);
    expect(scavBonus).toBeGreaterThan(plainBonus);
  });
});

describe('rolling a profession (ID-149)', () => {
  it('is deterministic for a seed, and every profession comes up', () => {
    expect(jobFor('recruit-3', 77)).toBe(jobFor('recruit-3', 77));
    expect(rollJob(createRng(5))).toBe(rollJob(createRng(5)));
    const seen = new Set<JobId>();
    for (let seed = 0; seed < 400; seed++) seen.add(jobFor('recruit-2', seed));
    expect([...seen].sort()).toEqual([...JOB_IDS].sort());
  });

  it('a new survivor rolls with the horde’s seed; repeats are allowed', () => {
    const g = squadOfPeople([person(1, 'police'), person(2, 'police')]);
    expect(joiner(g, 123)!.job).toBe(jobFor('recruit-3', 123));
    const won = finishSquadHorde(g, { ...startSquadHorde(g, 456, NOW), outcome: 'won' });
    expect(won.roster.at(-1)!.job).toBe(jobFor('recruit-3', 456));
  });

  it('a new game’s first survivor rolls with its seed', () => {
    expect(newGame('horde', 99).roster[0]!.job).toBe(jobFor('recruit-1', 99));
  });

  it('a squad survivor fights with their profession', () => {
    const d = person(1, 'hunter');
    expect(squadSpec(d).job).toBe('hunter');
    expect(startSquadHorde(squadOfPeople([d]), 1, NOW).defenders[0]!.job).toBe('hunter');
  });
});

describe('the crit multiplier with a Hunter in a fight (ID-149)', () => {
  it('a Hunter’s crit damage adds to the ×2', () => {
    expect(CRIT_DAMAGE + critDamageOf(who(gun('rifle'), 'hunter'), gun('rifle'))).toBeCloseTo(
      CRIT_DAMAGE + cap('hunter', 'critDamage') / 2,
    );
  });
});
