import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { Link } from '@/i18n/navigation';
import { isSupportedLocale } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

// Session-dependent; must not be statically prerendered at build time.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My account', robots: { index: false } };

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const actor = await getServerActor();
  if (!actor) {
    redirect('/api/auth/login');
  }

  const container = getContainer();
  const user = await container.users.findById(actor.userId);
  const companies = (
    await Promise.all(actor.companyIds.map((id) => container.companies.findById(id)))
  ).filter((company): company is NonNullable<typeof company> => company !== undefined);

  return (
    <main>
      <h1>My account</h1>
      {user && (
        <div className="card section">
          <dl>
            <dt>Name</dt>
            <dd>{user.displayName}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Role</dt>
            <dd>
              <span className="badge" data-tone="info">
                {user.platformRole}
              </span>
            </dd>
          </dl>
        </div>
      )}

      <section className="section">
        <h2>Company</h2>
        {companies.length === 0 ? (
          <p className="empty-state">
            You are not yet a member of a company. Contact your administrator to be added to one
            before you can place an order.
          </p>
        ) : (
          <ul>
            {companies.map((company) => (
              <li key={company.id}>{company.legalName}</li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link href="/account/orders" className="btn">
          My orders
        </Link>
      </p>
    </main>
  );
}
