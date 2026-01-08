'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

interface FinancialSummary {
  totalEscrow: string | number;
  escrowConfirmed: string | number;
  advancePaymentRequested: string | number;
  advancePaymentApproved: string | number;
  paymentsReleased: string | number;
  transactions: any[];
}

interface ClientFinancialSectionProps {
  projectId: string;
  accessToken: string;
  projectCost: number | string;
  isAwarded: boolean;
}

const formatHKD = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(num);
};

export default function ClientFinancialSection({
  projectId,
  accessToken,
  projectCost,
  isAwarded,
}: ClientFinancialSectionProps) {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleApprovePayment = async (transactionId: string) => {
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error('Failed to approve payment');
      
      toast.success('Payment request approved!');
      
      // Refresh summary
      const newRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (newRes.ok) setSummary(await newRes.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectPayment = async (transactionId: string) => {
    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}` 
        },
        body: JSON.stringify({ reason: 'Declined by client' }),
      });

      if (!res.ok) throw new Error('Failed to decline payment');
      
      toast.success('Payment request declined.');
      
      // Refresh summary
      const newRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (newRes.ok) setSummary(await newRes.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to decline');
    } finally {
      setSubmitting(false);
    }
  };
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) throw new Error('Failed to fetch financial summary');
        const data = await res.json();
        setSummary(data);
      } catch (err) {
        console.error('Error loading financial summary:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isAwarded && projectId && accessToken) {
      fetchSummary();
    }
  }, [projectId, accessToken, isAwarded]);

  const handleConfirmDeposit = async () => {
    try {
      setSubmitting(true);
      
      // Find pending escrow deposit transaction
      const escrowTx = summary?.transactions.find(
        tx => tx.type === 'escrow_deposit' && tx.status === 'pending'
      );

      if (!escrowTx) {
        toast.error('No pending escrow deposit found');
        return;
      }

      // Confirm it
      const res = await fetch(`${API_BASE_URL}/financial/${escrowTx.id}/confirm-deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error('Failed to confirm deposit');
      
      toast.success('Deposit confirmed! FOH will verify and proceed.');
      setShowModal(false);
      
      // Refresh summary
      const newRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (newRes.ok) setSummary(await newRes.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to confirm deposit');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAwarded || !summary) return null;

  const escrowTx = summary.transactions.find(tx => tx.type === 'escrow_deposit');
  const pendingApproval = summary.transactions.find(
    tx => tx.type === 'advance_payment_request' && tx.status === 'pending'
  );

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-emerald-900">Financial Status</p>
        <span className="text-xs font-medium text-emerald-700">Awarded</span>
      </div>

      {/* Escrow Deposit Request */}
      {escrowTx && escrowTx.status === 'pending' && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-amber-900 mb-1">Escrow Deposit Required</p>
              <p className="text-sm text-amber-700 mb-3">
                Please deposit the agreed project amount into escrow to initiate the project.
              </p>
            </div>
          </div>
          <div className="bg-white rounded border border-amber-100 p-3 mb-3">
            <p className="text-xs font-medium text-gray-600 mb-1">Amount to Deposit</p>
            <p className="text-2xl font-bold text-amber-900">{formatHKD(projectCost)}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition"
          >
            Confirm Deposit Made
          </button>
        </div>
      )}

      {/* Escrow Confirmed */}
      {escrowTx && escrowTx.status === 'confirmed' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-900 mb-1">✓ Escrow Deposit Confirmed</p>
          <p className="text-xs text-green-700">Amount: {formatHKD(escrowTx.amount)}</p>
        </div>
      )}

      {/* Pending Advance Payment Approval */}
      {pendingApproval && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <p className="font-semibold text-blue-900 mb-2">Advance Payment Request</p>
          <p className="text-sm text-blue-700 mb-3">
            The professional has requested an advance payment to start the project.
          </p>
          <div className="bg-white rounded border border-blue-100 p-3 mb-3">
            <p className="text-xs font-medium text-gray-600 mb-1">Requested Amount</p>
            <p className="text-2xl font-bold text-blue-900">{formatHKD(pendingApproval.amount)}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleApprovePayment(pendingApproval.id)}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition"
            >
              {submitting ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => handleRejectPayment(pendingApproval.id)}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-400 disabled:bg-gray-400 transition"
            >
              {submitting ? 'Processing...' : 'Decline'}
            </button>
          </div>
        </div>
      )}

      {/* Summary Grid */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-white border border-emerald-100 px-3 py-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
          <p className="text-[11px] font-semibold text-emerald-800">Project Cost</p>
          <p className="text-sm font-bold text-emerald-900">{formatHKD(projectCost)}</p>
        </div>
        <div className="rounded-md bg-white border border-emerald-100 px-3 py-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
          <p className="text-[11px] font-semibold text-emerald-800">Escrow Confirmed</p>
          <p className="text-sm font-bold text-emerald-900">{formatHKD(summary.escrowConfirmed || 0)}</p>
        </div>
      </div>

      {/* Modal for confirming deposit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Escrow Deposit</h3>
            
            <div className="bg-gray-50 rounded p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">Deposit Amount</p>
              <p className="text-2xl font-bold text-gray-900">{formatHKD(projectCost)}</p>
            </div>

            <p className="text-sm text-gray-700 mb-6">
              Please confirm that you have successfully deposited {formatHKD(projectCost)} into the escrow account. 
              The Fitout Hub team will verify this deposit and notify the professional.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeposit}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition"
              >
                {submitting ? 'Confirming...' : 'Confirm Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
