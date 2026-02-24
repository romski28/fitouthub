'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [locale, setLocale] = useState<string>('en');

  const handleLocaleChange = (newLocale: string) => {
    setLocale(newLocale);
    
    // Store preference in localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred-locale', newLocale);
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
    }
    
    // Refresh page to apply new locale
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleLocaleChange('en')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
          locale === 'en'
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        English
      </button>
      <button
        onClick={() => handleLocaleChange('zh-HK')}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
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
