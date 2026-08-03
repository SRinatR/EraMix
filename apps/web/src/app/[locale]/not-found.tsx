import type { Metadata } from 'next';

// docs/runbooks/http-error-contract.md: a 404 must never be indexed — an
// accidentally-crawled dead link must not enter the index just because
// Next.js still renders a (thin, honest) page for it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LocaleNotFound() {
  return (
    <main>
      <h1>404 — Not found</h1>
      <p>The page you requested does not exist, is unpublished, or was moved.</p>
    </main>
  );
}
