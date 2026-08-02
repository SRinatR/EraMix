import { describe, expect, it, vi } from 'vitest';
import { ValidationFailedError } from '@eramix/domain';
import type { IndexNowSubmissionInput } from '@eramix/application';
import { HttpIndexNowNotifier } from './indexnow-notifier.js';

const VALID_INPUT: IndexNowSubmissionInput = {
  host: 'eramix.example',
  key: 'a1b2c3d4e5f6',
  keyLocation: 'https://eramix.example/api/seo/indexnow-key.txt',
  urlList: ['https://eramix.example/en/catalog/chairs'],
};

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe('HttpIndexNowNotifier', () => {
  it('reports success for every engine on a 200 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200));
    const notifier = new HttpIndexNowNotifier({ fetchImpl });

    const results = await notifier.submit(VALID_INPUT);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.succeeded)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [endpoint, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toMatch(/indexnow/);
    expect(JSON.parse(init.body as string)).toMatchObject({
      host: 'eramix.example',
      key: 'a1b2c3d4e5f6',
    });
  });

  it('treats HTTP 202 as success (IndexNow accepted-for-processing)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(202));
    const notifier = new HttpIndexNowNotifier({ fetchImpl });

    const results = await notifier.submit(VALID_INPUT);
    expect(results.every((r) => r.succeeded)).toBe(true);
  });

  it('retries a failing engine up to maxAttemptsPerEngine, then reports failure without throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const notifier = new HttpIndexNowNotifier({
      fetchImpl,
      sleepImpl,
      maxAttemptsPerEngine: 3,
    });

    const results = await notifier.submit(VALID_INPUT);

    expect(results.every((r) => !r.succeeded)).toBe(true);
    expect(results[0]?.error).toContain('500');
    // 2 engines * 3 attempts each = 6 fetch calls; retry is bounded, not infinite.
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(sleepImpl).toHaveBeenCalledTimes(4); // 2 sleeps per engine (between attempts 1-2, 2-3)
  });

  it('recovers if a later attempt succeeds after earlier failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue(jsonResponse(200));
    const notifier = new HttpIndexNowNotifier({
      fetchImpl,
      sleepImpl: vi.fn().mockResolvedValue(undefined),
    });

    const results = await notifier.submit(VALID_INPUT);
    expect(results.every((r) => r.succeeded)).toBe(true);
  });

  it('never calls fetch for an invalid submission (validated before any network call)', async () => {
    const fetchImpl = vi.fn();
    const notifier = new HttpIndexNowNotifier({ fetchImpl });

    await expect(
      notifier.submit({ ...VALID_INPUT, urlList: ['https://attacker.example/x'] }),
    ).rejects.toThrow(ValidationFailedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
