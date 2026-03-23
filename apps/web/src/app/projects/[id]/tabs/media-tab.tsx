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
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm p-6">
        <h2 className="text-lg font-bold text-white">Project Media</h2>
        <p className="text-sm text-slate-300 mt-2">No media has been uploaded yet.</p>
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
