'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Posts a comment to an order (ORD-008/ACC-004/TZ §6.6). `canPostInternal`
 * gates the visibility selector client-side only for UX — the server
 * (packages/application/src/order-comments.ts) is the actual enforcement
 * point and rejects an INTERNAL comment from anyone lacking
 * `order.transition` regardless of what this form sends.
 */
export function AddOrderCommentForm({
  orderId,
  canPostInternal,
}: {
  readonly orderId: string;
  readonly canPostInternal: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, visibility }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to add the comment.');
        return;
      }
      setBody('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Comment
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          required
        />
      </label>
      {canPostInternal && (
        <label>
          Visibility
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'INTERNAL')}
          >
            <option value="PUBLIC">Public (visible to the customer)</option>
            <option value="INTERNAL">Internal (manager/admin only)</option>
          </select>
        </label>
      )}
      <button type="submit" disabled={pending || body.trim().length === 0}>
        {pending ? 'Posting…' : 'Add comment'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
