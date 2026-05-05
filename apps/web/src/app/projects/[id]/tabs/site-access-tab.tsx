'use client';

import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

interface SiteAccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  respondedAt?: string;
  visitScheduledFor?: string | null;
  visitScheduledAt?: string | null;
  reasonDenied?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
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

interface SiteAccessData {
  addressFull: string;
  unitNumber?: string;
  floorLevel?: string;
  accessDetails?: string;
  onSiteContactName?: string;
  onSiteContactPhone?: string;
}

type SiteAccessResponsePatch = {
  status?: 'approved_no_visit' | 'approved_visit_scheduled' | 'denied';
  visitScheduledFor?: string;
  visitScheduledAt?: string;
  reasonDenied?: string;
};

interface SiteAccessTabProps {
  siteAccessRequests: SiteAccessRequest[];
  siteAccessData: SiteAccessData | null;
  siteVisits: SiteAccessVisit[];
  projectIsAwarded: boolean;
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
  locationDetailsForm: any;
  onUpdateLocationDetailsForm: (patch: any) => void;
  onSubmitLocationDetails: () => Promise<boolean>;
  isSubmittingLocationDetails: boolean;
  locationDetailsError: string | null;
}

const formatDate = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatDateTime = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

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
  siteVisits,
  siteAccessBlockers,
  onRespondToVisit,
  siteVisitLoading,
  siteVisitError,
  submittingSiteVisit,
  locationDetailsForm,
  onUpdateLocationDetailsForm,
  onSubmitLocationDetails,
  isSubmittingLocationDetails,
  locationDetailsError,
}) => {
  const [basicAddressSaved, setBasicAddressSaved] = useState(false);
  const [buildingInfoSaved, setBuildingInfoSaved] = useState(false);
  const [showBuildingInfo, setShowBuildingInfo] = useState(false);
  const [acceptedVisitId, setAcceptedVisitId] = useState<string | null>(null);
  const [changeAvailDate, setChangeAvailDate] = useState(locationDetailsForm.desiredStartDate || '');
  const [changeAvailReason, setChangeAvailReason] = useState('');

  const hasBasicLocation =
    Boolean(locationDetailsForm.addressFull?.trim()) &&
    Boolean(locationDetailsForm.unitNumber?.trim()) &&
    Boolean(locationDetailsForm.floorLevel?.trim());

  const pendingVisits = useMemo(
    () => siteVisits.filter((v) => v.status === 'proposed' && v.proposedByRole === 'professional'),
    [siteVisits],
  );
  const acceptedVisits = useMemo(
    () => siteVisits.filter((v) => v.status === 'accepted'),
    [siteVisits],
  );
  const otherVisits = useMemo(
    () => siteVisits.filter((v) => v.status !== 'proposed' && v.status !== 'accepted'),
    [siteVisits],
  );

  return (
    <div className="space-y-6">

      {/* Site availability date */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Site availability date</p>
        {locationDetailsForm.desiredStartDate ? (
          <p className="mt-1 text-base font-bold text-white">{formatDate(locationDetailsForm.desiredStartDate)}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Not set — use the section below to share a date with contractors.</p>
        )}
      </div>

      {/* Professional visit list */}
      {siteVisitError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {siteVisitError}
        </div>
      )}
      {locationDetailsError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {locationDetailsError}
        </div>
      )}
      {siteAccessBlockers.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Complete required fields first: {siteAccessBlockers.join(', ')}
        </div>
      )}

      {siteVisitLoading ? (
        <p className="text-sm text-slate-300">Loading visit requests…</p>
      ) : siteVisits.length === 0 ? (
        <div className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          No visit requests yet. Contractors will appear here once they request access.
        </div>
      ) : (
        <div className="space-y-3">
          {!hasBasicLocation && (pendingVisits.length > 0) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Add your address details below before accepting any visit.
            </div>
          )}

          {pendingVisits.map((visit) => {
            const name =
              visit.professional.fullName ||
              visit.professional.businessName ||
              visit.professional.email ||
              'Contractor';
            const isJustAccepted = acceptedVisitId === visit.id;
            const isSubmitting = submittingSiteVisit === visit.id;
            return (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs text-slate-300">will visit at {formatDateTime(visit.proposedAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!hasBasicLocation || isSubmitting) return;
                    await onRespondToVisit(visit.id, 'accepted');
                    setAcceptedVisitId(visit.id);
                    setTimeout(() => setAcceptedVisitId(null), 1800);
                  }}
                  disabled={isSubmitting || !hasBasicLocation}
                  title={!hasBasicLocation ? 'Complete your address details first' : 'Confirm this visit'}
                  className={`min-w-[70px] rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 ${isJustAccepted ? 'animate-thumbs-wiggle' : ''}`}
                >
                  {isSubmitting ? 'Saving…' : isJustAccepted ? '👍' : 'Accept'}
                </button>
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
                className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs text-emerald-300">{formatDateTime(visit.proposedAt)}</p>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  Booked ✓
                </span>
              </div>
            );
          })}

          {otherVisits.map((visit) => {
            const name =
              visit.professional.fullName ||
              visit.professional.businessName ||
              visit.professional.email ||
              'Contractor';
            return (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(visit.proposedAt)}</p>
                </div>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 capitalize">
                  {visit.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Address details */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              Your address {hasBasicLocation ? <span className="text-emerald-400">✓</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">Required before accepting a visit. This will be shared with the contractor.</p>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-white">Full Address *</label>
          <input
            type="text"
            value={locationDetailsForm.addressFull}
            onChange={(e) => onUpdateLocationDetailsForm({ addressFull: e.target.value })}
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            placeholder="e.g. 123 Nathan Road, Tsim Sha Tsui"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Unit Number *</label>
            <input
              type="text"
              value={locationDetailsForm.unitNumber}
              onChange={(e) => onUpdateLocationDetailsForm({ unitNumber: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. Flat 12A"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Floor Level *</label>
            <input
              type="text"
              value={locationDetailsForm.floorLevel}
              onChange={(e) => onUpdateLocationDetailsForm({ floorLevel: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. 12/F"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Postal Code / District</label>
            <input
              type="text"
              value={locationDetailsForm.postalCode}
              onChange={(e) => onUpdateLocationDetailsForm({ postalCode: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={async () => {
              try {
                const saved = await onSubmitLocationDetails();
                if (saved) {
                  setBasicAddressSaved(true);
                  setTimeout(() => setBasicAddressSaved(false), 8000);
                }
              } catch {
                toast.error('Failed to save address');
              }
            }}
            disabled={isSubmittingLocationDetails || !locationDetailsForm.addressFull?.trim()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmittingLocationDetails ? 'Saving…' : 'Save address'}
          </button>
        </div>
        {basicAddressSaved && (
          <p className="text-right text-xs font-semibold text-emerald-300">Saved just now</p>
        )}
      </div>

      {/* Building Information (optional, collapsible) */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBuildingInfo((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-white">Building information</p>
            <p className="text-xs text-slate-400">Optional — helps contractors prepare for the visit.</p>
          </div>
          <span className="text-slate-400 text-xs">{showBuildingInfo ? '▲' : '▼'}</span>
        </button>
        {showBuildingInfo && (
          <div className="border-t border-slate-700 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">Property Type</label>
                <select
                  value={locationDetailsForm.propertyType || ''}
                  onChange={(e) => onUpdateLocationDetailsForm({ propertyType: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Select type</option>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                  <option value="retail">Retail</option>
                  <option value="office">Office</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">Property Size</label>
                <input
                  type="text"
                  value={locationDetailsForm.propertySize}
                  onChange={(e) => onUpdateLocationDetailsForm({ propertySize: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">Property Age</label>
                <input
                  type="text"
                  value={locationDetailsForm.propertyAge}
                  onChange={(e) => onUpdateLocationDetailsForm({ propertyAge: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Existing Conditions</label>
              <textarea
                rows={2}
                value={locationDetailsForm.existingConditions}
                onChange={(e) => onUpdateLocationDetailsForm({ existingConditions: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Access Details</label>
              <textarea
                rows={2}
                value={locationDetailsForm.accessDetails}
                onChange={(e) => onUpdateLocationDetailsForm({ accessDetails: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">Access Hours</label>
                <input
                  type="text"
                  value={locationDetailsForm.accessHoursDescription}
                  onChange={(e) => onUpdateLocationDetailsForm({ accessHoursDescription: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">Desired Start Date</label>
                <input
                  type="date"
                  value={locationDetailsForm.desiredStartDate}
                  onChange={(e) => onUpdateLocationDetailsForm({ desiredStartDate: e.target.value })}
                  className="quote-picker-input w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">On-site Contact Name</label>
                <input
                  type="text"
                  value={locationDetailsForm.onSiteContactName}
                  onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactName: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white">On-site Contact Phone</label>
                <input
                  type="tel"
                  value={locationDetailsForm.onSiteContactPhone}
                  onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactPhone: e.target.value })}
                  className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const saved = await onSubmitLocationDetails();
                    if (saved) {
                      setBuildingInfoSaved(true);
                      setTimeout(() => setBuildingInfoSaved(false), 8000);
                    }
                  } catch {
                    toast.error('Failed to update building information');
                  }
                }}
                disabled={isSubmittingLocationDetails || !locationDetailsForm.addressFull?.trim()}
                className="rounded-md border border-sky-500 bg-sky-900/40 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
              >
                {isSubmittingLocationDetails ? 'Saving…' : 'Update building information'}
              </button>
            </div>
            {buildingInfoSaved && (
              <p className="text-right text-xs font-semibold text-emerald-300">Saved just now</p>
            )}
          </div>
        )}
      </div>

      {/* Change site availability date */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Update your site availability</p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-white">New availability date</label>
          <input
            type="date"
            value={changeAvailDate}
            onChange={(e) => setChangeAvailDate(e.target.value)}
            className="quote-picker-input w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none sm:w-48"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-white">Reason for change</label>
          <textarea
            rows={2}
            value={changeAvailReason}
            onChange={(e) => setChangeAvailReason(e.target.value)}
            placeholder="Briefly explain why the date needs to change"
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white opacity-50 cursor-not-allowed"
          >
            Send update
          </button>
        </div>
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          We recommend only changing your availability date if absolutely necessary. If you have already confirmed visits with any contractors, please contact them directly before making changes — it can cause unnecessary disruption to their schedules.
        </p>
      </div>

    </div>
  );
};

          <button
            type="button"
            onClick={() => setActiveSection('basic-address')}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
              activeSection === 'basic-address'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Basic Address {hasBasicLocation ? '✓' : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('building-information')}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
              activeSection === 'building-information'
                ? 'bg-emerald-600 text-white'
                : 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            Building Information {hasBuildingInfo ? '✓' : ''}
          </button>
        </div>
      </div>

      {activeSection === 'access-requests' && (
        <div className="space-y-4">
          {siteAccessError && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
              {siteAccessError}
            </div>
          )}

          {locationDetailsError && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
              {locationDetailsError}
            </div>
          )}

          {siteAccessBlockers.length > 0 && (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
              Complete required fields: {siteAccessBlockers.join(', ')}
            </div>
          )}

          {siteAccessLoading ? (
            <p className="text-sm text-slate-300">Loading access requests...</p>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
              No active access requests. New requests will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => {
                const displayName =
                  request.professional.fullName ||
                  request.professional.businessName ||
                  request.professional.email ||
                  'Professional';

                const form = siteAccessForms[request.id] || {
                  status: 'approved_visit_scheduled' as const,
                  visitScheduledFor: toDateInput(request.visitScheduledFor || request.visitScheduledAt),
                  visitScheduledAt: toTimeInput(request.visitScheduledAt),
                  reasonDenied: '',
                };

                const selectedDate = form.visitScheduledFor || toDateInput(request.visitScheduledFor || request.visitScheduledAt);
                const selectedTime = form.visitScheduledAt || toTimeInput(request.visitScheduledAt);
                const canAcceptOrUpdate = hasBasicLocation && Boolean(selectedDate && selectedTime);

                return (
                  <div key={request.id} className="rounded-lg border border-white/20 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{displayName}</p>
                        <p className="text-xs text-slate-300">Requested on {formatDate(request.requestedAt)}</p>
                      </div>
                      <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200">
                        pending
                      </span>
                    </div>

                    <div className="mt-3 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                      Proposed by professional: {formatDateTime(request.visitScheduledAt || request.visitScheduledFor || undefined)}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-white">Date</label>
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => onUpdateSiteAccessForm(request.id, { visitScheduledFor: e.target.value })}
                          className="quote-picker-input w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-white">Time</label>
                        <input
                          type="time"
                          value={selectedTime}
                          onChange={(e) => onUpdateSiteAccessForm(request.id, { visitScheduledAt: e.target.value })}
                          className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-semibold text-white">Decline reason (optional)</label>
                      <textarea
                        rows={2}
                        value={form.reasonDenied || ''}
                        onChange={(e) => onUpdateSiteAccessForm(request.id, { reasonDenied: e.target.value })}
                        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        placeholder="Share why this timing/access request is not possible"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onRespondToRequest(request.id, {
                              status: 'approved_visit_scheduled',
                              visitScheduledFor: selectedDate,
                              visitScheduledAt: selectedTime,
                            });
                          } catch {
                            toast.error('Failed to accept access request');
                          }
                        }}
                        disabled={submittingSiteAccess === request.id || isSubmittingLocationDetails || !canAcceptOrUpdate}
                        title={!hasBasicLocation ? 'Complete Basic Address first' : ''}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {submittingSiteAccess === request.id ? 'Saving…' : 'Accept'}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onRespondToRequest(request.id, {
                              status: 'approved_visit_scheduled',
                              visitScheduledFor: selectedDate,
                              visitScheduledAt: selectedTime,
                            });
                          } catch {
                            toast.error('Failed to update request');
                          }
                        }}
                        disabled={submittingSiteAccess === request.id || isSubmittingLocationDetails || !canAcceptOrUpdate}
                        title={!hasBasicLocation ? 'Complete Basic Address first' : ''}
                        className="rounded-md border border-sky-500 bg-sky-900/40 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
                      >
                        {submittingSiteAccess === request.id ? 'Saving…' : 'Update'}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onRespondToRequest(request.id, {
                              status: 'denied',
                              reasonDenied: form.reasonDenied || undefined,
                            });
                          } catch {
                            toast.error('Failed to decline request');
                          }
                        }}
                        disabled={submittingSiteAccess === request.id || isSubmittingLocationDetails}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {submittingSiteAccess === request.id ? 'Saving…' : 'Decline'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-white">Previously granted</p>
            {grantedRequests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-300">No granted access requests yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {grantedRequests.map((request) => (
                  <div key={request.id} className="rounded border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
                    <p>
                      <span className="font-semibold">{request.professional.fullName || request.professional.businessName || request.professional.email || 'Professional'}</span>
                      {' · '}
                      {request.status.replace(/_/g, ' ')}
                    </p>
                    <p className="text-slate-400">
                      Responded {formatDate(request.respondedAt)}
                      {request.visitScheduledAt ? ` · Visit ${formatDateTime(request.visitScheduledAt)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {siteVisits.length > 0 && (
            <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-white">Visit proposals</p>
              {siteVisitError && (
                <p className="mt-2 text-sm text-rose-200">{siteVisitError}</p>
              )}
              {siteVisitLoading ? (
                <p className="mt-2 text-sm text-slate-300">Loading visits...</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {siteVisits.map((visit) => (
                    <div key={visit.id} className="rounded border border-slate-700 bg-slate-950/70 px-3 py-2">
                      <p className="text-xs text-slate-200">
                        {visit.professional.fullName || visit.professional.businessName || visit.professional.email || 'Professional'}
                        {' · '}
                        {formatDateTime(visit.proposedAt)}
                      </p>
                      {visit.status === 'proposed' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => onRespondToVisit(visit.id, 'accepted')}
                            disabled={submittingSiteVisit === visit.id}
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onRespondToVisit(visit.id, 'declined')}
                            disabled={submittingSiteVisit === visit.id}
                            className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'basic-address' && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Basic Address</p>
          <p className="text-xs text-slate-300">Complete these fields before accepting or updating an access request.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Full Address *</label>
            <input
              type="text"
              value={locationDetailsForm.addressFull}
              onChange={(e) => onUpdateLocationDetailsForm({ addressFull: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Unit Number *</label>
              <input
                type="text"
                value={locationDetailsForm.unitNumber}
                onChange={(e) => onUpdateLocationDetailsForm({ unitNumber: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Floor Level *</label>
              <input
                type="text"
                value={locationDetailsForm.floorLevel}
                onChange={(e) => onUpdateLocationDetailsForm({ floorLevel: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Postal Code / District</label>
              <input
                type="text"
                value={locationDetailsForm.postalCode}
                onChange={(e) => onUpdateLocationDetailsForm({ postalCode: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  const saved = await onSubmitLocationDetails();
                  if (saved) {
                    setBasicAddressSaved(true);
                    setTimeout(() => setBasicAddressSaved(false), 12000);
                  }
                } catch {
                  toast.error('Failed to save basic address');
                }
              }}
              disabled={isSubmittingLocationDetails || !locationDetailsForm.addressFull?.trim()}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmittingLocationDetails ? 'Saving…' : 'Save Basic Address'}
            </button>
          </div>
          {basicAddressSaved && (
            <p className="text-right text-xs font-semibold text-emerald-300">Saved just now</p>
          )}
        </div>
      )}

      {activeSection === 'building-information' && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Building Information</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Property Type</label>
              <select
                value={locationDetailsForm.propertyType || ''}
                onChange={(e) => onUpdateLocationDetailsForm({ propertyType: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select type</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="retail">Retail</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Property Size</label>
              <input
                type="text"
                value={locationDetailsForm.propertySize}
                onChange={(e) => onUpdateLocationDetailsForm({ propertySize: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Property Age</label>
              <input
                type="text"
                value={locationDetailsForm.propertyAge}
                onChange={(e) => onUpdateLocationDetailsForm({ propertyAge: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Existing Conditions</label>
            <textarea
              rows={2}
              value={locationDetailsForm.existingConditions}
              onChange={(e) => onUpdateLocationDetailsForm({ existingConditions: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-white">Access Details</label>
            <textarea
              rows={2}
              value={locationDetailsForm.accessDetails}
              onChange={(e) => onUpdateLocationDetailsForm({ accessDetails: e.target.value })}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Access Hours</label>
              <input
                type="text"
                value={locationDetailsForm.accessHoursDescription}
                onChange={(e) => onUpdateLocationDetailsForm({ accessHoursDescription: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">Desired Start Date</label>
              <input
                type="date"
                value={locationDetailsForm.desiredStartDate}
                onChange={(e) => onUpdateLocationDetailsForm({ desiredStartDate: e.target.value })}
                className="quote-picker-input w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">On-site Contact Name</label>
              <input
                type="text"
                value={locationDetailsForm.onSiteContactName}
                onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactName: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-white">On-site Contact Phone</label>
              <input
                type="tel"
                value={locationDetailsForm.onSiteContactPhone}
                onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactPhone: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  const saved = await onSubmitLocationDetails();
                  if (saved) {
                    setBuildingInfoSaved(true);
                    setTimeout(() => setBuildingInfoSaved(false), 12000);
                  }
                } catch {
                  toast.error('Failed to update building information');
                }
              }}
              disabled={isSubmittingLocationDetails || !locationDetailsForm.addressFull?.trim()}
              className="rounded-md border border-sky-500 bg-sky-900/40 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-900/60 disabled:opacity-50"
            >
              {isSubmittingLocationDetails ? 'Saving…' : 'Update Building Information'}
            </button>
          </div>
          {buildingInfoSaved && (
            <p className="text-right text-xs font-semibold text-emerald-300">Saved just now</p>
          )}
        </div>
      )}
    </div>
  );
};
