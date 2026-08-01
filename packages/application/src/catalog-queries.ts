import type { ContentType } from '@eramix/domain';
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

export interface ProductSearchResult {
  readonly items: readonly ProductWithTranslations[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** Public catalog browse/search — only PUBLISHED products are ever exposed. */
export async function listCatalogProducts(
  productRepo: ProductRepository,
  input: { categoryId?: string; search?: string; limit?: number; offset?: number },
): Promise<ProductSearchResult> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = {
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.search !== undefined ? { search: input.search } : {}),
  };
  const [items, total] = await Promise.all([
    productRepo.listPublished({ ...query, limit, offset }),
    productRepo.countPublished(query),
  ]);
  return { items, total, limit, offset };
}

/** Public content listing (article index, FAQ list) — only PUBLISHED content. */
export async function listContentByType(
  contentRepo: ContentRepository,
  type: ContentType,
): Promise<readonly ContentWithTranslations[]> {
  return contentRepo.listPublished(type);
}
