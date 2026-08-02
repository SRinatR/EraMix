'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/** Removes a line from a DRAFT order — only rendered while the order is still DRAFT (ORD-006). */
export function RemoveLineButton({
  orderId,
  lineId,
  expectedVersion,
  productName,
}: {
  readonly orderId: string;
  readonly lineId: string;
  readonly expectedVersion: number;
  readonly productName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleRemove(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!window.confirm(`Remove "${productName}" from this order?`)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/lines/${lineId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to remove the line.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleRemove(event)} style={{ display: 'inline' }}>
      <button type="submit" disabled={pending}>
        {pending ? 'Removing…' : 'Remove'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
