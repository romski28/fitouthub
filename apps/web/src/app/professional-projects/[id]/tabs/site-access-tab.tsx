'use client';

import React, { useMemo } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';

interface SiteAccessData {
  addressFull: string;
  unitNumber?: string;
  floorLevel?: string;
  postalCode?: string | null;
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

interface SiteAccessVisit {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'completed' | string;
  proposedAt: string;
  proposedByRole: 'professional' | 'client' | string;
  notes?: string | null;
  respondedAt?: string | null;
  responseNotes?: string | null;
  completedAt?: string | null;
}

interface SiteAccessTabProps {
  tab?: string;
  siteAccessStatus: SiteAccessStatus | null;
  siteAccessLoading: boolean;
  siteAccessError: string | null;
  siteVisits: SiteAccessVisit[];
  siteVisitLoading: boolean;
  siteVisitError: string | null;
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  onRequestSiteAccess: () => Promise<void>;
  siteAccessRequestDate: string;
  onUpdateSiteAccessRequestDate: (date: string) => void;
  siteAccessRequestTime: string;
  onUpdateSiteAccessRequestTime: (time: string) => void;
  onRequestSiteVisit: () => Promise<void>;
  onRespondSiteVisit: (visitId: string, status: 'accepted' | 'declined') => Promise<void>;
  onCompleteSiteVisit: (visitId: string) => Promise<void>;
  siteAccessActionLoading: boolean;
  siteVisitActionLoading: boolean;
  visitDate: string;
  onUpdateVisitDate: (date: string) => void;
  visitTime: string;
  onUpdateVisitTime: (time: string) => void;
  visitRequestNotes: string;
  onUpdateVisitRequestNotes: (notes: string) => void;
  visitNotes: string;
  onUpdateVisitNotes: (notes: string) => void;
  visitResponseNotes: Record<string, string>;
  onUpdateVisitResponseNotes: (updates: Record<string, string>) => void;
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
    timeZone: 'Asia/Hong_Kong',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatInspectionTime = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-HK', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatInspectionSlot = (scheduledAt?: string | null, scheduledFor?: string | null) => {
  if (scheduledAt) {
    return formatInspectionDateTime(scheduledAt);
  }
  if (scheduledFor) {
    return formatInspectionDate(scheduledFor);
  }
  return null;
};

const isRescheduleRequired = (note?: string | null) =>
  Boolean(note && note.includes('Site availability changed to'));

export const SiteAccessTab: React.FC<SiteAccessTabProps> = (props) => {
  const {
    siteAccessStatus,
    siteAccessLoading,
    siteAccessError,
    expandedAccordions,
    onToggleAccordion,
    onRequestSiteAccess,
    siteAccessRequestTime,
    onUpdateSiteAccessRequestTime,
    siteAccessActionLoading,
  } = props;

  const offeredInspectionDate = siteAccessStatus?.siteInspectionAvailableOn || '';
  const backendRescheduleRequired =
    siteAccessStatus?.rescheduleRequired === true ||
    siteAccessStatus?.requiresReschedule === true ||
    (siteAccessStatus?.requestStatus || '').toLowerCase().includes('reschedule') ||
    isRescheduleRequired(siteAccessStatus?.visitDetails);
  const bookedInspectionTimes = useMemo(
    () => new Set(siteAccessStatus?.bookedInspectionTimes || []),
    [siteAccessStatus?.bookedInspectionTimes],
  );
  const requestStatus = (siteAccessStatus?.requestStatus || 'none').toLowerCase();
  const isPending = requestStatus === 'pending';
  const hasApprovedAccess =
    siteAccessStatus?.hasAccess === true ||
    ['approved_no_visit', 'approved_visit_scheduled', 'visited'].includes(requestStatus);
  const isBooked =
    !backendRescheduleRequired &&
    hasApprovedAccess;
  const isNotAvailable = !offeredInspectionDate;
  const isNotRequested =
    !backendRescheduleRequired &&
    !isPending &&
    !isBooked &&
    (requestStatus === 'none' || requestStatus === 'denied' || !siteAccessStatus?.requestId);
  const scheduledInspectionSlot = formatInspectionSlot(
    siteAccessStatus?.visitScheduledAt,
    siteAccessStatus?.visitScheduledFor,
  );
  const showRequestPanel = isNotRequested || backendRescheduleRequired;
  const showPendingReadOnlyPanel = isPending;
  const canRequestSiteAccess = Boolean(offeredInspectionDate && siteAccessRequestTime);

  return (
    <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 shadow-sm">
      <AccordionGroup>
        {/* Site Access Status */}
        <AccordionItem
          id="site-access-status"
          title="Site Inspection"
          isOpen={expandedAccordions['site-access-status'] !== false}
          onToggle={() => onToggleAccordion('site-access-status')}
        >
          {siteAccessError && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200 mb-4">
              {siteAccessError}
            </div>
          )}

          {siteAccessLoading ? (
            <p className="text-sm text-slate-300">Loading site access status...</p>
          ) : !siteAccessStatus ? (
            <p className="text-sm text-slate-300">No site access data</p>
          ) : (
            <div className="space-y-3">
              {offeredInspectionDate && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                  Site inspection date available: <span className="font-semibold">{formatInspectionDate(offeredInspectionDate)}</span>
                </div>
              )}

              {showPendingReadOnlyPanel && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  Awaiting client approval
                  {siteAccessStatus.visitScheduledAt && (
                    <> at <span className="font-semibold text-amber-100">{formatInspectionTime(siteAccessStatus.visitScheduledAt)}</span>.</>
                  )}
                  {scheduledInspectionSlot && (
                    <span className="block mt-1 text-amber-100">Requested slot: {scheduledInspectionSlot}</span>
                  )}
                </div>
              )}

              {showPendingReadOnlyPanel && offeredInspectionDate && (
                <div className="space-y-2 rounded-md border border-slate-700 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">Selected inspection slot</p>
                  <p className="text-xs text-slate-300">Slot picker is read-only while the client reviews your request.</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-slate-200">
                      {formatInspectionDate(offeredInspectionDate)}
                    </span>
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-amber-100">
                      {siteAccessStatus.visitScheduledAt
                        ? new Date(siteAccessStatus.visitScheduledAt).toLocaleTimeString('en-HK', {
                            timeZone: 'Asia/Hong_Kong',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : 'Time submitted'}
                    </span>
                  </div>
                </div>
              )}

              {backendRescheduleRequired && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  The client requested a reschedule. Please select a new slot.
                </div>
              )}

              {isBooked && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                  Inspection booked
                  {siteAccessStatus.visitScheduledAt
                    ? ` at ${formatInspectionTime(siteAccessStatus.visitScheduledAt)}. Don't be late.`
                    : siteAccessStatus.visitScheduledFor
                    ? ` for ${formatInspectionDate(siteAccessStatus.visitScheduledFor)}`
                    : '.'}
                  {scheduledInspectionSlot && (
                    <span className="block mt-1 text-emerald-100">Confirmed slot: {scheduledInspectionSlot}</span>
                  )}
                </div>
              )}

              {hasApprovedAccess && !backendRescheduleRequired && siteAccessStatus.siteAccessData && (
                <div className="grid gap-3 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">SITE ADDRESS</p>
                    <p className="mt-2 font-medium text-white">
                      {[siteAccessStatus.siteAccessData.unitNumber, siteAccessStatus.siteAccessData.floorLevel]
                        .filter(Boolean)
                        .join('/')
                        .concat(
                          [siteAccessStatus.siteAccessData.unitNumber, siteAccessStatus.siteAccessData.floorLevel].some(Boolean)
                            ? ` ${siteAccessStatus.siteAccessData.addressFull}`
                            : siteAccessStatus.siteAccessData.addressFull,
                        )}
                    </p>
                    {siteAccessStatus.siteAccessData.postalCode?.trim() ? (
                      <p className="text-slate-300 mt-0.5">{siteAccessStatus.siteAccessData.postalCode.trim()}</p>
                    ) : null}
                  </div>
                  {siteAccessStatus.siteAccessData.accessDetails && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Access Details</p>
                      <p className="text-slate-200">{siteAccessStatus.siteAccessData.accessDetails}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Client or their representative will be on site for your visit.</p>
                </div>
              )}

              {showRequestPanel && (
                <div className="space-y-3 rounded-md border border-slate-700 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-white">Select inspection slot</p>
                  <p className="text-xs text-slate-300">
                    {offeredInspectionDate
                      ? 'Choose one available inspection slot on the client offered date. Times already selected by other professionals are disabled.'
                      : 'Client has not offered an inspection date yet.'}
                  </p>

                  {offeredInspectionDate ? (
                    <div className="space-y-3">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-slate-300">Inspection Date</p>
                        <div className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-white">
                          {formatInspectionDate(offeredInspectionDate)}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold text-slate-300">Choose an hourly time</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {INSPECTION_TIME_OPTIONS.map((timeOption) => {
                            const isBooked = bookedInspectionTimes.has(timeOption);
                            const isSelected = siteAccessRequestTime === timeOption;
                            return (
                              <button
                                key={timeOption}
                                type="button"
                                onClick={() => onUpdateSiteAccessRequestTime(timeOption)}
                                disabled={isBooked || siteAccessActionLoading || siteAccessStatus.requestStatus === 'pending'}
                                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                                  isSelected
                                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                                    : isBooked
                                    ? 'border-slate-700 bg-slate-900 text-slate-500'
                                    : 'border-slate-600 bg-slate-900 text-white hover:border-emerald-500 hover:text-emerald-100'
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
                    <div className="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
                      Waiting for client to offer a site inspection date.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onRequestSiteAccess}
                    disabled={siteAccessActionLoading || !canRequestSiteAccess}
                    title={!canRequestSiteAccess ? 'Choose a time to request inspection slot' : ''}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {siteAccessActionLoading ? 'Requesting...' : backendRescheduleRequired ? 'Request Reschedule' : 'Request Slot'}
                  </button>
                </div>
              )}

              {!isBooked && isNotAvailable && (
                <p className="text-xs text-slate-400">Inspection date not available yet.</p>
              )}
            </div>
          )}
        </AccordionItem>
      </AccordionGroup>
    </div>
  );
};
