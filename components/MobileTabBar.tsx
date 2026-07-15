'use client';
// iOS-style bottom tab bar - the primary navigation on phones, where most of
// India browses. Hidden on ≥md screens (the header nav takes over there).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { clsx } from 'clsx';
import Icon, { type IconName } from './Icon';

const TABS: { href: string; key: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', key: 'tabs.home', icon: 'home', match: (p) => p === '/' },
  { href: '/india', key: 'tabs.government', icon: 'parliament', match: (p) => p.startsWith('/india') },
  { href: '/hierarchy', key: 'tabs.hierarchy', icon: 'network', match: (p) => p.startsWith('/hierarchy') },
  { href: '/who', key: 'tabs.help', icon: 'megaphone', match: (p) => p.startsWith('/who') },
  { href: '/search', key: 'tabs.search', icon: 'search', match: (p) => p.startsWith('/search') },
];

export default function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav
      aria-label="Bottom navigation"
      className="glass-strong fixed inset-x-0 bottom-0 z-30 border-t border-line/60 shadow-tab-bar md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'pressable flex flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 text-[10px] font-semibold',
                  active ? 'text-brand' : 'text-ink-faint',
                )}
              >
                <span
                  className={clsx(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors duration-300',
                    active && 'bg-brand-soft',
                  )}
                >
                  <Icon name={tab.icon} size={20} />
                </span>
                <span className="max-w-full truncate">{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
