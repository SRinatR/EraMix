import { NextResponse } from 'next/server';
import type { LocaleCode } from '@eramix/domain';

/**
 * Minimal, honest, locale-appropriate copy for a durable HTTP 410 response
 * (ADR-0018) — deliberately thin (not a reproduction of the retired
 * resource's original content): CLAUDE.md forbids cloaking/deceptive
 * content, and a 410 page's entire purpose is to state, plainly, that the
 * resource is permanently gone.
 */
const GONE_COPY: Record<
  LocaleCode,
  { title: string; heading: string; body: string; link: string }
> = {
  en: {
    title: 'Permanently removed',
    heading: 'This page has been permanently removed',
    body: 'The content that used to be here is no longer available and will not return.',
    link: 'Go to the homepage',
  },
  ru: {
    title: 'Страница удалена навсегда',
    heading: 'Эта страница была окончательно удалена',
    body: 'Материал, который здесь находился, больше не доступен и не будет восстановлен.',
    link: 'На главную страницу',
  },
  uz: {
    title: "Sahifa butunlay o'chirildi",
    heading: "Bu sahifa butunlay o'chirildi",
    body: "Bu yerda bo'lgan material endi mavjud emas va qaytarilmaydi.",
    link: 'Bosh sahifaga',
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Builds the real `410 Gone` response src/proxy.ts returns for a durably retired route (ADR-0018). */
export function buildGoneResponse(
  locale: LocaleCode,
  retirementReason: string | undefined,
): NextResponse {
  const copy = GONE_COPY[locale];
  const reasonParagraph =
    retirementReason !== undefined
      ? `\n    <p><small>${escapeHtml(retirementReason)}</small></p>`
      : '';
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(copy.title)}</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1>${escapeHtml(copy.heading)}</h1>
<p>${escapeHtml(copy.body)}</p>${reasonParagraph}
<p><a href="/${locale}">${escapeHtml(copy.link)}</a></p>
</main>
</body>
</html>
`;
  return new NextResponse(html, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
