'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';
import FileUploader from '@/components/file-uploader';
import { PortfolioCarousel } from '@/components/portfolio-carousel';

export interface ReferenceProject {
  id: string;
  title: string;
  description?: string | null;
  imageUrls: string[];
  createdAt: string;
}

type ProfessionalPortfolioManagerProps = {
  accessToken: string;
  initialProfileImages?: string[];
  initialReferenceProjects?: ReferenceProject[];
  title?: string;
  description?: string;
};

export function ProfessionalPortfolioManager({
  accessToken,
  initialProfileImages = [],
  initialReferenceProjects = [],
  title = 'Portfolio',
  description = 'Manage your profile images and reference projects separately from your business profile.',
}: ProfessionalPortfolioManagerProps) {
  const [profileImages, setProfileImages] = useState<string[]>(initialProfileImages);
  const [pendingProfileFiles, setPendingProfileFiles] = useState<File[]>([]);
  const [refProjects, setRefProjects] = useState<ReferenceProject[]>(initialReferenceProjects);
  const [refDraft, setRefDraft] = useState<{ id?: string; title: string; description: string; imageUrls: string[] }>(
    { id: undefined, title: '', description: '', imageUrls: [] },
  );
  const [refSaving, setRefSaving] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refPendingFiles, setRefPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    setProfileImages(initialProfileImages);
  }, [initialProfileImages]);

  useEffect(() => {
    setRefProjects(initialReferenceProjects);
  }, [initialReferenceProjects]);

  const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return getUploadResponseKeys(data);
  };

  const uploadProfileImages = async (files: File[]) => {
    const keys = await uploadFiles(files);
    const nextImages = [...profileImages, ...keys];
    setProfileImages(nextImages);
    setPendingProfileFiles([]);

    const res = await fetch(`${API_BASE_URL}/professional/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ profileImages: nextImages }),
    });
    if (!res.ok) throw new Error(await res.text());

    return keys;
  };

  const uploadRefImages = async (files: File[]) => {
    const urls = await uploadFiles(files);
    setRefDraft((draft) => ({ ...draft, imageUrls: [...(draft.imageUrls || []), ...urls] }));
    setRefPendingFiles([]);
    return urls;
  };

  const removeProfileImage = async (url: string) => {
    const nextImages = profileImages.filter((imageUrl) => imageUrl !== url);
    setProfileImages(nextImages);

    try {
      const res = await fetch(`${API_BASE_URL}/professional/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ profileImages: nextImages }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      setProfileImages(profileImages);
      setRefError(err instanceof Error ? err.message : 'Failed to update portfolio images');
    }
  };

  const removeRefImage = (url: string) => {
    setRefDraft((draft) => ({ ...draft, imageUrls: (draft.imageUrls || []).filter((imageUrl) => imageUrl !== url) }));
    setRefPendingFiles([]);
  };

  const resetRefDraft = () => setRefDraft({ id: undefined, title: '', description: '', imageUrls: [] });

  const handleRefSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refDraft.title.trim()) {
      setRefError('Title is required');
      return;
    }

    setRefSaving(true);
    setRefError(null);

    try {
      let finalImageUrls = [...(refDraft.imageUrls || [])];
      if (refPendingFiles.length > 0) {
        const uploadedUrls = await uploadFiles(refPendingFiles);
        finalImageUrls = [...finalImageUrls, ...uploadedUrls];
        setRefPendingFiles([]);
      }

      if (refDraft.id) {
        const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${refDraft.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            title: refDraft.title.trim(),
            description: refDraft.description?.trim() || undefined,
            imageUrls: finalImageUrls,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        setRefProjects((prev) => prev.map((project) => (project.id === updated.id ? updated : project)));
      } else {
        const res = await fetch(`${API_BASE_URL}/professional/reference-projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            title: refDraft.title.trim(),
            description: refDraft.description?.trim() || undefined,
            imageUrls: finalImageUrls,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        setRefProjects((prev) => [created, ...prev]);
      }

      resetRefDraft();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Failed to save reference project');
    } finally {
      setRefSaving(false);
    }
  };

  const handleRefEdit = (project: ReferenceProject) => {
    setRefDraft({
      id: project.id,
      title: project.title,
      description: project.description || '',
      imageUrls: project.imageUrls || [],
    });
    setRefPendingFiles([]);
    setRefError(null);
  };

  const handleRefDelete = async (id: string) => {
    setRefSaving(true);
    setRefError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/reference-projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRefProjects((prev) => prev.filter((project) => project.id !== id));
      if (refDraft.id === id) resetRefDraft();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Failed to delete reference project');
    } finally {
      setRefSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[rgba(120,53,15,0.16)] bg-[var(--mimo-cream)] shadow-[0_20px_60px_rgba(81,55,32,0.08)] p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(185,78,45,0.92)]">Portfolio</p>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="max-w-2xl text-sm text-slate-700">{description}</p>
          </div>
          <span className="rounded-full bg-[var(--mimo-project-paper)] px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-[rgba(120,53,15,0.12)]">Cloudflare storage</span>
        </div>

        {refError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {refError}
          </div>
        )}

        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Profile Images</h2>
              <p className="text-xs text-slate-600">Upload your strongest before/after or finished-work photos first. Clients usually decide fast.</p>
            </div>
          </div>

          <div className="rounded-[22px] border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-project-paper)] p-4 shadow-sm">
            <FileUploader
              maxFiles={5}
              maxFileSize={10 * 1024 * 1024}
              onUpload={uploadProfileImages}
              onFilesChange={(files) => setPendingProfileFiles(files)}
              showUploadAction
            />
          </div>

          {profileImages.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {profileImages.map((url) => (
                <div key={url} className="relative overflow-hidden rounded-[20px] border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-project-paper)] shadow-sm">
                  <img src={resolveMediaAssetUrl(url)} alt="Profile" className="h-28 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removeProfileImage(url)}
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-rose-700 shadow"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-[rgba(120,53,15,0.16)] bg-[var(--mimo-cream)] shadow-[0_20px_60px_rgba(81,55,32,0.08)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Reference projects</h2>
            <p className="text-sm text-slate-700">Add projects that showcase your work with a short description and supporting photos.</p>
          </div>
        </div>

        <form onSubmit={handleRefSave} className="mb-5 space-y-3 rounded-[22px] border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-project-paper)] p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Title *</label>
              <input
                type="text"
                value={refDraft.title}
                onChange={(e) => setRefDraft((draft) => ({ ...draft, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Project photos</label>
              <div className="mt-1 rounded-2xl border border-[rgba(120,53,15,0.12)] bg-[var(--mimo-paper)] p-3">
                <FileUploader
                  maxFiles={5}
                  maxFileSize={10 * 1024 * 1024}
                  onUpload={uploadRefImages}
                  onFilesChange={(files) => setRefPendingFiles(files)}
                  showUploadAction
                />
              </div>
              {refDraft.imageUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {refDraft.imageUrls.map((url) => (
                    <div key={url} className="group relative overflow-hidden rounded-xl border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-paper)]">
                      <img src={resolveMediaAssetUrl(url)} alt={refDraft.title || 'Reference image'} className="h-20 w-32 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeRefImage(url)}
                        className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-rose-700 shadow opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={refDraft.description}
              onChange={(e) => setRefDraft((draft) => ({ ...draft, description: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="What was delivered, client challenge, scope, standout finish, timeline, and materials used."
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              {refDraft.id ? 'Editing existing reference project' : 'Add a new reference project'}
            </div>
            <div className="flex gap-2">
              {refDraft.id && (
                <button
                  type="button"
                  onClick={() => {
                    resetRefDraft();
                    setRefPendingFiles([]);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white"
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                disabled={refSaving || !refDraft.title.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {refSaving ? 'Saving...' : refDraft.id ? 'Update project' : 'Add project'}
              </button>
            </div>
          </div>
        </form>

        {refProjects.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[rgba(185,78,45,0.3)] bg-[var(--mimo-project-paper)] p-5 text-sm text-[rgba(126,58,33,0.92)]">
            No project entered, please add more for better client experience.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
            {refProjects.map((project) => (
              <div key={project.id} className="flex-shrink-0 w-full sm:w-96 rounded-[22px] border border-[rgba(120,53,15,0.14)] p-4 bg-[var(--mimo-project-paper)] shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{project.title}</h3>
                    <p className="text-xs text-slate-600">Added {new Date(project.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRefEdit(project)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefDelete(project.id)}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {project.description ? (
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{project.description}</p>
                ) : null}
                <div className="mt-3">
                  <PortfolioCarousel
                    images={project.imageUrls || []}
                    emptyMessage="No photos added to this project yet"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}