'use client';

import React, { useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProfessionalDetailsModal } from '@/components/professional-details-modal';
import { API_BASE_URL } from '@/config/api';
import type { Professional } from '@/lib/types';
import toast from 'react-hot-toast';
import { fetchPrimaryNextStep } from '@/lib/next-steps';
import { WorkflowCompletionModal, WorkflowNextStep, WaitingParty } from '@/components/workflow-completion-modal';
import { getClientTabForAction } from '@/lib/client-workflow';
import { getQuoteBreakdownClientItems, type StoredQuoteBreakdown } from '@/lib/quote-breakdown';

interface ProjectProfessional {
  id: string;
  professionalId: string;
  projectId: string;
  status: string;
  quoteRequestedTrades?: string[];
  projectTradesSnapshot?: string[];
  quoteAmount?: string | number;
  quoteBreakdown?: StoredQuoteBreakdown | null;
  quoteNotes?: string;
  quoteEstimatedStartAt?: string;
  quoteEstimatedDurationMinutes?: number;
  quoteEstimatedDurationUnit?: 'hours' | 'days';
  quotedAt?: string;
  createdAt?: string;
  quoteReminderSentAt?: string;
  quoteExtendedUntil?: string;
  professional: {
    id: string;
    email: string;
    fullName?: string;
    businessName?: string;
    phone?: string;
  };
  invoice?: {
    id: string;
    amount: string;
    paymentStatus: string;
    paidAt?: string;
  };
}

interface SiteAccessRequestSummary {
  id: string;
  status: string;
  requestedAt: string;
  visitScheduledAt?: string | null;
  professional?: {
    id: string;
  };
}

interface ProfessionalsTabProps {
  project: any;
  professionals: ProjectProfessional[];
  siteAccessRequests?: SiteAccessRequestSummary[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  accessToken: string;
  onOpenChat?: (professional: ProjectProfessional | null) => void;
  onOpenAccessSchedule?: () => void;
  onAwarded?: (professional: ProjectProfessional) => void;
  onProfessionalsChanged?: () => void | Promise<void>;
  onActionBusy?: (kind: string | null) => void;
  actionBusy?: string | null;
  onNavigateTab?: (tab: string) => void;
}

const inferWaitingParty = (actionKey?: string): WaitingParty | undefined => {
  if (!actionKey) return undefined;
  if (actionKey.includes('WAIT_FOR_PROFESSIONAL')) return 'professional';
  if (actionKey.includes('WAIT_FOR_CLIENT')) return 'client';
  if (actionKey.includes('WAIT_FOR_PLATFORM') || actionKey.includes('VERIFY')) return 'platform';
  return undefined;
};

const formatDate = (date?: string) => {
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

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'HK$ —';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDuration = (minutes?: number) => {
  if (!minutes || !Number.isFinite(minutes)) return '—';
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
  }
  return `${minutes} min`;
};

const formatShortDayDate = (date: Date) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(date);
  } catch {
    return '—';
  }
};

const formatShortDayDateFromString = (date?: string) => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return formatShortDayDate(parsed);
};

const formatTimeOnly = (date: Date) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '—';
  }
};

const formatScheduleWindow = (startAt?: string, durationMinutes?: number) => {
  if (!startAt) return '—';

  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return '—';

  if (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return `on ${formatShortDayDate(start)}`;
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const spansMultipleDays =
    durationMinutes >= 1440 ||
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate();

  if (spansMultipleDays) {
    return `between ${formatShortDayDate(start)} and ${formatShortDayDate(end)}`;
  }

  return `on ${formatShortDayDate(start)} from ${formatTimeOnly(start)} to ${formatTimeOnly(end)}`;
};

const getNumericQuote = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return Number.NaN;
  return typeof value === 'number' ? value : Number(value);
};

const getComparableQuotedProfessionals = (professionals: ProjectProfessional[]) => {
  return [...professionals]
    .filter((pp) => Number.isFinite(getNumericQuote(pp.quoteAmount)))
    .sort((a, b) => getNumericQuote(a.quoteAmount) - getNumericQuote(b.quoteAmount));
};

export const ProfessionalsTab: React.FC<ProfessionalsTabProps> = ({
  project,
  professionals,
  siteAccessRequests = [],
  expandedAccordions,
  onToggleAccordion,
  accessToken,
  onOpenChat,
  onOpenAccessSchedule,
  onAwarded,
  onProfessionalsChanged,
  onActionBusy,
  actionBusy,
  onNavigateTab,
}) => {
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [workflowModalCompletedLabel, setWorkflowModalCompletedLabel] = useState('');
  const [workflowModalNextStep, setWorkflowModalNextStep] = useState<WorkflowNextStep | null>(null);
  const [detailsPro, setDetailsPro] = useState<Professional | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleOpenProDetails = async (professionalId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/professionals/${professionalId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const pro = await res.json();
        setDetailsPro(pro);
        setDetailsOpen(true);
      }
    } catch { /* silently fail */ }
  };

  const openWorkflowModal = async (completedLabel: string) => {
    if (!accessToken) return;

    try {
      const next = await fetchPrimaryNextStep(project.id, accessToken, {
        cacheScope: `client-professionals-modal:${project.id}`,
        forceRefresh: true,
      });
      const tab = next?.actionKey ? getClientTabForAction(next.actionKey) : undefined;
      setWorkflowModalCompletedLabel(completedLabel);
      setWorkflowModalNextStep(
        next
          ? {
              actionLabel: next.actionLabel,
              description: next.description,
              requiresAction: Boolean(next.requiresAction),
              tab,
              waitingFor: !next.requiresAction ? inferWaitingParty(next.actionKey) : undefined,
            }
          : null,
      );
      setWorkflowModalOpen(true);
    } catch {
      toast.success(completedLabel);
    }
  };

  const comparableQuotedProfessionals = getComparableQuotedProfessionals(professionals);
  const lowestQuoteProfessional = comparableQuotedProfessionals[0];
  const earliestStartProfessional = [...comparableQuotedProfessionals]
    .filter((pp) => !!pp.quoteEstimatedStartAt)
    .sort((a, b) => new Date(a.quoteEstimatedStartAt || 0).getTime() - new Date(b.quoteEstimatedStartAt || 0).getTime())[0];
  const quickestDurationProfessional = [...comparableQuotedProfessionals]
    .filter((pp) => Number.isFinite(Number(pp.quoteEstimatedDurationMinutes)) && Number(pp.quoteEstimatedDurationMinutes) > 0)
    .sort((a, b) => Number(a.quoteEstimatedDurationMinutes || 0) - Number(b.quoteEstimatedDurationMinutes || 0))[0];
  const biddingProfessionals = [...professionals].filter(
    (p) => !['awarded', 'declined', 'rejected', 'withdrawn', 'award_reversed'].includes((p.status || '').toLowerCase()),
  ).sort((a, b) => {
    const aHasQuote = Number.isFinite(getNumericQuote(a.quoteAmount)) ? 1 : 0;
    const bHasQuote = Number.isFinite(getNumericQuote(b.quoteAmount)) ? 1 : 0;
    if (aHasQuote !== bHasQuote) return bHasQuote - aHasQuote;
    const aQuote = getNumericQuote(a.quoteAmount);
    const bQuote = getNumericQuote(b.quoteAmount);
    if (Number.isFinite(aQuote) && Number.isFinite(bQuote)) return aQuote - bQuote;
    return (a.professional.fullName || a.professional.businessName || '').localeCompare(b.professional.fullName || b.professional.businessName || '');
  });
  const awardedProfessional = professionals.find((p) => p.status === 'awarded');
  const declinedProfessionals = professionals.filter((p) => p.status === 'declined');
  const isClass3Project = String(project?.projectScale || '').toUpperCase() === 'SCALE_3';
  const isClass1Or2Project = ['SCALE_1', 'SCALE_2'].includes(
    String(project?.projectScale || '').toUpperCase(),
  );
  const pendingAccessByProfessionalId = new Map(
    siteAccessRequests
      .filter((request) => request.status === 'pending' && request.professional?.id)
      .map((request) => [request.professional!.id, request]),
  );

  const handleAwarded = async (professional: ProjectProfessional) => {
    if (!accessToken) return;
    try {
      onActionBusy?.('award');
      const res = await fetch(
        `${API_BASE_URL}/projects/${project.id}/award/${professional.professionalId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to award quote');
      }

      await openWorkflowModal('Quote awarded successfully!');
      await onProfessionalsChanged?.();
      onAwarded?.(professional);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to award quote';
      toast.error(msg);
    } finally {
      onActionBusy?.(null);
    }
  };

  const handleReject = async (professional: ProjectProfessional) => {
    if (!accessToken) return;
    try {
      onActionBusy?.(`reject-${professional.id}`);
      const res = await fetch(
        `${API_BASE_URL}/client/projects/${professional.id}/quote/reject`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        throw new Error('Failed to decline quote');
      }

      toast.success('Quote declined.');
      await onProfessionalsChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to decline quote';
      toast.error(msg);
    } finally {
      onActionBusy?.(null);
    }
  };

  const handleRequestBetter = async (professional: ProjectProfessional) => {
    if (!accessToken) return;
    try {
      onActionBusy?.(`request-better-${professional.id}`);
      const res = await fetch(
        `${API_BASE_URL}/projects/${project.id}/counter-request/${professional.professionalId}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to request a better quote');
      }

      await openWorkflowModal('Requested a revised quote.');
      await onProfessionalsChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to request a better quote';
      toast.error(msg);
    } finally {
      onActionBusy?.(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Required Trades - always visible */}
      <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] p-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">Required Trades</p>
        {project.tradesRequired && project.tradesRequired.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {project.tradesRequired.map((trade: string) => (
              <span key={trade} className="inline-flex items-center rounded-full border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.92)] px-2.5 py-1 text-xs font-medium text-slate-800">
                {trade}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No specific trades recorded for this project.</p>
        )}
      </div>

      <AccordionGroup>
        {/* Bidding Board */}
        <AccordionItem
          id="bidding-board"
          title="Bidding Board"
          badge={biddingProfessionals.length > 0 ? biddingProfessionals.length.toString() : undefined}
          isOpen={expandedAccordions['bidding-board'] !== false}
          onToggle={onToggleAccordion}
        >
          {biddingProfessionals.length === 0 ? (
            <p className="text-sm text-slate-600">No invited professionals are currently active in bidding.</p>
          ) : (
            <div className="space-y-3">
              {biddingProfessionals.map((pp) => {
                const displayName = pp.professional.fullName || pp.professional.businessName || 'Professional';
                const hasQuote = Number.isFinite(getNumericQuote(pp.quoteAmount));
                const scopedTrades = Array.isArray(pp.quoteRequestedTrades)
                  ? pp.quoteRequestedTrades.filter((trade) => typeof trade === 'string' && trade.trim().length > 0)
                  : [];
                const breakdownItems = getQuoteBreakdownClientItems(pp.quoteBreakdown);
                const isLowestQuote = lowestQuoteProfessional?.id === pp.id;
                const isEarliestStart = earliestStartProfessional?.id === pp.id;
                const isQuickestDuration = quickestDurationProfessional?.id === pp.id;
                const pendingSiteAccess = pendingAccessByProfessionalId.get(pp.professionalId);
                return (
                  <div
                    key={pp.id}
                    className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] p-4 transition hover:border-[rgba(215,107,78,0.45)]"
                  >
                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="truncate text-left font-semibold text-slate-900 hover:text-[#b94e2d] hover:underline transition"
                          onClick={() => handleOpenProDetails(pp.professional.id)}
                        >
                          {displayName}
                        </button>
                      </div>

                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        {hasQuote ? (
                          <span
                            className="rounded-md border border-[rgba(46,125,50,0.35)] bg-[#F5EEDB] px-3 py-1.5 text-lg font-bold leading-none text-emerald-700"
                          >
                            {formatHKD(pp.quoteAmount)}
                          </span>
                        ) : (
                          <span className="rounded-md border border-[rgba(120,53,15,0.2)] bg-[rgba(245,238,219,0.9)] px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Awaiting quote
                          </span>
                        )}
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {isLowestQuote && (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Cheapest
                            </span>
                          )}
                          {isEarliestStart && (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Soonest
                            </span>
                          )}
                          {isQuickestDuration && (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Fastest
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {pp.quoteReminderSentAt && (
                      <div className="mb-3 flex items-center gap-2 rounded-md border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-3 py-2 text-xs text-[rgba(144,86,30,0.95)]">
                        <span>⏰</span>
                        <span>
                          <strong>+24h extension granted</strong>
                          {pp.quoteExtendedUntil && (
                            <> · New deadline: <strong>{formatDate(pp.quoteExtendedUntil)}</strong></>
                          )}
                        </span>
                      </div>
                    )}

                    {pendingSiteAccess && (
                      <button
                        type="button"
                        onClick={() => onOpenAccessSchedule?.()}
                        className="site-access-throb mb-3 w-full rounded-md border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.88)] px-3 py-2 text-left text-xs text-[rgba(176,74,46,0.95)] hover:bg-[rgba(255,231,220,0.95)]"
                      >
                        <span className="font-semibold">Site access request pending</span>
                        <span className="mt-1 block text-[rgba(176,74,46,0.9)]">
                          {pendingSiteAccess.visitScheduledAt
                            ? `Proposed: ${formatDate(pendingSiteAccess.visitScheduledAt)}`
                            : 'Professional is waiting for your access response.'}
                        </span>
                        <span className="mt-1 inline-block font-semibold underline underline-offset-2">
                          Open Access & Schedule
                        </span>
                      </button>
                    )}

                    <div className="mb-3 rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.8)] p-3">
                      <div className="mb-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Trade Scope</p>
                        {scopedTrades.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {scopedTrades.map((trade) => (
                              <span
                                key={`scope-${pp.id}-${trade}`}
                                className="rounded-full border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.92)] px-2 py-0.5 text-[11px] font-semibold text-[rgba(144,86,30,0.95)]"
                              >
                                {trade}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600">Scope not tagged yet for this professional.</p>
                        )}
                      </div>

                      {(() => {
                        const scheduleText = formatScheduleWindow(pp.quoteEstimatedStartAt, pp.quoteEstimatedDurationMinutes);
                        const statusLower = (pp.status || '').toLowerCase();

                        let summary = `${displayName} is reviewing your project invitation.`;
                        if (statusLower === 'accepted') {
                          summary = `${displayName} has accepted your project.`;
                        } else if (statusLower === 'declined' || statusLower === 'rejected') {
                          summary = `${displayName} has declined your project.`;
                        } else if (hasQuote && statusLower === 'counter_requested') {
                          summary = `${displayName} submitted a quote and you asked for an improved offer.`;
                        } else if (hasQuote) {
                          if (scheduleText !== '—') {
                            summary = `${displayName} can carry out the work ${scheduleText}.`;
                          } else if (isClass3Project) {
                            summary = `${displayName} has shared a quote. Schedule details are pending.`;
                          } else {
                            summary = `${displayName} has shared a quote. Schedule details are typically finalised after award.`;
                          }
                        }

                        return (
                          <>
                            <p className="text-sm text-slate-700">{summary}</p>
                            {pp.quotedAt && (
                              <p className="mt-1 text-xs text-slate-600">Quoted on {formatShortDayDateFromString(pp.quotedAt)}</p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {pp.quoteNotes && (
                      <div className="mb-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] p-2 text-sm text-slate-700">
                        <p className="mb-1 text-xs font-semibold text-slate-800">Notes</p>
                        <p>{pp.quoteNotes}</p>
                      </div>
                    )}

                    {breakdownItems.length > 0 && (
                      <div className="mb-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Quote breakdown</p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {breakdownItems.map((item) => (
                            <div key={`${pp.id}-${item.code}`} className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.9)] px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{item.label}</p>
                              <p className="text-sm font-semibold text-slate-900">{formatHKD(item.amount)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pp.quoteAmount && (
                      <div className={`grid gap-2 ${isClass1Or2Project ? 'grid-cols-3' : 'grid-cols-4'}`}>
                        <button
                          type="button"
                          onClick={() => onOpenChat?.(pp)}
                          className="inline-flex w-full items-center justify-center rounded-md border border-blue-700 bg-blue-600 px-2 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                          aria-label="Chat"
                        >
                          <span aria-hidden="true">💬</span>
                          <span className="hidden sm:inline ml-1">Chat</span>
                        </button>
                        {!isClass1Or2Project && (
                          <button
                            type="button"
                            onClick={() => handleRequestBetter(pp)}
                            disabled={actionBusy === `request-better-${pp.id}`}
                            className="inline-flex w-full items-center justify-center rounded-md border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-2 py-2 text-sm font-semibold text-[rgba(144,86,30,0.95)] transition hover:bg-[rgba(255,239,218,0.98)] disabled:opacity-50"
                            aria-label="Improve offer"
                          >
                            {actionBusy === `request-better-${pp.id}` ? '…' : (
                              <>
                                <span aria-hidden="true">↺</span>
                                <span className="hidden sm:inline ml-1">Improve offer</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAwarded(pp)}
                          disabled={actionBusy === 'award'}
                          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-2 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                          aria-label="Award"
                        >
                          {actionBusy === 'award' ? '…' : (
                            <>
                              <span aria-hidden="true">✓</span>
                              <span className="hidden sm:inline ml-1">Award</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(pp)}
                          disabled={actionBusy === `reject-${pp.id}`}
                          className="inline-flex w-full items-center justify-center rounded-md border border-[rgba(151,17,56,0.9)] bg-[rgba(190,24,93,0.96)] px-2 py-2 text-sm font-semibold text-white transition hover:bg-[rgba(157,23,77,0.98)] disabled:opacity-50"
                          aria-label="Decline"
                        >
                          <span aria-hidden="true">✕</span>
                          <span className="hidden sm:inline ml-1">Decline</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </AccordionItem>

        {/* Awarded Professional */}
        {awardedProfessional && (
          <AccordionItem
            id="awarded-professional"
            title="Awarded Professional"
            isOpen={expandedAccordions['awarded-professional'] !== false}
            onToggle={onToggleAccordion}
          >
            <div className="space-y-3">
              {(() => {
                const breakdownItems = getQuoteBreakdownClientItems(awardedProfessional.quoteBreakdown);
                if (breakdownItems.length === 0) return null;

                return (
                  <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-700">Awarded breakdown</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {breakdownItems.map((item) => (
                        <div key={`awarded-${item.code}`} className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.9)] px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{item.label}</p>
                          <p className="text-sm font-semibold text-slate-900">{formatHKD(item.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-slate-700">Trades Awarded</p>
                {Array.isArray(awardedProfessional.quoteRequestedTrades) && awardedProfessional.quoteRequestedTrades.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {awardedProfessional.quoteRequestedTrades.map((trade) => (
                      <span
                        key={`awarded-trade-${awardedProfessional.id}-${trade}`}
                        className="rounded-full border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-2 py-0.5 text-[11px] font-semibold text-[rgba(144,86,30,0.95)]"
                      >
                        {trade}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No awarded trade tags are recorded for this professional yet.</p>
                )}
              </div>

              <div className="rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,245,238,0.92)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {awardedProfessional.professional.fullName || awardedProfessional.professional.businessName || awardedProfessional.professional.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-[rgba(215,107,78,0.95)] px-3 py-1 text-xs font-semibold text-white">
                    ✓ Awarded
                  </span>
                </div>

                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(null)}
                    className="inline-flex items-center rounded-md border border-[rgba(120,53,15,0.2)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-[rgba(245,238,219,0.9)]"
                  >
                    💬 Open project chat
                  </button>
                </div>

                <div className="grid gap-3 mb-3">
                  <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-slate-700">Awarded Quote</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{formatHKD(awardedProfessional.quoteAmount)}</p>
                  </div>

                  {awardedProfessional.invoice && (
                    <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-white p-3">
                      <p className="text-xs font-semibold uppercase text-slate-700">Invoice Status</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
                        {awardedProfessional.invoice.paymentStatus}
                      </p>
                      {awardedProfessional.invoice.paidAt && (
                        <p className="mt-1 text-xs text-slate-600">Paid: {formatDate(awardedProfessional.invoice.paidAt)}</p>
                      )}
                    </div>
                  )}
                </div>

                {awardedProfessional.quoteNotes && (
                  <div className="mb-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.82)] p-3">
                    <p className="mb-1 text-xs font-semibold text-slate-800">Quote Notes</p>
                    <p className="text-sm text-slate-700">{awardedProfessional.quoteNotes}</p>
                  </div>
                )}

                <div className="mb-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.8)] p-3">
                  <p className="text-sm text-slate-700">
                    {(awardedProfessional.professional.fullName || awardedProfessional.professional.businessName || awardedProfessional.professional.email)} has quoted {formatHKD(awardedProfessional.quoteAmount)} and was awarded for this project{awardedProfessional.quoteEstimatedStartAt ? ` ${formatScheduleWindow(awardedProfessional.quoteEstimatedStartAt, awardedProfessional.quoteEstimatedDurationMinutes)}` : ''}.
                  </p>
                  {awardedProfessional.quotedAt && (
                    <p className="mt-1 text-xs text-slate-600">Quoted on {formatShortDayDateFromString(awardedProfessional.quotedAt)}</p>
                  )}
                </div>
              </div>
            </div>
          </AccordionItem>
        )}

        {/* Declined Professionals */}
        {declinedProfessionals.length > 0 && (
          <AccordionItem
            id="declined-professionals"
            title="Declined Professionals"
            badge={declinedProfessionals.length.toString()}
            isOpen={expandedAccordions['declined-professionals'] === true}
            onToggle={onToggleAccordion}
          >
            <div className="space-y-3">
              {declinedProfessionals.map((pp) => {
                const displayName = pp.professional.fullName || pp.professional.businessName || 'Professional';
                return (
                  <div key={pp.id} className="rounded-lg border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-slate-900">{displayName}</p>
                      </div>
                      <span className="rounded border border-[rgba(215,107,78,0.4)] bg-[rgba(255,231,220,0.95)] px-2 py-1 text-xs font-semibold text-[rgba(176,74,46,0.95)]">
                        Declined
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-700">
                      {displayName} has declined your project.
                    </p>
                    {pp.quoteAmount && (
                      <p className="mt-1 text-sm text-slate-700">
                        {displayName} previously quoted {formatHKD(pp.quoteAmount)}.
                      </p>
                    )}
                    {pp.quotedAt && (
                      <p className="mt-1 text-xs text-slate-600">Quoted on {formatShortDayDateFromString(pp.quotedAt)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </AccordionItem>
        )}
      </AccordionGroup>

      <WorkflowCompletionModal
        isOpen={workflowModalOpen}
        completedLabel={workflowModalCompletedLabel}
        nextStep={workflowModalNextStep}
        showPrimaryActionOverride={Boolean(workflowModalNextStep?.tab)}
        onNavigate={
          workflowModalNextStep?.tab
            ? () => onNavigateTab?.(workflowModalNextStep.tab as string)
            : undefined
        }
        onClose={() => setWorkflowModalOpen(false)}
      />

      <ProfessionalDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        professional={detailsPro}
      />
    </div>
  );
};
