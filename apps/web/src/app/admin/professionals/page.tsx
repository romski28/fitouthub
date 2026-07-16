"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { Professional } from "@/lib/types";
import { ConfirmModal } from "@/components/confirm-modal";
import { TagInput } from "@/components/tag-input";
import { useAuth } from "@/context/auth-context";
import { HkZoneList } from "@/components/hk-zone-list";
import { HkZoneMap } from "@/components/hk-zone-map";
import { MapOrList } from "@/components/map-or-list";
import {
  HK_ZONE_CODES,
  areaCodesToNames,
  areaCodesToZoneCodes,
  deriveAreaCodesFromCoveragePayload,
  deriveCoverageDraftFromAreaCodes,
  type HkZoneCode,
  zoneCodesToAreaCodes,
} from "@/lib/hk-districts";

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

type CertificationTrade = {
  id: string;
  title: string;
  professionType?: string | null;
};

type CertificationTypeRecord = {
  id: string;
  code?: string;
  name: string;
  regulator?: string | null;
};

type ProfessionalCertificationRecord = {
  id: string;
  certificationTypeId: string;
  tradeId?: string | null;
  holderType: 'INDIVIDUAL' | 'BUSINESS';
  registrationNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  documentStorageKey?: string | null;
  documentUrl?: string | null;
  verificationStatus: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  verificationNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  certificationType: CertificationTypeRecord;
  trade?: CertificationTrade | null;
};

const certificationStatusTone: Record<ProfessionalCertificationRecord['verificationStatus'], string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800 ring-amber-200',
  VERIFIED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  EXPIRED: 'bg-slate-200 text-slate-700 ring-slate-300',
};

type BrcCheckResponse = {
  mode: 'name' | 'brn';
  requestedValue: string;
  requestUrl: string;
  data: unknown;
  noResult?: boolean;
  message?: string;
};

export default function AdminProfessionalsPage() {
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPro, setEditingPro] = useState<Professional | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [professionalTypeFilter, setProfessionalTypeFilter] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [tradeFilter, setTradeFilter] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [itemsToShow, setItemsToShow] = useState(10);
  const [tradeOptions, setTradeOptions] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<ProfessionalCertificationRecord[]>([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState<string | null>(null);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [reviewNotesById, setReviewNotesById] = useState<Record<string, string>>({});
  const [brcCheckBusyByKey, setBrcCheckBusyByKey] = useState<Record<string, boolean>>({});
  const [brcCheckResultByKey, setBrcCheckResultByKey] = useState<Record<string, BrcCheckResponse>>({});
  const [brcCheckVerdictByKey, setBrcCheckVerdictByKey] = useState<Record<string, 'up' | 'down'>>({});
  const [brcManualInputById, setBrcManualInputById] = useState<Record<string, { companyName: string; brn: string }>>({});
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    coverageAreaCodes: [],
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

  const TRADE_OPTIONS_CACHE_KEY = 'admin.tradeOptions.master.v1';
  const highlightedProfessionalId = searchParams.get('highlight') || '';
  const highlightedCertificationId = searchParams.get('certificationId') || '';

  const tradesLoadedRef = useRef(false);
  const certificationCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetchProfessionals();
    // Attempt to load cached master trades first
    try {
      const cached = typeof window !== 'undefined' ? window.sessionStorage.getItem(TRADE_OPTIONS_CACHE_KEY) : null;
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
      // Use canonical master trades endpoint
      const res = await fetch(`${API_BASE_URL}/trades`);
      if (res.ok) {
        const data = await res.json();
        const titles = (Array.isArray(data) ? data : []).map(
          (t: { name?: string; title?: string }) => t.name || t.title || '',
        ).filter(Boolean);
        if (Array.isArray(titles) && titles.length) {
          setTradeOptions(titles);
          try { window.sessionStorage.setItem(TRADE_OPTIONS_CACHE_KEY, JSON.stringify(titles)); } catch {}
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
      try { window.sessionStorage.setItem(TRADE_OPTIONS_CACHE_KEY, JSON.stringify(hardcoded)); } catch {}
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
      try { window.sessionStorage.setItem(TRADE_OPTIONS_CACHE_KEY, JSON.stringify(hardcoded)); } catch {}
      tradesLoadedRef.current = true;
    }
  };

  // Reset formData when editingPro changes or creating new
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
        coverageAreaCodes: deriveAreaCodesFromCoveragePayload(editingPro as any),
        primaryTrade: editingPro.primaryTrade || "",
        tradesOffered: Array.isArray(editingPro.tradesOffered)
          ? editingPro.tradesOffered
          : [],
        suppliesOffered: Array.isArray(editingPro.suppliesOffered)
          ? editingPro.suppliesOffered
          : [],
      });
    } else if (isCreating) {
      setFormData({
        professionType: "contractor",
        email: "",
        phone: "",
        status: "pending",
        rating: "0",
        fullName: "",
        businessName: "",
        serviceArea: "",
        locationPrimary: "",
        locationSecondary: "",
        locationTertiary: "",
        coverageAreaCodes: [],
        primaryTrade: "",
        tradesOffered: [],
        suppliesOffered: [],
      });
    }
  }, [editingPro, isCreating]);

  useEffect(() => {
    if (!highlightedProfessionalId || professionals.length === 0) return;
    const target = professionals.find((professional) => professional.id === highlightedProfessionalId);
    if (target) {
      setEditingPro(target);
    }
  }, [highlightedProfessionalId, professionals]);

  useEffect(() => {
    if (!editingPro || !accessToken) {
      setCertifications([]);
      setReviewNotesById({});
      setBrcManualInputById({});
      setCertificationsError(null);
      return;
    }

    let cancelled = false;

    const loadCertifications = async () => {
      try {
        setCertificationsLoading(true);
        setCertificationsError(null);
        const res = await fetch(`${API_BASE_URL}/professionals/${editingPro.id}/certifications`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        if (cancelled) return;
        const nextCertifications = Array.isArray(data) ? data : [];
        setCertifications(nextCertifications);
        setReviewNotesById(
          nextCertifications.reduce((acc, certification) => {
            acc[certification.id] = certification.verificationNotes || '';
            return acc;
          }, {} as Record<string, string>),
        );
        setBrcManualInputById(
          nextCertifications.reduce((acc, certification) => {
            acc[certification.id] = {
              companyName: String(editingPro.businessName || '').trim(),
              brn: String(certification.registrationNumber || '').trim(),
            };
            return acc;
          }, {} as Record<string, { companyName: string; brn: string }>),
        );
      } catch (error) {
        if (!cancelled) {
          setCertificationsError(error instanceof Error ? error.message : 'Failed to load certifications');
        }
      } finally {
        if (!cancelled) {
          setCertificationsLoading(false);
        }
      }
    };

    void loadCertifications();

    return () => {
      cancelled = true;
    };
  }, [accessToken, editingPro]);

  useEffect(() => {
    if (!editingPro || !highlightedCertificationId || certifications.length === 0) return;
    const target = certificationCardRefs.current[highlightedCertificationId];
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, [certifications, editingPro, highlightedCertificationId]);

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
    if (!editingPro && !isCreating) return;

    const payload = {
      profession_type: formData.professionType,
      email: formData.email,
      phone: formData.phone,
      status: formData.status,
      rating: parseFloat(formData.rating as string) || 0,
      full_name: formData.fullName || null,
      business_name: formData.businessName || null,
      coverage_area_codes: Array.isArray(formData.coverageAreaCodes)
        ? formData.coverageAreaCodes
        : [],
      primary_trade: formData.primaryTrade || (Array.isArray(formData.tradesOffered) && formData.tradesOffered.length > 0 ? formData.tradesOffered[0] : null),
      trades_offered: Array.isArray(formData.tradesOffered)
        ? formData.tradesOffered
        : [],
      supplies_offered: Array.isArray(formData.suppliesOffered)
        ? formData.suppliesOffered
        : [],
    };

    try {
      if (isCreating) {
        // Step 1: Create with basic fields
        const createRes = await fetch(`${API_BASE_URL}/professionals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profession_type: payload.profession_type,
            email: payload.email,
            phone: payload.phone,
            full_name: payload.full_name,
            business_name: payload.business_name,
          }),
        });

        if (!createRes.ok) {
          const error = await createRes.text();
          alert(`Create error: ${error}`);
          return;
        }

        const created = await createRes.json();
        const newId = created?.data?.id || created?.id;

        if (!newId) {
          alert('Professional created but could not determine ID. Please refresh.');
          await fetchProfessionals();
          setIsCreating(false);
          return;
        }

        // Step 2: Update with full payload (status, trades, coverage, etc.)
        const updateRes = await fetch(`${API_BASE_URL}/professionals/${newId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!updateRes.ok) {
          const error = await updateRes.text();
          alert(`Professional created but update failed: ${error}. You can edit it manually.`);
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/professionals/${editingPro!.id}`, {
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
      }

      await fetchProfessionals();
      setEditingPro(null);
      setIsCreating(false);
    } catch (error) {
      console.error("Save error:", error);
      alert(`Error ${isCreating ? 'creating' : 'saving'} professional: ${error}`);
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

  const handleUpdatePassword = async () => {
    if (!editingPro || !accessToken || passwordValue.length < 6) return;

    setPasswordUpdating(true);
    setPasswordMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/professionals/${editingPro.id}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: passwordValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || 'Failed to update password');
      }

      setPasswordValue('');
      setPasswordMessage('✓ Password updated');
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleCertificationReview = async (
    certificationId: string,
    verificationStatus: ProfessionalCertificationRecord['verificationStatus'],
  ) => {
    if (!editingPro || !accessToken) {
      alert('Admin session missing. Please sign in again.');
      return;
    }

    try {
      setReviewBusyId(certificationId);
      setCertificationsError(null);
      const res = await fetch(
        `${API_BASE_URL}/professionals/${editingPro.id}/certifications/${certificationId}/review`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            verificationStatus,
            verificationNotes: reviewNotesById[certificationId] || '',
          }),
        },
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const updated = await res.json();
      setCertifications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setReviewNotesById((current) => ({
        ...current,
        [updated.id]: updated.verificationNotes || '',
      }));
    } catch (error) {
      setCertificationsError(error instanceof Error ? error.message : 'Failed to review certification');
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleBrcCheck = async (certificationId: string, mode: 'name' | 'brn') => {
    if (!editingPro || !accessToken) {
      alert('Admin session missing. Please sign in again.');
      return;
    }

    const key = `${certificationId}:${mode}`;
    const manualValue =
      mode === 'name'
        ? String(brcManualInputById[certificationId]?.companyName || '').trim()
        : String(brcManualInputById[certificationId]?.brn || '').trim();

    if (!manualValue) {
      alert(
        mode === 'name'
          ? 'Enter a company name before searching.'
          : 'Enter a BRN before searching.',
      );
      return;
    }

    const query = new URLSearchParams({ mode, value: manualValue });

    try {
      setBrcCheckBusyByKey((current) => ({
        ...current,
        [key]: true,
      }));
      setCertificationsError(null);

      const res = await fetch(
        `${API_BASE_URL}/professionals/${editingPro.id}/certifications/${certificationId}/brc-check?${query.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const payload = (await res.json()) as BrcCheckResponse;
      setBrcCheckResultByKey((current) => ({
        ...current,
        [key]: payload,
      }));
      setBrcCheckVerdictByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (error) {
      setCertificationsError(error instanceof Error ? error.message : 'Failed to run BRC check');
    } finally {
      setBrcCheckBusyByKey((current) => ({
        ...current,
        [key]: false,
      }));
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

    const matchesProfessionalType =
      !professionalTypeFilter || p.professionType === professionalTypeFilter;

    const matchesDate = matchesDateRange(p);

    const tradeNeedle = tradeFilter.trim().toLowerCase();
    const tradeHaystack = [
      p.primaryTrade,
      ...(Array.isArray(p.tradesOffered) ? p.tradesOffered : []),
    ]
      .filter(Boolean)
      .map((item) => item!.toString().toLowerCase());
    const matchesTrade = !tradeNeedle || tradeHaystack.some((trade) => trade.includes(tradeNeedle));

    return matchesSearch && matchesStatus && matchesProfessionalType && matchesDate && matchesTrade;
  });

  const availableTradeFilters = useMemo(() => {
    const set = new Set<string>();
    tradeOptions.forEach((trade) => {
      if (trade?.trim()) set.add(trade.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tradeOptions]);

  if (loading) {
    return <div className="text-center text-slate-600">Loading professionals...</div>;
  }

  const selectedCoverageCodes = Array.isArray(formData.coverageAreaCodes)
    ? (formData.coverageAreaCodes as string[])
    : [];
  const selectedCoverageZoneCodes = areaCodesToZoneCodes(selectedCoverageCodes);
  const selectedCoverageNames = areaCodesToNames(selectedCoverageCodes);

  const handleCoverageAreaCodesChange = (codes: string[]) => {
    const derived = deriveCoverageDraftFromAreaCodes(codes);
    setFormData((prev) => ({
      ...prev,
      coverageAreaCodes: codes,
      serviceArea: derived.serviceArea,
      locationPrimary: derived.locationPrimary,
      locationSecondary: derived.locationSecondary,
      locationTertiary: derived.locationTertiary,
    }));
  };

  const handleCoverageZoneCodesChange = (zoneCodes: HkZoneCode[]) => {
    handleCoverageAreaCodesChange(zoneCodesToAreaCodes(zoneCodes));
  };

  const handleCoverageZoneToggle = (zoneCode: HkZoneCode) => {
    const next = new Set(selectedCoverageZoneCodes);
    if (next.has(zoneCode)) next.delete(zoneCode);
    else next.add(zoneCode);
    handleCoverageZoneCodesChange(HK_ZONE_CODES.filter((code) => next.has(code)));
  };

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
          <button
            onClick={() => { setIsCreating(true); setEditingPro(null); }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Create Professional
          </button>
          <div className="flex-1" />
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-3">
        <div className="grid gap-2 md:grid-cols-5">
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
          <div className="grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Trade</label>
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            >
              <option value="">All trades</option>
              {availableTradeFilters.map((trade) => (
                <option key={trade} value={trade}>
                  {trade}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Professional Type</label>
            <select
              value={professionalTypeFilter}
              onChange={(e) => setProfessionalTypeFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
            >
              <option value="">All types</option>
              <option value="contractor">Contractor</option>
              <option value="company">Company</option>
              <option value="reseller">Reseller</option>
            </select>
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 hidden md:table-cell">ID</th>
              <th className="px-4 py-3 hidden md:table-cell">Registered</th>
              <th className="px-4 py-3 hidden lg:table-cell">Last Edited</th>
              <th className="px-4 py-3 w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, itemsToShow).map((pro) => (
              <tr
                key={pro.id}
                className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                  selectedIds.includes(pro.id) || highlightedProfessionalId === pro.id
                    ? "bg-emerald-50"
                    : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(pro.id)}
                    onChange={() => toggleSelect(pro.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-900">
                    {pro.fullName || pro.businessName || "Unnamed"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium uppercase text-slate-600">
                    {pro.professionType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      pro.status === "approved"
                        ? "bg-emerald-100 text-emerald-800"
                        : pro.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : pro.status === "suspended"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {pro.status}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <code className="text-[11px] text-slate-500">{pro.id.slice(0, 8)}…</code>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                  {formatDate(pro.registrationDate)}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-slate-600">
                  {formatDate(pro.updatedAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingPro(pro)}
                      className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition"
                      title="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      onClick={() => setDeletingId(pro.id)}
                      className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No professionals match the current filters.
          </div>
        )}
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

      {(editingPro || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur p-4">
          <div className="w-full max-w-5xl rounded-lg bg-white shadow-lg">
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {isCreating
                      ? 'Create Professional'
                      : `Edit ${editingPro!.fullName || editingPro!.businessName}`}
                  </h2>
                  {highlightedCertificationId && !isCreating && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      Deep-linked certification review target active
                    </p>
                  )}
                </div>
                {!isCreating && (
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {certifications.length} certification{certifications.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-[85vh] overflow-y-auto px-6 py-4">
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

                {/* Multi-trade field for contractors and companies */}
                {(formData.professionType === "contractor" || formData.professionType === "company") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
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
                        allowCustom={false}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, tradesOffered: [...tradeOptions] }))
                        }
                        className="mt-5 shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Select all
                      </button>
                    </div>
                  </div>
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
                    allowCustom={false}
                  />
                )}

                {/* Password update (edit only) */}
                {!isCreating && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Password</p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={passwordValue}
                          onChange={(e) => setPasswordValue(e.target.value)}
                          placeholder="New password (min 6 chars)"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleUpdatePassword}
                        disabled={passwordUpdating || passwordValue.length < 6}
                        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {passwordUpdating ? 'Updating…' : 'Update Password'}
                      </button>
                    </div>
                    {passwordMessage && (
                      <p className={`text-xs ${passwordMessage.startsWith('✓') ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {passwordMessage}
                      </p>
                    )}
                  </div>
                )}

                {/* Other location fields */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Coverage (5 service regions)</p>
                      <p className="text-xs text-slate-500">Use map or list mode. District coverage and legacy fields are auto-derived for compatibility.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCoverageZoneCodesChange(HK_ZONE_CODES)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Whole HK
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCoverageAreaCodesChange([])}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <MapOrList
                    storageKey="fh-map-or-list-preference"
                    label="Coverage input mode"
                    helperText="Map mode supports quick visual edits."
                    map={
                      <HkZoneMap
                        highlightedCodes={selectedCoverageZoneCodes}
                        onToggleCode={handleCoverageZoneToggle}
                      />
                    }
                    list={
                      <HkZoneList
                        selectedZoneCodes={selectedCoverageZoneCodes}
                        onChange={handleCoverageZoneCodesChange}
                      />
                    }
                  />

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service Area</p>
                      <p className="mt-1 text-sm text-slate-700">{(formData.serviceArea as string) || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location Primary</p>
                      <p className="mt-1 text-sm text-slate-700">{(formData.locationPrimary as string) || '—'}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Region Count</p>
                      <p className="mt-1 text-sm text-slate-700">{selectedCoverageZoneCodes.length}</p>
                    </div>
                  </div>

                  {selectedCoverageNames.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedCoverageNames.map((name) => (
                        <span key={name} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
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
                      readOnly
                      className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                    />
                  </div>
                </div>

                {!isCreating && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Certification review</p>
                      <p className="text-xs text-slate-600">
                        Review regulated trade credentials without leaving the existing professionals workflow.
                      </p>
                    </div>
                  </div>

                  {certificationsLoading && (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      Loading certifications...
                    </div>
                  )}

                  {certificationsError && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {certificationsError}
                    </div>
                  )}

                  {!certificationsLoading && !certificationsError && certifications.length === 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      No certifications on file for this professional yet.
                    </div>
                  )}

                  {!certificationsLoading && certifications.length > 0 && (
                    <div className="space-y-3">
                      {certifications.map((certification) => {
                        const isTargeted = certification.id === highlightedCertificationId;
                        const isBrcRecord = certification.certificationType?.code === 'BUSINESS_REGISTRATION_CERTIFICATE';
                        const byNameKey = `${certification.id}:name`;
                        const byBrnKey = `${certification.id}:brn`;
                        const byNameResult = brcCheckResultByKey[byNameKey];
                        const byBrnResult = brcCheckResultByKey[byBrnKey];
                        return (
                          <div
                            key={certification.id}
                            ref={(node) => {
                              certificationCardRefs.current[certification.id] = node;
                            }}
                            className={`rounded-xl border bg-white p-4 shadow-sm ${
                              isTargeted ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
                            }`}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-base font-semibold text-slate-900">
                                    {certification.certificationType.name}
                                  </h3>
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${certificationStatusTone[certification.verificationStatus]}`}>
                                    {certification.verificationStatus}
                                  </span>
                                  {isTargeted && (
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                      Review target
                                    </span>
                                  )}
                                </div>
                                <div className="grid gap-1 text-sm text-slate-600 md:grid-cols-2">
                                  <p><span className="font-semibold text-slate-800">Registration:</span> {certification.registrationNumber || '—'}</p>
                                  <p><span className="font-semibold text-slate-800">Holder:</span> {certification.holderType}</p>
                                  <p><span className="font-semibold text-slate-800">Trade:</span> {certification.trade?.title || '—'}</p>
                                  <p><span className="font-semibold text-slate-800">Regulator:</span> {certification.certificationType.regulator || '—'}</p>
                                  <p><span className="font-semibold text-slate-800">Issued:</span> {formatDate(certification.issuedAt || undefined)}</p>
                                  <p><span className="font-semibold text-slate-800">Expires:</span> {formatDate(certification.expiresAt || undefined)}</p>
                                </div>
                                {certification.documentUrl && (
                                  <a
                                    href={certification.documentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex text-sm font-semibold text-sky-700 hover:text-sky-800"
                                  >
                                    Open uploaded document
                                  </a>
                                )}
                              </div>

                              {certification.documentUrl && (
                                <a href={certification.documentUrl} target="_blank" rel="noreferrer" className="block shrink-0">
                                  <img
                                    src={certification.documentUrl}
                                    alt={certification.certificationType.name}
                                    className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
                                  />
                                </a>
                              )}
                            </div>

                            <div className="mt-4 space-y-3">
                              {isBrcRecord && (
                                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 space-y-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                                      Manual BRC check
                                    </p>
                                    <p className="text-xs text-sky-700 mt-1">
                                      Run company-name and BRN lookups against CR open data, then mark thumbs up/down based on returned JSON.
                                    </p>
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <label className="space-y-1">
                                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                                        Company name
                                      </span>
                                      <input
                                        type="text"
                                        value={brcManualInputById[certification.id]?.companyName || ''}
                                        onChange={(event) =>
                                          setBrcManualInputById((current) => ({
                                            ...current,
                                            [certification.id]: {
                                              companyName: event.target.value,
                                              brn: current[certification.id]?.brn || '',
                                            },
                                          }))
                                        }
                                        placeholder="e.g. MIMO WORK LIMITED"
                                        className="w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                                        BRN
                                      </span>
                                      <input
                                        type="text"
                                        value={brcManualInputById[certification.id]?.brn || ''}
                                        onChange={(event) =>
                                          setBrcManualInputById((current) => ({
                                            ...current,
                                            [certification.id]: {
                                              companyName: current[certification.id]?.companyName || '',
                                              brn: event.target.value,
                                            },
                                          }))
                                        }
                                        placeholder="e.g. 80121820"
                                        className="w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400"
                                      />
                                    </label>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void handleBrcCheck(certification.id, 'name')}
                                      disabled={!!brcCheckBusyByKey[byNameKey]}
                                      className="rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                                    >
                                      {brcCheckBusyByKey[byNameKey] ? 'Searching...' : 'Search by company name'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleBrcCheck(certification.id, 'brn')}
                                      disabled={!!brcCheckBusyByKey[byBrnKey]}
                                      className="rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                                    >
                                      {brcCheckBusyByKey[byBrnKey] ? 'Searching...' : 'Search by BRN'}
                                    </button>
                                  </div>

                                  {[byNameKey, byBrnKey].map((resultKey) => {
                                    const result = brcCheckResultByKey[resultKey];
                                    if (!result) return null;
                                    const verdict = brcCheckVerdictByKey[resultKey];

                                    return (
                                      <div key={resultKey} className="rounded-md border border-sky-200 bg-white px-3 py-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-sky-900">
                                            {result.mode === 'name' ? 'Company name' : 'BRN'} query: {result.requestedValue}
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setBrcCheckVerdictByKey((current) => ({
                                                  ...current,
                                                  [resultKey]: 'up',
                                                }))
                                              }
                                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                                verdict === 'up'
                                                  ? 'bg-emerald-600 text-white'
                                                  : 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                                              }`}
                                            >
                                              👍
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setBrcCheckVerdictByKey((current) => ({
                                                  ...current,
                                                  [resultKey]: 'down',
                                                }))
                                              }
                                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                                verdict === 'down'
                                                  ? 'bg-rose-600 text-white'
                                                  : 'border border-rose-300 bg-rose-50 text-rose-800'
                                              }`}
                                            >
                                              👎
                                            </button>
                                          </div>
                                        </div>
                                        <p className="text-[11px] text-sky-800 break-all">{result.requestUrl}</p>
                                        <pre className="max-h-52 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                                          {JSON.stringify(result.data, null, 2)}
                                        </pre>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  Review notes
                                </label>
                                <textarea
                                  value={reviewNotesById[certification.id] || ''}
                                  onChange={(event) =>
                                    setReviewNotesById((current) => ({
                                      ...current,
                                      [certification.id]: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                  placeholder="Add admin review notes"
                                />
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={reviewBusyId === certification.id}
                                  onClick={() => handleCertificationReview(certification.id, 'VERIFIED')}
                                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {reviewBusyId === certification.id ? 'Saving...' : 'Mark verified'}
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewBusyId === certification.id}
                                  onClick={() => handleCertificationReview(certification.id, 'REJECTED')}
                                  className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewBusyId === certification.id}
                                  onClick={() => handleCertificationReview(certification.id, 'EXPIRED')}
                                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Mark expired
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => { setEditingPro(null); setIsCreating(false); }}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {isCreating ? 'Create Professional' : 'Save Changes'}
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
