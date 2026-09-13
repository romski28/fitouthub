'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';

interface ProtectedPageOverlayProps {
  onJoinClick: () => void;
  onLoginClick: () => void;
}

export const ProtectedPageOverlay: React.FC<ProtectedPageOverlayProps> = ({
  onJoinClick,
  onLoginClick,
}) => {
  const { isLoggedIn } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid SSR/CSR mismatch: render only after mount, and only when explicitly logged out
  if (!mounted || isLoggedIn !== false) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/45 bg-[#F5EEDE] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-xl font-bold text-[#1A1A1A]">
            Access Restricted
          </h2>
          <Link
            href="/"
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-200/60 hover:text-slate-800"
          >
            ✕
          </Link>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <p className="text-sm text-slate-600">
            You need to be logged in to access this page. Please join or login to continue.
          </p>

          <div className="mt-5 space-y-3">
            <button
              onClick={onJoinClick}
              className="w-full rounded-lg bg-[#0E7C3A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0A5D2D]"
            >
              Join Now
            </button>
            <button
              onClick={onLoginClick}
              className="w-full rounded-lg border border-[#0E7C3A] px-4 py-3 text-sm font-semibold text-[#0E7C3A] transition hover:bg-[#0E7C3A]/10"
            >
              Login
            </button>
            <Link
              href="/"
              className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Go Back Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
