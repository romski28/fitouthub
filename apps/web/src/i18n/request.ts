import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

export default getRequestConfig(async () => {
  // Get locale from cookie or Accept-Language header
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  
  // Default to English, support Cantonese (zh-HK)
  let locale = 'en';
  
  // Check for zh/zh-HK/zh-CN in accept-language
  if (acceptLanguage?.includes('zh')) {
    locale = 'zh-HK';
  }

  return {
    locale,
    messages: (await import(`./locales/${locale}.json`)).default,
  };
});
