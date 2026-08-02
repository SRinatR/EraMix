import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CreateMembershipForm } from './create-membership-form';
import { MembershipStatusForm } from './membership-status-form';

export const dynamic = 'force-dynamic';

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

  const pagination = parsePaginationParams(await searchParams);
  const [membershipPage, userPage] = await Promise.all([
    container.memberships.listByCompany(companyId, pagination),
    // User picker for "add a member", not a list screen — bounded rather
    // than paginated, same rationale as the category pickers elsewhere.
    container.users.listAll({ limit: 200 }),
  ]);
  const { items: memberships, total, limit, offset } = membershipPage;
  const users = userPage.items;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const existingMemberUserIds = new Set(memberships.map((membership) => membership.userId));
  const eligibleUsers = users.filter((user) => !existingMemberUserIds.has(user.id));

  return (
    <main>
      <h1>{company.legalName} — members</h1>
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
      <PaginationControls
        basePath={`/admin/companies/${companyId}/memberships`}
        total={total}
        limit={limit}
        offset={offset}
      />

      <h2>Add a member</h2>
      <CreateMembershipForm companyId={companyId} users={eligibleUsers} />
    </main>
  );
}
