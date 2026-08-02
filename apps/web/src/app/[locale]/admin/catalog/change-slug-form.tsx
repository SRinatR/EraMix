'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

/** Phase 6's "explicit slug operation" — one translation, one canonical slug. */
export function ChangeSlugForm({
  endpoint,
  currentSlug,
  extraBody,
}: {
  readonly endpoint: string;
  readonly currentSlug?: string | undefined;
  readonly extraBody?: Record<string, string> | undefined;
}) {
  const router = useRouter();
  const [newSlug, setNewSlug] = useState('');
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
        body: JSON.stringify({ newSlug, ...extraBody }),
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to change the slug.');
        return;
      }
      setNewSlug('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      {currentSlug && <span>{currentSlug}</span>}
      <input
        placeholder="New slug"
        value={newSlug}
        onChange={(event) => setNewSlug(event.target.value)}
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Change slug'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
