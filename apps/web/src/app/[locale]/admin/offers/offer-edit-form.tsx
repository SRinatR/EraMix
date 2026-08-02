'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export interface OfferEditFormValues {
  readonly id: string;
  readonly state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  readonly sellerName: string;
  readonly priceAmountMinor: number;
  readonly currency: string;
  readonly availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'BACKORDER' | 'DISCONTINUED';
  readonly checkoutUrl: string | null;
  readonly deliveryPolicyRef: string | null;
  readonly returnPolicyRef: string | null;
  readonly version: number;
}

/**
 * Publishing (state: 'PUBLISHED') here still never syndicates anything —
 * PlatformSettings.merchantCenterEnabled stays hard-false (ADR-0019). This
 * form only exercises the domain/application validators (checkout URL,
 * policy refs, price, direct-sale opt-in) end to end.
 */
export function OfferEditForm({ initial }: { readonly initial: OfferEditFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/offers/${values.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: values.version,
          state: values.state,
          sellerName: values.sellerName,
          priceAmountMinor: values.priceAmountMinor,
          currency: values.currency,
          availability: values.availability,
          checkoutUrl: values.checkoutUrl,
          deliveryPolicyRef: values.deliveryPolicyRef,
          returnPolicyRef: values.returnPolicyRef,
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
        State
        <select
          value={values.state}
          onChange={(event) =>
            setValues({ ...values, state: event.target.value as OfferEditFormValues['state'] })
          }
        >
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </label>
      <label>
        Seller name
        <input
          type="text"
          value={values.sellerName}
          onChange={(event) => setValues({ ...values, sellerName: event.target.value })}
        />
      </label>
      <label>
        Price (minor units)
        <input
          type="number"
          value={values.priceAmountMinor}
          onChange={(event) =>
            setValues({ ...values, priceAmountMinor: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Currency
        <input
          type="text"
          maxLength={3}
          value={values.currency}
          onChange={(event) => setValues({ ...values, currency: event.target.value.toUpperCase() })}
        />
      </label>
      <label>
        Availability
        <select
          value={values.availability}
          onChange={(event) =>
            setValues({
              ...values,
              availability: event.target.value as OfferEditFormValues['availability'],
            })
          }
        >
          <option value="IN_STOCK">In stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
          <option value="PREORDER">Preorder</option>
          <option value="BACKORDER">Backorder</option>
          <option value="DISCONTINUED">Discontinued</option>
        </select>
      </label>
      <label>
        Checkout URL
        <input
          type="text"
          placeholder="required to publish"
          value={values.checkoutUrl ?? ''}
          onChange={(event) => setValues({ ...values, checkoutUrl: event.target.value || null })}
        />
      </label>
      <label>
        Delivery policy reference
        <input
          type="text"
          value={values.deliveryPolicyRef ?? ''}
          onChange={(event) =>
            setValues({ ...values, deliveryPolicyRef: event.target.value || null })
          }
        />
      </label>
      <label>
        Return policy reference
        <input
          type="text"
          value={values.returnPolicyRef ?? ''}
          onChange={(event) =>
            setValues({ ...values, returnPolicyRef: event.target.value || null })
          }
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
