'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';

const DISMISSED_KEY = 'mimo-video-teaser-dismissed';

export function VideoTeaser() {
  const { isLoggedIn } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const modalVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === '1');
    }
  }, []);

  // Pause inline video when modal opens
  useEffect(() => {
    if (modalOpen) {
      videoRef.current?.pause();
      // Reset modal video to beginning
      if (modalVideoRef.current) {
        modalVideoRef.current.currentTime = 0;
        modalVideoRef.current.play().catch(() => {});
      }
    } else {
      videoRef.current?.play().catch(() => {});
    }
  }, [modalOpen]);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  if (!mounted) return null;
  // Only show for non-logged-in users who haven't dismissed
  if (isLoggedIn !== false || dismissed) return null;

  return (
    <>
      {/* Inline teaser */}
      <div className="relative mb-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70 transition"
          aria-label="Close video"
        >
          ✕
        </button>
        <div className="relative aspect-video w-full cursor-pointer" onClick={() => setModalOpen(true)}>
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
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              See how Mimo works · 30s
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
