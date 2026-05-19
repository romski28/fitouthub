'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { ProjectAiPanel } from '@/components/project-ai-panel';
import { API_BASE_URL } from '@/config/api';
import {
  buildQuoteBreakdownPayload,
  getQuoteBreakdownBaseItems,
  getQuoteBreakdownBaseTotal,
  getQuoteBreakdownFields,
  type QuoteBreakdownFormValues,
  type StoredQuoteBreakdown,
} from '@/lib/quote-breakdown';

const TIME_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
);

const TIME_MINUTE_OPTIONS = ['00', '15', '30', '45'] as const;

const toDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getEmergencyDateOptions = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return [
    { label: 'Today', value: toDateInput(today) },
    { label: 'Tomorrow', value: toDateInput(tomorrow) },
  ] as const;
};

interface OverviewTabProps {
  tab?: string;
  project: {
    id: string;
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
        assumptions?: unknown;
        risks?: unknown;
        project?: unknown;
      } | null;
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
  quoteForm: {
    breakdown: QuoteBreakdownFormValues;
    notes: string;
    estimatedStartDate: string;
    estimatedStartTime: string;
    estimatedDurationValue: string;
    estimatedDurationUnit: 'hours' | 'days';
  };
  onUpdateQuoteForm: (
    patch: Partial<{
      breakdown: QuoteBreakdownFormValues;
      notes: string;
      estimatedStartDate: string;
      estimatedStartTime: string;
      estimatedDurationValue: string;
      estimatedDurationUnit: 'hours' | 'days';
    }>,
  ) => void;
  onSubmitQuote: (e: React.FormEvent) => Promise<void>;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onKeepCurrentQuote: () => Promise<void>;
  onOpenAccessSchedule?: () => void;
  submittingQuote: boolean;
  accessToken: string | null;
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

const extractOverviewSummaryLines = (value?: string): string[] => {
  const source = (value || '').trim();
  if (!source) return [];

  const lines = source
    .replace(/\r\n/g, '\n')
    .replace(/\s+(Summary:)/gi, '\n$1')
    .replace(/\s+(Assumptions:)/gi, '\n$1')
    .replace(/\s+(Q&A:)/gi, '\n$1')
    .replace(/\s+(Q\d+\s*:)/gi, '\n$1')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered: string[] = [];
  let inAssumptions = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^Assumptions:/i.test(line)) {
      inAssumptions = true;
      continue;
    }
    if (/^(Summary:|Q&A:|Q\d+\s*:)/i.test(line)) {
      inAssumptions = false;
    }
    if (inAssumptions) continue;

    if (/^Summary:/i.test(line)) {
      const summaryContent = line.replace(/^Summary:\s*/i, '').trim();
      if (summaryContent) filtered.push(summaryContent);
      continue;
    }

    filtered.push(line);
  }

  return filtered;
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  quoteForm,
  onUpdateQuoteForm,
  onSubmitQuote,
  onAccept,
  onReject,
  onKeepCurrentQuote,
  onOpenAccessSchedule,
  submittingQuote,
  accessToken,
}) => {
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const [selectedHour, setSelectedHour] = React.useState('');
  const [selectedMinute, setSelectedMinute] = React.useState('');
  const [platformFeePercent, setPlatformFeePercent] = React.useState<number | undefined>();
  const [platformFeeAmount, setPlatformFeeAmount] = React.useState<number | undefined>();
  const [grossAmount, setGrossAmount] = React.useState<number | undefined>();
  const [loadingFeePreview, setLoadingFeePreview] = React.useState(false);

  React.useEffect(() => {
    const [hour = '', minute = ''] = quoteForm.estimatedStartTime.split(':');
    setSelectedHour(hour);
    setSelectedMinute(minute);
  }, [quoteForm.estimatedStartTime]);

  const updateStartTime = React.useCallback(
    (nextHour: string, nextMinute: string) => {
      if (!nextHour || !nextMinute) {
        onUpdateQuoteForm({ estimatedStartTime: '' });
        return;
      }

      onUpdateQuoteForm({ estimatedStartTime: `${nextHour}:${nextMinute}` });
    },
    [onUpdateQuoteForm],
  );

  React.useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Initial quote deadline countdown from invitation date
  const invitedAt = project.createdAt ? new Date(project.createdAt) : null;
  const quoteWindowMs = project.project?.isEmergency
    ? 1 * 60 * 60 * 1000
    : 3 * 24 * 60 * 60 * 1000;
  const quoteWindowLabel = project.project?.isEmergency ? '1h' : '3d';
  const quoteWindowLongLabel = project.project?.isEmergency
    ? '1 hour from invitation'
    : '3 days from invitation';
  const quoteDeadline = project.quoteExtendedUntil
    ? new Date(project.quoteExtendedUntil)
    : invitedAt
      ? new Date(invitedAt.getTime() + quoteWindowMs)
      : null;
  const msRemaining = quoteDeadline && nowMs !== null ? quoteDeadline.getTime() - nowMs : null;
  const isOverdue = msRemaining !== null && msRemaining < 0;
  const daysLeft = msRemaining !== null && msRemaining > 0 ? Math.floor(msRemaining / (24 * 60 * 60 * 1000)) : 0;
  const hoursLeft = msRemaining !== null && msRemaining > 0 ? Math.floor((msRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)) : 0;
  const minutesLeft = msRemaining !== null && msRemaining > 0 ? Math.max(1, Math.ceil(msRemaining / (60 * 1000))) : 0;

  const hasInitialQuote = Boolean(project.quotedAt);
  const isRebidFlow = project.status === 'counter_requested' || project.status === 'quoted';
  const shouldEnforceInitialDeadline = !hasInitialQuote && !isRebidFlow;
  const isInitialQuoteLocked = shouldEnforceInitialDeadline && isOverdue;
  const showQuoteForm = ['pending', 'accepted', 'counter_requested'].includes(project.status);
  const overviewSummaryLines = extractOverviewSummaryLines(project.project.notes);

  const countdownBadge = quoteDeadline && shouldEnforceInitialDeadline ? (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
      isOverdue ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40' :
      daysLeft === 0 ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' :
      'bg-blue-500/20 text-blue-200 border border-blue-500/40'
    }`}>
      {isOverdue
        ? '⚠ Quote overdue'
        : daysLeft > 0
          ? `⏱ ${daysLeft}d ${hoursLeft}h to quote`
          : hoursLeft > 0
            ? `⏱ ${hoursLeft}h to quote`
            : `⏱ ${minutesLeft}m to quote`} ({quoteWindowLabel})
    </span>
  ) : null;
  const breakdownFields = getQuoteBreakdownFields(project.project.isEmergency === true);
  const emergencyDateOptions = getEmergencyDateOptions();
  const isEmergencyProject = project.project.isEmergency === true;
  const quoteBreakdownTotal = buildQuoteBreakdownPayload(quoteForm.breakdown, {
    isEmergency: isEmergencyProject,
    projectScale: null,
  }).baseTotal ?? 0;
  const existingBreakdownItems = getQuoteBreakdownBaseItems(project.quoteBreakdown);
  const existingBreakdownTotal = getQuoteBreakdownBaseTotal(project.quoteBreakdown, project.quoteBaseAmount || project.quoteAmount);

  React.useEffect(() => {
    if (!accessToken || !project.id || quoteBreakdownTotal <= 0) {
      setPlatformFeePercent(undefined);
      setPlatformFeeAmount(undefined);
      setGrossAmount(undefined);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoadingFeePreview(true);
      try {
        const response = await fetch(`${API_BASE_URL}/professional/projects/${project.id}/quote-preview`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ quoteAmount: quoteBreakdownTotal }),
        });

        if (response.ok) {
          const data = await response.json();
          setPlatformFeePercent(data.platformFeePercent);
          setPlatformFeeAmount(data.platformFeeAmount);
          setGrossAmount(data.grossAmount);
        } else {
          setPlatformFeePercent(undefined);
          setPlatformFeeAmount(undefined);
          setGrossAmount(undefined);
        }
      } catch {
        setPlatformFeePercent(undefined);
        setPlatformFeeAmount(undefined);
        setGrossAmount(undefined);
      } finally {
        setLoadingFeePreview(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [accessToken, project.id, quoteBreakdownTotal]);

  return (
    <div className="space-y-6">
      {overviewSummaryLines.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm p-5">
          <h2 className="text-lg font-bold text-white mb-3">Summary</h2>
          <div className="rounded-md border border-slate-700 bg-slate-900/45 px-3 py-3 space-y-1.5">
            {overviewSummaryLines.map((line, index) => (
              <p key={`overview-summary-line-${index}`} className="text-sm leading-relaxed text-slate-200">
                {line}
              </p>
            ))}
            <div className="mt-3 pt-2 border-t border-slate-700 flex gap-4 text-xs text-slate-300">
              <span>Invited: {formatDate(project.createdAt)}</span>
              {project.updatedAt && <span>Last updated: {formatDate(project.updatedAt)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Quote Form/Status */}
      {showQuoteForm && 
       !(project.status === 'declined' || project.status === 'rejected') ? (
        <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">
              {project.quotedAt ? 'Update Your Quote' : 'Submit Your Quote'}
            </h2>
            {countdownBadge}
          </div>

          {project.quoteReminderSentAt && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2.5 text-sm text-emerald-200">
              <span className="mt-0.5">⏰</span>
              <span>
                <strong>Your quote deadline has been extended by 24 hours.</strong>{' '}
                {project.quoteExtendedUntil && (
                  <>New deadline: <strong>{new Date(project.quoteExtendedUntil).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></>
                )}
              </span>
            </div>
          )}

          {project.status === 'counter_requested' && (
            <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
              The client requested a better offer. You can submit a revised quote or keep your current offer.
            </div>
          )}

          {project.status === 'quoted' && (
            <div className="mb-4 rounded-md border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
              You can adjust your quote if needed. Submit a revised amount or keep your current offer.
            </div>
          )}

          {project.status !== 'awarded' && !isEmergencyProject && (
            <div className="mb-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
              You can request site access before quoting to better appraise the project while tentatively accepting it.
              <button
                type="button"
                onClick={() => onOpenAccessSchedule?.()}
                className="ml-1 font-semibold underline underline-offset-2 hover:text-white"
              >
                Go to Access & Schedule
              </button>
            </div>
          )}

          <form
            onSubmit={async (e) => {
              await onSubmitQuote(e);
            }}
            className="space-y-4"
          >
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 space-y-4">
              {isInitialQuoteLocked && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                  Initial quote window closed ({quoteWindowLongLabel}). Please contact the client to reopen bidding.
                </div>
              )}

              <div className={`grid gap-4 ${breakdownFields.length > 2 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                {breakdownFields.map((field) => (
                  <div key={field.code}>
                    <label htmlFor={`quote-${field.code}`} className="block text-sm font-semibold text-white mb-1">
                      {field.label}{field.required ? ' *' : ''}
                    </label>
                    <input
                      id={`quote-${field.code}`}
                      type="number"
                      step="0.01"
                      min="0"
                      required={field.required}
                      disabled={submittingQuote}
                      value={quoteForm.breakdown[field.key]}
                      onChange={(e) =>
                        onUpdateQuoteForm({
                          breakdown: {
                            ...quoteForm.breakdown,
                            [field.key]: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                      placeholder="0.00"
                    />
                  </div>
                ))}

                <div>
                  <label htmlFor="quote-platform-fee" className="block text-sm font-semibold text-white mb-1">
                    Mimo fee
                  </label>
                  <input
                    id="quote-platform-fee"
                    type="text"
                    value={loadingFeePreview ? '...' : platformFeePercent !== undefined ? `${platformFeePercent.toFixed(1)}%` : '—'}
                    disabled
                    className="w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 text-center focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Quote total before platform fee</p>
                <p className="text-lg font-bold text-white">HK${quoteBreakdownTotal.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
              </div>

              {quoteBreakdownTotal > 0 && platformFeePercent !== undefined && grossAmount !== undefined && (
                <div className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                  <p>Your quote: {formatHKD(quoteBreakdownTotal)} → Client sees: {formatHKD(grossAmount)} (+ {formatHKD(platformFeeAmount)} fee)</p>
                </div>
              )}

              <div>
                <label htmlFor="notes" className="block text-sm font-semibold text-white mb-1">
                  Quote Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  rows={4}
                  disabled={submittingQuote}
                  value={quoteForm.notes}
                  onChange={(e) => onUpdateQuoteForm({ notes: e.target.value })}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                  placeholder="Add any additional notes about your quote..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="estimatedStartDate" className="block text-sm font-semibold text-white mb-1">
                    {isEmergencyProject ? 'Be with you... *' : 'Start Date *'}
                  </label>
                  {isEmergencyProject ? (
                    <div className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-slate-600 bg-slate-900">
                      {emergencyDateOptions.map((option) => {
                        const active = quoteForm.estimatedStartDate === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={submittingQuote}
                            onClick={() => onUpdateQuoteForm({ estimatedStartDate: option.value })}
                            className={`px-3 py-2 text-sm font-semibold transition ${
                              active ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      id="estimatedStartDate"
                      type="date"
                      required
                      disabled={submittingQuote}
                      value={quoteForm.estimatedStartDate}
                      onChange={(e) => onUpdateQuoteForm({ estimatedStartDate: e.target.value })}
                      className="quote-picker-input w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                    />
                  )}
                </div>

                <div>
                  <label htmlFor="estimatedStartHour" className="block text-sm font-semibold text-white mb-1">
                    {isEmergencyProject ? 'at... *' : 'Start Time *'}
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id="estimatedStartHour"
                      required
                      disabled={submittingQuote}
                      value={selectedHour}
                      onChange={(e) => {
                        const nextHour = e.target.value;
                        setSelectedHour(nextHour);
                        updateStartTime(nextHour, selectedMinute);
                      }}
                      className="quote-dark-select w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Hour</option>
                      {TIME_HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm font-semibold text-slate-300">:</span>
                    <select
                      id="estimatedStartMinute"
                      required
                      disabled={submittingQuote}
                      value={selectedMinute}
                      onChange={(e) => {
                        const nextMinute = e.target.value;
                        setSelectedMinute(nextMinute);
                        updateStartTime(selectedHour, nextMinute);
                      }}
                      className="quote-dark-select w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Mins</option>
                      {TIME_MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="estimatedDurationValue" className="block text-sm font-semibold text-white mb-1">
                    Estimated Duration *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="estimatedDurationValue"
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      disabled={submittingQuote}
                      value={quoteForm.estimatedDurationValue}
                      onChange={(e) => onUpdateQuoteForm({ estimatedDurationValue: e.target.value })}
                      className="w-24 sm:w-28 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                      placeholder="e.g. 8"
                    />
                    <div className="inline-flex min-w-0 flex-1 overflow-hidden rounded-md border border-slate-600 bg-slate-900">
                      <button
                        type="button"
                        onClick={() => onUpdateQuoteForm({ estimatedDurationUnit: 'hours' })}
                        disabled={submittingQuote}
                        className={`w-1/2 px-3 py-2 text-sm font-semibold transition ${
                          quoteForm.estimatedDurationUnit === 'hours'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-transparent text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateQuoteForm({ estimatedDurationUnit: 'days' })}
                        disabled={submittingQuote}
                        className={`w-1/2 border-l border-slate-600 px-3 py-2 text-sm font-semibold transition ${
                          quoteForm.estimatedDurationUnit === 'days'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-transparent text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        Days
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Calculate form validity */}
              {(() => {
                const isFormValid = Boolean(
                  quoteBreakdownTotal > 0 &&
                    quoteForm.estimatedStartDate &&
                    quoteForm.estimatedStartTime &&
                    quoteForm.estimatedDurationValue &&
                    parseFloat(quoteForm.estimatedDurationValue) > 0,
                );

                return (
                  <>
                    <button
                      type="submit"
                      disabled={submittingQuote || !isFormValid}
                      title={!isFormValid ? 'Please fill in all required fields to submit' : ''}
                      className="flex-1 min-w-40 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {submittingQuote ? 'Submitting...' : project.quotedAt ? 'Update Quote' : 'Submit Quote'}
                    </button>

                    {project.status === 'counter_requested' && (
                      <button
                        type="button"
                        onClick={onKeepCurrentQuote}
                        disabled={submittingQuote}
                        className="flex-1 min-w-40 rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-50 transition"
                      >
                        {submittingQuote ? 'Processing...' : 'Confirm Quotation'}
                      </button>
                    )}

                    {project.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={onAccept}
                          disabled={submittingQuote}
                          className="flex-1 min-w-40 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                        >
                          {submittingQuote ? 'Processing...' : 'Tentatively accept'}
                        </button>
                        <button
                          type="button"
                          onClick={onReject}
                          disabled={submittingQuote}
                          className="flex-1 min-w-40 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                        >
                          {submittingQuote ? 'Processing...' : 'Decline Project'}
                        </button>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </form>
        </div>
      ) : project.quoteAmount && !(project.status === 'declined' || project.status === 'rejected') ? (
        <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm p-5">
          <h2 className="text-lg font-bold text-white mb-4">Your Quote</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Amount</p>
              <p className="text-2xl font-bold text-white">${project.quoteAmount}</p>
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Entered subtotal</p>
              <p className="text-sm font-semibold text-white">HK${existingBreakdownTotal.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
            </div>
            
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Submitted</p>
              <p className="text-sm font-semibold text-white">
                {project.quotedAt ? new Date(project.quotedAt).toLocaleDateString() : '—'}
              </p>
            </div>
            
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Notes</p>
              <p className="text-sm text-slate-300 line-clamp-2">{project.quoteNotes || '—'}</p>
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {isEmergencyProject ? 'Be with you...' : 'Estimated Start'}
              </p>
              <p className="text-sm font-semibold text-white">{formatDateTime(project.quoteEstimatedStartAt)}</p>
            </div>
          </div>

          {existingBreakdownItems.length > 0 && (
            <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Breakdown</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {existingBreakdownItems.map((item) => (
                  <div key={item.code} className="rounded-md border border-slate-700 bg-slate-950/50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="text-sm font-semibold text-white">HK${Number(item.amount || 0).toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Estimated Duration</p>
              <p className="text-sm font-semibold text-white">{formatDuration(project.quoteEstimatedDurationMinutes)}</p>
            </div>
            
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Status</p>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                project.status === 'awarded' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40' :
                project.status === 'quoted' ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40' :
                project.status === 'counter_requested' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' :
                'bg-slate-700 text-slate-300 border border-slate-600'
              }`}>
                {project.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {project.project.aiIntake && (
        <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm p-5">
          <ProjectAiPanel aiIntake={project.project.aiIntake} mode="professional" />
        </div>
      )}
    </div>
  );
};
