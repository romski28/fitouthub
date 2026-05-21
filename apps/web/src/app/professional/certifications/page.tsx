'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import { ProfessionalCertificationManager } from '@/components/professional-certification-manager';

type CertificationProfilePayload = {
  id: string;
  professionType?: string | null;
  primaryTrade?: string | null;
  tradesOffered?: string[];
  certifications?: Array<{ id: string }>;
};

export default function ProfessionalCertificationsPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken } = useProfessionalAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CertificationProfilePayload>({
    id: '',
    professionType: '',
    primaryTrade: '',
    tradesOffered: [],
    certifications: [],
  });
  const hasLoadedRef = useRef(false);

  const selectedTradeTitles = useMemo(
    () =>
      Array.from(
        new Set(
          [profile.primaryTrade, ...(profile.tradesOffered || [])]
            .map((value) => (value || '').trim())
            .filter(Boolean),
        ),
      ),
    [profile.primaryTrade, profile.tradesOffered],
  );

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }
    if (!isLoggedIn || !accessToken) return;

    const fetchProfile = async () => {
      try {
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        const res = await fetchWithRetry(`${API_BASE_URL}/professional/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) throw new Error('Failed to load certifications workspace');
        const payload = await res.json();
        setProfile({
          id: payload.id || '',
          professionType: payload.professionType || '',
          primaryTrade: payload.primaryTrade || '',
          tradesOffered: payload.tradesOffered || [],
          certifications: payload.certifications || [],
        });
        setError(null);
        hasLoadedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load certifications workspace');
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [accessToken, isLoggedIn, router]);

  if (loading || isLoggedIn === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="mt-4 text-slate-600">Loading certifications...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn || !accessToken) return null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-3 sm:px-6 lg:px-8 space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-6 py-7 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(185,78,45,0.92)]">Professional Workspace</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Certifications</h1>
            <p className="mt-2 text-sm text-slate-700">
              Keep compliance documents separate from your general profile so regulated work can be reviewed properly.
            </p>
          </div>
          <Link
            href="/professional/profile"
            className="inline-flex items-center justify-center rounded-md border border-[rgba(120,53,15,0.18)] bg-[rgba(255,250,240,0.78)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(255,250,240,0.92)]"
          >
            Back to profile
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <ProfessionalCertificationManager
        accessToken={accessToken}
        selectedTradeTitles={selectedTradeTitles}
        professionalType={profile.professionType}
      />
    </div>
  );
}