'use client';

import { useRouter } from '@/i18n/navigation';
import { formatIndicativePrice } from '@/components/indicative-price';
import type { IndicativePrice } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

export interface ProductOption {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly indicativePrice?: IndicativePrice | undefined;
}

/** Adds a line to a DRAFT order — only rendered while the order is still DRAFT (ORD-006). */
export function AddLineForm({
  orderId,
  expectedVersion,
  products,
}: {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly products: readonly ProductOption[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/orders/by-id/${orderId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          productId,
          quantity,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to add the line.');
        return;
      }
      setQuantity(1);
      setNote('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Product
        <select value={productId} onChange={(event) => setProductId(event.target.value)}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} ({product.sku})
              {product.indicativePrice
                ? ` — ${formatIndicativePrice(product.indicativePrice)}`
                : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
        />
      </label>
      <label>
        Comment
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note for this line"
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add line'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
