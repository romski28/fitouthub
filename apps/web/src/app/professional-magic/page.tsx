'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ProfessionalMagicBridge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = searchParams.get('token');
      const professionalB64 = searchParams.get('professional');
      const projectId = searchParams.get('projectId');

      if (!token || !professionalB64) {
        setError('Invalid magic link.');
        return;
      }

      // Decode professional payload (base64url safe)
      let professionalObj: any = null;
      try {
        const normalized = professionalB64.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
          Array.prototype.map
            .call(atob(normalized), (c: string) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
            .join(''),
        );
        professionalObj = JSON.parse(json);
      } catch (e) {
        setError('Failed to read professional details.');
        return;
      }

      // Persist auth for professional
      localStorage.setItem('professionalAccessToken', token);
      localStorage.setItem('professional', JSON.stringify(professionalObj));
      localStorage.setItem('isProfessional', 'true');

      // Redirect to projects list (or specific project if we later pass an id)
      const target = projectId ? `/professional-projects` : '/professional-projects';
      router.replace(target);
    } catch (err) {
      console.error(err);
      setError('Something went wrong while logging you in.');
    }
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-md w-full text-center space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">Magic link error</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <button
            onClick={() => router.replace('/')}
            className="mt-2 inline-flex justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-md w-full text-center space-y-3">
        <div className="animate-spin inline-block rounded-full h-10 w-10 border-t-2 border-b-2 border-emerald-500"></div>
        <p className="text-sm text-slate-700">Logging you in...</p>
      </div>
    </div>
  );
}
