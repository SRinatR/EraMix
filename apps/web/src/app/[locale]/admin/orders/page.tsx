import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { Link } from '@/i18n/navigation';
import { parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { requirePermission, type OrderListFilter } from '@eramix/application';
import type { OrderStatus } from '@eramix/domain';
import { notFound } from 'next/navigation';

const ORDER_STATUSES: readonly OrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'WAITING_CONFIRMATION',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY_FOR_PICKUP',
  'READY_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
];

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getServerActor();
  if (!actor) {
    notFound();
  }
  try {
    requirePermission(actor.platformRole, 'order.read.all');
  } catch {
    notFound();
  }

  const resolved = await searchParams;
  const statusParam = typeof resolved['status'] === 'string' ? resolved['status'] : undefined;
  const status =
    statusParam && (ORDER_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as OrderStatus)
      : undefined;
  const filter: OrderListFilter = status !== undefined ? { status } : {};

  const container = getContainer();
  const {
    items: orders,
    total,
    limit,
    offset,
  } = await container.orders.listAll({ ...parsePaginationParams(resolved), ...filter });
  const companies = await Promise.all(
    [...new Set(orders.map((order) => order.companyId))].map((id) =>
      container.companies.findById(id),
    ),
  );
  const companyNameById = new Map(
    companies
      .filter((company): company is NonNullable<typeof company> => company !== undefined)
      .map((company) => [company.id, company.legalName] as const),
  );

  return (
    <main>
      <h1>Order queue</h1>
      <form method="get">
        <label>
          Status
          <select name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {ORDER_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {orders.length === 0 ? (
        <p>No orders match this filter.</p>
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
                <td>{companyNameById.get(order.companyId) ?? order.companyId}</td>
                <td>{order.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <PaginationControls
        basePath="/admin/orders"
        total={total}
        limit={limit}
        offset={offset}
        extraParams={status !== undefined ? { status } : {}}
      />
    </main>
  );
}
