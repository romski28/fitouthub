'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';
import StatusPill, { statusToneFromStatus } from './status-pill';
import { useAuth } from '@/context/auth-context';

export type ProjectFinancialRole = 'client' | 'professional' | 'admin';

interface Transaction {
  id: string;
  projectProfessionalId?: string | null;
  professionalId?: string | null;
  type: string;
  description: string;
  amount: number | string;
  status: string;
  requestedBy?: string | null;
  requestedByRole?: string | null;
  actionBy?: string | null;
  actionByRole?: string | null;
  actionAt?: string | null;
  actionComplete?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface Summary {
  totalEscrow: number | string;
  escrowConfirmed: number | string;
  advancePaymentRequested: number | string;
  advancePaymentApproved: number | string;
  paymentsReleased: number | string;
  transactions: Transaction[];
}

interface LedgerEntry {
  id: string;
  direction: string;
  amount: number | string;
  currency: string;
  description: string | null;
  createdAt: string;
  transaction: { type: string; description: string } | null;
}

interface Statement {
  ledger: LedgerEntry[];
  balance: number | string;
  required: number | string;
  approvedBudget: number | string;
}

interface PaymentPlanMilestone {
  id: string;
  sequence: number;
  title: string;
  type: string;
  status: string;
  percentOfTotal?: number | null;
  amount: number | string;
  plannedDueAt?: string | null;
  projectMilestoneId?: string | null;
  projectMilestone?: {
    id: string;
    title: string;
    sequence: number;
    plannedStartDate?: string | null;
    plannedEndDate?: string | null;
    status: string;
    isFinancial: boolean;
  } | null;
}

interface PaymentPlan {
  id: string;
  projectScale: string;
  escrowFundingPolicy: string;
  status: string;
  currency: string;
  totalAmount: number | string;
  depositCapPercent?: number | null;
  retentionEnabled?: boolean;
  retentionPercent?: number | string | null;
  retentionAmount?: number | string | null;
  retentionReleaseAt?: string | null;
  milestones: PaymentPlanMilestone[];
}

interface ProjectFinancialsCardProps {
  projectId: string;
  projectProfessionalId?: string;
  accessToken: string;
  projectCost: number | string; // The approved quote
  originalBudget?: number | string; // Original project budget (for client/admin)
  role: ProjectFinancialRole;
  onClarify?: (transactionId: string) => void; // Callback when client clicks Clarify
}

const formatHKD = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(num);
};

const getTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    escrow_deposit_request: 'Escrow Deposit Request',
    escrow_deposit_confirmation: 'Escrow Deposit Confirmation',
    escrow_deposit: 'Escrow Deposit',
    escrow_confirmation: 'Escrow Confirmed',
    payment_request: 'Payment Request',
    advance_payment_approval: 'Advance Approved',
    advance_payment_rejection: 'Advance Declined',
    release_payment: 'Payment Released',
  };
  return map[type] || type;
};

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

const deriveRoleFromToken = (token?: string | null): ProjectFinancialRole | null => {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as {
      role?: string;
      isProfessional?: boolean;
    };
    if (payload.role === 'admin' || payload.role === 'client' || payload.role === 'professional') {
      return payload.role as ProjectFinancialRole;
    }
    if (payload.isProfessional) return 'professional';
  } catch {
    // ignore decode failures; fall back to props
  }
  return null;
};

export default function ProjectFinancialsCard({
  projectId,
  projectProfessionalId,
  accessToken,
  projectCost,
  originalBudget,
  role,
  onClarify,
}: ProjectFinancialsCardProps) {
  const { role: authRole, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [projectEscrowHeld, setProjectEscrowHeld] = useState<number | string>(0);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [paymentPlanLoading, setPaymentPlanLoading] = useState(false);
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionPercent, setRetentionPercent] = useState('5');
  const [retentionReleaseAt, setRetentionReleaseAt] = useState('');
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTransactionId, setOtpTransactionId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);

  // Prevent duplicate in-flight requests
  const requestInFlightRef = useRef<Promise<readonly [Summary, Transaction[]]> | null>(null);

  // Tracks whether financials have been loaded at least once.
  // Prevents the loading spinner from re-appearing on background token-refresh re-fetches,
  // which would hide card content momentarily (and in the page.tsx case, unmount the modal).
  const hasLoadedRef = useRef(false);

  const resolvedRole = useMemo<ProjectFinancialRole>(() => {
    if (authRole === 'admin' || authRole === 'client' || authRole === 'professional') {
      return authRole as ProjectFinancialRole;
    }
    if (role === 'admin' || role === 'client' || role === 'professional') {
      return role;
    }
    const tokenRole = deriveRoleFromToken(accessToken);
    if (tokenRole) return tokenRole;
    return 'client';
  }, [authRole, role, accessToken]);

  const filteredTransactions = useMemo(() => {
    if (resolvedRole === 'professional' && projectProfessionalId) {
      return transactions.filter((tx) => tx.projectProfessionalId === projectProfessionalId);
    }
    return transactions;
  }, [transactions, resolvedRole, projectProfessionalId]);

  const approvedBudget = useMemo(() => {
    const approvedTx = transactions.find((tx) => tx.type === 'approved_budget');
    if (approvedTx) return approvedTx.amount;
    if (originalBudget !== undefined) return originalBudget;
    return projectCost;
  }, [transactions, originalBudget, projectCost]);

  const paymentsReleasedTotal = useMemo(() => {
    // Only count release_payment transactions with confirmed status
    // payment_request with approved status is pending admin release, not yet paid
    return filteredTransactions
      .filter((tx) => tx.type === 'release_payment' && tx.status?.toLowerCase() === 'confirmed')
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
  }, [filteredTransactions]);

  const escrowConfirmed = useMemo(() => {
    const escrow = filteredTransactions
      .filter(
        (tx) =>
          (tx.type === 'escrow_deposit' && tx.status?.toLowerCase() === 'confirmed') ||
          (tx.type === 'escrow_deposit_confirmation' && tx.status?.toLowerCase() === 'confirmed')
      )
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
    
    if (filteredTransactions.length > 0) {
      console.log('[ProjectFinancials] Filtered Transactions:', filteredTransactions);
      console.log('[ProjectFinancials] Escrow amount:', escrow);
      filteredTransactions.forEach(tx => {
        console.log(`[ProjectFinancials] Tx - Type: ${tx.type}, Status: ${tx.status}, Amount: ${tx.amount}`);
      });
    }
    
    return escrow;
  }, [filteredTransactions]);

  useEffect(() => {
    const load = async () => {
      try {
        if (requestInFlightRef.current) {
          const [, txData] = await requestInFlightRef.current;
          setTransactions(txData);
          return;
        }

        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        setError(null);

        const combinedPromise = (async () => {
          const [summaryRes, txRes, projectRes, paymentPlanRes] = await Promise.all([
            fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/projects/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          ]);

          if (!summaryRes.ok || !txRes.ok) {
            throw new Error('Failed to load financial data');
          }

          const summaryData: Summary = await summaryRes.json();
          const txData: Transaction[] = await txRes.json();
          const projectData = projectRes.ok ? await projectRes.json() : null;
          const paymentPlanData = paymentPlanRes.ok ? await paymentPlanRes.json() : null;
          
          if (projectData?.escrowHeld !== undefined) {
            setProjectEscrowHeld(projectData.escrowHeld);
          }

          setPaymentPlan(paymentPlanData);
          
          return [summaryData, txData] as const;
        })();

        setPaymentPlanLoading(true);
        requestInFlightRef.current = combinedPromise;
        const [, txData] = await combinedPromise;
        console.log('[ProjectFinancials] Loaded transactions:', txData);
        hasLoadedRef.current = true;
        setTransactions(txData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load financials');
      } finally {
        setPaymentPlanLoading(false);
        requestInFlightRef.current = null;
        setLoading(false);
      }
    };

    if (projectId && accessToken) {
      load();
    }
  }, [projectId, accessToken, projectProfessionalId, resolvedRole]);

  useEffect(() => {
    if (!paymentPlan) return;
    setRetentionEnabled(!!paymentPlan.retentionEnabled);
    setRetentionPercent(
      paymentPlan.retentionPercent !== undefined && paymentPlan.retentionPercent !== null
        ? String(paymentPlan.retentionPercent)
        : '5',
    );
    setRetentionReleaseAt(
      paymentPlan.retentionReleaseAt
        ? new Date(paymentPlan.retentionReleaseAt).toISOString().slice(0, 10)
        : '',
    );
  }, [paymentPlan]);

  useEffect(() => {
    if (!showOtpModal || otpResendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setOtpResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showOtpModal, otpResendCooldown]);

  const reloadPaymentPlan = async () => {
    try {
      const paymentPlanRes = await fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const paymentPlanData = paymentPlanRes.ok ? await paymentPlanRes.json() : null;
      setPaymentPlan(paymentPlanData);
    } catch {
      // keep previous state
    }
  };

  const handleSaveRetention = async () => {
    if (resolvedRole !== 'admin') return;
    if (!paymentPlan || paymentPlan.projectScale !== 'SCALE_3') {
      toast.error('Retention is only available for Scale 3 plans');
      return;
    }

    setRetentionSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/payment-plan/retention`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retentionEnabled,
          retentionPercent: Number(retentionPercent || 0),
          retentionReleaseAt: retentionReleaseAt ? `${retentionReleaseAt}T00:00:00.000Z` : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to save retention settings');
      }

      toast.success('Retention settings updated');
      await reloadPaymentPlan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save retention settings');
    } finally {
      setRetentionSaving(false);
    }
  };

  const txByMilestone = useMemo(() => {
    const map = new Map<string, { escrowTx?: Transaction; releaseTx?: Transaction }>();
    for (const tx of transactions) {
      const meta = parseMilestoneMetadataFromNotes(tx.notes);
      const milestoneId = meta?.paymentMilestoneId;
      if (!milestoneId) continue;
      const bucket = map.get(milestoneId) || {};
      const status = (tx.status || '').toLowerCase();
      if (tx.type === 'escrow_deposit_request' && status === 'pending') {
        bucket.escrowTx = tx;
      }
      if (tx.type === 'payment_request' && status === 'pending') {
        bucket.releaseTx = tx;
      }
      map.set(milestoneId, bucket);
    }
    return map;
  }, [transactions]);

  const handleConfirmDeposit = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/confirm-deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to confirm deposit');
      toast.success('Deposit confirmed');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReleasePayment = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/release`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to release payment');
      toast.success('Payment released');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to release payment');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprovePayment = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to approve payment');
      toast.success('Payment approved');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'confirmed', type: 'advance_payment_approval' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve payment');
    } finally {
      setProcessingId(null);
    }
  };

  const handleClarifyPayment = async (transactionId: string) => {
    try {
      setProcessingId(null);
      // If callback provided (client view), use it to coordinate with chat
      if (onClarify) {
        onClarify(transactionId);
        toast.success('Scroll to chat to clarify with professional');
      } else {
        // Professional view: scroll to chat on page
        const chatElement = document.getElementById('project-chat');
        if (chatElement) {
          chatElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => {
            const inputElement = chatElement.querySelector('input[type="text"]');
            if (inputElement instanceof HTMLInputElement) {
              inputElement.focus();
            }
          }, 500);
        }
        toast.success('Scroll to chat to clarify payment request with professional');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to navigate to chat');
    }
  };

  const closeOtpModal = () => {
    setShowOtpModal(false);
    setOtpTransactionId(null);
    setOtpCode('');
    setOtpSending(false);
    setOtpVerifying(false);
    setOtpResendCooldown(0);
    setProcessingId(null);
  };

  const requestEscrowOtp = async (transactionId: string) => {
    setOtpSending(true);
    try {
      const otpRequestRes = await fetch(`${API_BASE_URL}/financial/${transactionId}/checkout-otp/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!otpRequestRes.ok) {
        const data = await otpRequestRes.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send OTP');
      }

      setOtpResendCooldown(60);
      toast.success('OTP sent to your email and preferred contact channel');
    } finally {
      setOtpSending(false);
    }
  };

  const handlePayEscrow = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      await requestEscrowOtp(transactionId);
      setOtpTransactionId(transactionId);
      setOtpCode('');
      setShowOtpModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start escrow checkout');
      setProcessingId(null);
    }
  };

  const handleVerifyOtpAndCheckout = async () => {
    if (!otpTransactionId) {
      return;
    }

    const trimmedCode = otpCode.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      setOtpVerifying(true);
      const otpVerifyRes = await fetch(`${API_BASE_URL}/financial/${otpTransactionId}/checkout-otp/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: trimmedCode }),
      });

      if (!otpVerifyRes.ok) {
        const data = await otpVerifyRes.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid OTP code');
      }

      const res = await fetch(`${API_BASE_URL}/financial/${otpTransactionId}/checkout-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to start escrow checkout');
      }

      const data = await res.json() as { checkoutUrl?: string };
      if (!data.checkoutUrl) {
        throw new Error('Checkout URL missing from API response');
      }

      closeOtpModal();
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start escrow checkout');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleViewStatement = async () => {
    try {
      setShowStatement(true);
      const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/statement`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load statement');
      const data: Statement = await res.json();
      setStatement(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load statement');
      setShowStatement(false);
    }
  };

  const budgetLabel = resolvedRole === 'professional' ? 'Contract Value' : 'Approved Budget';
  const paymentsLabel = 'Payments Released';
  const escrowActive = escrowConfirmed > 0;
  const budgetTitle = escrowActive ? `${budgetLabel} · In escrow` : budgetLabel;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="p-5 border-b border-slate-700 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Project Financials</h2>
          <button
            onClick={handleViewStatement}
            className="mt-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
          >
            View Statement
          </button>
        </div>
        {(resolvedRole === 'client' || resolvedRole === 'admin') && originalBudget && (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Original Budget</p>
            <p className="text-lg font-bold text-white">{formatHKD(originalBudget)}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 text-sm text-slate-400">Loading financials...</div>
      ) : error ? (
        <div className="p-5 text-sm text-rose-400">{error}</div>
      ) : (
        <div className="p-5 space-y-6">
          {/* Three Mini Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Project Value Card - Show for all roles */}
            {resolvedRole === 'professional' && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
                <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Project Value</p>
                <p className="text-xl font-bold text-white">{formatHKD(projectCost)}</p>
              </div>
            )}
            {(resolvedRole === 'client' || resolvedRole === 'admin') && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
                <p className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Approved Quote</p>
                <p className="text-xl font-bold text-white">{formatHKD(projectCost)}</p>
              </div>
            )}

            {/* In Escrow Card */}
            <div className={`rounded-lg border px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.25)] ${
              escrowActive
                ? 'border-emerald-500/40 bg-emerald-500/15'
                : 'border-slate-700 bg-slate-800/50'
            }`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                escrowActive ? 'text-emerald-300' : 'text-slate-300'
              }`}>
                In Escrow
              </p>
              <p className={`text-xl font-bold ${
                escrowActive ? 'text-emerald-200' : 'text-white'
              }`}>
                {formatHKD(projectEscrowHeld || escrowConfirmed)}
              </p>
              {!escrowActive && <p className="text-xs text-slate-500 mt-1">Awaiting confirmation</p>}
            </div>

            {/* Paid Card */}
            <div className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-3 shadow-[0_1px_3px_rgba(59,130,246,0.15)]">
              <p className="text-[11px] font-semibold text-blue-300 uppercase tracking-wide">Paid</p>
              <p className="text-xl font-bold text-blue-200">{formatHKD(paymentsReleasedTotal)}</p>
            </div>
          </div>

          {/* Payment Plan (Phase A visibility) */}
          {!paymentPlanLoading && paymentPlan && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Payment Plan</h3>
                <StatusPill
                  status={paymentPlan.status}
                  label={paymentPlan.status.replace(/_/g, ' ')}
                  tone={statusToneFromStatus(paymentPlan.status)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Scale</p>
                  <p className="text-sm font-semibold text-white mt-1">{paymentPlan.projectScale.replace('_', ' ')}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Escrow Policy</p>
                  <p className="text-sm font-semibold text-white mt-1">{paymentPlan.escrowFundingPolicy.replace(/_/g, ' ')}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plan Total</p>
                  <p className="text-sm font-semibold text-white mt-1">{formatHKD(paymentPlan.totalAmount)}</p>
                </div>
              </div>

              {paymentPlan.projectScale === 'SCALE_3' && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Retention</p>
                      <p className="text-xs text-amber-100 mt-1">
                        Optional holdback released one month after completion (admin editable).
                      </p>
                    </div>
                    {(resolvedRole !== 'admin') && (
                      <p className="text-xs text-amber-100">
                        {paymentPlan.retentionEnabled
                          ? `${paymentPlan.retentionPercent}% (${formatHKD(paymentPlan.retentionAmount || 0)})`
                          : 'Not enabled'}
                      </p>
                    )}
                  </div>

                  {resolvedRole === 'admin' && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm text-amber-100">
                          <input
                            type="checkbox"
                            checked={retentionEnabled}
                            onChange={(e) => setRetentionEnabled(e.target.checked)}
                          />
                          Enable retention
                        </label>
                        <label className="text-sm text-amber-100">
                          <span className="block text-xs mb-1">Retention %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={retentionPercent}
                            onChange={(e) => setRetentionPercent(e.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          />
                        </label>
                        <label className="text-sm text-amber-100">
                          <span className="block text-xs mb-1">Retention release date</span>
                          <input
                            type="date"
                            value={retentionReleaseAt}
                            onChange={(e) => setRetentionReleaseAt(e.target.value)}
                            className="w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-white"
                          />
                        </label>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleSaveRetention}
                          disabled={retentionSaving}
                          className="rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {retentionSaving ? 'Saving...' : 'Save retention settings'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left">
                      <th className="px-3 py-2 text-white font-semibold">#</th>
                      <th className="px-3 py-2 text-white font-semibold">Milestone</th>
                      <th className="px-3 py-2 text-white font-semibold">Due</th>
                      <th className="px-3 py-2 text-white font-semibold">Split</th>
                      <th className="px-3 py-2 text-white font-semibold">Amount</th>
                      <th className="px-3 py-2 text-white font-semibold">Status</th>
                      {(resolvedRole === 'client') && <th className="px-3 py-2 text-white font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paymentPlan.milestones.map((milestone) => {
                      const linkedTx = txByMilestone.get(milestone.id);
                      const canPayMilestoneEscrow =
                        resolvedRole === 'client' &&
                        milestone.status === 'escrow_requested' &&
                        !!linkedTx?.escrowTx;
                      const canApproveMilestoneRelease =
                        resolvedRole === 'client' &&
                        milestone.status === 'release_requested' &&
                        !!linkedTx?.releaseTx;

                      return (
                        <tr key={milestone.id} className="border-b border-slate-800">
                          <td className="px-3 py-2 text-slate-200">{milestone.sequence}</td>
                          <td className="px-3 py-2 text-slate-200">
                            <div>{milestone.title}</div>
                            {milestone.projectMilestone && (
                              <div className="text-[11px] text-slate-400 mt-1">
                                Linked schedule: {milestone.projectMilestone.sequence}. {milestone.projectMilestone.title}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {milestone.plannedDueAt ? new Date(milestone.plannedDueAt).toLocaleDateString('en-HK') : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {typeof milestone.percentOfTotal === 'number'
                              ? `${milestone.percentOfTotal}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-white font-semibold">{formatHKD(milestone.amount)}</td>
                          <td className="px-3 py-2">
                            <StatusPill
                              status={milestone.status}
                              label={milestone.status.replace(/_/g, ' ')}
                              tone={statusToneFromStatus(milestone.status)}
                            />
                          </td>
                          {resolvedRole === 'client' && (
                            <td className="px-3 py-2 text-right">
                              {canPayMilestoneEscrow ? (
                                <button
                                  onClick={() => handlePayEscrow(linkedTx!.escrowTx!.id)}
                                  disabled={processingId === linkedTx!.escrowTx!.id}
                                  className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                                >
                                  {processingId === linkedTx!.escrowTx!.id ? 'Processing...' : 'Fund Escrow'}
                                </button>
                              ) : canApproveMilestoneRelease ? (
                                <button
                                  onClick={() => handleApprovePayment(linkedTx!.releaseTx!.id)}
                                  disabled={processingId === linkedTx!.releaseTx!.id}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-slate-400 transition"
                                >
                                  {processingId === linkedTx!.releaseTx!.id ? 'Approving...' : 'Approve Release'}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white border-b border-slate-600">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Action On</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-300">No financial transactions yet</td>
                  </tr>
                )}
                {filteredTransactions.map((tx) => {
                  const createdDate = new Date(tx.createdAt).toLocaleDateString('en-HK');
                  const status = (tx.status || '').toLowerCase();
                  const statusKey = status.replace(/\s+/g, '_');
                  const type = tx.type;
                  const canConfirmDeposit =
                    resolvedRole === 'admin' &&
                    ((type === 'escrow_deposit' && statusKey === 'pending') ||
                      (type === 'escrow_deposit_confirmation' && statusKey === 'pending'));
                  console.log('[ProjectFinancials] Action checks:', {
                    id: tx.id,
                    type,
                    statusKey,
                    role: resolvedRole,
                    canConfirmDeposit,
                    actionByRole: tx.actionByRole,
                  });
                  const canApprove =
                    resolvedRole === 'client' && type === 'payment_request' && statusKey === 'pending';
                  const canRelease =
                    resolvedRole === 'admin' && type === 'release_payment' && statusKey === 'pending';
                  const canReject =
                    resolvedRole === 'client' && type === 'payment_request' && statusKey === 'pending';
                  const canPayEscrow =
                    resolvedRole === 'client' && type === 'escrow_deposit_request' && statusKey === 'pending';
                  const actionRole = (tx.actionByRole || '').toLowerCase();
                  const actionOn = tx.actionByRole || tx.requestedByRole || '—';
                  const roleMatches =
                    (actionRole === 'admin' && resolvedRole === 'admin') ||
                    (actionRole === 'client' && resolvedRole === 'client') ||
                    (actionRole === 'professional' && resolvedRole === 'professional') ||
                    (actionRole === 'platform' && resolvedRole === 'admin');
                  const userMatches = tx.actionBy && user?.id === tx.actionBy;
                  const highlightActor = !tx.actionComplete && (roleMatches || userMatches);
                  const isInfo = statusKey === 'info';

                  const actionButton = () => {
                    if (isInfo) {
                      return <span className="text-slate-400 text-xs">—</span>;
                    }
                    if (canPayEscrow) {
                      return (
                        <button
                          onClick={() => handlePayEscrow(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Processing...' : 'Fund Escrow'}
                        </button>
                      );
                    }
                    if (canConfirmDeposit) {
                      return (
                        <button
                          onClick={() => handleConfirmDeposit(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Confirming...' : 'Confirm'}
                        </button>
                      );
                    }
                    if (canRelease) {
                      return (
                        <button
                          onClick={() => handleReleasePayment(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Releasing...' : 'Release'}
                        </button>
                      );
                    }
                    if (canApprove) {
                      return (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleApprovePayment(tx.id)}
                            disabled={processingId === tx.id}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === tx.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleClarifyPayment(tx.id)}
                            disabled={processingId === tx.id}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === tx.id ? 'Processing...' : 'Clarify'}
                          </button>
                        </div>
                      );
                    }
                    if (canReject) {
                      return (
                        <button
                          onClick={() => handleClarifyPayment(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Processing...' : 'Clarify'}
                        </button>
                      );
                    }
                    return <span className="text-slate-400 text-xs">—</span>;
                  };

                  return (
                    <tr key={tx.id} className="border-b border-slate-700">
                      <td className="py-2 pr-4 text-white">{createdDate}</td>
                      <td className="py-2 pr-4 text-white">
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{actionOn.replace('_', ' ')}</span>
                          {highlightActor && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{getTypeLabel(tx.type)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-white font-semibold">{formatHKD(tx.amount)}</td>
                      <td className="py-2 pr-4">
                        <StatusPill status={tx.status} label={statusKey.replace('_', ' ')} tone={statusToneFromStatus(tx.status)} />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {actionButton()}
                          {!isInfo && (
                            <button
                              onClick={() => setSelectedTx(tx)}
                              className="text-xs text-blue-400 hover:underline"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={closeOtpModal}>
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Verify escrow payment</h3>
              <button
                onClick={closeOtpModal}
                disabled={otpVerifying}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Enter the 6-digit OTP sent to your email and preferred contact channel.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit OTP"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none"
              disabled={otpVerifying}
            />

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => otpTransactionId && requestEscrowOtp(otpTransactionId)}
                disabled={otpSending || otpVerifying || otpResendCooldown > 0}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-400"
              >
                {otpResendCooldown > 0 ? `Resend OTP in ${otpResendCooldown}s` : otpSending ? 'Sending OTP...' : 'Resend OTP'}
              </button>
              <span className="text-xs text-slate-500">Code expires in 10 minutes</span>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeOtpModal}
                disabled={otpVerifying}
                className="px-4 py-2 bg-slate-200 text-slate-800 rounded text-sm font-medium hover:bg-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyOtpAndCheckout}
                disabled={otpVerifying || otpSending || otpCode.trim().length !== 6}
                className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-400"
              >
                {otpVerifying ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSelectedTx(null)}>
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Transaction Details</h3>
              <button onClick={() => setSelectedTx(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Type</p>
                <p className="text-slate-900">{getTypeLabel(selectedTx.type)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Description</p>
                <p className="text-slate-900">{selectedTx.description}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Amount</p>
                <p className="text-slate-900 font-semibold">{formatHKD(selectedTx.amount)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase">Status</p>
                <StatusPill status={selectedTx.status} label={selectedTx.status} tone={statusToneFromStatus(selectedTx.status)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Requested By</p>
                  <p className="text-slate-900 capitalize">{selectedTx.requestedByRole || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Action By</p>
                  <p className="text-slate-900 capitalize">{selectedTx.actionByRole || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Created</p>
                  <p className="text-slate-700">{new Date(selectedTx.createdAt).toLocaleString('en-HK')}</p>
                </div>
                {selectedTx.actionAt && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase">Action Taken</p>
                    <p className="text-slate-700">{new Date(selectedTx.actionAt).toLocaleString('en-HK')}</p>
                  </div>
                )}
              </div>
              {selectedTx.notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Notes</p>
                  <p className="text-slate-700">{selectedTx.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 bg-slate-600 text-white rounded text-sm font-medium hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escrow Statement Modal */}
      {showStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowStatement(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Escrow Statement</h3>
                {statement && (
                  <p className="text-sm text-slate-600 mt-1">
                    Current Balance: <span className="font-semibold text-emerald-600">{formatHKD(statement.balance)}</span>
                    {' • '}
                    Required: <span className="font-semibold">{formatHKD(statement.required)}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setShowStatement(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!statement ? (
                <p className="text-sm text-slate-500">Loading statement...</p>
              ) : statement.ledger.length === 0 ? (
                <p className="text-sm text-slate-500">No ledger entries yet</p>
              ) : (
                <div className="space-y-3">
                  {statement.ledger.map((entry, idx) => {
                    const isCredit = entry.direction === 'credit';
                    const runningBalance = statement.ledger
                      .slice(0, idx + 1)
                      .reduce((acc, e) => {
                        const amt = typeof e.amount === 'string' ? parseFloat(e.amount) : e.amount;
                        return acc + (e.direction === 'credit' ? amt : -amt);
                      }, 0);
                    return (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {isCredit ? '+' : '−'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900">{entry.description || entry.transaction?.description || '—'}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{new Date(entry.createdAt).toLocaleString('en-HK')}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-semibold ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isCredit ? '+' : '−'}{formatHKD(entry.amount)}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">Balance: {formatHKD(runningBalance)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowStatement(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded text-sm font-medium hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
