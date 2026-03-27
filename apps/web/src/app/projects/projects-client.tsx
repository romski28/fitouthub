"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { ModalOverlay } from "@/components/modal-overlay";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProjectForm, type ProjectFormData } from "@/components/project-form";
import { Project } from "@/lib/types";
import { BackToTop } from "@/components/back-to-top";
import { UpdatesButton } from "@/components/updates-button";
import { useAuth } from "@/context/auth-context";
import {
  NextStepAuthError,
  completeNextStep,
  fetchPrimaryNextStep,
  type NextStepAction,
} from "@/lib/next-steps";
import type { UpdatesSummary } from "@/lib/updates-cache";
import { fetchAssistPresenceByProject } from "@/lib/assist-requests";

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

type AssistStatus = "open" | "in_progress" | "closed";

type SummaryTone = 'slate' | 'emerald' | 'amber' | 'rose';

const clientActionTabMap: Record<string, string> = {
  INVITE_PROFESSIONALS: 'professionals',
  REVIEW_INCOMING_QUOTES: 'professionals',
  COMPARE_QUOTES: 'professionals',
  SELECT_PROFESSIONAL: 'professionals',
  REQUEST_SITE_VISIT: 'site-access',
  CONFIRM_SITE_VISIT: 'site-access',
  REVIEW_CONTRACT: 'contract',
  SIGN_CONTRACT: 'contract',
  DEPOSIT_ESCROW_FUNDS: 'overview',
  REVIEW_PROGRESS: 'schedule',
  APPROVE_MILESTONE: 'schedule',
  SCHEDULE_FINAL_INSPECTION: 'schedule',
  APPROVE_FINAL_WORK: 'schedule',
  REPORT_DEFECT: 'schedule',
};

function getClientShowMeHref(projectId: string, actionKey: string) {
  const tab = clientActionTabMap[actionKey] || 'overview';
  return `/projects/${projectId}?tab=${encodeURIComponent(tab)}`;
}

const assistStatusColors: Record<AssistStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  closed: "bg-slate-100 text-slate-800",
};

type ExtendedProject = Omit<Project, 'photos' | 'photoUrls'> & {
  photos: string[];
  photoUrls?: string[];
  sourceIds?: string[];
  tradesRequired?: string[];
  professionals?: Array<{
    id: string;
    status: string;
    createdAt?: string;
    respondedAt?: string;
    quoteReminderSentAt?: string;
    quoteExtendedUntil?: string;
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
  "withdrawn",
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

function mapProjectsToItems(projects: Project[]): ExtendedProject[] {
  return projects.map((p) => {
    const relationPhotos = Array.isArray((p as any).photos)
      ? (p as any).photos.map((ph: any) => ph?.url).filter(Boolean)
      : [];
    const legacyPhotoUrls = Array.isArray((p as any).photoUrls)
      ? (p as any).photoUrls.filter(Boolean)
      : [];
    const extracted = extractPhotoUrls((p as any).notes);
    const photos = relationPhotos.length > 0
      ? relationPhotos
      : (legacyPhotoUrls.length > 0 ? legacyPhotoUrls : extracted);
    const base: ExtendedProject = {
      ...(p as any),
      photos,
      professionals: ((p as any).professionals ?? []) as ExtendedProject['professionals'],
      sourceIds: [String((p as any).id)],
    };
    if (base.professionals) {
      base.professionals = dedupeProfessionals(base.professionals);
    }
    return base;
  });
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

type ProjectsClientProps = {
  projects: Project[];
  clientId?: string;
  initialShowCreateModal?: boolean;
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

function deriveProjectLocation(project: ExtendedProject) {
  const primary = (project as any).locationPrimary || undefined;
  const secondary = (project as any).locationSecondary || undefined;
  const tertiary = (project as any).locationTertiary || undefined;

  if (primary || secondary || tertiary) {
    return { primary, secondary, tertiary };
  }

  const regionParts = (project.region || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (regionParts.length === 0) return undefined;

  return {
    primary: regionParts[0],
    secondary: regionParts[1],
    tertiary: regionParts[2],
  };
}

function formatDate(date?: string, locale: string = 'en-GB'): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(locale === 'zh-HK' ? 'zh-HK' : 'en-GB', {
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

function isQuoteOverdueForProject(project: ExtendedProject): boolean {
  const professionals = project.professionals || [];
  if (professionals.length === 0) return false;

  const hasAnyQuote = professionals.some((pp) => {
    const status = (pp.status || '').toLowerCase();
    return Boolean(pp.quotedAt) || status === 'quoted' || status === 'awarded' || status === 'counter_requested';
  });
  if (hasAnyQuote) return false;

  const quoteWindowMs = (project as any).isEmergency
    ? 12 * 60 * 60 * 1000
    : 3 * 24 * 60 * 60 * 1000;

  return professionals.some((pp) => {
    const status = (pp.status || '').toLowerCase();
    if (['declined', 'rejected', 'withdrawn'].includes(status)) return false;
    if (pp.quotedAt) return false;
    if (!pp.createdAt) return false;
    const invitedAtMs = new Date(pp.createdAt).getTime();
    if (!Number.isFinite(invitedAtMs)) return false;
    // Use quoteExtendedUntil when a reminder has been sent
    const effectiveDeadline = pp.quoteExtendedUntil
      ? new Date(pp.quoteExtendedUntil).getTime()
      : invitedAtMs + quoteWindowMs;
    return Date.now() > effectiveDeadline;
  });
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const cls = statusColors[status] || "bg-slate-100 text-slate-800";
  const labels: Record<string, string> = {
    pending: t('stats.pending'),
    awarded: t('stats.awarded'),
    rejected: t('stats.rejected'),
    declined: t('declined'),
    withdrawn: t('status.withdrawn'),
    started: t('status.started'),
    completed: t('status.completed'),
    rated: t('status.rated'),
    quoted: t('quoted'),
    counter_requested: t('status.counterRequested'),
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${cls}`}>{labels[status] || status.replace('_', ' ')}</span>;
}

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
  const t = useTranslations('project.edit');
  const commonT = useTranslations('common');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialData: ProjectFormData = {
    projectName: project.projectName || "",
    clientName: project.clientName || "",
    region: project.region || "",
    budget: project.budget ?? "",
    notes: stripPhotoSection(project.notes),
    tradesRequired: project.tradesRequired || [],
    isEmergency: (project as any).isEmergency ?? false,
    endDate: (project as any).endDate || "",
    aiFrom: {
      assumptions: Array.isArray((project as any)?.aiIntake?.assumptions)
        ? (project as any).aiIntake.assumptions
        : [],
      risks: Array.isArray((project as any)?.aiIntake?.risks)
        ? (project as any).aiIntake.risks
        : [],
    },
    existingPhotos:
      Array.isArray((project as any).photos)
        ? (project as any).photos.map((p: any) =>
            typeof p === "string"
              ? { url: p }
              : { id: p.id || p.url, url: p.url, note: p.note },
          )
        : Array.isArray((project as any).photoUrls)
          ? (project as any).photoUrls.map((url: string) => ({ url }))
          : [],
    photoUrls: [],
    location: deriveProjectLocation(project),
    selectedService: undefined,
  };

  const handleSubmit = async (
    formData: ProjectFormData,
    pendingFiles: File[],
    removedPhotos: string[],
  ) => {
    setSaving(true);
    setError(null);
    try {
      // Delete removed photos from backend
      const existingPhotos = (formData.existingPhotos || []);
      const photoIdsToDelete = removedPhotos
        .map((removedId) => {
          const photo = existingPhotos.find((p) => p.id === removedId || p.url === removedId);
          return photo?.id;
        })
        .filter(Boolean);

      for (const photoId of photoIdsToDelete) {
        try {
          await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${project.id}/photos/${photoId}`, {
            method: "DELETE",
          });
        } catch (deleteErr) {
          console.error(`Failed to delete photo ${photoId}:`, deleteErr);
          // Continue - don't fail entire save if individual photo delete fails
        }
      }

      // Upload new files
      let uploadedUrls: string[] = [];
      if (pendingFiles.length > 0) {
        const formDataUpload = new FormData();
        pendingFiles.forEach((f) => formDataUpload.append("files", f));
        const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
          method: "POST",
          body: formDataUpload,
        });
        if (!uploadRes.ok) {
          const message = await uploadRes.text();
          throw new Error(message || "Failed to upload files");
        }
        const uploadData = (await uploadRes.json()) as { urls: string[] };
        uploadedUrls = uploadData.urls || [];
      }

      const existing = (formData.existingPhotos || []).filter(
        (p) => !removedPhotos.includes(p.id || p.url),
      );
      const mergedPhotos = [...existing.map((p) => p.url), ...uploadedUrls];
      const uniquePhotos = Array.from(new Set(mergedPhotos)).map((url) => ({ url: toAbsolute(url) }));

      const payload = {
        projectName: formData.projectName,
        clientName: formData.clientName,
        contractorName: project.contractorName,
        region: formData.region,
        budget: formData.budget === "" ? undefined : Number(formData.budget),
        status: project.status,
        notes: stripPhotoSection(formData.notes),
        tradesRequired: formData.tradesRequired || [],
        isEmergency: !!formData.isEmergency,
        endDate: formData.endDate || undefined,
        photos: uniquePhotos,
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
      const updatedPhotos = Array.isArray((updated as any).photos)
        ? (updated as any).photos.map((p: any) => p?.url).filter(Boolean)
        : Array.isArray((updated as any).photoUrls)
          ? (updated as any).photoUrls.filter(Boolean)
          : extractPhotoUrls((updated as any).notes);
      onSave({ ...updated, photos: updatedPhotos });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('updateFailed');
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
      const message = err instanceof Error ? err.message : t('deleteFailed');
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
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-600">{t('tagline')}</p>
            <h2 className="text-2xl font-bold text-slate-900">{project.projectName}</h2>
            <p className="text-sm text-slate-600">{t('subtitle')}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}

        <ProjectForm
          mode="edit"
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isSubmitting={saving}
          error={error}
          submitLabel={t('saveChanges')}
          showBudget
          showService
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={saving || deleting}
            className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
          >
            {deleting ? t('deleting') : t('delete')}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title={t('deleteTitle')}
        message={t('deleteMessage')}
        confirmLabel={deleting ? t('deleting') : t('delete')}
        cancelLabel={commonT('cancel')}
        tone="danger"
      />
    </ModalOverlay>
  );
}

export function ProjectsClient({ projects, clientId, initialShowCreateModal = false }: ProjectsClientProps) {
  const t = useTranslations('project.list');
  const locale = useLocale();
  const { isLoggedIn, accessToken, user } = useAuth();
  const nextStepCacheScope = `client:${user?.id || 'anonymous'}`;
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [disableUnreadFetch, setDisableUnreadFetch] = useState(false);
  const [assistMap, setAssistMap] = useState<Record<string, { hasAssist: boolean; status?: AssistStatus }>>({});
  const openAiCreateFlow = () => {
    router.push('/?focusPrompt=1#project-prompt');
  };

  useEffect(() => {
    if (initialShowCreateModal) {
      openAiCreateFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShowCreateModal]);
  const [items, setItems] = useState<ExtendedProject[]>(() => mapProjectsToItems(projects));
  const [editing, setEditing] = useState<ExtendedProject | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [nextStepMap, setNextStepMap] = useState<Record<string, NextStepAction | null>>({});
  const [nextStepLoadingMap, setNextStepLoadingMap] = useState<Record<string, boolean>>({});
  const [nextStepsLoading, setNextStepsLoading] = useState(false);
  const [updatesSummary, setUpdatesSummary] = useState<UpdatesSummary | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const itemProjectIds = useMemo(() => items.map((project) => project.id), [items]);
  const itemProjectIdsKey = useMemo(() => itemProjectIds.join('|'), [itemProjectIds]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    setItems(mapProjectsToItems(projects));
  }, [projects]);

  const filteredByStatus = useMemo(() => {
    let result = items;
    
    // Filter by status if not 'all'
    if (filterStatus !== 'all') {
      if (filterStatus === 'withdrawn') {
        result = result.filter((p) => p.status === 'withdrawn' || p.status === 'rejected');
      } else {
        result = result.filter((p) => p.status === filterStatus);
      }
    }
    
    return result;
  }, [items, filterStatus]);

  const dashboardProjects = useMemo(() => {
    return items
      .filter((project) => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'withdrawn') {
          return project.status === 'withdrawn' || project.status === 'rejected';
        }
        return project.status === filterStatus;
      })
      .sort((a, b) => {
        const aUpdated = new Date(a.updatedAt || 0).getTime();
        const bUpdated = new Date(b.updatedAt || 0).getTime();
        return bUpdated - aUpdated;
      });
  }, [items, filterStatus]);

  const activityProjectIds = useMemo(() => {
    const ids = new Set<string>();
    if (!updatesSummary) return ids;
    updatesSummary.unreadMessages.forEach((group) => {
      if (group.unreadCount > 0) ids.add(group.projectId);
    });
    updatesSummary.financialActions.forEach((action) => ids.add(action.projectId));
    return ids;
  }, [updatesSummary]);

  const totals = useMemo(() => {
    return {
      total: items.length,
      approved: items.filter((p) => p.status === "awarded").length,
      pending: items.filter((p) => p.status === "pending").length,
      withdrawn: items.filter((p) => p.status === "rejected" || p.status === "withdrawn").length,
    };
  }, [items]);

  useEffect(() => {
    if (!hydrated || !isLoggedIn || !accessToken || disableUnreadFetch) return;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    fetch(`${API_BASE_URL}/client/projects/unread-counts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then((r) => {
        if (r?.status === 401) {
          setDisableUnreadFetch(true);
          return null;
        }
        return r?.ok ? r.json() : null;
      })
      .then((data) => {
        if (data?.counts) setUnreadMap(data.counts);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeoutId));
  }, [hydrated, isLoggedIn, accessToken, disableUnreadFetch]);

  // Fetch assistance presence per project
  useEffect(() => {
    if (!isLoggedIn || !accessToken || itemProjectIds.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const entries = await Promise.all(
          itemProjectIds.map(async (projectId) => {
            try {
              const assist = await fetchAssistPresenceByProject(projectId, accessToken, {
                cacheScope: nextStepCacheScope,
              });
              const hasAssist = !!assist.hasAssist;
              const status = (assist.status as AssistStatus | undefined) || undefined;
              return [projectId, hasAssist, status] as const;
            } catch {
              return [projectId, false, undefined] as const;
            }
          })
        );
        if (!cancelled) {
          const next: Record<string, { hasAssist: boolean; status?: AssistStatus }> = {};
          entries.forEach(([id, has, status]) => {
            next[id] = { hasAssist: has, status };
          });
          setAssistMap(next);
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [isLoggedIn, accessToken, itemProjectIdsKey]);

  // Fetch primary next-step action per project (client view)
  useEffect(() => {
    if (!isLoggedIn || !accessToken || itemProjectIds.length === 0) return;

    let cancelled = false;

    const loadNextSteps = async () => {
      setNextStepsLoading(true);
      const fetches = itemProjectIds.map((projectId) =>
        fetchPrimaryNextStep(projectId, accessToken, { cacheScope: nextStepCacheScope })
          .then((action) => ({ id: projectId, action }))
          .catch(() => ({ id: projectId, action: null })),
      );

      const resolved = await Promise.allSettled(fetches);
      if (cancelled) return;

      const batch: Record<string, NextStepAction | null> = {};
      resolved.forEach((result) => {
        if (result.status === 'fulfilled') {
          batch[result.value.id] = result.value.action;
        }
      });
      setNextStepMap((prev) => ({ ...prev, ...batch }));
      setNextStepsLoading(false);
    };

    loadNextSteps();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, accessToken, itemProjectIdsKey, nextStepCacheScope]);

  const handleCompleteNextStep = async (projectId: string) => {
    if (!accessToken) return;
    const action = nextStepMap[projectId];
    if (!action) return;

    setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: true }));
    try {
      const ok = await completeNextStep(projectId, action.actionKey, accessToken, nextStepCacheScope);
      if (!ok) return;

      const refreshed = await fetchPrimaryNextStep(projectId, accessToken, {
        cacheScope: nextStepCacheScope,
        forceRefresh: true,
      });
      setNextStepMap((prev) => ({ ...prev, [projectId]: refreshed }));
    } finally {
      setNextStepLoadingMap((prev) => ({ ...prev, [projectId]: false }));
    }
  };

  const handleSave = (updated: ExtendedProject) => {
    setItems((prev) => prev.map((p) => (p.id === updated.id ? { ...updated } : p)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setEditing((prev) => (prev && prev.id === id ? null : prev));
  };

  return (
    <div className="space-y-5">
      {/* Recent Activity (secondary) */}
      <div id="recent-activity" className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Activity</p>
        <div className="flex justify-center md:justify-start">
          <UpdatesButton onSummaryChange={setUpdatesSummary} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-800 p-5 text-white shadow-sm">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Action Required</p>
            <h1 className="text-2xl font-bold leading-tight">
              My projects
              {nextStepsLoading && (
                <span className="ml-3 inline-flex items-center gap-1.5 text-xs font-normal text-slate-300">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                  Gathering action items&hellip;
                </span>
              )}
            </h1>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={openAiCreateFlow}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {t('createNew')}
            </button>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryCard label={t('total')} value={totals.total} tone="slate" filterStatus="all" currentFilter={filterStatus} onClick={() => setFilterStatus('all')} />
              <SummaryCard label={t('stats.awarded')} value={totals.approved} tone="emerald" filterStatus="awarded" currentFilter={filterStatus} onClick={() => setFilterStatus('awarded')} />
              <SummaryCard label={t('stats.pending')} value={totals.pending} tone="amber" filterStatus="pending" currentFilter={filterStatus} onClick={() => setFilterStatus('pending')} />
              <SummaryCard label="WITHDRAWN" value={totals.withdrawn} tone="rose" filterStatus="withdrawn" currentFilter={filterStatus} onClick={() => setFilterStatus('withdrawn')} />
            </div>
          </div>
        </div>

        {dashboardProjects.length > 0 && (
          <div className="space-y-2">
            {dashboardProjects.map((project) => {
              const action = nextStepMap[project.id];
              const quotedCount = project.professionals?.filter(p => p.status === 'quoted').length || 0;
              const assistInfo = assistMap[project.id];
              const unreadCount = (project.sourceIds ?? [project.id]).reduce((sum, id) => sum + (unreadMap[id] || 0), 0);
              const quoteOverdue = isQuoteOverdueForProject(project);
              const actionHref = action ? getClientShowMeHref(project.id, action.actionKey) : `/projects/${project.id}`;
              return (
                <div key={`dash-${project.id}`} className={`relative rounded-lg px-4 py-3 transition ${
                  quoteOverdue
                    ? 'border border-rose-400/60 bg-rose-500/15 hover:bg-rose-500/20'
                    : 'bg-white/10 hover:bg-white/15'
                }`}>
                  {unreadCount > 0 && (
                    <span className="absolute -right-2 -top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-red-700 px-2 text-xs font-bold text-white shadow-md" title={t('unreadMessages', { count: unreadCount })}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                  <div className="grid gap-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <p className="truncate text-sm font-bold text-white">{project.projectName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs md:justify-end">
                        <StatusBadge status={project.status} t={t} />
                        {quoteOverdue && (
                          <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">
                            Quote overdue blocker
                          </span>
                        )}
                        <img
                          src={assistInfo?.hasAssist ? '/FOHAssistYes.png' : '/FOHAssistNo.png'}
                          alt={assistInfo?.hasAssist ? t('assistRequestedAlt') : t('noAssistAlt')}
                          title={assistInfo?.hasAssist ? t('assistRequestedTitle') : t('noAssistTitle')}
                          className={`h-6 w-6 object-contain ${assistInfo?.hasAssist ? '' : 'opacity-70'}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div className="col-span-2 md:col-span-1">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <span>{project.region}</span>
                          {quotedCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-300 font-medium">{quotedCount} quote{quotedCount !== 1 ? 's' : ''}</span>
                            </>
                          )}
                        </div>
                        {quoteOverdue ? (
                          <p className="mt-2 text-xs text-rose-200">
                            No quote was submitted within the allowed window. Re-invite professionals or request assistance.
                          </p>
                        ) : action?.description ? <p className="mt-2 text-xs text-slate-300">{action.description}</p> : null}
                      </div>

                      <div className="flex items-center gap-2 md:justify-end">
                        {activityProjectIds.has(project.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(
                                  new CustomEvent('fitouthub:open-updates', { detail: { projectId: project.id } }),
                                );
                              }
                            }}
                            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 transition whitespace-nowrap"
                          >
                            View activity
                          </button>
                        )}
                        {nextStepsLoading && !nextStepMap[project.id] ? (
                          <div className="animate-pulse rounded-lg bg-white/20 h-9 w-28" />
                        ) : (
                          <Link
                            href={actionHref}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
                          >
                            {action?.actionLabel || 'Open project'}
                          </Link>
                        )}
                        {project.status !== 'withdrawn' && (
                          <button
                            type="button"
                            onClick={() => setEditing(project)}
                            className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 transition whitespace-nowrap"
                          >
                            {t('edit')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dashboardProjects.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-3">
            <p className="text-base font-semibold text-white">No immediate actions.</p>
            <p className="text-sm text-slate-300">Check Recent Activity for updates.</p>
            <button
              onClick={openAiCreateFlow}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
            >
              {t('startProject')}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <EditProjectModal
          project={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : null}

      <BackToTop />
    </div>
  );
}

function SummaryCard({ 
  label, 
  value, 
  tone, 
  filterStatus, 
  currentFilter, 
  onClick 
}: { 
  label: string; 
  value: number; 
  tone: SummaryTone; 
  filterStatus: string;
  currentFilter: string;
  onClick: () => void;
}) {
  const toneMap: Record<SummaryTone, { valueColor: string; activeRing: string }> = {
    slate: { valueColor: 'text-white', activeRing: 'ring-white' },
    amber: { valueColor: 'text-amber-200', activeRing: 'ring-amber-300' },
    emerald: { valueColor: 'text-emerald-300', activeRing: 'ring-emerald-300' },
    rose: { valueColor: 'text-rose-200', activeRing: 'ring-rose-300' },
  };

  const { valueColor, activeRing } = toneMap[tone];
  const isActive = currentFilter === filterStatus;

  return (
    <button
      onClick={onClick}
      className={`rounded-lg bg-white/10 px-3 py-2 text-left transition-all hover:bg-white/20 ${
        isActive ? `ring-2 ${activeRing} bg-white/20` : ''
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-200">{label}</p>
      <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
    </button>
  );
}
