import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import en from './messages/en.json';
import zhHK from './messages/zh-HK.json';
import zhCN from './messages/zh-CN.json';

const messages: Record<string, Record<string, unknown>> = { en, 'zh-HK': zhHK, 'zh-CN': zhCN };


export default getRequestConfig(async () => {
  // Get locale from cookie first, then Accept-Language header
  const cookieStore = await cookies();
  const headersList = await headers();
  
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const acceptLanguage = headersList.get('accept-language');
  
  let locale: 'en' | 'zh-HK' | 'zh-CN' = 'en';
  
  if (localeCookie && ['en', 'zh-HK', 'zh-CN'].includes(localeCookie)) {
    locale = localeCookie as 'en' | 'zh-HK' | 'zh-CN';
  } else if (acceptLanguage?.includes('zh-CN') || acceptLanguage?.includes('zh-Hans')) {
    locale = 'zh-CN';
  } else if (acceptLanguage?.includes('zh')) {
    locale = 'zh-HK';
  }

  return {
    locale,
    messages: messages[locale],
    routing: {
      localePrefix: 'never',
    },
  };
});
