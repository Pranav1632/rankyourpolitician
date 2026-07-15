'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import Icon from './Icon';

const REPO_URL = 'https://github.com/ForPublicOrg/rankyourpolitician';
const ATHENA_URL = 'https://tryathena.dev';

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-12 border-t border-line/70">
      <div className="tricolor-line mx-auto max-w-content" aria-hidden="true" />
      <div className="mx-auto max-w-content px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-white">
                <Icon name="parliament" size={17} />
              </span>
              <span className="font-extrabold tracking-tight text-ink">{t('brand.name')}</span>
            </div>
            <p className="mt-3 text-sm text-ink-soft">{t('footer.nonpartisan')}</p>
            <p className="mt-2 text-xs text-ink-faint">{t('footer.disclaimer')}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2.5 text-sm" aria-label="Footer">
            <Link href="/hierarchy" className="text-ink-soft hover:text-brand">{t('nav.hierarchy')}</Link>
            <Link href="/accountability" className="text-ink-soft hover:text-brand">{t('nav.accountability')}</Link>
            <Link href="/methodology" className="text-ink-soft hover:text-brand">{t('nav.methodology')}</Link>
            <Link href="/about" className="text-ink-soft hover:text-brand">{t('nav.about')}</Link>
            <Link href="/privacy" className="text-ink-soft hover:text-brand">{t('footer.privacy')}</Link>
            <Link href="/terms" className="text-ink-soft hover:text-brand">{t('footer.terms')}</Link>
            <Link href="/grievance" className="text-ink-soft hover:text-brand">{t('footer.grievance')}</Link>
          </nav>
        </div>
        <p className="mt-8 flex flex-wrap items-center gap-x-2 border-t border-line/70 pt-4 text-xs text-ink-faint">
          <span>© {new Date().getFullYear()} {t('brand.name')}</span>
          <span aria-hidden="true">·</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-soft underline-offset-2 hover:text-brand hover:underline"
          >
            <Icon name="code" size={13} />
            {t('footer.openSource')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={ATHENA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-ink-faint underline-offset-2 hover:text-brand hover:underline"
          >
            <img src="/athena.svg" alt="" width={13} height={13} className="opacity-80" />
            {t('footer.builtWith', { name: 'Athena' })}
          </a>
        </p>
      </div>
    </footer>
  );
}
