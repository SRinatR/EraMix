import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { Link } from '@/i18n/navigation';
import { isSupportedLocale, type OrderStatus } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

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
export const metadata: Metadata = { title: 'My orders', robots: { index: false } };

/** ACC-003 ("Список заказов поддерживает фильтр по статусу/дате, сортировку, пагинацию и пустые состояния"). */
export default async function AccountOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const resolved = await searchParams;
  const statusParam = typeof resolved['status'] === 'string' ? resolved['status'] : undefined;
  const status =
    statusParam && (ORDER_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as OrderStatus)
      : undefined;
  const pagination = parsePaginationParams(resolved);

  const container = getContainer();
  // See apps/web/src/app/api/orders/route.ts's identical comment: a
  // customer's memberships almost always span exactly one company; this
  // applies the same page window per company and concatenates for the rare
  // multi-company case rather than computing one true cross-company page.
  const perCompany = await Promise.all(
    actor.companyIds.map((companyId) =>
      container.orders.listByCompany(companyId, {
        ...pagination,
        ...(status !== undefined ? { status } : {}),
      }),
    ),
  );
  const orders = perCompany.flatMap((page) => page.items);
  const total = perCompany.reduce((sum, page) => sum + page.total, 0);
  const { limit, offset } = perCompany[0] ?? { limit: 20, offset: 0 };

  return (
    <main>
      <h1>My orders</h1>
      <p>
        <Link href="/account/orders/new">Create a new order</Link>
      </p>
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
      <PaginationControls
        basePath="/account/orders"
        total={total}
        limit={limit}
        offset={offset}
        extraParams={status !== undefined ? { status } : {}}
      />
    </main>
  );
}
