import i18nConfig from '@/next-i18next.config.js';
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;

const SUPPORTED = i18nConfig.i18n.locales.filter((l) => 'default' !== l);

// First visit without a saved language: use the browser's Accept-Language, else English.
const detectBrowserLocale = (req: NextRequest) => {
  const header = req.headers.get('accept-language') ?? '';
  const wanted = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
  const exact = wanted.find((tag) => SUPPORTED.includes(tag));
  if (exact) {
    return exact;
  }
  const base = wanted.map((tag) => tag.split('-')[0] ?? '').find((tag) => SUPPORTED.includes(tag));
  return base ?? 'en';
};

export function proxy(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.includes('/api/') ||
    PUBLIC_FILE.test(req.nextUrl.pathname)
  ) {
    return undefined;
  }

  if (req.nextUrl.pathname.startsWith('/pt')) {
    return NextResponse.redirect(
      new URL(req.nextUrl.pathname.replace('/pt', '/pt-PT') + req.nextUrl.search, req.url),
    );
  }

  if (req.nextUrl.locale === 'default') {
    const locale = req.cookies.get('NEXT_LOCALE')?.value ?? detectBrowserLocale(req);

    return NextResponse.redirect(
      new URL(`/${locale}${req.nextUrl.pathname}${req.nextUrl.search}`, req.url),
    );
  }

  return undefined;
}
