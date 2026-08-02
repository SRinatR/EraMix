'use client';

import { useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

/**
 * Shared by /admin/catalog's category and product rows — both translation
 * endpoints accept { locale, name, slug?, ... } and return
 * PublicationTransitionResult. Product requires slug; category does not.
 */
export function AddTranslationForm({
  endpoint,
  existingLocales,
  requireSlug,
}: {
  readonly endpoint: string;
  readonly existingLocales: readonly string[];
  readonly requireSlug: boolean;
}) {
  const router = useRouter();
  const availableLocales = SUPPORTED_LOCALES.filter((locale) => !existingLocales.includes(locale));
  const [locale, setLocale] = useState<LocaleCode>(availableLocales[0] ?? SUPPORTED_LOCALES[0]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale, name, slug: slug || undefined }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to add the translation.');
        return;
      }
      setName('');
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
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        placeholder={requireSlug ? 'Slug' : 'Slug (optional)'}
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        required={requireSlug}
      />
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add translation'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
