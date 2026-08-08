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
  /** OTLP/HTTP traces endpoint (packages/infrastructure/src/telemetry.ts); tracing no-ops when unset. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  /**
   * Dev-only local media storage (packages/infrastructure/src/
   * local-storage-provider.ts) — the real S3-compatible provider is
   * blocked on Q-06/ADR-0006. Required only when /api/media/* is used.
   */
  MEDIA_STORAGE_DIR: z.string().min(1).default('.var/media'),
  MEDIA_SIGNING_SECRET: z.string().min(32).optional(),
  /**
   * Cloudflare R2 (S3-compatible) production object storage (ADR-0006,
   * Accepted). All optional and all-or-nothing: when unset, the app falls
   * back to LocalFilesystemStorageProvider for local dev. Never invent
   * these — obtain them from the Cloudflare R2 dashboard.
   */
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /**
   * IndexNow (CLAUDE.md: "P1, secret-managed notification adapter for Bing/
   * Yandex only"). Optional — apps/worker only submits when both this and
   * PlatformSettings.indexNowEnabled are set. Never invented; obtained from
   * https://www.bing.com/indexnow (any 8-128 char alphanumeric/hyphen
   * value the operator generates).
   */
  INDEXNOW_KEY: z
    .string()
    .regex(/^[A-Za-z0-9-]{8,128}$/, 'INDEXNOW_KEY must be 8-128 alphanumeric/hyphen characters.')
    .optional(),
  /**
   * GA4 Measurement Protocol API secret (a real credential — never the
   * non-secret PlatformSettings.ga4MeasurementId). Optional — apps/worker
   * only dispatches to GA4 when this, PlatformSettings.ga4Enabled, and a
   * per-event analytics consent grant all agree.
   */
  GA4_API_SECRET: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
