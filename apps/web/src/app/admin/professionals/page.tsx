"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { Professional } from "@/lib/types";
import { ConfirmModal } from "@/components/confirm-modal";
import { TagInput } from "@/components/tag-input";

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export default function AdminProfessionalsPage() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPro, setEditingPro] = useState<Professional | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [itemsToShow, setItemsToShow] = useState(10);
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [formData, setFormData] = useState<Record<string, string | number | string[]>>({
    professionType: "",
    email: "",
    phone: "",
    status: "",
    rating: "0",
    fullName: "",
    businessName: "",
    serviceArea: "",
    locationPrimary: "",
    locationSecondary: "",
    locationTertiary: "",
    primaryTrade: "",
    tradesOffered: [],
    suppliesOffered: [],
  });

  const supplyOptions = [
    "Building Materials",
    "Tools",
    "Electrical Supplies",
    "Plumbing Supplies",
    "Paint & Wallpaper",
    "Hardware",
    "Flooring Materials",
    "Lighting Fixtures",
    "Bathroom Fixtures",
    "Kitchen Appliances",
  ];

  const tradesLoadedRef = useRef(false);

  useEffect(() => {
    fetchProfessionals();
    // Attempt to load cached trades first to avoid repeated 404s
    try {
      const cached = typeof window !== 'undefined' ? window.sessionStorage.getItem('admin.tradeOptions') : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setTradeOptions(parsed);
          tradesLoadedRef.current = true;
        }
      }
    } catch {}

    if (!tradesLoadedRef.current) {
      fetchTrades();
    }
  }, []);

  const fetchTrades = async () => {
    if (tradesLoadedRef.current) return;
    try {
      // Try new meta endpoint first
      const res = await fetch(`${API_BASE_URL}/professionals/meta/trades`);
      if (res.ok) {
        const response = await res.json();
        const titles = (response?.data || []).map((t: { title: string }) => t.title);
        if (Array.isArray(titles) && titles.length) {
          setTradeOptions(titles);
          try { window.sessionStorage.setItem('admin.tradeOptions', JSON.stringify(titles)); } catch {}
          tradesLoadedRef.current = true;
          return;
        }
      }

      // Fallback to legacy /tradesmen endpoint
      const res2 = await fetch(`${API_BASE_URL}/tradesmen`);
      if (res2.ok) {
        const data = await res2.json();
        const titles2 = (Array.isArray(data) ? data : []).map((t: { title: string }) => t.title);
        if (Array.isArray(titles2) && titles2.length) {
          setTradeOptions(titles2);
          try { window.sessionStorage.setItem('admin.tradeOptions', JSON.stringify(titles2)); } catch {}
          tradesLoadedRef.current = true;
          return;
        }
      }

      // Last attempt: derive trades from professionals list
      const res3 = await fetch(`${API_BASE_URL}/professionals`);
      if (res3.ok) {
        const pros: Professional[] = await res3.json();
        const set = new Set<string>();
        pros.forEach((p) => {
          if (p.primaryTrade) set.add(p.primaryTrade);
          if (Array.isArray(p.tradesOffered)) {
            p.tradesOffered.forEach((t) => t && set.add(t));
          }
        });
        const titles3 = Array.from(set).filter(Boolean).sort();
        if (titles3.length) {
          setTradeOptions(titles3);
          try { window.sessionStorage.setItem('admin.tradeOptions', JSON.stringify(titles3)); } catch {}
          tradesLoadedRef.current = true;
          return;
        }
      }

      // Final fallback to a safe hardcoded list
      const hardcoded = [
        "Plumber",
        "Electrician",
        "Carpenter",
        "Painter",
        "HVAC Technician",
        "Roofer",
        "Mason",
        "Tiler",
        "Glazier",
        "Landscaper",
      ];
      setTradeOptions(hardcoded);
      try { window.sessionStorage.setItem('admin.tradeOptions', JSON.stringify(hardcoded)); } catch {}
      tradesLoadedRef.current = true;
    } catch (err) {
      // Quietly fallback to avoid console spam in prod
      const hardcoded = [
        "Plumber",
        "Electrician",
        "Carpenter",
        "Painter",
        "HVAC Technician",
        "Roofer",
        "Mason",
        "Tiler",
        "Glazier",
        "Landscaper",
      ];
      setTradeOptions(hardcoded);
      try { window.sessionStorage.setItem('admin.tradeOptions', JSON.stringify(hardcoded)); } catch {}
      tradesLoadedRef.current = true;
    }
  };

  // Reset formData when editingPro changes
  useEffect(() => {
    if (editingPro) {
      setFormData({
        professionType: editingPro.professionType,
        email: editingPro.email,
        phone: editingPro.phone,
        status: editingPro.status,
        rating: editingPro.rating?.toString() || "0",
        fullName: editingPro.fullName || "",
        businessName: editingPro.businessName || "",
        serviceArea: editingPro.serviceArea || "",
        locationPrimary: editingPro.locationPrimary || "",
        locationSecondary: editingPro.locationSecondary || "",
        locationTertiary: editingPro.locationTertiary || "",
        primaryTrade: editingPro.primaryTrade || "",
        tradesOffered: Array.isArray(editingPro.tradesOffered)
          ? editingPro.tradesOffered
          : [],
        suppliesOffered: Array.isArray(editingPro.suppliesOffered)
          ? editingPro.suppliesOffered
          : [],
      });
    }
  }, [editingPro]);

  const fetchProfessionals = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/professionals`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProfessionals(data);
      setSelectedIds((prev) => prev.filter((id) => data.some((p: Professional) => p.id === id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingPro) return;

    const payload = {
      profession_type: formData.professionType,
      email: formData.email,
      phone: formData.phone,
      status: formData.status,
      rating: parseFloat(formData.rating as string) || 0,
      full_name: formData.fullName || null,
      business_name: formData.businessName || null,
      service_area: formData.serviceArea || null,
      location_primary: formData.locationPrimary || null,
      location_secondary: formData.locationSecondary || null,
      location_tertiary: formData.locationTertiary || null,
      primary_trade: formData.primaryTrade || null,
      trades_offered: Array.isArray(formData.tradesOffered)
        ? formData.tradesOffered
        : [],
      supplies_offered: Array.isArray(formData.suppliesOffered)
        ? formData.suppliesOffered
        : [],
    };

    try {
      const res = await fetch(`${API_BASE_URL}/professionals/${editingPro.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error("API Error:", error);
        alert(`Error: ${error}`);
        return;
      }

      await fetchProfessionals();
      setEditingPro(null);
    } catch (error) {
      console.error("Save error:", error);
      alert(`Error saving professional: ${error}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/professionals/${deletingId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(await res.text());
      setProfessionals((prev) => prev.filter((p) => p.id !== deletingId));
      setDeletingId(null);
    } catch (error) {
      console.error("Delete error:", error);
      alert(`Error deleting professional: ${error}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((p) => p.id));
    }
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const matchesDateRange = (p: Professional) => {
    if (!dateRange.start && !dateRange.end) return true;
    if (!p.registrationDate) return false;
    const d = new Date(p.registrationDate);
    if (dateRange.start && d < new Date(dateRange.start)) return false;
    if (dateRange.end && d > new Date(dateRange.end)) return false;
    return true;
  };

  const bulkApprove = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await fetch(`${API_BASE_URL}/professionals/bulk-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchProfessionals();
      setSelectedIds([]);
    } catch (error) {
      console.error("Bulk approve error:", error);
      alert(`Error approving professionals: ${error}`);
    }
  };

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/professionals/export`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "professionals.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert(`Error exporting CSV: ${error}`);
    }
  };

  const totals = useMemo(() => {
    return {
      total: professionals.length,
      approved: professionals.filter((p) => p.status === "approved").length,
      pending: professionals.filter((p) => p.status === "pending").length,
      suspended: professionals.filter((p) => p.status === "suspended").length,
    };
  }, [professionals]);

  const filtered = professionals.filter((p) => {
    const matchesSearch =
      !filter ||
      p.fullName?.toLowerCase().includes(filter.toLowerCase()) ||
      p.businessName?.toLowerCase().includes(filter.toLowerCase()) ||
      p.email.toLowerCase().includes(filter.toLowerCase());

    const matchesStatus =
      statusFilters.length === 0 || statusFilters.includes(p.status);

    const matchesDate = matchesDateRange(p);

    return matchesSearch && matchesStatus && matchesDate;
  });

  if (loading) {
    return <div className="text-center text-slate-600">Loading professionals...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
            <h1 className="text-2xl font-bold leading-tight">Professionals</h1>
            <p className="text-sm text-slate-200/90">{professionals.length} total professionals</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Total</p>
              <p className="text-lg font-bold text-white">{totals.total}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Approved</p>
              <p className="text-lg font-bold text-emerald-300">{totals.approved}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Pending</p>
              <p className="text-lg font-bold text-amber-200">{totals.pending}</p>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2 text-left">
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Suspended</p>
              <p className="text-lg font-bold text-rose-200">{totals.suspended}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={bulkApprove}
            disabled={selectedIds.length === 0}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            Approve Selected ({selectedIds.length})
          </button>
          <button
            onClick={exportCsv}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
              onChange={toggleSelectAll}
            />
            Select all ({filtered.length})
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="name or email..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 pr-8 text-sm text-slate-900"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                  aria-label="Clear search"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Date Start</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            />
          </div>
          <div className="grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Date End</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">Status:</span>
          {[
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Suspended", value: "suspended" },
            { label: "Inactive", value: "inactive" },
          ].map((s) => (
            <label key={s.value} className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={statusFilters.includes(s.value)}
                onChange={() => toggleStatusFilter(s.value)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, itemsToShow).map((pro) => (
          <div
            key={pro.id}
            className={`group overflow-hidden rounded-xl border ${
              selectedIds.includes(pro.id) ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"
            } bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(pro.id)}
                  onChange={() => toggleSelect(pro.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-base font-bold">
                    {pro.fullName || pro.businessName || "Unnamed"}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">{pro.professionType}</div>
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                  pro.status === "approved"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : pro.status === "pending"
                      ? "bg-amber-500/20 text-amber-100"
                      : "bg-slate-500/20 text-slate-200"
                }`}
              >
                {pro.status}
              </span>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  <span className="font-semibold">Email:</span>
                  <span className="text-slate-600 break-all">{pro.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  <span className="font-semibold">Phone:</span>
                  <span className="text-slate-600">{pro.phone}</span>
                </div>
                {pro.locationPrimary ? (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span className="font-semibold">Location:</span>
                    <span className="text-slate-600">{pro.locationPrimary}</span>
                  </div>
                ) : null}
                {pro.rating > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span className="font-semibold">Rating:</span>
                    <span className="text-slate-600">{pro.rating.toFixed(1)}★</span>
                  </div>
                ) : null}
              </div>

              {pro.primaryTrade || (pro.tradesOffered && pro.tradesOffered.length > 0) || (pro.suppliesOffered && pro.suppliesOffered.length > 0) ? (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                    {pro.professionType === 'contractor' && 'Trade'}
                    {pro.professionType === 'company' && 'Trades'}
                    {pro.professionType === 'reseller' && 'Supplies'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pro.primaryTrade && (
                      <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                        {pro.primaryTrade}
                      </span>
                    )}
                    {pro.tradesOffered?.slice(0, 2).map((trade, i) => (
                      <span key={i} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                        {trade}
                      </span>
                    ))}
                    {pro.suppliesOffered?.slice(0, 2).map((supply, i) => (
                      <span key={i} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                        {supply}
                      </span>
                    ))}
                    {((pro.tradesOffered?.length ?? 0) + (pro.suppliesOffered?.length ?? 0) > 2) && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        +{(pro.tradesOffered?.length ?? 0) + (pro.suppliesOffered?.length ?? 0) - 2} more
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>ID: {pro.id}</span>
                <span>Registered: {formatDate(pro.registrationDate)}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingPro(pro)}
                  className="flex-1 rounded-md border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(pro.id)}
                  className="flex-1 rounded-md border border-rose-600 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > itemsToShow && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setItemsToShow(prev => prev + 10)}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            Show Next 10 Results ({filtered.length - itemsToShow} remaining)
          </button>
        </div>
      )}

      {editingPro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-xl font-bold text-slate-900">
                Edit {editingPro.fullName || editingPro.businessName}
              </h2>
            </div>

            <div className="max-h-96 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                {/* Basic fields */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Type *</label>
                    <select
                      value={formData.professionType}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, professionType: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="contractor">Contractor</option>
                      <option value="company">Company</option>
                      <option value="reseller">Reseller</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Status *</label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, status: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Phone *</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Rating</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={formData.rating}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, rating: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Full Name</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Conditional trade field for contractors */}
                {formData.professionType === "contractor" && (
                  <TagInput
                    label="Primary Trade"
                    placeholder="Select trade..."
                    tags={
                      typeof formData.primaryTrade === "string" && formData.primaryTrade
                        ? [formData.primaryTrade]
                        : []
                    }
                    onTagsChange={(tags) =>
                      setFormData((prev) => ({ ...prev, primaryTrade: tags[0] || "" }))
                    }
                    suggestions={tradeOptions}
                    multiple={false}
                  />
                )}

                {/* Conditional trades field for companies */}
                {formData.professionType === "company" && (
                  <TagInput
                    label="Trades Offered"
                    placeholder="Add trades..."
                    tags={
                      Array.isArray(formData.tradesOffered) ? formData.tradesOffered : []
                    }
                    onTagsChange={(tags) =>
                      setFormData((prev) => ({ ...prev, tradesOffered: tags }))
                    }
                    suggestions={tradeOptions}
                    multiple={true}
                  />
                )}

                {/* Conditional supplies field for resellers */}
                {formData.professionType === "reseller" && (
                  <TagInput
                    label="Supplies Offered"
                    placeholder="Add supplies..."
                    tags={
                      Array.isArray(formData.suppliesOffered) ? formData.suppliesOffered : []
                    }
                    onTagsChange={(tags) =>
                      setFormData((prev) => ({ ...prev, suppliesOffered: tags }))
                    }
                    suggestions={supplyOptions}
                    multiple={true}
                  />
                )}

                {/* Other location fields */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Location Primary</label>
                    <input
                      type="text"
                      value={formData.locationPrimary}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, locationPrimary: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Location Secondary</label>
                    <input
                      type="text"
                      value={formData.locationSecondary}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, locationSecondary: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Location Tertiary</label>
                    <input
                      type="text"
                      value={formData.locationTertiary}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, locationTertiary: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Business info fields */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Business Name</label>
                    <input
                      type="text"
                      value={formData.businessName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, businessName: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-800">Service Area</label>
                    <input
                      type="text"
                      value={formData.serviceArea}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, serviceArea: e.target.value }))
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => setEditingPro(null)}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deletingId}
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete Professional"
        message="Are you sure you want to delete this professional? This action cannot be undone."
        tone="danger"
      />
    </div>
  );
}
