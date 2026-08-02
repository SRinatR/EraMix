import { Link } from '@/i18n/navigation';
import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';
import { CompanyStatusForm } from './company-status-form';
import { CreateCompanyForm } from './create-company-form';

export default async function AdminCompaniesPage() {
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
  const companies = await container.companies.listAll();

  return (
    <main>
      <h1>Companies</h1>
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

      <h2>Create a company</h2>
      <CreateCompanyForm />
    </main>
  );
}
