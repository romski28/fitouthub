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
          <div className="max-w-2xl">
            <div className="mb-8 text-center lg:text-left">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-600">
                {t('quickStart.tagline')}
              </p>
              <h2 className="text-2xl font-bold text-slate-900">
                {t('quickStart.title')}
              </h2>
            </div>
            <SearchFlow autoFocusPrompt={shouldFocusPrompt} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:mt-2">
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
              <video
                className="h-full w-full"
                controls
                preload="metadata"
              >
                <source src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              Purpose, problems solved, and a quick walkthrough of the core FitOutHub flow.
            </div>
          </div>
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
