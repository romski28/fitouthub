'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { API_BASE_URL } from '@/config/api';
import { fetchWithRetry } from '@/lib/http';
import {
  ProfessionalPortfolioManager,
  type ProfessionalMediaItem,
  type ReferenceProject,
} from '@/components/professional-portfolio-manager';

type PortfolioProfilePayload = {
  media?: ProfessionalMediaItem[];
  referenceProjects?: ReferenceProject[];
};

export default function ProfessionalPortfolioPage() {
  const router = useRouter();
  const { isLoggedIn, accessToken } = useProfessionalAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PortfolioProfilePayload>({
    media: [],
    referenceProjects: [],
  });

  useEffect(() => {
    if (isLoggedIn === false) {
      router.push('/');
      return;
    }
    if (!isLoggedIn || !accessToken) return;

    const fetchPortfolio = async () => {
      try {
        setLoading(true);
        const res = await fetchWithRetry(`${API_BASE_URL}/professional/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          router.push('/');
          return;
        }
        if (!res.ok) throw new Error('Failed to load portfolio');
        const payload = await res.json();
        setData({
          media: payload.media || [],
          referenceProjects: payload.referenceProjects || [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load portfolio');
      } finally {
        setLoading(false);
      }
    };

    void fetchPortfolio();
  }, [accessToken, isLoggedIn, router]);

  if (loading || isLoggedIn === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="mt-4 text-slate-600">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn || !accessToken) return null;

  return (
    <div className="max-w-5xl mx-auto py-8 px-3 sm:px-6 lg:px-8 space-y-6">
      <div className="overflow-hidden rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-6 py-7 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[rgba(185,78,45,0.92)]">Professional Workspace</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Portfolio</h1>
        </div>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <ProfessionalPortfolioManager
        accessToken={accessToken}
        initialMedia={data.media}
        initialReferenceProjects={data.referenceProjects}
      />
    </div>
  );
}