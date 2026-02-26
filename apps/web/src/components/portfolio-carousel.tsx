'use client';

import { useState } from 'react';
import ImageLightbox from '@/components/image-lightbox';

interface PortfolioCarouselProps {
  images: string[];
  title?: string;
  emptyMessage?: string;
  className?: string;
}

export function PortfolioCarousel({ 
  images, 
  title, 
  emptyMessage = 'No project entered, please add more for better client experience',
  className = ''
}: PortfolioCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!images || images.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed border-amber-200 bg-amber-50 p-6 text-center ${className}`}>
        <div className="flex items-center justify-center gap-2 text-amber-700">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className={className}>
      {title && (
        <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      )}
      
      <div className="relative rounded-lg overflow-hidden bg-slate-100 group">
        {/* Main Image */}
        <div className="relative aspect-video">
          <button
            onClick={() => setLightboxOpen(true)}
            className="block w-full h-full cursor-pointer"
            aria-label="Open lightbox"
          >
            <img
              src={images[currentIndex]}
              alt={`Portfolio image ${currentIndex + 1}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>

          {/* Image Counter */}
          <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Navigation Arrows - Only show if more than 1 image */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 rounded-full p-2 shadow-lg transition opacity-0 group-hover:opacity-100"
              aria-label="Previous image"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={goToNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-slate-800 rounded-full p-2 shadow-lg transition opacity-0 group-hover:opacity-100"
              aria-label="Next image"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Indicators - Only show if more than 1 image */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentIndex 
                    ? 'w-6 bg-white' 
                    : 'w-2 bg-white/60 hover:bg-white/80'
                }`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail Strip - Show on larger screens if more than 1 image */}
      {images.length > 1 && (
        <div className="mt-3 hidden sm:flex gap-2 overflow-x-auto pb-2">
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition ${
                index === currentIndex 
                  ? 'border-emerald-600 ring-2 ring-emerald-200' 
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <img
                src={img}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <ImageLightbox
          images={images}
          startIndex={currentIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
