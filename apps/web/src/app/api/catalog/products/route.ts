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
  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');

  const container = getContainer();
  const result = await listCatalogProducts(container.products, {
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(search !== undefined ? { search } : {}),
    ...(cursorParam !== null ? { cursor: cursorParam } : {}),
    ...(limitParam !== null ? { limit: Number(limitParam) } : {}),
  });

  const data = result.data
    .map((product) => productToDto(locale as LocaleCode, product))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return NextResponse.json({ data, page: result.page });
});
