'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Edits an existing category translation's name/SEO fields — never slug
 * (ChangeSlugForm owns that explicit command). An emptied SEO field is sent
 * as `null` (clears it); the server rejects clearing a required SEO field
 * while the category is PUBLISHED.
 */
export function EditCategoryTranslationForm({
  endpoint,
  expectedVersion,
  initialName,
  initialSeoTitle,
  initialSeoDescription,
}: {
  readonly endpoint: string;
  readonly expectedVersion: number;
  readonly initialName: string;
  readonly initialSeoTitle?: string | undefined;
  readonly initialSeoDescription?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [seoTitle, setSeoTitle] = useState(initialSeoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription ?? '');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          name,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
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
        SEO title
        <input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
      </label>
      <label>
        SEO description
        <input value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} />
      </label>
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
