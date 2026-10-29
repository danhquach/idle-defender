import { describe, expect, it } from 'vitest';
import { RECOVERY_MS } from '../core/data.ts';
import { finishHorde, newGame, startHorde, type GameState } from '../core/game.ts';
import { newHorde, type HordeState } from '../core/horde.ts';
import { setup } from '../core/testing.ts';
import { clockTime, fallingText, payoutText, resultScreen, statusText, stockText } from './hud.ts';

const horde = (): HordeState => newHorde(1, setup());

describe('hud', () => {
  it('shows horde, wave and level', () => {
    const s = horde();
    s.xp = 4;
    expect(statusText(s)).toBe(`Horde 1 · Wave 1/${s.waveCount} · Lv 1 (4/10)`);
  });

  it('lists amounts in material order, skipping zeros', () => {
    expect(stockText({ wood: 10, scrap: 5 })).toBe('5 scrap, 10 wood');
    expect(stockText({ scrap: 0, wood: 0, metal: 0, concrete: 0 })).toBe('nothing');
  });

  it('shows the payout once the horde is over', () => {
    const s = horde();
    expect(payoutText(s)).toBe('');
    s.outcome = 'won';
    expect(payoutText(s)).toBe('Payout: 20 scrap, 30 wood');
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
          'Payout: 20 scrap, 30 wood',
          'Bob +15 XP',
          'Jack +15 XP',
          `Jack · injured by a Shambler · back at ${jackBack}`,
          'No repairs needed',
        ],
        button: 'Back to build',
      });
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
