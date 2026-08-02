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
  seoTitle: string;
  seoDescription: string;
}

function emptyRow(): TranslationRow {
  return { locale: 'en', name: '', slug: '', seoTitle: '', seoDescription: '' };
}

export function CreateCategoryForm({
  parentOptions,
}: {
  readonly parentOptions: readonly CategoryOption[];
}) {
  const router = useRouter();
  const [parentId, setParentId] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
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
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parentId: parentId || undefined,
          sortOrder,
          translations: translations.map((row) => ({
            locale: row.locale,
            name: row.name,
            slug: row.slug || undefined,
            seoTitle: row.seoTitle || undefined,
            seoDescription: row.seoDescription || undefined,
          })),
        }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to create the category.');
        return;
      }
      router.push('/admin/catalog');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Parent category
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">(none — top level)</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort order
        <input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value))}
        />
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
            Slug (optional — sets the initial canonical URL)
            <input
              value={row.slug}
              onChange={(event) => updateRow(index, { slug: event.target.value })}
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
          {pending ? 'Creating…' : 'Create category'}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
