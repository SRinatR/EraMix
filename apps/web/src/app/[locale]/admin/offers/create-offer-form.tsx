'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

const EMPTY = {
  productId: '',
  sellerName: '',
  priceAmountMinor: 0,
  currency: 'USD',
  taxDisplayPolicy: 'TAX_EXCLUDED' as const,
  availability: 'IN_STOCK' as const,
  sku: '',
  eligibleCountries: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
};

/** Always creates a DRAFT (CLAUDE.md/ADR-0019: publishing is a deliberate, separate, audited second step via OfferEditForm). */
export function CreateOfferForm() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId: values.productId,
          sellerName: values.sellerName,
          priceAmountMinor: values.priceAmountMinor,
          currency: values.currency,
          taxDisplayPolicy: values.taxDisplayPolicy,
          availability: values.availability,
          sku: values.sku,
          eligibleCountries: values.eligibleCountries
            .split(',')
            .map((code) => code.trim().toUpperCase())
            .filter((code) => code.length > 0),
          effectiveFrom: values.effectiveFrom,
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to create.');
        return;
      }
      setValues(EMPTY);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Product ID
        <input
          type="text"
          required
          value={values.productId}
          onChange={(event) => setValues({ ...values, productId: event.target.value })}
        />
      </label>
      <label>
        Seller name
        <input
          type="text"
          required
          value={values.sellerName}
          onChange={(event) => setValues({ ...values, sellerName: event.target.value })}
        />
      </label>
      <label>
        Price (minor units)
        <input
          type="number"
          required
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
          required
          value={values.currency}
          onChange={(event) => setValues({ ...values, currency: event.target.value.toUpperCase() })}
        />
      </label>
      <label>
        Tax display policy
        <select
          value={values.taxDisplayPolicy}
          onChange={(event) =>
            setValues({
              ...values,
              taxDisplayPolicy: event.target.value as typeof values.taxDisplayPolicy,
            })
          }
        >
          <option value="TAX_EXCLUDED">Tax excluded</option>
          <option value="TAX_INCLUDED">Tax included</option>
        </select>
      </label>
      <label>
        Availability
        <select
          value={values.availability}
          onChange={(event) =>
            setValues({ ...values, availability: event.target.value as typeof values.availability })
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
        SKU
        <input
          type="text"
          required
          value={values.sku}
          onChange={(event) => setValues({ ...values, sku: event.target.value })}
        />
      </label>
      <label>
        Eligible countries (comma-separated ISO 3166-1 alpha-2)
        <input
          type="text"
          placeholder="US, CA"
          value={values.eligibleCountries}
          onChange={(event) => setValues({ ...values, eligibleCountries: event.target.value })}
        />
      </label>
      <label>
        Effective from
        <input
          type="date"
          required
          value={values.effectiveFrom}
          onChange={(event) => setValues({ ...values, effectiveFrom: event.target.value })}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create offer (draft)'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
