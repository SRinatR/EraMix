'use client';

import { useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
}

interface TranslationRow {
  locale: LocaleCode;
  name: string;
  slug: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  priceFromMinor: string;
  currency: string;
  priceDisclaimer: string;
}

function emptyRow(): TranslationRow {
  return {
    locale: 'en',
    name: '',
    slug: '',
    description: '',
    seoTitle: '',
    seoDescription: '',
    priceFromMinor: '',
    currency: '',
    priceDisclaimer: '',
  };
}

export function CreateProductForm({
  categoryOptions,
}: {
  readonly categoryOptions: readonly CategoryOption[];
}) {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState(categoryOptions[0]?.id ?? '');
  const [translations, setTranslations] = useState<TranslationRow[]>([emptyRow()]);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function updateRow(index: number, patch: Partial<TranslationRow>): void {
    setTranslations((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sku,
          categoryId,
          translations: translations.map((row) => ({
            locale: row.locale,
            name: row.name,
            slug: row.slug,
            description: row.description || undefined,
            seoTitle: row.seoTitle || undefined,
            seoDescription: row.seoDescription || undefined,
            indicativePrice:
              row.priceFromMinor && row.currency
                ? {
                    priceFromMinor: Number(row.priceFromMinor),
                    currency: row.currency,
                    priceDisclaimer: row.priceDisclaimer || undefined,
                  }
                : undefined,
          })),
        }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to create the product.');
        return;
      }
      router.push('/admin/catalog');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (categoryOptions.length === 0) {
    return <p>Create a category first — a product must belong to one.</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        SKU
        <input value={sku} onChange={(event) => setSku(event.target.value)} required />
      </label>
      <label>
        Category
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <h2>Translations</h2>
      {translations.map((row, index) => (
        <fieldset key={index}>
          <label>
            Locale
            <select
              value={row.locale}
              onChange={(event) => updateRow(index, { locale: event.target.value as LocaleCode })}
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              value={row.name}
              onChange={(event) => updateRow(index, { name: event.target.value })}
              required
            />
          </label>
          <label>
            Slug
            <input
              value={row.slug}
              onChange={(event) => updateRow(index, { slug: event.target.value })}
              required
            />
          </label>
          <label>
            Description
            <textarea
              value={row.description}
              onChange={(event) => updateRow(index, { description: event.target.value })}
            />
          </label>
          <label>
            SEO title
            <input
              value={row.seoTitle}
              onChange={(event) => updateRow(index, { seoTitle: event.target.value })}
            />
          </label>
          <label>
            SEO description
            <input
              value={row.seoDescription}
              onChange={(event) => updateRow(index, { seoDescription: event.target.value })}
            />
          </label>
          <p>Indicative "from" price (optional, non-binding — never a payable total):</p>
          <label>
            Price (minor units)
            <input
              type="number"
              min={0}
              value={row.priceFromMinor}
              onChange={(event) => updateRow(index, { priceFromMinor: event.target.value })}
            />
          </label>
          <label>
            Currency (ISO 4217)
            <input
              value={row.currency}
              maxLength={3}
              onChange={(event) => updateRow(index, { currency: event.target.value.toUpperCase() })}
            />
          </label>
          <label>
            Price disclaimer
            <input
              value={row.priceDisclaimer}
              onChange={(event) => updateRow(index, { priceDisclaimer: event.target.value })}
            />
          </label>
          {translations.length > 1 && (
            <button
              type="button"
              onClick={() => setTranslations((current) => current.filter((_, i) => i !== index))}
            >
              Remove translation
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" onClick={() => setTranslations((current) => [...current, emptyRow()])}>
        Add another translation
      </button>

      <p>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create product'}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
