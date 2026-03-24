import React from 'react';
import StatusPill, { statusToneFromStatus } from './status-pill';

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
  quoteAmount?: string | number;
  showWithdrawButton?: boolean;
  withdrawing?: boolean;
  onWithdraw?: () => void;
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
  quoteAmount,
  showWithdrawButton,
  withdrawing,
  onWithdraw,
}: ProjectInfoProps) {
  const withdrawn = status === 'withdrawn';
  const isProfessional = role === 'professional';
  
  const formatHKD = (amount?: string | number) => {
    if (!amount) return undefined;
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `HK$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <div className={`rounded-xl shadow-sm ${isProfessional ? 'border border-slate-700 bg-slate-900/60' : 'border border-border bg-surface'}`}>
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
                withdrawn ? 'text-slate-600' : isProfessional ? 'text-white' : 'text-emerald-300'
              }`}
            >
              {region}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill
              status={status}
              label={status.replace('_', ' ')}
              tone={statusToneFromStatus(status)}
            />
            {status === 'awarded' && awardedDisplayName && (
              <span className={`text-xs font-medium ${isProfessional ? 'text-slate-100' : 'text-slate-300'}`}>{awardedDisplayName}</span>
            )}
            {quoteAmount && (
              <span className={`text-sm font-bold ${isProfessional ? 'text-white' : 'text-emerald-300'}`}>{formatHKD(quoteAmount)}</span>
            )}
          </div>
        </div>
      </div>

      {(withdrawn || (showWithdrawButton && !withdrawn)) && (
        <div className={`p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${isProfessional ? 'text-white' : ''}`}>
          <div className="flex items-center gap-3">
            {withdrawn && <span className={`text-sm ${isProfessional ? 'text-slate-300' : 'text-muted'}`}>Project withdrawn from bidding.</span>}
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
          <div className={`rounded-md px-3 py-2 text-sm border ${isProfessional ? 'bg-slate-800/50 border-slate-700' : 'bg-surface-muted border-border'}`}>
            <p className={`font-semibold mb-1 ${isProfessional ? 'text-white' : 'text-strong'}`}>Project description</p>
            <p className={`${isProfessional ? 'text-slate-200' : 'text-muted'} leading-relaxed`}>{notes}</p>
            <div className={`flex gap-4 mt-3 pt-2 border-t text-xs ${isProfessional ? 'border-slate-700 text-slate-300' : 'border-border text-muted'}`}>
              <span>Created: {formatDate(createdAt)}</span>
              {updatedAt && <span>Last updated: {formatDate(updatedAt)}</span>}
            </div>
          </div>
        </div>
      )}

      {(createdAt || updatedAt) && !notes && (
        <div className={`p-5 border-t ${isProfessional ? 'border-slate-700' : 'border-border'}`}>
          <div className={`flex gap-4 text-xs ${isProfessional ? 'text-slate-300' : 'text-muted'}`}>
            <span>Created: {formatDate(createdAt)}</span>
            {updatedAt && <span>Last updated: {formatDate(updatedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
