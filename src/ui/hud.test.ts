import { describe, expect, it } from 'vitest';
import {
  BOSS_PERK_GENES,
  PERK_IDS,
  PERKS,
  RECOVERY_MS,
  SKILL_IDS,
  type Stats,
  stockOf,
} from '../core/data.ts';
import { queueResearch, type QueueId } from '../core/research.ts';
import {
  finishHorde,
  hordeBossReward,
  hordeDrop,
  hordeFind,
  newGame,
  startHorde,
  type GameState,
} from '../core/game.ts';
import { ARMOURY_CAP } from '../core/data.ts';
import { newHorde, tick, type HordeState } from '../core/horde.ts';
import { buildTurret } from '../core/base.ts';
import { NO_STATS } from '../core/stats.ts';
import { BROOD_BOSS, enemy, horror, setup } from '../core/testing.ts';
import {
  bossBars,
  bossCue,
  bossFates,
  bossName,
  clockTime,
  defenderLabel,
  fallingText,
  payoutText,
  gainLines,
  pickerRow,
  resultScreen,
  shopButtons,
  skillButtons,
  startLabel,
  statusText,
  stockText,
  swarmCue,
  swarmMarker,
  SWARM_CUE,
} from './hud.ts';
import { loadoutFrom } from '../core/loadout.ts';
import { cardText } from './hud.ts';

const horde = (): HordeState => newHorde(1, setup());

describe('hud', () => {
  it('shows horde, wave and level', () => {
    const s = horde();
    s.xp = 4;
    s.energy = 420.7;
    expect(statusText(s)).toBe(
      `Horde 1 · Wave 1/${s.waveCount} · Lv 1 (4/10) · Bank 420/1,000 · Cash 0`,
    );
    s.energy = 0;
    s.cash = 36;
    expect(statusText(s)).toMatch(/· Bank 0\/1,000 · Cash 36$/);
  });

  it("shows the commander's perks and only whole cash (ID-020)", () => {
    const s = newHorde(1, { ...setup(), perks: ['steady-fire', 'scavengers-eye'] });
    s.cash = 12.5;
    expect(statusText(s)).toMatch(/· Cash 12 · Perks: Steady Fire, Scavenger's Eye$/);
  });

  it('marks a boss horde on the start button and in the status line (ID-024)', () => {
    expect(startLabel(9)).toBe('Start Horde 9');
    expect(startLabel(10)).toBe('Start Horde 10 · Boss horde');
    expect(startLabel(20)).toBe('Start Horde 20 · Boss horde');
    const s = newHorde(1, { ...setup(), hordeNumber: 10 });
    expect(statusText(s)).toMatch(/^Horde 10 \(boss\) · Wave 1\//);
  });

  it('one boss bar per boss on the field, in order, naming skills and the wind-up (ID-099)', () => {
    const s = newHorde(1, { ...setup(), hordeNumber: 20, harder: true });
    const [a, b] = s.bosses;
    const second = horror(s, b!.skills, { hp: 500, maxHp: 4000 }, { boss: 1, nextAt: 100 });
    const first = horror(s, a!.skills, { hp: 4000, maxHp: 4000 }, { boss: 0, nextAt: 1 });
    a!.id = first.id;
    b!.id = second.id;
    expect(bossBars(s).map((x) => x.label)).toEqual([
      'Mutated Horror (Slab Throw, Roar) · Slab Throw! · 4,000/4,000',
      'Mutated Horror (Charge, Armour Plates) · 500/4,000',
    ]);
    expect(bossName({ kind: 'swollen', skills: ['plates'], elite: true })).toBe(
      'Elite Swollen (Armour Plates)',
    );
    s.enemies = s.enemies.filter((e) => e.id !== second.id);
    expect(bossFates(s)).toEqual([
      { name: 'Mutated Horror (Slab Throw, Roar)', dead: false },
      { name: 'Mutated Horror (Charge, Armour Plates)', dead: true },
    ]);
  });

  it('a boss bar keeps naming a skill through its effect, not just the wind-up (ID-099)', () => {
    const s = newHorde(1, { ...setup(), hordeNumber: 10, harder: true });
    s.toSpawn = 0;
    const e = horror(s, ['brood', 'roar'], {}, { nextAt: 100 });
    s.bosses[0]!.id = e.id;
    expect(bossCue(s, e)).toBeNull();
    e.horror!.fired.roar = 0;
    expect(bossCue({ time: 3.9 }, e)).toBe('roar');
    expect(bossCue({ time: 4 }, e)).toBeNull();
    const [bar] = bossBars({ ...s, time: 1 });
    expect(bar).toMatchObject({
      name: 'Mutated Horror (Brood, Roar)',
      cue: 'Roar!',
      winding: false,
      hpText: '1,000/1,000',
    });
    e.horror!.next.brood = 1.5;
    expect(bossBars({ ...s, time: 1 })[0]).toMatchObject({ cue: 'Brood!', winding: true });
  });

  it('warns of a swarm wave with a countdown, then shows "Swarm!" as it hits (ID-099, ID-121)', () => {
    const s = newHorde(1, setup());
    expect(swarmCue(s)).toBeNull();
    s.swarm = true;
    s.breakUntil = 10;
    const incoming = (count: string) => ({ phase: 'incoming', title: 'Swarm incoming', count });
    // The whole break before it (WAVE_BREAK = 3 s) counts down 3, 2, 1.
    expect(swarmCue({ ...s, time: 7 })).toEqual(incoming('3'));
    expect(swarmCue({ ...s, time: 7.5 })).toEqual(incoming('3'));
    expect(swarmCue({ ...s, time: 8 })).toEqual(incoming('2'));
    expect(swarmCue({ ...s, time: 9.99 })).toEqual(incoming('1'));
    const hit = { phase: 'hit', title: 'Swarm!', count: '' };
    expect(swarmCue({ ...s, time: 10 })).toEqual(hit);
    expect(swarmCue({ ...s, time: 10 + SWARM_CUE - 0.1 })).toEqual(hit);
    expect(swarmCue({ ...s, time: 10 + SWARM_CUE })).toBeNull();
    expect(swarmCue({ ...s, time: 9, outcome: 'lost' })).toBeNull();
    expect(swarmCue({ ...s, time: 10, outcome: 'won' })).toBeNull();
  });

  it('marks a swarm wave from its break to its end (ID-121)', () => {
    const s = newHorde(1, setup());
    expect(swarmMarker(s)).toBe(false);
    s.swarm = true;
    s.breakUntil = 10;
    // Through the break, the hit and the rest of the wave alike.
    for (const time of [8, 10, 12, 999])
      expect(swarmMarker({ ...s, time } as HordeState)).toBe(true);
    expect(swarmMarker({ ...s, outcome: 'lost' })).toBe(false);
    expect(swarmMarker({ ...s, outcome: 'won' })).toBe(false);
  });

  it('keeps the swarm marker while the swarm wave’s enemies stand, after the counter moves on (ID-121)', () => {
    // Horde 5: wave 7 is a swarm, wave 8 isn't; horde-only waves overlap.
    const s = newHorde(1, { ...setup(), hordeNumber: 5, harder: true });
    Object.assign(s, { wave: 8, swarm: false, enemies: [] });
    expect(swarmMarker(s)).toBe(false);
    const calm = enemy(s, { wave: 8 });
    expect(swarmMarker(s)).toBe(false);
    const straggler = enemy(s, { wave: 7 });
    expect(swarmMarker(s)).toBe(true);
    // Its last enemy down: the swarm wave has ended.
    straggler.hp = 0;
    expect(swarmMarker(s)).toBe(false);
    s.enemies = s.enemies.filter((e) => e !== straggler);
    expect(swarmMarker(s)).toBe(false);
    expect(calm.wave).toBe(8);
    // The full game has no swarms.
    expect(swarmMarker({ ...s, harder: undefined, enemies: [{ ...straggler, hp: 5 }] })).toBe(
      false,
    );
  });

  it('warns through the real break before a horde-only swarm wave (ID-121)', () => {
    // Horde 5's wave 6 sends its last enemy and is cleared (taken off the field here); wave
    // 7, a swarm, then has its break.
    let s = newHorde(1, { ...setup(), hordeNumber: 5, harder: true });
    Object.assign(s.defenders[0]!, { hp: 1e9, maxHp: 1e9, nextShotAt: 1e9 });
    Object.assign(s, { wave: 6, swarm: false, toSpawn: 1, bosses: [], offer: null });
    expect(swarmCue(s)).toBeNull();
    for (let i = 0; i < 200 && s.wave === 6; i++) {
      s.enemies = [];
      s = tick(s, 0.05);
      if (s.wave === 6) expect(swarmCue(s)).toBeNull();
    }
    expect(s.wave).toBe(7);
    expect(s.swarm).toBe(true);
    const seen: string[] = [];
    while (s.time < s.breakUntil + SWARM_CUE + 0.5) {
      const cue = swarmCue(s);
      const now = cue ? `${cue.phase}${cue.count}` : 'none';
      if (seen.at(-1) !== now) seen.push(now);
      expect(swarmMarker(s)).toBe(true);
      s = tick(s, 0.05);
    }
    expect(seen).toEqual(['incoming3', 'incoming2', 'incoming1', 'hit', 'none']);
  });

  it('shows the boss bar only while a Mutated Horror is on the field (ID-024)', () => {
    const s = newHorde(1, { ...setup(), hordeNumber: 10 });
    expect(bossBars(s)).toEqual([]);
    enemy(s, { kind: 'runner' });
    expect(bossBars(s)).toEqual([]);
    const e = enemy(s, { kind: 'horror', hp: 1234.4, maxHp: 2000 });
    e.horror = {
      boss: 0,
      skills: ['brood'],
      next: { brood: 100 },
      fired: {},
      chargeUntil: 0,
      charged: false,
      hitAt: 0,
      seenHp: 0,
      broods: 0,
      platesOff: false,
    };
    expect(bossBars(s)).toEqual([
      {
        name: 'Mutated Horror (Brood)',
        cue: null,
        winding: false,
        hpText: '1,234/2,000',
        label: 'Mutated Horror (Brood) · 1,234/2,000',
        hp: 1234,
        maxHp: 2000,
      },
    ]);
  });

  it('shows a shop button per item as a dry run of buy, with a running buff counting down', () => {
    const s = horde();
    expect(shopButtons(s)).toEqual([
      {
        item: 'adrenaline',
        label: 'Adrenaline',
        cost: '30',
        variant: 'unaffordable',
        disabled: true,
        reason: 'Not enough cash',
      },
      {
        item: 'overdrive',
        label: 'Overdrive',
        cost: '30',
        variant: 'unaffordable',
        disabled: true,
        reason: 'Not enough cash',
      },
      // Short of cash too, but the passing refusal keeps the plain look, disabled (ID-056).
      {
        item: 'patch',
        label: 'Patch wall',
        cost: '20',
        variant: 'secondary',
        disabled: true,
        reason: 'No wall to patch',
      },
      {
        item: 'fix',
        label: 'Fix turret',
        cost: '20',
        variant: 'secondary',
        disabled: true,
        reason: 'No turret to fix',
      },
    ]);
    s.cash = 30;
    s.buffs.overdrive = 12.2;
    s.time = 0.5;
    const [adrenaline, overdrive] = shopButtons(s);
    expect(adrenaline).toMatchObject({ variant: 'secondary', disabled: false, reason: '' });
    expect(overdrive).toEqual({
      item: 'overdrive',
      label: 'Overdrive 12s',
      cost: '',
      variant: 'secondary',
      disabled: true,
      reason: 'Already active',
    });
  });

  it('shows a skill button per skill as a dry run, cooling down and armed (ID-019)', () => {
    const s = horde();
    expect(skillButtons(s, null).map((b) => [b.label, b.cost, b.variant, b.reason])).toEqual([
      ['Flashbang', '20', 'locked', 'Research Flashbang first'],
      ['Molotov', '25', 'locked', 'Research Molotov first'],
      ['Airstrike', '40', 'locked', 'Research Airstrike first'],
    ]);
    s.skills = ['flashbang', 'molotov'];
    s.cash = 30;
    s.cooldowns.molotov = 12.2;
    s.time = 0.5;
    const [flashbang, molotov, airstrike] = skillButtons(s, 'flashbang');
    expect(flashbang).toEqual({
      skill: 'flashbang',
      label: 'Flashbang',
      cost: '20',
      variant: 'secondary',
      disabled: false,
      reason: 'Then click an area to throw it at (Esc to cancel)',
      armed: true,
      hidden: false,
      key: null,
      cooling: false,
    });
    expect(molotov).toMatchObject({
      label: 'Molotov 12s',
      cost: '',
      variant: 'secondary',
      disabled: true,
      reason: 'Not ready yet',
    });
    expect(airstrike).toMatchObject({ variant: 'locked', disabled: true, armed: false });
    // Researched and ready, short only of cash: unaffordable, not locked (ID-056).
    expect(skillButtons({ ...s, skills: [...SKILL_IDS] }, null)[2]).toMatchObject({
      variant: 'unaffordable',
      reason: 'Not enough cash',
    });
    const ready = {
      ...s,
      skills: [...SKILL_IDS],
      cooldowns: { ...s.cooldowns, molotov: 0 },
      cash: 100,
    };
    expect(skillButtons(ready, null).map((b) => b.reason)).toEqual([
      'Then click an area to throw it at (Esc to cancel)',
      'Then click an area to throw it at (Esc to cancel)',
      'Then click a row to carpet bomb (Esc to cancel)',
    ]);
    // A skill that can't be used never shows as armed.
    expect(skillButtons(s, 'molotov')[1]!.armed).toBe(false);
  });

  it("names each defender's profession from their weapon", () => {
    expect(newGame().roster.map(defenderLabel)).toEqual([
      'Bob — Gunner',
      'Jack — Ripper',
      'John — Engineer',
    ]);
    // Titles are parked (ID-084): the name alone, whatever weapon they hold now.
    expect(defenderLabel({ name: 'Jack', loadout: loadoutFrom('pistol') })).toBe('Jack — Gunner');
  });

  it('lists amounts in material order, skipping zeros', () => {
    expect(stockText({ wood: 10, scrap: 5 })).toBe('5 scrap, 10 wood');
    expect(stockText(stockOf({ scrap: 0, wood: 0, metal: 0, concrete: 0 }))).toBe('nothing');
  });

  it('shows the payout once the horde is over', () => {
    const s = horde();
    expect(payoutText(s)).toBe('');
    s.outcome = 'won';
    expect(payoutText(s)).toBe('Payout: 20 scrap, 30 wood, 2 genes, 1 gas');
    s.outcome = 'lost';
    expect(payoutText(s)).toBe('Payout: 1 scrap, 1 wood');
  });

  describe('result screen', () => {
    const NOW = Date.UTC(2026, 9, 29, 12, 0);
    const back = (ms: number) => clockTime(ms);
    /** Horde 1 from a new game, ended as `outcome`, with B injured by a Shambler at 30 s of 100. */
    function ended(outcome: 'won' | 'lost'): { game: GameState; s: HordeState } {
      const game = newGame();
      const s = startHorde(game, 1, 'bob', 0, NOW);
      s.time = 100;
      s.outcome = outcome;
      const jack = s.bench.find((d) => d.id === 'jack')!;
      s.bench = s.bench.filter((d) => d !== jack);
      s.tookPart.push('jack');
      s.injured.push({ defender: jack, postId: 1, at: 30, offered: true, by: 'shambler' });
      return { game, s };
    }
    const jackBack = back(NOW - 70_000 + RECOVERY_MS);

    it('victory: waves, payout, XP, the injured and when they are back, no repairs', () => {
      const { game, s } = ended('won');
      expect(resultScreen(game, s, NOW)).toEqual({
        title: 'Horde 1 held',
        lines: [
          `All ${s.waveCount} waves cleared`,
          'Payout: 20 scrap, 30 wood, 2 genes, 1 gas',
          'Found: 2 food', // this seed's find
          'Bob +15 XP · level 1 (15/25)',
          'Jack +15 XP · level 1 (15/25)',
          'Camp +7 XP · level 1 (7/30)',
          `Jack · injured by a Shambler · back at ${jackBack}`,
          'No repairs needed',
        ],
        button: 'Back to build',
        picks: [],
        camp: { picks: game.camp.picks, offers: [], room: { people: 2, weapons: ARMOURY_CAP } },
      });
    });

    it('says a Crawler climbed over a standing wall, not through it (ID-023)', () => {
      const { game, s } = ended('lost');
      s.breaches = [{ column: 0, row: 4, wave: 2, through: 'climbed' }];
      expect(resultScreen(game, s, NOW).lines).toContain('Layer 1 · row 5 · climbed over');
    });

    it('a boss win names its reward as finishHorde gives it: a perk, or Genes once all are owned (ID-035)', () => {
      const { game, s } = ended('won');
      s.bosses = BROOD_BOSS;
      const line = (g: GameState) =>
        resultScreen(g, s, NOW).lines.find((l) => l.startsWith('Boss reward'));
      const reward = hordeBossReward(game, s);
      if (!reward || !('perk' in reward)) throw new Error('no perk');
      expect(line(game)).toBe(`Boss reward: ${PERKS[reward.perk].name} perk unlocked`);
      expect(finishHorde(game, s, NOW).perkLevels[reward.perk]).toBe(1);
      // That perk's node, queued, finishes during the fight: the screen and the finish both
      // see it owned and agree on another perk.
      const g: GameState = { ...game, lab: 2, stock: { ...game.stock, genes: 999 } };
      const q = queueResearch(g, reward.perk as QueueId, NOW - 24 * 60 * 60_000);
      if (!q.ok) throw new Error(q.reason);
      const other = line(q.game)!;
      expect(other).not.toContain(PERKS[reward.perk].name);
      const done = finishHorde(q.game, s, NOW);
      const gifted = PERK_IDS.filter(
        (id) =>
          done.perkLevels[id] === 1 && !done.research.includes(id as never) && id !== 'steady-fire',
      );
      expect(gifted).toHaveLength(1);
      expect(other).toBe(`Boss reward: ${PERKS[gifted[0]!].name} perk unlocked`);
      // Every perk owned: Genes instead.
      const all = { ...game, perkLevels: { ...game.perkLevels } };
      for (const id of PERK_IDS) all.perkLevels[id] = 1;
      expect(line(all)).toBe(`Boss reward: ${BOSS_PERK_GENES} Genes (every perk owned)`);
      // No boss, no line.
      expect(resultScreen(game, { ...s, bosses: [] }, NOW).lines.join('\n')).not.toMatch(
        /Boss reward/,
      );
    });

    it('a boss horde names its Mutated Horror: dead on a win, still standing on a loss (ID-024)', () => {
      const { game, s } = ended('won');
      s.bosses = [{ kind: 'horror', skills: ['charge'], wave: 10, hp: 1, elite: false, id: 7 }];
      s.injured[0]!.by = 'horror';
      const won = resultScreen(game, s, NOW).lines;
      expect(won[0]).toBe(`All ${s.waveCount} waves cleared · the Mutated Horror (Charge) is dead`);
      expect(won).toContain(`Jack · injured by the Mutated Horror · back at ${jackBack}`);

      const lost = ended('lost');
      // Not come yet: not named.
      lost.s.bosses = [
        { kind: 'horror', skills: ['regen'], wave: 10, hp: 1, elite: false, id: null },
      ];
      expect(resultScreen(lost.game, lost.s, NOW).lines.join('\n')).not.toMatch(/Horror/);
      lost.s.bosses[0]!.id = 99;
      lost.s.enemies.push({
        id: 99,
        kind: 'horror',
        x: 300,
        y: 300,
        hp: 10,
        maxHp: 100,
        nextAttackAt: 0,
        inCamp: true,
        stunnedUntil: 0,
        vx: 0,
        vy: 0,
        climbUntil: 0,
        climbed: false,
        horror: {
          boss: 0,
          skills: ['regen'],
          next: {},
          fired: {},
          chargeUntil: 0,
          charged: false,
          hitAt: 0,
          seenHp: 10,
          broods: 0,
          platesOff: false,
        },
      });
      expect(resultScreen(lost.game, lost.s, NOW).lines[1]).toBe(
        'Mutated Horror (Regen): still stood',
      );
    });

    it('names the kind of enemy behind each injury (ID-023)', () => {
      const { game, s } = ended('won');
      s.injured[0]!.by = 'spewer';
      expect(resultScreen(game, s, NOW).lines).toContain(
        `Jack · injured by a Spewer · back at ${jackBack}`,
      );
    });

    /** `ended('won')` with its RNG moved to where the drop is a weapon with 2 affixes. */
    function withDrop(): { game: GameState; s: HordeState } {
      const { game, s } = ended('won');
      for (let n = 0; hordeDrop(game, s)?.weapon.affixes.length !== 2; n++) s.rng = { s: n };
      return { game, s };
    }

    it('a weapon drop: its name after the payout, then one line per affix', () => {
      const { game, s } = withDrop();
      const w = hordeDrop(game, s)!.weapon;
      expect(w.rarity).toBe('prototype');
      const lines = resultScreen(game, s, NOW).lines;
      expect(lines[1]).toBe('Payout: 20 scrap, 30 wood, 2 genes, 1 gas');
      expect(lines[2]).toMatch(/^Found: Prototype (Pistol|Knife|Toolkit)$/);
      expect(lines.slice(3, 5)).toHaveLength(2);
      for (const line of lines.slice(3, 5)) expect(line).toMatch(/^[+−]\d+% |^Pierce/);
      expect(lines[5]).toBe('Bob +15 XP · level 1 (15/25)');
    });

    it('a weapon drop into a full armoury: salvaged, and the screen says for how much', () => {
      const { game, s } = withDrop();
      game.armoury = Array.from({ length: ARMOURY_CAP }, (_, i) => ({
        uid: `h${i + 1}`,
        base: 'knife' as const,
        rarity: 'rusty' as const,
        affixes: [],
      }));
      expect(resultScreen(game, s, NOW).lines[2]).toMatch(
        /^Found: Prototype \w+ · armoury full, salvaged for 50 Scrap$/,
      );
    });

    it('a worn turret joins the repair bill, even when it is the only damage', () => {
      const game = newGame();
      const built = buildTurret(game.base, game.stock, true, 'tower', 0, 2);
      if (!built.ok) throw new Error(built.reason);
      const g: GameState = { ...game, base: built.base, stock: built.stock };
      const s = startHorde(g, 1, 'bob', 0, NOW);
      s.outcome = 'won';
      s.turrets[0]!.condition = 0; // jammed: a full repair, 20 scrap
      const last = resultScreen(g, s, NOW).lines.at(-1)!;
      expect(last).toMatch(/^Repair bill: 20 scrap · (covered|short by .*)$/);
      s.turrets[0]!.condition = 99.8; // any wear costs at least 1 scrap
      expect(resultScreen(g, s, NOW).lines.at(-1)).toMatch(/^Repair bill: 1 scrap · /);
    });

    it('the salvage Scrap counts toward the repair bill', () => {
      const { game, s } = withDrop();
      for (const seg of s.layers[0]!.segments) seg.hp = 0;
      const broke = {
        ...game,
        stock: stockOf({ scrap: 0, wood: 1000, metal: 1000, concrete: 1000 }),
      };
      const short = (g: GameState): number => {
        const m = /short by (\d+) scrap/.exec(resultScreen(g, s, NOW).lines.at(-1)!);
        return m ? Number(m[1]) : 0;
      };
      // Short of Scrap while the drop is kept; the 50 Scrap salvage tips it to covered.
      const kept = short(broke);
      expect(kept).toBeGreaterThan(0);
      const full = {
        ...broke,
        armoury: Array.from({ length: ARMOURY_CAP }, (_, i) => ({
          uid: `h${i + 1}`,
          base: 'knife' as const,
          rarity: 'rusty' as const,
          affixes: [],
        })),
      };
      expect(kept).toBeLessThan(50);
      expect(short(full)).toBe(0);
      expect(resultScreen(full, s, NOW).lines.at(-1)).toMatch(/ · covered$/);
    });

    it('no drop, no line', () => {
      const { game, s } = ended('won');
      for (let n = 0; hordeDrop(game, s) ?? hordeFind(s); n++) s.rng = { s: n };
      expect(resultScreen(game, s, NOW).lines.some((l) => l.startsWith('Found'))).toBe(false);
    });

    it('a level-up: the XP line says so, and the picker offers its points (and older unspent ones)', () => {
      const { game, s } = ended('won');
      game.roster[0]!.xp = 20; // Bob: level 2 with this win
      game.roster[1]!.xp = 30; // Jack: level 2 already, its 1 point unspent; no level-up
      game.roster[1]!.loadout = loadoutFrom('knife');
      game.roster[2]!.xp = 500; // John: points to spend, but not in this fight
      const r = resultScreen(game, s, NOW);
      expect(r.lines.slice(3, 5)).toEqual([
        'Bob +15 XP · level 2 (10/50) · +1 stat point',
        'Jack +15 XP · level 2 (20/50)',
      ]);
      expect(r.picks.map((d) => [d.id, d.xp, d.stats])).toEqual([
        ['bob', 35, NO_STATS],
        ['jack', 45, NO_STATS],
      ]);
      // Building the screen leaves the game alone.
      expect(game.roster[0]!.xp).toBe(20);
    });

    it('under the picker, what the next point adds per open stat; none once spent out (ID-096)', () => {
      const bob = { ...newGame().roster[0]!, xp: 150 }; // level 4: 3 points
      expect(gainLines(bob)).toEqual([
        expect.stringMatching(
          /^Instinct: \+2 max HP · \+0\.10 armour · \+0\.7% survive · \+\d\.\d% damage near the wall$/,
        ),
        expect.stringMatching(/^Agility: \d\.\d\d s faster reload · \+\d\.\d% fire rate$/),
        expect.stringMatching(
          /^Sharp Mind: \+\d\.\d% crit chance · \+×0\.06 crit damage · \d\.\d\d° tighter spread$/,
        ),
      ]);
      expect(gainLines({ ...bob, stats: { ...NO_STATS, mind: 3 } })).toEqual([]);
    });

    it('the picker row: points left, a button per stat, Tinker greyed out (ID-084)', () => {
      const bob = { ...newGame().roster[0]!, xp: 1e6 };
      expect(pickerRow(bob)).toEqual({
        heading: 'Bob · 282 stat points to spend',
        buttons: [
          { stat: 'instinct', label: 'Instinct 0', disabled: false },
          { stat: 'agility', label: 'Agility 0', disabled: false },
          { stat: 'mind', label: 'Sharp Mind 0', disabled: false },
          { stat: 'tinker', label: 'Tinker (locked)', disabled: true },
        ],
      });
      // No titles any more (ID-084): the heading is the name, however many points.
      const lots: Stats = { ...NO_STATS, instinct: 30, mind: 30 };
      expect(pickerRow({ ...bob, stats: lots }).heading).toBe('Bob · 222 stat points to spend');
      const none = pickerRow({ ...bob, xp: 25, stats: { ...NO_STATS, instinct: 1 } });
      expect(none.heading).toBe('Bob · 0 stat points to spend');
      expect(none.buttons.every((b) => b.disabled)).toBe(true);
    });

    it('the time shown is the one finishHorde stores', () => {
      const { game, s } = ended('lost');
      const jack = finishHorde(game, s, NOW).roster.find((d) => d.id === 'jack')!;
      expect(resultScreen(game, s, NOW).lines).toContain(
        `Jack · injured by a Shambler · back at ${back(jack.injuredUntil!)}`,
      );
    });

    it('defeat: where they broke in, the path outside in, payout, no XP, retry', () => {
      const { game, s } = ended('lost');
      s.wave = 2;
      s.injured[0]!.by = null;
      s.breaches = [
        { column: 2, row: 0, wave: 1, through: 'gap' },
        { column: 0, row: 2, wave: 2, through: 'gate' },
        { column: 1, row: 3, wave: 1, through: 'wall' },
      ];
      expect(resultScreen(game, s, NOW)).toEqual({
        title: 'The camp fell',
        lines: [
          `Broke in at Layer 1, row 3, in wave 2 of ${s.waveCount} · nobody left to hold them for 10 s`,
          'Layer 3 · row 1 · open gap',
          'Layer 2 · row 4 · broken wall',
          'Layer 1 · row 3 · broken gate',
          'Payout: 2 scrap, 3 wood',
          'No XP on a loss',
          `Jack · injured · back at ${jackBack}`,
          'No repairs needed',
        ],
        button: 'Back to build · retry Horde 1',
        picks: [],
        camp: { picks: game.camp.picks, offers: [], room: { people: 2, weapons: ARMOURY_CAP } },
      });
    });

    it('the repair bill: covered by the stock after the payout, or short', () => {
      const { game, s } = ended('lost');
      s.injured = [];
      s.layers[0]!.segments[0]!.hp = 0; // a whole wood wall: 5 scrap, 10 wood
      const line = (g: GameState) => resultScreen(g, s, NOW).lines.at(-1);
      expect(line(game)).toBe('Repair bill: 5 scrap, 10 wood · covered');
      // The loss pays 1 scrap, 1 wood; 4 scrap on hand leaves only wood short.
      const poor = { ...game, stock: stockOf({ scrap: 4, wood: 0, metal: 0, concrete: 0 }) };
      expect(line(poor)).toBe('Repair bill: 5 scrap, 10 wood · short by 9 wood');
    });

    it('shows the clock time the injured are back', () => {
      const { game, s } = ended('won');
      expect(resultScreen(game, s, NOW).lines).toContainEqual(
        expect.stringMatching(/ · back at \d{1,2}:\d{2}/),
      );
    });

    it('defeat with no breach on record still says why', () => {
      const { game, s } = ended('lost');
      expect(resultScreen(game, s, NOW).lines[0]).toBe(
        'Broke in · nobody left to hold them for 10 s',
      );
    });

    it('the repair bill prices partial damage and can be short of scrap', () => {
      const { game, s } = ended('lost');
      s.layers[0]!.segments[0]!.hp = 100; // half a wood wall: 3 scrap, 5 wood (rounded up)
      const poor = { ...game, stock: stockOf({ scrap: 0, wood: 9, metal: 0, concrete: 0 }) };
      expect(resultScreen(poor, s, NOW).lines.at(-1)).toBe(
        'Repair bill: 3 scrap, 5 wood · short by 2 scrap',
      );
    });

    it('refuses a horde still on', () => {
      const { game, s } = ended('won');
      s.outcome = 'fighting';
      expect(() => resultScreen(game, s, NOW)).toThrow(RangeError);
    });
  });

  it('counts down while the camp is falling', () => {
    const s = horde();
    expect(fallingText(s)).toBe('');
    s.fallingFor = 0.2;
    expect(fallingText(s)).toBe('The camp is falling — 10 s');
    s.fallingFor = 9.5;
    expect(fallingText(s)).toBe('The camp is falling — 1 s');
    s.outcome = 'lost';
    expect(fallingText(s)).toBe('');
  });
});

describe('card text (ID-022)', () => {
  it("an upgrade names its rarity and category; a recruit doesn't", () => {
    const s = newHorde(1, setup());
    expect(cardText({ kind: 'upgrade', id: 'frag-grenades' }, s)).toMatchObject({
      title: 'Frag Grenades',
      body: 'Each survivor throws a grenade every 8 s into the thickest group, for 35% of a Shambler’s HP',
      kind: 'Epic behaviour',
    });
    expect(cardText({ kind: 'upgrade', id: 'extended-mags' }, s).kind).toBe('Rare stat');
    expect(cardText({ kind: 'upgrade', id: 'sharpshooter' }, s).kind).toBe('Common stat');
    const recruit = cardText({ kind: 'recruit', defender: s.bench[0]! }, s);
    expect(recruit.kind).toBe('Recruit');
    expect(recruit.synergy).toBeUndefined();
  });

  it('shows a synergy line only when the card would turn one on', () => {
    const s = newHorde(1, setup());
    expect(cardText({ kind: 'upgrade', id: 'ricochet' }, s).synergy).toBeUndefined();
    s.taken = ['piercing-rounds'];
    expect(cardText({ kind: 'upgrade', id: 'ricochet' }, s).synergy).toBe(
      'Synergy — Piercing Rounds: bounces pierce',
    );
  });
});
