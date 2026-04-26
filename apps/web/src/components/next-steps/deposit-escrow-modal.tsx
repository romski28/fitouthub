'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import toast from 'react-hot-toast';

interface DepositEscrowModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

interface EscrowTx {
  id: string;
  amount: number | string;
  status: string;
}

export function DepositEscrowModal({ isOpen, isLoading = false, onClose }: DepositEscrowModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();
  const projectId = state.projectId;

  const [pendingTx, setPendingTx] = useState<EscrowTx | null>(null);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const [phase, setPhase] = useState<'confirm' | 'otp'>('confirm');
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setPhase('confirm');
    setOtpCode('');
    setOtpSending(false);
    setOtpVerifying(false);
    setResendCooldown(0);
    setPendingTx(null);
    setTxError(null);
  }, [isOpen]);

  // Fetch pending escrow deposit transaction
  useEffect(() => {
    if (!isOpen || !projectId || !accessToken) return;

    setLoadingTx(true);
    setTxError(null);

    fetch(`${API_BASE_URL}/financial/project/${projectId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load financial data');
        return res.json() as Promise<{
          transactions?: Array<{ id: string; type: string; status: string; amount: number | string }>;
        }>;
      })
      .then((data) => {
        const tx =
          data.transactions?.find(
            (t) => t.type === 'escrow_deposit_request' && t.status.replace(/\s+/g, '_') === 'pending',
          ) ?? null;
        if (!tx) {
          setTxError('No pending escrow deposit found. You can fund from the Financials tab.');
        } else {
          setPendingTx(tx);
        }
      })
      .catch((err: unknown) => {
        setTxError(err instanceof Error ? err.message : 'Failed to load escrow transaction');
      })
      .finally(() => setLoadingTx(false));
  }, [isOpen, projectId, accessToken]);

  // Resend cooldown tick
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const requestOtp = useCallback(
    async (txId: string) => {
      if (!accessToken) return;
      setOtpSending(true);
      try {
        const res = await fetch(`${API_BASE_URL}/financial/${txId}/checkout-otp/request`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(data.message || 'Failed to send OTP');
        }
        setResendCooldown(60);
        toast.success('OTP sent to your email and preferred contact channel');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
      } finally {
        setOtpSending(false);
      }
    },
    [accessToken],
  );

  const handleDepositNow = async () => {
    if (!pendingTx) return;
    await requestOtp(pendingTx.id);
    setOtpCode('');
    setPhase('otp');
  };

  const handleVerifyAndCheckout = async () => {
    if (!pendingTx || !accessToken) return;
    const trimmed = otpCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    setOtpVerifying(true);
    try {
      const verifyRes = await fetch(`${API_BASE_URL}/financial/${pendingTx.id}/checkout-otp/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!verifyRes.ok) {
        const data = (await verifyRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || 'Invalid OTP code');
      }

      const checkoutRes = await fetch(`${API_BASE_URL}/financial/${pendingTx.id}/checkout-session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!checkoutRes.ok) {
        const data = (await checkoutRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || 'Failed to start checkout');
      }

      const data = (await checkoutRes.json()) as { checkoutUrl?: string };
      if (!data.checkoutUrl) throw new Error('Checkout URL missing from response');

      onClose();
      window.location.assign(data.checkoutUrl);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to process payment');
    } finally {
      setOtpVerifying(false);
    }
  };

  if (!isOpen || !state.modalContent) return null;

  const { title, body, imageUrl } = state.modalContent;
  const fmtAmount = pendingTx
    ? new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(
        Number(pendingTx.amount),
      )
    : null;

  const busy = isLoading || loadingTx;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {busy ? (
          <div className="flex flex-col items-center justify-center px-6 py-14">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
            <p className="text-slate-300">Loading...</p>
          </div>
        ) : phase === 'confirm' ? (
          <>
            <div className="px-6 pb-5 pt-10 text-center">
              <div className="mb-4 flex justify-center">
                <img
                  src={imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                  alt="Step illustration"
                  className="h-20 w-20 rounded-full border border-white/20 object-cover"
                />
              </div>
              {title && <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>}
              {body && <p className="mt-3 text-base leading-relaxed text-slate-100">{body}</p>}
              {txError ? (
                <p className="mt-4 rounded-lg bg-rose-900/40 px-4 py-2 text-sm text-rose-300">{txError}</p>
              ) : fmtAmount ? (
                <p className="mt-4 text-lg font-semibold text-white">
                  Amount to deposit: <span className="text-emerald-300">{fmtAmount}</span>
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDepositNow}
                disabled={!pendingTx || otpSending}
                className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
              >
                {otpSending ? 'Sending OTP...' : 'Deposit now'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pb-5 pt-8">
              <h2 className="mb-1 text-xl font-bold text-emerald-300">Verify escrow payment</h2>
              <p className="text-sm text-slate-300">
                Enter the 6-digit OTP sent to your email and preferred contact channel.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit OTP"
                disabled={otpVerifying}
                autoFocus
                className="mt-4 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => pendingTx && requestOtp(pendingTx.id)}
                  disabled={otpSending || otpVerifying || resendCooldown > 0}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:text-slate-500"
                >
                  {resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : otpSending
                      ? 'Sending...'
                      : 'Resend OTP'}
                </button>
                <span className="text-xs text-slate-500">Code expires in 10 minutes</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setPhase('confirm')}
                disabled={otpVerifying}
                className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleVerifyAndCheckout}
                disabled={otpVerifying || otpSending || otpCode.trim().length !== 6}
                className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
              >
                {otpVerifying ? 'Verifying...' : 'Verify & Pay'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
