'use client';

import { useState } from 'react';
import { useNextStepModal } from '@/context/next-step-modal-context';
import { useRouter } from 'next/navigation';

interface GeneralActionModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onDetailsAction?: (target: string) => void;
}

export function GeneralActionModal({
  isOpen,
  isLoading = false,
  onClose,
  onPrimaryAction,
  onSecondaryAction,
  onDetailsAction,
}: GeneralActionModalProps) {
  const { state } = useNextStepModal();
  const router = useRouter();
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
    detailsTarget,
  } = state.modalContent;

  const handlePrimaryClick = () => {
    if (primaryActionType === 'navigate_tab' && detailsTarget) {
      try {
        const target = JSON.parse(detailsTarget);
        onDetailsAction?.(detailsTarget);
      } catch {
        // Not JSON, might be a simple action
        onPrimaryAction?.();
      }
    } else if (primaryActionType === 'close_modal' || primaryActionType === 'noop') {
      onClose();
    } else {
      onPrimaryAction?.();
    }
  };

  const handleSecondaryClick = () => {
    if (secondaryButtonLabel === 'Cancel' || secondaryButtonLabel === 'Back') {
      onClose();
    } else {
      onSecondaryAction?.();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all ${
        isOpen ? 'visible bg-black/50' : 'invisible bg-black/0'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        {/* Back button / Return to modal icon */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          title="Close"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500" />
            <p className="text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {/* Modal image */}
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Step illustration"
                className="mb-4 h-20 w-20 rounded-lg object-cover"
              />
            )}

            {/* Title */}
            {title && (
              <h2 className="mb-3 text-xl font-bold text-gray-900">{title}</h2>
            )}

            {/* Body */}
            {body && (
              <p className="mb-4 text-gray-700">{body}</p>
            )}

            {/* Details (expandable) */}
            {detailsBody && (
              <div className="mb-4">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </button>
                {showDetails && (
                  <p className="mt-2 text-sm text-gray-600">{detailsBody}</p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex gap-3">
              {secondaryButtonLabel && (
                <button
                  onClick={handleSecondaryClick}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {secondaryButtonLabel}
                </button>
              )}
              {primaryButtonLabel && (
                <button
                  onClick={handlePrimaryClick}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  {primaryButtonLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
