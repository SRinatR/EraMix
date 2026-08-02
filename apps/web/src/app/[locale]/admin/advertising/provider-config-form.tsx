'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export interface ProviderConfigFormValues {
  readonly provider: string;
  readonly enabled: boolean;
  readonly consentCategory: 'ANALYTICS' | 'ADVERTISING';
  readonly accountId: string | null;
  readonly containerId: string | null;
  readonly pixelId: string | null;
  readonly credentialSecretRef: string | null;
  readonly testMode: boolean;
  readonly version: number;
}

/**
 * One row per AdvertisingProvider (CLAUDE.md's named allowlist) —
 * enablement, consent category, non-secret account/container/pixel
 * identifiers, and the test-mode/kill-switch controls. `credentialSecretRef`
 * is only ever a deployment-secret-store *name*, never a value — this form
 * has no field capable of accepting a script/HTML/token (CLAUDE.md: "may
 * never inject arbitrary vendor JavaScript... expose access tokens").
 */
export function ProviderConfigForm({ initial }: { readonly initial: ProviderConfigFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/advertising-providers/${values.provider}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: values.version,
          enabled: values.enabled,
          consentCategory: values.consentCategory,
          accountId: values.accountId,
          containerId: values.containerId,
          pixelId: values.pixelId,
          credentialSecretRef: values.credentialSecretRef,
          testMode: values.testMode,
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to save.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Enabled
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) => setValues({ ...values, enabled: event.target.checked })}
        />
      </label>
      <label>
        Consent category
        <select
          value={values.consentCategory}
          onChange={(event) =>
            setValues({
              ...values,
              consentCategory: event.target.value as ProviderConfigFormValues['consentCategory'],
            })
          }
        >
          <option value="ADVERTISING">Advertising</option>
          <option value="ANALYTICS">Analytics</option>
        </select>
      </label>
      <label>
        Account ID
        <input
          type="text"
          value={values.accountId ?? ''}
          onChange={(event) => setValues({ ...values, accountId: event.target.value || null })}
        />
      </label>
      <label>
        Container ID
        <input
          type="text"
          value={values.containerId ?? ''}
          onChange={(event) => setValues({ ...values, containerId: event.target.value || null })}
        />
      </label>
      <label>
        Pixel ID
        <input
          type="text"
          value={values.pixelId ?? ''}
          onChange={(event) => setValues({ ...values, pixelId: event.target.value || null })}
        />
      </label>
      <label>
        Credential secret reference
        <input
          type="text"
          placeholder="e.g. GOOGLE_ADS_API_TOKEN (never the value itself)"
          value={values.credentialSecretRef ?? ''}
          onChange={(event) =>
            setValues({ ...values, credentialSecretRef: event.target.value || null })
          }
        />
      </label>
      <label>
        Test mode
        <input
          type="checkbox"
          checked={values.testMode}
          onChange={(event) => setValues({ ...values, testMode: event.target.checked })}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
