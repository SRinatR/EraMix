import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { Link } from '@/i18n/navigation';
import { isSupportedLocale } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My orders', robots: { index: false } };

export default async function AccountOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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
  const perCompany = await Promise.all(
    actor.companyIds.map((companyId) => container.orders.listByCompany(companyId)),
  );
  const orders = perCompany.flat();

  return (
    <main>
      <h1>My orders</h1>
      <p>
        <Link href="/account/orders/new">Create a new order</Link>
      </p>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order number</th>
              <th>Status</th>
              <th>Lines</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/account/orders/${order.orderNumber}`}>{order.orderNumber}</Link>
                </td>
                <td>{order.status}</td>
                <td>{order.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
