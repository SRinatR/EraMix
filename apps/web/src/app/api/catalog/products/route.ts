import { getContainer } from '@/server/container';
import { productToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { enforceRateLimit } from '@/server/rate-limit';
import { listCatalogProducts } from '@eramix/application';
import { ValidationFailedError, isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { NextResponse } from 'next/server';

export const GET = withApiHandler('catalog.products.search', async (request) => {
  enforceRateLimit('search', request);

  const url = new URL(request.url);
  const locale = url.searchParams.get('locale');
  if (!locale || !isSupportedLocale(locale)) {
    throw new ValidationFailedError(
      'Query parameter "locale" must be one of the supported locales.',
      {
        locale,
      },
    );
  }
  const categoryId = url.searchParams.get('categoryId') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  const container = getContainer();
  const result = await listCatalogProducts(container.products, {
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(search !== undefined ? { search } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
    ...(offsetParam !== null ? { offset: Number(offsetParam) } : {}),
  });

  const items = result.items
    .map((product) => productToDto(locale as LocaleCode, product))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return NextResponse.json({
    items,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
});
