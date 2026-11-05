// The dependency fingerprint CI caches node_modules under: package.json and
// package-lock.json with their own version fields left out. Every PR raises the
// version, which rewrites those fields but changes no dependency.
//   node tools/deps-hash.mjs   prints the fingerprint of the files in the current folder
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** sha256 hex of both files' contents, the project's own version left out. */
export function depsHash(pkgText, lockText) {
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  delete pkg.version;
  delete lock.version;
  if (lock.packages?.['']) delete lock.packages[''].version;
  return createHash('sha256')
    .update(JSON.stringify([pkg, lock]))
    .digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(
    depsHash(readFileSync('package.json', 'utf8'), readFileSync('package-lock.json', 'utf8')),
  );
}
