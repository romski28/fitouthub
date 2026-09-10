'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export type DigestItem = {
  kind: 'quote_due' | 'site_visit' | 'milestone' | 'award_nudge' | 'payment_due';
  title: string;
  detail: string;
  link: string;
};

const ALWAYS_SHOW_KEY = 'today_always_show';

const SECTIONS: { kind: DigestItem['kind']; label: string; dot: string }[] = [
  { kind: 'payment_due', label: 'Payments', dot: 'bg-emerald-500' },
  { kind: 'milestone', label: 'Milestones', dot: 'bg-blue-500' },
  { kind: 'site_visit', label: 'Site visits', dot: 'bg-amber-500' },
  { kind: 'quote_due', label: 'Quotes', dot: 'bg-violet-500' },
  { kind: 'award_nudge', label: 'Awards', dot: 'bg-rose-500' },
];

export function TodayModal({
  open,
  items,
  loading,
  role,
  onClose,
}: {
  open: boolean;
  items: DigestItem[];
  loading: boolean;
  role?: 'client' | 'professional' | null;
  onClose: () => void;
}) {
  const [alwaysShow, setAlwaysShow] = useState(false);

  useEffect(() => {
    if (open) {
      setAlwaysShow(
        typeof window !== 'undefined' && localStorage.getItem(ALWAYS_SHOW_KEY) === '1',
      );
    }
  }, [open]);

  if (!open) return null;

  const toggleAlwaysShow = (value: boolean) => {
    setAlwaysShow(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ALWAYS_SHOW_KEY, value ? '1' : '0');
    }
  };

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const grouped = SECTIONS.map((section) => ({
    ...section,
    items: items.filter((it) => it.kind === section.kind),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your day"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/45 bg-[#F5EEDE]/95 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[rgba(120,53,15,0.12)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b94e2d]">
              {todayLabel}
            </p>
            <h2 className="text-xl font-bold text-slate-900">Here&apos;s your day</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-14 animate-pulse rounded-xl bg-slate-200/70" />
              <div className="h-14 animate-pulse rounded-xl bg-slate-200/70" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Nothing due today — you&apos;re all caught up.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((section) => (
                <section key={section.kind}>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${section.dot}`} />
                    {section.label}
                  </p>
                  <ul className="space-y-2">
                    {section.items.map((it, i) => (
                      <li key={`${it.kind}-${i}`}>
                        <Link
                          href={it.link}
                          onClick={onClose}
                          className="block rounded-xl border border-[#D4C8A0] bg-white/70 px-3 py-2 transition hover:bg-white"
                        >
                          <p className="text-sm font-semibold text-slate-800">{it.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{it.detail}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[rgba(120,53,15,0.12)] px-5 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={alwaysShow}
              onChange={(e) => toggleAlwaysShow(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#b94e2d]"
            />
            Always show on login
          </label>
          <div className="flex items-center gap-3">
            {role === 'professional' && (
              <Link
                href="/professional/calendar"
                onClick={onClose}
                className="text-xs font-semibold text-[#b94e2d] hover:underline"
              >
                Open full schedule
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[#b94e2d] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#a04326]"
            >
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
