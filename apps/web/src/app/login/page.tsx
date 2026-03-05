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
            {t('login.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('login.welcome')}
          </p>
        </div>

        {/* Login Type Toggle */}
        <div className="flex gap-4 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setLoginType('client');
              setError(null);
            }}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              loginType === 'client'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('login.clientLabel')}
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginType('professional');
              setError(null);
            }}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              loginType === 'professional'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('login.professionalLabel')}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="text-sm font-medium text-red-800">{error}</div>
          </div>
        )}

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                {t('login.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('login.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                {t('login.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={t('login.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('login.submit')}
            </button>
          </div>
        </form>

        {/* Help Text */}
        <div className="text-center text-sm">
          <p className="text-gray-600 mb-4">
            {loginType === 'client'
              ? t('login.noAccount')
              : t('login.professionalText')}
            {' '}
            <Link href="/" className="font-medium text-blue-600 hover:text-blue-700">
              {loginType === 'client' ? t('login.homePage') : t('login.contactUs')}
            </Link>
          </p>
          <Link href="/" className="font-medium text-blue-600 hover:text-blue-700">
            {commonT('back')}
          </Link>
        </div>
      </div>
    </div>
  );
}
