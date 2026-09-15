'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { API_BASE_URL } from '@/config/api';

type Resolved = {
  email: string;
  projectId: string;
  projectName: string | null;
  isRegisteredDelegate: boolean;
  expiresAt: string;
  task: string | null;
};

function DelegateProjectAccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, isLoggedIn } = useAuth();
  const token = searchParams.get('token') || '';

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', surname: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing access token');
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/auth/delegate-project-magic?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.message || 'Invalid or expired link');
        }
        return r.json();
      })
      .then((d) => {
        setResolved(d);
        setForm((f) => ({ ...f, email: d.email || '' }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (resolved?.isRegisteredDelegate && isLoggedIn) {
      router.replace(`/delegate-project/${resolved.projectId}`);
    }
  }, [resolved, isLoggedIn, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (resolved?.isRegisteredDelegate) {
        await login(form.email, form.password);
      } else {
        await register({
          nickname: `${form.firstName} ${form.surname}`.trim(),
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          surname: form.surname,
          role: 'project_delegate',
        });
      }
      router.replace(`/delegate-project/${resolved?.projectId}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  if (error && !resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Access link error</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button onClick={() => router.replace('/')} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Go to home
          </button>
        </div>
      </div>
    );
  }

  const title = resolved?.projectName ? `Project: ${resolved.projectName}` : 'Project access';

  return (
    <div className="min-h-screen bg-[#F5EEDE] px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {resolved?.isRegisteredDelegate
            ? 'Log in with your delegate account to open this project.'
            : 'Create your delegate account to access this project for 48 hours.'}
        </p>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <form onSubmit={submit} className="mt-5 space-y-3">
          {!resolved?.isRegisteredDelegate && (
            <>
              <input type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
              <input type="text" value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} placeholder="Surname" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
            </>
          )}
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50">
            {submitting ? 'Please wait…' : resolved?.isRegisteredDelegate ? 'Log in and open project' : 'Create account and open project'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DelegateProjectAccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5EEDE]" />}>
      <DelegateProjectAccessInner />
    </Suspense>
  );
}
