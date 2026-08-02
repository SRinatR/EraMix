'use client';

import { useState } from 'react';

interface FeedPreviewDiagnostic {
  readonly offerId: string;
  readonly productId: string;
  readonly locale?: string;
  readonly reasons: readonly string[];
}

interface FeedPreviewResponse {
  readonly generatedAt: string;
  readonly itemCount: number;
  readonly diagnostics: readonly FeedPreviewDiagnostic[];
  readonly tsvPreview: string;
}

/**
 * CLAUDE.md item 5's admin operational view: on-demand feed preview,
 * per-offer eligibility reasons, and the raw TSV that would be generated —
 * never a public feed URL. `itemCount` is provably always 0 while
 * PlatformSettings.merchantCenterEnabled stays hard-false (ADR-0019).
 */
export function FeedPreviewPanel() {
  const [result, setResult] = useState<FeedPreviewResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleGenerate(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/offers/feed-preview');
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to generate preview.');
        return;
      }
      setResult((await response.json()) as FeedPreviewResponse);
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2>Merchant feed preview (dormant)</h2>
      <button type="button" disabled={pending} onClick={() => void handleGenerate()}>
        {pending ? 'Generating…' : 'Generate preview'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div>
          <p>
            Generated {result.generatedAt} — {result.itemCount} eligible item(s).
          </p>
          <h3>Diagnostics ({result.diagnostics.length})</h3>
          <ul>
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.offerId}-${diagnostic.locale ?? ''}-${index}`}>
                offer {diagnostic.offerId}
                {diagnostic.locale ? ` (${diagnostic.locale})` : ''}:{' '}
                {diagnostic.reasons.join(', ')}
              </li>
            ))}
          </ul>
          <h3>Raw TSV</h3>
          <pre>{result.tsvPreview}</pre>
        </div>
      )}
    </section>
  );
}
