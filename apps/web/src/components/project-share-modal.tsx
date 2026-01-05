"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalOverlay } from "./modal-overlay";
import { API_BASE_URL } from "@/config/api";
import { Professional } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { ProjectForm, type ProjectFormData } from "./project-form";

interface ProjectShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  professionals: Professional[];
  projectId?: string;
  initialData?: Partial<ProjectFormData>;
}

export function ProjectShareModal({ isOpen, onClose, professionals, projectId, initialData }: ProjectShareModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>(initialData?.photoUrls || []);

  const toAbsolute = (url: string) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    const base = API_BASE_URL.replace(/\/$/, "");
    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${base}${normalized}`;
  };

  const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { urls: string[] };
    return data.urls;
  };

  const uploadPendingFiles = async (formData: ProjectFormData) => {
    return uploadedUrls;
  };

  const buildPayload = (data: ProjectFormData, normalizedPhotos: string[], invitePros: boolean) => {
    const locationLabel = [data.location?.primary, data.location?.secondary, data.location?.tertiary]
      .filter(Boolean)
      .join(", ");
    const clientName = user ? `${user.firstName} ${user.surname}`.trim() : "Client";

    const defaultTitle = (() => {
      const mainTrade = data.tradesRequired?.[0];
      const locText = locationLabel;
      if (mainTrade && locText) return `${mainTrade} in ${locText}`;
      if (mainTrade) return mainTrade;
      if (locText) return `Service Request in ${locText}`;
      return "Service Request";
    })();

    return {
      payload: {
        projectName: (data.projectName?.trim() || defaultTitle),
        tradesRequired: data.tradesRequired.length > 0 ? data.tradesRequired : [],
        clientName,
        contractorName: "",
        region: locationLabel || "Hong Kong",
        notes: data.notes?.trim() || "",
        photos: normalizedPhotos.length > 0 ? normalizedPhotos.map((url) => ({ url })) : undefined,
        status: "pending" as const,
        userId: user?.id,
        professionalIds: invitePros ? professionals.map((p) => p.id) : [],
      },
      defaultTitle,
    };
  };

  const createProject = async (formData: ProjectFormData, pendingFiles: File[], invitePros: boolean) => {
    let photoUrls = uploadedUrls;
    // Upload pending files if any
    if (pendingFiles.length > 0) {
      try {
        photoUrls = await uploadFiles(pendingFiles);
        setUploadedUrls(photoUrls);
      } catch (err) {
        throw err;
      }
    } else {
      photoUrls = await uploadPendingFiles(formData);
    }
    const normalizedPhotos = photoUrls.map(toAbsolute);
    const { payload, defaultTitle } = buildPayload(formData, normalizedPhotos, invitePros);

    const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to create project");
    }

    const created = await response.json();
    return { project: created, defaultTitle };
  };

  const requestAssist = async (project: { id: string; projectName?: string }, formData: ProjectFormData, defaultTitle: string) => {
    const body = {
      projectId: project.id,
      userId: user?.id,
      notes: formData.notes,
      clientName: user ? `${user.firstName} ${user.surname}`.trim() : undefined,
      projectName: project.projectName || defaultTitle,
    };

    const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/assist-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "Failed to request assistance");
    }
  };

  const handleFormSubmit = async (formData: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => {
    if (professionals.length === 0 && !projectId) return;

    setError(null);
    setSubmitting(true);
    try {
      const { project } = await createProject(formData, pendingFiles, true);
      onClose();
      if (user?.id) {
        router.push(`/projects?clientId=${encodeURIComponent(user.id)}`);
      } else {
        router.push("/projects");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssistRequest = async (formData: ProjectFormData, pendingFiles: File[], removedPhotos: string[]) => {
    setError(null);
    setSubmitting(true);

    try {
      if (projectId) {
        await requestAssist({ id: projectId }, formData, formData.projectName || 'Project');
        if (professionals.length > 0) {
          await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/select`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ professionalIds: professionals.map((p) => p.id) }),
          });
        }
        onClose();
        router.push(`/projects/${encodeURIComponent(projectId)}`);
        return;
      }

      const { project, defaultTitle } = await createProject(formData, pendingFiles, false);
      await requestAssist(project, formData, defaultTitle);
      if (professionals.length > 0) {
        await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${encodeURIComponent(project.id)}/select`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ professionalIds: professionals.map((p) => p.id) }),
        });
      }
      onClose();
      router.push(`/projects/${encodeURIComponent(project.id)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to request assistance";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareExisting = async () => {
    if (!projectId || professionals.length === 0) return;

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalIds: professionals.map((p) => p.id) }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to invite professionals");
      }

      onClose();
      router.push(`/projects/${encodeURIComponent(projectId)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to invite professionals";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      {projectId ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">Share this project?</h2>
            <p className="text-sm text-slate-700">
              Share {(initialData?.projectName || "this project").trim()} with the selected professionals?
            </p>
            {professionals.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {professionals.map((pro) => (
                  <li key={pro.id} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                    <span>{pro.fullName || pro.email || "Professional"}</span>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShareExisting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Sharing..." : "Yes, share"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Enter your project details</h2>
              <p className="text-xs uppercase font-semibold tracking-[0.12em] text-emerald-600 mt-1">Share your project with up to {professionals.length} professionals</p>
              <p className="text-sm text-slate-600 mt-2">
                We&apos;ll notify the selected professionals. You can upload photos to help them understand.
              </p>
            </div>
          </div>

          <ProjectForm
            mode="create"
            isQuickRequest={true}
            professionals={professionals}
            initialData={initialData}
            onSubmit={handleFormSubmit}
            onAssistRequest={handleAssistRequest}
            onCancel={onClose}
            isSubmitting={submitting}
            error={error}
            submitLabel="Share project"
            showBudget={false}
            showService={!projectId}
          />
        </div>
      )}
    </ModalOverlay>
  );
}
