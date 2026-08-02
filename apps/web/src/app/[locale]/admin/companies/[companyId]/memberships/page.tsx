import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { parseAllowlistedParam, parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { requirePermission, type MembershipListFilter } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CreateMembershipForm } from './create-membership-form';
import { MembershipStatusForm } from './membership-status-form';

export const dynamic = 'force-dynamic';

const SORTS: readonly NonNullable<MembershipListFilter['sort']>[] = [
  'createdAt_asc',
  'createdAt_desc',
];

export default async function AdminCompanyMembershipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
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
  const company = await container.companies.findById(companyId);
  if (!company) {
    notFound();
  }

  const resolved = await searchParams;
  const pagination = parsePaginationParams(resolved);
  const sort = parseAllowlistedParam(resolved, 'sort', SORTS);
  const [membershipPage, userPage] = await Promise.all([
    container.memberships.listByCompany(companyId, {
      ...pagination,
      ...(sort !== undefined ? { sort } : {}),
    }),
    // User picker for "add a member", not a list screen — bounded rather
    // than paginated, same rationale as the category pickers elsewhere.
    container.users.listAll({ limit: 200 }),
  ]);
  const { data: memberships, page } = membershipPage;
  const users = userPage.data;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const existingMemberUserIds = new Set(memberships.map((membership) => membership.userId));
  const eligibleUsers = users.filter((user) => !existingMemberUserIds.has(user.id));

  return (
    <main>
      <h1>{company.legalName} — members</h1>
      <form method="get">
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
      {memberships.length === 0 ? (
        <p>No members match this filter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((membership) => {
              const user = usersById.get(membership.userId);
              return (
                <tr key={membership.id}>
                  <td>{user ? `${user.displayName} (${user.email})` : membership.userId}</td>
                  <td>{membership.role}</td>
                  <td>
                    <MembershipStatusForm
                      companyId={companyId}
                      membershipId={membership.id}
                      currentStatus={membership.status}
                      expectedVersion={membership.version}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <PaginationControls
        basePath={`/admin/companies/${companyId}/memberships`}
        page={page}
        currentCursor={pagination.cursor}
        extraParams={sort !== undefined ? { sort } : {}}
      />

      <h2>Add a member</h2>
      <CreateMembershipForm companyId={companyId} users={eligibleUsers} />
    </main>
  );
}
