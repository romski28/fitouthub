"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { fetchWithRetry } from "@/lib/http";
import { useAuth } from "@/context/auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────
interface SiteAccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  respondedAt?: string;
  visitScheduledFor?: string | null;
  visitDetails?: string | null;
  reasonDenied?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
    email?: string;
    phone?: string;
  };
}

interface ClientSiteAddress {
  id: string;
  label: string | null;
  isProjectPrimary?: boolean;
  buildingName: string | null;
  addressFull: string;
  unitNumber: string | null;
  floorLevel: string | null;
  district: string | null;
  propertyType: string | null;
  accessHoursType: string | null;
  workingHoursWindow: string | null;
  accessDetails: string | null;
  onSiteContactName: string | null;
  onSiteContactPhone: string | null;
}

interface SiteAccessVisit {
  id: string;
  status: string;
  proposedAt: string;
  proposedByRole: string;
  notes?: string | null;
  professional: {
    id: string;
    fullName?: string;
    businessName?: string;
  };
}

interface ClientSiteAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────
const formatDate = (iso?: string) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

const proName = (p: { fullName?: string; businessName?: string }) =>
  p.fullName || p.businessName || "Professional";

// ── Component ────────────────────────────────────────────────────
export function ClientSiteAccessModal({ isOpen, onClose }: ClientSiteAccessModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();
  const projectId = state.projectId || "";

  const [addresses, setAddresses] = useState<ClientSiteAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [requests, setRequests] = useState<SiteAccessRequest[]>([]);
  const [visits, setVisits] = useState<SiteAccessVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // ── Fetch data ─────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!isOpen || !projectId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [addrRes, reqRes, visitRes] = await Promise.all([
        fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/site-addresses?_ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        }),
        fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/site-access/requests?_ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        }),
        fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/site-visits?_ts=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        }),
      ]);

      if (!addrRes.ok || !reqRes.ok || !visitRes.ok) throw new Error("Failed to load data");

      const [addrData, reqData, visitData] = await Promise.all([
        addrRes.json().catch(() => ({})),
        reqRes.json().catch(() => ({})),
        visitRes.json().catch(() => ({})),
      ]);

      // API wraps responses: { addresses: [...] }, { requests: [...], siteAccessData: {...} }, { visits: [...] }
      setAddresses(addrData?.addresses || []);
      setRequests(reqData?.requests || []);
      setVisits(visitData?.visits || []);

      // Pre-select primary address
      const primary = (addrData?.addresses || []).find(
        (a: ClientSiteAddress) => a.isProjectPrimary
      );
      if (primary) setSelectedAddressId(primary.id);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isOpen, projectId, accessToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────
  const handleAcceptRequest = async (requestId: string) => {
    setActionBusy(`accept-${requestId}`);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/site-access-requests/${requestId}/respond`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved_visit_scheduled" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to accept");
      }
      toast.success("Site access request accepted.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to accept");
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setActionBusy(`decline-${requestId}`);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/site-access-requests/${requestId}/respond`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "denied", reasonDenied: "Declined by client" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to decline");
      }
      toast.success("Site access request declined.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to decline");
    } finally {
      setActionBusy(null);
    }
  };

  const handleConfirmVisit = async (visitId: string) => {
    setActionBusy(`confirm-${visitId}`);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/site-visits/${visitId}/respond`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to confirm");
      }
      toast.success("Site visit confirmed.");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm");
    } finally {
      setActionBusy(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pendingVisits = visits.filter((v) => v.status === "proposed" && v.proposedByRole !== "client");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Site Access Requests</h2>
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

          {!loading && !error && (
            <>
              {/* Address selector */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📍 Site Address</h3>
                {addresses.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No addresses saved. Add one below.</p>
                ) : (
                  <div className="space-y-1">
                    {addresses.map((addr) => (
                      <button
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                          selectedAddressId === addr.id
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                            : "border-[#D4C8A0] bg-white text-slate-700 hover:bg-[#F5EEDE]"
                        }`}
                      >
                        <span className="font-medium">{addr.label || addr.addressFull}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{addr.addressFull}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending requests */}
              {pendingRequests.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">📋 Pending Requests</h3>
                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div key={req.id} className="rounded-lg border border-[#D4C8A0] bg-white p-3">
                        <p className="text-sm font-medium text-slate-800">{proName(req.professional)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Requested {formatDateTime(req.requestedAt)}</p>
                        {req.visitDetails && <p className="text-xs text-slate-600 mt-1">{req.visitDetails}</p>}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleAcceptRequest(req.id)}
                            disabled={!!actionBusy || !selectedAddressId}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                          >
                            {actionBusy === `accept-${req.id}` ? "..." : "Accept"}
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(req.id)}
                            disabled={!!actionBusy}
                            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition"
                          >
                            {actionBusy === `decline-${req.id}` ? "..." : "Decline"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Proposed visits */}
              {pendingVisits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">📅 Proposed Visits</h3>
                  <div className="space-y-2">
                    {pendingVisits.map((v) => (
                      <div key={v.id} className="rounded-lg border border-[#D4C8A0] bg-white p-3">
                        <p className="text-sm font-medium text-slate-800">{proName(v.professional)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Proposed {formatDateTime(v.proposedAt)}</p>
                        {v.notes && <p className="text-xs text-slate-600 mt-1">{v.notes}</p>}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleConfirmVisit(v.id)}
                            disabled={!!actionBusy || !selectedAddressId}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                          >
                            {actionBusy === `confirm-${v.id}` ? "..." : "Confirm"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {pendingRequests.length === 0 && pendingVisits.length === 0 && (
                <p className="text-sm text-slate-500 italic py-4">No pending access requests or visits.</p>
              )}
            </>
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
