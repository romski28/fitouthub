'use client';

import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// Shared start-date negotiation panel
// ---------------------------------------------------------------------------

export interface StartProposalRow {
  id: string;
  status: 'proposed' | 'accepted' | 'declined' | 'superseded' | string;
  proposedByRole?: 'professional' | 'client' | string;
  proposedByUserId?: string | null;
  proposedStartAt: string;
  durationMinutes: number;
  notes?: string | null;
  responseNotes?: string | null;
  respondedAt?: string | null;
  projectedEndAt?: string;
  createdAt: string;
  professional?: { businessName?: string | null; fullName?: string | null };
}

export interface StartDateNegotiationPanelProps {
  proposals: StartProposalRow[];
  proposalLoading: boolean;
  proposalBusyId: string | null;
  viewerRole: 'client' | 'professional';
  updateDateByProposal: Record<string, string>;
  updateTimeByProposal: Record<string, string>;
  proposalResponseNotes: Record<string, string>;
  setUpdateDateByProposal: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setUpdateTimeByProposal: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setProposalResponseNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onRespond: (proposalId: string, status: 'accepted' | 'updated') => void;
  // professional-only send form
  onSubmitNew?: () => void;
  proposalSubmitting?: boolean;
  proposalDate?: string;
  proposalTime?: string;
  proposalDurationHours?: string;
  proposalNotes?: string;
  prefilledFromQuote?: boolean;
  proposalLoaded?: boolean;
  setProposalDate?: React.Dispatch<React.SetStateAction<string>>;
  setProposalTime?: React.Dispatch<React.SetStateAction<string>>;
  setProposalDurationHours?: React.Dispatch<React.SetStateAction<string>>;
  setProposalNotes?: React.Dispatch<React.SetStateAction<string>>;
  setPrefilledFromQuote?: React.Dispatch<React.SetStateAction<boolean>>;
  setProposalFormInitialized?: React.Dispatch<React.SetStateAction<boolean>>;
}

const fmtDT = (dateStr?: string) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-HK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
};

const fmtDuration = (minutes?: number) => {
  if (!minutes) return '—';
  const h = minutes / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} hr${h === 1 ? '' : 's'}`;
};

const statusBadge = (status: string) => {
  if (status === 'accepted') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (status === 'proposed') return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
  if (status === 'declined') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
};

export const StartDateNegotiationPanel: React.FC<StartDateNegotiationPanelProps> = ({
  proposals,
  proposalLoading,
  proposalBusyId,
  viewerRole,
  updateDateByProposal,
  updateTimeByProposal,
  proposalResponseNotes,
  setUpdateDateByProposal,
  setUpdateTimeByProposal,
  setProposalResponseNotes,
  onRespond,
  onSubmitNew,
  proposalSubmitting,
  proposalDate,
  proposalTime,
  proposalDurationHours,
  proposalNotes,
  prefilledFromQuote,
  setProposalDate,
  setProposalTime,
  setProposalDurationHours,
  setProposalNotes,
  setPrefilledFromQuote,
  setProposalFormInitialized,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);

  const openProposal = proposals.find((p) => p.status === 'proposed') ?? null;
  const agreedProposal = proposals.find((p) => p.status === 'accepted') ?? null;
  const isAgreed = Boolean(agreedProposal);
  const noneYet = proposals.length === 0 && !proposalLoading;

  const canAct = openProposal && openProposal.proposedByRole !== viewerRole;
  const isMyTurn = Boolean(canAct);
  const waitingForOther = openProposal && openProposal.proposedByRole === viewerRole;
  const otherPartyLabel = viewerRole === 'client' ? 'Professional' : 'Client';
  const myPartyLabel = viewerRole === 'client' ? 'Client' : 'Professional';

  const inputRowClass =
    'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  const inputClass =
    'w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white ' +
    '[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:brightness-150';

  const activeProposalId = openProposal?.id ?? '';

  const allShown = isAgreed ? proposals : proposals.slice(0, 8);

  return (
    <div className={`rounded-lg border ${isAgreed ? 'border-slate-700 bg-slate-900/40' : 'border-blue-500/30 bg-blue-500/10'} p-5 space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Project Start Date</p>
          <h3 className="mt-0.5 text-base font-semibold text-white">
            {isAgreed
              ? `Agreed: ${fmtDT(agreedProposal!.proposedStartAt)}`
              : openProposal
                ? `Awaiting ${openProposal.proposedByRole === viewerRole ? otherPartyLabel : myPartyLabel} response`
                : 'No proposal yet'}
          </h3>
        </div>
        {isAgreed && (
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            {historyOpen ? 'Hide history' : 'Show history'}
          </button>
        )}
      </div>

      {proposalLoading ? (
        <p className="text-sm text-slate-400">Loading negotiation history…</p>
      ) : (
        <>
          {/* ── Action form ── */}
          {!isAgreed && (
            <>
              {/* Professional initial send form */}
              {viewerRole === 'professional' && proposals.length === 0 && (
                <div className="space-y-3">
                  {prefilledFromQuote && (
                    <div className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs text-sky-200">
                      Prefilled from your awarded quote timing. Review and send to the client.
                    </div>
                  )}
                  <div className={inputRowClass}>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Start date</span>
                      <input type="date" value={proposalDate} onChange={(e) => { setProposalDate?.(e.target.value); setPrefilledFromQuote?.(false); setProposalFormInitialized?.(true); }} className={inputClass} />
                    </label>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Start time</span>
                      <input type="time" value={proposalTime} onChange={(e) => { setProposalTime?.(e.target.value); setPrefilledFromQuote?.(false); setProposalFormInitialized?.(true); }} className={inputClass} />
                    </label>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Duration (hrs)</span>
                      <input type="number" min="0.5" step="0.5" value={proposalDurationHours} onChange={(e) => { setProposalDurationHours?.(e.target.value); setPrefilledFromQuote?.(false); setProposalFormInitialized?.(true); }} className={inputClass} />
                    </label>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Notes (optional)</span>
                      <input type="text" value={proposalNotes} onChange={(e) => { setProposalNotes?.(e.target.value); setPrefilledFromQuote?.(false); setProposalFormInitialized?.(true); }} placeholder="Access, materials, etc." className={inputClass} />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={onSubmitNew} disabled={proposalSubmitting} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                      {proposalSubmitting ? 'Sending…' : prefilledFromQuote ? 'Confirm & Send to Client' : 'Send Proposal'}
                    </button>
                  </div>
                </div>
              )}

              {/* Counter form – shown when it's this viewer's turn to respond */}
              {isMyTurn && openProposal && (
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 space-y-3">
                  <p className="text-xs text-slate-300">
                    {otherPartyLabel} proposed <span className="font-semibold text-white">{fmtDT(openProposal.proposedStartAt)}</span>{' '}
                    ({fmtDuration(openProposal.durationMinutes)}).{openProposal.notes ? ` Notes: "${openProposal.notes}"` : ''}{' '}
                    Accept it or send back an updated date.
                  </p>
                  <div className={inputRowClass}>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Updated start date</span>
                      <input type="date" value={updateDateByProposal[activeProposalId] || ''} onChange={(e) => setUpdateDateByProposal((prev) => ({ ...prev, [activeProposalId]: e.target.value }))} className={inputClass} />
                    </label>
                    <label className="text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Updated start time</span>
                      <input type="time" value={updateTimeByProposal[activeProposalId] || ''} onChange={(e) => setUpdateTimeByProposal((prev) => ({ ...prev, [activeProposalId]: e.target.value }))} className={inputClass} />
                    </label>
                    <label className="col-span-1 sm:col-span-2 text-sm text-slate-200">
                      <span className="mb-1 block text-xs">Note (optional)</span>
                      <input type="text" value={proposalResponseNotes[activeProposalId] || ''} onChange={(e) => setProposalResponseNotes((prev) => ({ ...prev, [activeProposalId]: e.target.value }))} placeholder="Any message to the other party" className={inputClass} />
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => onRespond(activeProposalId, 'accepted')} disabled={proposalBusyId === activeProposalId} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {proposalBusyId === activeProposalId ? 'Saving…' : 'Accept'}
                    </button>
                    <button onClick={() => onRespond(activeProposalId, 'updated')} disabled={proposalBusyId === activeProposalId} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                      {proposalBusyId === activeProposalId ? 'Saving…' : 'Send Update'}
                    </button>
                  </div>
                </div>
              )}

              {/* Waiting state */}
              {waitingForOther && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                  Your proposal is with the {otherPartyLabel.toLowerCase()}. This panel will unlock when they respond.
                </div>
              )}

              {/* No proposal yet (client view) */}
              {viewerRole === 'client' && noneYet && (
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-400">
                  No start proposal yet. The professional will send one from their Schedule tab.
                </div>
              )}
            </>
          )}

          {/* Agreed state summary */}
          {isAgreed && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Start date agreed: <span className="font-semibold">{fmtDT(agreedProposal!.proposedStartAt)}</span>{' '}
              · Duration: <span className="font-semibold">{fmtDuration(agreedProposal!.durationMinutes)}</span>
              {agreedProposal!.projectedEndAt && <> · Estimated finish: <span className="font-semibold">{fmtDT(agreedProposal!.projectedEndAt)}</span></>}
            </div>
          )}

          {/* ── Negotiation history table ── */}
          {(!isAgreed || historyOpen) && allShown.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Negotiation history</p>
              <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-950/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="px-3 py-2 text-left font-semibold">Date &amp; Time</th>
                      <th className="px-3 py-2 text-left font-semibold">Duration</th>
                      <th className="px-3 py-2 text-left font-semibold">Proposed by</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                      <th className="px-3 py-2 text-left font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allShown.map((p, i) => (
                      <tr key={p.id} className={`border-b border-slate-800 align-top ${i === 0 ? 'bg-slate-900/50' : ''}`}>
                        <td className="px-3 py-2 font-medium text-white whitespace-nowrap">{fmtDT(p.proposedStartAt)}</td>
                        <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{fmtDuration(p.durationMinutes)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${p.proposedByRole === 'client' ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-sky-500/20 text-sky-300 border-sky-500/40'}`}>
                            {p.proposedByRole ?? 'professional'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300 max-w-xs">
                          {p.notes && <span>{p.notes}</span>}
                          {p.notes && p.responseNotes && <span className="mx-1 text-slate-600">·</span>}
                          {p.responseNotes && <span className="text-slate-400">{p.responseNotes}</span>}
                          {!p.notes && !p.responseNotes && <span className="text-slate-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
