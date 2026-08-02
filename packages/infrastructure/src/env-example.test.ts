import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

/**
 * CI gate: the committed .env.example must always resolve against the same
 * zod schema the app enforces at boot (ADR-0016) — a schema change that
 * silently drifts from the documented example is exactly the kind of gap
 * this test exists to catch. Uses Node's built-in dotenv-format parser
 * (`node:util`'s `parseEnv`, stable since Node 20.12) rather than importing
 * dotenv/dotenvx here — this is test code, not a launch-time script.
 */
const envExamplePath = path.join(import.meta.dirname, '..', '..', '..', '.env.example');

describe('.env.example', () => {
  it('validates against the environment schema', () => {
    const raw = readFileSync(envExamplePath, 'utf8');
    const parsed = parseEnv(raw);

    expect(() => loadEnv(parsed)).not.toThrow();
  });

  it('never sets a real-looking secret value (documentation only, never a live credential)', () => {
    const raw = readFileSync(envExamplePath, 'utf8');
    const parsed = parseEnv(raw);

    for (const key of [
      'SESSION_SECRET',
      'MEDIA_SIGNING_SECRET',
      'OIDC_CLIENT_SECRET',
      'INDEXNOW_KEY',
      'GA4_API_SECRET',
    ]) {
      expect(parsed[key], `${key} must stay unset/commented in .env.example`).toBeUndefined();
    }
  });
});
