import { defineConfig } from 'vitest/config';

// Real-Postgres integration tests (*.integration.test.ts) are excluded from
// the default laptop-safe run — see vitest.integration.config.ts and
// CLAUDE.md's fail-closed policy: they must never be silently skipped, only
// deliberately run in an environment with a real PostgreSQL 19 Beta 2
// instance (CI's `db-integration` job; eventually the authorized Pi
// session).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
