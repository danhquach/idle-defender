// Design §12, as built ID-150: save version 20. Survivors asking to join (`joining`) wait in
// the save for Accept or Refuse, so a reload on the result screen keeps the offer. Loaded
// values go through an allow-list; hostile ones are refused.
import { describe, expect, it } from 'vitest';
import { rollWeapon } from '../core/armoury.ts';
import { recruit } from '../core/camp.ts';
import { SQUAD_CAP, SQUAD_JOIN } from '../core/data.ts';
import { newGame, type GameState, type RosterDefender } from '../core/game.ts';
import {
  answerJoin,
  combineSurvivors,
  finishSquadHorde,
  joiners,
  joiningOf,
  startSquadHorde,
} from '../core/hordeonly.ts';
import { createRng } from '../core/rng.ts';
import { decodeSave, encodeSave, SAVE_VERSION } from './save.ts';
import { NOW, preJoin } from './testing.ts';

/** A parsed save, poked at freely to build hostile ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** A horde-only camp of `n` (up to 6 in the squad, the rest benched) at Horde 4. */
function camp(n: number): GameState {
  const g = newGame('horde');
  const all = Array.from({ length: n }, (_, i) => recruit(i + 1));
  return {
    ...g,
    hordeNumber: 4,
    roster: all.slice(0, SQUAD_CAP),
    reserve: all.slice(SQUAD_CAP),
    camp: { ...g.camp, recruits: n },
  };
}

/** `game` with `asking` waiting to join, each counted. */
const asking = (game: GameState, ...who: RosterDefender[]): GameState => ({
  ...game,
  joining: who,
  camp: { ...game.camp, recruits: game.camp.recruits + who.length },
});

function reread(game: GameState, change: (g: Loose) => void = () => {}, v = SAVE_VERSION) {
  const save = JSON.parse(encodeSave(game, NOW));
  save.v = v;
  change(save.game);
  return decodeSave(JSON.stringify(save));
}

describe('save: asking to join (ID-150)', () => {
  it('is version 26 (20 was ID-150’s)', () => {
    expect(SAVE_VERSION).toBe(26);
  });

  it('a reload mid-offer keeps the ask, and it can still be answered', () => {
    const g = newGame('horde');
    const won = finishSquadHorde(g, { ...startSquadHorde(g, 7, NOW), outcome: 'won' });
    expect(joiningOf(won)).toHaveLength(1);
    const back = reread(won)?.game;
    expect(back).toEqual(won);
    const r = answerJoin(back!, joiningOf(back!)[0]!.id, true);
    expect(r.ok && r.game.roster).toHaveLength(2);
  });

  it('round-trips two at once; nobody asking writes no field', () => {
    const two = asking(camp(8), recruit(9, 3), recruit(10, 3));
    expect(reread(two)?.game).toEqual(two);
    const none = camp(3);
    expect(Object.hasOwn(JSON.parse(encodeSave(none, NOW)).game, 'joining')).toBe(false);
    expect(reread(none)?.game.joining).toBeUndefined();
  });

  it('a v19 save has nobody asking, and refuses the field', () => {
    const g = camp(3);
    expect(decodeSave(JSON.stringify({ v: 19, savedAt: NOW, game: preJoin(g) }))?.game).toEqual(g);
    expect(reread(asking(g, recruit(4)), () => {}, 19)).toBeNull();
  });

  it('refuses hostile asks', () => {
    const g = asking(camp(3), recruit(4));
    const relic = rollWeapon(createRng(1), 'h1', 'rifle', 'relic', 3);
    const cases: [string, (x: Loose) => void][] = [
      ['an empty list (never written)', (x) => (x.joining = [])],
      ['three at once', (x) => x.joining.push(recruit(5), recruit(6)) && (x.camp.recruits = 6)],
      ['not a list', (x) => (x.joining = { 0: x.joining[0] })],
      ['null', (x) => (x.joining = null)],
      ['a recruit not counted', (x) => (x.camp.recruits = 3)],
      ['someone already in the camp', (x) => (x.joining[0] = x.roster[0])],
      ['the same one twice', (x) => x.joining.push(x.joining[0])],
      ['not a free recruit', (x) => (x.joining[0].id = 'survivor-1-0')],
      ['a level past 1', (x) => (x.joining[0].xp = 50)],
      ['an owned gun (a weapon to dupe)', (x) => (x.joining[0].loadout.primary = relic)],
      ['a secondary', (x) => (x.joining[0].loadout.secondary = 'pistol')],
      ['resting', (x) => (x.joining[0].rest = 1)],
      ['injured', (x) => (x.joining[0].injuredUntil = NOW)],
      ['an unknown profession', (x) => (x.joining[0].job = 'king')],
      ['an extra key', (x) => (x.joining[0].extra = 1)],
      ['a bidi name', (x) => (x.joining[0].name = 'Ava\u202e')],
      ['a zero-width name', (x) => (x.joining[0].name = 'A\u200bva')],
      ['an oversized name', (x) => (x.joining[0].name = 'A'.repeat(500))],
      ['a markup name', (x) => (x.joining[0].name = '<img src=x onerror=alert(1)>')],
    ];
    expect(reread(g)).not.toBeNull();
    for (const [what, change] of cases) expect(reread(g, change), what).toBeNull();
  });

  it('refuses an ask by someone already on the bench', () => {
    const g = asking(camp(8), recruit(9));
    expect(reread(g)).not.toBeNull();
    expect(reread(g, (x) => (x.joining[0] = x.reserve[1]))).toBeNull();
  });

  it('refuses prototype keys in an ask, and pollutes nothing', () => {
    const g = asking(camp(3), recruit(4));
    const raw = encodeSave(g, NOW);
    for (const bad of [
      raw.replace('"joining":[{', '"joining":[{"__proto__":{"x":1},'),
      raw.replace('"joining":[{', '"joining":[{"constructor":{"x":1},'),
      raw.replace('"joining":', '"__proto__":{"x":1},"joining":'),
    ]) {
      expect(bad).toMatch(/__proto__|constructor/);
      expect(decodeSave(bad)).toBeNull();
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('refuses a camp past its cap with the asks', () => {
    const full = asking(camp(SQUAD_JOIN.max - 1), recruit(SQUAD_JOIN.max, 2));
    expect(reread(full)?.game).toEqual(full);
    const over = asking(camp(SQUAD_JOIN.max), recruit(SQUAD_JOIN.max + 1, 2));
    expect(reread(over)).toBeNull();
  });
});

describe('save: replay joiners and combining survivors (ID-170)', () => {
  it('a lucky replay’s ask round-trips with the next new horde unchanged', () => {
    const g = camp(7);
    let seed = 1;
    while (joiners(g, seed, true).length === 0) seed++;
    const won = finishSquadHorde(g, { ...startSquadHorde(g, seed, NOW, 2), outcome: 'won' });
    expect(won.hordeNumber).toBe(4);
    expect(joiningOf(won)).toHaveLength(1);
    expect(reread(won)?.game).toEqual(won);
  });

  it('a camp after a combine round-trips: one fewer, the keeper’s XP, the gun stashed', () => {
    const gun = rollWeapon(createRng(1), 'h1', 'rifle', 'military', 1);
    const g = camp(7);
    g.roster[0] = { ...g.roster[0]!, job: 'soldier', xp: 300 };
    g.reserve[0] = {
      ...g.reserve[0]!,
      job: 'soldier',
      xp: 400,
      loadout: { primary: gun, secondary: null, item: null },
    };
    const r = combineSurvivors(g, 'recruit-1', 'recruit-7');
    if (!r.ok) throw new Error(r.reason);
    const back = reread(r.game)?.game;
    expect(back).toEqual(r.game);
    expect(back!.roster[0]!.xp).toBe(500);
    expect(back!.reserve).toEqual([]);
    expect(back!.armoury.map((w) => w.uid)).toEqual(['h1']);
  });
});
