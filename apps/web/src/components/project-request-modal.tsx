"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalOverlay } from "./modal-overlay";
import { API_BASE_URL } from "@/config/api";
import { Professional } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { ProjectForm, type ProjectFormData } from "./project-form";

interface ProjectRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional | null;
}

const toAbsolute = (url: string) => {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
};

export function ProjectRequestModal({ isOpen, onClose, professional }: ProjectRequestModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const displayName = professional?.fullName || professional?.businessName || "Professional";

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
    if (!professional) return;

    setError(null);

    let photoUrls = uploadedUrls;
    if (formData.files && formData.files.length > 0 && uploadedUrls.length === 0) {
      try {
        photoUrls = await uploadFiles(formData.files);
        setUploadedUrls(photoUrls);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        return;
      }
    }

    const locationLabel = [formData.location?.primary, formData.location?.secondary, formData.location?.tertiary]
      .filter(Boolean)
      .join(", ");
    const clientName = user ? `${user.firstName} ${user.surname}`.trim() : "Client";
    const projectName = `${formData.selectedService || 'Service Request'} with ${displayName}`;

    const normalizedPhotos = photoUrls.map(toAbsolute);
    const photoNote = normalizedPhotos.length > 0
      ? `\nPhotos: ${normalizedPhotos.join(", ")}`
      : "";

    const payload = {
      projectName,
      clientName,
      contractorName: displayName,
      region: locationLabel || "Hong Kong",
      notes: `${formData.notes?.trim() || ''}${photoNote}`,
      status: "pending" as const,
      userId: user?.id,
      professionalIds: [professional.id],
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
    }
  };

  if (!isOpen || !professional) return null;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase font-semibold tracking-[0.12em] text-emerald-600">Project request</p>
            <h2 className="text-2xl font-bold text-slate-900">Ask {displayName} to help</h2>
            <p className="text-sm text-slate-600 mt-1">
              Share what you need. We will create a small project and notify the professional.
            </p>
          </div>
        </div>

        <ProjectForm
          mode="create"
          isQuickRequest={true}
          singleProfessional={professional}
          onSubmit={handleFormSubmit}
          onCancel={onClose}
          isSubmitting={submitting}
          error={error}
          submitLabel="Create project"
          showBudget={false}
          showService={true}
        />
      </div>
    </ModalOverlay>
  );
}
