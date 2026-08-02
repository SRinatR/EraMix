import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import {
  updateAdvertisingProviderConfig,
  type AdvertisingProviderConfigPatch,
} from '@eramix/application';
import { ValidationFailedError, type AdvertisingProviderConfig } from '@eramix/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// The allowlist itself — mirrors packages/domain/src/entities.ts's
// AdvertisingProvider union exactly, never an open string (CLAUDE.md's
// named provider list).
const PROVIDERS = [
  'GOOGLE_ADS',
  'YANDEX_DIRECT',
  'MICROSOFT_ADS',
  'META',
  'LINKEDIN',
  'TIKTOK',
] as const;
const providerSchema = z.enum(PROVIDERS);

const nullableString = z.string().min(1).nullable().optional();

/** Tri-state per field (omitted = unchanged, `null` = clear, value = set) — same idiom as /api/admin/settings. */
const updateSchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.string().min(1).max(500).optional(),
  enabled: z.boolean().optional(),
  consentCategory: z.enum(['ANALYTICS', 'ADVERTISING']).optional(),
  accountId: nullableString,
  containerId: nullableString,
  pixelId: nullableString,
  credentialSecretRef: nullableString,
  testMode: z.boolean().optional(),
});

function toResponseBody(config: AdvertisingProviderConfig) {
  return {
    provider: config.provider,
    enabled: config.enabled,
    consentCategory: config.consentCategory,
    accountId: config.accountId ?? null,
    containerId: config.containerId ?? null,
    pixelId: config.pixelId ?? null,
    credentialSecretRef: config.credentialSecretRef ?? null,
    testMode: config.testMode,
    updatedAt: config.updatedAt.toISOString(),
    version: config.version,
  };
}

export const PATCH = withApiHandler<{ provider: string }>(
  'admin.advertisingProviders.update',
  async (request, traceId, { params }) => {
    enforceRateLimit('admin', request);
    const actor = await requireActor(request);
    const { provider: rawProvider } = await params;
    const parsedProvider = providerSchema.safeParse(rawProvider);
    if (!parsedProvider.success) {
      throw new ValidationFailedError(`"${rawProvider}" is not a supported advertising provider.`, {
        provider: rawProvider,
      });
    }

    const body = updateSchema.parse(await request.json());
    const { expectedVersion, reason, ...rest } = body;
    const patch = rest as AdvertisingProviderConfigPatch;
    const container = getContainer();

    const updated = await updateAdvertisingProviderConfig(
      { repo: container.advertisingProviders, auditRepo: container.auditEvents },
      {
        provider: parsedProvider.data,
        expectedVersion,
        patch,
        reason,
        actorUserId: actor.userId,
        actorRole: actor.platformRole,
        traceId,
      },
    );

    return NextResponse.json(toResponseBody(updated));
  },
);
