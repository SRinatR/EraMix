'use client';

import { useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

export function AddContentTranslationForm({
  contentId,
  existingLocales,
  allowSlug,
}: {
  readonly contentId: string;
  readonly existingLocales: readonly string[];
  readonly allowSlug: boolean;
}) {
  const router = useRouter();
  const availableLocales = SUPPORTED_LOCALES.filter((locale) => !existingLocales.includes(locale));
  const [locale, setLocale] = useState<LocaleCode>(availableLocales[0] ?? SUPPORTED_LOCALES[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/content/${contentId}/translations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale,
          title,
          content: body
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          slug: allowSlug ? slug || undefined : undefined,
        }),
      });
      const responseBody = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(responseBody.detail ?? responseBody.title ?? 'Failed to add the translation.');
        return;
      }
      setTitle('');
      setBody('');
      setSlug('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (availableLocales.length === 0) {
    return <p>All locales have a translation.</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <select value={locale} onChange={(event) => setLocale(event.target.value as LocaleCode)}>
        {availableLocales.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <input
        placeholder="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <textarea
        placeholder="Body (one paragraph per line)"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
      />
      {allowSlug && (
        <input
          placeholder="Slug (optional)"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add translation'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
