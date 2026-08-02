'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Edits an existing product translation's name/description/SEO fields/
 * indicative price — never slug (ChangeSlugForm does not apply to products;
 * product slugs have no separate route table per ADR-0010, and are not
 * editable through this form either — a stale slug simply 308-redirects).
 * Leaving both price fields empty clears the indicative price entirely.
 */
export function EditProductTranslationForm({
  endpoint,
  expectedVersion,
  initialName,
  initialDescription,
  initialSeoTitle,
  initialSeoDescription,
  initialPriceFromMinor,
  initialCurrency,
  initialPriceDisclaimer,
}: {
  readonly endpoint: string;
  readonly expectedVersion: number;
  readonly initialName: string;
  readonly initialDescription?: string | undefined;
  readonly initialSeoTitle?: string | undefined;
  readonly initialSeoDescription?: string | undefined;
  readonly initialPriceFromMinor?: number | undefined;
  readonly initialCurrency?: string | undefined;
  readonly initialPriceDisclaimer?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription ?? '');
  const [priceFromMinor, setPriceFromMinor] = useState(
    initialPriceFromMinor !== undefined ? String(initialPriceFromMinor) : '',
  );
  const [currency, setCurrency] = useState(initialCurrency ?? '');
  const [priceDisclaimer, setPriceDisclaimer] = useState(initialPriceDisclaimer ?? '');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const hasPrice = priceFromMinor.trim() !== '' && currency.trim() !== '';
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          name,
          description: description.trim() || null,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          indicativePrice: hasPrice
            ? {
                priceFromMinor: Number(priceFromMinor),
                currency: currency.trim().toUpperCase(),
                ...(priceDisclaimer.trim() ? { priceDisclaimer: priceDisclaimer.trim() } : {}),
              }
            : null,
        }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to save the translation.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        SEO title
        <input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
      </label>
      <label>
        SEO description
        <input value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} />
      </label>
      <fieldset>
        <legend>Indicative &quot;from&quot; price (non-binding — never a payable total)</legend>
        <label>
          Price (minor units)
          <input
            type="number"
            min={0}
            value={priceFromMinor}
            onChange={(event) => setPriceFromMinor(event.target.value)}
          />
        </label>
        <label>
          Currency (ISO 4217)
          <input
            maxLength={3}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            placeholder="USD"
          />
        </label>
        <label>
          Disclaimer
          <input
            value={priceDisclaimer}
            onChange={(event) => setPriceDisclaimer(event.target.value)}
            placeholder="from"
          />
        </label>
      </fieldset>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
