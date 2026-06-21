'use client';

import React from 'react';
import confetti from 'canvas-confetti';

export type WaitingParty = 'professional' | 'client' | 'platform';

export interface WorkflowNextStep {
  actionLabel: string;
  description?: string;
  requiresAction: boolean;   // false → waiting on another party or platform
  tab?: string;              // tab to navigate to when CTA is clicked
  waitingFor?: WaitingParty; // shown when requiresAction === false
}

export type CelebrationVariant = 'confetti';
type CelebrationMode = CelebrationVariant;

interface WorkflowCompletionModalProps {
  isOpen: boolean;
  completedLabel: string;      // "Start date agreed!"
  completedDescription?: string;
  nextStep: WorkflowNextStep | null;
  primaryActionLabel?: string;
  additionalActionLabel?: string;
  secondaryActionLabel?: string;
  showConfetti?: boolean;
  celebrationVariant?: CelebrationMode;
  showPrimaryActionOverride?: boolean;
  highlightWaitingAsAmber?: boolean;
  onNavigate?: () => void;     // called when the user clicks the CTA
  onAdditionalAction?: () => void;
  onClose: () => void;
}

const waitingCopy: Record<WaitingParty, string> = {
  professional: 'The professional will be notified and needs to act next.',
  client: 'The client will be notified and needs to act next.',
  platform: 'MIMO has been notified and will process this shortly.',
};

export const WorkflowCompletionModal: React.FC<WorkflowCompletionModalProps> = ({
  isOpen,
  completedLabel,
  completedDescription,
  nextStep,
  primaryActionLabel = 'Go there now ->',
  additionalActionLabel,
  secondaryActionLabel = 'Close',
  showConfetti = false,
  celebrationVariant = 'confetti',
  showPrimaryActionOverride,
  highlightWaitingAsAmber = false,
  onNavigate,
  onAdditionalAction,
  onClose,
}) => {
  const hasFiredConfettiRef = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen) {
      hasFiredConfettiRef.current = false;
      return;
    }

    if (!showConfetti || hasFiredConfettiRef.current) return;
    hasFiredConfettiRef.current = true;

    confetti({
      particleCount: 110,
      spread: 80,
      origin: { y: 0.65 },
    });
  }, [isOpen, showConfetti]);

  if (!isOpen) return null;

  const canActNow = nextStep?.requiresAction === true;
  const emphasizeAmber = canActNow || highlightWaitingAsAmber;
  const showPrimaryAction = (showPrimaryActionOverride ?? canActNow) && Boolean(onNavigate);
  const waitingFor = nextStep?.waitingFor;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={completedLabel}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
        {/* Success header */}
        <div className="flex items-start gap-3 rounded-t-2xl bg-emerald-100/80 border-b border-emerald-200 px-5 py-4">
          <span className="mt-0.5 text-xl">✅</span>
          <div>
            <p className="text-base font-bold text-emerald-800">{completedLabel}</p>
            {completedDescription && (
              <p className="mt-1 text-sm text-emerald-700">{completedDescription}</p>
            )}
          </div>
        </div>

        {/* Next step body */}
        {nextStep && (
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {canActNow ? 'Your next step' : 'What happens next'}
            </p>

            <div className={`rounded-lg border px-4 py-3 space-y-1 ${
              emphasizeAmber
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-[#D4C8A0] bg-white'
            }`}>
              <p className={`text-sm font-semibold ${emphasizeAmber ? 'text-amber-700' : 'text-slate-700'}`}>
                {nextStep.actionLabel}
              </p>
              {nextStep.description && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {nextStep.description}
                </p>
              )}
            </div>

            {!canActNow && waitingFor && (
              <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${
                highlightWaitingAsAmber
                  ? 'border border-amber-700/40 bg-amber-900/20'
                  : 'border border-sky-700/40 bg-sky-900/20'
              }`}>
                <span className={`text-sm mt-0.5 ${highlightWaitingAsAmber ? 'text-amber-400' : 'text-sky-400'}`}>⏳</span>
                <p className={`text-xs ${highlightWaitingAsAmber ? 'text-amber-300' : 'text-sky-300'}`}>{waitingCopy[waitingFor]}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#D4C8A0]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#F5EEDE] transition"
          >
            {secondaryActionLabel}
          </button>
          {onAdditionalAction && additionalActionLabel && (
            <button
              type="button"
              onClick={() => {
                onAdditionalAction();
                onClose();
              }}
              className="rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#F5EEDE] transition"
            >
              {additionalActionLabel}
            </button>
          )}
          {showPrimaryAction && onNavigate && (
            <button
              type="button"
              onClick={() => {
                onNavigate();
                onClose();
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
            >
              {primaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
