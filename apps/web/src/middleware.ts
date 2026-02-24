import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  // A list of all locales that are supported
  locales: ['en', 'zh-HK'],
 
  // Used when no locale matches
  defaultLocale: 'en',
  
  // Don't use locale prefixes in URLs (cleaner URLs)
  localePrefix: 'as-needed'
});
 
export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(zh-HK|en)/:path*']
};
