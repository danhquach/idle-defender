import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, buildTrap, buildTurret } from '../core/base.ts';
import { BANK_CAP, GENERATOR, SEGMENTS, TRAPS, TURRET } from '../core/data.ts';
import { newGame, type GameState } from '../core/game.ts';
import { exportCode } from '../storage/code.ts';
import { encodeSave } from '../storage/save.ts';
import {
  buildTurretLine,
  lineResult,
  IMPORT_CONFIRM,
  IMPORT_DONE,
  FIELD_GREW,
  IMPORT_REFUSAL,
  injuredLines,
  labLines,
  loadCode,
  pickStart,
  postKey,
  powerLines,
  relocateTargets,
  stockBarText,
  trapLines,
  turretIndex,
  turretLines,
  type SlotLine,
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
    // A code from before the taller field (a v1 save, 5 rows) says the field grew.
    const old = JSON.parse(encodeSave(g, 1_800_000_000_000));
    old.v = 1;
    old.game.base.layers[0].slots = old.game.base.layers[0].slots.slice(3, 8);
    old.game.base.posts = old.game.base.posts.map((p: { row: number }) => ({
      ...p,
      row: p.row - 3,
    }));
    const loaded = loadCode(exportCode(JSON.stringify(old)), () => true);
    expect(loaded.message).toBe(`${IMPORT_DONE} ${FIELD_GREW}`);
    expect(loaded.game?.base.posts).toEqual(g.base.posts);
  });

  it('shows the Lab: not built, then each node locked with its reason', () => {
    const g = { ...newGame(), stock: { scrap: 999, wood: 999, metal: 0, concrete: 0 } };
    const lines = labLines(g);
    expect(lines.map((l) => (l.kind === 'action' ? l.label : l.text))).toEqual([
      'Research Lab: not built',
      'Build Research Lab',
      'Research Metal walls',
      'Research Auto-turret',
      'Research Flashbang',
      'Research Molotov',
      'Research Airstrike',
    ]);
    const reasons = lines.map((l) =>
      l.kind === 'action' && !l.result.ok ? l.result.reason : null,
    );
    expect(reasons).toEqual([
      null,
      null,
      'Needs a Research Lab',
      'Needs Lab level 2',
      'Needs a Research Lab',
      'Needs a Research Lab',
      'Needs Lab level 2',
    ]);
  });

  it('shows a levelled Lab with researched nodes as done and no upgrade at the top', () => {
    let g: GameState = { ...newGame(), stock: { scrap: 999, wood: 999, metal: 0, concrete: 0 } };
    for (let i = 0; i < 7; i++) {
      const next = labLines(g).find((l) => l.kind === 'action' && l.result.ok);
      if (next?.kind !== 'action' || !next.result.ok) throw new Error('nothing to do');
      g = next.result.game;
    }
    expect(labLines(g)).toEqual([
      { kind: 'heading', text: 'Research Lab · level 2' },
      { kind: 'note', text: 'Metal walls · researched' },
      { kind: 'note', text: 'Auto-turret · researched' },
      { kind: 'note', text: 'Flashbang · researched' },
      { kind: 'note', text: 'Molotov · researched' },
      { kind: 'note', text: 'Airstrike · researched' },
    ]);
  });

  it('shows the generator to build, the Gas and the batteries in storage', () => {
    const g = newGame();
    const lines = powerLines(g);
    expect(lines.map((l) => (l.kind === 'action' ? l.label : l.text))).toEqual([
      'Generator: not built',
      'Bank 120/1,000',
      'Build generator',
      'Gas 4 · Batteries in storage: none',
    ]);
    expect(lines[2]).toMatchObject({ cost: GENERATOR.cost, result: { ok: true } });
    const poor = powerLines({ ...g, stock: { ...g.stock, wood: 0 } })[2]!;
    expect(poor.kind === 'action' && !poor.result.ok && poor.result.reason).toBe('Not enough wood');
    const stored = {
      ...g,
      power: {
        ...g.power,
        batteries: { makeshift: 2, standard: 0, 'high-capacity': 1, military: 0 },
      },
    };
    expect(powerLines(stored)[3]).toEqual({
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
    expect(powerLines({ ...g, power: { ...g.power, generator: { at } } })).toHaveLength(3);
  });

  it('shows the bank as a meter from empty to the cap, whole charge only', () => {
    const g = newGame();
    const meter = (bank: number) => powerLines({ ...g, power: { ...g.power, bank } })[1];
    expect(meter(0)).toEqual({ kind: 'meter', text: 'Bank 0/1,000', value: 0, max: BANK_CAP });
    expect(meter(419.9)).toMatchObject({ text: 'Bank 419/1,000', value: 419.9 });
    expect(meter(0.4)).toMatchObject({ text: 'Bank 1/1,000' }); // turrets still lit
    expect(meter(BANK_CAP)).toMatchObject({ text: 'Bank 1,000/1,000', value: BANK_CAP });
  });
});

describe('turret menu', () => {
  const RICH = { scrap: 999, wood: 999, metal: 0, concrete: 0 };
  /** A new game with the Auto-turret researched and a turret on the free tower at row 2. */
  function withTurret(): GameState {
    const g: GameState = { ...newGame(), stock: RICH, research: ['metal-walls', 'auto-turret'] };
    const r = buildTurret(g.base, g.stock, true, 'tower', 0, 5);
    if (!r.ok) throw new Error(r.reason);
    return { ...g, base: r.base, stock: r.stock };
  }
  const text = (l: SlotLine): string => (l.kind === 'action' ? l.label : l.text);
  const why = (l: SlotLine): string | null =>
    l.kind === 'action' && !l.result.ok ? l.result.reason : null;
  /** Tower mounts still free with `withTurret()` on the starting base (posts on 4, 6; turret on 5). */
  const FREE_TOWER_ROWS = [0, 1, 2, 3, 7, 8, 9];

  it('offers an Auto-turret on a free mount, refused until it is researched', () => {
    const g = { ...newGame(), stock: RICH };
    expect(buildTurretLine(g, 'tower', 0, 5)).toMatchObject({
      label: 'Auto-turret',
      cost: TURRET.cost,
      result: { ok: false, reason: 'Research the Auto-turret first' },
    });
    const done: GameState = { ...g, research: ['metal-walls', 'auto-turret'] };
    const line = buildTurretLine(done, 'wall-walk', 0, 4);
    expect(line).toMatchObject({ label: 'Auto-turret (wall mount)', result: { ok: true } });
    expect(line.kind === 'action' && line.result.ok && line.result.base.turrets).toEqual([
      { mount: 'wall-walk', column: 0, row: 4, condition: 100 },
    ]);
    expect(why(buildTurretLine(done, 'tower', 0, 4))).toBe('Slot taken');
    expect(why(buildTurretLine(done, 'tower', 1, 0))).toBe('A tower mount needs a wall in front');
    expect(why(buildTurretLine({ ...done, stock: { ...RICH, scrap: 39 } }, 'tower', 0, 0))).toBe(
      'Not enough scrap',
    );
  });

  it('shows where a turret is, its condition and that it is powered; Repair and Salvage', () => {
    const g = withTurret();
    const i = turretIndex(g, 'tower', 0, 5);
    expect(i).toBe(0);
    expect(turretIndex(g, 'wall-walk', 0, 2)).toBe(-1);
    const lines = turretLines(g, i);
    expect(lines.map(text)).toEqual([
      'Auto-turret · Tower · Layer 1, row 6',
      'Condition 100/100 · powered',
      'Repair turret',
      'Salvage for 20 scrap, 10 wood',
    ]);
    expect(why(lines[2]!)).toBe('Nothing to repair');
    expect(lines[3]).toMatchObject({
      cost: null,
      confirm: 'Salvage this turret for 20 scrap, 10 wood? It is dismantled.',
    });
    // Salvage asks first: a no does nothing, a yes dismantles it.
    const asked: string[] = [];
    expect(lineResult(lines[3]!, (q) => (asked.push(q), false))).toBeNull();
    expect(lineResult(lines[3]!, () => true)).toMatchObject({ ok: true, base: { turrets: [] } });
    expect(asked).toEqual(['Salvage this turret for 20 scrap, 10 wood? It is dismantled.']);
    // Repair asks nothing; a refused line gives nothing.
    expect(lineResult(lines[2]!, () => true)).toBeNull();
    expect(lineResult(lines[0]!, () => true)).toBeNull();
    const salvaged = lines[3]!;
    expect(
      salvaged.kind === 'action' && salvaged.result.ok && salvaged.result.base.turrets,
    ).toEqual([]);
  });

  it('a worn turret: its repair cost, a smaller refund, and each state by name', () => {
    const g = withTurret();
    g.base.turrets[0]!.condition = 99.8; // any wear shows, as Repair is then offered
    expect(text(turretLines(g, 0)[1]!)).toBe('Condition 99/100 · powered');
    g.base.turrets[0]!.condition = 0.3; // not jammed yet, so never shown as 0
    expect(text(turretLines(g, 0)[1]!)).toBe('Condition 1/100 · powered');
    g.base.turrets[0]!.condition = 60.2;
    let lines = turretLines(g, 0);
    expect(text(lines[1]!)).toBe('Condition 60/100 · powered');
    expect(lines[2]).toMatchObject({ cost: { scrap: 8 }, result: { ok: true } });
    expect(text(lines[3]!)).toBe('Salvage for 12 scrap, 6 wood');
    lines = turretLines({ ...g, power: { ...g.power, bank: 0 } }, 0);
    expect(text(lines[1]!)).toBe('Condition 60/100 · dark: the bank is empty');
    g.base.turrets[0]!.condition = 0;
    lines = turretLines(g, 0);
    expect(text(lines[1]!)).toBe('Condition 0/100 · jammed');
    expect(text(lines[3]!)).toBe('Salvage for nothing');
  });

  it('a wall turret over a broken segment is offline', () => {
    const g = withTurret();
    const r = buildTurret(g.base, g.stock, true, 'wall-walk', 0, 0);
    if (!r.ok) throw new Error(r.reason);
    const broken: GameState = { ...g, base: r.base, stock: r.stock };
    broken.base.layers[0]!.slots[0]!.hp = 0;
    const i = turretIndex(broken, 'wall-walk', 0, 0);
    expect(text(turretLines(broken, i)[1]!)).toBe(
      'Condition 100/100 · offline: its wall is broken',
    );
  });

  it('relocate lists every free mount it may move to, in field order, each a working move', () => {
    const g = withTurret();
    g.base.turrets[0]!.condition = 40;
    const targets = relocateTargets(g, 0);
    // The starting base: free tower mounts on every row but the two tower posts (rows 5, 7)
    // and the turret's own (row 6), and a wall mount on each segment.
    expect(targets.map((t) => t.label)).toEqual([
      ...FREE_TOWER_ROWS.map((row) => `Tower · Layer 1, row ${row + 1}`),
      ...Array.from({ length: SEGMENTS }, (_, row) => `Wall mount · Layer 1, row ${row + 1}`),
    ]);
    expect(new Set(targets.map((t) => t.key)).size).toBe(targets.length);
    const to = targets.find((t) => t.key === 'wall-walk:0:4')!;
    expect(to.result.base.turrets).toEqual([
      { mount: 'wall-walk', column: 0, row: 4, condition: 40 },
    ]);
    expect(to.result.stock).toEqual(g.stock);
  });

  it('relocate has nowhere to go when every mount is taken', () => {
    let g = withTurret();
    for (const [mount, row] of [
      ...FREE_TOWER_ROWS.map((r) => ['tower', r] as const),
      ...Array.from({ length: SEGMENTS }, (_, r) => ['wall-walk', r] as const),
    ] as const) {
      const r = buildTurret(g.base, g.stock, true, mount, 0, row);
      if (!r.ok) throw new Error(r.reason);
      g = { ...g, base: r.base, stock: r.stock };
    }
    expect(relocateTargets(g, 0)).toEqual([]);
  });
});

describe('trap menu', () => {
  const RICH = { scrap: 999, wood: 999, metal: 0, concrete: 0 };
  const text = (l: SlotLine): string => (l.kind === 'action' ? l.label : l.text);
  const why = (l: SlotLine): string | null =>
    l.kind === 'action' && !l.result.ok ? l.result.reason : null;
  /** A new game with spikes in row 2. */
  function withSpikes(): GameState {
    const g: GameState = { ...newGame(), stock: RICH };
    const r = buildTrap(g.base, g.stock, 'spikes', 2);
    if (!r.ok) throw new Error(r.reason);
    return { ...g, base: r.base, stock: r.stock };
  }

  it('offers both basic traps in an empty cell, from a new game, as dry runs', () => {
    const lines = trapLines(newGame(), 0);
    expect(lines.map(text)).toEqual(['Trap strip · row 1: empty', 'Spikes', 'Barbed wire']);
    expect(lines[1]).toMatchObject({ cost: TRAPS.spikes.cost, result: { ok: true } });
    expect(lines[2]).toMatchObject({ cost: TRAPS.wire.cost, result: { ok: true } });
    const poor: GameState = { ...newGame(), stock: { scrap: 0, wood: 99, metal: 0, concrete: 0 } };
    expect(trapLines(poor, 0).slice(1).map(why)).toEqual(['Not enough scrap', 'Not enough scrap']);
  });

  it('shows a built trap with its durability, Repair and Remove', () => {
    const g = withSpikes();
    const lines = trapLines(g, 2);
    expect(lines.map(text)).toEqual([
      'Spikes · Trap strip · row 3',
      'Durability 30/30',
      'Repair trap',
      'Remove for 5 scrap, 7 wood',
    ]);
    expect(why(lines[2]!)).toBe('Nothing to repair');
    expect(lines[3]).toMatchObject({
      cost: null,
      confirm: 'Remove this trap for 5 scrap, 7 wood?',
    });
  });

  it('marks a broken trap and repairs it for its build cost', () => {
    const g = withSpikes();
    g.base.traps[0]!.durability = 0;
    const lines = trapLines(g, 2);
    expect(text(lines[1]!)).toBe('Durability 0/30 · broken');
    expect(lines[2]).toMatchObject({ cost: { wood: 15, scrap: 10 }, result: { ok: true } });
    expect(text(lines[3]!)).toBe('Remove for nothing');
  });

  it('removes only once the player agrees', () => {
    const lines = trapLines(withSpikes(), 2);
    expect(lineResult(lines[3]!, () => false)).toBeNull();
    expect(lineResult(lines[3]!, () => true)).toMatchObject({ ok: true, base: { traps: [] } });
  });
});
