import { describe, expect, it } from 'vitest';
import {
  buildArticleJsonLd,
  buildCollectionPageJsonLd,
  buildFaqPageJsonLd,
  buildProductJsonLd,
  buildWebPageJsonLd,
} from './json-ld.js';

describe('buildProductJsonLd', () => {
  it('emits factual Product identity fields only, never an offers/price block (ADR-0005)', () => {
    const jsonLd = buildProductJsonLd(
      { sku: 'SKU-1' },
      { name: 'Blue Widget', description: 'A reliable widget.' },
    );

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Blue Widget',
      sku: 'SKU-1',
      description: 'A reliable widget.',
    });
    expect(jsonLd).not.toHaveProperty('offers');
  });

  it('omits description when the translation has none, never fabricating one', () => {
    const jsonLd = buildProductJsonLd({ sku: 'SKU-1' }, { name: 'Blue Widget' });
    expect(jsonLd).not.toHaveProperty('description');
  });
});

describe('buildCollectionPageJsonLd', () => {
  it('emits the category name only', () => {
    expect(buildCollectionPageJsonLd({ name: 'Widgets' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Widgets',
    });
  });
});

describe('buildArticleJsonLd', () => {
  it('includes datePublished only when the content has a real publishedAt, and always dateModified', () => {
    const jsonLd = buildArticleJsonLd(
      { publishedAt: new Date('2026-01-15T00:00:00.000Z') },
      {
        title: 'Launch day',
        summary: 'What shipped this week.',
        locale: 'en',
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    );

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Launch day',
      description: 'What shipped this week.',
      inLanguage: 'en',
      datePublished: '2026-01-15T00:00:00.000Z',
      dateModified: '2026-02-01T00:00:00.000Z',
    });
  });

  it('never fabricates datePublished when the content has none', () => {
    const jsonLd = buildArticleJsonLd(
      { publishedAt: undefined },
      { title: 'Draft preview', locale: 'en', updatedAt: new Date('2026-02-01T00:00:00.000Z') },
    );

    expect(jsonLd).not.toHaveProperty('datePublished');
    expect(jsonLd).not.toHaveProperty('description');
  });
});

describe('buildWebPageJsonLd', () => {
  it('emits name/description/inLanguage from the translation', () => {
    expect(
      buildWebPageJsonLd({ title: 'About us', summary: 'Company overview.', locale: 'ru' }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'About us',
      description: 'Company overview.',
      inLanguage: 'ru',
    });
  });

  it('omits description when absent', () => {
    expect(buildWebPageJsonLd({ title: 'About us', locale: 'ru' })).not.toHaveProperty(
      'description',
    );
  });
});

describe('buildFaqPageJsonLd', () => {
  it('returns undefined for zero items — never a promise of content that is not actually shown (CLAUDE.md)', () => {
    expect(buildFaqPageJsonLd([])).toBeUndefined();
  });

  it('maps each item to a schema.org Question/Answer pair', () => {
    const jsonLd = buildFaqPageJsonLd([
      { title: 'Do you ship internationally?', answerText: 'Yes, to most regions.' },
      { title: 'What is the minimum order?', answerText: 'There is no minimum.' },
    ]);

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Do you ship internationally?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, to most regions.' },
        },
        {
          '@type': 'Question',
          name: 'What is the minimum order?',
          acceptedAnswer: { '@type': 'Answer', text: 'There is no minimum.' },
        },
      ],
    });
  });
});
