'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div className="space-y-16">
      {/* Updates Button - Only for logged-in users (client or professional) */}
      {hydrated && (isLoggedIn || profIsLoggedIn) && (
        <div className="flex justify-center pt-4">
          <UpdatesButton />
        </div>
      )}

      {/* Search Flow */}
      <section className="relative -mx-6 -mt-10 bg-gradient-to-b from-emerald-50 to-white px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="text-center mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600 mb-2">
              Quick Start
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              Tell us what you need
            </h2>
          </div>
          <SearchFlow />
          
          {/* New Project Button - Only for logged-in users */}
          {hydrated && isLoggedIn && (
            <div className="mt-6">
              <button
                onClick={() => router.push('/projects?createNew=true')}
                className="w-full py-3 px-4 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all duration-200 shadow-sm"
              >
                ...or start a new project here
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Hero Section */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* Content */}
          <div className="p-8 lg:p-12 space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-400 mb-2">
                Welcome to Fitout Hub
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                Find the Right Professionals for Your Fitout
              </h1>
            </div>
            <p className="text-lg text-slate-300">
              Connect with trusted contractors, companies, and resellers. Manage your renovation projects with ease and confidence.
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
