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

export type CelebrationVariant =
  | 'confetti'
  | 'sparkle-ring'
  | 'check-wave'
  | 'prism-burst';

interface WorkflowCompletionModalProps {
  isOpen: boolean;
  completedLabel: string;      // "Start date agreed!"
  completedDescription?: string;
  nextStep: WorkflowNextStep | null;
  primaryActionLabel?: string;
  additionalActionLabel?: string;
  secondaryActionLabel?: string;
  showConfetti?: boolean;
  celebrationVariant?: CelebrationVariant;
  showPrimaryActionOverride?: boolean;
  highlightWaitingAsAmber?: boolean;
  onNavigate?: () => void;     // called when the user clicks the CTA
  onAdditionalAction?: () => void;
  onClose: () => void;
}

const waitingCopy: Record<WaitingParty, string> = {
  professional: 'The professional will be notified and needs to act next.',
  client: 'The client will be notified and needs to act next.',
  platform: 'Fitout Hub has been notified and will process this shortly.',
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
  const [overlayCelebration, setOverlayCelebration] = React.useState<Exclude<CelebrationVariant, 'confetti'> | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      hasFiredConfettiRef.current = false;
      setOverlayCelebration(null);
      return;
    }

    if (!showConfetti || hasFiredConfettiRef.current) return;
    hasFiredConfettiRef.current = true;

    if (celebrationVariant !== 'confetti') {
      setOverlayCelebration(celebrationVariant);
      const timer = window.setTimeout(() => {
        setOverlayCelebration(null);
      }, celebrationVariant === 'check-wave' ? 850 : 1000);
      return () => window.clearTimeout(timer);
    }

    confetti({
      particleCount: 110,
      spread: 80,
      origin: { y: 0.65 },
    });
  }, [isOpen, showConfetti, celebrationVariant]);

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
      {overlayCelebration === 'sparkle-ring' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-44 w-44">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-300/70 animate-ping" />
            <div className="absolute inset-5 rounded-full border-2 border-emerald-300/70 animate-pulse" />
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-yellow-200 text-lg">✦</div>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 text-cyan-200 text-sm animate-pulse">✧</div>
            <div className="absolute right-2 top-7 text-emerald-200 text-sm animate-pulse">✦</div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-cyan-100 text-sm animate-pulse">✧</div>
            <div className="absolute bottom-2 right-7 text-emerald-200 text-sm animate-pulse">✦</div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-cyan-200 text-sm animate-pulse">✧</div>
            <div className="absolute bottom-2 left-7 text-emerald-200 text-sm animate-pulse">✦</div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 text-cyan-100 text-sm animate-pulse">✧</div>
            <div className="absolute left-2 top-7 text-emerald-200 text-sm animate-pulse">✦</div>
          </div>
        </div>
      )}
      {overlayCelebration === 'check-wave' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-44 w-44">
            <div className="absolute inset-0 rounded-full border-4 border-emerald-300/60 animate-ping" />
            <div className="absolute inset-4 rounded-full border-2 border-emerald-200/80 animate-pulse" />
            <div className="absolute inset-10 rounded-full border border-cyan-200/80 animate-pulse" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/85 px-3 py-1 text-white text-xl shadow-lg">
              ✓
            </div>
          </div>
        </div>
      )}
      {overlayCelebration === 'prism-burst' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-48 w-48">
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-cyan-200/90 animate-pulse" />
            <div className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rotate-12 rounded-sm bg-emerald-200/80 animate-pulse" />
            <div className="absolute right-6 top-8 h-3 w-3 rotate-45 rounded-sm bg-cyan-200/80 animate-pulse" />
            <div className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-12 rounded-sm bg-teal-200/80 animate-pulse" />
            <div className="absolute bottom-6 right-8 h-3 w-3 rotate-45 rounded-sm bg-emerald-200/80 animate-pulse" />
            <div className="absolute bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-12 rounded-sm bg-cyan-200/80 animate-pulse" />
            <div className="absolute bottom-6 left-8 h-3 w-3 rotate-45 rounded-sm bg-teal-200/80 animate-pulse" />
            <div className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 rotate-12 rounded-sm bg-emerald-200/80 animate-pulse" />
            <div className="absolute left-6 top-8 h-3 w-3 rotate-45 rounded-sm bg-cyan-200/80 animate-pulse" />
          </div>
        </div>
      )}
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Success header */}
        <div className="flex items-start gap-3 rounded-t-2xl bg-emerald-900/40 border-b border-emerald-700/40 px-5 py-4">
          <span className="mt-0.5 text-xl">✅</span>
          <div>
            <p className="text-base font-bold text-emerald-300">{completedLabel}</p>
            {completedDescription && (
              <p className="mt-1 text-sm text-emerald-200/80">{completedDescription}</p>
            )}
          </div>
        </div>

        {/* Next step body */}
        {nextStep && (
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {canActNow ? 'Your next step' : 'What happens next'}
            </p>

            <div className={`rounded-lg border px-4 py-3 space-y-1 ${
              emphasizeAmber
                ? 'border-amber-500/40 bg-amber-500/10'
                : 'border-slate-600 bg-slate-800/60'
            }`}>
              <p className={`text-sm font-semibold ${emphasizeAmber ? 'text-amber-200' : 'text-slate-200'}`}>
                {nextStep.actionLabel}
              </p>
              {nextStep.description && (
                <p className="text-xs text-slate-400 leading-relaxed">
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
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
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
              className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 transition"
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
