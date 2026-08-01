import type {
  CategoryWithTranslations,
  ContentWithTranslations,
  OrderWithLines,
  ProductWithTranslations,
} from '@eramix/application';
import type { LocaleCode } from '@eramix/domain';

/**
 * Maps a repository-shaped aggregate (all translations/routes) to the
 * public API DTO for one requested locale. Returns undefined when there is
 * no *canonical* route/translation for that locale — the caller omits the
 * item rather than falling back to a different locale's content
 * (CLAUDE.md: "Missing translations must be explicit ... never a fallback
 * page rendered under the wrong locale URL").
 */
export function categoryToDto(
  locale: LocaleCode,
  category: CategoryWithTranslations,
): { id: string; parentId?: string; slug: string; name: string; status: 'PUBLISHED' } | undefined {
  const translation = category.translations.find((t) => t.locale === locale);
  const canonicalRoute = translation?.routes.find((r) => r.isCanonical);
  if (!translation || !canonicalRoute) {
    return undefined;
  }
  return {
    id: category.id,
    ...(category.parentId !== undefined ? { parentId: category.parentId } : {}),
    slug: canonicalRoute.slug,
    name: translation.name,
    status: 'PUBLISHED',
  };
}

export function productToDto(
  locale: LocaleCode,
  product: ProductWithTranslations,
):
  | {
      publicId: string;
      sku: string;
      slug: string;
      name: string;
      description?: string;
      status: 'PUBLISHED';
      indicativePrice?: {
        priceFromMinor: number;
        currency: string;
        priceMode: string;
        priceDisclaimer?: string;
      };
    }
  | undefined {
  const translation = product.translations.find((t) => t.locale === locale);
  if (!translation) {
    return undefined;
  }
  return {
    publicId: product.publicId,
    sku: product.sku,
    slug: translation.slug,
    name: translation.name,
    ...(translation.description !== undefined ? { description: translation.description } : {}),
    status: 'PUBLISHED',
    ...(translation.indicativePrice !== undefined
      ? { indicativePrice: translation.indicativePrice }
      : {}),
  };
}

export function contentToDto(
  locale: LocaleCode,
  content: ContentWithTranslations,
): { id: string; slug: string; title: string; summary?: string; status: 'PUBLISHED' } | undefined {
  const translation = content.translations.find((t) => t.locale === locale);
  const canonicalRoute = translation?.routes.find((r) => r.isCanonical);
  if (!translation || !canonicalRoute) {
    return undefined;
  }
  return {
    id: content.id,
    slug: canonicalRoute.slug,
    title: translation.title,
    ...(translation.summary !== undefined ? { summary: translation.summary } : {}),
    status: 'PUBLISHED',
  };
}

export function orderToDto(order: OrderWithLines): {
  id: string;
  orderNumber: string;
  companyId: string;
  status: OrderWithLines['status'];
  version: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  lines: OrderWithLines['lines'];
} {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    companyId: order.companyId,
    status: order.status,
    version: order.version,
    ...(order.contactName !== undefined ? { contactName: order.contactName } : {}),
    ...(order.contactPhone !== undefined ? { contactPhone: order.contactPhone } : {}),
    ...(order.contactEmail !== undefined ? { contactEmail: order.contactEmail } : {}),
    lines: order.lines,
  };
}
