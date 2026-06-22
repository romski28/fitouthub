"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { useProfessionalAuth } from "@/context/professional-auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";
import toast from "react-hot-toast";

interface DeclineProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_REASONS = [
  "Too busy",
  "Not my trade",
  "On holiday",
  "Too small",
  "Too large",
];

export function DeclineProjectModal({ isOpen, onClose }: DeclineProjectModalProps) {
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();
  const projectProfessionalId = state.projectProfessionalId || "";

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleDecline = async () => {
    const finalReason = reason.trim() || "Declined";
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/professional/projects/${projectProfessionalId}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reason: finalReason }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to decline");
      }
      toast.success("Project declined.");
      onClose();
      // Refresh the page so the project card disappears
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to decline");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Decline Project</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-600">Reason you are declining this project:</p>

          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let the client know why you're declining..."
            className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-red-400 focus:outline-none"
          />

          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  reason === r
                    ? "border-slate-400 bg-slate-100 text-slate-800"
                    : "border-[#D4C8A0] bg-white text-slate-600 hover:bg-[#F5EEDE]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-[#D4C8A0] px-5 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[#D4C8A0] py-2 text-sm font-medium text-slate-600 hover:bg-[#F5EEDE] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDecline}
            disabled={submitting}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {submitting ? "Declining..." : "Confirm Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
