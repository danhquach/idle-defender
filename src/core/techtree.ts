// The Research Center's buying rules (ID-263): which nodes are open, what a purchase does,
// and the allow-list the save reader uses. Pure: no RNG, no clock, no DOM. There is no refund.
import { TECH, TECH_IDS, type TechId } from './data.ts';
import type { GameState } from './game.ts';
import type { Refusal } from './refusal.ts';

/** A node as the chart shows it: bought, ready to buy, or waiting on its prerequisite. */
export type TechState = 'done' | 'open' | 'locked';

/** The nodes researched, in `TECH_IDS` order; none for a game without the key. */
export const techOf = (g: Pick<GameState, 'tech'>): readonly TechId[] => g.tech ?? [];

const isTech = (x: unknown): x is TechId =>
  typeof x === 'string' && (TECH_IDS as readonly string[]).includes(x);

export function techState(g: Pick<GameState, 'tech'>, id: TechId): TechState {
  const have = techOf(g);
  if (have.includes(id)) return 'done';
  return TECH[id].needs.every((n) => have.includes(n)) ? 'open' : 'locked';
}

/** Nodes that list `id` among their prerequisites, in table order (the detail panel and the chart's lines). */
export const unlocksOf = (id: TechId): TechId[] =>
  TECH_IDS.filter((t) => TECH[t].needs.includes(id));

/** Why `id` can't be bought now, or null. Order: already researched, prerequisite (the first missing one), Scrap. */
export function techRefusal(g: Pick<GameState, 'tech' | 'stock'>, id: TechId): Refusal | null {
  if (!isTech(id)) return { ok: false, code: 'unknown-tech' };
  if (techOf(g).includes(id)) return { ok: false, code: 'researched' };
  const node = TECH[id];
  const missing = node.needs.find((n) => !techOf(g).includes(n));
  if (missing !== undefined) return { ok: false, code: 'needs-tech', node: missing };
  if (g.stock.scrap < node.cost) return { ok: false, code: 'tech-scrap', need: node.cost };
  return null;
}

/** What a purchase gives: the game after it and the Scrap it took, or why not. */
export type TechBuy = { ok: true; game: GameState; cost: number } | Refusal;

/** Buys node `id` (between hordes: the app checks that). Returns a new game; `g` is untouched. */
export function researchTech(g: GameState, id: TechId): TechBuy {
  const why = techRefusal(g, id);
  if (why !== null) return why;
  const cost = TECH[id].cost;
  return {
    ok: true,
    cost,
    game: {
      ...g,
      stock: { ...g.stock, scrap: g.stock.scrap - cost },
      tech: cleanTech([...techOf(g), id]),
    },
  };
}

/** Whether some node is open and affordable (the top bar's dot). */
export const techReady = (g: Pick<GameState, 'tech' | 'stock'>): boolean =>
  TECH_IDS.some((id) => techState(g, id) === 'open' && g.stock.scrap >= TECH[id].cost);

/**
 * The known nodes of `list`, each once, in `TECH_IDS` order, with every node with
 * a prerequisite missing dropped (a Tier 1 gone takes its Tier 2 and 3, and the Tier 4 above them). Exact string
 * compare, never an index by unchecked text; the result holds the table's own strings.
 */
export function cleanTech(list: readonly unknown[]): TechId[] {
  const kept = new Set<string>();
  for (const x of list) if (isTech(x)) kept.add(x);
  const out: TechId[] = [];
  for (const id of TECH_IDS) {
    if (kept.has(id) && TECH[id].needs.every((n) => out.includes(n))) out.push(id);
  }
  return out;
}
