'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { VideoTeaser } from '@/components/video-teaser';

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mimoThinking, setMimoThinking] = useState(false);
  
  const t = useTranslations('home');
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  // Redirect professionals to their dashboard
  useEffect(() => {
    if (profIsLoggedIn && !user) {
      router.replace('/professional-projects');
      return;
    }
  }, [user, profIsLoggedIn, router]);



  return (
      <div className="space-y-6 pb-8 pt-2">
        {/* Updates button fixed on right for thumb access, same as project list pages */}
        {(isLoggedIn || profIsLoggedIn) && (
          <div className="fixed bottom-[260px] right-6 z-30">
            <UpdatesButton />
          </div>
        )}

{/* AI Prompt + Response Panel */}
        <section
          id="project-prompt"
          className="relative -mx-6 px-6"
        >
          <div className="mimo-panel relative mx-auto max-w-6xl overflow-hidden py-12">
            <div className="px-4 sm:px-6 lg:px-12">
              <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                  <h2 className="text-2xl font-bold text-slate-900">
                    <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut, Everything in Between.<br />Welcome Home.
                  </h2>
                  {mimoThinking && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 shadow-sm" aria-live="polite">
                      <span className="flex items-end gap-1" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce" />
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span>{t('welcome.thinking')}</span>
                    </div>
                  )}
                </div>
                <VideoTeaser />
                <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={setMimoThinking} />
              </div>
            </div>
          </div>
        </section>

        {/* Hero Section */}
        <section className="-mx-6 px-6">
          <div className="mimo-panel relative mx-auto max-w-6xl overflow-hidden">
            <div
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-cover bg-center bg-no-repeat lg:block"
              style={{ backgroundImage: 'url("/assets/images/hero-homepage.webp")' }}
            />
            <div className="relative p-8 sm:px-10 lg:px-12 lg:py-12">
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
        </section>

        {/* Features Section */}
        <section id="why-choose-us" className="scroll-mt-20 -mx-6 px-6">
          <div className="mx-auto max-w-6xl">
            <InformationSection />
          </div>
        </section>

      </div>
  );
}









