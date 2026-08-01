'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export interface ProductOption {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
}

export interface CompanyOption {
  readonly id: string;
  readonly legalName: string;
}

interface LineRow {
  readonly productId: string;
  readonly quantity: number;
}

export function CreateOrderForm({
  companies,
  products,
}: {
  readonly companies: readonly CompanyOption[];
  readonly products: readonly ProductOption[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [lines, setLines] = useState<LineRow[]>([
    { productId: products[0]?.id ?? '', quantity: 1 },
  ]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function updateLine(index: number, patch: Partial<LineRow>): void {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((current) => [...current, { productId: products[0]?.id ?? '', quantity: 1 }]);
  }

  function removeLine(index: number): void {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId,
          lines: lines.filter((line) => line.productId),
        }),
      });
      const body = (await response.json()) as {
        orderNumber?: string;
        detail?: string;
        title?: string;
      };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to create the order.');
        return;
      }
      router.push(`/account/orders/${body.orderNumber}`);
    } finally {
      setPending(false);
    }
  }

  if (companies.length === 0) {
    return <p>You must be a member of a company before you can place an order.</p>;
  }
  if (products.length === 0) {
    return <p>No published products are available to order yet.</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Company
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.legalName}
            </option>
          ))}
        </select>
      </label>

      <h2>Lines</h2>
      {lines.map((line, index) => (
        <div key={index}>
          <label>
            Product
            <select
              value={line.productId}
              onChange={(event) => updateLine(index, { productId: event.target.value })}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
            />
          </label>
          {lines.length > 1 && (
            <button type="button" onClick={() => removeLine(index)}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addLine}>
        Add another line
      </button>

      <p>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create draft order'}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
