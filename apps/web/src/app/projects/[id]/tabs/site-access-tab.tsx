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
  projectIsAwarded: boolean;
  siteAccessBlockers: string[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  onRespondToRequest: (requestId: string) => Promise<void>;
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
  projectIsAwarded,
  siteAccessBlockers,
  expandedAccordions,
  onToggleAccordion,
  onRespondToRequest,
  onRespondToVisit,
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
  // Helper to check if a field is in the blocker list
  const isFieldBlocked = (fieldName: string): boolean => {
    return siteAccessBlockers.includes(fieldName);
  };

  const blockedBorderClass = (fieldName: string) =>
    isFieldBlocked(fieldName)
      ? 'border-rose-500 bg-rose-50'
      : '';

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
                      <div className="space-y-4">
                        <div
                          className={`rounded-md border px-3 py-2 text-xs font-medium ${
                            projectIsAwarded
                              ? 'border-rose-300 bg-rose-50 text-rose-800'
                              : 'border-amber-300 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {projectIsAwarded
                            ? 'Awarded stage: all four sections are required before submission.'
                            : 'Bidding stage: Access Request Response and Basic Location Information are required now.'}
                        </div>

                        {locationDetailsError && (
                          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {locationDetailsError}
                          </div>
                        )}

                        {siteAccessBlockers.length > 0 && (
                          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            <p className="font-semibold mb-1">Please complete required fields before submitting:</p>
                            <p>{siteAccessBlockers.join(', ')}</p>
                          </div>
                        )}

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-800 border-b pb-2 flex items-center justify-between">
                            <span>Access Request Response</span>
                            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Required now
                            </span>
                          </h4>
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
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-800 border-b pb-2 flex items-center justify-between">
                            <span>Basic Location Information</span>
                            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Required now
                            </span>
                          </h4>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Full Address *</label>
                            <input
                              type="text"
                              value={locationDetailsForm.addressFull}
                              onChange={(e) => onUpdateLocationDetailsForm({ addressFull: e.target.value })}
                              placeholder="e.g., 123 Main Street"
                              className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Full Address') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                            />
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Unit Number</label>
                              <input
                                type="text"
                                value={locationDetailsForm.unitNumber}
                                onChange={(e) => onUpdateLocationDetailsForm({ unitNumber: e.target.value })}
                                placeholder="e.g., 101"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Unit Number') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Floor Level</label>
                              <input
                                type="text"
                                value={locationDetailsForm.floorLevel}
                                onChange={(e) => onUpdateLocationDetailsForm({ floorLevel: e.target.value })}
                                placeholder="e.g., G/F, 1/F"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Floor Level') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Postal Code / District</label>
                              <input
                                type="text"
                                value={locationDetailsForm.postalCode}
                                onChange={(e) => onUpdateLocationDetailsForm({ postalCode: e.target.value })}
                                placeholder="e.g., Central, TST"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Postal Code / District') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-800 border-b pb-2 flex items-center justify-between">
                            <span>Property Details</span>
                            <span
                              className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
                                projectIsAwarded
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {projectIsAwarded ? 'Required now' : 'Required after award'}
                            </span>
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Property Type</label>
                              <select
                                value={locationDetailsForm.propertyType || ''}
                                onChange={(e) => onUpdateLocationDetailsForm({ propertyType: e.target.value })}
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Property Type') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
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
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Property Size (sq ft)</label>
                              <input
                                type="text"
                                value={locationDetailsForm.propertySize}
                                onChange={(e) => onUpdateLocationDetailsForm({ propertySize: e.target.value })}
                                placeholder="e.g., 800"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Property Size') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Property Age (years)</label>
                              <input
                                type="text"
                                value={locationDetailsForm.propertyAge}
                                onChange={(e) => onUpdateLocationDetailsForm({ propertyAge: e.target.value })}
                                placeholder="e.g., 15"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Property Age') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Existing Conditions</label>
                            <textarea
                              value={locationDetailsForm.existingConditions}
                              onChange={(e) => onUpdateLocationDetailsForm({ existingConditions: e.target.value })}
                              placeholder="Describe current state, any issues, damages, etc."
                              className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Existing Conditions') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              rows={2}
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-800 border-b pb-2 flex items-center justify-between">
                            <span>Access and Control</span>
                            <span
                              className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
                                projectIsAwarded
                                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {projectIsAwarded ? 'Required now' : 'Required after award'}
                            </span>
                          </h4>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Access Details</label>
                            <textarea
                              value={locationDetailsForm.accessDetails}
                              onChange={(e) => onUpdateLocationDetailsForm({ accessDetails: e.target.value })}
                              placeholder="e.g., Security gate, 24/7 access, notify 2 hours before"
                              className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Access Details') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              rows={2}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Access Hours</label>
                            <input
                              type="text"
                              value={locationDetailsForm.accessHoursDescription}
                              onChange={(e) => onUpdateLocationDetailsForm({ accessHoursDescription: e.target.value })}
                              placeholder="e.g., Mon-Fri 9am-6pm, weekends by appointment"
                              className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Access Hours') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
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
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('On-site Contact Name') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-2">Contact Phone</label>
                              <input
                                type="tel"
                                value={locationDetailsForm.onSiteContactPhone}
                                onChange={(e) => onUpdateLocationDetailsForm({ onSiteContactPhone: e.target.value })}
                                placeholder="Phone number"
                                className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('On-site Contact Phone') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-2">Desired Start Date</label>
                            <input
                              type="date"
                              value={locationDetailsForm.desiredStartDate}
                              onChange={(e) => onUpdateLocationDetailsForm({ desiredStartDate: e.target.value })}
                              className={`w-full rounded border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${isFieldBlocked('Desired Start Date') ? 'border-rose-500 bg-rose-50' : 'border-slate-300'}`}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                          <button
                            onClick={async () => {
                              try {
                                await onRespondToRequest(request.id);
                              } catch (e) {
                                toast.error('Failed to respond to request');
                              }
                            }}
                            disabled={submittingSiteAccess === request.id || isSubmittingLocationDetails}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition"
                          >
                            {submittingSiteAccess === request.id || isSubmittingLocationDetails ? 'Saving…' : 'Save and Send Response'}
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

      </AccordionGroup>
    </div>
  );
};
