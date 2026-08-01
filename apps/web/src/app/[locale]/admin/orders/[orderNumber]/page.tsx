import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { TransitionOrderForm } from './transition-order-form';
import { ALLOWED_ORDER_TRANSITIONS, requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'order.read.all');
  } catch {
    notFound();
  }

  const container = getContainer();
  const order = await container.orders.findByOrderNumber(orderNumber);
  if (!order) {
    notFound();
  }

  return (
    <main>
      <h1>Order {order.orderNumber}</h1>
      <p>Status: {order.status}</p>
      <p>Company: {order.companyId}</p>

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

      <h2>Transition</h2>
      <TransitionOrderForm
        orderId={order.id}
        expectedVersion={order.version}
        allowedStatuses={ALLOWED_ORDER_TRANSITIONS[order.status]}
      />
    </main>
  );
}
