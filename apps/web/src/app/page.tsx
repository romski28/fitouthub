'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { VideoTeaser } from '@/components/video-teaser';

const SearchFlow = dynamic(() => import('@/components/search-flow'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-32">
      <div className="animate-pulse text-slate-400">Loading...</div>
    </div>
  ),
});

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)' }}>
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    }>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const [aiHasStarted, setAiHasStarted] = useState(false);

  const shouldFocusPrompt = searchParams.get('focusPrompt') === '1';

  return (
    <div className="flex flex-col justify-between w-full px-5 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-6 overflow-y-auto overflow-x-hidden" style={{ height: 'calc(100vh - 64px)', WebkitOverflowScrolling: 'touch' }}>
      <section className="w-full max-w-6xl mx-auto overflow-hidden" style={{ height: 'calc(100vh - 64px - 40px - 40px)' }}>
        <div className="mimo-panel relative h-full w-full flex flex-col overflow-hidden py-6 sm:py-8">
          <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8">
            <div className="shrink-0 mb-4 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">I</span>n <span className="text-[#F97362]">M</span>ove <span className="text-[#F97362]">O</span>ut, Everything in Between.
              </h2>
            </div>
            <div className="flex-1 min-h-0 w-full flex items-start gap-2">
              <div className="hidden md:flex items-start justify-end w-[120px] shrink-0">
                <Image src="/assets/images/sarah-800_cropped.webp" alt="Sarah" width={120} height={240}
                  className="min-w-[120px] max-h-[240px] h-auto object-contain object-top" priority />
              </div>
              <div className="min-w-0 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
                <div className={`shrink-0 transition-all duration-500 ease-out ${aiHasStarted ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-44 opacity-100'}`}>
                  <VideoTeaser />
                </div>
                <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                  <SearchFlow autoFocusPrompt={shouldFocusPrompt} resetAiSession={true} onAiLoadingChange={(loading) => { if (loading) setAiHasStarted(true); }} />
                </div>
              </div>
              <div className="hidden lg:flex items-start justify-start w-[120px] shrink-0">
                <Image src="/assets/images/mike-800_cropped.webp" alt="Mike" width={120} height={240}
                  className="min-w-[120px] max-h-[240px] h-auto object-contain object-top" priority />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

