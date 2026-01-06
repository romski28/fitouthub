'use client';

import { useState } from 'react';
import { ProjectImageModal } from './project-image-modal';

interface ProjectPhoto {
  id: string;
  url: string;
  note?: string | null;
  createdAt?: string;
}

interface ProjectImagesCardProps {
  photos: ProjectPhoto[];
  onPhotoNoteUpdate?: (photoId: string, note: string) => Promise<void>;
  isLoading?: boolean;
}

export function ProjectImagesCard({
  photos,
  onPhotoNoteUpdate,
  isLoading = false,
}: ProjectImagesCardProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<ProjectPhoto | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveNote = async (photo: ProjectPhoto) => {
    if (!onPhotoNoteUpdate) return;
    setIsSaving(true);
    try {
      await onPhotoNoteUpdate(photo.id, photo.note || '');
      setSelectedPhoto(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (!photos || photos.length === 0) {
    return null;
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Project Images ({photos.length})</h2>
          <p className="text-sm text-slate-600 mt-1">Click on any image to view details and add notes</p>
        </div>

        {/* Images Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              disabled={isLoading}
              className="group relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-emerald-300 transition disabled:opacity-50"
            >
              <img
                src={photo.url}
                alt="Project image"
                className="h-full w-full object-cover group-hover:scale-105 transition"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 14a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" />
                    <path d="M12 7a1 1 0 0 0-1 1v3h-3a1 1 0 1 0 0 2h3v3a1 1 0 1 0 2 0v-3h3a1 1 0 1 0 0-2h-3v-3a1 1 0 0 0-1-1z" />
                  </svg>
                </div>
              </div>
              
              {/* Note indicator */}
              {photo.note && (
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-semibold rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  ✓
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Image Detail Modal */}
      <ProjectImageModal
        isOpen={!!selectedPhoto}
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onSave={onPhotoNoteUpdate ? handleSaveNote : undefined}
        isSaving={isSaving}
      />
    </>
  );
}
