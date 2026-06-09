'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { EmergencyModal } from '@/components/emergency-modal';

const WELCOME_GREETINGS = [
  'Hi and welcome to your fitout adventure, Mimo',
  'Big plans start with one smart move, Mimo',
  'Ready to build your next space with confidence, Mimo',
  'Your project co-pilot is ready when you are, Mimo',
  'From idea to handover, let\'s do this together, Mimo',
  'Great spaces begin right here and now, Mimo',
];

const WELCOME_GREETINGS_ZH_HK = [
  '你好，歡迎開始你的裝修之旅，Mimo',
  '大計劃從明智的一步開始，Mimo',
  '準備好自信地打造你的下一個空間，Mimo',
  '你的項目副駕駛已準備就緒，Mimo',
  '從概念到交付，讓我們一齊完成，Mimo',
  '優秀的空間從此時此地開始，Mimo',
];

const WELCOME_GREETINGS_ZH_CN = [
  '你好，欢迎开始你的装修之旅，Mimo',
  '大计划从明智的一步开始，Mimo',
  '准备好自信地打造你的下一个空间，Mimo',
  '你的项目副驾驶已准备就绪，Mimo',
  '从概念到交付，让我们一起完成，Mimo',
  '优秀的空间从此时此地开始，Mimo',
];

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [mimoThinking, setMimoThinking] = useState(false);
  
  const t = useTranslations('home');
  const locale = useLocale();
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  const greetings = locale === 'zh-HK' ? WELCOME_GREETINGS_ZH_HK
    : locale === 'zh-CN' ? WELCOME_GREETINGS_ZH_CN
    : WELCOME_GREETINGS;

  useEffect(() => {
    const intervalId = setInterval(() => {
      setGreetingIndex((current) => (current + 1) % greetings.length);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [greetings.length]);

  // Redirect professionals to their dashboard
  useEffect(() => {
    if (profIsLoggedIn && !user) {
      router.replace('/professional-projects');
      return;
    }
  }, [user, profIsLoggedIn, router]);



  return (
      <div className="space-y-6 pb-8 pt-2">
        {/* Emergency FAB — top of active area, same right column as other FABs */}
        {isLoggedIn && user?.role === 'client' && (
          <div className="fixed right-6 top-[90px] z-30">
            <div className="relative h-14 w-14">
              <span className="absolute inset-0 rounded-full bg-[#DC143C]/40 animate-ping" />
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="relative flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#DC143C] bg-[#FCF8EE] text-2xl text-[#DC143C] shadow-lg transition hover:bg-[#DC143C] hover:text-[#FCF8EE]"
                aria-label={t('emergency.help')}
                title={t('emergency.title')}
              >
                {"\u{1F6A8}"}
              </button>
            </div>
          </div>
        )}

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
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {t('welcome.heading')}
                  </p>
                  <h2 className="text-2xl font-bold text-slate-900">
                    <span key={`ai-${greetingIndex}`} className="inline-block animate-[welcomePop_420ms_ease-out]">
                      {greetings[greetingIndex]}
                    </span>
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
                <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={setMimoThinking} />
              </div>
            </div>
          </div>
        </section>

        {/* Video Panel */}
        <section className="-mx-6 px-6">
          <div className="mimo-panel mx-auto max-w-6xl overflow-hidden py-8">
            <div className="px-4 sm:px-6 lg:px-12">
              <div className="mx-auto max-w-4xl rounded-2xl p-2">
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                  <video
                    className="h-full w-full"
                    src="/assets/video/FitOut-Hub-CIP-Animation-v2.mp4"
                    controls
                    preload="metadata"
                  />
                </div>
                <div className="mt-3 text-sm text-slate-700">
                  What is Mimo and why you should use it – see Sarah&rsquo;s story.
                </div>
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

      <EmergencyModal
        isOpen={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
      />
      </div>
  );
}









