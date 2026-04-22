'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkflowCompletionModal, WorkflowNextStep } from '@/components/workflow-completion-modal';

interface ReviewQuotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuotedProfessional {
  id: string;
  professionalId: string;
  status: string;
  quoteAmount?: string | number;
  quoteBaseAmount?: string | number;
  quoteNotes?: string;
  quoteEstimatedStartAt?: string;
  quoteEstimatedDurationMinutes?: number;
  quoteEstimatedDurationUnit?: 'hours' | 'days';
  quotedAt?: string;
  professional: {
    fullName?: string;
    businessName?: string;
  };
}

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'HK$ —';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const getNumeric = (value?: number | string): number => {
  if (value === undefined || value === null || value === '') return NaN;
  return typeof value === 'number' ? value : Number(value);
};

const formatShortDate = (iso?: string) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return null;
  }
};

const formatDuration = (minutes?: number, unit?: 'hours' | 'days') => {
  if (!minutes || !Number.isFinite(minutes)) return null;
  if (unit === 'days') {
    const days = Math.round(minutes / 1440);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (unit === 'hours') {
    const hours = Math.round(minutes / 60);
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(/\.0$/, '')} hr${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} min`;
};

export function ReviewQuotesModal({ isOpen, onClose }: ReviewQuotesModalProps) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { state } = useNextStepModal();

  const [professionals, setProfessionals] = useState<QuotedProfessional[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [acceptedName, setAcceptedName] = useState('');

  const projectId = state.projectId;

  const fetchQuotes = useCallback(async () => {
    if (!projectId || !accessToken) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/professionals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Could not load quotes');
      const data: QuotedProfessional[] = await res.json();
      const withQuotes = data.filter(
        (pp) =>
          Number.isFinite(getNumeric(pp.quoteAmount)) &&
          !['declined', 'rejected', 'withdrawn', 'award_reversed'].includes(pp.status),
      );
      setProfessionals(withQuotes);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load quotes');
    } finally {
      setFetching(false);
    }
  }, [projectId, accessToken]);

  useEffect(() => {
    if (isOpen) {
      setShowSuccess(false);
      setAcceptError(null);
      fetchQuotes();
    }
  }, [isOpen, fetchQuotes]);

  const handleAccept = async (pp: QuotedProfessional) => {
    if (!accessToken) return;
    setAcceptingId(pp.id);
    setAcceptError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/client/projects/${pp.id}/quote/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to accept quote');
      }
      setAcceptedName(pp.professional.fullName || pp.professional.businessName || 'the professional');
      setShowSuccess(true);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleOpenProject = () => {
    if (state.projectId) {
      router.push(`/projects/${state.projectId}?tab=professionals`);
    }
    onClose();
  };

  if (!isOpen) return null;

  if (showSuccess) {
    const nextStep: WorkflowNextStep = {
      actionLabel: 'Open project',
      requiresAction: true,
      tab: 'professionals',
    };
    return (
      <WorkflowCompletionModal
        isOpen
        onClose={onClose}
        completedLabel="Quote accepted!"
        completedDescription={`You have accepted ${acceptedName}'s quote. The project moves to the contract phase — get the agreement signed and you are off.`}
        nextStep={nextStep}
        showConfetti
        primaryActionLabel="Open project"
        onNavigate={handleOpenProject}
      />
    );
  }

  const withQuoteNums = professionals.filter((pp) => Number.isFinite(getNumeric(pp.quoteAmount)));
  const sortedByPrice = [...withQuoteNums].sort((a, b) => getNumeric(a.quoteAmount) - getNumeric(b.quoteAmount));
  const cheapestId = sortedByPrice[0]?.id;

  const withStart = withQuoteNums.filter((pp) => !!pp.quoteEstimatedStartAt);
  const soonestId = [...withStart].sort(
    (a, b) => new Date(a.quoteEstimatedStartAt!).getTime() - new Date(b.quoteEstimatedStartAt!).getTime(),
  )[0]?.id;

  const withDuration = withQuoteNums.filter(
    (pp) => Number.isFinite(pp.quoteEstimatedDurationMinutes) && (pp.quoteEstimatedDurationMinutes ?? 0) > 0,
  );
  const fastestId = [...withDuration].sort(
    (a, b) => (a.quoteEstimatedDurationMinutes ?? 0) - (b.quoteEstimatedDurationMinutes ?? 0),
  )[0]?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700 shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400 mb-0.5">Quotes received</p>
            <h2 className="text-lg font-bold text-white leading-tight">
              {state.modalContent?.title || 'Review Quotes'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {fetching && (
            <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading quotes...
            </div>
          )}

          {fetchError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {fetchError}
            </div>
          )}

          {!fetching && !fetchError && professionals.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-sm">
              No quotes submitted yet. Check back soon.
            </div>
          )}

          {!fetching &&
            professionals.map((pp) => {
              const name = pp.professional.fullName || pp.professional.businessName || 'Professional';
              const isCheapest = pp.id === cheapestId && withQuoteNums.length > 1;
              const isSoonest = pp.id === soonestId && withStart.length > 1;
              const isFastest = pp.id === fastestId && withDuration.length > 1;
              const startDate = formatShortDate(pp.quoteEstimatedStartAt);
              const duration = formatDuration(pp.quoteEstimatedDurationMinutes, pp.quoteEstimatedDurationUnit);
              const isAccepting = acceptingId === pp.id;
              const grossNum = getNumeric(pp.quoteAmount);
              const baseNum = getNumeric(pp.quoteBaseAmount);
              const hasFee = Number.isFinite(baseNum) && Number.isFinite(grossNum) && baseNum !== grossNum;

              return (
                <div
                  key={pp.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isCheapest ? 'border-emerald-500/50 bg-emerald-950/30' : 'border-slate-700 bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {isCheapest && (
                          <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                            Cheapest
                          </span>
                        )}
                        {isSoonest && (
                          <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                            Soonest
                          </span>
                        )}
                        {isFastest && (
                          <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
                            Fastest
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`rounded-md border px-3 py-1.5 text-lg font-bold leading-none block ${
                          isCheapest
                            ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-200'
                            : 'border-slate-500/50 bg-slate-900/70 text-slate-100'
                        }`}
                      >
                        {formatHKD(pp.quoteAmount)}
                      </span>
                      {hasFee && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          Base {formatHKD(pp.quoteBaseAmount)} + platform fee
                        </p>
                      )}
                    </div>
                  </div>

                  {(startDate || duration || pp.quoteNotes) && (
                    <div className="mb-3 space-y-1">
                      {(startDate || duration) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                          {startDate && (
                            <span>
                              <span className="text-slate-500">Start </span>
                              {startDate}
                            </span>
                          )}
                          {duration && (
                            <span>
                              <span className="text-slate-500">Duration </span>
                              {duration}
                            </span>
                          )}
                        </div>
                      )}
                      {pp.quoteNotes && (
                        <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{pp.quoteNotes}</p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isAccepting || !!acceptingId}
                    onClick={() => handleAccept(pp)}
                    className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      isCheapest
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-white disabled:opacity-50'
                        : 'bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50'
                    }`}
                  >
                    {isAccepting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Accepting...
                      </span>
                    ) : (
                      'Accept this quote'
                    )}
                  </button>
                </div>
              );
            })}

          {acceptError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {acceptError}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
