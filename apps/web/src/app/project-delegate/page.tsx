'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { API_BASE_URL } from '@/config/api';
import Link from 'next/link';

type DelegateProject = {
  id: string;
  projectName: string;
  clientName: string;
  region: string;
  notes?: string | null;
  endDate?: string | null;
  status?: string | null;
  access?: { id: string; accessType?: 'ongoing' | 'magic'; task?: string | null; isOngoing?: boolean; consumedAt?: string | null; claimed?: boolean };
};

export default function ProjectDelegatePage() {
  const { user, isLoggedIn, accessToken } = useAuth();
  useRoleGuard(['project_delegate']);

  const [projects, setProjects] = useState<DelegateProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/client/delegate-projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.message) || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) load();
  }, [accessToken, load]);

  if (isLoggedIn === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EEDE]">
      <header className="border-b border-[#D4C8A0] bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤝</span>
            <h1 className="text-xl font-bold text-slate-900">Delegate Dashboard</h1>
          </div>
          <Link
            href="/projects"
            className="rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white transition"
          >
            My own projects
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {isLoggedIn && user && (
          <div className="mb-6 inline-block rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1">Signed in as delegate</p>
            <p className="text-sm font-medium text-slate-800">
              {user.firstName} {user.surname}
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-12 text-center shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
            <div className="text-5xl mb-4">🏗️</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">No projects yet</h2>
            <p className="text-slate-600 max-w-md mx-auto leading-relaxed">
              When a client grants you access to one of their projects, it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/delegate-project/${p.id}`}
                className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-6 shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm transition hover:shadow-[0_22px_50px_rgba(81,55,32,0.10)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-slate-900">{p.projectName}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${p.access?.isOngoing ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.access?.isOngoing ? 'ongoing' : p.access?.task === 'site_inspection' ? 'site visit' : 'scoped'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Client: {p.clientName}</p>
                <p className="mt-1 text-sm text-slate-500">{p.region}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
