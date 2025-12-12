'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { Tradesman } from '../../lib/types';
import { ProtectedPageOverlay } from '@/components/protected-page-overlay';

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      {label}
    </span>
  );
}

export default function TradesmenPage() {
  const { isLoggedIn } = useAuth();
  const { openJoinModal, openLoginModal } = useAuthModalControl();
  const [tradesmen, setTradesmen] = useState<Tradesman[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTradesmen = async () => {
      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_API_BASE_URL || 'https://fitouthub.onrender.com'
        ).then((r) => r.json());
        setTradesmen(response.data || response || []);
      } catch (error) {
        console.error('Failed to fetch tradesmen:', error);
        setTradesmen([]);
      } finally {
        setLoading(false);
      }
    };

    if (isLoggedIn) {
      fetchTradesmen();
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
            Browse trades
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Tradesmen by specialty</h1>
          <p className="text-sm text-slate-600">
            Static preview pulled from seed data. API endpoint coming next.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            Loading tradesmen...
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tradesmen.map((trade) => (
              <div
                key={trade.id}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{trade.title}</div>
                    <div className="text-xs text-slate-600">{trade.category}</div>
                  </div>
                  {trade.featured ? <Badge label="Featured" /> : null}
                </div>
                <p className="mt-3 text-sm text-slate-700 line-clamp-3">
                  {trade.description}
                </p>
                <div className="mt-4 space-y-1 text-xs text-slate-600">
                  {trade.jobs.slice(0, 4).map((job: string) => (
                    <div key={job} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-slate-400" />
                      <span>{job}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
