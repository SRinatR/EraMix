'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

const COMPANY_ROLES = ['OWNER', 'MEMBER'] as const;

export function CreateMembershipForm({
  companyId,
  users,
}: {
  readonly companyId: string;
  readonly users: readonly { id: string; email: string; displayName: string }[];
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? '');
  const [role, setRole] = useState<(typeof COMPANY_ROLES)[number]>('MEMBER');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/companies/${companyId}/memberships`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to add the member.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (users.length === 0) {
    return <p>No users available to add.</p>;
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        User
        <select value={userId} onChange={(event) => setUserId(event.target.value)}>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} ({user.email})
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof COMPANY_ROLES)[number])}
        >
          {COMPANY_ROLES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add member'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
