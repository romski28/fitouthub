'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useAuth } from '@/context/auth-context';
import ProjectChat from '@/components/project-chat';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  title: string;
  amount: number | string;
};

type PaymentPlan = {
  projectScale: string;
  milestones: PaymentMilestone[];
};

// ─── Component ───────────────────────────────────────────────────────────────

interface ReviewMaterialsClaimModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function ReviewMaterialsClaimModal({
  isOpen,
  isLoading = false,
  onClose,
}: ReviewMaterialsClaimModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();

  const [pageLoading, setPageLoading] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [evidence, setEvidence] = React.useState<ProcurementEvidence | null>(null);

  const [authorising, setAuthorising] = React.useState(false);
  const [chatMessage, setChatMessage] = React.useState('');
  const [sendingQuestion, setSendingQuestion] = React.useState(false);
  const [chatRefreshKey, setChatRefreshKey] = React.useState(0);

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

  const firstMilestone = React.useMemo(
    () => paymentPlan?.milestones?.find((m) => Number(m.sequence) === 1) || null,
    [paymentPlan],
  );

  // ── Load data ─────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isOpen || !state.projectId || !accessToken) return;
    const load = async () => {
      setPageLoading(true);
      try {
        const [planRes, evidenceRes] = await Promise.all([
          fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          // fetch payment plan first to get milestone id — handled sequentially below
        ]);

        if (!planRes.ok) throw new Error('Failed to load payment plan');
        const plan: PaymentPlan = await planRes.json();
        setPaymentPlan(plan);

        const m1 = plan.milestones?.find((m) => Number(m.sequence) === 1);
        if (!m1) return;

        const evRes = await fetch(
          `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${m1.id}/procurement-evidence`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!evRes.ok) throw new Error('Failed to load claim');
        const evList: ProcurementEvidence[] = await evRes.json();
        const pending = evList.find((e) => e.status === 'pending') || evList[0] || null;
        setEvidence(pending);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load claim data');
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, accessToken]);

  // ── Authorise ─────────────────────────────────────────────────────────────

  const handleAuthorise = async () => {
    if (!evidence || !firstMilestone || !state.projectId || !accessToken) return;
    if (!confirm(`Authorise this claim for ${formatHKD(evidence.claimedAmount)}? The amount will be transferred to the professional's withdrawable wallet and any residual returned to your escrow.`)) return;

    setAuthorising(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/procurement-evidence/${evidence.id}/review`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approved',
            approvedAmount: Number(evidence.claimedAmount),
            titleTransferAcknowledged: true,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to authorise claim');
      }
      toast.success('Claim authorised — funds transferred to professional wallet');
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to authorise claim');
    } finally {
      setAuthorising(false);
    }
  };

  // ── Request confirmation ────────────────────────────────────────────────

  const handleRequestConfirmation = async () => {
    if (!evidence || !firstMilestone || !state.projectId || !accessToken) return;
    const trimmed = chatMessage.trim();
    if (!trimmed) return;

    setSendingQuestion(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/milestones/${firstMilestone.id}/procurement-evidence/${evidence.id}/message`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to send message');
      }
      toast.success('Confirmation requested — the professional will be notified');
      setChatMessage('');
      setChatRefreshKey((k) => k + 1); // refresh the chat pane
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send confirmation request');
    } finally {
      setSendingQuestion(false);
    }
  };

  if (!isOpen) return null;

  const allUrls = [...(evidence?.invoiceUrls ?? []), ...(evidence?.photoUrls ?? [])];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Review milestone 1 materials claim</h3>
            <p className="mt-0.5 text-xs text-slate-300">
              Review the professional&apos;s purchase receipts, then authorise or request confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-4 space-y-5">
          {isLoading || pageLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
              <p className="text-slate-300 text-sm">Loading claim...</p>
            </div>
          ) : !evidence ? (
            <div className="rounded-md border border-slate-600 bg-slate-800 px-4 py-6 text-center text-sm text-slate-300">
              No pending materials claim found for this project.
            </div>
          ) : (
            <>
              {/* Claim summary */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Claimed amount</span>
                  <span className="text-lg font-bold text-white">{formatHKD(evidence.claimedAmount)}</span>
                </div>
                {evidence.deadlineAt && (
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Review deadline</span>
                    <span className="text-amber-300">
                      {new Date(evidence.deadlineAt).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                )}
                {evidence.openingMessage && (
                  <div className="pt-1 text-xs text-slate-200 italic border-t border-slate-700">
                    &ldquo;{evidence.openingMessage}&rdquo;
                  </div>
                )}
              </div>

              {/* Receipt images */}
              {allUrls.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Receipts &amp; photos ({allUrls.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block h-20 w-20 overflow-hidden rounded-md border border-slate-600 bg-slate-800 hover:border-cyan-400 transition"
                      >
                        <img
                          src={url}
                          alt={`Receipt ${i + 1}`}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                          <span className="text-white text-xs">View</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Scoped claim chat */}
              {state.projectId && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Claim thread</p>
                  <ProjectChat
                    key={chatRefreshKey}
                    projectId={state.projectId}
                    accessToken={accessToken ?? ''}
                    currentUserRole="client"
                    threadScope="claim"
                    threadScopeId={evidence.id}
                    className="min-h-0"
                  />
                </div>
              )}

              {/* Action area */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Your decision</p>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Message to professional (required for &ldquo;Request confirmation&rdquo;)
                  </label>
                  <textarea
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    rows={2}
                    placeholder="Ask a question about a specific receipt or amount…"
                    className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={handleAuthorise}
                    disabled={authorising || sendingQuestion}
                    className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {authorising ? 'Authorising…' : `Authorise ${formatHKD(evidence.claimedAmount)}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestConfirmation}
                    disabled={!chatMessage.trim() || sendingQuestion || authorising}
                    className="flex-1 rounded-md border border-amber-500/60 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title={!chatMessage.trim() ? 'Enter a message to request confirmation' : undefined}
                  >
                    {sendingQuestion ? 'Sending…' : 'Request confirmation'}
                  </button>
                </div>

                <p className="text-[10px] text-slate-500">
                  Authorise transfers the full claimed amount to the professional&apos;s withdrawable wallet. Any
                  unspent cap balance is returned to your escrow. Request confirmation asks the professional to
                  clarify before you decide.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
