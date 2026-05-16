'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import SearchFlow from '@/components/search-flow';
import InformationSection from '@/components/information-section';
import { useAuth } from '@/context/auth-context';
import { useProfessionalAuth } from '@/context/professional-auth-context';
import { UpdatesButton } from '@/components/updates-button';
import { HomeCardRail } from '@/components/home-card-rail';
import { EmergencyModal } from '@/components/emergency-modal';

const WELCOME_GREETINGS = [
  'Hi and welcome to your fitout adventure, Mimo',
  'Big plans start with one smart move, Mimo',
  'Ready to build your next space with confidence, Mimo',
  'Your project co-pilot is ready when you are, Mimo',
  'From idea to handover, let\'s do this together, Mimo',
  'Great spaces begin right here and now, Mimo',
];

export default function Home() {
  const { isLoggedIn, user } = useAuth();
  const { isLoggedIn: profIsLoggedIn } = useProfessionalAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  
  const t = useTranslations('home');
  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setGreetingIndex((current) => (current + 1) % WELCOME_GREETINGS.length);
    }, 3000);

    return () => clearInterval(intervalId);
  }, []);

  // Redirect professionals to their dashboard
  useEffect(() => {
    if (!hydrated) return;
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

      <div className="space-y-6 pb-8 pt-2">
        {/* Updates button fixed on right for thumb access, same as project list pages */}
        {hydrated && (isLoggedIn || profIsLoggedIn) && (
          <div className="fixed bottom-[260px] right-6 z-30">
            <UpdatesButton />
          </div>
        )}

{/* AI Prompt + Response Panel */}
        <section
          id="project-prompt"
          className="relative -mx-6 px-6"
        >
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/90 py-12">            {hydrated && (
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="absolute right-4 top-4 flex h-10 items-center justify-center rounded-full border-[3px] border-[#F97362] bg-[#FCF8EE] px-4 text-sm font-semibold text-[#F97362] shadow transition hover:bg-[#F97362] hover:text-[#FCF8EE]"
                aria-label="Emergency help"
                title="Emergency - Get help now"
              >
                {'\u{1F6A8}'} Emergency
              </button>
            )}
            <div className="px-4 sm:px-6 lg:px-12">
              <div className="mx-auto max-w-2xl">
                <div className="mb-8 text-center">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Hi and Welcome
                  </p>
                  <h2 className="text-2xl font-bold text-slate-900">
                    <span key={`ai-${greetingIndex}`} className="inline-block animate-[welcomePop_420ms_ease-out]">
                      {WELCOME_GREETINGS[greetingIndex]}
                    </span>
                  </h2>
                </div>
                <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} />
              </div>
            </div>
          </div>
        </section>

        {/* Role Selection Panels (from join flow style) */}
        <section className="-mx-6 px-6">
          <div className="mx-auto max-w-6xl rounded-3xl border border-white/45 bg-[#F5EEDE]/90 p-6 sm:p-8">
            <div className="space-y-4">
              <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#FF6B5B]">Choose your path</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Link
                  href="/get-started"
                  className="group relative rounded-2xl border border-[#FF6B5B]/40 bg-gradient-to-br from-[#FF6B5B]/10 to-[#FF6B5B]/15 pb-5 pl-28 pr-5 pt-5 text-left transition hover:-translate-y-1 hover:border-[#FF6B5B]/50"
                >
                  <div className="pointer-events-none absolute bottom-0 -left-6 w-28 select-none">
                    <Image src="/assets/images/sarah-character-pack/sarah-800.webp" alt="Sarah" width={112} height={160} className="object-contain" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-red-700">Client</p>
                  <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">Plan and control your renovation</p>
                  <p className="mt-2 text-sm text-[#4E4A42]">Compare quotes, track progress, and use escrow-backed payments.</p>
                </Link>

                <Link
                  href="/get-started"
                  className="group relative rounded-2xl border border-[#0E7C3A]/40 bg-gradient-to-br from-[#0E7C3A]/10 to-[#0E7C3A]/15 pb-5 pl-5 pr-28 pt-5 text-left transition hover:-translate-y-1 hover:border-[#0E7C3A]/50"
                >
                  <div className="pointer-events-none absolute bottom-0 -right-6 w-28 select-none">
                    <Image src="/assets/images/tradesmen-character-pack/ben-800.webp" alt="Ben" width={112} height={160} className="object-contain" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-blue-700">Professional</p>
                  <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">Win premium renovation projects</p>
                  <p className="mt-2 text-sm text-[#4E4A42]">Showcase your trade, manage milestones, and reduce admin overhead.</p>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Welcome Panel */}
        <section className="-mx-6 px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/90 px-4 py-6 sm:px-6 lg:px-12">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(16,185,129,0.13),transparent_35%),radial-gradient(circle_at_82%_82%,rgba(15,23,42,0.08),transparent_38%)]" />
            <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[200px_1fr_200px]">
              <div className="hidden lg:flex lg:justify-start">
                <Image
                  src="/assets/images/sarah-character-pack/sarah-800.webp"
                  alt="Sarah"
                  width={180}
                  height={280}
                  className="h-auto w-[150px] xl:w-[180px]"
                  priority
                />
              </div>

              <div className="relative z-10 space-y-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Hi and Welcome</p>
                <h2 className="min-h-[80px] text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                  <span key={greetingIndex} className="inline-block animate-[welcomePop_420ms_ease-out]">
                    {WELCOME_GREETINGS[greetingIndex]}
                  </span>
                </h2>
                <p className="text-base font-semibold text-slate-700 sm:text-lg">
                  Move In, Move Out, and everything in between.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-[#F5EEDE] transition hover:-translate-y-0.5 hover:bg-slate-800"
                  >
                    You got an account? Login
                  </Link>
                  <Link
                    href="/get-started"
                    className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-[#F97362] bg-[#F97362] px-4 py-3 text-center text-sm font-semibold text-[#F5EEDE] transition hover:-translate-y-0.5 hover:bg-[#e8624f]"
                  >
                    Ready to book a project? Join
                  </Link>
                  <a
                    href="#project-prompt"
                    className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:text-emerald-700"
                  >
                    Want to play with our AI?
                  </a>
                  <a
                    href="#why-choose-us"
                    className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-500"
                  >
                    Want to know more about Mimo?
                  </a>
                </div>
              </div>

              <div className="flex justify-center lg:justify-end">
                <Image
                  src="/assets/images/tradesmen-character-pack/leo-800.webp"
                  alt="Leo"
                  width={180}
                  height={280}
                  className="h-auto w-[130px] sm:w-[150px] xl:w-[180px]"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <style jsx>{`
          @keyframes welcomePop {
            0% { opacity: 0; transform: translateY(8px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <HomeCardRail />

        {/* Video Panel */}
        <section className="-mx-6 px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/90 py-8">
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
                  What is FitOut Hub and why you should use it - see Sarah&rsquo;s story.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Hero Section */}
        <section className="-mx-6 px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/45 bg-[#F5EEDE]/90">
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
    </div>
  );
}









