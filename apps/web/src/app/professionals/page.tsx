'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Professional } from '../../lib/types';
import ProfessionalsList from '@/components/professionals-list';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';

export default function ProfessionalsPage() {
  const { isLoggedIn } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfessionals = async () => {
      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_API_BASE_URL || 'https://fitouthub.onrender.com'
        ).then((r) => r.json());
        // Adjust based on actual API response structure
        setProfessionals(response.data || response || []);
      } catch (error) {
        console.error('Failed to fetch professionals:', error);
        setProfessionals([]);
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
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Loading professionals...
          </div>
        ) : professionals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No professionals yet. Submit a registration to see them listed here.
          </div>
        ) : (
          <ProfessionalsList professionals={professionals} />
        )}
      </div>
    </>
  );
}
