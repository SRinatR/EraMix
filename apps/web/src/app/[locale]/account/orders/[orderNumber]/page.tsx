import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { CancelOrderButton } from './cancel-order-button';
import { assertOrderCompanyAccess, CUSTOMER_CANCELLABLE_STATES } from '@eramix/application';
import { AccessDeniedError, isSupportedLocale } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order', robots: { index: false } };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}) {
  const { locale, orderNumber } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const actor = await getServerActor();
  if (!actor) {
    redirect('/api/auth/login');
  }

  const container = getContainer();
  const order = await container.orders.findByOrderNumber(orderNumber);
  if (!order) {
    notFound();
  }
  try {
    assertOrderCompanyAccess(actor.platformRole, actor.companyIds, order.companyId);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      notFound();
    }
    throw error;
  }

  const canCustomerCancel =
    actor.companyIds.includes(order.companyId) &&
    CUSTOMER_CANCELLABLE_STATES.includes(order.status);

  return (
    <main>
      <h1>Order {order.orderNumber}</h1>
      <p>Status: {order.status}</p>

      <h2>Lines</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Quantity</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.productNameSnapshot}</td>
              <td>{line.productSkuSnapshot}</td>
              <td>{line.quantity}</td>
              <td>{line.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Status history</h2>
      <ul>
        {order.statusHistory.map((entry) => (
          <li key={entry.id}>
            {entry.fromStatus ?? '—'} → {entry.toStatus}
            {entry.reason ? ` (${entry.reason})` : ''}
          </li>
        ))}
      </ul>

      {canCustomerCancel && (
        <CancelOrderButton orderId={order.id} expectedVersion={order.version} />
      )}
    </main>
  );
}
