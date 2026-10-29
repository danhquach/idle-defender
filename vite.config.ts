import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

/**
 * The built page's Content-Security-Policy. GitHub Pages sends no headers, so it
 * rides in a meta tag placed first in `<head>`. `default-src 'none'` makes every
 * kind of load not listed here a violation. Widen this list only when a feature
 * needs it.
 *
 * Not settable from a meta tag (accepted): `frame-ancestors`, `report-uri`, `sandbox`.
 */
export function buildCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The commit CI builds; 'dev' elsewhere. */
const BUILD_ID = (process.env.GITHUB_SHA ?? '').slice(0, 12) || 'dev';
/** The game's version (package.json); every PR to main raises it. */
const APP_VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string })
  .version;
/** When this build was made (UTC, ISO 8601). */
const BUILD_TIME = new Date().toISOString();

/** Build only: the dev server's hot reload needs inline script and a websocket. */
const cspMeta: Plugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() },
      injectTo: 'head-prepend',
    },
  ],
};

export default defineConfig({
  plugins: [cspMeta],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  // Relative asset URLs so the same build works at the site root (local preview)
  // and under the repository sub-path on GitHub Pages.
  base: './',
});
