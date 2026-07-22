'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkDatePicker } from '@/components/work-date-picker';
import { toDateKey } from '@/lib/hk-holidays';
import toast from 'react-hot-toast';

interface RequestSiteAccessModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

interface SiteAccessData {
  addressFull: string;
  unitNumber?: string;
  floorLevel?: string;
  accessDetails?: string;
  onSiteContactName?: string;
  onSiteContactPhone?: string;
}

interface SiteAccessStatus {
  requestId: string | null;
  requestStatus: string;
  rescheduleRequired?: boolean | null;
  requiresReschedule?: boolean | null;
  visitScheduledFor: string | null;
  visitScheduledAt?: string | null;
  visitDetails?: string | null;
  visitedAt: string | null;
  reasonDenied: string | null;
  hasAccess: boolean;
  siteInspectionAvailableOn?: string | null;
  bookedInspectionTimes?: string[];
  siteAccessData: SiteAccessData | null;
}

function BookingProgressLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>Booking</span>
      <span className="inline-flex items-end" aria-hidden="true">
        <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>
          .
        </span>
        <span className="inline-block animate-bounce" style={{ animationDelay: '140ms' }}>
          .
        </span>
        <span className="inline-block animate-bounce" style={{ animationDelay: '280ms' }}>
          .
        </span>
      </span>
    </span>
  );
}

const INSPECTION_TIME_OPTIONS = Array.from({ length: 11 }, (_, index) => {
  const hour = 8 + index;
  return `${String(hour).padStart(2, '0')}:00`;
});

const formatInspectionDate = (value?: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-HK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const formatInspectionDateTime = (value?: string | null) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-HK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const isRescheduleRequired = (note?: string | null) =>
  Boolean(note && note.includes('Site availability changed to'));

export function RequestSiteAccessModal({
  isOpen,
  isLoading = false,
  onClose,
}: RequestSiteAccessModalProps) {
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();

  const [status, setStatus] = useState<SiteAccessStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteAccessRequestDate, setSiteAccessRequestDate] = useState('');
  const [siteAccessRequestTime, setSiteAccessRequestTime] = useState('');
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  const title = 'Book a site inspection slot';
  const primaryButtonLabel = 'Book inspection';

  const offeredInspectionDate = status?.siteInspectionAvailableOn || '';
  const bookedInspectionTimes = useMemo(
    () => new Set(status?.bookedInspectionTimes || []),
    [status?.bookedInspectionTimes],
  );

  const canRequestSiteAccess = Boolean(
    (offeredInspectionDate || siteAccessRequestDate) && siteAccessRequestTime,
  );

  const fetchStatus = useCallback(async () => {
    if (!isOpen || !accessToken || !state.projectId) return;

    setLoadingStatus(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${state.projectId}/site-access/status?_ts=${Date.now()}`,
        {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load site access status');
      }

      const data = (await response.json()) as SiteAccessStatus;
      setStatus(data);
      if (data.siteInspectionAvailableOn) {
        setSiteAccessRequestDate(data.siteInspectionAvailableOn);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load site access status';
      setError(message);
    } finally {
      setLoadingStatus(false);
    }
  }, [accessToken, isOpen, state.projectId]);

  useEffect(() => {
    if (!isOpen) {
      setStatus(null);
      setError(null);
      setSiteAccessRequestDate('');
      setSiteAccessRequestTime('');
      setActionLoading(false);
      return;
    }

    void fetchStatus();
  }, [fetchStatus, isOpen]);

  const handleSubmitRequest = async () => {
    if (!accessToken || !state.projectId) return;

    const requestedDate = status?.siteInspectionAvailableOn || siteAccessRequestDate;

    if (!requestedDate || !siteAccessRequestTime) {
      setError(
        status?.siteInspectionAvailableOn
          ? 'Please choose a preferred site access time.'
          : 'Please choose a preferred site access date and time.',
      );
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${state.projectId}/site-access/request`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            visitScheduledFor: requestedDate,
            visitScheduledAt: siteAccessRequestTime,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to request site access');
      }

      toast.custom(
        (t) => (
          <div
            className={`pointer-events-auto w-[300px] rounded-2xl border border-emerald-300/50 bg-gradient-to-br from-emerald-500/95 to-teal-500/95 p-4 text-white shadow-2xl backdrop-blur ${t.visible ? 'animate-enter' : 'animate-leave'}`}
          >
            <div className="flex items-center justify-center gap-2 text-lg">
              <span className="inline-block animate-bounce" style={{ animationDelay: '0ms' }}>✨</span>
              <span className="inline-block animate-bounce" style={{ animationDelay: '120ms' }}>🎉</span>
              <span className="inline-block animate-bounce" style={{ animationDelay: '240ms' }}>✨</span>
            </div>
            <div className="mt-2 text-center">
              <div className="text-5xl leading-none">
                <span className="inline-block animate-thumbs-wiggle">👍</span>
              </div>
              <p className="mt-2 text-sm font-semibold">Site visit booked!</p>
              <p className="text-xs text-emerald-50/90">Your request has been sent to the client.</p>
            </div>
          </div>
        ),
        { duration: 3200 },
      );

      await state.onCompleted?.({
        projectId: state.projectId,
        actionKey: state.actionKey,
      });

      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to request site access';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkipVisit = async () => {
    if (!accessToken || !state.projectId) return;
    setSkipLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${state.projectId}/site-access/skip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to skip site visit');
      toast.success('Site visit skipped. You can now submit your quote.');
      setShowSkipConfirm(false);
      onClose();
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    } finally {
      setSkipLoading(false);
    }
  };

  const rescheduleRequired =
    status?.rescheduleRequired === true ||
    status?.requiresReschedule === true ||
    isRescheduleRequired(status?.visitDetails);
  const requestPending = status?.requestStatus === 'pending' && !rescheduleRequired;
  const hasAccess = Boolean(status?.hasAccess);
  const canRequestNewVisit = !hasAccess || rescheduleRequired;
  const isBusy = isLoading || loadingStatus;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !actionLoading) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl backdrop-blur">
        <div className="border-b border-[rgba(120,53,15,0.12)] px-6 py-4">
          <h2 className="text-xl font-bold text-amber-800">{title}</h2>
        </div>

        <div className="next-step-scrollbar max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {isBusy ? (
            <p className="text-sm text-stone-500">Loading site access status...</p>
          ) : !status ? (
            <p className="text-sm text-stone-500">No site access data available.</p>
          ) : (
            <div className="space-y-3">
              {offeredInspectionDate ? (
                <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                  Client inspection date available:{' '}
                  <span className="font-semibold">
                    {formatInspectionDate(offeredInspectionDate)}
                  </span>
                </div>
              ) : null}

              {requestPending ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  Awaiting client approval.
                  {status.visitScheduledAt ? (
                    <span className="mt-1 block text-amber-600">
                      Requested visit: {formatInspectionDateTime(status.visitScheduledAt)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {status.requestStatus === 'denied' ? (
                <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Site access denied{status.reasonDenied ? `: ${status.reasonDenied}` : '.'}
                </div>
              ) : null}

              {status.requestStatus === 'approved_no_visit' ? (
                <div className={`rounded-md border px-3 py-2 text-sm ${rescheduleRequired ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                  {rescheduleRequired
                    ? 'Your previous visit slot was voided due to a client date change. Please choose a new slot.'
                    : 'Site access approved (no visit required).'}
                </div>
              ) : null}

              {status.requestStatus === 'approved_visit_scheduled' ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Visit approved
                  {status.visitScheduledAt
                    ? ` for ${formatInspectionDateTime(status.visitScheduledAt)}`
                    : status.visitScheduledFor
                    ? ` for ${formatInspectionDate(status.visitScheduledFor)}`
                    : '.'}
                </div>
              ) : null}

              {status.requestStatus === 'visited' ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Site visited
                  {status.visitedAt
                    ? ` on ${new Date(status.visitedAt).toLocaleDateString('en-HK')}`
                    : '.'}
                </div>
              ) : null}

              {canRequestNewVisit ? (
                <div className="space-y-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.55)] p-4">
                  <p className="text-sm font-semibold text-stone-800">Site inspection slot selector</p>
                  <p className="text-xs text-stone-600">
                    {offeredInspectionDate
                      ? 'Choose one available inspection slot on the client offered date. Times already selected by other professionals are disabled.'
                      : 'Propose a preferred date and time so the client can accept, update, or decline.'}
                  </p>

                  {offeredInspectionDate ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-stone-600">Inspection Date</p>
                        <div className="rounded-md border border-[rgba(120,53,15,0.18)] bg-white/70 px-3 py-2 text-sm text-stone-800">
                          {formatInspectionDate(offeredInspectionDate)}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-stone-600">Choose an hourly time</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                          {INSPECTION_TIME_OPTIONS.map((timeOption) => {
                            const isBooked = bookedInspectionTimes.has(timeOption);
                            const isSelected = siteAccessRequestTime === timeOption;
                            return (
                              <button
                                key={timeOption}
                                type="button"
                                onClick={() => setSiteAccessRequestTime(timeOption)}
                                disabled={
                                  isBooked || actionLoading || requestPending
                                }
                                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                  isSelected
                                    ? 'border-amber-500 bg-amber-100/60 text-amber-900'
                                    : isBooked
                                    ? 'border-[rgba(120,53,15,0.08)] bg-stone-200/50 text-stone-400'
                                    : 'border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.75)] text-stone-700 hover:border-amber-500 hover:text-amber-800'
                                }`}
                              >
                                {timeOption}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-stone-600">
                          Preferred Date
                        </label>
                        <WorkDatePicker
                          value={siteAccessRequestDate ? new Date(siteAccessRequestDate + 'T00:00:00') : null}
                          onChange={(d) => setSiteAccessRequestDate(toDateKey(d))}
                          minDate={new Date(new Date().setDate(new Date().getDate() + 1))}
                          weeks={2}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-stone-600">
                          Preferred Time
                        </label>
                        <input
                          type="time"
                          value={siteAccessRequestTime}
                          onChange={(e) => setSiteAccessRequestTime(e.target.value)}
                          className="w-full rounded-md border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-sm text-stone-800 focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[rgba(120,53,15,0.12)] px-6 py-4">
          <button
            type="button"
            onClick={handleSubmitRequest}
            disabled={
              actionLoading ||
              requestPending ||
              !canRequestNewVisit ||
              !canRequestSiteAccess ||
              isBusy
            }
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-50"
            title={
              !canRequestSiteAccess
                ? offeredInspectionDate
                  ? 'Choose a time to request site access'
                  : 'Choose both date and time to request site access'
                : ''
            }
          >
            {actionLoading ? <BookingProgressLabel /> : primaryButtonLabel}
          </button>
        </div>
      </div>

      {/* Skip confirmation modal */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowSkipConfirm(false); }}>
          <div className="w-full max-w-sm rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] p-6 shadow-2xl backdrop-blur">
            <p className="text-sm font-semibold text-stone-800 mb-2">Skip site visit?</p>
            <p className="text-sm text-stone-600 mb-5">
              Are you sure you do not need to visit the site? Your quote is final, regardless of your inspection or not.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                disabled={skipLoading}
                className="rounded-lg border border-[rgba(120,53,15,0.2)] px-4 py-2 text-sm font-medium text-stone-600 hover:bg-[rgba(245,238,219,0.9)] transition"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleSkipVisit}
                disabled={skipLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {skipLoading ? 'Skipping...' : 'Yes, skip visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
