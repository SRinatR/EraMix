'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export interface SettingsFormValues {
  readonly canonicalHost: string;
  readonly forceHttps: boolean;
  readonly stripTrailingSlash: boolean;
  readonly organizationName: string | null;
  readonly organizationLegalName: string | null;
  readonly organizationEmail: string | null;
  readonly organizationPhone: string | null;
  readonly organizationAddress: string | null;
  readonly organizationSameAs: readonly string[] | null;
  readonly seoDefaultTitleTemplate: string | null;
  readonly seoDefaultDescriptionFallback: string | null;
  readonly ogFallbackImageUrl: string | null;
  readonly crawlerGlobalNoindex: boolean;
  readonly googleExtendedAllowed: boolean;
  readonly aiCompatibilityFilesEnabled: boolean;
  readonly analyticsConsentRequired: boolean;
  readonly ga4Enabled: boolean;
  readonly ga4MeasurementId: string | null;
  readonly yandexMetricaEnabled: boolean;
  readonly yandexMetricaCounterId: string | null;
  readonly rustAnalyticsEnabled: boolean;
  readonly searchConsoleVerificationToken: string | null;
  readonly yandexWebmasterVerificationToken: string | null;
  readonly bingVerificationToken: string | null;
  readonly indexNowEnabled: boolean;
  readonly merchantCenterEnabled: boolean;
}

interface PreviewResult {
  readonly canonicalOrigin: string;
  readonly robotsGlobalNoindex: boolean;
  readonly organizationJsonLd?: Record<string, unknown>;
  readonly integrationHealth: Record<string, string>;
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function urlListOrNull(value: string): readonly string[] | null {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? null : lines;
}

/**
 * Always sends every field as an explicit value (never omits one) — the
 * PATCH API's tri-state contract (omitted=unchanged/null=clear/value=set)
 * still works with this since a full replace is a valid patch, and this is
 * a singleton row realistically edited by one admin at a time; expectedVersion
 * still guards against a genuine concurrent edit. Simpler than tracking
 * per-field "touched" state for 25 fields with no real benefit here.
 */
export function SettingsForm({
  initial,
  expectedVersion,
}: {
  readonly initial: SettingsFormValues;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [changeReason, setChangeReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | undefined>();
  const [previewPending, setPreviewPending] = useState(false);

  function buildPatch(): Record<string, unknown> {
    return {
      canonicalHost: values.canonicalHost,
      forceHttps: values.forceHttps,
      stripTrailingSlash: values.stripTrailingSlash,
      organizationName: values.organizationName,
      organizationLegalName: values.organizationLegalName,
      organizationEmail: values.organizationEmail,
      organizationPhone: values.organizationPhone,
      organizationAddress: values.organizationAddress,
      organizationSameAs: values.organizationSameAs,
      seoDefaultTitleTemplate: values.seoDefaultTitleTemplate,
      seoDefaultDescriptionFallback: values.seoDefaultDescriptionFallback,
      ogFallbackImageUrl: values.ogFallbackImageUrl,
      crawlerGlobalNoindex: values.crawlerGlobalNoindex,
      googleExtendedAllowed: values.googleExtendedAllowed,
      aiCompatibilityFilesEnabled: values.aiCompatibilityFilesEnabled,
      analyticsConsentRequired: values.analyticsConsentRequired,
      ga4Enabled: values.ga4Enabled,
      ga4MeasurementId: values.ga4MeasurementId,
      yandexMetricaEnabled: values.yandexMetricaEnabled,
      yandexMetricaCounterId: values.yandexMetricaCounterId,
      rustAnalyticsEnabled: values.rustAnalyticsEnabled,
      searchConsoleVerificationToken: values.searchConsoleVerificationToken,
      yandexWebmasterVerificationToken: values.yandexWebmasterVerificationToken,
      bingVerificationToken: values.bingVerificationToken,
      indexNowEnabled: values.indexNowEnabled,
      merchantCenterEnabled: values.merchantCenterEnabled,
    };
  }

  async function handlePreview(): Promise<void> {
    setPreviewPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/settings/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPatch()),
      });
      const body = (await response.json()) as PreviewResult & { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to build a preview.');
        return;
      }
      setPreview(body);
    } finally {
      setPreviewPending(false);
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          ...(changeReason.trim().length > 0 ? { changeReason: changeReason.trim() } : {}),
          ...buildPatch(),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to save settings.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <fieldset>
        <legend>Canonical host and redirect policy</legend>
        <label>
          Canonical host (no scheme/path)
          <input
            value={values.canonicalHost}
            onChange={(event) => setValues({ ...values, canonicalHost: event.target.value })}
            required
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.forceHttps}
            onChange={(event) => setValues({ ...values, forceHttps: event.target.checked })}
          />
          Force HTTPS
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.stripTrailingSlash}
            onChange={(event) => setValues({ ...values, stripTrailingSlash: event.target.checked })}
          />
          Strip trailing slash
        </label>
      </fieldset>

      <fieldset>
        <legend>Organization / NAP facts (published only when set)</legend>
        <label>
          Name
          <input
            value={values.organizationName ?? ''}
            onChange={(event) =>
              setValues({ ...values, organizationName: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Legal name
          <input
            value={values.organizationLegalName ?? ''}
            onChange={(event) =>
              setValues({ ...values, organizationLegalName: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={values.organizationEmail ?? ''}
            onChange={(event) =>
              setValues({ ...values, organizationEmail: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Phone
          <input
            value={values.organizationPhone ?? ''}
            onChange={(event) =>
              setValues({ ...values, organizationPhone: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Address
          <input
            value={values.organizationAddress ?? ''}
            onChange={(event) =>
              setValues({ ...values, organizationAddress: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Social/profile URLs (one per line)
          <textarea
            value={(values.organizationSameAs ?? []).join('\n')}
            onChange={(event) =>
              setValues({ ...values, organizationSameAs: urlListOrNull(event.target.value) })
            }
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>SEO defaults and Open Graph fallback</legend>
        <label>
          Default title template
          <input
            value={values.seoDefaultTitleTemplate ?? ''}
            onChange={(event) =>
              setValues({ ...values, seoDefaultTitleTemplate: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          Default description fallback
          <input
            value={values.seoDefaultDescriptionFallback ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                seoDefaultDescriptionFallback: textOrNull(event.target.value),
              })
            }
          />
        </label>
        <label>
          Open Graph fallback image URL
          <input
            type="url"
            value={values.ogFallbackImageUrl ?? ''}
            onChange={(event) =>
              setValues({ ...values, ogFallbackImageUrl: textOrNull(event.target.value) })
            }
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Crawler / snippet directives</legend>
        <label>
          <input
            type="checkbox"
            checked={values.crawlerGlobalNoindex}
            onChange={(event) =>
              setValues({ ...values, crawlerGlobalNoindex: event.target.checked })
            }
          />
          Emergency sitewide noindex (overrides per-entity publication state)
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.googleExtendedAllowed}
            onChange={(event) =>
              setValues({ ...values, googleExtendedAllowed: event.target.checked })
            }
          />
          Allow Google-Extended
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.aiCompatibilityFilesEnabled}
            onChange={(event) =>
              setValues({ ...values, aiCompatibilityFilesEnabled: event.target.checked })
            }
          />
          Publish llms.txt/ai.txt (non-SEO compatibility layer only)
        </label>
      </fieldset>

      <fieldset>
        <legend>Analytics consent and providers</legend>
        <label>
          <input
            type="checkbox"
            checked={values.analyticsConsentRequired}
            onChange={(event) =>
              setValues({ ...values, analyticsConsentRequired: event.target.checked })
            }
          />
          Require consent before non-essential analytics
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.ga4Enabled}
            onChange={(event) => setValues({ ...values, ga4Enabled: event.target.checked })}
          />
          GA4 enabled
        </label>
        <label>
          GA4 measurement ID
          <input
            value={values.ga4MeasurementId ?? ''}
            onChange={(event) =>
              setValues({ ...values, ga4MeasurementId: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.yandexMetricaEnabled}
            onChange={(event) =>
              setValues({ ...values, yandexMetricaEnabled: event.target.checked })
            }
          />
          Yandex Metrica enabled
        </label>
        <label>
          Yandex Metrica counter ID
          <input
            value={values.yandexMetricaCounterId ?? ''}
            onChange={(event) =>
              setValues({ ...values, yandexMetricaCounterId: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.rustAnalyticsEnabled}
            onChange={(event) =>
              setValues({ ...values, rustAnalyticsEnabled: event.target.checked })
            }
          />
          Rust first-party analytics enabled (no adapter exists yet — not expected before October
          2026)
        </label>
      </fieldset>

      <fieldset>
        <legend>Search Console / Yandex Webmaster / Bing / IndexNow</legend>
        <label>
          Search Console verification token
          <input
            value={values.searchConsoleVerificationToken ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                searchConsoleVerificationToken: textOrNull(event.target.value),
              })
            }
          />
        </label>
        <label>
          Yandex Webmaster verification token
          <input
            value={values.yandexWebmasterVerificationToken ?? ''}
            onChange={(event) =>
              setValues({
                ...values,
                yandexWebmasterVerificationToken: textOrNull(event.target.value),
              })
            }
          />
        </label>
        <label>
          Bing verification token
          <input
            value={values.bingVerificationToken ?? ''}
            onChange={(event) =>
              setValues({ ...values, bingVerificationToken: textOrNull(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={values.indexNowEnabled}
            onChange={(event) => setValues({ ...values, indexNowEnabled: event.target.checked })}
          />
          IndexNow enabled (the real key is an env-configured deployment secret, never entered here)
        </label>
      </fieldset>

      <fieldset disabled>
        <legend>Merchant Center (not available yet)</legend>
        <label>
          <input type="checkbox" checked={values.merchantCenterEnabled} readOnly />
          Merchant Center enabled — always rejected until a real versioned sellable-offer model
          exists
        </label>
      </fieldset>

      <label>
        Change reason (recorded to history)
        <input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
      </label>

      <div>
        <button type="button" onClick={() => void handlePreview()} disabled={previewPending}>
          {previewPending ? 'Building preview…' : 'Preview effective output'}
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {preview && (
        <section aria-label="Effective output preview">
          <h2>Preview</h2>
          <p>Canonical origin: {preview.canonicalOrigin}</p>
          <p>Sitewide noindex: {preview.robotsGlobalNoindex ? 'yes' : 'no'}</p>
          <p>Organization JSON-LD:</p>
          <pre>{JSON.stringify(preview.organizationJsonLd ?? null, null, 2)}</pre>
          <p>Integration health:</p>
          <pre>{JSON.stringify(preview.integrationHealth, null, 2)}</pre>
        </section>
      )}
    </form>
  );
}
