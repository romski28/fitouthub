'use client';

import { useAuth } from '@/context/auth-context';
import { useRoleGuard } from '@/hooks/use-role-guard';
import Link from 'next/link';

export default function ProjectDelegatePage() {
  const { user, isLoggedIn } = useAuth();
  useRoleGuard(['project_delegate']);

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
            <h1 className="text-xl font-bold text-slate-900">Project Delegate Dashboard</h1>
          </div>
          <Link
            href="/projects"
            className="rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white transition"
          >
            My Projects
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-10 text-center shadow-[0_18px_40px_rgba(81,55,32,0.05)] backdrop-blur-sm">
          <div className="text-6xl mb-6">🏗️</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Your delegate tools are coming soon</h2>
          <p className="text-slate-600 max-w-md mx-auto leading-relaxed">
            We're building a dedicated space where you can help family members or clients
            manage their renovation projects — scan QR codes for site inspections, track
            progress, and coordinate with contractors on their behalf.
          </p>

          {isLoggedIn && user && (
            <div className="mt-8 inline-block rounded-xl border border-rose-200 bg-rose-50 px-6 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-1">
                Signed in as
              </p>
              <p className="text-sm font-medium text-slate-800">
                {user.firstName} {user.surname}
              </p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          )}

          <div className="mt-8 pt-8 border-t border-[rgba(120,53,15,0.10)]">
            <p className="text-xs text-slate-400">
              Want to manage your own projects instead?{' '}
              <Link href="/projects" className="text-emerald-600 underline">
                Go to client dashboard
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
