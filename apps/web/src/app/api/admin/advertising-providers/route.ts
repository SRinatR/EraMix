import { getContainer } from '@/server/container';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { requireActor } from '@/server/session';
import { listAdvertisingProviderConfigs } from '@eramix/application';
import type { AdvertisingProviderConfig } from '@eramix/domain';
import { NextResponse } from 'next/server';

function toResponseBody(config: AdvertisingProviderConfig) {
  return {
    provider: config.provider,
    enabled: config.enabled,
    consentCategory: config.consentCategory,
    accountId: config.accountId ?? null,
    containerId: config.containerId ?? null,
    pixelId: config.pixelId ?? null,
    // credentialSecretRef is a secret-store *reference* (a name), never a
    // credential value — safe to echo back, same as any other admin-visible
    // non-secret identifier (CLAUDE.md: "credentials are secret-store
    // references only").
    credentialSecretRef: config.credentialSecretRef ?? null,
    testMode: config.testMode,
    updatedAt: config.updatedAt.toISOString(),
    version: config.version,
  };
}

export const GET = withApiHandler('admin.advertisingProviders.list', async (request) => {
  enforceRateLimit('admin', request);
  const actor = await requireActor(request);
  const container = getContainer();

  const configs = await listAdvertisingProviderConfigs(
    { repo: container.advertisingProviders },
    actor.platformRole,
  );
  return NextResponse.json({ data: configs.map(toResponseBody) });
});
