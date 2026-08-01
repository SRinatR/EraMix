'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';

const PLATFORM_ROLES = ['CUSTOMER', 'MANAGER', 'CONTENT_EDITOR', 'ADMIN', 'AUDITOR'] as const;

export function UpdateRoleForm({
  userId,
  currentRole,
  expectedVersion,
}: {
  readonly userId: string;
  readonly currentRole: string;
  readonly expectedVersion: number;
}) {
  const router = useRouter();
  const [platformRole, setPlatformRole] = useState(currentRole);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platformRole, expectedVersion }),
      });
      if (!response.ok) {
        const problem = (await response.json()) as { detail?: string; title?: string };
        setError(problem.detail ?? problem.title ?? 'Failed to update the role.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <select value={platformRole} onChange={(event) => setPlatformRole(event.target.value)}>
        {PLATFORM_ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
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
