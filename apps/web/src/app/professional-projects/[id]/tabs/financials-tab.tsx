'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';

interface PaymentRequest {
  id: string;
  amount: number;
  type: 'fixed' | 'percentage' | 'milestone' | string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid' | string;
  notes?: string;
  createdAt: string;
  dueDate?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectionNotes?: string;
}

interface ProjectFinancials {
  projectBudget?: number;
  totalQuotedAmount?: number;
  awardedAmount?: number;
  totalPaymentRequest?: number;
  totalPaid?: number;
  balance?: number;
}

interface FinancialsTabProps {
  tab?: string;
  projectStatus: string;
  projectBudget?: number;
  awardedAmount?: number;
  paymentRequests: PaymentRequest[];
  projectFinancials: ProjectFinancials | null;
  paymentRequestLoading: boolean;
  paymentRequestError: string | null;
  onSubmitPaymentRequest: (amount: number, type: string, notes: string) => Promise<void>;
  paymentRequestActionLoading: boolean;
  paymentRequestAmount: string;
  onUpdatePaymentRequestAmount: (amount: string) => void;
  paymentRequestType: string;
  onUpdatePaymentRequestType: (type: string) => void;
  paymentRequestNotes: string;
  onUpdatePaymentRequestNotes: (notes: string) => void;
}

export const FinancialsTab: React.FC<FinancialsTabProps> = ({
  projectStatus,
  projectBudget,
  awardedAmount,
  paymentRequests,
  projectFinancials,
  paymentRequestLoading,
  paymentRequestError,
  onSubmitPaymentRequest,
  paymentRequestActionLoading,
  paymentRequestAmount,
  onUpdatePaymentRequestAmount,
  paymentRequestType,
  onUpdatePaymentRequestType,
  paymentRequestNotes,
  onUpdatePaymentRequestNotes,
}) => {
  const isAwarded = projectStatus === 'awarded';
  const totalPending = paymentRequests
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paymentRequests.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

  if (!isAwarded) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-200">
        Financials will be available once your quote is awarded.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      {projectFinancials && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Awarded Amount</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${awardedAmount ? parseFloat(awardedAmount.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Requested</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.totalPaymentRequest ? parseFloat(projectFinancials.totalPaymentRequest.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Paid</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.totalPaid ? parseFloat(projectFinancials.totalPaid.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-white">
              ${projectFinancials.balance ? parseFloat(projectFinancials.balance.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
        </div>
      )}

      {/* Submit Payment Request */}
      <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <h3 className="font-semibold text-white">Submit Payment Request</h3>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                step="0.01"
                value={paymentRequestAmount}
                onChange={(e) => onUpdatePaymentRequestAmount(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 pl-6 text-sm text-white placeholder-slate-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
            <select
              value={paymentRequestType}
              onChange={(e) => onUpdatePaymentRequestType(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="fixed">Fixed Amount</option>
              <option value="percentage">Percentage</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                if (!paymentRequestAmount || parseFloat(paymentRequestAmount) <= 0) {
                  toast.error('Please enter a valid amount');
                  return;
                }
                onSubmitPaymentRequest(parseFloat(paymentRequestAmount), paymentRequestType, paymentRequestNotes);
              }}
              disabled={paymentRequestActionLoading}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {paymentRequestActionLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (optional)</label>
          <textarea
            value={paymentRequestNotes}
            onChange={(e) => onUpdatePaymentRequestNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500"
            placeholder="Describe what this payment is for (e.g., deposit, materials, labor, completion)"
          />
        </div>
      </div>

      {/* Payment Request History */}
      <div className="space-y-3">
        <h3 className="font-semibold text-white">Payment Request History</h3>

        {paymentRequestError && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {paymentRequestError}
          </div>
        )}

        {paymentRequestLoading ? (
          <p className="text-sm text-slate-300">Loading payment requests...</p>
        ) : paymentRequests.length === 0 ? (
          <p className="text-sm text-slate-300">No payment requests yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-2 text-left font-semibold text-white">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Submitted</th>
                  <th className="px-3 py-2 text-left font-semibold text-white">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paymentRequests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-semibold text-white">
                      ${parseFloat(request.amount.toString()).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{request.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          request.status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                            : request.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                            : request.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                            : 'bg-slate-700 text-slate-200 border border-slate-600'
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-slate-300 text-xs max-w-xs truncate" title={request.notes}>
                      {request.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Status */}
      {paymentRequests.length > 0 && (
        <div className="rounded-md border border-slate-700 bg-slate-900/60 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-300">Pending ({paymentRequests.filter((p) => p.status === 'pending').length})</span>
            <span className="font-semibold text-white">
              ${totalPending.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-300">Paid ({paymentRequests.filter((p) => p.status === 'paid').length})</span>
            <span className="font-semibold text-emerald-200">
              ${totalPaid.toFixed(2)}
            </span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between font-semibold text-white">
            <span>Total Requested</span>
            <span className="text-white">
              ${(totalPending + totalPaid).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
