import '../globals.css';
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { getI18n, type LangParams } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/provider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';

// Google AdSense publisher id (public - it ships in the browser). Override via
// NEXT_PUBLIC_ADSENSE_CLIENT if the account changes.
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-6343301891816750';

// Self-hosted at build time by next/font - no runtime request to Google.
// Indic scripts (Devanagari, Tamil, Bengali, …) fall back to the Noto Sans
// system stack declared after the variable in globals.css/tailwind config.
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-manrope',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'RankYourPolitician - Know your representatives',
    template: '%s · RankYourPolitician',
  },
  description:
    'A non-partisan, source-cited guide to Indian representatives: who represents your area, what they are responsible for, and how they are performing.',
  openGraph: {
    title: 'RankYourPolitician',
    description: 'Know your representatives. Hold them accountable.',
    url: SITE_URL,
    siteName: 'RankYourPolitician',
    type: 'website',
  },
  robots: { index: true, follow: true },
  // AdSense site-ownership verification (the crawler reads this from raw HTML).
  other: { 'google-adsense-account': ADSENSE_CLIENT },
};

// NOTE: no generateStaticParams here on purpose. A layout-level lang list
// would multiply with child params (23 locales × ~5.4k person ids ≈ 124k build
// pages). Each page declares its own (lang, …) combos instead; non-listed
// locale variants are generated on first request and ISR-cached.
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<LangParams>;
}) {
  const { lang } = await params;
  const { locale, dict, dir } = await getI18n(lang);
  return (
    <html lang={locale} dir={dir} data-scroll-behavior="smooth" className={manrope.variable} suppressHydrationWarning>

      <body
        className="flex min-h-screen flex-col"
        style={{
          // Manrope first for Latin; Noto Sans keeps every Indic script crisp.
          ['--font-sans' as string]:
            "var(--font-manrope), 'Segoe UI', system-ui, -apple-system, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Bengali', sans-serif",
        }}
      >
        {/* Theme bootstrap: first child of <body>, NOT a React-rendered <head>.
            AdSense injects its managed script into <head> before hydration, so
            any React-owned head node gets a hydration mismatch on every page
            (React #418). Body-first still runs before any content paints, so
            there is no flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (_) {}
              })()
            `,
          }}
        />
        {/* Google AdSense - RAW script tags (not next/script afterInteractive),
            so they are present in the initial HTML of EVERY page: the AdSense
            crawler reads raw HTML, and an injected-after-hydration tag is
            invisible to it (ads then never serve). `async` keeps first paint
            unblocked; React hoists async scripts and dedupes across navigations.
            The inline push requests page-level Auto ads from code, so ads can
            place site-wide even before ad units / console toggles exist. */}
        {ADSENSE_CLIENT && (
          <>
            <script
              async
              crossOrigin="anonymous"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            />
            <script
              dangerouslySetInnerHTML={{
                // Guarded: streamed/dynamic pages can execute layout inline
                // scripts twice, and AdSense rejects a second
                // enable_page_level_ads push ("only one allowed per page").
                __html: `if(!window.__rypAds){window.__rypAds=1;(window.adsbygoogle=window.adsbygoogle||[]).push({google_ad_client:"${ADSENSE_CLIENT}",enable_page_level_ads:true});}`,
              }}
            />
          </>
        )}
        <div className="aurora" aria-hidden="true" />
        <I18nProvider locale={locale} dict={dict} dir={dir}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-white"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <MobileTabBar />
        </I18nProvider>
      </body>
    </html>
  );
}
