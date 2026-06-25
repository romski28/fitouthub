'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { VideoTeaser } from '@/components/video-teaser';
import { FlipChoice } from '@/components/flip-choice';
import type { IntakeMode } from '@/components/flip-choice';

export default function Home() {
  const { isLoggedIn, user, preferredLanguage } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mimoThinking, setMimoThinking] = useState(false);
  const [intakeData, setIntakeData] = useState<{ mode: IntakeMode; text?: string; photos?: File[] } | null>(null);
  const [intakeKey, setIntakeKey] = useState(0);

  const handleIntake = useCallback((mode: 'photos' | 'words', data: { text?: string; photos?: File[] }) => {
    setIntakeKey(k => k + 1);
    if (mode === 'photos') setMimoThinking(true);
    setIntakeData({ mode, ...data });
  }, []);
  
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
          className="relative -mx-4 px-4 sm:-mx-6 sm:px-6"
        >
          <div className="mimo-panel relative mx-auto max-w-6xl overflow-hidden py-6 sm:py-8">
            <div className="px-2 sm:px-4 lg:px-6">
              <div className="mb-4 text-center">
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

                {/* 3-col: Sarah | Prompt | Mike */}
                <div className="flex items-end gap-2">
                  {/* Sarah — left, hidden below md */}
                  <div className="hidden md:flex items-end justify-end w-[120px] shrink-0">
                    <Image
                      src="/assets/images/sarah-800_cropped.webp"
                      alt="Sarah"
                      width={120}
                      height={240}
                      className="min-w-[120px] max-h-[240px] h-auto object-contain object-bottom"
                      priority
                    />
                  </div>

                  {/* Prompt box — center, flexes to fill */}
                  <div className="min-w-0 flex-1">
                    <VideoTeaser />
                    {!intakeData ? (
                      <FlipChoice
                        onIntake={handleIntake}
                        voiceLang={preferredLanguage === 'zh-CN' ? 'zh-CN' : preferredLanguage === 'zh-HK' ? 'yue-Hant-HK' : 'en-HK'}
                      />
                    ) : (
                      <SearchFlow
                        key={`${intakeData.mode ?? ''}-${intakeKey}`}
                        autoFocusPrompt={shouldFocusPrompt}
                        resetAiSession={true}
                        onAiLoadingChange={setMimoThinking}
                        initialPrompt={intakeData.text}
                        initialImages={intakeData.photos}
                        sourceMode={intakeData.mode ?? undefined}
                      />
                    )}
                  </div>

                  {/* Mike — right, hidden below lg */}
                  <div className="hidden lg:flex items-end justify-start w-[120px] shrink-0">
                    <Image
                      src="/assets/images/mike-800_cropped.webp"
                      alt="Mike"
                      width={120}
                      height={240}
                      className="min-w-[120px] max-h-[240px] h-auto object-contain object-bottom"
                      priority
                    />
                  </div>
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









