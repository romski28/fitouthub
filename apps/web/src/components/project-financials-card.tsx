'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

export type ProjectFinancialRole = 'client' | 'professional' | 'admin';

interface Transaction {
  id: string;
  projectProfessionalId?: string | null;
  type: string;
  description: string;
  amount: number | string;
  status: string;
  requestedBy?: string | null;
  requestedByRole?: string | null;
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

interface ProjectFinancialsCardProps {
  projectId: string;
  projectProfessionalId?: string;
  accessToken: string;
  projectCost: number | string; // The approved quote
  originalBudget?: number | string; // Original project budget (for client/admin)
  role: ProjectFinancialRole;
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
    advance_payment_request: 'Advance Payment Request',
    advance_payment_approval: 'Advance Approved',
    advance_payment_rejection: 'Advance Rejected',
    release_payment: 'Payment Released',
  };
  return map[type] || type;
};

const getStatusBadge = (status: string) => {
  const key = (status || '').toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    info: 'bg-slate-100 text-slate-700',
    paid: 'bg-blue-100 text-blue-800',
    awaiting_confirmation: 'bg-indigo-100 text-indigo-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-rose-100 text-rose-800',
  };
  return map[key] || 'bg-slate-100 text-slate-700';
};

export default function ProjectFinancialsCard({
  projectId,
  projectProfessionalId,
  accessToken,
  projectCost,
  originalBudget,
  role,
}: ProjectFinancialsCardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Prevent duplicate in-flight requests
  const requestInFlightRef = useRef<Promise<readonly [Summary, Transaction[]]> | null>(null);

  const filteredTransactions = useMemo(() => {
    if (role === 'professional' && projectProfessionalId) {
      return transactions.filter((tx) => tx.projectProfessionalId === projectProfessionalId);
    }
    return transactions;
  }, [transactions, role, projectProfessionalId]);

  const paymentsReleasedTotal = useMemo(() => {
    return filteredTransactions
      .filter((tx) => tx.type === 'release_payment' || (tx.type === 'advance_payment_request' && tx.status === 'completed'))
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
  }, [filteredTransactions]);

  const escrowConfirmed = useMemo(() => {
    return filteredTransactions
      .filter(
        (tx) =>
          (tx.type === 'escrow_deposit' && tx.status?.toLowerCase() === 'confirmed') ||
          (tx.type === 'escrow_deposit_confirmation' && ['awaiting_confirmation', 'confirmed'].includes(tx.status?.toLowerCase() || ''))
      )
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
  }, [filteredTransactions]);

  useEffect(() => {
    const load = async () => {
      try {
        if (requestInFlightRef.current) {
          const [, txData] = await requestInFlightRef.current;
          setTransactions(txData);
          return;
        }

        setLoading(true);
        setError(null);

        const combinedPromise = (async () => {
          const [summaryRes, txRes] = await Promise.all([
            fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          ]);

          if (!summaryRes.ok || !txRes.ok) {
            throw new Error('Failed to load financial data');
          }

          const summaryData: Summary = await summaryRes.json();
          const txData: Transaction[] = await txRes.json();
          return [summaryData, txData] as const;
        })();

        requestInFlightRef.current = combinedPromise;
        const [, txData] = await combinedPromise;
        setTransactions(txData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load financials');
      } finally {
        requestInFlightRef.current = null;
        setLoading(false);
      }
    };

    if (projectId && accessToken) {
      load();
    }
  }, [projectId, accessToken, projectProfessionalId, role]);

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
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'completed' } : t)));
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

  const handleRejectPayment = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to reject payment');
      toast.success('Payment rejected');
      setTransactions((txs) => txs.map((t) => (t.id === transactionId ? { ...t, status: 'rejected', type: 'advance_payment_rejection' } : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject payment');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmDepositPaid = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/transactions/${transactionId}/confirm-deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to confirm deposit');
      toast.success('Deposit confirmed! Waiting for FOH verification.');
      // Refresh transactions by fetching them again
      const txRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (txRes.ok) {
        const txData: Transaction[] = await txRes.json();
        setTransactions(txData);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const budgetLabel = role === 'professional' ? 'Contract Value' : 'Project Budget';
  const paymentsLabel = 'Payments Released';
  const escrowActive = escrowConfirmed > 0;
  const budgetTitle = escrowActive ? `${budgetLabel} · In escrow` : budgetLabel;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Project Financials</h2>
        </div>
        {(role === 'client' || role === 'admin') && originalBudget && (
          <div className="text-right">
            <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold">Original Budget</p>
            <p className="text-lg font-bold text-slate-900">{formatHKD(originalBudget)}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 text-sm text-slate-500">Loading financials...</div>
      ) : error ? (
        <div className="p-5 text-sm text-rose-600">{error}</div>
      ) : (
        <div className="p-5 space-y-6">
          {/* Three Mini Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Project Value Card */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
              <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Project Value</p>
              <p className="text-xl font-bold text-slate-900">{formatHKD(projectCost)}</p>
            </div>

            {/* In Escrow Card */}
            <div className={`rounded-lg border px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${
              escrowActive
                ? 'border-emerald-100 bg-emerald-50'
                : 'border-slate-200 bg-slate-50'
            }`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                escrowActive ? 'text-emerald-700' : 'text-slate-700'
              }`}>
                In Escrow
              </p>
              <p className={`text-xl font-bold ${
                escrowActive ? 'text-emerald-900' : 'text-slate-900'
              }`}>
                {formatHKD(escrowConfirmed)}
              </p>
            </div>

            {/* Paid Card */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 shadow-[0_1px_3px_rgba(59,130,246,0.08)]">
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Paid</p>
              <p className="text-xl font-bold text-blue-900">{formatHKD(paymentsReleasedTotal)}</p>
            </div>
          </div>

          {/* Transactions table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Initiated By</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">No financial transactions yet</td>
                  </tr>
                )}
                {filteredTransactions.map((tx) => {
                  const createdDate = new Date(tx.createdAt).toLocaleDateString('en-HK');
                  const status = (tx.status || '').toLowerCase();
                  const statusKey = status.replace(/\s+/g, '_');
                  const type = tx.type;
                  const canConfirmDeposit =
                    role === 'admin' &&
                    ((type === 'escrow_deposit' && statusKey === 'pending') ||
                      (type === 'escrow_deposit_confirmation' && statusKey === 'awaiting_confirmation'));
                  const canApprove = role === 'client' && type === 'advance_payment_request' && statusKey === 'pending';
                  const canRelease = role === 'admin' && type === 'advance_payment_request' && statusKey === 'confirmed';
                  const canReject = role === 'client' && type === 'advance_payment_request' && statusKey === 'pending';
                  const canMarkPaid = role === 'client' && type === 'escrow_deposit_request' && statusKey === 'pending';
                  const isInfo = statusKey === 'info';

                  const actionButton = () => {
                    if (isInfo) {
                      return <span className="text-slate-400 text-xs">—</span>;
                    }
                    if (canMarkPaid) {
                      return (
                        <button
                          onClick={() => handleConfirmDepositPaid(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Processing...' : 'Paid'}
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
                            onClick={() => handleRejectPayment(tx.id)}
                            disabled={processingId === tx.id}
                            className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-medium hover:bg-rose-700 disabled:bg-slate-400 transition"
                          >
                            {processingId === tx.id ? 'Rejecting...' : 'Reject'}
                          </button>
                        </div>
                      );
                    }
                    if (canReject) {
                      return (
                        <button
                          onClick={() => handleRejectPayment(tx.id)}
                          disabled={processingId === tx.id}
                          className="px-3 py-1 bg-rose-600 text-white rounded text-xs font-medium hover:bg-rose-700 disabled:bg-slate-400 transition"
                        >
                          {processingId === tx.id ? 'Rejecting...' : 'Reject'}
                        </button>
                      );
                    }
                    return <span className="text-slate-400 text-xs">—</span>;
                  };

                  return (
                    <tr key={tx.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-700">{createdDate}</td>
                      <td className="py-2 pr-4 text-slate-700">{tx.requestedByRole || '—'}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{getTypeLabel(tx.type)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-900 font-semibold">{formatHKD(tx.amount)}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {actionButton()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
