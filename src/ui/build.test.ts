import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment } from '../core/base.ts';
import { newGame, type GameState } from '../core/game.ts';
import { injuredLines, pickStart, postKey, stockBarText } from './build.ts';

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
});
