/**
 * Next.js Suspense-boundary fallback for every route under `[locale]`
 * (every public/account/admin page here is `force-dynamic`, so this is the
 * explicit loading state CLAUDE.md/TZ's "responsive, accessible UI with
 * explicit loading, empty, validation, permission, and failure states"
 * names — not decorative).
 */
export default function LocaleLoading() {
  return (
    <main aria-busy="true">
      <p role="status">Loading…</p>
    </main>
  );
}
