'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/context/auth-context';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { WorkflowCompletionModal } from '@/components/workflow-completion-modal';

interface StartOnSiteModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 5000; // check every 5 s whether the site is started
const QR_EXPIRY_MINUTES = 15;

export function StartOnSiteModal({ isOpen, onClose }: StartOnSiteModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();

  const isProfessional = (state.role || '').toUpperCase().includes('PROFESSIONAL');

  // ── Professional state ────────────────────────────────────────────────
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [generatingQr, setGeneratingQr] = useState(false);

  // ── Client state ──────────────────────────────────────────────────────
  const scannerRef = useRef<any>(null);
  const scannerDivId = 'start-on-site-qr-scanner';
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // ── Shared ────────────────────────────────────────────────────────────
  const [completionOpen, setCompletionOpen] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Generate QR (professional) ────────────────────────────────────────
  const generateQr = useCallback(async () => {
    if (!state.projectId || !accessToken) return;
    setGeneratingQr(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/${state.projectId}/site-start/generate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to generate QR');
      }
      const { token, expiresAt } = await res.json();
      setQrToken(token);
      setQrExpiresAt(new Date(expiresAt));
      setSecondsLeft(QR_EXPIRY_MINUTES * 60);
    } catch (e: any) {
      toast.error(e.message || 'Could not generate QR code');
    } finally {
      setGeneratingQr(false);
    }
  }, [state.projectId, accessToken]);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (!qrToken || !isOpen) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setQrToken(null);
          setQrExpiresAt(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [qrToken, isOpen]);

  // ── Confirm site start (client, called after QR scan) ─────────────────
  const confirmSiteStart = useCallback(
    async (token: string) => {
      if (!state.projectId || !accessToken || confirming) return;
      setConfirming(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/projects/${state.projectId}/site-start/confirm`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ token }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Confirmation failed');
        }
        setCompletionOpen(true);
      } catch (e: any) {
        toast.error(e.message || 'Could not confirm site start');
        setScannerError(e.message || 'Could not confirm site start');
      } finally {
        setConfirming(false);
      }
    },
    [state.projectId, accessToken, confirming],
  );

  // ── QR Scanner lifecycle (client) ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || isProfessional) return;

    let stopped = false;

    const startScanner = async () => {
      try {
        // html5-qrcode uses a class-based API; import it dynamically so it
        // only runs on the client (avoids SSR issues).
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;

        const scanner = new Html5Qrcode(scannerDivId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            // Only process once
            scanner.stop().catch(() => {});
            confirmSiteStart(decodedText);
          },
          () => {
            // Scan failure — silently ignore per-frame misses
          },
        );
      } catch (err: any) {
        if (!stopped) {
          const msg =
            err?.message?.includes('Permission')
              ? 'Camera permission denied. Please allow camera access and try again.'
              : err?.message || 'Could not start camera.';
          setScannerError(msg);
        }
      }
    };

    startScanner();

    return () => {
      stopped = true;
      scannerRef.current
        ?.stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current = null;
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isProfessional]);

  // ── Poll for confirmation on professional side ────────────────────────
  // (so their modal updates if the client scans while it's open)
  useEffect(() => {
    if (!isOpen || !isProfessional || !state.projectId || !accessToken) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/projects/${state.projectId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.siteStartedAt) {
          setCompletionOpen(true);
        }
      } catch {
        // ignore
      }
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, isProfessional, state.projectId, accessToken]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQrToken(null);
      setQrExpiresAt(null);
      setSecondsLeft(0);
      setScannerError(null);
      setConfirming(false);
    }
  }, [isOpen]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!isOpen) return null;

  // ─── Completion state ─────────────────────────────────────────────────
  if (completionOpen) {
    return (
      <WorkflowCompletionModal
        isOpen={completionOpen}
        showConfetti
        completedLabel="Project started on site!"
        completedDescription={
          isProfessional
            ? 'The client has confirmed on-site presence. The project is now in progress.'
            : 'On-site start confirmed. Your project is now in progress!'
        }
        nextStep={null}
        onClose={() => {
          setCompletionOpen(false);
          state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
          onClose();
        }}
      />
    );
  }

  // ─── Professional: show QR ────────────────────────────────────────────
  if (isProfessional) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col items-center gap-5">
          <h2 className="text-xl font-semibold text-gray-900 text-center">Start project on site</h2>
          <p className="text-sm text-gray-500 text-center">
            Show this QR code to your client. They will scan it to confirm you are both on site.
          </p>

          {!qrToken ? (
            <button
              onClick={generateQr}
              disabled={generatingQr}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {generatingQr ? 'Generating…' : 'Generate QR Code'}
            </button>
          ) : (
            <>
              <div className="border-4 border-indigo-100 rounded-xl p-3">
                <QRCodeSVG value={qrToken} size={220} />
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400">Expires in</span>
                <span
                  className={`text-2xl font-mono font-bold tabular-nums ${
                    secondsLeft < 60 ? 'text-red-500' : 'text-indigo-600'
                  }`}
                >
                  {formatTime(secondsLeft)}
                </span>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Ask the client to open their &ldquo;Start project on site&rdquo; step and scan this code.
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={generateQr}
                  disabled={generatingQr}
                  className="flex-1 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition"
                >
                  Regenerate
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {!qrToken && (
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Client: scan QR ─────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col items-center gap-5">
        <h2 className="text-xl font-semibold text-gray-900 text-center">Start project on site</h2>
        <p className="text-sm text-gray-500 text-center">
          Point your camera at the QR code shown on the professional&rsquo;s screen.
        </p>

        {scannerError ? (
          <div className="w-full rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 text-center">
            {scannerError}
          </div>
        ) : confirming ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Confirming…</p>
          </div>
        ) : (
          <div className="w-full rounded-xl overflow-hidden bg-black" style={{ minHeight: 280 }}>
            {/* html5-qrcode mounts its video into this div */}
            <div id={scannerDivId} className="w-full" />
          </div>
        )}

        <p className="text-xs text-gray-400 text-center">
          The professional should open their &ldquo;Start project on site&rdquo; step to display the QR code.
        </p>

        <button
          onClick={onClose}
          disabled={confirming}
          className="w-full py-2 rounded-lg border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
