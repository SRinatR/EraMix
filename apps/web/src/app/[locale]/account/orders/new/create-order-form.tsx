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

function productOptionLabel(product: ProductOption): string {
  const base = `${product.name} (${product.sku})`;
  return product.indicativePrice
    ? `${base} — ${formatIndicativePrice(product.indicativePrice)}`
    : base;
}

export interface CompanyOption {
  readonly id: string;
  readonly legalName: string;
}

interface LineRow {
  readonly productId: string;
  readonly quantity: number;
  readonly note: string;
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
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [lines, setLines] = useState<LineRow[]>([
    { productId: products[0]?.id ?? '', quantity: 1, note: '' },
  ]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function updateLine(index: number, patch: Partial<LineRow>): void {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((current) => [
      ...current,
      { productId: products[0]?.id ?? '', quantity: 1, note: '' },
    ]);
  }

  function removeLine(index: number): void {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);

    const usableLines = lines.filter((line) => line.productId);
    if (usableLines.length === 0) {
      setError('Add at least one product line.');
      return;
    }
    if (usableLines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
      setError('Quantity must be a positive whole number for every line.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId,
          ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
          lines: usableLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            ...(line.note.trim() ? { note: line.note.trim() } : {}),
          })),
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

      <fieldset>
        <legend>Contact for this order (optional)</legend>
        <label>
          Name
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </label>
        <label>
          Phone
          <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </label>
      </fieldset>

      <h2>Lines</h2>
      <p>
        Prices shown, where available, are non-binding indicative &quot;from&quot; prices — the
        final quote is confirmed manually by a manager after submission.
      </p>
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
                  {productOptionLabel(product)}
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
              value={line.quantity}
              onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
            />
          </label>
          <label>
            Comment
            <input
              value={line.note}
              onChange={(event) => updateLine(index, { note: event.target.value })}
              placeholder="Optional note for this line"
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
