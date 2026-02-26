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
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Financials will be available once your quote is awarded.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      {projectFinancials && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Awarded Amount</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              ${awardedAmount ? parseFloat(awardedAmount.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total Requested</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              ${projectFinancials.totalPaymentRequest ? parseFloat(projectFinancials.totalPaymentRequest.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Paid</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              ${projectFinancials.totalPaid ? parseFloat(projectFinancials.totalPaid.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              ${projectFinancials.balance ? parseFloat(projectFinancials.balance.toString()).toFixed(2) : '0.00'}
            </p>
          </div>
        </div>
      )}

      {/* Submit Payment Request */}
      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4 space-y-3">
        <h3 className="font-semibold text-indigo-900">Submit Payment Request</h3>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                type="number"
                step="0.01"
                value={paymentRequestAmount}
                onChange={(e) => onUpdatePaymentRequestAmount(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 pl-6 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
            <select
              value={paymentRequestType}
              onChange={(e) => onUpdatePaymentRequestType(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {paymentRequestActionLoading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
          <textarea
            value={paymentRequestNotes}
            onChange={(e) => onUpdatePaymentRequestNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Describe what this payment is for (e.g., deposit, materials, labor, completion)"
          />
        </div>
      </div>

      {/* Payment Request History */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-900">Payment Request History</h3>

        {paymentRequestError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {paymentRequestError}
          </div>
        )}

        {paymentRequestLoading ? (
          <p className="text-sm text-slate-600">Loading payment requests...</p>
        ) : paymentRequests.length === 0 ? (
          <p className="text-sm text-slate-600">No payment requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Status</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Submitted</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-900">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paymentRequests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      ${parseFloat(request.amount.toString()).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{request.type}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          request.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : request.status === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : request.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs max-w-xs truncate" title={request.notes}>
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
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Pending ({paymentRequests.filter((p) => p.status === 'pending').length})</span>
            <span className="font-semibold text-slate-900">
              ${totalPending.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Paid ({paymentRequests.filter((p) => p.status === 'paid').length})</span>
            <span className="font-semibold text-emerald-900">
              ${totalPaid.toFixed(2)}
            </span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold">
            <span>Total Requested</span>
            <span className="text-slate-900">
              ${(totalPending + totalPaid).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
