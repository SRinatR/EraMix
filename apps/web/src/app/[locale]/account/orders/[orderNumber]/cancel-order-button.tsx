'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export function CancelOrderButton({
  orderId,
  expectedVersion,
}: {
  readonly orderId: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleCancel(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion, toStatus: 'CANCELLED' }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to cancel the order.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleCancel(event)}>
      <button type="submit" disabled={pending}>
        {pending ? 'Cancelling…' : 'Cancel order'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
