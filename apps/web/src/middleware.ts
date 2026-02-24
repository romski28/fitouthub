import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  // A list of all locales that are supported
  locales: ['en', 'zh-HK'],
 
  // Used when no locale matches
  defaultLocale: 'en',
  
  // Don't use locale prefixes in URLs (cleaner URLs)
  localePrefix: 'never'
});
 
export const config = {
  // Skip all paths that should not be internationalized
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
