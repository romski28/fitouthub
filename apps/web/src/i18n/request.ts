import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import en from './locales/en.json';
import zhHK from './locales/zh-HK.json';

const messages = {
  en,
  'zh-HK': zhHK,
};

export default getRequestConfig(async () => {
  // Get locale from cookie first, then Accept-Language header
  const cookieStore = await cookies();
  const headersList = await headers();
  
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const acceptLanguage = headersList.get('accept-language');
  
  // Default to English, support Cantonese (zh-HK)
  let locale: 'en' | 'zh-HK' = 'en';
  
  // Priority: cookie > accept-language header
  if (localeCookie && ['en', 'zh-HK'].includes(localeCookie)) {
    locale = localeCookie as 'en' | 'zh-HK';
  } else if (acceptLanguage?.includes('zh')) {
    locale = 'zh-HK';
  }

  return {
    locale,
    messages: messages[locale],
  };
});
