import { PaginationControls } from '@/components/pagination-controls';
import { getContainer } from '@/server/container';
import { parsePaginationParams } from '@/server/pagination';
import { getServerActor } from '@/server/session';
import { Link } from '@/i18n/navigation';
import { listOrdersForActor } from '@eramix/application';
import { AccessDeniedError, isSupportedLocale, type OrderStatus } from '@eramix/domain';
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
  const companyIdParam =
    typeof resolved['companyId'] === 'string' ? resolved['companyId'] : undefined;
  const pagination = parsePaginationParams(resolved);

  const container = getContainer();
  // Same authorization model as GET /api/orders (packages/application/src/
  // order-queries.ts's listOrdersForActor) — an unauthorized companyId
  // filter is treated identically to any other unauthorized resource
  // (404), not a distinguishable error, and never a silent fallback.
  let orderPage;
  try {
    orderPage = await listOrdersForActor(container.orders, {
      ...pagination,
      ...(status !== undefined ? { status } : {}),
      actorRole: actor.platformRole,
      actorCompanyIds: actor.companyIds,
      ...(companyIdParam !== undefined ? { companyId: companyIdParam } : {}),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      notFound();
    }
    throw error;
  }
  const { items: orders, total, limit, offset } = orderPage;
  const companies = await Promise.all(
    actor.companyIds.map((id) => container.companies.findById(id)),
  );
  const companyNameById = new Map(
    companies
      .filter((company): company is NonNullable<typeof company> => company !== undefined)
      .map((company) => [company.id, company.legalName] as const),
  );

  return (
    <main>
      <h1>My orders</h1>
      <p>
        <Link href="/account/orders/new">Create a new order</Link>
      </p>
      <form method="get">
        {actor.companyIds.length > 1 && (
          <label>
            Company
            <select name="companyId" defaultValue={companyIdParam ?? ''}>
              <option value="">All my companies</option>
              {actor.companyIds.map((id) => (
                <option key={id} value={id}>
                  {companyNameById.get(id) ?? id}
                </option>
              ))}
            </select>
          </label>
        )}
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
              {actor.companyIds.length > 1 && <th>Company</th>}
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
                {actor.companyIds.length > 1 && (
                  <td>{companyNameById.get(order.companyId) ?? order.companyId}</td>
                )}
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
        extraParams={{
          ...(status !== undefined ? { status } : {}),
          ...(companyIdParam !== undefined ? { companyId: companyIdParam } : {}),
        }}
      />
    </main>
  );
}
