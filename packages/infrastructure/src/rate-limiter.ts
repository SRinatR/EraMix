export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds?: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitResult;
}

/**
 * Single-process in-memory sliding-window rate limiter — the MVP mechanism
 * for CLAUDE.md's "Apply rate limits to authentication, search, order
 * submission, uploads, and admin operations." A shared store (Redis or
 * similar) is required once the app runs as more than one instance; that is
 * a hosting decision blocked on Q-06/ADR-0008, so this in-memory limiter is
 * explicitly a single-instance stand-in, not the final production
 * mechanism.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): RateLimitResult {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= this.limit) {
      const retryAfterMs = recent[0]! + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }
}
