'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

interface SiteAccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  respondedAt?: string;
  visitScheduledFor?: string | null;
  visitScheduledAt?: string | null;
  visitDetails?: string | null;
  reasonDenied?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
}

interface ClientSiteAddress {
  id: string;
  label: string | null;
  isProjectPrimary?: boolean;
  buildingName: string | null;
  addressFull: string;
  unitNumber: string | null;
  floorLevel: string | null;
  district: string | null;
  postalCode: string | null;
  propertyType: string | null;
  propertySize: string | null;
  propertyAge: string | null;
  existingConditions: string | null;
  accessHoursType: string | null;
  workingHoursWindow: string | null;
  accessDetails: string | null;
  onSiteContactName: string | null;
  onSiteContactPhone: string | null;
}

interface SiteAccessVisit {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'completed' | string;
  proposedAt: string;
  proposedByRole: 'professional' | 'client' | string;
  notes?: string | null;
  respondedAt?: string | null;
  responseNotes?: string | null;
  completedAt?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
  };
}

type SiteAccessResponsePatch = {
  status?: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
  visitScheduledFor?: string;
  visitScheduledAt?: string;
  reasonDenied?: string;
};

interface SiteAccessTabProps {
  siteAccessRequests: SiteAccessRequest[];
  siteVisits: SiteAccessVisit[];
  siteInspectionAvailableOn?: string | null;
  projectIsAwarded: boolean;
  surveyRequested: boolean;
  siteAccessBlockers: string[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  onRespondToRequest: (requestId: string, patch?: SiteAccessResponsePatch) => Promise<void>;
  onRespondToVisit: (visitId: string, status: 'accepted' | 'declined') => Promise<void>;
  siteAccessLoading: boolean;
  siteAccessError: string | null;
  siteVisitLoading: boolean;
  siteVisitError: string | null;
  submittingSiteAccess: string | null;
  submittingSiteVisit: string | null;
  siteAccessForms: Record<string, any>;
  onUpdateSiteAccessForm: (requestId: string, patch: any) => void;
  siteVisitResponseNotes: Record<string, string>;
  onUpdateSiteVisitResponseNotes: (visitId: string, notes: string) => void;
  clientSiteAddresses: ClientSiteAddress[];
  onSelectClientSiteAddress: (addressId: string) => void;
  locationDetailsForm: any;
  onUpdateLocationDetailsForm: (patch: any) => void;
  onSubmitLocationDetails: () => Promise<boolean>;
  onUpdateSiteAvailability: (date: string, reason: string) => Promise<void>;
  isSubmittingLocationDetails: boolean;
  isUpdatingSiteAvailability: boolean;
  locationDetailsError: string | null;
}

const formatDate = (date?: string) => {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Hong_Kong',
    }).format(new Date(date));
  } catch {
    return '-';
  }
};

const formatDateTime = (date?: string) => {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Hong_Kong',
    }).format(new Date(date));
  } catch {
    return '-';
  }
};

const formatBookedSlot = (date?: string | null) => {
  if (!date) return 'Site access booked';
  try {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return 'Site access booked';
    }

    const dateLabel = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'Asia/Hong_Kong',
    }).format(parsed);

    const timeLabel = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Hong_Kong',
    }).format(parsed);

    return `Site access booked for ${dateLabel} at ${timeLabel}`;
  } catch {
    return 'Site access booked';
  }
};

const isRescheduleRequired = (note?: string | null) =>
  Boolean(note && note.includes('Site availability changed to'));

const toDateInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toTimeInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const SiteAccessTab: React.FC<SiteAccessTabProps> = ({
  siteAccessRequests,
  siteVisits,
  siteInspectionAvailableOn,
  surveyRequested,
  siteAccessBlockers,
  onRespondToRequest,
  onRespondToVisit,
  siteVisitLoading,
  siteVisitError,
  submittingSiteAccess,
  submittingSiteVisit,
  clientSiteAddresses,
  onSelectClientSiteAddress,
  locationDetailsForm,
  onUpdateLocationDetailsForm,
  onSubmitLocationDetails,
  onUpdateSiteAvailability,
  isSubmittingLocationDetails,
  isUpdatingSiteAvailability,
  locationDetailsError,
}) => {
  const [acceptedVisitId, setAcceptedVisitId] = useState<string | null>(null);
  const [acceptedRequestId, setAcceptedRequestId] = useState<string | null>(null);
  const [changeAvailDate, setChangeAvailDate] = useState(locationDetailsForm.desiredStartDate || '');
  const [changeAvailReason, setChangeAvailReason] = useState('');
  const [showAvailabilityConfirm, setShowAvailabilityConfirm] = useState(false);

  useEffect(() => {
    setChangeAvailDate(siteInspectionAvailableOn || locationDetailsForm.desiredStartDate || '');
  }, [locationDetailsForm.desiredStartDate, siteInspectionAvailableOn]);

  const hasBasicLocation =
    Boolean(locationDetailsForm.addressFull?.trim()) &&
    Boolean(locationDetailsForm.unitNumber?.trim()) &&
    Boolean(locationDetailsForm.floorLevel?.trim()) &&
    Boolean(locationDetailsForm.district?.trim());

  const pendingVisits = useMemo(
    () => siteVisits.filter((v) => v.status === 'proposed' && v.proposedByRole === 'professional'),
    [siteVisits],
  );
  const acceptedVisits = useMemo(() => {
    return siteVisits
      .filter((v) => v.status === 'accepted')
      .slice()
      .sort((a, b) => {
        const aMs = new Date(a.proposedAt).getTime();
        const bMs = new Date(b.proposedAt).getTime();
        const safeA = Number.isNaN(aMs) ? Number.MAX_SAFE_INTEGER : aMs;
        const safeB = Number.isNaN(bMs) ? Number.MAX_SAFE_INTEGER : bMs;
        return safeA - safeB;
      });
  }, [siteVisits]);
  const otherVisits = useMemo(
    () => siteVisits.filter((v) => v.status !== 'proposed' && v.status !== 'accepted'),
    [siteVisits],
  );
  const professionalsWithPendingVisits = useMemo(
    () => new Set(pendingVisits.map((v) => v.professional.id)),
    [pendingVisits],
  );
  const professionalsWithAcceptedVisits = useMemo(
    () => new Set(acceptedVisits.map((v) => v.professional.id)),
    [acceptedVisits],
  );
  const latestAccessRequestsByProfessional = useMemo(() => {
    const byProfessional = new Map<string, SiteAccessRequest>();

    const toMillis = (value?: string | null) => {
      if (!value) return Number.NEGATIVE_INFINITY;
      const ms = new Date(value).getTime();
      return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
    };

    for (const request of siteAccessRequests) {
      const professionalId = request.professional.id;
      const existing = byProfessional.get(professionalId);
      if (!existing) {
        byProfessional.set(professionalId, request);
        continue;
      }

      const currentMs = toMillis(request.requestedAt);
      const existingMs = toMillis(existing.requestedAt);
      if (currentMs >= existingMs) {
        byProfessional.set(professionalId, request);
      }
    }

    return Array.from(byProfessional.values());
  }, [siteAccessRequests]);
  const professionalsWithLatestAccessRequest = useMemo(
    () => new Set(latestAccessRequestsByProfessional.map((request) => request.professional.id)),
    [latestAccessRequestsByProfessional],
  );

  const pendingAccessRequests = useMemo(() => {
    return latestAccessRequestsByProfessional.filter((request) => {
      const status = (request.status || '').toLowerCase();
      const isLikelyPending =
        !request.respondedAt &&
        (!status || status === 'requested' || status === 'pending' || status === 'awaiting_response');
      return (
        isLikelyPending &&
        !isRescheduleRequired(request.visitDetails) &&
        !professionalsWithPendingVisits.has(request.professional.id)
      );
    });
  }, [latestAccessRequestsByProfessional, professionalsWithPendingVisits]);
  const acceptedAccessRequests = useMemo(() => {
    const toRequestTime = (request: SiteAccessRequest) => {
      const source = request.visitScheduledAt || request.visitScheduledFor || request.requestedAt;
      const ms = source ? new Date(source).getTime() : Number.MAX_SAFE_INTEGER;
      return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
    };

    return latestAccessRequestsByProfessional.filter((request) => {
      const status = (request.status || '').toLowerCase();
      const isAccepted =
        !!request.respondedAt &&
        (status === 'approved_no_visit' || status === 'approved_visit_scheduled' || status === 'visited');
      const isReschedule = isRescheduleRequired(request.visitDetails);
      return (
        (isAccepted || isReschedule) &&
        !professionalsWithPendingVisits.has(request.professional.id) &&
        !professionalsWithAcceptedVisits.has(request.professional.id)
      );
    }).sort((a, b) => toRequestTime(a) - toRequestTime(b));
  }, [latestAccessRequestsByProfessional, professionalsWithPendingVisits, professionalsWithAcceptedVisits]);
  const skippedAccessRequests = useMemo(() => {
    return latestAccessRequestsByProfessional.filter((request) => {
      const status = (request.status || '').toLowerCase();
      return status === 'skipped' &&
        !professionalsWithPendingVisits.has(request.professional.id) &&
        !professionalsWithAcceptedVisits.has(request.professional.id);
    });
  }, [latestAccessRequestsByProfessional, professionalsWithPendingVisits, professionalsWithAcceptedVisits]);
  const visibleOtherVisits = useMemo(() => {
    return otherVisits.filter((visit) => {
      if (!isRescheduleRequired(visit.responseNotes)) {
        return true;
      }
      // If a newer access request exists for this professional, hide stale cancelled-reschedule visit rows.
      return !professionalsWithLatestAccessRequest.has(visit.professional.id);
    });
  }, [otherVisits, professionalsWithLatestAccessRequest]);
  const hasVisitOrRequestItems =
    visibleOtherVisits.length > 0 ||
    pendingVisits.length > 0 ||
    acceptedVisits.length > 0 ||
    pendingAccessRequests.length > 0 ||
    acceptedAccessRequests.length > 0;

  const siteAvailabilityDate = siteInspectionAvailableOn || locationDetailsForm.desiredStartDate;
  const currentAvailabilityInput =
    toDateInput(siteInspectionAvailableOn || null) || locationDetailsForm.desiredStartDate || '';
  const normalizedChangeAvailDate = toDateInput(changeAvailDate) || changeAvailDate;
  const isSameAvailabilityDate = normalizedChangeAvailDate === currentAvailabilityInput;
  const bookedProfessionalCount = new Set([
    ...acceptedVisits.map((visit) => visit.professional.id),
    ...pendingVisits.map((visit) => visit.professional.id),
    ...acceptedAccessRequests
      .filter((request) => Boolean(request.visitScheduledAt || request.visitScheduledFor))
      .map((request) => request.professional.id),
  ]).size;
  const notifyOnlyProfessionalCount = new Set([
    ...pendingAccessRequests.map((request) => request.professional.id),
    ...acceptedAccessRequests
      .filter((request) => !request.visitScheduledAt && !request.visitScheduledFor)
      .map((request) => request.professional.id),
  ]).size;

  return (
    <div className="space-y-6">

      {/* Site availability */}
      <div className="space-y-3 rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Site availability date</p>
          {siteAvailabilityDate ? (
            <p className="mt-1 text-base font-bold text-slate-900">{formatDate(siteAvailabilityDate)}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Not set yet.</p>
          )}
          <p className="mt-1 text-xs text-slate-600">Change date of site availability</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-800">New availability date</label>
            <input
              type="date"
              value={changeAvailDate}
              onChange={(e) => setChangeAvailDate(e.target.value)}
              className="quote-picker-input quote-picker-input-charcoal w-full rounded-xl border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[rgba(215,107,78,0.75)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-800">Reason for change</label>
            <input
              type="text"
              value={changeAvailReason}
              onChange={(e) => setChangeAvailReason(e.target.value)}
              placeholder="Briefly explain why the date needs to change"
              className="w-full rounded-xl border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[rgba(215,107,78,0.75)] focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={async () => {
              const trimmedDate = changeAvailDate.trim();
              const trimmedReason = changeAvailReason.trim();
              if (!trimmedDate) {
                toast.error('Please choose the new site inspection date');
                return;
              }
              if (!trimmedReason) {
                toast.error('Please enter a reason for the change');
                return;
              }
              const normalizedDate = toDateInput(trimmedDate) || trimmedDate;
              if (normalizedDate === currentAvailabilityInput) {
                toast.error('Please choose a different date');
                return;
              }

              setShowAvailabilityConfirm(true);
            }}
            disabled={
              isUpdatingSiteAvailability ||
              !changeAvailDate.trim() ||
              !changeAvailReason.trim() ||
              isSameAvailabilityDate
            }
            className="rounded-md bg-[rgba(215,107,78,0.95)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[rgba(176,74,46,0.98)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdatingSiteAvailability ? 'Sending...' : 'Send update'}
          </button>
        </div>
        <p className="rounded-md border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-3 py-2 text-xs text-[rgba(144,86,30,0.95)]">
          We recommend only changing your availability date if absolutely necessary. If you have already confirmed visits with any contractors, please contact them directly before making changes - it can cause unnecessary disruption to their schedules.
        </p>
      </div>

      {/* Error banners */}
      {siteVisitError && (
        <div className="rounded-md border border-[rgba(215,107,78,0.45)] bg-[rgba(255,240,232,0.92)] px-3 py-2 text-sm text-[rgba(176,74,46,0.95)]">
          {siteVisitError}
        </div>
      )}
      {locationDetailsError && (
        <div className="rounded-md border border-[rgba(215,107,78,0.45)] bg-[rgba(255,240,232,0.92)] px-3 py-2 text-sm text-[rgba(176,74,46,0.95)]">
          {locationDetailsError}
        </div>
      )}
      {siteAccessBlockers.length > 0 && (
        <div className="rounded-md border border-[rgba(215,107,78,0.35)] bg-[rgba(255,245,238,0.92)] px-3 py-2 text-sm text-[rgba(176,74,46,0.95)]">
          Complete required fields first: {siteAccessBlockers.join(', ')}
        </div>
      )}

      {/* Contractor visit / request list */}
      {siteVisitLoading ? (
        <p className="text-sm text-slate-600">Loading visit requests...</p>
      ) : !hasVisitOrRequestItems ? (
        <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] px-4 py-3 text-sm text-slate-600">
          No visit requests yet. Contractors will appear here once they request access.
        </div>
      ) : (
        <div className="space-y-3">

          {pendingVisits.map((visit) => {
            const name =
              visit.professional.fullName ||
              visit.professional.businessName ||
              visit.professional.email ||
              'Contractor';
            return (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">will visit at {formatDateTime(visit.proposedAt)}</p>
                </div>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Proposed
                </span>
              </div>
            );
          })}

          {pendingAccessRequests.map((request) => {
            const name =
              request.professional.fullName ||
              request.professional.businessName ||
              request.professional.email ||
              'Contractor';
            const proposedVisitLabel = request.visitScheduledAt
              ? `wants to visit ${formatDateTime(request.visitScheduledAt)}`
              : request.visitScheduledFor
              ? `wants to visit ${formatDate(request.visitScheduledFor)}`
              : `requested access`;
            return (
              <div
                key={`req-${request.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">{proposedVisitLabel}</p>
                </div>
                <span className="rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  Requested
                </span>
              </div>
            );
          })}

          {acceptedVisits.map((visit) => {
            const name =
              visit.professional.fullName ||
              visit.professional.businessName ||
              visit.professional.email ||
              'Contractor';
            return (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">{formatBookedSlot(visit.proposedAt)}</p>
                </div>
                <span className={`rounded-full bg-[rgba(215,107,78,0.92)] px-2.5 py-1 text-xs font-semibold text-white ${acceptedVisitId === visit.id ? 'animate-thumbs-wiggle' : ''}`}>
                  Booked
                </span>
              </div>
            );
          })}

          {acceptedAccessRequests.map((request) => {
            const name =
              request.professional.fullName ||
              request.professional.businessName ||
              request.professional.email ||
              'Contractor';
            const rescheduleRequired = isRescheduleRequired(request.visitDetails);
            const status = (request.status || '').toLowerCase();
            const isVisited = status === 'visited';
            const bookedLabel = rescheduleRequired
              ? `Reschedule required - new availability ${formatDate(siteAvailabilityDate)}`
              : request.visitScheduledAt
              ? formatBookedSlot(request.visitScheduledAt)
              : request.visitScheduledFor
              ? formatBookedSlot(request.visitScheduledFor)
              : 'Access approved';
            return (
              <div
                key={`approved-${request.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">{bookedLabel}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rescheduleRequired ? 'border border-amber-300 bg-amber-50 text-amber-700' : isVisited ? 'border border-slate-300 bg-slate-50 text-slate-600' : 'border border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                  {rescheduleRequired ? 'Reschedule' : isVisited ? 'Visited' : 'Approved'}
                </span>
              </div>
            );
          })}

          {visibleOtherVisits.map((visit) => {
            const name =
              visit.professional.fullName ||
              visit.professional.businessName ||
              visit.professional.email ||
              'Contractor';
            const rescheduleRequired = isRescheduleRequired(visit.responseNotes);
            return (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.72)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">
                    {rescheduleRequired
                      ? `Previous slot voided - new availability ${formatDate(siteAvailabilityDate)}`
                      : formatDateTime(visit.proposedAt)}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${rescheduleRequired ? 'border-[rgba(194,110,37,0.35)] bg-[rgba(255,239,218,0.85)] text-[rgba(144,86,30,0.95)]' : 'border-[rgba(120,53,15,0.22)] bg-[rgba(245,238,219,0.92)] text-slate-700 capitalize'}`}>
                  {rescheduleRequired ? 'Reschedule' : visit.status}
                </span>
              </div>
            );
          })}

          {skippedAccessRequests.map((request) => {
            const name =
              request.professional.fullName ||
              request.professional.businessName ||
              request.professional.email ||
              'Contractor';
            return (
              <div
                key={`skipped-${request.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.72)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-600">Skipped site inspection</p>
                </div>
                <span className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                  Skipped
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showAvailabilityConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(81,55,32,0.34)] px-4">
          <div className="w-full max-w-lg rounded-xl border border-[rgba(120,53,15,0.22)] bg-[rgba(255,250,240,0.98)] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Confirm site inspection date change</h3>
            <p className="mt-2 text-sm text-slate-700">
              Change site inspection date to <span className="font-semibold text-slate-900">{formatDate(changeAvailDate)}</span>?
            </p>
            <div className="mt-4 space-y-2 rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,245,238,0.92)] p-3 text-xs text-slate-700">
              <p>
                {bookedProfessionalCount > 0
                  ? `${bookedProfessionalCount} booked or proposed site visit slot(s) will be voided and professionals will be asked to rebook.`
                  : 'No booked site visits will be voided.'}
              </p>
              <p>
                {notifyOnlyProfessionalCount > 0
                  ? `${notifyOnlyProfessionalCount} additional professional(s) will be notified of the new availability date.`
                  : 'No additional professionals need a date-change notification.'}
              </p>
              <p>Reason: {changeAvailReason.trim()}</p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAvailabilityConfirm(false)}
                disabled={isUpdatingSiteAvailability}
                className="rounded-md border border-[rgba(120,53,15,0.2)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[rgba(245,238,219,0.8)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onUpdateSiteAvailability(changeAvailDate.trim(), changeAvailReason.trim());
                    setChangeAvailReason('');
                    setShowAvailabilityConfirm(false);
                  } catch {
                    // Error toast is handled by the page-level submit handler.
                  }
                }}
                disabled={isUpdatingSiteAvailability}
                className="rounded-md bg-[rgba(215,107,78,0.95)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[rgba(176,74,46,0.98)] disabled:opacity-50"
              >
                {isUpdatingSiteAvailability ? 'Sending...' : 'Update date and notify professionals'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

