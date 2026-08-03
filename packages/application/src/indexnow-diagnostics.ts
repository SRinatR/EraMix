import type { PlatformRole } from '@eramix/domain';
import { requirePermission } from './authorization.js';
import type { IndexNowEngineStatusRepository, PlatformSettingsRepository } from './repositories.js';

/**
 * Admin diagnostics for the IndexNow adapter (CLAUDE.md: "dead-letter/error
 * visibility... admin health/history view... emergency disable behavior").
 * `effectivelyActive` folds in the emergency `crawlerGlobalNoindex` switch
 * — IndexNow submission is suppressed whenever that switch is on, even if
 * `indexNowEnabled` is separately true (apps/worker/src/outbox-worker.ts's
 * `maybeSubmitIndexNow` applies the same rule), so the admin view never
 * shows "active" while the sitewide kill switch would actually block it.
 */
export interface IndexNowDiagnostics {
  readonly indexNowEnabled: boolean;
  readonly crawlerGlobalNoindex: boolean;
  readonly effectivelyActive: boolean;
  readonly keyConfigured: boolean;
  readonly engines: readonly {
    readonly engine: string;
    readonly lastAttemptAt?: string | undefined;
    readonly lastSucceeded?: boolean | undefined;
    readonly lastStatusCode?: number | undefined;
    readonly lastError?: string | undefined;
    readonly lastUrlCount?: number | undefined;
  }[];
}

export async function getIndexNowDiagnostics(
  deps: {
    readonly settingsRepo: PlatformSettingsRepository;
    readonly engineStatusRepo: IndexNowEngineStatusRepository;
  },
  actorRole: PlatformRole,
  keyConfigured: boolean,
): Promise<IndexNowDiagnostics> {
  requirePermission(actorRole, 'settings.manage');
  const [settings, statuses] = await Promise.all([
    deps.settingsRepo.get(),
    deps.engineStatusRepo.listAll(),
  ]);

  return {
    indexNowEnabled: settings.indexNowEnabled,
    crawlerGlobalNoindex: settings.crawlerGlobalNoindex,
    effectivelyActive: settings.indexNowEnabled && !settings.crawlerGlobalNoindex && keyConfigured,
    keyConfigured,
    engines: statuses.map((status) => ({
      engine: status.engine,
      lastAttemptAt: status.lastAttemptAt.toISOString(),
      lastSucceeded: status.lastSucceeded,
      lastStatusCode: status.lastStatusCode,
      lastError: status.lastError,
      lastUrlCount: status.lastUrlCount,
    })),
  };
}
