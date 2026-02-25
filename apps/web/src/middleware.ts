import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Parse locale from cookie or Accept-Language header
  const locale = request.cookies.get('NEXT_LOCALE')?.value ||
    (request.headers.get('accept-language')?.includes('zh') ? 'zh-HK' : 'en');
  
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
