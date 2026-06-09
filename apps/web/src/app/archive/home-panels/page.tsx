'use client';

import Image from 'next/image';
import Link from 'next/link';
import { HomeCardRail } from '@/components/home-card-rail';

const WELCOME_GREETINGS = [
  'Hi, welcome to Mimo! Let\'s get your project started.',
  'Ready to transform your space? Mimo is here to help.',
  'Looking for the right professional? You\'re in the right place.',
];

export default function ArchiveHomePanelsPage() {
  const greetingIndex = 0;

  return (
    <div className="min-h-screen bg-[#FCF8EE] py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm font-semibold text-amber-800">📦 Archive — Home Page Panels 2–4</p>
          <p className="mt-1 text-xs text-amber-600">These panels are preserved for potential reuse. Not linked from any page.</p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Panel 2: Role Selection Panels                                */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl bg-white/80 p-4 mb-4 border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Panel 2 — Role Selection</p>
        </div>
      </section>

      <section className="-mx-6 px-6">
        <div className="mimo-panel mx-auto max-w-6xl p-6 sm:p-8">
          <div className="space-y-4">
            <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#FF6B5B]">I am a...</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href="/get-started"
                className="group relative rounded-2xl border border-[#FF6B5B]/40 bg-gradient-to-br from-[#FF6B5B]/10 to-[#FF6B5B]/15 pb-5 pl-28 pr-5 pt-5 text-left transition hover:-translate-y-1 hover:border-[#FF6B5B]/50"
              >
                <div className="pointer-events-none absolute bottom-0 -left-6 w-28 select-none">
                  <Image src="/assets/images/sarah-character-pack/sarah-800.webp" alt="Sarah" width={112} height={160} className="object-contain" />
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-red-700">Homeowner</p>
                <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">I&apos;m a Homeowner</p>
                <p className="mt-2 text-sm text-[#4E4A42]">Find trusted professionals for your renovation, repair, or fitout project. Post your job and get competitive quotes.</p>
              </Link>

              <Link
                href="/get-started"
                className="group relative rounded-2xl border border-[#0E7C3A]/40 bg-gradient-to-br from-[#0E7C3A]/10 to-[#0E7C3A]/15 pb-5 pl-5 pr-28 pt-5 text-left transition hover:-translate-y-1 hover:border-[#0E7C3A]/50"
              >
                <div className="pointer-events-none absolute bottom-0 -right-6 w-28 select-none">
                  <Image src="/assets/images/tradesmen-character-pack/ben-800.webp" alt="Ben" width={112} height={160} className="object-contain" />
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-700">Professional</p>
                <p className="mt-2 text-xl font-extrabold text-[#1A1A1A]">I&apos;m a Professional</p>
                <p className="mt-2 text-sm text-[#4E4A42]">Grow your business with quality leads. Bid on projects that match your skills and build your reputation.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Panel 3: Welcome Panel                                        */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
        <div className="rounded-2xl bg-white/80 p-4 mb-4 border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Panel 3 — Welcome</p>
        </div>
      </section>

      <section className="-mx-6 px-6">
        <div className="mimo-panel relative mx-auto max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-12">
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
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Welcome to Mimo</p>
              <h2 className="min-h-[80px] text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                <span className="inline-block animate-[welcomePop_420ms_ease-out]">
                  {WELCOME_GREETINGS[greetingIndex]}
                </span>
              </h2>
              <p className="text-base font-semibold text-slate-700 sm:text-lg">
                Professional Fitout Management Platform
              </p>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-[#F5EEDE] transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Login
                </Link>
                <Link
                  href="/get-started"
                  className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-[#F97362] bg-[#F97362] px-4 py-3 text-center text-sm font-semibold text-[#F5EEDE] transition hover:-translate-y-0.5 hover:bg-[#e8624f]"
                >
                  Join Mimo
                </Link>
                <a
                  href="#project-prompt"
                  className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:text-emerald-700"
                >
                  Try AI Assistant
                </a>
                <a
                  href="#why-choose-us"
                  className="flex min-h-[72px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-500"
                >
                  About Mimo
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

      {/* ============================================================ */}
      {/* Panel 4: HomeCardRail                                         */}
      {/* ============================================================ */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-8">
        <div className="rounded-2xl bg-white/80 p-4 mb-4 border border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Panel 4 — HomeCardRail</p>
        </div>
      </section>

      <HomeCardRail />
    </div>
  );
}
