'use client';

import React from 'react';
import { ProjectImagesCard } from '@/components/project-images-card';

interface ProjectPhoto {
  id: string;
  url: string;
  note?: string | null;
  createdAt?: string;
}

interface MediaTabProps {
  photos: ProjectPhoto[];
  onPhotoNoteUpdate?: (photoId: string, note: string) => Promise<void>;
  isLoading?: boolean;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  photos,
  onPhotoNoteUpdate,
  isLoading = false,
}) => {
  if (!photos || photos.length === 0) {
    return (
      <div className="rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] shadow-sm p-6">
        <h2 className="text-lg font-bold text-slate-900">Project Media</h2>
        <p className="text-sm text-slate-700 mt-2">No files have been uploaded yet.</p>
      </div>
    );
  }

  return (
    <ProjectImagesCard
      photos={photos}
      onPhotoNoteUpdate={onPhotoNoteUpdate}
      isLoading={isLoading}
    />
  );
};
