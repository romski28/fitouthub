'use client';

import React, { useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
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

interface SiteAccessTabProps {
  siteAccessRequests: SiteAccessRequest[];
  siteAccessData: SiteAccessData | null;
  siteVisits: SiteAccessVisit[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  onRespondToRequest: (requestId: string) => Promise<void>;
  onRespondToVisit: (visitId: string, status: 'accepted' | 'declined') => Promise<void>;
  onSubmitLocationDetails: () => Promise<void>;
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

export const SiteAccessTab: React.FC<SiteAccessTabProps> = ({
  siteAccessRequests,
  siteAccessData,
  siteVisits,
  expandedAccordions,
  onToggleAccordion,
  onRespondToRequest,
  onRespondToVisit,
  onSubmitLocationDetails,
  siteAccessLoading,
  siteAccessError,
  siteVisitLoading,
  siteVisitError,
  submittingSiteAccess,
  submittingSiteVisit,
  siteAccessForms,
  onUpdateSiteAccessForm,
  siteVisitResponseNotes,
  onUpdateSiteVisitResponseNotes,
  locationDetailsForm,
  onUpdateLocationDetailsForm,
  isSubmittingLocationDetails,
  locationDetailsError,
}) => {
  return (
    <div className="space-y-4">
      <AccordionGroup>
        {/* Site Access Requests */}
        <AccordionItem
          id="site-access-requests"
          title="Site Access Requests"
          badge={siteAccessRequests.length > 0 ? siteAccessRequests.length.toString() : undefined}
          isOpen={expandedAccordions['site-access-requests'] !== false}
          onToggle={onToggleAccordion}
        >
          {siteAccessError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-4">
              {siteAccessError}
            </div>
          )}

          {siteAccessLoading ? (
            <p className="text-sm text-slate-600">Loading requests...</p>
          ) : siteAccessRequests.length === 0 ? (
            <p className="text-sm text-slate-600">No site access requests yet. Requests will appear here when professionals ask for access.</p>
          ) : (
            <div className="space-y-4">
              {siteAccessRequests.map((request) => {
                const displayName = request.professional.fullName || request.professional.businessName || request.professional.email || 'Professional';
                const form = siteAccessForms[request.id] || {
                  status: 'approved_no_visit' as const,
                  addressFull: siteAccessData?.addressFull || '',
                };

                const statusColor = {
                  pending: 'bg-amber-50 border-amber-200',
                  approved_no_visit: 'bg-emerald-50 border-emerald-200',
                  approved_visit_scheduled: 'bg-blue-50 border-blue-200',
                  denied: 'bg-rose-50 border-rose-200',
                }[request.status] || 'bg-slate-50 border-slate-200';

                return (
                  <div key={request.id} className={`rounded-lg border p-4 ${statusColor}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">{displayName}</p>
                        <p className="text-xs text-slate-600 mt-1">Requested: {formatDate(request.requestedAt)}</p>
                      </div>
                      <span className="text-xs font-semibold capitalize px-2 py-1 rounded bg-white text-slate-700 border border-slate-200">
                        {request.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {request.status === 'pending' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-2">Decision</label>
                          <div className="flex gap-2 items-center">
                            <select
                              value={form.status}
                              onChange={(e) => onUpdateSiteAccessForm(request.id, { status: e.target.value })}
                              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              <option value="approved_no_visit">Approve (no site visit)</option>
                              <option value="approved_visit_scheduled">Approve (with site visit)</option>
                              <option value="denied">Deny</option>
                            </select>
                          </div>
                        </div>

                        {form.status === 'denied' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Reason for denial</label>
                            <textarea
                              value={form.reasonDenied || ''}
                              onChange={(e) => onUpdateSiteAccessForm(request.id, { reasonDenied: e.target.value })}
                              placeholder="Brief explanation..."
                              className="w-full rounded border border-slate-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                              rows={2}
                            />
                          </div>
                        )}

                        {form.status === 'approved_visit_scheduled' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Visit date</label>
                              <input
                                type="date"
                                value={form.visitScheduledFor || ''}
                                onChange={(e) => onUpdateSiteAccessForm(request.id, { visitScheduledFor: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Visit time</label>
                              <input
                                type="time"
                                value={form.visitScheduledAt || ''}
                                onChange={(e) => onUpdateSiteAccessForm(request.id, { visitScheduledAt: e.target.value })}
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {form.status !== 'denied' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Site address</label>
                            <input
                              type="text"
                              value={form.addressFull || siteAccessData?.addressFull || ''}
                              onChange={(e) => onUpdateSiteAccessForm(request.id, { addressFull: e.target.value })}
                              placeholder="Full address"
                              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        )}

                        <div className="flex gap-2 justify-end pt-2">
                          <button
                            onClick={async () => {
                              try {
                                await onRespondToRequest(request.id);
                              } catch (e) {
                                toast.error('Failed to respond to request');
                              }
                            }}
                            disabled={submittingSiteAccess === request.id}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition"
                          >
                            {submittingSiteAccess === request.id ? 'Sending…' : 'Send Response'}
                          </button>
                        </div>
                      </div>
                    )}

                    {request.status !== 'pending' && (
                      <div className="text-sm">
                        <p className="text-slate-700 mb-2">
                          <strong>Decision:</strong> {request.status.replace(/_/g, ' ')}
                        </p>
                        {request.respondedAt && (
                          <p className="text-xs text-slate-600">Responded: {formatDate(request.respondedAt)}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AccordionItem>

        {/* Site Visit Proposals */}
        {siteVisits.length > 0 && (
          <AccordionItem
            id="site-visit-proposals"
            title="Site Visit Proposals"
            badge={siteVisits.filter((v) => v.status === 'proposed').length.toString()}
            isOpen={expandedAccordions['site-visit-proposals'] === true}
            onToggle={onToggleAccordion}
          >
            {siteVisitError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-4">
                {siteVisitError}
              </div>
            )}

            {siteVisitLoading ? (
              <p className="text-sm text-slate-600">Loading visits...</p>
            ) : (
              <div className="space-y-3">
                {siteVisits.map((visit) => {
                  const displayName = visit.professional.fullName || visit.professional.businessName || visit.professional.email || 'Professional';
                  const statusColor = {
                    proposed: 'bg-amber-50 border-amber-200',
                    accepted: 'bg-emerald-50 border-emerald-200',
                    declined: 'bg-rose-50 border-rose-200',
                    completed: 'bg-blue-50 border-blue-200',
                  }[visit.status] || 'bg-slate-50 border-slate-200';

                  return (
                    <div key={visit.id} className={`rounded-lg border p-4 ${statusColor}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-900">{displayName}</p>
                          <p className="text-sm text-slate-700 mt-1">Proposed: {formatDateTime(visit.proposedAt)}</p>
                        </div>
                        <span className="text-xs font-semibold capitalize px-2 py-1 rounded bg-white text-slate-700 border border-slate-200">
                          {visit.status}
                        </span>
                      </div>

                      {visit.notes && (
                        <div className="text-sm text-slate-700 mt-2 bg-white bg-opacity-50 p-2 rounded">
                          <strong>Notes:</strong> {visit.notes}
                        </div>
                      )}

                      {visit.status === 'proposed' && (
                        <div className="space-y-3 mt-3">
                          {siteVisitResponseNotes[visit.id] !== undefined && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Response notes (optional)</label>
                              <textarea
                                value={siteVisitResponseNotes[visit.id]}
                                onChange={(e) => onUpdateSiteVisitResponseNotes(visit.id, e.target.value)}
                                placeholder="Add any notes about this decision..."
                                className="w-full rounded border border-slate-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                rows={2}
                              />
                            </div>
                          )}
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={async () => {
                                try {
                                  await onRespondToVisit(visit.id, 'declined');
                                } catch (e) {
                                  toast.error('Failed to respond');
                                }
                              }}
                              disabled={submittingSiteVisit === visit.id}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 disabled:opacity-50 transition"
                            >
                              {submittingSiteVisit === visit.id ? '…' : 'Decline'}
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await onRespondToVisit(visit.id, 'accepted');
                                } catch (e) {
                                  toast.error('Failed to respond');
                                }
                              }}
                              disabled={submittingSiteVisit === visit.id}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                              {submittingSiteVisit === visit.id ? '…' : 'Accept'}
                            </button>
                          </div>
                        </div>
                      )}

                      {visit.status === 'accepted' && (
                        <p className="text-xs text-slate-600 mt-2">✓ You accepted this visit</p>
                      )}

                      {visit.status === 'declined' && (
                        <div>
                          <p className="text-xs text-slate-600 mt-2">✗ You declined this visit</p>
                          {visit.responseNotes && (
                            <p className="text-xs text-slate-700 mt-1 italic">"{visit.responseNotes}"</p>
                          )}
                        </div>
                      )}

                      {visit.status === 'completed' && (
                        <p className="text-xs text-slate-600 mt-2">✓ Visit completed on {formatDate(visit.completedAt ?? undefined)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionItem>
        )}

        {/* Location Details */}
        <AccordionItem
          id="location-details"
          title="Location Details"
          isOpen={expandedAccordions['location-details'] === true}
          onToggle={onToggleAccordion}
        >
          {locationDetailsError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 mb-4">
              {locationDetailsError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Full Address *</label>
              <input
                type="text"
                value={locationDetailsForm.addressFull}
                onChange={(e) => onUpdateLocationDetailsForm({ addressFull: e.target.value })}
                placeholder="e.g., Unit 101, 123 Main Street"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Unit Number</label>
                <input
                  type="text"
                  value={locationDetailsForm.unitNumber}
                  onChange={(e) => onUpdateLocationDetailsForm({ unitNumber: e.target.value })}
                  placeholder="e.g., 101"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Floor Level</label>
                <input
                  type="text"
                  value={locationDetailsForm.floorLevel}
                  onChange={(e) => onUpdateLocationDetailsForm({ floorLevel: e.target.value })}
                  placeholder="e.g., G/F, 1/F"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Access Details</label>
              <textarea
                value={locationDetailsForm.accessDetails}
                onChange={(e) => onUpdateLocationDetailsForm({ accessDetails: e.target.value })}
                placeholder="e.g., Security gate, 24/7 access, notify 2 hours before"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">On-site Contact Name</label>
                <input
                  type="text"
                  value={locationDetailsForm.onSiteContactName}
                  onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactName: e.target.value })}
                  placeholder="Contact person"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Contact Phone</label>
                <input
                  type="tel"
                  value={locationDetailsForm.onSiteContactPhone}
                  onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactPhone: e.target.value })}
                  placeholder="Phone number"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={onSubmitLocationDetails}
                disabled={isSubmittingLocationDetails}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isSubmittingLocationDetails ? 'Submitting…' : 'Submit Location Details'}
              </button>
            </div>
          </div>
        </AccordionItem>
      </AccordionGroup>
    </div>
  );
};
