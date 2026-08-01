import { getContainer } from '@/server/container';
import { contentToDto } from '@/server/dto';
import { withApiHandler } from '@/server/handler';
import { listContentByType } from '@eramix/application';
import { ValidationFailedError, isSupportedLocale, type LocaleCode } from '@eramix/domain';
import { NextResponse } from 'next/server';

const TYPE_BY_SEGMENT = {
  articles: 'ARTICLE',
  pages: 'PAGE',
  faq: 'FAQ_ITEM',
} as const;

export const GET = withApiHandler<{ type: string }>(
  'content.list',
  async (request, _traceId, { params }) => {
    const { type } = await params;
    const contentType = TYPE_BY_SEGMENT[type as keyof typeof TYPE_BY_SEGMENT];
    if (!contentType) {
      throw new ValidationFailedError(
        'Path parameter "type" must be one of articles, pages, faq.',
        {
          type,
        },
      );
    }

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
    const items = (await listContentByType(container.content, contentType))
      .map((content) => contentToDto(locale as LocaleCode, content))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);

    return NextResponse.json({ items });
  },
);
