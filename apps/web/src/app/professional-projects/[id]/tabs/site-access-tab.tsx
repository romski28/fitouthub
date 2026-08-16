'use client';

import React, { useMemo, useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { InspectSiteModal } from '@/components/next-steps/inspect-site-modal';

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
  formattedScheduledSlot?: string | null;
  visitDetails?: string | null;
  visitedAt: string | null;
  formattedVisitedAt?: string | null;
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
  projectId?: string;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-HK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Hong_Kong',
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
    projectId,
    siteAccessStatus,
    siteAccessLoading,
    siteAccessError,
    expandedAccordions,
    onToggleAccordion,
    siteAccessActionLoading,
  } = props;

  const [showInspectModal, setShowInspectModal] = useState(false);

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
  const isPending = requestStatus === 'pending' && !backendRescheduleRequired;
  const hasApprovedAccess =
    siteAccessStatus?.hasAccess === true ||
    ['approved_no_visit', 'approved_visit_scheduled', 'visited'].includes(requestStatus);
  const isBooked =
    !backendRescheduleRequired &&
    hasApprovedAccess;
  const isMissed = requestStatus === 'missed';
  const isSkipped = requestStatus === 'skipped';
  const isVisited = requestStatus === 'visited';
  const isNotAvailable = !offeredInspectionDate;
  const isNotRequested =
    !backendRescheduleRequired &&
    !isPending &&
    !isBooked &&
    !isSkipped &&
    !isMissed &&
    !isVisited &&
    (requestStatus === 'none' || requestStatus === 'denied' || !siteAccessStatus?.requestId);
  const scheduledInspectionSlot = formatInspectionSlot(
    siteAccessStatus?.visitScheduledAt,
    siteAccessStatus?.visitScheduledFor,
  );
  const showRequestPanel = isNotRequested || backendRescheduleRequired;
  // Hide the "Awaiting approval" panel when a reschedule is also required — the reschedule
  // panel + picker takes priority so the professional can select a new slot.
  const showPendingReadOnlyPanel = isPending && !backendRescheduleRequired;

  return (
    <div className="space-y-4 rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.06)]">
      <AccordionGroup>
        {/* Site Access Status */}
        <AccordionItem
          id="site-access-status"
          title="Site Inspection"
          isOpen={expandedAccordions['site-access-status'] !== false}
          onToggle={() => onToggleAccordion('site-access-status')}
        >
          {siteAccessError && (
            <div className="rounded-2xl border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-4">
              {siteAccessError}
            </div>
          )}

          {siteAccessLoading ? (
            <p className="text-sm text-slate-600">Loading site access status...</p>
          ) : !siteAccessStatus ? (
            <p className="text-sm text-slate-600">No site access data</p>
          ) : (
            <div className="space-y-3">
              {/* Single progressing status line */}
              <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-4 text-sm">
                {isVisited ? (
                  <p className="font-semibold text-emerald-700">
                    ✅ Site inspection completed
                    {siteAccessStatus.formattedVisitedAt && ` — ${siteAccessStatus.formattedVisitedAt}`}
                  </p>
                ) : backendRescheduleRequired ? (
                  <p className="font-semibold text-amber-700">
                    The client requested a reschedule. Please select a new slot.
                  </p>
                ) : isBooked ? (
                  <p className="font-semibold text-emerald-700">
                    ✅ Inspection booked
                    {scheduledInspectionSlot && ` — ${scheduledInspectionSlot}`}
                  </p>
                ) : isPending ? (
                  <p className="text-slate-700">
                    Awaiting client approval
                    {scheduledInspectionSlot && ` — ${scheduledInspectionSlot}`}
                  </p>
                ) : isMissed ? (
                  <p className="text-slate-600">
                    ⏰ Inspection missed — the site inspection date has passed and you did not book or skip a visit.
                  </p>
                ) : isSkipped ? (
                  <p className="text-slate-600">
                    ↩️ Site inspection skipped — you chose not to attend.
                  </p>
                ) : offeredInspectionDate ? (
                  <p className="font-semibold text-slate-900">
                    Site inspection — {formatInspectionDate(offeredInspectionDate)}
                  </p>
                ) : (
                  <p className="text-slate-600">No inspection date has been shared by the client yet.</p>
                )}
              </div>

              {/* Visit notes — surfaced only after completion */}
              {isVisited && siteAccessStatus.visitDetails && (
                <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] p-4 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Visit Notes</p>
                  <p className="mt-1 text-slate-800">{siteAccessStatus.visitDetails}</p>
                </div>
              )}

              {/* Manage / Book / Reschedule — opens the full modal */}
              <button
                type="button"
                onClick={() => setShowInspectModal(true)}
                className="rounded-lg bg-[rgba(126,58,33,0.92)] px-4 py-2 text-sm font-semibold text-white hover:bg-[rgba(100,45,26,0.96)] transition"
              >
                {backendRescheduleRequired
                  ? 'Reschedule inspection'
                  : isBooked || isVisited
                    ? 'Manage inspection'
                    : 'Book inspection'}
              </button>
            </div>
          )}
        </AccordionItem>
      </AccordionGroup>

      <InspectSiteModal
        isOpen={showInspectModal}
        onClose={() => setShowInspectModal(false)}
        projectId={projectId}
      />
    </div>
  );
};
