import {
  ResourceNotFoundError,
  validateEffectiveAdvertisingProviderConfig,
  type AdvertisingProvider,
  type AdvertisingProviderConfig,
  type PlatformRole,
} from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type {
  AdvertisingProviderConfigPatch,
  AdvertisingProviderConfigRepository,
  AuditEventRepository,
} from './repositories.js';

/**
 * Advertising-integration control-plane read/write use cases (CLAUDE.md:
 * "typed adapters... Admin controls provider enablement, consent category,
 * account/container/pixel identifiers... credentials are secret-store
 * references only"). This slice covers configuration/enablement only —
 * conversion mapping, attribution/UTM rules, and server-side conversion
 * dispatch are a later slice that depends on the GA4/Yandex Metrica event
 * registry as their data source (see IMPLEMENTATION_ROADMAP.md).
 */

export interface AdvertisingProviderDeps {
  readonly repo: AdvertisingProviderConfigRepository;
  readonly auditRepo: AuditEventRepository;
}

export async function listAdvertisingProviderConfigs(
  deps: Pick<AdvertisingProviderDeps, 'repo'>,
  actorRole: PlatformRole,
): Promise<readonly AdvertisingProviderConfig[]> {
  requirePermission(actorRole, 'settings.manage');
  return deps.repo.listAll();
}

/** Applies a tri-state patch onto the current config, honoring the omitted=unchanged/null=clear/value=set idiom (same as PlatformSettings' mergePatch). */
function mergePatch(
  current: AdvertisingProviderConfig,
  patch: AdvertisingProviderConfigPatch,
): AdvertisingProviderConfig {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    next[key] = value === null ? undefined : value;
  }
  return next as unknown as AdvertisingProviderConfig;
}

export interface UpdateAdvertisingProviderConfigInput {
  readonly provider: AdvertisingProvider;
  readonly expectedVersion: number;
  readonly patch: AdvertisingProviderConfigPatch;
  readonly actorUserId: string;
  readonly actorRole: PlatformRole;
  readonly reason?: string | undefined;
  readonly traceId?: string | undefined;
}

export async function updateAdvertisingProviderConfig(
  deps: AdvertisingProviderDeps,
  input: UpdateAdvertisingProviderConfigInput,
): Promise<AdvertisingProviderConfig> {
  requirePermission(input.actorRole, 'settings.manage');
  const current = await deps.repo.findByProvider(input.provider);
  if (!current) {
    throw new ResourceNotFoundError(`Advertising provider ${input.provider} not found.`, {
      provider: input.provider,
    });
  }
  const effective = mergePatch(current, input.patch);
  validateEffectiveAdvertisingProviderConfig(effective);

  const updated = await deps.repo.update(input.provider, input.expectedVersion, input.patch);

  const changedFields = Object.keys(input.patch);
  await deps.auditRepo.record({
    actorUserId: input.actorUserId,
    action: 'advertising_provider.updated',
    entityType: 'AdvertisingProviderConfig',
    entityId: updated.id,
    metadata: { provider: input.provider, changedFields, reason: input.reason },
    traceId: input.traceId,
  });
  return updated;
}
