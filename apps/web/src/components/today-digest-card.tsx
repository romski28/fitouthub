'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config/api';

type DigestItem = {
  kind: string;
  title: string;
  detail: string;
  link: string;
};

export function TodayDigestCard({
  role,
  accessToken,
}: {
  role: 'client' | 'professional';
  accessToken?: string | null;
}) {
  const [data, setData] = useState<{ items: DigestItem[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/digest/today`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          setData({
            items: Array.isArray(d?.items) ? d.items : [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading || !data) return null;

  const { items } = data;
  const nothingDue = items.length === 0;

  return (
    <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Here&apos;s your day</h3>

      {nothingDue ? (
        <p className="mt-2 text-sm text-slate-500">Nothing due today — you&apos;re all caught up.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{it.title}</p>
                <p className="text-xs text-slate-500">{it.detail}</p>
              </div>
              <Link
                href={it.link}
                className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
