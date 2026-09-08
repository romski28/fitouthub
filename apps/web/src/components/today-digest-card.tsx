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
  const [items, setItems] = useState<DigestItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/digest/today`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setItems(Array.isArray(d?.items) ? d.items : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (loading || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Here&apos;s your day</h3>
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
    </div>
  );
}
