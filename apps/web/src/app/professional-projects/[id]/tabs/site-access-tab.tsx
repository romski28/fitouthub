'use client';

import React, { useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import toast from 'react-hot-toast';

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
  visitScheduledFor: string | null;
  visitScheduledAt?: string | null;
  visitedAt: string | null;
  reasonDenied: string | null;
  hasAccess: boolean;
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

export const SiteAccessTab: React.FC<SiteAccessTabProps> = ({
  siteAccessStatus,
  siteAccessLoading,
  siteAccessError,
  siteVisits,
  siteVisitLoading,
  siteVisitError,
  expandedAccordions,
  onToggleAccordion,
  onRequestSiteAccess,
  onRequestSiteVisit,
  onRespondSiteVisit,
  onCompleteSiteVisit,
  siteAccessActionLoading,
  siteVisitActionLoading,
  visitDate,
  onUpdateVisitDate,
  visitTime,
  onUpdateVisitTime,
  visitRequestNotes,
  onUpdateVisitRequestNotes,
  visitNotes,
  onUpdateVisitNotes,
  visitResponseNotes,
  onUpdateVisitResponseNotes,
}) => {
  const acceptedVisit = siteVisits.find((visit) => visit.status === 'accepted');

  return (
    <div className="rounded-lg border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 shadow-sm">
      <AccordionGroup>
        {/* Site Access Status */}
        <AccordionItem
          id="site-access-status"
          title="Site Access Status"
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
              <div className="text-sm text-slate-200">
                <span className="font-semibold">Status:</span>{' '}
                {siteAccessStatus.requestStatus === 'none'
                  ? 'No request yet'
                  : siteAccessStatus.requestStatus.replace('_', ' ')}
              </div>

              {siteAccessStatus.requestStatus === 'pending' && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  Awaiting client approval. You can still submit a quote without site access.
                </div>
              )}

              {siteAccessStatus.requestStatus === 'denied' && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                  Site access denied{siteAccessStatus.reasonDenied ? `: ${siteAccessStatus.reasonDenied}` : '.'}
                </div>
              )}

              {siteAccessStatus.requestStatus === 'approved_no_visit' && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                  Site access approved (no visit required)
                </div>
              )}

              {siteAccessStatus.requestStatus === 'approved_visit_scheduled' && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                  Visit approved
                  {siteAccessStatus.visitScheduledAt
                    ? ` for ${new Date(siteAccessStatus.visitScheduledAt).toLocaleString()}`
                    : siteAccessStatus.visitScheduledFor
                    ? ` for ${new Date(siteAccessStatus.visitScheduledFor).toLocaleDateString()}`
                    : '.'}
                </div>
              )}

              {siteAccessStatus.requestStatus === 'visited' && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                  Site visited{siteAccessStatus.visitedAt ? ` on ${new Date(siteAccessStatus.visitedAt).toLocaleDateString()}` : '.'}
                </div>
              )}

              {siteAccessStatus.hasAccess && siteAccessStatus.siteAccessData && (
                <div className="grid gap-3 rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</p>
                    <p className="font-medium text-white">{siteAccessStatus.siteAccessData.addressFull}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Unit / Floor</p>
                      <p className="text-slate-200">
                        {[siteAccessStatus.siteAccessData.unitNumber, siteAccessStatus.siteAccessData.floorLevel]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Access</p>
                      <p className="text-slate-200">{siteAccessStatus.siteAccessData.accessDetails || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">On-site Contact</p>
                    <p className="text-slate-200">
                      {[siteAccessStatus.siteAccessData.onSiteContactName, siteAccessStatus.siteAccessData.onSiteContactPhone]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                </div>
              )}

              {!siteAccessStatus.hasAccess && (
                <button
                  type="button"
                  onClick={onRequestSiteAccess}
                  disabled={siteAccessActionLoading || siteAccessStatus.requestStatus === 'pending'}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {siteAccessActionLoading ? 'Requesting...' : 'Request Site Access'}
                </button>
              )}

              <p className="text-xs text-slate-400">
                You can submit quotes without site access. Those quotes will be marked as remote.
              </p>
            </div>
          )}
        </AccordionItem>

        {/* Site Visits */}
        {siteAccessStatus?.hasAccess && (
          <AccordionItem
            id="site-visits"
            title="Site Visits"
            badge={siteVisits.length > 0 ? siteVisits.length.toString() : undefined}
            isOpen={expandedAccordions['site-visits'] !== false}
            onToggle={() => onToggleAccordion('site-visits')}
          >
            <div className="space-y-4">
              {/* Request New Visit */}
              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                <h3 className="font-semibold text-white text-sm">Request Site Visit</h3>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Date</label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => onUpdateVisitDate(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Time</label>
                    <input
                      type="time"
                      value={visitTime}
                      onChange={(e) => onUpdateVisitTime(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onRequestSiteVisit}
                    disabled={siteVisitActionLoading}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    {siteVisitActionLoading ? 'Requesting...' : 'Request'}
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
                  <input
                    value={visitRequestNotes}
                    onChange={(e) => onUpdateVisitRequestNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500"
                    placeholder="Access details, parking, timing, etc."
                  />
                </div>
              </div>

              {siteVisitError && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                  {siteVisitError}
                </div>
              )}

              {/* Visit History */}
              {siteVisitLoading ? (
                <p className="text-sm text-slate-300">Loading site visits...</p>
              ) : siteVisits.length === 0 ? (
                <p className="text-sm text-slate-300">No site visits scheduled yet.</p>
              ) : (
                <div className="space-y-3">
                  {siteVisits.map((visit) => {
                    const isPending = visit.status === 'proposed';
                    const proposedByClient = visit.proposedByRole === 'client';

                    return (
                      <div key={visit.id} className="rounded-md border border-slate-700 bg-slate-900/60 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div>
                            <p className="font-semibold text-white">
                              {proposedByClient ? 'Client proposed visit' : 'You proposed visit'}
                            </p>
                            <p className="text-xs text-slate-400">{new Date(visit.proposedAt).toLocaleString()}</p>
                          </div>
                          <span className="rounded-full bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 whitespace-nowrap border border-slate-600">
                            {visit.status.replace('_', ' ')}
                          </span>
                        </div>

                        {visit.notes && <p className="text-xs text-slate-300 mb-2">Notes: {visit.notes}</p>}
                        {visit.responseNotes && <p className="text-xs text-slate-300 mb-2">Response: {visit.responseNotes}</p>}

                        {isPending && proposedByClient && (
                          <div className="space-y-2 mt-3 pt-3 border-t border-slate-700">
                            <input
                              value={visitResponseNotes[visit.id] || ''}
                              onChange={(e) =>
                                onUpdateVisitResponseNotes({
                                  ...visitResponseNotes,
                                  [visit.id]: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500"
                              placeholder="Add a response note (optional)"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => onRespondSiteVisit(visit.id, 'accepted')}
                                disabled={siteVisitActionLoading}
                                className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => onRespondSiteVisit(visit.id, 'declined')}
                                disabled={siteVisitActionLoading}
                                className="flex-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}

                        {isPending && !proposedByClient && (
                          <p className="text-xs text-slate-400 mt-2">Awaiting client response.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Complete Visit */}
              {acceptedVisit && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 p-4 space-y-2">
                  <p className="text-sm font-semibold text-emerald-200">Complete Site Visit</p>
                  <textarea
                    value={visitNotes}
                    onChange={(e) => onUpdateVisitNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    placeholder="Add any notes from the site visit"
                  />
                  <button
                    type="button"
                    onClick={() => onCompleteSiteVisit(acceptedVisit.id)}
                    disabled={siteVisitActionLoading}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {siteVisitActionLoading ? 'Completing...' : 'Mark Visit Complete'}
                  </button>
                </div>
              )}
            </div>
          </AccordionItem>
        )}
      </AccordionGroup>
    </div>
  );
};
