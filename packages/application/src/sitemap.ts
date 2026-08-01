import { articleUrl, categoryUrl, pageUrl, productUrl, type LocaleCode } from '@eramix/domain';
import type { CategoryRepository, ContentRepository, ProductRepository } from './repositories.js';

export interface SitemapEntry {
  readonly url: string;
  readonly lastModified: Date;
}

/**
 * CLAUDE.md: "Sitemap contains canonical published routes only." Only a
 * translation's *canonical* route (`isCanonical === true`) is emitted, and
 * only for PUBLISHED parents — a historical/redirected route or a
 * draft/archived translation never appears here. Product sitemap entries use
 * the parent Product's own timestamp (no per-translation route table backs
 * it — ADR-0010, resolution is always by publicId).
 */
export async function buildSitemapEntries(repositories: {
  content: ContentRepository;
  category: CategoryRepository;
  product: ProductRepository;
}): Promise<readonly SitemapEntry[]> {
  const entries: SitemapEntry[] = [];

  const [articles, pages, categories] = await Promise.all([
    repositories.content.listPublished('ARTICLE'),
    repositories.content.listPublished('PAGE'),
    repositories.category.listPublished(),
  ]);

  for (const content of [...articles, ...pages]) {
    for (const translation of content.translations) {
      const canonicalRoute = translation.routes.find((route) => route.isCanonical);
      if (!canonicalRoute) {
        continue;
      }
      const url =
        content.type === 'ARTICLE'
          ? articleUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug })
          : pageUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug });
      entries.push({ url, lastModified: content.updatedAt });
    }
  }

  for (const category of categories) {
    for (const translation of category.translations) {
      const canonicalRoute = translation.routes.find((route) => route.isCanonical);
      if (!canonicalRoute) {
        continue;
      }
      entries.push({
        url: categoryUrl({ locale: canonicalRoute.locale, slug: canonicalRoute.slug }),
        lastModified: category.updatedAt,
      });
    }
  }

  let offset = 0;
  const pageSize = 500;
  for (;;) {
    const products = await repositories.product.listPublished({ limit: pageSize, offset });
    for (const product of products) {
      for (const translation of product.translations) {
        entries.push({
          url: productUrl({
            locale: translation.locale as LocaleCode,
            publicId: product.publicId,
            slug: translation.slug,
          }),
          lastModified: product.updatedAt,
        });
      }
    }
    if (products.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return entries;
}
