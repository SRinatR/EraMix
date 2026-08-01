import { describe, expect, it } from 'vitest';
import { createGracefulShutdown } from './shutdown.js';

describe('createGracefulShutdown', () => {
  it('resolves as completed when work finishes before the timeout', async () => {
    const shutdown = createGracefulShutdown({
      timeoutMs: 1000,
      onShutdown: async () => {},
    });
    await expect(shutdown()).resolves.toBe('completed');
  });

  it('resolves as timed-out when work exceeds the timeout', async () => {
    const shutdown = createGracefulShutdown({
      timeoutMs: 10,
      onShutdown: () => new Promise((resolve) => setTimeout(resolve, 1000)),
    });
    await expect(shutdown()).resolves.toBe('timed-out');
  });
});
