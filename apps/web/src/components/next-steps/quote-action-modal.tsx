'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkDatePicker } from '@/components/work-date-picker';
import { toDateKey } from '@/lib/hk-holidays';
import confetti from 'canvas-confetti';
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
  projectId?: string;
  projectProfessionalId?: string;
  readOnly?: boolean;
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

interface TradeLine {
  labour: string;
  supplies: string;
  other: string;
  otherNotes: string;
}

const EMPTY_TRADE_LINE: TradeLine = { labour: '', supplies: '', other: '', otherNotes: '' };

const tradeLineTotal = (line?: TradeLine): number => {
  if (!line) return 0;
  return (
    (parseFloat(line.labour) || 0) +
    (parseFloat(line.supplies) || 0) +
    (parseFloat(line.other) || 0)
  );
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
  projectId: projectIdProp,
  projectProfessionalId: projectProfessionalIdProp,
  readOnly = false,
}: QuoteActionModalProps) {
  const router = useRouter();
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();
  const projectId = projectIdProp || state.projectId;
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
  const [quoteScope, setQuoteScope] = useState<{
    tradesRequired: string[];
    selfTrades: string[];
    additionalTrades: string[];
  } | null>(null);
  const [selectedAdditional, setSelectedAdditional] = useState<Record<string, boolean>>({});
  const [tradeLines, setTradeLines] = useState<Record<string, TradeLine>>({});
  const [existingPlan, setExistingPlan] = useState<any[]>([]);
  const [pricingMode, setPricingMode] = useState<'per-trade' | 'lump'>('per-trade');

  const projectProfessionalId = useMemo(
    () => projectProfessionalIdProp || inferProjectProfessionalId(state.projectDetailsPath),
    [projectProfessionalIdProp, state.projectDetailsPath],
  );

  const modalContent = state.modalContent || {};
  const {
    title = readOnly ? 'Your quote' : 'Submit your quote',
    body = readOnly
      ? 'Your accepted quote details are shown below. To change the start date, use the Schedule tab. To add out-of-scope work, use Request additional works payment.'
      : undefined,
    detailsBody,
    imageUrl,
    primaryButtonLabel = readOnly ? 'Close' : 'Submit quote',
    secondaryButtonLabel = 'Cancel',
  } = modalContent;
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
      setQuoteScope(null);
      setSelectedAdditional({});
      setTradeLines({});
      setExistingPlan([]);
      setPricingMode('per-trade');
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
        if (detail?.quotePricingMode === 'per-trade' || detail?.quotePricingMode === 'lump') {
          setPricingMode(detail.quotePricingMode);
        } else {
          const lumpItems = (detail?.quoteBreakdown as any)?.baseItems || (detail?.quoteBreakdown as any)?.items;
          const hasExistingPerTrade = Array.isArray(detail?.subcontracting) && (detail?.subcontracting as any[]).length > 0;
          if (hasExistingPerTrade) {
            setPricingMode('per-trade');
          } else if (Array.isArray(lumpItems) && lumpItems.length > 0) {
            setPricingMode('lump');
          }
        }
        const endDateRaw = detail?.project?.endDate || detail?.endDate || null;
        setRequestedCompletionBy(formatCompletionDate(endDateRaw));
        setRequestedCompletionDeadline(parseCompletionDeadline(endDateRaw));
        const inspectionDateRaw = detail?.project?.siteInspectionAvailableOn || detail?.siteInspectionAvailableOn || null;
        setSiteInspectionAvailableOn(formatCompletionDate(inspectionDateRaw));
        setSiteInspectionRawDate(inspectionDateRaw);
        setIsEmergencyProject(detail?.project?.isEmergency === true);
        setProjectScale(detail?.projectScale || detail?.project?.projectScale || null);
        if (detail?.quoteEstimatedStartAt) {
          const existingStart = new Date(detail.quoteEstimatedStartAt);
          if (!Number.isNaN(existingStart.getTime())) {
            setEstimatedStartDate(toDateInput(existingStart));
            setEstimatedStartHour(String(existingStart.getHours()).padStart(2, '0'));
            setEstimatedStartMinute(String(existingStart.getMinutes()).padStart(2, '0'));
          }
        } else {
          const defaultStart = detail?.project?.isEmergency === true ? nextQuarterHour() : tomorrowAtNine();
          setEstimatedStartDate(toDateInput(defaultStart));
          setEstimatedStartHour(String(defaultStart.getHours()).padStart(2, '0'));
          setEstimatedStartMinute(String(defaultStart.getMinutes()).padStart(2, '0'));
        }
        if (detail?.quoteEstimatedDurationMinutes) {
          if (detail.quoteEstimatedDurationUnit === 'days') {
            setEstimatedDurationValue(String(detail.quoteEstimatedDurationMinutes / (8 * 60)));
            setEstimatedDurationUnit('days');
          } else {
            setEstimatedDurationValue(String(detail.quoteEstimatedDurationMinutes / 60));
            setEstimatedDurationUnit('hours');
          }
        }
        if (typeof detail?.quoteNotes === 'string') {
          setNotes(detail.quoteNotes);
        }

        // Check whether this professional already has an active site access request
        if (inspectionDateRaw && projectId) {
          try {
            const accessRes = await fetch(
              `${API_BASE_URL}/projects/${projectId}/site-access/status?_ts=${Date.now()}`,
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
  }, [accessToken, isOpen, projectProfessionalId, projectId]);

  useEffect(() => {
    if (!isOpen || !accessToken || !projectProfessionalId) return;

    fetch(`${API_BASE_URL}/professional/projects/${projectProfessionalId}/quote-scope`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setQuoteScope({
          tradesRequired: data.tradesRequired || [],
          selfTrades: data.selfTrades || [],
          additionalTrades: data.additionalTrades || [],
        });
        // Pre-fill from any existing team plan so "team first, quote later" carries through.
        const plan = Array.isArray(data.subcontracting) ? data.subcontracting : [];
        const initialLines: Record<string, TradeLine> = {};
        const initialSelected: Record<string, boolean> = {};
        (data.tradesRequired || []).forEach((t: string) => {
          const entry = plan.find((e: any) => e && e.trade === t);
          if (entry && entry.labour != null) {
            initialLines[t] = {
              labour: String(entry.labour),
              supplies: entry.supplies != null ? String(entry.supplies) : '',
              other: entry.other != null ? String(entry.other) : '',
              otherNotes: entry.otherNotes ? String(entry.otherNotes) : '',
            };
          } else if (entry && entry.amount != null) {
            // Legacy single-amount plan entries map onto labour.
            initialLines[t] = {
              labour: String(entry.amount),
              supplies: '',
              other: '',
              otherNotes: '',
            };
          }
          const isSelf = (data.selfTrades || []).includes(t);
          // Any non-self trade already in the plan is covered, whatever its kind.
          if (!isSelf && entry) initialSelected[t] = true;
        });
        setTradeLines(initialLines);
        setSelectedAdditional(initialSelected);
        setExistingPlan(plan);
      })
      .catch(() => {
        /* best-effort */
      });
  }, [isOpen, accessToken, projectProfessionalId]);

  const hasTradeScope = Boolean(quoteScope && (quoteScope.tradesRequired || []).length > 0);
  const tradePanelActive = pricingMode === 'per-trade' && hasTradeScope;

  // Build the per-trade plan from the current form, preserving team assignments
  // (kind / assignee) already stored on the project so quote submission never wipes them.
  function buildPlanFromForm() {
    if (!quoteScope) return [];
    const selfTrades = quoteScope.selfTrades || [];
    const tradesRequired = quoteScope.tradesRequired || [];
    const covered = tradesRequired.filter(
      (trade) => selfTrades.includes(trade) || selectedAdditional[trade] === true,
    );
    return covered.map((trade) => {
      const line = tradeLines[trade] || EMPTY_TRADE_LINE;
      const amount = tradeLineTotal(line);
      const existing = existingPlan.find((e: any) => e && e.trade === trade);
      const isSelf = selfTrades.includes(trade);
      const base: any = {
        trade,
        labour: parseFloat(line.labour) || 0,
        supplies: parseFloat(line.supplies) || 0,
        other: parseFloat(line.other) || 0,
        otherNotes: line.otherNotes || null,
        amount,
      };
      if (existing) {
        return {
          ...base,
          kind: existing.kind || (isSelf ? 'self' : 'tbc'),
          contactId: existing.contactId ?? null,
          professionalId: existing.professionalId ?? null,
          b2bCost: existing.b2bCost ?? null,
          multiplier: existing.multiplier ?? null,
          status: existing.status || (isSelf ? 'defined' : 'tbc'),
          name: existing.name ?? null,
        };
      }
      return {
        ...base,
        kind: isSelf ? 'self' : 'tbc',
        status: isSelf ? 'defined' : 'tbc',
      };
    });
  }

  useEffect(() => {
    const subcontracting = tradePanelActive ? buildPlanFromForm() : undefined;
    const amount = tradePanelActive
      ? (subcontracting || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
      : getQuoteBreakdownFormTotal(breakdown);

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
            body: JSON.stringify({ quoteAmount: amount, subcontracting }),
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
  }, [accessToken, breakdown, isOpen, projectProfessionalId, quoteScope, tradeLines, selectedAdditional, existingPlan, tradePanelActive]);

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

    const tradePlanActive = tradePanelActive;
    const subcontracting = tradePlanActive ? buildPlanFromForm() : undefined;
    let numericAmount = getQuoteBreakdownFormTotal(breakdown);
    if (tradePlanActive) {
      numericAmount = (subcontracting || []).reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0),
        0,
      );
    }
    if (numericAmount <= 0) {
      setError(
        tradePlanActive
          ? 'Please enter a price for the trades you are covering'
          : 'Please enter a valid quote breakdown',
      );
      return;
    }

    if (tradePlanActive) {
      const missingNarrative = (subcontracting || []).find(
        (s: any) => (Number(s.other) || 0) > 0 && !(s.otherNotes || '').trim(),
      );
      if (missingNarrative) {
        setError(`Please add a description for the "Other" amount on ${missingNarrative.trade}.`);
        return;
      }
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

    const durationValue = parseFloat(estimatedDurationValue);

    if (!projectId) {
      setError('Missing project context. Please refresh and try again.');
      return;
    }

    const quoteEstimatedStartAt = new Date(`${estimatedStartDate}T${estimatedStartHour}:${estimatedStartMinute}`).toISOString();
    const quoteBreakdown = tradePlanActive
      ? undefined
      : buildQuoteBreakdownPayload(breakdown, {
          isEmergency: isEmergencyProject,
          projectScale,
        });
    const payload: any = {
      quoteAmount: numericAmount,
      quoteNotes: notes,
      quoteEstimatedStartAt,
      // API normalizes this value using the provided unit.
      quoteEstimatedDurationMinutes: durationValue,
      quoteEstimatedDurationUnit: estimatedDurationUnit,
    };
    if (tradePlanActive) {
      payload.quotedTrades = (subcontracting || []).map((s: any) => s.trade);
      payload.subcontracting = subcontracting;
    } else {
      payload.quoteBreakdown = quoteBreakdown;
    }

    const isRevisedQuote = state.actionKey === 'PREPARE_REVISED_QUOTE';
    const endpoint = isRevisedQuote
      ? `${API_BASE_URL}/projects/${projectId}/update-quote`
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
  const tradePanelTotal = tradePanelActive
    ? (buildPlanFromForm() || []).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0)
    : 0;
  const enteredTotal = tradePanelActive ? tradePanelTotal : getQuoteBreakdownFormTotal(breakdown);

  if (showSuccess) {
    return <ProQuoteSuccessModal isOpen={isOpen} onClose={handleClose} />;
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
                  {hasTradeScope && (
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-[rgba(120,53,15,0.16)] bg-white/60 p-1">
                      <button
                        type="button"
                        onClick={() => setPricingMode('per-trade')}
                        disabled={submitting || readOnly}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${pricingMode === 'per-trade' ? 'bg-emerald-600 text-[#F5EEDE]' : 'text-stone-600 hover:bg-[rgba(245,238,219,0.9)]'}`}
                      >
                        Price each trade
                      </button>
                      <button
                        type="button"
                        onClick={() => setPricingMode('lump')}
                        disabled={submitting || readOnly}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${pricingMode === 'lump' ? 'bg-emerald-600 text-[#F5EEDE]' : 'text-stone-600 hover:bg-[rgba(245,238,219,0.9)]'}`}
                      >
                        Single lump sum
                      </button>
                    </div>
                  )}
                  {tradePanelActive && quoteScope ? (
                    <div className="space-y-3">
                      {quoteScope.additionalTrades.length > 0 && (
                        <div className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.55)] px-3 py-2 text-xs text-stone-600">
                          This project needs trades beyond your own. Tick the additional trades you want to cover and price each trade.
                        </div>
                      )}
                      {quoteScope.tradesRequired.map((trade) => {
                        const isSelf = quoteScope.selfTrades.includes(trade);
                        const isSelected = isSelf || selectedAdditional[trade] === true;
                        const line = tradeLines[trade] || EMPTY_TRADE_LINE;
                        const setLine = (patch: Partial<TradeLine>) =>
                          setTradeLines((prev) => ({
                            ...prev,
                            [trade]: { ...EMPTY_TRADE_LINE, ...(prev[trade] || {}), ...patch },
                          }));
                        return (
                          <div
                            key={trade}
                            className={`rounded-lg border px-3 py-2 ${
                              isSelected
                                ? 'border-emerald-300 bg-emerald-50/50'
                                : 'border-[rgba(120,53,15,0.16)] bg-white/60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isSelf || submitting || readOnly}
                                onChange={(e) =>
                                  setSelectedAdditional((prev) => ({ ...prev, [trade]: e.target.checked }))
                                }
                                className="h-4 w-4 accent-emerald-600"
                              />
                              <span className="flex-1 text-sm font-semibold text-stone-700">
                                {trade}
                                {isSelf ? (
                                  <span className="ml-1 text-xs font-normal text-emerald-700">(your trade)</span>
                                ) : null}
                              </span>
                              {isSelected ? (
                                <span className="text-sm font-semibold text-stone-700">
                                  {formatHKD(tradeLineTotal(line))}
                                </span>
                              ) : null}
                            </div>
                            {isSelected ? (
                              <div className="mt-2 grid grid-cols-3 gap-2">
                                <label className="block">
                                  <span className="mb-1 block text-[10px] font-medium text-stone-500">Labour</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={line.labour}
                                    onChange={(e) => setLine({ labour: e.target.value })}
                                    className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-2 py-1 text-right text-stone-800 outline-none focus:border-amber-500"
                                    disabled={submitting || readOnly}
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[10px] font-medium text-stone-500">Hardware</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={line.supplies}
                                    onChange={(e) => setLine({ supplies: e.target.value })}
                                    className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-2 py-1 text-right text-stone-800 outline-none focus:border-amber-500"
                                    disabled={submitting || readOnly}
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[10px] font-medium text-stone-500">Other</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={line.other}
                                    onChange={(e) => setLine({ other: e.target.value })}
                                    className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-2 py-1 text-right text-stone-800 outline-none focus:border-amber-500"
                                    disabled={submitting || readOnly}
                                  />
                                </label>
                              </div>
                            ) : null}
                            {isSelected && (parseFloat(line.other) || 0) > 0 ? (
                              <div className="mt-2">
                                <span className="mb-1 block text-[10px] font-medium text-stone-500">
                                  Other description <span className="text-amber-700">(required when Other has a value)</span>
                                </span>
                                <textarea
                                  value={line.otherNotes}
                                  onChange={(e) => setLine({ otherNotes: e.target.value })}
                                  rows={2}
                                  placeholder="e.g. skip hire, disposal, permits…"
                                  className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-2 py-1 text-sm text-stone-800 outline-none focus:border-amber-500"
                                  disabled={submitting || readOnly}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      <div className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.55)] px-3 py-2 text-xs text-stone-600">
                        <p>Your price (all covered trades): {formatHKD(enteredTotal)}</p>
                        {quoteScope.additionalTrades.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-stone-500">
                            You can add your team for the additional trades after submitting — the price is locked once submitted.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
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
                              disabled={submitting || readOnly}
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
                            disabled={submitting || readOnly}
                          />
                        </label>
                      )}

                      <div className="rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(245,238,219,0.55)] px-3 py-2 text-xs text-stone-600">
                        <p>Your price (supplies + labour + other): {formatHKD(enteredTotal)}</p>
                      </div>
                    </>
                  )}

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
                    <label className="block md:col-span-2">
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
                                disabled={submitting || readOnly}
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
                        <div className={readOnly ? 'pointer-events-none opacity-70' : undefined}>
                        <WorkDatePicker
                          value={estimatedStartDate ? new Date(estimatedStartDate + 'T00:00:00') : null}
                          onChange={(d) => setEstimatedStartDate(toDateKey(d))}
                          isEmergency={false}
                          minDate={new Date()}
                          maxDate={requestedCompletionDeadline ?? undefined}
                          weeks={Math.min(deadlineWeeks, 4)}
                          fullWidth
                          headerPrefix="I can start on "
                        />
                        </div>
                          );
                        })()
                      )}
                    </label>

                  </div>
                  {/* Time + Duration: 4 items across on desktop, 2×2 on mobile */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700">{isEmergencyProject ? 'at...' : 'Arriving at'}</span>
                      <select
                        value={estimatedStartHour}
                        onChange={(e) => setEstimatedStartHour(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                        disabled={submitting || readOnly}
                      >
                        {hourOptions.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700 invisible">{isEmergencyProject ? 'at...' : 'Arriving at'}</span>
                      <select
                        value={estimatedStartMinute}
                        onChange={(e) => setEstimatedStartMinute(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                        disabled={submitting || readOnly}
                      >
                        <option value="00">00</option>
                        <option value="30">30</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700">Duration</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={estimatedDurationValue}
                        onChange={(e) => setEstimatedDurationValue(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                        placeholder="8"
                        disabled={submitting || readOnly}
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-stone-700 invisible">Duration</span>
                      <div className="flex overflow-hidden rounded-lg border border-[rgba(120,53,15,0.22)]">
                        {(['hours', 'days'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setEstimatedDurationUnit(unit)}
                            disabled={submitting || readOnly}
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
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-stone-700">Notes</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-stone-800 outline-none focus:border-amber-500"
                      placeholder="Optional details about materials, assumptions, or timing."
                      disabled={submitting || readOnly}
                    />
                  </label>

                  {error ? (
                    <div className="rounded-lg border border-rose-400 bg-rose-500 px-3 py-2 text-sm text-white">
                      {error}
                    </div>
                  ) : null}
                </div>

                  <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-3 border-t border-[rgba(120,53,15,0.12)] px-4 sm:px-6 py-4">
                    {readOnly ? (
                      <button
                        type="button"
                        onClick={handleClose}
                        className="min-w-fit rounded-lg bg-emerald-600 px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Close
                      </button>
                    ) : (
                      <>
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
                      </>
                    )}
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
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">More information</p>
                <h3 className="mt-3 text-2xl font-bold text-[#FF7F50]">{title || 'Step details'}</h3>
                <p className="mt-5 text-sm leading-relaxed text-slate-600">{detailsBody}</p>
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

// ── Pro Quote Success Modal ──────────────────────────────────────────────

function ProQuoteSuccessModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!isOpen || hasFiredRef.current) return;
    hasFiredRef.current = true;
    confetti({ particleCount: 110, spread: 80, origin: { y: 0.65 } });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOk = () => {
    onClose();
    router.push('/professional-projects');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quote submitted"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
        {/* Success header */}
        <div className="flex items-start gap-3 rounded-t-2xl bg-emerald-100/80 border-b border-emerald-200 px-5 py-4">
          <span className="mt-0.5 text-xl">✅</span>
          <div>
            <p className="text-base font-bold text-emerald-800">
              Your quote has gone to the client! Fingers crossed!
            </p>
          </div>
        </div>

        {/* Single full-width OK button */}
        <div className="px-5 py-4">
          <button
            type="button"
            onClick={handleOk}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
