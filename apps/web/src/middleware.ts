import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Parse locale from cookie or Accept-Language header
  const rawLocale = request.cookies.get('NEXT_LOCALE')?.value;
  // Normalize: treat zh-HK / zh-TW / zh-Hant as zh-HK, zh-CN / zh-Hans as zh-CN
  const normalizeLocale = (raw: string | undefined): string => {
    if (!raw) return '';
    if (raw === 'zh-HK' || raw === 'zh-TW' || raw === 'zh-Hant' || raw === 'zh') return 'zh-HK';
    if (raw === 'zh-CN' || raw === 'zh-Hans') return 'zh-CN';
    return raw;
  };
  
  // Detect from Accept-Language header
  const detectFromHeader = (header: string | null): string => {
    if (!header) return 'en';
    if (header.includes('zh-HK') || header.includes('zh-TW') || header.includes('zh-Hant')) return 'zh-HK';
    if (header.includes('zh-CN') || header.includes('zh-Hans')) return 'zh-CN';
    if (header.includes('zh')) return 'zh-HK'; // generic zh → default to HK
    return 'en';
  };
  
  const locale = normalizeLocale(rawLocale) || detectFromHeader(request.headers.get('accept-language'));
  
  // Set locale cookie if not already set
  const response = NextResponse.next();
  if (!request.cookies.get('NEXT_LOCALE')) {
    response.cookies.set('NEXT_LOCALE', locale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }
  
  // Set Content-Language header to signal we handle our own translations
  response.headers.set('Content-Language', locale);
  
  return response;
}

export const config = {
  matcher: ['/((?!_next|api|static|favicon).*)'],
};
