'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthModalControl } from '@/context/auth-modal-control';
import { useAuth } from '@/context/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { openLoginModal } = useAuthModalControl();

  useEffect(() => {
    // If already logged in, redirect to home
    if (isLoggedIn) {
      router.push('/');
      return;
    }

    // Open the login modal and redirect
    openLoginModal();
    // Redirect after a short delay to let the modal open
    const timer = setTimeout(() => {
      router.push('/');
    }, 500);

    return () => clearTimeout(timer);
  }, [isLoggedIn, router, openLoginModal]);

  // Temporary loading/redirect screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to login...</p>
      </div>
    </div>
  );
}
