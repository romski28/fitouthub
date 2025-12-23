"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { ModalOverlay } from "@/components/modal-overlay";
import { ConfirmModal } from "@/components/confirm-modal";
import FileUploader from "@/components/file-uploader";
import { Project } from "@/lib/types";
import { BackToTop } from "@/components/back-to-top";
import { useAuth } from "@/context/auth-context";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  quoted: "bg-blue-100 text-blue-800",
  awarded: "bg-emerald-100 text-emerald-800",
  declined: "bg-slate-100 text-slate-800",
  counter_requested: "bg-purple-100 text-purple-800",
};

type ExtendedProject = Project & { 
  photos: string[]; 
  sourceIds?: string[];
  professionals?: Array<{
    id: string;
    status: string;
    quoteAmount?: string | number;
    quoteNotes?: string;
    quotedAt?: string;
    professional: {
      id: string;
      email: string;
      fullName?: string;
      businessName?: string;
      phone?: string;
    };
  }>;
};

// Status precedence for consolidating duplicate professional entries
const STATUS_ORDER = [
  "awarded",
  "quoted",
  "accepted",
  "counter_requested",
  "pending",
  "declined",
];

function betterStatus(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const ia = STATUS_ORDER.indexOf(a);
  const ib = STATUS_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a;
  if (ia === -1) return b;
  if (ib === -1) return a;
  return ia <= ib ? a : b; // lower index is higher precedence
}

function dedupeProfessionals(list: NonNullable<ExtendedProject["professionals"]>): NonNullable<ExtendedProject["professionals"]> {
  const map = new Map<string, NonNullable<ExtendedProject["professionals"]>[number]>();
  for (const entry of list) {
    const key = entry.professional?.id || entry.professional?.email || entry.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...entry });
    } else {
      const merged = { ...existing };
      merged.status = betterStatus(existing.status, entry.status) || entry.status || existing.status;
      if (merged.quoteAmount == null && entry.quoteAmount != null) merged.quoteAmount = entry.quoteAmount;
      if (!merged.quoteNotes && entry.quoteNotes) merged.quoteNotes = entry.quoteNotes;
      if (!merged.quotedAt && entry.quotedAt) merged.quotedAt = entry.quotedAt;
      map.set(key, merged);
    }
  }
  return Array.from(map.values());
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type ProjectsClientProps = {
  projects: Project[];
  clientId?: string;
};

function extractPhotoUrls(notes?: string): string[] {
  if (!notes) return [];
  const matches = notes.match(/(https?:\/\/[^\s,;)]+|\/api?\/uploads\/[^\s,;)]+)/gi) || [];
  return matches
    .filter((url) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return lower.includes("/uploads/") || 
             lower.endsWith(".jpg") || 
             lower.endsWith(".jpeg") || 
             lower.endsWith(".png") || 
             lower.endsWith(".webp") ||
             lower.endsWith(".gif");
    })
    .map((url) => url.trim());
}

function toAbsolute(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  const base = API_BASE_URL.replace(/\/$/, "");
  
  if (trimmed.startsWith("http://localhost:3001")) {
    return trimmed.replace("http://localhost:3001", base);
  }
  
  if (trimmed.startsWith("https://localhost:3001")) {
    return trimmed.replace("https://localhost:3001", base);
  }
  
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
}

function stripPhotoSection(notes?: string): string {
  if (!notes) return "";
  return notes
    .split(/\r?\n/)
    .map((line) => (line.trim().toLowerCase().startsWith("photos:") ? "" : line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

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

function StatusBadge({ status }: { status: string }) {
  const cls = statusColors[status] || "bg-slate-100 text-slate-800";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{status.replace('_', ' ')}</span>;
}

type EditState = {
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: string | number;
  status: "pending" | "approved" | "rejected";
  notes?: string;
};

function EditProjectModal({
  project,
  onClose,
  onSave,
  onDelete,
}: {
  project: ExtendedProject;
  onClose: () => void;
  onSave: (updated: ExtendedProject) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<EditState>({
    projectName: project.projectName,
    clientName: project.clientName,
    contractorName: project.contractorName,
    region: project.region,
    budget: project.budget,
    status: project.status,
    notes: stripPhotoSection(project.notes),
  });
  const [photos, setPhotos] = useState<string[]>(project.photos || []);
  const [lightboxUrl, setLightboxUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: keyof EditState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        budget: form.budget === "" ? undefined : Number(form.budget),
        notes: (() => {
          const base = stripPhotoSection(form.notes);
          if (photos.length === 0) return base;
          const absolutePhotos = photos.map(toAbsolute);
          return `${base ? `${base}\n` : ""}Photos: ${absolutePhotos.join(", ")}`;
        })(),
      };
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Failed to update project");
      }
      const updated: Project = await res.json();
      onSave({ ...updated, photos: extractPhotoUrls(updated.notes) });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update project";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Failed to delete project");
      }
      onDelete(project.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete project";
      setError(message);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <ModalOverlay isOpen onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">Edit project</p>
            <h2 className="text-2xl font-bold text-slate-900">{project.projectName}</h2>
            <p className="text-sm text-slate-600">Update project details and notes.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Project name</label>
            <input
              value={form.projectName}
              onChange={(e) => handleChange("projectName", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Client</label>
            <input
              value={form.clientName}
              onChange={(e) => handleChange("clientName", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Contractor</label>
            <input
              value={form.contractorName || ""}
              onChange={(e) => handleChange("contractorName", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Region</label>
            <input
              value={form.region}
              onChange={(e) => handleChange("region", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Budget (HKD)</label>
            <input
              type="number"
              value={form.budget ?? ""}
              onChange={(e) => handleChange("budget", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Status</label>
            <select
              value={form.status}
              onChange={(e) => handleChange("status", e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Notes</label>
          <textarea
            value={form.notes || ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Add details, links, or photo URLs."
          />
        </div>

        {photos.length > 0 ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Photos</label>
            <div className="flex flex-wrap gap-2">
              {photos.map((url) => (
                <div
                  key={url}
                  className="relative h-20 w-24 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                >
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotos((prev) => prev.filter((p) => p !== url));
                    }}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => setLightboxUrl(toAbsolute(url))}
                  >
                    <img src={toAbsolute(url)} alt="Project photo" className="h-full w-full object-cover" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">Add photos</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onUpload={async (files) => {
              setUploading(true);
              try {
                const formData = new FormData();
                files.forEach((f) => formData.append("files", f));
                const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
                  method: "POST",
                  body: formData,
                });
                if (!res.ok) {
                  const message = await res.text();
                  throw new Error(message || "Upload failed");
                }
                const data = (await res.json()) as { urls: string[] };
                setPhotos((prev) => Array.from(new Set([...prev, ...data.urls])));
                return data.urls;
              } finally {
                setUploading(false);
              }
            }}
            className="mt-1"
          />
          {uploading ? <p className="text-xs text-slate-500">Uploading...</p> : null}
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={saving || deleting}
            className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || deleting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete project?"
        message="This will remove the project and its uploaded files. This cannot be undone."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        tone="danger"
      />
      {lightboxUrl ? <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl("")} /> : null}
    </ModalOverlay>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <img src={url} alt="Project photo" className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" />
    </div>
  );
}

export function ProjectsClient({ projects, clientId }: ProjectsClientProps) {
  const { isLoggedIn, accessToken } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<ExtendedProject[]>(() => {
    // Group by a canonical composite key to merge duplicate records of the same logical project
    const byKey = new Map<string, ExtendedProject & { sourceIds: string[] }>();
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    for (const p of projects) {
      const base: ExtendedProject = {
        ...(p as any),
        photos: extractPhotoUrls((p as any).notes),
        professionals: ((p as any).professionals ?? []) as ExtendedProject['professionals'],
      };
      const key = `${norm((p as any).clientName)}|${norm((p as any).projectName)}|${norm((p as any).region)}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          ...base,
          sourceIds: [String((p as any).id)],
          professionals: base.professionals ? dedupeProfessionals(base.professionals) : base.professionals,
        });
      } else {
        const mergedPros = [
          ...(existing.professionals ?? []),
          ...(base.professionals ?? []),
        ];
        existing.professionals = dedupeProfessionals(mergedPros);
        existing.photos = Array.from(new Set([...(existing.photos ?? []), ...(base.photos ?? [])]));
        existing.sourceIds = Array.from(new Set([...(existing.sourceIds ?? []), String((p as any).id)]));
        // Choose the most recently updated record as the primary id/details
        if (((base as any).updatedAt || '') > ((existing as any).updatedAt || '')) {
          existing.id = (base as any).id;
          (existing as any).updatedAt = (base as any).updatedAt;
          existing.status = base.status;
          existing.contractorName = base.contractorName;
          existing.budget = base.budget;
          existing.notes = base.notes;
        }
      }
    }
    return Array.from(byKey.values());
  });
  const [editing, setEditing] = useState<ExtendedProject | null>(null);
  const [lightbox, setLightbox] = useState<string>("");
  const [search, setSearch] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  useEffect(() => {
    setHydrated(true);
  }, []);

  const subtitle = useMemo(
    () => (clientId ? `Showing projects for client ${clientId}` : "Live data from the Nest API at /projects."),
    [clientId],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const needle = search.toLowerCase();
    return items.filter((p) => {
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
  }, [items, search]);

  const totals = useMemo(() => {
    return {
      total: items.length,
      approved: items.filter((p) => p.status === "approved").length,
      pending: items.filter((p) => p.status === "pending").length,
      rejected: items.filter((p) => p.status === "rejected").length,
    };
  }, [items]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !accessToken) return;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    fetch(`${API_BASE_URL}/client/projects/unread-counts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.unreadCounts) setUnreadMap(data.unreadCounts);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeoutId));
  }, [hydrated, isLoggedIn, accessToken]);

  const handleSave = (updated: ExtendedProject) => {
    setItems((prev) => prev.map((p) => (p.id === updated.id ? { ...updated } : p)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setEditing((prev) => (prev && prev.id === id ? null : prev));
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Projects</p>
            <h1 className="text-2xl font-bold leading-tight">Projects overview</h1>
            <p className="text-sm text-slate-200/90">{subtitle}</p>
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
                placeholder="e.g. client name, region, contractor"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 pr-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
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
          No projects yet. Create one via the API (POST /projects) and refresh.
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
                  {((project.sourceIds ?? [project.id]).reduce((sum, id) => sum + (unreadMap[id] || 0), 0)) > 0 && (
                    <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs font-semibold text-white bg-red-600/70">
                      {(project.sourceIds ?? [project.id]).reduce((sum, id) => sum + (unreadMap[id] || 0), 0)} new
                    </span>
                  )}
                  <StatusBadge status={project.status} />
                  <button
                    type="button"
                    onClick={() => setEditing(project)}
                    className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10 transition"
                  >
                    Edit
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3">
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
                    <span className="text-slate-600">{project.budget ? `HKD ${project.budget}` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    <span className="font-semibold">Status:</span>
                    <span className="text-slate-600 capitalize">{project.status}</span>
                  </div>
                </div>

                {/* Professionals Section - NEW */}
                {project.professionals && project.professionals.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-800">Professionals Invited ({project.professionals.length})</p>
                      <div className="flex gap-1.5 text-[10px] font-medium">
                        <span className="text-blue-600">
                          {project.professionals.filter(p => p.status === 'quoted').length} Quoted
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-amber-600">
                          {project.professionals.filter(p => p.status === 'pending').length} Pending
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">
                          {project.professionals.filter(p => p.status === 'declined').length} Declined
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {project.professionals.map((pp) => (
                        <div key={pp.id} className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 border border-slate-100 hover:border-slate-300 transition">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                              {(pp.professional.fullName || pp.professional.businessName || pp.professional.email)[0].toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-slate-700 truncate">
                              {pp.professional.fullName || pp.professional.businessName || pp.professional.email}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {pp.quoteAmount && (
                              <span className="text-xs font-semibold text-blue-700">
                                HK${typeof pp.quoteAmount === 'number' ? pp.quoteAmount.toLocaleString() : pp.quoteAmount}
                              </span>
                            )}
                            <StatusBadge status={pp.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {project.notes ? (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 border border-slate-100">
                    <p className="font-semibold text-slate-800 mb-1">Notes</p>
                    <p className="leading-relaxed line-clamp-3">{project.notes}</p>
                  </div>
                ) : null}

                {project.photos.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {project.photos.map((url) => (
                      <button
                        key={url}
                        type="button"
                        className="relative h-20 w-24 overflow-hidden rounded-md border border-slate-200 bg-slate-50 hover:shadow-sm"
                        onClick={() => setLightbox(toAbsolute(url))}
                      >
                        <img src={toAbsolute(url)} alt="Project photo" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>ID: {project.id}</span>
                  <div className="flex items-center gap-3">
                    <span>Updated: {formatDate(project.updatedAt)}</span>
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <EditProjectModal
          project={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}

      {lightbox ? <Lightbox url={lightbox} onClose={() => setLightbox("")} /> : null}
      
      <BackToTop />
    </div>
  );
}
