import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping (Next.js's
    // own bundler reads tsconfig paths natively; Vitest does not, so this
    // must be declared separately) — needed for route-level tests
    // (docs/runbooks/http-error-contract.md) that import a route.ts file
    // whose own imports use the "@/..." alias.
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
