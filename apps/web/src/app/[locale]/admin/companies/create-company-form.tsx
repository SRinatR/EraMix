'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

export function CreateCompanyForm() {
  const router = useRouter();
  const [legalName, setLegalName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ legalName }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to create the company.');
        return;
      }
      setLegalName('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Legal name
        <input
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          required
          maxLength={255}
        />
      </label>
      <button type="submit" disabled={pending || legalName.trim().length === 0}>
        {pending ? 'Creating…' : 'Create company'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
