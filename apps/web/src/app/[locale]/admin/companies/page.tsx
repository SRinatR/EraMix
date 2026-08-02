import { Link } from '@/i18n/navigation';
import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import {
  parseAllowlistedParam,
  parsePaginationParams,
  parseStringParam,
} from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { requirePermission, type CompanyListFilter } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CompanyStatusForm } from './company-status-form';
import { CreateCompanyForm } from './create-company-form';

export const dynamic = 'force-dynamic';

const SORTS: readonly NonNullable<CompanyListFilter['sort']>[] = [
  'createdAt_asc',
  'createdAt_desc',
  'legalName_asc',
  'legalName_desc',
];

export default async function AdminCompaniesPage({
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
  const {
    items: companies,
    total,
    limit,
    offset,
  } = await container.companies.listAll({
    ...parsePaginationParams(resolved),
    ...(search !== undefined ? { search } : {}),
    ...(sort !== undefined ? { sort } : {}),
  });

  return (
    <main>
      <h1>Companies</h1>
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
      {companies.length === 0 ? (
        <p>No companies match this filter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Legal name</th>
              <th>Status</th>
              <th>Memberships</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>{company.legalName}</td>
                <td>
                  <CompanyStatusForm
                    companyId={company.id}
                    currentStatus={company.status}
                    expectedVersion={company.version}
                  />
                </td>
                <td>
                  <Link href={`/admin/companies/${company.id}/memberships`}>Manage members</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <PaginationControls
        basePath="/admin/companies"
        total={total}
        limit={limit}
        offset={offset}
        extraParams={{
          ...(search !== undefined ? { search } : {}),
          ...(sort !== undefined ? { sort } : {}),
        }}
      />

      <h2>Create a company</h2>
      <CreateCompanyForm />
    </main>
  );
}
