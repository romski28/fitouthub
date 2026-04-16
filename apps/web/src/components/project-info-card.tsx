import React from 'react';
import StatusPill, { statusToneFromStatus } from './status-pill';
import { ProjectSentimentBadge } from './project-sentiment-badge';

type Role = 'client' | 'admin' | 'professional';

export type ProjectInfoProps = {
  role: Role;
  title: string;
  region: string;
  status: string;
  notes?: string;
  clientName?: string;
  createdAt?: string;
  updatedAt?: string;
  awardedDisplayName?: string;
  quoteAmount?: string | number;
  projectSentimentKey?: string;
  projectSentimentScope?: 'client' | 'professional' | 'shared';
  showWithdrawButton?: boolean;
  withdrawing?: boolean;
  onWithdraw?: () => void;
  attachTabs?: boolean;
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
  clientName,
  createdAt,
  updatedAt,
  awardedDisplayName,
  quoteAmount,
  projectSentimentKey,
  projectSentimentScope = 'shared',
  showWithdrawButton,
  withdrawing,
  onWithdraw,
  attachTabs,
}: ProjectInfoProps) {
  const withdrawn = status === 'withdrawn';
  const isProfessional = role === 'professional';
  const createdLabel = isProfessional ? 'Invited' : 'Created';
  
  const formatHKD = (amount?: string | number) => {
    if (!amount) return undefined;
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `HK$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <div className={`shadow-sm ${isProfessional ? `border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 ${attachTabs ? 'rounded-t-xl rounded-b-none' : 'rounded-xl'}` : 'rounded-xl border border-border bg-surface'}`}>
      <div
        className={`px-5 py-4 text-white ${
          isProfessional
            ? attachTabs
              ? 'rounded-t-xl'
              : 'rounded-t-xl'
            : 'rounded-t-xl'
        } ${
          withdrawn ? 'bg-gradient-to-r from-slate-400 to-slate-300' : isProfessional ? 'bg-transparent' : 'bg-gradient-to-r from-slate-900 to-slate-800'
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusPill
                status={status}
                label={status.replace('_', ' ')}
                tone={statusToneFromStatus(status)}
              />
              {projectSentimentKey && (
                <ProjectSentimentBadge
                  projectId={projectSentimentKey}
                  storageScope={projectSentimentScope}
                />
              )}
            </div>
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
          <div className={`rounded-md px-3 py-2 text-sm border ${isProfessional ? 'bg-slate-900/35 border-slate-700/80' : 'bg-surface-muted border-border'}`}>
            <p className={`font-semibold mb-1 ${isProfessional ? 'text-white' : 'text-strong'}`}>Project description and client</p>
            <p className={`${isProfessional ? 'text-slate-200' : 'text-muted'} leading-relaxed`}>
              {isProfessional
                ? `Project description for ${clientName || 'client'}: ${notes}`
                : notes}
            </p>
            <div className={`flex gap-4 mt-3 pt-2 border-t text-xs ${isProfessional ? 'border-slate-700 text-slate-300' : 'border-border text-muted'}`}>
              <span>{createdLabel}: {formatDate(createdAt)}</span>
              {updatedAt && <span>Last updated: {formatDate(updatedAt)}</span>}
            </div>
          </div>
        </div>
      )}

      {(createdAt || updatedAt) && !notes && (
        <div className={`p-5 border-t ${isProfessional ? 'border-slate-700' : 'border-border'} ${isProfessional && attachTabs ? 'rounded-b-none' : ''}`}>
          <div className={`flex gap-4 text-xs ${isProfessional ? 'text-slate-300' : 'text-muted'}`}>
            <span>{createdLabel}: {formatDate(createdAt)}</span>
            {updatedAt && <span>Last updated: {formatDate(updatedAt)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
