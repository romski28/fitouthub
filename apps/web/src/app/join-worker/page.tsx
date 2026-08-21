'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';

function JoinWorkerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useProfessionalAuth();
  const token = searchParams.get('token') || '';

  const [invite, setInvite] = useState<{ email: string; employerProfessionalId: string; employer: { businessName?: string; fullName?: string } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', surname: '', email: '', password: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token');
      setLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/worker-invites/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.message || 'Invalid invite');
        }
        return r.json();
      })
      .then((d) => {
        setInvite(d);
        setForm((f) => ({ ...f, email: d.email || '' }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        fullName: `${form.firstName} ${form.surname}`.trim(),
        businessName: `${form.firstName} ${form.surname}`.trim(),
        professionType: 'worker',
        employerProfessionalId: invite?.employerProfessionalId,
        requireOtpVerification: false,
      });
      // Mark the invite as accepted (best-effort).
      await fetch(`${API_BASE_URL}/worker-invites/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      }).catch(() => {});
      router.replace('/professional-projects');
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

  if (error && !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5EEDE] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-white p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Invite error</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <button onClick={() => router.replace('/')} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Go to home
          </button>
        </div>
      </div>
    );
  }

  const employerName = invite?.employer?.businessName || invite?.employer?.fullName || 'your employer';

  return (
    <div className="min-h-screen bg-[#F5EEDE] px-4 py-12">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Join as a worker</h1>
        <p className="mt-2 text-sm text-slate-600">
          You&apos;ve been invited by <span className="font-semibold">{employerName}</span>. Create your worker account to accept.
        </p>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="text"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            placeholder="First name"
            required
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />
          <input
            type="text"
            value={form.surname}
            onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
            placeholder="Surname"
            required
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            required
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Password"
            required
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            placeholder="Confirm password"
            required
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#b94e2d]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#b94e2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a84426] disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Accept invite'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function JoinWorkerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5EEDE]" />}>
      <JoinWorkerInner />
    </Suspense>
  );
}
