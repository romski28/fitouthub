'use client';

import React from 'react';
import { getProjectScope } from '@/lib/project-scope';
import {
  getQuoteBreakdownBaseItems,
  getQuoteBreakdownBaseTotal,
  type StoredQuoteBreakdown,
} from '@/lib/quote-breakdown';

interface OverviewTabProps {
  tab?: string;
  project: {
    id: string;
    quoteRequestedTrades?: string[];
    projectTradesSnapshot?: string[];
    project: {
      id: string;
      projectName: string;
      clientName: string;
      region: string;
      isEmergency?: boolean;
      budget?: string;
      notes?: string;
      aiIntake?: {
        id?: string;
        summary?: string;
        scope?: string;
        title?: string;
        assumptions?: unknown;
        risks?: unknown;
        project?: unknown;
      } | null;
      mimoProjectExtras?: Array<{
        id: string;
        extraType: 'survey' | 'design' | string;
        status: string;
        price?: number | string | null;
        currency?: string | null;
        requestedAt?: string;
        scheduledAt?: string | null;
      }>;
    };
    status: string;
    quoteAmount?: string;
    quoteBaseAmount?: string;
    quoteBreakdown?: StoredQuoteBreakdown | null;
    quoteNotes?: string;
    quoteEstimatedStartAt?: string;
    quoteEstimatedDurationMinutes?: number;
    quoteEstimatedDurationUnit?: 'hours' | 'days';
    quotedAt?: string;
    createdAt?: string;
    quoteReminderSentAt?: string;
    quoteExtendedUntil?: string;
    updatedAt?: string;
  };
  onOpenQuoteModal: () => void;
  onKeepCurrentQuote: () => Promise<void>;
  onOpenAccessSchedule?: () => void;
}

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const formatDuration = (minutes?: number) => {
  if (!minutes || !Number.isFinite(minutes)) return '—';
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
  }
  return `${minutes} min`;
};

const formatDate = (value?: string) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '—';
  }
};

const formatHKD = (value?: number | string): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  return `HK$${num.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const formatExtraTypeLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'survey') return 'Mimo Surveying+';
  if (normalized === 'design') return 'Mimo Interior Design';
  return value || 'Mimo service';
};

const formatExtraStatusLabel = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ');
};

const getExtraStatusClasses = (value?: string) => {
  const normalized = String(value || '').toLowerCase();
  if (['scheduled', 'in_progress'].includes(normalized)) {
    return 'border-sky-300 bg-sky-50 text-sky-700';
  }
  if (normalized === 'completed') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }
  if (['declined', 'cancelled'].includes(normalized)) {
    return 'border-rose-300 bg-rose-50 text-rose-700';
  }
  return 'border-amber-300 bg-amber-50 text-amber-700';
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  onOpenQuoteModal,
  onKeepCurrentQuote,
  onOpenAccessSchedule,
}) => {
  const hasQuoted = Boolean(project.quotedAt);
  const isDeclinedOrRejected = project.status === 'declined' || project.status === 'rejected';
  const isCounterRequested = project.status === 'counter_requested';
  const isEmergencyProject = project.project.isEmergency === true;
  const showQuoteCard = !isDeclinedOrRejected && (hasQuoted || ['pending', 'accepted', 'counter_requested'].includes(project.status));

  const isAwardedProject = String(project.status || '').toLowerCase() === 'awarded';
  const requestedTradeScope = Array.isArray(project.quoteRequestedTrades)
    ? project.quoteRequestedTrades.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
    : [];
  const projectTradeScope = Array.isArray(project.projectTradesSnapshot)
    ? project.projectTradesSnapshot.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
    : [];
  const mimoExtras = Array.isArray(project.project.mimoProjectExtras)
    ? project.project.mimoProjectExtras
    : [];
  const existingBreakdownItems = getQuoteBreakdownBaseItems(project.quoteBreakdown);
  const existingBreakdownTotal = getQuoteBreakdownBaseTotal(project.quoteBreakdown, project.quoteBaseAmount || project.quoteAmount);

  return (
    <div className="space-y-6">
      {/* Project Overview */}
      <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] shadow-[0_18px_40px_rgba(81,55,32,0.06)] p-5">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Project Overview</h2>
        <div className="space-y-2 text-sm text-slate-700">
          <p><span className="font-semibold text-slate-900">Project:</span> {project.project.projectName || 'Untitled'}</p>
          {project.project.region && (
            <p><span className="font-semibold text-slate-900">Location:</span> {project.project.region}</p>
          )}
          {((project.projectTradesSnapshot && project.projectTradesSnapshot.length > 0) || (project.quoteRequestedTrades && project.quoteRequestedTrades.length > 0)) && (
            <p><span className="font-semibold text-slate-900">Trades:</span> {(project.projectTradesSnapshot || project.quoteRequestedTrades || []).join(', ')}</p>
          )}
          {(() => { const scope = getProjectScope({ notes: project.project.notes, aiIntake: project.project.aiIntake as any }); return scope ? (
            <div className="mt-2 rounded-xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.66)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Scope</p>
              <p className="leading-relaxed text-slate-800">{scope}</p>
            </div>
          ) : null; })()}
          {project.project.budget && (
            <p><span className="font-semibold text-slate-900">Budget:</span> HK$ {Number(project.project.budget).toLocaleString()}</p>
          )}
          {project.project.isEmergency && (
            <p><span className="font-semibold text-slate-900">Priority:</span> 🚨 Emergency</p>
          )}
        </div>
      </div>

      {(isAwardedProject || requestedTradeScope.length > 0 || projectTradeScope.length > 0) && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] shadow-[0_18px_40px_rgba(81,55,32,0.06)] p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900">{isAwardedProject ? 'Trades Awarded' : 'Your Trade Scope'}</h2>
          <div className="space-y-3 rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.66)] px-3 py-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{isAwardedProject ? 'Awarded to you' : 'Quoted by you'}</p>
              {requestedTradeScope.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {requestedTradeScope.map((trade) => (
                    <span
                      key={`scope-requested-${trade}`}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                    >
                      {trade}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  {isAwardedProject
                    ? 'No awarded trade tags were recorded for this project yet.'
                    : 'To be confirmed based on your supplied trade scope.'}
                </p>
              )}
            </div>

            {projectTradeScope.length > 0 && (
              <div className="border-t border-[rgba(120,53,15,0.12)] pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">All project trades</p>
                <div className="flex flex-wrap gap-1.5">
                  {projectTradeScope.map((trade) => (
                    <span
                      key={`scope-project-${trade}`}
                      className="rounded-full border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.82)] px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                    >
                      {trade}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mimoExtras.length > 0 && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.05)]">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Mimo Added Services</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {mimoExtras.map((extra) => (
              <div
                key={extra.id}
                className="rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.72)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{formatExtraTypeLabel(extra.extraType)}</p>
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getExtraStatusClasses(extra.status)}`}
                  >
                    {formatExtraStatusLabel(extra.status)}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  {extra.price ? (
                    <p>
                      Price: {String(extra.currency || 'HKD').toUpperCase()} {Number(extra.price).toLocaleString('en-HK')}
                    </p>
                  ) : null}
                  {extra.requestedAt ? <p>Requested: {formatDateTime(extra.requestedAt)}</p> : null}
                  {extra.scheduledAt ? <p>Scheduled: {formatDateTime(extra.scheduledAt)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Your Quote — slim status card */}
      {showQuoteCard && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] shadow-[0_18px_40px_rgba(81,55,32,0.06)] p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            {hasQuoted ? 'Your Quote' : 'Submit Your Quote'}
          </h2>

          {!hasQuoted ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-600 mb-4">You haven't submitted a quote for this project yet.</p>
              <button
                type="button"
                onClick={onOpenQuoteModal}
                className="rounded-xl bg-[#FF7F50] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#E86A3E]"
              >
                Submit Quote
              </button>
            </div>
          ) : (
            <>
              {isCounterRequested && (
                <div className="mb-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                  The client requested a revised offer. You can update your quote or keep your current offer.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</p>
                  <p className="text-2xl font-bold text-slate-900">${project.quoteAmount}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Entered subtotal</p>
                  <p className="text-sm font-semibold text-slate-900">HK${existingBreakdownTotal.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</p>
                  <p className="text-sm font-semibold text-slate-900">{project.quotedAt ? new Date(project.quotedAt).toLocaleDateString() : '—'}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                  <p className="line-clamp-2 text-sm text-slate-700">{project.quoteNotes || '—'}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    {isEmergencyProject ? 'Be with you...' : 'Estimated Start'}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">{formatDateTime(project.quoteEstimatedStartAt)}</p>
                </div>
              </div>

              {existingBreakdownItems.length > 0 && (
                <div className="mt-4 rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {existingBreakdownItems.map((item) => (
                      <div key={item.code} className="rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.92)] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                        <p className="text-sm font-semibold text-slate-900">HK${Number(item.amount || 0).toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Duration</p>
                  <p className="text-sm font-semibold text-slate-900">{formatDuration(project.quoteEstimatedDurationMinutes)}</p>
                </div>
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                    project.status === 'awarded' ? 'border border-emerald-300 bg-emerald-50 text-emerald-700' :
                    project.status === 'quoted' ? 'border border-sky-300 bg-sky-50 text-sky-700' :
                    project.status === 'counter_requested' ? 'border border-amber-300 bg-amber-50 text-amber-700' :
                    'border border-[rgba(120,53,15,0.16)] bg-[rgba(255,250,240,0.9)] text-slate-700'
                  }`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onOpenQuoteModal}
                  className="min-w-40 flex-1 rounded-xl bg-[#FF7F50] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#E86A3E]"
                >
                  Edit Quote
                </button>
                {isCounterRequested && (
                  <button
                    type="button"
                    onClick={onKeepCurrentQuote}
                    className="min-w-40 flex-1 rounded-xl border border-[rgba(120,53,15,0.2)] bg-[rgba(245,238,219,0.9)] px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-[rgba(245,238,219,1)]"
                  >
                    Keep Current Quote
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {project.project.aiIntake && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] shadow-[0_18px_40px_rgba(81,55,32,0.06)] p-5">
          <ProjectAiPanel aiIntake={project.project.aiIntake} mode="professional" />
        </div>
      )}
    </div>
  );
};
