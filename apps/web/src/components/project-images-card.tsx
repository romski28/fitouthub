'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ProjectImageModal } from './project-image-modal';
import { resolveMediaAssetUrl } from '@/lib/media-assets';

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

function getFileInfo(url: string) {
  const ext = (url || '').split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  return { ext, isImage, isPdf };
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
      <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-6 shadow-sm">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Project Media ({photos.length})</h2>
          <p className="text-sm text-slate-700 mt-1">Click on any file to view details and add notes</p>
        </div>

        {/* Files Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo) => {
            const { ext, isImage, isPdf } = getFileInfo(photo.url);

            return (
            <button
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              disabled={isLoading}
              className="group relative aspect-video overflow-hidden rounded-lg border border-[rgba(120,53,15,0.15)] bg-slate-100 hover:border-emerald-400 transition disabled:opacity-50"
              title={photo.url.split('/').pop() || ''}
            >
              {isImage ? (
                <>
                  <Image
                    src={resolveMediaAssetUrl(photo.url)}
                    alt="Project file"
                    fill
                    className="object-cover group-hover:scale-105 transition"
                    unoptimized
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
                </>
              ) : (
                <div className={`flex h-full w-full flex-col items-center justify-center p-2 ${
                  isPdf ? 'bg-red-50' : 'bg-slate-100'
                }`}>
                  <span className={`text-lg font-bold uppercase ${
                    isPdf ? 'text-red-500' : 'text-slate-500'
                  }`}>{ext || 'FILE'}</span>
                  <span className="mt-1 text-[10px] text-slate-400 truncate max-w-full">
                    {photo.url.split('/').pop()}
                  </span>
                </div>
              )}

              {/* Note indicator */}
              {photo.note && (
                <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-semibold rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  ✓
                </div>
              )}
            </button>
            );
          })}
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
