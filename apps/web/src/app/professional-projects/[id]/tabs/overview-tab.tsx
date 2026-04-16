'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { ProjectAiPanel } from '@/components/project-ai-panel';

const TIME_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
);

const TIME_MINUTE_OPTIONS = ['00', '15', '30', '45'] as const;

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
    quoteNotes?: string;
    quoteEstimatedStartAt?: string;
    quoteEstimatedDurationMinutes?: number;
    quotedAt?: string;
    createdAt?: string;
    quoteReminderSentAt?: string;
    quoteExtendedUntil?: string;
    updatedAt?: string;
  };
  quoteForm: {
    amount: string;
    notes: string;
    estimatedStartDate: string;
    estimatedStartTime: string;
    estimatedDurationValue: string;
    estimatedDurationUnit: 'hours' | 'days';
  };
  onUpdateQuoteForm: (
    patch: Partial<{
      amount: string;
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

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  quoteForm,
  onUpdateQuoteForm,
  onSubmitQuote,
  onAccept,
  onReject,
  onKeepCurrentQuote,
  submittingQuote,
}) => {
  const [nowMs, setNowMs] = React.useState<number | null>(null);
  const [selectedHour, setSelectedHour] = React.useState('');
  const [selectedMinute, setSelectedMinute] = React.useState('');

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
    ? 12 * 60 * 60 * 1000
    : 3 * 24 * 60 * 60 * 1000;
  const quoteWindowLabel = project.project?.isEmergency ? '12h' : '3d';
  const quoteWindowLongLabel = project.project?.isEmergency
    ? '12 hours from invitation'
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

  const hasInitialQuote = Boolean(project.quotedAt);
  const isRebidFlow = project.status === 'counter_requested' || project.status === 'quoted';
  const shouldEnforceInitialDeadline = !hasInitialQuote && !isRebidFlow;
  const isInitialQuoteLocked = shouldEnforceInitialDeadline && isOverdue;
  const showQuoteForm = ['pending', 'accepted', 'counter_requested'].includes(project.status);

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
          : `⏱ ${hoursLeft}h to quote`} ({quoteWindowLabel})
    </span>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Quote Form / Status — shown first so the action is immediately visible */}
      {/* (Project Info follows below) */}

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

              <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-white mb-1">
                  Quote Amount ($) *
                </label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  disabled={submittingQuote}
                  value={quoteForm.amount}
                  onChange={(e) => onUpdateQuoteForm({ amount: e.target.value })}
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                  placeholder="0.00"
                />
              </div>

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
                    Start Date *
                  </label>
                  <input
                    id="estimatedStartDate"
                    type="date"
                    required
                    disabled={submittingQuote}
                    value={quoteForm.estimatedStartDate}
                    onChange={(e) => onUpdateQuoteForm({ estimatedStartDate: e.target.value })}
                    className="quote-picker-input w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none placeholder-slate-500"
                  />
                </div>

                <div>
                  <label htmlFor="estimatedStartHour" className="block text-sm font-semibold text-white mb-1">
                    Start Time *
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
                  quoteForm.amount.trim() &&
                    parseFloat(quoteForm.amount) > 0 &&
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
                          {submittingQuote ? 'Processing...' : 'Accept Project'}
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Estimated Start</p>
              <p className="text-sm font-semibold text-white">{formatDateTime(project.quoteEstimatedStartAt)}</p>
            </div>
          </div>

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

      {/* Project Info */}
      <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 shadow-sm p-5">
        <h2 className="text-lg font-bold text-white mb-4">Project Details</h2>

        {project.project.notes && (
          <div className="rounded-md bg-slate-900/50 px-3 py-3 text-sm border border-slate-700 mb-4">
            <p className="font-semibold text-white mb-1">Description</p>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{project.project.notes}</p>
          </div>
        )}
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Project Name</p>
            <p className="text-base font-semibold text-white">{project.project.projectName}</p>
          </div>
          
          <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Client</p>
            <p className="text-base font-semibold text-white">{project.project.clientName}</p>
          </div>
          
          <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Invited Date</p>
            <p className="text-sm font-semibold text-white">
              {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        {project.project.aiIntake && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <ProjectAiPanel aiIntake={project.project.aiIntake} mode="professional" />
          </div>
        )}
      </div>
    </div>
  );
};
