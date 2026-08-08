import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';

/**
 * Deliberately session-independent (no getServerActor()/cookie read) so the
 * home page and every other public page can stay statically prerenderable
 * (`next build`'s `● /[locale]` SSG output) — the /account link relies on
 * the existing account page's own redirect-to-login for an unauthenticated
 * visitor rather than branching the header itself.
 *
 * TZ WEB-003's "О компании/Сертификаты/Инструкции/Контакты" pages are
 * admin-authored PAGE content with editor-chosen slugs (see the Phase 3/6
 * roadmap status blocks) — none exist yet, so this header cannot link them
 * without inventing a slug. Add entries here once real pages are authored;
 * that is a content/IA decision, not something to hardcode speculatively.
 */
export function SiteHeader() {
  const t = useTranslations('Nav');

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <Link href="/" className="site-header__brand">
          <span className="site-header__brand-mark" aria-hidden="true">
            E
          </span>
          EraMix
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <ul>
            <li>
              <Link href="/">{t('home')}</Link>
            </li>
            <li>
              <Link href="/catalog">{t('catalog')}</Link>
            </li>
            <li>
              <Link href="/articles">{t('articles')}</Link>
            </li>
            <li>
              <Link href="/faq">{t('faq')}</Link>
            </li>
            <li>
              <Link href="/account">{t('account')}</Link>
            </li>
          </ul>
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
