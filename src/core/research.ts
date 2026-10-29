// The Research Lab (design §11, as built ID-014): a camp building levelled with
// materials, where research nodes are bought with materials and complete at once.
// Pure: each action returns a new game, or a refusal the UI shows as-is.
import { LAB_LEVELS, MATERIALS, RESEARCH, type ResearchId, type Stock } from './data.ts';
import type { GameState } from './game.ts';

export type GameResult = { ok: true; game: GameState } | { ok: false; reason: string };

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

/** Why `id` can't be researched yet (ignoring cost), or null when it can. */
export function researchLock(
  game: Pick<GameState, 'lab' | 'research'>,
  id: ResearchId,
): string | null {
  const node = nodeOf(id);
  if (game.research.includes(id)) return 'Already researched';
  if (game.lab < node.lab)
    return node.lab === 1 ? 'Needs a Research Lab' : `Needs Lab level ${node.lab}`;
  if (node.needs && !game.research.includes(node.needs)) {
    return `Needs ${RESEARCH[node.needs].name}`;
  }
  return null;
}

/** Researches `id`: pays its cost and unlocks its barrier tier, if any. */
export function research(game: GameState, id: ResearchId): GameResult {
  const node = nodeOf(id);
  const lock = researchLock(game, id);
  if (lock) return { ok: false, reason: lock };
  return pay(game, node.cost, (g) => {
    g.research.push(id);
    if (node.tier && !g.tiers.includes(node.tier)) g.tiers.push(node.tier);
  });
}

export const researched = (game: Pick<GameState, 'research'>, id: ResearchId): boolean =>
  game.research.includes(id);

function nodeOf(id: ResearchId): (typeof RESEARCH)[ResearchId] {
  if (!Object.hasOwn(RESEARCH, id)) throw new RangeError(`research: unknown node ${String(id)}`);
  return RESEARCH[id];
}

/** Charges `cost` and applies `change` to a copy, or refuses naming the first short material. */
function pay(game: GameState, cost: Partial<Stock>, change: (g: GameState) => void): GameResult {
  const short = MATERIALS.find((m) => game.stock[m] < (cost[m] ?? 0));
  if (short) return { ok: false, reason: `Not enough ${short}` };
  const g = structuredClone(game);
  for (const m of MATERIALS) g.stock[m] -= cost[m] ?? 0;
  change(g);
  return { ok: true, game: g };
}
