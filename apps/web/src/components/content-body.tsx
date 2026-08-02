/**
 * Renders a ContentTranslation's `content` field (Prisma `Json`, typed
 * `unknown` at the domain layer). MVP body format is deliberately simple — a
 * single paragraph string or an array of paragraph strings — so it renders
 * with React's default text escaping and needs no HTML sanitizer; anything
 * else (legacy/malformed data) renders nothing rather than guessing.
 */
export function ContentBody({ content }: { readonly content: unknown }) {
  const paragraphs = toParagraphs(content);
  if (paragraphs.length === 0) {
    return null;
  }
  return (
    <div>
      {paragraphs.map((paragraph, index) => (
        // eslint-disable-next-line react/no-array-index-key -- static content list, never reordered client-side
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

export function toParagraphs(content: unknown): readonly string[] {
  if (typeof content === 'string') {
    return content.length > 0 ? [content] : [];
  }
  if (Array.isArray(content)) {
    return content.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  return [];
}
