'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';

type WorkerProjectRow = {
  id: string;
  projectName: string;
  clientName?: string | null;
  region?: string | null;
  notes?: string | null;
  endDate?: string | null;
  status?: string;
  access?: { id: string; expiresAt?: string | null; isOngoing?: boolean };
};

export default function WorkerProjectsPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken } = useProfessionalAuth();
  const [projects, setProjects] = useState<WorkerProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/worker-projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        router.replace('/');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to load projects');
      setProjects(Array.isArray(body) ? body : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [accessToken, router]);

  useEffect(() => {
    if (isLoggedIn === false) {
      router.replace('/');
      return;
    }
    load();
  }, [isLoggedIn, load, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EEDE] pb-16">
      <header className="border-b border-[#D4C8A0] bg-white/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-slate-900">My projects</h1>
          <span className="rounded-full bg-[#FF7F50]/10 px-3 py-1 text-xs font-semibold text-[#b94e2d]">
            👷 Worker
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-[#D4C8A0] bg-white p-8 text-center">
            <p className="text-sm text-slate-600">No projects shared with you yet.</p>
            <p className="mt-1 text-xs text-slate-400">Your employer can grant you access to a project from their project page.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/worker-project/${p.id}`}
                  className="block rounded-2xl border border-[#D4C8A0] bg-white p-5 shadow-sm transition hover:border-[#b94e2d]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-slate-900">{p.projectName}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {[p.clientName, p.region].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {p.access?.isOngoing ? 'ongoing' : '48h'}
                    </span>
                  </div>
                  {p.notes && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.notes}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
