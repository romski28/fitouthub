"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { fetchWithRetry } from "@/lib/http";
import { useAuth } from "@/context/auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";
import { HK_DISTRICTS } from "@/lib/hk-districts";
import toast from "react-hot-toast";

// ── Types ────────────────────────────────────────────────────────
interface SiteAccessRequest {
  id: string;
  status: string;
  requestedAt: string;
  respondedAt?: string;
  visitScheduledFor?: string | null;
  visitScheduledAt?: string | null;
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
  completedAt?: string | null;
  respondedAt?: string | null;
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
const HK_OFFSET = 8 * 60 * 60 * 1000;

const toHKT = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + HK_OFFSET);
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const formatDayDate = (iso?: string | null) => {
  const hkt = toHKT(iso);
  if (!hkt) return "";
  return `${DAYS[hkt.getUTCDay()]} ${pad2(hkt.getUTCDate())} ${MONTHS[hkt.getUTCMonth()]}`;
};

const formatDate = (iso?: string | null) => {
  const hkt = toHKT(iso);
  if (!hkt) return "";
  return `${pad2(hkt.getUTCDate())} ${MONTHS[hkt.getUTCMonth()]} ${hkt.getUTCFullYear()}`;
};

const formatDateTime = (iso?: string | null) => {
  const hkt = toHKT(iso);
  if (!hkt) return "";
  const h = hkt.getUTCHours();
  const m = pad2(hkt.getUTCMinutes());
  return `${pad2(hkt.getUTCDate())} ${MONTHS[hkt.getUTCMonth()]} ${hkt.getUTCFullYear()}, ${pad2(h)}:${m}`;
};

const formatTime = (iso?: string | null) => {
  const hkt = toHKT(iso);
  if (!hkt) return "";
  return `${pad2(hkt.getUTCHours())}:${pad2(hkt.getUTCMinutes())}`;
};

const formatTime12h = (iso?: string | null) => {
  const hkt = toHKT(iso);
  if (!hkt) return "";
  const h = hkt.getUTCHours();
  const m = pad2(hkt.getUTCMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
};

const formatBookedSlot = (iso?: string | null) => {
  if (!iso) return "";
  return `${formatDate(iso)} at ${formatTime(iso)}`;
};

const proName = (p: { fullName?: string; businessName?: string }) =>
  p.fullName || p.businessName || "Professional";

// ── Component ────────────────────────────────────────────────────
export function ClientSiteAccessModal({ isOpen, onClose }: ClientSiteAccessModalProps) {
  const { state } = useNextStepModal();
  const { accessToken } = useAuth();
  const projectId = state.projectId || "";

  const [addresses, setAddresses] = useState<ClientSiteAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [requests, setRequests] = useState<SiteAccessRequest[]>([]);
  const [visits, setVisits] = useState<SiteAccessVisit[]>([]);
  const [siteAccessData, setSiteAccessData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Address form
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({
    buildingName: "",
    addressFull: "",
    unitNumber: "",
    floorLevel: "",
    district: "",
  });
  const [savingAddress, setSavingAddress] = useState(false);

  // Decline reason
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({});
  const [decliningRequestId, setDecliningRequestId] = useState<string | null>(null);

  // QR Scanner
  const [scanningVisitId, setScanningVisitId] = useState<string | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const scannerDivId = "qr-scanner-client-access";

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

      setAddresses(addrData?.addresses || []);
      setRequests(reqData?.requests || []);
      setSiteAccessData(reqData?.siteAccessData || null);
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

  // ── Handle new address ─────────────────────────────────────────
  const handleSaveNewAddress = async () => {
    const f = newAddressForm;
    if (!f.addressFull.trim()) { toast.error("Street address is required"); return; }
    if (!f.unitNumber.trim()) { toast.error("Unit number is required"); return; }
    if (!f.floorLevel.trim()) { toast.error("Floor level is required"); return; }
    if (!f.district.trim()) { toast.error("District is required"); return; }

    setSavingAddress(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/location-details`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingName: f.buildingName || undefined,
          addressFull: f.addressFull,
          unitNumber: f.unitNumber,
          floorLevel: f.floorLevel,
          district: f.district,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save address");
      }
      toast.success("Address saved.");
      setShowNewAddress(false);
      setNewAddressForm({ buildingName: "", addressFull: "", unitNumber: "", floorLevel: "", district: "" });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  };

  // ── Actions ────────────────────────────────────────────────────
  const handleAcceptRequest = async (requestId: string) => {
    setActionBusy(`accept-${requestId}`);
    try {
      const req = requests.find((r) => r.id === requestId);
      const addr = addresses.find((a) => a.id === selectedAddressId);
      const body: Record<string, any> = { status: "approved_visit_scheduled" };
      if (req?.visitScheduledAt) body.visitScheduledAt = req.visitScheduledAt;
      else if (req?.visitScheduledFor) body.visitScheduledFor = req.visitScheduledFor;
      if (addr) {
        body.addressFull = addr.addressFull;
        if (addr.unitNumber) body.unitNumber = addr.unitNumber;
        if (addr.floorLevel) body.floorLevel = addr.floorLevel;
        if (addr.accessDetails) body.accessDetails = addr.accessDetails;
        if (addr.onSiteContactName) body.onSiteContactName = addr.onSiteContactName;
        if (addr.onSiteContactPhone) body.onSiteContactPhone = addr.onSiteContactPhone;
      }

      const res = await fetch(`${API_BASE_URL}/projects/site-access-requests/${requestId}/respond`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    const reason = (declineReason[requestId] || "").trim();
    if (!reason) { toast.error("Please provide a reason for declining"); return; }

    setActionBusy(`decline-${requestId}`);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/site-access-requests/${requestId}/respond`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "denied", reasonDenied: reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to decline");
      }
      toast.success("Site access request declined.");
      setDecliningRequestId(null);
      setDeclineReason((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
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

  // ── QR Scanner ─────────────────────────────────────────────────
  const startScanning = async (visitId: string) => {
    setScanningVisitId(visitId);
    setScannerError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          scannerRef.current = null;
          await scanner.stop().catch(() => {});
          setScanningVisitId(null);
          // decodedText is the JWT token — call confirm
          try {
            const res = await fetch(`${API_BASE_URL}/projects/${projectId}/site-start/confirm`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ token: decodedText }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || "Confirmation failed");
            }
            toast.success("Site inspection attendance recorded!");
            fetchData();
          } catch (err: any) {
            toast.error(err.message || "Failed to confirm attendance");
          }
        },
        () => { /* ignore scan misses */ },
      );
    } catch (err: any) {
      const msg = err?.message?.includes("Permission")
        ? "Camera permission denied."
        : err?.message || "Could not start camera.";
      setScannerError(msg);
      setScanningVisitId(null);
    }
  };

  const stopScanning = () => {
    setScanningVisitId(null);
    scannerRef.current?.stop().catch(() => {});
    scannerRef.current = null;
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  // ── Derived ────────────────────────────────────────────────────
  const pendingRequests = requests.filter((r) => {
    const s = (r.status || "").toLowerCase();
    return !r.respondedAt && (!s || s === "requested" || s === "pending" || s === "awaiting_response");
  });
  const pendingVisits = visits.filter((v) => v.status === "proposed" && v.proposedByRole !== "client");
  const upcomingVisits = visits.filter((v) => v.status === "accepted" && !v.completedAt);

  // Group requests by inspection date
  const inspectionDate = pendingRequests
    .map((r) => r.visitScheduledFor)
    .filter(Boolean)
    .sort()[0] || siteAccessData?.siteInspectionAvailableOn || null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[#D4C8A0] bg-[#F5EEDE] shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#D4C8A0] px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {inspectionDate
              ? `Site inspection on ${formatDayDate(inspectionDate)}`
              : "Site Access"}
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

          {!loading && !error && (
            <>
              {/* ── Address ──────────────────────────────────── */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📍 Site Address</h3>

                <select
                  value={showNewAddress ? "__new__" : selectedAddressId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__new__") {
                      setShowNewAddress(true);
                      setSelectedAddressId("");
                    } else if (val === "") {
                      setShowNewAddress(false);
                      setSelectedAddressId("");
                    } else {
                      setShowNewAddress(false);
                      setSelectedAddressId(val);
                    }
                  }}
                  className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-8"
                >
                  <option value="">Select address or add new one</option>
                  {addresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {(addr.label || addr.buildingName || "Saved address").trim()} — {addr.addressFull}
                    </option>
                  ))}
                  <option value="__new__">＋ Add new address</option>
                </select>

                {/* New address form */}
                {showNewAddress && (
                  <div className="mt-2 space-y-2 rounded-lg border border-[#D4C8A0] bg-white p-3">
                    <input
                      type="text"
                      value={newAddressForm.buildingName}
                      onChange={(e) => setNewAddressForm((f) => ({ ...f, buildingName: e.target.value }))}
                      placeholder="Building name (optional)"
                      className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newAddressForm.addressFull}
                      onChange={(e) => setNewAddressForm((f) => ({ ...f, addressFull: e.target.value }))}
                      placeholder="Street address *"
                      className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="grid gap-2 grid-cols-2">
                      <input
                        type="text"
                        value={newAddressForm.unitNumber}
                        onChange={(e) => setNewAddressForm((f) => ({ ...f, unitNumber: e.target.value }))}
                        placeholder="Unit number *"
                        className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newAddressForm.floorLevel}
                        onChange={(e) => setNewAddressForm((f) => ({ ...f, floorLevel: e.target.value }))}
                        placeholder="Floor level *"
                        className="rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <select
                      value={newAddressForm.district}
                      onChange={(e) => setNewAddressForm((f) => ({ ...f, district: e.target.value }))}
                      className="w-full rounded-lg border border-[#D4C8A0] bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Select district *</option>
                      {HK_DISTRICTS.map((d: { areaCode: string; name: string }) => (
                        <option key={d.areaCode} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveNewAddress}
                        disabled={savingAddress}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                      >
                        {savingAddress ? "Saving..." : "Save Address"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewAddress(false); setNewAddressForm({ buildingName: "", addressFull: "", unitNumber: "", floorLevel: "", district: "" }); }}
                        className="rounded-lg border border-[#D4C8A0] px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-[#F5EEDE] transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!selectedAddressId && !showNewAddress && addresses.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Select an address to accept visits</p>
                )}
              </div>

              {/* ── Pending requests ────────────────────────── */}
              {pendingRequests.length > 0 && (
                <div>
                  <div className="space-y-2">
                    {pendingRequests.map((req) => {
                      const isDeclining = decliningRequestId === req.id;
                      const timeLabel = req.visitScheduledAt
                        ? formatTime12h(req.visitScheduledAt)
                        : req.visitScheduledFor
                        ? formatTime12h(req.visitScheduledFor)
                        : null;
                      return (
                        <div key={req.id} className="rounded-lg border border-[#D4C8A0] bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {proName(req.professional)}
                                {timeLabel && <span className="font-normal text-slate-500"> requested {timeLabel}</span>}
                              </p>
                            </div>
                            {!isDeclining && (
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleAcceptRequest(req.id)}
                                  disabled={!!actionBusy || !selectedAddressId}
                                  title={!selectedAddressId ? "Select an address first" : "Accept this request"}
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                                >
                                  {actionBusy === `accept-${req.id}` ? "..." : "Accept"}
                                </button>
                                <button
                                  onClick={() => setDecliningRequestId(req.id)}
                                  disabled={!!actionBusy}
                                  className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition"
                                >
                                  {actionBusy === `decline-${req.id}` ? "..." : "Decline"}
                                </button>
                              </div>
                            )}
                          </div>

                          {isDeclining && (
                            <div className="mt-2 space-y-2">
                              <textarea
                                rows={2}
                                value={declineReason[req.id] || ""}
                                onChange={(e) => setDeclineReason((prev) => ({ ...prev, [req.id]: e.target.value }))}
                                placeholder="Reason for declining..."
                                className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-slate-800 focus:border-red-500 focus:outline-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDeclineRequest(req.id)}
                                  disabled={!!actionBusy || !(declineReason[req.id] || "").trim()}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition"
                                >
                                  {actionBusy === `decline-${req.id}` ? "..." : "Confirm Decline"}
                                </button>
                                <button
                                  onClick={() => { setDecliningRequestId(null); setDeclineReason((prev) => { const n = { ...prev }; delete n[req.id]; return n; }); }}
                                  disabled={!!actionBusy}
                                  className="rounded-lg border border-[#D4C8A0] px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-[#F5EEDE] transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Proposed visits ─────────────────────────── */}
              {pendingVisits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">📅 Proposed Visits</h3>
                  <div className="space-y-2">
                    {pendingVisits.map((v) => (
                      <div key={v.id} className="rounded-lg border border-[#D4C8A0] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{proName(v.professional)}</p>
                            <p className="text-xs text-slate-500">
                              {formatBookedSlot(v.proposedAt)}
                            </p>
                            {v.notes && <p className="text-xs text-slate-600 mt-0.5">{v.notes}</p>}
                          </div>
                          <button
                            onClick={() => handleConfirmVisit(v.id)}
                            disabled={!!actionBusy || !selectedAddressId}
                            title={!selectedAddressId ? "Select an address first" : "Confirm this visit"}
                            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                          >
                            {actionBusy === `confirm-${v.id}` ? "..." : "Confirm"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Upcoming inspections ────────────────────── */}
              {upcomingVisits.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">📋 Upcoming Inspections</h3>
                  <div className="space-y-2">
                    {upcomingVisits.map((v) => (
                      <div key={v.id} className="rounded-lg border border-[#D4C8A0] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {proName(v.professional)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatBookedSlot(v.proposedAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => startScanning(v.id)}
                            disabled={!!scanningVisitId}
                            className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                          >
                            Scan QR
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* QR Scanner */}
                  {scanningVisitId && (
                    <div className="mt-3 rounded-lg border border-[#D4C8A0] bg-white p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-700">Scan professional's QR code</p>
                        <button onClick={stopScanning} className="text-xs text-red-500 hover:text-red-700">Cancel</button>
                      </div>
                      <div id={scannerDivId} className="w-full aspect-square max-w-[300px] mx-auto rounded-lg overflow-hidden" />
                      {scannerError && (
                        <p className="text-xs text-red-500 mt-2 text-center">{scannerError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {pendingRequests.length === 0 && pendingVisits.length === 0 && upcomingVisits.length === 0 && (
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
