"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { EditModal, FieldDefinition } from "@/components/edit-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { ModalOverlay } from "@/components/modal-overlay";
import { useAuth } from "@/context/auth-context";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  awarded: "bg-emerald-100 text-emerald-800",
  withdrawn: "bg-slate-200 text-slate-800",
  started: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  rated: "bg-purple-100 text-purple-800",
  quoted: "bg-blue-100 text-blue-800",
  declined: "bg-slate-100 text-slate-800",
  counter_requested: "bg-purple-100 text-purple-800",
};

type Project = {
  id: string;
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number;
  status: string;
  notes?: string;
  isEmergency?: boolean;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  professionals?: Array<{
    id: string;
    status: string;
    quoteAmount?: number | string;
    invoice?: { amount?: number | string; paymentStatus?: string | null } | null;
  }>;
  updatedAt?: string;
};

type BulkCleanAction = "archive" | "permanent_delete";

type SummaryTone = "slate" | "amber" | "emerald" | "blue" | "rose";

type BulkCleanPreviewResult = {
  totalMatched: number;
  sampled: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  sampleProjects: Array<{ id: string; projectName: string; status: string; createdAt: string }>;
  sampleImpact: Record<string, number>;
};

const adminCardBorderByStatus: Record<string, string> = {
  pending: "border-amber-300/90",
  awarded: "border-emerald-300/90",
  started: "border-blue-300/90",
  quoted: "border-blue-300/90",
  completed: "border-emerald-300/90",
  rated: "border-purple-300/90",
  withdrawn: "border-[rgba(220,20,60,0.8)]",
  declined: "border-[rgba(220,20,60,0.8)]",
  counter_requested: "border-purple-300/90",
  archived: "border-slate-300/90",
};

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

function formatHKD(value?: number | string): string {
  if (value === undefined || value === null || value === "") return "HK$ —";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Wrapper component to use useFundsSecured hook for each card
function ProjectCard({
  project,
  onEdit,
  onArchive,
  onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const invitedCount = project.professionals?.length || 0;
  const responsesCount =
    project.professionals?.filter((professional) => (professional.status || "").toLowerCase() !== "pending").length || 0;
  const quotesCount =
    project.professionals?.filter(
      (professional) => professional.quoteAmount !== undefined && professional.quoteAmount !== null && professional.quoteAmount !== "",
    ).length || 0;
  const isEmergencyProject = project.isEmergency === true;
  const borderClass = isEmergencyProject
    ? "border-[rgba(220,20,60,0.8)]"
    : adminCardBorderByStatus[project.status] || "border-white/20";
  const cardClass = isEmergencyProject
    ? "bg-[var(--mimo-project-paper)] emergency-card-throb hover:bg-[var(--mimo-project-paper)]"
    : "bg-[var(--mimo-project-paper)] hover:bg-[var(--mimo-project-paper)]";

  return (
    <div key={project.id} className={`relative rounded-lg border-[3px] px-4 py-3 shadow-sm transition ${borderClass} ${cardClass}`}>
      <div className="grid gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <Link
              href={`/admin/projects/${project.id}`}
              className="block truncate text-[1.15rem] font-bold leading-tight text-slate-900 underline-offset-2 hover:underline"
              title="Open project details"
            >
              {isEmergencyProject ? `🚨 ${project.projectName}` : project.projectName}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{project.region || "No region"}</span>
              <span>•</span>
              <span className="font-medium text-slate-900">{formatHKD(project.budget)}</span>
              <span>•</span>
              <span>Created {formatDate(project.createdAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                statusColors[project.status] || "bg-slate-100 text-slate-800"
              }`}
            >
              {project.status}
            </span>
            <button
              type="button"
              onClick={() => onArchive(project.id)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => onDelete(project.id)}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] md:items-start">
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><span className="font-semibold text-slate-900">Client:</span> {project.clientName || "—"}</span>
              {project.contractorName ? (
                <span><span className="font-semibold text-slate-900">Contractor:</span> {project.contractorName}</span>
              ) : null}
            </div>
            {project.notes ? (
              <p className="line-clamp-2 leading-relaxed text-slate-700">{project.notes}</p>
            ) : (
              <p className="text-slate-500">No project notes.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4 md:grid-cols-2">
            <div className="rounded-lg bg-white/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Invited</p>
              <p className="text-sm font-semibold text-slate-900">{invitedCount}</p>
            </div>
            <div className="rounded-lg bg-white/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Responses</p>
              <p className="text-sm font-semibold text-slate-900">{responsesCount}</p>
            </div>
            <div className="rounded-lg bg-white/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Quotes</p>
              <p className="text-sm font-semibold text-slate-900">{quotesCount}</p>
            </div>
            <div className="rounded-lg bg-white/40 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Updated</p>
              <p className="text-sm font-semibold text-slate-900">{formatDate(project.updatedAt || project.createdAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-indigo-700 md:flex-col md:items-end md:justify-start">
            <Link href={`/admin/projects/${project.id}`} className="hover:text-indigo-800 hover:underline">
              Open project
            </Link>
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="hover:text-indigo-800 hover:underline"
            >
              Edit details
            </button>
            <Link href={`/admin/projects/${project.id}/tokens`} className="hover:text-indigo-800 hover:underline">
              Email tokens
            </Link>
            <Link href={`/admin/projects/${project.id}/professionals`} className="hover:text-indigo-800 hover:underline">
              Responses & quotes
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/5 pt-2 text-[11px] text-slate-500">
          <span className="font-mono">ID: {project.id}</span>
          <span>Updated: {formatDate(project.updatedAt || project.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: SummaryTone;
  active: boolean;
  onClick: () => void;
}) {
  const toneMap: Record<SummaryTone, { valueColor: string; activeRing: string }> = {
    slate: { valueColor: "text-slate-900", activeRing: "ring-slate-700" },
    amber: { valueColor: "text-amber-700", activeRing: "ring-amber-300" },
    emerald: { valueColor: "text-emerald-700", activeRing: "ring-emerald-300" },
    blue: { valueColor: "text-blue-700", activeRing: "ring-blue-300" },
    rose: { valueColor: "text-rose-700", activeRing: "ring-rose-300" },
  };

  const { valueColor, activeRing } = toneMap[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg bg-white/40 px-3 py-2 text-left transition-all hover:bg-white/60 ${
        active ? `ring-2 ${activeRing} bg-white/60` : ""
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-700">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
    </button>
  );
}

export default function AdminProjectsPage() {
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "pending" | "onsite" | "completed" | "cancelled" | "archived"
  >("active");
  const [bulkCleanOpen, setBulkCleanOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<BulkCleanAction>("archive");
  const [bulkStatuses, setBulkStatuses] = useState<string[]>(["completed", "withdrawn", "declined"]);
  const [bulkOlderThanDays, setBulkOlderThanDays] = useState<string>("30");
  const [bulkCreatedBefore, setBulkCreatedBefore] = useState<string>("");
  const [bulkIncludeArchived, setBulkIncludeArchived] = useState<boolean>(false);
  const [bulkLimit, setBulkLimit] = useState<string>("200");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkCleanPreviewResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  const [bulkExecuteResult, setBulkExecuteResult] = useState<{ action: string; affected: number; skipped: number } | null>(null);
  const cancelledStatuses = ["rejected", "withdrawn", "declined"];
  const bulkStatusOptions = [
    "pending",
    "approved",
    "awarded",
    "quoted",
    "completed",
    "withdrawn",
    "declined",
    "rejected",
    "archived",
  ];

  const totals = useMemo(() => {
    const activeProjects = projects.filter(
      (p) => p.status !== "archived" && p.status !== "completed",
    );
    return {
      active: activeProjects.length,
      pending: activeProjects.filter((p) => p.status === "pending").length,
      onsite: activeProjects.filter((p) => p.status === "awarded").length,
      completed: projects.filter((p) => p.status === "completed").length,
      cancelled: activeProjects.filter((p) => cancelledStatuses.includes(p.status)).length,
      archived: projects.filter((p) => p.status === "archived").length,
    };
  }, [projects]);

  useEffect(() => {
    fetchProjects();
  }, [accessToken]);

  useEffect(() => {
    const clientFilter = searchParams.get('client');
    if (clientFilter) {
      setFilter(clientFilter);
    }
  }, [searchParams]);

  const fetchProjects = async () => {
    if (!accessToken) return;

    try {
      const res = await fetch(`${API_BASE_URL}/projects`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.warn(`Projects endpoint returned ${res.status}, loading with empty state`);
        setProjects([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      console.warn('Failed to fetch projects, API may be unavailable:', err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: Record<string, any>) => {
    if (!editingProject || !accessToken) return;

    const payload = {
      projectName: data.projectName,
      clientName: data.clientName,
      contractorName: data.contractorName || null,
      region: data.region,
      budget: data.budget ? parseFloat(data.budget) : null,
      status: data.status,
      notes: data.notes || null,
    };

    const res = await fetch(`${API_BASE_URL}/projects/${editingProject.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    await fetchProjects();
  };

  const handleArchive = async () => {
    if (!archiveId || !accessToken) return;

    const res = await fetch(`${API_BASE_URL}/projects/${archiveId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) throw new Error(await res.text());
    setProjects((prev) => prev.filter((p) => p.id !== archiveId));
    setArchiveId(null);
  };

  const handleDelete = async () => {
    if (!deletingId || !accessToken) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${deletingId}/permanent`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Server error ${res.status}`);
      }
      setProjects((prev) => prev.filter((p) => p.id !== deletingId));
      setDeletingId(null);
      setDeleteConfirmStep(1);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleArchiveFromDelete = async () => {
    if (!deletingId || !accessToken) return;

    const res = await fetch(`${API_BASE_URL}/projects/${deletingId}/archive`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) throw new Error(await res.text());
    setProjects((prev) => prev.filter((p) => p.id !== deletingId));
    setDeletingId(null);
    setDeleteConfirmStep(1);
  };

  const buildBulkPayload = () => {
    const parsedOlderThanDays = Number.parseInt(bulkOlderThanDays, 10);
    const parsedLimit = Number.parseInt(bulkLimit, 10);

    return {
      action: bulkAction,
      statuses: bulkStatuses,
      olderThanDays: Number.isFinite(parsedOlderThanDays) && parsedOlderThanDays > 0 ? parsedOlderThanDays : undefined,
      createdBefore: bulkCreatedBefore || undefined,
      includeArchived: bulkIncludeArchived,
      limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200,
    };
  };

  const runBulkPreview = async () => {
    if (!accessToken) return;
    setBulkLoading(true);
    setBulkError(null);
    try {
      const payload = buildBulkPayload();
      const res = await fetch(`${API_BASE_URL}/projects/admin/bulk-clean-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setBulkResult(data);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to run preview");
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulkExecute = async () => {
    if (!accessToken) return;
    setBulkLoading(true);
    setBulkError(null);
    setBulkExecuteResult(null);
    try {
      const payload = buildBulkPayload();
      const res = await fetch(`${API_BASE_URL}/projects/admin/bulk-clean-execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setBulkExecuteResult({ action: data.action, affected: data.affected, skipped: data.skipped });
      setBulkResult(null);
      setBulkDeleteConfirmText("");
      await fetchProjects();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Failed to run bulk execute");
    } finally {
      setBulkLoading(false);
    }
  };

  const filtered = projects.filter((p) => {
    if (statusFilter === "active" && (p.status === "archived" || p.status === "completed")) {
      return false;
    }
    if (statusFilter === "pending" && p.status !== "pending") return false;
    if (statusFilter === "onsite" && p.status !== "awarded") return false;
    if (statusFilter === "completed" && p.status !== "completed") return false;
    if (statusFilter === "cancelled" && !cancelledStatuses.includes(p.status)) return false;
    if (statusFilter === "archived" && p.status !== "archived") return false;

    // Filter by search text
    if (!filter.trim()) return true;
    const needle = filter.toLowerCase();
    const fields = [
      p.projectName,
      p.clientName,
      p.contractorName,
      p.region,
      p.notes,
      p.status,
    ]
      .filter(Boolean)
      .map((v) => v!.toString().toLowerCase());
    return fields.some((f) => f.includes(needle));
  });

  const editFields: FieldDefinition[] = editingProject
    ? [
        { name: "projectName", label: "Project Name", type: "text", value: editingProject.projectName, required: true },
        { name: "clientName", label: "Client Name", type: "text", value: editingProject.clientName, required: true },
        { name: "contractorName", label: "Contractor Name", type: "text", value: editingProject.contractorName },
        { name: "region", label: "Region", type: "text", value: editingProject.region, required: true },
        { name: "budget", label: "Budget", type: "number", value: editingProject.budget },
        {
          name: "status",
          label: "Status",
          type: "select",
          value: editingProject.status,
          options: [
            { label: "Pending", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Declined", value: "rejected" },
          ],
          required: true,
        },
        { name: "notes", label: "Notes", type: "textarea", value: editingProject.notes },
      ]
    : [];

  if (loading) {
    return (
      <div className="relative isolate min-h-screen">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="h-full w-full bg-[url('/assets/images/hero-homepage-empty.webp')] bg-cover bg-center bg-no-repeat" />
          <div className="absolute inset-0 bg-[#1a1a1a]/44" />
        </div>
        <div className="flex min-h-screen items-center justify-center px-4 text-center text-slate-700">
          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-6 py-5 shadow-sm">
            Loading projects...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="h-full w-full bg-[url('/assets/images/hero-homepage-empty.webp')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#1a1a1a]/44" />
      </div>

      <div className="min-h-screen pb-16">
        <div className="mx-auto max-w-7xl space-y-5 px-3 py-6 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-5 py-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Admin</p>
                <h1 className="text-2xl font-bold leading-tight text-slate-900">All Projects</h1>
                <p className="text-sm text-slate-600">Compact admin view with quick archive, delete, and audit links.</p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  <SummaryCard label="All Active" value={totals.active} tone="slate" active={statusFilter === "active"} onClick={() => setStatusFilter("active")} />
                  <SummaryCard label="Pending" value={totals.pending} tone="amber" active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")} />
                  <SummaryCard label="On Site" value={totals.onsite} tone="blue" active={statusFilter === "onsite"} onClick={() => setStatusFilter("onsite")} />
                  <SummaryCard label="Completed" value={totals.completed} tone="emerald" active={statusFilter === "completed"} onClick={() => setStatusFilter("completed")} />
                  <SummaryCard label="Cancelled" value={totals.cancelled} tone="rose" active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} />
                  <SummaryCard label="Archived" value={totals.archived} tone="slate" active={statusFilter === "archived"} onClick={() => setStatusFilter("archived")} />
                </div>
                <p className="text-[10px] text-center italic text-slate-600">Click on a status to filter</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="relative grid gap-1">
                <label className="text-xs font-medium text-slate-600">Search projects</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="e.g. client, contractor, region"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                  {filter && (
                    <button
                      type="button"
                      onClick={() => setFilter("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                      aria-label="Clear search"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-end justify-start md:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBulkCleanOpen(true);
                    setBulkResult(null);
                    setBulkError(null);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  Bulk Clean
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 text-sm text-slate-600 shadow-sm">
              No projects found.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={setEditingProject}
                  onArchive={setArchiveId}
                  onDelete={(id) => {
                    setDeletingId(id);
                    setDeleteConfirmStep(1);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editingProject && (
        <EditModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          title={`Edit ${editingProject.projectName}`}
          fields={editFields}
          onSave={handleSave}
        />
      )}

      <ConfirmModal
        isOpen={!!archiveId}
        onCancel={() => setArchiveId(null)}
        onConfirm={handleArchive}
        title="Archive Project"
        message="Archive this project so it is hidden from client and professional views?"
        confirmLabel="Archive"
        tone="default"
      />

      {deletingId && (
        <ModalOverlay
          isOpen={!!deletingId}
          onClose={() => {
            if (deleteLoading) return;
            setDeletingId(null);
            setDeleteConfirmStep(1);
            setDeleteError(null);
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="mt-1 h-9 w-9 flex-none rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
                {deleteLoading ? (
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  {deleteLoading
                    ? "Purging project…"
                    : deleteConfirmStep === 1
                    ? "Delete Project Permanently?"
                    : "Final Confirmation"}
                </h3>
                <p className="text-sm text-slate-600">
                  {deleteLoading
                    ? "Removing all associated records and files. This may take a few seconds — do not close this window."
                    : deleteConfirmStep === 1
                    ? "Permanent delete is irreversible. If you only want to hide it from platform users, choose Archive instead."
                    : "This will permanently delete the project and every associated record. This cannot be undone."}
                </p>
              </div>
            </div>

            {/* In-progress bar */}
            {deleteLoading && (
              <div className="overflow-hidden rounded-full bg-rose-100" style={{ height: 4 }}>
                <div className="h-full animate-pulse rounded-full bg-rose-500" style={{ width: '100%' }} />
              </div>
            )}

            {/* Error message */}
            {deleteError && !deleteLoading && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <p className="font-semibold">Delete failed</p>
                <p className="mt-0.5 font-mono text-xs break-all">{deleteError}</p>
              </div>
            )}

            {/* Actions */}
            {!deleteLoading && (
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingId(null);
                    setDeleteConfirmStep(1);
                    setDeleteError(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>

                {deleteConfirmStep === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={handleArchiveFromDelete}
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition"
                    >
                      Archive Instead
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirmStep(2); setDeleteError(null); }}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition"
                    >
                      Continue Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 transition"
                  >
                    {deleteError ? "Retry Delete" : "Yes, Delete Permanently"}
                  </button>
                )}
              </div>
            )}
          </div>
        </ModalOverlay>
      )}

      {bulkCleanOpen && (
        <ModalOverlay
          isOpen={bulkCleanOpen}
          onClose={() => {
            if (bulkLoading) return;
            setBulkCleanOpen(false);
            setBulkExecuteResult(null);
            setBulkDeleteConfirmText("");
          }}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Bulk Clean Projects</h3>
              <p className="text-sm text-slate-600">Preview and then archive or permanently delete projects in bulk.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Action</label>
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as BulkCleanAction)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={bulkLoading}
                >
                  <option value="archive">Archive matched projects</option>
                  <option value="permanent_delete">Permanently delete matched projects</option>
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Limit per run</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={bulkLimit}
                  onChange={(e) => setBulkLimit(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={bulkLoading}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Older than days</label>
                <input
                  type="number"
                  min={1}
                  value={bulkOlderThanDays}
                  onChange={(e) => setBulkOlderThanDays(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={bulkLoading}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Created before</label>
                <input
                  type="date"
                  value={bulkCreatedBefore}
                  onChange={(e) => setBulkCreatedBefore(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={bulkLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Statuses</p>
              <div className="flex flex-wrap gap-2">
                {bulkStatusOptions.map((statusOption) => {
                  const selected = bulkStatuses.includes(statusOption);
                  return (
                    <button
                      key={statusOption}
                      type="button"
                      onClick={() => {
                        setBulkStatuses((prev) =>
                          prev.includes(statusOption)
                            ? prev.filter((status) => status !== statusOption)
                            : [...prev, statusOption],
                        );
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        selected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                      disabled={bulkLoading}
                    >
                      {statusOption}
                    </button>
                  );
                })}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={bulkIncludeArchived}
                  onChange={(e) => setBulkIncludeArchived(e.target.checked)}
                  disabled={bulkLoading}
                />
                Include archived projects even when status filter is empty
              </label>
            </div>

            {bulkError && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {bulkError}
              </div>
            )}

            {/* Execute result summary */}
            {bulkExecuteResult && !bulkLoading && (
              <div className={`rounded-md border px-3 py-3 text-sm ${
                bulkExecuteResult.action === 'permanent_delete'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                }`}>
                <p className="font-semibold">
                  {bulkExecuteResult.action === 'permanent_delete' ? '🗑 Purge complete' : '✓ Archive complete'}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">{bulkExecuteResult.affected}</span> project{bulkExecuteResult.affected !== 1 ? 's' : ''} {bulkExecuteResult.action === 'permanent_delete' ? 'permanently deleted' : 'archived'}.
                  {bulkExecuteResult.skipped > 0 && (
                    <span className="ml-2 text-slate-500">{bulkExecuteResult.skipped} skipped.</span>
                  )}
                </p>
              </div>
            )}

            {/* Typed confirmation gate for permanent delete */}
            {bulkAction === "permanent_delete" && bulkResult && bulkResult.totalMatched > 0 && !bulkExecuteResult && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 space-y-2">
                <p className="text-sm font-semibold text-rose-800">
                  You are about to permanently delete{' '}
                  <span className="underline">{bulkResult.totalMatched} project{bulkResult.totalMatched !== 1 ? 's' : ''}</span>{' '}
                  and all their associated records. This cannot be undone.
                </p>
                <p className="text-xs text-rose-700">
                  Type <strong>DELETE</strong> below to unlock the execute button.
                </p>
                <input
                  type="text"
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  disabled={bulkLoading}
                  className="w-full rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-mono text-rose-900 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>
            )}

            {bulkResult && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm text-slate-700">
                  Matched <span className="font-semibold text-slate-900">{bulkResult.totalMatched}</span> projects (preview sampled {bulkResult.sampled}).
                </div>
                <div className="grid gap-2 md:grid-cols-2 text-xs text-slate-700">
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <p className="font-semibold text-slate-900 mb-1">Status Breakdown</p>
                    {bulkResult.statusBreakdown.length === 0 ? (
                      <p>No matches.</p>
                    ) : (
                      <ul className="space-y-1">
                        {bulkResult.statusBreakdown.map((row) => (
                          <li key={row.status} className="flex justify-between">
                            <span>{row.status}</span>
                            <span className="font-semibold">{row.count}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                    <p className="font-semibold text-slate-900 mb-1">Sample Impact</p>
                    <ul className="space-y-1">
                      {Object.entries(bulkResult.sampleImpact)
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                        .map(([key, value]) => (
                          <li key={key} className="flex justify-between gap-3">
                            <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())}</span>
                            <span className="font-semibold text-slate-900">{value}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setBulkCleanOpen(false);
                  setBulkExecuteResult(null);
                  setBulkDeleteConfirmText("");
                }}
                disabled={bulkLoading}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => { setBulkExecuteResult(null); setBulkDeleteConfirmText(""); runBulkPreview(); }}
                disabled={bulkLoading}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {bulkLoading && !bulkExecuteResult ? "Running..." : "Preview"}
              </button>
              <button
                type="button"
                onClick={runBulkExecute}
                disabled={
                  bulkLoading ||
                  !bulkResult ||
                  bulkResult.totalMatched === 0 ||
                  (bulkAction === "permanent_delete" && bulkDeleteConfirmText !== "DELETE")
                }
                className={`rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
                  bulkAction === "permanent_delete"
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {bulkLoading
                  ? bulkAction === "permanent_delete" ? "Purging..." : "Archiving..."
                  : bulkAction === "permanent_delete" ? "Execute Permanent Delete" : "Execute Archive"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
