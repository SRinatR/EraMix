'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Shared by the category/product (/admin/catalog) and content (/admin/content)
 * listings — all three retire endpoints share the same
 * `{ reason, expectedVersion }` request contract
 * (packages/application/src/publication.ts's retireCategory/retireContent/
 * retireProduct). Only rendered for an already-ARCHIVED item (retirement is
 * a deliberate second step, never a side effect of unpublishing — CLAUDE.md/
 * ADR-0018): the caller decides whether to show it based on status.
 */
export function RetireForm({
  endpoint,
  expectedVersion,
}: {
  readonly endpoint: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmedSuccessorId = successorId.trim();
    const confirmMessage =
      trimmedSuccessorId.length > 0
        ? 'Permanently retire this item and redirect its public URL (308) to the successor? This cannot be undone.'
        : 'Permanently retire this item? This cannot be undone — the public URL will start returning HTTP 410 Gone.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason,
          expectedVersion,
          ...(trimmedSuccessorId.length > 0 ? { successorId: trimmedSuccessorId } : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to retire.');
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
        Retirement reason
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      <label>
        Successor ID (optional — a materially equivalent PUBLISHED replacement; leave blank for a
        plain 410)
        <input
          type="text"
          value={successorId}
          onChange={(event) => setSuccessorId(event.target.value)}
        />
      </label>
      <button type="submit" disabled={pending || reason.trim().length === 0}>
        {pending ? 'Retiring…' : 'Retire permanently'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
