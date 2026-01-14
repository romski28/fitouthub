'use client';

import { useState } from 'react';

interface ChatImageAttachmentProps {
  url: string;
  filename: string;
  className?: string;
}

export default function ChatImageAttachment({ 
  url, 
  filename, 
  className = '' 
}: ChatImageAttachmentProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className={`bg-slate-100 border border-slate-300 rounded-lg p-3 text-sm text-slate-600 ${className}`}>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Image failed to load: {filename}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`relative group cursor-pointer ${className}`} 
        onClick={() => setIsLightboxOpen(true)}
      >
        <img
          src={url}
          alt={filename}
          onError={() => setImageError(true)}
          className="w-16 h-16 min-w-[64px] rounded border border-slate-200 hover:opacity-90 transition object-cover"
        />
        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition">
          Click to enlarge
        </div>
      </div>

      {/* Lightbox overlay */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img 
              src={url} 
              alt={filename} 
              className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" 
            />
            <button
              className="absolute top-2 right-2 bg-white text-slate-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-100 shadow-lg transition"
              onClick={() => setIsLightboxOpen(false)}
            >
              Close
            </button>
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-sm px-3 py-2 rounded max-w-[80%] truncate">
              {filename}
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-lg transition"
              onClick={(e) => e.stopPropagation()}
            >
              Open in new tab
            </a>
          </div>
        </div>
      )}
    </>
  );
}
