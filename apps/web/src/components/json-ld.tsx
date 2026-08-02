/**
 * `<script type="application/ld+json">` is inert data, not an executable
 * script — CSP's `script-src` (apps/web/next.config.ts) does not govern it,
 * so this needs no nonce or `'unsafe-inline'` exception. `data` must only
 * ever be built from validated domain fields (never raw user HTML) since
 * `JSON.stringify` here is not an HTML sanitizer.
 */
export function JsonLd({ data }: { readonly data: Record<string, unknown> }) {
  return (
    // eslint-disable-next-line react/no-danger -- schema.org JSON-LD requires a literal <script> body; content is server-built from validated domain fields, never raw user input
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
