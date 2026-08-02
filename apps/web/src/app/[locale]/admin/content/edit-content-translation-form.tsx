'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

function bodyToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.filter((line): line is string => typeof line === 'string').join('\n');
  }
  return '';
}

/**
 * Edits an existing content translation's title/summary/body/SEO fields —
 * never slug (ChangeSlugForm owns that explicit command). An emptied
 * summary/SEO field is sent as `null` (clears it); the server rejects
 * clearing a required SEO field while the content item is PUBLISHED.
 */
export function EditContentTranslationForm({
  endpoint,
  expectedVersion,
  initialTitle,
  initialSummary,
  initialContent,
  initialSeoTitle,
  initialSeoDescription,
}: {
  readonly endpoint: string;
  readonly expectedVersion: number;
  readonly initialTitle: string;
  readonly initialSummary?: string | undefined;
  readonly initialContent: unknown;
  readonly initialSeoTitle?: string | undefined;
  readonly initialSeoDescription?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary ?? '');
  const [body, setBody] = useState(bodyToText(initialContent));
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
          title,
          summary: summary.trim() || null,
          content: body
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
        }),
      });
      const responseBody = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(responseBody.detail ?? responseBody.title ?? 'Failed to save the translation.');
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
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label>
        Summary
        <input value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <label>
        Body (one paragraph per line)
        <textarea value={body} onChange={(event) => setBody(event.target.value)} required />
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
