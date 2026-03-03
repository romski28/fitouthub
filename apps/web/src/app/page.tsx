'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  
  const t = useTranslations('home');

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Redirect admins to admin area; professionals to their dashboard
  useEffect(() => {
    if (!hydrated) return;
    if (user?.role === 'admin') {
      router.replace('/admin');
      return;
    }
    if (profIsLoggedIn && !user) {
      router.replace('/professional-projects');
      return;
    }
  }, [hydrated, user, profIsLoggedIn, router]);

  return (
    <div className="space-y-16">
      {/* Updates Button - Only for logged-in users (client or professional) */}
      {hydrated && (isLoggedIn || profIsLoggedIn) && (
        <div className="flex justify-center pt-4">
          <UpdatesButton />
        </div>
      )}

      {/* Search Flow - Single entry point for all users */}
      <section className="relative -mx-6 -mt-10 bg-gradient-to-b from-emerald-50 to-white px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600 mb-2">
              {t('quickStart.tagline')}
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              {t('quickStart.title')}
            </h2>
          </div>
          <SearchFlow />
        </div>
      </section>

      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Content */}
          <div className="p-8 lg:p-12 space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-400 mb-2">
                {t('hero.tagline')}
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                {t('hero.title')}
              </h1>
            </div>
            <p className="text-lg text-slate-300">
              {t('hero.description')}
            </p>
          </div>

          {/* Hero Image */}
          <div className="h-96 lg:h-full bg-contain bg-no-repeat bg-center hidden lg:flex items-center justify-center p-8" style={{
            backgroundImage: 'url("/hero-painter.png")'
          }} />
        </div>
      </section>

      {/* Features Section */}
      <InformationSection />
    </div>
  );
}
