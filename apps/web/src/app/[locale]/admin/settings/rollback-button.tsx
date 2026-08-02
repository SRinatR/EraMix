'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export function RollbackButton({
  historyEntryId,
  expectedVersion,
  previousCanonicalHost,
}: {
  readonly historyEntryId: string;
  readonly expectedVersion: number;
  readonly previousCanonicalHost: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleRollback(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (
      !window.confirm(
        `Roll back to the settings state from before this change (canonicalHost was "${previousCanonicalHost}")?`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/settings/history/${historyEntryId}/rollback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to roll back.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleRollback(event)} style={{ display: 'inline' }}>
      <button type="submit" disabled={pending}>
        {pending ? 'Rolling back…' : 'Roll back to this state'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
