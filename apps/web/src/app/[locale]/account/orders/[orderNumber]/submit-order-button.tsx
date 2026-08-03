'use client';

import { sendAnalyticsEvent } from '@/components/analytics-client';
import { useRouter } from '@/i18n/navigation';
import { orderUrl, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

/**
 * Submits a DRAFT order (DRAFT -> SUBMITTED). The Idempotency-Key is
 * generated once per mount and reused across retries of the same submit
 * attempt (a network retry or a double-click replays the same key, which
 * submitOrder — packages/application/src/order-lifecycle.ts — treats as a
 * no-op rather than a duplicate transition); a fresh key is only ever needed
 * for a genuinely new submit attempt, which this component doesn't need to
 * handle since a successful submit removes the button (status is no longer
 * DRAFT) via router.refresh().
 */
export function SubmitOrderButton({
  orderId,
  orderNumber,
  locale,
  expectedVersion,
}: {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly locale: LocaleCode;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (
      !window.confirm(
        'Submit this order for review? Once submitted, its lines can no longer be edited.',
      )
    ) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ expectedVersion }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to submit the order.');
        return;
      }
      // The primary organic conversion (docs/runbooks/search-visibility.md:
      // "the primary organic conversion") — renamed from rfq_submit (schema v1).
      sendAnalyticsEvent(locale, {
        eventName: 'lead_submitted',
        pageType: 'other',
        canonicalPath: orderUrl({ locale, orderNumber }),
        orderNumber,
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit order'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
