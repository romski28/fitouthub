'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useAuth } from '@/context/auth-context';

// ─── Types ──────────────────────────────────────────────────────────────────

type PaymentPlanMilestone = {
  id: string;
  sequence: number;
  title: string;
  status: string;
};

type PaymentPlan = {
  projectScale: string;
  totalAmount?: number | string;
  milestones: PaymentPlanMilestone[];
};

type FinancialTransaction = {
  id: string;
  type: string;
  status: string;
  amount?: number | string | null;
  notes?: string | null;
  description?: string | null;
  createdAt: string;
};

type ProjectFinancialSummary = {
  escrowConfirmed?: number | string;
  transactions?: FinancialTransaction[];
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface ReviewPaymentRequestModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReviewPaymentRequestModal({
  isOpen,
  isLoading = false,
  onClose,
}: ReviewPaymentRequestModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();
  const router = useRouter();

  const [pageLoading, setPageLoading] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [querying, setQuerying] = React.useState(false);
  const [paid, setPaid] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState<PaymentPlan | null>(null);
  const [summary, setSummary] = React.useState<ProjectFinancialSummary | null>(null);

  const formatHKD = (value: number | string) =>
    new Intl.NumberFormat('en-HK', {
      style: 'currency',
      currency: 'HKD',
      minimumFractionDigits: 0,
    }).format(typeof value === 'string' ? parseFloat(value || '0') : value);

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('en-HK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // ── Derived state ─────────────────────────────────────────────────────────

  const pendingPaymentRequest = React.useMemo(() => {
    const txs = Array.isArray(summary?.transactions) ? summary.transactions : [];
    return txs.find(
      (tx) =>
        tx.type === 'payment_request' &&
        String(tx.status || '').toLowerCase() === 'pending',
    ) || null;
  }, [summary?.transactions]);

  const isSingleMilestone = React.useMemo(
    () => (paymentPlan?.milestones?.length ?? 0) <= 1,
    [paymentPlan?.milestones],
  );

  const materialsAlreadyPaid = React.useMemo(() => {
    if (!isSingleMilestone) return 0;
    const firstMilestoneId = paymentPlan?.milestones?.[0]?.id;
    if (!firstMilestoneId) return 0;
    const txs = Array.isArray(summary?.transactions) ? summary.transactions : [];
    return txs.reduce((sum, tx) => {
      if (
        tx.type === 'milestone_procurement_approved' &&
        String(tx.status || '').toLowerCase() === 'confirmed' &&
        tx.notes?.includes(firstMilestoneId)
      ) {
        return sum + (Number(tx.amount || 0) || 0);
      }
      return sum;
    }, 0);
  }, [isSingleMilestone, paymentPlan?.milestones, summary?.transactions]);

  const requestedAmount = Number(pendingPaymentRequest?.amount || 0);
  const netPayable = Math.max(requestedAmount - materialsAlreadyPaid, 0);
  const requestDate = pendingPaymentRequest?.createdAt || '';
  const requestNotes =
    pendingPaymentRequest?.notes || pendingPaymentRequest?.description || '';

  // ── Fetch data ────────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!isOpen || !state.projectId || !accessToken) return;
    const load = async () => {
      setPageLoading(true);
      try {
        const [planRes, summaryRes] = await Promise.all([
          fetch(`${API_BASE_URL}/projects/${state.projectId}/payment-plan`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE_URL}/financial/project/${state.projectId}/summary`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);
        if (planRes.ok) {
          const plan = await planRes.json();
          setPaymentPlan(plan || null);
        }
        if (summaryRes.ok) {
          const data = await summaryRes.json();
          setSummary(data || null);
        }
      } catch {
        // silent — UI shows loading failure gracefully
      } finally {
        setPageLoading(false);
      }
    };
    void load();
  }, [isOpen, state.projectId, accessToken]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleViewDetails = () => {
    if (!state.projectId) return;
    router.push(`/projects/${state.projectId}?tab=financials`);
    onClose();
  };

  const handleQuery = async () => {
    if (!state.projectId || !accessToken || !pendingPaymentRequest) return;
    try {
      setQuerying(true);
      const res = await fetch(
        `${API_BASE_URL}/projects/${state.projectId}/chat/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: `Client query regarding payment request for ${formatHKD(requestedAmount)}`,
            threadScope: 'payment',
            threadScopeId: pendingPaymentRequest.id,
          }),
        },
      );
      if (!res.ok) throw new Error('Failed to start query thread');
      toast.success('Query sent — navigate to Financials to continue the conversation');
      handleViewDetails();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start query');
    } finally {
      setQuerying(false);
    }
  };

  const handlePay = async () => {
    if (!state.projectId || !accessToken) return;
    if (netPayable <= 0) {
      toast.error('No amount payable after materials deductions');
      return;
    }
    try {
      setPaying(true);
      const res = await fetch(
        `${API_BASE_URL}/financial/project/${state.projectId}/release-payment`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { message?: string }).message || 'Failed to release payment',
        );
      }
      toast.success(
        `${formatHKD(netPayable)} released to the professional's drawable wallet.`,
      );
      setPaid(true);
      state.onCompleted?.({
        projectId: state.projectId!,
        actionKey: state.actionKey!,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment release failed');
    } finally {
      setPaying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md">
        {(isLoading || pageLoading) ? (
          <div className="relative overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            <div className="flex flex-col items-center justify-center px-6 py-14">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#D4C8A0] border-t-emerald-600" />
              <p className="text-slate-700">Loading payment details...</p>
            </div>
          </div>
        ) : paid ? (
          <div className="relative overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-emerald-800">Payment released!</h2>
              <p className="mt-3 text-base leading-relaxed text-slate-700">
                {formatHKD(netPayable)} has been moved to the professional's drawable wallet.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 min-w-[140px] rounded-lg bg-emerald-600 px-6 py-2.5 text-base font-semibold text-white transition hover:bg-emerald-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : !pendingPaymentRequest ? (
          <div className="relative overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <p className="text-slate-600">No pending payment request found.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 min-w-[110px] rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
            {/* Header */}
            <div className="border-b border-[#D4C8A0] px-6 py-5 text-center">
              <div className="mb-3 flex justify-center">
                <img
                  src="/assets/images/chatbot-avatar-icon.webp"
                  alt="Payment review"
                  className="h-16 w-16 rounded-full border border-[#D4C8A0] object-cover"
                />
              </div>
              <h2 className="text-2xl font-bold text-emerald-800">Review payment request</h2>
              <p className="mt-1 text-sm text-slate-600">
                The professional has submitted a payment request for your review.
              </p>
            </div>

            {/* Payment details */}
            <div className="space-y-4 px-6 py-5">
              <div className="rounded-lg border border-[#D4C8A0] bg-white p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date</span>
                  <span className="font-medium text-slate-800">
                    {requestDate ? formatDate(requestDate) : '—'}
                  </span>
                </div>
                {requestNotes && (
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-500">Notes</span>
                    <span className="font-medium text-slate-800">{requestNotes}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-1 border-t border-[#D4C8A0]">
                  <span className="text-slate-500">Requested amount</span>
                  <span className="font-semibold text-slate-800">
                    {formatHKD(requestedAmount)}
                  </span>
                </div>

                {isSingleMilestone && materialsAlreadyPaid > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Less materials already paid</span>
                      <span className="text-slate-500">
                        − {formatHKD(materialsAlreadyPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-[#D4C8A0]">
                      <span className="font-semibold text-slate-700">Net payable</span>
                      <span className="font-bold text-emerald-700">
                        {formatHKD(netPayable)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {netPayable <= 0 && isSingleMilestone && (
                <div className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  All requested payment has been covered by previously approved materials claims. No further payment is due.
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-[#D4C8A0] px-5 py-4">
              <button
                type="button"
                onClick={handleViewDetails}
                className="min-w-[110px] rounded-lg bg-blue-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-blue-700"
              >
                View Details
              </button>
              <button
                type="button"
                onClick={handleQuery}
                disabled={querying}
                className="min-w-[110px] rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {querying ? 'Opening...' : 'Query'}
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={paying || netPayable <= 0}
                className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {paying ? 'Paying...' : 'Pay'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
