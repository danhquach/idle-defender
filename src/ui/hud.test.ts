import { describe, expect, it } from 'vitest';
import { RECOVERY_MS, type Stats } from '../core/data.ts';
import { finishHorde, hordeDrop, newGame, startHorde, type GameState } from '../core/game.ts';
import { ARMOURY_CAP } from '../core/data.ts';
import { newHorde, type HordeState } from '../core/horde.ts';
import { buildTurret } from '../core/base.ts';
import { NO_STATS } from '../core/stats.ts';
import { setup } from '../core/testing.ts';
import {
  clockTime,
  defenderLabel,
  fallingText,
  payoutText,
  pickerRow,
  resultScreen,
  statusText,
  stockText,
} from './hud.ts';
import { loadoutFrom } from '../core/loadout.ts';

const horde = (): HordeState => newHorde(1, setup());

describe('hud', () => {
  it('shows horde, wave and level', () => {
    const s = horde();
    s.xp = 4;
    s.energy = 420.7;
    expect(statusText(s)).toBe(`Horde 1 · Wave 1/${s.waveCount} · Lv 1 (4/10) · Bank 420/1,000`);
    s.energy = 0;
    expect(statusText(s)).toMatch(/· Bank 0\/1,000$/);
  });

  it("names each defender's profession from their weapon", () => {
    expect(newGame().roster.map(defenderLabel)).toEqual([
      'Bob — Gunner',
      'Jack — Ripper',
      'John — Engineer',
    ]);
    // The name tag is the top title, whatever weapon they hold now.
    const stats: Stats = { ...NO_STATS, aim: 10 };
    expect(defenderLabel({ name: 'Jack', loadout: loadoutFrom('knife'), stats })).toBe(
      'Jack the Gunner — Ripper',
    );
  });

  it('lists amounts in material order, skipping zeros', () => {
    expect(stockText({ wood: 10, scrap: 5 })).toBe('5 scrap, 10 wood');
    expect(stockText({ scrap: 0, wood: 0, metal: 0, concrete: 0 })).toBe('nothing');
  });

  it('shows the payout once the horde is over', () => {
    const s = horde();
    expect(payoutText(s)).toBe('');
    s.outcome = 'won';
    expect(payoutText(s)).toBe('Payout: 20 scrap, 30 wood, 1 gas');
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
          'Payout: 20 scrap, 30 wood, 1 gas',
          'Bob +15 XP · level 1 (15/25)',
          'Jack +15 XP · level 1 (15/25)',
          `Jack · injured by a Shambler · back at ${jackBack}`,
          'No repairs needed',
        ],
        button: 'Back to build',
        picks: [],
      });
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
      expect(lines[1]).toBe('Payout: 20 scrap, 30 wood, 1 gas');
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
      const broke = { ...game, stock: { scrap: 0, wood: 1000, metal: 1000, concrete: 1000 } };
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
      for (let n = 0; hordeDrop(game, s) !== null; n++) s.rng = { s: n };
      expect(resultScreen(game, s, NOW).lines.some((l) => l.startsWith('Found'))).toBe(false);
    });

    it('a level-up: the XP line says so, and the picker offers its points (and older unspent ones)', () => {
      const { game, s } = ended('won');
      game.roster[0]!.xp = 20; // Bob: level 2 with this win
      game.roster[1]!.xp = 30; // Jack: level 2 already, 1 of 3 points spent; no level-up
      game.roster[1]!.stats = { ...NO_STATS, might: 1 };
      game.roster[1]!.loadout = loadoutFrom('knife');
      game.roster[2]!.xp = 500; // John: points to spend, but not in this fight
      const r = resultScreen(game, s, NOW);
      expect(r.lines.slice(2, 4)).toEqual([
        'Bob +15 XP · level 2 (10/50) · +3 stat points',
        'Jack +15 XP · level 2 (20/50)',
      ]);
      expect(r.picks.map((d) => [d.id, d.xp, d.stats])).toEqual([
        ['bob', 35, NO_STATS],
        ['jack', 45, { ...NO_STATS, might: 1 }],
      ]);
      // Building the screen leaves the game alone.
      expect(game.roster[0]!.xp).toBe(20);
    });

    it('the picker row: points left, a button per stat, new titles', () => {
      const bob = { ...newGame().roster[0]!, xp: 1e6 };
      expect(pickerRow(bob, NO_STATS)).toEqual({
        heading: 'Bob · 846 stat points to spend',
        note: '',
        buttons: [
          { stat: 'aim', label: 'Aim 0', disabled: false },
          { stat: 'might', label: 'Might 0', disabled: false },
          { stat: 'tech', label: 'Tech 0', disabled: false },
          { stat: 'grit', label: 'Grit 0', disabled: false },
        ],
      });
      const was: Stats = { ...NO_STATS, aim: 9, might: 24 };
      const now: Stats = { ...NO_STATS, aim: 10, might: 25 };
      // Level 13 earns 36 points; 33 spent before, 38 after would be too many, so 36.
      const xp = 25 * ((13 * 12) / 2);
      expect(pickerRow({ ...bob, xp, stats: { ...was } }, was)).toMatchObject({
        heading: 'Bob the Ripper · 3 stat points to spend',
        note: '',
      });
      expect(pickerRow({ ...bob, xp, stats: { ...now, tech: 1 } }, was)).toMatchObject({
        heading: 'Bob the Ripper · 0 stat points to spend',
        note: 'New title: Junior Gunner, Adept Ripper',
      });
      const none = pickerRow({ ...bob, xp: 25, stats: { ...NO_STATS, grit: 3 } }, NO_STATS);
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
      });
    });

    it('the repair bill: covered by the stock after the payout, or short', () => {
      const { game, s } = ended('lost');
      s.injured = [];
      s.layers[0]!.segments[0]!.hp = 0; // a whole wood wall: 5 scrap, 10 wood
      const line = (g: GameState) => resultScreen(g, s, NOW).lines.at(-1);
      expect(line(game)).toBe('Repair bill: 5 scrap, 10 wood · covered');
      // The loss pays 1 scrap, 1 wood; 4 scrap on hand leaves only wood short.
      const poor = { ...game, stock: { scrap: 4, wood: 0, metal: 0, concrete: 0 } };
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
      const poor = { ...game, stock: { scrap: 0, wood: 9, metal: 0, concrete: 0 } };
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
