// Balance results cache (ID-142): a balance test's plays are a pure function of the
// simulation's code (src/core, lint-enforced pure), Node's version and the test's own
// settings, so their results are kept on disk and replayed only when one of those changes.
// Every assertion still runs, on the kept results. `BALANCE_CACHE=off` plays everything.
// Fixtures only; never imported by game code.
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadId } from 'node:worker_threads';

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Git-ignored; outside node_modules, so `npm ci` keeps it. */
export const CACHE_DIR = join(CORE, '..', '..', '.cache', 'balance');

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Every non-test source file under src/core, by path from it, sorted. */
function sources(dir = CORE, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) out.push(...sources(join(dir, entry.name), `${rel}/`));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(rel);
  }
  return out.sort();
}

let simHash: string | undefined;
/** The simulation's fingerprint: Node's version and every core source, path and text. */
function sim(): string {
  if (simHash !== undefined) return simHash;
  const h = createHash('sha256').update(process.version);
  for (const rel of sources()) h.update(`\0${rel}\0`).update(readFileSync(join(CORE, rel)));
  simHash = h.digest('hex').slice(0, 16);
  return simHash;
}

const pruned = new Set<string>();
/** `root`'s folder for this simulation code; older code's folders are dropped, once. */
function folder(root: string): string {
  const current = sim();
  if (!pruned.has(root)) {
    pruned.add(root);
    try {
      // A linked folder is someone else's: never emptied.
      if (lstatSync(root).isSymbolicLink()) return join(root, current);
      for (const old of readdirSync(root)) {
        if (old !== current) rmSync(join(root, old), { recursive: true, force: true });
      }
    } catch {
      // No cache yet.
    }
  }
  return join(root, current);
}

// JSON with the non-finite numbers kept (`nearest` is Infinity with no wall).
const NUM = '\u0000num:';
const encode = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'number' && !Number.isFinite(v) ? NUM + String(v) : v,
  );
// A `__proto__` key read back is dropped: spread or assigned later, it would set a prototype.
const decode = (text: string): unknown =>
  JSON.parse(text, (k, v: unknown) =>
    k === '__proto__'
      ? undefined
      : typeof v === 'string' && v.startsWith(NUM)
        ? Number(v.slice(NUM.length))
        : v,
  );

/**
 * A keeper for the test file at `testFile` (its `import.meta.url`): `keep(key, play)` is
 * `play()`'s result, kept for this simulation code and this file's text (editing the test
 * replays it) under `key`, which must tell apart every play in the file (a loop's
 * variables included). The result is plain data (JSON, with Infinity and NaN kept)
 * whether kept or just played, so a test reads the same either way: no Maps, Sets or
 * class instances. `root` is for the cache's own tests.
 */
export function cacheFor(testFile: string, root = CACHE_DIR): <T>(key: string, play: () => T) => T {
  const file = sha(readFileSync(fileURLToPath(testFile), 'utf8'));
  return (key, play) => cached(root, file, key, play);
}

function cached<T>(root: string, file: string, key: string, play: () => T): T {
  const dir = folder(root);
  const path = join(dir, `${sha(`${file}\0${key}`)}.json`);
  if (process.env.BALANCE_CACHE !== 'off') {
    try {
      const kept = decode(readFileSync(path, 'utf8')) as { key?: unknown; value?: unknown };
      if (kept && typeof kept === 'object' && kept.key === key && 'value' in kept) {
        return kept.value as T;
      }
    } catch {
      // Not kept yet, or unreadable: play it.
    }
  }
  const text = encode({ key, value: play() });
  mkdirSync(dir, { recursive: true });
  // Written whole, then renamed: a worker reading it at the same time sees all or nothing.
  // Workers can share a process, so the thread is in the name too.
  const tmp = `${path}.${process.pid}-${threadId}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return (decode(text) as { value: T }).value;
}
