import type { ContentType } from '@eramix/domain';
import type { CursorPage, CursorPaginationInput } from './pagination.js';
import type {
  CategoryRepository,
  CategoryWithTranslations,
  ContentRepository,
  ContentWithTranslations,
  ProductRepository,
  ProductWithTranslations,
} from './repositories.js';

/** Public catalog browse (Phase 3) — only PUBLISHED categories, TZ §3.1 "Публичный каталог: R" for all roles including anonymous visitors. */
export async function listCatalogCategories(
  categoryRepo: CategoryRepository,
  parentId?: string,
): Promise<readonly CategoryWithTranslations[]> {
  return parentId === undefined
    ? categoryRepo.listPublished()
    : categoryRepo.listByParent(parentId);
}

/** Public catalog browse/search — only PUBLISHED products are ever exposed. Cursor-paginated (ADR-0017/API-005). */
export async function listCatalogProducts(
  productRepo: ProductRepository,
  input: { categoryId?: string; search?: string } & CursorPaginationInput,
): Promise<CursorPage<ProductWithTranslations>> {
  return productRepo.listPublished(input);
}

/** Public content listing (article index, FAQ list) — only PUBLISHED content. */
export async function listContentByType(
  contentRepo: ContentRepository,
  type: ContentType,
): Promise<readonly ContentWithTranslations[]> {
  return contentRepo.listPublished(type);
}
