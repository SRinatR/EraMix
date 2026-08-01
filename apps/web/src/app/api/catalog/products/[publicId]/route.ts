import { getContainer } from '@/server/container';
import { productToDto } from '@/server/dto';
import { problemResponse } from '@/server/problem-response';
import {
  ResourceNotFoundError,
  ValidationFailedError,
  isSupportedLocale,
  type LocaleCode,
} from '@eramix/domain';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
): Promise<NextResponse> {
  try {
    const { publicId } = await params;
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

    const container = getContainer();
    const product = await container.products.findByPublicId(publicId);
    if (!product || product.status !== 'PUBLISHED') {
      throw new ResourceNotFoundError(`Product "${publicId}" not found.`, { publicId });
    }
    const dto = productToDto(locale as LocaleCode, product);
    if (!dto) {
      throw new ResourceNotFoundError(
        `Product "${publicId}" has no translation for locale "${locale}".`,
        {
          publicId,
          locale,
        },
      );
    }
    return NextResponse.json(dto);
  } catch (error) {
    return problemResponse(error);
  }
}
