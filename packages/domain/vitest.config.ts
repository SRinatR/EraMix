import { defineConfig } from 'vitest/config';

// Without this, vitest's default glob also picks up the compiled
// dist/*.test.js copies (tsc -b's own output, since dist isn't excluded by
// default), silently double-running and double-counting every test — and,
// worse, running a possibly-stale compiled copy alongside the current
// source file.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
