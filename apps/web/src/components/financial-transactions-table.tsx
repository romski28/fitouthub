'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';

interface FinancialTransaction {
  id: string;
  type: string;
  description: string;
  amount: number | string;
  status: string;
  requestedByRole?: string;
  approvedAt?: string;
  createdAt: string;
  projectProfessional?: {
    professional?: {
      fullName?: string;
      businessName?: string;
    };
  };
}

interface FinancialTableProps {
  projectId: string;
  accessToken: string;
  onTransactionUpdate?: () => void;
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
  const labels: Record<string, string> = {
    escrow_deposit: 'Escrow Deposit',
    payment_request: 'Payment Request',
    advance_payment_approval: 'Payment Approved',
    advance_payment_rejection: 'Payment Rejected',
    release_payment: 'Release Payment',
    escrow_confirmation: 'Escrow Confirmed',
  };
  return labels[type] || type;
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

export default function FinancialTransactionsTable({ projectId, accessToken, onTransactionUpdate }: FinancialTableProps) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) throw new Error('Failed to fetch transactions');
        const data = await res.json();
        setTransactions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transactions');
      } finally {
        setLoading(false);
      }
    };

    if (projectId && accessToken) {
      fetchTransactions();
    }
  }, [projectId, accessToken]);

  const handleConfirmDeposit = async (transactionId: string) => {
    try {
      setProcessingId(transactionId);
      const res = await fetch(`${API_BASE_URL}/financial/${transactionId}/confirm-deposit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error('Failed to confirm deposit');
      
      setTransactions(txs =>
        txs.map(tx => tx.id === transactionId ? { ...tx, status: 'confirmed' } : tx)
      );
      onTransactionUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm deposit');
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
      
      setTransactions(txs =>
        txs.map(tx => tx.id === transactionId ? { ...tx, status: 'completed' } : tx)
      );
      onTransactionUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release payment');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="text-center text-gray-500 text-sm">Loading financial transactions...</div>;
  if (error) return <div className="text-center text-red-600 text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      {transactions.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-8">
          No financial transactions yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Description</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Professional</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(tx.createdAt).toLocaleDateString('en-HK')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{getTypeLabel(tx.type)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{tx.description}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatHKD(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {tx.projectProfessional?.professional?.fullName ||
                      tx.projectProfessional?.professional?.businessName ||
                      '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tx.type === 'escrow_deposit' && tx.status === 'pending' && (
                      <button
                        onClick={() => handleConfirmDeposit(tx.id)}
                        disabled={processingId === tx.id}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:bg-gray-400 transition"
                      >
                        {processingId === tx.id ? 'Confirming...' : 'Confirm'}
                      </button>
                    )}
                    {tx.type === 'advance_payment_approval' && tx.status === 'confirmed' && (
                      <button
                        onClick={() => handleReleasePayment(tx.id)}
                        disabled={processingId === tx.id}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
                      >
                        {processingId === tx.id ? 'Releasing...' : 'Release'}
                      </button>
                    )}
                    {!['escrow_deposit', 'advance_payment_approval'].includes(tx.type) ||
                    (tx.type === 'escrow_deposit' && tx.status !== 'pending') ||
                    (tx.type === 'advance_payment_approval' && tx.status !== 'confirmed')
                      ? <span className="text-gray-400 text-xs">—</span>
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
