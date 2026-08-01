import { describe, expect, it } from 'vitest';
import { GET } from './route.js';

describe('GET /health/live', () => {
  it('reports ok', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
