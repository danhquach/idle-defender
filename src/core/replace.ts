// Design §4: between waves, the fight pauses to offer a replacement from the bench for
// each injured defender, one offer each, in injury order. Pure, like the card actions.
import { levelUp, postUsable } from './cards.ts';
import { standing, type HordeState, type MoveResult, type Post } from './horde.ts';
import { rngFrom } from './rng.ts';

const free = (s: HordeState, p: Post): boolean => p.defenderId === null && postUsable(s.layers, p);

/**
 * Opens the next replacement offer: the first injury not yet offered, when the bench
 * has someone and a post is free. The injured one's post if it's free and usable,
 * else the player's pick. Mutates `s`.
 */
export function openReplace(s: HordeState): void {
  if (s.replace !== null || s.bench.length === 0) return;
  const injury = s.injured.find((i) => !i.offered);
  if (!injury) return;
  const own = s.posts[injury.postId]!;
  if (free(s, own)) s.replace = { injuredId: injury.defender.id, postId: own.id };
  else if (s.posts.some((p) => free(s, p)))
    s.replace = { injuredId: injury.defender.id, postId: null };
}

/** Posts the open offer's replacement may take: the injured one's, or every free usable post. */
export function replacePosts(state: HordeState): Post[] {
  const offer = state.replace;
  if (!offer) return [];
  if (offer.postId !== null) return [state.posts[offer.postId]!];
  return state.posts.filter((p) => free(state, p));
}

/** Closes the open offer and opens the next one, or the card pick its banked XP is due. */
function close(s: HordeState): void {
  const injury = s.injured.find((i) => i.defender.id === s.replace!.injuredId)!;
  injury.offered = true;
  s.replace = null;
  openReplace(s);
  levelUp(s, rngFrom(s.rng));
}

/**
 * Sends bench defender `defenderId` in to post `postId` for the open offer; returns a
 * new state. Refuses a taken or unusable post with a reason; throws with no offer
 * open, an unknown bench id, or a post the offer doesn't allow.
 */
export function replaceInjured(state: HordeState, defenderId: string, postId: number): MoveResult {
  const offer = state.replace;
  if (!offer) throw new RangeError('replaceInjured: no replacement offer');
  if (!state.bench.some((d) => d.id === defenderId)) {
    throw new RangeError(`replaceInjured: ${String(defenderId)} is not on the bench`);
  }
  const post = Number.isInteger(postId) ? state.posts[postId] : undefined;
  if (!post || (offer.postId !== null && postId !== offer.postId)) {
    throw new RangeError(`replaceInjured: post ${postId} is not on offer`);
  }
  if (post.defenderId !== null) return { ok: false, reason: 'Post taken' };
  if (!postUsable(state.layers, post)) return { ok: false, reason: 'No wall to stand on' };
  const s = structuredClone(state);
  const index = s.bench.findIndex((d) => d.id === defenderId);
  const [spec] = s.bench.splice(index, 1);
  s.defenders.push(standing(spec!, s.posts[postId]!, s.time));
  s.posts[postId]!.defenderId = spec!.id;
  // A defender dropped to the bench earlier already took part: XP once.
  if (!s.tookPart.includes(spec!.id)) s.tookPart.push(spec!.id);
  close(s);
  return { ok: true, state: s };
}

/** Turns down the open offer; returns a new state. Throws with no offer open. */
export function skipReplace(state: HordeState): HordeState {
  if (!state.replace) throw new RangeError('skipReplace: no replacement offer');
  const s = structuredClone(state);
  close(s);
  return s;
}
