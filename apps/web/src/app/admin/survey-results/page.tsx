"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import Link from "next/link";

interface SurveyEntry {
  id: string;
  projectId: string;
  userId?: string | null;
  surveyVersion?: string | null;
  answers: Record<string, any>;
  submittedAt: string;
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

function npsColor(n: number | null | undefined): string {
  if (n == null) return "text-slate-400";
  if (n >= 9) return "text-emerald-600 font-bold";
  if (n >= 7) return "text-emerald-500";
  if (n >= 5) return "text-amber-500";
  return "text-red-500";
}

function npsLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  return String(n);
}

export default function AdminSurveyResultsPage() {
  const [items, setItems] = useState<SurveyEntry[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [versionFilter, setVersionFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tabs = [
    { key: "all", label: "All" },
    { key: "2.0", label: "v2.0" },
    { key: "1.0", label: "v1.0" },
  ];

  const fetchResults = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (versionFilter !== "all") params.set("surveyVersion", versionFilter);
      params.set("limit", "100");
      const url = `${API_BASE_URL.replace(/\/$/, "")}/ux-feedback/admin?${params.toString()}`;
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
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionFilter]);

  const stats = useMemo(() => {
    const v2 = items.filter((i) => i.surveyVersion === "2.0" || (!i.surveyVersion && i.answers?.return_likelihood != null));
    const withReturn = v2.filter((i) => i.answers?.return_likelihood != null);
    const avgReturn =
      withReturn.length > 0
        ? (withReturn.reduce((s, i) => s + Number(i.answers.return_likelihood), 0) / withReturn.length).toFixed(1)
        : "—";
    const withRecommend = v2.filter((i) => i.answers?.recommend_likelihood != null);
    const avgRecommend =
      withRecommend.length > 0
        ? (withRecommend.reduce((s, i) => s + Number(i.answers.recommend_likelihood), 0) / withRecommend.length).toFixed(1)
        : "—";
    return { avgReturn, avgRecommend, v2Count: v2.length };
  }, [items]);

  const header = useMemo(() => {
    const label = tabs.find((t) => t.key === versionFilter)?.label || "All";
    return `${label} Responses (${total})`;
  }, [versionFilter, total]);

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-emerald-900 to-emerald-800 px-5 py-5 text-white shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
          <h1 className="text-2xl font-bold">Survey Results</h1>
          <p className="text-sm text-emerald-100/90">Post-project UX feedback from users.</p>
        </div>
      </div>

      {/* Stats row */}
      {stats.v2Count > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">v2 Responses</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stats.v2Count}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Return NPS</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.avgReturn}</p>
            <p className="text-xs text-slate-400">1–10 scale</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Recommend NPS</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.avgRecommend}</p>
            <p className="text-xs text-slate-400">0–10 scale</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`rounded-md px-3 py-2 text-sm font-medium border ${
                versionFilter === tab.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => setVersionFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="text-sm text-slate-600">{header}</div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Project</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Ver</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Feeling</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">Return NPS</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">Rec. NPS</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading…</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No survey responses yet.
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const a = it.answers || {};
                const isExpanded = expandedId === it.id;
                const ver = it.surveyVersion || (a.return_likelihood != null ? "2.0" : "1.0");
                return (
                  <>
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {formatDate(it.submittedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <Link
                          href={`/admin/projects/${encodeURIComponent(it.projectId)}`}
                          className="font-mono text-xs text-emerald-700 hover:underline"
                        >
                          {it.projectId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                          ver === "2.0" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        }`}>
                          v{ver}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {a.feeling ? (
                          <span className="italic">"{a.feeling}"</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm text-center font-semibold ${npsColor(a.return_likelihood)}`}>
                        {npsLabel(a.return_likelihood)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-center font-semibold ${npsColor(a.recommend_likelihood)}`}>
                        {npsLabel(a.recommend_likelihood)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : it.id)}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
                        >
                          {isExpanded ? "Collapse" : "Expand"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${it.id}-detail`}>
                        <td colSpan={7} className="px-6 py-4 bg-slate-50">
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
                            {/* First Impressions */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">First Impressions</p>
                              {a.feeling && <p><span className="text-slate-400">Feeling:</span> <span className="italic text-slate-800">"{a.feeling}"</span></p>}
                              {a.clarity && (
                                <div>
                                  <span className="text-slate-400">Clarity:</span>
                                  <ul className="ml-4 mt-0.5 list-disc text-slate-700 space-y-0.5">
                                    {Object.entries(a.clarity as Record<string, string>).map(([k, v]) => (
                                      <li key={k}>{k}: {v === "clear" ? "✓ Clear" : v === "confused" ? "? Confused" : "—"}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {a.uncertain_moment && <p><span className="text-slate-400">Uncertain moment:</span> <span className="text-slate-800">{a.uncertain_moment}</span></p>}
                              {a.missing_info && <p><span className="text-slate-400">Missing info:</span> <span className="text-slate-800">{a.missing_info}</span></p>}
                            </div>

                            {/* Competition */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competition</p>
                              {a.current_methods && Array.isArray(a.current_methods) && a.current_methods.length > 0 && (
                                <p><span className="text-slate-400">Methods:</span> <span className="text-slate-800">{(a.current_methods as string[]).join(", ")}</span></p>
                              )}
                              {a.other_method && <p><span className="text-slate-400">Other method:</span> <span className="text-slate-800">{a.other_method}</span></p>}
                              {a.mimo_comparison && <p><span className="text-slate-400">vs MIMO:</span> <span className="text-slate-800">{a.mimo_comparison}</span></p>}
                              {a.mimo_better && <p><span className="text-slate-400">MIMO better:</span> <span className="text-slate-800">{a.mimo_better}</span></p>}
                              {a.alternatives_better && <p><span className="text-slate-400">Alternatives better:</span> <span className="text-slate-800">{a.alternatives_better}</span></p>}
                            </div>

                            {/* Would You Use */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Would You Use It?</p>
                              {a.return_likelihood != null && <p><span className="text-slate-400">Return likelihood:</span> <span className={`font-semibold ${npsColor(a.return_likelihood)}`}>{a.return_likelihood}/10</span></p>}
                              {a.return_reason && <p><span className="text-slate-400">Reason:</span> <span className="text-slate-800">{a.return_reason}</span></p>}
                              {a.recommend_likelihood != null && <p><span className="text-slate-400">Recommend:</span> <span className={`font-semibold ${npsColor(a.recommend_likelihood)}`}>{a.recommend_likelihood}/10</span></p>}
                            </div>

                            {/* Ideas & Concerns */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ideas &amp; Concerns</p>
                              {a.change_one_thing && <p><span className="text-slate-400">Change one thing:</span> <span className="text-slate-800">{a.change_one_thing}</span></p>}
                              {a.feature_wish && <p><span className="text-slate-400">Feature wish:</span> <span className="text-slate-800">{a.feature_wish}</span></p>}
                              {a.biggest_worry && <p><span className="text-slate-400">Biggest worry:</span> <span className="text-slate-800">{a.biggest_worry}</span></p>}
                            </div>

                            {/* About You */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">About You</p>
                              {a.user_role && <p><span className="text-slate-400">Role:</span> <span className="text-slate-800">{a.user_role}</span></p>}
                              {a.renovation_history && <p><span className="text-slate-400">Renovation history:</span> <span className="text-slate-800">{a.renovation_history}</span></p>}
                            </div>

                            {/* Looking Forward */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Looking Forward</p>
                              {a.escrow_comfortable != null && <p><span className="text-slate-400">Escrow comfortable:</span> <span className={`font-semibold ${a.escrow_comfortable ? "text-emerald-600" : "text-red-500"}`}>{a.escrow_comfortable ? "Yes" : "No"}</span></p>}
                              {a.escrow_reason && <p><span className="text-slate-400">Escrow reason:</span> <span className="text-slate-800">{a.escrow_reason}</span></p>}
                              {a.escrow_concern && <p><span className="text-slate-400">Escrow concern:</span> <span className="text-slate-800">{a.escrow_concern}</span></p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
