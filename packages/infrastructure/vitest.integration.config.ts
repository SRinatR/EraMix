import { defineConfig } from 'vitest/config';

/**
 * Real-PostgreSQL integration tests — requires DATABASE_URL to point at a
 * live, migrated PostgreSQL 19 Beta 2 instance (ADR-0013). Never run as
 * part of `pnpm run check`/`pnpm run test` (laptop-safe, no live DB
 * required); only via `pnpm --filter @eramix/infrastructure run
 * test:integration`, which CI's `db-integration` job invokes against a
 * `postgres:19beta2-alpine` service container.
 */
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
