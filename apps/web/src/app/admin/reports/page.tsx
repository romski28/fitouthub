"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import Link from "next/link";

type ReportStatus = "new" | "reviewed" | "resolved";

interface ProfessionalSummary {
  id: string;
  fullName?: string | null;
  email: string;
  businessName?: string | null;
  professionType?: string | null;
  primaryTrade?: string | null;
}

interface ProfessionalReportItem {
  id: string;
  professionalId: string;
  reporterUserId?: string | null;
  comments: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  professional?: ProfessionalSummary;
}

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export default function AdminReportsPage() {
  const [items, setItems] = useState<ProfessionalReportItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("new");

  const tabs: { key: ReportStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "new", label: "New" },
    { key: "reviewed", label: "Reviewed" },
    { key: "resolved", label: "Resolved" },
  ];

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");
      const url = `${API_BASE_URL.replace(/\/$/, "")}/admin/reports?${params.toString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data?.items) ? data.items : []);
        setTotal(Number(data?.total || 0));
      } else {
        setItems([]);
        setTotal(0);
      }
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const markStatus = async (id: string, status: ReportStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/admin/reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        // Optimistically update list
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
      }
    } catch {}
  };

  const header = useMemo(() => {
    const label = tabs.find((t) => t.key === statusFilter)?.label || "All";
    return `${label} Reports (${total})`;
  }, [statusFilter, total]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
          <h1 className="text-2xl font-bold">Professional Reports</h1>
          <p className="text-sm text-slate-200/90">Review and moderate client-submitted reports before wider sharing.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`rounded-md px-3 py-2 text-sm font-medium border ${
                statusFilter === tab.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-slate-600">{header}</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Created</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Professional</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Comments</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600">Loading…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-600">No reports found.</td>
              </tr>
            ) : (
              items.map((it) => {
                const p = it.professional;
                const name = p?.fullName || p?.businessName || p?.email;
                return (
                  <tr key={it.id}>
                    <td className="px-4 py-3 text-sm text-slate-700">{formatDate(it.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {p ? (
                        <div className="flex flex-col">
                          <Link href={`/admin/professionals?highlight=${encodeURIComponent(p.id)}`} className="font-semibold text-slate-900 hover:underline">
                            {name}
                          </Link>
                          <span className="text-xs text-slate-600">{p.email}</span>
                        </div>
                      ) : (
                        <span className="text-slate-700">{it.professionalId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xl">
                      <span className="line-clamp-3">{it.comments}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                        it.status === "new"
                          ? "bg-amber-100 text-amber-800"
                          : it.status === "reviewed"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}>{it.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        {it.status !== "reviewed" && (
                          <button
                            className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50"
                            onClick={() => markStatus(it.id, "reviewed")}
                          >
                            Mark reviewed
                          </button>
                        )}
                        {it.status !== "resolved" && (
                          <button
                            className="rounded-md bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700"
                            onClick={() => markStatus(it.id, "resolved")}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
