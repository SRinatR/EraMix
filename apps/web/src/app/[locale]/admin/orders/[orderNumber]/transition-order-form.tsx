'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export function TransitionOrderForm({
  orderId,
  expectedVersion,
  allowedStatuses,
}: {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly allowedStatuses: readonly string[];
}) {
  const router = useRouter();
  const [toStatus, setToStatus] = useState(allowedStatuses[0] ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          toStatus,
          ...(reason ? { reason } : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to transition the order.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (allowedStatuses.length === 0) {
    return <p>This order has no further allowed transitions.</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        New status
        <select value={toStatus} onChange={(event) => setToStatus(event.target.value)}>
          {allowedStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason (required to cancel a confirmed order)
        <input value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Transition'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
