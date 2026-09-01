"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useRoleGuard } from "@/hooks/use-role-guard";

type PmProject = {
  id: string;
  projectName: string;
  region?: string;
  tradesRequired?: string[];
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  tenderOpenedAt?: string;
  tenderClosedAt?: string;
  createdAt?: string;
  status?: string;
  currentStage?: string;
  pmId?: string | null;
  releasedForQuotationAt?: string | null;
  releasedByPmId?: string | null;
  notes?: string;
  user?: { firstName?: string; surname?: string; email?: string };
};

function formatDate(date?: string | null): string {
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

export default function PmProjectDetailPage() {
  useRoleGuard(["project_manager"], { fallback: "/" });
  const params = useParams();
  const projectId = params?.id as string;
  const { accessToken } = useAuth();

  const [project, setProject] = useState<PmProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!accessToken || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load project (${res.status})`);
      }
      const data = await res.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  const handleRelease = async () => {
    if (!accessToken || !projectId) return;
    setReleasing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-release`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to release (${res.status})`);
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release project");
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 text-sm bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <Link href="/pm" className="font-semibold text-slate-900 hover:text-slate-700">PM Home</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Project</span>
      </div>

      {loading && <div className="py-10 text-center text-slate-500 text-sm">Loading project…</div>}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && project && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">{project.projectName}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {[project.region, project.user ? `${project.user.firstName || ""} ${project.user.surname || ""}`.trim() : null]
                  .filter(Boolean)
                  .join(" · ") || "No location"}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                project.releasedForQuotationAt
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              {project.releasedForQuotationAt ? "Released for quotation" : "Awaiting release"}
            </span>
          </div>

          {project.tradesRequired && project.tradesRequired.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {project.tradesRequired.map((trade) => (
                <span
                  key={trade}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {trade}
                </span>
              ))}
            </div>
          )}

          {project.notes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project notes</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{project.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Status</p>
              <p className="font-medium text-slate-800">{project.status || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Stage</p>
              <p className="font-medium text-slate-800">{project.currentStage || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Tender opened</p>
              <p className="font-medium text-slate-800">{formatDate(project.tenderOpenedAt)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Released at</p>
              <p className="font-medium text-slate-800">{formatDate(project.releasedForQuotationAt)}</p>
            </div>
          </div>

          {!project.releasedForQuotationAt && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                This project is held and not yet visible for quotation. Review the details and release it when ready.
              </p>
              <button
                type="button"
                disabled={releasing}
                onClick={handleRelease}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {releasing ? "Releasing…" : "Release for quotation"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
