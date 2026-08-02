import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { getOfferEligibility, hasPermission, listOffers } from '@eramix/application';
import type { Offer } from '@eramix/domain';
import { notFound } from 'next/navigation';
import { CreateOfferForm } from './create-offer-form';
import { DirectSaleToggleForm } from './direct-sale-toggle-form';
import { FeedPreviewPanel } from './feed-preview-panel';
import { OfferEditForm } from './offer-edit-form';

export const dynamic = 'force-dynamic';

function formatPrice(offer: Offer): string {
  return `${(offer.priceAmountMinor / 100).toFixed(2)} ${offer.currency}`;
}

/**
 * ADR-0019's admin operational view: per-offer eligibility reasons, the
 * per-product direct-sale opt-in, and create/edit forms. Every offer here is
 * structurally inert — PlatformSettings.merchantCenterEnabled stays
 * hard-false, so MERCHANT_CENTER_DISABLED is always present in the
 * eligibility reasons until a future, separately authorized change.
 */
export default async function AdminOffersPage() {
  const actor = await getServerActor();
  if (!actor || !hasPermission(actor.platformRole, 'settings.manage')) {
    notFound();
  }

  const container = getContainer();
  const { data: offers } = await listOffers({ offerRepo: container.offers }, actor.platformRole, {
    limit: 50,
  });

  const rows = await Promise.all(
    offers.map(async (offer) => {
      const [product, eligibility] = await Promise.all([
        container.products.findById(offer.productId),
        getOfferEligibility(
          {
            offerRepo: container.offers,
            productRepo: container.products,
            settingsRepo: container.settingsRepo,
          },
          offer.id,
          actor.platformRole,
        ),
      ]);
      return { offer, product, eligibility };
    }),
  );

  return (
    <main>
      <h1>Merchant offers (dormant)</h1>
      <p>
        Preparation for a future direct-sale checkout (ADR-0019). Nothing here is public or
        syndicated: Merchant Center notification stays disabled, so every offer below is permanently
        ineligible until that is separately, explicitly enabled by the Product Owner.
      </p>
      <table>
        <thead>
          <tr>
            <th>Offer</th>
            <th>Product</th>
            <th>State</th>
            <th>Price</th>
            <th>Direct-sale enabled</th>
            <th>Eligibility</th>
            <th>Edit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ offer, product, eligibility }) => (
            <tr key={offer.id}>
              <td>{offer.sku}</td>
              <td>
                {product?.sku ?? offer.productId}
                {product && (
                  <DirectSaleToggleForm
                    productId={product.id}
                    initialEnabled={product.directSaleEnabled}
                    version={product.version}
                  />
                )}
              </td>
              <td>{offer.state}</td>
              <td>{formatPrice(offer)}</td>
              <td>{product?.directSaleEnabled ? 'Yes' : 'No'}</td>
              <td>
                {eligibility.eligible ? (
                  'Eligible'
                ) : (
                  <ul>
                    {eligibility.ineligibilityReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td>
                <OfferEditForm
                  initial={{
                    id: offer.id,
                    state: offer.state,
                    sellerName: offer.sellerName,
                    priceAmountMinor: offer.priceAmountMinor,
                    currency: offer.currency,
                    availability: offer.availability,
                    checkoutUrl: offer.checkoutUrl ?? null,
                    deliveryPolicyRef: offer.deliveryPolicyRef ?? null,
                    returnPolicyRef: offer.returnPolicyRef ?? null,
                    version: offer.version,
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Create offer</h2>
      <CreateOfferForm />
      <FeedPreviewPanel />
    </main>
  );
}
