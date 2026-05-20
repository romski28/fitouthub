'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';
import ChatImageUploader from '@/components/chat-image-uploader';
import { PortfolioCarousel } from '@/components/portfolio-carousel';

export interface ProfessionalMediaItem {
  id: string;
  storageKey: string;
  imageUrl: string;
  kind: 'STANDALONE' | 'REFERENCE_PROJECT';
  description?: string | null;
  isProfileFeature: boolean;
  profileFeatureSortOrder?: number | null;
  referenceProjectId?: string | null;
  projectSortOrder?: number | null;
  credit?: string | null;
  copyrightNotice?: string | null;
  sourceType?: string | null;
  createdAt?: string;
  updatedAt?: string;
  referenceProject?: {
    id: string;
    title: string;
  } | null;
}

export interface ReferenceProject {
  id: string;
  title: string;
  description?: string | null;
  imageUrls: string[];
  createdAt: string;
}

type ProfessionalPortfolioManagerProps = {
  accessToken: string;
  initialMedia?: ProfessionalMediaItem[];
  initialReferenceProjects?: ReferenceProject[];
};

const sortMediaItems = (items: ProfessionalMediaItem[]) =>
  [...items].sort((left, right) => {
    if (left.isProfileFeature !== right.isProfileFeature) {
      return left.isProfileFeature ? -1 : 1;
    }

    const leftFeatureOrder = left.profileFeatureSortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightFeatureOrder = right.profileFeatureSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftFeatureOrder !== rightFeatureOrder) {
      return leftFeatureOrder - rightFeatureOrder;
    }

    const leftProjectOrder = left.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightProjectOrder = right.projectSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftProjectOrder !== rightProjectOrder) {
      return leftProjectOrder - rightProjectOrder;
    }

    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });

export function ProfessionalPortfolioManager({
  accessToken,
  initialMedia = [],
  initialReferenceProjects = [],
}: ProfessionalPortfolioManagerProps) {
  const [mediaItems, setMediaItems] = useState<ProfessionalMediaItem[]>(sortMediaItems(initialMedia));
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [savingMediaId, setSavingMediaId] = useState<string | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [standalonePendingFiles, setStandalonePendingFiles] = useState<File[]>([]);
  const [standaloneUploading, setStandaloneUploading] = useState(false);
  const [standaloneUploaderClearKey, setStandaloneUploaderClearKey] = useState(0);
  const [refProjects, setRefProjects] = useState<ReferenceProject[]>(initialReferenceProjects);
  const [refDraft, setRefDraft] = useState<{ id?: string; title: string; description: string; imageUrls: string[] }>(
    { id: undefined, title: '', description: '', imageUrls: [] },
  );
  const [refSaving, setRefSaving] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);
  const [refPendingFiles, setRefPendingFiles] = useState<File[]>([]);
  const [refUploaderClearKey, setRefUploaderClearKey] = useState(0);

  useEffect(() => {
    setMediaItems(sortMediaItems(initialMedia));
  }, [initialMedia]);

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

  const loadMedia = async () => {
    const res = await fetch(`${API_BASE_URL}/professional/media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const payload = await res.json();
    setMediaItems(sortMediaItems(Array.isArray(payload) ? payload : []));
  };

  const loadReferenceProjects = async () => {
    const res = await fetch(`${API_BASE_URL}/professional/reference-projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const payload = await res.json();
    setRefProjects(Array.isArray(payload) ? payload : []);
  };

  const uploadStandaloneImages = async (files: File[]) => {
    const keys = await uploadFiles(files);
    const res = await fetch(`${API_BASE_URL}/professional/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ imageUrls: keys }),
    });
    if (!res.ok) throw new Error(await res.text());
    const created = await res.json();
    setMediaItems((prev) => sortMediaItems([...(Array.isArray(created) ? created : []), ...prev]));
    return keys;
  };

  const handleStandaloneUpload = async () => {
    if (standalonePendingFiles.length === 0) {
      setMediaError('Select one or more images to upload.');
      return;
    }

    setStandaloneUploading(true);
    setMediaError(null);
    try {
      await uploadStandaloneImages(standalonePendingFiles);
      setStandalonePendingFiles([]);
      setStandaloneUploaderClearKey((current) => current + 1);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setStandaloneUploading(false);
    }
  };

  const uploadRefImages = async (files: File[]) => {
    const urls = await uploadFiles(files);
    setRefDraft((draft) => ({ ...draft, imageUrls: [...(draft.imageUrls || []), ...urls] }));
    setRefPendingFiles([]);
    return urls;
  };

  const handleMediaDraftChange = (
    id: string,
    field: 'description' | 'isProfileFeature',
    value: string | boolean,
  ) => {
    setMediaItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: value,
        };
      }),
    );
  };

  const handleMediaUpdate = async (id: string) => {
    const target = mediaItems.find((item) => item.id === id);
    if (!target) return;

    if (target.isProfileFeature) {
      const otherFeaturedCount = mediaItems.filter((item) => item.id !== id && item.isProfileFeature).length;
      if (otherFeaturedCount >= 5) {
        setMediaError('You can select up to 5 featured profile images.');
        return;
      }
    }

    setSavingMediaId(id);
    setMediaError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/media/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          description: target.description || '',
          isProfileFeature: target.isProfileFeature,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setMediaItems((prev) =>
        sortMediaItems(prev.map((item) => (item.id === updated.id ? updated : item))),
      );
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Failed to update image');
      void loadMedia();
    } finally {
      setSavingMediaId(null);
    }
  };

  const handleMediaDelete = async (id: string) => {
    setDeletingMediaId(id);
    setMediaError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/media/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setMediaItems((prev) => prev.filter((item) => item.id !== id));
      await loadReferenceProjects();
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Failed to delete image');
    } finally {
      setDeletingMediaId(null);
    }
  };

  const removeRefImage = (url: string) => {
    setRefDraft((draft) => ({ ...draft, imageUrls: (draft.imageUrls || []).filter((imageUrl) => imageUrl !== url) }));
    setRefPendingFiles([]);
    setRefUploaderClearKey((current) => current + 1);
  };

  const resetRefDraft = () => {
    setRefDraft({ id: undefined, title: '', description: '', imageUrls: [] });
    setRefPendingFiles([]);
    setRefUploaderClearKey((current) => current + 1);
  };

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
      await loadMedia();
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
      await loadMedia();
    } catch (err) {
      setRefError(err instanceof Error ? err.message : 'Failed to delete reference project');
    } finally {
      setRefSaving(false);
    }
  };

  const featuredCount = mediaItems.filter((item) => item.isProfileFeature).length;

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[rgba(120,53,15,0.16)] bg-[var(--mimo-cream)] shadow-[0_20px_60px_rgba(81,55,32,0.08)] p-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">My images</h2>
            <p className="mt-1 text-sm text-slate-700">Manage standalone and project-linked images in one place. You can mark up to 5 as featured profile images.</p>
          </div>
          <div className="text-sm font-medium text-slate-600">Featured: {featuredCount} / 5</div>
        </div>

        {mediaError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {mediaError}
          </div>
        )}

        <div className="overflow-hidden rounded-[22px] border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-project-paper)] shadow-sm">
          <div className="grid grid-cols-[124px_minmax(220px,1fr)_84px_90px_90px] gap-3 border-b border-[rgba(120,53,15,0.12)] bg-[var(--mimo-paper)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <div>Image</div>
            <div>Description</div>
            <div className="text-center">Profile</div>
            <div className="text-center">Update</div>
            <div className="text-center">Delete</div>
          </div>

          {mediaItems.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-600">No images uploaded yet. Add some below and they will appear here immediately.</div>
          ) : (
            <div className="max-h-[40rem] overflow-y-auto">
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[124px_minmax(220px,1fr)_84px_90px_90px] gap-3 border-b border-[rgba(120,53,15,0.1)] px-4 py-3 last:border-b-0"
                >
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-paper)]">
                      <img
                        src={item.imageUrl || resolveMediaAssetUrl(item.storageKey)}
                        alt={item.description || 'Portfolio image'}
                        className="h-20 w-full object-cover"
                      />
                    </div>
                    {item.referenceProject?.title ? (
                      <p className="text-[11px] text-slate-500">Project: {item.referenceProject.title}</p>
                    ) : null}
                  </div>

                  <div>
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => handleMediaDraftChange(item.id, 'description', e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="Add a short description"
                    />
                  </div>

                  <div className="flex items-start justify-center pt-2">
                    <input
                      type="checkbox"
                      checked={item.isProfileFeature}
                      onChange={(e) => handleMediaDraftChange(item.id, 'isProfileFeature', e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-start justify-center">
                    <button
                      type="button"
                      onClick={() => void handleMediaUpdate(item.id)}
                      disabled={savingMediaId === item.id}
                      className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingMediaId === item.id ? 'Saving' : 'Update'}
                    </button>
                  </div>

                  <div className="flex items-start justify-center">
                    <button
                      type="button"
                      onClick={() => void handleMediaDelete(item.id)}
                      disabled={deletingMediaId === item.id}
                      className="rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
                    >
                      {deletingMediaId === item.id ? 'Deleting' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-slate-900">Upload new images</p>
          <div className="rounded-[22px] border border-[rgba(120,53,15,0.14)] bg-[var(--mimo-project-paper)] p-4 shadow-sm">
            <div className="space-y-3">
              <ChatImageUploader
                onFilesSelected={setStandalonePendingFiles}
                maxImages={10}
                disabled={standaloneUploading}
                clearKey={standaloneUploaderClearKey}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {standalonePendingFiles.length > 0
                    ? `${standalonePendingFiles.length} image${standalonePendingFiles.length > 1 ? 's' : ''} ready to upload to your portfolio.`
                    : 'Choose images to add them as standalone portfolio media.'}
                </p>
                <button
                  type="button"
                  onClick={() => void handleStandaloneUpload()}
                  disabled={standaloneUploading || standalonePendingFiles.length === 0}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {standaloneUploading ? 'Uploading...' : `Upload image${standalonePendingFiles.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[rgba(120,53,15,0.16)] bg-[var(--mimo-cream)] shadow-[0_20px_60px_rgba(81,55,32,0.08)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Reference projects</h2>
            <p className="text-sm text-slate-700">Add projects that showcase your work with a short description and supporting photos.</p>
          </div>
        </div>

        {refError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {refError}
          </div>
        )}

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
                <div className="space-y-2">
                  <ChatImageUploader
                    onFilesSelected={setRefPendingFiles}
                    maxImages={5}
                    disabled={refSaving}
                    clearKey={refUploaderClearKey}
                  />
                  <p className="text-xs text-slate-500">
                    {refPendingFiles.length > 0
                      ? `${refPendingFiles.length} new image${refPendingFiles.length > 1 ? 's' : ''} will upload when you save this project.`
                      : 'Select project images to preview them before saving.'}
                  </p>
                </div>
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