import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Unit tests cover the pure simulation (src/core/**), the UI's pure
      // helpers (src/ui/**), the build's Content-Security-Policy, the lint
      // rules that ban HTML sinks and the version checks.
      include: [
        'src/core/**/*.test.ts',
        'src/ui/**/*.test.ts',
        'src/csp.test.ts',
        'src/version-checks.test.ts',
        'src/lint.test.ts',
      ],
      environment: 'node',
    },
  }),
);
