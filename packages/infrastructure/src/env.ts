import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL 19 Beta 2 — ADR-0013).'),
  /**
   * OIDC Authorization Code + PKCE config (ADR-0003). All optional: the real
   * ODS issuer/client contract is blocked on Q-01, so the app must still
   * boot (catalog, content, health checks) without them configured — only
   * the /auth/* routes fail closed (DEPENDENCY_UNAVAILABLE) until they are
   * set. Never default these to an invented ODS value.
   */
  OIDC_ISSUER_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_REDIRECT_URI: z.string().url().optional(),
  /** Signs the stateless session cookie (HS256 JWT — see oidc/session-codec.ts). Required only when /auth/* is used. */
  SESSION_SECRET: z.string().min(32).optional(),
  /** Absolute origin used to build absolute URLs (sitemap.xml, Open Graph); optional, falls back to a placeholder in dev. */
  PUBLIC_ORIGIN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
