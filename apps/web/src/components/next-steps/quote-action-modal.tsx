'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkflowCompletionModal, WorkflowNextStep } from '@/components/workflow-completion-modal';

interface QuoteActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

const toDateInput = (value: Date) => {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const tomorrowAtNine = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date;
};

const formatCompletionDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-HK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const parseCompletionDeadline = (value?: string | null) => {
  if (!value) return null;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month, day, 23, 59, 59, 999);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

function inferProjectProfessionalId(path?: string): string | null {
  if (!path) return null;
  const [pathname] = path.split('?');
  const match = pathname.match(/\/professional-projects\/([^/]+)/i);
  return match?.[1] || null;
}

export function QuoteActionModal({
  isOpen,
  isLoading = false,
  onClose,
  onSubmitted,
}: QuoteActionModalProps) {
  const router = useRouter();
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();
  const [amount, setAmount] = useState('');
  const [estimatedStartDate, setEstimatedStartDate] = useState(() => toDateInput(tomorrowAtNine()));
  const [estimatedStartHour, setEstimatedStartHour] = useState('09');
  const [estimatedStartMinute, setEstimatedStartMinute] = useState('00');
  const [estimatedDurationValue, setEstimatedDurationValue] = useState('');
  const [estimatedDurationUnit, setEstimatedDurationUnit] = useState<'hours' | 'days'>('hours');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [requestedCompletionBy, setRequestedCompletionBy] = useState<string | null>(null);
  const [requestedCompletionDeadline, setRequestedCompletionDeadline] = useState<Date | null>(null);

  const projectProfessionalId = useMemo(
    () => inferProjectProfessionalId(state.projectDetailsPath),
    [state.projectDetailsPath],
  );

  if (!isOpen || !state.modalContent) return null;

  const {
    title = 'Submit your quote',
    body,
    detailsBody,
    imageUrl,
    primaryButtonLabel = 'Submit quote',
    secondaryButtonLabel = 'Cancel',
  } = state.modalContent;
  const hasDetails = Boolean(detailsBody);

  useEffect(() => {
    if (!isOpen) {
      setShowSuccess(false);
      setError(null);
      setShowDetails(false);
      setRequestedCompletionBy(null);
      setRequestedCompletionDeadline(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken || !projectProfessionalId) return;

    const loadRequestedCompletionBy = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) return;
        const detail = await response.json();
        const endDateRaw = detail?.project?.endDate || detail?.endDate || null;
        setRequestedCompletionBy(formatCompletionDate(endDateRaw));
        setRequestedCompletionDeadline(parseCompletionDeadline(endDateRaw));
      } catch {
        // Keep this best-effort only; quote flow must remain available.
      }
    };

    void loadRequestedCompletionBy();
  }, [accessToken, isOpen, projectProfessionalId]);

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    setShowSuccess(false);
    setShowDetails(false);
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!accessToken) {
      setError('Please login again to submit your quote.');
      return;
    }

    if (!amount) {
      setError('Please enter a quote amount');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      setError('Please enter a valid quote amount');
      return;
    }

    if (!estimatedStartDate || !estimatedStartHour || !estimatedStartMinute) {
      setError('Please enter an estimated start date and time');
      return;
    }

    const timeHour = Number(estimatedStartHour);
    const timeMinute = Number(estimatedStartMinute);
    const startMinutes = timeHour * 60 + timeMinute;
    if (startMinutes < 8 * 60 || startMinutes > 18 * 60 || timeMinute % 15 !== 0) {
      setError('Please select a start time between 08:00 and 18:00 in 15-minute intervals');
      return;
    }

    if (!estimatedDurationValue) {
      setError('Please enter an estimated duration');
      return;
    }

    const durationValue = parseFloat(estimatedDurationValue);
    if (Number.isNaN(durationValue) || durationValue <= 0) {
      setError('Please enter a valid estimated duration');
      return;
    }

    if (!state.projectId) {
      setError('Missing project context. Please refresh and try again.');
      return;
    }

    const quoteEstimatedStartAt = new Date(`${estimatedStartDate}T${estimatedStartHour}:${estimatedStartMinute}`).toISOString();
    const quoteEstimatedDurationMinutes =
      estimatedDurationUnit === 'days'
        ? Math.round(durationValue * 24 * 60)
        : Math.round(durationValue * 60);

    const payload = {
      quoteAmount: numericAmount,
      quoteNotes: notes,
      quoteEstimatedStartAt,
      quoteEstimatedDurationMinutes,
      quoteEstimatedDurationUnit: estimatedDurationUnit,
    };

    const isRevisedQuote = state.actionKey === 'PREPARE_REVISED_QUOTE';
    const endpoint = isRevisedQuote
      ? `${API_BASE_URL}/projects/${state.projectId}/update-quote`
      : projectProfessionalId
        ? `${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote`
        : null;

    if (!endpoint) {
      setError('Missing assignment context. Please open the project details and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isRevisedQuote
            ? {
                ...payload,
                professionalId: state.userId,
              }
            : payload,
        ),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to submit quote');
      }

      onSubmitted?.();
      setShowSuccess(true);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to submit quote';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const successNextStep: WorkflowNextStep = {
    actionLabel: 'Check back for the client response',
    description: 'You will see updates in this project as soon as the client reviews your quote.',
    requiresAction: true,
  };

  const exceedsClientFinishDate = useMemo(() => {
    if (!requestedCompletionDeadline) return false;
    if (!estimatedStartDate || !estimatedStartHour || !estimatedStartMinute || !estimatedDurationValue) return false;

    const durationValue = Number(estimatedDurationValue);
    if (!Number.isFinite(durationValue) || durationValue <= 0) return false;

    const startAt = new Date(`${estimatedStartDate}T${estimatedStartHour}:${estimatedStartMinute}`);
    if (Number.isNaN(startAt.getTime())) return false;

    const durationMinutes = estimatedDurationUnit === 'days'
      ? Math.round(durationValue * 24 * 60)
      : Math.round(durationValue * 60);

    const projectedEndAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
    return projectedEndAt.getTime() > requestedCompletionDeadline.getTime();
  }, [
    estimatedDurationUnit,
    estimatedDurationValue,
    estimatedStartDate,
    estimatedStartHour,
    estimatedStartMinute,
    requestedCompletionDeadline,
  ]);

  if (showSuccess) {
    return (
      <WorkflowCompletionModal
        isOpen={isOpen}
        completedLabel="Your quote has gone to the client! Fingers crossed!"
        completedDescription="Nice work. Your quote is now in the client\'s queue for review."
        nextStep={successNextStep}
        primaryActionLabel="Open project"
        secondaryActionLabel="Later"
        showConfetti
        onNavigate={() => {
          if (state.projectDetailsPath) {
            router.push(state.projectDetailsPath);
            return;
          }
          if (state.projectId) {
            router.push(`/projects/${state.projectId}?tab=overview`);
          }
        }}
        onClose={handleClose}
      />
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all ${
        isOpen ? 'visible bg-black/60 backdrop-blur-sm' : 'invisible bg-black/0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-xl max-h-[80vh] [perspective:1600px]">
        {isLoading ? (
          <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex flex-col items-center justify-center px-6 py-14">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
              <p className="text-slate-300">Loading...</p>
            </div>
          </div>
        ) : (
          <div className="relative grid max-h-[80vh] [transform-style:preserve-3d] transition-transform duration-500 ease-out" style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div
              className="col-start-1 row-start-1 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]"
              aria-hidden={showDetails}
            >
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-blue-300/60 bg-blue-500/20 text-lg font-semibold text-blue-100 transition hover:bg-blue-500/35"
                  aria-label="Show details"
                >
                  i
                </button>
              )}

              <form onSubmit={handleSubmit} className="flex max-h-[80vh] flex-col">
                <div className="shrink-0 border-b border-slate-700 px-6 py-5">
                  <div className="flex items-start gap-4">
                    <img
                      src={imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                      alt="Quote"
                      className="h-14 w-14 rounded-full border border-white/20 object-cover"
                    />
                    <div>
                      <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>
                      {body ? <p className="mt-1 text-sm text-slate-200">{body}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-200">Quote amount (HKD)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      placeholder="e.g. 125000"
                      disabled={submitting}
                    />
                  </label>

                  {requestedCompletionBy ? (
                    <div className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-200">
                      Client requested completion by: <span className="font-semibold text-white">{requestedCompletionBy}</span>
                    </div>
                  ) : null}

                  {exceedsClientFinishDate ? (
                    <div className="rounded-lg border border-amber-500/60 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 animate-[pulse_0.7s_ease-in-out_3]">
                      Your project break the clients finish date.
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-200">Estimated start date</span>
                      <input
                        type="date"
                        value={estimatedStartDate}
                        onChange={(e) => setEstimatedStartDate(e.target.value)}
                        className="quote-picker-input w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                        disabled={submitting}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-200">Estimated start time</span>
                      <div className="flex items-center gap-2">
                        <select
                          value={estimatedStartHour}
                          onChange={(e) => setEstimatedStartHour(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                          disabled={submitting}
                        >
                          {Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0')).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="text-slate-300">:</span>
                        <select
                          value={estimatedStartMinute}
                          onChange={(e) => setEstimatedStartMinute(e.target.value)}
                          className="w-24 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                          disabled={submitting}
                        >
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                      </div>
                    </label>
                  </div>

                  <div className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-200">Duration</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={estimatedDurationValue}
                        onChange={(e) => setEstimatedDurationValue(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                        placeholder="e.g. 8"
                        disabled={submitting}
                      />
                      <div className="flex overflow-hidden rounded-lg border border-slate-600">
                        {(['hours', 'days'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setEstimatedDurationUnit(unit)}
                            disabled={submitting}
                            className={`px-4 py-2 text-sm font-semibold transition ${
                              estimatedDurationUnit === unit
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {unit.charAt(0).toUpperCase() + unit.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-200">Notes</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white outline-none focus:border-emerald-400"
                      placeholder="Optional details about materials, assumptions, or timing."
                      disabled={submitting}
                    />
                  </label>

                  {error ? (
                    <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-700 px-6 py-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                  >
                    {secondaryButtonLabel || 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="min-w-[140px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting...' : primaryButtonLabel}
                  </button>
                </div>
              </form>
            </div>

            <div
              className="col-start-1 row-start-1 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]"
              style={{ transform: 'rotateY(180deg)' }}
              aria-hidden={!showDetails}
            >
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-slate-500 bg-slate-800/80 text-lg font-semibold text-slate-100 transition hover:bg-slate-700"
                aria-label="Hide details"
              >
                x
              </button>

              <div className="flex-1 overflow-y-auto px-6 pb-6 pt-12 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
                <h3 className="mt-3 text-2xl font-bold text-emerald-300">{title || 'Step details'}</h3>
                <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
              </div>

              <div className="mt-auto border-t border-slate-700 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="w-full rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Back to quote form
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
