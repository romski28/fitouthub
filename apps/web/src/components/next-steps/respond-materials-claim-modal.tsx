'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
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
  clientQuestionedAt?: string | null;
  professionalRespondedAt?: string | null;
  createdAt: string;
};

type PaymentMilestone = {
  id: string;
  sequence: number;
  title: string;
};

type PaymentPlan = {
  projectScale: string;
  milestones: PaymentMilestone[];
};

// ─── Component ───────────────────────────────────────────────────────────────

interface RespondMaterialsClaimModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

export function RespondMaterialsClaimModal({
  isOpen,
  isLoading = false,
  onClose,
}: RespondMaterialsClaimModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useProfessionalAuth();

  const [pageLoading, setPageLoading] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [evidence, setEvidence] = React.useState<ProcurementEvidence | null>(null);
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);
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
        const planRes = await fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
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

  // ── Send reply ────────────────────────────────────────────────────────────

  const handleSendReply = async () => {
    if (!evidence || !firstMilestone || !state.projectId || !accessToken) return;
    const trimmed = reply.trim();
    if (!trimmed) return;

    setSending(true);
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
        throw new Error((data as { message?: string }).message || 'Failed to send reply');
      }
      toast.success('Reply sent — the client has been notified');
      setReply('');
      setChatRefreshKey((k) => k + 1);
      state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
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
            <h3 className="text-lg font-semibold text-white">Materials claim — client response required</h3>
            <p className="mt-0.5 text-xs text-slate-300">
              The client has questions about your claim. Reply to continue the authorisation process.
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Your claim</span>
                  <span className="text-lg font-bold text-white">{formatHKD(evidence.claimedAmount)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>Submitted {new Date(evidence.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  {evidence.deadlineAt && (
                    <>
                      <span>·</span>
                      <span className="text-amber-300">Deadline {new Date(evidence.deadlineAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </>
                  )}
                </div>
                {evidence.clientQuestionedAt && (
                  <div className="pt-1 text-xs text-amber-200 border-t border-slate-700">
                    Client last asked a question on {new Date(evidence.clientQuestionedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>

              {/* Receipt images */}
              {allUrls.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Your submitted receipts ({allUrls.length})
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
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                          <span className="text-white text-xs">View</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Scoped claim chat thread */}
              {state.projectId && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Claim conversation</p>
                  <ProjectChat
                    key={chatRefreshKey}
                    projectId={state.projectId}
                    accessToken={accessToken ?? ''}
                    currentUserRole="professional"
                    threadScope="claim"
                    threadScopeId={evidence.id}
                    className="min-h-0"
                  />
                </div>
              )}

              {/* Quick reply */}
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Reply to client</p>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Explain a receipt, clarify a cost, or provide additional context…"
                  className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!reply.trim() || sending}
                  className="w-full rounded-md bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sending ? 'Sending…' : 'Send reply to client'}
                </button>
                <p className="text-[10px] text-slate-500">
                  Your reply will appear in the claim thread. The client will be notified and can then authorise
                  payment or ask follow-up questions.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
