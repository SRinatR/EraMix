import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies documented defaults when optional variables are absent', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('parses and coerces provided values', () => {
    const env = loadEnv({ NODE_ENV: 'production', PORT: '8080' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
  });

  it('fails fast on an invalid NODE_ENV instead of silently falling back', () => {
    expect(() => loadEnv({ NODE_ENV: 'bogus' })).toThrow(/Invalid environment configuration/);
  });
});
