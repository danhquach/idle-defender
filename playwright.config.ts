/// <reference types="node" />
// The browser layout tests (ID-282): real Chromium measures the built game's screens at
// desktop, iPad and phone sizes. Run with `npm run test:ui` (builds, then serves the build).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4399;

export default defineConfig({
  testDir: 'e2e',
  // One browser at a time: a laptop stays usable (CLAUDE.md, 2 heavy processes max).
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    // No fades mid-measure (page.css turns the intro art's fade off under reduced motion).
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
