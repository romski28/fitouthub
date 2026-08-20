'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import {
  getQuoteBreakdownClientItems,
  getQuoteBreakdownClientTotal,
  type StoredQuoteBreakdown,
} from '@/lib/quote-breakdown';

export interface QuoteDetail {
  name: string;
  quoteAmount?: number | string | null;
  quoteBreakdown?: StoredQuoteBreakdown | null;
  quoteNotes?: string | null;
  quoteEstimatedStartAt?: string | null;
  quoteEstimatedDurationMinutes?: number | null;
  quoteEstimatedDurationUnit?: 'hours' | 'days' | null;
}

interface QuoteBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteDetail | null;
}

const formatHKD = (value: number | string | null | undefined) => {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);
};

const formatDate = (date?: string | null) => {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const formatDuration = (minutes?: number | null) => {
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

export function QuoteBreakdownModal({ isOpen, onClose, quote }: QuoteBreakdownModalProps) {
  const [showSchedule, setShowSchedule] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) setShowSchedule(false);
  }, [isOpen]);

  if (!isOpen || !quote) return null;

  const items = getQuoteBreakdownClientItems(quote.quoteBreakdown);
  const total = getQuoteBreakdownClientTotal(quote.quoteBreakdown, quote.quoteAmount);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg [perspective:1600px]">
        <div
          className="relative h-[86dvh] min-h-[420px] max-h-[720px] [transform-style:preserve-3d] transition-transform duration-500 ease-out"
          style={{ transform: showSchedule ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front — quotation */}
          <div
            className="absolute inset-0 flex h-full flex-col overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl [backface-visibility:hidden]"
            aria-hidden={showSchedule}
          >
            <div className="relative flex items-center justify-between border-b border-[#D4C8A0] px-5 pb-4 pt-5 shrink-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 mb-0.5">Quotation</p>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{quote.name}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full border border-red-500 bg-red-500 text-lg font-semibold text-white transition hover:bg-red-600"
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="next-step-scrollbar flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No itemised breakdown was provided.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#D4C8A0] bg-white">
                  {items.map((item, idx) => (
                    <div
                      key={`${item.code}-${idx}`}
                      className={`flex items-start justify-between gap-4 px-4 py-3 ${idx > 0 ? 'border-t border-[rgba(120,53,15,0.10)]' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{item.label}</p>
                        {item.notes ? (
                          <p className="mt-0.5 text-xs italic leading-relaxed text-slate-500">{item.notes}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-slate-900">{formatHKD(item.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {quote.quoteNotes ? (
                <div className="mt-4 rounded-xl border border-[#D4C8A0] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{quote.quoteNotes}</p>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#D4C8A0] px-5 py-4 shrink-0">
              <p className="text-sm font-semibold text-slate-500">Total</p>
              <p className="text-xl font-bold text-slate-900">{formatHKD(total)}</p>
            </div>

            <div className="border-t border-[#D4C8A0] px-5 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-[#F5EEDE]"
              >
                View proposed schedule →
              </button>
            </div>
          </div>

          {/* Back — schedule */}
          <div
            className="absolute inset-0 flex h-full flex-col overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl [backface-visibility:hidden]"
            style={{ transform: 'rotateY(180deg)' }}
            aria-hidden={!showSchedule}
          >
            <div className="relative flex items-center justify-between border-b border-[#D4C8A0] px-5 pb-4 pt-5 shrink-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 mb-0.5">Proposed schedule</p>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{quote.name}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-full border border-red-500 bg-red-500 text-lg font-semibold text-white transition hover:bg-red-600"
                aria-label="Close"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-[#D4C8A0] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed start date</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{formatDate(quote.quoteEstimatedStartAt)}</p>
                </div>
                <div className="rounded-xl border border-[#D4C8A0] bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated duration</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{formatDuration(quote.quoteEstimatedDurationMinutes)}</p>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Schedule details are indicative and are typically finalised after the quotation is accepted.
                </p>
              </div>
            </div>

            <div className="border-t border-[#D4C8A0] px-5 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
                className="w-full rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-[#F5EEDE]"
              >
                ← Back to quotation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
