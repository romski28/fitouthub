'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { API_BASE_URL } from '@/config/api';
import { HomeAnnouncementTicker } from '@/components/home-announcement-ticker';

type ActiveAnnouncement = {
  id: string;
  title?: string | null;
  content: string;
};

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<ActiveAnnouncement | null>(null);
  
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

  useEffect(() => {
    if (!hydrated) return;
    if (isLoggedIn || profIsLoggedIn) {
      setActiveAnnouncement(null);
      return;
    }

    const loadAnnouncement = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/announcements/active`);
        if (!res.ok) {
          setActiveAnnouncement(null);
          return;
        }
        const data = await res.json();
        if (data?.content) {
          setActiveAnnouncement(data);
        } else {
          setActiveAnnouncement(null);
        }
      } catch {
        setActiveAnnouncement(null);
      }
    };

    loadAnnouncement();
  }, [hydrated, isLoggedIn, profIsLoggedIn]);

  return (
    <div className="space-y-12">
      {hydrated && !isLoggedIn && !profIsLoggedIn && activeAnnouncement && (
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
          <HomeAnnouncementTicker
            title={activeAnnouncement.title}
            content={activeAnnouncement.content}
          />
        </div>
      )}

      {/* Updates Button - Only for logged-in users (client or professional) */}
      {hydrated && (isLoggedIn || profIsLoggedIn) && (
        <div className="flex justify-center pt-2">
          <UpdatesButton />
        </div>
      )}

      {/* Search Flow - Single entry point for all users */}
      <section id="project-prompt" className="relative -mx-6 -mt-6 bg-gradient-to-b from-emerald-50 to-white px-6 py-12">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <div className="order-2 max-w-2xl lg:order-2">
            <div className="mb-8 text-center lg:text-left">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600">
                {t('quickStart.tagline')}
              </p>
              <h2 className="text-2xl font-bold text-slate-900">
                {t('quickStart.title')}
              </h2>
            </div>
            <SearchFlow autoFocusPrompt={shouldFocusPrompt} resultsPortalId="ai-results-portal" />
          </div>

          <div className="order-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:order-1 lg:mt-2">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
              <video
                className="h-full w-full"
                src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4"
                controls
                preload="metadata"
              />
            </div>
            <div className="mt-3 text-sm text-slate-600">
              What is FitOut Hub and why you should use it — see Sarah's story.
            </div>
          </div>
        </div>
      </section>

      {/* AI Analysis Results — standalone full-width panel, portal target for SearchFlow */}
      <section
        id="ai-results-section"
        className="scroll-mt-20 -mx-6 px-6"
      >
        <div className="mx-auto max-w-3xl">
          <div id="ai-results-portal" />
        </div>
      </section>

      {/* Hero Section */}
      <section
        className="relative overflow-hidden rounded-2xl bg-cover bg-top bg-no-repeat"
        style={{ backgroundImage: 'url("/assets/images/hero-homepage.webp")' }}
      >
        <div className="relative p-8 lg:p-12">
          <div className="w-full space-y-5 text-slate-800 md:w-1/2 xl:w-1/3" style={{ textShadow: '0 1px 2px rgba(255, 255, 255, 0.35)' }}>
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">
                {t('hero.tagline')}
              </p>
              <h1 className="text-3xl font-bold leading-tight lg:text-4xl">
                {t('hero.title')}
              </h1>
            </div>
            <p className="text-base text-slate-700 lg:text-lg">
              {t('hero.description')}
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <InformationSection />
    </div>
  );
}
