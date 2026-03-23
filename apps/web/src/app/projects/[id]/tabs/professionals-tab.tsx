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
  onAwarded?: (professional: ProjectProfessional) => void;
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

export const ProfessionalsTab: React.FC<ProfessionalsTabProps> = ({
  project,
  professionals,
  expandedAccordions,
  onToggleAccordion,
  accessToken,
  onAwarded,
  onActionBusy,
  actionBusy,
}) => {
  const biddingProfessionals = professionals.filter((p) => ['pending', 'accepted', 'quoted'].includes(p.status));
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to decline quote';
      toast.error(msg);
    } finally {
      onActionBusy?.(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Required Trades - always visible */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1.5">Required Trades</p>
        {project.tradesRequired && project.tradesRequired.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {project.tradesRequired.map((trade: string) => (
              <span key={trade} className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                {trade}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-blue-700">No specific trades recorded for this project.</p>
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
            <p className="text-sm text-slate-600">No professionals have submitted quotes yet.</p>
          ) : (
            <div className="space-y-3">
              {biddingProfessionals.map((pp) => {
                const displayName = pp.professional.fullName || pp.professional.businessName || 'Professional';
                return (
                  <div
                    key={pp.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 hover:border-blue-300 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{displayName}</p>
                      </div>
                      <span className="text-xs font-semibold capitalize px-2 py-1 rounded bg-white text-slate-700 border border-slate-200">
                        {pp.status}
                      </span>
                    </div>

                    {pp.quoteReminderSentAt && (
                      <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
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
                      <div className="mb-3 p-2 rounded-md bg-blue-50 border border-blue-100">
                        <p className="text-xs text-blue-700 font-medium">Quote Price</p>
                        <p className="text-lg font-bold text-blue-900">{formatHKD(pp.quoteAmount)}</p>
                      </div>
                    )}

                    {pp.quoteNotes && (
                      <div className="mb-3 p-2 rounded-md bg-slate-100 text-sm text-slate-800">
                        <p className="text-xs text-slate-600 font-semibold mb-1">Notes</p>
                        <p>{pp.quoteNotes}</p>
                      </div>
                    )}

                    <div className="text-xs text-slate-600 mb-3">
                      Quoted: {formatDate(pp.quotedAt)}
                    </div>

                    {pp.quoteAmount && (
                      <div className="flex gap-2">
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
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-emerald-900">
                      {awardedProfessional.professional.fullName || awardedProfessional.professional.businessName || awardedProfessional.professional.email}
                    </p>
                    <p className="text-sm text-emerald-700 mt-1">{awardedProfessional.professional.email}</p>
                    {awardedProfessional.professional.phone && (
                      <p className="text-sm text-emerald-700">{awardedProfessional.professional.phone}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-600 text-white">
                    ✓ Awarded
                  </span>
                </div>

                <div className="grid gap-3 mb-3">
                  <div className="rounded-md bg-white p-3 border border-emerald-200">
                    <p className="text-xs text-emerald-700 font-semibold uppercase">Awarded Quote</p>
                    <p className="text-lg font-bold text-emerald-900 mt-1">{formatHKD(awardedProfessional.quoteAmount)}</p>
                  </div>

                  {awardedProfessional.invoice && (
                    <div className="rounded-md bg-white p-3 border border-blue-200">
                      <p className="text-xs text-blue-700 font-semibold uppercase">Invoice Status</p>
                      <p className="text-sm font-semibold text-blue-900 mt-1 capitalize">
                        {awardedProfessional.invoice.paymentStatus}
                      </p>
                      {awardedProfessional.invoice.paidAt && (
                        <p className="text-xs text-blue-700 mt-1">Paid: {formatDate(awardedProfessional.invoice.paidAt)}</p>
                      )}
                    </div>
                  )}
                </div>

                {awardedProfessional.quoteNotes && (
                  <div className="rounded-md bg-white p-3 border border-slate-200 mb-3">
                    <p className="text-xs text-slate-600 font-semibold mb-1">Quote Notes</p>
                    <p className="text-sm text-slate-700">{awardedProfessional.quoteNotes}</p>
                  </div>
                )}

                <p className="text-xs text-emerald-700">
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
                const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                return (
                  <div key={pp.id} className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-rose-900">{displayName}</p>
                        <p className="text-xs text-rose-700">{pp.professional.email}</p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-white text-rose-700 border border-rose-200">
                        Declined
                      </span>
                    </div>

                    {pp.quoteAmount && (
                      <p className="text-sm text-rose-900 mt-2">
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
