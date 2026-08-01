import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './rate-limiter.js';

describe('InMemoryRateLimiter', () => {
  it('allows up to the limit within the window, then denies with a positive retryAfterSeconds', () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(3, 60_000, () => now);

    expect(limiter.consume('key-a')).toEqual({ allowed: true });
    expect(limiter.consume('key-a')).toEqual({ allowed: true });
    expect(limiter.consume('key-a')).toEqual({ allowed: true });

    const denied = limiter.consume('key-a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks each key independently', () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(1, 60_000, () => now);

    expect(limiter.consume('key-a')).toEqual({ allowed: true });
    expect(limiter.consume('key-a').allowed).toBe(false);
    expect(limiter.consume('key-b')).toEqual({ allowed: true });
  });

  it('allows again once the window has passed', () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(1, 1_000, () => now);

    expect(limiter.consume('key-a')).toEqual({ allowed: true });
    expect(limiter.consume('key-a').allowed).toBe(false);

    now = 1_001;
    expect(limiter.consume('key-a')).toEqual({ allowed: true });
  });
});
