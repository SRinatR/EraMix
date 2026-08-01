'use client';

export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>500 — Something went wrong</h1>
      <p>An unexpected error occurred. It has been logged; please try again.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
