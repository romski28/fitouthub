'use client';

import { useState } from 'react';
import { useNextStepModal } from '@/context/next-step-modal-context';

interface GeneralActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDetailsAction?: (target: string) => void;
  onOpenProject?: () => void;
  detailsTargetFallback?: string;
}

export function GeneralActionModal({
  isOpen,
  isLoading = false,
  onClose,
  onPrimaryAction,
  onSecondaryAction,
  onDetailsAction,
  onOpenProject,
  detailsTargetFallback,
}: GeneralActionModalProps) {
  const { state } = useNextStepModal();
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen || !state.modalContent) {
    return null;
  }

  const {
    title,
    body,
    detailsBody,
    imageUrl,
    primaryButtonLabel = 'Continue',
    secondaryButtonLabel = 'Cancel',
    primaryActionType,
    secondaryActionType,
    detailsTarget,
  } = state.modalContent;

  const hasDetails = Boolean(detailsBody);
  const secondaryLabelLower = secondaryButtonLabel.toLowerCase();
  const secondaryClosesModal =
    secondaryActionType === 'close_modal' ||
    secondaryLabelLower.includes('cancel') ||
    secondaryLabelLower.includes('back') ||
    secondaryLabelLower.includes('close');
  const secondaryIsDanger =
    secondaryLabelLower.includes('cancel') ||
    secondaryLabelLower.includes('decline');
  const effectiveDetailsTarget = detailsTarget || detailsTargetFallback;
  const canOpenProject = Boolean(onOpenProject);
  const shouldShowProjectButton = Boolean(effectiveDetailsTarget || canOpenProject);
  const projectButtonLabel = effectiveDetailsTarget ? 'View details' : 'Open project';

  const handleModalClose = () => {
    setShowDetails(false);
    onClose();
  };

  const handleProjectButtonClick = () => {
    if (effectiveDetailsTarget && onDetailsAction) {
      onDetailsAction(effectiveDetailsTarget);
      return;
    }

    onOpenProject?.();
  };

  const handlePrimaryClick = () => {
    if (primaryActionType === 'navigate_tab' && effectiveDetailsTarget) {
      try {
        JSON.parse(effectiveDetailsTarget);
        onDetailsAction?.(effectiveDetailsTarget);
      } catch {
        // Not JSON, might be a simple action
        onPrimaryAction?.();
      }
    } else if (primaryActionType === 'close_modal' || primaryActionType === 'noop') {
      handleModalClose();
    } else {
      onPrimaryAction?.();
    }
  };

  const handleSecondaryClick = () => {
    if (secondaryActionType === 'navigate_tab' && effectiveDetailsTarget) {
      onDetailsAction?.(effectiveDetailsTarget);
      return;
    }

    if (secondaryButtonLabel === 'Cancel' || secondaryButtonLabel === 'Back') {
      handleModalClose();
    } else {
      onSecondaryAction?.();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all ${
        isOpen ? 'visible bg-black/60 backdrop-blur-sm' : 'invisible bg-black/0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleModalClose();
      }}
    >
      <div className="w-full max-w-md max-h-[80vh] [perspective:1600px]">
        {isLoading ? (
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex flex-col items-center justify-center px-6 py-14">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-emerald-400" />
              <p className="text-slate-300">Loading...</p>
            </div>
          </div>
        ) : (
          <div className="relative grid max-h-[80vh] [transform-style:preserve-3d] transition-transform duration-500 ease-out" style={{ transform: showDetails ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div
              className="col-start-1 row-start-1 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]"
              aria-hidden={showDetails}
            >
              {hasDetails && (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-blue-300/60 bg-blue-500/20 text-lg font-semibold text-blue-100 transition hover:bg-blue-500/35"
                  aria-label="Show details"
                >
                  i
                </button>
              )}

              <div className="next-step-scrollbar flex-1 overflow-y-auto px-6 pb-5 pt-10 text-center">
                <div className="mb-4 flex justify-center">
                  <img
                    src={imageUrl || '/assets/images/chatbot-avatar-icon.webp'}
                    alt="Step illustration"
                    className="h-20 w-20 rounded-full border border-white/20 object-cover"
                  />
                </div>

                {title && <h2 className="text-2xl font-bold text-emerald-300">{title}</h2>}

                {body && <p className="mt-3 text-base leading-relaxed text-slate-100">{body}</p>}
              </div>

              <div className="mt-auto flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-4">
                {!secondaryClosesModal && (
                  <button
                    type="button"
                    onClick={handleModalClose}
                    className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                  >
                    Close
                  </button>
                )}
                {shouldShowProjectButton && (
                  <button
                    type="button"
                    onClick={handleProjectButtonClick}
                    className="min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                  >
                    {projectButtonLabel}
                  </button>
                )}
                {secondaryButtonLabel && (
                  <button
                    onClick={handleSecondaryClick}
                    className={
                      secondaryIsDanger
                        ? 'min-w-[110px] rounded-lg bg-rose-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-rose-700'
                        : 'min-w-[110px] rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800'
                    }
                  >
                    {secondaryButtonLabel}
                  </button>
                )}
                {primaryButtonLabel && (
                  <button
                    onClick={handlePrimaryClick}
                    className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700"
                  >
                    {primaryButtonLabel}
                  </button>
                )}
              </div>
            </div>

            <div
              className="col-start-1 row-start-1 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl [backface-visibility:hidden]"
              style={{ transform: 'rotateY(180deg)' }}
              aria-hidden={!showDetails}
            >
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="absolute right-4 top-4 z-20 h-8 w-8 rounded-full border border-slate-500 bg-slate-800/80 text-lg font-semibold text-slate-100 transition hover:bg-slate-700"
                aria-label="Hide details"
              >
                ×
              </button>

              <div className="next-step-scrollbar flex-1 overflow-y-auto px-6 pb-6 pt-12 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">More information</p>
                <h3 className="mt-3 text-2xl font-bold text-emerald-300">{title || 'Step details'}</h3>
                <p className="mt-5 text-sm leading-relaxed text-white">{detailsBody}</p>
              </div>

              <div className="mt-auto border-t border-slate-700 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="w-full rounded-lg border border-slate-500 px-4 py-2 text-base font-semibold text-slate-100 transition hover:bg-slate-800"
                >
                  Back to action
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
