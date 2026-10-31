import { describe, expect, it } from 'vitest';
import { buildPost, buildSegment, buildTrap, buildTurret, lineWall } from '../core/base.ts';
import {
  BANK_CAP,
  GENERATOR,
  RESEARCH,
  RESEARCH_IDS,
  SEGMENTS,
  TRAPS,
  TURRET,
  stockOf,
} from '../core/data.ts';
import { researchNow } from '../core/testing.ts';
import { durationText } from './perks.ts';
import { newGame, type GameState } from '../core/game.ts';
import { sendPatrol } from '../core/patrol.ts';
import {
  buildTurretLine,
  lineResult,
  injuredLines,
  labLines,
  lineWallLine,
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
import { clockTime, postName } from './hud.ts';

describe('build panel', () => {
  it('shows the next horde, every building material, and the other resources the camp has', () => {
    expect(stockBarText(newGame())).toBe(
      'Horde 1 next · Scrap 60 · Wood 60 · Metal 0 · Concrete 0 · Food 3',
    );
    const g = { ...newGame(), stock: stockOf({ scrap: 1, parts: 2, chemicals: 4, genes: 7 }) };
    expect(stockBarText(g)).toBe(
      'Horde 1 next · Scrap 1 · Wood 0 · Metal 0 · Concrete 0 · Parts 2 · Chemicals 4 · Genes 7',
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

  it('skips defenders out on patrol, and lists when they are back', () => {
    const r = sendPatrol({ ...newGame(), hordeNumber: 3 }, 'gas-station', ['bob'], 1, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(pickStart(r.game, 'bob', null, 0)).toEqual({ defenderId: 'jack', postId: 0 });
    expect(injuredLines(r.game, 0)).toEqual([`Bob · on patrol, back at ${clockTime(15 * 60_000)}`]);
  });

  it('lists who is injured and when they are back', () => {
    const g = newGame();
    g.roster[1]!.injuredUntil = new Date(2026, 0, 1, 14, 5).getTime();
    const lines = injuredLines(g, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Jack · injured, back at .*05/);
    expect(injuredLines(g, g.roster[1]!.injuredUntil)).toEqual([]);
  });

  it('shows the Lab: not built, then each node to queue for Genes, locked with its reason', () => {
    const g = { ...newGame(), stock: stockOf({ scrap: 999, wood: 999, genes: 999 }) };
    const lines = labLines(g, 0);
    expect(lines.map((l) => (l.kind === 'action' ? l.label : l.text))).toEqual([
      'Research Lab: not built',
      'Build Research Lab',
      ...RESEARCH_IDS.map(
        (id) => `Queue ${RESEARCH[id].name} (${durationText(RESEARCH[id].minutes)})`,
      ),
    ]);
    expect(lines[2]).toMatchObject({ cost: { genes: 10 } });
    expect(
      lines.slice(2).map((l) => l.kind === 'action' && !l.result.ok && l.result.reason),
    ).toEqual(
      RESEARCH_IDS.map((id) =>
        RESEARCH[id].lab === 1 ? 'Needs a Research Lab' : 'Needs Lab level 2',
      ),
    );
  });

  it('shows the queue: the running node with its end and Cancel, the waiting ones with Remove', () => {
    const T = new Date(2026, 0, 1, 14, 0).getTime();
    let g: GameState = { ...newGame(), lab: 1, stock: stockOf({ genes: 100 }) };
    const queueLine = (id: string) =>
      labLines(g, T).find((l) => l.kind === 'action' && l.label.startsWith(`Queue ${id}`));
    for (const name of ['Metal walls', 'Flashbang']) {
      const line = queueLine(name);
      if (line?.kind !== 'action') throw new Error(`no ${name}`);
      const r = line.act!(T);
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    }
    const lines = labLines(g, T);
    const shown = lines.map((l) => (l.kind === 'action' ? `[${l.label}]` : l.text));
    expect(shown.slice(2, 7)).toEqual([
      'Research queue',
      `Metal walls · running, done at ${clockTime(T + 15 * 60_000)}`,
      '[Cancel Metal walls (refunds 10 Genes)]',
      'Flashbang · waiting',
      '[Remove Flashbang (refunds 10 Genes)]',
    ]);
    // Queued nodes aren't offered again below.
    expect(shown.some((t) => t.startsWith('[Queue Metal walls'))).toBe(false);
    const cancel = lines[4]!;
    if (cancel.kind !== 'action') throw new Error('no cancel');
    const after = cancel.act!(T + 60_000);
    expect(after.ok && after.game.queue).toEqual({ ids: ['flashbang'], endsAt: T + 16 * 60_000 });
    expect(after.ok && after.game.stock.genes).toBe(90);
  });

  it('shows a levelled Lab with every node researched as done, a boss perk as owned', () => {
    let g: GameState = { ...newGame(), lab: 2 };
    g.perkLevels.fortify = 1; // from a boss horde
    for (const id of RESEARCH_IDS) {
      if (id === 'fortify') continue;
      const r = researchNow(g, id);
      if (!r.ok) throw new Error(r.reason);
      g = r.game;
    }
    expect(labLines(g, 0)).toEqual([
      { kind: 'heading', text: 'Research Lab · level 2' },
      ...RESEARCH_IDS.map((id) => ({
        kind: 'note',
        text: `${RESEARCH[id].name} · ${id === 'fortify' ? 'owned' : 'researched'}`,
      })),
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

describe('wall-walk spots (ID-048)', () => {
  const RICH = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });

  it('names each spot, and the start pick keeps and lists spot 2 apart from spot 1', () => {
    const g = { ...newGame(), stock: RICH };
    const r = lineWall(g.base, g.stock, 0);
    if (!r.ok) throw new Error(r.reason);
    const lined: GameState = { ...g, base: r.base, stock: r.stock };
    const second = { kind: 'wall-walk', column: 0, row: 3, spot: 1 } as const;
    expect(postName(second)).toBe('Wall-walk post · Layer 1, row 4, spot 2');
    expect(postName({ ...second, spot: undefined })).toBe(
      'Wall-walk post · Layer 1, row 4, spot 1',
    );
    expect(postName({ kind: 'tower', column: 0, row: 3 })).toBe('Tower · Layer 1, row 4');
    expect(postKey(second)).not.toBe(postKey({ ...second, spot: 0 }));
    expect(postKey({ ...second, spot: 0 })).toBe(postKey({ ...second, spot: undefined }));
    const pick = pickStart(lined, null, postKey(second), 0)!;
    expect(lined.base.posts[pick.postId]).toEqual(second);
  });

  it('"Line the wall" shows the total cost first and asks before going ahead', () => {
    const g = { ...newGame(), stock: RICH };
    const line = lineWallLine(g, 0);
    expect(line).toMatchObject({
      kind: 'action',
      label: 'Line the wall: 20 wall-walk posts',
      cost: { wood: 100, scrap: 100 },
      confirm: 'Line layer 1 with 20 wall-walk posts for 100 scrap, 100 wood?',
      result: { ok: true },
    });
    expect(lineResult(line, () => false)).toBeNull();
    const done = lineResult(line, () => true);
    expect(done?.ok && done.base.posts.filter((p) => p.kind === 'wall-walk')).toHaveLength(20);
  });

  it('"Line the wall" says how many the stock covers when short, and refuses with none free', () => {
    const g = { ...newGame(), stock: stockOf({ scrap: 23, wood: 60, metal: 0, concrete: 0 }) };
    const line = lineWallLine(g, 0);
    expect(line).toMatchObject({
      confirm: 'Line layer 1 with 20 wall-walk posts for 100 scrap, 100 wood? The stock covers 4.',
      result: { ok: true },
    });
    const r = lineWall(g.base, RICH, 0);
    if (!r.ok) throw new Error(r.reason);
    const full = lineWallLine({ ...g, base: r.base }, 0);
    expect(full).toMatchObject({
      label: 'Line the wall',
      cost: null,
      result: { ok: false, reason: 'No free spot on this wall' },
    });
  });
});

describe('turret menu', () => {
  const RICH = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });
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
    expect(line).toMatchObject({ label: 'Auto-turret (wall mount, spot 1)', result: { ok: true } });
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
    // and the turret's own (row 6), and both wall mounts on each segment.
    expect(targets.map((t) => t.label)).toEqual([
      ...FREE_TOWER_ROWS.map((row) => `Tower · Layer 1, row ${row + 1}`),
      ...Array.from({ length: SEGMENTS }, (_, row) =>
        [1, 2].map((spot) => `Wall mount · Layer 1, row ${row + 1}, spot ${spot}`),
      ).flat(),
    ]);
    expect(new Set(targets.map((t) => t.key)).size).toBe(targets.length);
    const to = targets.find((t) => t.key === 'wall-walk:0:4:0')!;
    expect(to.result.base.turrets).toEqual([
      { mount: 'wall-walk', column: 0, row: 4, condition: 40 },
    ]);
    const second = targets.find((t) => t.key === 'wall-walk:0:4:1')!;
    expect(second.result.base.turrets).toEqual([
      { mount: 'wall-walk', column: 0, row: 4, spot: 1, condition: 40 },
    ]);
    expect(to.result.stock).toEqual(g.stock);
  });

  it('relocate has nowhere to go when every mount is taken', () => {
    let g = withTurret();
    g.stock = { ...g.stock, scrap: 9999, wood: 9999 }; // 27 turrets
    for (const [mount, row, spot] of [
      ...FREE_TOWER_ROWS.map((r) => ['tower', r, 0] as const),
      ...Array.from({ length: SEGMENTS }, (_, r) => ['wall-walk', r, 0] as const),
      ...Array.from({ length: SEGMENTS }, (_, r) => ['wall-walk', r, 1] as const),
    ] as const) {
      const r = buildTurret(g.base, g.stock, true, mount, 0, row, spot);
      if (!r.ok) throw new Error(r.reason);
      g = { ...g, base: r.base, stock: r.stock };
    }
    expect(relocateTargets(g, 0)).toEqual([]);
  });
});

describe('trap menu', () => {
  const RICH = stockOf({ scrap: 999, wood: 999, metal: 0, concrete: 0 });
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
    const poor: GameState = {
      ...newGame(),
      stock: stockOf({ scrap: 0, wood: 99, metal: 0, concrete: 0 }),
    };
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
