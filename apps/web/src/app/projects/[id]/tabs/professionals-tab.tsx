'use client';

import React from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

interface ProjectProfessional {
  id: string;
  professionalId: string;
  projectId: string;
  status: string;
  quoteAmount?: string | number;
  quoteNotes?: string;
  quoteEstimatedStartAt?: string;
  quoteEstimatedDurationMinutes?: number;
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

interface ProfessionalsTabProps {
  project: any;
  professionals: ProjectProfessional[];
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  accessToken: string;
  onOpenChat?: (professional: ProjectProfessional | null) => void;
  onAwarded?: (professional: ProjectProfessional) => void;
  onProfessionalsChanged?: () => void | Promise<void>;
  onActionBusy?: (kind: string | null) => void;
  actionBusy?: string | null;
}

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
  expandedAccordions,
  onToggleAccordion,
  accessToken,
  onOpenChat,
  onAwarded,
  onProfessionalsChanged,
  onActionBusy,
  actionBusy,
}) => {
  const comparableQuotedProfessionals = getComparableQuotedProfessionals(professionals);
  const lowestQuoteProfessional = comparableQuotedProfessionals[0];
  const earliestStartProfessional = [...comparableQuotedProfessionals]
    .filter((pp) => !!pp.quoteEstimatedStartAt)
    .sort((a, b) => new Date(a.quoteEstimatedStartAt || 0).getTime() - new Date(b.quoteEstimatedStartAt || 0).getTime())[0];
  const shortestDurationProfessional = [...comparableQuotedProfessionals]
    .filter((pp) => !!pp.quoteEstimatedDurationMinutes)
    .sort((a, b) => (a.quoteEstimatedDurationMinutes || Number.MAX_SAFE_INTEGER) - (b.quoteEstimatedDurationMinutes || Number.MAX_SAFE_INTEGER))[0];
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

      toast.success('Quote awarded successfully!');
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

      toast.success('Requested a revised quote.');
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
      {comparableQuotedProfessionals.length > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-300">Decision snapshot</p>
              <h3 className="text-lg font-bold text-white">Review the best signals before you award</h3>
              <p className="text-sm text-slate-300">
                Quotes are sorted so you can compare price, start speed, duration, and negotiation options without leaving this tab.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <InsightCard
                label="Lowest quote"
                primary={lowestQuoteProfessional ? formatHKD(lowestQuoteProfessional.quoteAmount) : '—'}
                secondary={lowestQuoteProfessional ? (lowestQuoteProfessional.professional.fullName || lowestQuoteProfessional.professional.businessName || 'Professional') : undefined}
              />
              <InsightCard
                label="Earliest start"
                primary={earliestStartProfessional?.quoteEstimatedStartAt ? formatDate(earliestStartProfessional.quoteEstimatedStartAt) : '—'}
                secondary={earliestStartProfessional ? (earliestStartProfessional.professional.fullName || earliestStartProfessional.professional.businessName || 'Professional') : undefined}
              />
              <InsightCard
                label="Shortest duration"
                primary={shortestDurationProfessional?.quoteEstimatedDurationMinutes ? formatDuration(shortestDurationProfessional.quoteEstimatedDurationMinutes) : '—'}
                secondary={shortestDurationProfessional ? (shortestDurationProfessional.professional.fullName || shortestDurationProfessional.professional.businessName || 'Professional') : undefined}
              />
            </div>
          </div>

          {comparableQuotedProfessionals.length > 1 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/60">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-slate-300">
                    <th className="px-3 py-2 font-semibold">Professional</th>
                    <th className="px-3 py-2 font-semibold">Quote</th>
                    <th className="px-3 py-2 font-semibold">Start</th>
                    <th className="px-3 py-2 font-semibold">Duration</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparableQuotedProfessionals.map((pp) => {
                    const isLowest = lowestQuoteProfessional?.id === pp.id;
                    const isFastest = earliestStartProfessional?.id === pp.id;
                    const isShortest = shortestDurationProfessional?.id === pp.id;
                    return (
                      <tr key={`compare-${pp.id}`} className="border-b border-slate-800 last:border-b-0">
                        <td className="px-3 py-2 text-white">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold">{pp.professional.fullName || pp.professional.businessName || 'Professional'}</span>
                            <div className="flex flex-wrap gap-1">
                              {isLowest && <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">Lowest quote</span>}
                              {isFastest && <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[11px] font-semibold text-sky-200">Earliest start</span>}
                              {isShortest && <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">Shortest duration</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-white font-semibold">{formatHKD(pp.quoteAmount)}</td>
                        <td className="px-3 py-2 text-slate-300">{formatDate(pp.quoteEstimatedStartAt)}</td>
                        <td className="px-3 py-2 text-slate-300">{formatDuration(pp.quoteEstimatedDurationMinutes)}</td>
                        <td className="px-3 py-2 text-slate-300 capitalize">{pp.status.replace(/_/g, ' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Required Trades - always visible */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-white mb-1.5">Required Trades</p>
        {project.tradesRequired && project.tradesRequired.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {project.tradesRequired.map((trade: string) => (
              <span key={trade} className="inline-flex items-center rounded-full bg-sky-950 border border-sky-400 px-2.5 py-1 text-xs font-medium text-white">
                {trade}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-300">No specific trades recorded for this project.</p>
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
            <p className="text-sm text-slate-300">No invited professionals are currently active in bidding.</p>
          ) : (
            <div className="space-y-3">
              {biddingProfessionals.map((pp) => {
                const displayName = pp.professional.fullName || pp.professional.businessName || 'Professional';
                const isLowestQuote = lowestQuoteProfessional?.id === pp.id;
                const isEarliestStart = earliestStartProfessional?.id === pp.id;
                const isShortestDuration = shortestDurationProfessional?.id === pp.id;
                return (
                  <div
                    key={pp.id}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 hover:border-emerald-500/40 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-semibold text-white">{displayName}</p>
                        {(isLowestQuote || isEarliestStart || isShortestDuration) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {isLowestQuote && <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">Lowest quote</span>}
                            {isEarliestStart && <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[11px] font-semibold text-sky-200">Earliest start</span>}
                            {isShortestDuration && <span className="rounded-full bg-violet-600/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">Shortest duration</span>}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold capitalize px-2 py-1 rounded bg-slate-900 text-slate-200 border border-slate-600">
                        {pp.status}
                      </span>
                    </div>

                    {pp.quoteReminderSentAt && (
                      <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                        <span>⏰</span>
                        <span>
                          <strong>+24h extension granted</strong>
                          {pp.quoteExtendedUntil && (
                            <> · New deadline: <strong>{formatDate(pp.quoteExtendedUntil)}</strong></>
                          )}
                        </span>
                      </div>
                    )}

                    {pp.quoteAmount && (
                      <div className="mb-3 p-2 rounded-md bg-slate-900/60 border border-slate-700">
                        <p className="text-xs text-white font-semibold">Quote Price</p>
                        <p className="text-lg font-bold text-white">{formatHKD(pp.quoteAmount)}</p>
                      </div>
                    )}

                    {pp.quoteNotes && (
                      <div className="mb-3 p-2 rounded-md bg-slate-900/60 text-sm text-slate-200 border border-slate-700">
                        <p className="text-xs text-white font-semibold mb-1">Notes</p>
                        <p>{pp.quoteNotes}</p>
                      </div>
                    )}

                    {(pp.quoteEstimatedStartAt || pp.quoteEstimatedDurationMinutes) && (
                      <div className="mb-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-md bg-slate-900/60 p-2 border border-slate-700">
                          <p className="text-xs text-white font-semibold mb-1">Estimated Start</p>
                          <p className="text-sm text-slate-200">{formatDate(pp.quoteEstimatedStartAt)}</p>
                        </div>
                        <div className="rounded-md bg-slate-900/60 p-2 border border-slate-700">
                          <p className="text-xs text-white font-semibold mb-1">Estimated Duration</p>
                          <p className="text-sm text-slate-200">{formatDuration(pp.quoteEstimatedDurationMinutes)}</p>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-400 mb-3">
                      Quoted: {formatDate(pp.quotedAt)}
                    </div>

                    {pp.quoteAmount && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenChat?.(pp)}
                          className="rounded-md bg-sky-900 border border-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 transition"
                        >
                          💬 Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRequestBetter(pp)}
                          disabled={actionBusy === `request-better-${pp.id}`}
                          className="rounded-md border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 transition"
                        >
                          {actionBusy === `request-better-${pp.id}` ? '…' : 'Request Better Quote'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAwarded(pp)}
                          disabled={actionBusy === 'award'}
                          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                        >
                          {actionBusy === 'award' ? '…' : '✓ Award'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(pp)}
                          disabled={actionBusy === `reject-${pp.id}`}
                          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                        >
                          ✕
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
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">
                      {awardedProfessional.professional.fullName || awardedProfessional.professional.businessName || awardedProfessional.professional.email}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-600 text-white">
                    ✓ Awarded
                  </span>
                </div>

                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(null)}
                    className="inline-flex items-center rounded-md bg-sky-900 border border-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 transition"
                  >
                    💬 Open project chat
                  </button>
                </div>

                <div className="grid gap-3 mb-3">
                  <div className="rounded-md bg-slate-900/60 p-3 border border-emerald-500/40">
                    <p className="text-xs text-white font-semibold uppercase">Awarded Quote</p>
                    <p className="text-lg font-bold text-white mt-1">{formatHKD(awardedProfessional.quoteAmount)}</p>
                  </div>

                  {awardedProfessional.invoice && (
                    <div className="rounded-md bg-slate-900/60 p-3 border border-sky-500/40">
                      <p className="text-xs text-white font-semibold uppercase">Invoice Status</p>
                      <p className="text-sm font-semibold text-white mt-1 capitalize">
                        {awardedProfessional.invoice.paymentStatus}
                      </p>
                      {awardedProfessional.invoice.paidAt && (
                        <p className="text-xs text-slate-300 mt-1">Paid: {formatDate(awardedProfessional.invoice.paidAt)}</p>
                      )}
                    </div>
                  )}
                </div>

                {awardedProfessional.quoteNotes && (
                  <div className="rounded-md bg-slate-900/60 p-3 border border-slate-700 mb-3">
                    <p className="text-xs text-white font-semibold mb-1">Quote Notes</p>
                    <p className="text-sm text-slate-200">{awardedProfessional.quoteNotes}</p>
                  </div>
                )}

                {(awardedProfessional.quoteEstimatedStartAt || awardedProfessional.quoteEstimatedDurationMinutes) && (
                  <div className="grid gap-3 mb-3 sm:grid-cols-2">
                    <div className="rounded-md bg-slate-900/60 p-3 border border-slate-700">
                      <p className="text-xs text-white font-semibold uppercase">Estimated Start</p>
                      <p className="text-sm text-slate-200 mt-1">{formatDate(awardedProfessional.quoteEstimatedStartAt)}</p>
                    </div>
                    <div className="rounded-md bg-slate-900/60 p-3 border border-slate-700">
                      <p className="text-xs text-white font-semibold uppercase">Estimated Duration</p>
                      <p className="text-sm text-slate-200 mt-1">{formatDuration(awardedProfessional.quoteEstimatedDurationMinutes)}</p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-200">
                  Awarded on: {formatDate(awardedProfessional.quotedAt)}
                </p>
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
                  <div key={pp.id} className="rounded-lg border border-rose-500/40 bg-rose-500/15 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-white">{displayName}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-900 text-rose-200 border border-rose-500/40">
                        Declined
                      </span>
                    </div>

                    {pp.quoteAmount && (
                      <p className="text-sm text-white mt-2">
                        <strong>Quote was:</strong> {formatHKD(pp.quoteAmount)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </AccordionItem>
        )}
      </AccordionGroup>
    </div>
  );
};

function InsightCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{primary}</p>
      {secondary && <p className="mt-1 text-xs text-slate-400">{secondary}</p>}
    </div>
  );
}
