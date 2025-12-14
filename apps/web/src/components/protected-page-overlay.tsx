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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/5 backdrop-blur-lg">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md mx-4">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">
          Access Restricted
        </h2>
        <p className="text-slate-600 mb-6">
          You need to be logged in to access this page. Please join or login to continue.
        </p>

        <div className="space-y-3">
          <button
            onClick={onJoinClick}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700"
          >
            Join Now
          </button>
          <button
            onClick={onLoginClick}
            className="w-full rounded-md border border-blue-600 px-4 py-3 text-blue-600 font-medium hover:bg-blue-50"
          >
            Login
          </button>
          <Link
            href="/"
            className="block w-full text-center rounded-md border border-slate-300 px-4 py-3 text-slate-700 font-medium hover:bg-slate-50"
          >
            Go Back Home
          </Link>
        </div>
      </div>
    </div>
  );
};
