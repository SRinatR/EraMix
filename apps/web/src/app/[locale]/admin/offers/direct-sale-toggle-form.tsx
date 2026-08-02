'use client';

import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';

/**
 * The explicit per-product opt-in ADR-0019 requires before any of the
 * product's offers can ever publish. This alone never syndicates
 * anything — PlatformSettings.merchantCenterEnabled is still hard-false.
 */
export function DirectSaleToggleForm({
  productId,
  initialEnabled,
  version,
}: {
  readonly productId: string;
  readonly initialEnabled: boolean;
  readonly version: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleToggle(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/products/${productId}/direct-sale`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directSaleEnabled: !enabled, expectedVersion: version }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to save.');
        return;
      }
      setEnabled(!enabled);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={() => void handleToggle()}>
        {enabled ? 'Disable direct sale' : 'Enable direct sale'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
