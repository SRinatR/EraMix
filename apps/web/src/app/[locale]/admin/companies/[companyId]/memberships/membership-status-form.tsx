'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'REVOKED'] as const;

export function MembershipStatusForm({
  companyId,
  membershipId,
  currentStatus,
  expectedVersion,
}: {
  readonly companyId: string;
  readonly membershipId: string;
  readonly currentStatus: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/admin/companies/${companyId}/memberships/${membershipId}/status`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status, expectedVersion }),
        },
      );
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to update the membership status.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <select value={status} onChange={(event) => setStatus(event.target.value)}>
        {MEMBERSHIP_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
