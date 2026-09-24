'use client';

import { useNextStepModal } from '@/context/next-step-modal-context';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Minimal informational modal — a title, body and a single OK button.
 * Used for the "In warranty until <date>" step (no action required).
 */
export function WarrantyInfoModal({ isOpen, onClose }: Props) {
  const { state } = useNextStepModal();

  if (!isOpen) return null;

  const title = state.modalContent?.title || 'Warranty period';
  const body = state.modalContent?.body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {body && <p className="text-sm leading-relaxed text-slate-600">{body}</p>}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-w-[90px] rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
