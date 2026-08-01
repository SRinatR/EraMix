import { getContainer } from '@/server/container';
import { getServerActor } from '@/server/session';
import { CreateOrderForm } from './create-order-form';
import { listCatalogProducts } from '@eramix/application';
import { isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New order', robots: { index: false } };

export default async function NewOrderPage({ params }: { params: Promise<{ locale: string }> }) {
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
  const companies = (
    await Promise.all(actor.companyIds.map((id) => container.companies.findById(id)))
  ).filter((company): company is NonNullable<typeof company> => company !== undefined);

  const productResult = await listCatalogProducts(container.products, { limit: 100 });
  const products = productResult.items
    .map((product) => {
      const translation = product.translations.find((t) => t.locale === (locale as LocaleCode));
      return translation ? { id: product.id, name: translation.name, sku: product.sku } : undefined;
    })
    .filter((product): product is NonNullable<typeof product> => product !== undefined);

  return (
    <main>
      <h1>Create a new order</h1>
      <CreateOrderForm
        companies={companies.map((company) => ({ id: company.id, legalName: company.legalName }))}
        products={products}
      />
    </main>
  );
}
