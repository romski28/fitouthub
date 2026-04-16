'use client';

import React from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/config/api';
import { formatBtu } from '@/lib/ac-calculator';

type AcPlan = {
  id: string;
  title: string;
  notes?: string | null;
  updatedAt?: string;
  totalBtu?: number | null;
  linkedProjectId?: string | null;
  rooms: Array<{ id: string; name: string; suggestedUnitSize?: number | null }>;
};

interface AcPlansTabProps {
  tab?: string;
  projectId: string;
  accessToken: string | null;
}

export const AcPlansTab: React.FC<AcPlansTabProps> = ({ projectId, accessToken }) => {
  const [plans, setPlans] = React.useState<AcPlan[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadPlans = React.useCallback(async () => {
    if (!accessToken || !projectId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/ac-projects?linkedProjectId=${encodeURIComponent(projectId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load linked AC plans');
      }

      const data = await response.json();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load linked AC plans');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  React.useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Linked Tooling</p>
          <h2 className="mt-1 text-lg font-bold text-white">AC Plans Linked To This Project</h2>
          <p className="mt-1 text-sm text-slate-300">Client and professional calculator plans linked at save-time appear here for quick context.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadPlans}
            className="rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Refresh
          </button>
          <Link
            href="/docs/tools/ac-calculator"
            className="rounded-md border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
          >
            Open calculator
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading linked AC plans...</p>
      ) : error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : plans.length === 0 ? (
        <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-sm text-slate-300">No AC plans are linked to this project yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{plan.title}</p>
                  <p className="text-xs text-slate-400">
                    {plan.rooms.length} room{plan.rooms.length === 1 ? '' : 's'}
                    {plan.totalBtu ? ` · ${formatBtu(plan.totalBtu)}` : ''}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  {plan.updatedAt ? `Updated ${new Date(plan.updatedAt).toLocaleString()}` : ''}
                </p>
              </div>
              {plan.notes ? <p className="mt-2 text-sm text-slate-300">{plan.notes}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
