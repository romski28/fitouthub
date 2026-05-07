'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type LocaleOption = {
  value: 'en' | 'zh-HK' | 'zh-CN';
  shortLabel: string;
  label: string;
  description: string;
};

const localeOptions: LocaleOption[] = [
  { value: 'en', shortLabel: 'EN', label: 'English', description: 'Default' },
  { value: 'zh-HK', shortLabel: 'CH', label: 'Cantonese', description: 'Traditional Chinese' },
  { value: 'zh-CN', shortLabel: 'SC', label: 'Simplified', description: 'Coming soon' },
];

function persistLocaleCookie(locale: LocaleOption['value']) {
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
}

function readInitialLocale(): LocaleOption['value'] {
  if (typeof document === 'undefined') {
    return 'en';
  }

  const cookieLocale = document.cookie
    .split('; ')
    .find((row) => row.startsWith('NEXT_LOCALE='))
    ?.split('=')[1];

  if (cookieLocale === 'en' || cookieLocale === 'zh-HK' || cookieLocale === 'zh-CN') {
    return cookieLocale;
  }

  return 'en';
}

export function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState<'en' | 'zh-HK' | 'zh-CN'>(readInitialLocale);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleLocaleChange = (newLocale: 'en' | 'zh-HK' | 'zh-CN') => {
    setLocale(newLocale);

    // Store preference in cookie
    persistLocaleCookie(newLocale);

    // Refresh page to apply new locale
    setOpen(false);
    router.refresh();
  };

  const activeOption = useMemo(
    () => localeOptions.find((option) => option.value === locale) ?? localeOptions[0],
    [locale],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        aria-label={`Language menu, current selection ${activeOption.shortLabel}`}
        aria-expanded={open}
      >
        <span className="text-lg leading-none" aria-hidden="true">🌐</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Language
          </div>
          <div className="p-2">
            {localeOptions.map((option) => {
              const isActive = option.value === locale;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleLocaleChange(option.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{option.shortLabel}</span>
                    <span className={`block text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                      {option.label} · {option.description}
                    </span>
                  </span>
                  {isActive ? <span className="text-xs font-semibold uppercase tracking-[0.18em]">On</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
