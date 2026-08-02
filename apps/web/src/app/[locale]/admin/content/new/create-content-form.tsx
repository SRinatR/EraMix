'use client';

import { useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type ContentType, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

const CONTENT_TYPES: readonly ContentType[] = ['ARTICLE', 'PAGE', 'FAQ_ITEM'];

interface TranslationRow {
  locale: LocaleCode;
  title: string;
  summary: string;
  body: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
}

function emptyRow(): TranslationRow {
  return {
    locale: 'en',
    title: '',
    summary: '',
    body: '',
    slug: '',
    seoTitle: '',
    seoDescription: '',
  };
}

export function CreateContentForm() {
  const router = useRouter();
  const [type, setType] = useState<ContentType>('ARTICLE');
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
      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          translations: translations.map((row) => ({
            locale: row.locale,
            title: row.title,
            summary: row.summary || undefined,
            // One paragraph per non-empty line — see apps/web/src/components/content-body.tsx.
            content: row.body
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
            seoTitle: row.seoTitle || undefined,
            seoDescription: row.seoDescription || undefined,
            slug: type === 'FAQ_ITEM' ? undefined : row.slug || undefined,
          })),
        }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to create the content item.');
        return;
      }
      router.push('/admin/content');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Type
        <select value={type} onChange={(event) => setType(event.target.value as ContentType)}>
          {CONTENT_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
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
            Title
            <input
              value={row.title}
              onChange={(event) => updateRow(index, { title: event.target.value })}
              required
            />
          </label>
          <label>
            Summary
            <input
              value={row.summary}
              onChange={(event) => updateRow(index, { summary: event.target.value })}
            />
          </label>
          <label>
            Body (one paragraph per line)
            <textarea
              value={row.body}
              onChange={(event) => updateRow(index, { body: event.target.value })}
              required
            />
          </label>
          {type !== 'FAQ_ITEM' && (
            <label>
              Slug (optional — sets the initial canonical URL)
              <input
                value={row.slug}
                onChange={(event) => updateRow(index, { slug: event.target.value })}
              />
            </label>
          )}
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
          {pending ? 'Creating…' : 'Create content item'}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
