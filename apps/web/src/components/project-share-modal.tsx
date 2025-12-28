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
}

const toAbsolute = (url: string) => {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
};

export function ProjectShareModal({ isOpen, onClose, professionals, projectId }: ProjectShareModalProps) {
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

  const handleFormSubmit = async (formData: ProjectFormData) => {
    if (professionals.length === 0) return;

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
        // Return to existing project's detail page
        router.push(`/projects/${encodeURIComponent(projectId)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to invite professionals";
        setError(message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Otherwise, create a new project and invite selected professionals
    let photoUrls = uploadedUrls;
    if (formData.files && formData.files.length > 0 && uploadedUrls.length === 0) {
      try {
        photoUrls = await uploadFiles(formData.files);
        setUploadedUrls(photoUrls);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        setSubmitting(false);
        return;
      }
    }

    const locationLabel = [formData.location?.primary, formData.location?.secondary, formData.location?.tertiary]
      .filter(Boolean)
      .join(", ");
    const clientName = user ? `${user.firstName} ${user.surname}`.trim() : "Client";
    const normalizedPhotos = photoUrls.map(toAbsolute);

    const payload = {
      projectName: formData.notes?.trim() || "Service Request",
      tradesRequired: formData.selectedService ? [formData.selectedService] : [],
      clientName,
      contractorName: "",
      region: locationLabel || "Hong Kong",
      notes: `${formData.notes?.trim() || ''}${normalizedPhotos.length > 0 ? `\nPhotos: ${normalizedPhotos.join(", ")}` : ""}`,
      status: "pending" as const,
      userId: user?.id,
      professionalIds: professionals.map((p) => p.id),
    };

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create project");
      }

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
          onSubmit={handleFormSubmit}
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
