'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';

type Resolved = {
  email: string;
  projectId: string;
  projectName: string | null;
  professionalId: string;
  isRegisteredWorker: boolean;
  expiresAt: string;
};

function WorkerProjectAccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, register, isLoggedIn } = useProfessionalAuth();
  const token = searchParams.get('token') || '';

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', surname: '', email: '', phone: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing access token');
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/auth/worker-project-magic?token=${encodeURIComponent(token)}`)
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
    // Already logged in as a worker with a resolved link → straight to the project.
    if (resolved?.isRegisteredWorker && isLoggedIn) {
      router.replace(`/worker-project/${resolved.projectId}`);
    }
  }, [resolved, isLoggedIn, router]);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form.email, form.password);
      router.replace(`/worker-project/${resolved?.projectId}`);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        fullName: `${form.firstName} ${form.surname}`.trim(),
        businessName: `${form.firstName} ${form.surname}`.trim(),
        professionType: 'worker',
        employerProfessionalId: resolved?.professionalId,
        requireOtpVerification: false,
      });
      router.replace(`/worker-project/${resolved?.projectId}`);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
          {resolved?.isRegisteredWorker
            ? 'Log in with your worker account to open this project.'
            : 'Create your worker account to access this project for 48 hours.'}
        </p>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <form onSubmit={resolved?.isRegisteredWorker ? submitLogin : submitRegister} className="mt-5 space-y-3">
          {!resolved?.isRegisteredWorker && (
            <>
              <input type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
              <input type="text" value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} placeholder="Surname" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone (optional)" className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
            </>
          )}
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" required className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]" />
          <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50">
            {submitting ? 'Please wait…' : resolved?.isRegisteredWorker ? 'Log in and open project' : 'Create account and open project'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function WorkerProjectAccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5EEDE]" />}>
      <WorkerProjectAccessInner />
    </Suspense>
  );
}
