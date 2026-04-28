'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import ProjectChat from '@/components/project-chat';

interface ClaimModalContent {
  title?: string;
  body?: string;
  detailsBody?: string;
}

type ProcurementEvidence = {
  id: string;
  status: string;
  claimedAmount: number | string;
  invoiceUrls?: string[];
  photoUrls?: string[];
  openingMessage?: string | null;
  notes?: string | null;
  deadlineAt?: string | null;
  createdAt: string;
};

type PaymentMilestone = {
  id: string;
  sequence: number;
};

type PaymentPlan = {
  milestones: PaymentMilestone[];
};

type FinancialSummaryTransaction = {
  id: string;
  type: string;
  status: string;
  amount?: number | string | null;
  notes?: string | null;
};

type ProjectFinancialSummary = {
  transactions?: FinancialSummaryTransaction[];
};

interface MaterialsClaimReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  accessToken: string;
  currentUserRole: 'client' | 'admin';
  selectedEvidenceId?: string | null;
  modalContent?: ClaimModalContent;
  onCompleted?: () => void;
}

type NoteMap = Record<string, { valueText?: string; noteText?: string }>;

function parseItemNotes(notes: string | null | undefined): NoteMap {
  if (!notes) return {};
  const result: NoteMap = {};
  const entries = notes
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^(.*?)(?:\s*\((?:HKD\s*)?([\d.,]+)\))?\s*:\s*(.*)$/i);
    if (match) {
      const filename = match[1].trim();
      const valueText = match[2]?.trim();
      const noteText = match[3]?.trim();
      if (filename) {
        result[filename] = {
          valueText: valueText ? `HKD ${valueText}` : undefined,
          noteText,
        };
      }
      continue;
    }

    const fallback = entry.split(':');
    const filename = fallback[0]?.trim();
    const noteText = fallback.slice(1).join(':').trim();
    if (filename) {
      result[filename] = { noteText: noteText || undefined };
    }
  }

  return result;
}

function filenameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0] || url;
    const segments = clean.split('/');
    return decodeURIComponent(segments[segments.length - 1] || url);
  } catch {
    return url;
  }
}

export default function MaterialsClaimReviewModal({
  isOpen,
  onClose,
  projectId,
  accessToken,
  currentUserRole,
  selectedEvidenceId,
  modalContent,
  onCompleted,
}: MaterialsClaimReviewModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [summary, setSummary] = React.useState<ProjectFinancialSummary | null>(null);
  const [evidence, setEvidence] = React.useState<ProcurementEvidence | null>(null);
  const [authorising, setAuthorising] = React.useState(false);
  const [approvedAmount, setApprovedAmount] = React.useState('');
  const [titleTransferAcknowledged, setTitleTransferAcknowledged] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);

  const allUrls = React.useMemo(
    () => [...(evidence?.invoiceUrls ?? []), ...(evidence?.photoUrls ?? [])],
    [evidence],
  );

  const itemNoteMap = React.useMemo(() => parseItemNotes(evidence?.notes), [evidence?.notes]);

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

  const parseMilestoneMetadataFromNotes = (notes?: string | null): { paymentMilestoneId?: string } | null => {
    if (!notes || typeof notes !== 'string') return null;
    const marker = '__FOH_MILESTONE__';
    const index = notes.indexOf(marker);
    if (index < 0) return null;
    const payload = notes.slice(index + marker.length).trim();
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  React.useEffect(() => {
    if (!isOpen || !projectId || !accessToken) return;

    const load = async () => {
      setLoading(true);
      try {
        const planRes = await fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!planRes.ok) throw new Error('Failed to load payment plan');
        const plan: PaymentPlan = await planRes.json();
        setPaymentPlan(plan);

        const summaryRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (summaryRes.ok) {
          const summaryData: ProjectFinancialSummary = await summaryRes.json();
          setSummary(summaryData);
        } else {
          setSummary(null);
        }

        const m1 = plan.milestones?.find((m) => Number(m.sequence) === 1);
        if (!m1) throw new Error('Milestone 1 not found');

        const evRes = await fetch(
          `${API_BASE_URL}/financial/project/${projectId}/milestones/${m1.id}/procurement-evidence`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!evRes.ok) throw new Error('Failed to load claim');

        const evidenceList: ProcurementEvidence[] = await evRes.json();
        let target = selectedEvidenceId
          ? evidenceList.find((entry) => entry.id === selectedEvidenceId)
          : undefined;

        if (!target) {
          target = evidenceList.find((entry) => String(entry.status).toLowerCase() === 'pending') || evidenceList[0];
        }

        setEvidence(target || null);
        setApprovedAmount(target ? String(target.claimedAmount) : '');
        setTitleTransferAcknowledged(false);
        setLightboxUrl(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load claim data');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isOpen, projectId, accessToken, selectedEvidenceId]);

  const firstMilestone = React.useMemo(
    () => paymentPlan?.milestones?.find((m) => Number(m.sequence) === 1) || null,
    [paymentPlan],
  );

  const milestoneCapAmount = React.useMemo(() => {
    if (!firstMilestone) return 0;
    const txs = Array.isArray(summary?.transactions) ? summary.transactions : [];

    let capAuthorized = 0;
    for (const tx of txs) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      if (!meta?.paymentMilestoneId || meta.paymentMilestoneId !== firstMilestone.id) continue;
      const amount = Number(tx.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (tx.type === 'milestone_foh_allocation_cap' && String(tx.status || '').toLowerCase() === 'confirmed') {
        capAuthorized += amount;
      }
    }

    return Math.max(capAuthorized, 0);
  }, [firstMilestone, summary?.transactions]);

  const handleAuthoriseTransfer = async () => {
    if (!evidence || !firstMilestone || !projectId || !accessToken) return;

    if (!titleTransferAcknowledged) {
      toast.error('Please confirm title transfer acknowledgement before authorising');
      return;
    }

    const approved = Number(approvedAmount || 0);
    if (!Number.isFinite(approved) || approved <= 0) {
      toast.error('Enter a valid value to authorise');
      return;
    }

    const claimed = Number(evidence.claimedAmount || 0);
    if (Number.isFinite(claimed) && claimed > 0 && approved > claimed) {
      toast.error('Authorised amount cannot exceed claimed amount');
      return;
    }

    if (
      !confirm(
        `Authorise transfer of ${formatHKD(approved)} for this materials claim?`,
      )
    ) {
      return;
    }

    setAuthorising(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${projectId}/milestones/${firstMilestone.id}/procurement-evidence/${evidence.id}/review`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approved',
            approvedAmount: approved,
            titleTransferAcknowledged,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to authorise claim');
      }

      toast.success('Transfer authorised successfully');
      onCompleted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to authorise transfer');
    } finally {
      setAuthorising(false);
    }
  };

  if (!isOpen) return null;

  const title = modalContent?.title || 'Review materials purchase receipts';
  const body =
    modalContent?.body ||
    'Review the professional\'s materials claim, ask for clarification in claim chat, or authorise transfer.';
  const detailsBody =
    modalContent?.detailsBody ||
    'Review each receipt and claim details before authorising. Use the claim thread for clarifications so all context is retained in one place.';

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition-all ${
        isOpen ? 'visible bg-black/60 backdrop-blur-sm' : 'invisible bg-black/0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl max-h-[88vh] [perspective:1600px]">
        <div
          className="relative grid max-h-[88vh] [transform-style:preserve-3d] transition-transform duration-500 ease-out"
          style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          <div className="col-start-1 row-start-1 flex max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]">
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-blue-300/60 bg-blue-500/20 text-lg font-semibold text-blue-100 transition hover:bg-blue-500/35"
              aria-label="Show details"
              title="More info"
            >
              i
            </button>

            <div className="border-b border-slate-700 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="mt-0.5 text-xs text-slate-300">{body}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
                  <p className="text-slate-300 text-sm">Loading claim...</p>
                </div>
              ) : !evidence ? (
                <div className="rounded-md border border-slate-600 bg-slate-800 px-4 py-6 text-center text-sm text-slate-300">
                  No pending materials claim found for this project.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 min-h-0">
                    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Claimed amount</span>
                          <span className="text-lg font-bold text-white">
                            {formatHKD(evidence.claimedAmount)} / {formatHKD(milestoneCapAmount)}
                          </span>
                      </div>
                      {evidence.deadlineAt && (
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Review deadline</span>
                          <span className="text-amber-300">
                            {new Date(evidence.deadlineAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                      )}
                      {evidence.openingMessage && (
                        <div className="pt-2 border-t border-slate-700 text-xs text-slate-200">
                          {evidence.openingMessage}
                        </div>
                      )}
                    </div>

                    {allUrls.length > 0 && (
                      <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                          Receipts &amp; photos ({allUrls.length})
                        </p>

                        <div className="max-h-[28vh] space-y-2 overflow-y-auto pr-1">
                          {allUrls.map((url, index) => {
                            const file = filenameFromUrl(url);
                            const meta = itemNoteMap[file] || {};
                            return (
                              <div
                                key={`${url}-${index}`}
                                className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900/70 p-2"
                              >
                                <button
                                  type="button"
                                  onClick={() => setLightboxUrl(url)}
                                  className="relative block h-14 w-14 shrink-0 overflow-hidden rounded border border-slate-600 transition hover:border-cyan-400"
                                  title={`Open ${file}`}
                                >
                                  <img src={url} alt={`Receipt ${index + 1}`} className="h-full w-full object-cover" />
                                </button>
                                <div className="min-w-0 text-[11px] text-slate-300">
                                  <p><span className="text-slate-400">Value:</span> {meta.valueText || 'Not itemised'}</p>
                                  <p className="truncate"><span className="text-slate-400">Note:</span> {meta.noteText || 'No per-item note provided'}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-h-0">
                    <ProjectChat
                      projectId={projectId}
                      accessToken={accessToken}
                      currentUserRole={currentUserRole === 'admin' ? 'admin' : 'client'}
                      threadScope="claim"
                      threadScopeId={evidence.id}
                      sendButtonLabel="Request clarification"
                      messagePlaceholder="Ask for clarification on receipts, amounts, or notes..."
                      className="min-h-0"
                    />
                  </div>
                </div>
              )}
            </div>

            {evidence && (
              <div className="border-t border-slate-700 bg-slate-900/95 px-5 py-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <label className="flex items-center gap-2 text-xs text-cyan-100 sm:col-start-1 sm:row-start-1">
                    <input
                      type="checkbox"
                      checked={titleTransferAcknowledged}
                      onChange={(event) => setTitleTransferAcknowledged(event.target.checked)}
                    />
                    Confirm title transfer acknowledgement
                  </label>

                  <div className="hidden sm:block sm:col-start-2 sm:row-start-1" />

                  <div className="text-xs font-semibold text-slate-300 sm:col-start-3 sm:row-start-1 sm:self-center">
                    Settlement decision
                  </div>

                  <div className="hidden sm:block sm:col-start-4 sm:row-start-1" />
                  <div className="hidden sm:block sm:col-start-5 sm:row-start-1" />

                  <button
                    type="button"
                    onClick={() => setShowDetails(true)}
                    className="inline-flex h-8 w-8 items-center justify-center justify-self-start rounded-full border border-blue-300/60 bg-blue-500/20 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/35 sm:col-start-1 sm:row-start-2 sm:justify-self-center"
                    aria-label="Show details"
                    title="More info"
                  >
                    i
                  </button>

                  <div className="hidden sm:block sm:col-start-2 sm:row-start-2" />

                  <div className="sm:col-start-3 sm:row-start-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">HK$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={approvedAmount}
                        onChange={(event) => setApprovedAmount(event.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-md border border-cyan-300/30 bg-slate-900 py-2 pl-12 pr-3 text-right text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="sm:col-start-4 sm:row-start-2 sm:self-end">
                    <button
                      type="button"
                      onClick={handleAuthoriseTransfer}
                      disabled={authorising || !titleTransferAcknowledged}
                      className="w-full rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {authorising ? 'Processing...' : 'Authorise transfer'}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 sm:col-start-5 sm:row-start-2"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {!evidence && !loading && (
              <div className="border-t border-slate-700 bg-slate-900/95 px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-slate-600 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          <div
            className="col-start-1 row-start-1 flex max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]"
            style={{ transform: 'rotateY(180deg)' }}
            aria-hidden={!showDetails}
          >
            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-slate-500 bg-slate-800/80 text-lg font-semibold text-slate-100 transition hover:bg-slate-700"
              aria-label="Hide details"
            >
              ×
            </button>

            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-12 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
              <h3 className="mt-3 text-2xl font-bold text-emerald-300">{title}</h3>
              <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
            </div>

            <div className="mt-auto border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="w-full rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Back to action
              </button>
            </div>
          </div>
        </div>
      </div>

      {lightboxUrl && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4">
          <div className="relative w-full max-w-5xl rounded-xl border border-slate-700 bg-slate-950 p-2">
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute right-3 top-3 z-10 rounded border border-slate-500 bg-slate-900/90 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-800"
            >
              Close
            </button>
            <img src={lightboxUrl} alt="Claim evidence" className="max-h-[80vh] w-full rounded object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
