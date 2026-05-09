'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { HomeCardRail } from '@/components/home-card-rail';

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  
  const t = useTranslations('home');
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

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
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="h-full w-full bg-[url('/assets/images/hero-homepage-empty.webp')] bg-cover bg-center bg-no-repeat" />
        <div className="absolute inset-0 bg-[#1a1a1a]/44" />
      </div>

      <div className="space-y-12 pb-8">
        <HomeCardRail />

        {/* Updates Button - Only for logged-in users (client or professional) */}
        {hydrated && (isLoggedIn || profIsLoggedIn) && (
          <div className="flex justify-center pt-2">
            <UpdatesButton />
          </div>
        )}

        {/* Search Flow - Single entry point for all users */}
        <section
          id="project-prompt"
          className="relative -mx-6 rounded-b-3xl border-b border-white/45 bg-[#F5EEDE] px-6 py-12"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="order-2 max-w-2xl lg:order-2">
              <div className="mb-8 text-center lg:text-left">
                <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  {t('quickStart.tagline')}
                </p>
                <h2 className="text-2xl font-bold text-slate-900">
                  {t('quickStart.title')}
                </h2>
              </div>
              <SearchFlow autoFocusPrompt={shouldFocusPrompt} resultsPortalId="ai-results-portal" />
            </div>

            <div className="order-1 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:order-1 lg:mt-2">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                <video
                  className="h-full w-full"
                  src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4"
                  controls
                  preload="metadata"
                />
              </div>
              <div className="mt-3 text-sm text-slate-700">
                What is FitOut Hub and why you should use it - see Sarah&rsquo;s story.
              </div>
            </div>
          </div>
        </section>

        {/* AI Analysis Results — standalone full-width panel, portal target for SearchFlow */}
        <section
          id="ai-results-section"
          className="scroll-mt-20 -mx-6 px-6"
        >
          <div className="mx-auto max-w-6xl">
            <div id="ai-results-portal" />
          </div>
        </section>

        {/* Hero Section */}
        <section className="-mx-6 px-6">
          <div className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-t-3xl rounded-b-2xl border border-white/50 bg-[#F5EEDE]">
              <div
                className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-cover bg-center bg-no-repeat lg:block"
                style={{ backgroundImage: 'url("/assets/images/hero-homepage.webp")' }}
              />
              <div className="relative p-8 lg:p-12">
                <div
                  className="max-w-2xl rounded-xl bg-white p-4 space-y-4 text-slate-800 sm:p-5"
                  style={{ textShadow: '0 1px 2px rgba(255, 255, 255, 0.35)' }}
                >
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 sm:text-sm">
                      {t('hero.tagline')}
                    </p>
                    <h1 className="text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
                      {t('hero.title')}
                    </h1>
                  </div>
                  <p className="text-sm text-slate-700 sm:text-base lg:text-lg">
                    {t('hero.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <InformationSection />
      </div>
    </div>
  );
}
