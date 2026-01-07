import React from 'react';

type Role = 'client' | 'admin' | 'professional';

export type ProjectInfoProps = {
  role: Role;
  title: string;
  region: string;
  status: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  awardedDisplayName?: string;
  showWithdrawButton?: boolean;
  withdrawing?: boolean;
  onWithdraw?: () => void;
};

const projectStatusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  withdrawn: 'bg-slate-200 text-slate-800',
  awarded: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-200 text-emerald-800',
};

const formatDate = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

export default function ProjectInfoCard({
  role,
  title,
  region,
  status,
  notes,
  createdAt,
  updatedAt,
  awardedDisplayName,
  showWithdrawButton,
  withdrawing,
  onWithdraw,
}: ProjectInfoProps) {
  const withdrawn = status === 'withdrawn';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className={`px-5 py-4 text-white rounded-t-xl ${
          withdrawn ? 'bg-gradient-to-r from-slate-400 to-slate-300' : 'bg-gradient-to-r from-slate-900 to-slate-800'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className={`text-2xl font-bold ${withdrawn ? 'text-slate-700' : ''}`}>{title}</h1>
            <p
              className={`text-sm font-semibold uppercase tracking-wide mt-1 ${
                withdrawn ? 'text-slate-600' : 'text-emerald-300'
              }`}
            >
              {region}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                projectStatusBadge[status] || 'bg-slate-100 text-slate-700'
              }`}
            >
              {status.replace('_', ' ')}
            </span>
            {status === 'awarded' && awardedDisplayName && (
              <span className="text-xs font-medium text-slate-300">{awardedDisplayName}</span>
            )}
          </div>
        </div>
      </div>

      {(withdrawn || (showWithdrawButton && !withdrawn)) && (
        <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {withdrawn && <span className="text-sm text-slate-600">Project withdrawn from bidding.</span>}
          </div>
          {showWithdrawButton && !withdrawn && (
            <button
              onClick={onWithdraw}
              disabled={withdrawing}
              className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              {withdrawing ? 'Withdrawing…' : 'Withdraw Project'}
            </button>
          )}
        </div>
      )}

      {notes && (
        <div className="p-5 space-y-4">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100">
            <p className="font-semibold text-slate-800 mb-1">Project description</p>
            <p className="text-slate-700 leading-relaxed">{notes}</p>
            <div className="flex gap-4 mt-3 pt-2 border-t border-slate-200 text-xs text-slate-500">
              <span>Created: {formatDate(createdAt)}</span>
              {updatedAt && <span>Last updated: {formatDate(updatedAt)}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
