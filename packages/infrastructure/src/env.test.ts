import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://eramix:eramix_local_dev@localhost:5432/eramix';

describe('loadEnv', () => {
  it('applies documented defaults when optional variables are absent', () => {
    const env = loadEnv({ DATABASE_URL });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('parses and coerces provided values', () => {
    const env = loadEnv({ NODE_ENV: 'production', PORT: '8080', DATABASE_URL });
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
  });

  it('fails fast on an invalid NODE_ENV instead of silently falling back', () => {
    expect(() => loadEnv({ NODE_ENV: 'bogus', DATABASE_URL })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast when DATABASE_URL is missing rather than connecting nowhere', () => {
    expect(() => loadEnv({})).toThrow(/Invalid environment configuration/);
  });
});
