"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { EditModal, FieldDefinition } from "@/components/edit-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProjectProgressBar } from "@/components/project-progress-bar";

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

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const totals = useMemo(() => {
    return {
      total: projects.length,
      approved: projects.filter((p) => p.status === "approved").length,
      pending: projects.filter((p) => p.status === "pending").length,
      rejected: projects.filter((p) => p.status === "rejected").length,
    };
  }, [projects]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects`);
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
    if (!editingProject) return;

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
    await fetchProjects();
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    const res = await fetch(`${API_BASE_URL}/projects/${deletingId}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error(await res.text());
    setProjects((prev) => prev.filter((p) => p.id !== deletingId));
    setDeletingId(null);
  };

  const filtered = projects.filter((p) => {
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
            { label: "Rejected", value: "rejected" },
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
            <h1 className="text-2xl font-bold leading-tight">Projects</h1>
            <p className="text-sm text-slate-200/90">{projects.length} total projects</p>
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
              <p className="text-[11px] uppercase tracking-wide text-slate-200">Rejected</p>
              <p className="text-lg font-bold text-rose-200">{totals.rejected}</p>
            </div>
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
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No projects found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => (
            <div
              key={project.id}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-3 text-white">
                <div className="space-y-1">
                  <div className="text-base font-bold">{project.projectName}</div>
                  <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wide">{project.region}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      project.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : project.status === "rejected"
                          ? "bg-rose-500/20 text-rose-200"
                          : "bg-amber-500/20 text-amber-100"
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
                    onClick={() => setEditingProject(project)}
                    className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 transition"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(project.id)}
                    className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
                  >
                    Delete
                  </button>
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
        isOpen={!!deletingId}
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        message="Are you sure you want to delete this project? This will also delete all associated email tokens and professional responses."
        tone="danger"
      />
    </div>
  );
}
