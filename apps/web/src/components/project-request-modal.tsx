"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ModalOverlay } from "./modal-overlay";
import LocationSelect, { CanonicalLocation } from "./location-select";
import FileUploader from "./file-uploader";
import { API_BASE_URL } from "@/config/api";
import { Professional } from "@/lib/types";
import { useAuth } from "@/context/auth-context";

interface ProjectRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional | null;
  defaultLocation: CanonicalLocation;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const toAbsolute = (url: string) => {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${normalized}`;
};

type ServiceOption = {
  label: string;
  value: string;
};

export function ProjectRequestModal({ isOpen, onClose, professional, defaultLocation }: ProjectRequestModalProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedService, setSelectedService] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loc, setLoc] = useState<CanonicalLocation>(defaultLocation ?? {});
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);

  useEffect(() => {
    setLoc(defaultLocation ?? {});
  }, [defaultLocation?.primary, defaultLocation?.secondary, defaultLocation?.tertiary]);

  useEffect(() => {
    if (!professional) return;
    const options = new Set<string>();
    if (professional.tradesOffered) {
      professional.tradesOffered.forEach((t) => options.add(t));
    }
    if (professional.suppliesOffered) {
      professional.suppliesOffered.forEach((s) => options.add(s));
    }
    if (professional.primaryTrade) options.add(professional.primaryTrade);
    if (professional.professionType) options.add(professional.professionType);

    const sorted = Array.from(options)
      .filter(Boolean)
      .map((value) => ({ label: value, value }))
      .sort((a, b) => a.label.localeCompare(b.label));

    setServiceOptions(sorted);
    if (!selectedService && sorted.length > 0) {
      setSelectedService(sorted[0].value);
    }
  }, [professional, selectedService]);

  const displayName = useMemo(() => {
    if (!professional) return "";
    return professional.fullName || professional.businessName || "Professional";
  }, [professional]);

  const uploadFiles = async (filesToUpload: File[]) => {
    const formData = new FormData();
    filesToUpload.forEach((f) => formData.append("files", f));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { urls: string[] };
    setUploadedUrls(data.urls);
    return data.urls;
  };

  const handleSubmit = async () => {
    if (!professional) return;
    if (!selectedService) {
      setError("Please select a service.");
      return;
    }
    if (!description.trim()) {
      setError("Please add a short project description.");
      return;
    }
    setError(null);
    setSubmitting(true);

    let photoUrls = uploadedUrls;
    if (files.length > 0 && uploadedUrls.length === 0) {
      try {
        photoUrls = await uploadFiles(files);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        setSubmitting(false);
        return;
      }
    }

    const locationLabel = [loc.primary, loc.secondary, loc.tertiary].filter(Boolean).join(", ");
    const clientName = user ? `${user.firstName} ${user.surname}`.trim() : "Client";
    const projectName = `${selectedService} with ${displayName}`;

    const normalizedPhotos = photoUrls.map(toAbsolute);
    const photoNote = normalizedPhotos.length > 0
      ? `\nPhotos: ${normalizedPhotos.join(", ")}`
      : "";

    const payload = {
      projectName,
      clientName,
      contractorName: displayName,
      region: locationLabel || "Hong Kong",
      notes: `${description.trim()}${photoNote}`,
      status: "pending" as const,
      userId: user?.id,
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Service</label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a service</option>
              {serviceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-800">Project location</label>
            <LocationSelect value={loc} onChange={setLoc} />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Describe the project</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Fix a leaking pipe in the kitchen, replace two taps, and inspect water pressure."
          />
        </div>

        <div className="grid gap-2">
          <label className="font-medium text-slate-800 text-sm">Photos (optional)</label>
          <FileUploader
            maxFiles={MAX_FILES}
            maxFileSize={MAX_FILE_SIZE}
            onFilesChange={setFiles}
            showUploadAction={false}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Create project"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
