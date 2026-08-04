'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { WorkflowCompletionModal } from '@/components/workflow-completion-modal';

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
  const [workflowModalOpen, setWorkflowModalOpen] = React.useState(false);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [questionText, setQuestionText] = React.useState('');
  const [questionExpanded, setQuestionExpanded] = React.useState(false);
  const [sendingQuestion, setSendingQuestion] = React.useState(false);

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
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to authorise claim');
      }

      toast.success('Transfer authorised successfully');
      setWorkflowModalOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to authorise transfer');
    } finally {
      setAuthorising(false);
    }
  };

  const handleAskQuestion = async () => {
    const trimmed = questionText.trim();
    if (!trimmed || !evidence || !projectId || !accessToken) return;
    setSendingQuestion(true);
    try {
      const res = await fetch(`${API_BASE_URL}/chat/project/${projectId}/claim/${evidence.id}/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to send question');
      toast.success('Question sent to professional');
      setQuestionText('');
      setQuestionExpanded(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send question');
    } finally {
      setSendingQuestion(false);
    }
  };

  if (!isOpen) return null;

  const title = modalContent?.title || 'Review claim';
  const body = modalContent?.body || 'Review the claim details, ask a question if needed, or authorise the transfer.';

  return (
    <>
    {workflowModalOpen ? (
      <WorkflowCompletionModal
        isOpen={workflowModalOpen}
        onClose={() => { setWorkflowModalOpen(false); onClose(); onCompleted?.(); }}
        completedLabel="Transfer authorised"
        completedDescription={`${formatHKD(Number(approvedAmount || 0))} has been authorised for transfer.`}
        nextStep={null}
      />
    ) : (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgba(81,55,32,0.35)] backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl">

            <div className="border-b border-[rgba(120,53,15,0.14)] px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#4A3623]">{title}</h3>
                <p className="mt-0.5 text-xs text-[rgba(126,58,33,0.65)]">{body}</p>
              </div>
            </div>

            <div className="flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[rgba(120,53,15,0.14)] border-t-[#FF7F50]" />
                  <p className="text-[rgba(126,58,33,0.65)] text-sm">Loading claim...</p>
                </div>
              ) : !evidence ? (
                <div className="rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.75)] px-4 py-6 text-center text-sm text-[#4A3623]">
                  No pending claim found for this project.
                </div>
              ) : (
                <>
                  {/* Claimed amount */}
                  <div className="rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.75)] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[rgba(126,58,33,0.65)]">Claimed amount</span>
                      <span className="text-lg font-bold text-[#4A3623]">
                        {formatHKD(evidence.claimedAmount)}
                        {milestoneCapAmount > 0 && <> / {formatHKD(milestoneCapAmount)}</>}
                      </span>
                    </div>
                    {evidence.deadlineAt && (
                      <div className="flex items-center justify-between text-xs text-[rgba(126,58,33,0.55)]">
                        <span>Review deadline</span>
                        <span className="text-amber-600">
                          {new Date(evidence.deadlineAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {evidence.openingMessage && (
                      <div className="pt-2 border-t border-[rgba(120,53,15,0.14)] text-xs text-[#4A3623]">{evidence.openingMessage}</div>
                    )}
                  </div>

                  {/* Receipts & photos */}
                  {allUrls.length > 0 && (
                    <div className="rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.65)] p-3 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(126,58,33,0.65)]">Receipts &amp; photos ({allUrls.length})</p>
                      <div className="max-h-[24vh] space-y-2 overflow-y-auto pr-1">
                        {allUrls.map((url, index) => {
                          const file = filenameFromUrl(url);
                          const meta = itemNoteMap[file] || {};
                          return (
                            <div key={`${url}-${index}`} className="flex items-center gap-3 rounded-md border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.88)] p-2">
                              <button type="button" onClick={() => setLightboxUrl(url)} className="relative block h-14 w-14 shrink-0 overflow-hidden rounded border border-[rgba(120,53,15,0.14)] transition hover:border-[#FF7F50]">
                                <img src={url} alt={`Receipt ${index + 1}`} className="h-full w-full object-cover" />
                              </button>
                              <div className="min-w-0 text-[11px] text-[rgba(126,58,33,0.65)]">
                                <p><span className="text-[rgba(126,58,33,0.55)]">Value:</span> {meta.valueText || 'Not itemised'}</p>
                                <p className="truncate"><span className="text-[rgba(126,58,33,0.55)]">Note:</span> {meta.noteText || 'No note'}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Ask a question (collapsible) */}
                  <div>
                    <button type="button" onClick={() => setQuestionExpanded(!questionExpanded)} className="text-xs font-medium text-[#FF7F50] hover:text-[#E67245] transition">
                      {questionExpanded ? '\u2212 Cancel question' : '+ Ask a question'}
                    </button>
                    {questionExpanded && (
                      <div className="mt-2 space-y-2">
                        <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} rows={2}
                          placeholder="Ask for clarification on amounts, receipts, or notes..."
                          className="w-full rounded-md border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-xs text-[#4A3623] placeholder-[rgba(126,58,33,0.4)] resize-none" />
                        <div className="flex justify-end">
                          <button type="button" onClick={handleAskQuestion} disabled={sendingQuestion || !questionText.trim()}
                            className="rounded-md bg-[#FF7F50] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E67245] disabled:opacity-50 transition">
                            {sendingQuestion ? 'Sending...' : 'Send question'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {evidence && (
              <div className="border-t border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.94)] px-5 py-4">
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                  <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-semibold text-[rgba(126,58,33,0.65)]">Amount to transfer</span>
                    </div>
                    <div className="relative w-full max-w-[13rem] min-w-[11rem]">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(126,58,33,0.55)]">HK$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={approvedAmount}
                        onChange={(event) => setApprovedAmount(event.target.value)}
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-[rgba(120,53,15,0.22)] bg-white/70 pl-12 pr-3 text-right text-sm text-[#4A3623]"
                      />
                    </div>
                  <button
                    type="button"
                    onClick={handleAuthoriseTransfer}
                    disabled={authorising}
                    className="h-9 shrink-0 rounded-md bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {authorising ? 'Processing...' : 'Authorise transfer'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-9 shrink-0 rounded border border-[rgba(120,53,15,0.2)] px-3 text-xs text-[#4A3623] hover:bg-[rgba(245,238,219,0.9)]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {!evidence && !loading && (
              <div className="border-t border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.94)] px-5 py-4 text-right">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-[rgba(120,53,15,0.2)] px-3 py-2 text-xs text-[#4A3623] hover:bg-[rgba(245,238,219,0.9)]"
                >
                  Close
                </button>
              </div>
            )}
          </div>

      {lightboxUrl && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[rgba(81,55,32,0.85)] p-4">
          <div className="relative w-full max-w-5xl rounded-xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] p-2">
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute right-3 top-3 z-10 rounded border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.88)] px-3 py-1 text-xs font-semibold text-[#4A3623] hover:bg-[rgba(255,250,240,0.95)]"
            >
              Close
            </button>
            <img src={lightboxUrl} alt="Claim evidence" className="max-h-[80vh] w-full rounded object-contain" />
          </div>
        </div>
      )}
    </div>
    )}
    </>
  );
}
