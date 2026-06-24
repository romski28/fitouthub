"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { useProfessionalAuth } from "@/context/professional-auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";

interface SiteInspectionExpiredModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SiteInspectionExpiredModal({ isOpen, onClose }: SiteInspectionExpiredModalProps) {
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!state.projectId || !accessToken) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/projects/${state.projectId}/site-access/mark-missed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      await state.onCompleted?.({ projectId: state.projectId, actionKey: state.actionKey });
    } catch {
      // Proceed even on error — onCompleted will refresh next steps
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  const title = state.modalContent?.title || "Site inspection is now closed";
  const body =
    state.modalContent?.body ||
    "The inspection date has passed and you did not book or skip a visit. We'll mark your record as missed and move you to the next step.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
        <div className="px-6 pb-5 pt-10 text-center">
          <div className="mb-4 flex justify-center">
            <img
              src="/assets/images/chatbot-avatar-icon.webp"
              alt="Step illustration"
              className="h-20 w-20 rounded-full border border-[#D4C8A0] object-cover"
            />
          </div>

          <h2 className="text-2xl font-bold text-emerald-800">{title}</h2>

          <p className="mt-3 text-base leading-relaxed text-slate-700">{body}</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#D4C8A0] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-w-[110px] rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={submitting}
            className="min-w-[110px] rounded-lg bg-emerald-600 px-4 py-2 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "Continuing..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
