"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useRoleGuard } from "@/hooks/use-role-guard";

type QueueProject = {
  id: string;
  projectName: string;
  region?: string;
  tradesRequired?: string[];
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  tenderOpenedAt?: string;
  createdAt?: string;
  status?: string;
  currentStage?: string;
  releasedForQuotationAt?: string | null;
  updatedAt?: string;
  user?: {
    firstName?: string;
    surname?: string;
    email?: string;
  };
};

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export default function PmQueuePage() {
  useRoleGuard(["project_manager"], { fallback: "/admin" });
  const { accessToken } = useAuth();

  const [projects, setProjects] = useState<QueueProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [myProjects, setMyProjects] = useState<QueueProject[]>([]);
  const [myLoading, setMyLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/queue`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load queue (${res.status})`);
      }
      const data = await res.json();
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchMyProjects = useCallback(async () => {
    if (!accessToken) return;
    setMyLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMyProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch {
      /* best-effort */
    } finally {
      setMyLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchQueue();
    void fetchMyProjects();
  }, [fetchQueue, fetchMyProjects]);

  const handleClaim = async (projectId: string) => {
    if (!accessToken) return;
    setClaimingId(projectId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to claim (${res.status})`);
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim project");
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/admin" className="font-semibold text-slate-900 hover:text-slate-700">Admin Portal</Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">PM — The Queue</span>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Project Manager</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">My Projects</h1>
        <p className="mt-1 text-sm text-slate-600">
          Projects you own, awaiting quotation release.
        </p>
      </div>

      {myLoading ? (
        <div className="py-6 text-center text-slate-500 text-sm">Loading…</div>
      ) : myProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 text-sm">
          You haven&apos;t claimed any projects yet. Claim one from the queue below.
        </div>
      ) : (
        <div className="space-y-3">
          {myProjects.map((project) => (
            <Link
              key={project.id}
              href={`/pm/projects/${project.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">{project.projectName}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{project.region || "No location"}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${project.releasedForQuotationAt ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                  {project.releasedForQuotationAt ? "Released" : "Awaiting release"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Queue */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">The Queue</h2>
        <p className="mt-1 text-sm text-slate-600">
          Newly registered projects awaiting a project manager. Claim one to take ownership.
        </p>
      </div>

      {loading && (
        <div className="py-10 text-center text-slate-500 text-sm">Loading queue…</div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 text-sm">
          The queue is empty. New projects will appear here once a client puts them out to tender.
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    New Project
                  </span>
                  {project.isEmergency && (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                      Emergency
                    </span>
                  )}
                  {project.onlySelectedProfessionalsCanBid === false && (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      Open tender
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-base font-semibold text-slate-900">{project.projectName}</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {[project.region, project.user ? `${project.user.firstName || ""} ${project.user.surname || ""}`.trim() : null]
                    .filter(Boolean)
                    .join(" · ") || "No location"}
                </p>
                {project.tradesRequired && project.tradesRequired.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                <p className="mt-2 text-xs text-slate-400">Registered {formatDate(project.createdAt)}</p>
              </div>

              <button
                type="button"
                disabled={!!claimingId}
                onClick={() => handleClaim(project.id)}
                className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {claimingId === project.id ? "Claiming…" : "Claim"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
