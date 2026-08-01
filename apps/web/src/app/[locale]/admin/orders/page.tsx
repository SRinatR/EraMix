import { getContainer } from '@/server/container';
import { Link } from '@/i18n/navigation';
import { getServerActor } from '@/server/session';
import { requirePermission } from '@eramix/application';
import { notFound } from 'next/navigation';

export default async function AdminOrdersPage() {
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
  const orders = await container.orders.listAll();

  return (
    <main>
      <h1>Order queue</h1>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Order number</th>
              <th>Status</th>
              <th>Company</th>
              <th>Lines</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link>
                </td>
                <td>{order.status}</td>
                <td>{order.companyId}</td>
                <td>{order.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
