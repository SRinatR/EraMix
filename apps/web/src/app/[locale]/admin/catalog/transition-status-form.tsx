'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/**
 * Shared by the category/product (/admin/catalog) and content (/admin/content)
 * listings — all three status endpoints share the same
 * `{ toStatus, expectedVersion }` request/response contract
 * (packages/application/src/publication.ts).
 */
export function TransitionStatusForm({
  endpoint,
  currentStatus,
  expectedVersion,
}: {
  readonly endpoint: string;
  readonly currentStatus: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [toStatus, setToStatus] = useState(currentStatus);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toStatus, expectedVersion }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to change the status.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <select value={toStatus} onChange={(event) => setToStatus(event.target.value)}>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending || toStatus === currentStatus}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
