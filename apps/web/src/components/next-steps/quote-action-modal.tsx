'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkflowCompletionModal, WorkflowNextStep } from '@/components/workflow-completion-modal';
import { WorkDatePicker } from '@/components/work-date-picker';
import { toDateKey } from '@/lib/hk-holidays';
import {
  buildQuoteBreakdownPayload,
  emptyQuoteBreakdownForm,
  getQuoteBreakdownFields,
  getQuoteBreakdownFormTotal,
  parseQuoteBreakdownForm,
  type QuoteBreakdownFormValues,
} from '@/lib/quote-breakdown';

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

const todayAtNine = () => {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return date;
};

const nextQuarterHour = () => {
  const date = new Date();
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;

  if (roundedMinutes >= 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date;
  }

  date.setMinutes(roundedMinutes, 0, 0);
  return date;
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

const isEmergencyStartDateAllowed = (value?: string | null) => {
  if (!value) return false;
  return getEmergencyDateOptions().some((option) => option.value === value);
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

const formatHKD = (value?: number | string): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  return `HK$${num.toLocaleString('en-HK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  const [breakdown, setBreakdown] = useState<QuoteBreakdownFormValues>(emptyQuoteBreakdownForm());
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
  const [siteInspectionAvailableOn, setSiteInspectionAvailableOn] = useState<string | null>(null);
  const [siteInspectionRawDate, setSiteInspectionRawDate] = useState<string | null>(null);
  const [hasEngagedSiteAccess, setHasEngagedSiteAccess] = useState(false);
  const [isEmergencyProject, setIsEmergencyProject] = useState(false);
  const [projectScale, setProjectScale] = useState<string | null>(null);
  const [platformFeePercent, setPlatformFeePercent] = useState<number | undefined>();
  const [platformFeeAmount, setPlatformFeeAmount] = useState<number | undefined>();
  const [grossAmount, setGrossAmount] = useState<number | undefined>();
  const [loadingFeePreview, setLoadingFeePreview] = useState(false);

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
      setBreakdown(emptyQuoteBreakdownForm());
      setRequestedCompletionBy(null);
      setRequestedCompletionDeadline(null);
      setSiteInspectionAvailableOn(null);
      setSiteInspectionRawDate(null);
      setHasEngagedSiteAccess(false);
      setIsEmergencyProject(false);
      setProjectScale(null);
      setPlatformFeePercent(undefined);
      setPlatformFeeAmount(undefined);
      setGrossAmount(undefined);
      setLoadingFeePreview(false);
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
        setBreakdown(parseQuoteBreakdownForm(detail?.quoteBreakdown, detail?.quoteBaseAmount || detail?.quoteAmount));
        const endDateRaw = detail?.project?.endDate || detail?.endDate || null;
        setRequestedCompletionBy(formatCompletionDate(endDateRaw));
        setRequestedCompletionDeadline(parseCompletionDeadline(endDateRaw));
        const inspectionDateRaw = detail?.project?.siteInspectionAvailableOn || detail?.siteInspectionAvailableOn || null;
        setSiteInspectionAvailableOn(formatCompletionDate(inspectionDateRaw));
        setSiteInspectionRawDate(inspectionDateRaw);
        setIsEmergencyProject(detail?.project?.isEmergency === true);
        setProjectScale(detail?.projectScale || detail?.project?.projectScale || null);
        if (!detail?.quoteEstimatedStartAt) {
          const defaultStart = detail?.project?.isEmergency === true ? nextQuarterHour() : tomorrowAtNine();
          setEstimatedStartDate(toDateInput(defaultStart));
          setEstimatedStartHour(String(defaultStart.getHours()).padStart(2, '0'));
          setEstimatedStartMinute(String(defaultStart.getMinutes()).padStart(2, '0'));
        }

        // Check whether this professional already has an active site access request
        if (inspectionDateRaw && state.projectId) {
          try {
            const accessRes = await fetch(
              `${API_BASE_URL}/projects/${state.projectId}/site-access/status?_ts=${Date.now()}`,
              {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${accessToken}` },
              },
            );
            if (accessRes.ok) {
              const accessData = await accessRes.json();
              const rescheduleRequired =
                accessData?.rescheduleRequired === true ||
                accessData?.requiresReschedule === true ||
                typeof accessData?.visitDetails === 'string' &&
                accessData.visitDetails.includes('Site availability changed to');
              const activeStatuses = ['pending', 'approved_no_visit', 'approved_visit_scheduled', 'visited', 'skipped'];
              setHasEngagedSiteAccess(
                activeStatuses.includes(accessData?.requestStatus) && !rescheduleRequired
              );
            }
          } catch {
            // Best-effort; don't block the quote flow
          }
        }
      } catch {
        // Keep this best-effort only; quote flow must remain available.
      }
    };

    void loadRequestedCompletionBy();
  }, [accessToken, isOpen, projectProfessionalId, state.projectId]);

  useEffect(() => {
    const amount = getQuoteBreakdownFormTotal(breakdown);

    if (!isOpen || !accessToken || !projectProfessionalId || amount <= 0) {
      setPlatformFeePercent(undefined);
      setPlatformFeeAmount(undefined);
      setGrossAmount(undefined);
      return;
    }

    // Debounce the preview call
    const timeoutId = setTimeout(async () => {
      setLoadingFeePreview(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote-preview`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ quoteAmount: amount }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          setPlatformFeePercent(data.platformFeePercent);
          setPlatformFeeAmount(data.platformFeeAmount);
          setGrossAmount(data.grossAmount);
        } else {
          // Silently fail; fee preview is best-effort
          setPlatformFeePercent(undefined);
          setPlatformFeeAmount(undefined);
          setGrossAmount(undefined);
        }
      } catch {
        // Silently fail; fee preview is best-effort
        setPlatformFeePercent(undefined);
        setPlatformFeeAmount(undefined);
        setGrossAmount(undefined);
      } finally {
        setLoadingFeePreview(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [accessToken, breakdown, isOpen, projectProfessionalId]);

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

    const numericAmount = getQuoteBreakdownFormTotal(breakdown);
    if (numericAmount <= 0) {
      setError('Please enter a valid quote breakdown');
      return;
    }

    if (!estimatedStartDate || !estimatedStartHour || !estimatedStartMinute) {
      setError('Please enter a start date and time');
      return;
    }

    if (isEmergencyProject && !isEmergencyStartDateAllowed(estimatedStartDate)) {
      setError('For emergency jobs, choose today or tomorrow for Be with you...');
      return;
    }

    const timeHour = Number(estimatedStartHour);
    const timeMinute = Number(estimatedStartMinute);
    const startMinutes = timeHour * 60 + timeMinute;
    if ((!isEmergencyProject && (startMinutes < 8 * 60 || startMinutes > 18 * 60)) || timeMinute % 15 !== 0) {
      setError(
        isEmergencyProject
          ? 'Please select a start time in 15-minute intervals'
          : 'Please select a start time between 08:00 and 18:00 in 15-minute intervals',
      );
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
    const quoteBreakdown = buildQuoteBreakdownPayload(breakdown, {
      isEmergency: isEmergencyProject,
      projectScale,
    });
    const payload = {
      quoteAmount: numericAmount,
      quoteBreakdown,
      quoteNotes: notes,
      quoteEstimatedStartAt,
      // API normalizes this value using the provided unit.
      quoteEstimatedDurationMinutes: durationValue,
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

    // Check if the start date alone is after the completion deadline
    if (estimatedStartDate) {
      const startOnly = new Date(`${estimatedStartDate}T00:00`);
      if (!Number.isNaN(startOnly.getTime()) && startOnly.getTime() > requestedCompletionDeadline.getTime()) {
        return true;
      }
    }

    // Check if projected end date exceeds the deadline
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

  const showSiteVisitCta = Boolean(siteInspectionRawDate) && !hasEngagedSiteAccess;
  const breakdownFields = getQuoteBreakdownFields(isEmergencyProject);
  const emergencyDateOptions = getEmergencyDateOptions();
  const hourOptions = isEmergencyProject
    ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
    : Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'));
  const enteredTotal = getQuoteBreakdownFormTotal(breakdown);

  if (showSuccess) {
    return (
      <WorkflowCompletionModal
        isOpen={isOpen}
        completedLabel="Your quote has gone to the client! Fingers crossed!"
        completedDescription="Nice work. Your quote is now in the client's queue for review."
        nextStep={successNextStep}
        primaryActionLabel="Open project"
        additionalActionLabel={showSiteVisitCta ? `📍 Book site visit (${siteInspectionAvailableOn})` : undefined}
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
        onAdditionalAction={showSiteVisitCta ? () => {
          const path = state.projectDetailsPath || (state.projectId ? `/professional-projects/${state.projectId}` : null);
          if (path) {
            const base = path.split('?')[0];
            router.push(`${base}?tab=site-access`);
          }
          onClose();
        } : undefined}
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
          <div className="overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl backdrop-blur">
            <div className="flex flex-col items-center justify-center px-6 py-14">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[rgba(120,53,15,0.15)] border-t-amber-600" />
              <p className="text-stone-600">Loading...</p>
            </div>
          </div>
        ) : (
          <div className="relative grid max-h-[80vh] [transform-style:preserve-3d] transition-transform duration-500 ease-out" style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div
              className="col-start-1 row-start-1 overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl backdrop-blur [backface-visibility:hidden]"
              aria-hidden={showDetails}
            >
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-[rgba(120,53,15,0.2)] bg-white text-lg font-semibold text-amber-700 transition hover:bg-amber-50"
                  aria-label="Show details"
                >
                  i
                </button>
              )}

              <form onSubmit={handleSubmit} className="flex max-h-[80vh] flex-col">
                <div className="shrink-0 border-b border-[rgba(120,53,15,0.12)] px-4 sm:px-6 py-5">
                  <div className="flex items-start gap-4">
                    <img
                      src={imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                      alt="Quote"
                      className="h-12 sm:h-14 w-12 sm:w-14 rounded-full border border-white/20 object-cover flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-2xl font-bold text-amber-800">{title}</h2>
                      {body ? <p className="mt-1 text-xs sm:text-sm text-stone-600">{body}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="next-step-scrollbar flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
                  <div className={`grid grid-cols-1 gap-4 ${breakdownFields.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                    {breakdownFields.map((field) => (
                      <label key={field.code} className="block">
                        <span className="mb-1 block text-sm font-semibold text-stone-700">{field.label}{field.required ? ' *' : ''}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={breakdown[field.key]}
                          onChange={(e) => setBreakdown((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                          placeholder="0.00"
                          disabled={submitting}
                          required={field.required}
                        />
                      </label>
                    ))}
                  </div>

                  {parseFloat(breakdown.otherItems || '0') > 0 && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700">Other items description</span>
                      <textarea
                        value={breakdown.otherItemsDescription}
                        onChange={(e) => setBreakdown((prev) => ({ ...prev, otherItemsDescription: e.target.value }))}
                        rows={2}
                        className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                        placeholder="e.g. Disposal of old fixtures, protective covers..."
                        disabled={submitting}
                      />
                    </label>
                  )}

                  <div className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.55)] px-3 py-2 text-xs text-stone-600">
                    <p>Your price (supplies + labour + other): {formatHKD(enteredTotal)}</p>
                  </div>

                  {siteInspectionAvailableOn ? (
                    <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                      Site inspection available: <span className="font-semibold text-sky-800">{siteInspectionAvailableOn}</span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No site inspection date set by client
                    </div>
                  )}

                  {requestedCompletionBy ? (
                    <div className={`rounded-lg border px-3 py-2 text-sm ${exceedsClientFinishDate ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.65)] text-stone-700'}`}>
                      Client requested completion by: <span className="font-semibold">{requestedCompletionBy}</span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700">{isEmergencyProject ? 'Be with you...' : 'I can start on'}</span>
                      {isEmergencyProject ? (
                        <div className="grid w-full grid-cols-2 overflow-hidden rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70">
                          {emergencyDateOptions.map((option) => {
                            const active = estimatedStartDate === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setEstimatedStartDate(option.value)}
                                className={`px-3 py-2 text-sm font-semibold transition ${
                                  active ? 'bg-amber-600 text-white' : 'bg-white/70 text-stone-600 hover:bg-[rgba(245,238,219,0.9)]'
                                }`}
                                disabled={submitting}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        (() => {
                          const deadlineWeeks = requestedCompletionDeadline
                            ? Math.max(2, Math.ceil((requestedCompletionDeadline.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
                            : 4;
                          return (
                        <WorkDatePicker
                          value={estimatedStartDate ? new Date(estimatedStartDate + 'T00:00:00') : null}
                          onChange={(d) => setEstimatedStartDate(toDateKey(d))}
                          isEmergency={false}
                          minDate={new Date()}
                          maxDate={requestedCompletionDeadline ?? undefined}
                          weeks={Math.min(deadlineWeeks, 4)}
                          className="w-full"
                        />
                          );
                        })()
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700">{isEmergencyProject ? 'at...' : 'Arriving at'}</span>
                      <div className="flex items-center gap-2">
                        <select
                          value={estimatedStartHour}
                          onChange={(e) => setEstimatedStartHour(e.target.value)}
                          className="flex-1 rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                          disabled={submitting}
                        >
                          {hourOptions.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="text-stone-500">:</span>
                        <select
                          value={estimatedStartMinute}
                          onChange={(e) => setEstimatedStartMinute(e.target.value)}
                          className="w-24 rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                          disabled={submitting}
                        >
                          <option value="00">00</option>
                          <option value="30">30</option>
                        </select>
                      </div>
                    </label>
                  </div>

                  <div className="block">
                    <span className="mb-1 block text-sm font-semibold text-stone-700">Duration</span>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={estimatedDurationValue}
                        onChange={(e) => setEstimatedDurationValue(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                        placeholder="e.g. 8"
                        disabled={submitting}
                      />
                      <div className="grid w-full grid-cols-2 overflow-hidden rounded-lg border border-[rgba(120,53,15,0.22)]">
                        {(['hours', 'days'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setEstimatedDurationUnit(unit)}
                            disabled={submitting}
                            className={`w-full px-3 py-2 text-sm font-semibold transition ${
                              estimatedDurationUnit === unit
                                ? 'bg-amber-600 text-white'
                                : 'bg-white/70 text-stone-500 hover:bg-[rgba(245,238,219,0.9)]'
                            }`}
                          >
                            {unit.charAt(0).toUpperCase() + unit.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-stone-700">Notes</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                      placeholder="Optional details about materials, assumptions, or timing."
                      disabled={submitting}
                    />
                  </label>

                  {error ? (
                    <div className="rounded-lg border border-rose-400 bg-rose-500 px-3 py-2 text-sm text-white">
                      {error}
                    </div>
                  ) : null}
                </div>

                  <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-3 border-t border-[rgba(120,53,15,0.12)] px-4 sm:px-6 py-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="min-w-fit rounded-lg border border-[rgba(120,53,15,0.2)] px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-stone-700 transition hover:bg-[rgba(245,238,219,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={submitting}
                    >
                      {secondaryButtonLabel || 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      className="min-w-fit rounded-lg bg-emerald-600 px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting...' : primaryButtonLabel}
                    </button>
                </div>
              </form>
            </div>

            <div
              className="col-start-1 row-start-1 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl backdrop-blur [backface-visibility:hidden]"
              style={{ transform: 'rotateY(180deg)' }}
              aria-hidden={!showDetails}
            >
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-[rgba(120,53,15,0.2)] bg-white text-lg font-semibold text-amber-700 transition hover:bg-amber-50"
                aria-label="Hide details"
              >
                x
              </button>

              <div className="next-step-scrollbar flex-1 overflow-y-auto px-6 pb-6 pt-12 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
                <h3 className="mt-3 text-2xl font-bold text-emerald-300">{title || 'Step details'}</h3>
                <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
              </div>

              <div className="mt-auto border-t border-[rgba(120,53,15,0.12)] px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="w-full rounded-lg border border-[rgba(120,53,15,0.2)] px-4 py-2 text-base font-semibold text-stone-700 transition hover:bg-[rgba(245,238,219,0.9)]"
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
