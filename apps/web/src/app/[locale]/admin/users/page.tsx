import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { UpdateRoleForm } from './update-role-form';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'users.manage');
  } catch {
    notFound();
  }

  const container = getContainer();
  const pagination = parsePaginationParams(await searchParams);
  const { items: users, total, limit, offset } = await container.users.listAll(pagination);

  return (
    <main>
      <h1>Users and roles</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td>{user.email}</td>
              <td>{user.status}</td>
              <td>
                <UpdateRoleForm
                  userId={user.id}
                  currentRole={user.platformRole}
                  expectedVersion={user.version}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls basePath="/admin/users" total={total} limit={limit} offset={offset} />
    </main>
  );
}
