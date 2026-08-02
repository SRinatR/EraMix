import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import {
  parseAllowlistedParam,
  parsePaginationParams,
  parseStringParam,
} from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { UpdateRoleForm } from './update-role-form';
import { requirePermission, type UserListFilter } from '@eramix/application';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const SORTS: readonly NonNullable<UserListFilter['sort']>[] = [
  'createdAt_asc',
  'createdAt_desc',
  'displayName_asc',
  'displayName_desc',
];

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
  const resolved = await searchParams;
  const search = parseStringParam(resolved, 'search');
  const sort = parseAllowlistedParam(resolved, 'sort', SORTS);
  const pagination = parsePaginationParams(resolved);
  const { data: users, page } = await container.users.listAll({
    ...pagination,
    ...(search !== undefined ? { search } : {}),
    ...(sort !== undefined ? { sort } : {}),
  });

  return (
    <main>
      <h1>Users and roles</h1>
      <form method="get">
        <label>
          Search
          <input type="search" name="search" defaultValue={search ?? ''} />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={sort ?? 'createdAt_asc'}>
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>
      {users.length === 0 ? (
        <p>No users match this filter.</p>
      ) : (
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
      )}
      <PaginationControls
        basePath="/admin/users"
        page={page}
        currentCursor={pagination.cursor}
        extraParams={{
          ...(search !== undefined ? { search } : {}),
          ...(sort !== undefined ? { sort } : {}),
        }}
      />
    </main>
  );
}
