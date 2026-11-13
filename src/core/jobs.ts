// Professions (ID-149, design §6): rolling one for a survivor. Every profession is as
// likely as any other and repeats are allowed; the roll comes only from core RNG. Pure.
import { JOB_IDS, type JobId } from './data.ts';
import { createRng, pick, type Rng } from './rng.ts';

/** A profession, each as likely. */
export const rollJob = (rng: Rng): JobId => pick(rng, JOB_IDS);

/** The stream a profession rolls from, so it never moves any other roll. */
const JOB_STREAM = 0x2f6b1c3d;

/** FNV-1a: a 32-bit seed from `text`. */
export function textSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The profession survivor `key` rolls with `seed` (ID-149): random, but always the same for
 * the same pair, so a horde's seed (or an old save's text) decides it.
 */
export const jobFor = (key: string, seed = 0): JobId =>
  rollJob(createRng(textSeed(key) ^ seed ^ JOB_STREAM));
