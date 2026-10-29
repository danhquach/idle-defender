import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment } from '../core/base.ts';
import { BANK_CAP, GENERATOR } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import {
  IMPORT_CONFIRM,
  IMPORT_DONE,
  IMPORT_REFUSAL,
  injuredLines,
  labLines,
  loadCode,
  pickStart,
  postKey,
  powerLines,
  stockBarText,
} from './build.ts';
import { clockTime } from './hud.ts';

describe('build panel', () => {
  it('shows the next horde and every material', () => {
    expect(stockBarText(newGame())).toBe(
      'Horde 1 next · Scrap 60 · Wood 60 · Metal 0 · Concrete 0',
    );
  });

  it('defaults to the first defender on post 0', () => {
    const g = newGame();
    expect(pickStart(g, null, null, 0)).toEqual({ defenderId: 'bob', postId: 0 });
  });

  it('keeps the picked post by slot when building a post re-sorts them', () => {
    const g = newGame();
    const tower = g.base.posts[1]!; // tower, row 3
    const r = buildPost(g.base, g.stock, { kind: 'ground', column: 0, row: 0 });
    if (!r.ok) throw new Error(r.reason);
    const after: GameState = { ...g, base: r.base, stock: r.stock };
    // 'ground' sorts before 'tower', so the tower moved from index 1 to 2.
    const pick = pickStart(after, 'jack', postKey(tower), 0)!;
    expect(pick).toEqual({ defenderId: 'jack', postId: 2 });
    expect(after.base.posts[pick.postId]).toEqual(tower);
  });

  it('falls back when the picked post is no longer usable or the defender is unknown', () => {
    const g = newGame();
    let r = buildSegment(g.base, g.stock, g.tiers, 1, 0, 'wall', 'wood');
    if (!r.ok) throw new Error(r.reason);
    r = buildPost(r.base, r.stock, { kind: 'wall-walk', column: 1, row: 0 });
    if (!r.ok) throw new Error(r.reason);
    const walk = postKey({ kind: 'wall-walk', column: 1, row: 0 });
    const built: GameState = { ...g, base: r.base, stock: r.stock };
    const walkId = built.base.posts.findIndex((p) => postKey(p) === walk);
    expect(pickStart(built, 'john', walk, 0)).toEqual({ defenderId: 'john', postId: walkId });
    built.base.layers[1]!.slots[0]!.hp = 0; // the wall under it breaks
    expect(pickStart(built, 'nobody', walk, 0)).toEqual({ defenderId: 'bob', postId: 0 });
  });

  it('has no pick without a usable post', () => {
    const g = newGame();
    expect(pickStart({ ...g, base: { ...g.base, posts: [] } }, null, null, 0)).toBeNull();
  });

  it('skips injured defenders until they are back, and has no pick with nobody fit', () => {
    const g = newGame();
    g.roster[0]!.injuredUntil = 1000;
    expect(pickStart(g, 'bob', null, 999)).toEqual({ defenderId: 'jack', postId: 0 });
    expect(pickStart(g, 'bob', null, 1000)).toEqual({ defenderId: 'bob', postId: 0 });
    for (const d of g.roster) d.injuredUntil = 1000;
    expect(pickStart(g, null, null, 999)).toBeNull();
  });

  it('lists who is injured and when they are back', () => {
    const g = newGame();
    g.roster[1]!.injuredUntil = new Date(2026, 0, 1, 14, 5).getTime();
    const lines = injuredLines(g.roster, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Jack · injured, back at .*05/);
    expect(injuredLines(g.roster, g.roster[1]!.injuredUntil)).toEqual([]);
  });

  it('Load code: says why a code is refused, without asking', () => {
    const asked: string[] = [];
    const ask = (q: string) => (asked.push(q), true);
    const refused = { game: null, clearPaste: false };
    expect(loadCode('', ask)).toEqual({ ...refused, message: IMPORT_REFUSAL.empty });
    expect(loadCode('ID1:' + 'A'.repeat(200_000), ask)).toEqual({
      ...refused,
      message: IMPORT_REFUSAL.tooBig,
    });
    expect(loadCode('ID1:nope', ask)).toEqual({ ...refused, message: IMPORT_REFUSAL.bad });
    expect(asked).toEqual([]);
  });

  it('Load code: asks first; a no changes nothing, a yes loads and clears the box', () => {
    const g = { ...newGame(), hordeNumber: 5 };
    const code = exportCode(encodeSave(g, 1_800_000_000_000));
    const asked: string[] = [];
    expect(loadCode(code, (q) => (asked.push(q), false))).toEqual({
      game: null,
      message: '',
      clearPaste: false,
    });
    expect(asked).toEqual([IMPORT_CONFIRM]);
    expect(loadCode(code, () => true)).toEqual({ game: g, message: IMPORT_DONE, clearPaste: true });
  });

  it('shows the Lab: not built, then each node locked with its reason', () => {
    const g = { ...newGame(), stock: { scrap: 999, wood: 999, metal: 0, concrete: 0 } };
    const lines = labLines(g);
    expect(lines.map((l) => (l.kind === 'action' ? l.label : l.text))).toEqual([
      'Research Lab: not built',
      'Build Research Lab',
      'Research Metal walls',
      'Research Auto-turret',
    ]);
    const reasons = lines.map((l) =>
      l.kind === 'action' && !l.result.ok ? l.result.reason : null,
    );
    expect(reasons).toEqual([null, null, 'Needs a Research Lab', 'Needs Lab level 2']);
  });

  it('shows a levelled Lab with researched nodes as done and no upgrade at the top', () => {
    let g: GameState = { ...newGame(), stock: { scrap: 999, wood: 999, metal: 0, concrete: 0 } };
    for (let i = 0; i < 4; i++) {
      const next = labLines(g).find((l) => l.kind === 'action' && l.result.ok);
      if (next?.kind !== 'action' || !next.result.ok) throw new Error('nothing to do');
      g = next.result.game;
    }
    expect(labLines(g)).toEqual([
      { kind: 'heading', text: 'Research Lab · level 2' },
      { kind: 'note', text: 'Metal walls · researched' },
      { kind: 'note', text: 'Auto-turret · researched' },
    ]);
  });

  it('shows the generator to build, the Gas and the batteries in storage', () => {
    const g = newGame();
    const lines = powerLines(g);
    expect(lines.map((l) => (l.kind === 'action' ? l.label : l.text))).toEqual([
      'Generator: not built',
      'Build generator',
      'Gas 4 · Batteries in storage: none',
    ]);
    expect(lines[1]).toMatchObject({ cost: GENERATOR.cost, result: { ok: true } });
    const poor = powerLines({ ...g, stock: { ...g.stock, wood: 0 } })[1]!;
    expect(poor.kind === 'action' && !poor.result.ok && poor.result.reason).toBe('Not enough wood');
    const stored = {
      ...g,
      power: {
        ...g.power,
        batteries: { makeshift: 2, standard: 0, 'high-capacity': 1, military: 0 },
      },
    };
    expect(powerLines(stored)[2]).toEqual({
      kind: 'note',
      text: 'Gas 4 · Batteries in storage: 2 Makeshift, 1 High-capacity',
    });
  });

  it('says when the generator is running, or why it is idle', () => {
    const g = newGame();
    const at = 1_800_000_000_000;
    const state = (p: Partial<GameState['power']>): string => {
      const line = powerLines({ ...g, power: { ...g.power, ...p } })[0]!;
      return line.kind === 'action' ? line.label : line.text;
    };
    expect(state({ generator: { at } })).toBe(
      `Generator · running, next Gas at ${clockTime(at + GENERATOR.gasMs)}`,
    );
    expect(state({ gas: 0, generator: { at: null } })).toBe('Generator · idle: no Gas');
    expect(state({ bank: BANK_CAP, generator: { at: null } })).toBe(
      'Generator · idle: the bank is full',
    );
    expect(powerLines({ ...g, power: { ...g.power, generator: { at } } })).toHaveLength(2);
  });
});
