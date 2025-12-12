'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Professional } from '../../lib/types';
import ProfessionalsList from '@/components/professionals-list';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';
import { professionals as fallbackProfessionals } from '@/data/professionals';
import type { CanonicalLocation } from '@/components/location-select';

export default function ProfessionalsPage() {
  const { isLoggedIn, userLocation } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfessionals = async () => {
      const baseUrl = (
        process.env.NEXT_PUBLIC_API_BASE_URL || 'https://fitouthub.onrender.com'
      ).replace(/\/$/, '');

      try {
        const response = await fetch(`${baseUrl}/professionals`, {
          next: { revalidate: 60 }, // Cache for 60 seconds
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await response.json()
          : await response.text().then((text) => {
              throw new Error(`Expected JSON, got: ${text.slice(0, 120)}`);
            });

        const data = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { data?: Professional[] }).data)
            ? (payload as { data: Professional[] }).data
            : [];

        console.log('API Response - first professional:', data[0]);
        setProfessionals(data.length ? data : fallbackProfessionals);
      } catch (error) {
        console.error('Failed to fetch professionals:', error);
        // Show a sensible fallback instead of crashing on invalid JSON responses
        setProfessionals(fallbackProfessionals);
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn) {
      fetchProfessionals();
    } else if (isLoggedIn === false) {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // Prefer user default location; fallback to intentData (handled in ProfessionalsList)
  const defaultLocation: CanonicalLocation = userLocation;

  return (
    <>
      {/* Protected page overlay */}
      <ProtectedPageOverlay
        onJoinClick={openJoinModal}
        onLoginClick={openLoginModal}
      />

      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
            Marketplace
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Professionals</h1>
          <p className="text-sm text-slate-600">
            Live data from the Fitout Hub API.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-5 w-32 bg-slate-200 rounded"></div>
                  <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-slate-200 rounded"></div>
                  <div className="h-4 w-64 bg-slate-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : professionals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No professionals yet. Submit a registration to see them listed here.
          </div>
        ) : (
          <ProfessionalsList
            professionals={professionals}
            initialLocation={defaultLocation}
          />
        )}
      </div>
    </>
  );
}
