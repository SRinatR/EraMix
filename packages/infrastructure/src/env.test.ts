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

  it('fails fast on a too-short SESSION_SECRET instead of accepting a weak signing key', () => {
    expect(() => loadEnv({ DATABASE_URL, SESSION_SECRET: 'sup3r-s3cr3t-value-too-short' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('accepts a well-formed INDEXNOW_KEY and rejects a malformed one', () => {
    expect(loadEnv({ DATABASE_URL, INDEXNOW_KEY: 'a1b2c3d4e5f6' }).INDEXNOW_KEY).toBe(
      'a1b2c3d4e5f6',
    );
    expect(() => loadEnv({ DATABASE_URL, INDEXNOW_KEY: 'too short!' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('fails fast on a too-short GA4_API_SECRET instead of accepting a weak credential', () => {
    expect(() => loadEnv({ DATABASE_URL, GA4_API_SECRET: 'short' })).toThrow(
      /Invalid environment configuration/,
    );
    expect(loadEnv({ DATABASE_URL, GA4_API_SECRET: 'a-real-looking-secret' }).GA4_API_SECRET).toBe(
      'a-real-looking-secret',
    );
  });

  describe('secret redaction', () => {
    const SECRET_VALUE = 'sup3r-s3cr3t-value-too-short';

    it('never echoes an invalid secret value back in the thrown error message', () => {
      expect.assertions(2);
      try {
        loadEnv({ DATABASE_URL, SESSION_SECRET: SECRET_VALUE });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(SECRET_VALUE);
      }
    });

    it('never echoes DATABASE_URL credentials in an error caused by an unrelated field', () => {
      const databaseUrlWithCredentials =
        'postgresql://real_user:real_password_do_not_leak@db.internal:5432/eramix';
      expect.assertions(2);
      try {
        loadEnv({ DATABASE_URL: databaseUrlWithCredentials, NODE_ENV: 'bogus' });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain('real_password_do_not_leak');
      }
    });
  });
});
