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

const toAbsolute = (url: string) => {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
};

export function ProjectShareModal({ isOpen, onClose, professionals, projectId, initialData }: ProjectShareModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

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
    let photoUrls = uploadedUrls;
    if (formData.files && formData.files.length > 0 && uploadedUrls.length === 0) {
      photoUrls = await uploadFiles(formData.files);
      setUploadedUrls(photoUrls);
    }
    return photoUrls;
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
        notes: `${data.notes?.trim() || ''}${normalizedPhotos.length > 0 ? `\nPhotos: ${normalizedPhotos.join(", ")}` : ""}`,
        status: "pending" as const,
        userId: user?.id,
        professionalIds: invitePros ? professionals.map((p) => p.id) : [],
      },
      defaultTitle,
    };
  };

  const createProject = async (formData: ProjectFormData, invitePros: boolean) => {
    const photoUrls = await uploadPendingFiles(formData);
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

  const handleFormSubmit = async (formData: ProjectFormData) => {
    if (professionals.length === 0 && !projectId) return;

    setError(null);
    setSubmitting(true);

    // If inviting to an existing project, bypass project creation
    if (projectId) {
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
      return;
    }

    try {
      const { project } = await createProject(formData, true);
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

  const handleAssistRequest = async (formData: ProjectFormData) => {
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

      const { project, defaultTitle } = await createProject(formData, false);
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

  if (!isOpen) return null;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase font-semibold tracking-[0.12em] text-emerald-600">Share your project</p>
            <h2 className="text-2xl font-bold text-slate-900">Ask up to {professionals.length} professionals</h2>
            <p className="text-sm text-slate-600 mt-1">
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
    </ModalOverlay>
  );
}
