'use client';

import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';

interface PhotoDropZoneProps {
  onPhotos: (files: File[]) => void;
  maxFiles?: number;
  className?: string;
}

export function PhotoDropZone({ onPhotos, maxFiles = 5, className = '' }: PhotoDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  const processFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      const selected = imageFiles.slice(0, maxFiles);
      onPhotos(selected);

      // Generate previews
      const urls = selected.map((f) => URL.createObjectURL(f));
      setPreviews((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u));
        return urls;
      });
    },
    [maxFiles, onPhotos],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      e.target.value = '';
    },
    [processFiles],
  );

  return (
    <div className={className}>
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300 ${
          isDragOver
            ? 'border-amber-500 bg-amber-50/80 scale-[1.02] shadow-lg'
            : previews.length > 0
              ? 'border-emerald-400 bg-emerald-50/50'
              : 'border-[rgba(120,53,15,0.25)] bg-[rgba(245,238,219,0.4)] hover:border-amber-400 hover:bg-[rgba(245,238,219,0.7)]'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />

        {previews.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center">
            {previews.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Upload ${i + 1}`}
                className="h-20 w-20 rounded-lg object-cover shadow-sm"
              />
            ))}
            <div className="flex items-center justify-center h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 text-xs">
              + Add more
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
              <svg
                viewBox="0 0 24 24"
                className="h-8 w-8 text-amber-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
                <circle cx="8.5" cy="10.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-stone-700">
              Drop photos here or click to browse
            </p>
            <p className="mt-1 text-xs text-stone-500">
              PNG, JPG, WebP • Up to {maxFiles} images
            </p>
          </>
        )}
      </label>

      {previews.length > 0 && (
        <button
          type="button"
          onClick={() => {
            previews.forEach((u) => URL.revokeObjectURL(u));
            setPreviews([]);
          }}
          className="mt-2 text-xs text-stone-500 hover:text-stone-700 underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
