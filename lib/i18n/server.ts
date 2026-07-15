// Server-side locale resolution from the [lang] route param (put there by
// middleware.ts from the `lang` cookie). Deliberately NOT cookie-based here:
// reading cookies() during render opts the whole route out of static
// generation, which silently turned every page into per-request serverless
// rendering. With the param, each locale variant is statically generated and
// served from the CDN.
import { notFound } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_MAP, LOCALE_CODES } from './locales';
import { loadMessages, type Dict } from './index';

export const LANG_COOKIE = 'lang';

/** Params shape shared by every page under app/[lang]/. */
export type LangParams = { lang: string };

/** generateStaticParams for pages whose only dynamic segment is [lang]:
 *  prebuild every locale (they are cheap). Pages with extra segments (person,
 *  state, district, area) declare their own en-only combos instead - listing
 *  every locale there would multiply the build by 23. */
export function allLocaleStaticParams(): LangParams[] {
  return LOCALE_CODES.map((lang) => ({ lang }));
}

export async function getI18n(
  lang?: string,
): Promise<{ locale: string; dict: Dict; dir: 'ltr' | 'rtl' }> {
  // A present-but-unknown lang param is a junk URL, not a locale preference:
  // middleware only ever rewrites to real locales, so this is a scanner probe
  // or a typo (/favicon.ico, /foo.php would otherwise match [lang] and render
  // the home page into a permanent cache entry per bogus path). 404 them.
  const locale = lang === undefined ? DEFAULT_LOCALE : lang.toLowerCase();
  if (!LOCALE_MAP[locale]) notFound();
  const dict = await loadMessages(locale);
  const dir = LOCALE_MAP[locale]?.dir ?? 'ltr';
  return { locale, dict, dir };
}
