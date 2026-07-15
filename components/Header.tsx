'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { clsx } from 'clsx';
import SearchBox from './SearchBox';
import LanguageSwitcher from './LanguageSwitcher';
import Icon, { type IconName } from './Icon';

const NAV: { href: string; key: string; icon: IconName; show: string }[] = [
  { href: '/india', key: 'nav.central', icon: 'parliament', show: 'hidden md:flex' },
  { href: '/hierarchy', key: 'nav.hierarchy', icon: 'network', show: 'hidden lg:flex' },
  { href: '/who', key: 'nav.accountability', icon: 'megaphone', show: 'hidden xl:flex' },
  { href: '/about', key: 'nav.about', icon: 'info', show: 'hidden sm:flex' },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme');
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(dark ? 'dark' : 'light');
    // Re-apply the class, don't just read it: Next's 404/error shell bypasses
    // the root layout's boot script, so on those pages this mount effect is
    // the only thing that ever sets .dark. Also keeps state and class from
    // drifting apart, since both derive from the same computation here.
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  return (
    <button
      onClick={toggleTheme}
      className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-paper-sink"
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
    </button>
  );
}

export default function Header() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={clsx(
        'glass-strong sticky top-0 z-30 border-x-0 border-t-0 transition-shadow duration-300',
        scrolled ? 'shadow-soft border-b border-line/60' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto max-w-content px-4">
        <div className="flex h-16 items-center gap-3">
          <Link href="/" className="pressable flex shrink-0 items-center gap-2" aria-label={t('brand.name')}>
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-soft">
              <Icon name="parliament" size={20} />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[15px] font-extrabold tracking-tight text-ink">{t('brand.name')}</span>
              <span className="tricolor-line mt-1 w-9" aria-hidden="true" />
            </span>
          </Link>

          <div className="hidden flex-1 md:block">
            <SearchBox variant="header" />
          </div>

          <nav className="ml-auto flex items-center gap-1 text-sm font-medium" aria-label="Primary">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    'pressable items-center gap-1.5 rounded-full px-3 py-2',
                    n.show,
                    active ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-ink-soft hover:bg-paper-sink',
                  )}
                >
                  <Icon name={n.icon} size={16} /> {t(n.key)}
                </Link>
              );
            })}
            <LanguageSwitcher />
            <ThemeToggle />
          </nav>
        </div>

        <div className="pb-3 md:hidden">
          <SearchBox variant="header" />
        </div>
      </div>
    </header>
  );
}
