// The Research Lab (design §11, as built ID-014, ID-035): a camp building levelled with
// materials, and a research queue paid in Mutated Genes. One entry runs at a time in real
// time, with up to three waiting; it keeps running while the game is closed. Perk levels
// share the queue. Pure: each action returns a new game, or a refusal the UI shows as-is,
// and real time comes in as `now` (ms since the epoch).
import {
  LAB_LEVELS,
  MATERIALS,
  MAX_COUNT,
  PERK_IDS,
  PERK_LEVEL,
  PERKS,
  RESEARCH,
  RESEARCH_QUEUE,
  type PerkId,
  type ResearchId,
  type Stock,
} from './data.ts';
import type { GameState } from './game.ts';
import type { Refusal } from './base.ts';

export type GameResult = { ok: true; game: GameState } | Refusal;

/** A perk's next level, as a queue entry. */
export type PerkLevelId = `level-${PerkId}`;
/** What the research queue holds: research nodes and perk levels. */
export type QueueId = ResearchId | PerkLevelId;

/** The research queue: the running entry first; `endsAt` (ms) is when it finishes, null when empty. */
export interface ResearchQueue {
  ids: QueueId[];
  endsAt: number | null;
}

const MINUTE = 60_000;

export const newQueue = (): ResearchQueue => ({ ids: [], endsAt: null });

/** What the next Lab level costs, or null at the top level. */
export function labCost(game: Pick<GameState, 'lab'>): Partial<Stock> | null {
  return LAB_LEVELS[game.lab] ?? null;
}

/** Builds the Lab (level 0 → 1) or upgrades it a level. */
export function upgradeLab(game: GameState): GameResult {
  const cost = labCost(game);
  if (!cost) return { ok: false, reason: 'The Lab is at the top level' };
  return pay(game, cost, (g) => {
    g.lab += 1;
  });
}

export const researched = (game: Pick<GameState, 'research'>, id: ResearchId): boolean =>
  game.research.includes(id);

/** The perk a queue entry levels up, or null for a research node. */
export function perkOfEntry(id: QueueId): PerkId | null {
  if (!id.startsWith('level-')) return null;
  const perk = id.slice('level-'.length);
  return (PERK_IDS as readonly string[]).includes(perk) ? (perk as PerkId) : null;
}

/** Whether `id` names a queue entry: a research node or a perk's next level. */
export const isQueueId = (id: string): id is QueueId =>
  Object.hasOwn(RESEARCH, id) || perkOfEntry(id as QueueId) !== null;

type QueueView = Pick<GameState, 'perkLevels'>;

/**
 * Entry `id`'s name, price and minutes. A perk level is the one after the perk's level
 * when it starts: its own node, if that is ahead in the queue, makes it level 1.
 */
export function entryOf(
  game: QueueView,
  id: QueueId,
): { name: string; genes: number; minutes: number } {
  const perk = perkOfEntry(id);
  if (perk === null) {
    if (!Object.hasOwn(RESEARCH, id)) throw new RangeError(`research: unknown node ${String(id)}`);
    const node = RESEARCH[id as ResearchId];
    return { name: node.name, genes: node.genes, minutes: node.minutes };
  }
  const from = Math.max(1, game.perkLevels[perk]);
  const at = Math.min(from, PERK_LEVEL.top - 1) - 1;
  return {
    name: `${PERKS[perk].name} level ${from + 1}`,
    genes: PERK_LEVEL.genes[at]!,
    minutes: PERK_LEVEL.minutes[at]!,
  };
}

/** Whether perk `perk` is owned, or will be once the queue ahead of it is done. */
const willOwn = (game: Pick<GameState, 'perkLevels' | 'queue'>, perk: PerkId): boolean =>
  game.perkLevels[perk] >= 1 || (game.queue.ids as readonly string[]).includes(perk);

/** The refusal while the queue has no room: it passes once an entry is done. */
export const QUEUE_FULL = 'The research queue is full';

/** Why `id` can't be queued now (cost aside), or null when it can. Unknown ids throw. */
export function queueLock(
  game: Pick<GameState, 'lab' | 'research' | 'perkLevels' | 'queue'>,
  id: QueueId,
): string | null {
  const perk = perkOfEntry(id);
  entryOf(game, id); // throws on an unknown id
  if (perk === null) {
    const node = RESEARCH[id as ResearchId];
    if (game.research.includes(id as ResearchId)) return 'Already researched';
    if (Object.hasOwn(PERKS, id) && game.perkLevels[id as PerkId] >= 1) return 'Already owned';
    if (game.queue.ids.includes(id)) return 'Already queued';
    if (game.lab < node.lab)
      return node.lab === 1 ? 'Needs a Research Lab' : `Needs Lab level ${node.lab}`;
    if (node.needs && !game.research.includes(node.needs) && !game.queue.ids.includes(node.needs))
      return `Needs ${RESEARCH[node.needs].name}`;
  } else {
    if (game.queue.ids.includes(id)) return 'Already queued';
    if (game.lab < 1) return 'Needs a Research Lab';
    if (!willOwn(game, perk)) return `Needs ${PERKS[perk].name}`;
    if (game.perkLevels[perk] >= PERK_LEVEL.top) return `${PERKS[perk].name} is at the top level`;
  }
  if (game.queue.ids.length >= RESEARCH_QUEUE.size) return QUEUE_FULL;
  return null;
}

/**
 * Queues `id` at `now`: pays its Genes, and starts it at once when the queue is empty.
 * The queue is run to `now` first, so entries already done make room.
 */
export function queueResearch(state: GameState, id: QueueId, now: number): GameResult {
  finite('queueResearch', now);
  const game = advanceResearch(state, now);
  const lock = queueLock(game, id);
  if (lock) return { ok: false, reason: lock };
  const { genes, minutes } = entryOf(game, id);
  return pay(game, { genes }, (g) => {
    g.queue.ids.push(id);
    if (g.queue.endsAt === null) g.queue.endsAt = now + minutes * MINUTE;
  });
}

/**
 * Why queue entry `id` can't be removed, or null when it can: it isn't queued (any more),
 * or an entry behind it needs it.
 */
export function unqueueLock(
  game: Pick<GameState, 'perkLevels' | 'queue'>,
  id: QueueId,
): string | null {
  const index = game.queue.ids.indexOf(id);
  if (index < 0) return 'Not in the queue';
  for (const later of game.queue.ids.slice(index + 1)) {
    const perk = perkOfEntry(later);
    const needs =
      perk === null
        ? RESEARCH[later as ResearchId].needs === id
        : perk === id && game.perkLevels[perk] < 1;
    if (needs) return `${entryOf(game, later).name} needs it`;
  }
  return null;
}

/**
 * Removes queue entry `id` at `now` and refunds its Genes in full. Removing the running
 * one cancels it, and the next starts at `now`. The queue is run to `now` first, so an
 * entry that has finished is done, not refunded.
 */
export function unqueue(state: GameState, id: QueueId, now: number): GameResult {
  finite('unqueue', now);
  const game = advanceResearch(state, now);
  const lock = unqueueLock(game, id);
  if (lock) return { ok: false, reason: lock };
  return { ok: true, game: dropEntry(game, game.queue.ids.indexOf(id), now) };
}

/** Takes entry `index` out with a full refund, no questions asked (a boss perk uses it too). */
export function dropEntry(game: GameState, index: number, now: number): GameState {
  const g = structuredClone(game);
  const [id] = g.queue.ids.splice(index, 1);
  g.stock.genes = Math.min(MAX_COUNT, g.stock.genes + entryOf(game, id!).genes);
  if (index === 0) {
    const next = g.queue.ids[0];
    g.queue.endsAt = next === undefined ? null : now + entryOf(g, next).minutes * MINUTE;
  }
  return g;
}

/**
 * Runs the queue up to `now`: each entry that has finished takes effect, and the next
 * starts when it ended, so time while the game was closed counts. Returns `game` itself
 * when nothing finished.
 */
export function advanceResearch(game: GameState, now: number): GameState {
  finite('advanceResearch', now);
  const { endsAt } = game.queue;
  if (endsAt === null || now < endsAt) return game;
  const g = structuredClone(game);
  let end = endsAt;
  while (g.queue.ids.length > 0 && now >= end) {
    complete(g, g.queue.ids.shift()!);
    const next = g.queue.ids[0];
    if (next !== undefined) end += entryOf(g, next).minutes * MINUTE;
  }
  g.queue.endsAt = g.queue.ids.length > 0 ? end : null;
  return g;
}

/** Ms left on the running entry at `now`, or null when the queue is empty. */
export function researchLeft(queue: ResearchQueue, now: number): number | null {
  return queue.endsAt === null ? null : Math.max(0, queue.endsAt - now);
}

/** Entry `id` takes effect: a node is researched (a perk node owns its perk), a perk goes up a level. */
function complete(g: GameState, id: QueueId): void {
  const perk = perkOfEntry(id);
  if (perk !== null) {
    g.perkLevels[perk] = Math.min(PERK_LEVEL.top, Math.max(1, g.perkLevels[perk]) + 1);
    return;
  }
  const rid = id as ResearchId;
  g.research.push(rid);
  const tier = RESEARCH[rid].tier;
  if (tier && !g.tiers.includes(tier)) g.tiers.push(tier);
  if (Object.hasOwn(PERKS, rid)) {
    const p = rid as PerkId;
    g.perkLevels[p] = Math.max(1, g.perkLevels[p]);
  }
}

function finite(name: string, now: number): void {
  if (!Number.isFinite(now)) throw new RangeError(`${name}: bad time ${now}`);
}

/** Charges `cost` and applies `change` to a copy, or refuses naming the first short material. */
export function pay(
  game: GameState,
  cost: Partial<Stock>,
  change: (g: GameState) => void,
): GameResult {
  const short = MATERIALS.find((m) => game.stock[m] < (cost[m] ?? 0));
  if (short) return { ok: false, reason: `Not enough ${short}`, short: true };
  const g = structuredClone(game);
  for (const m of MATERIALS) g.stock[m] -= cost[m] ?? 0;
  change(g);
  return { ok: true, game: g };
}
