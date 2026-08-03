import { getContainer } from '@/server/container';
import { categoryToDto } from '@/server/dto';
import { defineRouteHandlers, withApiHandler } from '@/server/handler';
import { listCatalogCategories } from '@eramix/application';
import { ValidationFailedError, isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { NextResponse } from 'next/server';

const getHandler = withApiHandler('catalog.categories.list', async (request) => {
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
  const parentId = url.searchParams.get('parentId') ?? undefined;

  const container = getContainer();
  const categories = await listCatalogCategories(container.categories, parentId);
  const items = categories
    .map((category) => categoryToDto(locale as LocaleCode, category))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return NextResponse.json({ items });
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = defineRouteHandlers({
  GET: getHandler,
});
