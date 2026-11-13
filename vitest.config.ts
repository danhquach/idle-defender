import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Unit tests cover the pure simulation (src/core/**), the UI's pure
      // helpers (src/ui/**), the save and backup code (src/storage/**), the
      // build's Content-Security-Policy, the lint rules that ban HTML sinks, the
      // version checks and CI's dependency fingerprint.
      include: [
        'src/core/**/*.test.ts',
        'src/ui/**/*.test.ts',
        'src/storage/**/*.test.ts',
        'src/csp.test.ts',
        'src/version-checks.test.ts',
        'src/deps-hash.test.ts',
        'src/lint.test.ts',
      ],
      environment: 'node',
      // One test file at a time on a laptop (ID-142): a balance file is one long fight loop
      // per worker, and several side by side drained the machine. CI keeps its default.
      maxWorkers: process.env.CI ? undefined : 1,
    },
  }),
);
