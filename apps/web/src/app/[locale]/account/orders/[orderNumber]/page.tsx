import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { AddOrderCommentForm } from '@/components/add-order-comment-form';
import { AddLineForm } from './add-line-form';
import { CancelOrderButton } from './cancel-order-button';
import { RemoveLineButton } from './remove-line-button';
import { SubmitOrderButton } from './submit-order-button';
import {
  assertOrderCompanyAccess,
  CUSTOMER_CANCELLABLE_STATES,
  listCatalogProducts,
  listOrderCommentsForActor,
} from '@eramix/application';
import { AccessDeniedError, isSupportedLocale, type LocaleCode } from '@eramix/domain';
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
  const canEditDraft = actor.companyIds.includes(order.companyId) && order.status === 'DRAFT';

  const addLineProducts = canEditDraft
    ? (await listCatalogProducts(container.products, { limit: 100 })).items
        .map((product) => {
          const translation = product.translations.find((t) => t.locale === (locale as LocaleCode));
          return translation
            ? {
                id: product.id,
                name: translation.name,
                sku: product.sku,
                indicativePrice: translation.indicativePrice,
              }
            : undefined;
        })
        .filter((product): product is NonNullable<typeof product> => product !== undefined)
    : [];

  const comments = await listOrderCommentsForActor(
    { orderRepo: container.orders, commentRepo: container.orderComments },
    { orderId: order.id, actorRole: actor.platformRole, actorCompanyIds: actor.companyIds },
  );

  return (
    <main>
      <h1>Order {order.orderNumber}</h1>
      <p>Status: {order.status}</p>
      <p>
        Prices shown, where available, are non-binding indicative &quot;from&quot; prices — never a
        payable total. The final quote is confirmed manually by a manager after submission.
      </p>

      <h2>Lines</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Quantity</th>
            <th>Note</th>
            {canEditDraft && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.id}>
              <td>{line.productNameSnapshot}</td>
              <td>{line.productSkuSnapshot}</td>
              <td>{line.quantity}</td>
              <td>{line.note ?? ''}</td>
              {canEditDraft && (
                <td>
                  <RemoveLineButton
                    orderId={order.id}
                    lineId={line.id}
                    expectedVersion={order.version}
                    productName={line.productNameSnapshot}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canEditDraft && (
        <>
          <h2>Add a line</h2>
          <AddLineForm
            orderId={order.id}
            expectedVersion={order.version}
            products={addLineProducts}
          />
        </>
      )}

      <h2>Status history</h2>
      <ul>
        {order.statusHistory.map((entry) => (
          <li key={entry.id}>
            {entry.fromStatus ?? '—'} → {entry.toStatus}
            {entry.reason ? ` (${entry.reason})` : ''}
          </li>
        ))}
      </ul>

      {canEditDraft && order.lines.length > 0 && (
        <SubmitOrderButton orderId={order.id} expectedVersion={order.version} />
      )}
      {canCustomerCancel && (
        <CancelOrderButton orderId={order.id} expectedVersion={order.version} />
      )}

      <h2>Comments</h2>
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            {comment.createdAt.toISOString()}: {comment.body}
          </li>
        ))}
      </ul>
      <AddOrderCommentForm orderId={order.id} canPostInternal={false} />
    </main>
  );
}
