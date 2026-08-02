import { defineConfig, devices } from '@playwright/test';

/**
 * Pi-only — see README.md. Targets a server already running (production
 * demo via scripts/pi/04-production-build-and-demo.sh, or `pnpm --filter
 * web run dev`); this config does not start one itself, since the
 * production-vs-dev choice and the OIDC fake-IdP wiring are session-level
 * decisions made by the scripts/pi/*.sh orchestration, not by Playwright.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // shared fixture users/DB state — see README.md
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
