'use client';

import Link from 'next/link';
import { useMemo } from 'react';

type PathCard = {
  title: string;
  subtitle: string;
  href: string;
  accentFrom: string;
  accentTo: string;
  bullets: string[];
};

const paths: PathCard[] = [
  {
    title: 'I am a client',
    subtitle: 'Plan the renovation, compare pros, and stay in control of every step.',
    href: '/join?role=client',
    accentFrom: 'from-cyan-400/30',
    accentTo: 'to-blue-500/30',
    bullets: ['Fast onboarding', 'Quote comparison', 'Escrow-protected payments'],
  },
  {
    title: 'I am a professional',
    subtitle: 'Win high-intent projects and manage delivery with less admin overhead.',
    href: '/join?role=professional',
    accentFrom: 'from-amber-300/30',
    accentTo: 'to-orange-500/30',
    bullets: ['Premium lead flow', 'Structured milestones', 'Built-in client trust signals'],
  },
];

export default function GetStartedPage() {
  const dots = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        top: `${(i * 29) % 100}%`,
        delay: `${(i % 7) * 0.3}s`,
      })),
    [],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d1a24] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-[-120px] h-[360px] w-[360px] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute right-[-90px] top-[180px] h-[340px] w-[340px] rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 h-[380px] w-[380px] rounded-full bg-amber-400/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_40%),linear-gradient(130deg,rgba(13,26,36,0.95),rgba(15,38,53,0.92))]" />
        {dots.map((dot) => (
          <span
            key={dot.id}
            className="absolute h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
            style={{ left: dot.left, top: dot.top, animationDelay: dot.delay }}
          />
        ))}
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-14 sm:px-8">
        <div className="mx-auto w-full max-w-3xl text-center">
          <p className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1 text-xs font-semibold tracking-[0.24em] text-cyan-100 backdrop-blur">
            FITOUTHUB JOIN EXPERIENCE
          </p>
          <h1 className="mt-5 text-balance text-4xl font-black leading-tight text-white sm:text-5xl md:text-6xl">
            Build Something Beautiful.
            <span className="block bg-gradient-to-r from-cyan-200 via-white to-amber-100 bg-clip-text text-transparent">
              Start in under a minute.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-slate-200 sm:text-base">
            Pick your path and jump into a premium onboarding flow. Your original join forms stay exactly as-is under the hood.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {paths.map((path) => (
            <article
              key={path.title}
              className="group relative overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-white/50 hover:bg-white/15"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${path.accentFrom} ${path.accentTo} opacity-70`} />
              <div className="relative">
                <h2 className="text-2xl font-extrabold text-white">{path.title}</h2>
                <p className="mt-2 text-sm text-slate-100">{path.subtitle}</p>

                <ul className="mt-5 space-y-2 text-sm text-slate-100/95">
                  {path.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={path.href}
                  className="mt-7 inline-flex w-full items-center justify-center rounded-xl border border-white/40 bg-white/90 px-4 py-3 text-sm font-bold text-slate-900 transition group-hover:bg-white"
                >
                  Continue
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-7 w-full max-w-3xl rounded-2xl border border-white/20 bg-white/10 p-4 text-center text-sm text-slate-200 backdrop-blur">
          <p className="font-semibold text-white">Google account sign-in is being connected next.</p>
          <p className="mt-1 text-slate-200/90">
            Once enabled, you will be able to continue with Google and only fill in the additional details FitoutHub needs.
          </p>
          <Link href="/join" className="mt-3 inline-flex text-sm font-semibold text-cyan-200 underline-offset-2 hover:underline">
            Prefer classic join form? Open it here.
          </Link>
        </div>
      </section>
    </main>
  );
}
