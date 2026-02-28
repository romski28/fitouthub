'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState<string>('en');

  // Initialize from cookie
  useEffect(() => {
    const cookieLocale = document.cookie
      .split('; ')
      .find(row => row.startsWith('NEXT_LOCALE='))
      ?.split('=')[1];
    if (cookieLocale) {
      setLocale(cookieLocale);
    }
  }, []);

  const handleLocaleChange = (newLocale: string) => {
    setLocale(newLocale);
    
    // Store preference in cookie
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
    
    // Refresh page to apply new locale
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleLocaleChange('en')}
        className={`whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-md transition ${
          locale === 'en'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        English
      </button>
      <button
        onClick={() => handleLocaleChange('zh-HK')}
        className={`w-[4em] whitespace-nowrap text-center py-1.5 text-sm font-medium rounded-md transition ${
          locale === 'zh-HK'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        繁體中文
      </button>
    </div>
  );
}
