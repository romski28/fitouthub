'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import toast from 'react-hot-toast';

interface ProfessionalFinancialSectionProps {
  projectProfessionalId: string;
  projectId: string;
  accessToken: string;
  quoteAmount: number | string;
  isAwarded: boolean;
}

interface Transaction {
  id: string;
  type: string;
  amount: number | string;
  status: string;
  description: string;
  createdAt: string;
}

const formatHKD = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    minimumFractionDigits: 0,
  }).format(num);
};

export default function ProfessionalFinancialSection({
  projectProfessionalId,
  projectId,
  accessToken,
  quoteAmount,
  isAwarded,
}: ProfessionalFinancialSectionProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          // Filter to only show transactions related to this professional
          setTransactions(data.filter((tx: Transaction) => 
            tx.type.includes('advance_payment')
          ));
        }
      } catch (err) {
        console.error('Error loading financial data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isAwarded && projectId && accessToken) {
      fetchTransactions();
    }
  }, [projectId, accessToken, isAwarded]);

  const handleRequestAdvance = async () => {
    if (!requestAmount || parseFloat(requestAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`${API_BASE_URL}/financial`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          projectProfessionalId,
          type: 'advance_payment_request',
          description: `Advance payment request - ${formatHKD(requestAmount)}`,
          amount: parseFloat(requestAmount),
        }),
      });

      if (!res.ok) throw new Error('Failed to request advance payment');

      toast.success('Advance payment requested successfully');
      setShowRequestForm(false);
      setRequestAmount('');

      // Refresh transactions
      const refreshRes = await fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setTransactions(data.filter((tx: Transaction) => 
          tx.type.includes('advance_payment')
        ));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAwarded) return null;

  const pendingRequest = transactions.find(tx => tx.status === 'pending');
  const approvedPayments = transactions.filter(tx => 
    tx.status === 'confirmed' && tx.type === 'advance_payment_request'
  );

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-900">Financial Status</p>
        <span className="text-xs font-medium text-blue-700">Project Awarded</span>
      </div>

      {/* Quote Amount */}
      <div className="rounded-lg bg-white border border-blue-100 p-3">
        <p className="text-xs font-medium text-gray-600 mb-1">Agreed Project Amount</p>
        <p className="text-2xl font-bold text-blue-900">{formatHKD(quoteAmount)}</p>
      </div>

      {/* Pending Request */}
      {pendingRequest && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900 mb-1">⏳ Advance Payment Pending</p>
          <p className="text-xs text-amber-700 mb-2">Waiting for client approval</p>
          <p className="text-lg font-bold text-amber-900">{formatHKD(pendingRequest.amount)}</p>
        </div>
      )}

      {/* Approved Payments */}
      {approvedPayments.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-semibold text-green-900 mb-2">✓ Approved Payments</p>
          {approvedPayments.map(tx => (
            <div key={tx.id} className="text-xs text-green-700">
              {formatHKD(tx.amount)} - {new Date(tx.createdAt).toLocaleDateString('en-HK')}
            </div>
          ))}
        </div>
      )}

      {/* Request Advance Button */}
      {!pendingRequest && !showRequestForm && (
        <button
          onClick={() => setShowRequestForm(true)}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          Request Advance Payment
        </button>
      )}

      {/* Request Form */}
      {showRequestForm && (
        <div className="rounded-lg border-2 border-blue-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Request Advance Payment</h3>
          <p className="text-xs text-gray-600 mb-3">
            Request an advance payment to start the project. The client will review and approve.
          </p>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (HKD)</label>
            <input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowRequestForm(false);
                setRequestAmount('');
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleRequestAdvance}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              {submitting ? 'Requesting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
