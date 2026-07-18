'use client';

import React, { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { resolveMediaAssetUrl } from '@/lib/media-assets';
import { API_BASE_URL } from '@/config/api';

interface ProjectPhoto {
  id: string;
  url: string;
  note?: string | null;
  createdAt?: string;
}

interface MediaTabProps {
  photos: ProjectPhoto[];
  projectId: string;
  accessToken: string;
  onPhotoNoteUpdate?: (photoId: string, note: string) => Promise<void>;
  onPhotosChanged?: () => void;
  isLoading?: boolean;
}

function getFileInfo(url: string) {
  const ext = (url || '').split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  return { ext, isImage, isPdf };
}

export const MediaTab: React.FC<MediaTabProps> = ({
  photos,
  projectId,
  accessToken,
  onPhotoNoteUpdate,
  onPhotosChanged,
  isLoading: externalLoading = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));

      const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const msg = await uploadRes.text();
        throw new Error(msg || 'Upload failed');
      }

      const uploadData = await uploadRes.json();
      const keys: string[] = Array.isArray(uploadData?.keys)
        ? uploadData.keys
        : Array.isArray(uploadData?.files)
          ? uploadData.files.map((f: any) => f.key || f.url || f)
          : [];

      if (keys.length === 0) {
        toast.success('Files uploaded!');
        onPhotosChanged?.();
        return;
      }

      const photoUrls = keys.map((key: string) => {
        if (key.startsWith('http')) return key;
        return `${API_BASE_URL.replace(/\/$/, '')}/uploads/${key.replace(/^\//, '')}`;
      });

      // Merge with existing photos and update project via PUT
      const existingEntries = photos.map((p) => ({ url: p.url, note: p.note || '' }));
      const newEntries = photoUrls.map((url) => ({ url, note: '' }));
      const merged = [...existingEntries, ...newEntries];

      const updateRes = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photos: merged }),
      });

      if (!updateRes.ok) {
        toast.success('Files uploaded but could not attach to project.');
      } else {
        toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded!`);
      }
      onPhotosChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setUploading(false);
      setDragOver(false);
    }
  }, [accessToken, projectId, onPhotosChanged]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  }, [handleUploadFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleUploadFiles]);

  const handleStartEditNote = (photo: ProjectPhoto) => {
    setEditingNoteId(photo.id);
    setEditingNote(photo.note || '');
  };

  const handleSaveNote = async (photo: ProjectPhoto) => {
    if (!onPhotoNoteUpdate) return;
    setSavingNoteId(photo.id);
    try {
      await onPhotoNoteUpdate(photo.id, editingNote);
      setEditingNoteId(null);
      setEditingNote('');
      toast.success('Note saved!');
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSavingNoteId(null);
    }
  };

  const hasPhotos = photos && photos.length > 0;
  const isLoading = externalLoading || uploading;

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragOver
            ? 'border-emerald-400 bg-emerald-50/60'
            : 'border-[rgba(120,53,15,0.18)] bg-[rgba(239,231,207,0.45)]'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <svg className={`w-10 h-10 ${dragOver ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm font-semibold text-slate-700">
            {dragOver ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-xs text-slate-500">or click to browse — any file type supported</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="*/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Browse Files'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!hasPhotos && !isLoading && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-6 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
          </svg>
          <h2 className="text-lg font-bold text-slate-900 mt-3">No files yet</h2>
          <p className="text-sm text-slate-500 mt-1">Drag and drop files above or click Browse Files to upload.</p>
        </div>
      )}

      {/* File grid */}
      {hasPhotos && (
        <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Project Files ({photos.length})</h2>
              <p className="text-sm text-slate-500 mt-1">Click a file to add or edit notes</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const { ext, isImage, isPdf } = getFileInfo(photo.url);

              return (
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-lg border border-[rgba(120,53,15,0.15)] bg-white"
                >
                  <div className="relative aspect-video bg-slate-100">
                    {isImage ? (
                      <Image
                        src={resolveMediaAssetUrl(photo.url)}
                        alt="Project file"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className={`flex h-full w-full flex-col items-center justify-center ${
                        isPdf ? 'bg-red-50' : 'bg-slate-100'
                      }`}>
                        <span className={`text-lg font-bold uppercase ${
                          isPdf ? 'text-red-500' : 'text-slate-400'
                        }`}>{ext || 'FILE'}</span>
                      </div>
                    )}
                    {isLoading && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    {editingNoteId === photo.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          placeholder="Add a note…"
                          rows={2}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs resize-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                          autoFocus
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveNote(photo)}
                            disabled={savingNoteId === photo.id}
                            className="flex-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingNoteId === photo.id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingNoteId(null); setEditingNote(''); }}
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartEditNote(photo)}
                        className="w-full text-left"
                      >
                        {photo.note ? (
                          <p className="text-xs text-slate-700 line-clamp-2">{photo.note}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">Add note…</p>
                        )}
                      </button>
                    )}
                    {photo.createdAt && (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {new Date(photo.createdAt).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
