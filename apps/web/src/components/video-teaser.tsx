'use client';

import { useState, useRef, useEffect } from 'react';

export function VideoTeaser() {
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pause inline video when modal opens
  useEffect(() => {
    if (modalOpen) {
      videoRef.current?.pause();
      if (modalVideoRef.current) {
        modalVideoRef.current.currentTime = 0;
        modalVideoRef.current.play().catch(() => {});
      }
    } else {
      videoRef.current?.play().catch(() => {});
    }
  }, [modalOpen]);

  if (!mounted) return null;
  if (dismissed) return null;

  return (
    <>
      {/* Compact inline teaser: text left, video right */}
      <div className="relative mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity duration-500 opacity-0" ref={(el) => { if (el) requestAnimationFrame(() => { el.style.opacity = '1'; }); }}>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500 text-xs hover:bg-slate-300 transition"
          aria-label="Close"
        >
          ✕
        </button>
        <div
          className="flex flex-col sm:flex-row sm:items-stretch cursor-pointer"
          onClick={() => setModalOpen(true)}
        >
          {/* Text */}
          <div className="flex flex-col justify-center px-4 py-3 sm:flex-1">
            <p className="text-sm font-semibold text-slate-900 sm:hidden">MIMO in 60 seconds</p>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">See how MIMO works</p>
              <p className="mt-1 text-xs text-slate-500">Watch a quick 60-second intro to the platform.</p>
            </div>
          </div>
          {/* Video thumbnail */}
          <div className="relative w-full shrink-0 overflow-hidden bg-slate-900 sm:w-40" style={{ height: '80px' }}>
            <video
              ref={videoRef}
              src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4"
              className="h-full w-full object-cover"
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/35">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md">
                <svg className="h-3.5 w-3.5 text-slate-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-xl bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute -right-3 -top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg hover:bg-slate-100 transition"
              aria-label="Close"
            >
              ✕
            </button>
            <video
              ref={modalVideoRef}
              src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4"
              className="w-full rounded-xl"
              controls
              autoPlay
              preload="metadata"
            />
          </div>
        </div>
      )}
    </>
  );
}
