"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { fetchWithRetry } from "@/lib/http";
import { useProfessionalAuth } from "@/context/professional-auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────
interface SiteAccessStatus {
  requestId: string | null;
  requestStatus: string;
  visitScheduledFor: string | null;
  visitScheduledAt: string | null;
  hasAccess: boolean;
  siteAccessData: {
    addressFull: string;
    unitNumber?: string;
    floorLevel?: string;
    buildingName?: string;
    district?: string;
    accessDetails?: string;
  } | null;
}

interface InspectSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────
const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Hong_Kong" });
};

const formatTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Hong_Kong" });
};

// ── Component ────────────────────────────────────────────────────
export function InspectSiteModal({ isOpen, onClose }: InspectSiteModalProps) {
  const { accessToken } = useProfessionalAuth();
  const { state } = useNextStepModal();
  const projectId = state.projectId || "";

  const [status, setStatus] = useState<SiteAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Message to client
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Visit notes + mark visited
  const [visitNotes, setVisitNotes] = useState("");
  const [markingVisited, setMarkingVisited] = useState(false);

  // QR check-in
  const [showQR, setShowQR] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);

  // ── Fetch site access status ───────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!isOpen || !projectId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithRetry(
        `${API_BASE_URL}/projects/${projectId}/site-access/status?_ts=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        },
      );
      if (!res.ok) throw new Error("Failed to load site access data");
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectId, accessToken]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Send message to client ─────────────────────────────────────
  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!text) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/chat/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send message");
      }
      toast.success("Message sent to client.");
      setMessageText("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  // ── Mark as visited ────────────────────────────────────────────
  const handleMarkVisited = async () => {
    if (!status?.requestId) return;
    setMarkingVisited(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/site-access-requests/${status.requestId}/confirm-visit`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ visitDetails: visitNotes.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to mark as visited");
      }
      toast.success("Site visit recorded.");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as visited");
    } finally {
      setMarkingVisited(false);
    }
  };

  // ── QR generation ──────────────────────────────────────────────
  const generateQr = async () => {
    if (generatingQr || !projectId || !accessToken) return;
    setGeneratingQr(true);
    setQrError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/site-start/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "site_inspection" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate QR");
      }
      const { token } = await res.json();
      setQrToken(token);
      setShowQR(true);
      setQrSecondsLeft(15 * 60); // 15 min
    } catch (err: any) {
      setQrError(err.message || "Failed to generate QR");
    } finally {
      setGeneratingQr(false);
    }
  };

  // QR countdown
  useEffect(() => {
    if (!qrToken || !showQR) return;
    const id = setInterval(() => {
      setQrSecondsLeft((prev) => {
        if (prev <= 1) { setQrToken(null); setShowQR(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [qrToken, showQR]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const address = status?.siteAccessData;
  const visitLabel = status?.visitScheduledAt
    ? `${formatDate(status.visitScheduledAt)} at ${formatTime(status.visitScheduledAt)}`
    : status?.visitScheduledFor
    ? formatDate(status.visitScheduledFor)
    : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {state.modalContent?.title || "Inspect site"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              Loading...
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {!loading && !error && address && (
            <>
              {/* Visit info */}
              {visitLabel && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                  Scheduled: {visitLabel}
                </div>
              )}

              {/* Address */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📍 Site Address</h3>
                <div className="rounded-lg border border-[#D4C8A0] bg-white p-3 text-sm text-slate-800 space-y-0.5">
                  {address.buildingName && (
                    <p className="font-medium">{address.buildingName}</p>
                  )}
                  <p>
                    {[address.unitNumber, address.floorLevel].filter(Boolean).join(", ")}
                  </p>
                  <p>{address.addressFull}</p>
                  {address.district && <p className="text-slate-500">{address.district}</p>}
                </div>
              </div>

              {/* Google Maps Embed */}
              {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
                <div>
                  <div className="overflow-hidden rounded-lg border border-[#D4C8A0]">
                    <iframe
                      title="Site location"
                      width="100%"
                      height="200"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(
                        [address.buildingName, address.unitNumber, address.addressFull, address.district, "Hong Kong"]
                          .filter(Boolean)
                          .join(", ")
                      )}`}
                    />
                  </div>
                </div>
              )}

              {/* Access details */}
              {address.accessDetails && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">📝 Access Details</h3>
                  <p className="text-sm text-slate-600 bg-white rounded-lg border border-[#D4C8A0] p-3">
                    {address.accessDetails}
                  </p>
                </div>
              )}

              {/* Message to client */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">💬 Message</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
                    placeholder="Send message to client..."
                    className="flex-1 rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !messageText.trim()}
                    className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                  >
                    {sendingMessage ? "..." : "Send"}
                  </button>
                </div>
              </div>

              {/* Visit notes + actions */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📝 Visit Notes</h3>
                <textarea
                  rows={3}
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  placeholder="Measurements taken, discussed materials, site conditions..."
                  className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex gap-2 mt-2">
                  {!showQR ? (
                    <button
                      type="button"
                      onClick={generateQr}
                      disabled={generatingQr}
                      className="flex-1 rounded-lg border border-[#D4C8A0] px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-[#F5EEDE] disabled:opacity-50 transition"
                    >
                      {generatingQr ? "Generating..." : "🆔 QR Check-in"}
                    </button>
                  ) : (
                    <div className="flex-1 rounded-lg border border-[#D4C8A0] bg-white p-3 text-center">
                      <p className="text-xs text-slate-500 mb-2">Have the client scan this QR</p>
                      <div className="flex justify-center mb-1">
                        <QRCodeSVG value={qrToken || ""} size={120} />
                      </div>
                      <p className="text-xs text-slate-400">
                        Expires in {formatCountdown(qrSecondsLeft)}
                      </p>
                      {qrError && <p className="text-xs text-red-500 mt-1">{qrError}</p>}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleMarkVisited}
                    disabled={markingVisited}
                    className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {markingVisited ? "Recording..." : "✅ Mark as Visited"}
                  </button>
                </div>
              </div>
            </>
          )}

          {!loading && !error && !address && (
            <p className="text-sm text-slate-500 italic py-4">No address data available. The client may not have shared it yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#D4C8A0] px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-[#D4C8A0] py-2 text-sm font-medium text-slate-600 hover:bg-[#F5EEDE] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
