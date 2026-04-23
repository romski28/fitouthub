"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { EditModal, FieldDefinition } from "@/components/edit-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { ModalOverlay } from "@/components/modal-overlay";
import { ProjectProgressBar } from "@/components/project-progress-bar";
import { useAuth } from "@/context/auth-context";
import { useFundsSecured } from "@/hooks/use-funds-secured";

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

type BulkCleanPreviewResult = {
  totalMatched: number;
  sampled: number;
  statusBreakdown: Array<{ status: string; count: number }>;
  sampleProjects: Array<{ id: string; projectName: string; status: string; createdAt: string }>;
  sampleImpact: Record<string, number>;
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
  const { accessToken } = useAuth();
  const fundsSecured = useFundsSecured(project.id, accessToken || undefined);

  return (
    <div key={project.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="rounded-t-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-bold">{project.projectName}</div>
            <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wide">{project.region}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                statusColors[project.status] || "bg-slate-100 text-slate-800"
              }`}
            >
              {project.status}
            </span>
            <Link
              href={`/admin/projects/${project.id}`}
              className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 transition"
            >
              Manage
            </Link>
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 transition"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onArchive(project.id)}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => onDelete(project.id)}
              className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <ProjectProgressBar
          project={{
            id: project.id,
            status: project.status,
            startDate: project.startDate,
            endDate: project.endDate,
            professionals:
              project.professionals?.map((p) => ({
                status: p.status,
                quoteAmount: p.quoteAmount,
                invoice: p.invoice || null,
              })) || [],
          }}
          variant="compact"
          fundsSecured={fundsSecured}
        />

        <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="font-semibold">Client:</span>
            <span className="text-slate-600">{project.clientName}</span>
          </div>
          {project.contractorName ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span className="font-semibold">Contractor:</span>
              <span className="text-slate-600">{project.contractorName}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="font-semibold">Budget:</span>
            <span className="text-slate-600">{formatHKD(project.budget)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="font-semibold">Status:</span>
            <span className="text-slate-600 capitalize">{project.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="font-semibold">Created:</span>
            <span className="text-slate-600">{formatDate(project.createdAt)}</span>
          </div>
        </div>

        {project.professionals && project.professionals.length > 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            <span className="font-semibold">Invited:</span>
            <span className="text-slate-600">{project.professionals.length} professional(s)</span>
          </div>
        ) : null}

        {project.notes ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 border border-slate-100">
            <p className="font-semibold text-slate-800 mb-1">Notes</p>
            <p className="leading-relaxed line-clamp-3">{project.notes}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>ID: {project.id}</span>
          <span>Updated: {formatDate(project.updatedAt || project.createdAt)}</span>
        </div>

        <div className="flex gap-3 text-xs font-semibold text-indigo-600">
          <Link
            href={`/admin/projects/${project.id}/tokens`}
            className="hover:text-indigo-700 hover:underline"
          >
            📧 Email Tokens
          </Link>
          <Link
            href={`/admin/projects/${project.id}/professionals`}
            className="hover:text-indigo-700 hover:underline"
          >
            💬 Responses & Quotes
          </Link>
        </div>

        <div className="flex gap-2 pt-1"></div>
      </div>
    </div>
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

    const res = await fetch(`${API_BASE_URL}/projects/${deletingId}/permanent`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) throw new Error(await res.text());
    setProjects((prev) => prev.filter((p) => p.id !== deletingId));
    setDeletingId(null);
    setDeleteConfirmStep(1);
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
      await runBulkPreview();
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
    return <div className="text-center text-slate-600">Loading projects...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Admin</p>
            <h1 className="text-2xl font-bold leading-tight">All Projects</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "active"
                  ? "bg-emerald-500/20 border border-emerald-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">All Active</p>
              <p className="text-lg font-bold text-white">{totals.active}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "pending"
                  ? "bg-amber-500/20 border border-amber-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Pending</p>
              <p className="text-lg font-bold text-amber-200">{totals.pending}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("onsite")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "onsite"
                  ? "bg-emerald-500/20 border border-emerald-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">On Site</p>
              <p className="text-lg font-bold text-emerald-300">{totals.onsite}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "completed"
                  ? "bg-emerald-500/20 border border-emerald-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Completed</p>
              <p className="text-lg font-bold text-emerald-300">{totals.completed}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("cancelled")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "cancelled"
                  ? "bg-rose-500/20 border border-rose-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Cancelled</p>
              <p className="text-lg font-bold text-rose-200">{totals.cancelled}</p>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("archived")}
              className={`rounded-lg px-3 py-2 text-left transition ${
                statusFilter === "archived"
                  ? "bg-slate-500/20 border border-slate-400/50"
                  : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Archived</p>
              <p className="text-lg font-bold text-slate-300">{totals.archived}</p>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="relative grid gap-0.5">
            <label className="text-xs font-medium text-slate-600">Search projects</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. client, contractor, region"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 pr-8 text-sm"
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
          <div className="flex items-end justify-start md:justify-end">
            <button
              type="button"
              onClick={() => {
                setBulkCleanOpen(true);
                setBulkResult(null);
                setBulkError(null);
              }}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Bulk Clean
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No projects found.
        </div>
      ) : (
        <div className="space-y-3">
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
            setDeletingId(null);
            setDeleteConfirmStep(1);
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-9 w-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-700">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  {deleteConfirmStep === 1 ? "Delete Project Permanently?" : "Final Confirmation"}
                </h3>
                <p className="text-sm text-slate-600">
                  {deleteConfirmStep === 1
                    ? "Permanent delete is irreversible. If you only want to hide it from platform users, choose Archive instead."
                    : "This will permanently delete the project and associated records. This cannot be undone."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingId(null);
                  setDeleteConfirmStep(1);
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
                    onClick={() => setDeleteConfirmStep(2)}
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
                  Yes, Delete Permanently
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {bulkCleanOpen && (
        <ModalOverlay
          isOpen={bulkCleanOpen}
          onClose={() => {
            if (bulkLoading) return;
            setBulkCleanOpen(false);
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
                onClick={() => setBulkCleanOpen(false)}
                disabled={bulkLoading}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={runBulkPreview}
                disabled={bulkLoading}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {bulkLoading ? "Running..." : "Preview"}
              </button>
              <button
                type="button"
                onClick={runBulkExecute}
                disabled={bulkLoading || !bulkResult || bulkResult.totalMatched === 0}
                className={`rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  bulkAction === "permanent_delete"
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {bulkAction === "permanent_delete" ? "Execute Permanent Delete" : "Execute Archive"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
