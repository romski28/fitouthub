"use client";

import { useEffect, useState } from "react";

export type ImageLightboxProps = {
  images: string[];
  startIndex?: number;
  onClose: () => void;
};

export default function ImageLightbox({ images, startIndex = 0, onClose }: ImageLightboxProps) {
  const safeImages = images.filter(Boolean);
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(safeImages.length - 1, 0)));

  useEffect(() => {
    setIndex(Math.min(Math.max(startIndex, 0), Math.max(safeImages.length - 1, 0)));
  }, [startIndex, safeImages.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (safeImages.length ? (i + 1) % safeImages.length : i));
      if (e.key === "ArrowLeft") setIndex((i) => (safeImages.length ? (i - 1 + safeImages.length) % safeImages.length : i));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, safeImages.length]);

  if (!safeImages.length) return null;

  const goNext = () => setIndex((i) => (i + 1) % safeImages.length);
  const goPrev = () => setIndex((i) => (i - 1 + safeImages.length) % safeImages.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <button
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-800 shadow"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>

      {safeImages.length > 1 && (
        <>
          <button
            aria-label="Previous image"
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 shadow hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
          >
            ‹
          </button>
          <button
            aria-label="Next image"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 shadow hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            ›
          </button>
          <div className="absolute bottom-5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
            {index + 1} / {safeImages.length}
          </div>
        </>
      )}

      <div
        className="max-h-[85vh] max-w-[90vw] overflow-hidden rounded-xl bg-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={safeImages[index]}
          alt="Gallery item"
          className="max-h-[85vh] max-w-[90vw] object-contain"
        />
      </div>
    </div>
  );
}
