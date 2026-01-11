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

  // Prevent duplicate in-flight requests
  const requestInFlightRef = useRef<Promise<readonly [Summary, Transaction[]]> | null>(null);

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
    return filteredTransactions
      .filter((tx) => tx.type === 'release_payment' || (tx.type === 'advance_payment_request' && tx.status === 'completed'))
      .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount), 0);
  }, [filteredTransactions]);

  const escrowConfirmed = useMemo(() => {
    const escrow = filteredTransactions
      .filter(
        (tx) =>
          (tx.type === 'escrow_deposit' && tx.status?.toLowerCase() === 'confirmed') ||
          (tx.type === 'escrow_deposit_confirmation' && ['pending', 'confirmed'].includes(tx.status?.toLowerCase() || ''))
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

        setLoading(true);
        setError(null);

        const combinedPromise = (async () => {
          const [summaryRes, txRes, projectRes] = await Promise.all([
            fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
            fetch(`${API_BASE_URL}/projects/${projectId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          ]);

          if (!summaryRes.ok || !txRes.ok) {
            throw new Error('Failed to load financial data');
          }

          const summaryData: Summary = await summaryRes.json();
          const txData: Transaction[] = await txRes.json();
          const projectData = projectRes.ok ? await projectRes.json() : null;
          
          if (projectData?.escrowHeld !== undefined) {
            setProjectEscrowHeld(projectData.escrowHeld);
          }
          
          return [summaryData, txData] as const;
        })();

        requestInFlightRef.current = combinedPromise;
        const [, txData] = await combinedPromise;
        console.log('[ProjectFinancials] Loaded transactions:', txData);
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
  }, [projectId, accessToken, projectProfessionalId, resolvedRole]);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm deposit');
    } finally {
      setProcessingId(null);
    }
  };

  const budgetLabel = resolvedRole === 'professional' ? 'Contract Value' : 'Approved Budget';
  const paymentsLabel = 'Payments Released';
  const escrowActive = escrowConfirmed > 0;
  const budgetTitle = escrowActive ? `${budgetLabel} · In escrow` : budgetLabel;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Project Financials</h2>
          <button
            onClick={handleViewStatement}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            View Statement
          </button>
        </div>
        {(resolvedRole === 'client' || resolvedRole === 'admin') && approvedBudget && (
          <div className="text-right">
            <p className="text-xs text-slate-600 uppercase tracking-wide font-semibold">Approved Budget</p>
            <p className="text-lg font-bold text-slate-900">{formatHKD(approvedBudget)}</p>
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
            {/* Project Value Card - Show for all roles */}
            {resolvedRole === 'professional' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Project Value</p>
                <p className="text-xl font-bold text-slate-900">{formatHKD(projectCost)}</p>
              </div>
            )}
            {(resolvedRole === 'client' || resolvedRole === 'admin') && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Approved Quote</p>
                <p className="text-xl font-bold text-slate-900">{formatHKD(projectCost)}</p>
              </div>
            )}

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
                {formatHKD(projectEscrowHeld || escrowConfirmed)}
              </p>
              {!escrowActive && <p className="text-xs text-slate-500 mt-1">Awaiting confirmation</p>}
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
                    <td colSpan={6} className="py-4 text-center text-slate-500">No financial transactions yet</td>
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
                    resolvedRole === 'client' && type === 'advance_payment_request' && statusKey === 'pending';
                  const canRelease =
                    resolvedRole === 'admin' && type === 'advance_payment_request' && statusKey === 'confirmed';
                  const canReject =
                    resolvedRole === 'client' && type === 'advance_payment_request' && statusKey === 'pending';
                  const canMarkPaid =
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
                      <td className="py-2 pr-4 text-slate-700">
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
                          <span className="font-medium text-slate-900">{getTypeLabel(tx.type)}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-900 font-semibold">{formatHKD(tx.amount)}</td>
                      <td className="py-2 pr-4">
                        <StatusPill status={tx.status} label={statusKey.replace('_', ' ')} tone={statusToneFromStatus(tx.status)} />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {actionButton()}
                          {!isInfo && (
                            <button
                              onClick={() => setSelectedTx(tx)}
                              className="text-xs text-blue-600 hover:underline"
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
