'use client';

import React from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useNextStepModal } from '@/context/next-step-modal-context';

interface PaymentRequestModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  accessToken?: string | null;
  projectId?: string;
  projectProfessionalId?: string;
  onSubmitted?: () => void;
}

export function PaymentRequestModal({
  isOpen,
  isLoading = false,
  onClose,
  accessToken,
  projectId,
  projectProfessionalId,
  onSubmitted,
}: PaymentRequestModalProps) {
  const { state } = useNextStepModal();
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const effectiveProjectId = projectId || state.projectId || '';
  const effectiveToken = accessToken;

  React.useEffect(() => {
    if (!isOpen) return;
    setAmount('');
    setDescription('');
    setSubmitting(false);
  }, [isOpen]);

  const handleSubmit = async () => {
    const amt = Number(amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!effectiveToken || !effectiveProjectId) {
      toast.error('Missing project context');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${effectiveProjectId}/payment-request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amt,
          type: 'additional_works',
          notes: description.trim() || 'Additional works request',
          projectProfessionalId: projectProfessionalId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to submit request');
      }

      toast.success('Payment request submitted');
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(81,55,32,0.35)] backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.94)] shadow-2xl">
        <div className="border-b border-[rgba(120,53,15,0.14)] px-5 py-4">
          <h3 className="text-lg font-semibold text-[#4A3623]">Request additional works payment</h3>
          <p className="mt-0.5 text-xs text-[rgba(126,58,33,0.65)]">
            Submit a payment request for work that was not in the original scope.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-3 border-[rgba(120,53,15,0.14)] border-t-[#FF7F50]" />
              <p className="text-xs text-[rgba(126,58,33,0.55)]">Loading...</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#4A3623] mb-1">Amount (HKD)</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[rgba(126,58,33,0.55)]">HK$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-10 w-full rounded-md border border-[rgba(120,53,15,0.22)] bg-white/70 pl-12 pr-3 text-sm text-[#4A3623] placeholder-[rgba(126,58,33,0.4)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A3623] mb-1">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="e.g. Additional wiring beyond original scope"
                  className="w-full rounded-md border border-[rgba(120,53,15,0.22)] bg-white/70 px-3 py-2 text-xs text-[#4A3623] placeholder-[rgba(126,58,33,0.4)] resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[rgba(120,53,15,0.14)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-w-[90px] rounded-lg border border-[rgba(120,53,15,0.2)] px-4 py-2 text-sm font-semibold text-[#4A3623] transition hover:bg-[rgba(245,238,219,0.9)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !amount.trim()}
            className="min-w-[140px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
}
